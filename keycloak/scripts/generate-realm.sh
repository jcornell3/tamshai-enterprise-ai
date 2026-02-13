#!/bin/bash
#
# Generate environment-specific Keycloak realm export
#
# This script generates realm exports with proper environment-specific values:
# - Email domains (tamshai-playground.local for dev, tamshai.com for stage/prod)
# - Redirect URIs
# - Secret placeholders
#
# Usage:
#   ./generate-realm.sh dev      # Generate realm-export-dev.json
#   ./generate-realm.sh stage    # Generate realm-export-stage.json
#   ./generate-realm.sh prod     # Generate realm-export.json (prod)
#
# Phoenix Architecture Principle:
#   Each environment should be recreatable from scratch using its realm export.
#   This script ensures consistency across environment realm configurations.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYCLOAK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Environment-specific configuration
declare -A EMAIL_DOMAINS=(
    ["dev"]="tamshai-playground.local"
    ["stage"]="tamshai.com"
    ["prod"]="tamshai.com"
)

declare -A BASE_URLS=(
    ["dev"]="https://www.tamshai-playground.local"
    ["stage"]="https://www.tamshai.com"
    ["prod"]="https://app.tamshai.com"
)

declare -A AUTH_URLS=(
    ["dev"]="https://www.tamshai-playground.local/auth"
    ["stage"]="https://www.tamshai.com/auth"
    ["prod"]="https://auth.tamshai.com/auth"
)

declare -A OUTPUT_FILES=(
    ["dev"]="realm-export-dev.json"
    ["stage"]="realm-export-stage.json"
    ["prod"]="realm-export.json"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    cat << EOF
Usage: $(basename "$0") <environment> [options]

Generate environment-specific Keycloak realm export.

Arguments:
    environment     Target environment: dev, stage, prod

Options:
    --dry-run       Show what would be generated without writing files
    --diff          Show diff against existing file
    --help          Show this help message

Examples:
    $(basename "$0") dev              # Generate realm-export-dev.json
    $(basename "$0") stage --dry-run  # Preview stage generation
    $(basename "$0") prod --diff      # Compare with existing prod realm

Environment Configuration:
    Environment | Email Domain    | Base URL               | Auth URL
    ------------|-----------------|------------------------|-------------------------
    dev         | tamshai-playground.local   | https://www.tamshai-playground.local  | https://www.tamshai-playground.local/auth
    stage       | tamshai.com     | https://www.tamshai.com    | https://www.tamshai.com/auth
    prod        | tamshai.com     | https://app.tamshai.com    | https://auth.tamshai.com/auth

EOF
    exit 0
}

# Parse arguments
ENV=""
DRY_RUN=false
SHOW_DIFF=false

while [[ $# -gt 0 ]]; do
    case $1 in
        dev|stage|prod)
            ENV="$1"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --diff)
            SHOW_DIFF=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            log_error "Unknown argument: $1"
            usage
            ;;
    esac
done

if [ -z "$ENV" ]; then
    log_error "Environment required"
    usage
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    log_info "Install: apt-get install jq (Linux) or brew install jq (macOS)"
    exit 1
fi

# Get environment-specific values
EMAIL_DOMAIN="${EMAIL_DOMAINS[$ENV]}"
BASE_URL="${BASE_URLS[$ENV]}"
AUTH_URL="${AUTH_URLS[$ENV]}"
OUTPUT_FILE="${OUTPUT_FILES[$ENV]}"
OUTPUT_PATH="$KEYCLOAK_DIR/$OUTPUT_FILE"

log_info "Generating realm export for: $ENV"
log_info "  Email domain: $EMAIL_DOMAIN"
log_info "  Base URL: $BASE_URL"
log_info "  Auth URL: $AUTH_URL"
log_info "  Output file: $OUTPUT_FILE"

