"""
Program API routes.

GET    /api/projects/{project_id}/program              — Get working program summary + status
GET    /api/projects/{project_id}/program/items        — List working program items
POST   /api/projects/{project_id}/program/generate     — Generate program from published brief
POST   /api/projects/{project_id}/program/items        — Add manual program item
PATCH  /api/program/items/{item_id}                    — Update working program item
DELETE /api/program/items/{item_id}                    — Delete working program item
GET    /api/projects/{project_id}/program/questions    — List AI questions
PATCH  /api/program/questions/{question_id}            — Update AI question (answer/dismiss)
GET    /api/program/items/{item_id}/brief-sources      — Get source brief cards for an item

Version Management:
GET    /api/projects/{project_id}/brief/published      — List published brief versions (latest 5)
POST   /api/projects/{project_id}/brief/publish        — Publish current working brief
GET    /api/projects/{project_id}/brief/published/{version_id} — Get specific published brief version

GET    /api/projects/{project_id}/program/published    — List published program versions (latest 5)
POST   /api/projects/{project_id}/program/publish      — Publish current working program
GET    /api/projects/{project_id}/program/published/{version_id} — Get specific published program version
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, text, or_

from db import (
    get_db, Project, Card, Brief, User,
    ProgramItem, ProgramQuestion,
    BriefPublishedVersion, BriefVersionCard,
    ProgramPublishedVersion, ProgramVersionItem,
    log_activity, utc_now
)
from auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["program"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _get_working_item(db: Session, item_id: str, user_id: str) -> ProgramItem:
    """Get a working (unversioned) program item ensuring user owns the project."""
    item = db.query(ProgramItem).filter(ProgramItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Program item not found")
    _get_user_project(db, item.project_id, user_id)
    return item


def _program_item_to_dict(item: ProgramItem) -> dict:
    return {
        "id": item.id,
        "project_id": item.project_id,
        "program_item_code": item.program_item_code,
        "name": item.name,
        "type": item.type,
        "requirement": item.requirement,
        "function": item.function,
        "quantity": item.quantity,
        "capacity": item.capacity,
        "area": item.area,
        "unit": item.unit,
        "key_considerations": item.key_considerations or [],
        "notes": item.notes,
        "status": item.status,
        "source_brief_card_ids": item.source_brief_card_ids or [],
        "source_brief_version_id": item.source_brief_version_id,
        "created_by": item.created_by,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _question_to_dict(q: ProgramQuestion) -> dict:
    return {
        "id": q.id,
        "project_id": q.project_id,
        "program_item_id": q.program_item_id,
        "question": q.question,
        "reason": q.reason,
        "source_brief_card_ids": q.source_brief_card_ids or [],
        "status": q.status,
        "answer": q.answer,
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
    }


def _assign_program_codes(db: Session, project_id: str):
    """Assign sequential PRG-XXX codes to program items that don't have one."""
    items = db.query(ProgramItem).filter(
        ProgramItem.project_id == project_id,
        ProgramItem.program_item_code.is_(None)
    ).order_by(ProgramItem.created_at).all()

    # Find highest existing code number
    existing = db.query(ProgramItem).filter(
        ProgramItem.project_id == project_id,
        ProgramItem.program_item_code.isnot(None)
    ).all()
    max_num = 0
    for ex in existing:
        code = ex.program_item_code or ""
        if code.startswith("PRG-"):
            try:
                num = int(code[4:])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    for item in items:
        max_num += 1
        item.program_item_code = f"PRG-{max_num:03d}"
    db.commit()


def _check_brief_unpublished_changes(db: Session, project_id: str):
    """
    Check if working unified cards differ from the latest published Brief version.
    Returns (has_changes: bool, working_count: int, latest_version: Optional[BriefPublishedVersion])
    """
    working_cards = db.query(Card).filter(
        Card.project_id == project_id,
        or_(Card.is_unified == True, Card.status == "accepted"),
        Card.status != "rejected",
    ).all()
    working_count = len(working_cards)
    if working_count == 0:
        return False, 0, None

    latest = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == project_id
    ).order_by(BriefPublishedVersion.version_number.desc()).first()

    if not latest:
        return True, working_count, None

    if latest.card_count != working_count:
        return True, working_count, latest

    snapshot_map = {sc.card_id: (sc.snapshot_data or {}) for sc in latest.snapshot_cards if sc.card_id}
    working_ids = {c.id for c in working_cards}
    if set(snapshot_map.keys()) != working_ids:
        return True, working_count, latest

    for c in working_cards:
        snap = snapshot_map.get(c.id, {})
        if (
            snap.get("title") != c.title or
            snap.get("content") != c.content or
            snap.get("status") != c.status or
            snap.get("card_type") != c.card_type
        ):
            return True, working_count, latest

    return False, working_count, latest


