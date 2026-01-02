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

    # Assign default client scopes (required for OIDC flows)
    assign_client_scopes "$client_id"
}

get_scope_id() {
    local scope_name="$1"
    $KCADM get client-scopes -r "$REALM" -q "name=$scope_name" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1
}

# Create standard OIDC client scopes if they don't exist
create_standard_scopes() {
    log_info "Ensuring standard OIDC client scopes exist..."

    # Profile scope - for user profile claims
    local profile_id=$(get_scope_id "profile")
    if [ -z "$profile_id" ]; then
        log_info "  Creating 'profile' scope..."
        $KCADM create client-scopes -r "$REALM" -s name=profile -s protocol=openid-connect -s description="OpenID Connect built-in scope: profile" -s attributes.'include.in.token.scope'=true -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to create profile scope"
    else
        log_info "  Scope 'profile' already exists"
    fi

    # Email scope - for email claims
    local email_id=$(get_scope_id "email")
    if [ -z "$email_id" ]; then
        log_info "  Creating 'email' scope..."
        $KCADM create client-scopes -r "$REALM" -s name=email -s protocol=openid-connect -s description="OpenID Connect built-in scope: email" -s attributes.'include.in.token.scope'=true -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to create email scope"
    else
        log_info "  Scope 'email' already exists"
    fi

    # Web-origins scope - for web origin claims (CORS)
    local weborigins_id=$(get_scope_id "web-origins")
    if [ -z "$weborigins_id" ]; then
        log_info "  Creating 'web-origins' scope..."
        $KCADM create client-scopes -r "$REALM" -s name=web-origins -s protocol=openid-connect -s description="OpenID Connect scope for allowed web origins" -s attributes.'include.in.token.scope'=false 2>/dev/null || log_warn "  Failed to create web-origins scope"
    else
        log_info "  Scope 'web-origins' already exists"
    fi

    # Address scope - for address claims (optional but standard)
    local address_id=$(get_scope_id "address")
    if [ -z "$address_id" ]; then
        log_info "  Creating 'address' scope..."
        $KCADM create client-scopes -r "$REALM" -s name=address -s protocol=openid-connect -s description="OpenID Connect built-in scope: address" -s attributes.'include.in.token.scope'=true -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to create address scope"
    else
        log_info "  Scope 'address' already exists"
    fi

    # Phone scope - for phone claims (optional but standard)
    local phone_id=$(get_scope_id "phone")
    if [ -z "$phone_id" ]; then
        log_info "  Creating 'phone' scope..."
        $KCADM create client-scopes -r "$REALM" -s name=phone -s protocol=openid-connect -s description="OpenID Connect built-in scope: phone" -s attributes.'include.in.token.scope'=true -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to create phone scope"
    else
        log_info "  Scope 'phone' already exists"
    fi
}

assign_client_scopes() {
    local client_id="$1"
    local uuid=$(get_client_uuid "$client_id")

    # Default scopes - always included in tokens
    local default_scopes=("roles" "web-origins")

    # Optional scopes - can be requested via scope parameter
    local optional_scopes=("profile" "email" "address" "phone" "offline_access")

    for scope in "${default_scopes[@]}"; do
        local scope_id=$(get_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            $KCADM create "clients/$uuid/default-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned default scope '$scope' to client '$client_id'"
        else
            log_warn "  Default scope '$scope' not found in realm"
        fi
    done

    for scope in "${optional_scopes[@]}"; do
        local scope_id=$(get_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            # Add as optional scope so it can be requested in OAuth flows
            $KCADM create "clients/$uuid/optional-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned optional scope '$scope' to client '$client_id'"
        else
            log_warn "  Optional scope '$scope' not found in realm"
        fi
    done
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

    # Ensure standard OIDC scopes exist
    create_standard_scopes

    # Sync all clients
    sync_website_client
    sync_flutter_client
    sync_sample_app_clients

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"
