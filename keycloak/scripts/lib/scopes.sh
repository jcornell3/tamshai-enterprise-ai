#!/bin/bash
# =============================================================================
# Keycloak Client Scope Functions
# =============================================================================
# Provides client scope management functions for Keycloak realm synchronization.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   KCADM - Path to kcadm.sh
#
# Dependencies:
#   - lib/common.sh (logging functions)
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Scope Cache
# =============================================================================

# Global scope ID cache (populated once at start)
declare -gA SCOPE_IDS 2>/dev/null || declare -A SCOPE_IDS

# =============================================================================
# Scope Helper Functions
# =============================================================================

# Get the ID of a client scope by name
# Arguments:
#   $1 - Scope name
# Returns: Scope ID (empty if not found)
get_scope_id() {
    local scope_name="$1"
    # Get all scopes with id and name, then filter for exact match
    local output=$(_kcadm get client-scopes -r "$REALM" --fields id,name 2>/dev/null)

    # Parse JSON to find scope with exact name match
    # Handle both compact JSON ("name":"value") and spaced JSON ("name" : "value")
    # Use POSIX character classes for portability
    local scope_line=$(echo "$output" | grep -E "\"name\"[[:space:]]*:[[:space:]]*\"$scope_name\"")
    if [ -n "$scope_line" ]; then
        # Try to extract id from same object - look for id before or after name in the JSON
        # Handle both formats: {"id":"xxx","name":"yyy"} and {"id" : "xxx", "name" : "yyy"}
        echo "$output" | grep -B 2 -A 2 -E "\"name\"[[:space:]]*:[[:space:]]*\"$scope_name\"" | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
    fi
}

# Populate scope ID cache (call once at startup)
cache_scope_ids() {
    log_info "Caching scope IDs..."
    local scopes=("roles" "web-origins" "profile" "email" "address" "phone" "offline_access" "openid")

    for scope in "${scopes[@]}"; do
        local scope_id=$(get_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            SCOPE_IDS["$scope"]="$scope_id"
            log_info "  Cached scope '$scope': $scope_id"
        fi
    done
}

# Get a cached scope ID
# Arguments:
#   $1 - Scope name
# Returns: Cached scope ID (empty if not in cache)
get_cached_scope_id() {
    local scope_name="$1"
    echo "${SCOPE_IDS[$scope_name]:-}"
}

# Get list of standard OIDC scopes
get_standard_scopes() {
    echo "openid profile email roles web-origins address phone offline_access"
}

# =============================================================================
# Scope Creation Functions
# =============================================================================

# Create a scope if it doesn't exist
# Arguments:
#   $1 - Scope name
#   $2 - Optional description
create_scope_if_missing() {
    local scope_name="$1"
    local description="${2:-OpenID Connect scope: $scope_name}"

    local scope_id=$(get_scope_id "$scope_name")
    if [ -z "$scope_id" ]; then
        log_info "  Creating '$scope_name' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name="$scope_name" \
            -s protocol=openid-connect \
            -s "description=$description" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=true 2>/dev/null || {
            log_warn "  Failed to  create $scope_name scope"
        }
    else
        log_info "  Scope '$scope_name' already exists"
    fi
}

