"""
Activity API routes.

GET /api/activities — List real system activity events for current user
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import get_db, ActivityLog, User, Project
from auth.dependencies import get_current_user
from schemas.models import ActivityLogResponse
from fastapi import HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=list[ActivityLogResponse])
def list_activities(
    project_id: Optional[str] = Query(None, description="Filter activities by project ID"),
    limit: int = Query(20, ge=1, le=50, description="Max activities to return"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve dynamic real activity logs for the current user."""
    query = db.query(ActivityLog).filter(ActivityLog.user_id == user.id)

    if project_id:
        # Verify user ownership of the requested project
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        query = query.filter(ActivityLog.project_id == project_id)

    activities = query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return [ActivityLogResponse.model_validate(act) for act in activities]
