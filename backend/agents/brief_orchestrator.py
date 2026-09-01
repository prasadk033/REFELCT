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


def run_brief_pipeline(project_id: str, source_ids: List[str], job_id: str, user_id: str = None):
    """
    Execute the full Brief processing pipeline with multi-document isolation.

    This runs as a background task. All state is persisted to PostgreSQL/SQLite.
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

        effective_user_id = user_id or project.user_id

        # Get sources
        sources = db.query(Source).filter(Source.id.in_(source_ids)).all()
        if not sources:
            _update_job(db, job_id, "failed", "Error", "No sources found")
            return

        # ── Step 1: Parse Documents ──────────────────────────────────────────
        _update_job(db, job_id, "parsing", "Parsing Documents")
        logger.info(f"[{project_id}] Parsing {len(sources)} source documents")

        combined_texts = []
        source_text_map = {}
        all_images = []

        for source in sources:
            abs_path = file_store.get_absolute_path(source.storage_path)
            try:
                source.processing_status = "parsing"
                db.commit()

                text, images = loader.extract_text_combined(abs_path)

                source.extracted_text = text
                source.processing_status = "parsed"
                db.commit()

                if text:
                    source_text_map[source.id] = text
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

                source_obj = db.query(Source).filter(Source.id == img["source_id"]).first()
                if source_obj:
                    if result["success"] and result["text"]:
                        source_obj.ocr_status = "completed"
                        source_obj.ocr_text = (source_obj.ocr_text or "") + "\n" + result["text"]
                        ocr_texts.append(
                            f"--- Image OCR from {img['source_name']} (page {img.get('page', '?')}) ---\n{result['text']}"
                        )
                        if img["source_id"] in source_text_map:
                            source_text_map[img["source_id"]] += f"\n\n--- OCR Images ---\n{result['text']}"
                    else:
                        source_obj.ocr_status = "failed"
                        source_obj.processing_error = result.get("error", "OCR failed")
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

        # ── Step 4: Format Project Context ───────────────────────────────────
        project_context = format_project_context(
            project_name=project.name,
            project_type=project.project_type,
            location=project.location,
            client=project.client,
            description=project.description,
        )

        # ── Step 5: Generate Brief Overview ───────────────────────────────────
        _update_job(db, job_id, "processing_brief", "Synthesizing Brief Overview")
        logger.info(f"[{project_id}] Generating Brief Synthesis")

        brief_result = brief_agent.generate_brief(
            source_content=full_content,
            project_context=project_context,
        )

        latest_brief = (
            db.query(Brief)
            .filter(Brief.project_id == project_id)
            .order_by(Brief.version.desc())
            .first()
        )
        new_version = (latest_brief.version + 1) if latest_brief else 1

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

        for source in sources:
            bs = BriefSource(
                id=str(uuid.uuid4()),
                brief_id=brief_id,
                source_id=source.id,
            )
            db.add(bs)

        db.commit()

        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job:
            job.brief_id = brief_id
            db.commit()

        if not brief_result.get("success"):
            _update_job(db, job_id, "failed", "Error", f"Brief generation failed: {brief_result.get('error', 'Unknown error')}")
            return

        # ── Step 6: Generate Cards (Document-Wise Deduplication) ───────────────
        _update_job(db, job_id, "generating_cards", "Generating Document Brief Cards")
        logger.info(f"[{project_id}] Generating Cards per source document for Brief V{new_version}")

        # Deduplication: Remove any previous provisional AI cards for the specific sources being analyzed
        # to ensure re-analyzing a document updates its cards without creating duplicate cards or wiping out other documents!
        for source in sources:
            deleted_count = db.query(Card).filter(
                Card.project_id == project_id,
                (Card.source_id == source.id) | (Card.source_document == source.file_name),
                Card.status == "provisional"
            ).delete(synchronize_session=False)
            if deleted_count:
                logger.info(f"[{project_id}] Replaced {deleted_count} previous provisional cards for source {source.file_name}")

        db.commit()

        total_new_cards = 0
        total_questions = 0
        total_conflicts = 0

        # Generate cards for each source individually to ensure 100% strict document attribution
        for source in sources:
            src_text = source_text_map.get(source.id, "")
            if not src_text:
                continue

            single_source_input = (
                f"DOCUMENT: {source.file_name}\n\n"
                f"DOCUMENT CONTENT:\n{src_text}\n\n"
                f"BRIEF OVERVIEW CONTEXT:\n{json.dumps(brief_result.get('content', {}), indent=2)}"
            )

            cards_data = brief_agent.generate_cards(
                brief_content=single_source_input,
                project_context=project_context,
            )

            for card_data in cards_data:
                try:
                    card_title = card_data.get("title", "Untitled").strip()
                    card_content = card_data.get("content", "").strip()
                    if not card_title or not card_content:
                        continue

                    card_type = card_data.get("card_type", "REQUIREMENT").upper()
                    card_evidence = card_data.get("evidence") or "Not clear / Not provided"
                    card_suggestion = card_data.get("ai_suggestion")

                    card = Card(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        brief_id=brief_id,
                        source_id=source.id,
                        source_document=source.file_name,
                        card_type=card_type,
                        title=card_title,
                        content=card_content,
                        evidence=card_evidence,
                        ai_suggestion=card_suggestion,
                        section=card_data.get("section"),
                        created_by="AI",
                        status="provisional",
                    )
                    db.add(card)
                    total_new_cards += 1

                    if card_type == "QUESTION":
                        total_questions += 1
                    elif card_type in ("CONFLICT", "TENSION"):
                        total_conflicts += 1

                except Exception as e:
                    logger.warning(f"[{project_id}] Failed to create card: {e}")
                    continue

            # Update source processing status
            source.processing_status = "completed"
            db.commit()

        db.commit()
        logger.info(f"[{project_id}] Created {total_new_cards} cards ({total_questions} Qs, {total_conflicts} Conflicts) for Brief V{new_version}")

        # ── Step 7: Complete & Record Activity ─────────────────────────────────
        _update_job(db, job_id, "completed", "Ready for Review")

        project.updated_at = datetime.utcnow()
        db.commit()

        # Log completion activity
        from db import log_activity
        doc_names = ", ".join([s.file_name for s in sources])
        log_activity(
            db=db,
            user_id=effective_user_id,
            event_type="analysis_completed",
            title="AI analysis completed",
            description=f"Generated {total_new_cards} Brief Cards ({total_questions} Questions, {total_conflicts} Conflicts) from {doc_names}",
            project_id=project_id,
        )

        logger.info(f"[{project_id}] Brief pipeline completed successfully.")

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

