#!/bin/bash
# =============================================================================
# Docker Wrapper for Keycloak Realm Sync
# =============================================================================
#
# This script runs the realm sync inside the Keycloak Docker container.
# Run this from the host machine (not inside Docker).
#
# Usage:
#   ./docker-sync-realm.sh [environment] [container_name] [realm_type]
#
# Arguments:
#   environment    - dev (default), stage, or prod
#   container_name - Docker container name (default: tamshai-keycloak)
#   realm_type     - corp (default) or customers
#
# Examples:
#   ./docker-sync-realm.sh dev                              # Employee realm, default container
#   ./docker-sync-realm.sh dev tamshai-keycloak              # Employee realm, specific container
#   ./docker-sync-realm.sh dev tamshai-keycloak customers    # Customer realm
#   ./docker-sync-realm.sh stage keycloak                    # Stage employee realm
#
# Required Environment Variables (for corp realm):
#   MCP_GATEWAY_CLIENT_SECRET     - Set in .env or exported
#   MCP_UI_CLIENT_SECRET          - Set in .env or exported
#   MCP_HR_SERVICE_CLIENT_SECRET  - Set in .env or exported
#   KEYCLOAK_ADMIN_PASSWORD       - Set in .env or exported (stage/prod: required)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${1:-dev}"
CONTAINER="${2:-tamshai-keycloak}"
REALM_TYPE="${3:-corp}"

echo "Keycloak Realm Sync - Docker Wrapper"
echo "Environment: $ENV"
echo "Container: $CONTAINER"
echo "Realm Type: $REALM_TYPE"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Container '$CONTAINER' is not running"
    echo "Available containers:"
    docker ps --format '{{.Names}}' | grep -i keycloak || echo "  (none found)"
    exit 1
fi

# Determine which sync script to use based on realm type
if [ "$REALM_TYPE" = "customers" ]; then
    SYNC_SCRIPT="sync-customer-realm.sh"
else
    SYNC_SCRIPT="sync-realm.sh"
fi

# Copy the sync script and library modules to the container
echo "Copying sync scripts to container..."
docker cp "$SCRIPT_DIR/$SYNC_SCRIPT" "$CONTAINER:/tmp/$SYNC_SCRIPT"
docker cp "$SCRIPT_DIR/lib" "$CONTAINER:/tmp/lib"

# Fix line endings (Windows -> Unix) and make executable
echo "Preparing scripts..."
docker exec "$CONTAINER" bash -c "
    sed -i 's/\r$//' /tmp/$SYNC_SCRIPT 2>/dev/null || true
    find /tmp/lib -name '*.sh' -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
    chmod +x /tmp/$SYNC_SCRIPT
    find /tmp/lib -name '*.sh' -exec chmod +x {} \;
"

# =============================================================================
# Load secrets from .env file (all environments)
# =============================================================================
# The sync script requires client secrets (MCP_GATEWAY_CLIENT_SECRET, etc.)
# Source the .env file so these are available, then validate they exist.
ENV_FILE="$SCRIPT_DIR/../../infrastructure/docker/.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading secrets from $ENV_FILE..."
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^#' "$ENV_FILE" | grep -v '^$')
    set +a
else
    echo "WARNING: $ENV_FILE not found - secrets must be exported in environment"
fi

# =============================================================================
# Validate required secrets (fail hard if missing)
# =============================================================================
if [ "$REALM_TYPE" = "corp" ]; then
    MISSING_SECRETS=()

    if [ -z "${MCP_GATEWAY_CLIENT_SECRET:-}" ]; then
        MISSING_SECRETS+=("MCP_GATEWAY_CLIENT_SECRET")
    fi
    if [ -z "${MCP_UI_CLIENT_SECRET:-}" ]; then
        MISSING_SECRETS+=("MCP_UI_CLIENT_SECRET")
    fi
    if [ -z "${MCP_HR_SERVICE_CLIENT_SECRET:-}" ]; then
        MISSING_SECRETS+=("MCP_HR_SERVICE_CLIENT_SECRET")
    fi
    if [ "$ENV" != "dev" ] && [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        MISSING_SECRETS+=("KEYCLOAK_ADMIN_PASSWORD")
    fi

    if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
        echo ""
        echo "ERROR: Required secrets are not set:"
        for secret in "${MISSING_SECRETS[@]}"; do
            echo "  - $secret"
        done
        echo ""
        echo "These must be defined in $ENV_FILE or exported in your environment."
        echo "See infrastructure/docker/.env.example for reference."
        exit 1
    fi
    echo "All required secrets loaded"
fi

# Run the sync script inside the container
echo "Running realm sync ($REALM_TYPE)..."
echo ""

# Pass environment variables to the container
if [ "$REALM_TYPE" = "customers" ]; then
    docker exec -e CUSTOMER_USER_PASSWORD="${CUSTOMER_USER_PASSWORD:-}" \
        -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
        "$CONTAINER" /tmp/$SYNC_SCRIPT "$ENV"
else
    docker exec \
        -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
        -e MCP_GATEWAY_CLIENT_SECRET="$MCP_GATEWAY_CLIENT_SECRET" \
        -e MCP_UI_CLIENT_SECRET="$MCP_UI_CLIENT_SECRET" \
        -e MCP_HR_SERVICE_CLIENT_SECRET="$MCP_HR_SERVICE_CLIENT_SECRET" \
        -e TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-}" \
        "$CONTAINER" /tmp/$SYNC_SCRIPT "$ENV"
fi

echo ""
echo "Realm sync complete ($REALM_TYPE)!"
