-- Create the Reflect application database and user
-- This runs on first initialization of the PostgreSQL container

-- Create reflect user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'reflect') THEN
        CREATE ROLE reflect WITH LOGIN PASSWORD 'ReflectPostgres2026';
    END IF;
END
$$;

-- Create reflect database if not exists
SELECT 'CREATE DATABASE reflect OWNER reflect'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reflect');

-- The above SELECT trick doesn't execute CREATE. Use this approach instead:
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reflect') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE reflect OWNER reflect');
    END IF;
EXCEPTION
    WHEN others THEN
        -- dblink may not be available, create directly
        NULL;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE reflect TO reflect;
