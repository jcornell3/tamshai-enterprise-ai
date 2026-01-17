#!/bin/bash
# =============================================================================
# Keycloak Protocol Mapper Functions
# =============================================================================
# Provides protocol mapper management functions for Keycloak realm synchronization.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   KCADM - Path to kcadm.sh
#
# Dependencies:
#   - lib/common.sh (logging functions)
#   - lib/clients.sh (get_client_uuid)
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Mapper JSON Generators
# =============================================================================

# Generate JSON for audience mapper
# Arguments:
#   $1 - Audience client ID (e.g., "mcp-gateway")
get_audience_mapper_json() {
    local audience="${1:-mcp-gateway}"
    cat <<EOF
{
    "name": "${audience}-audience",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-audience-mapper",
    "consentRequired": false,
    "config": {
        "included.client.audience": "$audience",
        "id.token.claim": "false",
        "access.token.claim": "true"
    }
}
EOF
}

# Generate JSON for subject (sub) claim mapper
get_sub_claim_mapper_json() {
    cat <<EOF
{
    "name": "subject-claim-mapper",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "consentRequired": false,
    "config": {
        "user.attribute": "id",
        "claim.name": "sub",
        "jsonType.label": "String",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true"
    }
}
EOF
}

# Generate JSON for client roles mapper
# Arguments:
#   $1 - Mapper name (optional)
#   $2 - Source client ID (optional)
#   $3 - Claim name (optional)
get_client_roles_mapper_json() {
    local mapper_name="${1:-client-roles-mapper}"
    local source_client="${2:-}"
    local claim_name="${3:-resource_access.\${client_id}.roles}"

    cat <<EOF
{
    "name": "$mapper_name",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-client-role-mapper",
    "consentRequired": false,
    "config": {
        "multivalued": "true",
        "userinfo.token.claim": "true",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "claim.name": "$claim_name",
        "jsonType.label": "String"
    }
}
EOF
}

# =============================================================================
# Mapper Add Functions
# =============================================================================

