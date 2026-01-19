#!/bin/bash
# =============================================================================
# Tamshai MCP Server Restart Script
# =============================================================================
#
# Restart MCP servers gracefully with health checks.
#
# Usage:
#   ./restart.sh [environment] [server]
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Servers:
#   all       - All MCP servers (default)
#   gateway   - MCP Gateway only
#   hr        - MCP HR only
#   finance   - MCP Finance only
#   sales     - MCP Sales only
#   support   - MCP Support only
#
# Examples:
#   ./restart.sh dev             # Restart all MCP servers in dev
#   ./restart.sh dev gateway     # Restart only MCP Gateway
#   ./restart.sh stage all       # Restart all on stage (VPS)
#
# Environment Variables (for stage):
#   VPS_HOST     - VPS IP address or hostname (required for stage restarts)
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
SERVER="${2:-all}"

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

# Container name mapping
declare -A CONTAINERS=(
    ["gateway"]="tamshai-mcp-gateway"
    ["hr"]="tamshai-mcp-hr"
    ["finance"]="tamshai-mcp-finance"
    ["sales"]="tamshai-mcp-sales"
    ["support"]="tamshai-mcp-support"
)

# Port mapping for health checks
declare -A PORTS=(
    ["gateway"]="3100"
    ["hr"]="3101"
    ["finance"]="3102"
    ["sales"]="3103"
    ["support"]="3104"
)

wait_for_health() {
    local name="$1"
    local port="$2"
    local base_url="$3"
    local max_attempts=30
    local attempt=0

    echo -n "  Waiting for $name to be healthy..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf --max-time 2 "$base_url:$port/health" >/dev/null 2>&1; then
            echo -e " ${GREEN}OK${NC}"
            return 0
        fi
        sleep 1
        ((attempt++))
        echo -n "."
    done

    echo -e " ${RED}TIMEOUT${NC}"
    return 1
}

restart_container_dev() {
    local name="$1"
    local container="${CONTAINERS[$name]}"
    local port="${PORTS[$name]}"
    local compose_file="$PROJECT_ROOT/infrastructure/docker/docker-compose.yml"

    log_info "Restarting $name ($container)..."

    # Check if container exists
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "Container $container not found, starting it..."
        docker compose -f "$compose_file" up -d "$container"
    else
        # Graceful restart
        docker compose -f "$compose_file" restart "$container"
    fi

    # Wait for health
    wait_for_health "$name" "$port" "http://localhost"
}

restart_container_stage() {
    local name="$1"
    local container="${CONTAINERS[$name]}"
    local port="${PORTS[$name]}"
    local vps_host="${VPS_HOST:-}"
    if [ -z "$vps_host" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi
    local vps_user="${VPS_SSH_USER:-root}"

    log_info "Restarting $name on stage ($vps_host)..."

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << RESTART
set -e
cd /opt/tamshai

# Graceful restart
docker compose restart $container

# Wait for health (simplified check)
for i in {1..30}; do
    if curl -sf --max-time 2 http://localhost:$port/health >/dev/null 2>&1; then
        echo "$name is healthy"
        exit 0
    fi
    sleep 1
done

echo "$name health check timed out"
exit 1
RESTART
}

restart_all() {
    log_header "Restarting All MCP Servers"

    local failed=0
    local servers=("gateway" "hr" "finance" "sales" "support")

    for server in "${servers[@]}"; do
        if [ "$ENV" = "dev" ]; then
            restart_container_dev "$server" || ((failed++))
        else
            restart_container_stage "$server" || ((failed++))
        fi
    done

    return $failed
}

restart_single() {
    local server="$1"

    if [ -z "${CONTAINERS[$server]:-}" ]; then
        log_error "Unknown server: $server"
        echo "Valid servers: gateway, hr, finance, sales, support, all"
        exit 1
    fi

    log_header "Restarting MCP $server"

    if [ "$ENV" = "dev" ]; then
        restart_container_dev "$server"
    else
        restart_container_stage "$server"
    fi
}

show_help() {
    echo "MCP Server Restart Script"
    echo ""
    echo "Usage: $0 [environment] [server]"
    echo ""
    echo "Environments:"
    echo "  dev    - Local Docker (default)"
    echo "  stage  - VPS staging server"
    echo ""
    echo "Servers:"
    echo "  all       - All MCP servers (default)"
    echo "  gateway   - MCP Gateway"
    echo "  hr        - MCP HR"
    echo "  finance   - MCP Finance"
    echo "  sales     - MCP Sales"
    echo "  support   - MCP Support"
}

main() {
    echo "MCP Server Restart"
    echo "Environment: $ENV"
    echo "Server: $SERVER"

    case "$SERVER" in
        all)
            restart_all
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            restart_single "$SERVER"
            ;;
    esac

    local exit_code=$?

    log_header "Summary"
    if [ $exit_code -eq 0 ]; then
        log_info "Restart complete"
    else
        log_error "Some servers failed to restart"
    fi

    return $exit_code
}

main "$@"
