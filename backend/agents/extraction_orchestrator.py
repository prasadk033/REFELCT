"""
Extraction Orchestrator — background worker pipeline for document extraction.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path

from db import SessionLocal, Source, Project, ProcessingJob, log_activity, SiteAnalysisCache
from documents.loader import DocumentLoader
from documents.qwen_vision import AIServiceError
from storage import file_store
from services.osm_site_analysis import osm_service

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

        # --- Phase 0: OSM Virtual Source Generation ---
        if project.location:
            try:
                osm_source = db.query(Source).filter(
                    Source.project_id == project_id,
                    Source.file_type == "virtual/osm",
                    Source.version.is_(None)
                ).first()
                
                if not osm_source:
                    osm_source = Source(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        file_name="🌍 Site Analysis — OpenStreetMap",
                        file_type="virtual/osm",
                        processing_status="processing",
                        uploaded_by=effective_user_id
                    )
                    db.add(osm_source)
                    db.commit()
                else:
                    osm_source.processing_status = "processing"
                    db.commit()

                geo_res = osm_service.geocode_location(project.location)
                if geo_res:
                    lat, lon, addr = geo_res
                    
                    # Check cache first
                    cached_osm = db.query(SiteAnalysisCache).filter(
                        SiteAnalysisCache.project_id == project_id,
                        SiteAnalysisCache.radius == 3000,
                        SiteAnalysisCache.provider == "openstreetmap"
                    ).first()
                    
                    structured_analysis = None
                    if cached_osm:
                        structured_analysis = cached_osm.structured_analysis
                    else:
                        raw_osm = osm_service.query_overpass(lat, lon, radius=3000)
                        if raw_osm.get("elements"):
                            structured_analysis = osm_service.analyze_site_context(raw_osm, lat, lon, radius=3000, address=addr)
                            new_cache = SiteAnalysisCache(
                                id=str(uuid.uuid4()),
                                project_id=project_id,
                                latitude=str(lat),
                                longitude=str(lon),
                                radius=3000,
                                structured_analysis=structured_analysis
                            )
                            db.add(new_cache)
                    
                    if structured_analysis:
                        osm_source.extracted_text = osm_service.format_as_markdown(structured_analysis)
                        osm_source.processing_status = "completed"
                    else:
                        osm_source.extracted_text = "Unable to retrieve site analysis elements from OpenStreetMap."
                        osm_source.processing_status = "failed"
                else:
                    osm_source.extracted_text = f"Unable to geocode location: {project.location}"
                    osm_source.processing_status = "failed"
                    
                db.commit()
            except Exception as e:
                logger.error(f"[{project_id}] OSM Virtual Source failed: {e}")
                if 'osm_source' in locals() and osm_source:
                    osm_source.processing_status = "failed"
                    osm_source.extracted_text = f"Failed to generate OSM site analysis: {e}"
                    db.commit()
        # ---------------------------------------------

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
            _update_job(db, job_id, "completed", "No pending sources to extract", cards_generated=0, questions_count=0)
            return

        # Target only sources that need extraction
        docs_to_extract = [
            s for s in pending_sources
            if not s.extracted_text or not s.extracted_text.strip() or s.processing_status in ("uploaded", "failed")
        ]

        if not docs_to_extract:
            _update_job(db, job_id, "completed", "No pending sources to extract", cards_generated=0, questions_count=0)
            return

        # Prioritize normal text-only documents first (faster), then image-containing documents via Qwen Vision
        text_only_docs = []
        vision_docs = []
        for s in docs_to_extract:
            is_vision = s.file_type == 'image' or bool(s.contains_images)
            if is_vision:
                vision_docs.append(s)
            else:
                text_only_docs.append(s)

        total_count = len(text_only_docs) + len(vision_docs)
        completed_count = 0

        # Initial state: 0 / N Documents Completed
        _update_job(
            db, job_id, "extracting",
            step=f"Starting extraction... 0 / {total_count} Documents Completed",
            cards_generated=0,
            questions_count=total_count,
            document_names=", ".join([s.file_name for s in (text_only_docs + vision_docs)])
        )

        failed_docs = []
        ai_service_issue = False
        from llm.qwen_health import check_qwen_health, AI_UNAVAILABLE_MESSAGE

        # Phase 1: Process text-only documents first (independent of AI service)
        for source in text_only_docs:
            _update_job(
                db, job_id, "extracting",
                step=f"Processing {source.file_name}... ({completed_count} / {total_count} Documents Completed)",
                cards_generated=completed_count,
                questions_count=total_count
            )

            try:
                _extract_source_text_background(source, db, loader, job_id, doc_index=completed_count + 1, total_docs=total_count)
                # Strictly increment completed counter ONLY after successful extraction
                completed_count += 1
                _update_job(
                    db, job_id, "extracting",
                    step=f"{source.file_name} completed ({completed_count} / {total_count} Documents Completed)",
                    cards_generated=completed_count,
                    questions_count=total_count
                )
            except Exception as e:
                failed_docs.append(source.file_name)
                logger.warning(f"Extraction error for text document {source.file_name}: {e}")
                _update_job(
                    db, job_id, "extracting",
                    step=f"{source.file_name} failed: {str(e)} ({completed_count} / {total_count} Documents Completed)",
                    cards_generated=completed_count,
                    questions_count=total_count
                )

        # Phase 2: Process image / vision-containing documents (requires Qwen)
        if vision_docs:
            qwen_health = check_qwen_health()
            if not qwen_health.get("healthy"):
                ai_service_issue = True
                logger.warning(f"Qwen AI service unavailable. Halting vision extraction for {len(vision_docs)} document(s).")
                for source in vision_docs:
                    source.processing_status = "failed"
                    source.processing_error = AI_UNAVAILABLE_MESSAGE
                    failed_docs.append(source.file_name)
                    _update_job(
                        db, job_id, "extracting",
                        step=f"{source.file_name} halted: AI services unavailable ({completed_count} / {total_count} Documents Completed)",
                        cards_generated=completed_count,
                        questions_count=total_count
                    )
            else:
                for idx, source in enumerate(vision_docs):
                    _update_job(
                        db, job_id, "extracting",
                        step=f"Processing {source.file_name} — Vision Extraction... ({completed_count} / {total_count} Documents Completed)",
                        cards_generated=completed_count,
                        questions_count=total_count
                    )

                    try:
                        _extract_source_text_background(source, db, loader, job_id, doc_index=completed_count + 1, total_docs=total_count)
                        # Strictly increment completed counter ONLY after successful extraction
                        completed_count += 1
                        _update_job(
                            db, job_id, "extracting",
                            step=f"{source.file_name} completed ({completed_count} / {total_count} Documents Completed)",
                            cards_generated=completed_count,
                            questions_count=total_count
                        )
                    except AIServiceError as ai_err:
                        ai_service_issue = True
                        failed_docs.append(source.file_name)
                        logger.warning(f"AI Service error for {source.file_name}: {ai_err}. Halting remaining Qwen work.")
                        # STOP QWEN-DEPENDENT WORK: Halt any remaining vision documents immediately
                        remaining = vision_docs[idx + 1:]
                        for rem_source in remaining:
                            rem_source.processing_status = "failed"
                            rem_source.processing_error = AI_UNAVAILABLE_MESSAGE
                            failed_docs.append(rem_source.file_name)
                        break
                    except Exception as e:
                        failed_docs.append(source.file_name)
                        logger.warning(f"Extraction error for {source.file_name}: {e}")
                        err_str = str(e).lower()
                        if any(k in err_str for k in ("timeout", "timed out", "connect", "connection", "litellm", "503", "unreachable", "refused")):
                            ai_service_issue = True
                            # STOP QWEN-DEPENDENT WORK: Halt remaining vision documents
                            remaining = vision_docs[idx + 1:]
                            for rem_source in remaining:
                                rem_source.processing_status = "failed"
                                rem_source.processing_error = AI_UNAVAILABLE_MESSAGE
                                failed_docs.append(rem_source.file_name)
                            break
                        _update_job(
                            db, job_id, "extracting",
                            step=f"{source.file_name} failed: {str(e)} ({completed_count} / {total_count} Documents Completed)",
                            cards_generated=completed_count,
                            questions_count=total_count
                        )

        db.commit()

        if completed_count > 0:
            log_activity(
                db=db,
                user_id=effective_user_id,
                event_type="extraction_completed",
                title="Information extracted",
                description=f"Extracted content from {completed_count} document(s)",
                project_id=project_id,
            )

        elapsed = time.time() - pipeline_start

        if failed_docs and completed_count == 0:
            error_msg = AI_UNAVAILABLE_MESSAGE if ai_service_issue else f"Extraction failed for: {', '.join(failed_docs)}"
            _update_job(
                db, job_id, "failed",
                step=f"Extraction Failed (0 / {total_count} Documents Completed)",
                error=error_msg,
                cards_generated=0,
                questions_count=total_count
            )
        elif failed_docs:
            error_msg = AI_UNAVAILABLE_MESSAGE if ai_service_issue else f"Failed documents: {', '.join(failed_docs)}"
            _update_job(
                db, job_id, "partial",
                step=f"Extraction Incomplete ({completed_count} / {total_count} Documents Completed)",
                error=error_msg,
                cards_generated=completed_count,
                questions_count=total_count
            )
        else:
            _update_job(
                db, job_id, "completed",
                step=f"Extraction Complete ({completed_count} / {total_count} Documents Completed)",
                cards_generated=completed_count,
                questions_count=total_count
            )
        logger.info(f"[{project_id}] ✅ Extraction pipeline finished in {elapsed:.1f}s ({completed_count}/{total_count} succeeded, status={'completed' if not failed_docs else ('partial' if completed_count > 0 else 'failed')})")

    except Exception as e:
        logger.error(f"[{project_id}] Extraction pipeline failed: {e}", exc_info=True)
        db.rollback()
        _update_job(db, job_id, "failed", "Error", str(e))
    finally:
        db.close()


def _extract_source_text_background(
    source: Source,
    db,
    loader: DocumentLoader,
    job_id: str,
    doc_index: int = 1,
    total_docs: int = 1,
) -> str:
    """Extract raw text or image vision analysis strictly based on user contains_images selection."""
    from documents.loader import is_extraction_cancelled
    from rq import get_current_job
    
    abs_path = file_store.get_absolute_path(source.storage_path) if source.storage_path else None
    
    if not abs_path or not Path(abs_path).exists() or is_extraction_cancelled(source_id=source.id, file_path=abs_path):
        logger.info(f"Source {source.id} ({source.file_name}) was cancelled or deleted before extraction started.")
        return ""

    # Page checkpoint callback: persist each page extraction incrementally and update job progress
    def on_page_completed(page_num: int, total_pages: int, current_text: str):
        try:
            source.extracted_text = current_text
            db.commit()
            if job_id:
                if total_docs > 1:
                    step_str = f"Document {doc_index}/{total_docs} ({source.file_name}) — Page {page_num} of {total_pages} ({page_num} / {total_pages} pages processed)"
                else:
                    step_str = f"Processing {source.file_name} — Page {page_num} of {total_pages} ({page_num} / {total_pages} pages processed)"
                _update_job(db, job_id, "extracting", step=step_str)
        except Exception as cb_err:
            logger.warning(f"Error updating page checkpoint for {source.file_name} page {page_num}: {cb_err}")

    try:
        is_image_doc = source.file_type == 'image' or bool(source.contains_images)
        
        text, _ = loader.extract_text_combined(
            abs_path,
            contains_images=is_image_doc,
            filename=source.file_name,
            file_type=source.file_type,
            source_id=source.id,
            on_page_completed=on_page_completed,
            existing_text=source.extracted_text,
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
        from llm.qwen_health import AI_UNAVAILABLE_MESSAGE
        logger.error(f"AI service error during extraction for source {source.id} ({source.file_name}): {ai_err}")
        source.processing_status = "failed"
        source.processing_error = AI_UNAVAILABLE_MESSAGE
        db.commit()
        raise ai_err
    except Exception as e:
        logger.error(f"Extraction failed for source {source.id} ({source.file_name}): {e}")
        source.processing_status = "failed"
        source.processing_error = str(e)
        db.commit()
        raise e


def _update_job(
    db, job_id: str, status: str, step: str, error: str = None, document_names: str = None,
    cards_generated: int = None, questions_count: int = None
):
    """Update a processing job's status and document completion counts."""
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job:
        job.status = status
        job.current_step = step
        job.error = error
        if document_names is not None:
            job.document_names = document_names
        if cards_generated is not None:
            job.cards_generated = cards_generated
        if questions_count is not None:
            job.questions_count = questions_count
        job.updated_at = datetime.now(timezone.utc)
        db.commit()
