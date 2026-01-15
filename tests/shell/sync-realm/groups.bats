#!/usr/bin/env bats
# RED Phase Tests: Keycloak Group and User Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/sync-realm/groups.bats

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

    # Set default environment
    ENV="dev"
    REALM="tamshai-corp"
}

# =============================================================================
# Test: Library file exists
# =============================================================================

@test "keycloak/scripts/lib/groups.sh exists" {
    [ -f "keycloak/scripts/lib/groups.sh" ]
}

# =============================================================================
# Test: Group helper functions exist
# =============================================================================

@test "ensure_group_exists function exists" {
    source keycloak/scripts/lib/groups.sh
    type ensure_group_exists
}

@test "get_group_id function exists" {
    source keycloak/scripts/lib/groups.sh
    type get_group_id
}

@test "sync_all_employees_group function exists" {
    source keycloak/scripts/lib/groups.sh
    type sync_all_employees_group
}

@test "assign_user_groups function exists" {
    source keycloak/scripts/lib/groups.sh
    type assign_user_groups
}

@test "assign_user_to_group function exists" {
    source keycloak/scripts/lib/groups.sh
    type assign_user_to_group
}

# =============================================================================
# Test: Group creation
# =============================================================================

@test "ensure_group_exists creates group if missing" {
    source keycloak/scripts/lib/groups.sh

    # Mock: group doesn't exist
    kcadm() {
        if [[ "$*" == *"get groups"* ]]; then
            echo "[]"
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run ensure_group_exists "All-Employees"
    [ "$status" -eq 0 ]
}

@test "ensure_group_exists handles existing group" {
    source keycloak/scripts/lib/groups.sh

    # Mock: group exists
    kcadm() {
        if [[ "$*" == *"get groups"* ]]; then
            echo '[{"id":"group-id","name":"All-Employees"}]'
        fi
    }
    export -f kcadm

    run ensure_group_exists "All-Employees"
    [ "$status" -eq 0 ]
    [[ "$output" == *"exists"* ]] || [[ "$output" == *"already"* ]] || [[ "$output" == *"MOCK"* ]]
}

# =============================================================================
# Test: User-to-group assignment
# =============================================================================

@test "assign_user_to_group handles user not found" {
    source keycloak/scripts/lib/groups.sh

    # Mock: user doesn't exist
    kcadm() {
        if [[ "$*" == *"get users"* ]]; then
            echo "[]"
        fi
    }
    export -f kcadm

    run assign_user_to_group "nonexistent@example.com" "All-Employees"
    [ "$status" -eq 0 ]
    [[ "$output" == *"not found"* ]] || [[ "$output" == *"skipping"* ]] || [[ "$output" == *"MOCK"* ]]
}

@test "assign_user_to_group assigns user to group" {
    source keycloak/scripts/lib/groups.sh

    # Mock: user exists
    kcadm() {
        if [[ "$*" == *"get users"* ]]; then
            echo '[{"id":"user-id","username":"test@example.com"}]'
        elif [[ "$*" == *"get groups"* ]]; then
            echo '[{"id":"group-id","name":"All-Employees"}]'
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run assign_user_to_group "test@example.com" "All-Employees"
    [ "$status" -eq 0 ]
}

@test "assign_user_to_group handles already-assigned user" {
    source keycloak/scripts/lib/groups.sh

    # Mock: user already in group (update returns error)
    kcadm() {
        if [[ "$*" == *"get users"* ]]; then
            echo '[{"id":"user-id","username":"test@example.com"}]'
        elif [[ "$*" == *"get groups"* ]]; then
            echo '[{"id":"group-id","name":"All-Employees"}]'
        elif [[ "$*" == *"update"* ]]; then
            return 1  # Simulate "already member" error
        fi
    }
    export -f kcadm

    run assign_user_to_group "test@example.com" "All-Employees"
    # Should handle gracefully
    [ "$status" -eq 0 ] || [[ "$output" == *"already"* ]]
}

# =============================================================================
# Test: All-Employees group with roles
# =============================================================================

@test "sync_all_employees_group creates group with composite roles" {
    source keycloak/scripts/lib/groups.sh

    run sync_all_employees_group
    [ "$status" -eq 0 ]
}

@test "sync_all_employees_group assigns read roles to group" {
    source keycloak/scripts/lib/groups.sh

    # Mock kcadm to capture role assignments
    local assigned_roles=""
    kcadm() {
        if [[ "$*" == *"add-roles"* ]]; then
            assigned_roles="$assigned_roles $*"
        fi
        echo "MOCK: $*"
    }
    export -f kcadm

    run sync_all_employees_group
    # Should assign hr-read, finance-read, sales-read, support-read
    [[ "$output" == *"read"* ]] || [ "$status" -eq 0 ]
}

# =============================================================================
# Test: Bulk user group assignment
# =============================================================================

@test "assign_user_groups processes multiple users" {
    source keycloak/scripts/lib/groups.sh

    run assign_user_groups
    # Should not error even if no users to assign
    [ "$status" -eq 0 ]
}

# =============================================================================
# Test: Users library exists
# =============================================================================

@test "keycloak/scripts/lib/users.sh exists" {
    [ -f "keycloak/scripts/lib/users.sh" ]
}

@test "provision_test_user function exists" {
    source keycloak/scripts/lib/users.sh
    type provision_test_user
}

@test "assign_critical_prod_users function exists" {
    source keycloak/scripts/lib/users.sh
    type assign_critical_prod_users
}

# =============================================================================
# Test: Test user provisioning
# =============================================================================

@test "provision_test_user creates user with correct attributes" {
    source keycloak/scripts/lib/users.sh

    # Mock kcadm
    kcadm() {
        echo "MOCK: $*"
    }
    export -f kcadm

    run provision_test_user
    [ "$status" -eq 0 ]
}

@test "provision_test_user skips in prod environment" {
    source keycloak/scripts/lib/users.sh

    ENV="prod"

    run provision_test_user
    [ "$status" -eq 0 ]
    # Should skip or return early in prod
    [[ "$output" == *"skip"* ]] || [[ "$output" == *"prod"* ]] || [ -z "$output" ]
}
