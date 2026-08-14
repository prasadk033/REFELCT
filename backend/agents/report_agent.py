import json
from typing import Dict, Any, List
from haystack import component
from llm.provider import LiteLLMGenerator
from schemas.models import FinalReport
from agents.prompts import REPORT_AGENT_PROMPT

@component
class ReportAgent:
    def __init__(self):
        self.llm = LiteLLMGenerator()

    @component.output_types(report=FinalReport)
    def run(self, document_text: str, specialist_responses: Dict[str, Any]):
        prompt = REPORT_AGENT_PROMPT.format(responses_json=json.dumps(specialist_responses, default=lambda o: o.__dict__ if hasattr(o, '__dict__') else str(o)))
        
        result = self.llm.run(prompt=prompt)
        text_response = result["replies"][0]
        
        try:
            if text_response.startswith("```json"):
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif text_response.startswith("```"):
                text_response = text_response.split("```")[1].split("```")[0].strip()
                
            data = json.loads(text_response)
            report = FinalReport(**data)
        except Exception as e:
            # Fallback
            report = FinalReport(
                executive_summary=f"Parsing error: {e}",
                project_overview="Error parsing the final report from the LLM."
            )
            
        return {"report": report}
