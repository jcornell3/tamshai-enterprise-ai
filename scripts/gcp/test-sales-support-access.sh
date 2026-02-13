#!/bin/bash
# =============================================================================
# GCP Sales & Support Data Access Test
# =============================================================================
#
# Tests Sales and Support MCP servers via Gateway with proper JWT authentication.
# Uses test-user.journey account (has no data access roles, safe for testing).
#
# Usage:
#   ./test-sales-support-access.sh [environment]
#
# Environments:
#   prod   - GCP production (default)
#   dev    - Local development
#
# =============================================================================

set -euo pipefail

ENV="${1:-prod}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[TEST]${NC} $1"; }

# Test user credentials (test-user.journey - no data access, safe)
TEST_USERNAME="test-user.journey"

# Token exchange service account (preferred - no password or TOTP needed)
RUNNER_SECRET="${MCP_INTEGRATION_RUNNER_SECRET:-}"

# ROPC fallback credentials (only used when RUNNER_SECRET is not set)
TEST_PASSWORD="${TEST_PASSWORD:-}"
TOTP_SECRET="${TEST_TOTP_SECRET:-}"

if [ -z "$RUNNER_SECRET" ] && [ -z "$TEST_PASSWORD" ]; then
    log_error "Authentication credentials required"
    log_error "Preferred: export MCP_INTEGRATION_RUNNER_SECRET=\$(gh secret get MCP_INTEGRATION_RUNNER_SECRET)"
    log_error "Fallback:  export TEST_PASSWORD=\$(gh secret get TEST_USER_PASSWORD)"
    exit 1
fi

# Environment configuration
case "$ENV" in
    prod)
        GATEWAY_URL="https://mcp-gateway-fn44nd7wba-uc.a.run.app"
        KEYCLOAK_URL="https://keycloak-fn44nd7wba-uc.a.run.app/auth"
        CLIENT_ID="tamshai-website"
        ;;
    dev)
        GATEWAY_URL="http://localhost:3100"
        KEYCLOAK_URL="http://localhost:8180/auth"
        CLIENT_ID="tamshai-website"
        ;;
    *)
        log_error "Unknown environment: $ENV"
        exit 1
        ;;
esac

echo "====================================="
echo "Sales & Support Data Access Test"
echo "====================================="
echo "Environment: $ENV"
echo "Gateway: $GATEWAY_URL"
echo ""

# Generate TOTP code (only needed for ROPC fallback)
generate_totp() {
    if ! command -v oathtool &> /dev/null; then
        log_error "oathtool not installed. Install with: winget install oath-toolkit"
        exit 1
    fi
    oathtool --totp --base32 "$TOTP_SECRET"
}

# Get JWT token from Keycloak
get_jwt_token() {
    log_step "Getting JWT token from Keycloak..."

    local token_endpoint="${KEYCLOAK_URL}/realms/tamshai-corp/protocol/openid-connect/token"
    local token_response

    if [ -n "$RUNNER_SECRET" ]; then
        # Preferred: Token exchange via mcp-integration-runner (no password/TOTP needed)
        log_info "Using token exchange (mcp-integration-runner)"

        # Step 1: Get service account token
        local svc_response
        svc_response=$(curl -s -X POST "$token_endpoint" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=mcp-integration-runner" \
            -d "client_secret=${RUNNER_SECRET}" \
            -d "grant_type=client_credentials" 2>&1) || {
            log_error "Failed to get service token"
            echo "$svc_response"
            exit 1
        }

        local svc_token
        svc_token=$(echo "$svc_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null) || {
            log_error "Failed to parse service token response"
            echo "$svc_response"
            exit 1
        }

        if [ -z "$svc_token" ]; then
            log_error "No service account token received"
            echo "Response: $svc_response"
            exit 1
        fi

        # Step 2: Exchange for user token
        token_response=$(curl -s -X POST "$token_endpoint" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=mcp-integration-runner" \
            -d "client_secret=${RUNNER_SECRET}" \
            -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
            -d "subject_token=${svc_token}" \
            -d "requested_subject=${TEST_USERNAME}" \
            -d "scope=openid profile roles" 2>&1) || {
            log_error "Failed to exchange token for ${TEST_USERNAME}"
            echo "$token_response"
            exit 1
        }
    else
        # Fallback: ROPC with password + TOTP
        log_warn "Using ROPC fallback (requires direct_access_grants_enabled=true)"

        if [ -z "$TOTP_SECRET" ]; then
            log_warn "TEST_TOTP_SECRET not set - TOTP authentication may fail"
        fi

        local totp_code
        totp_code=$(generate_totp)
        log_info "Generated TOTP code: $totp_code"

        token_response=$(curl -s -X POST "$token_endpoint" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=${CLIENT_ID}" \
            -d "grant_type=password" \
            -d "username=${TEST_USERNAME}" \
            -d "password=${TEST_PASSWORD}" \
            -d "scope=openid profile email" \
            -d "totp=${totp_code}" 2>&1) || {
            log_error "Failed to get token from Keycloak"
            echo "$token_response"
            exit 1
        }
    fi

    # Extract access token
    JWT_TOKEN=$(echo "$token_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null) || {
        log_error "Failed to parse token response"
        echo "$token_response"
        exit 1
    }

    if [ -z "$JWT_TOKEN" ]; then
        log_error "No access token received"
        echo "Response: $token_response"
        exit 1
    fi

    log_info "JWT token obtained successfully"
}

# Test Sales endpoints
test_sales() {
    log_step "Testing Sales MCP Server..."

    # Test 1: List customers
    echo ""
    echo "  [1] List customers:"
    local response
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/sales/list_customers?limit=5")

    local http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    local body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        local count=$(echo "$body" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null || echo "0")
        log_info "Success - Found $count customers"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi

    # Test 2: List deals
    echo ""
    echo "  [2] List deals:"
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/sales/list_deals?limit=5")

    http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        local count=$(echo "$body" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null || echo "0")
        log_info "Success - Found $count deals"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi

    # Test 3: Get pipeline summary
    echo ""
    echo "  [3] Get pipeline summary:"
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/sales/get_pipeline_summary")

    http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        log_info "Success - Pipeline summary retrieved"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi
}

# Test Support endpoints
test_support() {
    log_step "Testing Support MCP Server..."

    # Test 1: List tickets
    echo ""
    echo "  [1] List tickets:"
    local response
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/support/list_tickets?limit=5")

    local http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    local body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        local count=$(echo "$body" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null || echo "0")
        log_info "Success - Found $count tickets"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi

    # Test 2: Get ticket by ID
    echo ""
    echo "  [2] Get ticket TICK-001:"
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/support/get_ticket?ticketId=TICK-001")

    http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        log_info "Success - Ticket retrieved"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi

    # Test 3: Get ticket summary
    echo ""
    echo "  [3] Get ticket summary:"
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        "${GATEWAY_URL}/api/mcp/support/get_ticket_summary")

    http_code=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')

    if [ "$http_code" = "200" ]; then
        log_info "Success - Ticket summary retrieved"
        echo "$body" | python3 -m json.tool | head -20
    else
        log_error "Failed - HTTP $http_code"
        echo "$body"
    fi
}

# Main
get_jwt_token
echo ""
test_sales
echo ""
test_support
echo ""
log_info "Testing complete!"
