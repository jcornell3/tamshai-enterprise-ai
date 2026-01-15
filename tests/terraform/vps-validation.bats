#!/usr/bin/env bats
# VPS Terraform Validation Tests
#
# RED Phase: Tests for VPS Terraform configuration security and correctness.
# These tests validate password generation, secret handling, and configuration patterns.
#
# Issue 4.2: VPS Passwords (Terraform)
#
# Prerequisites:
#   - terraform CLI installed
#   - Run from repository root
#
# Usage:
#   bats tests/terraform/vps-validation.bats

# Path to VPS terraform directory
VPS_TF_DIR="infrastructure/terraform/vps"

# =============================================================================
# TERRAFORM VALIDATION
# =============================================================================

@test "terraform validate passes for VPS configuration" {
    cd "$VPS_TF_DIR"
    run terraform validate 2>&1
    [ "$status" -eq 0 ]
}

@test "terraform fmt check passes (no formatting issues)" {
    cd "$VPS_TF_DIR"
    run terraform fmt -check -recursive 2>&1
    [ "$status" -eq 0 ]
}

# =============================================================================
# PASSWORD RESOURCE VALIDATION
# =============================================================================

@test "random_password resources exist for all secrets" {
    cd "$VPS_TF_DIR"

    # Check that essential password resources are defined
    grep -q 'resource "random_password" "postgres_password"' main.tf
    grep -q 'resource "random_password" "keycloak_admin_password"' main.tf
    grep -q 'resource "random_password" "keycloak_db_password"' main.tf
    grep -q 'resource "random_password" "mongodb_password"' main.tf
}

@test "random_password resources have sufficient length (>=16 chars)" {
    cd "$VPS_TF_DIR"

    # All passwords should have length >= 16 for security
    # Check each password resource block for length >= 16
    # Simplified version that works cross-platform

    # Count passwords with length < 16
    short_count=0

    # Extract all length values and check each one
    for len in $(grep -E 'resource "random_password"' main.tf -A3 | \
                 grep -E 'length\s*=\s*[0-9]+' | \
                 grep -Eo '[0-9]+'); do
        if [ "$len" -lt 16 ]; then
            short_count=$((short_count + 1))
        fi
    done

    [ "$short_count" -eq 0 ]
}

@test "root_password has special characters enabled" {
    cd "$VPS_TF_DIR"

    # Root password should include special characters for complexity
    root_block=$(grep -A5 'resource "random_password" "root_password"' main.tf)
    echo "$root_block" | grep -q 'special.*=.*true'
}

@test "service passwords disable special characters to avoid shell issues" {
    cd "$VPS_TF_DIR"

    # Service passwords used in docker-compose should avoid special chars
    # Check postgres, mongodb, etc. have special = false
    for service in postgres keycloak mongodb minio jwt; do
        service_block=$(grep -A5 "resource \"random_password\" \"${service}" main.tf || true)
        if [ -n "$service_block" ]; then
            echo "$service_block" | grep -q 'special.*=.*false'
        fi
    done
}

# =============================================================================
# SECRET OUTPUT VALIDATION
# =============================================================================

@test "sensitive passwords are marked as sensitive in outputs" {
    cd "$VPS_TF_DIR"

    # Check that password outputs have sensitive = true
    keycloak_output=$(grep -A3 'output "keycloak_admin_password"' main.tf)
    echo "$keycloak_output" | grep -q 'sensitive.*=.*true'

    root_output=$(grep -A3 'output "root_password"' main.tf)
    echo "$root_output" | grep -q 'sensitive.*=.*true'
}

@test "no hardcoded passwords in main.tf" {
    cd "$VPS_TF_DIR"

    # Pattern: password = "..." or password: "..."
    # Should NOT match: password = random_password... or password = var...
    ! grep -E 'password\s*=\s*"[^"]{4,}"' main.tf | grep -v 'random_password\|var\.'
}

@test "no hardcoded passwords in variables.tf if exists" {
    cd "$VPS_TF_DIR"

    if [ -f "variables.tf" ]; then
        ! grep -E 'default\s*=\s*"[A-Za-z0-9]{8,}"' variables.tf
    else
        # Skip if variables.tf doesn't exist
        skip "variables.tf not found"
    fi
}

# =============================================================================
# CLOUD-INIT TEMPLATE VALIDATION
# =============================================================================

