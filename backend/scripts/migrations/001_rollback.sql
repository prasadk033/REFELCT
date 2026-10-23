-- Rollback Migration: 001_rollback.sql
-- Description: Drop admin_project_permissions and user_logins tables cleanly.

BEGIN;

DROP TABLE IF EXISTS admin_project_permissions CASCADE;
DROP TABLE IF EXISTS user_logins CASCADE;

COMMIT;
