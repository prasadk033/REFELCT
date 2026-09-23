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


BRIEF_CHUNK_SIZE = 30000
BRIEF_CHUNK_OVERLAP = 1000

class BriefAgent:
    """Processes source material into a First Inferred Brief and candidate Cards."""

    def __init__(self):
        self.llm = LiteLLMGenerator()

    def _deduplicate_cards(self, cards: list) -> list:
        """Deduplicate cards based on their core content (e.g., card_point)."""
        seen = set()
        unique_cards = []
        for card in cards:
            # Safely get a string representation to check for duplicates
            card_key = str(card.get("card_point", card.get("title", str(card)))).strip().lower()
            if card_key not in seen:
                seen.add(card_key)
                unique_cards.append(card)
        return unique_cards

    def _generate_cards_for_chunk(self, prompt: str) -> list:
        """Helper to run the LLM and parse cards for a single chunk."""
        try:
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

            # 2. If direct parse failed, heal truncated JSON array
            if not cards:
                try:
                    start = clean_text.find("[")
                    if start != -1:
                        sub = clean_text[start:]
                        last_brace = sub.rfind("}")
                        if last_brace != -1:
                            healed = sub[:last_brace+1] + "]"
                            cards = json.loads(healed)
                except Exception:
                    pass

            # 3. Regex extraction
            if not cards:
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
                return cards
            elif isinstance(cards, dict) and "cards" in cards and len(cards["cards"]) > 0:
                return cards["cards"]
            else:
                return []
        except Exception as e:
            logger.error(f"LLM Card Generation chunk failed: {e}")
            return []

    def generate_cards(
        self,
        brief_content: str,
        project_context: str,
    ) -> list:
        """
        Generate structured Cards from the Brief content via Qwen LLM using chunking.
        """
        logger.info("Generating Cards from Brief via LLM...")
        
        # If content fits in one chunk, process it normally
        if len(brief_content) <= BRIEF_CHUNK_SIZE:
            prompt = CARD_GENERATION_PROMPT.format(
                project_context=project_context,
                brief_content=brief_content,
            )
            cards = self._generate_cards_for_chunk(prompt)
            if not cards:
                raise RuntimeError("Unable to generate Brief Cards from LLM.")
            logger.info(f"Generated {len(cards)} cards via LLM (single chunk).")
            return self._deduplicate_cards(cards)

        # Content exceeds chunk size -> split into chunks
        chunks = []
        start = 0
        while start < len(brief_content):
            end = min(start + BRIEF_CHUNK_SIZE, len(brief_content))
            chunks.append(brief_content[start:end])
            if end == len(brief_content):
                break
            start += BRIEF_CHUNK_SIZE - BRIEF_CHUNK_OVERLAP

        all_candidate_cards = []
        total_chunks = len(chunks)
        logger.info(f"Brief content exceeds chunk size. Splitting into {total_chunks} chunks.")

        for i, chunk in enumerate(chunks, 1):
            logger.info(f"Processing brief chunk {i}/{total_chunks}")
            chunk_disclaimer = (
                "\n\nIMPORTANT: You are analyzing ONE section (chunk) of a larger project brief. "
                "Extract all relevant information from this section only. "
                "Do not assume this section represents the complete document. "
                "Do not invent missing context."
            )
            prompt = CARD_GENERATION_PROMPT.format(
                project_context=project_context,
                brief_content=chunk + chunk_disclaimer,
            )
            chunk_cards = self._generate_cards_for_chunk(prompt)
            all_candidate_cards.extend(chunk_cards)

        if not all_candidate_cards:
            raise RuntimeError("Unable to generate Brief Cards from LLM across any chunks.")

        # Deduplicate overlapping cards
        final_cards = self._deduplicate_cards(all_candidate_cards)
        logger.info(f"Generated {len(all_candidate_cards)} candidate cards across {total_chunks} chunks. Deduplicated to {len(final_cards)} final cards.")
        
        return final_cards


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
