#!/usr/bin/env bats
# RED Phase Tests: Keycloak Client Sync Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/sync-realm/clients.bats

# =============================================================================
# Setup: Load the library before each test
# =============================================================================

setup() {
    # Source common utilities
    if [ -f "scripts/lib/common.sh" ]; then
        source scripts/lib/common.sh
    fi

    # The client library should exist at keycloak/scripts/lib/clients.sh
    if [ -f "keycloak/scripts/lib/clients.sh" ]; then
        source keycloak/scripts/lib/clients.sh
    fi

    # Mock kcadm for unit tests (don't actually call Keycloak)
    kcadm() {
        echo "MOCK_KCADM: $*"
        return 0
    }
    export -f kcadm
}

# =============================================================================
# Test: Library file exists
# =============================================================================

@test "keycloak/scripts/lib/clients.sh exists" {
    [ -f "keycloak/scripts/lib/clients.sh" ]
}

# =============================================================================
# Test: Client helper functions exist
# =============================================================================

@test "client_exists function exists" {
    source keycloak/scripts/lib/clients.sh
    type client_exists
}

@test "get_client_uuid function exists" {
    source keycloak/scripts/lib/clients.sh
    type get_client_uuid
}

@test "create_or_update_client function exists" {
    source keycloak/scripts/lib/clients.sh
    type create_or_update_client
}

# =============================================================================
# Test: Client JSON generators
# =============================================================================

@test "get_tamshai_website_client_json returns valid JSON" {
    source keycloak/scripts/lib/clients.sh
    run get_tamshai_website_client_json
    [ "$status" -eq 0 ]
    # Validate JSON structure
    echo "$output" | jq . > /dev/null
    [[ "$output" == *"tamshai-website"* ]]
    [[ "$output" == *"publicClient"* ]]
}

@test "get_mcp_gateway_client_json returns confidential client" {
    source keycloak/scripts/lib/clients.sh
    run get_mcp_gateway_client_json
    [ "$status" -eq 0 ]
    echo "$output" | jq . > /dev/null
    [[ "$output" == *"mcp-gateway"* ]]
    # Should be confidential (publicClient: false)
    [[ "$output" == *'"publicClient": false'* ]] || [[ "$output" == *'"publicClient":false'* ]]
}

@test "get_flutter_client_json returns public client with PKCE" {
    source keycloak/scripts/lib/clients.sh
    run get_flutter_client_json
    [ "$status" -eq 0 ]
    echo "$output" | jq . > /dev/null
    [[ "$output" == *"tamshai-flutter"* ]]
    [[ "$output" == *"pkce"* ]] || [[ "$output" == *"S256"* ]]
}

# =============================================================================
# Test: create_or_update_client behavior
# =============================================================================

@test "create_or_update_client handles new client (creates)" {
    source keycloak/scripts/lib/clients.sh

    # Mock: client doesn't exist (empty array response)
    kcadm() {
        if [[ "$*" == *"get clients"* ]]; then
            echo "[]"
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run create_or_update_client "test-client" '{"clientId":"test-client"}'
    [ "$status" -eq 0 ]
    [[ "$output" == *"Creating"* ]] || [[ "$output" == *"create"* ]] || [[ "$output" == *"MOCK"* ]]
}

@test "create_or_update_client handles existing client (updates)" {
    source keycloak/scripts/lib/clients.sh

    # Mock: client exists
    kcadm() {
        if [[ "$*" == *"get clients"* ]]; then
            echo '[{"id":"existing-uuid","clientId":"test-client"}]'
        else
            echo "MOCK: $*"
        fi
    }
    export -f kcadm

    run create_or_update_client "test-client" '{"clientId":"test-client"}'
    [ "$status" -eq 0 ]
    [[ "$output" == *"Updating"* ]] || [[ "$output" == *"update"* ]] || [[ "$output" == *"MOCK"* ]]
}

# =============================================================================
# Test: Sync functions exist
# =============================================================================

@test "sync_website_client function exists" {
    source keycloak/scripts/lib/clients.sh
    type sync_website_client
}

@test "sync_flutter_client function exists" {
    source keycloak/scripts/lib/clients.sh
    type sync_flutter_client
}

@test "sync_mcp_gateway_client function exists" {
    source keycloak/scripts/lib/clients.sh
    type sync_mcp_gateway_client
}

@test "sync_mcp_hr_service_client function exists" {
    source keycloak/scripts/lib/clients.sh
    type sync_mcp_hr_service_client
}

@test "sync_sample_app_clients function exists" {
    source keycloak/scripts/lib/clients.sh
    type sync_sample_app_clients
}

# =============================================================================
# Test: Environment-specific redirect URIs
# =============================================================================

@test "get_tamshai_website_client_json includes dev redirect URIs" {
    source keycloak/scripts/lib/clients.sh
    ENV="dev"
    run get_tamshai_website_client_json
    [[ "$output" == *"localhost"* ]] || [[ "$output" == *"tamshai-playground.local"* ]]
}

@test "get_tamshai_website_client_json includes stage redirect URIs for stage env" {
    source keycloak/scripts/lib/clients.sh
    ENV="stage"
    VPS_DOMAIN="vps.tamshai.com"
    run get_tamshai_website_client_json
    [[ "$output" == *"vps.tamshai.com"* ]] || [[ "$output" == *"tamshai.com"* ]]
}
