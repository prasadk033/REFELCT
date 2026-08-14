import json
from typing import Dict, Any, List, Optional
from haystack import component
from llm.provider import LiteLLMGenerator
from schemas.models import SpecialistResponse
from agents.prompts import REQUIREMENT_AGENT_PROMPT

@component
class RequirementAgent:
    def __init__(self):
        self.llm = LiteLLMGenerator()

    @component.output_types(response=SpecialistResponse)
    def run(self, document_text: str, session_id: str, retry_instructions: Optional[str] = None):
        agent_name = "requirement_agent"
        
        retry_text = f"Additional Retry Instructions from Virtual Architect:\n{retry_instructions}" if retry_instructions else ""
        prompt = REQUIREMENT_AGENT_PROMPT.format(document_text=document_text, retry_instructions=retry_text)
        
        result = self.llm.run(prompt=prompt)
        text_response = result["replies"][0]
        
        try:
            # Strip markdown if LLM includes it
            if text_response.startswith("```json"):
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif text_response.startswith("```"):
                text_response = text_response.split("```")[1].split("```")[0].strip()
                
            data = json.loads(text_response)
            data["raw_response"] = result["replies"][0]
            resp = SpecialistResponse(**data)
        except Exception as e:
            # Fallback for parsing errors
            resp = SpecialistResponse(
                agent_name=agent_name,
                task="Identify project requirements",
                status="error",
                confidence=0.0,
                completed=False,
                issues=[f"Failed to parse JSON: {e}"],
                raw_response=text_response
            )
            
        return {"response": resp}
