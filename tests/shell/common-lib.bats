#!/usr/bin/env bats
# RED Phase Tests: Common Shell Library Functions
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/common-lib.bats

# =============================================================================
# Setup: Load the library before each test
# =============================================================================

setup() {
    # The library should exist at scripts/lib/common.sh
    if [ -f "scripts/lib/common.sh" ]; then
        source scripts/lib/common.sh
    fi
}

# =============================================================================
# Test: Library file exists
# =============================================================================

@test "scripts/lib/common.sh exists" {
    [ -f "scripts/lib/common.sh" ]
}

# =============================================================================
# Test: Color definitions
# =============================================================================

@test "RED color is defined" {
    source scripts/lib/common.sh
    [ -n "$RED" ]
}

@test "GREEN color is defined" {
    source scripts/lib/common.sh
    [ -n "$GREEN" ]
}

@test "YELLOW color is defined" {
    source scripts/lib/common.sh
    [ -n "$YELLOW" ]
}

@test "BLUE color is defined" {
    source scripts/lib/common.sh
    [ -n "$BLUE" ]
}

@test "NC (no color) is defined" {
    source scripts/lib/common.sh
    [ -n "$NC" ]
}

# =============================================================================
# Test: Logging functions
# =============================================================================

@test "log_info function exists" {
    source scripts/lib/common.sh
    type log_info
}

@test "log_info outputs INFO prefix" {
    source scripts/lib/common.sh
    run log_info "test message"
    [[ "$output" == *"[INFO]"* ]]
    [[ "$output" == *"test message"* ]]
}

@test "log_warn function exists" {
    source scripts/lib/common.sh
    type log_warn
}

@test "log_warn outputs WARN prefix" {
    source scripts/lib/common.sh
    run log_warn "warning message"
    [[ "$output" == *"[WARN]"* ]]
    [[ "$output" == *"warning message"* ]]
}

@test "log_error function exists" {
    source scripts/lib/common.sh
    type log_error
}

@test "log_error outputs ERROR prefix" {
    source scripts/lib/common.sh
    run log_error "error message"
    [[ "$output" == *"[ERROR]"* ]]
    [[ "$output" == *"error message"* ]]
}

@test "log_header function exists" {
    source scripts/lib/common.sh
    type log_header
}

@test "log_header outputs section header with separators" {
    source scripts/lib/common.sh
    run log_header "Section Title"
    [[ "$output" == *"==="* ]]
    [[ "$output" == *"Section Title"* ]]
}

# =============================================================================
# Test: Environment validation
# =============================================================================

@test "validate_environment function exists" {
    source scripts/lib/common.sh
    type validate_environment
}

@test "validate_environment returns 'dev' for valid input" {
    source scripts/lib/common.sh
    run validate_environment "dev"
    [ "$status" -eq 0 ]
    [ "$output" = "dev" ]
}

@test "validate_environment returns 'stage' for valid input" {
    source scripts/lib/common.sh
    run validate_environment "stage"
    [ "$status" -eq 0 ]
    [ "$output" = "stage" ]
}

@test "validate_environment returns 'prod' for valid input" {
    source scripts/lib/common.sh
    run validate_environment "prod"
    [ "$status" -eq 0 ]
    [ "$output" = "prod" ]
}

@test "validate_environment exits with error for invalid input" {
    source scripts/lib/common.sh
    run validate_environment "invalid"
    [ "$status" -ne 0 ]
    [[ "$output" == *"Unknown environment"* ]] || [[ "$output" == *"Invalid"* ]]
}

@test "validate_environment defaults to 'dev' when empty" {
    source scripts/lib/common.sh
    run validate_environment ""
    [ "$status" -eq 0 ]
    [ "$output" = "dev" ]
}

# =============================================================================
# Test: .env.local loading
# =============================================================================

@test "load_env_local function exists" {
    source scripts/lib/common.sh
    type load_env_local
}

@test "load_env_local sources file if exists" {
    source scripts/lib/common.sh

    # Create temp .env.local
    echo "TEST_VAR_BATS=test_value_123" > /tmp/test.env.local

    ENV_LOCAL_PATH="/tmp/test.env.local" load_env_local

    [ "$TEST_VAR_BATS" = "test_value_123" ]
    rm -f /tmp/test.env.local
}

@test "load_env_local succeeds silently if file missing" {
    source scripts/lib/common.sh
    ENV_LOCAL_PATH="/nonexistent/.env.local" run load_env_local
    [ "$status" -eq 0 ]
}

# =============================================================================
# Test: VPS_HOST validation
# =============================================================================

@test "require_vps_host function exists" {
    source scripts/lib/common.sh
    type require_vps_host
}

@test "require_vps_host succeeds when VPS_HOST set" {
    source scripts/lib/common.sh
    VPS_HOST="192.168.1.1" run require_vps_host
    [ "$status" -eq 0 ]
}

@test "require_vps_host fails when VPS_HOST empty" {
    source scripts/lib/common.sh
    unset VPS_HOST
    run require_vps_host
    [ "$status" -ne 0 ]
    [[ "$output" == *"VPS_HOST"* ]]
}

@test "require_vps_host provides helpful error message" {
    source scripts/lib/common.sh
    unset VPS_HOST
    run require_vps_host
    [[ "$output" == *".env.local"* ]] || [[ "$output" == *"terraform"* ]]
}
