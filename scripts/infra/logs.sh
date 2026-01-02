#!/bin/bash
# =============================================================================
# Tamshai Service Log Viewer
# =============================================================================
#
# View logs from Tamshai services.
#
# Usage:
#   ./logs.sh [service] [options]
#
# Services:
#   all         - All services (default)
#   gateway     - MCP Gateway
#   keycloak    - Keycloak
#   kong        - Kong Gateway
#   postgres    - PostgreSQL
#   mongodb     - MongoDB
#   redis       - Redis
#   caddy       - Caddy reverse proxy
#   website     - Corporate website
#
# Options:
#   -f, --follow    Follow log output
#   -n <lines>      Number of lines to show (default: 100)
#   --since <time>  Show logs since timestamp (e.g., 10m, 1h)
#
# Examples:
#   ./logs.sh gateway                # Last 100 lines from MCP Gateway
#   ./logs.sh gateway -f             # Follow MCP Gateway logs
#   ./logs.sh keycloak -n 500        # Last 500 lines from Keycloak
#   ./logs.sh all --since 30m        # All logs from last 30 minutes
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SERVICE="${1:-all}"
shift || true

# Parse options
FOLLOW=""
LINES="100"
SINCE=""

while [ $# -gt 0 ]; do
    case "$1" in
        -f|--follow) FOLLOW="-f"; shift ;;
        -n) LINES="$2"; shift 2 ;;
        --since) SINCE="--since $2"; shift 2 ;;
        *) shift ;;
    esac
done

# Container name mapping
declare -A CONTAINERS=(
    ["gateway"]="tamshai-mcp-gateway"
    ["mcp-gateway"]="tamshai-mcp-gateway"
    ["keycloak"]="tamshai-keycloak"
    ["kong"]="tamshai-kong"
    ["postgres"]="tamshai-postgres"
    ["mongodb"]="tamshai-mongodb"
    ["redis"]="tamshai-redis"
    ["caddy"]="tamshai-caddy"
    ["website"]="tamshai-website"
    ["vault"]="tamshai-vault"
    ["elasticsearch"]="tamshai-elasticsearch"
    ["minio"]="tamshai-minio"
    ["hr"]="tamshai-mcp-hr"
    ["finance"]="tamshai-mcp-finance"
    ["sales"]="tamshai-mcp-sales"
    ["support"]="tamshai-mcp-support"
)

view_logs() {
    local container="$1"

    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "Container $container not found"
        return 1
    fi

    docker logs --tail "$LINES" $FOLLOW $SINCE "$container" 2>&1
}

view_all_logs() {
    local compose_file="$PROJECT_ROOT/infrastructure/docker/docker-compose.yml"

    if [ -f "$compose_file" ]; then
        cd "$PROJECT_ROOT/infrastructure/docker"
        docker compose logs --tail "$LINES" $FOLLOW $SINCE 2>&1
    else
        echo "Compose file not found, showing individual container logs"
        for container in "${CONTAINERS[@]}"; do
            if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
                echo "=== $container ==="
                docker logs --tail 20 "$container" 2>&1 | head -30
                echo ""
            fi
        done
    fi
}

show_help() {
    echo "Service Log Viewer"
    echo ""
    echo "Usage: $0 [service] [options]"
    echo ""
    echo "Services:"
    echo "  all, gateway, keycloak, kong, postgres, mongodb, redis,"
    echo "  caddy, website, vault, elasticsearch, minio, hr, finance,"
    echo "  sales, support"
    echo ""
    echo "Options:"
    echo "  -f, --follow    Follow log output"
    echo "  -n <lines>      Number of lines (default: 100)"
    echo "  --since <time>  Logs since time (e.g., 10m, 1h)"
}

main() {
    case "$SERVICE" in
        all)
            view_all_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            if [ -n "${CONTAINERS[$SERVICE]:-}" ]; then
                view_logs "${CONTAINERS[$SERVICE]}"
            else
                echo "Unknown service: $SERVICE"
                echo ""
                show_help
                exit 1
            fi
            ;;
    esac
}

main "$@"
