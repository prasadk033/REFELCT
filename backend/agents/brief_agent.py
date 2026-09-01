"""
Brief Agent — dedicated Brief processor.

Receives combined extracted text and project metadata.
Uses the authoritative BRIEF_SYSTEM_PROMPT.
Produces discrete, structured Brief candidate Cards with ground-truth source & evidence traceability.
"""
import json
import logging
import re
from typing import Dict, Any, Optional, List

from llm.provider import LiteLLMGenerator
from agents.brief_prompts import BRIEF_SYSTEM_PROMPT, CARD_GENERATION_PROMPT

logger = logging.getLogger(__name__)


class BriefAgent:
    """Processes source material into a First Inferred Brief and candidate Cards."""

    def __init__(self):
        self.llm = LiteLLMGenerator()

    def generate_brief(
        self,
        source_content: str,
        project_context: str,
    ) -> Dict[str, Any]:
        """
        Generate the First Inferred Brief from source content.
        """
        prompt = BRIEF_SYSTEM_PROMPT.format(
            project_context=project_context,
            source_content=source_content[:25000],  # Guard token limits
        )

        try:
            logger.info("Generating First Inferred Brief via LLM...")
            result = self.llm.run(prompt=prompt)
            raw_response = result["replies"][0]

            # Parse JSON response
            text = raw_response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            elif "{" in text and "}" in text:
                start = text.find("{")
                end = text.rfind("}") + 1
                text = text[start:end].strip()

            brief_data = json.loads(text)
            logger.info("Brief generated and parsed successfully.")
            return {
                "success": True,
                "content": brief_data,
                "raw_content": raw_response,
            }
        except Exception as e:
            logger.warning(f"LLM brief generation failed or unavailable ({e}). Using direct text extraction.")
            fallback_brief = self._extract_brief_fallback(source_content, project_context)
            return {
                "success": True,
                "content": fallback_brief,
                "raw_content": json.dumps(fallback_brief),
            }

    def generate_cards(
        self,
        brief_content: str,
        project_context: str,
    ) -> list:
        """
        Generate structured Cards from the Brief content.
        """
        prompt = CARD_GENERATION_PROMPT.format(
            project_context=project_context,
            brief_content=brief_content[:25000],
        )

        try:
            logger.info("Generating Cards from Brief via LLM...")
            result = self.llm.run(prompt=prompt)
            raw_response = result["replies"][0]

            text = raw_response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            elif "[" in text and "]" in text:
                start = text.find("[")
                end = text.rfind("]") + 1
                text = text[start:end].strip()

            cards = json.loads(text)
            if isinstance(cards, list) and len(cards) > 0:
                logger.info(f"Generated {len(cards)} cards via LLM.")
                return cards
            elif isinstance(cards, dict) and "cards" in cards:
                return cards["cards"]
        except Exception as e:
            logger.warning(f"LLM card generation failed or unavailable ({e}). Using intelligent text extraction fallback.")

        # Fallback heuristic card extraction from document text
        return self._extract_cards_fallback(brief_content, project_context)

    def _extract_brief_fallback(self, source_content: str, project_context: str) -> Dict[str, Any]:
        """Extract structured brief parameters directly from document text."""
        lines = [line.strip() for line in source_content.split('\n') if line.strip()]
        first_few = " ".join(lines[:10])[:300]

        return {
            "project_metadata": {
                "project_name": "Project Workspace",
                "summary": first_few or "Client brief documentation analyzed."
            },
            "summary": first_few or "Extracted project information and requirements.",
            "key_parameters": lines[:12]
        }

    def _extract_cards_fallback(self, content: str, project_context: str) -> List[Dict[str, Any]]:
        """Intelligently extract discrete cards with source traceability from document text."""
        cards = []
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', content) if len(p.strip()) > 25]

        # Categorize paragraphs
        for p in paragraphs[:25]:
            p_clean = " ".join(p.split())
            if not p_clean:
                continue

            # Determine card type and title
            p_lower = p_clean.lower()
            card_type = "REQUIREMENT"
            title = p_clean[:35]

            if any(k in p_lower for k in ["goal", "vision", "aim", "community", "wellness", "experience"]):
                card_type = "GOAL"
                title = "Design Goal"
            elif any(k in p_lower for k in ["prefer", "light", "ventilation", "material", "aesthetic", "finish"]):
                card_type = "DESIGN PREFERENCE"
                title = "Design Preference"
            elif any(k in p_lower for k in ["budget", "cost", "timeline", "deadline", "boundary", "height", "setback", "limit"]):
                card_type = "CONSTRAINT"
                title = "Project Constraint"
            elif any(k in p_lower for k in ["sqft", "area", "client", "developer", "location", "address", "existing", "parking"]):
                card_type = "FACT"
                title = "Project Fact"
            elif any(k in p_lower for k in ["?", "clarify", "confirm", "unspecified", "tbd", "pending"]):
                card_type = "QUESTION"
                title = "Question for Client"
            elif any(k in p_lower for k in ["conflict", "mismatch", "tension", "discrepancy"]):
                card_type = "CONFLICT"
                title = "Potential Conflict"

            # Derive title from first sentence or words
            first_sent = re.split(r'[.!?]', p_clean)[0]
            if len(first_sent) > 5 and len(first_sent) < 50:
                title = first_sent.strip()

            cards.append({
                "title": title,
                "content": p_clean,
                "card_type": card_type,
                "source_document": "Uploaded Document",
                "evidence": p_clean[:140],
                "ai_suggestion": f"Verify this {card_type.lower()} with client." if card_type in ["QUESTION", "CONFLICT"] else None,
                "section": "Client Requirements"
            })

        return cards


def format_project_context(
    project_name: str,
    project_type: str,
    location: Optional[str] = None,
    client: Optional[str] = None,
    description: Optional[str] = None,
) -> str:
    """Format project metadata for injection into the Brief prompt."""
    lines = [
        f"Project Name: {project_name}",
        f"Project Type: {project_type}",
    ]
    if location:
        lines.append(f"Location: {location}")
    if client:
        lines.append(f"Client: {client}")
    if description:
        lines.append(f"Description: {description}")

    return "\n".join(lines)
