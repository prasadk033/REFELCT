#!/bin/bash
set -e

# PostgreSQL initialization script.
# Uses environment variables provided by docker-compose / .env instead of hardcoded plaintext passwords.

REFLECT_USER="${REFLECT_DB_USER:-reflect}"
REFLECT_PASS="${REFLECT_DB_PASSWORD:-ReflectPostgres2026}"
REFLECT_DB="${REFLECT_DB_NAME:-reflect}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${REFLECT_USER}') THEN
            CREATE ROLE ${REFLECT_USER} WITH LOGIN PASSWORD '${REFLECT_PASS}';
        ELSE
            ALTER ROLE ${REFLECT_USER} WITH PASSWORD '${REFLECT_PASS}';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE ${REFLECT_DB} OWNER ${REFLECT_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${REFLECT_DB}')\gexec

    GRANT ALL PRIVILEGES ON DATABASE ${REFLECT_DB} TO ${REFLECT_USER};
EOSQL

echo "PostgreSQL initialization completed for database '${REFLECT_DB}' and user '${REFLECT_USER}'."
