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
from agents.brief_prompts import CARD_GENERATION_PROMPT

logger = logging.getLogger(__name__)


class BriefAgent:
    """Processes source material into a First Inferred Brief and candidate Cards."""

    def __init__(self):
        self.llm = LiteLLMGenerator()


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

            clean_text = raw_response.strip()
            if "```json" in clean_text:
                clean_text = clean_text.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_text:
                clean_text = clean_text.split("```")[1].split("```")[0].strip()

            cards = None

            # 1. Direct parse attempt
            try:
                start = clean_text.find("[")
                end = clean_text.rfind("]")
                if start != -1 and end > start:
                    cards = json.loads(clean_text[start:end+1])
                else:
                    cards = json.loads(clean_text)
            except Exception:
                pass

            # 2. If direct parse failed, heal truncated JSON array (e.g. unterminated string or missing closing bracket)
            if not cards:
                try:
                    start = clean_text.find("[")
                    if start != -1:
                        sub = clean_text[start:]
                        # Find the last closing brace '}' of a valid card item
                        last_brace = sub.rfind("}")
                        if last_brace != -1:
                            healed = sub[:last_brace+1] + "]"
                            cards = json.loads(healed)
                except Exception:
                    pass

            # 3. If healing failed, regex-extract all individually completed card JSON objects
            if not cards:
                import re
                candidate_cards = []
                card_pattern = re.compile(r'\{[^{}]*"card_point"[^{}]*\}|\{[^{}]*"title"[^{}]*\}', re.DOTALL)
                for m in card_pattern.finditer(raw_response):
                    try:
                        c = json.loads(m.group(0))
                        if isinstance(c, dict):
                            candidate_cards.append(c)
                    except Exception:
                        continue
                if candidate_cards:
                    cards = candidate_cards

            if isinstance(cards, list) and len(cards) > 0:
                logger.info(f"Generated {len(cards)} cards via LLM.")
                return cards
            elif isinstance(cards, dict) and "cards" in cards and len(cards["cards"]) > 0:
                return cards["cards"]
            else:
                raise ValueError("LLM returned malformed or unparseable card structure.")
        except Exception as e:
            logger.error(f"LLM Card Generation failed: {e}")
            raise RuntimeError(f"Unable to generate Brief Cards from Qwen: {e}")


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
