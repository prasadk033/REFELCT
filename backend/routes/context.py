"""
FastAPI routes for the isolated REFLECT Context Knowledge System (Phase 1: Cultural Context).
"""
import uuid
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from config import config
from db import get_db, Project, User, utc_now
from auth.dependencies import get_current_user
from context.models import ContextRun, ContextCard, ContextJob
from context.schemas import (
    ContextGenerateRequest,
    ContextCardModifyRequest,
    ContextCardNoteRequest,
    ContextCardTagsRequest,
)
from context.registry import KNOWLEDGE_SETS, is_knowledge_set_enabled
from context.orchestrator import (
    run_context_generation_job,
    run_context_card_modification_job,
    clear_context_cancel_flag,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["context"])


def _get_owned_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _serialize_card(card: ContextCard) -> Dict[str, Any]:
    return {
        "id": card.id,
        "project_id": card.project_id,
        "run_id": card.run_id,
        "knowledge_set_id": card.knowledge_set_id,
        "knowledge_set_name": card.knowledge_set_name,
        "sub_aspect_key": card.sub_aspect_key,
        "display_order": card.display_order,
        "title": card.title,
        "content": card.content,
        "research_register": card.research_register,
        "confidence": card.confidence,
        "version": card.version,
        "architect_notes": card.architect_notes or [],
        "tags": card.tags or [],
        "sources": [
            {
                "id": s.id,
                "title": s.title,
                "author_or_org": s.author_or_org,
                "url": s.url,
                "published_date": s.published_date,
                "source_type": s.source_type,
                "supported_claim": s.supported_claim,
            }
            for s in (card.sources or [])
        ],
        "images": [
            {
                "id": img.id,
                "image_url": img.image_url,
                "source_page_url": img.source_page_url,
                "source_title": img.source_title,
                "image_caption": img.image_caption,
                "image_type": img.image_type,
                "relevance_reason": img.relevance_reason,
                "license": img.license,
                "verified": img.verified,
                "is_architect_upload": img.is_architect_upload,
            }
            for img in (card.images or [])
        ],
        "created_at": card.created_at.isoformat() if card.created_at else None,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
    }


