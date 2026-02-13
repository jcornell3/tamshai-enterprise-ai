#!/bin/bash
# =============================================================================
# Tamshai Service Status Check
# =============================================================================
#
# Checks the health status of all Tamshai services.
# Works in both dev (local Docker) and stage (VPS) environments.
#
# Usage:
#   ./status.sh [environment]
#
# Environments:
#   dev    - Local Docker Compose (default)
#   stage  - VPS staging server
#
# Examples:
#   ./status.sh           # Check local dev
#   ./status.sh dev       # Check local dev
#   ./status.sh stage     # Check VPS stage (requires SSH)
#
# Environment Variables (for stage):
#   VPS_HOST     - VPS IP address or hostname (required for stage checks)
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

ENV="${1:-dev}"

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

# Service definitions
declare -A SERVICES=(
    ["MCP Gateway"]="3100|/health"
    ["Keycloak"]="8080|/auth/health/ready"
    ["Kong Gateway"]="8100|/status"
    ["PostgreSQL"]="5432|"
    ["MongoDB"]="27017|"
    ["Redis"]="6379|"
)

check_http_health() {
    local name="$1"
    local url="$2"
    local timeout="${3:-5}"

    if curl -sf -o /dev/null --max-time "$timeout" "$url" 2>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC} $name"
        return 0
    else
        echo -e "  ${RED}[FAIL]${NC} $name"
        return 1
    fi
}

check_tcp_port() {
    local name="$1"
    local host="$2"
    local port="$3"

    if nc -z "$host" "$port" 2>/dev/null || timeout 2 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC} $name (port $port)"
        return 0
    else
        echo -e "  ${RED}[FAIL]${NC} $name (port $port)"
        return 1
    fi
}

check_docker_containers() {
    log_header "Docker Containers"

    if ! command -v docker &>/dev/null; then
        log_error "Docker not found"
        return 1
    fi

    local compose_file="$PROJECT_ROOT/infrastructure/docker/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_warn "Compose file not found: $compose_file"
        return 1
    fi

    echo "  Container Status:"
    docker compose -f "$compose_file" ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}" 2>/dev/null || \
        docker ps --format "table {{.Names}}\t{{.Status}}" --filter "name=tamshai"
}

check_local_services() {
    log_header "Service Health Endpoints"

    local base_url="http://localhost"
    local failed=0

    # HTTP services
    check_http_health "MCP Gateway" "$base_url:3100/health" || ((failed++))
    check_http_health "Keycloak" "$base_url:8180/auth/health/ready" || ((failed++))
    check_http_health "Kong Admin" "$base_url:8101/status" || ((failed++))

    log_header "Database Connections"

    # TCP services
    check_tcp_port "PostgreSQL" "localhost" "5433" || ((failed++))
    check_tcp_port "MongoDB" "localhost" "27018" || ((failed++))
    check_tcp_port "Redis" "localhost" "6380" || ((failed++))

    return $failed
}

check_stage_services() {
    log_header "Stage Services (VPS)"

    local vps_host="${VPS_HOST:-}"
    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi

    local base_url="https://$vps_host"
    local failed=0

    echo "  Checking $vps_host..."

    # External HTTPS endpoints (via Caddy)
    check_http_health "Website" "$base_url/" || ((failed++))
    check_http_health "Keycloak" "$base_url/auth/health/ready" || ((failed++))
    check_http_health "API Gateway" "$base_url/api/health" 10 || ((failed++))

    # If SSH access is available, check internal services
    if [ -n "${VPS_SSH_USER:-}" ]; then
        log_header "Internal Services (via SSH)"
        ssh -o ConnectTimeout=10 "${VPS_SSH_USER}@${vps_host}" << 'EOF'
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=tamshai"
EOF
    else
        log_warn "Set VPS_SSH_USER for internal service checks"
    fi

    return $failed
}

show_endpoints() {
    log_header "Service Endpoints"

    if [ "$ENV" = "dev" ]; then
        echo "  Website:      http://localhost:8080 or https://www.tamshai-playground.local"
        echo "  Keycloak:     http://localhost:8180"
        echo "  MCP Gateway:  http://localhost:3100"
        echo "  Kong Gateway: http://localhost:8100"
        echo "  Portal:       http://localhost:4000"
        echo "  PostgreSQL:   localhost:5433"
        echo "  MongoDB:      localhost:27018"
        echo "  Redis:        localhost:6380"
    else
        echo "  Website:      https://www.tamshai.com"
        echo "  Keycloak:     https://www.tamshai.com/auth"
        echo "  API:          https://www.tamshai.com/api"
    fi
}

main() {
    echo "Tamshai Service Status Check"
    echo "Environment: $ENV"
    echo "Time: $(date)"

    local failed=0

    if [ "$ENV" = "dev" ]; then
        check_docker_containers || true
        check_local_services || ((failed++))
    else
        check_stage_services || ((failed++))
    fi

    show_endpoints

    log_header "Summary"
    if [ $failed -eq 0 ]; then
        log_info "All services healthy"
    else
        log_error "$failed service check(s) failed"
    fi

    return $failed
}

main "$@"
