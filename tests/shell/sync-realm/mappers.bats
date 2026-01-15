#!/usr/bin/env bats
# RED Phase Tests: Keycloak Protocol Mapper Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/sync-realm/mappers.bats

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

@test "keycloak/scripts/lib/mappers.sh exists" {
    [ -f "keycloak/scripts/lib/mappers.sh" ]
}

# =============================================================================
# Test: Mapper JSON generators exist
# =============================================================================

@test "get_audience_mapper_json function exists" {
    source keycloak/scripts/lib/mappers.sh
    type get_audience_mapper_json
}

@test "get_sub_claim_mapper_json function exists" {
    source keycloak/scripts/lib/mappers.sh
    type get_sub_claim_mapper_json
}

@test "get_client_roles_mapper_json function exists" {
    source keycloak/scripts/lib/mappers.sh
    type get_client_roles_mapper_json
}

# =============================================================================
# Test: Mapper add functions exist
# =============================================================================

@test "add_audience_mapper_to_client function exists" {
    source keycloak/scripts/lib/mappers.sh
    type add_audience_mapper_to_client
}

@test "add_sub_claim_mapper_to_client function exists" {
    source keycloak/scripts/lib/mappers.sh
    type add_sub_claim_mapper_to_client
}

@test "add_client_role_mapper function exists" {
    source keycloak/scripts/lib/mappers.sh
    type add_client_role_mapper
}

# =============================================================================
# Test: Mapper sync functions exist
# =============================================================================

@test "sync_audience_mapper function exists" {
    source keycloak/scripts/lib/mappers.sh
    type sync_audience_mapper
}

@test "sync_sub_claim_mapper function exists" {
    source keycloak/scripts/lib/mappers.sh
    type sync_sub_claim_mapper
}

@test "sync_client_role_mappers function exists" {
    source keycloak/scripts/lib/mappers.sh
    type sync_client_role_mappers
}

# =============================================================================
# Test: Audience mapper JSON structure
# =============================================================================

@test "get_audience_mapper_json returns valid JSON" {
    source keycloak/scripts/lib/mappers.sh
    run get_audience_mapper_json "mcp-gateway"
    [ "$status" -eq 0 ]
    # Validate JSON
    echo "$output" | jq . > /dev/null
    [[ "$output" == *"mcp-gateway"* ]]
}

@test "get_audience_mapper_json uses oidc-audience-mapper protocol" {
    source keycloak/scripts/lib/mappers.sh
    run get_audience_mapper_json "test-audience"
    [[ "$output" == *"oidc-audience-mapper"* ]]
}

@test "get_audience_mapper_json sets included.client.audience" {
    source keycloak/scripts/lib/mappers.sh
    run get_audience_mapper_json "my-audience"
    [[ "$output" == *"included.client.audience"* ]]
    [[ "$output" == *"my-audience"* ]]
}

# =============================================================================
# Test: Client roles mapper JSON structure
# =============================================================================

@test "get_client_roles_mapper_json returns valid JSON" {
    source keycloak/scripts/lib/mappers.sh
    run get_client_roles_mapper_json
    [ "$status" -eq 0 ]
    echo "$output" | jq . > /dev/null
}

@test "get_client_roles_mapper_json includes realm and client roles" {
    source keycloak/scripts/lib/mappers.sh
    run get_client_roles_mapper_json
    # Should map roles from realm_access and/or resource_access
    [[ "$output" == *"realm"* ]] || [[ "$output" == *"resource_access"* ]] || [[ "$output" == *"roles"* ]]
}

# =============================================================================
# Test: Sub claim mapper JSON structure
# =============================================================================

@test "get_sub_claim_mapper_json returns valid JSON" {
    source keycloak/scripts/lib/mappers.sh
    run get_sub_claim_mapper_json
    [ "$status" -eq 0 ]
    echo "$output" | jq . > /dev/null
}

@test "get_sub_claim_mapper_json maps subject claim" {
    source keycloak/scripts/lib/mappers.sh
    run get_sub_claim_mapper_json
    [[ "$output" == *"sub"* ]]
}

# =============================================================================
# Test: Mapper creation behavior
# =============================================================================

@test "add_audience_mapper_to_client handles existing mapper" {
    source keycloak/scripts/lib/mappers.sh

    # Mock: mapper exists
    kcadm() {
        if [[ "$*" == *"get clients"* ]] && [[ "$*" == *"protocol-mappers"* ]]; then
            echo '[{"id":"mapper-id","name":"mcp-gateway-audience"}]'
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run add_audience_mapper_to_client "client-uuid" "mcp-gateway"
    [ "$status" -eq 0 ]
    [[ "$output" == *"exists"* ]] || [[ "$output" == *"already"* ]] || [[ "$output" == *"MOCK"* ]]
}

@test "add_audience_mapper_to_client creates new mapper" {
    source keycloak/scripts/lib/mappers.sh

    # Mock: mapper doesn't exist
    kcadm() {
        if [[ "$*" == *"get clients"* ]] && [[ "$*" == *"protocol-mappers"* ]]; then
            echo '[]'
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run add_audience_mapper_to_client "client-uuid" "mcp-gateway"
    [ "$status" -eq 0 ]
}
