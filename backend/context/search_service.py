"""
Research, Web Search, and Image Validation Service for the Context Knowledge System.
Separates web research & image URL verification from AI synthesis.
"""
import logging
from typing import List, Dict, Any, Optional
import requests

from config import config

logger = logging.getLogger(__name__)


# DeepSeek native web tools definition (used when supported by DeepSeek API)
DEEPSEEK_WEB_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "deepseek_web_search",
            "description": "Search the web for location-specific architectural, historical, material, and cultural evidence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Specific search query for the project locality."}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "deepseek_read_url",
            "description": "Fetch and read the contents of a specific webpage URL returned by search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to read."}
                },
                "required": ["url"],
            },
        },
    },
]


def validate_image_url(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    """
    Verify that a candidate web image URL is reachable and returns an image MIME type.
    Never treats unverified URLs as confirmed.
    """
    if not url or not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return {"verified": False, "reason": "Invalid URL scheme"}

    try:
        resp = requests.head(
            url,
            timeout=timeout,
            allow_redirects=True,
            headers={"User-Agent": "REFLECT-Context-Validator/1.0"},
        )
        if resp.status_code >= 400:
            # Fallback to lightweight streamed GET in case HEAD is blocked
            resp = requests.get(
                url,
                timeout=timeout,
                stream=True,
                allow_redirects=True,
                headers={"User-Agent": "REFLECT-Context-Validator/1.0"},
            )
            resp.close()

        content_type = (resp.headers.get("Content-Type") or "").lower()
        is_image = resp.status_code == 200 and any(
            mime in content_type for mime in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif")
        )
        return {
            "verified": is_image,
            "status_code": resp.status_code,
            "content_type": content_type,
            "reason": "Verified image MIME" if is_image else f"Non-image or unreachable ({resp.status_code}, {content_type})",
        }
    except Exception as exc:
        return {"verified": False, "reason": f"Validation request failed: {exc}"}


def search_web_images(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Pluggable external image search hook.
    If IMAGE_SEARCH_API_KEY (Serper.dev compatible) is configured, retrieves real image candidates
    and validates each URL. Otherwise returns [] cleanly so cards remain valid without images.
    """
    api_key = getattr(config, "IMAGE_SEARCH_API_KEY", "") or ""
    if not api_key.strip() or not query.strip():
        return []

    try:
        resp = requests.post(
            "https://google.serper.dev/images",
            headers={"X-API-KEY": api_key.strip(), "Content-Type": "application/json"},
            json={"q": query, "num": max(limit, 5)},
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.warning(f"Image search API returned {resp.status_code} for '{query}'")
            return []

        raw_images = resp.json().get("images") or []
        validated: List[Dict[str, Any]] = []
        seen_urls = set()
        for item in raw_images:
            img_url = item.get("imageUrl") or ""
            if not img_url or img_url in seen_urls:
                continue
            check = validate_image_url(img_url)
            if check.get("verified"):
                seen_urls.add(img_url)
                validated.append({
                    "image_url": img_url,
                    "source_page_url": item.get("link") or "",
                    "source_title": item.get("title") or "Web Reference",
                    "image_caption": item.get("title") or query,
                    "image_type": "architectural_reference",
                    "license": "unknown",
                    "verified": True,
                })
                if len(validated) >= limit:
                    break
        return validated
    except Exception as exc:
        logger.warning(f"External image search failed for '{query}': {exc}")
        return []
