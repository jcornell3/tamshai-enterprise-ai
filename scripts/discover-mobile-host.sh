#!/bin/bash
#
# Tamshai Mobile Development - Host Discovery Script (Linux/macOS)
#
# Automatically detects the LAN IP address of the development machine and generates
# a .env.mobile file for React Native mobile app development.
#
# Usage:
#   ./scripts/discover-mobile-host.sh
#
# Output:
#   infrastructure/docker/.env.mobile - Environment file with host IP
#
# Features:
#   - Detects primary LAN IP (192.168.x.x or 10.x.x.x)
#   - Generates mobile-specific environment variables
#   - Validates IP is accessible
#   - Creates backup of existing .env.mobile

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"
ENV_FILE="$DOCKER_DIR/.env.mobile"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Tamshai Mobile Development - Host Discovery                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

#------------------------------------------------------------------------------
# Function: Detect primary LAN IP address
#------------------------------------------------------------------------------
detect_lan_ip() {
    local lan_ip=""

    echo -e "${BLUE}→${NC} Detecting LAN IP address..."

    # Try different methods based on OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux: Use ip command
        lan_ip=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+' 2>/dev/null || true)

        # Fallback: hostname -I
        if [[ -z "$lan_ip" ]]; then
            lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
        fi

    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Use route command
        lan_ip=$(route -n get default 2>/dev/null | grep 'interface:' | awk '{print $2}')
        if [[ -n "$lan_ip" ]]; then
            lan_ip=$(ipconfig getifaddr "$lan_ip" 2>/dev/null || true)
        fi

        # Fallback: ifconfig
        if [[ -z "$lan_ip" ]]; then
            lan_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1 || true)
        fi
    fi

    # Validate IP format (basic check)
    if [[ ! "$lan_ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo -e "${RED}✗ Failed to detect valid LAN IP${NC}"
        echo ""
        echo "Detected value: ${lan_ip:-<empty>}"
        echo ""
        echo "Please manually find your LAN IP and run:"
        echo "  export MOBILE_HOST_IP=<your-ip>"
        echo "  ./scripts/discover-mobile-host.sh"
        exit 1
    fi

    # Warn if localhost
    if [[ "$lan_ip" == "127.0.0.1" ]]; then
        echo -e "${RED}✗ Detected localhost (127.0.0.1)${NC}"
        echo ""
        echo "Localhost will not work for mobile development."
        echo "Please ensure your machine has a LAN connection."
        exit 1
    fi

    echo -e "${GREEN}✓ Detected LAN IP: $lan_ip${NC}"
    echo "$lan_ip"
}

#------------------------------------------------------------------------------
# Function: Test connectivity to IP
#------------------------------------------------------------------------------
test_connectivity() {
    local ip="$1"

    echo -e "${BLUE}→${NC} Testing connectivity to $ip..."

    # Try to bind to the IP (tests if it's actually our IP)
    if command -v nc >/dev/null 2>&1; then
        # Use netcat to test binding (quick check)
        if timeout 1 nc -l -p 0 "$ip" 2>/dev/null; then
            echo -e "${GREEN}✓ IP is accessible${NC}"
            return 0
        fi
    fi

    # If netcat isn't available, just warn
    echo -e "${YELLOW}⚠ Could not verify connectivity (netcat not installed)${NC}"
    echo -e "  Proceeding anyway..."
    return 0
}

#------------------------------------------------------------------------------
# Function: Generate .env.mobile file
#------------------------------------------------------------------------------
generate_env_file() {
    local lan_ip="$1"

    echo -e "${BLUE}→${NC} Generating $ENV_FILE..."

    # Backup existing file if it exists
    if [[ -f "$ENV_FILE" ]]; then
        local backup="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$backup"
        echo -e "${YELLOW}⚠ Backed up existing file to $(basename "$backup")${NC}"
    fi

    # Generate new .env.mobile file
    cat > "$ENV_FILE" <<EOF
# Tamshai Mobile Development - Auto-generated Environment File
#
# Generated: $(date '+%Y-%m-%d %H:%M:%S')
# Host IP: $lan_ip
#
# This file is used by docker-compose.mobile.yml to configure services
# for React Native mobile app development over LAN.
#
# DO NOT commit this file to git (.env.mobile is in .gitignore)

#------------------------------------------------------------------------------
# HOST CONFIGURATION
#------------------------------------------------------------------------------

# Development machine's LAN IP address
MOBILE_HOST_IP=$lan_ip

#------------------------------------------------------------------------------
# KEYCLOAK CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Keycloak hostname (accessible from mobile device)
KC_HOSTNAME=$lan_ip
KC_HOSTNAME_PORT=8180
KC_HOSTNAME_STRICT=false
KC_HOSTNAME_STRICT_HTTPS=false

# Public URL for mobile apps
KEYCLOAK_URL=http://$lan_ip:8180

#------------------------------------------------------------------------------
# MCP GATEWAY CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# MCP Gateway URL (accessible from mobile device)
MCP_GATEWAY_URL=http://$lan_ip:3100

# CORS origins (allow mobile app)
CORS_ORIGINS=http://$lan_ip:8100,tamshai-mobile://oauth/callback,http://localhost:*

#------------------------------------------------------------------------------
# KONG GATEWAY CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Kong admin and proxy URLs
KONG_ADMIN_URL=http://$lan_ip:8001
KONG_PROXY_URL=http://$lan_ip:8100

#------------------------------------------------------------------------------
# REDIS CONFIGURATION (Mobile Override)
#------------------------------------------------------------------------------

# Redis host (for token revocation)
REDIS_HOST=$lan_ip
REDIS_PORT=6380

#------------------------------------------------------------------------------
# DATABASE CONFIGURATION (Read-Only - No Override Needed)
#------------------------------------------------------------------------------

# PostgreSQL, MongoDB, Elasticsearch are accessed via MCP servers
# Mobile apps do NOT connect directly to databases

#------------------------------------------------------------------------------
# MOBILE APP CONFIGURATION
#------------------------------------------------------------------------------

# OAuth redirect URI
MOBILE_REDIRECT_URI=tamshai-mobile://oauth/callback

# App environment
NODE_ENV=development
EOF

    echo -e "${GREEN}✓ Generated $ENV_FILE${NC}"
}

#------------------------------------------------------------------------------
# Function: Display usage instructions
#------------------------------------------------------------------------------
display_instructions() {
    local lan_ip="$1"

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ Mobile Development Environment Ready                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Host IP:${NC} $lan_ip"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo "  1. Start Docker services with mobile override:"
    echo -e "     ${YELLOW}cd infrastructure/docker${NC}"
    echo -e "     ${YELLOW}docker compose -f docker-compose.yml -f docker-compose.mobile.yml up -d${NC}"
    echo ""
    echo "  2. Verify services are accessible from mobile device:"
    echo -e "     ${YELLOW}curl http://$lan_ip:8180/health/ready${NC}  # Keycloak"
    echo -e "     ${YELLOW}curl http://$lan_ip:3100/health${NC}        # MCP Gateway"
    echo ""
    echo "  3. Configure mobile app to use these URLs:"
    echo "     - Keycloak: http://$lan_ip:8180"
    echo "     - MCP Gateway: http://$lan_ip:3100"
    echo "     - Kong Gateway: http://$lan_ip:8100"
    echo ""
    echo -e "${BLUE}Important:${NC}"
    echo "  - Ensure your mobile device is on the same network as this machine"
    echo "  - Windows users: Run setup-mobile-firewall.ps1 to allow inbound connections"
    echo "  - macOS/Linux users: Check firewall settings if connection fails"
    echo ""
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "  - Cannot connect from mobile: Check firewall settings"
    echo "  - Services unhealthy: Review docker-compose logs"
    echo "  - Wrong IP detected: Set MOBILE_HOST_IP env var and re-run"
    echo ""
}

#------------------------------------------------------------------------------
# Main Execution
#------------------------------------------------------------------------------
main() {
    # Check if manual IP is provided
    local lan_ip="${MOBILE_HOST_IP:-}"

    if [[ -z "$lan_ip" ]]; then
        # Auto-detect LAN IP
        lan_ip=$(detect_lan_ip)
    else
        echo -e "${YELLOW}⚠ Using manually specified IP: $lan_ip${NC}"
    fi

    # Test connectivity
    test_connectivity "$lan_ip"

    # Ensure docker directory exists
    mkdir -p "$DOCKER_DIR"

    # Generate .env.mobile file
    generate_env_file "$lan_ip"

    # Display instructions
    display_instructions "$lan_ip"
}

# Run main function
main "$@"
