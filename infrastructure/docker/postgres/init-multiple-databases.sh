#!/bin/bash
# PostgreSQL initialization script to create multiple databases
# Format: database:user:password,database:user:password,...

set -e
set -u

function create_user_and_database() {
    local database=$1
    local user=$2
    local password=$3

    echo "Creating user '$user' and database '$database'"

    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
         -v db_user="$user" -v db_password="$password" -v db_name="$database" <<-'EOSQL'
        SELECT format('CREATE USER %I WITH PASSWORD %L', :'db_user', :'db_password')
        WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec

        SELECT format('ALTER ROLE %I NOBYPASSRLS', :'db_user')\gexec

        SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec

        SELECT format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'db_name', :'db_user')\gexec
EOSQL

    # Connect to the specific database and grant schema permissions
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" \
         -v db_user="$user" <<-'EOSQL'
        SELECT format('GRANT ALL ON SCHEMA public TO %I', :'db_user')\gexec
        SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', :'db_user')\gexec
        SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', :'db_user')\gexec
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"

    # Split by comma
    IFS=',' read -ra DATABASES <<< "$POSTGRES_MULTIPLE_DATABASES"

    for db_config in "${DATABASES[@]}"; do
        # Split by colon (database:user:password)
        IFS=':' read -r database user password <<< "$db_config"
        create_user_and_database "$database" "$user" "$password"
    done

    echo "Multiple databases created successfully"
fi

# Create tamshai_app user for MCP servers (RLS-enforced, no BYPASSRLS)
# This user is used by MCP servers to connect with Row-Level Security enforcement
if [ -n "${TAMSHAI_APP_PASSWORD:-}" ]; then
    echo "Creating tamshai_app user for RLS-enforced MCP connections..."

    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
         -v app_password="$TAMSHAI_APP_PASSWORD" <<-'EOSQL'
        SELECT format('CREATE ROLE tamshai_app WITH LOGIN PASSWORD %L', :'app_password')
        WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tamshai_app')\gexec

        -- Update password if user already exists (idempotent)
        SELECT format('ALTER ROLE tamshai_app WITH PASSWORD %L', :'app_password')
        WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tamshai_app')\gexec

        -- Ensure NO BYPASSRLS - critical for RLS enforcement
        ALTER ROLE tamshai_app NOBYPASSRLS;
EOSQL

    echo "tamshai_app user ready"
else
    echo "WARNING: TAMSHAI_APP_PASSWORD not set - tamshai_app user will use default password from SQL scripts"
fi
