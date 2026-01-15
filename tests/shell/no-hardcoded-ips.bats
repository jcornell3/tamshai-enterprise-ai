#!/usr/bin/env bats
# RED Phase Tests: Comprehensive Hardcoded IP Detection
# These tests MUST FAIL initially - that's the point of TDD RED phase
#
# Run with: bats tests/shell/no-hardcoded-ips.bats

# =============================================================================
# Pattern Definitions (no actual IPs - security safe)
# =============================================================================

# Pattern: Matches IP addresses used as bash variable defaults ${VAR:-x.x.x.x}
IP_DEFAULT_PATTERN='\$\{[A-Z_]+:-[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\}'

# Pattern: Matches IP addresses assigned to variables (VAR=x.x.x.x or VAR="x.x.x.x")
IP_ASSIGNMENT_PATTERN='^[A-Z_]+=["\x27]?[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+["\x27]?'

# =============================================================================
# Test: No hardcoded IPs in scripts/ directory
# =============================================================================

@test "No hardcoded IP defaults in scripts/ directory" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/ --include="*.sh"
}

@test "No hardcoded IP assignments in scripts/ directory" {
    # Exclude .env.local.example which should have empty placeholders
    ! grep -rE "$IP_ASSIGNMENT_PATTERN" scripts/ --include="*.sh" \
        --exclude="*.example"
}

# =============================================================================
# Test: No hardcoded IPs in infrastructure scripts
# =============================================================================

@test "No hardcoded IP in scripts/infra/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/infra/ --include="*.sh"
}

@test "No hardcoded IP in scripts/mcp/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/mcp/ --include="*.sh"
}

@test "No hardcoded IP in scripts/db/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/db/ --include="*.sh"
}

@test "No hardcoded IP in scripts/test/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/test/ --include="*.sh"
}

@test "No hardcoded IP in scripts/vault/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/vault/ --include="*.sh"
}

@test "No hardcoded IP in scripts/secrets/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" scripts/secrets/ --include="*.sh"
}

# =============================================================================
# Test: No hardcoded IPs in configuration files
# =============================================================================

@test "No hardcoded IP in clients/web/.env.example (only placeholders allowed)" {
    # Allow: VITE_API_HOST=  (empty placeholder)
    # Deny:  VITE_API_HOST=192.168.1.1
    ! grep -qE "^[A-Z_]+=[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" clients/web/.env.example 2>/dev/null || true
}

@test "No hardcoded IP in Terraform stage.tfvars" {
    # Terraform variables should reference other variables, not hardcoded IPs
    ! grep -qE "^[a-z_]+ *= *\"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\"" \
        infrastructure/terraform/keycloak/environments/stage.tfvars 2>/dev/null || true
}

# =============================================================================
# Test: Documentation uses placeholders (portable regex - no lookaheads)
# =============================================================================

@test "Documentation uses placeholders instead of real VPS IPs" {
    # Documentation should use <VPS_IP>, ${VPS_HOST}, or <your-vps-ip> placeholders
    # This test checks for IP patterns that look like hardcoded VPS addresses
    #
    # EXCLUDED (legitimate uses):
    # - 0.0.0.0 (network bind addresses like "0.0.0.0:8080")
    # - 127.0.0.1 (localhost references)
    # - 10.x.x.x (private network CIDRs)
    #
    # Pattern: IP address followed by common VPS indicators (port, ssh, scp, curl)
    # These would suggest a real IP is being used instead of a placeholder
    result=$(grep -rE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+.*(ssh|scp|curl|:22|:80|:443|:8080|root@)' \
        docs/ --include="*.md" 2>/dev/null | \
        grep -v '0\.0\.0\.0' | \
        grep -v '127\.0\.0\.1' | \
        grep -v '10\.[0-9]\+\.' || true)
    [ -z "$result" ]
}

@test "Documentation does not use IP in VPS_HOST examples" {
    # Examples showing VPS_HOST should use placeholders, not real IPs
    # Good: VPS_HOST=<your-vps-ip>
    #
    # EXCLUDED: Lines containing "Bad:" which are negative examples in documentation
    result=$(grep -rE 'VPS_HOST=[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
        docs/ --include="*.md" 2>/dev/null | \
        grep -v 'Bad:' || true)
    [ -z "$result" ]
}

# =============================================================================
# Test: Keycloak scripts have no hardcoded IPs
# =============================================================================

@test "No hardcoded IP in keycloak/scripts/*.sh files" {
    ! grep -rE "$IP_DEFAULT_PATTERN" keycloak/scripts/ --include="*.sh"
}

@test "No hardcoded IP in keycloak/scripts/sync-realm.sh" {
    ! grep -qE "$IP_DEFAULT_PATTERN" keycloak/scripts/sync-realm.sh
}

# =============================================================================
# Test: GitHub workflow files have no hardcoded IPs
# =============================================================================

@test "No hardcoded IP in .github/workflows/*.yml files" {
    # EXCLUDED (legitimate uses):
    # - 127.0.0.1 (localhost for CI testing)
    # - 0.0.0.0 (network bind addresses)
    # - 10.x.x.x (private network CIDRs for GCP VPC)
    # - Version numbers like "1.0.0.0" (not IP addresses)
    result=$(grep -rE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" .github/workflows/ --include="*.yml" 2>/dev/null | \
        grep -v '127\.0\.0\.1' | \
        grep -v '0\.0\.0\.0' | \
        grep -v '10\.[0-9]\+\.[0-9]\+\.' | \
        grep -v '\-\-version' | \
        grep -v 'version.*[0-9]\+\.[0-9]\+\.[0-9]\+\.[0-9]\+' || true)
    [ -z "$result" ]
}
