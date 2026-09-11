"""
Card API routes.

GET    /api/projects/{project_id}/brief/cards  — List cards for project
POST   /api/projects/{project_id}/brief/cards  — Create a card (architect)
PATCH  /api/cards/{card_id}                    — Update a card
DELETE /api/cards/{card_id}                    — Delete a card
POST   /api/cards/{card_id}/accept             — Accept a provisional card
POST   /api/cards/{card_id}/reject             — Reject a provisional card
"""
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db, Project, Card, Brief, User
from auth.dependencies import get_current_user
from schemas.models import CardCreate, CardUpdate, CardResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cards"])


# ── Project-scoped card routes ───────────────────────────────────────────────

@router.get("/api/projects/{project_id}/brief/cards", response_model=list[CardResponse])
def list_cards(
    project_id: str,
    card_type: Optional[str] = Query(None, description="Filter by card type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    brief_id: Optional[str] = Query(None, description="Filter by brief version"),
    version: Optional[int] = Query(None, description="Filter by project version"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_project_ownership(db, project_id, user.id)

    query = db.query(Card).filter(Card.project_id == project_id)

    if card_type:
        query = query.filter(Card.card_type == card_type.upper())
    if status:
        query = query.filter(Card.status == status)
    if brief_id:
        query = query.filter(Card.brief_id == brief_id)
    if version is not None:
        query = query.filter(Card.version == version)

    cards = query.order_by(Card.created_at.desc()).all()
    return [CardResponse.model_validate(c) for c in cards]


@router.post("/api/projects/{project_id}/brief/cards", response_model=CardResponse)
def create_card(
    project_id: str,
    body: CardCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create an architect-authored card."""
    _verify_project_ownership(db, project_id, user.id)

    # Get the latest brief for this project (if any)
    latest_brief = (
        db.query(Brief)
        .filter(Brief.project_id == project_id, Brief.status == "completed")
        .order_by(Brief.version.desc())
        .first()
    )
    card_version = body.version if body.version is not None else (latest_brief.version if latest_brief and latest_brief.version is not None else 0)

    card = Card(
        id=str(uuid.uuid4()),
        project_id=project_id,
        brief_id=latest_brief.id if latest_brief else None,
        card_type=body.card_type.upper(),
        title=body.title,
        content=body.content,
        source_document=body.source_document or "Architect Direct Input",
        evidence=body.evidence or "Manual Input",
        ai_suggestion=body.ai_suggestion,
        section=body.section,
        version=card_version,
        created_by="ARCHITECT",
        status="accepted",  # Architect-created cards are automatically accepted
    )
    db.add(card)
    db.commit()
    db.refresh(card)

    logger.info(f"Architect created card {card.id} in project {project_id}")

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="card_created",
        title="Brief Card created",
        description=f"Added card '{card.title}' ({card.card_type})",
        project_id=project_id,
    )

    return CardResponse.model_validate(card)


# ── Card-level routes ────────────────────────────────────────────────────────

@router.patch("/api/cards/{card_id}", response_model=CardResponse)
def update_card(
    card_id: str,
    body: CardUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = _get_user_card(db, card_id, user.id)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "card_type" and value:
            value = value.upper()
        setattr(card, key, value)

    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)

    logger.info(f"Updated card {card_id}")

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="card_updated",
        title="Brief Card edited",
        description=f"Updated '{card.title}'",
        project_id=card.project_id,
    )

    return CardResponse.model_validate(card)


@router.delete("/api/cards/{card_id}")
def delete_card(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = _get_user_card(db, card_id, user.id)
    project_id = card.project_id
    card_title = card.title

    db.delete(card)
    db.commit()

    logger.info(f"Deleted card {card_id}")

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="card_deleted",
        title="Brief Card deleted",
        description=f"Deleted '{card_title}'",
        project_id=project_id,
    )

    return {"detail": "Card deleted"}


import re
import difflib

from schemas.models import CardCreate, CardUpdate, CardResponse, ReviewResolutionRequest


def _clean_tokens(text: str) -> set:
    if not text:
        return set()
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    stop_words = {'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'by', 'with', 'from'}
    return {w for w in cleaned.split() if w and w not in stop_words and len(w) > 1}


def _concept_match(card_a: Card, card_b: Card) -> tuple:
    """
    Evaluates whether two cards represent the same architectural concept.
    Returns:
        (is_same_concept: bool, is_identical_content: bool)
    """
    if card_a.card_type != card_b.card_type:
        return False, False

    title_a = (card_a.title or "").strip().lower()
    title_b = (card_b.title or "").strip().lower()

    # Title similarity
    ratio = difflib.SequenceMatcher(None, title_a, title_b).ratio()
    tokens_a = _clean_tokens(title_a)
    tokens_b = _clean_tokens(title_b)
    
    token_overlap = len(tokens_a & tokens_b) / max(1, len(tokens_a | tokens_b)) if (tokens_a or tokens_b) else 0

    # Content similarity
    content_a = (card_a.content or "").strip().lower()
    content_b = (card_b.content or "").strip().lower()
    content_ratio = difflib.SequenceMatcher(None, content_a, content_b).ratio()

    # Same concept criteria:
    # 1. High title similarity or strong token overlap
    # 2. Or identical titles
    # 3. Or parameter/metric keyword subset match
    is_concept = False
    if ratio >= 0.72 or token_overlap >= 0.60:
        is_concept = True
    elif title_a == title_b and title_a != "":
        is_concept = True
    elif tokens_a and tokens_b and (tokens_a.issubset(tokens_b) or tokens_b.issubset(tokens_a)):
        is_concept = True

    is_identical = (content_ratio >= 0.88 or content_a == content_b) if is_concept else False
    return is_concept, is_identical


@router.post("/api/cards/{card_id}/accept", response_model=CardResponse)
def accept_card(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Lock card row to prevent race conditions during concurrent acceptance
    card = db.query(Card).filter(Card.id == card_id).with_for_update().first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    _verify_project_ownership(db, card.project_id, user.id)

    # Idempotency check for concurrent requests
    if card.status == "accepted" and (card.is_unified or card.review_status):
        return CardResponse.model_validate(card)

    card.status = "accepted"
    card.updated_at = datetime.now(timezone.utc)

    # Check against currently active Unified Cards in the project for this category
    active_unified_cards = (
        db.query(Card)
        .filter(
            Card.project_id == card.project_id,
            Card.card_type == card.card_type,
            Card.is_unified == True,
            Card.status == "accepted",
            Card.id != card.id
        )
        .all()
    )

    conflicting_existing = None
    identical_existing = None

    for existing in active_unified_cards:
        is_same_concept, is_identical = _concept_match(existing, card)
        if is_same_concept:
            if is_identical:
                identical_existing = existing
                break
            else:
                conflicting_existing = existing
                break

    if identical_existing:
        # Same information, identical value: do not create redundant unified card
        card.is_unified = False
        card.origin_card_id = identical_existing.id
        card.review_status = "resolved"
        card.review_decision = "identical_match"
        logger.info(f"Card {card_id} is identical to Unified Card {identical_existing.id}. Accepted without duplicate.")
    elif conflicting_existing:
        # Same concept, different value -> Enter REVIEW state!
        conflicting_existing.review_status = "under_review"
        conflicting_existing.review_card_id = card.id
        conflicting_existing.updated_at = datetime.now(timezone.utc)

        card.is_unified = False  # Not active in Unified Cards until architect decides
        card.review_status = "under_review"
        card.review_card_id = conflicting_existing.id
        logger.info(f"Card {card_id} conflicts with Unified Card {conflicting_existing.id}. Entering REVIEW state.")
    else:
        # Genuinely distinct -> promoted to active Unified Cards!
        card.is_unified = True
        card.review_status = None
        logger.info(f"Card {card_id} promoted to active Unified Cards.")

    db.commit()
    db.refresh(card)

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="card_accepted",
        title="Brief Card accepted",
        description=f"Accepted '{card.title}' into Project Knowledge",
        project_id=card.project_id,
    )

    return CardResponse.model_validate(card)


@router.post("/api/cards/{card_id}/resolve-review", response_model=CardResponse)
def resolve_review(
    card_id: str,
    body: ReviewResolutionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resolve a conflicting card review decision:
    - keep_existing: Keep existing Unified Card. Candidate is preserved in history.
    - accept_new: Candidate becomes active Unified Card. Previous is preserved in history as superseded.
    - duplicate: Both become separate active Unified Cards with individual provenance.
    """
    first_card = _get_user_card(db, card_id, user.id)
    competing_card_id = first_card.review_card_id

    # DETERMINISTIC LOCKING: Always acquire row locks in deterministic ascending ID order
    # to eliminate deadlocks from concurrent requests.
    lock_ids = sorted(list(set([cid for cid in [card_id, competing_card_id] if cid])))
    locked_cards = {}
    for cid in lock_ids:
        c_obj = db.query(Card).filter(Card.id == cid).with_for_update().first()
        if c_obj:
            locked_cards[cid] = c_obj

    card = locked_cards.get(card_id) or first_card
    competing_card = locked_cards.get(competing_card_id) if competing_card_id else None

    # Idempotency guard: If review has already been resolved by another request, return cleanly
    if card.review_status == "resolved" and (competing_card is None or competing_card.review_status == "resolved"):
        logger.info(f"Review for card {card_id} already resolved, returning current state (idempotent)")
        return CardResponse.model_validate(card)

    # Determine which card is existing (older version) and which is incoming (newer version)
    if competing_card:
        v_card = card.version if card.version is not None else 0
        v_comp = competing_card.version if competing_card.version is not None else 0
        if v_card >= v_comp:
            cand_card = card
            exist_card = competing_card
        else:
            cand_card = competing_card
            exist_card = card
    else:
        cand_card = card
        exist_card = card

    decision = body.decision.lower().strip()
    now_time = datetime.now(timezone.utc)

    if decision == "keep_existing":
        exist_card.is_unified = True
        exist_card.review_status = "resolved"
        exist_card.review_decision = "keep_existing"
        exist_card.updated_at = now_time

        cand_card.is_unified = False
        cand_card.review_status = "resolved"
        cand_card.review_decision = "rejected_for_unified"
        cand_card.updated_at = now_time

    elif decision == "accept_new":
        cand_card.is_unified = True
        cand_card.review_status = "resolved"
        cand_card.review_decision = "accept_new"
        cand_card.updated_at = now_time

        exist_card.is_unified = False
        exist_card.review_status = "resolved"
        exist_card.review_decision = "superseded"
        exist_card.replaced_by_card_id = cand_card.id
        exist_card.updated_at = now_time

    elif decision == "duplicate":
        cand_card.is_unified = True
        cand_card.review_status = "resolved"
        cand_card.review_decision = "duplicate"
        cand_card.updated_at = now_time

        exist_card.is_unified = True
        exist_card.review_status = "resolved"
        exist_card.review_decision = "duplicate"
        exist_card.updated_at = now_time
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid review decision '{body.decision}'. Allowed: keep_existing, accept_new, duplicate."
        )

    db.commit()
    db.refresh(card)

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="review_resolved",
        title="Card Review Resolved",
        description=f"Resolved review for '{card.title}' ({decision})",
        project_id=card.project_id,
    )

    return CardResponse.model_validate(card)


@router.post("/api/cards/{card_id}/reject", response_model=CardResponse)
def reject_card(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = _get_user_card(db, card_id, user.id)
    card.status = "rejected"
    card.is_unified = False
    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)

    logger.info(f"Rejected card {card_id}")

    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="card_rejected",
        title="Brief Card rejected",
        description=f"Rejected '{card.title}'",
        project_id=card.project_id,
    )

    return CardResponse.model_validate(card)



# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_project_ownership(db: Session, project_id: str, user_id: str):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _get_user_card(db: Session, card_id: str, user_id: str) -> Card:
    """Get a card ensuring the parent project belongs to the authenticated user."""
    card = db.query(Card).filter(Card.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Verify ownership via project
    project = db.query(Project).filter(
        Project.id == card.project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Card not found")

    return card
