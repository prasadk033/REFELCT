"""
Extraction Orchestrator — background worker pipeline for document extraction.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path

from db import SessionLocal, Source, Project, ProcessingJob, log_activity
from documents.loader import DocumentLoader
from documents.qwen_vision import AIServiceError
from storage import file_store

logger = logging.getLogger(__name__)


def run_extraction_pipeline(project_id: str, source_ids: List[str], job_id: str, user_id: str = None):
    """
    Execute the document extraction pipeline in the background.
    Handles both standard text extraction and Qwen-VL vision processing.
    """
    import time
    pipeline_start = time.time()
    db = SessionLocal()
    loader = DocumentLoader()

    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            _update_job(db, job_id, "failed", "Error", "Project not found")
            return

        effective_user_id = user_id or project.user_id

        # Target specific sources if provided, otherwise all pending
        if source_ids:
            pending_sources = db.query(Source).filter(
                Source.project_id == project_id,
                Source.id.in_(source_ids)
            ).all()
        else:
            pending_sources = (
                db.query(Source)
                .filter(
                    Source.project_id == project_id,
                    Source.version.is_(None),
                    Source.approval_status != "approved"
                )
                .order_by(Source.upload_timestamp.asc())
                .all()
            )

        if not pending_sources:
            _update_job(db, job_id, "completed", "No pending sources to extract")
            return

        _update_job(db, job_id, "extracting", f"Extracting {len(pending_sources)} documents")

        ai_service_issue = False
        extracted_count = 0
        total_pages_across_docs = sum([s.file_size // 100000 for s in pending_sources]) # very rough estimate
        current_page = 0

        # We pass a hook to the loader to update job metadata? 
        # Alternatively, the loader can just be called directly.
        for source in pending_sources:
            if not source.extracted_text or source.processing_status in ("uploaded", "failed"):
                _update_job(db, job_id, "extracting", f"Extracting {source.file_name}")
                try:
                    _extract_source_text_background(source, db, loader, job_id)
                    extracted_count += 1
                except AIServiceError as ai_err:
                    ai_service_issue = True
                    logger.warning(f"AI Service error for {source.file_name}: {ai_err}")
                except Exception as e:
                    logger.warning(f"Extraction error for {source.file_name}: {e}")

        db.commit()

        if extracted_count > 0:
            log_activity(
                db=db,
                user_id=effective_user_id,
                event_type="extraction_completed",
                title="Information extracted",
                description=f"Extracted content from {extracted_count} pending document(s)",
                project_id=project_id,
            )

        if ai_service_issue and all(s.processing_status == "failed" for s in pending_sources if not s.extracted_text):
            _update_job(db, job_id, "failed", "AI Services Temporarily Low", "It might take some time, AI services are temporarily low.")
            return

        elapsed = time.time() - pipeline_start
        _update_job(
            db, job_id, "completed", "Extraction Complete",
            document_names=", ".join([s.file_name for s in pending_sources])
        )
        logger.info(f"[{project_id}] ✅ Extraction pipeline COMPLETE in {elapsed:.1f}s")

    except Exception as e:
        logger.error(f"[{project_id}] Extraction pipeline failed: {e}", exc_info=True)
        db.rollback()
        _update_job(db, job_id, "failed", "Error", str(e))
    finally:
        db.close()


def _extract_source_text_background(source: Source, db, loader: DocumentLoader, job_id: str) -> str:
    """Extract raw text or image vision analysis strictly based on user contains_images selection."""
    from documents.loader import is_extraction_cancelled
    from rq import get_current_job
    
    abs_path = file_store.get_absolute_path(source.storage_path) if source.storage_path else None
    
    if not abs_path or not Path(abs_path).exists() or is_extraction_cancelled(source_id=source.id, file_path=abs_path):
        logger.info(f"Source {source.id} ({source.file_name}) was cancelled or deleted before extraction started.")
        return ""

    try:
        is_image_doc = source.file_type == 'image' or bool(source.contains_images)
        
        # Optionally hook into loader for page tracking if we want to modify loader.py
        text, _ = loader.extract_text_combined(
            abs_path,
            contains_images=is_image_doc,
            filename=source.file_name,
            file_type=source.file_type,
            source_id=source.id
        )
        source.extracted_text = text or f"[{source.file_name} — No readable text found]"
        source.processing_status = "extracted"
        source.approval_status = "pending_review"
        source.processing_error = None
        db.commit()
        return source.extracted_text
    except RuntimeError as r_err:
        if "cancelled" in str(r_err).lower() or "halted" in str(r_err).lower():
            logger.info(f"Extraction halted gracefully for source {source.id} ({source.file_name}): {r_err}")
            return ""
        raise r_err
    except AIServiceError as ai_err:
        logger.error(f"AI service error during extraction for source {source.id} ({source.file_name}): {ai_err}")
        source.processing_status = "failed"
        source.processing_error = f"Vision extraction failed: {str(ai_err)}"
        db.commit()
        raise ai_err
    except Exception as e:
        logger.error(f"Extraction failed for source {source.id} ({source.file_name}): {e}")
        source.processing_status = "failed"
        source.processing_error = str(e)
        db.commit()
        raise e


def _update_job(
    db, job_id: str, status: str, step: str, error: str = None, document_names: str = None
):
    """Update a processing job's status."""
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job:
        job.status = status
        job.current_step = step
        job.error = error
        if document_names is not None:
            job.document_names = document_names
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
