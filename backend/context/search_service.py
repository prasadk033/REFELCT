"""
Research, Web Search, URL Retrieval, and SSRF-Protected Validation Service
for the REFLECT Context Knowledge System.
"""
import ipaddress
import logging
import os
import re
import socket
import urllib.parse
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import List, Dict, Any, Optional, Tuple
import requests

from config import config

logger = logging.getLogger(__name__)

# Bounded research execution limits
FETCH_TIMEOUT_SEC = 10.0
SEARCH_TIMEOUT_SEC = 10.0
MAX_REDIRECTS = 5
MAX_RAW_HTML_BYTES = 512 * 1024  # 512 KB cap per webpage download
MAX_PAGE_CHARS = 12000  # Max extracted readable chars returned to model per page
MAX_SNIPPET_CHARS = 500

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
}

# DeepSeek native/OpenAI-compatible web tool definitions
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
            "description": "Fetch and read the readable text content of a specific webpage URL returned by search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The http/https URL to read."}
                },
                "required": ["url"],
            },
        },
    },
]


def _is_forbidden_ip(ip_str: str) -> Tuple[bool, str]:
    """Check if an IPv4/IPv6 address is loopback, private, link-local, multicast, or reserved."""
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return True, f"Invalid IP address: {ip_str}"

    # Unwrap IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
        ip_obj = ip_obj.ipv4_mapped

    if ip_obj.is_loopback:
        return True, "Loopback IP address blocked"
    if ip_obj.is_private:
        return True, "Private network IP address blocked"
    if ip_obj.is_link_local:
        return True, "Link-local / cloud metadata IP address blocked"
    if ip_obj.is_multicast:
        return True, "Multicast IP address blocked"
    if ip_obj.is_reserved:
        return True, "Reserved IP address blocked"
    if ip_obj.is_unspecified:
        return True, "Unspecified IP address blocked"

    # Explicit CGNAT (100.64.0.0/10) check
    if isinstance(ip_obj, ipaddress.IPv4Address):
        cgnat = ipaddress.ip_network("100.64.0.0/10")
        if ip_obj in cgnat:
            return True, "CGNAT IP address blocked"

    return False, ""


def validate_safe_external_url(url: str) -> Tuple[bool, str]:
    """
    Comprehensive SSRF protection:
    - Validates http/https scheme only
    - Blocks internal hostnames (.local, .internal, localhost, metadata)
    - Resolves DNS and rejects any private/loopback/link-local/multicast/reserved IPv4 or IPv6
    """
    if not url or not isinstance(url, str):
        return False, "Empty or invalid URL"

    url = url.strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Disallowed URL scheme: {parsed.scheme}"

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "Missing hostname in URL"

    if hostname in BLOCKED_HOSTNAMES or hostname.endswith((".local", ".internal", ".localhost", ".arpa")):
        return False, f"Blocked internal hostname: {hostname}"

    # If hostname is an IP literal, check directly
    try:
        ipaddress.ip_address(hostname)
        blocked, reason = _is_forbidden_ip(hostname)
        if blocked:
            return False, reason
        return True, ""
    except ValueError:
        pass

    # Resolve DNS (both IPv4 & IPv6) and validate every returned IP
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        return False, f"DNS resolution failed for {hostname}: {exc}"

    if not addr_infos:
        return False, f"No DNS records resolved for {hostname}"

    for info in addr_infos:
        resolved_ip = info[4][0]
        # Strip IPv6 scope ID if present
        resolved_ip = resolved_ip.split("%")[0]
        blocked, reason = _is_forbidden_ip(resolved_ip)
        if blocked:
            return False, f"DNS resolved to forbidden IP ({resolved_ip}): {reason}"

    return True, ""


def _safe_http_get(
    url: str,
    timeout: float = FETCH_TIMEOUT_SEC,
    stream: bool = False,
    method: str = "GET",
) -> Tuple[Optional[requests.Response], str, str]:
    """
    Perform an HTTP request with SSRF validation on the initial URL AND every redirect target.
    Returns (response, final_url, error_message).
    """
    current_url = url
    headers = {"User-Agent": "REFLECT-Context-Researcher/1.0"}

    for _ in range(MAX_REDIRECTS + 1):
        safe, reason = validate_safe_external_url(current_url)
        if not safe:
            logger.warning(f"[SSRF-BLOCK] Rejected URL '{current_url}': {reason}")
            return None, current_url, f"SSRF protection blocked URL: {reason}"

        try:
            resp = requests.request(
                method=method,
                url=current_url,
                headers=headers,
                timeout=timeout,
                allow_redirects=False,
                stream=stream,
            )
        except Exception as exc:
            return None, current_url, f"HTTP request failed: {exc}"

        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location")
            resp.close()
            if not location:
                return None, current_url, "Redirect response missing Location header"
            current_url = urllib.parse.urljoin(current_url, location)
            continue

        return resp, current_url, ""

    return None, current_url, f"Exceeded maximum redirects ({MAX_REDIRECTS})"


