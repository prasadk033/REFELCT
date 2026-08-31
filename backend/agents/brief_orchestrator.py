"""
Brief Orchestrator — end-to-end Brief processing pipeline.

Pipeline:
1. Load all project sources from DB
2. Parse documents (Haystack + python-docx)
3. Extract images and run TurboOCR
4. Combine extracted content
5. Inject project metadata
6. Call Brief agent
7. Call Card generation
8. Store Brief version and Cards in PostgreSQL
9. Update processing status
"""
import uuid
import json
import logging
from datetime import datetime
from typing import List

from db import SessionLocal, Source, Brief, BriefSource, Card, ProcessingJob, Project
from documents.loader import DocumentLoader
from documents.turboocr import turbo_ocr
from agents.brief_agent import BriefAgent, format_project_context
from storage import file_store

logger = logging.getLogger(__name__)


def run_brief_pipeline(project_id: str, source_ids: List[str], job_id: str):
    """
    Execute the full Brief processing pipeline.

    This runs as a background task. All state is persisted to PostgreSQL.
    """
    db = SessionLocal()
    loader = DocumentLoader()
    brief_agent = BriefAgent()

    try:
        # Get project info
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            _update_job(db, job_id, "failed", "Error", "Project not found")
            return

        # Get sources
        sources = db.query(Source).filter(Source.id.in_(source_ids)).all()
        if not sources:
            _update_job(db, job_id, "failed", "Error", "No sources found")
            return

        # ── Step 1: Parse Documents ──────────────────────────────────────────
        _update_job(db, job_id, "parsing", "Parsing Documents")
        logger.info(f"[{project_id}] Parsing {len(sources)} source documents")

        combined_texts = []
        all_images = []

        for source in sources:
            abs_path = file_store.get_absolute_path(source.storage_path)
            try:
                # Update source status
                source.processing_status = "parsing"
                db.commit()

                text, images = loader.extract_text_combined(abs_path)

                # Store extracted text on the source record
                source.extracted_text = text
                source.processing_status = "parsed"
                db.commit()

                if text:
                    combined_texts.append(f"--- Source: {source.file_name} ---\n{text}")

                all_images.extend([
                    {**img, "source_id": source.id, "source_name": source.file_name}
                    for img in images
                ])

                logger.info(f"[{project_id}] Parsed {source.file_name}: {len(text)} chars, {len(images)} images")

            except Exception as e:
                logger.error(f"[{project_id}] Failed to parse {source.file_name}: {e}")
                source.processing_status = "failed"
                source.processing_error = str(e)
                db.commit()
                # Continue with other sources
                continue

        if not combined_texts:
            _update_job(db, job_id, "failed", "Error", "No text could be extracted from any source document")
            return

        # ── Step 2: TurboOCR for Images ──────────────────────────────────────
        ocr_texts = []
        if all_images and turbo_ocr.is_available:
            _update_job(db, job_id, "extracting_images", "Extracting Image Information")
            logger.info(f"[{project_id}] Running TurboOCR on {len(all_images)} images")

            for img in all_images:
                result = turbo_ocr.extract_text(
                    image_data=img["data"],
                    filename=img["filename"],
                )

                # Update source OCR status
                source_obj = db.query(Source).filter(Source.id == img["source_id"]).first()
                if source_obj:
                    if result["success"] and result["text"]:
                        source_obj.ocr_status = "completed"
                        source_obj.ocr_text = (source_obj.ocr_text or "") + "\n" + result["text"]
                        ocr_texts.append(
                            f"--- Image OCR from {img['source_name']} (page {img.get('page', '?')}) ---\n{result['text']}"
                        )
                    else:
                        source_obj.ocr_status = "failed"
                        source_obj.processing_error = result.get("error", "OCR failed")
                        logger.warning(f"[{project_id}] OCR failed for {img['filename']}: {result.get('error')}")
                    db.commit()
        elif all_images:
            logger.info(f"[{project_id}] {len(all_images)} images found but TurboOCR not configured, skipping")
            for source in sources:
                if source.ocr_status is None:
                    source.ocr_status = "skipped"
                    db.commit()

        # ── Step 3: Combine All Extracted Content ────────────────────────────
        full_content = "\n\n".join(combined_texts)
        if ocr_texts:
            full_content += "\n\n--- IMAGE TEXT EXTRACTION ---\n\n" + "\n\n".join(ocr_texts)

        logger.info(f"[{project_id}] Total extracted content: {len(full_content)} chars")

        # ── Step 4: Format Project Context ───────────────────────────────────
        project_context = format_project_context(
            project_name=project.name,
            project_type=project.project_type,
            location=project.location,
            client=project.client,
            description=project.description,
        )

        # ── Step 5: Generate Brief ───────────────────────────────────────────
        _update_job(db, job_id, "processing_brief", "Processing Brief")
        logger.info(f"[{project_id}] Generating Brief")

        brief_result = brief_agent.generate_brief(
            source_content=full_content,
            project_context=project_context,
        )

        # Determine version number
        latest_brief = (
            db.query(Brief)
            .filter(Brief.project_id == project_id)
            .order_by(Brief.version.desc())
            .first()
        )
        new_version = (latest_brief.version + 1) if latest_brief else 1

        # Create Brief record
        brief_id = str(uuid.uuid4())
        brief = Brief(
            id=brief_id,
            project_id=project_id,
            version=new_version,
            content=brief_result.get("content"),
            raw_content=brief_result.get("raw_content"),
            project_metadata={
                "project_name": project.name,
                "project_type": project.project_type,
                "location": project.location,
                "client": project.client,
                "description": project.description,
            },
            status="completed" if brief_result.get("success") else "failed",
            previous_version_id=latest_brief.id if latest_brief else None,
        )
        db.add(brief)

        # Link contributing sources
        for source in sources:
            bs = BriefSource(
                id=str(uuid.uuid4()),
                brief_id=brief_id,
                source_id=source.id,
            )
            db.add(bs)

        db.commit()

        # Update job with brief_id
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job:
            job.brief_id = brief_id
            db.commit()

        if not brief_result.get("success"):
            _update_job(db, job_id, "failed", "Error", f"Brief generation failed: {brief_result.get('error', 'Unknown error')}")
            return

        # ── Step 6: Generate Cards ───────────────────────────────────────────
        _update_job(db, job_id, "generating_cards", "Generating Cards")
        logger.info(f"[{project_id}] Generating Cards from Brief V{new_version}")

        brief_content_str = json.dumps(brief_result["content"]) if brief_result["content"] else brief_result.get("raw_content", "")

        cards_data = brief_agent.generate_cards(
            brief_content=brief_content_str,
            project_context=project_context,
        )

        # Store cards in database
        card_count = 0
        for card_data in cards_data:
            try:
                card = Card(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    brief_id=brief_id,
                    card_type=card_data.get("card_type", "FACT").upper(),
                    title=card_data.get("title", "Untitled"),
                    content=card_data.get("content", ""),
                    evidence=card_data.get("evidence"),
                    section=card_data.get("section"),
                    created_by="AI",
                    status="provisional",
                )
                db.add(card)
                card_count += 1
            except Exception as e:
                logger.warning(f"[{project_id}] Failed to create card: {e}")
                continue

        db.commit()
        logger.info(f"[{project_id}] Created {card_count} cards for Brief V{new_version}")

        # ── Step 7: Complete ─────────────────────────────────────────────────
        _update_job(db, job_id, "completed", "Ready for Review")

        # Update project timestamp
        project.updated_at = datetime.utcnow()
        db.commit()

        logger.info(f"[{project_id}] Brief pipeline completed. Brief V{new_version}, {card_count} cards.")

    except Exception as e:
        logger.error(f"[{project_id}] Brief pipeline failed: {e}", exc_info=True)
        _update_job(db, job_id, "failed", "Error", str(e))

    finally:
        db.close()


def _update_job(db, job_id: str, status: str, step: str, error: str = None):
    """Update a processing job's status."""
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job:
        job.status = status
        job.current_step = step
        job.error = error
        job.updated_at = datetime.utcnow()
        db.commit()
