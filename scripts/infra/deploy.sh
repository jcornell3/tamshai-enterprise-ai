#!/bin/bash
# =============================================================================
# Tamshai Service Deployment Script
# =============================================================================
#
# Deploy or restart Tamshai services in dev or stage environments.
# Idempotent - safe to run multiple times.
#
# Usage:
#   ./deploy.sh [environment] [options]
#
# Environments:
#   dev    - Local Docker Compose (default)
#   stage  - VPS staging server
#
# Options:
#   --build      Rebuild containers before deploying
#   --service=X  Deploy only specific service (e.g., --service=keycloak)
#   --sync       Run Keycloak sync after deployment
#   --pull       Pull latest images before deploying
#
# Examples:
#   ./deploy.sh                           # Deploy all services in dev
#   ./deploy.sh dev --build               # Rebuild and deploy dev
#   ./deploy.sh stage                     # Deploy to stage (requires SSH)
#   ./deploy.sh dev --service=mcp-gateway # Deploy only MCP Gateway
#   ./deploy.sh dev --sync                # Deploy and sync Keycloak
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
ENV="${1:-dev}"
BUILD_FLAG=""
SERVICE=""
SYNC_KEYCLOAK=false
PULL_FLAG=""

for arg in "$@"; do
    case $arg in
        dev|stage|prod) ENV="$arg" ;;
        --build) BUILD_FLAG="--build" ;;
        --service=*) SERVICE="${arg#*=}" ;;
        --sync) SYNC_KEYCLOAK=true ;;
        --pull) PULL_FLAG="--pull" ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

deploy_dev() {
    log_header "Deploying to Dev Environment"

    local compose_file="$PROJECT_ROOT/infrastructure/docker/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        exit 1
    fi

    cd "$PROJECT_ROOT/infrastructure/docker"

    # Check if .env exists
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_warn ".env not found, copying from .env.example"
            cp .env.example .env
        else
            log_error ".env file required"
            exit 1
        fi
    fi

    # Deploy
    local deploy_cmd="docker compose up -d $BUILD_FLAG $PULL_FLAG"
    if [ -n "$SERVICE" ]; then
        deploy_cmd="$deploy_cmd $SERVICE"
        log_info "Deploying service: $SERVICE"
    else
        log_info "Deploying all services"
    fi

    eval "$deploy_cmd"

    # Wait for services
    log_info "Waiting for services to start..."
    sleep 10

    # Health check
    "$SCRIPT_DIR/status.sh" dev || true

    # Sync Keycloak if requested
    if [ "$SYNC_KEYCLOAK" = true ]; then
        sync_keycloak_dev
    fi

    log_info "Dev deployment complete"
}

deploy_stage() {
    log_header "Deploying to Stage Environment"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    if [ -z "${VPS_HOST:-}" ]; then
        log_warn "VPS_HOST not set, using default: $vps_host"
    fi

    log_info "Connecting to $vps_user@$vps_host..."

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << DEPLOY_SCRIPT
set -e
cd /opt/tamshai

echo "=== Pulling latest code ==="
git fetch origin
git checkout main
git reset --hard origin/main

echo "=== Loading environment ==="
export \$(cat .env | grep -v '^#' | xargs)

echo "=== Deploying services ==="
docker compose up -d ${BUILD_FLAG:---build}

echo "=== Waiting for services ==="
sleep 30

echo "=== Health check ==="
curl -sf http://localhost:3100/health && echo " MCP Gateway: OK" || echo " MCP Gateway: Starting..."
curl -sf http://localhost:8080/auth/health/ready && echo " Keycloak: OK" || echo " Keycloak: Starting..."

echo "=== Deployment complete ==="
DEPLOY_SCRIPT

    # Sync Keycloak if requested
    if [ "$SYNC_KEYCLOAK" = true ]; then
        sync_keycloak_stage
    fi

    log_info "Stage deployment complete"
}

sync_keycloak_dev() {
    log_header "Syncing Keycloak (Dev)"

    local sync_script="$PROJECT_ROOT/keycloak/scripts/sync-realm.sh"

    # Copy and run sync script in container
    docker cp "$sync_script" tamshai-keycloak:/tmp/sync-realm.sh
    docker exec -u 0 tamshai-keycloak bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh && chmod 755 /tmp/sync-realm.sh'
    docker exec tamshai-keycloak /tmp/sync-realm.sh dev

    log_info "Keycloak sync complete"
}

sync_keycloak_stage() {
    log_header "Syncing Keycloak (Stage)"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    ssh "$vps_user@$vps_host" << 'SYNC_SCRIPT'
cd /opt/tamshai
export $(cat .env | grep -v '^#' | xargs)

echo "=== Waiting for Keycloak to be ready ==="
for i in 1 2 3 4 5; do
    if curl -sf http://localhost:8080/auth/health/ready >/dev/null 2>&1; then
        echo "Keycloak is ready"
        break
    fi
    echo "Waiting for Keycloak... attempt $i/5"
    sleep 15
done

echo "=== Syncing Keycloak realm (clients, roles) ==="
docker cp keycloak/scripts/sync-realm.sh tamshai-keycloak:/tmp/sync-realm.sh
docker exec -u 0 tamshai-keycloak bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh && chmod 755 /tmp/sync-realm.sh'
docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" tamshai-keycloak /tmp/sync-realm.sh stage

echo "=== Syncing HR users to Keycloak ==="
# Use --build to ensure latest code is used (image may be cached)
docker compose run --rm --build identity-sync || echo "[WARN] Identity sync failed - check logs: docker logs tamshai-identity-sync"
SYNC_SCRIPT

    log_info "Keycloak sync complete (realm + users)"
}

main() {
    echo "Tamshai Deployment Script"
    echo "Environment: $ENV"
    echo "Options: build=$BUILD_FLAG service=$SERVICE sync=$SYNC_KEYCLOAK"
    echo ""

    case "$ENV" in
        dev)
            deploy_dev
            ;;
        stage)
            deploy_stage
            ;;
        prod)
            log_error "Production deployment not supported via script - use CI/CD"
            exit 1
            ;;
        *)
            log_error "Unknown environment: $ENV"
            exit 1
            ;;
    esac
}

main "$@"