class _ReadableHTMLParser(HTMLParser):
    """Lightweight stdlib HTML text, title, canonical URL, and metadata extractor."""

    def __init__(self):
        super().__init__()
        self.in_title = False
        self.skip_depth = 0
        self.title_parts: List[str] = []
        self.text_parts: List[str] = []
        self.canonical_url: Optional[str] = None
        self.published_date: Optional[str] = None

    def handle_starttag(self, tag, attrs):
        tag_l = tag.lower()
        attr_map = {k.lower(): v for k, v in attrs if k}
        if tag_l in ("script", "style", "noscript", "svg", "nav", "footer", "header"):
            self.skip_depth += 1
        elif tag_l == "title":
            self.in_title = True
        elif tag_l == "link" and (attr_map.get("rel") or "").lower() == "canonical":
            if attr_map.get("href"):
                self.canonical_url = attr_map["href"]
        elif tag_l == "meta":
            name_or_prop = (attr_map.get("name") or attr_map.get("property") or "").lower()
            if name_or_prop in ("article:published_time", "date", "pubdate", "dc.date.issued") and attr_map.get("content"):
                self.published_date = attr_map["content"][:32]

    def handle_endtag(self, tag):
        tag_l = tag.lower()
        if tag_l in ("script", "style", "noscript", "svg", "nav", "footer", "header"):
            if self.skip_depth > 0:
                self.skip_depth -= 1
        elif tag_l == "title":
            self.in_title = False
        elif tag_l in ("p", "div", "li", "h1", "h2", "h3", "h4", "br", "tr"):
            self.text_parts.append("\n")

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if self.skip_depth == 0:
            cleaned = data.strip()
            if cleaned:
                self.text_parts.append(cleaned + " ")


def web_search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """
    Execute a real web search and return structured results.
    Uses Serper.dev if IMAGE_SEARCH_API_KEY / SERPER_API_KEY is configured,
    otherwise uses DuckDuckGo HTML search (no key required).
    """
    query = (query or "").strip()
    if not query:
        return {"success": False, "query": query, "results": [], "error": "Empty search query"}

    serper_key = os.getenv("SERPER_API_KEY", "").strip() or getattr(config, "IMAGE_SEARCH_API_KEY", "").strip()
    results: List[Dict[str, Any]] = []

    if serper_key:
        try:
            resp = requests.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
                json={"q": query, "num": max_results},
                timeout=SEARCH_TIMEOUT_SEC,
            )
            if resp.status_code == 200:
                for item in (resp.json().get("organic") or [])[:max_results]:
                    link = item.get("link") or ""
                    domain = urllib.parse.urlparse(link).netloc
                    results.append({
                        "title": item.get("title") or "",
                        "url": link,
                        "source_domain": domain,
                        "snippet": (item.get("snippet") or "")[:MAX_SNIPPET_CHARS],
                        "published_date": item.get("date"),
                    })
                logger.info(f"[ContextSearch] Serper search query='{query}' returned {len(results)} results")
                return {"success": True, "query": query, "provider": "serper", "results": results}
            logger.warning(f"[ContextSearch] Serper search returned HTTP {resp.status_code} for '{query}'")
        except Exception as exc:
            logger.warning(f"[ContextSearch] Serper search error for '{query}': {exc}")

    # Zero-key fallback: DuckDuckGo HTML endpoint
    try:
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (compatible; REFLECT-Research/1.0)"},
            timeout=SEARCH_TIMEOUT_SEC,
        )
        if resp.status_code != 200:
            return {"success": False, "query": query, "results": [], "error": f"Search provider returned HTTP {resp.status_code}"}

        html_text = resp.text
        link_matches = re.findall(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
            html_text,
            re.DOTALL | re.IGNORECASE,
        )
        snippet_matches = re.findall(
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            html_text,
            re.DOTALL | re.IGNORECASE,
        )

        for idx, (raw_href, raw_title) in enumerate(link_matches[:max_results]):
            clean_url = raw_href
            if "uddg=" in raw_href:
                qs = urllib.parse.parse_qs(urllib.parse.urlparse(raw_href).query)
                clean_url = qs.get("uddg", [raw_href])[0]
            title_clean = re.sub(r"<[^>]+>", "", raw_title).strip()
            snippet_clean = ""
            if idx < len(snippet_matches):
                snippet_clean = re.sub(r"<[^>]+>", "", snippet_matches[idx]).strip()[:MAX_SNIPPET_CHARS]
            domain = urllib.parse.urlparse(clean_url).netloc
            results.append({
                "title": title_clean,
                "url": clean_url,
                "source_domain": domain,
                "snippet": snippet_clean,
                "published_date": None,
            })

        logger.info(f"[ContextSearch] DuckDuckGo search query='{query}' returned {len(results)} results")
        return {"success": True, "query": query, "provider": "duckduckgo", "results": results}
    except Exception as exc:
        logger.warning(f"[ContextSearch] DuckDuckGo search failed for '{query}': {exc}")
        return {"success": False, "query": query, "results": [], "error": f"Search failed: {exc}"}


