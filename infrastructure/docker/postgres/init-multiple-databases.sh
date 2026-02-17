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
    
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
                CREATE USER $user WITH PASSWORD '$password';
            END IF;
        END
        \$\$;

        -- Ensure user does NOT have BYPASSRLS to enforce RLS policies
        ALTER ROLE $user NOBYPASSRLS;
        
        SELECT 'CREATE DATABASE $database OWNER $user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE $database TO $user;
EOSQL

    # Connect to the specific database and grant schema permissions
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" <<-EOSQL
        GRANT ALL ON SCHEMA public TO $user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $user;
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

    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tamshai_app') THEN
                CREATE ROLE tamshai_app WITH LOGIN PASSWORD '$TAMSHAI_APP_PASSWORD';
                RAISE NOTICE 'Created tamshai_app user';
            ELSE
                -- Update password if user already exists (idempotent)
                ALTER ROLE tamshai_app WITH PASSWORD '$TAMSHAI_APP_PASSWORD';
                RAISE NOTICE 'Updated tamshai_app password';
            END IF;
            -- Ensure NO BYPASSRLS - critical for RLS enforcement
            ALTER ROLE tamshai_app NOBYPASSRLS;
        END
        \$\$;
EOSQL

    echo "tamshai_app user ready"
else
    echo "WARNING: TAMSHAI_APP_PASSWORD not set - tamshai_app user will use default password from SQL scripts"
fi
