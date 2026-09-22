"""
Qwen-VL Vision & Multimodal Extraction Client for REFELCT.

Integrates with the local/cluster LiteLLM proxy and direct Qwen-VL endpoint
to perform visual site observation analysis and OCR text extraction on uploaded
architectural site images, drawings, and scanned documents.
"""
import base64
import logging
import mimetypes
from pathlib import Path
from typing import Dict, Any, Optional, List
import httpx

from config import config

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    """Raised when Qwen-VL or LLM proxy is unavailable, timed out, or returning server errors."""
    pass

SITE_ANALYSIS_PROMPT = """You are an expert architectural site analyst and document vision AI for the REFELCT architecture system.
Carefully analyze this image (which may be a site photograph, aerial view, architectural drawing, or scanned document) and extract both:
1. Structured Visual Site Observations
2. Any readable Text, Annotations, Dimensions, or Labels

Analyze and structure your findings using the following schema:

### 1. Visual Site Observations
- **Existing vegetation**: Detail any trees, shrubs, grass, planted areas, dense vegetation, or absence thereof.
- **Landscape character**: Describe if natural, manicured, barren, agricultural, wooded, or urban context.
- **Ground condition**: Note paved surfaces, bare soil, grass, gravel, rocky terrain, slopes, or visible grading.
- **Surrounding buildings**: Visible buildings, adjacent structures, boundaries, or setbacks.
- **Building height**: Approximate storeys / levels of visible surrounding structures.
- **Building typology**: Function/types (e.g. houses, apartments, offices, retail/shops, warehouses, institutions, etc.).
- **Materials**: Visible façade, wall, framing, or roofing materials.
- **Water & Drainage**: Visible water bodies, streams, drainage channels, gutters, or evidence of waterlogging.

### 2. Extracted Text & Annotations
- Extract all visible text, signage, sheet titles, drawing labels, keynotes, numbers, or stamped data.
- If no text is visible, state: "[No text or annotations detected]"

Provide an objective, clear, and professional architectural report.
"""


class QwenVisionClient:
    """Client for Qwen-VL multimodal extraction."""

    def __init__(self):
        # LiteLLM proxy / direct Qwen endpoint
        base = config.LITELLM_API_BASE.rstrip("/")
        if not base.endswith("/v1"):
            base = f"{base}/v1"
        self.api_endpoint = f"{base}/chat/completions"
        self.api_key = config.QWEN_API_KEY or config.LITELLM_MASTER_KEY or ""
        self.model = config.LLM_MODEL or "current-model"
        self.timeout = 180.0

    def encode_image(self, image_data: bytes, filename: str = "image.jpg") -> tuple[str, str]:
        """Convert image bytes to base64 string and determine MIME type."""
        ext = Path(filename).suffix.lower()
        mime_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff"
        }
        mime_type = mime_map.get(ext, mimetypes.guess_type(filename)[0] or "image/jpeg")
        encoded = base64.b64encode(image_data).decode("utf-8")
        return encoded, mime_type

    def extract_from_image(
        self,
        image_data: bytes,
        filename: str = "site_image.jpg",
        custom_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze an image with Qwen-VL and return structured observations and text.

        Returns:
            Dict:
                success: bool
                text: str (formatted observations and extracted text)
                error: Optional[str]
                is_ai_service_error: bool
        """
        try:
            base64_img, mime_type = self.encode_image(image_data, filename)
            prompt_text = custom_prompt or SITE_ANALYSIS_PROMPT

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }

            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt_text},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_img}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 2048,
                "temperature": 0.2
            }

            logger.info(f"Dispatching Qwen-VL vision request for {filename} ({len(image_data)} bytes) to {self.api_endpoint}")

            with httpx.Client(timeout=httpx.Timeout(self.timeout, connect=15.0)) as client:
                response = client.post(self.api_endpoint, headers=headers, json=payload)

            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                logger.info(f"Qwen-VL successfully analyzed {filename} ({len(content)} chars)")
                return {
                    "success": True,
                    "text": content.strip(),
                    "error": None,
                    "is_ai_service_error": False
                }
            else:
                error_msg = f"Qwen-VL API returned HTTP {response.status_code}: {response.text[:300]}"
                logger.error(error_msg)
                return {
                    "success": False,
                    "text": None,
                    "error": error_msg,
                    "is_ai_service_error": True
                }

        except httpx.TimeoutException as te:
            error_msg = f"Qwen-VL request timed out after {self.timeout}s: {te}"
            logger.error(error_msg)
            return {
                "success": False,
                "text": None,
                "error": error_msg,
                "is_ai_service_error": True
            }
        except httpx.ConnectError as ce:
            error_msg = f"Failed to connect to Qwen-VL service: {ce}"
            logger.error(error_msg)
            return {
                "success": False,
                "text": None,
                "error": error_msg,
                "is_ai_service_error": True
            }
        except Exception as e:
            error_msg = f"Unexpected error during Qwen-VL extraction for {filename}: {e}"
            logger.error(error_msg)
            return {
                "success": False,
                "text": None,
                "error": error_msg,
                "is_ai_service_error": True
            }


# Singleton instance
qwen_vision = QwenVisionClient()
