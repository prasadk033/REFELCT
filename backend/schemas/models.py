from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# ── Existing models (preserved for backward compatibility) ───────────────────

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


# ── New models for Brief Workspace ──────────────────────────────────────────

# --- Auth ---

class GoogleLoginRequest(BaseModel):
    token: str = Field(..., description="Google ID token from frontend sign-in")

class DevLoginRequest(BaseModel):
    email: str = Field(default="dev@reflect.local")
    name: str = Field(default="Developer")

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None

    class Config:
        from_attributes = True


# --- Projects ---

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    project_type: str = Field(..., min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    client: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    project_type: Optional[str] = Field(None, min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    client: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    name: str
    project_type: str
    location: Optional[str] = None
    client: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    source_count: int = 0
    brief_version: Optional[int] = None
    card_count: int = 0

    class Config:
        from_attributes = True


# --- Sources ---

class SourceResponse(BaseModel):
    id: str
    project_id: str
    file_name: str
    file_type: str
    file_size: Optional[int] = None
    upload_timestamp: datetime
    processing_status: str
    ocr_status: Optional[str] = None
    processing_error: Optional[str] = None

    class Config:
        from_attributes = True


# --- Briefs ---

class BriefResponse(BaseModel):
    id: str
    project_id: str
    version: int
    content: Optional[Dict[str, Any]] = None
    raw_content: Optional[str] = None
    project_metadata: Optional[Dict[str, Any]] = None
    status: str
    created_at: datetime
    source_ids: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True

class BriefVersionResponse(BaseModel):
    id: str
    version: int
    status: str
    created_at: datetime
    source_ids: List[str] = Field(default_factory=list)
    source_names: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True

class BriefSummary(BaseModel):
    """Dashboard summary of a brief."""
    total_cards: int = 0
    ai_questions: int = 0
    conflicts: int = 0
    facts: int = 0
    requirements: int = 0
    actions: int = 0


# --- Cards ---

class CardCreate(BaseModel):
    card_type: str = Field(..., description="FACT, REQUIREMENT, QUESTION, CONFLICT, ACTION, CLARIFICATION")
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    evidence: Optional[str] = None
    section: Optional[str] = None

class CardUpdate(BaseModel):
    card_type: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    evidence: Optional[str] = None
    section: Optional[str] = None

class CardResponse(BaseModel):
    id: str
    project_id: str
    brief_id: Optional[str] = None
    source_id: Optional[str] = None
    card_type: str
    title: str
    content: str
    evidence: Optional[str] = None
    section: Optional[str] = None
    created_by: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Processing ---

class ProcessingStatusResponse(BaseModel):
    id: str
    project_id: str
    brief_id: Optional[str] = None
    status: str
    current_step: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AnalyzeBriefRequest(BaseModel):
    """Optional: specify which source IDs to include. If empty, uses all project sources."""
    source_ids: Optional[List[str]] = None
