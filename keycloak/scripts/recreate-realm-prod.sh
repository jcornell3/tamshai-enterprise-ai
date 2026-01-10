#!/bin/bash
#
# Recreate Keycloak Realm in Production
#
# Purpose: Delete and reimport the tamshai-corp realm to enable TOTP credential import.
#          Keycloak's --import-realm only imports TOTP credentials during initial realm
#          creation, not when updating existing users.
#
# ⚠️ WARNING: This script DELETES the entire tamshai-corp realm!
#             Only use when no corporate users exist in production.
#
# Usage:
#   ./recreate-realm-prod.sh [--force]
#
# Options:
#   --force    Skip confirmation prompt (for CI/CD)
#
# Requirements:
#   - KEYCLOAK_ADMIN_PASSWORD environment variable
#   - gcloud CLI authenticated
#   - Keycloak Admin API accessible
#
# What This Script Does:
#   1. Authenticates to Keycloak Admin API
#   2. Deletes the existing tamshai-corp realm
#   3. Imports fresh realm from keycloak/realm-export.json
#   4. Verifies test-user.journey exists with TOTP configured
#
# Author: Tamshai-Dev
# Date: January 10, 2026

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="https://keycloak-fn44nd7wba-uc.a.run.app/auth"
REALM="tamshai-corp"
ADMIN_USER="admin"
REALM_JSON="/opt/keycloak/data/import/realm-export.json"
FORCE_MODE=false

# Parse arguments
if [[ "${1:-}" == "--force" ]]; then
    FORCE_MODE=true
