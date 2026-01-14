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
set +H  # Disable history expansion to handle passwords with special characters like !

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

# Use KEYCLOAK_HOME if set (GitHub Actions), otherwise default to Docker container path
if [ -n "$KEYCLOAK_HOME" ] && [ -f "$KEYCLOAK_HOME/bin/kcadm.sh" ]; then
    KCADM="$KEYCLOAK_HOME/bin/kcadm.sh"
elif command -v kcadm.sh &> /dev/null; then
    KCADM="kcadm.sh"
else
    KCADM="/opt/keycloak/bin/kcadm.sh"
fi

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
        # Some client types (service accounts) have immutable properties after creation
        # Catch update failures gracefully - the important config is already there from creation
        if echo "$client_json" | $KCADM update "clients/$uuid" -r "$REALM" -f - 2>/dev/null; then
            log_info "Client '$client_id' updated"
        else
            log_warn "Client '$client_id' update skipped (client may have immutable properties)"
        fi
    else
        log_info "Client '$client_id' does not exist, creating..."
        echo "$client_json" | $KCADM create clients -r "$REALM" -f -
        log_info "Client '$client_id' created"
    fi

    # Always ensure scopes are assigned (idempotent - uses || true)
    assign_client_scopes "$client_id"
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

sync_web_portal_client() {
    log_info "Syncing web-portal client..."

    # Build redirect URIs and web origins based on environment
    # Each environment may have multiple valid domains
    local redirect_uris
    local web_origins
    local logout_uris

    case "$ENV" in
        dev)
            redirect_uris="\"http://localhost:4000/*\", \"https://www.tamshai.local/*\", \"https://www.tamshai.local/app/*\""
            web_origins="\"http://localhost:4000\", \"https://www.tamshai.local\""
            logout_uris="http://localhost:4000/*##https://www.tamshai.local/*"
            ;;
        stage)
            redirect_uris="\"http://localhost:4000/*\", \"https://www.tamshai.com/*\", \"https://www.tamshai.com/app/*\""
            web_origins="\"http://localhost:4000\", \"https://www.tamshai.com\""
            logout_uris="http://localhost:4000/*##https://www.tamshai.com/*"
            ;;
        prod)
            # Prod uses app.tamshai.com (Cloud Run) and prod.tamshai.com (if needed)
            redirect_uris="\"http://localhost:4000/*\", \"https://prod.tamshai.com/*\", \"https://prod.tamshai.com/app/*\", \"https://app.tamshai.com/*\", \"https://app.tamshai.com/callback\""
            web_origins="\"http://localhost:4000\", \"https://prod.tamshai.com\", \"https://app.tamshai.com\""
            logout_uris="http://localhost:4000/*##https://prod.tamshai.com/*##https://app.tamshai.com/*"
            ;;
        *)
            redirect_uris="\"http://localhost:4000/*\""
            web_origins="\"http://localhost:4000\""
            logout_uris="http://localhost:4000/*"
            ;;
    esac

    local client_json="{
        \"clientId\": \"web-portal\",
        \"name\": \"Tamshai Web Portal (SPA)\",
        \"description\": \"Browser-based AI assistant portal for employees\",
        \"enabled\": true,
        \"publicClient\": true,
        \"standardFlowEnabled\": true,
        \"directAccessGrantsEnabled\": false,
        \"serviceAccountsEnabled\": false,
        \"protocol\": \"openid-connect\",
        \"redirectUris\": [$redirect_uris],
        \"webOrigins\": [$web_origins],
        \"attributes\": {
            \"pkce.code.challenge.method\": \"S256\",
            \"post.logout.redirect.uris\": \"$logout_uris\"
        },
        \"defaultClientScopes\": [\"openid\", \"profile\", \"email\", \"roles\"]
    }"

    create_or_update_client "web-portal" "$client_json"
}

