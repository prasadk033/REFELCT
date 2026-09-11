import uuid
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from config import config
from documents.loader import DocumentLoader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager

# ── Lifespan (Startup & Shutdown) ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on application startup."""
    try:
        from db import init_db
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization warning: {e}")
    yield


# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Reflect — Architect Thinking App",
    lifespan=lifespan,
    docs_url="/docs" if config.ENABLE_DOCS else None,
    redoc_url="/redoc" if config.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if config.ENABLE_DOCS else None,
)

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
from auth.dependencies import get_current_user


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
    if config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=403, detail="Dev login disabled in production")

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
    user = Depends(get_current_user)
):
    """Get current authenticated user's profile."""
    return UserResponse(id=user.id, email=user.email, name=user.name, picture=user.picture)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy"}


_ai_health_cache = {"timestamp": 0.0, "result": {"status": "ok", "slow": False}}

@app.get("/api/health/ai")
def ai_health_check():
    """
    Checks if the Qwen / LiteLLM inference service is responsive.
    Probes configured LiteLLM endpoints and falls back to direct Qwen GPU server.
    Results are cached for 25 seconds to minimize network calls.
    """
    import time
    import urllib.request

    now = time.time()
    if now - _ai_health_cache["timestamp"] < 25.0:
        return _ai_health_cache["result"]

    # Target endpoints to probe in order of priority:
    candidates = []

    primary = config.LITELLM_API_BASE.rstrip("/")
    hdrs = {"Authorization": f"Bearer {config.LITELLM_MASTER_KEY}"} if config.LITELLM_MASTER_KEY else {}
    candidates.append((primary, "/health", hdrs))
    candidates.append((primary, "/v1/models", hdrs))

    if "litellm:4000" not in primary:
        candidates.append(("http://litellm:4000", "/health", {}))
        candidates.append(("http://litellm:4000", "/v1/models", {}))

    # Direct upstream Qwen GPU server (from config/env)
    if config.QWEN_API_BASE:
        qwen_base = config.QWEN_API_BASE.rstrip("/v1").rstrip("/")
        qwen_hdrs = {"Authorization": f"Bearer {config.QWEN_API_KEY}"} if config.QWEN_API_KEY else {}
        candidates.append((qwen_base, "/v1/models", qwen_hdrs))

    for base, path, headers in candidates:
        try:
            req = urllib.request.Request(f"{base}{path}", headers=headers)
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status in (200, 204):
                    res = {"status": "ok", "slow": False}
                    _ai_health_cache["timestamp"] = now
                    _ai_health_cache["result"] = res
                    return res
        except Exception:
            continue

    # If all targets timed out or unreachable
    res = {
        "status": "slow",
        "slow": True,
        "message": "AI services are temporarily slow due to high demand. Please try again after some time."
    }
    _ai_health_cache["timestamp"] = now
    _ai_health_cache["result"] = res
    return res
