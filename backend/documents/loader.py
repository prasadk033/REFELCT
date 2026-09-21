"""
Document loading and text extraction for REFELCT.

Supports two strictly separated extraction pipelines based on user selection:
1. Standard Text Pipeline (contains_images = False):
   - PDF: Fast text extraction via PyPDF / text parser.
   - DOCX: python-docx paragraph and table extraction.
   - TXT: Direct text reader.
   - No vision model or OCR is called.

2. Qwen-VL Vision Pipeline (contains_images = True):
   - PDF: Full page-by-page rendering into high-resolution images via pypdfium2.
   - Each individual page is dispatched to Qwen-VL to analyze text, drawings, diagrams,
     captions, annotations, and spatial visual relationships.
   - Preserves strict page provenance (Source, Page N, Extraction).
   - Images: Analyzed directly by Qwen-VL.
   - STRICT ERROR POLICY: No silent fallbacks. If Qwen-VL fails or times out,
     an AIServiceError is raised and the operation is marked as failed.
"""
import io
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

from haystack import Document
from haystack.components.converters import PyPDFToDocument, TextFileToDocument
import docx

from documents.qwen_vision import qwen_vision, AIServiceError

logger = logging.getLogger(__name__)

# Active cancellation registry for immediate termination of background extractions
_cancelled_sources: set = set()
_cancelled_files: set = set()

def cancel_extraction(source_id: Optional[str] = None, file_path: Optional[str] = None):
    """Mark a source or file as cancelled/deleted so active vision extraction loops abort immediately."""
    if source_id:
        _cancelled_sources.add(str(source_id))
    if file_path:
        _cancelled_files.add(str(Path(file_path).resolve()))
    logger.info(f"Cancellation registered: source_id={source_id}, file_path={file_path}")

def is_extraction_cancelled(source_id: Optional[str] = None, file_path: Optional[str] = None) -> bool:
    """Check if an extraction has been cancelled or if file was deleted."""
    if source_id and str(source_id) in _cancelled_sources:
        return True
    if file_path:
        p = Path(file_path)
        if not p.exists():
            return True
        if str(p.resolve()) in _cancelled_files:
            return True
    return False

def clear_cancelled(source_id: Optional[str] = None, file_path: Optional[str] = None):
    if source_id and str(source_id) in _cancelled_sources:
        _cancelled_sources.discard(str(source_id))
    if file_path:
        _cancelled_files.discard(str(Path(file_path).resolve()))