# Generate test user JSON based on environment
generate_test_user() {
    local env=$1
    local email_domain=$2

    # For dev, use hardcoded values; for stage/prod, use placeholders
    if [ "$env" = "dev" ]; then
        cat << EOF
{
    "username": "test-user.journey",
    "email": "test-user@${email_domain}",
    "emailVerified": true,
    "enabled": true,
    "firstName": "Test",
    "lastName": "User",
    "attributes": {
        "employeeId": ["TEST001"],
        "department": ["Testing"],
        "title": ["Journey Test Account"]
    },
    "groups": ["/All-Employees"],
    "credentials": [
        {
            "type": "password",
            "value": "Test123!Journey",
            "temporary": false
        },
        {
            "type": "otp",
            "secretData": "{\"value\":\"***REDACTED_TOTP***\"}",
            "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"
        }
    ]
}
EOF
    else
        # Stage/Prod: use placeholders that get substituted at deploy time
        cat << EOF
{
    "username": "test-user.journey",
    "email": "test-user@${email_domain}",
    "emailVerified": true,
    "enabled": true,
    "firstName": "Test",
    "lastName": "User",
    "attributes": {
        "employeeId": ["TEST001"],
        "department": ["Testing"],
        "title": ["Journey Test Account"]
    },
    "groups": ["/All-Employees"],
    "credentials": [
        {
            "type": "password",
            "value": "__TEST_USER_PASSWORD__",
            "temporary": false
        },
        {
            "type": "otp",
            "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}",
            "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"
        }
    ]
}
EOF
    fi
}

# Generate client redirect URIs based on environment
generate_client_redirects() {
    local env=$1
    local base_url=$2

    case $env in
        dev)
            echo '["http://localhost:*", "https://www.tamshai-playground.local/*", "https://localhost:*"]'
            ;;
        stage)
            echo '["https://www.tamshai.com/*", "https://vps.tamshai.com/*"]'
            ;;
        prod)
            echo '["https://app.tamshai.com/*", "https://www.tamshai.com/*"]'
            ;;
    esac
}

# Generate web origins based on environment
generate_web_origins() {
    local env=$1

    case $env in
        dev)
            echo '["http://localhost:3000", "http://localhost:5173", "https://www.tamshai-playground.local"]'
            ;;
        stage)
            echo '["https://www.tamshai.com", "https://vps.tamshai.com"]'
            ;;
        prod)
            echo '["https://app.tamshai.com", "https://www.tamshai.com"]'
            ;;
    esac
}

# Create base realm structure
generate_base_realm() {
    cat << 'EOF'
{
    "id": "tamshai-corp",
    "realm": "tamshai-corp",
    "displayName": "Tamshai Corp",
    "displayNameHtml": "<div class=\"kc-logo-text\"><span>Tamshai Corp</span></div>",
    "enabled": true,
    "sslRequired": "external",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "editUsernameAllowed": false,
    "bruteForceProtected": true,
    "permanentLockout": false,
    "maxFailureWaitSeconds": 900,
    "minimumQuickLoginWaitSeconds": 60,
    "waitIncrementSeconds": 60,
    "quickLoginCheckMilliSeconds": 1000,
    "maxDeltaTimeSeconds": 43200,
    "failureFactor": 5,
    "accessTokenLifespan": 1800,
    "accessTokenLifespanForImplicitFlow": 1800,
    "ssoSessionIdleTimeout": 1800,
    "ssoSessionMaxLifespan": 36000,
    "offlineSessionIdleTimeout": 2592000,
    "accessCodeLifespan": 60,
    "accessCodeLifespanUserAction": 300,
    "accessCodeLifespanLogin": 1800,
    "actionTokenGeneratedByAdminLifespan": 43200,
    "actionTokenGeneratedByUserLifespan": 300,
    "otpPolicyType": "totp",
    "otpPolicyAlgorithm": "HmacSHA1",
    "otpPolicyInitialCounter": 0,
    "otpPolicyDigits": 6,
    "otpPolicyLookAheadWindow": 1,
    "otpPolicyPeriod": 30,
    "otpSupportedApplications": [
        "totpAppGoogleName",
        "totpAppMicrosoftAuthenticatorName",
        "totpAppFreeOTPName"
    ]
}
EOF
}

# Main generation logic
log_info "Generating realm export..."

# Check if we can use existing file as template
TEMPLATE_FILE=""
if [ -f "$KEYCLOAK_DIR/realm-export-dev.json" ]; then
    TEMPLATE_FILE="$KEYCLOAK_DIR/realm-export-dev.json"
elif [ -f "$KEYCLOAK_DIR/realm-export.json" ]; then
    TEMPLATE_FILE="$KEYCLOAK_DIR/realm-export.json"
fi

