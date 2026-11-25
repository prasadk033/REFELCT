"""
SQLAlchemy ORM models for the isolated REFLECT Context Knowledge System.
Strictly additive tables: zero alterations to existing Brief/Program/Source tables.
"""
from sqlalchemy import (
    Column, String, Integer, Text, Boolean, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from db import Base, utc_now


class ContextRun(Base):
    """Tracks a single Context Master orchestration run for a Knowledge Set."""
    __tablename__ = "context_runs"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    knowledge_set_id = Column(String, nullable=False, index=True)  # e.g. "cultural_context"
    status = Column(String, nullable=False, default="pending")  # pending, running, completed, accepted_with_gaps, failed, cancelled
    resolved_location = Column(JSON, nullable=True)
    location_confidence = Column(String, nullable=True)  # CONFIRMED, PARTIALLY_CONFIRMED, AMBIGUOUS, INSUFFICIENT
    project_context_summary = Column(JSON, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    evaluation_result = Column(String, nullable=True)  # ACCEPTED, ACCEPTED_WITH_GAPS, REJECTED
    evaluation_issues = Column(JSON, nullable=True)
    retry_history = Column(JSON, nullable=True)
    limitations = Column(JSON, nullable=True)
    research_gaps = Column(JSON, nullable=True)
    local_verification_requirements = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    cards = relationship("ContextCard", back_populates="run", cascade="all, delete-orphan")


class ContextCard(Base):
    """A single Knowledge Set Context Card (e.g., 1 of 7 Cultural Context sub-aspects)."""
    __tablename__ = "context_cards"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id = Column(String, ForeignKey("context_runs.id", ondelete="SET NULL"), nullable=True, index=True)
    knowledge_set_id = Column(String, nullable=False, index=True)
    knowledge_set_name = Column(String, nullable=False)
    sub_aspect_key = Column(String, nullable=False, index=True)  # e.g., the_place_briefly
    display_order = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    research_register = Column(String, nullable=False, default="DOCUMENTED")  # DOCUMENTED, PATTERN, UNKNOWN, MIXED
    confidence = Column(String, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    priority = Column(String, nullable=True, default=None)  # high, medium, low, or None
    architect_notes = Column(JSON, nullable=False, default=list)  # List of {id, text, created_at}
    tags = Column(JSON, nullable=False, default=list)  # List of strings
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    run = relationship("ContextRun", back_populates="cards")
    sources = relationship("ContextSource", back_populates="card", cascade="all, delete-orphan")
    images = relationship("ContextCardImage", back_populates="card", cascade="all, delete-orphan")


class ContextSource(Base):
    """Traceable web/document source attached to a Context Card."""
    __tablename__ = "context_sources"

    id = Column(String, primary_key=True)  # UUID
    card_id = Column(String, ForeignKey("context_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    author_or_org = Column(String, nullable=True)
    url = Column(String, nullable=True)
    published_date = Column(String, nullable=True)
    source_type = Column(String, nullable=True)
    supported_claim = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    card = relationship("ContextCard", back_populates="sources")


class ContextCardImage(Base):
    """Validated web-retrieved or architect-uploaded image attached to a Context Card."""
    __tablename__ = "context_card_images"

    id = Column(String, primary_key=True)  # UUID
    card_id = Column(String, ForeignKey("context_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(String, nullable=False)
    source_page_url = Column(String, nullable=True)
    source_title = Column(String, nullable=True)
    image_caption = Column(Text, nullable=True)
    image_type = Column(String, nullable=True, default="architectural_reference")
    relevance_reason = Column(Text, nullable=True)
    license = Column(String, nullable=True, default="unknown")
    verified = Column(Boolean, nullable=False, default=False)
    is_architect_upload = Column(Boolean, nullable=False, default=False)
    retrieved_at = Column(DateTime, default=utc_now)

    card = relationship("ContextCard", back_populates="images")


class ContextJob(Base):
    """Dedicated background job tracker for Context Knowledge System runs and modifications."""
    __tablename__ = "context_jobs"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    knowledge_set_id = Column(String, nullable=False, default="cultural_context")
    job_kind = Column(String, nullable=False, default="initial_research")  # initial_research, card_modification
    target_card_id = Column(String, nullable=True)
    status = Column(String, nullable=False, default="queued")  # queued, running, completed, failed, cancelled
    current_step = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
