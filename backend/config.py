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

    # Agent configuration
    MAX_AGENT_RETRIES = int(
        os.getenv("MAX_AGENT_RETRIES", 3)
    )


config = Config()