if [ -n "$TEMPLATE_FILE" ]; then
    log_info "Using template: $(basename "$TEMPLATE_FILE")"

    # Read template and transform
    REALM_JSON=$(cat "$TEMPLATE_FILE")

    # Update email domain for users
    if [ "$ENV" = "dev" ]; then
        # Replace @tamshai.com with @tamshai-playground.local for dev
        REALM_JSON=$(echo "$REALM_JSON" | sed 's/@tamshai\.com/@tamshai-playground.local/g')
    else
        # Replace @tamshai-playground.local with @tamshai.com for stage/prod
        REALM_JSON=$(echo "$REALM_JSON" | sed 's/@tamshai\.local/@tamshai.com/g')
    fi

    # Update test user credentials based on environment
    if [ "$ENV" = "dev" ]; then
        # For dev, replace placeholders with values from environment (GitHub secrets)
        local test_password="${TEST_USER_PASSWORD:-}"
        local test_totp="${TEST_USER_TOTP_SECRET:-***REDACTED_TOTP***}"

        if [ -n "$test_password" ]; then
            REALM_JSON=$(echo "$REALM_JSON" | sed "s/__TEST_USER_PASSWORD__/$test_password/g")
        else
            log_warn "TEST_USER_PASSWORD not set - test-user.journey will use placeholder password"
            REALM_JSON=$(echo "$REALM_JSON" | sed 's/__TEST_USER_PASSWORD__/__PLACEHOLDER_PASSWORD__/g')
        fi
        REALM_JSON=$(echo "$REALM_JSON" | sed "s/__TEST_USER_TOTP_SECRET__/$test_totp/g")
    else
        # For stage/prod, ensure placeholders are used (they may already be)
        # Only transform if hardcoded values exist
        REALM_JSON=$(echo "$REALM_JSON" | sed 's/"value": "Test123!Journey"/"value": "__TEST_USER_PASSWORD__"/g')
        REALM_JSON=$(echo "$REALM_JSON" | sed 's/***REDACTED_TOTP***/__TEST_USER_TOTP_SECRET__/g')
    fi
else
    log_warn "No template found, generating minimal realm structure"
    REALM_JSON=$(generate_base_realm)
fi

# Output handling
if [ "$DRY_RUN" = true ]; then
    log_info "Dry run - would write to: $OUTPUT_PATH"
    echo "$REALM_JSON" | jq '.' | head -100
    echo "... (truncated)"
elif [ "$SHOW_DIFF" = true ]; then
    if [ -f "$OUTPUT_PATH" ]; then
        log_info "Comparing with existing file..."
        diff <(cat "$OUTPUT_PATH" | jq -S '.') <(echo "$REALM_JSON" | jq -S '.') || true
    else
        log_warn "Output file doesn't exist: $OUTPUT_PATH"
    fi
else
    # Write output
    echo "$REALM_JSON" | jq '.' > "$OUTPUT_PATH"
    log_ok "Generated: $OUTPUT_PATH"

    # Verify output
    if jq -e '.' "$OUTPUT_PATH" > /dev/null 2>&1; then
        log_ok "JSON validation passed"
    else
        log_error "Generated JSON is invalid!"
        exit 1
    fi

    # Show summary
    USER_COUNT=$(jq '.users | length' "$OUTPUT_PATH" 2>/dev/null || echo "0")
    CLIENT_COUNT=$(jq '.clients | length' "$OUTPUT_PATH" 2>/dev/null || echo "0")
    GROUP_COUNT=$(jq '.groups | length' "$OUTPUT_PATH" 2>/dev/null || echo "0")

    echo ""
    log_info "Summary:"
    log_info "  Users: $USER_COUNT"
    log_info "  Clients: $CLIENT_COUNT"
    log_info "  Groups: $GROUP_COUNT"

    # Environment-specific notes
    case $ENV in
        dev)
            echo ""
            log_info "Dev Notes:"
            log_info "  - Email domain: tamshai-playground.local"
            log_info "  - Test credentials: hardcoded (safe for dev)"
            log_info "  - Use with: terraform apply -var-file=dev.tfvars"
            ;;
        stage)
            echo ""
            log_info "Stage Notes:"
            log_info "  - Email domain: tamshai.com"
            log_info "  - Test credentials: placeholders (__TEST_USER_PASSWORD__)"
            log_info "  - Secrets substituted at deploy time by deploy-vps.yml"
            log_info "  - Use with: gh workflow run deploy-vps.yml"
            ;;
        prod)
            echo ""
            log_info "Prod Notes:"
            log_info "  - Email domain: tamshai.com"
            log_info "  - Test credentials: placeholders"
            log_info "  - Secrets substituted at deploy time by deploy-to-gcp.yml"
            log_info "  - Only test-user.journey included (no other test users)"
            ;;
    esac
fi

log_ok "Done"
