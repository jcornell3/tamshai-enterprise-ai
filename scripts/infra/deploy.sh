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
#   --reseed     Reload all sample data (Finance, Sales, Support, Payroll)
#
# Examples:
#   ./deploy.sh                           # Deploy all services in dev
#   ./deploy.sh dev --build               # Rebuild and deploy dev
#   ./deploy.sh stage                     # Deploy to stage (requires SSH)
#   ./deploy.sh dev --service=mcp-gateway # Deploy only MCP Gateway
#   ./deploy.sh dev --sync                # Deploy and sync Keycloak
#   ./deploy.sh dev --reseed              # Reload sample data (dev)
#   ./deploy.sh stage --reseed            # Reload sample data (stage via SSH)
#
# Environment Variables (for stage):
#   VPS_HOST     - VPS IP address or hostname (required for stage deployments)
#   VPS_SSH_USER - SSH username (default: root)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

# Parse arguments
ENV="${1:-dev}"
BUILD_FLAG=""
SERVICE=""
SYNC_KEYCLOAK=false
PULL_FLAG=""
RESEED_DATA=false

for arg in "$@"; do
    case $arg in
        dev|stage|prod) ENV="$arg" ;;
        --build) BUILD_FLAG="--build" ;;
        --service=*) SERVICE="${arg#*=}" ;;
        --sync) SYNC_KEYCLOAK=true ;;
        --pull) PULL_FLAG="--pull" ;;
        --reseed) RESEED_DATA=true ;;
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

reseed_data_dev() {
    log_header "Re-seeding Sample Data (Dev)"

    cd "$PROJECT_ROOT"

    # Get MongoDB password from .env
    local mongo_pass
    mongo_pass=$(grep '^MONGODB_ROOT_PASSWORD=' infrastructure/docker/.env 2>/dev/null | cut -d= -f2 | sed "s/^'//;s/'$//") || mongo_pass="tamshai_password"

    log_info "[1/4] Stopping MCP services..."
    docker stop tamshai-mcp-finance tamshai-mcp-sales tamshai-mcp-support 2>/dev/null || true

    log_info "[2/4] Reloading Finance data (PostgreSQL)..."
    if docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;" && \
       docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;" && \
       docker exec -i tamshai-postgres psql -U tamshai -d tamshai_finance < sample-data/finance-data.sql; then
        log_info "Finance database reloaded"
    else
        log_warn "Finance data reload failed"
    fi

    log_info "[3/4] Reloading Sales data (MongoDB)..."
    if docker exec -i tamshai-mongodb mongosh -u tamshai -p "$mongo_pass" --authenticationDatabase admin < sample-data/sales-data.js; then
        log_info "Sales data reloaded"
    else
        log_warn "Sales data reload failed"
    fi

    log_info "[4/4] Reloading Support data (Elasticsearch)..."
    # Delete existing indexes
    docker exec tamshai-elasticsearch curl -X DELETE "http://localhost:9200/support_tickets,knowledge_base" 2>/dev/null || true
    # Bulk load fresh data
    if cat sample-data/support-data.ndjson | docker exec -i tamshai-elasticsearch curl -X POST "http://localhost:9200/_bulk" \
        -H "Content-Type: application/x-ndjson" --data-binary @- >/dev/null 2>&1; then
        log_info "Support data reloaded"
    else
        log_warn "Support data reload failed"
    fi

    log_info "Restarting MCP services..."
    docker start tamshai-mcp-finance tamshai-mcp-sales tamshai-mcp-support 2>/dev/null || true
    docker restart tamshai-mcp-gateway 2>/dev/null || true
    sleep 5

    log_info "Verifying data counts..."
    echo "  Finance budgets:"
    docker exec tamshai-postgres psql -U tamshai -d tamshai_finance -c "SELECT fiscal_year, COUNT(*) FROM finance.department_budgets GROUP BY fiscal_year ORDER BY fiscal_year;" 2>/dev/null || echo "  (Finance DB not available)"
    echo "  Sales deals:"
    docker exec tamshai-mongodb mongosh -u tamshai -p "$mongo_pass" --authenticationDatabase admin tamshai_sales --quiet --eval "print(db.deals.countDocuments())" 2>/dev/null || echo "  (MongoDB not available)"
    echo "  Support tickets:"
    docker exec tamshai-elasticsearch curl -s "http://localhost:9200/support_tickets/_count" 2>/dev/null | grep -o '"count":[0-9]*' || echo "  (Elasticsearch not available)"

    log_info "Sample data re-seed complete"
}

