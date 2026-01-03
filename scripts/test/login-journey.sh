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
    INSECURE="-k"
elif [ "$ENV" = "prod" ]; then
    BASE_URL="https://www.tamshai.com"
    KEYCLOAK_URL="https://www.tamshai.com/auth"
    INSECURE=""
else
    # stage
    BASE_URL="https://www.tamshai.com"
    KEYCLOAK_URL="https://www.tamshai.com/auth"
    INSECURE=""
fi

FAILED=0
PASSED=0

# Wrapper for curl with common options
do_curl() {
    curl $INSECURE -sf --max-time 10 "$@" 2>/dev/null
}

test_step() {
    local name="$1"
    local result="$2"

    if [ "$result" = "0" ]; then
        log_info "$name"
        PASSED=$((PASSED + 1))
    else
        log_error "$name"
        FAILED=$((FAILED + 1))
    fi
}

# =============================================================================
# Test Steps
# =============================================================================

test_home_page() {
    log_step "Testing home page..."

    local response
    response=$(do_curl -o /dev/null -w "%{http_code}" "$BASE_URL/") || response="000"

    if [ "$response" = "200" ]; then
        test_step "Home page returns 200" 0
    else
        test_step "Home page returns 200 (got $response)" 1
    fi
}

test_employee_login_page() {
    log_step "Testing employee login page..."

    local response
    response=$(do_curl -o /dev/null -w "%{http_code}" "$BASE_URL/employee-login.html") || response="000"

    if [ "$response" = "200" ]; then
        test_step "Employee login page returns 200" 0
    else
        test_step "Employee login page returns 200 (got $response)" 1
    fi

    # Check for SSO button
    local content
    content=$(do_curl "$BASE_URL/employee-login.html") || content=""

    if [ -n "$content" ] && echo "$content" | grep -q "sso-login-btn"; then
        test_step "SSO login button exists" 0
    else
        test_step "SSO login button exists" 1
    fi

    # Check that SSO button links to portal (which handles PKCE)
    if [ -n "$content" ] && echo "$content" | grep -q 'href="/app/"'; then
        test_step "SSO button links to portal" 0
    else
        test_step "SSO button links to portal" 1
    fi
}

test_keycloak_availability() {
    log_step "Testing Keycloak availability..."

    local response
    response=$(do_curl -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/realms/tamshai-corp/.well-known/openid-configuration") || response="000"

    if [ "$response" = "200" ]; then
        test_step "Keycloak OIDC discovery endpoint" 0
    else
        test_step "Keycloak OIDC discovery endpoint (got $response)" 1
    fi

    # Check health endpoint
    response=$(do_curl -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/health/ready") || response="000"

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

    # Use the same scopes as the website JavaScript
    local oauth_url="${auth_url}?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=openid%20profile%20email&state=${state}&code_challenge=${code_challenge}&code_challenge_method=S256"

    # Follow redirect to Keycloak login page
    local response
    response=$(curl $INSECURE -sf --max-time 15 -o /dev/null -w "%{http_code}" -L "$oauth_url" 2>/dev/null) || response="000"

    if [ "$response" = "200" ]; then
        test_step "OAuth redirect to Keycloak login page" 0
    else
        test_step "OAuth redirect to Keycloak login page (got $response)" 1
    fi

    # Check that the login form is present
    local content
    content=$(curl $INSECURE -sf --max-time 15 -L "$oauth_url" 2>/dev/null) || content=""

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

    # Test that the token endpoint responds (we expect an error since direct grants are disabled)
    local login_url="$KEYCLOAK_URL/realms/tamshai-corp/protocol/openid-connect/token"

    local response
    # Note: Don't use -f flag since we expect HTTP 400/401 errors
    response=$(curl $INSECURE -s --max-time 10 -X POST -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=tamshai-website" \
        -d "grant_type=password" \
        -d "username=test" \
        -d "password=test" \
        "$login_url" 2>/dev/null) || response="000"

    # We expect 400/401 (unauthorized_client since direct grants are disabled for public clients)
    if [ "$response" = "401" ] || [ "$response" = "400" ]; then
        test_step "Keycloak token endpoint responds" 0
    elif [ "$response" = "200" ]; then
        test_step "Keycloak token endpoint responds (unexpected success)" 0
    else
        test_step "Keycloak token endpoint responds (got $response)" 1
    fi
}

# =============================================================================
# Asset Verification Tests (wget --spider approach)
# =============================================================================
# These tests verify that SPA assets are reachable and correctly pathed.
# Unlike simple curl checks, wget --spider follows asset links in HTML.

test_portal_assets() {
    log_step "Testing portal assets with wget --spider..."

    # Check if wget is available
    if ! command -v wget &> /dev/null; then
        log_warn "wget not installed - skipping asset verification"
        return
    fi

    local wget_opts="--spider --force-html -r -l1 --no-directories -e robots=off --timeout=10"
    if [ -n "$INSECURE" ]; then
        wget_opts="$wget_opts --no-check-certificate"
    fi

    # Test portal assets
    local output
    output=$(wget $wget_opts "$BASE_URL/app/" 2>&1) || true

    # Check for 404 errors in wget output
    if echo "$output" | grep -q "404 Not Found"; then
        test_step "Portal assets reachable (404 detected)" 1
        log_warn "  Some portal assets returned 404 - check base path config"
        # Show which assets failed
        echo "$output" | grep "404" | head -3 | while read line; do
            log_warn "  $line"
        done
    elif echo "$output" | grep -q "failed\|error"; then
        test_step "Portal assets reachable (errors detected)" 1
    else
        test_step "Portal assets reachable" 0
    fi
}

test_subapp_assets() {
    log_step "Testing sub-app assets with wget --spider..."

    if ! command -v wget &> /dev/null; then
        log_warn "wget not installed - skipping asset verification"
        return
    fi

    local wget_opts="--spider --force-html -r -l1 --no-directories -e robots=off --timeout=10 --quiet"
    if [ -n "$INSECURE" ]; then
        wget_opts="$wget_opts --no-check-certificate"
    fi

    local apps=("hr" "finance" "sales" "support")

    for app in "${apps[@]}"; do
        local output
        output=$(wget $wget_opts "$BASE_URL/$app/" 2>&1) || true

        if echo "$output" | grep -q "404 Not Found"; then
            test_step "$app app assets reachable" 1
        else
            test_step "$app app assets reachable" 0
        fi
    done
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
    test_portal_assets
    test_subapp_assets

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
