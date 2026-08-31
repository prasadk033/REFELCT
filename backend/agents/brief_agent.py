"""
Brief Agent — dedicated Brief processor.

Receives combined extracted text and project metadata.
Uses the authoritative BRIEF_SYSTEM_PROMPT.
Produces the 8-section First Inferred Brief.
"""
import json
import logging
from typing import Dict, Any, Optional

from llm.provider import LiteLLMGenerator
from agents.brief_prompts import BRIEF_SYSTEM_PROMPT, CARD_GENERATION_PROMPT

logger = logging.getLogger(__name__)


class BriefAgent:
    """Processes source material into a First Inferred Brief."""

    def __init__(self):
        self.llm = LiteLLMGenerator()

    def generate_brief(
        self,
        source_content: str,
        project_context: str,
    ) -> Dict[str, Any]:
        """
        Generate the First Inferred Brief from source content.

        Args:
            source_content: Combined extracted text from all project sources.
            project_context: Formatted project metadata string.

        Returns:
            Dictionary with the 8 brief sections, or error info.
        """
        prompt = BRIEF_SYSTEM_PROMPT.format(
            project_context=project_context,
            source_content=source_content,
        )

        logger.info("Generating First Inferred Brief...")
        result = self.llm.run(prompt=prompt)
        raw_response = result["replies"][0]

        # Parse JSON response
        try:
            text = raw_response
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()

            brief_data = json.loads(text)
            logger.info("Brief generated and parsed successfully.")
            return {
                "success": True,
                "content": brief_data,
                "raw_content": raw_response,
            }
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Failed to parse Brief JSON: {e}")
            # Return raw content even if JSON parsing fails
            return {
                "success": False,
                "content": None,
                "raw_content": raw_response,
                "error": str(e),
            }

    def generate_cards(
        self,
        brief_content: str,
        project_context: str,
    ) -> list:
        """
        Generate structured Cards from the Brief content.

        Args:
            brief_content: The Brief content (JSON string or text).
            project_context: Formatted project metadata string.

        Returns:
            List of card dictionaries.
        """
        prompt = CARD_GENERATION_PROMPT.format(
            project_context=project_context,
            brief_content=brief_content,
        )

        logger.info("Generating Cards from Brief...")
        result = self.llm.run(prompt=prompt)
        raw_response = result["replies"][0]

        try:
            text = raw_response
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()

            cards = json.loads(text)
            if isinstance(cards, list):
                logger.info(f"Generated {len(cards)} cards.")
                return cards
            else:
                logger.warning("Card generation returned non-list JSON.")
                return []
        except (json.JSONDecodeError, Exception) as e:
            logger.error(f"Failed to parse Cards JSON: {e}")
            return []


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