reseed_data_stage() {
    log_header "Re-seeding Sample Data (Stage)"

    local vps_host="${VPS_HOST:-}"
    local vps_user="${VPS_SSH_USER:-root}"

    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set for stage reseed"
        exit 1
    fi

    log_info "Connecting to $vps_user@$vps_host for data reseed..."

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << 'RESEED_SCRIPT'
set -e
cd /opt/tamshai

echo "=== Loading environment ==="
export $(cat .env | grep -v '^#' | xargs)

echo "=== [1/7] Stopping MCP services ==="
docker stop tamshai-dev-mcp-hr tamshai-dev-mcp-finance tamshai-dev-mcp-sales tamshai-dev-mcp-support tamshai-dev-mcp-payroll tamshai-dev-mcp-tax 2>/dev/null || true

echo "=== [2/7] Reloading HR data (PostgreSQL) ==="
if docker exec tamshai-dev-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_hr;" && \
   docker exec tamshai-dev-postgres psql -U postgres -c "CREATE DATABASE tamshai_hr OWNER tamshai;" && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_hr -f /docker-entrypoint-initdb.d/02-hr-data.sql; then
    echo "[OK] HR database reloaded"
else
    echo "[WARN] HR data reload failed"
fi

echo "=== [3/7] Reloading Finance data (PostgreSQL) ==="
if docker exec tamshai-dev-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_finance;" && \
   docker exec tamshai-dev-postgres psql -U postgres -c "CREATE DATABASE tamshai_finance OWNER tamshai;" && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_finance -f /docker-entrypoint-initdb.d/03-finance-data.sql; then
    echo "[OK] Finance database reloaded"
else
    echo "[WARN] Finance data reload failed"
fi

echo "=== [4/7] Reloading Payroll data (PostgreSQL) ==="
if docker exec tamshai-dev-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_payroll;" && \
   docker exec tamshai-dev-postgres psql -U postgres -c "CREATE DATABASE tamshai_payroll OWNER tamshai;" && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_payroll -f /docker-entrypoint-initdb.d/04-payroll-schema.sql && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_payroll -f /docker-entrypoint-initdb.d/05-payroll-data.sql; then
    echo "[OK] Payroll database reloaded"
else
    echo "[WARN] Payroll data reload failed"
fi

echo "=== [5/7] Reloading Tax data (PostgreSQL) ==="
if docker exec tamshai-dev-postgres psql -U postgres -c "DROP DATABASE IF EXISTS tamshai_tax;" && \
   docker exec tamshai-dev-postgres psql -U postgres -c "CREATE DATABASE tamshai_tax OWNER tamshai;" && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_tax -f /docker-entrypoint-initdb.d/06-tax-schema.sql && \
   docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_tax -f /docker-entrypoint-initdb.d/07-tax-data.sql; then
    echo "[OK] Tax database reloaded"
else
    echo "[WARN] Tax data reload failed"
fi

echo "=== [6/7] Reloading Sales data (MongoDB) ==="
MONGO_PASS="${MONGODB_PASSWORD:-tamshai_password}"
if docker exec tamshai-dev-mongodb mongosh -u tamshai -p "$MONGO_PASS" --authenticationDatabase admin /docker-entrypoint-initdb.d/01-sales-data.js; then
    echo "[OK] Sales data reloaded"
else
    echo "[WARN] Sales data reload failed"
fi

echo "=== [7/7] Reloading Support data (Elasticsearch) ==="
# Delete existing indexes
docker exec tamshai-dev-elasticsearch curl -X DELETE "http://localhost:9200/support_tickets,knowledge_base" 2>/dev/null || true
# Bulk load fresh data from VPS filesystem
if cat /opt/tamshai/sample-data/support-data.ndjson | docker exec -i tamshai-dev-elasticsearch curl -X POST "http://localhost:9200/_bulk" \
    -H "Content-Type: application/x-ndjson" --data-binary @- >/dev/null 2>&1; then
    echo "[OK] Support data reloaded"
else
    echo "[WARN] Support data reload failed"
fi

echo "=== Restarting MCP services ==="
docker start tamshai-dev-mcp-hr tamshai-dev-mcp-finance tamshai-dev-mcp-sales tamshai-dev-mcp-support tamshai-dev-mcp-payroll tamshai-dev-mcp-tax 2>/dev/null || true
docker restart tamshai-dev-mcp-gateway 2>/dev/null || true
sleep 5

echo "=== Verifying data counts ==="
echo "HR employees:"
docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_hr -t -c "SELECT COUNT(*) FROM hr.employees;" 2>/dev/null || echo "  (HR DB not available)"
echo "Finance budgets:"
docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_finance -c "SELECT fiscal_year, COUNT(*) FROM finance.department_budgets GROUP BY fiscal_year ORDER BY fiscal_year;" 2>/dev/null || echo "  (Finance DB not available)"
echo "Payroll employees:"
docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_payroll -t -c "SELECT COUNT(*) FROM payroll.employees;" 2>/dev/null || echo "  (Payroll DB not available)"
echo "Tax filings:"
docker exec tamshai-dev-postgres psql -U tamshai -d tamshai_tax -t -c "SELECT COUNT(*) FROM tax.tax_filings;" 2>/dev/null || echo "  (Tax DB not available)"
echo "Sales deals:"
docker exec tamshai-dev-mongodb mongosh -u tamshai -p "$MONGO_PASS" --authenticationDatabase admin tamshai_sales --quiet --eval "print(db.deals.countDocuments())" 2>/dev/null || echo "  (MongoDB not available)"
echo "Support tickets:"
docker exec tamshai-dev-elasticsearch curl -s "http://localhost:9200/support_tickets/_count" 2>/dev/null | grep -o '"count":[0-9]*' || echo "  (Elasticsearch not available)"

echo "=== Sample data re-seed complete ==="
RESEED_SCRIPT

    log_info "Stage sample data re-seed complete"
}

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

    # Reseed data if requested
    if [ "$RESEED_DATA" = true ]; then
        reseed_data_dev
    fi

    log_info "Dev deployment complete"
}

