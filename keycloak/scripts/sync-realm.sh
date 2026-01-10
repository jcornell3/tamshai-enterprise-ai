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
# Environment Variables:
#   VPS_DOMAIN - VPS domain name for redirect URIs (default: vps.tamshai.com)
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
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
            ;;
        stage)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"  # Use env var or default to localhost
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"
            ;;
        prod)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"  # Use env var or default to localhost
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
        log_info "Client '$client_id' updated (scopes already assigned)"
    else
        log_info "Client '$client_id' does not exist, creating..."
        echo "$client_json" | $KCADM create clients -r "$REALM" -f -
        log_info "Client '$client_id' created"

        # Only assign scopes on creation (not on updates - scopes already exist)
        assign_client_scopes "$client_id"
    fi
}

get_scope_id() {
    local scope_name="$1"
    # Get all scopes with id and name, then filter for exact match
    # kcadm -q parameter doesn't do exact matching, so we parse JSON manually
    # Note: awk not available in container, using grep/sed only
    local output=$($KCADM get client-scopes -r "$REALM" --fields id,name 2>/dev/null)

    # Parse JSON to find scope with exact name match
    # Format: [ { "id" : "uuid", "name" : "scopename" }, ... ]
    # Strategy: Find line with exact name match, then get previous "id" line
    echo "$output" | grep -B 1 "\"name\" : \"$scope_name\"" | grep "\"id\"" | head -1 | sed 's/.*"id" : "\([^"]*\)".*/\1/'
}

# Global scope ID cache (populated once at start)
declare -A SCOPE_ID_CACHE

# Populate scope ID cache (call once at startup)
cache_scope_ids() {
    log_info "Caching scope IDs..."
    local scopes=("roles" "web-origins" "profile" "email" "address" "phone" "offline_access")

    for scope in "${scopes[@]}"; do
        local scope_id=$(get_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            SCOPE_ID_CACHE["$scope"]="$scope_id"
            log_info "  Cached scope '$scope': $scope_id"
        fi
    done
}

get_cached_scope_id() {
    local scope_name="$1"
    echo "${SCOPE_ID_CACHE[$scope_name]:-}"  # Return empty string if not in cache (:-) prevents unbound variable error)
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

    # Use cached scope IDs instead of querying for each client
    for scope in "${default_scopes[@]}"; do
        local scope_id=$(get_cached_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            $KCADM create "clients/$uuid/default-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned default scope '$scope' to client '$client_id'"
        else
            log_warn "  Default scope '$scope' not found in cache"
        fi
    done

    for scope in "${optional_scopes[@]}"; do
        local scope_id=$(get_cached_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            # Add as optional scope so it can be requested in OAuth flows
            $KCADM create "clients/$uuid/optional-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned optional scope '$scope' to client '$client_id'"
        else
            log_warn "  Optional scope '$scope' not found in cache"
        fi
    done
}

# =============================================================================
# Client Configurations
# =============================================================================

sync_website_client() {
    log_info "Syncing tamshai-website client..."

    local vps_domain="${VPS_DOMAIN:-vps.tamshai.com}"

    local client_json="{
        \"clientId\": \"tamshai-website\",
        \"name\": \"Tamshai Corporate Website\",
        \"description\": \"Corporate website SSO login for employee services\",
        \"enabled\": true,
        \"publicClient\": true,
        \"standardFlowEnabled\": true,
        \"directAccessGrantsEnabled\": false,
        \"serviceAccountsEnabled\": false,
        \"protocol\": \"openid-connect\",
        \"redirectUris\": [
            \"http://localhost:8080/*\",
            \"https://tamshai.local/*\",
            \"https://www.tamshai.local/*\",
            \"https://$vps_domain/*\",
            \"https://tamshai.com/*\",
            \"https://www.tamshai.com/*\",
            \"https://prod.tamshai.com/*\"
        ],
        \"webOrigins\": [
            \"http://localhost:8080\",
            \"https://tamshai.local\",
            \"https://www.tamshai.local\",
            \"https://$vps_domain\",
            \"https://tamshai.com\",
            \"https://www.tamshai.com\",
            \"https://prod.tamshai.com\"
        ],
        \"attributes\": {
            \"pkce.code.challenge.method\": \"S256\",
            \"post.logout.redirect.uris\": \"http://localhost:8080/*##https://tamshai.local/*##https://www.tamshai.local/*##https://$vps_domain/*##https://tamshai.com/*##https://www.tamshai.com/*##https://prod.tamshai.com/*\"
        },
        \"defaultClientScopes\": [\"openid\", \"profile\", \"email\", \"roles\"]
    }"

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