def _check_program_unpublished_changes(db: Session, project_id: str):
    """
    Check if working program items differ from the latest published Program version.
    Returns (has_changes: bool, working_count: int, latest_version: Optional[ProgramPublishedVersion])
    """
    working_items = db.query(ProgramItem).filter(
        ProgramItem.project_id == project_id
    ).all()
    working_count = len(working_items)
    if working_count == 0:
        return False, 0, None

    latest = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == project_id
    ).order_by(ProgramPublishedVersion.version_number.desc()).first()

    if not latest:
        return True, working_count, None

    if latest.item_count != working_count:
        return True, working_count, latest

    snapshot_map = {si.program_item_id: (si.snapshot_data or {}) for si in latest.snapshot_items if si.program_item_id}
    working_ids = {it.id for it in working_items}
    if set(snapshot_map.keys()) != working_ids:
        return True, working_count, latest

    for it in working_items:
        snap = snapshot_map.get(it.id, {})
        if (
            snap.get("name") != it.name or
            snap.get("type") != it.type or
            snap.get("requirement") != it.requirement or
            snap.get("function") != it.function or
            snap.get("quantity") != it.quantity or
            snap.get("capacity") != it.capacity or
            snap.get("area") != it.area or
            snap.get("unit") != it.unit or
            snap.get("status") != it.status or
            snap.get("notes") != it.notes or
            snap.get("key_considerations") != (it.key_considerations or [])
        ):
            return True, working_count, latest

    return False, working_count, latest


