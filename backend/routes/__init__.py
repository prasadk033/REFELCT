"""
Project API routes.

POST   /api/projects              — Create a new project
GET    /api/projects              — List user's projects
GET    /api/projects/{project_id} — Get project details
PATCH  /api/projects/{project_id} — Update project
"""
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from db import get_db, Project, Source, Brief, Card, User, log_activity, BriefPublishedVersion
from auth.dependencies import get_current_user
from schemas.models import ProjectCreate, ProjectUpdate, ProjectResponse
from storage import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

def _ensure_osm_source(db: Session, project_id: str, site_url: str, user_id: str, is_new_or_changed: bool = False):
    if not site_url:
        return
    # Check if there's already an active OSM source for this project
    existing_unversioned = db.query(Source).filter(
        Source.project_id == project_id,
        Source.file_type == "virtual/osm",
        Source.version.is_(None)
    ).first()
    
    if not existing_unversioned:
        existing_versioned = db.query(Source).filter(
            Source.project_id == project_id,
            Source.file_type == "virtual/osm"
        ).order_by(Source.created_at.desc()).first()
        
        # Only create a new one if there isn't any, or if it changed
        if not existing_versioned or is_new_or_changed:
            new_source = Source(
                id=str(uuid.uuid4()),
                project_id=project_id,
                file_name="🌍 Site Analysis — OpenStreetMap",
                file_type="virtual/osm",
                storage_path="",
                processing_status="uploaded"
            )
            db.add(new_source)
            db.commit()
    elif is_new_or_changed:
        # If location was updated and there's an unversioned source, clear extraction text so it is re-extracted
        existing_unversioned.extracted_text = None
        existing_unversioned.processing_status = "uploaded"
        db.commit()

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
        site_url=body.site_url,
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

    _ensure_osm_source(db, project.id, project.site_url, user.id, is_new_or_changed=True)

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
    if not projects:
        return []

    project_ids = [p.id for p in projects]

    # Batch fetch source counts in a single query
    source_counts = dict(
        db.query(Source.project_id, func.count(Source.id))
        .filter(Source.project_id.in_(project_ids))
        .group_by(Source.project_id)
        .all()
    )

    # Batch fetch card counts in a single query
    card_counts = dict(
        db.query(Card.project_id, func.count(Card.id))
        .filter(Card.project_id.in_(project_ids))
        .group_by(Card.project_id)
        .all()
    )

    # Batch fetch latest published brief version per project (ONLY from BriefPublishedVersion)
    latest_published_briefs = (
        db.query(
            BriefPublishedVersion.project_id,
            func.max(BriefPublishedVersion.version_number)
        )
        .filter(BriefPublishedVersion.project_id.in_(project_ids))
        .group_by(BriefPublishedVersion.project_id)
        .all()
    )
    published_brief_versions = dict(latest_published_briefs)

    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            project_type=p.project_type,
            location=p.location,
            site_url=p.site_url,
            client=p.client,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            source_count=source_counts.get(p.id, 0),
            brief_version=published_brief_versions.get(p.id),
            published_brief_version=published_brief_versions.get(p.id),
            card_count=card_counts.get(p.id, 0),
        )
        for p in projects
    ]


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
    
    old_site_url = project.site_url

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    
    if "site_url" in update_data:
        is_changed = old_site_url != update_data["site_url"]
        _ensure_osm_source(db, project.id, project.site_url, user.id, is_new_or_changed=is_changed)
        
    logger.info(f"Updated project: {project.id}")

    return _project_to_response(db, project)


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_user_project(db, project_id, user.id)
    project_name = project.name

    # 1. Break self-referencing foreign keys on briefs so delete cascade won't violate FK constraints
    from db import Brief, SiteAnalysisCache
    db.query(Brief).filter(Brief.project_id == project_id).update(
        {"previous_version_id": None}, synchronize_session=False
    )
    db.query(SiteAnalysisCache).filter(SiteAnalysisCache.project_id == project_id).delete(
        synchronize_session=False
    )
    db.flush()

    # 2. Cancel ongoing extractions and delete storage files for all project sources
    from documents.loader import cancel_extraction
    sources = db.query(Source).filter(Source.project_id == project_id).all()
    for s in sources:
        abs_p = None
        if s.storage_path:
            try:
                abs_p = file_store.get_absolute_path(s.storage_path)
            except Exception as err:
                logger.warning(f"Could not get absolute path for {s.storage_path}: {err}")
        try:
            cancel_extraction(source_id=s.id, file_path=abs_p)
        except Exception as err:
            logger.warning(f"Error canceling extraction for source {s.id}: {err}")
        if s.storage_path:
            try:
                file_store.delete_file(s.storage_path)
            except Exception as err:
                logger.warning(f"Failed to delete file {s.storage_path}: {err}")

    db.delete(project)
    db.commit()

    log_activity(
        db=db,
        user_id=user.id,
        event_type="project_deleted",
        title="Project deleted",
        description=f"Project '{project_name}' deleted",
    )

    logger.info(f"Deleted project: {project_id} ('{project_name}')")
    return {"message": f"Project '{project_name}' deleted successfully"}


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

    # Get latest published brief version (ONLY from BriefPublishedVersion, never legacy briefs)
    latest_pub = (
        db.query(BriefPublishedVersion)
        .filter(BriefPublishedVersion.project_id == project.id)
        .order_by(BriefPublishedVersion.version_number.desc())
        .first()
    )
    brief_version = latest_pub.version_number if latest_pub else None

    card_count = db.query(func.count(Card.id)).filter(Card.project_id == project.id).scalar() or 0

    return ProjectResponse(
        id=project.id,
        name=project.name,
        project_type=project.project_type,
        location=project.location,
        site_url=project.site_url,
        client=project.client,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        source_count=source_count,
        brief_version=brief_version,
        published_brief_version=brief_version,
        card_count=card_count,
    )