sync_mcp_hr_service_client() {
    log_info "Syncing mcp-hr-service client (identity sync)..."

    # Get client secret from environment or use default
    local client_secret="${MCP_HR_SERVICE_CLIENT_SECRET:-hr-service-secret}"

    local client_json='{
        "clientId": "mcp-hr-service",
        "name": "MCP HR Identity Sync Service",
        "description": "Service account for syncing HR employees to Keycloak users",
        "enabled": true,
        "publicClient": false,
        "standardFlowEnabled": false,
        "directAccessGrantsEnabled": false,
        "serviceAccountsEnabled": true,
        "fullScopeAllowed": true,
        "protocol": "openid-connect",
        "defaultClientScopes": ["profile", "email", "roles"]
    }'

    create_or_update_client "mcp-hr-service" "$client_json"

    # Set client secret and fullScopeAllowed explicitly (kcadm may not handle it in JSON)
    local uuid=$(get_client_uuid "mcp-hr-service")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        $KCADM update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update, trying regenerate..."
            $KCADM create "clients/$uuid/client-secret" -r "$REALM" 2>/dev/null || true
        }

        # Enable fullScopeAllowed so service account roles appear in access token
        log_info "  Enabling fullScopeAllowed for service account roles..."
        $KCADM update "clients/$uuid" -r "$REALM" -s "fullScopeAllowed=true" 2>/dev/null || {
            log_warn "  Failed to enable fullScopeAllowed"
        }

        # Add protocol mapper to include realm-management client roles in access token
        # This is required because the default 'roles' scope only includes roles from the same client
        log_info "  Adding realm-management client roles mapper..."
        $KCADM create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
            -s name=realm-management-roles \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-usermodel-client-role-mapper \
            -s consentRequired=false \
            -s 'config."multivalued"=true' \
            -s 'config."userinfo.token.claim"=true' \
            -s 'config."id.token.claim"=true' \
            -s 'config."access.token.claim"=true' \
            -s 'config."claim.name"=resource_access.realm-management.roles' \
            -s 'config."jsonType.label"=String' \
            -s 'config."usermodel.clientRoleMapping.clientId"=realm-management' 2>/dev/null || {
            log_info "    Mapper already exists or update not needed"
        }
    fi

    # Assign service account roles for user management
    log_info "  Assigning realm-management roles to service account..."
    local service_account_id=$($KCADM get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4)
    if [ -n "$service_account_id" ]; then
        # Get realm-management client UUID
        local realm_mgmt_uuid=$(get_client_uuid "realm-management")
        if [ -n "$realm_mgmt_uuid" ]; then
            # Assign manage-users role (show errors for debugging)
            log_info "  Assigning manage-users role..."
            if $KCADM add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename manage-users; then
                log_info "    manage-users role assigned"
            else
                log_warn "    Could not assign manage-users role (may already be assigned)"
            fi

            log_info "  Assigning view-users role..."
            if $KCADM add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename view-users; then
                log_info "    view-users role assigned"
            else
                log_warn "    Could not assign view-users role (may already be assigned)"
            fi

            # Also assign query-users role which is needed for user.find()
            log_info "  Assigning query-users role..."
            if $KCADM add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename query-users; then
                log_info "    query-users role assigned"
            else
                log_warn "    Could not assign query-users role (may already be assigned)"
            fi

            log_info "  Service account roles assigned"
        fi
    fi

    log_info "  mcp-hr-service client configured for identity sync"
}

sync_sample_app_clients() {
    log_info "Syncing sample app clients..."

    local apps=("hr-app:4001" "finance-app:4002" "sales-app:4003" "support-app:4004")

    # Determine domain based on environment
    local domain
    case "$ENV" in
        dev)
            domain="tamshai.local"
            ;;
        stage)
            domain="www.tamshai.com"
            ;;
        prod)
            domain="prod.tamshai.com"
            ;;
        *)
            domain="localhost"
            ;;
    esac

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
                \"https://$domain/$app/*\"
            ],
            \"webOrigins\": [
                \"http://localhost:$port\",
                \"https://$domain\"
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
# Test User Provisioning
# =============================================================================

provision_test_user() {
    log_info "Provisioning test-user.journey..."

    # Check if user already exists
    local user_id=$($KCADM get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -n "$user_id" ]; then
        log_info "  User already exists (ID: $user_id), deleting to recreate with TOTP..."
        $KCADM delete users/$user_id -r "$REALM" 2>/dev/null
        if [ $? -eq 0 ]; then
            log_info "  User deleted successfully"
            user_id=""  # Reset so we create fresh
        else
            log_warn "  Failed to delete existing user"
        fi
    fi

    if [ -z "$user_id" ]; then
        log_info "  Creating test-user.journey user..."

        # Create user
        $KCADM create users -r "$REALM" \
            -s username=test-user.journey \
            -s email=test-user@tamshai.com \
            -s firstName=Test \
            -s lastName=User \
            -s enabled=true \
            -s emailVerified=true \
            -s 'attributes.department=["Testing"]' \
            -s 'attributes.employeeId=["TEST001"]' \
            -s 'attributes.title=["Journey Test Account"]'

        if [ $? -eq 0 ]; then
            log_info "  User created successfully"

            # Get the newly created user ID
            user_id=$($KCADM get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

            if [ -n "$user_id" ]; then
                # Set password (non-temporary)
                log_info "  Setting password..."
                $KCADM set-password -r "$REALM" --userid "$user_id" --password "***REDACTED_PASSWORD***"

                if [ $? -eq 0 ]; then
                    log_info "  Password set successfully"
                else
                    log_warn "  Failed to set password"
                fi

                # Configure TOTP for test user
                log_info "  Configuring TOTP credentials..."

                # Create TOTP credential via Admin API
                # The secret must be Base32 encoded: JBSWY3DPEHPK3PXP
                local totp_json='{
                    "type": "otp",
                    "value": "JBSWY3DPEHPK3PXP",
                    "temporary": false,
                    "algorithm": "HmacSHA256",
                    "digits": 6,
                    "period": 30,
                    "counter": 0
                }'

                $KCADM create users/$user_id/credentials -r "$REALM" -b "$totp_json"

                if [ $? -eq 0 ]; then
                    log_info "  TOTP credential configured successfully"
                    log_info "  TOTP Secret: JBSWY3DPEHPK3PXP (Base32)"
                else
                    log_warn "  Failed to configure TOTP credential"
                    log_info "  Note: Admin can manually configure TOTP via Keycloak console"
                fi
            else
                log_warn "  Could not retrieve user ID after creation"
            fi
        else
            log_error "  Failed to create user"
        fi
    fi
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

    # Cache scope IDs once (avoid repeated API calls)
    cache_scope_ids

    # Sync all clients
    sync_website_client
    sync_flutter_client
    sync_mcp_hr_service_client
    sync_sample_app_clients

    # Provision test user (for E2E testing)
    provision_test_user

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"
