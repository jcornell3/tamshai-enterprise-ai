#!/bin/bash
#
# Set TOTP Credential for a Keycloak User
#
# Purpose: Configure a specific TOTP secret for a user, replacing any existing OTP credentials.
#          This is useful for E2E testing where a known TOTP secret is required.
#
# Usage:
#   ./set-user-totp.sh <environment> <username> [totp_secret]
#
# Arguments:
#   environment   - dev, stage, or prod
#   username      - Keycloak username (e.g., test-user.journey)
#   totp_secret   - RAW TOTP secret (NOT Base32-encoded) - required
#
# Environment Variables:
#   KEYCLOAK_ADMIN_PASSWORD  - Keycloak admin password (or will prompt)
#   AUTO_CONFIRM=true        - Skip interactive confirmations (for automation/CI)
#
# IMPORTANT: Keycloak stores TOTP secrets in RAW format, not BASE32.
#   - Pass TEST_USER_TOTP_SECRET_RAW (from GitHub Secrets) to this script
#   - E2E tests use TEST_USER_TOTP_SECRET (BASE32-encoded) with oathtool
#
# Examples:
#   # Phoenix rebuild (fetches RAW secret from GitHub Secrets)
#   AUTO_CONFIRM=true ./set-user-totp.sh prod test-user.journey "$TEST_USER_TOTP_SECRET_RAW"
#
# Requirements:
#   - KEYCLOAK_ADMIN_PASSWORD environment variable (or will prompt if not in AUTO_CONFIRM mode)
#   - curl and jq installed
#   - Network access to Keycloak
#
# Author: Tamshai-Dev
# Date: January 2026

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# No default TOTP secret - must be provided as argument

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Show usage
usage() {
    echo "Usage: $0 <environment> <username> <totp_secret>"
    echo ""
    echo "Arguments:"
    echo "  environment   - dev, stage, or prod"
    echo "  username      - Keycloak username (e.g., test-user.journey)"
    echo "  totp_secret   - RAW TOTP secret (required, from TEST_USER_TOTP_SECRET_RAW)"
    echo ""
    echo "Example:"
    echo "  $0 prod test-user.journey \"\$TEST_USER_TOTP_SECRET_RAW\""
    exit 1
}

# Parse arguments - all 3 are required
if [[ $# -lt 3 ]]; then
    usage
fi

ENV="$1"
USERNAME="$2"
TOTP_SECRET="$3"

# Configuration based on environment
case "$ENV" in
    dev)
        KEYCLOAK_URL="https://www.tamshai.local/auth"
        ;;
    stage)
        KEYCLOAK_URL="https://www.tamshai.com/auth"
        ;;
    prod)
        KEYCLOAK_URL="https://keycloak-fn44nd7wba-uc.a.run.app/auth"
        ;;
    *)
        log_error "Invalid environment: $ENV (must be dev, stage, or prod)"
        exit 1
        ;;
esac

REALM="tamshai-corp"
ADMIN_USER="admin"

# Check for required tools
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v curl &> /dev/null; then
        log_error "curl not found. Please install it first."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Please install it first."
        exit 1
    fi

    # Check for KEYCLOAK_ADMIN_PASSWORD
    if [[ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
        if [[ "${AUTO_CONFIRM:-false}" == "true" ]]; then
            log_error "KEYCLOAK_ADMIN_PASSWORD must be set when AUTO_CONFIRM=true"
            exit 1
        fi
        echo -n "Enter Keycloak admin password: "
        read -s KEYCLOAK_ADMIN_PASSWORD
        echo ""
        export KEYCLOAK_ADMIN_PASSWORD
    fi

    log_success "Prerequisites met"
}

# Authenticate to Keycloak Admin API
authenticate() {
    log_info "Authenticating to Keycloak Admin API at $KEYCLOAK_URL..."

    TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        --data-urlencode "password=${KEYCLOAK_ADMIN_PASSWORD}" \
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

# Find user by username
find_user() {
    log_info "Finding user '$USERNAME' in realm '$REALM'..."

    USER_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}&exact=true" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    USER_COUNT=$(echo "$USER_RESPONSE" | jq '. | length')

    if [[ "$USER_COUNT" == "0" ]]; then
        log_error "User '$USERNAME' not found in realm '$REALM'"
        exit 1
    fi

    USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id')
    USER_EMAIL=$(echo "$USER_RESPONSE" | jq -r '.[0].email // "N/A"')

    log_success "Found user:"
    echo "  ID: $USER_ID"
    echo "  Username: $USERNAME"
    echo "  Email: $USER_EMAIL"
}

# Get existing OTP credentials
get_otp_credentials() {
    log_info "Checking existing OTP credentials..."

    CREDENTIALS_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    OTP_CREDENTIALS=$(echo "$CREDENTIALS_RESPONSE" | jq '[.[] | select(.type == "otp")]')
    OTP_COUNT=$(echo "$OTP_CREDENTIALS" | jq '. | length')

    if [[ "$OTP_COUNT" -gt 0 ]]; then
        log_warn "Found $OTP_COUNT existing OTP credential(s)"
        echo "$OTP_CREDENTIALS" | jq -r '.[] | "  - ID: \(.id), Label: \(.userLabel // "default")"'
        return 0
    else
        log_info "No existing OTP credentials found"
        return 1
    fi
}

# Delete existing OTP credentials
delete_otp_credentials() {
    log_info "Deleting existing OTP credentials..."

    OTP_IDS=$(echo "$OTP_CREDENTIALS" | jq -r '.[].id')

    for cred_id in $OTP_IDS; do
        log_info "  Deleting credential: $cred_id"
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
            "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials/${cred_id}" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}")

        if [[ "$HTTP_CODE" == "204" ]]; then
            log_success "  Deleted credential $cred_id"
        else
            log_error "  Failed to delete credential $cred_id (HTTP $HTTP_CODE)"
        fi
    done
}

