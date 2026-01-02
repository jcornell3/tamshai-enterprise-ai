#!/bin/bash
# =============================================================================
# Docker Wrapper for Keycloak Realm Sync
# =============================================================================
#
# This script runs the realm sync inside the Keycloak Docker container.
# Run this from the host machine (not inside Docker).
#
# Usage:
#   ./docker-sync-realm.sh [environment] [container_name]
#
# Examples:
#   ./docker-sync-realm.sh dev                    # Local dev, default container
#   ./docker-sync-realm.sh dev tamshai-keycloak   # Local dev, specific container
#   ./docker-sync-realm.sh stage keycloak         # Stage environment
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${1:-dev}"
CONTAINER="${2:-tamshai-keycloak}"

echo "Keycloak Realm Sync - Docker Wrapper"
echo "Environment: $ENV"
echo "Container: $CONTAINER"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Container '$CONTAINER' is not running"
    echo "Available containers:"
    docker ps --format '{{.Names}}' | grep -i keycloak || echo "  (none found)"
    exit 1
fi

# Copy the sync script to the container
echo "Copying sync script to container..."
docker cp "$SCRIPT_DIR/sync-realm.sh" "$CONTAINER:/tmp/sync-realm.sh"

# Fix line endings (Windows -> Unix) and make executable
echo "Preparing script..."
docker exec "$CONTAINER" bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh 2>/dev/null || true'
docker exec "$CONTAINER" chmod +x /tmp/sync-realm.sh

# Run the sync script inside the container
echo "Running realm sync..."
echo ""

# Pass environment variables for stage/prod
if [ "$ENV" = "stage" ] || [ "$ENV" = "prod" ]; then
    docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" \
        "$CONTAINER" /tmp/sync-realm.sh "$ENV"
else
    docker exec "$CONTAINER" /tmp/sync-realm.sh "$ENV"
fi

echo ""
echo "Realm sync complete!"
