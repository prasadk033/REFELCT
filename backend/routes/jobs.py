"""
Processing Jobs and Notification Management API routes.

GET  /api/jobs/unacknowledged — Get recently completed/failed jobs for the authenticated user
POST /api/jobs/{job_id}/acknowledge — Mark a job notification as seen for authenticated job owner
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db, ProcessingJob, Project, User
from auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/unacknowledged")
def get_unacknowledged_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return recently completed or failed/partial jobs for the authenticated user
    that have not yet been acknowledged by the owner.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)

    jobs = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.user_id == user.id,
            ProcessingJob.status.in_(["completed", "failed", "partial"]),
            (ProcessingJob.notification_seen.is_(False)) | (ProcessingJob.notification_seen.is_(None)),
            ProcessingJob.created_at >= cutoff
        )
        .order_by(ProcessingJob.created_at.desc())
        .limit(20)
        .all()
    )

    results = []
    for j in jobs:
        proj = db.query(Project).filter(Project.id == j.project_id).first()
        results.append({
            "id": j.id,
            "project_id": j.project_id,
            "project_name": proj.name if proj else "Project",
            "status": j.status,
            "current_step": j.current_step,
            "error": j.error,
            "cards_generated": j.cards_generated or 0,
            "questions_count": j.questions_count or 0,
            "document_names": j.document_names or "",
            "created_at": j.created_at.isoformat() if j.created_at else None,
        })
    return results


@router.post("/{job_id}/acknowledge")
def acknowledge_job_notification(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark a background job's completion/failure notification as seen.
    STRICT SECURITY RULE: Only the authenticated job owner (user_id) can acknowledge.
    """
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Strictly verify that job owner matches the authenticated user
    if job.user_id and job.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You can only acknowledge notifications for your own jobs"
        )

    job.notification_seen = True
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"User {user.id} acknowledged notification for job {job.id}")
    return {"message": "Notification acknowledged", "job_id": job.id}