sync_mcp_gateway_client() {
    log_info "Syncing mcp-gateway client..."

    # Get client secret from environment or use default
    local client_secret="${MCP_GATEWAY_CLIENT_SECRET:-mcp-gateway-secret}"

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

    local client_json="{
        \"clientId\": \"mcp-gateway\",
        \"name\": \"MCP Gateway\",
        \"description\": \"Backend service for AI orchestration\",
        \"enabled\": true,
        \"publicClient\": false,
        \"standardFlowEnabled\": true,
        \"directAccessGrantsEnabled\": true,
        \"serviceAccountsEnabled\": true,
        \"protocol\": \"openid-connect\",
        \"redirectUris\": [
            \"http://localhost:3100/*\",
            \"https://$domain/*\",
            \"https://$domain/api/*\"
        ],
        \"webOrigins\": [\"+\"],
        \"fullScopeAllowed\": true,
        \"defaultClientScopes\": [\"openid\", \"profile\", \"email\", \"roles\"]
    }"

    create_or_update_client "mcp-gateway" "$client_json"

    # Set client secret
    local uuid=$(get_client_uuid "mcp-gateway")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        $KCADM update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    fi
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
# All-Employees Group (Self-Access via RLS)
# =============================================================================

# Ensure the All-Employees group exists with the employee role
# This group grants access to all MCP servers, with data filtering via RLS
sync_all_employees_group() {
    log_info "Syncing All-Employees group..."

    # First, ensure the 'employee' realm role exists
    local role_exists=$($KCADM get roles -r "$REALM" 2>/dev/null | grep -o '"name" *: *"employee"')
    if [ -z "$role_exists" ]; then
        log_info "  Creating 'employee' realm role..."
        $KCADM create roles -r "$REALM" \
            -s name=employee \
            -s 'description=Base employee role - allows self-access to all MCP servers via RLS' 2>/dev/null || {
            log_info "    Role may already exist"
        }
    else
        log_info "  'employee' role already exists"
    fi

    # Check if All-Employees group exists
    local group_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -z "$group_id" ]; then
        log_info "  Creating All-Employees group..."
        $KCADM create groups -r "$REALM" -s name=All-Employees 2>/dev/null
        group_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    else
        log_info "  All-Employees group already exists"
    fi

    # Assign employee role to the group
    if [ -n "$group_id" ]; then
        log_info "  Assigning 'employee' realm role to All-Employees group..."
        $KCADM add-roles -r "$REALM" \
            --gid "$group_id" \
            --rolename employee 2>/dev/null || {
            log_info "    Role may already be assigned"
        }
    fi

    log_info "  All-Employees group sync complete"
}

# =============================================================================
# User Group Assignment
# =============================================================================

