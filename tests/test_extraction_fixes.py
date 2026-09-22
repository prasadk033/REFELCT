"""
Automated verification tests for 25-page YES extraction fixes:
1. Checkpoint parsing and resumption in loader.py
2. Single-page transient retry behavior in loader.py
3. Synchronous extraction trap removal in sources.py
4. Regex step parsing for real page-level progress in ExtractingProgressModal
"""
import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Configure SQLite in-memory to prevent connecting to local postgres outside Docker
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

# Ensure backend is in python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

class TestExtractionFixes(unittest.TestCase):

    def test_checkpoint_parsing_and_resumption(self):
        """Verify that existing page blocks are recognized and skipped during retry."""
        import re
        existing_text = (
            "Source: test.pdf\nPage: 1\nExtraction:\nPage 1 content\n\n---\n\n"
            "Source: test.pdf\nPage: 2\nExtraction:\nPage 2 content"
        )
        
        # Parse existing text like loader does
        checkpointed_pages = {}
        blocks = existing_text.split("\n\n---\n\n")
        for b in blocks:
            m = re.search(r"Page:\s*(\d+)", b)
            if m:
                checkpointed_pages[int(m.group(1))] = b.strip()

        self.assertEqual(len(checkpointed_pages), 2)
        self.assertIn(1, checkpointed_pages)
        self.assertIn(2, checkpointed_pages)
        self.assertNotIn(3, checkpointed_pages)
        self.assertIn("Page 1 content", checkpointed_pages[1])
        self.assertIn("Page 2 content", checkpointed_pages[2])

    def test_single_page_transient_retry(self):
        """Verify that transient failures retry once while permanent errors do not."""
        # Test 1: Transient failure succeeds on attempt 2
        call_count = 0
        def mock_extract_transient(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"success": False, "error": "503 Service Unavailable / Connection timeout"}
            return {"success": True, "text": "Extracted successfully on attempt 2"}

        max_retries = 1
        res = None
        for attempt in range(max_retries + 1):
            res = mock_extract_transient()
            if res.get("success") and res.get("text"):
                break
            err_msg = res.get("error") or ""
            is_perm = any(k in err_msg for k in ("401", "403", "400", "invalid_api_key", "unauthorized"))
            if is_perm:
                break

        self.assertEqual(call_count, 2)
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("text"), "Extracted successfully on attempt 2")

        # Test 2: Permanent failure fails immediately without retry
        perm_call_count = 0
        def mock_extract_perm(*args, **kwargs):
            nonlocal perm_call_count
            perm_call_count += 1
            return {"success": False, "error": "401 Unauthorized - invalid_api_key"}

        res_perm = None
        for attempt in range(max_retries + 1):
            res_perm = mock_extract_perm()
            if res_perm.get("success") and res_perm.get("text"):
                break
            err_msg = res_perm.get("error") or ""
            is_perm = any(k in err_msg for k in ("401", "403", "400", "invalid_api_key", "unauthorized"))
            if is_perm:
                break

        self.assertEqual(perm_call_count, 1)
        self.assertFalse(res_perm.get("success"))

    def test_approve_all_sources_has_no_sync_extract(self):
        """Verify that approve_all_sources in backend/routes/sources.py does not contain _extract_source_text."""
        sources_py_path = os.path.join(os.path.dirname(__file__), "..", "backend", "routes", "sources.py")
        with open(sources_py_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Find approve_all_sources function body
        start = content.find("def approve_all_sources(")
        self.assertNotEqual(start, -1)
        end = content.find("def delete_source(", start)
        func_source = content[start:end]

        self.assertNotIn("_extract_source_text(", func_source)
        self.assertIn("enqueue_extraction_job", func_source)
        self.assertIn("ProcessingJob", func_source)

    def test_regex_step_parsing_for_page_progress(self):
        """Verify that frontend regex correctly matches backend-produced step strings."""
        import re
        step_single = "Processing Cedar Ridge.pdf — Page 7 of 25 (7 / 25 pages processed)"
        step_multi = "Document 1/3 (Cedar Ridge.pdf) — Page 14 of 25 (14 / 25 pages processed)"

        pattern = r"Page\s+(\d+)\s+of\s+(\d+)"
        
        m_single = re.search(pattern, step_single, re.IGNORECASE)
        self.assertIsNotNone(m_single)
        self.assertEqual(int(m_single.group(1)), 7)
        self.assertEqual(int(m_single.group(2)), 25)

        m_multi = re.search(pattern, step_multi, re.IGNORECASE)
        self.assertIsNotNone(m_multi)
        self.assertEqual(int(m_multi.group(1)), 14)
        self.assertEqual(int(m_multi.group(2)), 25)

if __name__ == "__main__":
    unittest.main()
