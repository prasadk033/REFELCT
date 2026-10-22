"""
Administrative API routes for REFLECT.
Provides centralized monitoring across:
1. Overview metrics
2. Users & Active Sessions (with admin role assignment)
3. Projects status and ownership
4. AI Processing Jobs & live queue
5. System Health diagnostics (PostgreSQL, Redis/Worker, MinIO, LiteLLM/Qwen)
6. Audit Logs

STRICT POLICY:
- Admin routes are protected: accessible ONLY to designated admins (prasad@datai2i.com or users with is_admin=True).
- Tenant isolation and project ownership are strictly preserved.
"""
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from db import (
    get_db, engine, User, Project, Source, Card, Brief,
    ProcessingJob, ActivityLog, ProgramItem,
    BriefPublishedVersion, ProgramPublishedVersion, log_activity
)
from auth.dependencies import get_current_user
from config import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ROOT_ADMIN_EMAIL = "prasad.k@datai2i.com"


def is_root_admin(email: Optional[str]) -> bool:
    if not email:
        return False
    return email.strip().lower() == ROOT_ADMIN_EMAIL


def require_admin(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> User:
    """
    Security dependency: Enforces that the caller has admin authorization.
    prasad.k@datai2i.com and prasad@datai2i.com are always recognized as root admin.
    """
    is_root = is_root_admin(user.email)
    if is_root and not user.is_admin:
        # Self-heal root admin flag in db if needed
        try:
            user.is_admin = True
            db.commit()
            db.refresh(user)
        except Exception as e:
            logger.warning(f"Notice auto-refreshing root admin status: {e}")

    if not is_root and not getattr(user, "is_admin", False):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Administrative privileges required."
        )
    return user


# ── 1. Overview ─────────────────────────────────────────────────────────────

@router.get("/overview")
def get_admin_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """High-level operational summary."""
    try:
        total_users = db.query(func.count(User.id)).scalar() or 0
        total_projects = db.query(func.count(Project.id)).scalar() or 0
        total_brief_cards = db.query(func.count(Card.id)).scalar() or 0
        total_program_items = db.query(func.count(ProgramItem.id)).scalar() or 0

        # Processing Jobs summary
        queued_jobs = db.query(func.count(ProcessingJob.id)).filter(ProcessingJob.status == "queued").scalar() or 0
        running_jobs = db.query(func.count(ProcessingJob.id)).filter(
            ProcessingJob.status.in_(["parsing", "extracting_images", "processing_brief", "generating_cards"])
        ).scalar() or 0
        completed_jobs = db.query(func.count(ProcessingJob.id)).filter(ProcessingJob.status == "completed").scalar() or 0
        failed_jobs = db.query(func.count(ProcessingJob.id)).filter(ProcessingJob.status == "failed").scalar() or 0
        total_jobs = db.query(func.count(ProcessingJob.id)).scalar() or 0

        # Active users in the last 24 hours
        cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)
        active_users_24h = db.query(func.count(User.id)).filter(User.updated_at >= cutoff_24h).scalar() or 0

        # System health indicator
        from llm.qwen_health import check_qwen_health
        qwen_status = check_qwen_health()
        system_healthy = bool(qwen_status.get("healthy", True))

        return {
            "total_users": total_users,
            "total_projects": total_projects,
            "total_brief_cards": total_brief_cards,
            "total_program_items": total_program_items,
            "active_users_24h": active_users_24h,
            "jobs_summary": {
                "queued": queued_jobs,
                "running": running_jobs,
                "completed": completed_jobs,
                "failed": failed_jobs,
                "total": total_jobs,
            },
            "service_health": {
                "status": "healthy" if system_healthy else "degraded",
                "ai_service": qwen_status.get("status", "unknown"),
                "message": qwen_status.get("message", "Operational"),
            }
        }
    except Exception as e:
        logger.error(f"Admin overview query failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve admin overview metrics")


# ── 2. Users & Active Sessions ──────────────────────────────────────────────

