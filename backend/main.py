import uuid
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from config import config
from documents.loader import DocumentLoader
from db import SessionLocal, UserLoginHistory

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
from routes.jobs import router as jobs_router
from routes.program import router as program_router
from routes.admin import router as admin_router

app.include_router(projects_router)
app.include_router(sources_router)
app.include_router(briefs_router)
app.include_router(cards_router)
app.include_router(activities_router)
app.include_router(jobs_router)
app.include_router(program_router)
app.include_router(admin_router)



# ── Auth Endpoints ───────────────────────────────────────────────────────────
from schemas.models import GoogleLoginRequest, AuthResponse, UserResponse
from auth.dependencies import get_current_user


def _user_to_response(user) -> UserResponse:
    """Helper to convert ORM User to UserResponse with admin resolution."""
    email_clean = (user.email or "").strip().lower()
    is_admin = bool(
        getattr(user, "is_admin", False) or
        email_clean == "prasad.k@datai2i.com"
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        is_admin=is_admin,
    )


def _extract_trusted_client_ip(request: Request) -> str:
    # Nginx reverse proxy sets X-Real-IP to $remote_addr
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            return parts[0]
    return request.client.host if request.client else "Unknown"


def _resolve_ip_location(ip: str) -> tuple[str, str]:
    if ip in ("127.0.0.1", "::1", "localhost"):
        return ("Localhost", "Internal")
    if ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("172."):
        return ("Private Network", "Internal")
    return ("Unknown", "Unknown")


@app.post("/api/auth/google", response_model=AuthResponse)
def google_login(body: GoogleLoginRequest, request: Request):
    """Authenticate with Google ID token and log session telemetry."""
    from auth import verify_google_token, get_or_create_user, create_jwt_token

    client_ip = _extract_trusted_client_ip(request)
    user_agent = request.headers.get("user-agent", "")[:500]
    country, city = _resolve_ip_location(client_ip)

    google_info = verify_google_token(body.token)
    if not google_info:
        # Record failed login attempt
        try:
            db = SessionLocal()
            log_record = UserLoginHistory(
                id=str(uuid.uuid4()),
                user_id=None,
                email="unknown@unverified",
                ip_address=client_ip,
                user_agent=user_agent,
                status="failed",
                country=country,
                city=city,
            )
            db.add(log_record)
            db.commit()
            db.close()
        except Exception as e:
            logger.warning(f"Failed to record failed login audit: {e}")

        raise HTTPException(status_code=401, detail="Invalid Google token")

    user = get_or_create_user(google_info)
    access_token = create_jwt_token(user.id, user.email)

    # Record successful login event
    try:
        db = SessionLocal()
        log_record = UserLoginHistory(
            id=str(uuid.uuid4()),
            user_id=user.id,
            email=user.email,
            ip_address=client_ip,
            user_agent=user_agent,
            status="success",
            country=country,
            city=city,
        )
        db.add(log_record)
        db.commit()
        db.close()
    except Exception as e:
        logger.warning(f"Failed to record successful login audit: {e}")

    return AuthResponse(
        access_token=access_token,
        user=_user_to_response(user),
    )


@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_profile(
    user = Depends(get_current_user)
):
    """Get current authenticated user's profile."""
    return _user_to_response(user)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/health/ai")
def ai_health_check():
    """
    Authoritative Qwen / LiteLLM health check endpoint.
    Delegates to the centralized check_qwen_health() service.
    """
    from llm.qwen_health import check_qwen_health
    health = check_qwen_health()
    if health.get("healthy"):
        return {"status": "ok", "slow": False, "healthy": True, "message": "Service is operating normally."}
    else:
        return {
            "status": "unavailable",
            "slow": True,
            "healthy": False,
            "message": health.get("message", "AI services are temporarily unavailable. Please try again later.")
        }
