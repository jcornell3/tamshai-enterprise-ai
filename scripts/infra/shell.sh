#!/bin/bash
# =============================================================================
# Tamshai Service Shell Access
# =============================================================================
#
# Quick shell access to running containers.
#
# Usage:
#   ./shell.sh <service> [shell]
#
# Services:
#   gateway     - MCP Gateway (Node.js)
#   keycloak    - Keycloak (Java)
#   kong        - Kong Gateway
#   postgres    - PostgreSQL
#   mongodb     - MongoDB
#   redis       - Redis
#   caddy       - Caddy reverse proxy
#   vault       - HashiCorp Vault
#
# Shells:
#   sh          - Bourne shell (default for Alpine)
#   bash        - Bash shell
#   psql        - PostgreSQL client (postgres only)
#   mongosh     - MongoDB shell (mongodb only)
#   redis-cli   - Redis CLI (redis only)
#
# Examples:
#   ./shell.sh gateway              # Shell into MCP Gateway
#   ./shell.sh postgres psql        # PostgreSQL client
#   ./shell.sh mongodb mongosh      # MongoDB shell
#   ./shell.sh redis redis-cli      # Redis CLI
#
# =============================================================================

set -euo pipefail

SERVICE="${1:-}"
SHELL_CMD="${2:-}"

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

# Default shells for services
declare -A DEFAULT_SHELLS=(
    ["gateway"]="/bin/sh"
    ["mcp-gateway"]="/bin/sh"
    ["keycloak"]="/bin/bash"
    ["kong"]="/bin/sh"
    ["postgres"]="psql -U tamshai -d tamshai"
    ["mongodb"]="mongosh"
    ["redis"]="redis-cli"
    ["caddy"]="/bin/sh"
    ["website"]="/bin/sh"
    ["vault"]="/bin/sh"
    ["elasticsearch"]="/bin/bash"
    ["minio"]="/bin/sh"
)

show_help() {
    echo "Service Shell Access"
    echo ""
    echo "Usage: $0 <service> [shell]"
    echo ""
    echo "Services:"
    echo "  gateway, keycloak, kong, postgres, mongodb, redis,"
    echo "  caddy, website, vault, elasticsearch, minio,"
    echo "  hr, finance, sales, support"
    echo ""
    echo "Special commands:"
    echo "  postgres psql    - PostgreSQL client"
    echo "  mongodb mongosh  - MongoDB shell"
    echo "  redis redis-cli  - Redis CLI"
    echo ""
    echo "Examples:"
    echo "  $0 gateway           # Shell into MCP Gateway"
    echo "  $0 postgres          # PostgreSQL client (default)"
    echo "  $0 postgres bash     # Bash shell in postgres container"
}

main() {
    if [ -z "$SERVICE" ] || [ "$SERVICE" = "help" ] || [ "$SERVICE" = "--help" ] || [ "$SERVICE" = "-h" ]; then
        show_help
        exit 0
    fi

    if [ -z "${CONTAINERS[$SERVICE]:-}" ]; then
        echo "Unknown service: $SERVICE"
        echo ""
        show_help
        exit 1
    fi

    local container="${CONTAINERS[$SERVICE]}"

    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "Container $container is not running"
        echo ""
        echo "Start it with: cd infrastructure/docker && docker compose up -d"
        exit 1
    fi

    # Determine shell command
    local shell_cmd
    if [ -n "$SHELL_CMD" ]; then
        shell_cmd="$SHELL_CMD"
    elif [ -n "${DEFAULT_SHELLS[$SERVICE]:-}" ]; then
        shell_cmd="${DEFAULT_SHELLS[$SERVICE]}"
    else
        shell_cmd="/bin/sh"
    fi

    echo "Connecting to $container..."
    docker exec -it "$container" $shell_cmd
}

main "$@"
