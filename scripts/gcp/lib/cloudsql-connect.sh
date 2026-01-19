#!/bin/bash
# =============================================================================
# Cloud SQL Connection Helper for Cloud Build
# =============================================================================
#
# Downloads and starts Cloud SQL Proxy, then executes a command.
# Designed for use in Cloud Build steps where each step has isolated networking.
#
# Usage:
#   source /workspace/scripts/gcp/lib/cloudsql-connect.sh
#   cloudsql_exec "SELECT 1;" tamshai_hr
#   cloudsql_exec_file sample-data/hr-data.sql tamshai_hr
#
# Environment Variables (required):
#   DB_PASSWORD - PostgreSQL password
#   CLOUD_SQL_INSTANCE - Instance connection name (project:region:instance)
#
# =============================================================================

set -euo pipefail

PROXY_PID=""
PROXY_BINARY="/tmp/cloud-sql-proxy"
PROXY_VERSION="v2.14.0"

# Download Cloud SQL Proxy if not present
download_proxy() {
    if [ -f "$PROXY_BINARY" ]; then
        echo "[cloudsql] Proxy already downloaded"
        return 0
    fi

    echo "[cloudsql] Downloading Cloud SQL Proxy ${PROXY_VERSION}..."
    curl -fsSL -o "$PROXY_BINARY" \
        "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${PROXY_VERSION}/cloud-sql-proxy.linux.amd64"
    chmod +x "$PROXY_BINARY"
    echo "[cloudsql] Proxy downloaded successfully"
}

# Start Cloud SQL Proxy in background
start_proxy() {
    local instance="${CLOUD_SQL_INSTANCE:-}"

    if [ -z "$instance" ]; then
        echo "[cloudsql] ERROR: CLOUD_SQL_INSTANCE not set"
        return 1
    fi

    download_proxy

    echo "[cloudsql] Starting proxy for ${instance}..."
    "$PROXY_BINARY" "$instance" \
        --private-ip \
        --port=5432 \
        --quiet &
    PROXY_PID=$!

    # Wait for proxy to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost 5432 2>/dev/null; then
            echo "[cloudsql] Proxy ready (PID: $PROXY_PID)"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    echo "[cloudsql] ERROR: Proxy failed to start"
    return 1
}

# Stop Cloud SQL Proxy
stop_proxy() {
    if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" 2>/dev/null; then
        echo "[cloudsql] Stopping proxy (PID: $PROXY_PID)..."
        kill "$PROXY_PID" 2>/dev/null || true
        wait "$PROXY_PID" 2>/dev/null || true
        PROXY_PID=""
    fi
}

# Execute a SQL command
# Usage: cloudsql_exec "SELECT 1;" [database]
cloudsql_exec() {
    local sql="$1"
    local database="${2:-tamshai_hr}"

    export PGPASSWORD="${DB_PASSWORD:-}"
    psql -h localhost -p 5432 -U tamshai -d "$database" -c "$sql"
}

# Execute a SQL file
# Usage: cloudsql_exec_file path/to/file.sql [database]
cloudsql_exec_file() {
    local file="$1"
    local database="${2:-tamshai_hr}"

    export PGPASSWORD="${DB_PASSWORD:-}"
    psql -h localhost -p 5432 -U tamshai -d "$database" -f "$file"
}

# Execute a SQL command and return single value (trimmed)
# Usage: result=$(cloudsql_query "SELECT COUNT(*) FROM table;")
cloudsql_query() {
    local sql="$1"
    local database="${2:-tamshai_hr}"

    export PGPASSWORD="${DB_PASSWORD:-}"
    psql -h localhost -p 5432 -U tamshai -d "$database" -t -c "$sql" | tr -d ' \n'
}

# Cleanup on exit
trap stop_proxy EXIT

echo "[cloudsql] Helper loaded"
