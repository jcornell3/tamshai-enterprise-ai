#!/bin/bash
# =============================================================================
# Keycloak Realm Synchronization Script
# =============================================================================
#
# This script synchronizes Keycloak configuration from source files to a
# running Keycloak instance. It's idempotent - safe to run multiple times.
#
# Usage:
#   ./sync-realm.sh [environment]
#
# Environments:
#   dev    - Local development (default)
#   stage  - VPS staging
#   prod   - Production
#
# Examples:
#   ./sync-realm.sh           # Sync to local dev
#   ./sync-realm.sh stage     # Sync to VPS stage
#
# Requirements:
#   - Keycloak must be running and accessible
#   - Admin credentials must be available
#   - For Docker: run inside container or with docker exec
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALM="tamshai-corp"
ENV="${1:-dev}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Environment Configuration
# =============================================================================

configure_environment() {
    case "$ENV" in
        dev)
            KEYCLOAK_URL="http://localhost:8080/auth"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
            ;;
        stage)
            KEYCLOAK_URL="http://localhost:8080/auth"  # Inside container
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"
            ;;
        prod)
            KEYCLOAK_URL="http://localhost:8080/auth"  # Inside container
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"
            ;;
        *)
            log_error "Unknown environment: $ENV"
            exit 1
            ;;
    esac

    log_info "Environment: $ENV"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Realm: $REALM"
}

# =============================================================================
# Keycloak Admin CLI Helpers
# =============================================================================

KCADM="/opt/keycloak/bin/kcadm.sh"

kcadm_login() {
    log_info "Authenticating to Keycloak..."
    $KCADM config credentials \
        --server "$KEYCLOAK_URL" \
        --realm master \
        --user "$ADMIN_USER" \
        --password "$ADMIN_PASS"
    log_info "Authentication successful"
}

client_exists() {
    local client_id="$1"
    $KCADM get clients -r "$REALM" -q "clientId=$client_id" --fields clientId 2>/dev/null | grep -q "$client_id"
}

get_client_uuid() {
    local client_id="$1"
    $KCADM get clients -r "$REALM" -q "clientId=$client_id" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4
}

create_or_update_client() {
    local client_id="$1"
    local client_json="$2"

    if client_exists "$client_id"; then
        log_info "Client '$client_id' exists, updating..."
        local uuid=$(get_client_uuid "$client_id")
        echo "$client_json" | $KCADM update "clients/$uuid" -r "$REALM" -f -
        log_info "Client '$client_id' updated"
    else
        log_info "Client '$client_id' does not exist, creating..."
        echo "$client_json" | $KCADM create clients -r "$REALM" -f -
        log_info "Client '$client_id' created"
    fi
}

# =============================================================================
# Client Configurations
# =============================================================================

sync_website_client() {
    log_info "Syncing tamshai-website client..."

    local client_json='{
        "clientId": "tamshai-website",
        "name": "Tamshai Corporate Website",
        "description": "Corporate website SSO login for employee services",
        "enabled": true,
        "publicClient": true,
        "standardFlowEnabled": true,
        "directAccessGrantsEnabled": false,
        "serviceAccountsEnabled": false,
        "protocol": "openid-connect",
        "redirectUris": [
            "http://localhost:8080/*",
            "https://tamshai.local/*",
            "https://www.tamshai.local/*",
            "https://5.78.159.29/*",
            "https://tamshai.com/*",
            "https://www.tamshai.com/*"
        ],
        "webOrigins": [
            "http://localhost:8080",
            "https://tamshai.local",
            "https://www.tamshai.local",
            "https://5.78.159.29",
            "https://tamshai.com",
            "https://www.tamshai.com"
        ],
        "attributes": {
            "pkce.code.challenge.method": "S256",
            "post.logout.redirect.uris": "http://localhost:8080/*##https://tamshai.local/*##https://www.tamshai.local/*##https://5.78.159.29/*##https://tamshai.com/*##https://www.tamshai.com/*"
        },
        "defaultClientScopes": ["openid", "profile", "email", "roles"]
    }'

    create_or_update_client "tamshai-website" "$client_json"
}

sync_flutter_client() {
    log_info "Syncing tamshai-flutter-client..."

    local client_json='{
        "clientId": "tamshai-flutter-client",
        "name": "Tamshai Flutter Application",
        "description": "Cross-platform Flutter application for AI assistant",
        "enabled": true,
        "publicClient": true,
        "standardFlowEnabled": true,
        "directAccessGrantsEnabled": false,
        "serviceAccountsEnabled": false,
        "protocol": "openid-connect",
        "redirectUris": [
            "http://localhost:*/callback",
            "http://127.0.0.1:*/callback",
            "com.tamshai.ai://callback",
            "com.tamshai.unifiedflutter://callback"
        ],
        "webOrigins": [
            "http://localhost",
            "http://127.0.0.1"
        ],
        "attributes": {
            "pkce.code.challenge.method": "S256",
            "post.logout.redirect.uris": "http://localhost:*/logout##http://127.0.0.1:*/logout##com.tamshai.ai://logout##com.tamshai.unifiedflutter://logout"
        },
        "defaultClientScopes": ["openid", "profile", "email", "roles"]
    }'

    create_or_update_client "tamshai-flutter-client" "$client_json"
}

sync_sample_app_clients() {
    log_info "Syncing sample app clients..."

    local apps=("hr-app:4001" "finance-app:4002" "sales-app:4003" "support-app:4004")

    for app_port in "${apps[@]}"; do
        local app="${app_port%%:*}"
        local port="${app_port##*:}"

        local client_json="{
            \"clientId\": \"$app\",
            \"name\": \"Tamshai ${app^} Application\",
            \"enabled\": true,
            \"publicClient\": true,
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"protocol\": \"openid-connect\",
            \"redirectUris\": [
                \"http://localhost:$port/*\",
                \"https://tamshai.local/$app/*\",
                \"https://5.78.159.29/$app/*\"
            ],
            \"webOrigins\": [
                \"http://localhost:$port\",
                \"https://tamshai.local\",
                \"https://5.78.159.29\"
            ],
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\"
            },
            \"defaultClientScopes\": [\"openid\", \"profile\", \"email\", \"roles\"]
        }"

        create_or_update_client "$app" "$client_json"
    done
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "=========================================="
    log_info "Keycloak Realm Sync - Starting"
    log_info "=========================================="

    configure_environment
    kcadm_login

    # Sync all clients
    sync_website_client
    sync_flutter_client
    sync_sample_app_clients

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"