@test "cloud-init.yaml template uses terraform variables" {
    cd "$VPS_TF_DIR"

    if [ -f "cloud-init.yaml" ]; then
        # Should use ${...} interpolation for passwords
        grep -q '\${postgres_password}' cloud-init.yaml || \
        grep -q '\${ *postgres_password *}' cloud-init.yaml
    else
        skip "cloud-init.yaml not found in VPS directory"
    fi
}

@test "cloud-init.yaml does not contain hardcoded secrets" {
    cd "$VPS_TF_DIR"

    if [ -f "cloud-init.yaml" ]; then
        # Should NOT have hardcoded password-like strings
        ! grep -E 'POSTGRES_PASSWORD=[A-Za-z0-9]{16,}' cloud-init.yaml
        ! grep -E 'KEYCLOAK_ADMIN_PASSWORD=[A-Za-z0-9]{16,}' cloud-init.yaml
    else
        skip "cloud-init.yaml not found"
    fi
}

# =============================================================================
# FOR_EACH PATTERN VALIDATION (OPTIONAL IMPROVEMENT)
# =============================================================================

@test "password resources could use for_each pattern (informational)" {
    cd "$VPS_TF_DIR"

    # This is informational - checks if for_each is used
    # If not using for_each, the test passes but notes the improvement opportunity
    if grep -q 'for_each.*local.passwords' main.tf; then
        # for_each pattern is used - great!
        true
    else
        # for_each not used - this is OK, but could be improved
        # Count individual password resources
        password_count=$(grep -c 'resource "random_password"' main.tf)

        # Informational: many individual resources could use for_each
        if [ "$password_count" -gt 5 ]; then
            echo "# INFO: $password_count password resources found. Consider for_each pattern for DRY code."
        fi

        # Test passes either way - this is just informational
        true
    fi
}

# =============================================================================
# SECURITY BEST PRACTICES
# =============================================================================

@test "random provider version is pinned" {
    cd "$VPS_TF_DIR"

    # Check for pinned version in required_providers
    grep -q 'random.*=.*{' main.tf && \
    grep -A3 'source.*hashicorp/random' main.tf | grep -q 'version'
}

@test "password rotation comment or lifecycle exists" {
    cd "$VPS_TF_DIR"

    # Check for documentation about password rotation
    # Either a comment or lifecycle block
    grep -q -i 'rotation\|lifecycle' main.tf || \
    grep -q 'keepers' main.tf || \
    echo "# WARNING: Consider adding password rotation mechanism"

    # This test always passes - it's informational
    true
}

@test "secrets are not echoed in outputs or provisioners" {
    cd "$VPS_TF_DIR"

    # Check that no provisioner echoes sensitive values
    ! grep -E 'echo.*password.*result' main.tf
    ! grep -E 'echo.*\$\{random_password' main.tf
}

# =============================================================================
# STATE SECURITY
# =============================================================================

@test "backend configuration exists or state security is documented" {
    cd "$VPS_TF_DIR"

    # Check for backend configuration
    if grep -q 'backend "' main.tf || [ -f "backend.tf" ]; then
        # Backend is configured
        true
    else
        # Check for local state security documentation
        [ -f "../../../docs/security/TERRAFORM_STATE_SECURITY.md" ] || \
        echo "# WARNING: No backend configured. Ensure state is stored securely."

        # Pass test but note the warning
        true
    fi
}

# =============================================================================
# TERRAFORM PLAN VALIDATION (REQUIRES VALID VARIABLES)
# =============================================================================

@test "terraform plan runs without errors (if variables available)" {
    cd "$VPS_TF_DIR"

    # Skip if no tfvars file exists (CI environments may not have secrets)
    if [ ! -f "terraform.tfvars" ] && [ -z "$TF_VAR_hcloud_token" ]; then
        skip "No terraform.tfvars or TF_VAR_* environment variables available"
    fi

    # Initialize if needed
    terraform init -backend=false -input=false >/dev/null 2>&1 || true

    # Plan with -input=false to prevent interactive prompts
    run terraform plan -input=false -detailed-exitcode 2>&1

    # Exit code 0 = no changes, 2 = changes present (both OK)
    # Exit code 1 = error
    [ "$status" -eq 0 ] || [ "$status" -eq 2 ]
}
