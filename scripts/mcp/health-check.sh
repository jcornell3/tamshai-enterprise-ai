#!/bin/bash
# =============================================================================
# Tamshai MCP Server Health Check
# =============================================================================
#
# Checks the health and connectivity of all MCP servers.
#
# Usage:
#   ./health-check.sh [environment]
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# =============================================================================

set -euo pipefail

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

# MCP Server definitions
declare -A MCP_SERVERS=(
    ["MCP Gateway"]="3100"
    ["MCP HR"]="3101"
    ["MCP Finance"]="3102"
    ["MCP Sales"]="3103"
    ["MCP Support"]="3104"
)

check_mcp_server() {
    local name="$1"
    local port="$2"
    local base_url="$3"

    local url="$base_url:$port/health"

    if curl -sf -o /dev/null --max-time 5 "$url" 2>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC} $name (port $port)"
        return 0
    else
        echo -e "  ${RED}[FAIL]${NC} $name (port $port)"
        return 1
    fi
}

check_mcp_tools() {
    local port="$1"
    local base_url="$2"

    # Get available tools from MCP server
    local url="$base_url:$port/tools"

    local response
    response=$(curl -sf --max-time 5 "$url" 2>/dev/null) || return 1

    echo "$response" | jq -r '.tools[] | "    - \(.name)"' 2>/dev/null || echo "    (unable to parse tools)"
}

main() {
    log_header "MCP Server Health Check"
    echo "Environment: $ENV"
    echo ""

    local base_url
    local failed=0

    if [ "$ENV" = "dev" ]; then
        base_url="http://localhost"
    else
        base_url="https://${VPS_HOST:-5.78.159.29}"
    fi

    echo "Checking MCP Servers..."
    echo ""

    for name in "${!MCP_SERVERS[@]}"; do
        local port="${MCP_SERVERS[$name]}"
        check_mcp_server "$name" "$port" "$base_url" || ((failed++))
    done

    log_header "MCP Gateway Details"

    # Check MCP Gateway specific endpoints
    local gateway_url="$base_url:3100"

    echo "Endpoint Checks:"
    for endpoint in "/health" "/api/health" "/api/query"; do
        if curl -sf -o /dev/null --max-time 5 "$gateway_url$endpoint" 2>/dev/null; then
            echo -e "  ${GREEN}[OK]${NC} $endpoint"
        else
            echo -e "  ${YELLOW}[?]${NC} $endpoint (may require auth)"
        fi
    done

    # Check Claude API connectivity (via gateway health)
    echo ""
    echo "Claude API Status:"
    local health_response
    health_response=$(curl -sf --max-time 5 "$gateway_url/health" 2>/dev/null) || health_response="{}"

    if echo "$health_response" | grep -q '"claude":"connected"' 2>/dev/null; then
        echo -e "  ${GREEN}[OK]${NC} Claude API connected"
    elif echo "$health_response" | grep -q '"status":"healthy"' 2>/dev/null; then
        echo -e "  ${YELLOW}[?]${NC} Gateway healthy (Claude status unknown)"
    else
        echo -e "  ${RED}[?]${NC} Unable to determine Claude API status"
    fi

    log_header "Summary"

    if [ $failed -eq 0 ]; then
        log_info "All MCP servers healthy"
    else
        log_error "$failed MCP server(s) failed health check"
    fi

    return $failed
}

main "$@"
