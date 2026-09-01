from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# ── Reflect Brief Application Models ───────────────────────────────────────

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
    card_type: str = Field(default="REQUIREMENT", description="FACT, REQUIREMENT, CONSTRAINT, OBJECTIVE, QUESTION, CONFLICT, ACTION, CLARIFICATION")
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1, description="Brief information")
    source_document: Optional[str] = None
    evidence: Optional[str] = None
    ai_suggestion: Optional[str] = None
    section: Optional[str] = None

class CardUpdate(BaseModel):
    card_type: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    source_document: Optional[str] = None
    evidence: Optional[str] = None
    ai_suggestion: Optional[str] = None
    section: Optional[str] = None
    status: Optional[str] = None

class CardResponse(BaseModel):
    id: str
    project_id: str
    brief_id: Optional[str] = None
    source_id: Optional[str] = None
    source_document: Optional[str] = None
    card_type: str
    title: str
    content: str
    evidence: Optional[str] = None
    ai_suggestion: Optional[str] = None
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


# --- Activities ---

class ActivityLogResponse(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    event_type: str
    title: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