# Assign users to groups based on their department
# Groups have realm roles assigned, so users inherit roles via group membership
# This matches the original realm-export user definitions before they were removed
assign_user_groups() {
    log_info "Assigning users to groups..."

    # Skip in production (users managed by identity-sync only)
    if [ "$ENV" = "prod" ]; then
        log_info "Skipping user group assignment in production"
        return 0
    fi

    # Define user-to-group mapping based on original realm-export-dev.json
    # Format: username:group1,group2 (group names without leading /)
    # Source: git show dc8337a -- keycloak/realm-export-dev.json
    # Note: All-Employees grants 'employee' role for self-access via RLS
    local -a user_groups=(
        "eve.thompson:All-Employees,C-Suite"
        "alice.chen:All-Employees,HR-Department,Managers"
        "bob.martinez:All-Employees,Finance-Team,Managers"
        "carol.johnson:All-Employees,Sales-Managers"
        "dan.williams:All-Employees,Support-Team,Managers"
        "frank.davis:All-Employees,IT-Team"
        "ryan.garcia:All-Employees,Sales-Managers"
        "nina.patel:All-Employees,Engineering-Managers"
        "marcus.johnson:All-Employees,Engineering-Team"
    )

    for mapping in "${user_groups[@]}"; do
        local username="${mapping%%:*}"
        local groups="${mapping##*:}"

        # Find user by username
        local user_id=$($KCADM get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$user_id" ]; then
            log_warn "  User $username not found, skipping"
            continue
        fi

        # Split groups by comma and assign each
        IFS=',' read -ra group_array <<< "$groups"
        for group in "${group_array[@]}"; do
            # Find group by path
            local group_id=$($KCADM get groups -r "$REALM" -q "name=$group" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

            if [ -z "$group_id" ]; then
                log_warn "  Group $group not found, skipping for $username"
                continue
            fi

            # Add user to group (idempotent)
            if $KCADM update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
                log_info "  $username: added to $group"
            else
                log_info "  $username: $group (already member or error)"
            fi
        done
    done

    log_info "User group assignment complete"
}

# =============================================================================
# Critical Production User Assignment
# =============================================================================

# In production, we don't auto-assign all users to groups (security policy).
# However, certain critical users (e.g., CEO) need group membership for the
# system to function. This function handles those specific cases.
assign_critical_prod_users() {
    # Only run in production
    if [ "$ENV" != "prod" ]; then
        return 0
    fi

    log_info "Assigning critical production users to groups..."

    # Critical users who need group membership for system access
    # Format: username:group
    # These users are explicitly approved for automated group assignment
    local -a critical_users=(
        "eve.thompson:C-Suite"
    )

    for mapping in "${critical_users[@]}"; do
        local username="${mapping%%:*}"
        local group="${mapping##*:}"

        local user_id=$($KCADM get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$user_id" ]; then
            log_warn "  Critical user $username not found in Keycloak"
            continue
        fi

        local group_id=$($KCADM get groups -r "$REALM" -q "name=$group" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$group_id" ]; then
            log_warn "  Group $group not found"
            continue
        fi

        if $KCADM update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
            log_info "  $username: added to $group"
        else
            log_info "  $username: already in $group or error"
        fi
    done

    log_info "Critical production user assignment complete"
}

# =============================================================================
# Test User Provisioning
# =============================================================================

provision_test_user() {
    # In production, test-user.journey is imported from realm-export.json during Keycloak startup
    # This import includes TOTP credentials which cannot be set via Admin API
    # Skip provisioning to avoid deleting and losing the TOTP configuration
    if [ "$ENV" = "prod" ]; then
        log_info "Skipping test-user.journey provisioning (user imported from realm-export.json with TOTP)"
        return 0
    fi

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
                # Set password (non-temporary) using REST API PUT endpoint (set-password doesn't work in non-interactive mode)
                log_info "  Setting password..."
                local password_json='{"type":"password","value":"***REDACTED_PASSWORD***","temporary":false}'
                echo "$password_json" | $KCADM update "users/$user_id/reset-password" -r "$REALM" -f -

                if [ $? -eq 0 ]; then
                    log_info "  Password set successfully"
                else
                    log_warn "  Failed to set password"
                fi

                # Note: TOTP credentials cannot be pre-configured via Admin API
                # They can only be set during realm import or by the user themselves
                # For E2E tests, the test account will need to have TOTP configured manually
                # or use a different authentication method
                log_info "  TOTP configuration skipped (not supported via Admin API)"
                log_info "  Note: TOTP must be configured manually or via realm import"

                # Assign test-user.journey to All-Employees group for self-access
                local all_emp_id=$($KCADM get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
                if [ -n "$all_emp_id" ]; then
                    if $KCADM update "users/$user_id/groups/$all_emp_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
                        log_info "  Added test-user.journey to All-Employees group"
                    else
                        log_info "  test-user.journey: All-Employees (already member or error)"
                    fi
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

# =============================================================================
# Audience Mapper Sync
# =============================================================================


# Add or update mcp-gateway-audience mapper on a specific client
# This ensures tokens include mcp-gateway in the audience claim
# Without this, MCP Gateway rejects tokens with 401 Unauthorized
# IMPORTANT: This function UPDATES existing mappers to fix broken configs
add_audience_mapper_to_client() {
    local client_id="$1"
    log_info "  Checking audience mapper for client '$client_id'..."

    local client_uuid=$(get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    # Check if mapper already exists and get its ID
    local existing_mapper=$($KCADM get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null | grep -o '"id" *: *"[^"]*".*"name" *: *"mcp-gateway-audience"' | head -1)

    if [ -n "$existing_mapper" ]; then
        # Mapper exists - get its ID and UPDATE it (fixes broken mappers)
        local mapper_id=$(echo "$existing_mapper" | grep -o '"id" *: *"[^"]*"' | cut -d'"' -f4)
        log_info "    Updating existing audience mapper for '$client_id' (id: $mapper_id)..."

        if $KCADM update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
            -s name=mcp-gateway-audience \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-audience-mapper \
            -s consentRequired=false \
            -s 'config."included.client.audience"=mcp-gateway' \
            -s 'config."id.token.claim"=false' \
            -s 'config."access.token.claim"=true' 2>/dev/null; then
            log_info "    Audience mapper updated successfully for '$client_id'"
        else
            log_warn "    Failed to update audience mapper for '$client_id'"
        fi
    else
        # Create new audience mapper
        log_info "    Creating mcp-gateway-audience mapper for '$client_id'..."
        if $KCADM create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
            -s name=mcp-gateway-audience \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-audience-mapper \
            -s consentRequired=false \
            -s 'config."included.client.audience"=mcp-gateway' \
            -s 'config."id.token.claim"=false' \
            -s 'config."access.token.claim"=true' 2>/dev/null; then
            log_info "    Audience mapper created successfully for '$client_id'"
        else
            log_warn "    Failed to create audience mapper for '$client_id' (may already exist)"
        fi
    fi
}
# Sync the mcp-gateway-audience mapper on all web clients
# Both tamshai-website and web-portal need this for token validation
sync_audience_mapper() {
    log_info "Syncing mcp-gateway-audience mapper on all web clients..."

    # Add mapper to tamshai-website (used by marketing site SSO)
    add_audience_mapper_to_client "tamshai-website"

    # Add mapper to web-portal (used by production Cloud Run apps)
    add_audience_mapper_to_client "web-portal"

    # Add mapper to Flutter client for mobile/desktop apps
    add_audience_mapper_to_client "tamshai-flutter-client"
}

# =============================================================================
# Subject (sub) Claim Mapper Functions
# =============================================================================
# The sub claim is REQUIRED for user identification but may be missing if
# protocol mappers are misconfigured. This ensures the sub claim is always present.

# Add or update the subject (sub) claim mapper on a specific client
# The sub claim contains the user's Keycloak ID and is essential for authentication
add_sub_claim_mapper_to_client() {
    local client_id="$1"
    log_info "  Checking sub claim mapper for client '$client_id'..."

    local client_uuid=$(get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    local mapper_name="subject-claim-mapper"

    # Check if mapper already exists and get its ID
    # Use a simpler grep that handles JSON formatting variations
    local all_mappers=$($KCADM get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null)
    local mapper_id=$(echo "$all_mappers" | grep -B5 "\"name\" *: *\"$mapper_name\"" | grep '"id"' | head -1 | sed 's/.*"id" *: *"\([^"]*\)".*/\1/')

    if [ -n "$mapper_id" ]; then
        # Mapper exists - UPDATE it with correct type
        log_info "    Updating existing sub claim mapper for '$client_id' (id: $mapper_id)..."

        if $KCADM update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-usermodel-property-mapper \
            -s consentRequired=false \
            -s 'config."user.attribute"=id' \
            -s 'config."claim.name"=sub' \
            -s 'config."jsonType.label"=String' \
            -s 'config."id.token.claim"=true' \
            -s 'config."access.token.claim"=true' \
            -s 'config."userinfo.token.claim"=true' 2>/dev/null; then
            log_info "    Sub claim mapper updated successfully for '$client_id'"
        else
            log_warn "    Failed to update sub claim mapper for '$client_id'"
        fi
    else
        # Create new mapper
        log_info "    Creating sub claim mapper for '$client_id'..."
        if $KCADM create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-usermodel-property-mapper \
            -s consentRequired=false \
            -s 'config."user.attribute"=id' \
            -s 'config."claim.name"=sub' \
            -s 'config."jsonType.label"=String' \
            -s 'config."id.token.claim"=true' \
            -s 'config."access.token.claim"=true' \
            -s 'config."userinfo.token.claim"=true' 2>/dev/null; then
            log_info "    Sub claim mapper created successfully for '$client_id'"
        else
            log_warn "    Failed to create sub claim mapper for '$client_id' (may already exist)"
        fi
    fi
}

# Sync the subject (sub) claim mapper on all web clients
# This ensures the user ID is always included in tokens
sync_sub_claim_mapper() {
    log_info "Syncing subject (sub) claim mapper on all web clients..."

    # Add mapper to web-portal (used by production Cloud Run apps)
    add_sub_claim_mapper_to_client "web-portal"

    # Add mapper to tamshai-website (used by marketing site SSO)
    add_sub_claim_mapper_to_client "tamshai-website"

    # Add mapper to Flutter client for mobile/desktop apps
    add_sub_claim_mapper_to_client "tamshai-flutter-client"
}


# =============================================================================
# Client Role Mapper Functions
# =============================================================================
# These mappers include mcp-gateway client roles in web-portal tokens
# CRITICAL: Without usermodel.clientRoleMapping.clientId, mappers are broken
# and tokens will have empty role claims, causing 403 Forbidden errors

# Add or update a client role mapper on a specific client
add_client_role_mapper() {
    local client_id="$1"
    local mapper_name="$2"
    local source_client_id="$3"  # Which client's roles to map
    local claim_name="$4"

    log_info "  Checking client role mapper '$mapper_name' for client '$client_id'..."

    local client_uuid=$(get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    # Check if mapper already exists
    local existing_mapper=$($KCADM get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null | grep -o "\"id\" *: *\"[^\"]*\".*\"name\" *: *\"$mapper_name\"" | head -1)

    if [ -n "$existing_mapper" ]; then
        # Mapper exists - get its ID and update it
        local mapper_id=$(echo "$existing_mapper" | grep -o '"id" *: *"[^"]*"' | cut -d'"' -f4)
        log_info "    Updating existing mapper '$mapper_name' (id: $mapper_id)..."

        if $KCADM update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-usermodel-client-role-mapper \
            -s consentRequired=false \
            -s 'config."multivalued"=true' \
            -s 'config."userinfo.token.claim"=true' \
            -s 'config."id.token.claim"=true' \
            -s 'config."access.token.claim"=true' \
            -s "config.\"claim.name\"=$claim_name" \
            -s 'config."jsonType.label"=String' \
            -s "config.\"usermodel.clientRoleMapping.clientId\"=$source_client_id" 2>/dev/null; then
            log_info "    Mapper '$mapper_name' updated successfully"
        else
            log_warn "    Failed to update mapper '$mapper_name'"
        fi
    else
        # Create new mapper
        log_info "    Creating new mapper '$mapper_name'..."

        if $KCADM create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-usermodel-client-role-mapper \
            -s consentRequired=false \
            -s 'config."multivalued"=true' \
            -s 'config."userinfo.token.claim"=true' \
            -s 'config."id.token.claim"=true' \
            -s 'config."access.token.claim"=true' \
            -s "config.\"claim.name\"=$claim_name" \
            -s 'config."jsonType.label"=String' \
            -s "config.\"usermodel.clientRoleMapping.clientId\"=$source_client_id" 2>/dev/null; then
            log_info "    Mapper '$mapper_name' created successfully"
        else
            log_warn "    Failed to create mapper '$mapper_name'"
        fi
    fi
}

# Sync client role mappers on web-portal
# These mappers include mcp-gateway roles in web-portal tokens so users
# can access MCP Gateway resources with their assigned roles
sync_client_role_mappers() {
    log_info "Syncing client role mappers on web-portal..."

    # Map mcp-gateway roles into web-portal tokens
    # This is CRITICAL for authorization - without it, users get 403 Forbidden
    add_client_role_mapper "web-portal" "mcp-gateway-roles-mapper" "mcp-gateway" "resource_access.mcp-gateway.roles"

    # Map web-portal's own roles (if any exist)
    add_client_role_mapper "web-portal" "client-roles-mapper" "web-portal" "resource_access.web-portal.roles"
}

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
    sync_web_portal_client
    sync_mcp_hr_service_client
    sync_sample_app_clients

    # Sync audience mapper on all web clients
    # This is critical for MCP Gateway token validation
    sync_audience_mapper

    # Sync subject (sub) claim mapper on all web clients
    # This ensures the 'sub' claim is included in tokens for user identification
    sync_sub_claim_mapper

    # Sync client role mappers on web-portal
    # This ensures mcp-gateway roles are included in tokens for authorization
    sync_client_role_mappers

    # Provision test user (for E2E testing)
    provision_test_user

    # Sync All-Employees group (for self-access via RLS)
    sync_all_employees_group

    # Assign users to groups (for dev/stage - restores role inheritance)
    assign_user_groups

    # Assign critical production users (CEO, etc.) to groups
    # This runs ONLY in prod and handles users who need group membership
    assign_critical_prod_users

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"
