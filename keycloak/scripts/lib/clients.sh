#!/bin/bash
# =============================================================================
# Keycloak Client Sync Functions
# =============================================================================
# Provides client management functions for Keycloak realm synchronization.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   ENV - Environment name (dev, stage, prod)
#   KCADM - Path to kcadm.sh
#
# Dependencies:
#   - lib/common.sh (logging functions)
#   - lib/scopes.sh (assign_client_scopes)
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Client Helper Functions
# =============================================================================

# Check if a client exists in the realm
# Arguments:
#   $1 - Client ID
# Returns: 0 if exists, 1 if not
client_exists() {
    local client_id="$1"
    _kcadm get clients -r "$REALM" -q "clientId=$client_id" --fields clientId 2>/dev/null | grep -q "$client_id"
}

# Get the UUID of a client by its client ID
# Arguments:
#   $1 - Client ID
# Returns: Client UUID (empty if not found)
get_client_uuid() {
    local client_id="$1"
    # Handle both spaced ("id" : "xxx") and compact ("id":"xxx") JSON formats
    _kcadm get clients -r "$REALM" -q "clientId=$client_id" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# Create or update a client in Keycloak
# Arguments:
#   $1 - Client ID
#   $2 - Client JSON configuration
create_or_update_client() {
    local client_id="$1"
    local client_json="$2"

    if client_exists "$client_id"; then
        log_info "Client '$client_id' exists, updating..."
        local uuid
        uuid=$(get_client_uuid "$client_id")
        # Some client types (service accounts) have immutable properties after creation
        # Catch update failures gracefully - the important config is already there from creation
        if echo "$client_json" | _kcadm update "clients/$uuid" -r "$REALM" -f - 2>/dev/null; then
            log_info "Client '$client_id  updated"
        else
            log_warn "Client '$client_id  update skipped (client may have immutable properties)"
        fi
    else
        log_info "Client '$client_id' does not exist, creating..."
        echo "$client_json" | _kcadm create clients -r "$REALM" -f -
        log_info "Client '$client_id  created"
    fi

    # Always ensure scopes are assigned (idempotent - uses || true)
    if type assign_client_scopes &>/dev/null; then
        assign_client_scopes "$client_id"
    fi
}
# =============================================================================
# Client JSON Generators
# =============================================================================

# Generate JSON for tamshai-website client (public, PKCE)
get_tamshai_website_client_json() {
    local vps_domain="${VPS_DOMAIN:-vps.tamshai.com}"

    cat <<EOF
{
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
        "https://tamshai.local:8443/*",
        "https://www.tamshai.local:8443/*",
        "https://$vps_domain/*",
        "https://tamshai.com/*",
        "https://www.tamshai.com/*",
        "https://prod.tamshai.com/*"
    ],
    "webOrigins": [
        "http://localhost:8080",
        "https://tamshai.local",
        "https://www.tamshai.local",
        "https://tamshai.local:8443",
        "https://www.tamshai.local:8443",
        "https://$vps_domain",
        "https://tamshai.com",
        "https://www.tamshai.com",
        "https://prod.tamshai.com"
    ],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:8080/*##https://tamshai.local/*##https://www.tamshai.local/*##https://tamshai.local:8443/*##https://www.tamshai.local:8443/*##https://$vps_domain/*##https://tamshai.com/*##https://www.tamshai.com/*##https://prod.tamshai.com/*"
    },
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

# Generate JSON for mcp-gateway client (confidential, service account)
# P1: directAccessGrantsEnabled is only true in dev (for integration tests).
# In stage/prod, password grant is disabled — use PKCE or service account flows.
get_mcp_gateway_client_json() {
    # Determine domain and webOrigins based on environment
    # Security: Explicit webOrigins prevent CSRF attacks (no wildcards)
    local domain
    local direct_access="false"
    local web_origins
    case "${ENV:-dev}" in
        dev)
            domain="tamshai.local"
            direct_access="false"
            # Dev: localhost for tests + tamshai.local with various ports
            web_origins='"http://localhost:3100", "http://localhost:4000", "http://localhost:4001", "http://localhost:4002", "http://localhost:4003", "http://localhost:4004", "https://www.tamshai.local", "https://www.tamshai.local:8443"'
            ;;
        stage)
            domain="www.tamshai.com"
            # Stage: Only the production staging domain
            web_origins='"https://www.tamshai.com"'
            ;;
        prod)
            domain="prod.tamshai.com"
            # Prod: Only the production domain
            web_origins='"https://prod.tamshai.com"'
            ;;
        *)
            domain="localhost"
            web_origins='"http://localhost:3100"'
            ;;
    esac

    cat <<EOF
{
    "clientId": "mcp-gateway",
    "name": "MCP Gateway",
    "description": "Backend service for AI orchestration",
    "enabled": true,
    "publicClient": false,
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": $direct_access,
    "serviceAccountsEnabled": true,
    "protocol": "openid-connect",
    "redirectUris": [
        "http://localhost:3100/*",
        "https://$domain/*",
        "https://$domain/api/*"
    ],
    "webOrigins": [$web_origins],
    "fullScopeAllowed": true,
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

# Generate JSON for Flutter client (public, PKCE, custom scheme)
# Note: Desktop OAuth uses fixed ports 18765-18769 for reliable redirect matching
# P2: directAccessGrantsEnabled disabled globally — public clients must use PKCE (OAuth 2.1)
get_flutter_client_json() {
    cat <<EOF
{
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
        "http://127.0.0.1:18765/callback",
        "http://127.0.0.1:18766/callback",
        "http://127.0.0.1:18767/callback",
        "http://127.0.0.1:18768/callback",
        "http://127.0.0.1:18769/callback",
        "http://localhost:18765/callback",
        "http://localhost:18766/callback",
        "http://localhost:18767/callback",
        "http://localhost:18768/callback",
        "http://localhost:18769/callback",
        "com.tamshai.ai://callback",
        "com.tamshai.unifiedflutter://callback",
        "tamshaiauth://callback"
    ],
    "webOrigins": [
        "http://localhost",
        "http://127.0.0.1"
    ],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://127.0.0.1:18765/logout##http://127.0.0.1:18766/logout##http://127.0.0.1:18767/logout##http://127.0.0.1:18768/logout##http://127.0.0.1:18769/logout##http://localhost:18765/logout##http://localhost:18766/logout##http://localhost:18767/logout##http://localhost:18768/logout##http://localhost:18769/logout##com.tamshai.ai://logout##com.tamshai.unifiedflutter://logout##tamshaiauth://logout"
    },
    "defaultClientScopes": ["openid", "profile", "email", "roles", "web-origins"],
    "optionalClientScopes": ["offline_access"]
}
EOF
}

# Generate JSON for web-portal client (public, PKCE, environment-specific)
get_web_portal_client_json() {
    local redirect_uris
    local web_origins
    local logout_uris

    case "${ENV:-dev}" in
        dev)
            redirect_uris='"http://localhost:4000/*", "https://www.tamshai.local/*", "https://www.tamshai.local/app/*", "https://www.tamshai.local:8443/*", "https://www.tamshai.local:8443/app/*"'
            web_origins='"http://localhost:4000", "https://www.tamshai.local", "https://www.tamshai.local:8443"'
            logout_uris="http://localhost:4000/*##https://www.tamshai.local/*##https://www.tamshai.local:8443/*"
            ;;
        stage)
            redirect_uris='"http://localhost:4000/*", "https://www.tamshai.com/*", "https://www.tamshai.com/app/*"'
            web_origins='"http://localhost:4000", "https://www.tamshai.com"'
            logout_uris="http://localhost:4000/*##https://www.tamshai.com/*"
            ;;
        prod)
            redirect_uris='"http://localhost:4000/*", "https://prod.tamshai.com/*", "https://prod.tamshai.com/app/*", "https://app.tamshai.com/*", "https://app.tamshai.com/callback"'
            web_origins='"http://localhost:4000", "https://prod.tamshai.com", "https://app.tamshai.com"'
            logout_uris="http://localhost:4000/*##https://prod.tamshai.com/*##https://app.tamshai.com/*"
            ;;
        *)
            redirect_uris='"http://localhost:4000/*"'
            web_origins='"http://localhost:4000"'
            logout_uris="http://localhost:4000/*"
            ;;
    esac

    cat <<EOF
{
    "clientId": "web-portal",
    "name": "Tamshai Web Portal (SPA)",
    "description": "Browser-based AI assistant portal for employees",
    "enabled": true,
    "publicClient": true,
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": false,
    "protocol": "openid-connect",
    "redirectUris": [$redirect_uris],
    "webOrigins": [$web_origins],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "$logout_uris"
    },
    "defaultClientScopes": ["openid", "profile", "email", "roles", "web-origins"],
    "optionalClientScopes": ["offline_access"]
}
EOF
}

# Generate JSON for mcp-ui client (confidential, service account for generative UI)
get_mcp_ui_client_json() {
    cat <<EOF
{
    "clientId": "mcp-ui",
    "name": "MCP UI Service",
    "description": "Backend service for Generative UI - confidential client for service-to-service auth",
    "enabled": true,
    "publicClient": false,
    "standardFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": true,
    "protocol": "openid-connect",
    "redirectUris": [],
    "webOrigins": [],
    "fullScopeAllowed": false,
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

# Generate JSON for mcp-hr-service client (confidential, service account)
# Security: fullScopeAllowed=false limits token claims to explicitly assigned scopes
get_mcp_hr_service_client_json() {
    cat <<EOF
{
    "clientId": "mcp-hr-service",
    "name": "MCP HR Identity Sync Service",
    "description": "Service account for syncing HR employees to Keycloak users",
    "enabled": true,
    "publicClient": false,
    "standardFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": true,
    "fullScopeAllowed": false,
    "protocol": "openid-connect",
    "defaultClientScopes": ["profile", "email", "roles"]
}
EOF
}

# =============================================================================
# Data-Driven Client Sync
# =============================================================================

# Map client keys to their Keycloak client IDs and JSON generator function names.
# Format: CLIENT_IDS[key]=clientId, CLIENT_JSON_FNS[key]=json_function_name
declare -A CLIENT_IDS=(
    [website]="tamshai-website"
    [flutter]="tamshai-flutter-client"
    [portal]="web-portal"
    [gateway]="mcp-gateway"
    [ui]="mcp-ui"
    [hr_service]="mcp-hr-service"
    [integration_runner]="mcp-integration-runner"
)

declare -A CLIENT_JSON_FNS=(
    [website]="get_tamshai_website_client_json"
    [flutter]="get_flutter_client_json"
    [portal]="get_web_portal_client_json"
    [gateway]="get_mcp_gateway_client_json"
    [ui]="get_mcp_ui_client_json"
    [hr_service]="get_mcp_hr_service_client_json"
    [integration_runner]="get_integration_runner_client_json"
)

# Sync a single client by key.
# Arguments:
#   $1 - Client key (one of: website, flutter, portal, gateway, ui, hr_service, integration_runner)
# The function looks up the Keycloak client ID and JSON generator from the maps above,
# then calls create_or_update_client followed by any post-sync hook if defined.
sync_client() {
    local client_key="$1"
    local client_id="${CLIENT_IDS[$client_key]:-}"
    local json_fn="${CLIENT_JSON_FNS[$client_key]:-}"

    if [ -z "$client_id" ]; then
        log_error "Unknown client key: $client_key"
        return 1
    fi

    if [ -z "$json_fn" ]; then
        log_error "No JSON generator function for client key: $client_key"
        return 1
    fi

    # Check for pre-sync guard (e.g., environment restrictions)
    local guard_fn="_pre_sync_${client_key}"
    if type "$guard_fn" &>/dev/null; then
        if ! "$guard_fn"; then
            return 0
        fi
    fi

    log_info "Syncing ${client_id} client..."
    local client_json
    client_json=$("$json_fn")
    create_or_update_client "$client_id" "$client_json"

    # Run post-sync hook if defined (for secrets, mappers, roles, etc.)
    local hook_fn="_post_sync_${client_key}"
    if type "$hook_fn" &>/dev/null; then
        "$hook_fn" "$client_id"
    fi
}

# Sync all registered clients.
# Iterates over CLIENT_IDS in a deterministic order and calls sync_client for each.
sync_all_clients() {
    # Use explicit order to ensure deterministic sync (bash associative arrays are unordered)
    local ordered_keys=("website" "flutter" "portal" "gateway" "ui" "integration_runner" "hr_service")
    for client_key in "${ordered_keys[@]}"; do
        sync_client "$client_key"
    done
}

# =============================================================================
# Pre-Sync Guards (environment restrictions)
# =============================================================================

# P3: Blocked in production -- service account with manage-users/manage-realm
# roles must not be auto-provisioned in prod (security policy).
_pre_sync_hr_service() {
    if [ "${ENV:-dev}" = "prod" ]; then
        log_warn "Skipping mcp-hr-service client in production (security policy)"
        return 1
    fi
    return 0
}

# T3: mcp-integration-runner is a test-only client, guarded to dev/ci environments.
_pre_sync_integration_runner() {
    if [ "${ENV:-dev}" != "dev" ] && [ "${ENV:-dev}" != "ci" ]; then
        log_info "Skipping mcp-integration-runner client (test environments only)"
        return 1
    fi
    return 0
}

# =============================================================================
# Post-Sync Hooks (secrets, mappers, roles)
# =============================================================================

# Post-sync for mcp-gateway: set client secret
_post_sync_gateway() {
    local client_id="$1"

    # Get client secret from environment (fail if not set)
    local client_secret="${MCP_GATEWAY_CLIENT_SECRET:?MCP_GATEWAY_CLIENT_SECRET must be set}"

    local uuid
    uuid=$(get_client_uuid "$client_id")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    fi
}

# Post-sync for mcp-ui: set secret, add audience mapper, add realm roles mapper
_post_sync_ui() {
    local client_id="$1"
    local client_secret="${MCP_UI_CLIENT_SECRET:-}"

    local uuid
    uuid=$(get_client_uuid "$client_id")

    # Set client secret if provided
    if [ -n "$uuid" ] && [ -n "$client_secret" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    fi

    # Add mcp-gateway audience mapper so mcp-ui tokens are accepted by the gateway
    if [ -n "$uuid" ]; then
        log_info "  Adding mcp-gateway audience mapper..."
        _kcadm create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
            -s name="mcp-gateway-audience" \
            -s protocol="openid-connect" \
            -s protocolMapper="oidc-audience-mapper" \
            -s consentRequired=false \
            -s 'config."included.client.audience"="mcp-gateway"' \
            -s 'config."id.token.claim"="true"' \
            -s 'config."access.token.claim"="true"' 2>/dev/null || {
            log_info "    Audience mapper already exists"
        }

        # Add hardcoded realm roles for generative UI (read access to all departments)
        log_info "  Adding hardcoded realm roles mapper..."
        _kcadm create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
            -s name="hardcoded-realm-roles" \
            -s protocol="openid-connect" \
            -s protocolMapper="oidc-hardcoded-claim-mapper" \
            -s consentRequired=false \
            -s 'config."claim.name"="realm_access"' \
            -s 'config."claim.value"="{\"roles\":[\"executive\",\"hr-read\",\"finance-read\",\"sales-read\",\"support-read\",\"payroll-read\"]}"' \
            -s 'config."id.token.claim"="true"' \
            -s 'config."access.token.claim"="true"' \
            -s 'config."userinfo.token.claim"="true"' \
            -s 'config."jsonType.label"="JSON"' 2>/dev/null || {
            log_info "    Realm roles mapper already exists"
        }
    fi

    log_info "  mcp-ui client configured"
}

# Post-sync for mcp-hr-service: set secret, add mappers, assign minimal roles
# Security: Only assigns roles needed for identity-sync (view/query/manage users)
# Removed: manage-realm, view-realm (not needed for user provisioning)
# Removed: fullScopeAllowed=true (set to false in client JSON for principle of least privilege)
_post_sync_hr_service() {
    local client_id="$1"

    # Get client secret from environment (fail if not set)
    local client_secret="${MCP_HR_SERVICE_CLIENT_SECRET:?MCP_HR_SERVICE_CLIENT_SECRET must be set}"

    # Set client secret
    local uuid
    uuid=$(get_client_uuid "$client_id")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update, trying regenerate..."
            _kcadm create "clients/$uuid/client-secret" -r "$REALM" 2>/dev/null || true
        }

        # Add protocol mapper to include realm-management client roles in access token
        log_info "  Adding realm-management client roles mapper..."
        _kcadm create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
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

    # Assign service account roles for user management (minimal permissions)
    # Security: Only view-users, query-users, manage-users needed for identity-sync
    # Removed: view-realm, manage-realm (not needed for user provisioning)
    log_info "  Assigning minimal realm-management roles to service account..."
    local service_account_id
    service_account_id=$(_kcadm get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    if [ -n "$service_account_id" ]; then
        # Get realm-management client UUID
        local realm_mgmt_uuid
        realm_mgmt_uuid=$(get_client_uuid "realm-management")
        if [ -n "$realm_mgmt_uuid" ]; then
            # Minimal roles for identity-sync: view, query, and manage users only
            local roles=("view-users" "query-users" "manage-users")
            for rolename in "${roles[@]}"; do
                log_info "  Assigning $rolename role..."
                if _kcadm add-roles -r "$REALM" \
                    --uusername "service-account-mcp-hr-service" \
                    --cclientid realm-management \
                    --rolename "$rolename"; then
                    log_info "    $rolename role assigned"
                else
                    log_warn "    Could not assign $rolename role (may already be assigned)"
                fi
            done

            log_info "  Service account roles assigned (minimal permissions)"
        fi
    fi

    log_info "  mcp-hr-service client configured for identity sync"
}

# Post-sync for mcp-integration-runner: set secret, assign roles, configure scopes and mappers
# NOTE: Role assignment and mapper config run regardless of secret availability.
# This ensures Phoenix rebuild configures everything except the secret, which can be
# set later when test secrets are loaded (e.g., via read-github-secrets.sh).
_post_sync_integration_runner() {
    local client_id="$1"

    local uuid
    uuid=$(get_client_uuid "$client_id")

    if [ -z "$uuid" ]; then
        log_warn "  mcp-integration-runner client not found, skipping post-sync"
        return 0
    fi

    # Set client secret from environment — optional during Phoenix rebuild
    local client_secret="${MCP_INTEGRATION_RUNNER_SECRET:-}"
    if [ -n "$client_secret" ]; then
        log_info "  Setting client secret from MCP_INTEGRATION_RUNNER_SECRET..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    else
        log_info "  MCP_INTEGRATION_RUNNER_SECRET not set, skipping secret update (run sync again after loading secrets)"
    fi

    # Grant the 'impersonation' role to the service account for token exchange
    # NOTE: The role is named 'impersonation' (not 'impersonate') in realm-management client
    log_info "  Assigning 'impersonation' role to service account..."
    local service_account_id
    service_account_id=$(_kcadm get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    if [ -n "$service_account_id" ]; then
        local realm_mgmt_uuid
        realm_mgmt_uuid=$(get_client_uuid "realm-management")
        if [ -n "$realm_mgmt_uuid" ]; then
            if _kcadm add-roles -r "$REALM" --uusername "service-account-mcp-integration-runner" --cclientid realm-management --rolename impersonation; then
                log_info "    'impersonation' role assigned successfully."
            else
                log_warn "    Could not assign 'impersonation' role (may already be assigned)."
            fi
        fi
    fi

    # Assign default client scopes for token exchange claims
    # Without these scopes, exchanged tokens will be missing:
    # - preferred_username (from 'profile' scope via 'roles' scope mappers)
    # - realm_access.roles (from 'roles' scope)
    # - groups (from 'roles' scope)
    log_info "  Assigning default client scopes for token exchange..."

    # Default scopes (always included in token)
    local default_scopes=("openid" "roles" "profile" "web-origins")
    for scope_name in "${default_scopes[@]}"; do
        # Get scope ID by name (kcadm endpoint requires ID)
        local scope_id
        scope_id=$(_kcadm get "client-scopes" -r "$REALM" --fields id,name 2>/dev/null | \
            grep -B1 "\"$scope_name\"" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
        if [ -n "$scope_id" ]; then
            if _kcadm update "clients/$uuid/default-client-scopes/$scope_id" -r "$REALM" 2>/dev/null; then
                log_info "    Assigned default scope '$scope_name'"
            else
                log_info "    Default scope '$scope_name' already assigned"
            fi
        else
            log_warn "    Default scope '$scope_name' not found in realm"
        fi
    done

    # Optional scopes (included when explicitly requested)
    local optional_scopes=("email")
    for scope_name in "${optional_scopes[@]}"; do
        local scope_id
        scope_id=$(_kcadm get "client-scopes" -r "$REALM" --fields id,name 2>/dev/null | \
            grep -B1 "\"$scope_name\"" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
        if [ -n "$scope_id" ]; then
            if _kcadm update "clients/$uuid/optional-client-scopes/$scope_id" -r "$REALM" 2>/dev/null; then
                log_info "    Assigned optional scope '$scope_name'"
            else
                log_info "    Optional scope '$scope_name' already assigned"
            fi
        else
            log_warn "    Optional scope '$scope_name' not found in realm"
        fi
    done

    # Add mcp-gateway audience mapper so exchanged tokens are accepted by the gateway
    # Without this, the gateway rejects tokens with "jwt audience invalid"
    log_info "  Adding mcp-gateway audience mapper..."
    _kcadm create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
        -s name="mcp-gateway-audience" \
        -s protocol="openid-connect" \
        -s protocolMapper="oidc-audience-mapper" \
        -s consentRequired=false \
        -s 'config."included.client.audience"="mcp-gateway"' \
        -s 'config."id.token.claim"="false"' \
        -s 'config."access.token.claim"="true"' 2>/dev/null || {
        log_info "    Audience mapper already exists"
    }

    # Add explicit username mapper to ensure preferred_username is included
    # This guarantees the claim exists even if profile scope doesn't handle it for service accounts
    log_info "  Adding username mapper for token exchange..."
    _kcadm create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
        -s name="username-mapper" \
        -s protocol="openid-connect" \
        -s protocolMapper="oidc-usermodel-property-mapper" \
        -s consentRequired=false \
        -s 'config."user.attribute"="username"' \
        -s 'config."claim.name"="preferred_username"' \
        -s 'config."jsonType.label"="String"' \
        -s 'config."id.token.claim"="true"' \
        -s 'config."access.token.claim"="true"' \
        -s 'config."userinfo.token.claim"="true"' 2>/dev/null || {
        log_info "    Username mapper already exists"
    }

    log_info "  mcp-integration-runner client configured with token exchange scopes"
}

# =============================================================================
# Sample App Clients (already data-driven)
# =============================================================================

# Sync sample application clients (hr-app, finance-app, sales-app, support-app)
sync_sample_app_clients() {
    log_info "Syncing sample app clients..."

    local apps=("hr-app:4001" "finance-app:4002" "sales-app:4003" "support-app:4004")

    # Determine domain based on environment
    local domain
    case "${ENV:-dev}" in
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
# Integration Test Client (T1/T3 — Security Audit Remediation)
# =============================================================================

# Generate JSON for mcp-integration-runner client (confidential, dev-only)
# T1: Dedicated test client for integration tests — replaces mcp-gateway usage in tests.
# T3: Network-gated to localhost only (never internet-accessible).
get_integration_runner_client_json() {
    cat <<EOF
{
    "clientId": "mcp-integration-runner",
    "name": "MCP Integration Test Runner",
    "description": "Confidential client for automated integration tests (dev only)",
    "enabled": true,
    "publicClient": false,
    "standardFlowEnabled": false,
    "directAccessGrantsEnabled": false,
    "serviceAccountsEnabled": true,
    "protocol": "openid-connect",
    "redirectUris": ["http://localhost/*", "http://127.0.0.1/*"],
    "webOrigins": ["http://localhost", "http://127.0.0.1"],
    "fullScopeAllowed": true,
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

