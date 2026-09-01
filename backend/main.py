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

# Project root = one level up from backend/main.py
PROJECT_ROOT = Path(__file__).parent.parent
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
from routes.activities import router as activities_router

app.include_router(projects_router)
app.include_router(sources_router)
app.include_router(briefs_router)
app.include_router(cards_router)
app.include_router(activities_router)



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


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy"}