# Create new OTP credential with known secret
create_otp_credential() {
    log_info "Creating new OTP credential with secret: ${TOTP_SECRET:0:4}****"

    # Keycloak expects the OTP credential in a specific format
    # We need to use the credential-management endpoint

    # First, check if there's a simpler way using required actions
    # Actually, we can use the credentials API to set it directly

    # The secret needs to be in the correct format for Keycloak
    # Keycloak stores TOTP secrets and uses them for validation

    # Method 1: Use the FreeOTP/Google Authenticator compatible format
    # This creates a credential that Keycloak will accept

    CREDENTIAL_JSON=$(cat <<EOF
{
    "type": "otp",
    "userLabel": "E2E Test Authenticator",
    "secretData": "{\"value\":\"${TOTP_SECRET}\"}",
    "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
}
EOF
)

    # Try to create the credential
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$CREDENTIAL_JSON")

    HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
    HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

    if [[ "$HTTP_CODE" == "201" ]] || [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "204" ]]; then
        log_success "OTP credential created successfully"
        return 0
    fi

    # If direct creation fails, try alternative method using credential representation
    log_warn "Direct credential creation returned HTTP $HTTP_CODE, trying alternative method..."

    # Alternative: Use the user's credential reset endpoint
    # This method works by setting up the OTP through the configured-user-credential API

    # Get the OTP credential type ID
    CRED_TYPES=$(curl -s -X GET \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/required-actions" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    # Try using the account credentials API pattern
    # This is how Keycloak internally handles OTP setup

    SETUP_JSON=$(cat <<EOF
{
    "type": "otp",
    "config": {
        "secret": "${TOTP_SECRET}",
        "digits": "6",
        "period": "30",
        "algorithm": "HmacSHA1"
    }
}
EOF
)

    HTTP_RESPONSE2=$(curl -s -w "\n%{http_code}" -X PUT \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/configured-user-storage-credential-types" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$SETUP_JSON" 2>/dev/null || echo -e "\n404")

    HTTP_CODE2=$(echo "$HTTP_RESPONSE2" | tail -n 1)

    if [[ "$HTTP_CODE2" == "204" ]] || [[ "$HTTP_CODE2" == "200" ]]; then
        log_success "OTP credential created via alternative method"
        return 0
    fi

    # Final fallback: Direct database-style credential creation
    log_warn "Alternative method returned HTTP $HTTP_CODE2, trying final method..."

    # This format matches what Keycloak exports in realm-export.json
    FINAL_JSON=$(cat <<EOF
{
    "id": "$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "totp-$(date +%s)")",
    "type": "otp",
    "userLabel": "E2E Test Authenticator",
    "createdDate": $(date +%s)000,
    "secretData": "{\"value\":\"${TOTP_SECRET}\"}",
    "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
}
EOF
)

    # Use the bulk credential update endpoint
    HTTP_RESPONSE3=$(curl -s -w "\n%{http_code}" -X PUT \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"credentials\": [$FINAL_JSON]}")

    HTTP_CODE3=$(echo "$HTTP_RESPONSE3" | tail -n 1)

    if [[ "$HTTP_CODE3" == "204" ]] || [[ "$HTTP_CODE3" == "200" ]]; then
        log_success "OTP credential created via user update"
        return 0
    fi

    log_error "All methods failed to create OTP credential"
    log_error "You may need to manually configure TOTP in Keycloak Admin Console"
    log_error "Last response: HTTP $HTTP_CODE3"
    return 1
}

# Verify OTP credential was created
verify_otp_credential() {
    log_info "Verifying OTP credential..."

    CREDENTIALS_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    OTP_COUNT=$(echo "$CREDENTIALS_RESPONSE" | jq '[.[] | select(.type == "otp")] | length')

    if [[ "$OTP_COUNT" -gt 0 ]]; then
        log_success "OTP credential verified!"
        echo "$CREDENTIALS_RESPONSE" | jq -r '.[] | select(.type == "otp") | "  - ID: \(.id), Label: \(.userLabel // "default")"'
        return 0
    else
        log_error "OTP credential not found after creation attempt"
        return 1
    fi
}

# Note: TOTP code generation removed - E2E tests handle verification
# This script only provisions the RAW secret in Keycloak

# Main execution
main() {
    echo ""
    log_info "=============================================="
    log_info "  Set TOTP Credential for Keycloak User"
    log_info "=============================================="
    echo ""
    log_info "Environment: $ENV"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Username: $USERNAME"
    log_info "TOTP Secret: ${TOTP_SECRET:0:4}****${TOTP_SECRET: -4}"
    echo ""

    check_prerequisites
    authenticate
    find_user

    if get_otp_credentials; then
        echo ""
        if [[ "${AUTO_CONFIRM:-false}" == "true" ]]; then
            log_info "AUTO_CONFIRM=true - proceeding without confirmation"
        else
            read -p "Delete existing OTP credentials and create new one? (y/N): " confirm
            if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
                log_info "Aborted by user"
                exit 0
            fi
        fi
        delete_otp_credentials
    fi

    echo ""
    create_otp_credential

    echo ""
    verify_otp_credential

    echo ""
    log_success "=============================================="
    log_success "  TOTP Configuration Complete!"
    log_success "=============================================="
    echo ""
    echo "User '$USERNAME' now has TOTP configured with RAW secret."
    echo ""
    echo "Note: E2E tests use the BASE32-encoded version of this secret"
    echo "      (TEST_USER_TOTP_SECRET from GitHub Secrets)"
    echo ""
}

# Run main function
main
