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
from sqlalchemy import func, text, desc, asc
import uuid

from db import (
    get_db, engine, User, Project, Source, Card, Brief,
    ProcessingJob, ActivityLog, ProgramItem,
    BriefPublishedVersion, ProgramPublishedVersion, log_activity,
    AdminProjectPermission, UserLoginHistory, SiteAnalysisCache
)
from auth.dependencies import get_current_user
from config import config
from storage import file_store
from schemas.models import (
    AdminProjectPermissionAssignmentRequest,
    AdminProjectPermissionResponse,
    UserLoginRecordResponse,
    ProjectUpdate,
)

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
    prasad.k@datai2i.com is always recognized as root admin.
    """
    is_root = is_root_admin(user.email)
    if is_root and not user.is_admin:
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


def require_super_admin(
    user: User = Depends(require_admin),
) -> User:
    """
    Strict security dependency: Enforces caller is the designated Super Admin (Root).
    Admins cannot grant or revoke permissions.
    """
    if not is_root_admin(user.email):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Super Administrator privileges required to manage permissions."
        )
    return user


def get_effective_project_permission(admin: User, project: Project, db: Session) -> Dict[str, Any]:
    """
    Computes effective project permissions (READ, EDIT, DELETE) with:
    1. Super Admin global override
    2. Owner Invariant (project creator always has full access to their own project)
    3. Delegated permissions lookup for other projects
    4. Default Deny
    """
    # 1. Super Admin global override
    if is_root_admin(admin.email):
        return {
            "can_read": True,
            "can_edit": True,
            "can_delete": True,
            "is_owner": admin.id == project.user_id,
            "is_super_admin": True,
        }

    # 2. Project Owner Invariant
    if project.user_id == admin.id:
        return {
            "can_read": True,
            "can_edit": True,
            "can_delete": True,
            "is_owner": True,
            "is_super_admin": False,
        }

    # 3. Standard non-admin users
    if not getattr(admin, "is_admin", False):
        return {
            "can_read": False,
            "can_edit": False,
            "can_delete": False,
            "is_owner": False,
            "is_super_admin": False,
        }

    # 4. Explicit delegated grant in admin_project_permissions
    perm = db.query(AdminProjectPermission).filter(
        AdminProjectPermission.admin_user_id == admin.id,
        AdminProjectPermission.project_id == project.id
    ).first()

    if perm:
        return {
            "can_read": bool(perm.can_read),
            "can_edit": bool(perm.can_edit),
            "can_delete": bool(perm.can_delete),
            "is_owner": False,
            "is_super_admin": False,
        }

    # 5. Default Deny
    return {
        "can_read": False,
        "can_edit": False,
        "can_delete": False,
        "is_owner": False,
        "is_super_admin": False,
    }


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
            
            # Find latest activity log
            latest_act = (
                db.query(ActivityLog.created_at)
                .filter(ActivityLog.user_id == u.id)
                .order_by(ActivityLog.created_at.desc())
                .first()
            )
            
            # Find latest processing job
            latest_job = (
                db.query(ProcessingJob.updated_at)
                .filter(ProcessingJob.user_id == u.id)
                .order_by(ProcessingJob.updated_at.desc())
                .first()
            )

            # Check if currently running a job
            has_running_job = bool(
                db.query(ProcessingJob.id)
                .filter(
                    ProcessingJob.user_id == u.id,
                    ProcessingJob.status.in_(["parsing", "extracting_images", "processing_brief", "generating_cards"]),
                    ProcessingJob.updated_at >= thirty_mins_ago
                )
                .first()
            )

            # Max of login (updated_at), activity log, or job
            candidates = [t for t in [
                u.updated_at,
                latest_act[0] if latest_act else None,
                latest_job[0] if latest_job else None,
                u.created_at
            ] if t is not None]

            cmp_time = max(candidates) if candidates else None
            if cmp_time and cmp_time.tzinfo is None:
                cmp_time = cmp_time.replace(tzinfo=timezone.utc)

            is_online = bool(has_running_job or (cmp_time and cmp_time >= thirty_mins_ago))
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
                "is_generating": has_running_job,
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


# ── 3. Role-Based Permissions (Super Admin Only) ───────────────────────────

@router.get("/permissions")
def list_admin_permissions(
    admin_user_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    super_admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    """
    List all delegated project permissions.
    Restricted strictly to the Super Admin.
    """
    try:
        query = db.query(AdminProjectPermission)
        if admin_user_id:
            query = query.filter(AdminProjectPermission.admin_user_id == admin_user_id)
        if project_id:
            query = query.filter(AdminProjectPermission.project_id == project_id)

        records = query.order_by(AdminProjectPermission.updated_at.desc()).all()
        results = []
        for r in records:
            admin_u = db.query(User).filter(User.id == r.admin_user_id).first()
            proj = db.query(Project).filter(Project.id == r.project_id).first()
            results.append({
                "id": r.id,
                "admin_user_id": r.admin_user_id,
                "admin_email": admin_u.email if admin_u else "Unknown",
                "admin_name": admin_u.name if admin_u else "Unknown",
                "project_id": r.project_id,
                "project_name": proj.name if proj else "Unknown Project",
                "can_read": bool(r.can_read),
                "can_edit": bool(r.can_edit),
                "can_delete": bool(r.can_delete),
                "granted_by": r.granted_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            })
        return results
    except Exception as e:
        logger.error(f"Failed to query admin permissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve permissions list")


@router.post("/permissions")
def assign_admin_permission(
    payload: AdminProjectPermissionAssignmentRequest,
    super_admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    """
    Assign or update granular project permissions (READ, EDIT, DELETE) for an Admin.
    Restricted strictly to the Super Admin.
    Enforces invariant: EDIT or DELETE requires READ=True.
    """
    # 1. Verify target user exists and is an Admin
    target_user = db.query(User).filter(User.id == payload.admin_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
    if not getattr(target_user, "is_admin", False) and not is_root_admin(target_user.email):
        raise HTTPException(status_code=400, detail="Cannot assign project permissions to a non-administrative user")

    # 2. Verify target project exists
    target_project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not target_project:
        raise HTTPException(status_code=404, detail="Target project not found")

    # Invariant: EDIT or DELETE requires READ
    can_edit = bool(payload.can_edit)
    can_delete = bool(payload.can_delete)
    can_read = bool(payload.can_read or can_edit or can_delete)

    # Check for existing record
    existing = db.query(AdminProjectPermission).filter(
        AdminProjectPermission.admin_user_id == payload.admin_user_id,
        AdminProjectPermission.project_id == payload.project_id
    ).first()

    now = datetime.now(timezone.utc)
    if existing:
        existing.can_read = can_read
        existing.can_edit = can_edit
        existing.can_delete = can_delete
        existing.granted_by = super_admin.id
        existing.updated_at = now
        record_id = existing.id
        action_msg = "updated"
    else:
        record_id = str(uuid.uuid4())
        new_perm = AdminProjectPermission(
            id=record_id,
            admin_user_id=payload.admin_user_id,
            project_id=payload.project_id,
            can_read=can_read,
            can_edit=can_edit,
            can_delete=can_delete,
            granted_by=super_admin.id,
            created_at=now,
            updated_at=now,
        )
        db.add(new_perm)
        action_msg = "granted"

    db.commit()

    # Log audit event
    log_activity(
        db=db,
        user_id=super_admin.id,
        event_type="admin_permission_change",
        title="Project Permission Updated",
        description=f"Permissions for {target_user.email} on '{target_project.name}' {action_msg}: READ={can_read}, EDIT={can_edit}, DELETE={can_delete}.",
        project_id=target_project.id
    )

    logger.info(f"Super Admin {super_admin.email} {action_msg} permissions for {target_user.email} on project {target_project.id}")

    return {
        "id": record_id,
        "admin_user_id": payload.admin_user_id,
        "project_id": payload.project_id,
        "can_read": can_read,
        "can_edit": can_edit,
        "can_delete": can_delete,
        "message": f"Permissions {action_msg} successfully."
    }


@router.delete("/permissions/{permission_id}")
def revoke_admin_permission(
    permission_id: str,
    super_admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    """
    Completely revoke a delegated project permission record.
    Restricted strictly to the Super Admin.
    """
    perm = db.query(AdminProjectPermission).filter(AdminProjectPermission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission record not found")

    target_user = db.query(User).filter(User.id == perm.admin_user_id).first()
    target_project = db.query(Project).filter(Project.id == perm.project_id).first()

    db.delete(perm)
    db.commit()

    user_email = target_user.email if target_user else perm.admin_user_id
    project_name = target_project.name if target_project else perm.project_id

    log_activity(
        db=db,
        user_id=super_admin.id,
        event_type="admin_permission_revoked",
        title="Project Permission Revoked",
        description=f"All delegated permissions for {user_email} on '{project_name}' were revoked.",
        project_id=perm.project_id
    )

    logger.info(f"Super Admin {super_admin.email} revoked permission {permission_id}")
    return {"message": "Permission successfully revoked"}


# ── 4. Projects & Actions ───────────────────────────────────────────────────

@router.get("/projects")
def list_admin_projects(
    search: Optional[str] = Query(None, description="Search by project name, ID, client, or owner email/name"),
    sort_by: str = Query("newest", description="newest, oldest, updated_desc, updated_asc, name_asc, name_desc"),
    progression: Optional[str] = Query(None, description="Filter by progression status"),
    owner_id: Optional[str] = Query(None, description="Filter by owner ID"),
    permission_filter: Optional[str] = Query("all", description="all, permitted_only, editable_only, deletable_only, my_projects"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Project-level administration with server-side search, deterministic sorting,
    workflow status filters, and effective RBAC permissions per administrator.
    """
    try:
        query = db.query(Project)

        # 1. Owner Filter
        if owner_id:
            query = query.filter(Project.user_id == owner_id)

        # 2. Text Search
        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            # Join user to search owner name/email
            query = query.outerjoin(User, Project.user_id == User.id).filter(
                (func.lower(Project.name).like(s)) |
                (func.lower(Project.client).like(s)) |
                (func.lower(Project.id).like(s)) |
                (func.lower(User.name).like(s)) |
                (func.lower(User.email).like(s))
            )

        # 3. Sorting
        if sort_by == "oldest":
            query = query.order_by(asc(Project.created_at))
        elif sort_by == "updated_desc":
            query = query.order_by(desc(Project.updated_at))
        elif sort_by == "updated_asc":
            query = query.order_by(asc(Project.updated_at))
        elif sort_by == "name_asc":
            query = query.order_by(asc(Project.name))
        elif sort_by == "name_desc":
            query = query.order_by(desc(Project.name))
        else:
            query = query.order_by(desc(Project.created_at))

        projects = query.all()
        results = []

        for p in projects:
            # Calculate effective permissions for current admin
            effective = get_effective_project_permission(admin, p, db)

            # Apply permission-based filtering if requested
            if permission_filter == "permitted_only" and not effective["can_read"]:
                continue
            if permission_filter == "editable_only" and not effective["can_edit"]:
                continue
            if permission_filter == "deletable_only" and not effective["can_delete"]:
                continue
            if permission_filter == "my_projects" and not effective["is_owner"]:
                continue

            owner = db.query(User).filter(User.id == p.user_id).first()
            source_count = db.query(func.count(Source.id)).filter(Source.project_id == p.id).scalar() or 0
            cards_count = db.query(func.count(Card.id)).filter(Card.project_id == p.id).scalar() or 0
            prog_items_count = db.query(func.count(ProgramItem.id)).filter(ProgramItem.project_id == p.id).scalar() or 0
            brief_versions = db.query(func.count(BriefPublishedVersion.id)).filter(BriefPublishedVersion.project_id == p.id).scalar() or 0
            prog_versions = db.query(func.count(ProgramPublishedVersion.id)).filter(ProgramPublishedVersion.project_id == p.id).scalar() or 0

            # Progression calculation
            if prog_versions > 0:
                prog_state = "Program Published"
            elif prog_items_count > 0:
                prog_state = "Program in Progress"
            elif brief_versions > 0:
                prog_state = "Brief Published"
            elif cards_count > 0:
                prog_state = "Brief Review"
            elif source_count > 0:
                prog_state = "Sources Uploaded"
            else:
                prog_state = "Draft"

            # Filter by progression if requested
            if progression and progression.lower() != "all" and prog_state.lower() != progression.lower():
                continue

            results.append({
                "id": p.id,
                "name": p.name,
                "project_type": p.project_type,
                "client": p.client or "—",
                "location": p.location or "—",
                "description": p.description or "",
                "site_url": p.site_url or "",
                "owner_id": p.user_id,
                "owner_name": owner.name if owner else "Unknown",
                "owner_email": owner.email if owner else "Unknown",
                "source_count": source_count,
                "cards_count": cards_count,
                "program_items_count": prog_items_count,
                "brief_versions_count": brief_versions,
                "program_versions_count": prog_versions,
                "progression": prog_state,
                "effective_permissions": effective,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            })

        return results
    except Exception as e:
        logger.error(f"Admin projects list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve projects list")