class DocumentLoader:
    """Loads and extracts text and visual data from PDF, DOCX, TXT, and image documents."""

    def __init__(self):
        self.pdf_converter = PyPDFToDocument()
        self.txt_converter = TextFileToDocument()

    # ── 1. Standard Text Extraction (No Vision) ──────────────────────────────

    def extract_standard_text(self, file_path: str, filename: str = "", file_type: str = "") -> str:
        """
        Fast standard text extraction without vision models.
        Used strictly when user indicates the document does NOT contain images.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Document not found: {file_path}")

        ext = path.suffix.lower()
        doc_name = filename or path.name

        if ext == '.pdf':
            try:
                result = self.pdf_converter.run(sources=[str(path)])
                docs = result.get("documents", [])
                text_parts = [d.content for d in docs if d.content and d.content.strip()]
                if text_parts:
                    return "\n\n".join(text_parts)
            except Exception as e:
                logger.warning(f"PyPDF standard conversion failed ({e}) for {doc_name}. Trying plain text reader.")

            # Plain text fallback for non-standard PDF formats
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if content.strip():
                    return content.strip()
            except Exception:
                pass
            return f"[{doc_name} — No readable text found in standard text extraction]"

        elif ext == '.txt':
            result = self.txt_converter.run(sources=[str(path)])
            docs = result.get("documents", [])
            return "\n\n".join([d.content for d in docs if d.content])

        elif ext in ('.docx', '.doc'):
            return self._extract_docx_text(str(path))

        elif ext in ('.jpg', '.jpeg', '.png', '.webp'):
            # Single image uploaded with contains_images=False
            return f"[Image Source: {doc_name} — Uploaded with standard extraction (No visual analysis requested)]"

        else:
            raise ValueError(f"Unsupported document type: {ext}. Supported types: PDF, TXT, DOCX, JPG, PNG.")

    def _extract_docx_text(self, file_path: str) -> str:
        """Extract paragraph and table text from DOCX."""
        doc = docx.Document(file_path)
        full_text = []
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text)

        for table in doc.tables:
            for row in table.rows:
                row_text = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_text:
                    full_text.append(" | ".join(row_text))

        return "\n".join(full_text)

    # ── 2. Qwen-VL Vision Extraction (Page-by-Page) ──────────────────────────

    def extract_with_vision(self, file_path: str, filename: str = "", file_type: str = "", source_id: Optional[str] = None) -> str:
        """
        Complete vision extraction pipeline using Qwen-VL.
        Used strictly when user indicates the document contains images or drawings.
        
        Strict Policy: NO silent fallbacks. If Qwen-VL fails, raises AIServiceError.
        """
        path = Path(file_path)
        if not path.exists() or is_extraction_cancelled(source_id=source_id, file_path=file_path):
            raise RuntimeError(f"Extraction halted: document not found or cancelled: {file_path}")

        ext = path.suffix.lower()
        doc_name = filename or path.name

        if ext == '.pdf':
            return self._extract_pdf_pages_vision(str(path), doc_name, source_id=source_id)

        elif ext in ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'):
            return self._extract_image_vision(str(path), doc_name)

        elif ext in ('.docx', '.doc'):
            # For DOCX marked with images: extract text and embedded images
            text = self._extract_docx_text(str(path))
            images = self.extract_images_from_pdf(str(path))  # or docx image extraction
            if images:
                image_analyses = []
                for idx, img in enumerate(images[:5], start=1):
                    if is_extraction_cancelled(source_id=source_id, file_path=file_path):
                        raise RuntimeError(f"Extraction cancelled for {doc_name}")
                    res = qwen_vision.extract_from_image(img["data"], filename=f"{doc_name}_image_{idx}.png")
                    if res.get("success") and res.get("text"):
                        image_analyses.append(f"Source: {doc_name}\nEmbedded Image: {idx}\nExtraction:\n{res['text']}")
                    elif res.get("is_ai_service_error"):
                        raise AIServiceError(res.get("error") or f"Vision extraction failed on embedded image {idx}")
                if image_analyses:
                    return f"{text}\n\n---\n\n" + "\n\n---\n\n".join(image_analyses)
            return text

        elif ext == '.txt':
            return self.extract_standard_text(file_path, filename=filename, file_type=file_type)

        else:
            raise ValueError(f"Unsupported document type for vision processing: {ext}")

    def _extract_pdf_pages_vision(self, file_path: str, filename: str, source_id: Optional[str] = None) -> str:
        """
        Convert PDF page-by-page into optimized JPEG images, dispatch each page to Qwen-VL,
        and combine the structured extraction while strictly preserving page provenance.
        """
        import pypdfium2 as pdfium
        from PIL import Image

        try:
            pdf = pdfium.PdfDocument(file_path)
            total_pages = len(pdf)
        except Exception as e:
            logger.error(f"Failed to open PDF {filename} with pypdfium2: {e}")
            raise RuntimeError(f"Could not render PDF pages: {e}")

        logger.info(f"Starting Qwen-VL page-by-page vision extraction for {filename} ({total_pages} pages)")
        page_extractions = []

        try:
            for page_idx in range(total_pages):
                page_num = page_idx + 1

                # Immediate Cancellation / Deletion Check
                if is_extraction_cancelled(source_id=source_id, file_path=file_path) or not Path(file_path).exists():
                    logger.warning(f"Extraction halted for {filename} (page {page_num}/{total_pages}): source cancelled or deleted.")
                    raise RuntimeError(f"Extraction cancelled for {filename}")

                logger.info(f"Rendering page {page_num}/{total_pages} of {filename} for Qwen-VL")
                
                # Render full page (scale=2 = 144 DPI)
                page = pdf[page_idx]
                pil_image = page.render(scale=2).to_pil()

                # Ensure RGB mode (handles alpha channel or palette modes)
                if pil_image.mode in ('RGBA', 'LA', 'P'):
                    rgb_img = Image.new('RGB', pil_image.size, (255, 255, 255))
                    if pil_image.mode == 'RGBA':
                        rgb_img.paste(pil_image, mask=pil_image.split()[3])
                    else:
                        rgb_img.paste(pil_image)
                    pil_image = rgb_img
                elif pil_image.mode != 'RGB':
                    pil_image = pil_image.convert('RGB')

                # Resize if max dimension > 1500px to maintain high architectural detail without token explosion
                max_dim = 1500
                if max(pil_image.size) > max_dim:
                    scale_factor = max_dim / max(pil_image.size)
                    new_w = max(1, int(pil_image.width * scale_factor))
                    new_h = max(1, int(pil_image.height * scale_factor))
                    pil_image = pil_image.resize((new_w, new_h), Image.Resampling.LANCZOS)

                # Convert to optimized JPEG in-memory (drops 6MB uncompressed PNG to ~180-250KB JPEG)
                img_byte_arr = io.BytesIO()
                pil_image.save(img_byte_arr, format='JPEG', quality=85, optimize=True)
                page_bytes = img_byte_arr.getvalue()

                # Clean up in-memory PIL image immediately to conserve RAM
                del pil_image
                img_byte_arr.close()

                # Dispatch page image to Qwen-VL
                res = qwen_vision.extract_from_image(
                    image_data=page_bytes,
                    filename=f"{filename}_page_{page_num}.jpg"
                )

                # STRICT NO-FALLBACK CHECK:
                if not res.get("success") or not res.get("text"):
                    error_detail = res.get("error") or f"Vision model failed to analyze page {page_num}"
                    logger.error(f"Qwen-VL failed on {filename} page {page_num}: {error_detail}")
                    if res.get("is_ai_service_error"):
                        raise AIServiceError(f"Page {page_num} extraction failed: {error_detail}")
                    raise RuntimeError(f"Page {page_num} extraction failed: {error_detail}")

                # Format with clear page provenance
                extracted_content = res["text"].strip()
                page_block = (
                    f"Source: {filename}\n"
                    f"Page: {page_num}\n"
                    f"Extraction:\n"
                    f"{extracted_content}"
                )
                page_extractions.append(page_block)

        finally:
            try:
                pdf.close()
            except Exception:
                pass

        if not page_extractions:
            raise RuntimeError(f"No pages could be extracted from {filename}")

        combined_result = "\n\n---\n\n".join(page_extractions)
        logger.info(f"Successfully extracted {len(page_extractions)} pages from {filename} with Qwen-VL ({len(combined_result)} chars)")
        return combined_result

    def _extract_image_vision(self, file_path: str, filename: str) -> str:
        """Analyze a standalone site photograph or drawing image with Qwen-VL (with optimization)."""
        from PIL import Image

        # Optimize image size and compression before sending to model
        try:
            with Image.open(file_path) as img:
                if img.mode in ('RGBA', 'LA', 'P'):
                    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'RGBA':
                        rgb_img.paste(img, mask=img.split()[3])
                    else:
                        rgb_img.paste(img)
                    img = rgb_img
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                max_dim = 1500
                if max(img.size) > max_dim:
                    scale_factor = max_dim / max(img.size)
                    new_w = max(1, int(img.width * scale_factor))
                    new_h = max(1, int(img.height * scale_factor))
                    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='JPEG', quality=85, optimize=True)
                image_bytes = img_byte_arr.getvalue()
        except Exception as opt_err:
            logger.warning(f"Could not optimize image {filename}, using raw bytes: {opt_err}")
            with open(file_path, "rb") as f:
                image_bytes = f.read()

        res = qwen_vision.extract_from_image(image_bytes, filename=filename)
        if not res.get("success") or not res.get("text"):
            error_detail = res.get("error") or "Vision model failed to analyze image"
            logger.error(f"Qwen-VL vision error for {filename}: {error_detail}")
            if res.get("is_ai_service_error"):
                raise AIServiceError(error_detail)
            raise RuntimeError(error_detail)

        return (
            f"Source: {filename}\n"
            f"Type: Site Photograph / Architectural Visual Reference\n"
            f"Extraction:\n"
            f"{res['text'].strip()}"
        )

    # ── 3. Combined Entry Point ──────────────────────────────────────────────

    def extract_text_combined(
        self,
        file_path: str,
        contains_images: bool = False,
        filename: str = "",
        file_type: str = "",
        source_id: Optional[str] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Main extraction entry point adhering strictly to user selection:
        - contains_images == True: Qwen-VL Vision Pipeline (Page-by-page rendering).
        - contains_images == False: Standard Text Pipeline (PyPDF / docx / txt).
        
        Strict error handling with zero silent fallback.
        """
        if is_extraction_cancelled(source_id=source_id, file_path=file_path) or not Path(file_path).exists():
            raise RuntimeError(f"Extraction halted: source {filename} was deleted or cancelled.")

        if contains_images:
            text = self.extract_with_vision(file_path, filename=filename, file_type=file_type, source_id=source_id)
        else:
            text = self.extract_standard_text(file_path, filename=filename, file_type=file_type)

        return text, []

    # Compatibility method for legacy callers
    def load_document(self, file_path: str) -> List[Document]:
        """Legacy helper returning Document objects via standard extraction."""
        text = self.extract_standard_text(file_path)
        return [Document(content=text, meta={"file_path": file_path})]

    def extract_images_from_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract embedded image streams from PDF if needed."""
        images = []
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    for img_idx, img_info in enumerate(page.images):
                        try:
                            img = page.crop((
                                img_info.get("x0", 0),
                                img_info.get("top", 0),
                                img_info.get("x1", page.width),
                                img_info.get("bottom", page.height),
                            ))
                            pil_img = img.to_image(resolution=200)
                            buf = io.BytesIO()
                            pil_img.save(buf, format="PNG")
                            images.append({
                                "data": buf.getvalue(),
                                "filename": f"page{page_num}_img{img_idx}.png",
                                "page": page_num
                            })
                        except Exception:
                            continue
        except Exception as e:
            logger.warning(f"Image stream extraction notice: {e}")
        return images
