"""
Source management API routes.

Supports document & image upload, standalone extraction, editable parsed data,
and architect source approvals for V1 / V2 workflows.
"""
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime

from db import get_db, Project, Source, User, log_activity
from auth.dependencies import get_current_user
from schemas.models import SourceResponse, SourceContentUpdate
from storage import file_store
from documents.loader import DocumentLoader

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["sources"])

ALLOWED_EXTENSIONS = {
    ".pdf", ".txt", ".docx", ".doc",
    ".jpg", ".jpeg", ".png", ".webp"
}


def _extract_source_text(source: Source) -> str:
    """Extract raw text or image OCR from a source document without LLM agents."""
    loader = DocumentLoader()
    abs_path = file_store.get_absolute_path(source.storage_path)
    try:
        text, _ = loader.extract_text_combined(abs_path)
        source.extracted_text = text or f"[{source.file_name} — No readable text found]"
        source.processing_status = "extracted"
        source.approval_status = "pending_review"
        source.processing_error = None
        return source.extracted_text
    except Exception as e:
        logger.error(f"Extraction failed for source {source.id} ({source.file_name}): {e}")
        source.processing_status = "failed"
        source.processing_error = str(e)
        raise e


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
            detail=f"Unsupported file type '{ext}'. Allowed: PDF, DOC, DOCX, TXT, JPG, PNG, WEBP."
        )

    # Determine file type label
    file_type_map = {
        ".pdf": "pdf", ".docx": "docx", ".doc": "doc", ".txt": "txt",
        ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image"
    }
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

    # Create source record — initially unversioned and pending extraction
    source = Source(
        id=source_id,
        project_id=project_id,
        file_name=file.filename,
        file_type=file_type,
        file_size=file_size,
        storage_path=storage_path,
        processing_status="uploaded",
        approval_status="pending_review",
        version=None,
    )
    db.add(source)

    # Update project timestamp
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(source)

    logger.info(f"Uploaded source {source.id}: {source.file_name} to project {project_id}")

    # Record activity
    log_activity(
        db=db,
        user_id=user.id,
        event_type="document_uploaded",
        title="Document uploaded",
        description=f"{source.file_name} added to project (Pending Extraction)",
        project_id=project_id,
    )

    return SourceResponse.model_validate(source)


@router.get("/{project_id}/sources", response_model=list[SourceResponse])
def list_sources(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sources = (
        db.query(Source)
        .filter(Source.project_id == project_id)
        .order_by(Source.upload_timestamp.asc())
        .all()
    )

    return [SourceResponse.model_validate(s) for s in sources]


@router.post("/{project_id}/sources/extract", response_model=list[SourceResponse])
def extract_all_sources(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Incremental extraction: Extract ONLY pending batch sources (version is None and not yet approved).
    Previously approved, versioned documents are NEVER re-extracted automatically.
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Strictly target ONLY pending batch sources that have not been approved
    pending_sources = (
        db.query(Source)
        .filter(
            Source.project_id == project_id,
            Source.version.is_(None),
            Source.approval_status != "approved"
        )
        .all()
    )

    # If all pending already extracted/approved, fall back to any unextracted pending sources
    if not pending_sources:
        pending_sources = (
            db.query(Source)
            .filter(
                Source.project_id == project_id,
                Source.version.is_(None)
            )
            .all()
        )

    for source in pending_sources:
        if not source.extracted_text or source.processing_status == "uploaded":
            try:
                _extract_source_text(source)
            except Exception as e:
                logger.warning(f"Extraction error for {source.file_name}: {e}")

    db.commit()

    if pending_sources:
        log_activity(
            db=db,
            user_id=user.id,
            event_type="extraction_completed",
            title="Information extracted",
            description=f"Extracted content from {len(pending_sources)} pending document(s)",
            project_id=project_id,
        )

    all_sources = db.query(Source).filter(Source.project_id == project_id).order_by(Source.upload_timestamp.asc()).all()
    return [SourceResponse.model_validate(s) for s in all_sources]


@router.post("/{project_id}/sources/{source_id}/reparse", response_model=SourceResponse)
def reparse_single_source(
    project_id: str,
    source_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-run extraction for a single source."""
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

    _extract_source_text(source)
    source.approval_status = "pending_review"
    db.commit()
    db.refresh(source)

    return SourceResponse.model_validate(source)


@router.put("/{project_id}/sources/{source_id}/content", response_model=SourceResponse)
def update_source_content(
    project_id: str,
    source_id: str,
    payload: SourceContentUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow architect to edit/clean extracted text before approving."""
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

    source.extracted_text = payload.extracted_text
    source.processing_status = "extracted"
    db.commit()
    db.refresh(source)

    return SourceResponse.model_validate(source)


@router.post("/{project_id}/sources/{source_id}/approve", response_model=SourceResponse)
def approve_single_source(
    project_id: str,
    source_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a source document as approved by the architect."""
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

    source.approval_status = "approved"
    source.processing_status = "approved"
    db.commit()
    db.refresh(source)

    log_activity(
        db=db,
        user_id=user.id,
        event_type="source_approved",
        title="Source approved",
        description=f"{source.file_name} marked as approved",
        project_id=project_id,
    )

    return SourceResponse.model_validate(source)


@router.post("/{project_id}/sources/approve-all", response_model=list[SourceResponse])
def approve_all_sources(
    project_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve all pending sources for the project."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pending_sources = db.query(Source).filter(
        Source.project_id == project_id,
        (Source.version.is_(None)) | (Source.approval_status != "approved")
    ).all()
    for s in pending_sources:
        if not s.extracted_text:
            try:
                _extract_source_text(s)
            except Exception:
                pass
        s.approval_status = "approved"
        s.processing_status = "approved"

    db.commit()

    log_activity(
        db=db,
        user_id=user.id,
        event_type="all_sources_approved",
        title="All pending sources approved",
        description=f"Approved {len(pending_sources)} source(s) for brief generation",
        project_id=project_id,
    )

    all_sources = db.query(Source).filter(Source.project_id == project_id).order_by(Source.upload_timestamp.asc()).all()
    return [SourceResponse.model_validate(s) for s in all_sources]


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

    file_name = source.file_name
    db.delete(source)
    db.commit()

    log_activity(
        db=db,
        user_id=user.id,
        event_type="document_deleted",
        title="Document removed",
        description=f"{file_name} removed from project",
        project_id=project_id,
    )

    return {"message": "Source deleted successfully"}
