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
        "https://tamshai-playground.local/*",
        "https://www.tamshai-playground.local/*",
        "https://tamshai-playground.local:8443/*",
        "https://www.tamshai-playground.local:8443/*",
        "https://$vps_domain/*",
        "https://tamshai.com/*",
        "https://www.tamshai.com/*",
        "https://prod.tamshai.com/*"
    ],
    "webOrigins": [
        "http://localhost:8080",
        "https://tamshai-playground.local",
        "https://www.tamshai-playground.local",
        "https://tamshai-playground.local:8443",
        "https://www.tamshai-playground.local:8443",
        "https://$vps_domain",
        "https://tamshai.com",
        "https://www.tamshai.com",
        "https://prod.tamshai.com"
    ],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:8080/*##https://tamshai-playground.local/*##https://www.tamshai-playground.local/*##https://tamshai-playground.local:8443/*##https://www.tamshai-playground.local:8443/*##https://$vps_domain/*##https://tamshai.com/*##https://www.tamshai.com/*##https://prod.tamshai.com/*"
    },
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

# Generate JSON for mcp-gateway client (confidential, service account)
# P1: directAccessGrantsEnabled is only true in dev (for integration tests).
# In stage/prod, password grant is disabled — use PKCE or service account flows.
get_mcp_gateway_client_json() {
    # Determine domain based on environment
    local domain
    local direct_access="false"
    case "${ENV:-dev}" in
        dev)
            domain="tamshai-playground.local"
            direct_access="false"
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
    "webOrigins": ["+"],
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
            redirect_uris='"http://localhost:4000/*", "https://www.tamshai-playground.local/*", "https://www.tamshai-playground.local/app/*", "https://www.tamshai-playground.local:8443/*", "https://www.tamshai-playground.local:8443/app/*"'
            web_origins='"http://localhost:4000", "https://www.tamshai-playground.local", "https://www.tamshai-playground.local:8443"'
            logout_uris="http://localhost:4000/*##https://www.tamshai-playground.local/*##https://www.tamshai-playground.local:8443/*"
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

# Generate JSON for mcp-hr-service client (confidential, service account)
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
    "fullScopeAllowed": true,
    "protocol": "openid-connect",
    "defaultClientScopes": ["profile", "email", "roles"]
}
EOF
}

# =============================================================================
# Client Sync Functions
# =============================================================================

# Sync tamshai-website client
sync_website_client() {
    log_info "Syncing tamshai-website client..."
    local client_json
    client_json=$(get_tamshai_website_client_json)
   create_or_update_client "tamshai-website" "$client_json"
}

# Sync Flutter client
sync_flutter_client() {
    log_info "Syncing tamshai-flutter-client..."
    local client_json
    client_json=$(get_flutter_client_json)
   create_or_update_client "tamshai-flutter-client" "$client_json"
}

# Sync web-portal client
sync_web_portal_client() {
    log_info "Syncing web-portal client..."
    local client_json
    client_json=$(get_web_portal_client_json)
   create_or_update_client "web-portal" "$client_json"
}

# Sync mcp-gateway client
sync_mcp_gateway_client() {
    log_info "Syncing mcp-gateway client..."

    # Get client secret from environment (fail if not set)
    local client_secret="${MCP_GATEWAY_CLIENT_SECRET:?MCP_GATEWAY_CLIENT_SECRET must be set}"

    local client_json
    client_json=$(get_mcp_gateway_client_json)
   create_or_update_client "mcp-gateway" "$client_json"

    # Set client secret
    local uuid
    uuid=$(get_client_uuid "mcp-gateway")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    fi
}

# Sync mcp-hr-service client with service account roles
# P3: Blocked in production — service account with manage-users/manage-realm
# roles must not be auto-provisioned in prod (security policy).
sync_mcp_hr_service_client() {
    if [ "${ENV:-dev}" = "prod" ]; then
        log_warn "Skipping mcp-hr-service client in production (security policy)"
        return 0
    fi

    log_info "Syncing mcp-hr-service client (identity sync)..."

    # Get client secret from environment (fail if not set)
    local client_secret="${MCP_HR_SERVICE_CLIENT_SECRET:?MCP_HR_SERVICE_CLIENT_SECRET must be set}"

    local client_json
    client_json=$(get_mcp_hr_service_client_json)
   create_or_update_client "mcp-hr-service" "$client_json"

    # Set client secret and fullScopeAllowed explicitly
    local uuid
    uuid=$(get_client_uuid "mcp-hr-service")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update, trying regenerate..."
            _kcadm create "clients/$uuid/client-secret" -r "$REALM" 2>/dev/null || true
        }

        # Enable fullScopeAllowed so service account roles appear in access token
        log_info "  Enabling fullScopeAllowed for service account roles..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "fullScopeAllowed=true" 2>/dev/null || {
            log_warn "  Failed to enable fullScopeAllowed"
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

    # Assign service account roles for user management
    log_info "  Assigning realm-management roles to service account..."
    local service_account_id
    service_account_id=$(_kcadm get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    if [ -n "$service_account_id" ]; then
        # Get realm-management client UUID
        local realm_mgmt_uuid
        realm_mgmt_uuid=$(get_client_uuid "realm-management")
        if [ -n "$realm_mgmt_uuid" ]; then
            # Assign manage-users role
            log_info "  Assigning manage-users role..."
            if _kcadm add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename manage-users; then
                log_info "    manage-users role assigned"
            else
                log_warn "    Could not assign manage-users role (may already be assigned)"
            fi

            log_info "  Assigning view-users role..."
            if _kcadm add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename view-users; then
                log_info "    view-users role assigned"
            else
                log_warn "    Could not assign view-users role (may already be assigned)"
            fi

            log_info "  Assigning query-users role..."
            if _kcadm add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename query-users; then
                log_info "    query-users role assigned"
            else
                log_warn "    Could not assign query-users role (may already be assigned)"
            fi

            # view-realm is required to read available realm roles before assigning them
            log_info "  Assigning view-realm role..."
            if _kcadm add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename view-realm; then
                log_info "    view-realm role assigned"
            else
                log_warn "    Could not assign view-realm role (may already be assigned)"
            fi

            # manage-realm is required to assign realm roles to users
            log_info "  Assigning manage-realm role..."
            if _kcadm add-roles -r "$REALM" \
                --uusername "service-account-mcp-hr-service" \
                --cclientid realm-management \
                --rolename manage-realm; then
                log_info "    manage-realm role assigned"
            else
                log_warn "    Could not assign manage-realm role (may already be assigned)"
            fi

            log_info "  Service account roles assigned"
        fi
    fi

    log_info "  mcp-hr-service client configured for identity sync"
}

# Sync sample application clients (hr-app, finance-app, sales-app, support-app)
sync_sample_app_clients() {
    log_info "Syncing sample app clients..."

    local apps=("hr-app:4001" "finance-app:4002" "sales-app:4003" "support-app:4004")

    # Determine domain based on environment
    local domain
    case "${ENV:-dev}" in
        dev)
            domain="tamshai-playground.local"
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

# Sync mcp-integration-runner client (dev-only)
# T1: Creates/updates a dedicated test client so integration tests don't use mcp-gateway.
# T3: Guarded to dev only — returns early in prod/stage.
sync_integration_runner_client() {
    # Only create in dev and CI environments (test-only client)
    # Production environments (stage, prod) should NOT have this client
    if [ "${ENV:-dev}" != "dev" ] && [ "${ENV:-dev}" != "ci" ]; then
        log_info "Skipping mcp-integration-runner client (test environments only)"
        return 0
    fi

    log_info "Syncing mcp-integration-runner client (integration tests, ENV=${ENV:-dev})..."

    local client_json
    client_json=$(get_integration_runner_client_json)
    create_or_update_client "mcp-integration-runner" "$client_json"

    # Set client secret from environment or generate one
    local client_secret="${MCP_INTEGRATION_RUNNER_SECRET:-}"
    local uuid
    uuid=$(get_client_uuid "mcp-integration-runner")

    if [ -n "$uuid" ]; then
        if [ -n "$client_secret" ]; then
            log_info "  Setting client secret from MCP_INTEGRATION_RUNNER_SECRET..."
            _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
                log_warn "  Failed to set client secret via update"
            }
        else
            log_info "  No MCP_INTEGRATION_RUNNER_SECRET set — using Keycloak-generated secret"
            log_info "  To set a specific secret: export MCP_INTEGRATION_RUNNER_SECRET=<secret>"
        fi

        # Grant the 'impersonate' role to the service account for token exchange
        log_info "  Assigning 'impersonate' role to service account..."
        local service_account_id
        service_account_id=$(_kcadm get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
        if [ -n "$service_account_id" ]; then
            local realm_mgmt_uuid
            realm_mgmt_uuid=$(get_client_uuid "realm-management")
            if [ -n "$realm_mgmt_uuid" ]; then
                if _kcadm add-roles -r "$REALM" --uusername "service-account-mcp-integration-runner" --cclientid realm-management --rolename impersonate; then
                    log_info "    'impersonate' role assigned successfully."
                else
                    log_warn "    Could not assign 'impersonate' role (may already be assigned)."
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
    fi

    log_info "  mcp-integration-runner client configured with token exchange scopes"
}
