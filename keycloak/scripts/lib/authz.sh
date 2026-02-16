#!/bin/bash
# =============================================================================
# Keycloak Authorization Services Functions
# =============================================================================
# Provides authorization (fine-grained permission) management for Keycloak.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   ENV - Environment name (dev, stage, prod)
#   KEYCLOAK_URL - Base URL for Keycloak REST API
#   ADMIN_TOKEN - Admin access token for REST API calls
#
# Dependencies:
#   - lib/common.sh (logging functions)
#   - lib/clients.sh (get_client_uuid)
#   - curl, jq
#
# =============================================================================

# Source common utilities
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Authorization Helper Functions
# =============================================================================

# Get admin access token for REST API calls
# Returns: Access token (stdout)
# NOTE: Currently not used - token acquisition is inlined in sync_token_exchange_permissions()
#       to avoid nested subshell issues. Kept for reference.
get_admin_token() {
    log_info "  [DEBUG] Entering get_admin_token function"

    local token_url="${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    log_info "  [DEBUG] Token URL: $token_url"

    # Test if curl exists
    if curl --version >/dev/null 2>&1; then
        log_info "  [DEBUG] curl is available"
    else
        log_error "curl is NOT available"
        return 1
    fi

    # Test if jq exists
    if /usr/local/bin/jq --version >/dev/null 2>&1; then
        log_info "  [DEBUG] jq is available at /usr/local/bin/jq"
    else
        log_error "jq is NOT available at /usr/local/bin/jq"
        return 1
    fi

    log_info "  [DEBUG] KEYCLOAK_ADMIN_CLIENT_SECRET is ${KEYCLOAK_ADMIN_CLIENT_SECRET:+SET}"
    log_info "  [DEBUG] ADMIN_USER=${ADMIN_USER:-NOT_SET}"
    log_info "  [DEBUG] ADMIN_PASS is ${ADMIN_PASS:+SET}"

    log_info "  [DEBUG] Calling curl to get admin token..."
    local token_response
    if [ -n "${KEYCLOAK_ADMIN_CLIENT_SECRET:-}" ]; then
        log_info "  [DEBUG] Using client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET)"
        token_response=$(curl -s -X POST "$token_url" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=admin-cli" \
            -d "client_secret=${KEYCLOAK_ADMIN_CLIENT_SECRET}" \
            -d "grant_type=client_credentials" 2>&1) || {
            log_error "curl command failed"
            return 1
        }
    else
        log_info "  [DEBUG] Using ROPC fallback (admin username/password)"
        token_response=$(curl -s -X POST "$token_url" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "username=${ADMIN_USER}" \
            -d "password=${ADMIN_PASS}" \
            -d "grant_type=password" \
            -d "client_id=admin-cli" 2>&1) || {
            log_error "curl command failed"
            return 1
        }
    fi

    log_info "  [DEBUG] curl completed, parsing with jq..."
    local token
    token=$(echo "$token_response" | /usr/local/bin/jq -r '.access_token // empty' 2>&1) || {
        log_error "jq command failed"
        log_error "Response was: $token_response"
        return 1
    }

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get admin token (empty or null)"
        log_error "Full response: $token_response"
        return 1
    fi

    log_info "  [DEBUG] Admin token acquired successfully (length: ${#token})"
    echo "$token"
}

# Make a REST API call to Keycloak (used for Authorization Services APIs not supported by kcadm)
# Arguments:
#   $1 - HTTP method (GET, POST, PUT, DELETE)
#   $2 - API endpoint path (relative to /auth/admin/realms/$REALM)
#   $3 - Optional request body (JSON)
# Returns: HTTP response body (stdout), HTTP status code via LAST_HTTP_STATUS global
rest_api_call() {
    local method="$1"
    local endpoint="$2"
    local body="${3:-}"

    local full_url="${KEYCLOAK_URL}/admin/realms/${REALM}/${endpoint}"
    local response

    if [ -n "$body" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$full_url" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$body" 2>/dev/null)
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" "$full_url" \
            -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null)
    fi

    # Extract HTTP status and body
    LAST_HTTP_STATUS=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    echo "$response" | sed '/HTTP_STATUS/d'
}

# Check if a client policy exists in Authorization Services
# Arguments:
#   $1 - realm-management client UUID
#   $2 - Policy name
# Returns: 0 if exists, 1 if not
policy_exists() {
    local rm_client_uuid="$1"
    local policy_name="$2"

    local result
    result=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/policy?name=${policy_name}")

    echo "$result" | jq -e '.[0].id' > /dev/null 2>&1
}

# Get policy ID by name
# Arguments:
#   $1 - realm-management client UUID
#   $2 - Policy name
# Returns: Policy UUID (empty if not found)
get_policy_id() {
    local rm_client_uuid="$1"
    local policy_name="$2"

    local result
    result=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/policy?name=${policy_name}")

    echo "$result" | jq -r '.[0].id // empty'
}

