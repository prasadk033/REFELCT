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
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174").split(",")
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

    # Worker Queue Configuration: "distributed" (Redis RQ) or "inprocess" (FastAPI background)
    WORKER_MODE = os.getenv("WORKER_MODE", "distributed").lower()

    # JWT for session tokens
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "bad0fb023d83c360548fbea90b0c013a48547e28113c239c50206883054edea5"
    )
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRATION_HOURS = 72

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "") or os.getenv("VITE_GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # TurboOCR — GPU 3
    TURBOOCR_API_URL = os.getenv("TURBOOCR_API_URL", "http://115.244.46.68:8005") or "http://115.244.46.68:8005"
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