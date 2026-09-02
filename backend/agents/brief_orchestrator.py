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
    Execute the full Brief processing pipeline with multi-document isolation and incremental versioning.

    Versioning Lifecycle:
    - Initial batch of documents -> Version 0 (V0)
    - Next batches -> Version 1 (V1), Version 2 (V2), etc.
    - AI receives full historical context + new documents to detect changes/conflicts,
      but generates cards ONLY for new/changed information (no duplicate V0 cards).
    - Source.version, Brief.version, and Card.version are explicitly assigned upon completion.
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

        # Determine new version number based on previous completed briefs
        latest_brief = (
            db.query(Brief)
            .filter(Brief.project_id == project_id, Brief.status == "completed")
            .order_by(Brief.version.desc())
            .first()
        )
        new_version = 0 if (latest_brief is None or latest_brief.version is None) else (latest_brief.version + 1)
        logger.info(f"[{project_id}] Starting Brief pipeline for Version {new_version}")

        # Fetch all approved project sources
        all_approved_sources = (
            db.query(Source)
            .filter(Source.project_id == project_id)
            .order_by(Source.upload_timestamp.asc())
            .all()
        )

        if not all_approved_sources:
            _update_job(db, job_id, "failed", "Error", "No project documents found")
            return

        # Identify newly added / pending sources for this version cycle
        if source_ids:
            pending_batch = [s for s in all_approved_sources if s.id in source_ids and (s.version is None or s.version == new_version)]
            if not pending_batch:
                pending_batch = [s for s in all_approved_sources if s.id in source_ids]
        else:
            pending_batch = [s for s in all_approved_sources if s.version is None]
            if not pending_batch:
                pending_batch = all_approved_sources

        # Historical sources (from prior completed versions)
        historical_sources = [s for s in all_approved_sources if s.version is not None and s.version < new_version and s not in pending_batch]

        # ── Step 1: Ensure Extraction for Pending Batch ──────────────────────
        _update_job(db, job_id, "parsing", f"Parsing Version {new_version} Documents")
        print(f"\n[REFLECT] 🚀 Starting Brief Synthesis Pipeline | Project: {project.name} (ID: {project_id[:8]}...) | Target: Version {new_version}")
        print(f"[REFLECT] 📂 Batch: {len(pending_batch)} new document(s) | Prior History: {len(historical_sources)} existing document(s)")
        logger.info(f"[{project_id}] Parsing {len(pending_batch)} pending documents for Version {new_version}")

        source_text_map = {}
        all_images = []

        for source in pending_batch:
            if not source.extracted_text or source.processing_status in ("uploaded", "failed", "parsing"):
                abs_path = file_store.get_absolute_path(source.storage_path)
                try:
                    source.processing_status = "parsing"
                    db.commit()

                    text, images = loader.extract_text_combined(abs_path)
                    source.extracted_text = text or f"[{source.file_name} — No readable text found]"
                    source.processing_status = "extracted"
                    db.commit()
                    print(f"[REFLECT] 📄 Extracted text from '{source.file_name}' ({len(source.extracted_text)} chars)")

                    all_images.extend([
                        {**img, "source_id": source.id, "source_name": source.file_name}
                        for img in images
                    ])
                except Exception as e:
                    logger.error(f"[{project_id}] Failed to extract {source.file_name}: {e}")
                    print(f"[REFLECT] ⚠️ Extraction failed for '{source.file_name}': {e}")
                    source.processing_status = "failed"
                    source.processing_error = str(e)
                    db.commit()
                    continue
            else:
                print(f"[REFLECT] 📄 Using approved extracted text for '{source.file_name}' ({len(source.extracted_text)} chars)")

            source_text_map[source.id] = source.extracted_text or ""

        # Also populate source_text_map for historical sources
        for h_src in historical_sources:
            source_text_map[h_src.id] = h_src.extracted_text or ""

        # ── Step 2: TurboOCR for Images in Pending Batch ─────────────────────
        ocr_texts = []
        if all_images and turbo_ocr.is_available:
            _update_job(db, job_id, "extracting_images", "Extracting Image Information")
            print(f"[REFLECT] 🖼️ Running TurboOCR on {len(all_images)} image(s)...")
            for img in all_images:
                result = turbo_ocr.extract_text(
                    image_data=img["data"],
                    filename=img["filename"],
                )
                source_obj = db.query(Source).filter(Source.id == img["source_id"]).first()
                if source_obj and result["success"] and result["text"]:
                    source_obj.ocr_status = "completed"
                    source_obj.ocr_text = (source_obj.ocr_text or "") + "\n" + result["text"]
                    if img["source_id"] in source_text_map:
                        source_text_map[img["source_id"]] += f"\n\n--- OCR Images ---\n{result['text']}"
                    db.commit()
                    print(f"[REFLECT] 🔍 OCR Extracted {len(result['text'])} chars from '{img['filename']}'")

        # ── Step 3: Combine Texts with Context Isolation ─────────────────────
        combined_texts = []
        if historical_sources:
            hist_snippets = [f"[PRIOR APPROVED CONTEXT (Version {s.version}) - {s.file_name}]:\n{source_text_map.get(s.id, '')[:6000]}" for s in historical_sources]
            combined_texts.append("=== EXISTING APPROVED PROJECT CONTEXT ===\n" + "\n\n".join(hist_snippets))

        new_snippets = [f"[NEW BATCH (Version {new_version}) - {s.file_name}]:\n{source_text_map.get(s.id, '')}" for s in pending_batch]
        combined_texts.append(f"=== NEW DOCUMENTS TO ANALYSE (VERSION {new_version}) ===\n" + "\n\n".join(new_snippets))

        full_content = "\n\n".join(combined_texts)

        # ── Step 4: Format Project Context ───────────────────────────────────
        project_context = format_project_context(
            project_name=project.name,
            project_type=project.project_type,
            location=project.location,
            client=project.client,
            description=project.description,
        )

        # ── Step 5: Generate Brief Overview ───────────────────────────────────
        _update_job(db, job_id, "processing_brief", f"Synthesizing Brief Overview (V{new_version})")
        print(f"[REFLECT] 🤖 Qwen LLM: Synthesizing Brief Overview (V{new_version})...")
        logger.info(f"[{project_id}] Generating Brief Overview Synthesis for V{new_version}")

        brief_result = brief_agent.generate_brief(
            source_content=full_content,
            project_context=project_context,
        )

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
            status="generating_cards" if brief_result.get("success") else "failed",
            previous_version_id=latest_brief.id if latest_brief else None,
        )
        db.add(brief)

        # Track contributing sources for this brief version
        for source in (pending_batch + historical_sources):
            bs = BriefSource(
                id=str(uuid.uuid4()),
                brief_id=brief_id,
                source_id=source.id,
            )
            db.add(bs)

        # Assign version to the pending batch sources now that Brief is being recorded
        for source in pending_batch:
            source.version = new_version
            source.approval_status = "approved"
            source.processing_status = "completed"

        db.commit()

        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if job:
            job.brief_id = brief_id
            db.commit()

        if not brief_result.get("success"):
            _update_job(db, job_id, "failed", "Error", f"Brief generation failed: {brief_result.get('error', 'Unknown error')}")
            return

        # ── Step 6: Generate Cards for the New Version ────────────────────────
        _update_job(db, job_id, "generating_cards", f"Generating Version {new_version} Brief Cards")
        print(f"[REFLECT] 🤖 Qwen LLM: Extracting and Classifying Brief Cards for Version {new_version}...")
        logger.info(f"[{project_id}] Generating Cards for pending batch for Brief V{new_version}")

        total_new_cards = 0
        total_questions = 0
        total_conflicts = 0

        VALID_CARD_TYPES = {"FACT", "REQUIREMENT", "QUESTION", "CONFLICT", "OTHER", "ACTION", "CLARIFICATION"}

        # Generate cards for each document in the pending batch
        for source in pending_batch:
            src_text = source_text_map.get(source.id, "")
            if not src_text or len(src_text.strip()) < 25:
                continue

            print(f"[REFLECT] 🧠 Qwen LLM analyzing document: '{source.file_name}'...")

            # Build contextual prompt: If historical context exists, provide it as background only
            hist_context_str = ""
            if historical_sources:
                hist_context_str = (
                    "\n\n[PRIOR APPROVED PROJECT KNOWLEDGE FROM PREVIOUS VERSIONS (FOR REFERENCE ONLY — DO NOT DUPLICATE EXISTING CARDS)]:\n"
                    + "\n".join([f"- {s.file_name}: {source_text_map.get(s.id, '')[:1500]}" for s in historical_sources[:3]])
                )

            single_source_input = (
                f"[SOURCE DOCUMENT: {source.file_name} (Version {new_version})]\n"
                f"[INSTRUCTION: Extract new facts, requirements, questions, conflicts, or other points from this document. Do NOT duplicate existing cards from prior versions.]{hist_context_str}\n\n"
                f"DOCUMENT CONTENT TO ANALYSE:\n{src_text[:22000]}"
            )

            cards_data = brief_agent.generate_cards(
                brief_content=single_source_input,
                project_context=project_context,
            )

            doc_cards_count = 0
            for card_data in cards_data:
                try:
                    card_title = card_data.get("title", "Untitled").strip()
                    card_content = card_data.get("content", "").strip()
                    if not card_title or not card_content:
                        continue

                    # Skip raw garbage echoes
                    title_lower = card_title.lower()
                    content_lower = card_content.lower()
                    filename_lower = source.file_name.lower()

                    skip_patterns = [
                        content_lower.strip() == filename_lower,
                        title_lower == filename_lower,
                        content_lower.startswith("document:"),
                        content_lower.startswith("[source document:"),
                        content_lower.startswith("[instruction:"),
                        content_lower.startswith("[note:"),
                        content_lower.startswith("brief overview context:"),
                        (card_content.strip().startswith("{") and card_content.strip().endswith("}")),
                        (card_content.strip().startswith("[") and card_content.strip().endswith("]")),
                        '"project_metadata"' in card_content,
                        '"key_parameters"' in card_content,
                        len(card_content.strip()) < 15,
                    ]
                    if any(skip_patterns):
                        logger.warning(f"[{project_id}] Skipping garbage card '{card_title}'")
                        continue

                    raw_type = card_data.get("card_type", "REQUIREMENT").upper().strip()
                    card_type = raw_type if raw_type in VALID_CARD_TYPES else "OTHER"
                    card_evidence = card_data.get("evidence") or f"Excerpt from {source.file_name}"
                    card_suggestion = card_data.get("ai_suggestion")

                    card = Card(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        brief_id=brief_id,
                        source_id=source.id,
                        source_document=f"{source.file_name}",
                        card_type=card_type,
                        title=card_title,
                        content=card_content,
                        evidence=card_evidence,
                        ai_suggestion=card_suggestion,
                        section=card_data.get("section") or "Client Requirements",
                        version=new_version,
                        created_by="AI",
                        status="provisional",
                    )
                    db.add(card)
                    total_new_cards += 1
                    doc_cards_count += 1

                    if card_type == "QUESTION":
                        total_questions += 1
                    elif card_type in ("CONFLICT", "TENSION"):
                        total_conflicts += 1

                except Exception as e:
                    logger.warning(f"[{project_id}] Failed to create card: {e}")
                    continue

            print(f"[REFLECT] 📋 Created {doc_cards_count} candidate Brief Cards from '{source.file_name}'")

        # ── Cross-Document Question & Conflict Detection for New Version ─────
        if (len(pending_batch) + len(historical_sources)) > 1:
            try:
                print(f"[REFLECT] 🔍 Qwen LLM: Performing Cross-Document Gap & Conflict Analysis...")
                logger.info(f"[{project_id}] Running cross-document question & conflict detection for V{new_version}...")
                all_src_summary = "\n\n".join([
                    f"DOCUMENT (Version {s.version}): {s.file_name}\n{source_text_map.get(s.id, '')[:3500]}"
                    for s in (pending_batch + historical_sources)
                ])
                cross_prompt = f"""Compare these project source documents for an architectural project.
Identify any:
1. Gaps or missing details requiring clarification (QUESTION)
2. Inconsistencies or contradictions between sources (CONFLICT)
3. Other contextual observations (OTHER)

{all_src_summary}

Output a JSON array of 1-3 cards:
[
  {{
    "title": "...",
    "card_type": "QUESTION",
    "content": "...",
    "source_document": "Cross-Document Analysis",
    "evidence": "...",
    "ai_suggestion": "..."
  }}
]
Return ONLY JSON list.
"""
                res = brief_agent.llm.run(cross_prompt)
                raw_text = res["replies"][0].strip()
                if "```json" in raw_text:
                    raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_text:
                    raw_text = raw_text.split("```")[1].split("```")[0].strip()
                elif "[" in raw_text:
                    raw_text = raw_text[raw_text.find("["):raw_text.rfind("]")+1].strip()
                cross_cards = json.loads(raw_text)
                if isinstance(cross_cards, list):
                    for c_data in cross_cards:
                        raw_c_type = c_data.get("card_type", "QUESTION").upper().strip()
                        c_type = raw_c_type if raw_c_type in VALID_CARD_TYPES else "OTHER"
                        card = Card(
                            id=str(uuid.uuid4()),
                            project_id=project_id,
                            brief_id=brief_id,
                            source_id=pending_batch[0].id if pending_batch else None,
                            source_document=c_data.get("source_document") or "Cross-Document Analysis",
                            card_type=c_type,
                            title=c_data.get("title", "Cross-Document Clarification"),
                            content=c_data.get("content", ""),
                            evidence=c_data.get("evidence", "Cross-document comparison"),
                            ai_suggestion=c_data.get("ai_suggestion"),
                            section="Design Verification",
                            version=new_version,
                            created_by="AI",
                            status="provisional",
                        )
                        db.add(card)
                        total_new_cards += 1
                        if c_type == "QUESTION":
                            total_questions += 1
                        elif c_type in ("CONFLICT", "TENSION"):
                            total_conflicts += 1
                    print(f"[REFLECT] 🔍 Cross-Document Analysis added {len(cross_cards)} conflict/gap cards")
                    db.commit()
            except Exception as e:
                logger.warning(f"Cross document synthesis note: {e}")

        db.commit()

        print(f"[REFLECT] ✅ Version {new_version} Synthesis Complete: {total_new_cards} Total New Cards ({total_questions} Questions, {total_conflicts} Conflicts)")
        logger.info(f"[{project_id}] Created {total_new_cards} cards for Brief V{new_version}")

        # ── Step 7: Complete & Record Activity ─────────────────────────────────
        brief = db.query(Brief).filter(Brief.id == brief_id).first()
        if brief:
            brief.status = "completed"
            
        _update_job(db, job_id, "completed", "Ready for Review")

        project.updated_at = datetime.utcnow()
        db.commit()

        # Log completion activity
        from db import log_activity
        doc_names = ", ".join([s.file_name for s in pending_batch])
        log_activity(
            db=db,
            user_id=effective_user_id,
            event_type="analysis_completed",
            title=f"Version {new_version} Brief Generated",
            description=f"Generated {total_new_cards} Brief Cards for Version {new_version} from {doc_names}",
            project_id=project_id,
        )

        logger.info(f"[{project_id}] Brief pipeline for Version {new_version} completed successfully.")

    except Exception as e:
        logger.error(f"[{project_id}] Brief pipeline failed: {e}", exc_info=True)
        try:
            if 'brief_id' in locals():
                failed_brief = db.query(Brief).filter(Brief.id == brief_id).first()
                if failed_brief and failed_brief.status != "completed":
                    failed_brief.status = "failed"
                db.commit()
        except Exception:
            pass
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