# =============================================================================
# Token Exchange Authorization Configuration
# =============================================================================

# Configure token exchange permissions for mcp-integration-runner service account
# This function implements the Read-Modify-Write pattern required by Keycloak's
# Authorization API to bind client policies to permissions.
#
# Prerequisites:
#   - mcp-integration-runner client must exist with serviceAccountsEnabled=true
#   - Service account must have 'impersonate' role assigned
#   - token-exchange and admin-fine-grained-authz features must be enabled
#
# Reference: .claude/plans/keycloak-token-exchange-RESOLUTION.md
sync_token_exchange_permissions() {
    # Only configure in dev and CI environments (test-only feature)
    if [ "${ENV:-dev}" != "dev" ] && [ "${ENV:-dev}" != "ci" ]; then
        log_info "Skipping token exchange permissions (test environments only)"
        return 0
    fi

    log_info "Syncing token exchange permissions for mcp-integration-runner..."

    # Get admin token for REST API calls (inline to avoid subshell issues)
    log_info "  Authenticating for REST API access..."

    # Set admin credentials from environment
    local ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
    local ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"

    if [ -z "$ADMIN_PASS" ]; then
        log_error "  KEYCLOAK_ADMIN_PASSWORD not set"
        return 1
    fi

    # Acquire admin token (inline pattern from configure-token-exchange.sh)
    local token_url="${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    log_info "  Token URL: $token_url"

    # Note: ADMIN_TOKEN must be non-local so rest_api_call() can access it
    ADMIN_TOKEN=$(curl -s -X POST "$token_url" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=${ADMIN_USER}" \
        -d "password=${ADMIN_PASS}" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" | /usr/local/bin/jq -r '.access_token // empty')

    if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
        log_error "  Failed to get admin token"
        return 1
    fi

    log_info "  Admin token acquired successfully"

    # Step 1: Get realm-management client UUID
    log_info "  Looking up realm-management client..."
    local rm_client_uuid
    rm_client_uuid=$(get_client_uuid "realm-management")

    if [ -z "$rm_client_uuid" ]; then
        log_error "  realm-management client not found"
        return 1
    fi

    log_info "  realm-management UUID: $rm_client_uuid"

    # Step 2: Enable users management permissions
    # IMPORTANT: This MUST happen before creating policies.
    # In Keycloak 24, enabling users-management-permissions is what bootstraps
    # Authorization Services on the realm-management client (sets authorizationServicesEnabled=true
    # and creates the resource server). Without this, the authz/resource-server/* endpoints return 404.
    # You cannot enable authorizationServicesEnabled directly via PUT on realm-management.
    log_info "  Enabling users management permissions (bootstraps Authorization Services)..."
    local users_perm_json='{"enabled": true}'
    local users_perm_result
    users_perm_result=$(rest_api_call PUT "users-management-permissions" "$users_perm_json")

    local impersonate_perm_id
    impersonate_perm_id=$(echo "$users_perm_result" | jq -r '.scopePermissions.impersonate // empty')

    if [ -z "$impersonate_perm_id" ]; then
        log_error "  Failed to get impersonate permission ID"
        echo "$users_perm_result" | jq '.' >&2
        return 1
    fi

    log_info "  Impersonate permission ID: $impersonate_perm_id"

    # Step 3: Verify mcp-integration-runner client exists
    log_info "  Verifying mcp-integration-runner client..."
    local mcp_client_uuid
    mcp_client_uuid=$(get_client_uuid "mcp-integration-runner")

    if [ -z "$mcp_client_uuid" ]; then
        log_warn "  mcp-integration-runner client not found, skipping authorization config"
        return 0
    fi

    log_info "  mcp-integration-runner UUID: $mcp_client_uuid"

    # Step 4: Create or get client policy
    # Now that Authorization Services are bootstrapped (step 2), the authz endpoints work.
    log_info "  Creating client policy..."
    local policy_name="mcp-integration-runner-policy"
    local policy_id

    if policy_exists "$rm_client_uuid" "$policy_name"; then
        policy_id=$(get_policy_id "$rm_client_uuid" "$policy_name")
        log_info "  Policy already exists: $policy_id"
    else
        local policy_json
        policy_json=$(cat <<EOF
{
    "type": "client",
    "logic": "POSITIVE",
    "decisionStrategy": "UNANIMOUS",
    "name": "$policy_name",
    "description": "Allow MCP integration runner to perform token exchange",
    "clients": ["$mcp_client_uuid"]
}
EOF
)

        local policy_result
        policy_result=$(rest_api_call POST "clients/${rm_client_uuid}/authz/resource-server/policy/client" "$policy_json")

        policy_id=$(echo "$policy_result" | jq -r '.id // empty')

        if [ -z "$policy_id" ]; then
            log_error "  Failed to create policy"
            echo "$policy_result" | jq '.' >&2
            return 1
        fi

        log_info "  Policy created: $policy_id"
    fi

    # Step 5: Read-Modify-Write - Bind policy to impersonate permission
    _bind_policy_to_permission "$rm_client_uuid" "$impersonate_perm_id" "$policy_id" "impersonate" || return 1

    # Step 6: Bind policy to token-exchange permission for mcp-gateway client
    # Token exchange requires BOTH:
    #   - user-impersonated permission (step 5) - allows impersonating users
    #   - token-exchange permission on target client - allows exchange TO that audience
    log_info "  Looking up mcp-gateway client for token-exchange permission..."
    local mcp_gateway_uuid
    mcp_gateway_uuid=$(get_client_uuid "mcp-gateway")

    if [ -z "$mcp_gateway_uuid" ]; then
        log_warn "  mcp-gateway client not found, skipping token-exchange permission"
    else
        log_info "  mcp-gateway UUID: $mcp_gateway_uuid"

        # Find the token-exchange.permission.client.<mcp-gateway-uuid> permission
        local token_exchange_perm_name="token-exchange.permission.client.${mcp_gateway_uuid}"
        log_info "  Looking for permission: $token_exchange_perm_name"

        local token_exchange_perm
        token_exchange_perm=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/permission?name=${token_exchange_perm_name}&first=0&max=1")
        local token_exchange_perm_id
        token_exchange_perm_id=$(echo "$token_exchange_perm" | jq -r '.[0].id // empty')

        if [ -z "$token_exchange_perm_id" ]; then
            log_warn "  Token exchange permission not found for mcp-gateway"
            log_warn "  This may indicate mcp-gateway client permissions are not enabled"
        else
            log_info "  Token exchange permission ID: $token_exchange_perm_id"
            _bind_policy_to_permission "$rm_client_uuid" "$token_exchange_perm_id" "$policy_id" "token-exchange" || return 1
        fi
    fi

    log_info "  Token exchange permissions configured successfully"
}

