"""
PostgreSQL application database — SQLAlchemy ORM models and session management.

This is the Reflect application database (separate from LiteLLM's database).
Contains: users, projects, sources, briefs, cards, processing_jobs.
"""
import logging
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, String, Integer, Float, Text, Boolean,
    DateTime, ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from config import config

logger = logging.getLogger(__name__)

Base = declarative_base()

# ── Engine & Session ────────────────────────────────────────────────────────

def _create_db_engine():
    try:
        eng = create_engine(
            config.APP_DATABASE_URL,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            echo=False,
        )
        # Test connection
        with eng.connect() as conn:
            pass
        logger.info(f"Connected to primary database: {config.APP_DATABASE_URL.split('@')[-1]}")
        return eng
    except Exception as e:
        logger.warning(f"Primary database connection failed ({e}). Falling back to SQLite database.")
        sqlite_url = "sqlite:///./reflect_app.db"
        return create_engine(sqlite_url, connect_args={"check_same_thread": False})

engine = _create_db_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── ORM Models ──────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)  # UUID
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    google_sub = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)  # UUID
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    project_type = Column(String, nullable=False)
    location = Column(String, nullable=True)
    client = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    sources = relationship("Source", back_populates="project", cascade="all, delete-orphan")
    briefs = relationship("Brief", back_populates="project", cascade="all, delete-orphan")
    cards = relationship("Card", back_populates="project", cascade="all, delete-orphan")
    processing_jobs = relationship("ProcessingJob", back_populates="project", cascade="all, delete-orphan")


class Source(Base):
    __tablename__ = "sources"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # pdf, docx, txt
    file_size = Column(Integer, nullable=True)
    storage_path = Column(String, nullable=False)
    upload_timestamp = Column(DateTime, default=datetime.utcnow)
    processing_status = Column(String, default="uploaded")  # uploaded, parsing, parsed, failed
    extracted_text = Column(Text, nullable=True)
    ocr_text = Column(Text, nullable=True)
    ocr_status = Column(String, nullable=True)  # None, processing, completed, failed, skipped
    processing_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="sources")
    brief_sources = relationship("BriefSource", back_populates="source")


class Brief(Base):
    __tablename__ = "briefs"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    content = Column(JSON, nullable=True)  # The 8-section brief document as structured JSON
    raw_content = Column(Text, nullable=True)  # Raw LLM output text
    project_metadata = Column(JSON, nullable=True)  # Project context passed to the prompt
    status = Column(String, default="processing")  # processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    previous_version_id = Column(String, ForeignKey("briefs.id"), nullable=True)

    project = relationship("Project", back_populates="briefs")
    cards = relationship("Card", back_populates="brief", cascade="all, delete-orphan")
    brief_sources = relationship("BriefSource", back_populates="brief", cascade="all, delete-orphan")


class BriefSource(Base):
    """Junction table tracking which sources contributed to a brief version."""
    __tablename__ = "brief_sources"

    id = Column(String, primary_key=True)  # UUID
    brief_id = Column(String, ForeignKey("briefs.id"), nullable=False, index=True)
    source_id = Column(String, ForeignKey("sources.id"), nullable=False, index=True)

    brief = relationship("Brief", back_populates="brief_sources")
    source = relationship("Source", back_populates="brief_sources")


class Card(Base):
    __tablename__ = "cards"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    brief_id = Column(String, ForeignKey("briefs.id"), nullable=True, index=True)
    source_id = Column(String, nullable=True)  # Reference to source if traceable
    source_document = Column(String, nullable=True)  # Name of source file and page/section
    card_type = Column(String, nullable=False)  # FACT, REQUIREMENT, CONSTRAINT, OBJECTIVE, QUESTION, CONFLICT, ACTION, CLARIFICATION
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # Brief information
    evidence = Column(Text, nullable=True)  # Source excerpt / verbatim evidence
    ai_suggestion = Column(Text, nullable=True)  # AI suggested content / recommendation
    section = Column(String, nullable=True)  # Which brief section this card relates to
    created_by = Column(String, nullable=False, default="AI")  # AI or ARCHITECT
    status = Column(String, nullable=False, default="provisional")  # provisional (suggested), accepted, rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="cards")
    brief = relationship("Brief", back_populates="cards")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(String, primary_key=True)  # UUID
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    brief_id = Column(String, nullable=True)
    status = Column(String, default="queued")  # queued, parsing, extracting_images, processing_brief, generating_cards, completed, failed
    current_step = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="processing_jobs")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(String, primary_key=True)  # UUID
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True, index=True)
    event_type = Column(String, nullable=False)  # project_created, document_uploaded, analysis_started, analysis_completed, cards_generated, questions_identified, conflicts_identified, card_accepted, card_rejected, card_created, card_updated, card_deleted
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    project = relationship("Project")


def log_activity(db: SessionLocal, user_id: str, event_type: str, title: str, description: str = None, project_id: str = None):
    """Utility to record a real system activity event in the database."""
    import uuid
    try:
        act = ActivityLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            project_id=project_id,
            event_type=event_type,
            title=title,
            description=description,
            created_at=datetime.utcnow(),
        )
        db.add(act)
        db.commit()
        return act
    except Exception as e:
        logger.warning(f"Failed to log activity event ({event_type}): {e}")
        return None


# ── Database Initialization ─────────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist and run safe migrations."""
    from sqlalchemy import text
    try:
        Base.metadata.create_all(bind=engine)
        # Ensure new columns exist on cards table
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_document VARCHAR;"))
                conn.execute(text("ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_id VARCHAR;"))
                conn.execute(text("ALTER TABLE cards ADD COLUMN IF NOT EXISTS ai_suggestion TEXT;"))
                conn.commit()
            except Exception as mig_err:
                logger.debug(f"Column migration notice: {mig_err}")
        logger.info("Database tables created/verified successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
