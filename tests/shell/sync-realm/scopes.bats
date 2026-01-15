#!/usr/bin/env bats
# RED Phase Tests: Keycloak Scope Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/sync-realm/scopes.bats

# =============================================================================
# Setup
# =============================================================================

setup() {
    if [ -f "scripts/lib/common.sh" ]; then
        source scripts/lib/common.sh
    fi

    # Mock kcadm
    kcadm() {
        echo "MOCK_KCADM: $*"
        return 0
    }
    export -f kcadm
}

# =============================================================================
# Test: Library file exists
# =============================================================================

@test "keycloak/scripts/lib/scopes.sh exists" {
    [ -f "keycloak/scripts/lib/scopes.sh" ]
}

# =============================================================================
# Test: Scope helper functions exist
# =============================================================================

@test "get_scope_id function exists" {
    source keycloak/scripts/lib/scopes.sh
    type get_scope_id
}

@test "cache_scope_ids function exists" {
    source keycloak/scripts/lib/scopes.sh
    type cache_scope_ids
}

@test "get_cached_scope_id function exists" {
    source keycloak/scripts/lib/scopes.sh
    type get_cached_scope_id
}

@test "create_standard_scopes function exists" {
    source keycloak/scripts/lib/scopes.sh
    type create_standard_scopes
}

@test "assign_client_scopes function exists" {
    source keycloak/scripts/lib/scopes.sh
    type assign_client_scopes
}

# =============================================================================
# Test: Standard scopes list
# =============================================================================

@test "get_standard_scopes returns expected scopes" {
    source keycloak/scripts/lib/scopes.sh
    run get_standard_scopes
    [ "$status" -eq 0 ]
    [[ "$output" == *"openid"* ]]
    [[ "$output" == *"profile"* ]]
    [[ "$output" == *"email"* ]]
    [[ "$output" == *"roles"* ]]
}

# =============================================================================
# Test: Scope caching
# =============================================================================

@test "cache_scope_ids populates SCOPE_CACHE" {
    source keycloak/scripts/lib/scopes.sh

    # Mock: return scope list
    kcadm() {
        if [[ "$*" == *"get client-scopes"* ]]; then
            echo '[{"id":"scope-1","name":"openid"},{"id":"scope-2","name":"profile"}]'
        fi
    }
    export -f kcadm

    cache_scope_ids "tamshai-corp"

    # SCOPE_CACHE should be populated
    [ -n "${SCOPE_CACHE:-}" ] || [ -n "${SCOPE_IDS[openid]:-}" ]
}

@test "get_cached_scope_id returns cached value" {
    source keycloak/scripts/lib/scopes.sh

    # Set up cache
    declare -gA SCOPE_IDS
    SCOPE_IDS[openid]="cached-openid-id"

    run get_cached_scope_id "openid"
    [ "$status" -eq 0 ]
    [ "$output" = "cached-openid-id" ]
}

# =============================================================================
# Test: Scope creation
# =============================================================================

@test "create_scope_if_missing handles existing scope" {
    source keycloak/scripts/lib/scopes.sh

    # Mock: scope exists
    kcadm() {
        echo '[{"id":"scope-id","name":"test-scope"}]'
    }
    export -f kcadm

    run create_scope_if_missing "test-scope"
    [ "$status" -eq 0 ]
    [[ "$output" == *"exists"* ]] || [[ "$output" == *"Already"* ]] || [[ "$output" == *"MOCK"* ]]
}

@test "create_scope_if_missing creates new scope" {
    source keycloak/scripts/lib/scopes.sh

    # Mock: scope doesn't exist
    kcadm() {
        if [[ "$*" == *"get client-scopes"* ]]; then
            echo '[]'
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run create_scope_if_missing "new-scope"
    [ "$status" -eq 0 ]
}

# =============================================================================
# Test: Scope assignment
# =============================================================================

@test "assign_client_scopes assigns default scopes to client" {
    source keycloak/scripts/lib/scopes.sh

    # Mock kcadm
    kcadm() {
        echo "MOCK: $*"
    }
    export -f kcadm

    run assign_client_scopes "client-uuid" "openid profile email"
    [ "$status" -eq 0 ]
}

@test "assign_client_scopes handles already-assigned scopes gracefully" {
    source keycloak/scripts/lib/scopes.sh

    # Mock: scope already assigned (returns error but should handle gracefully)
    kcadm() {
        if [[ "$*" == *"update"* ]]; then
            return 1  # Simulate "already exists" error
        fi
        echo "MOCK: $*"
    }
    export -f kcadm

    # Should not fail even if scope already assigned
    run assign_client_scopes "client-uuid" "openid"
    # We expect graceful handling (status 0 or logged warning)
    [ "$status" -eq 0 ] || [[ "$output" == *"already"* ]]
}
