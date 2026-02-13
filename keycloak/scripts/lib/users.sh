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

# Provision test-user.journey for E2E testing
# Skips in production (user imported from realm-export.json with TOTP)
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

    if [ -n "$user_id" ]; then
        log_info "  User already exists (ID: $user_id), deleting to recreate with TOTP..."
        _kcadm delete users/$user_id -r "$REALM" 2>/dev/null
        if [ $? -eq 0 ]; then
            log_info "  User deleted successfully"
            user_id=""  # Reset so we create fresh
        else
            log_warn "  Failed to delete existing user"
        fi
    fi

    if [ -z "$user_id" ]; then
        log_info "  Creating test-user.journey user..."

        # Create user
        _kcadm create users -r "$REALM" \
            -s username=test-user.journey \
            -s email=test-user@tamshai.com \
            -s firstName=Test \
            -s lastName=User \
            -s enabled=true \
            -s emailVerified=true \
            -s 'attributes.department=["Testing"]' \
            -s 'attributes.employeeId=["TEST001"]' \
            -s 'attributes.title=["Journey Test Account"]'

        if [ $? -eq 0 ]; then
            log_info "  User created successfully"

            # Get the newly created user ID
            user_id=$(_kcadm get users -r "$REALM" -q username=test-user.journey --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

            if [ -n "$user_id" ]; then
                # Set password from TEST_USER_PASSWORD GitHub secret (non-temporary)
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
                    log_warn "  TEST_USER_PASSWORD not set - test-user.journey will have no password"
                    log_warn "  Set TEST_USER_PASSWORD environment variable to enable E2E tests"
                fi

                # Note: TOTP credentials cannot be pre-configured via Admin API
                log_info "  TOTP configuration skipped (not supported via Admin API)"
                log_info "  Note: TOTP must be configured manually or via realm import"

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
            else
                log_warn "  Could not retrieve user ID after creation"
            fi
        else
            log_error "  Failed to create user"
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

# Get corporate user password from DEV_USER_PASSWORD GitHub secret
# This is the password for all corporate users (alice.chen, bob.martinez, etc.)
get_dev_user_password() {
    echo "${DEV_USER_PASSWORD:-}"
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

# Set passwords for corporate users from DEV_USER_PASSWORD GitHub secret
# This is called to update passwords for users imported from realm-export-dev.json
# Corporate users: alice.chen, bob.martinez, carol.johnson, dan.williams, eve.thompson, frank.davis, nina.patel, marcus.johnson
set_corporate_user_passwords() {
    local dev_password
    dev_password=$(get_dev_user_password)

    if [ -z "$dev_password" ]; then
        log_warn "DEV_USER_PASSWORD not set - cannot set corporate user passwords"
        log_warn "Integration tests requiring corporate user authentication will fail"
        return 0
    fi

    log_info "Setting corporate user passwords from DEV_USER_PASSWORD..."

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
        local password_json="{\"type\":\"password\",\"value\":\"$dev_password\",\"temporary\":false}"
        if echo "$password_json" | _kcadm update "users/$user_id/reset-password" -r "$REALM" -f - 2>/dev/null; then
            log_info "  $username password updated successfully"
        else
            log_warn "  Failed to update $username password"
        fi
    done
}
