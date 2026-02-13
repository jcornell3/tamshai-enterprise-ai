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

# Run the sync script inside the container
echo "Running realm sync ($REALM_TYPE)..."
echo ""

# Pass environment variables for stage/prod and customer realm
if [ "$REALM_TYPE" = "customers" ]; then
    docker exec -e CUSTOMER_USER_PASSWORD="${CUSTOMER_USER_PASSWORD:-}" \
        -e KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
        "$CONTAINER" /tmp/$SYNC_SCRIPT "$ENV"
elif [ "$ENV" = "stage" ] || [ "$ENV" = "prod" ]; then
    docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
        "$CONTAINER" /tmp/$SYNC_SCRIPT "$ENV"
else
    docker exec "$CONTAINER" /tmp/$SYNC_SCRIPT "$ENV"
fi

echo ""
echo "Realm sync complete ($REALM_TYPE)!"