fi

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for curl (required for Keycloak API calls)
    if ! command -v /opt/keycloak/curl-static &> /dev/null; then
        log_error "curl not found. Please install it first."
        exit 1
    fi

    # Check for jq
    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Please install it first (apt-get install jq / brew install jq)"
        exit 1
    fi

    # Check for KEYCLOAK_ADMIN_PASSWORD
    if [[ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
        log_error "KEYCLOAK_ADMIN_PASSWORD environment variable not set"
        log_error "This should be provided via Cloud Run job secrets configuration"
        exit 1
    fi

    # Check for realm export file
    if [[ ! -f "$REALM_JSON" ]]; then
        log_error "Realm export file not found: $REALM_JSON"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Confirm with user
confirm_deletion() {
    if [[ "$FORCE_MODE" == true ]]; then
        log_warn "Running in --force mode, skipping confirmation"
        return 0
    fi

    echo ""
    log_warn "═══════════════════════════════════════════════════════════"
    log_warn "  WARNING: This will DELETE the tamshai-corp realm!"
    log_warn "═══════════════════════════════════════════════════════════"
    echo ""
    echo "This action will:"
    echo "  • Delete all users in the realm (including test-user.journey)"
    echo "  • Delete all client configurations"
    echo "  • Delete all roles and groups"
    echo "  • Recreate everything from realm-export.json"
    echo ""
    log_warn "Only proceed if:"
    log_warn "  ✓ No corporate users exist in production yet"
    log_warn "  ✓ realm-export.json is up-to-date"
    log_warn "  ✓ You have a backup of current realm state (if needed)"
    echo ""

    read -p "Are you sure you want to proceed? (type 'yes' to confirm): " confirmation

    if [[ "$confirmation" != "yes" ]]; then
        log_info "Aborted by user"
        exit 0
    fi
}

# Authenticate to Keycloak Admin API
authenticate() {
    log_info "Authenticating to Keycloak Admin API..."

    # Get access token
    TOKEN_RESPONSE=$(/opt/keycloak/curl-static -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

    if [[ "$ACCESS_TOKEN" == "null" ]] || [[ -z "$ACCESS_TOKEN" ]]; then
        log_error "Failed to authenticate to Keycloak"
        log_error "Response: $TOKEN_RESPONSE"
        exit 1
    fi

    log_success "Authentication successful"
}

# Check if realm exists
check_realm_exists() {
    log_info "Checking if realm '$REALM' exists..."

    REALM_CHECK=$(/opt/keycloak/curl-static -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -w "\n%{http_code}" | tail -1)

    if [[ "$REALM_CHECK" == "200" ]]; then
        log_success "Realm '$REALM' exists"
        return 0
    elif [[ "$REALM_CHECK" == "404" ]]; then
        log_warn "Realm '$REALM' does not exist (will be created from import)"
        return 1
    else
        log_error "Failed to check realm existence (HTTP $REALM_CHECK)"
        exit 1
    fi
}

# Delete the realm
delete_realm() {
    log_info "Deleting realm '$REALM'..."

    HTTP_CODE=$(/opt/keycloak/curl-static -s -o /dev/null -w "%{http_code}" -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM}" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    if [[ "$HTTP_CODE" == "204" ]]; then
        log_success "Realm deleted successfully"
    else
        log_error "Failed to delete realm (HTTP $HTTP_CODE)"
        exit 1
    fi

    # Wait for deletion to propagate
    log_info "Waiting for deletion to propagate (5 seconds)..."
    sleep 5
}

# Import the realm
import_realm() {
    log_info "Importing realm from $REALM_JSON..."

    # Read the realm JSON file
    REALM_DATA=$(cat "$REALM_JSON")

    # Import via Admin API
    HTTP_CODE=$(/opt/keycloak/curl-static -s -o /dev/null -w "%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$REALM_DATA")

    if [[ "$HTTP_CODE" == "201" ]]; then
        log_success "Realm imported successfully"
    else
        log_error "Failed to import realm (HTTP $HTTP_CODE)"
        log_error "This may indicate a problem with realm-export.json format"
        exit 1
    fi

    # Wait for import to complete
    log_info "Waiting for import to complete (10 seconds)..."
    sleep 10
}

# Verify test user exists with TOTP
verify_test_user() {
    log_info "Verifying test-user.journey exists..."

    # Search for user
    USER_RESPONSE=$(/opt/keycloak/curl-static -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=test-user.journey&exact=true" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    USER_COUNT=$(echo "$USER_RESPONSE" | jq '. | length')

    if [[ "$USER_COUNT" == "0" ]]; then
        log_error "test-user.journey not found after import!"
        log_error "Check realm-export.json to ensure the user is included"
        exit 1
    fi

    USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id')
    USERNAME=$(echo "$USER_RESPONSE" | jq -r '.[0].username')
    EMAIL=$(echo "$USER_RESPONSE" | jq -r '.[0].email')
    ENABLED=$(echo "$USER_RESPONSE" | jq -r '.[0].enabled')

    log_success "User found:"
    echo "  • ID: $USER_ID"
    echo "  • Username: $USERNAME"
    echo "  • Email: $EMAIL"
    echo "  • Enabled: $ENABLED"

    # Check if user has TOTP configured
    log_info "Checking TOTP configuration..."

    CREDENTIALS_RESPONSE=$(/opt/keycloak/curl-static -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    TOTP_COUNT=$(echo "$CREDENTIALS_RESPONSE" | jq '[.[] | select(.type == "otp")] | length')

    if [[ "$TOTP_COUNT" -gt 0 ]]; then
        log_success "TOTP configured! Found $TOTP_COUNT TOTP credential(s)"
        TOTP_ID=$(echo "$CREDENTIALS_RESPONSE" | jq -r '[.[] | select(.type == "otp")][0].id')
        echo "  • TOTP Credential ID: $TOTP_ID"
    else
        log_warn "TOTP not found in credentials"
        log_warn "This may mean:"
        log_warn "  • realm-export.json doesn't include TOTP credentials"
        log_warn "  • Keycloak version doesn't support TOTP import"
        log_warn "  • User will need to configure TOTP manually"
    fi
}

# Main execution
main() {
    echo ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "  Keycloak Realm Recreation Script (Production)"
    log_info "═══════════════════════════════════════════════════════════"
    echo ""

    check_prerequisites
    confirm_deletion
    authenticate

    REALM_EXISTS=false
    if check_realm_exists; then
        REALM_EXISTS=true
    fi

    if [[ "$REALM_EXISTS" == true ]]; then
        delete_realm
    fi

    import_realm
    verify_test_user

    echo ""
    log_success "═══════════════════════════════════════════════════════════"
    log_success "  Realm Recreation Complete!"
    log_success "═══════════════════════════════════════════════════════════"
    echo ""
    log_info "Next steps:"
    echo "  1. Run E2E tests to verify TOTP is working:"
    echo "     cd tests/e2e && npm run test:login:prod"
    echo ""
    echo "  2. If TOTP still doesn't work, check Keycloak Admin Console:"
    echo "     $KEYCLOAK_URL/admin"
    echo ""
    echo "  3. Verify test-user.journey credentials:"
    echo "     • Username: test-user.journey"
    echo "     • Password: ***REDACTED_PASSWORD***"
    echo "     • TOTP Secret: JBSWY3DPEHPK3PXP"
    echo ""
}

# Run main function
main
