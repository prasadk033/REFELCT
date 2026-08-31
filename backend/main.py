import uuid
import logging
import shutil
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any

from config import config
from documents.loader import DocumentLoader
from agents.architect import architect
from memory.redis_store import redis_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Reflect — Architect Thinking App")

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Globals ──────────────────────────────────────────────────────────────────
loader = DocumentLoader()

# Project root = two levels up from backend/app/main.py
PROJECT_ROOT = Path(__file__).parent.parent.parent
UPLOADS_DIR = PROJECT_ROOT / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}


# ── Database Initialization ─────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    """Initialize database tables on application startup."""
    try:
        from db import init_db
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.warning(f"Database initialization skipped or failed: {e}")
        logger.warning("Application will continue without persistent database.")


# ── Mount API Routers ────────────────────────────────────────────────────────
from routes import router as projects_router
from routes.sources import router as sources_router
from routes.briefs import router as briefs_router
from routes.cards import router as cards_router

app.include_router(projects_router)
app.include_router(sources_router)
app.include_router(briefs_router)
app.include_router(cards_router)


# ── Auth Endpoints ───────────────────────────────────────────────────────────
from schemas.models import GoogleLoginRequest, DevLoginRequest, AuthResponse, UserResponse


@app.post("/api/auth/google", response_model=AuthResponse)
def google_login(body: GoogleLoginRequest):
    """Authenticate with Google ID token."""
    from auth import verify_google_token, get_or_create_user, create_jwt_token

    google_info = verify_google_token(body.token)
    if not google_info:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    user = get_or_create_user(google_info)
    access_token = create_jwt_token(user.id, user.email)

    return AuthResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture,
        ),
    )


@app.post("/api/auth/dev", response_model=AuthResponse)
def dev_login(body: DevLoginRequest = None):
    """Development login — creates a dev user without Google OAuth."""
    from auth import create_dev_user, create_jwt_token

    if body is None:
        body = DevLoginRequest()

    user = create_dev_user(email=body.email, name=body.name)
    access_token = create_jwt_token(user.id, user.email)

    return AuthResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture,
        ),
    )


@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_profile(
    authorization: str = None,
):
    """Get current authenticated user's profile."""
    from auth import decode_jwt_token
    from db import SessionLocal, User as UserModel

    if not authorization:
        # Dev mode
        if not config.GOOGLE_CLIENT_ID:
            from auth import create_dev_user
            user = create_dev_user()
            return UserResponse(id=user.id, email=user.email, name=user.name, picture=user.picture)
        raise HTTPException(status_code=401, detail="Authorization required")

    parts = authorization.split(" ") if authorization else []
    token = parts[1] if len(parts) == 2 else authorization

    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = SessionLocal()
    try:
        user = db.query(UserModel).filter(UserModel.id == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return UserResponse(id=user.id, email=user.email, name=user.name, picture=user.picture)
    finally:
        db.close()


# ── Legacy Schemas ───────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    """Legacy JSON body endpoint — kept for backward compatibility."""
    file_path: str


class AnalyzeResponse(BaseModel):
    session_id: str
    status: str


# ── Helper ───────────────────────────────────────────────────────────────────
def _update_state(session_id: str, status: str, current_step: str, extra: Dict[str, Any] = None):
    """Atomically update the session state in Redis."""
    state = redis_store.get_session_state(session_id) or {}
    state["status"] = status
    state["current_step"] = current_step
    if extra:
        state.update(extra)
    redis_store.set_session_state(session_id, state)


def run_analysis_workflow(session_id: str, file_path: str):
    logger.info(f"[{session_id}] Starting workflow")
    try:
        _update_state(session_id, "processing", "Loading document")
        docs = loader.load_document(file_path)
        full_text = "\n\n".join([d.content for d in docs if d.content])

        _update_state(session_id, "processing", "Running specialist agents")
        architect.run_workflow(session_id, full_text)

        _update_state(session_id, "completed", "Done")
        logger.info(f"[{session_id}] Workflow completed")

    except Exception as e:
        logger.error(f"[{session_id}] Workflow failed: {e}")
        _update_state(session_id, "failed", "Error", {"error": str(e)})


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy"}


# --- New: multipart upload (used by React frontend) --------------------------
@app.post("/upload-and-analyze", response_model=AnalyzeResponse)
async def upload_and_analyze(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: PDF, TXT, DOCX."
        )

    session_id = str(uuid.uuid4())
    dest_path = UPLOADS_DIR / f"{session_id}{ext}"

    # Save uploaded file to disk
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    logger.info(f"[{session_id}] Uploaded file saved to {dest_path}")

    # Initialise Redis state
    _update_state(session_id, "queued", "Queued", {"file": str(dest_path)})

    # Hand off to background worker — uses the same workflow as the JSON endpoint
    background_tasks.add_task(run_analysis_workflow, session_id, str(dest_path))

    return {"session_id": session_id, "status": "queued"}


# --- Legacy: JSON body (kept for backward compatibility) ----------------------
@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_document(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    path = Path(request.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = path.suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported document type")

    session_id = str(uuid.uuid4())
    _update_state(session_id, "processing", "Queued", {"file": request.file_path})

    background_tasks.add_task(run_analysis_workflow, session_id, request.file_path)

    return {"session_id": session_id, "status": "processing_started"}


# --- Status -------------------------------------------------------------------
@app.get("/status/{session_id}")
def get_status(session_id: str):
    state = redis_store.get_session_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "status": state.get("status"),
        "current_step": state.get("current_step", ""),
        "error": state.get("error"),
    }


# --- Result -------------------------------------------------------------------
@app.get("/result/{session_id}")
def get_result(session_id: str):
    state = redis_store.get_session_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    if state.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Analysis not completed. Current status: {state.get('status')}"
        )

    result = redis_store.get_final_result(session_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Result not found despite status being completed"
        )

    return result