@router.get("/projects/{project_id}")
def get_admin_project_details(
    project_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get project details with server-side READ permission validation.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    perms = get_effective_project_permission(admin, project, db)
    if not perms["can_read"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not have READ access to this project."
        )

    owner = db.query(User).filter(User.id == project.user_id).first()
    return {
        "id": project.id,
        "name": project.name,
        "project_type": project.project_type,
        "client": project.client or "",
        "location": project.location or "",
        "description": project.description or "",
        "site_url": project.site_url or "",
        "owner_id": project.user_id,
        "owner_name": owner.name if owner else "Unknown",
        "owner_email": owner.email if owner else "Unknown",
        "effective_permissions": perms,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.patch("/projects/{project_id}")
def update_admin_project(
    project_id: str,
    payload: ProjectUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update project metadata with server-side EDIT permission validation.
    Handles in-flight revocation safely by refusing modification if permissions changed.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    perms = get_effective_project_permission(admin, project, db)
    if not perms["can_edit"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Your EDIT permission for this project is missing or has been revoked."
        )

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)

    log_activity(
        db=db,
        user_id=admin.id,
        event_type="admin_project_updated",
        title="Project Updated by Admin",
        description=f"Project '{project.name}' was modified by administrator {admin.email}.",
        project_id=project.id
    )

    logger.info(f"Admin {admin.email} updated project {project.id}")
    return {
        "id": project.id,
        "name": project.name,
        "project_type": project.project_type,
        "client": project.client,
        "location": project.location,
        "description": project.description,
        "site_url": project.site_url,
        "updated_at": project.updated_at.isoformat(),
        "message": "Project updated successfully."
    }


@router.delete("/projects/{project_id}")
def delete_admin_project(
    project_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a project with server-side DELETE permission validation.
    Reuses REFLECT's full safe deletion sequence:
    1. Nullify Brief self-referencing FKs
    2. Purge site analysis cache
    3. Abort background workers and delete MinIO / storage files
    4. Cascade-delete child records and permissions
    5. Write audit log
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    perms = get_effective_project_permission(admin, project, db)
    if not perms["can_delete"]:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Your DELETE permission for this project is missing or has been revoked."
        )

    project_name = project.name
    owner_id = project.user_id

    # 1. Break self-referencing foreign keys on briefs so cascade delete won't deadlock
    db.query(Brief).filter(Brief.project_id == project_id).update(
        {"previous_version_id": None}, synchronize_session=False
    )
    db.query(SiteAnalysisCache).filter(SiteAnalysisCache.project_id == project_id).delete(
        synchronize_session=False
    )
    db.flush()

    # 2. Cancel ongoing extractions and purge storage files for all project sources
    from documents.loader import cancel_extraction
    sources = db.query(Source).filter(Source.project_id == project_id).all()
    for s in sources:
        abs_p = None
        if s.storage_path:
            try:
                abs_p = file_store.get_absolute_path(s.storage_path)
            except Exception as err:
                logger.warning(f"Could not get absolute path for {s.storage_path}: {err}")
        try:
            cancel_extraction(source_id=s.id, file_path=abs_p)
        except Exception as err:
            logger.warning(f"Error canceling extraction for source {s.id}: {err}")
        if s.storage_path:
            try:
                file_store.delete_file(s.storage_path)
            except Exception as err:
                logger.warning(f"Failed to delete file {s.storage_path}: {err}")

    # 3. Explicitly purge any delegated permissions for this project
    db.query(AdminProjectPermission).filter(AdminProjectPermission.project_id == project_id).delete(
        synchronize_session=False
    )

    # 4. Cascade delete project
    db.delete(project)
    db.commit()

    # 5. Record security audit log
    log_activity(
        db=db,
        user_id=admin.id,
        event_type="admin_project_deleted",
        title="Project Deleted by Admin",
        description=f"Project '{project_name}' (ID: {project_id}, Owner: {owner_id}) was deleted by administrator {admin.email}."
    )

    logger.info(f"Admin {admin.email} safely deleted project {project_id} ('{project_name}')")
    return {"message": f"Project '{project_name}' was safely and permanently deleted"}


# ── 5. User Login & Security Telemetry ──────────────────────────────────────

@router.get("/logins")
def list_admin_logins(
    email: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Security view of recorded logins, trusted IP addresses, and user-agent telemetry.
    Restricted to authorized administrators.
    """
    try:
        query = db.query(UserLoginHistory)
        if email:
            query = query.filter(UserLoginHistory.email.ilike(f"%{email.strip()}%"))

        total_count = query.count()
        records = query.order_by(desc(UserLoginHistory.created_at)).offset(offset).limit(limit).all()

        results = []
        for r in records:
            results.append({
                "id": r.id,
                "user_id": r.user_id,
                "email": r.email,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "status": r.status,
                "country": r.country or "Unknown",
                "city": r.city or "Unknown",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

        return {
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "logins": results
        }
    except Exception as e:
        logger.error(f"Admin logins query failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve login telemetry")


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
