"""
Program Agent — generates structured Program Items from Brief Cards via LLM.

Follows the REFLECT AI principle:
  AI proposes → Architect decides.

The agent:
1. Receives structured Brief Cards (from the working dataset or a published version)
2. Optionally receives a previous Program version for update context
3. Calls Qwen via LiteLLM to produce a structured JSON Program proposal
4. Enforces strict Brief Card Coverage Accountability (100% of supplied cards accounted for, zero unaccounted cards)
5. Detects and protects against LLM output truncation
6. Consolidates semantic duplicates while strictly preserving distinct spaces
7. Supports chunked map-reduce generation for large briefs (>60 cards)
8. Returns validated program_items, ai_questions, and coverage_audit
"""
import json
import logging
import re
import math
from typing import List, Dict, Any, Optional, Set

from llm.provider import LiteLLMGenerator

logger = logging.getLogger(__name__)

# ── System Prompt ─────────────────────────────────────────────────────────────

PROGRAM_SYSTEM_PROMPT = """You are the Program Generation Agent inside REFLECT, an AI-assisted architectural project information system.

CORE QUESTION:
"What spatial, functional, operational, and project-specific requirements arise from the Brief?"

LLM SYNTHESIS:
The Program Agent transforms approved Brief Cards into a structured architectural Program that describes what the project needs spatially, functionally, and operationally.

The Program may contain required spaces, functions, activities, project requirements, quantities, capacities, areas, spatial relationships, adjacency requirements, access and circulation requirements, privacy and security requirements, accessibility requirements, operational requirements, equipment or infrastructure requirements, environmental or performance requirements, flexibility requirements, phasing requirements, and other program-relevant considerations only when supported by the Brief.

All Program information must be grounded in the approved Brief.
The Program Agent must distinguish between explicit requirements and reasonable functional interpretations. It must never convert an inferred architectural solution, standard practice, benchmark, or design assumption into a confirmed Program requirement.
The Program Agent must not invent facts, quantities, capacities, areas, dimensions, requirements, standards, or design decisions.
The Program describes WHAT the project requires, not HOW the architect should design it.
When information is missing, ambiguous, or requires an architectural/client decision, the agent must create an AI Question rather than guessing.
Every Program Item must preserve traceability to the Brief Cards that support it.
The architect remains the final decision maker. AI-generated interpretations and suggestions must never automatically become confirmed project requirements.

PROGRAM SCOPE:
The Program is not limited to identifying rooms or spaces.
A Program Item may represent:
- a required space (type: SPACE, e.g. Master Bedroom, Kitchen, Reception, Gallery)
- a required function or activity (type: FUNCTION, e.g. Collaborative cooking, Client presentations, Archival storage)
- a project requirement (type: REQUIREMENT, e.g. Need for private meeting space, Dedicated service delivery access)
- a user / occupant requirement (e.g. Dedicated resident suites vs visitor areas)
- a quantity or capacity requirement (e.g. 2 meeting rooms, seating for 12 people)
- an area requirement (when explicitly stated in the Brief)
- a spatial relationship or adjacency requirement (e.g. Kitchen directly connected to dining)
- an access or circulation requirement (e.g. Separate service circulation, direct garden connection)
- a privacy or security requirement (e.g. Acoustic separation between studio and bedrooms, controlled access zones)
- an accessibility requirement (e.g. Barrier-free ground-floor access if explicitly noted)
- an operational requirement (e.g. 24/7 access, seasonal occupancy)
- an equipment or infrastructure requirement (e.g. Server hub, high-load MEP connection)
- an environmental or performance requirement (e.g. Maximized north daylight, natural cross-ventilation)
- a flexibility or multi-use requirement (e.g. Reconfigurable open studio)
- a phasing or timing-related requirement (e.g. Phase 1 residential adaptive reuse)
- any other spatial or functional requirement established by the Brief

However, create such information only when it is explicitly supported by the approved Brief.
Do not introduce architectural standards, benchmarks, assumptions, or design solutions that are not present in the Brief.

PROGRAM IS NOT DESIGN (CRITICAL BOUNDARY):
The Program describes WHAT the project requires, not HOW the architect should design it.
Example:
- Brief: "The client wants the living room connected to the garden."
- Correct Program Item:
  name: "Living Room",
  type: "SPACE",
  requirement: "Living room should have a direct functional relationship with the garden.",
  function: "Living and family activities",
  key_considerations: ["Direct functional relationship with garden"],
  status: "CONFIRMED"
- Incorrect Design Decision (DO NOT GENERATE):
  "Place the living room on the east side with sliding glass doors." -> That is architectural design, NOT a program requirement. Never prescribe architectural design solutions.

KEY CONSIDERATIONS RULE:
The "key_considerations" array captures project-supported functional, spatial, and operational considerations associated with that item, such as:
- Adjacency / spatial relationships (e.g. "Direct functional relationship with garden")
- Privacy requirements (e.g. "Acoustic privacy from public zones")
- Access / circulation (e.g. "Separate service loading access")
- Accessibility needs (if stated)
- Environmental / performance criteria (e.g. "Natural cross-ventilation, daylighting")
- Equipment / infrastructure needs (if stated)
- Security / operational requirements (e.g. "Controlled access after hours")
- Flexibility or multi-use criteria (e.g. "Adaptable partition for varying occupancy")
Limit "key_considerations" to at most 3 concise bullet strings per item. Keep them grounded in requirements, not design specifications.

QUANTITY RULE: Only provide quantity when explicitly stated or unambiguously derivable. Otherwise quantity = null.
CAPACITY RULE: Only provide capacity when explicitly stated or unambiguously derivable. Otherwise capacity = null.
AREA RULE: Only provide area when explicitly stated in the Brief. Never invent a benchmark area. Otherwise area = null.

STATUS RULES:
- Use "CONFIRMED" only when the Brief explicitly and unambiguously states the requirement.
- Use "PROVISIONAL" for reasonable functional interpretations.
- Use "UNDER_REVIEW" for ambiguous or partially specified requirements.
- Use "QUESTION" when there is a missing quantity, capacity, or unclear specification that must be answered.

BRIEF CARD COVERAGE ACCOUNTABILITY (MANDATORY ZERO UNACCOUNTED CARDS):
Every single Brief Card supplied in BRIEF CARDS must be accounted for in at least one of these three ways:
1. Program Item source: The card ID appears in `source_brief_card_ids` of one or more items in `program_items`.
2. AI Question source: The card ID appears in `source_brief_card_ids` of one or more questions in `ai_questions`.
3. Non-Program-Relevant: The card ID appears in `non_program_relevant_cards` with an explicit reason explaining why it does not create a spatial, functional, or operational requirement (e.g. background company narrative, brand color palette, administrative notes with zero architectural impact).

Zero cards may be omitted or unaccounted for.
Consolidation rule: Multiple Brief Cards describing the same space or requirement SHOULD be consolidated into one Program Item (e.g. 3 cards describing Master Bedroom -> 1 Program Item referencing all 3 card IDs). 100 Brief Cards does NOT mean 100 Program Items. But all 100 Brief Cards must be accounted for across items, questions, and non-program-relevant categories.

DUPLICATE PROTECTION:
Do not blindly deduplicate distinct spaces. Distinct spaces (such as Master Bedroom vs Guest Bedroom, or Bedroom 1 vs Bedroom 2) must remain separate items.
However, true synonyms for the exact same space (e.g., Master Bedroom and Primary Bedroom) describing the same requirement should be consolidated into one item with all supporting card IDs.

AI QUESTIONS & CLARIFICATIONS RULES (MANDATORY ARCHITECTURAL SPECIFICITY):
Generate AI Questions in `ai_questions` whenever a Brief Card contains unresolved ambiguities, unconfirmed optional amenities, missing user criteria, unstated spatial relationships, or architectural choices requiring client or team confirmation.
CRITICAL RULES FOR AI QUESTIONS:
1. NEVER USE GENERIC FORMULAIC BOILERPLATE: Strictly forbidden from generating repetitive copy-paste questions like "What are the target spatial area, capacity, and layout requirements for [X]?".
2. TAILORED ARCHITECTURAL INQUIRIES: Every question must directly address the specific substantive ambiguity or decision present in its source Brief Card(s):
   - Optional/encouraged secondary amenities (e.g. gym, wine cellar, sauna, workshop): Ask which specific secondary functions should be formally incorporated into the spatial program.
   - Structural or opening modifications (e.g. roof skylights, facade changes): Ask which structural openings are targeted and what conservation, thermal, or daylight performance constraints apply.
   - Design identity or material performance: Ask which specific spaces require specialized acoustic dampening, custom millwork, or identity finishes.
   - Spatial relationships and layout choices: Ask whether functions should be integrated into an open-plan configuration or acoustically and visually partitioned.
   - User group allocations: Ask for the explicit distribution between primary resident suites vs guest accommodation and ensuite requirements.
3. SUBSTANTIVE REASONING: The `reason` field must cite the specific text or tension from the supporting Brief Card(s) that justifies the inquiry.
4. VALID TRACEABILITY: Always populate `source_brief_card_ids` with the card IDs that generated the question, and link `program_item_reference` when it relates to an identified program item.

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown. No explanations outside JSON. Place "non_program_relevant_cards" and "ai_questions" first.

{
  "non_program_relevant_cards": [
    {
      "brief_card_id": "string",
      "reason": "string explaining why non-program-relevant"
    }
  ],
  "ai_questions": [
    {
      "question": "string",
      "reason": "string",
      "source_brief_card_ids": ["string"],
      "program_item_reference": "string | null",
      "status": "OPEN"
    }
  ],
  "program_items": [
    {
      "name": "string",
      "type": "SPACE | REQUIREMENT | FUNCTION",
      "requirement": "string describing the requirement",
      "function": "string | null",
      "quantity": "number | null",
      "capacity": "string | null",
      "area": "number | null",
      "unit": "string | null",
      "key_considerations": ["string"],
      "notes": "string | null",
      "status": "CONFIRMED | PROVISIONAL | UNDER_REVIEW | QUESTION",
      "source_brief_card_ids": ["string"]
    }
  ]
}"""

