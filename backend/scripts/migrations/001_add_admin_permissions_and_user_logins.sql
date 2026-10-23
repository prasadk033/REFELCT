-- Migration: 001_add_admin_permissions_and_user_logins.sql
-- Description: Add admin_project_permissions and user_logins tables for granular RBAC and security telemetry.

BEGIN;

-- 1. Admin Project Permissions Table
CREATE TABLE IF NOT EXISTS admin_project_permissions (
    id VARCHAR PRIMARY KEY,
    admin_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    can_read BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT uq_admin_project_permission UNIQUE (admin_user_id, project_id)
);

CREATE INDEX IF NOT EXISTS ix_admin_project_permissions_admin_user_id ON admin_project_permissions(admin_user_id);
CREATE INDEX IF NOT EXISTS ix_admin_project_permissions_project_id ON admin_project_permissions(project_id);

-- 2. User Logins Table (Security and Session Telemetry)
CREATE TABLE IF NOT EXISTS user_logins (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR NOT NULL,
    ip_address VARCHAR NOT NULL,
    user_agent TEXT,
    status VARCHAR NOT NULL DEFAULT 'success',
    country VARCHAR DEFAULT 'Unknown',
    city VARCHAR DEFAULT 'Unknown',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_user_logins_user_id ON user_logins(user_id);
CREATE INDEX IF NOT EXISTS ix_user_logins_created_at ON user_logins(created_at);

COMMIT;