# Helper to get client UUID (works whether clients.sh is loaded or not)
# Accepts either a client ID (e.g., "tamshai-website") or a UUID directly
_get_client_uuid() {
    local client_id="$1"
    # If input ends with "-uuid" or looks like a UUID, return it directly
    # This allows tests to pass mock UUIDs directly
    if [[ "$client_id" == *"-uuid" ]] || [[ "$client_id" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]; then
        echo "$client_id"
        return 0
    fi
    # If get_client_uuid function is available from clients.sh, use it
    if type get_client_uuid &>/dev/null 2>&1; then
        get_client_uuid "$client_id"
    else
        # Otherwise query directly - handle both JSON formats (with/without spaces)
        _kcadm get clients -r "$REALM" -q "clientId=$client_id" --fields id 2>/dev/null | grep -oE '"id"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
    fi
}

# Add or update mcp-gateway-audience mapper on a specific client
# Arguments:
#   $1 - Client ID
#   $2 - Audience (default: mcp-gateway)
add_audience_mapper_to_client() {
    local client_id="$1"
    local audience="${2:-mcp-gateway}"
    log_info "  Checking audience mapper for client '$client_id'..."

    local client_uuid=$(_get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    local mapper_name="${audience}-audience"

    # Check if mapper already exists and_kcadm get its ID
    local existing_mapper=$(_kcadm get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null | grep -o '"id" *: *"[^"]*".*"name" *: *"'$mapper_name'"' | head -1)

    if [ -n "$existing_mapper" ]; then
        # Mapper exists -_kcadm get its ID and UPDATE it (fixes broken mappers)
        local mapper_id=$(echo "$existing_mapper" | grep -o '"id" *: *"[^"]*"' | cut -d'"' -f4)
        log_info "    Updating existing audience mapper for '$client_id' (id: $mapper_id)..."

        if _kcadm update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-audience-mapper \
            -s consentRequired=false \
            -s 'config."included.client.audience"='$audience \
            -s 'config."id.token.claim"=false' \
            -s 'config."access.token.claim"=true' 2>/dev/null; then
            log_info "    Audience mapper updated successfully for '$client_id'"
        else
            log_warn "    Failed to  update audience mapper for '$client_id'"
        fi
    else
        # Create new audience mapper
        log_info "    Creating $mapper_name mapper for '$client_id'..."
        if _kcadm create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
            -s name="$mapper_name" \
            -s protocol=openid-connect \
            -s protocolMapper=oidc-audience-mapper \
            -s consentRequired=false \
            -s 'config."included.client.audience"='$audience \
            -s 'config."id.token.claim"=false' \
            -s 'config."access.token.claim"=true' 2>/dev/null; then
            log_info "    Audience mapper created successfully for '$client_id'"
        else
            log_warn "    Failed to  create audience mapper for '$client_id' (may already exist)"
        fi
    fi
}

# Add or update the subject (sub) claim mapper on a specific client
# Arguments:
#   $1 - Client ID
add_sub_claim_mapper_to_client() {
    local client_id="$1"
    log_info "  Checking sub claim mapper for client '$client_id'..."

    local client_uuid=$(_get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    local mapper_name="subject-claim-mapper"

    # Check if mapper already exists and_kcadm get its ID
    local all_mappers=$(_kcadm get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null)
    local mapper_id=$(echo "$all_mappers" | grep -B5 "\"name\" *: *\"$mapper_name\"" | grep '"id"' | head -1 | sed 's/.*"id" *: *"\([^"]*\)".*/\1/')

    if [ -n "$mapper_id" ]; then
        # Mapper exists - UPDATE it with correct type
        log_info "    Updating existing sub claim mapper for '$client_id' (id: $mapper_id)..."

        if _kcadm update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
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
            log_warn "    Failed to  update sub claim mapper for '$client_id'"
        fi
    else
        # Create new mapper
        log_info "    Creating sub claim mapper for '$client_id'..."
        if _kcadm create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
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
            log_warn "    Failed to  create sub claim mapper for '$client_id' (may already exist)"
        fi
    fi
}

# Add or update a client role mapper on a specific client
# Arguments:
#   $1 - Client ID (target client)
#   $2 - Mapper name
#   $3 - Source client ID (which client's roles to map)
#   $4 - Claim name
add_client_role_mapper() {
    local client_id="$1"
    local mapper_name="$2"
    local source_client_id="$3"
    local claim_name="$4"

    log_info "  Checking client role mapper '$mapper_name' for client '$client_id'..."

    local client_uuid=$(_get_client_uuid "$client_id")
    if [ -z "$client_uuid" ]; then
        log_warn "    Client '$client_id' not found, skipping"
        return 1
    fi

    # Check if mapper already exists
    local existing_mapper=$(_kcadm get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null | grep -o "\"id\" *: *\"[^\"]*\".*\"name\" *: *\"$mapper_name\"" | head -1)

    if [ -n "$existing_mapper" ]; then
        # Mapper exists -_kcadm get its ID and update it
        local mapper_id=$(echo "$existing_mapper" | grep -o '"id" *: *"[^"]*"' | cut -d'"' -f4)
        log_info "    Updating existing mapper '$mapper_name' (id: $mapper_id)..."

        if _kcadm update "clients/$client_uuid/protocol-mappers/models/$mapper_id" -r "$REALM" \
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
            log_info "    Mapper '$mapper_name  updated successfully"
        else
            log_warn "    Failed to  update mapper '$mapper_name'"
        fi
    else
        # Create new mapper
        log_info "    Creating new mapper '$mapper_name'..."

        if _kcadm create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
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
            log_info "    Mapper '$mapper_name  created successfully"
        else
            log_warn "    Failed to  create mapper '$mapper_name'"
        fi
    fi
}

# =============================================================================
# Mapper Sync Functions
# =============================================================================

# Sync the mcp-gateway-audience mapper on all web clients
sync_audience_mapper() {
    log_info "Syncing mcp-gateway-audience mapper on all web clients..."

    # Add mapper to tamshai-website (used by marketing site SSO)
    add_audience_mapper_to_client "tamshai-website"

    # Add mapper to web-portal (used by production Cloud Run apps)
    add_audience_mapper_to_client "web-portal"

    # Add mapper to Flutter client for mobile/desktop apps
    add_audience_mapper_to_client "tamshai-flutter-client"
}

# Sync the subject (sub) claim mapper on all web clients
sync_sub_claim_mapper() {
    log_info "Syncing subject (sub) claim mapper on all web clients..."

    # Add mapper to web-portal (used by production Cloud Run apps)
    add_sub_claim_mapper_to_client "web-portal"

    # Add mapper to tamshai-website (used by marketing site SSO)
    add_sub_claim_mapper_to_client "tamshai-website"

    # Add mapper to Flutter client for mobile/desktop apps
    add_sub_claim_mapper_to_client "tamshai-flutter-client"
}

# Sync client role mappers on web-portal
sync_client_role_mappers() {
    log_info "Syncing client role mappers on web-portal..."

    # Map mcp-gateway roles into web-portal tokens
    # This is CRITICAL for authorization - without it, users_kcadm get 403 Forbidden
    add_client_role_mapper "web-portal" "mcp-gateway-roles-mapper" "mcp-gateway" "resource_access.mcp-gateway.roles"

    # Map web-portal's own roles (if any exist)
    add_client_role_mapper "web-portal" "client-roles-mapper" "web-portal" "resource_access.web-portal.roles"
}
