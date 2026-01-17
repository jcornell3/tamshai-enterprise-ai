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
                # Set password (non-temporary)
                log_info "  Setting password..."
                local password_json='{"type":"password","value":"Test123!Journey","temporary":false}'
                echo "$password_json" | _kcadm update "users/$user_id/reset-password" -r "$REALM" -f -

                if [ $? -eq 0 ]; then
                    log_info "  Password set successfully"
                else
                    log_warn "  Failed to set password"
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