# Create standard OIDC client scopes if they don't exist
create_standard_scopes() {
    log_info "Ensuring standard OIDC client scopes exist..."

    # OpenID scope - the core OIDC scope required for all OIDC flows
    log_info "  Checking for 'openid' scope..."
    local openid_id
    openid_id=$(get_scope_id "openid") || true
    log_info "  openid_id result: '${openid_id:-empty}'"
    if [ -z "$openid_id" ]; then
        log_info "  Creating 'openid' scope..."
        if _kcadm create client-scopes -r "$REALM" \
            -s name=openid \
            -s protocol=openid-connect \
            -s description="OpenID Connect built-in scope: openid" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=false 2>&1; then
            log_info "  Successfully created 'openid' scope"
        else
            log_warn "  Failed to create openid scope"
        fi
    else
        log_info "  Scope 'openid' already exists (id: $openid_id)"
    fi

    # Profile scope - for user profile claims
    local profile_id=$(get_scope_id "profile")
    if [ -z "$profile_id" ]; then
        log_info "  Creating 'profile' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name=profile \
            -s protocol=openid-connect \
            -s description="OpenID Connect built-in scope: profile" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to  create profile scope"
    else
        log_info "  Scope 'profile' already exists"
    fi

    # Email scope - for email claims
    local email_id=$(get_scope_id "email")
    if [ -z "$email_id" ]; then
        log_info "  Creating 'email' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name=email \
            -s protocol=openid-connect \
            -s description="OpenID Connect built-in scope: email" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to  create email scope"
    else
        log_info "  Scope 'email' already exists"
    fi

    # Web-origins scope - for web origin claims (CORS)
    local weborigins_id=$(get_scope_id "web-origins")
    if [ -z "$weborigins_id" ]; then
        log_info "  Creating 'web-origins' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name=web-origins \
            -s protocol=openid-connect \
            -s description="OpenID Connect scope for allowed web origins" \
            -s attributes.'include.in.token.scope'=false 2>/dev/null || log_warn "  Failed to  create web-origins scope"
    else
        log_info "  Scope 'web-origins' already exists"
    fi

    # Address scope - for address claims (optional but standard)
    local address_id=$(get_scope_id "address")
    if [ -z "$address_id" ]; then
        log_info "  Creating 'address' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name=address \
            -s protocol=openid-connect \
            -s description="OpenID Connect built-in scope: address" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to  create address scope"
    else
        log_info "  Scope 'address' already exists"
    fi

    # Phone scope - for phone claims (optional but standard)
    local phone_id=$(get_scope_id "phone")
    if [ -z "$phone_id" ]; then
        log_info "  Creating 'phone' scope..."
        _kcadm create client-scopes -r "$REALM" \
            -s name=phone \
            -s protocol=openid-connect \
            -s description="OpenID Connect built-in scope: phone" \
            -s attributes.'include.in.token.scope'=true \
            -s attributes.'display.on.consent.screen'=true 2>/dev/null || log_warn "  Failed to  create phone scope"
    else
        log_info "  Scope 'phone' already exists"
    fi
}

# =============================================================================
# Scope Assignment Functions
# =============================================================================

# Assign default and optional scopes to a client
# Arguments:
#   $1 - Client ID or UUID
#   $2 - Optional: space-separated list of scopes (ignored, uses standard scopes)
assign_client_scopes() {
    local client_id="$1"

    # Get client UUID
    local uuid
    # If input looks like a UUID or ends with "-uuid", use it directly
    if [[ "$client_id" == *"-uuid" ]] || [[ "$client_id" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]; then
        uuid="$client_id"
    elif type get_client_uuid &>/dev/null 2>&1; then
        uuid=$(get_client_uuid "$client_id")
    else
        # Query directly - handle both JSON formats
        uuid=$(_kcadm get clients -r "$REALM" -q "clientId=$client_id" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    fi

    if [ -z "$uuid" ]; then
        log_warn "  Client '$client_id' not found, cannot assign scopes"
        return 1
    fi

    # Default scopes - always included in tokens
    # Note: "openid" is the core OIDC scope and must be assigned for OIDC flows to work
    local default_scopes=("openid" "roles" "web-origins")

    # Optional scopes - can be requested via scope parameter
    local optional_scopes=("profile" "email" "address" "phone" "offline_access")

    # Use cached scope IDs instead of querying for each client
    for scope in "${default_scopes[@]}"; do
        local scope_id=$(get_cached_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            _kcadm create "clients/$uuid/default-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned default scope '$scope' to client '$client_id'"
        else
            log_warn "  Default scope '$scope' not found in cache"
        fi
    done

    for scope in "${optional_scopes[@]}"; do
        local scope_id=$(get_cached_scope_id "$scope")
        if [ -n "$scope_id" ]; then
            # Add as optional scope so it can be requested in OAuth flows
            _kcadm create "clients/$uuid/optional-client-scopes/$scope_id" -r "$REALM" 2>/dev/null || true
            log_info "  Assigned optional scope '$scope' to client '$client_id'"
        else
            log_warn "  Optional scope '$scope' not found in cache"
        fi
    done
}
