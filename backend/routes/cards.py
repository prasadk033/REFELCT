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
from datetime import datetime
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

    card.updated_at = datetime.utcnow()
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


@router.post("/api/cards/{card_id}/accept", response_model=CardResponse)
def accept_card(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = _get_user_card(db, card_id, user.id)
    card.status = "accepted"
    card.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(card)

    logger.info(f"Accepted card {card_id}")

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


@router.post("/api/cards/{card_id}/reject", response_model=CardResponse)
def reject_card(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = _get_user_card(db, card_id, user.id)
    card.status = "rejected"
    card.updated_at = datetime.utcnow()
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