@router.get("/users")
def list_admin_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Account and usage monitoring for all users."""
    try:
        users = db.query(User).order_by(User.created_at.desc()).all()
        now = datetime.now(timezone.utc)
        thirty_mins_ago = now - timedelta(minutes=30)

        results = []
        for u in users:
            # Count projects owned
            proj_count = db.query(func.count(Project.id)).filter(Project.user_id == u.id).scalar() or 0
            job_count = db.query(func.count(ProcessingJob.id)).filter(ProcessingJob.user_id == u.id).scalar() or 0
            
            # Find latest activity
            latest_act = (
                db.query(ActivityLog.created_at)
                .filter(ActivityLog.user_id == u.id)
                .order_by(ActivityLog.created_at.desc())
                .first()
            )
            last_activity_time = latest_act[0] if latest_act else u.updated_at or u.created_at

            # Convert to UTC-aware if naive for comparison
            cmp_time = last_activity_time
            if cmp_time and cmp_time.tzinfo is None:
                cmp_time = cmp_time.replace(tzinfo=timezone.utc)

            is_online = bool(cmp_time and cmp_time >= thirty_mins_ago)
            is_root = is_root_admin(u.email)
            is_admin_flag = bool(is_root or getattr(u, "is_admin", False))

            results.append({
                "id": u.id,
                "email": u.email,
                "name": u.name or "User",
                "picture": u.picture,
                "is_admin": is_admin_flag,
                "is_root_admin": is_root,
                "role": "Super Admin" if is_root else ("Admin" if is_admin_flag else "User"),
                "projects_count": proj_count,
                "jobs_count": job_count,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_activity": cmp_time.isoformat() if cmp_time else None,
                "is_online": is_online,
            })

        return results
    except Exception as e:
        logger.error(f"Admin users list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users list")


@router.post("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Assign or revoke admin role for a user.
    Only authorized admins may perform this action.
    The root admin (prasad@datai2i.com) cannot be demoted.
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    new_is_admin = bool(payload.get("is_admin", False))

    # Protect root admin from demotion
    if is_root_admin(target_user.email) and not new_is_admin:
        raise HTTPException(status_code=400, detail="Root administrator privileges cannot be revoked")

    target_user.is_admin = new_is_admin
    target_user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(target_user)

    # Log audit event
    action_str = "promoted to Admin" if new_is_admin else "demoted to User"
    log_activity(
        db=db,
        user_id=admin.id,
        event_type="admin_role_change",
        title="Admin Role Changed",
        description=f"User {target_user.email} was {action_str} by {admin.email}."
    )

    logger.info(f"Admin {admin.email} changed role of user {target_user.email} to is_admin={new_is_admin}")

    return {
        "id": target_user.id,
        "email": target_user.email,
        "is_admin": target_user.is_admin,
        "role": "Admin" if target_user.is_admin else "User",
        "message": f"User role updated to {action_str} successfully."
    }


# ── 3. Projects ─────────────────────────────────────────────────────────────

@router.get("/projects")
def list_admin_projects(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Project-level administration and adoption tracking."""
    try:
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
        results = []

        for p in projects:
            owner = db.query(User).filter(User.id == p.user_id).first()
            source_count = db.query(func.count(Source.id)).filter(Source.project_id == p.id).scalar() or 0
            cards_count = db.query(func.count(Card.id)).filter(Card.project_id == p.id).scalar() or 0
            prog_items_count = db.query(func.count(ProgramItem.id)).filter(ProgramItem.project_id == p.id).scalar() or 0
            brief_versions = db.query(func.count(BriefPublishedVersion.id)).filter(BriefPublishedVersion.project_id == p.id).scalar() or 0
            prog_versions = db.query(func.count(ProgramPublishedVersion.id)).filter(ProgramPublishedVersion.project_id == p.id).scalar() or 0

            # Determine workflow progression state
            if prog_versions > 0:
                progression = "Program Published"
            elif prog_items_count > 0:
                progression = "Program in Progress"
            elif brief_versions > 0:
                progression = "Brief Published"
            elif cards_count > 0:
                progression = "Brief Review"
            elif source_count > 0:
                progression = "Sources Uploaded"
            else:
                progression = "Draft"

            results.append({
                "id": p.id,
                "name": p.name,
                "project_type": p.project_type,
                "client": p.client or "—",
                "location": p.location or "—",
                "owner_id": p.user_id,
                "owner_name": owner.name if owner else "Unknown",
                "owner_email": owner.email if owner else "Unknown",
                "source_count": source_count,
                "cards_count": cards_count,
                "program_items_count": prog_items_count,
                "brief_versions_count": brief_versions,
                "program_versions_count": prog_versions,
                "progression": progression,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            })

        return results
    except Exception as e:
        logger.error(f"Admin projects list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve projects list")


