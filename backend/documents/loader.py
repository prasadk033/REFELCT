import os
from pathlib import Path
from typing import List
from haystack import Document
from haystack.components.converters import PyPDFToDocument, TextFileToDocument, HTMLToDocument
# For DOCX, we might need a custom component or use python-docx manually if not built-in, but let's see.
# Haystack 2.x doesn't have DOCXToDocument in core, we can use python-docx.
import docx

class DocumentLoader:
    def __init__(self):
        self.pdf_converter = PyPDFToDocument()
        self.txt_converter = TextFileToDocument()
    
    def load_document(self, file_path: str) -> List[Document]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Document not found: {file_path}")
            
        ext = path.suffix.lower()
        
        if ext == '.pdf':
            # run returns a dict with 'documents'
            result = self.pdf_converter.run(sources=[str(path)])
            return result["documents"]
            
        elif ext == '.txt':
            result = self.txt_converter.run(sources=[str(path)])
            return result["documents"]
            
        elif ext == '.docx':
            return self._load_docx(str(path))
            
        else:
            raise ValueError(f"Unsupported document type: {ext}. Supported types: PDF, TXT, DOCX.")

    def _load_docx(self, file_path: str) -> List[Document]:
        doc = docx.Document(file_path)
        full_text = []
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text)
        
        text_content = "\n".join(full_text)
        return [Document(content=text_content, meta={"file_path": file_path, "type": "docx"})]
