from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Finding(BaseModel):
    description: str
    source_context: str
    page_number: Optional[int] = None

class Evidence(BaseModel):
    claim: str
    supported: bool
    evidence_text: str

class ChecklistItem(BaseModel):
    requirement: str
    status: str = Field(description="PASS, FAIL, PARTIAL, or NOT_FOUND")
    notes: Optional[str] = None

class SpecialistResponse(BaseModel):
    agent_name: str
    task: str
    status: str = Field(default="completed")
    findings: List[Finding] = Field(default_factory=list)
    evidence: List[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    missing_information: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    completed: bool = True
    issues: List[str] = Field(default_factory=list)
    raw_response: Optional[str] = None

class AgentEvaluation(BaseModel):
    agent_name: str
    satisfied: bool
    reason: str
    retry_instructions: Optional[str] = None

class CoordinatorEvaluationResult(BaseModel):
    evaluations: List[AgentEvaluation]

class DHPCard(BaseModel):
    title: str
    category: str = Field(description="e.g., Client Requirement, Site Context, Constraint, Extraction, Reflective Question")
    content: str
    source_evidence: Optional[str] = Field(description="Direct quote or explicit mention. Use 'Not provided' if missing.")

class FinalReport(BaseModel):
    brief: List[DHPCard] = Field(default_factory=list)
    program: List[DHPCard] = Field(default_factory=list)
    context: List[DHPCard] = Field(default_factory=list)
    focus: List[DHPCard] = Field(default_factory=list)
    problem_frame: List[DHPCard] = Field(default_factory=list)
    design_intent: List[DHPCard] = Field(default_factory=list)
