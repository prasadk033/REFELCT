import os
from pathlib import Path
from dotenv import load_dotenv

# Find .env at the project root (works whether run from backend/ or root)
_env_path = Path(__file__).parent.parent.parent / ".env"
if not _env_path.exists():
    # Fallback: search in parent directories
    _env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)


class Config:
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 8000))

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    ]

    # Redis — agent/workflow runtime state
    REDIS_URL = os.getenv(
        "REDIS_URL",
        "redis://localhost:6379"
    )

    # LLM
    LLM_PROVIDER = os.getenv(
        "LLM_PROVIDER",
        "litellm"
    )

    # This must match model_name in litellm_config.yaml
    LLM_MODEL = os.getenv(
        "LLM_MODEL",
        "qwen"
    )

    # LiteLLM Proxy
    LITELLM_API_BASE = os.getenv(
        "LITELLM_API_BASE",
        "http://localhost:4000"
    )

    LITELLM_MASTER_KEY = os.getenv(
        "LITELLM_MASTER_KEY",
        ""
    )

    # PostgreSQL — LiteLLM proxy/dashboard persistence only
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        ""
    )

    # PostgreSQL — Application database
    APP_DATABASE_URL = os.getenv(
        "APP_DATABASE_URL",
        "postgresql://reflect:ReflectPostgres2026@localhost:5432/reflect"
    )

    # Agent configuration
    MAX_AGENT_RETRIES = int(
        os.getenv("MAX_AGENT_RETRIES", 3)
    )

    # JWT for session tokens
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "reflect-jwt-secret-change-in-production"
    )
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 72

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # TurboOCR
    TURBOOCR_API_URL = os.getenv("TURBOOCR_API_URL", "")
    TURBOOCR_API_KEY = os.getenv("TURBOOCR_API_KEY", "")

    # Storage type: "local" or "s3"
    STORAGE_TYPE = os.getenv("STORAGE_TYPE", "local")

    # MinIO / S3-compatible object storage
    MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
    MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "")
    MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")
    MINIO_BUCKET = os.getenv("MINIO_BUCKET", "reflect-uploads")
    MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"


config = Config()