def read_url(url: str) -> Dict[str, Any]:
    """
    SSRF-safe webpage retrieval and readable text extraction.
    Revalidates all redirects and enforces size and timeout bounds.
    """
    requested_url = (url or "").strip()
    resp, final_url, err = _safe_http_get(requested_url, timeout=FETCH_TIMEOUT_SEC, stream=True, method="GET")
    if err or resp is None:
        return {
            "success": False,
            "requested_url": requested_url,
            "retrieved_url": final_url,
            "error": err or "Failed to fetch URL",
            "content": "",
            "chars_returned": 0,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        if resp.status_code >= 400:
            return {
                "success": False,
                "requested_url": requested_url,
                "retrieved_url": final_url,
                "error": f"HTTP {resp.status_code}",
                "content": "",
                "chars_returned": 0,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            }

        content_type = (resp.headers.get("Content-Type") or "").lower()
        if "text/html" not in content_type and "text/plain" not in content_type and "application/json" not in content_type:
            return {
                "success": False,
                "requested_url": requested_url,
                "retrieved_url": final_url,
                "error": f"Unsupported content type: {content_type}",
                "content": "",
                "chars_returned": 0,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            }

        raw_chunks: List[bytes] = []
        total_bytes = 0
        for chunk in resp.iter_content(chunk_size=16384):
            if chunk:
                raw_chunks.append(chunk)
                total_bytes += len(chunk)
                if total_bytes >= MAX_RAW_HTML_BYTES:
                    break
        raw_text = b"".join(raw_chunks).decode(resp.encoding or "utf-8", errors="replace")
    finally:
        resp.close()

    domain = urllib.parse.urlparse(final_url).netloc
    if "text/html" in content_type:
        parser = _ReadableHTMLParser()
        parser.feed(raw_text)
        title = "".join(parser.title_parts).strip() or domain
        body_text = re.sub(r"\n{3,}", "\n\n", "".join(parser.text_parts)).strip()
        canonical = parser.canonical_url or final_url
        pub_date = parser.published_date
    else:
        title = domain
        body_text = raw_text.strip()
        canonical = final_url
        pub_date = None

    bounded_content = body_text[:MAX_PAGE_CHARS]
    logger.info(f"[ContextFetch] Read URL '{final_url}' ({len(bounded_content)} chars)")
    return {
        "success": True,
        "requested_url": requested_url,
        "retrieved_url": canonical,
        "title": title,
        "domain": domain,
        "published_date": pub_date,
        "content": bounded_content,
        "chars_returned": len(bounded_content),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }


def validate_image_url(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    """
    SSRF-safe verification that a candidate web image URL is reachable and returns an image MIME type.
    """
    resp, final_url, err = _safe_http_get(url, timeout=timeout, stream=True, method="HEAD")
    if err or (resp is not None and resp.status_code >= 400):
        if resp is not None:
            resp.close()
        resp, final_url, err = _safe_http_get(url, timeout=timeout, stream=True, method="GET")

    if err or resp is None:
        return {"verified": False, "reason": err or "Unreachable"}

    try:
        content_type = (resp.headers.get("Content-Type") or "").lower()
        is_image = resp.status_code == 200 and any(
            mime in content_type for mime in ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif")
        )
        return {
            "verified": is_image,
            "status_code": resp.status_code,
            "content_type": content_type,
            "final_url": final_url,
            "reason": "Verified image MIME" if is_image else f"Non-image or unreachable ({resp.status_code}, {content_type})",
        }
    finally:
        resp.close()


def search_web_images(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Optional external image search hook.
    If IMAGE_SEARCH_API_KEY (Serper.dev) is configured, retrieves image candidates and
    validates each URL with SSRF protection. Otherwise returns [] cleanly.
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
