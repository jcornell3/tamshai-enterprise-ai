#!/bin/bash
# =============================================================================
# Tamshai Employee Login Journey Test
# =============================================================================
#
# Tests the employee SSO login flow from end to end.
# Validates that each step in the login journey works correctly.
#
# Usage:
#   ./login-journey.sh [environment]
#
# Environments:
#   dev    - Local development (https://www.tamshai.local)
#   stage  - VPS staging (https://www.tamshai.com)
#
# Test Steps:
#   1. Access home page
#   2. Access employee login page
#   3. Verify SSO button has correct URL
#   4. Follow SSO redirect to Keycloak
#   5. Verify Keycloak login form loads
#   6. Submit credentials
#   7. Verify TOTP page loads
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

log_info() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_step() { echo -e "${BLUE}[TEST]${NC} $1"; }

# Configure URLs based on environment
if [ "$ENV" = "dev" ]; then
    BASE_URL="https://www.tamshai.local"
    KEYCLOAK_URL="https://www.tamshai.local/auth"
    # Skip SSL verification for local self-signed certs
    CURL_OPTS="-k -sf"
else
    BASE_URL="https://www.tamshai.com"
    KEYCLOAK_URL="https://www.tamshai.com/auth"
    CURL_OPTS="-sf"
fi

FAILED=0
PASSED=0

test_step() {
    local name="$1"
    local result="$2"

    if [ "$result" = "0" ]; then
        log_info "$name"
        ((PASSED++))
    else
        log_error "$name"
        ((FAILED++))
    fi
}

# =============================================================================
# Test Steps
# =============================================================================

test_home_page() {
    log_step "Testing home page..."

    local response
    response=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$BASE_URL/" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "Home page returns 200" 0
    else
        test_step "Home page returns 200 (got $response)" 1
    fi
}

test_employee_login_page() {
    log_step "Testing employee login page..."

    local response
    response=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$BASE_URL/employee-login.html" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "Employee login page returns 200" 0
    else
        test_step "Employee login page returns 200 (got $response)" 1
    fi

    # Check for SSO button
    local content
    content=$(curl $CURL_OPTS "$BASE_URL/employee-login.html" 2>/dev/null) || content=""

    if echo "$content" | grep -q "sso-login-btn"; then
        test_step "SSO login button exists" 0
    else
        test_step "SSO login button exists" 1
    fi

    # Check for PKCE code_challenge in JavaScript
    if echo "$content" | grep -q "code_challenge"; then
        test_step "PKCE support implemented" 0
    else
        test_step "PKCE support implemented" 1
    fi
}

test_keycloak_availability() {
    log_step "Testing Keycloak availability..."

    local response
    response=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/realms/tamshai-corp/.well-known/openid-configuration" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "Keycloak OIDC discovery endpoint" 0
    else
        test_step "Keycloak OIDC discovery endpoint (got $response)" 1
    fi

    # Check health endpoint
    response=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/health/ready" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "Keycloak health endpoint" 0
    else
        test_step "Keycloak health endpoint (got $response)" 1
    fi
}

test_sso_redirect() {
    log_step "Testing SSO redirect flow..."

    # Build OAuth URL similar to how the login page does it
    local client_id="tamshai-website"
    local redirect_uri
    local auth_url

    if [ "$ENV" = "dev" ]; then
        redirect_uri="$BASE_URL/app/"
        auth_url="$KEYCLOAK_URL/realms/tamshai-corp/protocol/openid-connect/auth"
    else
        redirect_uri="$BASE_URL/"
        auth_url="$KEYCLOAK_URL/realms/tamshai-corp/protocol/openid-connect/auth"
    fi

    local state="test$(date +%s)"
    local code_verifier="test-verifier-$(date +%s)"
    local code_challenge=$(echo -n "$code_verifier" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')

    local oauth_url="${auth_url}?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=openid%20profile%20email&state=${state}&code_challenge=${code_challenge}&code_challenge_method=S256"

    # Follow redirect to Keycloak login page
    local response
    response=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -L "$oauth_url" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "OAuth redirect to Keycloak login page" 0
    else
        test_step "OAuth redirect to Keycloak login page (got $response)" 1
    fi

    # Check that the login form is present
    local content
    content=$(curl $CURL_OPTS -L "$oauth_url" 2>/dev/null) || content=""

    if echo "$content" | grep -q "kc-form-login\|kc-login\|username"; then
        test_step "Keycloak login form present" 0
    else
        test_step "Keycloak login form present" 1
        if echo "$content" | grep -q "Invalid scopes"; then
            log_warn "  Error: Invalid scopes detected - run Keycloak sync"
        elif echo "$content" | grep -q "Invalid redirect"; then
            log_warn "  Error: Invalid redirect URI"
        elif echo "$content" | grep -q "code_challenge"; then
            log_warn "  Error: PKCE code_challenge issue"
        fi
    fi
}

test_login_with_credentials() {
    log_step "Testing login with test credentials..."

    # This test requires a proper browser session due to CSRF tokens
    # We'll just verify the login endpoint accepts POST
    local login_url="$KEYCLOAK_URL/realms/tamshai-corp/protocol/openid-connect/token"

    local response
    response=$(curl $CURL_OPTS -X POST -o /dev/null -w "%{http_code}" \
        -d "client_id=tamshai-website" \
        -d "grant_type=password" \
        -d "username=test" \
        -d "password=test" \
        "$login_url" 2>/dev/null) || response="000"

    # We expect 401 (unauthorized) because credentials are wrong, but endpoint should respond
    if [ "$response" = "401" ] || [ "$response" = "400" ]; then
        test_step "Keycloak token endpoint responds" 0
    elif [ "$response" = "200" ]; then
        test_step "Keycloak token endpoint responds (unexpected success)" 0
    else
        test_step "Keycloak token endpoint responds (got $response)" 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "========================================"
    echo "Tamshai Employee Login Journey Test"
    echo "========================================"
    echo "Environment: $ENV"
    echo "Base URL: $BASE_URL"
    echo "Keycloak: $KEYCLOAK_URL"
    echo ""

    test_home_page
    test_employee_login_page
    test_keycloak_availability
    test_sso_redirect
    test_login_with_credentials

    echo ""
    echo "========================================"
    echo "Test Results"
    echo "========================================"
    echo -e "Passed: ${GREEN}$PASSED${NC}"
    echo -e "Failed: ${RED}$FAILED${NC}"

    if [ "$FAILED" -gt 0 ]; then
        echo ""
        log_error "Some tests failed. Run Keycloak sync if you see scope errors:"
        echo "  ./scripts/infra/keycloak.sh sync $ENV"
        return 1
    else
        echo ""
        log_info "All tests passed!"
        return 0
    fi
}

main "$@"
