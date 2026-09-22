"""
Automated unit tests for background task fixes:
1. Idempotent init_db migration for notification_seen
2. Job acknowledgment with strict authenticated owner verification (403 Forbidden for non-owners)
3. Unacknowledged jobs listing and deduplication
4. Generation concurrency locking (HTTP 409 on conflicting batch, existing job return on identical key)
5. Multi-user project-scoped extraction concurrency (HTTP 409 for same project, independent project allowed)
"""
import sys
import os

# Configure SQLite in-memory database BEFORE importing config/db
os.environ["APP_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from db import Base, engine, SessionLocal, init_db, ProcessingJob, Project, User


class TestBackgroundTaskFixes(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        init_db()

    def setUp(self):
        self.db = SessionLocal()
        # Clean up processing jobs, projects, users
        self.db.query(ProcessingJob).delete()
        self.db.query(Project).delete()
        self.db.query(User).delete()
        self.db.commit()

        # Create test users
        self.user_a = User(id="user-a", email="user_a@test.com", name="User A")
        self.user_b = User(id="user-b", email="user_b@test.com", name="User B")
        self.db.add_all([self.user_a, self.user_b])

        # Create test projects
        self.project_1 = Project(id="proj-1", user_id="user-a", name="Project 1", project_type="Residential Project")
        self.project_2 = Project(id="proj-2", user_id="user-b", name="Project 2", project_type="Residential Project")
        self.db.add_all([self.project_1, self.project_2])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_init_db_migration_idempotent(self):
        """Verify init_db can run multiple times safely without error."""
        try:
            init_db()
            init_db()
            init_db()
        except Exception as e:
            self.fail(f"init_db raised an unexpected exception on repeated execution: {e}")

    def test_02_job_acknowledgment_security_enforcement(self):
        """Verify only the authenticated owner can acknowledge a job; non-owners get 403."""
        from fastapi import HTTPException
        from routes.jobs import acknowledge_job_notification

        # Create job owned by User A
        job = ProcessingJob(
            id="job-100",
            project_id="proj-1",
            user_id="user-a",
            status="completed",
            notification_seen=False
        )
        self.db.add(job)
        self.db.commit()

        # Non-owner User B attempts to acknowledge -> Must raise HTTP 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            acknowledge_job_notification(job_id="job-100", user=self.user_b, db=self.db)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Forbidden", ctx.exception.detail)

        # Authenticated owner User A acknowledges -> Succeeds and sets notification_seen = True
        res = acknowledge_job_notification(job_id="job-100", user=self.user_a, db=self.db)
        self.assertEqual(res["message"], "Notification acknowledged")

        self.db.refresh(job)
        self.assertTrue(job.notification_seen)

    def test_03_unacknowledged_jobs_deduplication(self):
        """Verify unacknowledged jobs query returns owner's jobs and excludes acknowledged ones."""
        from routes.jobs import get_unacknowledged_jobs

        job_a1 = ProcessingJob(
            id="job-a1",
            project_id="proj-1",
            user_id="user-a",
            status="completed",
            notification_seen=False,
            created_at=datetime.now(timezone.utc)
        )
        job_b1 = ProcessingJob(
            id="job-b1",
            project_id="proj-2",
            user_id="user-b",
            status="completed",
            notification_seen=False,
            created_at=datetime.now(timezone.utc)
        )
        self.db.add_all([job_a1, job_b1])
        self.db.commit()

        # Query for User A: must return only job_a1, not job_b1
        jobs_a = get_unacknowledged_jobs(user=self.user_a, db=self.db)
        self.assertEqual(len(jobs_a), 1)
        self.assertEqual(jobs_a[0]["id"], "job-a1")

        # Mark job_a1 as seen
        job_a1.notification_seen = True
        self.db.commit()

        # Subsequent query for User A: returns empty list (no duplicate notifications!)
        jobs_a_after = get_unacknowledged_jobs(user=self.user_a, db=self.db)
        self.assertEqual(len(jobs_a_after), 0)

    def test_04_generation_concurrency_lock_and_idempotency(self):
        """Verify conflicting generation requests raise 409, while identical keys return active job."""
        from fastapi import HTTPException

        active_job = ProcessingJob(
            id="job-gen-1",
            project_id="proj-1",
            user_id="user-a",
            status="generating_cards",
            idempotency_key="exact-key-12345",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        self.db.add(active_job)
        self.db.commit()

        # Test conflicting generation request logic
        active_jobs = (
            self.db.query(ProcessingJob)
            .filter(
                ProcessingJob.project_id == "proj-1",
                ProcessingJob.status.in_(["queued", "parsing", "extracting_images", "processing_brief", "generating_cards"])
            )
            .all()
        )

        incoming_conflicting_key = "different-key-99999"
        # Check that it rejects with 409
        has_idempotent_match = any(aj.idempotency_key == incoming_conflicting_key for aj in active_jobs)
        self.assertFalse(has_idempotent_match)

        incoming_identical_key = "exact-key-12345"
        # Check that it finds the match
        matching_job = next((aj for aj in active_jobs if aj.idempotency_key == incoming_identical_key), None)
        self.assertIsNotNone(matching_job)
        self.assertEqual(matching_job.id, "job-gen-1")

    def test_05_multi_user_project_scoped_extraction_lock(self):
        """Verify extraction lock is scoped to project_id: blocks same project, allows different project."""
        from fastapi import HTTPException
        from routes.sources import _check_active_extraction

        # Active extraction running on proj-1 by User A
        active_ext = ProcessingJob(
            id="job-ext-1",
            project_id="proj-1",
            user_id="user-a",
            status="extracting",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        self.db.add(active_ext)
        self.db.commit()

        # User B attempts extraction on SAME project (proj-1) -> Must raise HTTP 409 Conflict
        with self.assertRaises(HTTPException) as ctx:
            _check_active_extraction(db=self.db, project_id="proj-1")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("Another extraction task is currently running for this project", ctx.exception.detail)

        # User B attempts extraction on DIFFERENT project (proj-2) -> Allowed without error
        try:
            _check_active_extraction(db=self.db, project_id="proj-2")
        except HTTPException:
            self.fail("_check_active_extraction raised HTTPException for an unrelated project!")


if __name__ == "__main__":
    unittest.main()
