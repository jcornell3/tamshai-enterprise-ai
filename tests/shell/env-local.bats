#!/usr/bin/env bats
# RED Phase Tests: .env.local Pattern Implementation
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/env-local.bats

# =============================================================================
# Test: .env.local file is properly gitignored
# =============================================================================

@test ".env.local is in .gitignore" {
    grep -q "\.env\.local" .gitignore
}

@test ".env.local.example exists as template" {
    [ -f ".env.local.example" ]
}

@test ".env.local.example contains VPS_HOST placeholder" {
    grep -q "^VPS_HOST=" .env.local.example
}

@test ".env.local.example does not contain actual IP address" {
    ! grep -qE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" .env.local.example
}

# =============================================================================
# Test: No hardcoded IPs in shell scripts
# Uses IP pattern matching - does NOT include actual IP addresses in tests
# =============================================================================

# Pattern matches IPv4 addresses used as default values: ${VAR:-1.2.3.4}
IP_DEFAULT_PATTERN='\$\{[A-Z_]+:-[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\}'

@test "scripts/infra/deploy.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/infra/deploy.sh
}

@test "scripts/infra/status.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/infra/status.sh
}

@test "scripts/infra/keycloak.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/infra/keycloak.sh
}

@test "scripts/mcp/health-check.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/mcp/health-check.sh
}

@test "scripts/mcp/restart.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/mcp/restart.sh
}

@test "scripts/db/backup.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/db/backup.sh
}

@test "scripts/db/restore.sh has no hardcoded IP default" {
    ! grep -qE "$IP_DEFAULT_PATTERN" scripts/db/restore.sh
}

# =============================================================================
# Test: Scripts source .env.local
# =============================================================================

@test "deploy.sh sources .env.local if present" {
    grep -q "source.*\.env\.local" scripts/infra/deploy.sh || \
    grep -q "\. .*\.env\.local" scripts/infra/deploy.sh
}

@test "status.sh sources .env.local if present" {
    grep -q "source.*\.env\.local" scripts/infra/status.sh || \
    grep -q "\. .*\.env\.local" scripts/infra/status.sh
}

@test "keycloak.sh sources .env.local if present" {
    grep -q "source.*\.env\.local" scripts/infra/keycloak.sh || \
    grep -q "\. .*\.env\.local" scripts/infra/keycloak.sh
}

# =============================================================================
# Test: Scripts check for VPS_HOST before SSH operations
# (Pattern-based validation - does NOT execute scripts that may SSH)
# =============================================================================

@test "deploy.sh checks for VPS_HOST variable" {
    # Script should have logic to check VPS_HOST is set before SSH
    grep -qE '(VPS_HOST|require_vps_host)' scripts/infra/deploy.sh
}

@test "status.sh checks for VPS_HOST variable" {
    # Script should have logic to check VPS_HOST is set before SSH
    grep -qE '(VPS_HOST|require_vps_host)' scripts/infra/status.sh
}

@test "deploy.sh does not have hardcoded SSH commands with IP" {
    # Should not have: ssh root@1.2.3.4 or similar
    ! grep -qE 'ssh.*[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' scripts/infra/deploy.sh
}
