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
        local uuid=$(get_client_uuid "$client_id")
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
        "https://$vps_domain/*",
        "https://tamshai.com/*",
        "https://www.tamshai.com/*",
        "https://prod.tamshai.com/*"
    ],
    "webOrigins": [
        "http://localhost:8080",
        "https://tamshai.local",
        "https://www.tamshai.local",
        "https://$vps_domain",
        "https://tamshai.com",
        "https://www.tamshai.com",
        "https://prod.tamshai.com"
    ],
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:8080/*##https://tamshai.local/*##https://www.tamshai.local/*##https://$vps_domain/*##https://tamshai.com/*##https://www.tamshai.com/*##https://prod.tamshai.com/*"
    },
    "defaultClientScopes": ["openid", "profile", "email", "roles"]
}
EOF
}

# Generate JSON for mcp-gateway client (confidential, service account)
get_mcp_gateway_client_json() {
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

    cat <<EOF
{
    "clientId": "mcp-gateway",
    "name": "MCP Gateway",
    "description": "Backend service for AI orchestration",
    "enabled": true,
    "publicClient": false,
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": true,
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
            redirect_uris='"http://localhost:4000/*", "https://www.tamshai.local/*", "https://www.tamshai.local/app/*"'
            web_origins='"http://localhost:4000", "https://www.tamshai.local"'
            logout_uris="http://localhost:4000/*##https://www.tamshai.local/*"
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
    local client_json=$(get_tamshai_website_client_json)
   create_or_update_client "tamshai-website" "$client_json"
}

# Sync Flutter client
sync_flutter_client() {
    log_info "Syncing tamshai-flutter-client..."
    local client_json=$(get_flutter_client_json)
   create_or_update_client "tamshai-flutter-client" "$client_json"
}

# Sync web-portal client
sync_web_portal_client() {
    log_info "Syncing web-portal client..."
    local client_json=$(get_web_portal_client_json)
   create_or_update_client "web-portal" "$client_json"
}

# Sync mcp-gateway client
sync_mcp_gateway_client() {
    log_info "Syncing mcp-gateway client..."

    # Get client secret from environment or use default
    local client_secret="${MCP_GATEWAY_CLIENT_SECRET:-mcp-gateway-secret}"

    local client_json=$(get_mcp_gateway_client_json)
   create_or_update_client "mcp-gateway" "$client_json"

    # Set client secret
    local uuid=$(get_client_uuid "mcp-gateway")
    if [ -n "$uuid" ]; then
        log_info "  Setting client secret..."
        _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret" 2>/dev/null || {
            log_warn "  Failed to set client secret via update"
        }
    fi
}

# Sync mcp-hr-service client with service account roles
sync_mcp_hr_service_client() {
    log_info "Syncing mcp-hr-service client (identity sync)..."

    # Get client secret from environment or use default
    local client_secret="${MCP_HR_SERVICE_CLIENT_SECRET:-hr-service-secret}"

    local client_json=$(get_mcp_hr_service_client_json)
   create_or_update_client "mcp-hr-service" "$client_json"

    # Set client secret and fullScopeAllowed explicitly
    local uuid=$(get_client_uuid "mcp-hr-service")
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
    local service_account_id=$(_kcadm get "clients/$uuid/service-account-user" -r "$REALM" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    if [ -n "$service_account_id" ]; then
        # Get realm-management client UUID
        local realm_mgmt_uuid=$(get_client_uuid "realm-management")
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
