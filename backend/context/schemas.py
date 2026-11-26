"""
Pydantic schemas for the REFLECT Context Knowledge System API.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ArchitectImageInput(BaseModel):
    image_url: str
    caption: Optional[str] = None
    file_name: Optional[str] = None


class ContextGenerateRequest(BaseModel):
    architect_local_knowledge: Optional[str] = None
    uploaded_images: List[ArchitectImageInput] = Field(default_factory=list)
    focus_notes: Optional[str] = None


class ContextCardModifyRequest(BaseModel):
    instruction: str = Field(..., min_length=3, max_length=2000)
    architect_local_knowledge: Optional[str] = None


class ContextCardNoteRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)


class ContextSourceOut(BaseModel):
    id: str
    title: str
    author_or_org: Optional[str] = None
    url: Optional[str] = None
    published_date: Optional[str] = None
    source_type: Optional[str] = None
    supported_claim: Optional[str] = None


class ContextImageOut(BaseModel):
    id: str
    image_url: str
    source_page_url: Optional[str] = None
    source_title: Optional[str] = None
    image_caption: Optional[str] = None
    image_type: Optional[str] = None
    relevance_reason: Optional[str] = None
    license: Optional[str] = None
    verified: bool = False
    is_architect_upload: bool = False


class ContextCardOut(BaseModel):
    id: str
    project_id: str
    run_id: Optional[str] = None
    knowledge_set_id: str
    knowledge_set_name: str
    sub_aspect_key: str
    display_order: int
    title: str
    content: str
    research_register: str
    confidence: Optional[str] = None
    version: int
    architect_notes: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    sources: List[ContextSourceOut] = Field(default_factory=list)
    images: List[ContextImageOut] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
