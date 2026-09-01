"""
TurboOCR integration layer.

TurboOCR is running on GPU 3.
  Public IP:   115.244.46.68:8005
  Private IP:  10.10.10.2:8005  (preferred — faster private cluster network)

Supported endpoints used by this integration:
  POST /ocr/raw      — image file bytes (extracted images from PDFs)
  POST /ocr/pdf      — full PDF file upload (direct PDF to OCR)

Text extraction from images and scanned PDFs.
Failures are recorded explicitly — never silently suppressed.
"""
import logging
import io
from typing import Optional, Dict, Any, List
from pathlib import Path

import httpx

from config import config

logger = logging.getLogger(__name__)


class TurboOCR:
    """Client for the TurboOCR image/PDF text extraction API."""

    def __init__(self):
        self.api_url = config.TURBOOCR_API_URL  # e.g. http://10.10.10.2:8005
        self.api_key = config.TURBOOCR_API_KEY  # Optional bearer token
        self._available = bool(self.api_url)

    @property
    def is_available(self) -> bool:
        return self._available

    def _auth_headers(self) -> dict:
        """Build optional Authorization header."""
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    # ── Public API ─────────────────────────────────────────────────────────

    def extract_from_image(self, image_data: bytes, filename: str = "image.png") -> Dict[str, Any]:
        """
        Send image bytes directly to TurboOCR /ocr/raw.
        """
        if not self._available:
            return self._not_configured()

        endpoint = f"{self.api_url}/ocr/raw"
        try:
            headers = {"Content-Type": _mime_for(filename), **self._auth_headers()}
            with httpx.Client(timeout=httpx.Timeout(4.0, connect=2.0)) as client:
                response = client.post(endpoint, content=image_data, headers=headers)

            return self._parse_response(response, filename)

        except Exception as e:
            msg = f"TurboOCR /ocr/raw unavailable or timed out for {filename}: {e}"
            logger.info(msg)
            return {"success": False, "text": None, "error": msg}

    def extract_from_pdf(self, pdf_data: bytes, filename: str = "document.pdf") -> Dict[str, Any]:
        """
        Send a full PDF to TurboOCR /ocr/pdf.
        """
        if not self._available:
            return self._not_configured()

        endpoint = f"{self.api_url}/ocr/pdf"
        try:
            headers = {"Content-Type": "application/pdf", **self._auth_headers()}
            with httpx.Client(timeout=httpx.Timeout(6.0, connect=2.0)) as client:
                response = client.post(endpoint, content=pdf_data, headers=headers)

            return self._parse_response(response, filename)

        except Exception as e:
            msg = f"TurboOCR /ocr/pdf unavailable or timed out for {filename}: {e}"
            logger.info(msg)
            return {"success": False, "text": None, "error": msg}

    def extract_text(self, image_data: bytes, filename: str = "image.png") -> Dict[str, Any]:
        return self.extract_from_image(image_data=image_data, filename=filename)

    def extract_batch(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results = []
        for img in images:
            result = self.extract_from_image(
                image_data=img["data"],
                filename=img.get("filename", "image.png"),
            )
            results.append(result)
        return results

    # ── Internals ──────────────────────────────────────────────────────────

    def _parse_response(self, response: httpx.Response, filename: str) -> Dict[str, Any]:
        """Parse TurboOCR API response into a standard dict."""
        if response.status_code == 200:
            try:
                result = response.json()
            except Exception:
                result = {"text": response.text}

            # Handle {"results": [{"text": "..."}, ...]}
            if isinstance(result, dict) and isinstance(result.get("results"), list):
                lines = [
                    item.get("text", "")
                    for item in result["results"]
                    if isinstance(item, dict) and item.get("text")
                ]
                extracted = "\n".join(lines)
            else:
                extracted = (
                    result.get("text")
                    or result.get("extracted_text")
                    or result.get("content")
                    or result.get("result")
                    or ""
                )
                if isinstance(extracted, list):
                    extracted = "\n".join(str(t) for t in extracted)

            logger.info(f"TurboOCR extracted {len(extracted)} chars from {filename}")
            return {"success": True, "text": extracted.strip() or None, "error": None}
        else:
            msg = f"TurboOCR returned HTTP {response.status_code} for {filename}: {response.text[:200]}"
            logger.error(msg)
            return {"success": False, "text": None, "error": msg}

    @staticmethod
    def _not_configured() -> Dict[str, Any]:
        return {
            "success": False,
            "text": None,
            "error": "TurboOCR not configured — set TURBOOCR_API_URL in environment",
        }


def _mime_for(filename: str) -> str:
    """Return MIME type based on file extension."""
    ext = Path(filename).suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".tiff": "image/tiff",
        ".bmp": "image/bmp",
        ".ppm": "image/x-portable-pixmap",
    }.get(ext, "image/png")


# Singleton
turbo_ocr = TurboOCR()
