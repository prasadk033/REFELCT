"""
Background RQ orchestrator for Context Knowledge System jobs.
"""
import logging
from typing import List, Optional, Dict, Any

from db import SessionLocal
from context.models import ContextJob
from context.master_agent import ContextMasterAgent

logger = logging.getLogger(__name__)


def is_context_job_cancelled(project_id: str) -> bool:
    try:
        from tasks.queue import get_redis_connection
        r = get_redis_connection()
        return bool(r.get(f"reflect:cancelled:context:{project_id}"))
    except Exception:
        return False


def clear_context_cancel_flag(project_id: str):
    try:
        from tasks.queue import get_redis_connection
        r = get_redis_connection()
        r.delete(f"reflect:cancelled:context:{project_id}")
    except Exception:
        pass


def run_context_generation_job(
    project_id: str,
    job_id: str,
    architect_local_knowledge: Optional[str] = None,
    uploaded_images: Optional[List[Dict[str, Any]]] = None,
    focus_notes: Optional[str] = None,
):
    db = SessionLocal()
    try:
        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if not job:
            return
        job.status = "running"
        job.current_step = "Starting Context Master..."
        db.commit()

        def update_progress(step: str, attempt: int):
            j = db.query(ContextJob).filter(ContextJob.id == job_id).first()
            if j:
                j.current_step = step
                j.attempt_count = attempt
                db.commit()

        master = ContextMasterAgent(db=db, cancel_checker=lambda: is_context_job_cancelled(project_id))
        run = master.run_cultural_context_generation(
            project_id=project_id,
            architect_local_knowledge=architect_local_knowledge,
            uploaded_images=uploaded_images,
            focus_notes=focus_notes,
            progress_cb=update_progress,
        )

        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if job:
            job.status = "completed"
            job.current_step = "Cultural Context Cards Ready"
            job.attempt_count = run.attempt_count
            db.commit()
    except Exception as exc:
        logger.error(f"[{project_id}] Context generation failed: {exc}", exc_info=True)
        db.rollback()
        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if job:
            err_str = str(exc)
            job.status = "cancelled" if "cancelled" in err_str.lower() else "failed"
            job.current_step = "Cancelled by user" if job.status == "cancelled" else "Failed"
            job.error = err_str[:1000]
            db.commit()
    finally:
        clear_context_cancel_flag(project_id)
        db.close()


def run_context_card_modification_job(
    project_id: str,
    job_id: str,
    card_id: str,
    instruction: str,
    architect_local_knowledge: Optional[str] = None,
):
    db = SessionLocal()
    try:
        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if not job:
            return
        job.status = "running"
        job.current_step = "Modifying Cultural Context Card..."
        db.commit()

        def update_progress(step: str, attempt: int):
            j = db.query(ContextJob).filter(ContextJob.id == job_id).first()
            if j:
                j.current_step = step
                j.attempt_count = attempt
                db.commit()

        master = ContextMasterAgent(db=db, cancel_checker=lambda: is_context_job_cancelled(project_id))
        master.run_card_modification(
            project_id=project_id,
            card_id=card_id,
            instruction=instruction,
            architect_local_knowledge=architect_local_knowledge,
            progress_cb=update_progress,
        )

        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if job:
            job.status = "completed"
            job.current_step = "Card Modification Complete"
            db.commit()
    except Exception as exc:
        logger.error(f"[{project_id}] Context card modification failed: {exc}", exc_info=True)
        db.rollback()
        job = db.query(ContextJob).filter(ContextJob.id == job_id).first()
        if job:
            err_str = str(exc)
            job.status = "cancelled" if "cancelled" in err_str.lower() else "failed"
            job.current_step = "Cancelled by user" if job.status == "cancelled" else "Failed"
            job.error = err_str[:1000]
            db.commit()
    finally:
        clear_context_cancel_flag(project_id)
        db.close()