# Helper function to bind a policy to a permission (idempotent read-modify-write)
# Arguments:
#   $1 - realm-management client UUID
#   $2 - Permission ID
#   $3 - Policy ID to bind
#   $4 - Permission name (for logging)
# Returns: 0 on success, 1 on failure
_bind_policy_to_permission() {
    local rm_client_uuid="$1"
    local perm_id="$2"
    local policy_id="$3"
    local perm_name="$4"

    log_info "  Binding policy to ${perm_name} permission (read-modify-write)..."

    # READ: Get current permission state
    local current_perm
    current_perm=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/permission/scope/${perm_id}")

    # Check if policy is already bound via associatedPolicies endpoint
    local associated_policies
    associated_policies=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/policy/${perm_id}/associatedPolicies")
    local already_bound
    already_bound=$(echo "$associated_policies" | jq -r --arg pid "$policy_id" '.[] | select(.id == $pid) | .id')

    if [ -n "$already_bound" ]; then
        log_info "  Policy already bound to ${perm_name} permission"
        return 0
    fi

    # MODIFY: Add policy ID to policies array (ensuring uniqueness)
    local modified_perm
    modified_perm=$(echo "$current_perm" | jq --arg policy_id "$policy_id" '
        if .policies == null then
            .policies = [$policy_id]
        else
            .policies = (.policies + [$policy_id] | unique)
        end
    ')

    # WRITE: Send complete modified object back
    rest_api_call PUT "clients/${rm_client_uuid}/authz/resource-server/permission/scope/${perm_id}" "$modified_perm" > /dev/null

    # Check HTTP status
    if [ "$LAST_HTTP_STATUS" != "200" ] && [ "$LAST_HTTP_STATUS" != "201" ] && [ "$LAST_HTTP_STATUS" != "204" ]; then
        log_error "  Failed to update ${perm_name} permission (HTTP $LAST_HTTP_STATUS)"
        return 1
    fi

    log_info "  ${perm_name} permission updated (HTTP $LAST_HTTP_STATUS)"

    # Verify the binding persisted
    log_info "  Verifying ${perm_name} policy binding persisted..."
    sleep 1

    local verify_policies
    verify_policies=$(rest_api_call GET "clients/${rm_client_uuid}/authz/resource-server/policy/${perm_id}/associatedPolicies")

    local policy_count
    policy_count=$(echo "$verify_policies" | jq 'length // 0')

    if [ "$policy_count" = "0" ] || [ "$policy_count" = "null" ]; then
        log_error "  ${perm_name} policy binding did NOT persist"
        echo "$verify_policies" | jq '.' >&2
        return 1
    fi

    log_info "  ${perm_name} policy binding verified ($policy_count associated policies)"
    return 0
}
