"""
Source management API routes.

Supports document & image upload, standalone extraction, editable parsed data,
and architect source approvals for V1 / V2 workflows.
"""
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from db import get_db, Project, Source, Brief, BriefSource, Card, User, log_activity
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
    description: Optional[str] = Form(None),
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

    # Check file size (100MB limit)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum allowed upload size of 100MB (actual: {file_size / (1024*1024):.1f}MB)."
        )

    safe_filename = Path(file.filename).name.replace("..", "").replace("/", "").replace("\\", "").strip() or "document"
    source_id = str(uuid.uuid4())

    # Save to storage
    storage_path = file_store.save_upload(
        project_id=project_id,
        source_id=source_id,
        file_name=safe_filename,
        file_data=file.file,
    )

    # Create source record — initially unversioned and pending extraction
    source = Source(
        id=source_id,
        project_id=project_id,
        file_name=safe_filename,
        file_type=file_type,
        file_size=file_size,
        description=description.strip() if description and description.strip() else None,
        storage_path=storage_path,
        processing_status="uploaded",
        approval_status="pending_review",
        version=None,
    )
    db.add(source)

    # Update project timestamp
    project.updated_at = datetime.now(timezone.utc)
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

    # A version is only truly complete if cards exist in the database for that version
    card_versions = set([
        row[0] for row in db.query(Card.version).filter(
            Card.project_id == project_id
        ).distinct().all()
        if row[0] is not None
    ])

    brief_versions_with_cards = set([
        row[0] for row in db.query(Brief.version).join(Card, Card.brief_id == Brief.id).filter(
            Brief.project_id == project_id
        ).distinct().all()
        if row[0] is not None
    ])

    # True completed versions are those that actually produced Brief Cards!
    completed_versions = card_versions.union(brief_versions_with_cards)

    sources = (
        db.query(Source)
        .filter(Source.project_id == project_id)
        .order_by(Source.upload_timestamp.asc())
        .all()
    )

    # Healing: If any source has a version assigned, but no completed brief/cards exist for that version,
    # recover it back to pending (version = None) so the user can generate the brief cleanly.
    needs_commit = False
    for s in sources:
        if s.version is not None and s.version not in completed_versions:
            logger.info(f"Auto-recovering stranded source '{s.file_name}' (V{s.version}) to pending (no cards found).")
            # Clean up zombie brief / brief_source records safely without FK violations
            try:
                zombie_brief_ids = [b[0] for b in db.query(Brief.id).filter(Brief.project_id == project_id, Brief.version == s.version).all()]
                if zombie_brief_ids:
                    db.query(BriefSource).filter(BriefSource.brief_id.in_(zombie_brief_ids)).delete(synchronize_session=False)
                    db.query(Brief).filter(Brief.previous_version_id.in_(zombie_brief_ids)).update({"previous_version_id": None}, synchronize_session=False)
                    db.query(Brief).filter(Brief.id.in_(zombie_brief_ids)).delete(synchronize_session=False)
                db.query(BriefSource).filter(BriefSource.source_id == s.id).delete(synchronize_session=False)
            except Exception as clean_err:
                logger.warning(f"Could not purge zombie briefs for V{s.version}: {clean_err}")

            s.version = None
            if s.processing_status == "completed":
                s.processing_status = "extracted"
            needs_commit = True

    if needs_commit:
        try:
            db.commit()
            for s in sources:
                db.refresh(s)
        except Exception as commit_err:
            logger.error(f"Error committing auto-recovery: {commit_err}")
            db.rollback()

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
    storage_path = source.storage_path

    # Clean up junction table links
    db.query(BriefSource).filter(BriefSource.source_id == source_id).delete(synchronize_session=False)

    db.delete(source)
    db.commit()

    # Clean up file storage
    if storage_path:
        try:
            file_store.delete_file(storage_path)
        except Exception as err:
            logger.warning(f"Could not delete storage file {storage_path}: {err}")

    log_activity(
        db=db,
        user_id=user.id,
        event_type="document_deleted",
        title="Document removed",
        description=f"{file_name} removed from project",
        project_id=project_id,
    )

    return {"message": "Source deleted successfully"}


@router.post("/{project_id}/sources/{source_id}/reset-version", response_model=SourceResponse)
def reset_source_version(
    project_id: str,
    source_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Move a document back to pending (version = None, extracted/approved) so it can be re-synthesized.
    """
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

    source.version = None
    if source.processing_status == "completed":
        source.processing_status = "extracted"

    db.commit()
    db.refresh(source)
    return SourceResponse.model_validate(source)


@router.post("/{project_id}/versions/{version}/reset", response_model=list[SourceResponse])
def reset_version(
    project_id: str,
    version: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reset all sources in a version back to pending so that Brief Cards can be cleanly re-generated.
    Also deletes any partial cards or briefs for this version.
    """
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sources = db.query(Source).filter(
        Source.project_id == project_id,
        Source.version == version
    ).all()

    for s in sources:
        s.version = None
        if s.processing_status == "completed":
            s.processing_status = "extracted"

    # Clean up cards & briefs for this version safely without FK violations
    try:
        ver_brief_ids = [b[0] for b in db.query(Brief.id).filter(Brief.project_id == project_id, Brief.version == version).all()]
        if ver_brief_ids:
            db.query(BriefSource).filter(BriefSource.brief_id.in_(ver_brief_ids)).delete(synchronize_session=False)
            db.query(Card).filter(Card.brief_id.in_(ver_brief_ids)).delete(synchronize_session=False)
            db.query(Brief).filter(Brief.previous_version_id.in_(ver_brief_ids)).update({"previous_version_id": None}, synchronize_session=False)
            db.query(Brief).filter(Brief.id.in_(ver_brief_ids)).delete(synchronize_session=False)
        db.query(Card).filter(Card.project_id == project_id, Card.version == version).delete(synchronize_session=False)
    except Exception as e:
        logger.warning(f"Error cleaning brief records for version {version}: {e}")

    db.commit()

    all_sources = db.query(Source).filter(Source.project_id == project_id).order_by(Source.upload_timestamp.asc()).all()
    return [SourceResponse.model_validate(s) for s in all_sources]
