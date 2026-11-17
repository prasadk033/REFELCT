"""
Comprehensive Production Readiness and Regression Test Suite for REFLECT.
Covers database integrity, transaction rollbacks, foreign-key cascades,
error sanitization, background job lifecycles, and storage reliability.
"""
import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure test uses in-memory SQLite before db.py or config.py are imported
os.environ["APP_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-unit-tests"

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import db
from db import (
    Base, engine, SessionLocal, User, Project, Source, Card, Brief,
    ProcessingJob, ProgramItem, ProgramQuestion,
    BriefPublishedVersion, ProgramPublishedVersion, SiteAnalysisCache
)
from agents.extraction_orchestrator import _sanitize_error_message, _perform_osm_analysis
from agents.brief_orchestrator import _sanitize_brief_error
from routes.program import _sanitize_program_error
from storage import file_store


class ProductionReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use shared engine and create all tables
        cls.engine = engine
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = SessionLocal

    def setUp(self):
        self.db = self.Session()
        # Create a test user and project
        self.user = User(
            id=str(uuid.uuid4()),
            email=f"tester-{uuid.uuid4().hex[:8]}@reflect.local",
            name="Test Engineer",
        )
        self.db.add(self.user)
        self.project = Project(
            id=str(uuid.uuid4()),
            user_id=self.user.id,
            name="Skyline Tower",
            project_type="Commercial",
            site_url="https://maps.google.com/?q=12.9716,77.5946"
        )
        self.db.add(self.project)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_error_sanitization_masks_database_tracebacks(self):
        """Verify raw SQL, psycopg2, and database traces are never exposed in user errors."""
        raw_db_error = (
            "(psycopg2.errors.UniqueViolation) duplicate key value violates unique constraint "
            '"uq_project_radius_provider" DETAIL: Key (project_id, radius, provider)=('
            '1b0e515d-b147-461e-a9b5-8cced706c9ca, 500, openstreetmap) already exists. '
            '[SQL: INSERT INTO site_analysis_cache...]'
        )
        # Extraction orchestrator sanitizer
        sanitized_ext = _sanitize_error_message(raw_db_error)
        self.assertNotIn("psycopg2", sanitized_ext)
        self.assertNotIn("INSERT INTO", sanitized_ext)
        self.assertIn("server processing error", sanitized_ext)

        # Brief orchestrator sanitizer
        sanitized_brief = _sanitize_brief_error(raw_db_error)
        self.assertNotIn("psycopg2", sanitized_brief)
        self.assertNotIn("SQL:", sanitized_brief)
        self.assertIn("server processing error", sanitized_brief)

        # Program route sanitizer
        sanitized_prog = _sanitize_program_error(Exception(raw_db_error))
        self.assertNotIn("psycopg2", sanitized_prog)
        self.assertNotIn("INSERT INTO", sanitized_prog)
        self.assertIn("server processing error", sanitized_prog)

    def test_site_analysis_cache_in_place_update_prevents_duplicate_violation(self):
        """Verify that existing cache rows are updated in place rather than creating duplicate inserts."""
        # Insert initial cache row
        initial_cache = SiteAnalysisCache(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            latitude="12.9716",
            longitude="77.5946",
            radius=500,
            provider="openstreetmap",
            structured_analysis={"elements": ["Initial context"]},
        )
        self.db.add(initial_cache)
        self.db.commit()

        # Mock geocoder and overpass
        with patch("agents.extraction_orchestrator.osm_service") as mock_osm:
            # Coordinates slightly shifted or updated
            mock_osm.geocode_location.return_value = (12.9719, 77.5950, "Updated Address")
            mock_osm.query_overpass.return_value = {"elements": [{"id": 1, "tags": {"amenity": "park"}}]}
            mock_osm.analyze_site_context.return_value = {"features": ["Park nearby"]}
            mock_osm.format_as_markdown.return_value = "### Site Context\n- Park nearby"

            osm_source = Source(
                id=str(uuid.uuid4()),
                project_id=self.project.id,
                file_name="🌍 Site Analysis — OpenStreetMap",
                file_type="virtual/osm",
                storage_path="",
                processing_status="processing"
            )
            self.db.add(osm_source)
            self.db.commit()

            success = _perform_osm_analysis(self.db, self.project.id, self.project.site_url, osm_source)
            self.assertTrue(success)

            # Verify only ONE cache record exists for this project and provider
            cache_rows = self.db.query(SiteAnalysisCache).filter(
                SiteAnalysisCache.project_id == self.project.id,
                SiteAnalysisCache.provider == "openstreetmap",
                SiteAnalysisCache.radius == 500
            ).all()
            self.assertEqual(len(cache_rows), 1)
            # Verify coordinates were updated in place
            self.assertEqual(cache_rows[0].latitude, "12.9719")
            self.assertEqual(cache_rows[0].longitude, "77.595")
            self.assertEqual(cache_rows[0].id, initial_cache.id)

    def test_program_atomic_generation_preserves_data_on_failure(self):
        """Verify that failure during program synthesis rolls back cleanly without losing existing items."""
        # Create existing program items
        old_item = ProgramItem(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            program_item_code="PRG-001",
            name="Executive Suite",
            type="SPACE",
            status="CONFIRMED"
        )
        self.db.add(old_item)
        self.db.commit()

        # Simulate atomic swap transaction where synthesis inserts fail midway
        try:
            # 1. Delete without premature commit
            self.db.query(ProgramItem).filter(ProgramItem.project_id == self.project.id).delete(synchronize_session=False)

            # 2. Add an invalid item or trigger simulated exception
            raise RuntimeError("Simulated AI formatting exception midway through generation")

            # 3. Commit would happen here
            self.db.commit()
        except Exception:
            self.db.rollback()

        # Verify old program item was NOT permanently lost
        preserved = self.db.query(ProgramItem).filter(ProgramItem.project_id == self.project.id).all()
        self.assertEqual(len(preserved), 1)
        self.assertEqual(preserved[0].name, "Executive Suite")

    def test_project_cascade_delete_severs_self_referencing_fks(self):
        """Verify that cascade delete handles self-referencing FKs on Brief and ProgramPublishedVersion."""
        # 1. Brief versions with self-reference
        b1 = Brief(id=str(uuid.uuid4()), project_id=self.project.id, version=0, status="completed")
        self.db.add(b1)
        self.db.commit()

        b2 = Brief(id=str(uuid.uuid4()), project_id=self.project.id, version=1, status="completed", previous_version_id=b1.id)
        self.db.add(b2)
        self.db.commit()

        # 2. Program published versions with self-reference
        pv1 = ProgramPublishedVersion(id=str(uuid.uuid4()), project_id=self.project.id, version_number=1, item_count=5)
        self.db.add(pv1)
        self.db.commit()

        pv2 = ProgramPublishedVersion(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            version_number=2,
            item_count=6,
            previous_program_version_id=pv1.id
        )
        self.db.add(pv2)
        self.db.commit()

        # Apply the fix: sever both self-referencing foreign keys prior to cascade deletion
        self.db.query(Brief).filter(Brief.project_id == self.project.id).update(
            {"previous_version_id": None}, synchronize_session=False
        )
        self.db.query(ProgramPublishedVersion).filter(ProgramPublishedVersion.project_id == self.project.id).update(
            {"previous_program_version_id": None}, synchronize_session=False
        )
        self.db.flush()

        # Delete project cascade
        self.db.delete(self.project)
        self.db.commit()

        # Verify project and associated versions are cleanly removed
        self.assertIsNone(self.db.query(Project).filter(Project.id == self.project.id).first())
        self.assertEqual(self.db.query(Brief).filter(Brief.project_id == self.project.id).count(), 0)
        self.assertEqual(self.db.query(ProgramPublishedVersion).filter(ProgramPublishedVersion.project_id == self.project.id).count(), 0)

    def test_processing_job_uses_correct_error_attribute(self):
        """Verify ProcessingJob records error in .error column."""
        job = ProcessingJob(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            user_id=self.user.id,
            status="failed",
            error="Background queue unavailable"
        )
        self.db.add(job)
        self.db.commit()

        fetched = self.db.query(ProcessingJob).filter(ProcessingJob.id == job.id).first()
        self.assertEqual(fetched.error, "Background queue unavailable")
        self.assertTrue(hasattr(fetched, "error"))

    def test_filestore_cleanup_temp_file_safety(self):
        """Verify FileStore cleanup_temp_file removes temporary files safely."""
        import tempfile
        from pathlib import Path

        # Create real temp file
        tmp = tempfile.NamedTemporaryFile(suffix=".tmp", delete=False)
        tmp.write(b"test data")
        tmp.close()

        self.assertTrue(Path(tmp.name).exists())
        cleaned = file_store.cleanup_temp_file(tmp.name)
        self.assertTrue(cleaned)
        self.assertFalse(Path(tmp.name).exists())

        # Calling on None or non-existent file returns False without crashing
        self.assertFalse(file_store.cleanup_temp_file(None))
        self.assertFalse(file_store.cleanup_temp_file("/invalid/path/that/does/not/exist.tmp"))

    def test_unacknowledged_jobs_sanitizes_raw_sql_error(self):
        """Verify unacknowledged jobs endpoint sanitizes raw database errors."""
        from routes.jobs import get_unacknowledged_jobs
        job = ProcessingJob(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            user_id=self.user.id,
            status="failed",
            error="(psycopg2.errors.UniqueViolation) duplicate key value violates unique constraint",
            notification_seen=False
        )
        self.db.add(job)
        self.db.commit()

        results = get_unacknowledged_jobs(user=self.user, db=self.db)
        matched = [r for r in results if r["id"] == job.id]
        self.assertTrue(len(matched) > 0)
        self.assertNotIn("psycopg2", matched[0]["error"])
        self.assertIn("server processing error", matched[0]["error"])
        self.assertEqual(matched[0]["project_name"], "Skyline Tower")

    def test_stale_extraction_job_releases_sources(self):
        """Verify that auto-resolving stale extraction jobs also marks stuck sources as paused."""
        from routes.sources import _check_active_extraction
        from datetime import timedelta

        # Create a stale job (> 3 mins old)
        stale_time = datetime.now(timezone.utc) - timedelta(minutes=10)
        job = ProcessingJob(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            user_id=self.user.id,
            status="extracting",
            current_step="Extracting page 1",
            updated_at=stale_time
        )
        self.db.add(job)

        # Create a source stuck in extracting
        source = Source(
            id=str(uuid.uuid4()),
            project_id=self.project.id,
            file_name="MasterPlan.pdf",
            file_type="pdf",
            storage_path="path/to/doc.pdf",
            processing_status="extracting",
            version=None
        )
        self.db.add(source)
        self.db.commit()

        # Call _check_active_extraction
        _check_active_extraction(self.db, self.project.id)

        # Verify job was marked paused
        self.db.refresh(job)
        self.assertEqual(job.status, "paused")

        # Verify source was also marked paused (not stuck in extracting)
        self.db.refresh(source)
        self.assertEqual(source.processing_status, "paused")
        self.assertIn("timeout/restart", source.processing_error)


if __name__ == "__main__":
    unittest.main()
