"""
Brief API routes.

POST  /api/projects/{project_id}/brief/analyze   — Trigger Brief analysis
GET   /api/projects/{project_id}/brief/status     — Get processing status
GET   /api/projects/{project_id}/brief            — Get current Brief
GET   /api/projects/{project_id}/brief/versions   — List Brief versions
GET   /api/projects/{project_id}/brief/{brief_id} — Get specific Brief version
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from db import get_db, Project, Source, Brief, BriefSource, Card, ProcessingJob, User
from auth.dependencies import get_current_user
from schemas.models import (
    BriefResponse, BriefVersionResponse, BriefSummary,
    ProcessingStatusResponse, AnalyzeBriefRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["briefs"])


@router.post("/{project_id}/brief/analyze", response_model=ProcessingStatusResponse)
def analyze_brief(
    project_id: str,
    body: AnalyzeBriefRequest = None,
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger Brief analysis for the project's sources."""
    project = _get_user_project(db, project_id, user.id)

    # Check for sources
    sources = db.query(Source).filter(Source.project_id == project_id).all()
    if not sources:
        raise HTTPException(status_code=400, detail="No source documents uploaded. Please upload at least one document first.")

    # Filter to specific sources if requested
    if body and body.source_ids:
        source_ids_set = set(body.source_ids)
        sources = [s for s in sources if s.id in source_ids_set]
        if not sources:
            raise HTTPException(status_code=400, detail="None of the specified source IDs were found.")

    # Check for existing processing job in progress — mark stale jobs (>90s) as superseded
    from datetime import datetime, timezone
    active_jobs = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.project_id == project_id,
            ProcessingJob.status.in_(["queued", "parsing", "extracting_images", "processing_brief", "generating_cards"])
        )
        .all()
    )
    for aj in active_jobs:
        # Mark previous active jobs as superseded so user is never blocked
        aj.status = "superseded"
        aj.current_step = "Superseded by new analysis run"
    db.commit()


    # Import here to avoid circular imports
    from agents.brief_orchestrator import run_brief_pipeline

    # Create processing job
    import uuid
    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=project_id,
        status="queued",
        current_step="Queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(f"Starting Brief analysis for project {project_id}, job {job_id}")

    # Record activity
    from db import log_activity
    doc_names = ", ".join([s.file_name for s in sources])
    log_activity(
        db=db,
        user_id=user.id,
        event_type="analysis_started",
        title="Analysis started",
        description=f"Analysing {len(sources)} document(s): {doc_names}",
        project_id=project_id,
    )

    # Dispatch to background: distributed worker queue (production) or inprocess background_tasks (local fallback)
    source_ids = [s.id for s in sources]
    from config import config

    if config.WORKER_MODE == "distributed":
        try:
            from tasks.queue import enqueue_brief_job
            enqueue_brief_job(project_id, source_ids, job_id, user.id)
            logger.info(f"Dispatched job {job_id} to distributed Redis worker queue.")
        except Exception as e:
            logger.error(f"Failed to dispatch job {job_id} to distributed Redis worker: {e}")
            job.status = "failed"
            job.current_step = "Queue Error"
            job.error_message = f"Distributed worker queue unavailable: {str(e)}"
            db.commit()
            raise HTTPException(
                status_code=503,
                detail=f"Background worker queue unavailable: {str(e)}. Ensure Redis and Worker containers are running."
            )
    else:
        logger.info(f"Running job {job_id} via in-process background task.")
        background_tasks.add_task(run_brief_pipeline, project_id, source_ids, job_id, user.id)

    return ProcessingStatusResponse.model_validate(job)



@router.get("/{project_id}/brief/status", response_model=ProcessingStatusResponse)
def get_brief_status(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the latest processing job status for this project."""
    _get_user_project(db, project_id, user.id)

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.project_id == project_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="No processing job found for this project.")

    return ProcessingStatusResponse.model_validate(job)


@router.get("/{project_id}/brief", response_model=BriefResponse)
def get_current_brief(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the latest completed Brief for this project."""
    _get_user_project(db, project_id, user.id)

    brief = (
        db.query(Brief)
        .filter(Brief.project_id == project_id, Brief.status == "completed")
        .order_by(Brief.version.desc())
        .first()
    )
    if not brief:
        raise HTTPException(status_code=404, detail="No completed Brief found for this project.")

    source_ids = [bs.source_id for bs in brief.brief_sources]

    resp = BriefResponse(
        id=brief.id,
        project_id=brief.project_id,
        version=brief.version,
        content=brief.content,
        raw_content=brief.raw_content,
        project_metadata=brief.project_metadata,
        status=brief.status,
        created_at=brief.created_at,
        source_ids=source_ids,
    )
    return resp


@router.get("/{project_id}/brief/versions", response_model=list[BriefVersionResponse])
def list_brief_versions(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all Brief versions for this project."""
    _get_user_project(db, project_id, user.id)

    briefs = (
        db.query(Brief)
        .filter(Brief.project_id == project_id)
        .order_by(Brief.version.desc())
        .all()
    )

    results = []
    for brief in briefs:
        source_ids = [bs.source_id for bs in brief.brief_sources]
        # Get source file names
        source_names = []
        for bs in brief.brief_sources:
            if bs.source:
                source_names.append(bs.source.file_name)

        results.append(BriefVersionResponse(
            id=brief.id,
            version=brief.version,
            status=brief.status,
            created_at=brief.created_at,
            source_ids=source_ids,
            source_names=source_names,
        ))

    return results


@router.get("/{project_id}/brief/v/{brief_id}", response_model=BriefResponse)
def get_brief_version(
    project_id: str,
    brief_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific Brief version."""
    _get_user_project(db, project_id, user.id)

    brief = db.query(Brief).filter(
        Brief.id == brief_id,
        Brief.project_id == project_id,
    ).first()
    if not brief:
        raise HTTPException(status_code=404, detail="Brief version not found.")

    source_ids = [bs.source_id for bs in brief.brief_sources]

    return BriefResponse(
        id=brief.id,
        project_id=brief.project_id,
        version=brief.version,
        content=brief.content,
        raw_content=brief.raw_content,
        project_metadata=brief.project_metadata,
        status=brief.status,
        created_at=brief.created_at,
        source_ids=source_ids,
    )


@router.get("/{project_id}/brief/summary", response_model=BriefSummary)
def get_brief_summary(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get summary statistics for the project's cards."""
    _get_user_project(db, project_id, user.id)

    # Count cards by type (excluding rejected)
    total = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.status != "rejected",
    ).scalar() or 0

    questions = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.card_type == "QUESTION",
        Card.status != "rejected",
    ).scalar() or 0

    conflicts = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.card_type == "CONFLICT",
        Card.status != "rejected",
    ).scalar() or 0

    facts = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.card_type == "FACT",
        Card.status != "rejected",
    ).scalar() or 0

    requirements = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.card_type == "REQUIREMENT",
        Card.status != "rejected",
    ).scalar() or 0

    actions = db.query(func.count(Card.id)).filter(
        Card.project_id == project_id,
        Card.card_type == "ACTION",
        Card.status != "rejected",
    ).scalar() or 0

    return BriefSummary(
        total_cards=total,
        ai_questions=questions,
        conflicts=conflicts,
        facts=facts,
        requirements=requirements,
        actions=actions,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