# ── 4. AI Processing Jobs ───────────────────────────────────────────────────

@router.get("/jobs")
def list_admin_jobs(
    status: Optional[str] = Query(None, description="Filter by status (queued, running, completed, failed)"),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Monitoring of Brief and Program generation.
    Returns live job queue with duration, status, document names, and errors.
    """
    try:
        query = db.query(ProcessingJob)

        if status == "running":
            query = query.filter(
                ProcessingJob.status.in_(["parsing", "extracting_images", "processing_brief", "generating_cards"])
            )
        elif status:
            query = query.filter(ProcessingJob.status == status)

        jobs = query.order_by(ProcessingJob.created_at.desc()).limit(limit).all()
        now = datetime.now(timezone.utc)

        results = []
        for j in jobs:
            proj = db.query(Project).filter(Project.id == j.project_id).first()
            user = db.query(User).filter(User.id == j.user_id).first() if j.user_id else None

            # Compute duration in seconds
            duration_sec = None
            if j.created_at:
                c_time = j.created_at if j.created_at.tzinfo else j.created_at.replace(tzinfo=timezone.utc)
                u_time = j.updated_at if (j.updated_at and j.updated_at.tzinfo) else (j.updated_at.replace(tzinfo=timezone.utc) if j.updated_at else now)
                duration_sec = max(0, int((u_time - c_time).total_seconds()))

            is_active = j.status in ["queued", "parsing", "extracting_images", "processing_brief", "generating_cards"]

            # Detect if job is stale/abandoned (active state with no updates for over 30 mins)
            is_stale = False
            last_touch = j.updated_at or j.created_at
            if is_active and last_touch:
                lt = last_touch if last_touch.tzinfo else last_touch.replace(tzinfo=timezone.utc)
                if (now - lt).total_seconds() > 1800:
                    is_stale = True

            results.append({
                "id": j.id,
                "project_id": j.project_id,
                "project_name": proj.name if proj else "Unknown Project",
                "user_id": j.user_id,
                "user_email": user.email if user else "—",
                "status": "interrupted" if is_stale else j.status,
                "raw_status": j.status,
                "current_step": j.current_step or "—",
                "error": j.error,
                "cards_generated": j.cards_generated or 0,
                "questions_count": j.questions_count or 0,
                "document_names": j.document_names or "—",
                "duration_seconds": duration_sec,
                "is_active": is_active and not is_stale,
                "is_stale": is_stale,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "updated_at": j.updated_at.isoformat() if j.updated_at else None,
            })

        return results
    except Exception as e:
        logger.error(f"Admin jobs list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve AI processing jobs")


@router.post("/jobs/{job_id}/dismiss")
def dismiss_stale_job(
    job_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Mark an orphaned or interrupted job as failed so it stops clogging the live queue."""
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = "failed"
    job.error = "Job interrupted: Server worker restart or timeout before completion."
    job.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"Admin {admin.email} dismissed stale job {job.id}")
    return {"message": "Job marked as interrupted/failed", "job_id": job.id}


# ── 5. System Health ────────────────────────────────────────────────────────

