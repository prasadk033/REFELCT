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
            logger.error(f"LLM Brief Generation failed: {e}")
            raise RuntimeError(f"AI Model Connection Dropped: Unable to generate Brief overview from Qwen ({e}). Please verify server connectivity and retry.")

    def generate_cards(
        self,
        brief_content: str,
        project_context: str,
    ) -> list:
        """
        Generate structured Cards from the Brief content via Qwen LLM.
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
            else:
                raise ValueError("LLM returned empty or invalid card JSON structure.")
        except Exception as e:
            logger.error(f"LLM Card Generation failed: {e}")
            raise RuntimeError(f"AI Model Connection Dropped: Unable to generate Brief Cards from Qwen ({e}). Please verify server connectivity and retry.")


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
