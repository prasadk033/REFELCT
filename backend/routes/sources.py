"""
Source management API routes.

POST  /api/projects/{project_id}/sources  — Upload a source document
GET   /api/projects/{project_id}/sources  — List project sources
"""
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime

from db import get_db, Project, Source, User
from auth.dependencies import get_current_user
from schemas.models import SourceResponse
from storage import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["sources"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx", ".doc"}


@router.post("/{project_id}/sources", response_model=SourceResponse)
async def upload_source(
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file type
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: PDF, DOC, DOCX, TXT."
        )

    # Determine file type label
    file_type_map = {".pdf": "pdf", ".docx": "docx", ".doc": "doc", ".txt": "txt"}
    file_type = file_type_map.get(ext, ext.lstrip("."))

    source_id = str(uuid.uuid4())

    # Save to storage
    storage_path = file_store.save_upload(
        project_id=project_id,
        source_id=source_id,
        file_name=file.filename,
        file_data=file.file,
    )

    # Get file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    # Create source record
    source = Source(
        id=source_id,
        project_id=project_id,
        file_name=file.filename,
        file_type=file_type,
        file_size=file_size,
        storage_path=storage_path,
        processing_status="uploaded",
    )
    db.add(source)

    # Update project timestamp
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(source)

    logger.info(f"Uploaded source {source.id}: {source.file_name} to project {project_id}")

    # Record activity
    from db import log_activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="document_uploaded",
        title="Document uploaded",
        description=f"{source.file_name} added to workspace",
        project_id=project_id,
    )

    return SourceResponse.model_validate(source)



@router.get("/{project_id}/sources", response_model=list[SourceResponse])
def list_sources(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sources = (
        db.query(Source)
        .filter(Source.project_id == project_id)
        .order_by(Source.upload_timestamp.desc())
        .all()
    )

    return [SourceResponse.model_validate(s) for s in sources]


@router.delete("/{project_id}/sources/{source_id}")
def delete_source(
    project_id: str,
    source_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source = db.query(Source).filter(
        Source.id == source_id,
        Source.project_id == project_id
    ).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    db.delete(source)
    db.commit()
    return {"message": "Source deleted successfully"}