@router.get("/{project_id}/context")
def get_project_context(
    project_id: str,
    knowledge_set_id: str = "cultural_context",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch Knowledge Set registry, latest run metadata, and active Context Cards."""
    _get_owned_project(db, project_id, user.id)

    latest_run = (
        db.query(ContextRun)
        .filter(ContextRun.project_id == project_id, ContextRun.knowledge_set_id == knowledge_set_id)
        .order_by(ContextRun.created_at.desc())
        .first()
    )

    cards = (
        db.query(ContextCard)
        .filter(
            ContextCard.project_id == project_id,
            ContextCard.knowledge_set_id == knowledge_set_id,
            ContextCard.is_deleted == False,
        )
        .order_by(ContextCard.display_order.asc(), ContextCard.created_at.asc())
        .all()
    )

    latest_job = (
        db.query(ContextJob)
        .filter(ContextJob.project_id == project_id, ContextJob.knowledge_set_id == knowledge_set_id)
        .order_by(ContextJob.created_at.desc())
        .first()
    )

    return {
        "knowledge_sets": KNOWLEDGE_SETS,
        "active_knowledge_set": knowledge_set_id,
        "latest_run": {
            "id": latest_run.id,
            "status": latest_run.status,
            "resolved_location": latest_run.resolved_location,
            "location_confidence": latest_run.location_confidence,
            "attempt_count": latest_run.attempt_count,
            "evaluation_result": latest_run.evaluation_result,
            "evaluation_issues": latest_run.evaluation_issues or [],
            "limitations": latest_run.limitations or [],
            "local_verification_requirements": latest_run.local_verification_requirements or [],
            "created_at": latest_run.created_at.isoformat() if latest_run.created_at else None,
        } if latest_run else None,
        "latest_job": {
            "id": latest_job.id,
            "job_kind": latest_job.job_kind,
            "status": latest_job.status,
            "current_step": latest_job.current_step,
            "error": latest_job.error,
            "attempt_count": latest_job.attempt_count,
        } if latest_job else None,
        "cards": [_serialize_card(c) for c in cards],
    }


@router.post("/{project_id}/context/{knowledge_set_id}/generate", status_code=202)
def generate_context_knowledge(
    project_id: str,
    knowledge_set_id: str,
    body: ContextGenerateRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger Context Master + Knowledge Set Agent generation (Phase 1: cultural_context only)."""
    _get_owned_project(db, project_id, user.id)

    try:
        enabled = is_knowledge_set_enabled(knowledge_set_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if not enabled:
        raise HTTPException(
            status_code=501,
            detail=f"Knowledge Set '{knowledge_set_id}' is not enabled in Phase 1. Only 'cultural_context' is active.",
        )

    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DeepSeek API key is not configured on the server.")

    active_job = (
        db.query(ContextJob)
        .filter(
            ContextJob.project_id == project_id,
            ContextJob.status.in_(["queued", "running"]),
        )
        .first()
    )
    if active_job:
        raise HTTPException(status_code=409, detail="A Context research task is already running for this project.")

    clear_context_cancel_flag(project_id)
    job_id = str(uuid.uuid4())
    job = ContextJob(
        id=job_id,
        project_id=project_id,
        user_id=user.id,
        knowledge_set_id=knowledge_set_id,
        job_kind="initial_research",
        status="queued",
        current_step="Queued for Context Master...",
    )
    db.add(job)
    db.commit()

    uploaded_imgs = [img.model_dump() for img in (body.uploaded_images or [])]
    if config.WORKER_MODE == "distributed":
        from tasks.queue import enqueue_context_job
        enqueue_context_job(
            run_context_generation_job,
            project_id,
            job_id,
            body.architect_local_knowledge,
            uploaded_imgs,
            body.focus_notes,
        )
    else:
        background_tasks.add_task(
            run_context_generation_job,
            project_id,
            job_id,
            body.architect_local_knowledge,
            uploaded_imgs,
            body.focus_notes,
        )

    return {"job_id": job_id, "status": "queued", "knowledge_set_id": knowledge_set_id}


@router.get("/{project_id}/context/status")
def get_context_status(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Poll latest Context Knowledge System background job status."""
    _get_owned_project(db, project_id, user.id)
    job = (
        db.query(ContextJob)
        .filter(ContextJob.project_id == project_id)
        .order_by(ContextJob.created_at.desc())
        .first()
    )
    if not job:
        return {"status": "idle"}
    return {
        "id": job.id,
        "knowledge_set_id": job.knowledge_set_id,
        "job_kind": job.job_kind,
        "target_card_id": job.target_card_id,
        "status": job.status,
        "current_step": job.current_step,
        "error": job.error,
        "attempt_count": job.attempt_count,
    }


@router.post("/{project_id}/context/cancel")
def cancel_context_job(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel any active Context Knowledge System job via Redis + DB."""
    _get_owned_project(db, project_id, user.id)
    try:
        from tasks.queue import get_redis_connection
        r = get_redis_connection()
        r.set(f"reflect:cancelled:context:{project_id}", "1", ex=300)
    except Exception as exc:
        logger.warning(f"Could not set Redis context cancel flag: {exc}")

    active = (
        db.query(ContextJob)
        .filter(ContextJob.project_id == project_id, ContextJob.status.in_(["queued", "running"]))
        .all()
    )
    for j in active:
        j.status = "cancelled"
        j.current_step = "Cancelled by user"
    db.commit()
    return {"cancelled_count": len(active)}


@router.post("/{project_id}/context/cards/{card_id}/modify", status_code=202)
def modify_context_card(
    project_id: str,
    card_id: str,
    body: ContextCardModifyRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """MODE B: Trigger targeted single-card modification via Context Master + Cultural Context Agent."""
    _get_owned_project(db, project_id, user.id)
    card = (
        db.query(ContextCard)
        .filter(ContextCard.id == card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Context card not found")

    if not config.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DeepSeek API key is not configured on the server.")

    active_job = (
        db.query(ContextJob)
        .filter(ContextJob.project_id == project_id, ContextJob.status.in_(["queued", "running"]))
        .first()
    )
    if active_job:
        raise HTTPException(status_code=409, detail="Another Context task is currently running for this project.")

    clear_context_cancel_flag(project_id)
    job_id = str(uuid.uuid4())
    job = ContextJob(
        id=job_id,
        project_id=project_id,
        user_id=user.id,
        knowledge_set_id=card.knowledge_set_id,
        job_kind="card_modification",
        target_card_id=card.id,
        status="queued",
        current_step=f"Queued modification for '{card.title}'...",
    )
    db.add(job)
    db.commit()

    if config.WORKER_MODE == "distributed":
        from tasks.queue import enqueue_context_job
        enqueue_context_job(
            run_context_card_modification_job,
            project_id,
            job_id,
            card.id,
            body.instruction,
            body.architect_local_knowledge,
        )
    else:
        background_tasks.add_task(
            run_context_card_modification_job,
            project_id,
            job_id,
            card.id,
            body.instruction,
            body.architect_local_knowledge,
        )

    return {"job_id": job_id, "status": "queued", "card_id": card.id}


@router.patch("/{project_id}/context/cards/{card_id}/notes")
def add_context_card_note(
    project_id: str,
    card_id: str,
    body: ContextCardNoteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Architect action outside AI research: append a user-authored note without triggering AI."""
    _get_owned_project(db, project_id, user.id)
    card = (
        db.query(ContextCard)
        .filter(ContextCard.id == card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Context card not found")

    notes = list(card.architect_notes or [])
    notes.append({
        "id": str(uuid.uuid4()),
        "text": body.note.strip(),
        "created_at": utc_now().isoformat(),
    })
    card.architect_notes = notes
    db.commit()
    db.refresh(card)
    return _serialize_card(card)


@router.patch("/{project_id}/context/cards/{card_id}/tags")
def update_context_card_tags(
    project_id: str,
    card_id: str,
    body: ContextCardTagsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Architect action outside AI research: update card tags without triggering AI."""
    _get_owned_project(db, project_id, user.id)
    card = (
        db.query(ContextCard)
        .filter(ContextCard.id == card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Context card not found")

    clean_tags = [t.strip() for t in body.tags if t and t.strip()]
    card.tags = list(dict.fromkeys(clean_tags))
    db.commit()
    db.refresh(card)
    return _serialize_card(card)


@router.delete("/{project_id}/context/cards/{card_id}", status_code=204)
def delete_context_card(
    project_id: str,
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Architect action outside AI research: delete a Context Card without regenerating it."""
    _get_owned_project(db, project_id, user.id)
    card = (
        db.query(ContextCard)
        .filter(ContextCard.id == card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Context card not found")

    card.is_deleted = True
    db.commit()
    return None


@router.post("/{project_id}/context/{knowledge_set_id}/cards", status_code=201)
def create_manual_context_card(
    project_id: str,
    knowledge_set_id: str,
    body: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow architect to manually add a Context Card without triggering AI."""
    _get_owned_project(db, project_id, user.id)
    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required.")

    existing_count = (
        db.query(ContextCard)
        .filter(
            ContextCard.project_id == project_id,
            ContextCard.knowledge_set_id == knowledge_set_id,
            ContextCard.is_deleted == False,
        )
        .count()
    )
    card = ContextCard(
        id=str(uuid.uuid4()),
        project_id=project_id,
        knowledge_set_id=knowledge_set_id,
        knowledge_set_name="Cultural Context",
        sub_aspect_key="architect_custom",
        display_order=existing_count + 1,
        title=title,
        content=content,
        research_register="DOCUMENTED",
        confidence="ARCHITECT",
        version=1,
        architect_notes=[],
        tags=[t.strip() for t in (body.get("tags") or []) if isinstance(t, str) and t.strip()],
        is_deleted=False,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return _serialize_card(card)