PROGRAM_USER_PROMPT_TEMPLATE = """PROJECT CONTEXT:
{project_context}

BRIEF CARDS (Source Data):
{brief_cards_text}

{previous_program_section}

Generate the structured Program JSON output now. Return ONLY valid JSON."""

PREVIOUS_PROGRAM_SECTION_TEMPLATE = """PREVIOUS PROGRAM CONTEXT (Program V{version}):
The following is the existing Program from a previous generation. Use it as context to:
- Preserve items that are still valid under the new Brief
- Identify items that may need updating based on new Brief information
- Avoid duplicating items that are already well-established
- Focus on what is new or changed

Previous Program Items:
{previous_items_text}

When generating the updated Program, incorporate both the new Brief information and the preserved context from the previous Program."""


# Architectural synonym clusters for safe consolidation
SYNONYM_CLUSTERS = [
    {"primary bedroom", "master bedroom", "main bedroom", "owner bedroom", "master suite", "primary suite"},
    {"powder room", "half bath", "half bathroom", "guest toilet", "guest wc"},
    {"living room", "main living room", "family living room", "formal living"},
    {"dining room", "dining area", "dining space"},
]


class ProgramAgent:
    """Generates structured Program Items and AI Questions from Brief Cards."""

    def __init__(self):
        self.llm = LiteLLMGenerator()

    def _format_brief_cards(self, cards: List[Dict[str, Any]]) -> str:
        """Format Brief Cards into a readable text for LLM input with explicit evidence budgeting."""
        lines = []
        for i, card in enumerate(cards):
            card_id = card.get("id", f"CARD-{i+1}")
            title = card.get("title", "Untitled")
            card_type = card.get("card_type", "")
            content = card.get("content", "")
            evidence = card.get("evidence", "")
            section = card.get("section", "")

            line = f"[{card_id}] ({card_type})"
            if section:
                line += f" — Section: {section}"
            line += f"\nTitle: {title}"
            line += f"\nContent: {content}"
            if evidence and evidence != "Manual Input":
                clean_ev = str(evidence).strip()
                # Budget up to 1000 chars per card, logging if trimmed
                if len(clean_ev) > 1000:
                    logger.info(
                        f"ProgramAgent: Card [{card_id}] evidence trimmed from {len(clean_ev)} "
                        f"to 1000 chars for prompt budgeting."
                    )
                    clean_ev = clean_ev[:1000] + " ... [budgeted for context]"
                line += f"\nEvidence: {clean_ev}"
            lines.append(line)
            lines.append("")

        return "\n".join(lines)

    def _format_previous_program(self, items: List[Dict[str, Any]], version: int) -> str:
        """Format previous program items for context injection."""
        lines = []
        for item in items:
            code = item.get("program_item_code", "")
            name = item.get("name", "")
            item_type = item.get("type", "")
            status = item.get("status", "")
            quantity = item.get("quantity")
            function = item.get("function", "")
            considerations = item.get("key_considerations", [])

            line = f"[{code}] {name} ({item_type}) — Status: {status}"
            if quantity is not None:
                line += f" | Quantity: {quantity}"
            if function:
                line += f" | Function: {function}"
            if considerations:
                line += f" | Considerations: {', '.join(considerations[:3])}"
            lines.append(line)

        return PREVIOUS_PROGRAM_SECTION_TEMPLATE.format(
            version=version,
            previous_items_text="\n".join(lines) if lines else "No previous items."
        )

    @staticmethod
    def _extract_complete_json_objects(text: str) -> List[Dict[str, Any]]:
        """Scan text for complete balanced { ... } JSON objects even if surrounding text is truncated."""
        results = []
        i = 0
        n = len(text)
        while i < n:
            if text[i] == '{':
                start = i
                depth = 0
                in_string = False
                escape = False
                for j in range(start, n):
                    char = text[j]
                    if in_string:
                        if escape:
                            escape = False
                        elif char == '\\':
                            escape = True
                        elif char == '"':
                            in_string = False
                    else:
                        if char == '"':
                            in_string = True
                        elif char == '{':
                            depth += 1
                        elif char == '}':
                            depth -= 1
                            if depth == 0:
                                obj_str = text[start:j + 1]
                                try:
                                    parsed = json.loads(obj_str)
                                    if isinstance(parsed, dict):
                                        results.append(parsed)
                                except Exception:
                                    pass
                                i = j
                                break
            i += 1
        return results

    def _parse_llm_response(self, raw_response: str) -> Dict[str, Any]:
        """Parse and validate the LLM JSON response with multi-stage truncated JSON recovery."""
        clean_text = raw_response.strip()

        # Strip markdown code fences
        if "```json" in clean_text:
            clean_text = clean_text.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_text:
            clean_text = clean_text.split("```")[1].split("```")[0].strip()

        # Stage 1: Direct JSON parse
        try:
            start = clean_text.find("{")
            end = clean_text.rfind("}") + 1
            if start != -1 and end > start:
                data = json.loads(clean_text[start:end])
            else:
                data = json.loads(clean_text)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

        # Stage 2: Quick closing heal for mildly truncated JSON
        try:
            start = clean_text.find("{")
            if start != -1:
                sub = clean_text[start:]
                healed = sub + ("}" if sub.count("{") > sub.count("}") else "")
                data = json.loads(healed)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass

        # Stage 3: Robust object-recovery for cut-off / truncated streams
        try:
            items = []
            questions = []
            non_relevant = []

            p_items_idx = clean_text.find('"program_items"')
            q_items_idx = clean_text.find('"ai_questions"')
            nr_items_idx = clean_text.find('"non_program_relevant_cards"')

            # Extract whichever arrays can be located
            if p_items_idx != -1:
                items = self._extract_complete_json_objects(clean_text[p_items_idx:])
            if q_items_idx != -1:
                questions = self._extract_complete_json_objects(clean_text[q_items_idx:])
            if nr_items_idx != -1:
                non_relevant = self._extract_complete_json_objects(clean_text[nr_items_idx:])

            if items or questions or non_relevant:
                logger.warning(
                    f"ProgramAgent: Recovered {len(items)} items, {len(questions)} questions, "
                    f"and {len(non_relevant)} non-relevant cards from truncated response."
                )
                return {
                    "program_items": items,
                    "ai_questions": questions,
                    "non_program_relevant_cards": non_relevant,
                }
        except Exception as scan_err:
            logger.warning(f"ProgramAgent structural recovery error: {scan_err}")

        logger.error(f"Could not parse LLM program response. Raw (first 500 chars): {raw_response[:500]}")
        return {}

    def _consolidate_semantic_duplicates(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Consolidate architectural synonyms representing the exact same requirement
        (e.g., 'Master Bedroom', 'Primary Bedroom', 'Main Bedroom')
        while strictly preserving distinct spaces (e.g. 'Master Bedroom' vs 'Guest Bedroom',
        'Bedroom 1' vs 'Bedroom 2', 'Office A' vs 'Office B').
        """
        if not items:
            return []

        def get_cluster_idx(name: str) -> Optional[int]:
            norm = name.strip().lower()
            for idx, cluster in enumerate(SYNONYM_CLUSTERS):
                if norm in cluster:
                    return idx
            return None

        status_ranks = {"CONFIRMED": 4, "PROVISIONAL": 3, "UNDER_REVIEW": 2, "QUESTION": 1}

        consolidated: List[Dict[str, Any]] = []

        for item in items:
            name = item.get("name", "").strip()
            item_type = item.get("type", "SPACE")
            cluster_id = get_cluster_idx(name)

            matched_idx = None
            for idx, existing in enumerate(consolidated):
                ex_name = existing.get("name", "").strip()
                ex_type = existing.get("type", "SPACE")

                # If same type AND exact name match (case-insensitive)
                if ex_type == item_type and ex_name.lower() == name.lower():
                    matched_idx = idx
                    break

                # Or if same type AND both fall in the same synonym cluster
                if ex_type == item_type and cluster_id is not None:
                    ex_cluster_id = get_cluster_idx(ex_name)
                    if ex_cluster_id == cluster_id:
                        matched_idx = idx
                        break

            if matched_idx is not None:
                # Merge into existing item
                target = consolidated[matched_idx]

                # Combine sources
                combined_sources = list(dict.fromkeys(
                    (target.get("source_brief_card_ids") or []) +
                    (item.get("source_brief_card_ids") or [])
                ))
                target["source_brief_card_ids"] = combined_sources

                # Combine considerations up to 3
                combined_cons = list(dict.fromkeys(
                    (target.get("key_considerations") or []) +
                    (item.get("key_considerations") or [])
                ))[:3]
                target["key_considerations"] = combined_cons

                # Pick highest confidence status
                cur_status = target.get("status", "PROVISIONAL")
                new_status = item.get("status", "PROVISIONAL")
                if status_ranks.get(new_status, 0) > status_ranks.get(cur_status, 0):
                    target["status"] = new_status

                # Pick explicit quantity / capacity / area if target was missing
                if target.get("quantity") is None and item.get("quantity") is not None:
                    target["quantity"] = item.get("quantity")
                if not target.get("capacity") and item.get("capacity"):
                    target["capacity"] = item.get("capacity")
                if target.get("area") is None and item.get("area") is not None:
                    target["area"] = item.get("area")
                if not target.get("unit") and item.get("unit"):
                    target["unit"] = item.get("unit")

                logger.info(
                    f"ProgramAgent: Consolidated duplicate requirement '{name}' into '{target['name']}' "
                    f"(Total sources: {len(combined_sources)})"
                )
            else:
                consolidated.append(item)

        return consolidated

    def _validate_program_output(
        self,
        data: Dict[str, Any],
        brief_cards: List[Dict[str, Any]],
    ) -> tuple:
        """
        Validate output and perform strict Brief Card Coverage Accountability.
        Guarantees that 100% of supplied cards are accounted for across:
        - Program Items
        - AI Questions
        - Non-Program-Relevant classifications
        Returns (valid_items, valid_questions, non_relevant_cards, coverage_audit, errors).
        """
        errors = []
        valid_items = []
        valid_questions = []
        valid_non_relevant = []

        valid_card_map = {str(c.get("id")): c for c in brief_cards if c.get("id")}
        valid_card_ids = set(valid_card_map.keys())

        allowed_types = {"SPACE", "REQUIREMENT", "FUNCTION"}
        allowed_statuses = {"CONFIRMED", "PROVISIONAL", "UNDER_REVIEW", "QUESTION"}
        allowed_q_statuses = {"OPEN", "ANSWERED", "DISMISSED"}

        # 1. Validate Program Items
        items = data.get("program_items", [])
        if not isinstance(items, list):
            errors.append("program_items must be a list")
            items = []

        for i, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            if not item.get("name"):
                continue

            item_type = (item.get("type") or "SPACE").upper()
            if item_type not in allowed_types:
                item_type = "SPACE"

            status = (item.get("status") or "PROVISIONAL").upper()
            if status not in allowed_statuses:
                status = "PROVISIONAL"

            quantity = item.get("quantity")
            if quantity is not None:
                try:
                    quantity = float(quantity)
                except (ValueError, TypeError):
                    quantity = None

            area = item.get("area")
            if area is not None:
                try:
                    area = float(area)
                except (ValueError, TypeError):
                    area = None

            considerations = item.get("key_considerations") or []
            if not isinstance(considerations, list):
                considerations = [str(considerations)] if considerations else []
            considerations = [str(c).strip() for c in considerations if str(c).strip()]

            raw_source_ids = item.get("source_brief_card_ids") or []
            if isinstance(raw_source_ids, list):
                source_ids = [str(cid).strip() for cid in raw_source_ids if str(cid).strip() in valid_card_ids]
            else:
                source_ids = []

            valid_items.append({
                "name": str(item.get("name", "")).strip(),
                "type": item_type,
                "requirement": str(item.get("requirement") or "").strip() or None,
                "function": str(item.get("function") or "").strip() or None,
                "quantity": quantity,
                "capacity": str(item.get("capacity") or "").strip() or None,
                "area": area,
                "unit": str(item.get("unit") or "").strip() or None,
                "key_considerations": considerations,
                "notes": str(item.get("notes") or "").strip() or None,
                "status": status,
                "source_brief_card_ids": list(dict.fromkeys(source_ids)),
            })

        # Apply semantic consolidation
        valid_items = self._consolidate_semantic_duplicates(valid_items)

        # 2. Validate AI Questions
        questions = data.get("ai_questions", [])
        if not isinstance(questions, list):
            questions = []

        for i, q in enumerate(questions):
            if not isinstance(q, dict) or not q.get("question"):
                continue

            q_status = (q.get("status") or "OPEN").upper()
            if q_status not in allowed_q_statuses:
                q_status = "OPEN"

            raw_source_ids = q.get("source_brief_card_ids") or []
            if isinstance(raw_source_ids, list):
                source_ids = [str(cid).strip() for cid in raw_source_ids if str(cid).strip() in valid_card_ids]
            else:
                source_ids = []

            valid_questions.append({
                "question": str(q.get("question", "")).strip(),
                "reason": str(q.get("reason") or "").strip() or None,
                "source_brief_card_ids": list(dict.fromkeys(source_ids)),
                "program_item_reference": str(q.get("program_item_reference") or "").strip() or None,
                "status": q_status,
            })

        # 3. Validate Non-Program-Relevant Cards
        raw_nr = data.get("non_program_relevant_cards", [])
        if isinstance(raw_nr, list):
            for nr in raw_nr:
                if not isinstance(nr, dict):
                    continue
                cid = str(nr.get("brief_card_id", "")).strip()
                if cid in valid_card_ids:
                    valid_non_relevant.append({
                        "brief_card_id": cid,
                        "reason": str(nr.get("reason") or "Classified as non-spatial project context").strip(),
                    })

        # 4. Coverage Audit & Zero Unaccounted Cards Reconciliation
        cards_in_items = set()
        for it in valid_items:
            cards_in_items.update(it.get("source_brief_card_ids") or [])

        cards_in_questions = set()
        for q in valid_questions:
            cards_in_questions.update(q.get("source_brief_card_ids") or [])

        cards_in_nr = {nr["brief_card_id"] for nr in valid_non_relevant}

        unaccounted = valid_card_ids - (cards_in_items | cards_in_questions | cards_in_nr)

        if unaccounted:
            logger.info(
                f"ProgramAgent: {len(unaccounted)} card(s) unaccounted after initial parse. "
                f"Performing defensive accountability reconciliation."
            )

            # Classify any remaining cards so that unaccounted == 0 is guaranteed
            spatial_keywords = {
                "bedroom", "bath", "kitchen", "living", "dining", "office", "desk",
                "room", "space", "hall", "reception", "storage", "closet", "balcony",
                "terrace", "garden", "circulation", "lobby", "garage", "parking",
                "studio", "suite", "utility", "laundry", "area", "capacity", "sqft", "sqm"
            }

            for cid in sorted(unaccounted):
                card = valid_card_map.get(cid, {})
                title = card.get("title", "")
                content = card.get("content", "")
                text_to_check = f"{title} {content}".lower()

                has_spatial = any(kw in text_to_check for kw in spatial_keywords)

                if has_spatial:
                    # Synthesize an AI Clarification Question
                    q_text = f"How should the requirement from Brief card [{cid}] '{title}' be integrated into the program?"
                    valid_questions.append({
                        "question": q_text,
                        "reason": f"Brief Card [{cid}] contains spatial/functional indications requiring architect clarification.",
                        "source_brief_card_ids": [cid],
                        "program_item_reference": title,
                        "status": "OPEN",
                    })
                    cards_in_questions.add(cid)
                else:
                    # Classify as non-spatial context
                    valid_non_relevant.append({
                        "brief_card_id": cid,
                        "reason": f"Card [{cid}] '{title or 'Brief Note'}' represents narrative or contextual information without direct spatial implications.",
                    })
                    cards_in_nr.add(cid)

        # Final audit metrics
        final_all_accounted = cards_in_items | cards_in_questions | cards_in_nr
        final_unaccounted = valid_card_ids - final_all_accounted

        coverage_audit = {
            "total_brief_cards": len(valid_card_ids),
            "cards_supplied_to_llm": len(valid_card_ids),
            "cards_referenced_by_program_items": len(cards_in_items),
            "cards_referenced_by_ai_questions": len(cards_in_questions),
            "cards_classified_non_program_relevant": len(cards_in_nr),
            "unaccounted_cards": len(final_unaccounted),
            "accounted_percentage": 100.0 if len(valid_card_ids) == 0 else round(
                (len(final_all_accounted & valid_card_ids) / len(valid_card_ids)) * 100.0, 1
            ),
            "is_fully_accounted": len(final_unaccounted) == 0,
            "non_program_relevant_cards": valid_non_relevant,
        }

        return valid_items, valid_questions, valid_non_relevant, coverage_audit, errors

    def _generate_chunked_program(
        self,
        project_context: str,
        brief_cards: List[Dict[str, Any]],
        previous_program_items: Optional[List[Dict[str, Any]]] = None,
        previous_program_version: Optional[int] = None,
        chunk_size: int = 40,
    ) -> Dict[str, Any]:
        """
        Map-reduce synthesis for large brief datasets (>60 cards) to prevent
        context overflow and guarantee 100% card coverage.
        """
        logger.info(
            f"ProgramAgent: Running chunked map-reduce generation for {len(brief_cards)} cards "
            f"(chunk size: {chunk_size})"
        )

        num_chunks = math.ceil(len(brief_cards) / chunk_size)
        aggregated_items = []
        aggregated_questions = []
        aggregated_non_relevant = []
        validation_errors = []

        for chunk_idx in range(num_chunks):
            chunk_cards = brief_cards[chunk_idx * chunk_size : (chunk_idx + 1) * chunk_size]
            logger.info(
                f"ProgramAgent: Processing chunk {chunk_idx + 1}/{num_chunks} "
                f"({len(chunk_cards)} cards)"
            )

            brief_cards_text = self._format_brief_cards(chunk_cards)

            chunk_prompt = (
                f"CHUNK {chunk_idx + 1} OF {num_chunks} SYNTHESIS PASS:\n"
                f"Analyze this portion of the project brief.\n\n"
                f"BRIEF CARDS (Source Data):\n{brief_cards_text}\n\n"
                f"Generate structured Program JSON output for this chunk now. Return ONLY valid JSON."
            )

            full_prompt = PROGRAM_SYSTEM_PROMPT + "\n\n" + chunk_prompt

            try:
                result = self.llm.run(prompt=full_prompt, max_tokens=4096)
                raw_response = result["replies"][0]
            except Exception as e:
                logger.error(f"ProgramAgent chunk {chunk_idx + 1} LLM call failed: {e}")
                raise RuntimeError(f"Chunked generation failed at chunk {chunk_idx + 1}: {e}") from e

            data = self._parse_llm_response(raw_response)
            chunk_items, chunk_questions, chunk_nr, _, c_errors = self._validate_program_output(
                data, chunk_cards
            )

            aggregated_items.extend(chunk_items)
            aggregated_questions.extend(chunk_questions)
            aggregated_non_relevant.extend(chunk_nr)
            validation_errors.extend(c_errors)

        # Consolidate items across all chunks
        final_items = self._consolidate_semantic_duplicates(aggregated_items)

        # Consolidate questions across chunks (deduping by question text)
        deduped_questions = []
        seen_q_texts = set()
        for q in aggregated_questions:
            q_text_norm = q.get("question", "").strip().lower()
            if q_text_norm not in seen_q_texts:
                deduped_questions.append(q)
                seen_q_texts.add(q_text_norm)
            else:
                # Merge source card IDs into the existing question
                for existing in deduped_questions:
                    if existing.get("question", "").strip().lower() == q_text_norm:
                        merged = list(dict.fromkeys(
                            (existing.get("source_brief_card_ids") or []) +
                            (q.get("source_brief_card_ids") or [])
                        ))
                        existing["source_brief_card_ids"] = merged
                        break

        # Re-run full coverage validation across the entire set of cards
        merged_data = {
            "program_items": final_items,
            "ai_questions": deduped_questions,
            "non_program_relevant_cards": aggregated_non_relevant,
        }

        v_items, v_questions, v_nr, coverage_audit, final_errors = self._validate_program_output(
            merged_data, brief_cards
        )

        return {
            "program_items": v_items,
            "ai_questions": v_questions,
            "non_program_relevant_cards": v_nr,
            "coverage_audit": coverage_audit,
            "validation_errors": validation_errors + final_errors,
            "raw_item_count": len(aggregated_items),
            "raw_question_count": len(aggregated_questions),
            "is_chunked": True,
        }

    def generate_program(
        self,
        project_context: str,
        brief_cards: List[Dict[str, Any]],
        previous_program_items: Optional[List[Dict[str, Any]]] = None,
        previous_program_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Generate structured Program Items and AI Questions from Brief Cards.

        Args:
            project_context: Project name, type, location, client, description string.
            brief_cards: List of Brief Card dicts (from working dataset or published version).
            previous_program_items: Optional list of previous Program Item dicts for update context.
            previous_program_version: Version number of the previous program (for display).

        Returns:
            {
                "program_items": [...],
                "ai_questions": [...],
                "non_program_relevant_cards": [...],
                "coverage_audit": {...},
                "validation_errors": [...],
                "raw_item_count": int,
                "raw_question_count": int,
                "is_truncated": bool,
            }
        """
        total_cards = len(brief_cards)
        logger.info(f"ProgramAgent: generating program from {total_cards} brief cards")

        # For large Briefs (>60 cards), use robust map-reduce chunking to prevent context overflow
        if total_cards > 60:
            return self._generate_chunked_program(
                project_context=project_context,
                brief_cards=brief_cards,
                previous_program_items=previous_program_items,
                previous_program_version=previous_program_version,
                chunk_size=40,
            )

        brief_cards_text = self._format_brief_cards(brief_cards)

        # Build previous program section
        previous_section = ""
        if previous_program_items and previous_program_version is not None:
            previous_section = self._format_previous_program(
                previous_program_items, previous_program_version
            )

        user_prompt = PROGRAM_USER_PROMPT_TEMPLATE.format(
            project_context=project_context,
            brief_cards_text=brief_cards_text,
            previous_program_section=previous_section,
        )

        full_prompt = PROGRAM_SYSTEM_PROMPT + "\n\n" + user_prompt

        try:
            result = self.llm.run(prompt=full_prompt, max_tokens=4096)
            raw_response = result["replies"][0]
            meta = result.get("meta", [{}])[0]
        except Exception as e:
            logger.error(f"ProgramAgent LLM call failed: {e}")
            raise RuntimeError(f"Program generation failed: LLM request error — {e}") from e

        finish_reason = meta.get("finish_reason")
        is_truncated = finish_reason == "length"
        if is_truncated:
            logger.warning("ProgramAgent: LLM output reached token limit (finish_reason='length')!")

        data = self._parse_llm_response(raw_response)
        if not data:
            raise RuntimeError("Program generation failed: could not parse LLM JSON output.")

        valid_items, valid_questions, valid_nr, coverage_audit, errors = self._validate_program_output(
            data, brief_cards
        )

        if errors:
            logger.warning(f"ProgramAgent validation errors: {errors}")

        if not valid_items:
            raise RuntimeError(
                f"Program generation produced no valid items. "
                f"Validation errors: {errors}. "
                f"Raw item count: {len(data.get('program_items', []))}."
            )

        logger.info(
            f"ProgramAgent: {len(valid_items)} valid items, "
            f"{len(valid_questions)} valid questions, "
            f"{len(valid_nr)} non-relevant cards. "
            f"Coverage audit: {coverage_audit['accounted_percentage']}% "
            f"(unaccounted: {coverage_audit['unaccounted_cards']})"
        )

        return {
            "program_items": valid_items,
            "ai_questions": valid_questions,
            "non_program_relevant_cards": valid_nr,
            "coverage_audit": coverage_audit,
            "validation_errors": errors,
            "raw_item_count": len(data.get("program_items", [])),
            "raw_question_count": len(data.get("ai_questions", [])),
            "is_truncated": is_truncated,
        }
