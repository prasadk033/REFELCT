"""
Project API routes.

POST   /api/projects              — Create a new project
GET    /api/projects              — List user's projects
GET    /api/projects/{project_id} — Get project details
PATCH  /api/projects/{project_id} — Update project
"""
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from db import get_db, Project, Source, Brief, Card, User
from auth.dependencies import get_current_user
from schemas.models import ProjectCreate, ProjectUpdate, ProjectResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=body.name,
        project_type=body.project_type,
        location=body.location,
        client=body.client,
        description=body.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info(f"Created project: {project.id} ({project.name})")

    # Record activity
    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="project_created",
        title="Project created",
        description=f"Created project '{project.name}'",
        project_id=project.id,
    )

    return _project_to_response(db, project)



@router.get("", response_model=list[ProjectResponse])
def list_projects(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = (
        db.query(Project)
        .filter(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    return [_project_to_response(db, p) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_user_project(db, project_id, user.id)
    return _project_to_response(db, project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_user_project(db, project_id, user.id)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    logger.info(f"Updated project: {project.id}")

    return _project_to_response(db, project)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_user_project(db: Session, project_id: str, user_id: str) -> Project:
    """Fetch a project ensuring it belongs to the authenticated user."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


def _project_to_response(db: Session, project: Project) -> ProjectResponse:
    """Convert a Project ORM object to ProjectResponse with computed fields."""
    source_count = db.query(func.count(Source.id)).filter(Source.project_id == project.id).scalar() or 0

    # Get latest brief version
    latest_brief = (
        db.query(Brief)
        .filter(Brief.project_id == project.id, Brief.status == "completed")
        .order_by(Brief.version.desc())
        .first()
    )
    brief_version = latest_brief.version if latest_brief else None

    card_count = db.query(func.count(Card.id)).filter(Card.project_id == project.id).scalar() or 0

    return ProjectResponse(
        id=project.id,
        name=project.name,
        project_type=project.project_type,
        location=project.location,
        client=project.client,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        source_count=source_count,
        brief_version=brief_version,
        card_count=card_count,
    )
