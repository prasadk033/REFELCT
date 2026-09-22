"""
Centralized Qwen / LiteLLM Health Check Module for REFELCT.

Provides authoritative service availability verification with strict timeout
to prevent hanging pipelines and misleading UI progress states.
"""
import time
import logging
import urllib.request
from typing import Dict, Any, Optional
from config import config

logger = logging.getLogger(__name__)

# Standard user-facing message across the application
AI_UNAVAILABLE_MESSAGE = "AI services are temporarily unavailable. Please try again later."

_health_cache = {
    "timestamp": 0.0,
    "result": {
        "healthy": True,
        "status": "ok",
        "message": "AI service is operating normally."
    }
}
CACHE_DURATION_SECONDS = 10.0


def check_qwen_health(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Check if the Qwen / LiteLLM inference service is responsive.
    Probes configured endpoints with a fast 3.0s timeout.
    Results are cached for 10 seconds to minimize network overhead.
    """
    global _health_cache
    now = time.time()

    if not force_refresh and (now - _health_cache["timestamp"] < CACHE_DURATION_SECONDS):
        return _health_cache["result"]

    candidates = []

    # Probe primary target with quick timeout (2.0s)
    primary = (config.LITELLM_API_BASE or "").rstrip("/")
    if primary:
        hdrs = {"Authorization": f"Bearer {config.LITELLM_MASTER_KEY}"} if config.LITELLM_MASTER_KEY else {}
        candidates.append((primary, "/health", hdrs))
        # Only check /v1/models if /health wasn't tested
    
    # Fallback to local container only if primary is not local
    if "litellm:4000" not in primary and "127.0.0.1:4000" not in primary and "localhost:4000" not in primary:
        candidates.append(("http://127.0.0.1:4000", "/health", {}))

    # Direct upstream Qwen GPU server (if configured and different from primary)
    if getattr(config, "QWEN_API_BASE", None) and config.QWEN_API_BASE.rstrip("/v1").rstrip("/") != primary:
        qwen_base = config.QWEN_API_BASE.rstrip("/v1").rstrip("/")
        qwen_hdrs = {"Authorization": f"Bearer {config.QWEN_API_KEY}"} if config.QWEN_API_KEY else {}
        candidates.append((qwen_base, "/health", qwen_hdrs))

    for base, path, headers in candidates:
        url = f"{base}{path}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status in (200, 204):
                    res = {
                        "healthy": True,
                        "status": "ok",
                        "message": "AI service is operating normally."
                    }
                    _health_cache["timestamp"] = now
                    _health_cache["result"] = res
                    return res
        except Exception as err:
            logger.debug(f"Health probe failed for {url}: {err}")
            continue

    # All targets timed out or unreachable
    logger.warning("All Qwen / LiteLLM health probe targets failed. Service marked UNAVAILABLE.")
    res = {
        "healthy": False,
        "status": "unavailable",
        "message": AI_UNAVAILABLE_MESSAGE
    }
    _health_cache["timestamp"] = now
    _health_cache["result"] = res
    return res


def is_qwen_healthy() -> bool:
    """Convenience boolean check."""
    return check_qwen_health().get("healthy", False)


class AIServiceUnavailableError(Exception):
    """Raised when Qwen / LiteLLM service is verified as unavailable."""
    def __init__(self, message: Optional[str] = None):
        super().__init__(message or AI_UNAVAILABLE_MESSAGE)
        self.message = message or AI_UNAVAILABLE_MESSAGE


def ensure_qwen_healthy():
    """Raise AIServiceUnavailableError if Qwen / LiteLLM is unavailable."""
    health = check_qwen_health()
    if not health.get("healthy"):
        raise AIServiceUnavailableError(health.get("message", AI_UNAVAILABLE_MESSAGE))
