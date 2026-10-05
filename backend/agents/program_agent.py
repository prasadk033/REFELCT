"""
Program Agent — generates structured Program Items from Brief Cards via LLM.

Follows the REFLECT AI principle:
  AI proposes → Architect decides.

The agent:
1. Receives structured Brief Cards (from the working dataset or a published version)
2. Optionally receives a previous Program version for update context
3. Calls Qwen via LiteLLM to produce a structured JSON Program proposal
4. Returns validated program_items and ai_questions lists
"""
import json
import logging
import re
from typing import List, Dict, Any, Optional

from llm.provider import LiteLLMGenerator

logger = logging.getLogger(__name__)

# ── System Prompt ─────────────────────────────────────────────────────────────

PROGRAM_SYSTEM_PROMPT = """You are the Program Generation Agent inside REFLECT, an AI-assisted architectural project information system.

Your task is to transform approved project Brief information into a structured architectural Program.

CORE QUESTION:
"What spatial and functional requirements arise from the Brief?"

The Brief contains information established from project documents.
The Program converts that information into:
- Required spaces
- Functions
- Project requirements
- Quantities
- Capacities
- Areas when explicitly provided
- Functional considerations
- Clarification questions where information is incomplete

IMPORTANT PRINCIPLES:
1. Do not invent project facts.
2. Do not invent quantities.
3. Do not invent capacities.
4. Do not invent areas.
5. Do not invent dimensions.
6. Do not invent client requirements.
7. Do not invent design decisions.
8. Do not create floor-plan solutions.
9. Do not assume architectural standards are project requirements.
10. Only derive Program information that is supported by the supplied Brief.
11. If information is incomplete or ambiguous, create an AI Question instead of guessing.
12. Preserve traceability to the Brief Cards that support each Program Item.
13. Distinguish clearly between explicit requirements, reasonable functional interpretation, and missing information.
14. The architect remains the final decision maker.
15. AI suggestions must never automatically become confirmed project requirements.

PROGRAM IS NOT DESIGN.
The Program should describe what the project needs, not how the architect should design it.

PROGRAM ITEM CREATION RULES:
Create a Program Item when the Brief establishes a required space, function, activity, or project requirement.
Do not create duplicate Program Items simply because multiple Brief Cards mention the same requirement.
Consolidate related information where appropriate. However, preserve all relevant Brief Card references.

QUANTITY RULE: Only provide quantity when explicitly stated or unambiguously derivable. Otherwise quantity = null.

CAPACITY RULE: Only provide capacity when explicitly stated or unambiguously derivable. Otherwise capacity = null.

AREA RULE: Only provide area when explicitly stated in the Brief. Never invent a benchmark area.

STATUS RULES:
- Use "CONFIRMED" only when the Brief explicitly and unambiguously states the requirement.
- Use "PROVISIONAL" for reasonable functional interpretations.
- Use "UNDER_REVIEW" for ambiguous or partially specified requirements.
- Use "QUESTION" when there is a missing quantity, capacity, or unclear specification that must be answered.

AI QUESTIONS: Generate questions when quantity is required but unknown, capacity is required but unknown, intended use is ambiguous, duration of occupation is unclear, accessibility needs are unclear, functional relationships are unclear, or important information is missing. Questions must be concise and actionable. Do not answer the question yourself.

SOURCE TRACEABILITY: Every Program Item must contain the IDs of the Brief Cards supporting it.

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown. No explanations outside JSON.

{
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
  ],
  "ai_questions": [
    {
      "question": "string",
      "reason": "string",
      "source_brief_card_ids": ["string"],
      "program_item_reference": "string | null",
      "status": "OPEN"
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


class ProgramAgent:
    """Generates structured Program Items and AI Questions from Brief Cards."""

    def __init__(self):
        self.llm = LiteLLMGenerator()

    def _format_brief_cards(self, cards: List[Dict[str, Any]]) -> str:
        """Format Brief Cards into a readable text for LLM input."""
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
                clean_ev = str(evidence).strip()[:180]
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

    def _parse_llm_response(self, raw_response: str) -> Dict[str, Any]:
        """Parse and validate the LLM JSON response."""
        clean_text = raw_response.strip()

        # Strip markdown code fences
        if "```json" in clean_text:
            clean_text = clean_text.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_text:
            clean_text = clean_text.split("```")[1].split("```")[0].strip()

        # Attempt direct parse
        try:
            start = clean_text.find("{")
            end = clean_text.rfind("}") + 1
            if start != -1 and end > start:
                data = json.loads(clean_text[start:end])
            else:
                data = json.loads(clean_text)
            return data
        except Exception:
            pass

        # Attempt to heal truncated JSON
        try:
            start = clean_text.find("{")
            if start != -1:
                sub = clean_text[start:]
                # Try to close the JSON
                healed = sub + ("}" if sub.count("{") > sub.count("}") else "")
                data = json.loads(healed)
                return data
        except Exception:
            pass

        logger.error(f"Could not parse LLM program response. Raw (first 500 chars): {raw_response[:500]}")
        return {}

    def _validate_program_output(
        self,
        data: Dict[str, Any],
        valid_card_ids: set,
    ) -> tuple:
        """
        Validate and sanitize the AI output.
        Returns (valid_items, valid_questions, errors).
        """
        errors = []
        valid_items = []
        valid_questions = []

        allowed_types = {"SPACE", "REQUIREMENT", "FUNCTION"}
        allowed_statuses = {"CONFIRMED", "PROVISIONAL", "UNDER_REVIEW", "QUESTION"}
        allowed_q_statuses = {"OPEN", "ANSWERED", "DISMISSED"}

        items = data.get("program_items", [])
        if not isinstance(items, list):
            errors.append("program_items must be a list")
            items = []

        for i, item in enumerate(items):
            if not isinstance(item, dict):
                errors.append(f"Item {i} is not a dict")
                continue

            # Required fields
            if not item.get("name"):
                errors.append(f"Item {i} missing 'name'")
                continue

            item_type = (item.get("type") or "SPACE").upper()
            if item_type not in allowed_types:
                item_type = "SPACE"

            status = (item.get("status") or "PROVISIONAL").upper()
            if status not in allowed_statuses:
                status = "PROVISIONAL"

            # Validate quantity is numeric or null
            quantity = item.get("quantity")
            if quantity is not None:
                try:
                    quantity = float(quantity)
                except (ValueError, TypeError):
                    quantity = None

            # Validate area is numeric or null
            area = item.get("area")
            if area is not None:
                try:
                    area = float(area)
                except (ValueError, TypeError):
                    area = None

            # Validate key_considerations is list of strings
            considerations = item.get("key_considerations") or []
            if not isinstance(considerations, list):
                considerations = [str(considerations)] if considerations else []
            considerations = [str(c) for c in considerations if c]

            # Validate source_brief_card_ids — filter to known cards only
            raw_source_ids = item.get("source_brief_card_ids") or []
            if isinstance(raw_source_ids, list):
                source_ids = [str(cid) for cid in raw_source_ids if str(cid) in valid_card_ids]
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
                "source_brief_card_ids": source_ids,
            })

        questions = data.get("ai_questions", [])
        if not isinstance(questions, list):
            questions = []

        for i, q in enumerate(questions):
            if not isinstance(q, dict):
                continue
            if not q.get("question"):
                continue

            q_status = (q.get("status") or "OPEN").upper()
            if q_status not in allowed_q_statuses:
                q_status = "OPEN"

            raw_source_ids = q.get("source_brief_card_ids") or []
            if isinstance(raw_source_ids, list):
                source_ids = [str(cid) for cid in raw_source_ids if str(cid) in valid_card_ids]
            else:
                source_ids = []

            valid_questions.append({
                "question": str(q.get("question", "")).strip(),
                "reason": str(q.get("reason") or "").strip() or None,
                "source_brief_card_ids": source_ids,
                "program_item_reference": str(q.get("program_item_reference") or "").strip() or None,
                "status": q_status,
            })

        return valid_items, valid_questions, errors

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
                "program_items": [...],   # validated items ready for DB insertion
                "ai_questions": [...],    # validated questions ready for DB insertion
                "validation_errors": [...],
                "raw_item_count": int,
                "raw_question_count": int,
            }
        """
        logger.info(f"ProgramAgent: generating program from {len(brief_cards)} brief cards")

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
            result = self.llm.run(prompt=full_prompt, max_tokens=3500)
            raw_response = result["replies"][0]
        except Exception as e:
            logger.error(f"ProgramAgent LLM call failed: {e}")
            raise RuntimeError(f"Program generation failed: LLM request error — {e}") from e

        data = self._parse_llm_response(raw_response)
        if not data:
            raise RuntimeError("Program generation failed: could not parse LLM JSON output.")

        valid_card_ids = {card.get("id", "") for card in brief_cards}

        valid_items, valid_questions, errors = self._validate_program_output(data, valid_card_ids)

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
            f"{len(errors)} validation errors."
        )

        return {
            "program_items": valid_items,
            "ai_questions": valid_questions,
            "validation_errors": errors,
            "raw_item_count": len(data.get("program_items", [])),
            "raw_question_count": len(data.get("ai_questions", [])),
        }
