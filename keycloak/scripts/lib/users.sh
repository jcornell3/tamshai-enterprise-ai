#!/bin/bash
# =============================================================================
# Keycloak User Provisioning Functions
# =============================================================================
# Provides test user provisioning functions for Keycloak realm synchronization.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   ENV - Environment name (dev, stage, prod)
#   KCADM - Path to kcadm.sh
#
# Dependencies:
#   - lib/common.sh (logging functions, _kcadm helper)
#   - lib/groups.sh (get_group_id)
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Test User Provisioning
# =============================================================================

# Get test-user email based on environment
# Dev uses .local (matches HR sample data), Stage uses .com (matches stage HR data)
get_test_user_email() {
    case "${ENV:-dev}" in
        dev|ci)
            echo "test-user@tamshai.local"
            ;;
        *)
            echo "test-user@tamshai.com"
            ;;
    esac
}

# Provision test-user.journey for E2E testing
# Skips in production (user imported from realm-export.json with TOTP)
# PHOENIX: Never delete existing user - update instead to preserve any existing config
provision_test_user() {
    # In production, test-user.journey is imported from realm-export.json during Keycloak startup
    # This import includes TOTP credentials which cannot be set via Admin API
    # Skip provisioning to avoid deleting and losing the TOTP configuration
    if [ "$ENV" = "prod" ]; then
        log_info "Skipping test-user.journey provisioning in prod (user imported from realm-export.json with TOTP)"
        return 0
    fi

    log_info "Provisioning test-user.journey..."

    # Check if user already exists
    local user_id=$(_kcadm get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    # Get environment-appropriate email
    local test_email
    test_email=$(get_test_user_email)
    log_info "  Using email: $test_email (ENV=$ENV)"

    if [ -n "$user_id" ]; then
        # PHOENIX: User exists - update instead of delete/recreate
        # This preserves TOTP credentials and avoids the delete-then-fail-to-create race condition
        log_info "  User already exists (ID: $user_id), updating properties..."
        _kcadm update "users/$user_id" -r "$REALM" \
            -s "email=$test_email" \
            -s firstName=Test \
            -s lastName=User \
            -s enabled=true \
            -s emailVerified=true \
            -s 'attributes.department=["Testing"]' \
            -s 'attributes.employeeId=["TEST001"]' \
            -s 'attributes.title=["Journey Test Account"]' 2>/dev/null || true
        log_info "  User properties updated"
    else
        log_info "  Creating test-user.journey user..."

        # Create user with deterministic ID (Phoenix principle)
        _kcadm create users -r "$REALM" \
            -s id=e2e00001-0000-0000-0000-000000000001 \
            -s username=test-user.journey \
            -s "email=$test_email" \
            -s firstName=Test \
            -s lastName=User \
            -s enabled=true \
            -s emailVerified=true \
            -s 'attributes.department=["Testing"]' \
            -s 'attributes.employeeId=["TEST001"]' \
            -s 'attributes.title=["Journey Test Account"]'

        if [ $? -eq 0 ]; then
            log_info "  User created successfully"
            user_id="e2e00001-0000-0000-0000-000000000001"
        else
            log_error "  Failed to create user"
            # Try without explicit ID (Keycloak may not support setting ID)
            log_info "  Retrying without explicit ID..."
            _kcadm create users -r "$REALM" \
                -s username=test-user.journey \
                -s "email=$test_email" \
                -s firstName=Test \
                -s lastName=User \
                -s enabled=true \
                -s emailVerified=true \
                -s 'attributes.department=["Testing"]' \
                -s 'attributes.employeeId=["TEST001"]' \
                -s 'attributes.title=["Journey Test Account"]'

            if [ $? -eq 0 ]; then
                log_info "  User created successfully (without explicit ID)"
                user_id=$(_kcadm get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
            else
                log_error "  Failed to create user on retry"
                return 1
            fi
        fi
    fi

    # Set password if we have a user ID
    if [ -n "$user_id" ]; then
        local test_password
        test_password=$(get_test_user_password)

        if [ -n "$test_password" ]; then
            log_info "  Setting password from TEST_USER_PASSWORD..."
            local password_json="{\"type\":\"password\",\"value\":\"$test_password\",\"temporary\":false}"
            echo "$password_json" | _kcadm update "users/$user_id/reset-password" -r "$REALM" -f -

            if [ $? -eq 0 ]; then
                log_info "  Password set successfully"
            else
                log_warn "  Failed to set password"
            fi
        else
            log_warn "  TEST_USER_PASSWORD not set - password not updated"
        fi

        # Assign test-user.journey to All-Employees group for self-access
        local all_emp_id
        if type get_group_id &>/dev/null; then
            all_emp_id=$(get_group_id "All-Employees")
        else
            all_emp_id=$(_kcadm get groups -r "$REALM" -q "name=All-Employees" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
        fi

        if [ -n "$all_emp_id" ]; then
            if _kcadm update "users/$user_id/groups/$all_emp_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
                log_info "  Added test-user.journey to All-Employees group"
            else
                log_info "  test-user.journey: All-Employees (already member or error)"
            fi
        fi
    fi
}

# =============================================================================
# Critical Production Users
# =============================================================================

# Assign critical production users to groups
# This is a re-export from groups.sh for convenience
# The actual implementation is in groups.sh
assign_critical_prod_users() {
    # Only run in production
    if [ "$ENV" != "prod" ]; then
        return 0
    fi

    log_info "Assigning critical production users to groups..."

    # Critical users who need group membership for system access
    local -a critical_users=(
        "eve.thompson:C-Suite"
        "test-user.journey:All-Employees"
    )

    for mapping in "${critical_users[@]}"; do
        local username="${mapping%%:*}"
        local group="${mapping##*:}"

        local user_id=$(_kcadm get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$user_id" ]; then
            log_warn "  Critical user $username not found in Keycloak"
            continue
        fi

        local group_id
        if type get_group_id &>/dev/null; then
            group_id=$(get_group_id "$group")
        else
            group_id=$(_kcadm get groups -r "$REALM" -q "name=$group" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
        fi

        if [ -z "$group_id" ]; then
            log_warn "  Group $group not found"
            continue
        fi

        if _kcadm update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
            log_info "  $username: added to $group"
        else
            log_info "  $username: already in $group or error"
        fi
    done

    log_info "Critical production user assignment complete"
}

# =============================================================================
# User Password Management
# =============================================================================

# Get test-user.journey password from TEST_USER_PASSWORD GitHub secret
# This is the dedicated E2E test account password, separate from corporate user passwords
get_test_user_password() {
    echo "${TEST_USER_PASSWORD:-}"
}

# Get corporate user password based on environment
# Returns the appropriate password variable for the current environment:
#   dev:   DEV_USER_PASSWORD
#   stage: STAGE_USER_PASSWORD
#   prod:  PROD_USER_PASSWORD
# This is the password for all corporate users (alice.chen, bob.martinez, etc.)
get_corporate_user_password() {
    case "${ENV:-dev}" in
        prod|production)
            echo "${PROD_USER_PASSWORD:-}"
            ;;
        stage|staging)
            echo "${STAGE_USER_PASSWORD:-}"
            ;;
        *)
            echo "${DEV_USER_PASSWORD:-}"
            ;;
    esac
}

# Backwards compatibility alias
get_dev_user_password() {
    get_corporate_user_password
}

# Set test-user.journey password from TEST_USER_PASSWORD GitHub secret
# This is called separately to update password for users imported from realm export
set_test_user_password() {
    local test_password
    test_password=$(get_test_user_password)

    if [ -z "$test_password" ]; then
        log_warn "TEST_USER_PASSWORD not set - cannot set test-user.journey password"
        log_warn "E2E tests requiring authentication will fail"
        return 0
    fi

    log_info "Setting test-user.journey password from TEST_USER_PASSWORD..."

    # Get user ID
    local user_id=$(_kcadm get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -z "$user_id" ]; then
        log_warn "test-user.journey not found in Keycloak - skipping password update"
        return 0
    fi

    # Set password
    local password_json="{\"type\":\"password\",\"value\":\"$test_password\",\"temporary\":false}"
    if echo "$password_json" | _kcadm update "users/$user_id/reset-password" -r "$REALM" -f - 2>/dev/null; then
        log_info "  test-user.journey password updated successfully"
    else
        log_warn "  Failed to update test-user.journey password"
    fi
}

# Set passwords for corporate users from environment-specific password variable
# This is called to update passwords for users imported from realm export
# Uses: DEV_USER_PASSWORD (dev), STAGE_USER_PASSWORD (stage), PROD_USER_PASSWORD (prod)
# Corporate users: alice.chen, bob.martinez, carol.johnson, dan.williams, eve.thompson, frank.davis, nina.patel, marcus.johnson
set_corporate_user_passwords() {
    local corp_password
    corp_password=$(get_corporate_user_password)

    # Determine which variable name to show in logs
    local password_var_name
    case "${ENV:-dev}" in
        prod|production) password_var_name="PROD_USER_PASSWORD" ;;
        stage|staging)   password_var_name="STAGE_USER_PASSWORD" ;;
        *)               password_var_name="DEV_USER_PASSWORD" ;;
    esac

    if [ -z "$corp_password" ]; then
        log_warn "$password_var_name not set - cannot set corporate user passwords"
        log_warn "Integration tests requiring corporate user authentication will fail"
        return 0
    fi

    log_info "Setting corporate user passwords from $password_var_name..."

    # List of corporate users to set passwords for
    local users=("alice.chen" "bob.martinez" "carol.johnson" "dan.williams" "eve.thompson" "frank.davis" "nina.patel" "marcus.johnson")

    for username in "${users[@]}"; do
        # Get user ID
        local user_id=$(_kcadm get users -r "$REALM" -q username="$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$user_id" ]; then
            log_warn "  $username not found in Keycloak - skipping password update"
            continue
        fi

        # Set password (non-temporary to avoid requiredActions)
        local password_json="{\"type\":\"password\",\"value\":\"$corp_password\",\"temporary\":false}"
        if echo "$password_json" | _kcadm update "users/$user_id/reset-password" -r "$REALM" -f - 2>/dev/null; then
            log_info "  $username password updated successfully"
        else
            log_warn "  Failed to update $username password"
        fi
    done
}