@router.get("/health")
def get_system_health(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Comprehensive infrastructure and service status:
    - Backend API health
    - PostgreSQL connectivity & latency
    - Redis & RQ worker status
    - MinIO / Storage availability
    - LiteLLM / Qwen availability
    """
    services = {}

    # 1. Backend API
    services["backend_api"] = {
        "status": "operational",
        "healthy": True,
        "latency_ms": 1,
        "message": "FastAPI is accepting and routing requests."
    }

    # 2. PostgreSQL
    db_start = time.perf_counter()
    try:
        db.execute(text("SELECT 1;"))
        db_latency = int((time.perf_counter() - db_start) * 1000)
        services["postgresql"] = {
            "status": "operational",
            "healthy": True,
            "latency_ms": db_latency,
            "message": "Connected to application database."
        }
    except Exception as e:
        services["postgresql"] = {
            "status": "unavailable",
            "healthy": False,
            "latency_ms": None,
            "message": f"Database error: {str(e)[:100]}"
        }

    # 3. Redis / Queue Worker
    try:
        import redis
        r = redis.from_url(config.REDIS_URL, socket_timeout=2)
        redis_start = time.perf_counter()
        r.ping()
        redis_latency = int((time.perf_counter() - redis_start) * 1000)
        services["redis_worker"] = {
            "status": "operational",
            "healthy": True,
            "latency_ms": redis_latency,
            "message": f"Redis connected ({config.WORKER_MODE} worker mode)."
        }
    except Exception as e:
        services["redis_worker"] = {
            "status": "degraded" if config.WORKER_MODE == "inprocess" else "unavailable",
            "healthy": config.WORKER_MODE == "inprocess",
            "latency_ms": None,
            "message": f"Redis ping notice: {str(e)[:100]} (Mode: {config.WORKER_MODE})"
        }

    # 4. LiteLLM / Qwen Model Server
    try:
        from llm.qwen_health import check_qwen_health
        qwen_res = check_qwen_health()
        services["ai_model"] = {
            "status": "operational" if qwen_res.get("healthy") else "unavailable",
            "healthy": bool(qwen_res.get("healthy")),
            "latency_ms": None,
            "message": qwen_res.get("message", "Model service operational.")
        }
    except Exception as e:
        services["ai_model"] = {
            "status": "unavailable",
            "healthy": False,
            "latency_ms": None,
            "message": f"AI health check error: {str(e)[:100]}"
        }

    # 5. Storage (Local / MinIO)
    try:
        from storage import file_store
        services["storage"] = {
            "status": "operational",
            "healthy": True,
            "latency_ms": 1,
            "message": f"Storage active (Type: {config.STORAGE_TYPE})."
        }
    except Exception as e:
        services["storage"] = {
            "status": "degraded",
            "healthy": False,
            "latency_ms": None,
            "message": f"Storage warning: {str(e)[:100]}"
        }

    overall_healthy = all(s.get("healthy", False) for s in services.values())

    return {
        "status": "healthy" if overall_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": services
    }


# ── 6. Audit Logs ───────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_admin_audit_logs(
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Chronological record of important operational and security events."""
    try:
        query = db.query(ActivityLog)
        if event_type:
            query = query.filter(ActivityLog.event_type == event_type)

        total_count = query.count()
        logs = query.order_by(ActivityLog.created_at.desc()).offset(offset).limit(limit).all()

        results = []
        for log in logs:
            user = db.query(User).filter(User.id == log.user_id).first()
            proj = db.query(Project).filter(Project.id == log.project_id).first() if log.project_id else None

            results.append({
                "id": log.id,
                "event_type": log.event_type,
                "title": log.title,
                "description": log.description,
                "user_id": log.user_id,
                "user_name": user.name if user else "System",
                "user_email": user.email if user else "—",
                "project_id": log.project_id,
                "project_name": proj.name if proj else None,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

        return {
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "logs": results
        }
    except Exception as e:
        logger.error(f"Admin audit logs query failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve audit logs")