deploy_stage() {
    log_header "Deploying to Stage Environment"

    local vps_host="${VPS_HOST:-}"
    local vps_user="${VPS_SSH_USER:-root}"

    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
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

    # Reseed data if requested
    if [ "$RESEED_DATA" = true ]; then
        reseed_data_stage
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

    # Sync customer realm
    log_info "Syncing customer realm..."
    local customer_sync_script="$PROJECT_ROOT/keycloak/scripts/sync-customer-realm.sh"
    local lib_dir="$PROJECT_ROOT/keycloak/scripts/lib"
    docker cp "$customer_sync_script" tamshai-keycloak:/tmp/sync-customer-realm.sh
    docker cp "$lib_dir" tamshai-keycloak:/tmp/lib
    docker exec -u 0 tamshai-keycloak bash -c '
        sed -i "s/\r$//" /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec sed -i "s/\r$//" {} \;
        chmod 755 /tmp/sync-customer-realm.sh
        find /tmp/lib -name "*.sh" -exec chmod +x {} \;
    '
    docker exec -e CUSTOMER_USER_PASSWORD="${CUSTOMER_USER_PASSWORD:-}" tamshai-keycloak /tmp/sync-customer-realm.sh dev

    log_info "Keycloak sync complete (employee + customer realms)"
}

sync_keycloak_stage() {
    log_header "Syncing Keycloak (Stage)"

    local vps_host="${VPS_HOST:-}"
    local vps_user="${VPS_SSH_USER:-root}"

    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi

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

echo "=== Syncing customer realm ==="
docker cp keycloak/scripts/sync-customer-realm.sh tamshai-keycloak:/tmp/sync-customer-realm.sh
docker cp keycloak/scripts/lib tamshai-keycloak:/tmp/lib
docker exec -u 0 tamshai-keycloak bash -c '
    sed -i "s/\r$//" /tmp/sync-customer-realm.sh
    find /tmp/lib -name "*.sh" -exec sed -i "s/\r$//" {} \;
    chmod 755 /tmp/sync-customer-realm.sh
    find /tmp/lib -name "*.sh" -exec chmod +x {} \;
'
docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" -e CUSTOMER_USER_PASSWORD="${CUSTOMER_USER_PASSWORD:-}" tamshai-keycloak /tmp/sync-customer-realm.sh stage

echo "=== Syncing HR users to Keycloak ==="
# Use --build to ensure latest code is used (image may be cached)
docker compose run --rm --build identity-sync || echo "[WARN] Identity sync failed - check logs: docker logs tamshai-identity-sync"
SYNC_SCRIPT

    log_info "Keycloak sync complete (realm + users)"
}

main() {
    echo "Tamshai Deployment Script"
    echo "Environment: $ENV"
    echo "Options: build=$BUILD_FLAG service=$SERVICE sync=$SYNC_KEYCLOAK reseed=$RESEED_DATA"
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
