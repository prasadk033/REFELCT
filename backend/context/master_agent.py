"""
Context Master Agent — Phase 1: Cultural Context.
Orchestrates location resolution, context packaging, Cultural Context Agent execution,
quality evaluation, bounded retries (MAX_ATTEMPTS = 3), and card transformation.
"""
import json
import logging
import re
import uuid
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from db import Project, Source, Card, ProgramItem, ProgramQuestion, SiteAnalysisCache, utc_now
from llm.provider import get_llm_generator, get_deepseek_client
from context.models import ContextRun, ContextCard, ContextSource, ContextCardImage
from context.prompts.context_master import CONTEXT_MASTER_SYSTEM_PROMPT
from context.registry import get_knowledge_set, is_knowledge_set_enabled
from context.agents.cultural_context import CulturalContextAgent

logger = logging.getLogger(__name__)

MAX_RESEARCH_ATTEMPTS = 3


class ContextMasterAgent:
    """
    Context Master Agent (Qwen orchestration + DeepSeek evaluation fallback).
    Enforces Phase 1 scope (Cultural Context only) and hard 3-attempt limit.
    """

    def __init__(self, db: Session, cancel_checker=None):
        self.db = db
        self.cancel_checker = cancel_checker or (lambda: False)

    def _check_cancelled(self):
        if self.cancel_checker():
            raise RuntimeError("Context generation cancelled by user")

    def resolve_location(
        self,
        project: Project,
        sources: List[Source],
        cards: List[Card],
        architect_local_knowledge: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], str]:
        """
        Consolidate project location from Project record, OSM SiteAnalysisCache,
        Brief cards, Sources, and Architect notes. Never assumes project name = location.
        """
        osm_cache = (
            self.db.query(SiteAnalysisCache)
            .filter(SiteAnalysisCache.project_id == project.id)
            .order_by(SiteAnalysisCache.fetched_at.desc())
            .first()
        )

        location_clues = {
            "project_location_field": project.location,
            "site_url": project.site_url,
            "project_description": project.description,
            "osm_coordinates": (
                {"lat": osm_cache.latitude, "lon": osm_cache.longitude}
                if osm_cache
                else None
            ),
            "brief_location_cards": [
                {"title": c.title, "content": c.content[:400]}
                for c in cards[:30]
                if any(k in (c.title + " " + c.content).lower() for k in ("location", "site", "city", "address", "district", "region", "plot"))
            ][:6],
            "architect_local_knowledge": architect_local_knowledge or "",
        }

        # Deterministic baseline in case LLM call fails
        raw_loc = (project.location or "").strip()
        fallback_confidence = "CONFIRMED" if (raw_loc or osm_cache) else "INSUFFICIENT"
        fallback_record = {
            "site_name": project.name,
            "address": raw_loc or None,
            "locality": None,
            "city": raw_loc or None,
            "district_or_region": None,
            "state": None,
            "country": None,
            "coordinates": {"lat": osm_cache.latitude, "lon": osm_cache.longitude} if osm_cache else None,
            "location_description": raw_loc or "Location not explicitly specified in project metadata.",
            "confidence_status": fallback_confidence,
            "supporting_sources": ["Project metadata"] + (["OpenStreetMap SiteAnalysisCache"] if osm_cache else []),
            "unresolved_location_questions": [] if raw_loc else ["Confirm exact city, locality, and site address with the architect."],
        }

        prompt = f"""Resolve the actual project location from the DATA below.
Do NOT assume the project name identifies the site location.
Never fabricate coordinates, addresses, or locality names.
Return ONLY valid JSON:
{{
  "site_name": "string or null",
  "address": "string or null",
  "locality": "string or null",
  "city": "string or null",
  "district_or_region": "string or null",
  "state": "string or null",
  "country": "string or null",
  "coordinates": {{"lat": "...", "lon": "..."}} or null,
  "location_description": "concise summary",
  "confidence_status": "CONFIRMED | PARTIALLY_CONFIRMED | AMBIGUOUS | INSUFFICIENT",
  "supporting_sources": ["list of inputs confirming location"],
  "unresolved_location_questions": ["list of any contradictions or missing details"]
}}

LOCATION CLUES (DATA):
{json.dumps(location_clues, indent=2, default=str)}
"""
        try:
            qwen = get_llm_generator()
            res = qwen.run(f"{CONTEXT_MASTER_SYSTEM_PROMPT}\n\n{prompt}", max_tokens=1200, temperature=0.1)
            raw = (res["replies"][0] or "").strip()
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                conf = parsed.get("confidence_status") or fallback_confidence
                return parsed, conf
        except Exception as exc:
            logger.warning(f"Qwen location resolution fell back to deterministic record: {exc}")

        return fallback_record, fallback_confidence

    def build_project_package(
        self,
        project: Project,
        resolved_location: Dict[str, Any],
        location_confidence: str,
        architect_local_knowledge: Optional[str] = None,
        uploaded_images: Optional[List[Dict[str, Any]]] = None,
        focus_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Consolidate relevant Brief, Program, Sources, and Architect notes for Agent 1."""
        cards = (
            self.db.query(Card)
            .filter(Card.project_id == project.id, Card.status != "rejected")
            .order_by(Card.created_at.desc())
            .limit(40)
            .all()
        )
        program_items = (
            self.db.query(ProgramItem)
            .filter(ProgramItem.project_id == project.id)
            .limit(30)
            .all()
        )
        program_questions = (
            self.db.query(ProgramQuestion)
            .filter(ProgramQuestion.project_id == project.id, ProgramQuestion.status == "ANSWERED")
            .limit(20)
            .all()
        )
        sources = (
            self.db.query(Source)
            .filter(Source.project_id == project.id, Source.extracted_text.isnot(None))
            .limit(10)
            .all()
        )

        return {
            "PROJECT": {
                "project_name": project.name,
                "project_type": project.project_type,
                "project_description": project.description or "",
                "client": project.client or "",
            },
            "LOCATION": {
                "resolved_location": resolved_location,
                "location_confidence": location_confidence,
            },
            "BRIEF_CONTEXT": [
                {"type": c.card_type, "title": c.title, "content": c.content[:500]}
                for c in cards
            ],
            "PROGRAM_CONTEXT": {
                "items": [
                    {"name": p.name, "type": p.type, "requirement": (p.requirement or "")[:300]}
                    for p in program_items
                ],
                "answered_questions": [
                    {"question": q.question, "answer": q.answer}
                    for q in program_questions
                ],
            },
            "ARCHITECT_LOCAL_KNOWLEDGE": {
                "notes": architect_local_knowledge or "",
                "focus_notes": focus_notes or "",
            },
            "UPLOADED_DOCUMENTS": [
                {"file_name": s.file_name, "excerpt": (s.extracted_text or "")[:1200]}
                for s in sources
            ],
            "UPLOADED_IMAGES": uploaded_images or [],
        }

    def evaluate_research(
        self,
        agent_output: Dict[str, Any],
        resolved_location: Dict[str, Any],
        project_type: str,
        architect_local_knowledge: Optional[str] = None,
    ) -> Tuple[str, List[str], str]:
        """
        Evaluate dynamic Cultural Context cards (one idea per card, 8 aspect lenses).
        Returns (decision: ACCEPTED|ACCEPTED_WITH_GAPS|RETRY, issues: list, targeted_feedback: str).
        """
        cards_out = agent_output.get("cards") or []

        issues: List[str] = []
        if not cards_out:
            issues.append("No Cultural Context cards were produced.")

        seen_titles = set()
        for c in cards_out:
            title = (c.get("title") or "").strip()
            content = (c.get("content") or "").strip()
            if not title or not content:
                issues.append("One or more cards have an empty title or content.")
            norm_t = title.lower()
            if norm_t in seen_titles:
                issues.append(f"Duplicate card title detected: '{title}'")
            seen_titles.add(norm_t)

        if issues:
            feedback = "Fix structural defects while preserving valid findings: " + "; ".join(issues)
            return "RETRY", issues, feedback

        # DeepSeek / LLM quality gate for location specificity, project awareness, and register honesty
        eval_prompt = f"""Evaluate this dynamic set of Cultural Context cards against REFLECT Context Master criteria:
1. Relevant to resolved location ({json.dumps(resolved_location)}) and connected to project type ({project_type}).
2. One idea per card (~40-70 words), no duplicate cards, no design prescriptions.
3. Distinguishes DOCUMENTED facts, PATTERN inferences, and UNKNOWNs.
4. Attributes architect local knowledge ("You noted that...") if provided: "{(architect_local_knowledge or '')[:400]}".

Return ONLY valid JSON:
{{
  "decision": "ACCEPTED | ACCEPTED_WITH_GAPS | RETRY",
  "issues": ["specific material defects only if RETRY, else empty"],
  "targeted_feedback": "specific instructions on what to fix if RETRY, else empty string"
}}

CARDS OUTPUT ({len(cards_out)} cards):
{json.dumps(cards_out, indent=2, default=str)[:14000]}
"""
        try:
            ds = get_deepseek_client()
            res = ds.chat(
                messages=[
                    {"role": "system", "content": CONTEXT_MASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": eval_prompt},
                ],
                temperature=0.1,
                max_tokens=1500,
                thinking=False,
                response_format={"type": "json_object"},
            )
            match = re.search(r"\{.*\}", res["content"], re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                decision = parsed.get("decision", "ACCEPTED")
                if decision not in ("ACCEPTED", "ACCEPTED_WITH_GAPS", "RETRY"):
                    decision = "ACCEPTED"
                return decision, parsed.get("issues") or [], parsed.get("targeted_feedback") or ""
        except Exception as exc:
            logger.warning(f"Evaluator check fell back to structural acceptance: {exc}")

        return "ACCEPTED", [], ""

    def run_cultural_context_generation(
        self,
        project_id: str,
        architect_local_knowledge: Optional[str] = None,
        uploaded_images: Optional[List[Dict[str, Any]]] = None,
        focus_notes: Optional[str] = None,
        progress_cb=None,
    ) -> ContextRun:
        """
        Execute Phase 1 Cultural Context generation with hard MAX_RESEARCH_ATTEMPTS = 3.
        """
        if not is_knowledge_set_enabled("cultural_context"):
            raise RuntimeError("Cultural Context knowledge set is disabled.")

        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project {project_id} not found.")

        self._check_cancelled()
        if progress_cb:
            progress_cb("Resolving project location and consolidating context...", 0)

        sources = self.db.query(Source).filter(Source.project_id == project_id).all()
        cards = self.db.query(Card).filter(Card.project_id == project_id).all()
        resolved_location, loc_confidence = self.resolve_location(
            project, sources, cards, architect_local_knowledge
        )

        research_package = self.build_project_package(
            project=project,
            resolved_location=resolved_location,
            location_confidence=loc_confidence,
            architect_local_knowledge=architect_local_knowledge,
            uploaded_images=uploaded_images,
            focus_notes=focus_notes,
        )

        run = ContextRun(
            id=str(uuid.uuid4()),
            project_id=project_id,
            knowledge_set_id="cultural_context",
            status="running",
            resolved_location=resolved_location,
            location_confidence=loc_confidence,
            project_context_summary=research_package.get("PROJECT"),
            attempt_count=0,
            retry_history=[],
        )
        self.db.add(run)
        self.db.commit()

        agent = CulturalContextAgent()
        retry_feedback = ""
        retry_history: List[Dict[str, Any]] = []
        best_output: Optional[Dict[str, Any]] = None
        final_decision = "ACCEPTED"
        final_issues: List[str] = []

        for attempt in range(1, MAX_RESEARCH_ATTEMPTS + 1):
            self._check_cancelled()
            run.attempt_count = attempt
            self.db.commit()

            if progress_cb:
                progress_cb(
                    f"Cultural Context Agent researching (attempt {attempt}/{MAX_RESEARCH_ATTEMPTS})...",
                    attempt,
                )

            output = agent.run_initial_research(research_package, retry_feedback=retry_feedback)
            best_output = output

            self._check_cancelled()
            if progress_cb:
                progress_cb(f"Context Master evaluating research (attempt {attempt})...", attempt)

            decision, issues, feedback = self.evaluate_research(
                output, resolved_location, project.project_type, architect_local_knowledge
            )
            retry_history.append({
                "attempt": attempt,
                "decision": decision,
                "issues": issues,
            })

            final_decision = decision
            final_issues = issues

            if decision in ("ACCEPTED", "ACCEPTED_WITH_GAPS") or attempt == MAX_RESEARCH_ATTEMPTS:
                if attempt == MAX_RESEARCH_ATTEMPTS and decision == "RETRY":
                    final_decision = "ACCEPTED_WITH_GAPS"
                break

            retry_feedback = feedback or "; ".join(issues)

        # Persist accepted Context Cards (soft-superseding prior active cards for cultural_context)
        prior_cards = (
            self.db.query(ContextCard)
            .filter(
                ContextCard.project_id == project_id,
                ContextCard.knowledge_set_id == "cultural_context",
                ContextCard.is_deleted == False,
            )
            .all()
        )
        next_version = max([c.version for c in prior_cards], default=0) + 1
        for pc in prior_cards:
            pc.is_deleted = True

        ks_meta = get_knowledge_set("cultural_context")
        valid_lenses = {l["key"] for l in (ks_meta.get("aspect_lenses") or [])}
        generated_cards = (best_output or {}).get("cards") or []

        seen_titles = set()
        for idx, item in enumerate(generated_cards, start=1):
            title = (item.get("title") or "").strip()
            content = (item.get("content") or "").strip()
            if not title or not content:
                continue
            if title.lower() in seen_titles:
                continue
            seen_titles.add(title.lower())

            aspect_key = (item.get("aspect_key") or "place_identity").strip()
            if aspect_key not in valid_lenses:
                aspect_key = "place_identity"

            card = ContextCard(
                id=str(uuid.uuid4()),
                project_id=project_id,
                run_id=run.id,
                knowledge_set_id="cultural_context",
                knowledge_set_name="Cultural Context",
                sub_aspect_key=aspect_key,
                display_order=idx,
                title=title,
                content=content,
                research_register=item.get("research_register") or "DOCUMENTED",
                confidence=item.get("confidence") or "MEDIUM",
                version=next_version,
                architect_notes=[],
                tags=[item["scale"]] if item.get("scale") else [],
                is_deleted=False,
            )
            self.db.add(card)
            self.db.flush()

            for src in item.get("sources") or []:
                self.db.add(
                    ContextSource(
                        id=str(uuid.uuid4()),
                        card_id=card.id,
                        title=src.get("title") or "Source",
                        author_or_org=src.get("author_or_org"),
                        url=src.get("url"),
                        published_date=src.get("published_date"),
                        source_type=src.get("source_type"),
                        supported_claim=src.get("supported_claim"),
                    )
                )

            for img in item.get("validated_images") or []:
                self.db.add(
                    ContextCardImage(
                        id=str(uuid.uuid4()),
                        card_id=card.id,
                        image_url=img["image_url"],
                        source_page_url=img.get("source_page_url"),
                        source_title=img.get("source_title"),
                        image_caption=img.get("image_caption"),
                        image_type=img.get("image_type") or "architectural_reference",
                        relevance_reason=img.get("relevance_reason"),
                        license=img.get("license") or "unknown",
                        verified=bool(img.get("verified")),
                        is_architect_upload=False,
                    )
                )

        run.status = "completed" if final_decision == "ACCEPTED" else "accepted_with_gaps"
        run.evaluation_result = final_decision
        run.evaluation_issues = final_issues
        run.retry_history = retry_history
        run.limitations = (best_output or {}).get("limitations") or []
        run.local_verification_requirements = (best_output or {}).get("local_verification_requirements") or []
        self.db.commit()
        return run

    def run_card_modification(
        self,
        project_id: str,
        card_id: str,
        instruction: str,
        architect_local_knowledge: Optional[str] = None,
        progress_cb=None,
    ) -> ContextCard:
        """
        MODE B — Targeted single-card modification with max 3 attempts.
        Preserves original card untouched if all attempts fail.
        """
        card = (
            self.db.query(ContextCard)
            .filter(ContextCard.id == card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
            .first()
        )
        if not card:
            raise ValueError("Context card not found.")

        project = self.db.query(Project).filter(Project.id == project_id).first()
        latest_run = (
            self.db.query(ContextRun)
            .filter(ContextRun.project_id == project_id, ContextRun.knowledge_set_id == card.knowledge_set_id)
            .order_by(ContextRun.created_at.desc())
            .first()
        )

        mod_package = {
            "PROJECT": {
                "project_name": project.name if project else "",
                "project_type": project.project_type if project else "",
                "project_description": project.description if project else "",
            },
            "LOCATION": {
                "resolved_location": latest_run.resolved_location if latest_run else {"location": project.location if project else ""},
                "location_confidence": latest_run.location_confidence if latest_run else "PARTIALLY_CONFIRMED",
            },
            "CARD": {
                "id": card.id,
                "knowledge_set": card.knowledge_set_id,
                "title": card.title,
                "existing_content": card.content,
                "existing_sources": [
                    {"title": s.title, "url": s.url, "author_or_org": s.author_or_org}
                    for s in card.sources
                ],
            },
            "ARCHITECT_INSTRUCTION": instruction,
            "ARCHITECT_LOCAL_KNOWLEDGE": architect_local_knowledge or "",
        }

        agent = CulturalContextAgent()
        retry_feedback = ""
        accepted_mod: Optional[Dict[str, Any]] = None

        for attempt in range(1, MAX_RESEARCH_ATTEMPTS + 1):
            self._check_cancelled()
            if progress_cb:
                progress_cb(f"Modifying card '{card.title}' (attempt {attempt}/{MAX_RESEARCH_ATTEMPTS})...", attempt)

            result = agent.run_card_modification(mod_package, retry_feedback=retry_feedback)
            updated_text = (result.get("updated_content") or "").strip()
            if updated_text:
                accepted_mod = result
                break
            retry_feedback = "Returned empty updated_content. Provide complete updated card prose."

        if not accepted_mod:
            raise RuntimeError("Card modification failed after 3 attempts; original card preserved.")

        card.content = accepted_mod["updated_content"].strip()
        card.research_register = accepted_mod.get("research_register") or card.research_register
        card.confidence = accepted_mod.get("confidence") or card.confidence
        card.version = (card.version or 1) + 1

        if accepted_mod.get("updated_sources"):
            self.db.query(ContextSource).filter(ContextSource.card_id == card.id).delete()
            for src in accepted_mod["updated_sources"]:
                self.db.add(
                    ContextSource(
                        id=str(uuid.uuid4()),
                        card_id=card.id,
                        title=src.get("title") or "Source",
                        author_or_org=src.get("author_or_org"),
                        url=src.get("url"),
                        published_date=src.get("published_date"),
                        source_type=src.get("source_type"),
                        supported_claim=src.get("supported_claim"),
                    )
                )

        self.db.commit()
        self.db.refresh(card)
        return card

    def confirm_card_splits(
        self,
        project_id: str,
        parent_card_id: str,
        selected_cards: List[Dict[str, Any]],
        create_mode: str = "separate",
        priority: Optional[str] = None,
        note: Optional[str] = None,
    ) -> List[ContextCard]:
        """
        Manual Split Confirm (Zero AI):
        - create_mode='separate': creates one new card per selected point.
        - create_mode='combined': combines all selected points into ONE new card.
        Preserves the original parent card intact and prevents duplicate titles.
        """
        parent = (
            self.db.query(ContextCard)
            .filter(ContextCard.id == parent_card_id, ContextCard.project_id == project_id, ContextCard.is_deleted == False)
            .first()
        )
        if not parent:
            raise ValueError("Parent context card not found.")

        existing_cards = (
            self.db.query(ContextCard)
            .filter(
                ContextCard.project_id == project_id,
                ContextCard.knowledge_set_id == parent.knowledge_set_id,
                ContextCard.is_deleted == False,
            )
            .all()
        )
        existing_titles = {c.title.strip().lower() for c in existing_cards}
        max_order = max([c.display_order for c in existing_cards], default=0)

        clean_priority = priority.strip().lower() if isinstance(priority, str) and priority.strip().lower() in ("high", "medium", "low") else None
        initial_notes = (
            [{"id": str(uuid.uuid4()), "text": note.strip(), "created_at": utc_now().isoformat()}]
            if note and note.strip()
            else []
        )

        items_to_create = list(selected_cards)
        if create_mode == "combined" and len(items_to_create) > 1:
            combined_content = " ".join((it.get("content") or "").strip() for it in items_to_create if (it.get("content") or "").strip())
            first_title = (items_to_create[0].get("title") or "").strip()
            combined_title = f"{parent.title} — Extracted Selection"
            if combined_title.lower() in existing_titles and first_title:
                combined_title = f"{first_title} (+{len(items_to_create) - 1} points)"
            items_to_create = [{
                "title": combined_title,
                "content": combined_content,
                "aspect_key": parent.sub_aspect_key,
                "research_register": parent.research_register,
                "confidence": parent.confidence,
            }]

        created: List[ContextCard] = []
        for idx, item in enumerate(items_to_create, start=1):
            content = (item.get("content") or "").strip()
            if not content:
                continue
            raw_title = (item.get("title") or "").strip()
            if not raw_title:
                words = content.split()[:7]
                raw_title = " ".join(words).rstrip(".,;:") + ("..." if len(content.split()) > 7 else "")
            title = raw_title
            if title.lower() in existing_titles:
                title = f"{raw_title} ({max_order + idx})"
            existing_titles.add(title.lower())

            new_card = ContextCard(
                id=str(uuid.uuid4()),
                project_id=project_id,
                run_id=parent.run_id,
                knowledge_set_id=parent.knowledge_set_id,
                knowledge_set_name=parent.knowledge_set_name,
                sub_aspect_key=item.get("aspect_key") or parent.sub_aspect_key,
                display_order=max_order + idx,
                title=title,
                content=content,
                research_register=item.get("research_register") or parent.research_register,
                confidence=item.get("confidence") or parent.confidence,
                version=1,
                priority=clean_priority,
                architect_notes=list(initial_notes),
                tags=list(parent.tags or []),
                is_deleted=False,
            )
            self.db.add(new_card)
            self.db.flush()

            sources_to_copy = item.get("sources") or [
                {
                    "title": s.title,
                    "author_or_org": s.author_or_org,
                    "url": s.url,
                    "published_date": s.published_date,
                    "source_type": s.source_type,
                    "supported_claim": s.supported_claim,
                }
                for s in (parent.sources or [])
            ]
            for src in sources_to_copy:
                self.db.add(
                    ContextSource(
                        id=str(uuid.uuid4()),
                        card_id=new_card.id,
                        title=src.get("title") or "Source",
                        author_or_org=src.get("author_or_org"),
                        url=src.get("url"),
                        published_date=src.get("published_date"),
                        source_type=src.get("source_type"),
                        supported_claim=src.get("supported_claim"),
                    )
                )
            created.append(new_card)

        self.db.commit()
        for c in created:
            self.db.refresh(c)
        return created
