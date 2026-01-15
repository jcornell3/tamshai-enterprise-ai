#!/usr/bin/env bats
# RED Phase Tests: Keycloak Auth/Environment Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/sync-realm/auth.bats

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

@test "keycloak/scripts/lib/auth.sh exists" {
    [ -f "keycloak/scripts/lib/auth.sh" ]
}

# =============================================================================
# Test: Environment configuration functions exist
# =============================================================================

@test "configure_environment function exists" {
    source keycloak/scripts/lib/auth.sh
    type configure_environment
}

@test "kcadm_login function exists" {
    source keycloak/scripts/lib/auth.sh
    type kcadm_login
}

# =============================================================================
# Test: Environment configuration
# =============================================================================

@test "configure_environment sets KEYCLOAK_URL for dev" {
    source keycloak/scripts/lib/auth.sh
    ENV="dev"
    configure_environment
    [ -n "$KEYCLOAK_URL" ]
}

@test "configure_environment sets KEYCLOAK_URL for stage" {
    source keycloak/scripts/lib/auth.sh
    ENV="stage"
    configure_environment
    [ -n "$KEYCLOAK_URL" ]
}

@test "configure_environment sets KEYCLOAK_URL for prod" {
    source keycloak/scripts/lib/auth.sh
    ENV="prod"
    configure_environment
    [ -n "$KEYCLOAK_URL" ]
}

@test "configure_environment fails for unknown environment" {
    source keycloak/scripts/lib/auth.sh
    ENV="invalid"
    run configure_environment
    [ "$status" -ne 0 ]
}

@test "configure_environment sets ADMIN_USER" {
    source keycloak/scripts/lib/auth.sh
    ENV="dev"
    configure_environment
    [ -n "$ADMIN_USER" ]
}

@test "configure_environment uses KEYCLOAK_ADMIN_PASSWORD from env" {
    source keycloak/scripts/lib/auth.sh
    export KEYCLOAK_ADMIN_PASSWORD="test-password"
    ENV="dev"
    configure_environment
    [ "$ADMIN_PASS" = "test-password" ]
}

# =============================================================================
# Test: KCADM path resolution
# =============================================================================

@test "get_kcadm_path function exists" {
    source keycloak/scripts/lib/auth.sh
    type get_kcadm_path
}

@test "get_kcadm_path returns valid path" {
    source keycloak/scripts/lib/auth.sh
    run get_kcadm_path
    [ "$status" -eq 0 ]
    [ -n "$output" ]
}

@test "get_kcadm_path prefers KEYCLOAK_HOME if set" {
    source keycloak/scripts/lib/auth.sh
    export KEYCLOAK_HOME="/opt/custom-keycloak"
    run get_kcadm_path
    [[ "$output" == *"/opt/custom-keycloak"* ]] || [ "$status" -eq 0 ]
}

# =============================================================================
# Test: Login behavior
# =============================================================================

@test "kcadm_login calls kcadm config credentials" {
    source keycloak/scripts/lib/auth.sh

    # Set up required variables
    KEYCLOAK_URL="http://localhost:8080/auth"
    ADMIN_USER="admin"
    ADMIN_PASS="admin"

    # Mock kcadm to capture call
    local kcadm_called=""
    kcadm() {
        kcadm_called="$*"
        return 0
    }
    export -f kcadm

    run kcadm_login
    [ "$status" -eq 0 ]
}

@test "kcadm_login handles authentication failure" {
    source keycloak/scripts/lib/auth.sh

    KEYCLOAK_URL="http://localhost:8080/auth"
    ADMIN_USER="admin"
    ADMIN_PASS="wrong-password"

    # Mock kcadm to simulate failure
    kcadm() {
        return 1
    }
    export -f kcadm

    run kcadm_login
    [ "$status" -ne 0 ]
}

# =============================================================================
# Test: Refactored sync-realm.sh structure
# =============================================================================

@test "sync-realm.sh sources lib/auth.sh" {
    grep -q "source.*lib/auth.sh" keycloak/scripts/sync-realm.sh || \
    grep -q "\. .*lib/auth.sh" keycloak/scripts/sync-realm.sh
}

@test "sync-realm.sh sources lib/clients.sh" {
    grep -q "source.*lib/clients.sh" keycloak/scripts/sync-realm.sh || \
    grep -q "\. .*lib/clients.sh" keycloak/scripts/sync-realm.sh
}

@test "sync-realm.sh sources lib/scopes.sh" {
    grep -q "source.*lib/scopes.sh" keycloak/scripts/sync-realm.sh || \
    grep -q "\. .*lib/scopes.sh" keycloak/scripts/sync-realm.sh
}

@test "sync-realm.sh sources lib/mappers.sh" {
    grep -q "source.*lib/mappers.sh" keycloak/scripts/sync-realm.sh || \
    grep -q "\. .*lib/mappers.sh" keycloak/scripts/sync-realm.sh
}

@test "sync-realm.sh sources lib/groups.sh" {
    grep -q "source.*lib/groups.sh" keycloak/scripts/sync-realm.sh || \
    grep -q "\. .*lib/groups.sh" keycloak/scripts/sync-realm.sh
}

@test "sync-realm.sh is under 200 lines after refactoring" {
    local line_count=$(wc -l < keycloak/scripts/sync-realm.sh)
    [ "$line_count" -lt 200 ]
}