# ── Working Program Summary ───────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/program")
def get_program_summary(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the working program summary and status for a project."""
    _get_user_project(db, project_id, user.id)

    items = db.query(ProgramItem).filter(ProgramItem.project_id == project_id).all()
    questions = db.query(ProgramQuestion).filter(ProgramQuestion.project_id == project_id).all()

    total = len(items)
    spaces = sum(1 for it in items if it.type == "SPACE")
    requirements = sum(1 for it in items if it.type == "REQUIREMENT")
    functions = sum(1 for it in items if it.type == "FUNCTION")
    under_review = sum(1 for it in items if it.status == "UNDER_REVIEW")
    open_questions = sum(1 for q in questions if q.status == "OPEN")

    # Get latest published brief version for this project
    latest_brief_version = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == project_id
    ).order_by(BriefPublishedVersion.version_number.desc()).first()

    # Get latest published program version
    latest_prog_version = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == project_id
    ).order_by(ProgramPublishedVersion.version_number.desc()).first()

    # Unpublished changes detection
    has_changes, working_count, _ = _check_program_unpublished_changes(db, project_id)

    # Determine source brief context
    source_brief_info = None
    if latest_brief_version:
        source_brief_info = {
            "id": latest_brief_version.id,
            "version_number": latest_brief_version.version_number,
            "card_count": latest_brief_version.card_count,
            "published_at": latest_brief_version.published_at.isoformat() if latest_brief_version.published_at else None,
        }

    # Previous program info for update context display
    prev_program_info = None
    if latest_prog_version:
        prev_program_info = {
            "id": latest_prog_version.id,
            "version_number": latest_prog_version.version_number,
            "item_count": latest_prog_version.item_count,
            "published_at": latest_prog_version.published_at.isoformat() if latest_prog_version.published_at else None,
        }

    has_working_program = total > 0
    can_generate = latest_brief_version is not None

    return {
        "mode": "working",
        "version": None,
        "status": "unpublished",
        "editable": True,
        "has_unpublished_changes": has_changes,
        "has_working_program": has_working_program,
        "can_generate": can_generate,
        "total_items": total,
        "spaces": spaces,
        "requirements": requirements,
        "functions": functions,
        "under_review": under_review,
        "open_questions": open_questions,
        "source_brief_version": source_brief_info,
        "previous_program_version": prev_program_info,
        "latest_published_version": {
            "id": latest_prog_version.id,
            "version_number": latest_prog_version.version_number,
            "item_count": latest_prog_version.item_count,
        } if latest_prog_version else None,
    }


# ── Working Program Items ─────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/program/items")
def list_program_items(
    project_id: str,
    type_filter: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all working program items for a project."""
    _get_user_project(db, project_id, user.id)

    query = db.query(ProgramItem).filter(ProgramItem.project_id == project_id)

    if type_filter:
        query = query.filter(ProgramItem.type == type_filter.upper())
    if status_filter:
        query = query.filter(ProgramItem.status == status_filter.upper())

    items = query.order_by(ProgramItem.program_item_code, ProgramItem.created_at).all()

    # Apply search filter in Python (simpler for JSON fields)
    if search:
        s = search.lower()
        items = [
            it for it in items if (
                s in (it.name or "").lower() or
                s in (it.requirement or "").lower() or
                s in (it.function or "").lower() or
                s in (it.notes or "").lower() or
                s in (it.program_item_code or "").lower() or
                any(s in cid.lower() for cid in (it.source_brief_card_ids or []))
            )
        ]

    return [_program_item_to_dict(it) for it in items]


@router.post("/api/projects/{project_id}/program/items")
def create_program_item(
    project_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually add a Program Item to the working dataset."""
    _get_user_project(db, project_id, user.id)

    if not body.get("name"):
        raise HTTPException(status_code=400, detail="Program item name is required.")

    item_type = (body.get("type") or "SPACE").upper()
    if item_type not in {"SPACE", "REQUIREMENT", "FUNCTION"}:
        item_type = "SPACE"

    status = (body.get("status") or "PROVISIONAL").upper()
    if status not in {"CONFIRMED", "PROVISIONAL", "UNDER_REVIEW", "QUESTION"}:
        status = "PROVISIONAL"

    item = ProgramItem(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=body.get("name", "").strip(),
        type=item_type,
        requirement=body.get("requirement") or None,
        function=body.get("function") or None,
        quantity=body.get("quantity"),
        capacity=body.get("capacity") or None,
        area=body.get("area"),
        unit=body.get("unit") or None,
        key_considerations=body.get("key_considerations") or [],
        notes=body.get("notes") or None,
        status=status,
        source_brief_card_ids=body.get("source_brief_card_ids") or [],
        created_by="ARCHITECT",
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # Assign code
    _assign_program_codes(db, project_id)
    db.refresh(item)

    log_activity(
        db=db,
        user_id=user.id,
        event_type="program_item_created",
        title="Program item added",
        description=f"Added '{item.name}' ({item.type})",
        project_id=project_id,
    )

    return _program_item_to_dict(item)


@router.patch("/api/program/items/{item_id}")
def update_program_item(
    item_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a working Program Item. Refuses to edit published snapshots (enforced in schema)."""
    item = _get_working_item(db, item_id, user.id)

    updatable = [
        "name", "type", "requirement", "function", "quantity",
        "capacity", "area", "unit", "key_considerations", "notes",
        "status", "source_brief_card_ids",
    ]
    for field in updatable:
        if field in body:
            value = body[field]
            if field == "type" and value:
                value = value.upper()
                if value not in {"SPACE", "REQUIREMENT", "FUNCTION"}:
                    value = "SPACE"
            if field == "status" and value:
                value = value.upper()
                if value not in {"CONFIRMED", "PROVISIONAL", "UNDER_REVIEW", "QUESTION"}:
                    value = "PROVISIONAL"
            setattr(item, field, value)

    item.updated_at = utc_now()
    db.commit()
    db.refresh(item)

    log_activity(
        db=db,
        user_id=user.id,
        event_type="program_item_updated",
        title="Program item updated",
        description=f"Updated '{item.name}'",
        project_id=item.project_id,
    )

    return _program_item_to_dict(item)


@router.delete("/api/program/items/{item_id}")
def delete_program_item(
    item_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a working Program Item. Does not delete related Brief Cards."""
    item = _get_working_item(db, item_id, user.id)
    project_id = item.project_id
    name = item.name

    db.delete(item)
    db.commit()

    log_activity(
        db=db,
        user_id=user.id,
        event_type="program_item_deleted",
        title="Program item deleted",
        description=f"Deleted '{name}'",
        project_id=project_id,
    )

    return {"detail": "Program item deleted"}


# ── AI Questions ──────────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/program/questions")
def list_program_questions(
    project_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List AI Questions for this project's program."""
    _get_user_project(db, project_id, user.id)

    query = db.query(ProgramQuestion).filter(ProgramQuestion.project_id == project_id)
    if status_filter:
        query = query.filter(ProgramQuestion.status == status_filter.upper())

    questions = query.order_by(ProgramQuestion.created_at).all()
    return [_question_to_dict(q) for q in questions]


@router.patch("/api/program/questions/{question_id}")
def update_program_question(
    question_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer or dismiss an AI Question."""
    q = db.query(ProgramQuestion).filter(ProgramQuestion.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    _get_user_project(db, q.project_id, user.id)

    allowed_statuses = {"OPEN", "ANSWERED", "DISMISSED"}
    if "status" in body:
        s = (body["status"] or "").upper()
        if s in allowed_statuses:
            q.status = s
    if "answer" in body:
        q.answer = body["answer"]

    q.updated_at = utc_now()
    db.commit()
    db.refresh(q)

    return _question_to_dict(q)


# ── Brief Source Traceability ─────────────────────────────────────────────────

@router.get("/api/program/items/{item_id}/brief-sources")
def get_brief_sources_for_item(
    item_id: str,
    program_version_id: Optional[str] = Query(None, description="Optional published program version ID for historical reconstruction"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the Brief Cards that a Program Item was derived from.
    Historical Program versions resolve source cards from the immutable
    BriefVersionCard snapshot associated with the Program's source Brief version.
    """
    source_card_ids = []
    source_brief_version_id = None

    # 1. Try finding in working ProgramItem
    working_item = db.query(ProgramItem).filter(ProgramItem.id == item_id).first()
    if working_item:
        _get_user_project(db, working_item.project_id, user.id)
        source_card_ids = working_item.source_brief_card_ids or []
        source_brief_version_id = working_item.source_brief_version_id
    else:
        # 2. Try finding in published snapshot (ProgramVersionItem)
        vitem = db.query(ProgramVersionItem).filter(
            (ProgramVersionItem.id == item_id) |
            (ProgramVersionItem.program_item_id == item_id)
        ).first()
        if vitem:
            prog_ver = db.query(ProgramPublishedVersion).filter(
                ProgramPublishedVersion.id == vitem.program_version_id
            ).first()
            if prog_ver:
                _get_user_project(db, prog_ver.project_id, user.id)
                source_brief_version_id = prog_ver.source_brief_version_id
            sdata = vitem.snapshot_data or {}
            source_card_ids = sdata.get("source_brief_card_ids") or []
        else:
            # 3. Check inside snapshot_data of program_version_id if supplied
            if program_version_id:
                prog_ver = db.query(ProgramPublishedVersion).filter(
                    ProgramPublishedVersion.id == program_version_id
                ).first()
                if prog_ver:
                    _get_user_project(db, prog_ver.project_id, user.id)
                    source_brief_version_id = prog_ver.source_brief_version_id
                    for s_item in prog_ver.snapshot_items:
                        s_dict = s_item.snapshot_data or {}
                        if s_dict.get("id") == item_id or s_item.id == item_id or s_item.program_item_id == item_id:
                            source_card_ids = s_dict.get("source_brief_card_ids") or []
                            break
            if not source_card_ids and not working_item:
                raise HTTPException(status_code=404, detail="Program item not found")

    # If program_version_id was explicitly passed as query param, override source_brief_version_id from that version
    if program_version_id:
        pv = db.query(ProgramPublishedVersion).filter(ProgramPublishedVersion.id == program_version_id).first()
        if pv:
            _get_user_project(db, pv.project_id, user.id)
            if pv.source_brief_version_id:
                source_brief_version_id = pv.source_brief_version_id

    if not source_card_ids:
        return []

    results = []
    found_card_ids = set()

    # 3. If associated with a published Brief version, resolve directly from immutable BriefVersionCard snapshot
    if source_brief_version_id:
        snapshot_records = db.query(BriefVersionCard).filter(
            BriefVersionCard.brief_version_id == source_brief_version_id
        ).all()

        for rec in snapshot_records:
            sc_data = rec.snapshot_data or {}
            sc_id = rec.card_id or sc_data.get("id")
            if sc_id in source_card_ids or sc_data.get("id") in source_card_ids:
                results.append({
                    "id": sc_id,
                    "card_type": sc_data.get("card_type") or sc_data.get("type"),
                    "title": sc_data.get("title") or sc_data.get("name"),
                    "content": sc_data.get("content") or sc_data.get("key_information") or sc_data.get("description"),
                    "evidence": sc_data.get("evidence"),
                    "source_document": sc_data.get("source_document"),
                    "section": sc_data.get("section"),
                    "status": sc_data.get("status", "accepted"),
                    "is_snapshot": True,
                })
                found_card_ids.add(sc_id)
                if sc_data.get("id"):
                    found_card_ids.add(sc_data.get("id"))

    # 4. Fallback to live Card table for any remaining card IDs (e.g. unversioned draft)
    remaining_ids = [cid for cid in source_card_ids if cid not in found_card_ids]
    if remaining_ids:
        cards = db.query(Card).filter(Card.id.in_(remaining_ids)).all()
        for card in cards:
            results.append({
                "id": card.id,
                "card_type": card.card_type,
                "title": card.title,
                "content": card.content,
                "evidence": card.evidence,
                "source_document": card.source_document,
                "section": card.section,
                "status": card.status,
                "is_snapshot": False,
            })

    return results


# ── Program Generation ────────────────────────────────────────────────────────

def _run_program_generation(
    project_id: str,
    user_id: str,
    brief_version_id: str,
    previous_program_version_id: Optional[str],
):
    """Background task: generate program items from a published Brief version."""
    from db import SessionLocal, Project, BriefPublishedVersion, BriefVersionCard, ProgramPublishedVersion, ProgramItem, ProgramQuestion
    from agents.program_agent import ProgramAgent
    from agents.brief_agent import format_project_context

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            logger.error(f"Program generation: project {project_id} not found")
            return

        brief_version = db.query(BriefPublishedVersion).filter(
            BriefPublishedVersion.id == brief_version_id
        ).first()
        if not brief_version:
            logger.error(f"Program generation: brief version {brief_version_id} not found")
            return

        # Get snapshot cards from the published brief version
        snapshot_cards = db.query(BriefVersionCard).filter(
            BriefVersionCard.brief_version_id == brief_version_id
        ).all()

        brief_cards = [sc.snapshot_data for sc in snapshot_cards if sc.snapshot_data]
        if not brief_cards:
            logger.error(f"Program generation: no cards in brief version {brief_version_id}")
            return

        # Get previous program items for context (if updating)
        previous_items = None
        previous_version_num = None
        if previous_program_version_id:
            prev_prog_version = db.query(ProgramPublishedVersion).filter(
                ProgramPublishedVersion.id == previous_program_version_id
            ).first()
            if prev_prog_version:
                prev_snapshot_items = prev_prog_version.snapshot_items
                previous_items = [si.snapshot_data for si in prev_snapshot_items if si.snapshot_data]
                previous_version_num = prev_prog_version.version_number

        project_context = format_project_context(
            project_name=project.name,
            project_type=project.project_type,
            location=project.location,
            client=project.client,
            description=project.description,
        )

        agent = ProgramAgent()
        result = agent.generate_program(
            project_context=project_context,
            brief_cards=brief_cards,
            previous_program_items=previous_items,
            previous_program_version=previous_version_num,
        )

        # Clear existing working program items and questions
        db.query(ProgramQuestion).filter(ProgramQuestion.project_id == project_id).delete()
        db.query(ProgramItem).filter(ProgramItem.project_id == project_id).delete()
        db.commit()

        # Insert new items
        item_name_to_id = {}
        for i, item_data in enumerate(result["program_items"], 1):
            item = ProgramItem(
                id=str(uuid.uuid4()),
                project_id=project_id,
                program_item_code=f"PRG-{i:03d}",
                name=item_data["name"],
                type=item_data["type"],
                requirement=item_data.get("requirement"),
                function=item_data.get("function"),
                quantity=item_data.get("quantity"),
                capacity=item_data.get("capacity"),
                area=item_data.get("area"),
                unit=item_data.get("unit"),
                key_considerations=item_data.get("key_considerations") or [],
                notes=item_data.get("notes"),
                status=item_data["status"],
                source_brief_card_ids=item_data.get("source_brief_card_ids") or [],
                source_brief_version_id=None,  # Reference to brief table is optional
                created_by="AI",
            )
            db.add(item)
            item_name_to_id[item_data["name"]] = item.id

        db.flush()

        # Insert AI Questions
        for q_data in result["ai_questions"]:
            # Try to find a matching program item
            item_ref_name = q_data.get("program_item_reference")
            matched_item_id = None
            if item_ref_name:
                for name, iid in item_name_to_id.items():
                    if item_ref_name.lower() in name.lower() or name.lower() in item_ref_name.lower():
                        matched_item_id = iid
                        break

            q = ProgramQuestion(
                id=str(uuid.uuid4()),
                project_id=project_id,
                program_item_id=matched_item_id,
                question=q_data["question"],
                reason=q_data.get("reason"),
                source_brief_card_ids=q_data.get("source_brief_card_ids") or [],
                status="OPEN",
            )
            db.add(q)

        db.commit()

        log_activity(
            db=db,
            user_id=user_id,
            event_type="program_generated",
            title="Program generated",
            description=f"Generated {len(result['program_items'])} program items from Brief V{brief_version.version_number}",
            project_id=project_id,
        )

        logger.info(
            f"Program generation complete for project {project_id}: "
            f"{len(result['program_items'])} items, {len(result['ai_questions'])} questions."
        )

    except Exception as e:
        logger.error(f"Program generation failed for project {project_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


@router.post("/api/projects/{project_id}/program/generate")
def generate_program(
    project_id: str,
    body: dict = None,
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate Program from the latest published Brief version.
    Requires at least one published Brief version to exist.
    """
    _get_user_project(db, project_id, user.id)

    # Check AI health
    from llm.qwen_health import check_qwen_health
    health = check_qwen_health()
    if not health.get("healthy"):
        raise HTTPException(
            status_code=503,
            detail="AI services are temporarily unavailable. Please try again later."
        )

    # Get the latest published brief version
    brief_version_id = (body or {}).get("brief_version_id")
    if brief_version_id:
        brief_version = db.query(BriefPublishedVersion).filter(
            BriefPublishedVersion.id == brief_version_id,
            BriefPublishedVersion.project_id == project_id,
        ).first()
    else:
        brief_version = db.query(BriefPublishedVersion).filter(
            BriefPublishedVersion.project_id == project_id
        ).order_by(BriefPublishedVersion.version_number.desc()).first()

    if not brief_version:
        raise HTTPException(
            status_code=400,
            detail="No published Brief version found. You must publish the Brief before generating the Program."
        )

    # Get the latest published program version for context
    prev_prog_version = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == project_id
    ).order_by(ProgramPublishedVersion.version_number.desc()).first()

    prev_prog_version_id = prev_prog_version.id if prev_prog_version else None

    logger.info(
        f"Starting program generation for project {project_id} "
        f"from Brief V{brief_version.version_number} "
        f"(prev program: {'V' + str(prev_prog_version.version_number) if prev_prog_version else 'None'})"
    )

    background_tasks.add_task(
        _run_program_generation,
        project_id,
        user.id,
        brief_version.id,
        prev_prog_version_id,
    )

    return {
        "status": "generating",
        "message": "Program generation started. Refresh in a moment to see the results.",
        "source_brief_version": brief_version.version_number,
        "previous_program_version": prev_prog_version.version_number if prev_prog_version else None,
    }


# ── Brief Version Management ──────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/brief/version-status")
def get_brief_version_status(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get the versioning status of the Brief workspace for a project.
    Indicates whether there are unpublished changes, current working card count,
    and latest published version info.
    """
    _get_user_project(db, project_id, user.id)
    has_changes, working_count, latest = _check_brief_unpublished_changes(db, project_id)

    return {
        "mode": "working",
        "version": None,
        "status": "unpublished",
        "editable": True,
        "has_unpublished_changes": has_changes,
        "working_card_count": working_count,
        "latest_published_version": latest.version_number if latest else None,
        "latest_published_version_id": latest.id if latest else None,
        "latest_published_card_count": latest.card_count if latest else None,
    }


@router.get("/api/projects/{project_id}/brief/published")
def list_published_brief_versions(
    project_id: str,
    limit: int = Query(5, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List published Brief versions (most recent first, default latest 5)."""
    _get_user_project(db, project_id, user.id)

    versions = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == project_id
    ).order_by(BriefPublishedVersion.version_number.desc()).limit(limit).all()

    return [
        {
            "id": v.id,
            "project_id": v.project_id,
            "version_number": v.version_number,
            "card_count": v.card_count,
            "published_at": v.published_at.isoformat() if v.published_at else None,
        }
        for v in versions
    ]


@router.get("/api/projects/{project_id}/brief/published/{version_id}")
def get_published_brief_version(
    project_id: str,
    version_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific published Brief version with its snapshot cards."""
    _get_user_project(db, project_id, user.id)

    v = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.id == version_id,
        BriefPublishedVersion.project_id == project_id,
    ).first()
    if not v:
        raise HTTPException(status_code=404, detail="Published Brief version not found")

    cards = [sc.snapshot_data for sc in v.snapshot_cards if sc.snapshot_data]

    return {
        "id": v.id,
        "project_id": v.project_id,
        "mode": "published",
        "version": v.version_number,
        "version_number": v.version_number,
        "status": "published",
        "editable": False,
        "card_count": v.card_count,
        "published_at": v.published_at.isoformat() if v.published_at else None,
        "cards": cards,
    }


@router.post("/api/projects/{project_id}/brief/publish")
def publish_brief(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Publish the current working Brief as an immutable snapshot.

    Rules:
    - Backend determines the version number (no frontend input accepted).
    - Transaction-safe: uses SELECT FOR UPDATE to prevent duplicate versions.
    - Snapshots all unified cards at publish time.
    - Returns 409 if there are no changes since the last published version.
    """
    _get_user_project(db, project_id, user.id)

    # Check for unpublished changes
    has_changes, working_count, latest_version = _check_brief_unpublished_changes(db, project_id)
    if working_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No unified Brief Cards to publish. Accept cards in the Brief workspace first."
        )

    if not has_changes and latest_version:
        raise HTTPException(
            status_code=409,
            detail=f"The current working Brief is identical to published V{latest_version.version_number}. No new changes to publish."
        )

    # Get all active unified brief cards (the current working dataset)
    working_cards = db.query(Card).filter(
        Card.project_id == project_id,
        or_(Card.is_unified == True, Card.status == "accepted"),
        Card.status != "rejected",
    ).all()

    # Ensure all included cards are explicitly unified
    for card in working_cards:
        if not card.is_unified:
            card.is_unified = True

    # Determine next version number atomically
    latest_locked = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == project_id
    ).with_for_update().order_by(BriefPublishedVersion.version_number.desc()).first()

    next_version_number = (latest_locked.version_number + 1) if latest_locked else 1

    # Create the published version snapshot (transactional)
    try:
        brief_pub_version = BriefPublishedVersion(
            id=str(uuid.uuid4()),
            project_id=project_id,
            version_number=next_version_number,
            card_count=len(working_cards),
            published_at=utc_now(),
            published_by=user.id,
        )
        db.add(brief_pub_version)
        db.flush()  # Get the ID before snapshot cards

        # Snapshot each unified card
        for card in working_cards:
            snapshot = {
                "id": card.id,
                "card_type": card.card_type,
                "title": card.title,
                "content": card.content,
                "evidence": card.evidence,
                "ai_suggestion": card.ai_suggestion,
                "section": card.section,
                "source_document": card.source_document,
                "source_id": card.source_id,
                "version": card.version,
                "status": card.status,
                "is_unified": card.is_unified,
                "created_by": card.created_by,
                "review_status": card.review_status,
                "created_at": card.created_at.isoformat() if card.created_at else None,
                "updated_at": card.updated_at.isoformat() if card.updated_at else None,
            }
            vc = BriefVersionCard(
                id=str(uuid.uuid4()),
                brief_version_id=brief_pub_version.id,
                card_id=card.id,
                snapshot_data=snapshot,
            )
            db.add(vc)

        db.commit()

        log_activity(
            db=db,
            user_id=user.id,
            event_type="brief_published",
            title=f"Brief V{next_version_number} published",
            description=f"Published {len(working_cards)} Brief Cards as V{next_version_number}",
            project_id=project_id,
        )

        logger.info(f"Published Brief V{next_version_number} for project {project_id} ({len(working_cards)} cards)")

        return {
            "id": brief_pub_version.id,
            "version_number": next_version_number,
            "card_count": len(working_cards),
            "published_at": brief_pub_version.published_at.isoformat(),
            "message": f"Brief V{next_version_number} published successfully.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to publish brief for project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to publish Brief: {str(e)}")


# ── Program Version Management ────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/program/published")
def list_published_program_versions(
    project_id: str,
    limit: int = Query(5, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List published Program versions (most recent first, default latest 5)."""
    _get_user_project(db, project_id, user.id)

    versions = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == project_id
    ).order_by(ProgramPublishedVersion.version_number.desc()).limit(limit).all()

    return [
        {
            "id": v.id,
            "project_id": v.project_id,
            "version_number": v.version_number,
            "item_count": v.item_count,
            "source_brief_version_id": v.source_brief_version_id,
            "source_brief_version_number": v.source_brief_version.version_number if v.source_brief_version else None,
            "previous_program_version_id": v.previous_program_version_id,
            "published_at": v.published_at.isoformat() if v.published_at else None,
        }
        for v in versions
    ]


@router.get("/api/projects/{project_id}/program/published/{version_id}")
def get_published_program_version(
    project_id: str,
    version_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific published Program version with its snapshot items."""
    _get_user_project(db, project_id, user.id)

    v = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.id == version_id,
        ProgramPublishedVersion.project_id == project_id,
    ).first()
    if not v:
        raise HTTPException(status_code=404, detail="Published Program version not found")

    items = [si.snapshot_data for si in v.snapshot_items if si.snapshot_data]

    return {
        "id": v.id,
        "project_id": v.project_id,
        "mode": "published",
        "version": v.version_number,
        "version_number": v.version_number,
        "status": "published",
        "editable": False,
        "item_count": v.item_count,
        "source_brief_version_id": v.source_brief_version_id,
        "source_brief_version_number": v.source_brief_version.version_number if v.source_brief_version else None,
        "previous_program_version_id": v.previous_program_version_id,
        "published_at": v.published_at.isoformat() if v.published_at else None,
        "items": items,
    }


@router.post("/api/projects/{project_id}/program/publish")
def publish_program(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Publish the current working Program as an immutable snapshot.

    Rules:
    - Backend determines version number.
    - Snapshots all current working program items.
    - Records the source Brief version and previous program version.
    - Transaction-safe.
    """
    _get_user_project(db, project_id, user.id)

    has_changes, working_count, latest_prog_version = _check_program_unpublished_changes(db, project_id)
    if working_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No Program Items to publish. Generate a Program first."
        )

    if not has_changes and latest_prog_version:
        raise HTTPException(
            status_code=409,
            detail=f"The current working Program is identical to published V{latest_prog_version.version_number}. No new changes to publish."
        )

    working_items = db.query(ProgramItem).filter(
        ProgramItem.project_id == project_id
    ).order_by(ProgramItem.program_item_code, ProgramItem.created_at).all()

    # Determine next version atomically
    latest_locked = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == project_id
    ).with_for_update().order_by(ProgramPublishedVersion.version_number.desc()).first()

    next_version_number = (latest_locked.version_number + 1) if latest_locked else 1

    # Get the latest published brief version to record as authoritative source
    latest_brief_version = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == project_id
    ).order_by(BriefPublishedVersion.version_number.desc()).first()

    try:
        prog_pub_version = ProgramPublishedVersion(
            id=str(uuid.uuid4()),
            project_id=project_id,
            version_number=next_version_number,
            source_brief_version_id=latest_brief_version.id if latest_brief_version else None,
            previous_program_version_id=latest_locked.id if latest_locked else None,
            item_count=len(working_items),
            published_at=utc_now(),
            published_by=user.id,
        )
        db.add(prog_pub_version)
        db.flush()

        for item in working_items:
            snapshot = _program_item_to_dict(item)
            vi = ProgramVersionItem(
                id=str(uuid.uuid4()),
                program_version_id=prog_pub_version.id,
                program_item_id=item.id,
                snapshot_data=snapshot,
            )
            db.add(vi)

        db.commit()

        log_activity(
            db=db,
            user_id=user.id,
            event_type="program_published",
            title=f"Program V{next_version_number} published",
            description=f"Published {len(working_items)} Program Items as V{next_version_number}",
            project_id=project_id,
        )

        logger.info(
            f"Published Program V{next_version_number} for project {project_id} "
            f"({len(working_items)} items, source brief: "
            f"{'V' + str(latest_brief_version.version_number) if latest_brief_version else 'None'})"
        )

        return {
            "id": prog_pub_version.id,
            "version_number": next_version_number,
            "item_count": len(working_items),
            "source_brief_version_number": latest_brief_version.version_number if latest_brief_version else None,
            "published_at": prog_pub_version.published_at.isoformat(),
            "message": f"Program V{next_version_number} published successfully.",
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to publish program for project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to publish Program: {str(e)}")


# ── Explicit Immutability Guards ──────────────────────────────────────────────

@router.api_route(
    "/api/projects/{project_id}/brief/published/{version_id}",
    methods=["PUT", "PATCH", "DELETE"],
)
@router.api_route(
    "/api/projects/{project_id}/brief/published/{version_id}/{path:path}",
    methods=["PUT", "PATCH", "DELETE", "POST"],
)
def reject_brief_published_mutation(
    project_id: str,
    version_id: str,
    path: str = "",
    user: User = Depends(get_current_user),
):
    """Explicitly reject any mutation attempts against published Brief versions with HTTP 409 Conflict."""
    raise HTTPException(
        status_code=409,
        detail="Published Brief versions are immutable."
    )


@router.api_route(
    "/api/projects/{project_id}/program/published/{version_id}",
    methods=["PUT", "PATCH", "DELETE"],
)
@router.api_route(
    "/api/projects/{project_id}/program/published/{version_id}/{path:path}",
    methods=["PUT", "PATCH", "DELETE", "POST"],
)
def reject_program_published_mutation(
    project_id: str,
    version_id: str,
    path: str = "",
    user: User = Depends(get_current_user),
):
    """Explicitly reject any mutation attempts against published Program versions with HTTP 409 Conflict."""
    raise HTTPException(
        status_code=409,
        detail="Published Program versions are immutable."
    )


