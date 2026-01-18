#!/bin/bash
# =============================================================================
# Keycloak Group Management Functions
# =============================================================================
# Provides group and user assignment functions for Keycloak realm synchronization.
#
# Required Variables (set by caller):
#   REALM - Keycloak realm name
#   ENV - Environment name (dev, stage, prod)
#   KCADM - Path to kcadm.sh
#
# Dependencies:
#   - lib/common.sh (logging functions)
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# Group Helper Functions
# =============================================================================

# Get the ID of a group by name
# Arguments:
#   $1 - Group name
# Returns: Group ID (empty if not found)
get_group_id() {
    local group_name="$1"
    # Handle both spaced ("id" : "xxx") and compact ("id":"xxx") JSON formats
    _kcadm get groups -r "$REALM" -q "name=$group_name" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# Ensure a group exists, create if missing
# Arguments:
#   $1 - Group name
# Returns: Group ID
ensure_group_exists() {
    local group_name="$1"

    local group_id=$(get_group_id "$group_name")

    if [ -z "$group_id" ]; then
        log_info "  Creating group '$group_name'..."
        _kcadm create groups -r "$REALM" -s name="$group_name" 2>/dev/null
        group_id=$(get_group_id "$group_name")
    else
        log_info "  Group '$group_name' already exists"
    fi

    echo "$group_id"
}

# =============================================================================
# User Assignment Functions
# =============================================================================

# Assign a single user to a group
# Arguments:
#   $1 - Username
#   $2 - Group name
assign_user_to_group() {
    local username="$1"
    local group_name="$2"

    # Find user by username - handle both JSON formats
    local user_id=$(_kcadm get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

    if [ -z "$user_id" ]; then
        log_warn "  User $username not found, skipping"
        return 0
    fi

    # Find group by name
    local group_id=$(get_group_id "$group_name")

    if [ -z "$group_id" ]; then
        log_warn "  Group $group_name not found, skipping for $username"
        return 0
    fi

    # Add user to group (idempotent)
    if _kcadm update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
        log_info "  $username: added to $group_name"
    else
        log_info "  $username: $group_name (already member or error)"
    fi
}

# =============================================================================
# C-Suite Group Sync
# =============================================================================

# Sync the C-Suite group with executive and manager roles
# This group grants full access to all departments
sync_c_suite_group() {
    log_info "Syncing C-Suite group..."

    # Ensure the 'executive' realm role exists
    local exec_role_exists=$(_kcadm get roles -r "$REALM" 2>/dev/null | grep -oE '"name"[[:space:]]*:[[:space:]]*"executive"')
    if [ -z "$exec_role_exists" ]; then
        log_info "  Creating 'executive' realm role..."
        _kcadm create roles -r "$REALM" \
            -s name=executive \
            -s 'description=Executive role - full access to all departments' 2>/dev/null || {
            log_info "    Role may already exist"
        }
    else
        log_info "  'executive' role already exists"
    fi

    # Ensure the 'manager' realm role exists
    local mgr_role_exists=$(_kcadm get roles -r "$REALM" 2>/dev/null | grep -oE '"name"[[:space:]]*:[[:space:]]*"manager"')
    if [ -z "$mgr_role_exists" ]; then
        log_info "  Creating 'manager' realm role..."
        _kcadm create roles -r "$REALM" \
            -s name=manager \
            -s 'description=Manager role - team management access' 2>/dev/null || {
            log_info "    Role may already exist"
        }
    else
        log_info "  'manager' role already exists"
    fi

    # Check if C-Suite group exists
    local group_id=$(get_group_id "C-Suite")

    if [ -z "$group_id" ]; then
        log_info "  Creating C-Suite group..."
        _kcadm create groups -r "$REALM" -s name=C-Suite 2>/dev/null
        group_id=$(get_group_id "C-Suite")
    else
        log_info "  C-Suite group already exists"
    fi

    # Assign executive role to the group
    if [ -n "$group_id" ]; then
        log_info "  Assigning 'executive' realm role to C-Suite group..."
        _kcadm add-roles -r "$REALM" \
            --gid "$group_id" \
            --rolename executive 2>/dev/null || {
            log_info "    Role may already be assigned"
        }

        log_info "  Assigning 'manager' realm role to C-Suite group..."
        _kcadm add-roles -r "$REALM" \
            --gid "$group_id" \
            --rolename manager 2>/dev/null || {
            log_info "    Role may already be assigned"
        }
    fi

    log_info "  C-Suite group sync complete"
}

# =============================================================================
# All-Employees Group Sync
# =============================================================================

# Sync the All-Employees group with the employee role
# This group grants access to all MCP servers, with data filtering via RLS
sync_all_employees_group() {
    log_info "Syncing All-Employees group..."

    # First, ensure the 'employee' realm role exists
    local role_exists=$(_kcadm get roles -r "$REALM" 2>/dev/null | grep -oE '"name"[[:space:]]*:[[:space:]]*"employee"')
    if [ -z "$role_exists" ]; then
        log_info "  Creating 'employee' realm role..."
        _kcadm create roles -r "$REALM" \
            -s name=employee \
            -s 'description=Base employee role - allows self-access to all MCP servers via RLS' 2>/dev/null || {
            log_info "    Role may already exist"
        }
    else
        log_info "  'employee' role already exists"
    fi

    # Check if All-Employees group exists
    local group_id=$(get_group_id "All-Employees")

    if [ -z "$group_id" ]; then
        log_info "  Creating All-Employees group..."
        _kcadm create groups -r "$REALM" -s name=All-Employees 2>/dev/null
        group_id=$(get_group_id "All-Employees")
    else
        log_info "  All-Employees group already exists"
    fi

    # Assign employee role to the group
    if [ -n "$group_id" ]; then
        log_info "  Assigning 'employee' realm role to All-Employees group..."
        _kcadm add-roles -r "$REALM" \
            --gid "$group_id" \
            --rolename employee 2>/dev/null || {
            log_info "    Role may already be assigned"
        }
    fi

    log_info "  All-Employees group sync complete"
}

# =============================================================================
# Bulk User Group Assignment
# =============================================================================

# Assign users to groups based on their department
# Groups have realm roles assigned, so users inherit roles via group membership
assign_user_groups() {
    log_info "Assigning users to groups..."

    # Skip in production (users managed by identity-sync only)
    if [ "$ENV" = "prod" ]; then
        log_info "Skipping user group assignment in production"
        return 0
    fi

    # Define user-to-group mapping based on original realm-export-dev.json
    # Format: username:group1,group2 (group names without leading /)
    local -a user_groups=(
        "eve.thompson:All-Employees,C-Suite"
        "alice.chen:All-Employees,HR-Department,Managers"
        "bob.martinez:All-Employees,Finance-Team,Managers"
        "carol.johnson:All-Employees,Sales-Managers"
        "dan.williams:All-Employees,Support-Team,Managers"
        "frank.davis:All-Employees,IT-Team"
        "ryan.garcia:All-Employees,Sales-Managers"
        "nina.patel:All-Employees,Engineering-Managers"
        "marcus.johnson:All-Employees,Engineering-Team"
    )

    for mapping in "${user_groups[@]}"; do
        local username="${mapping%%:*}"
        local groups="${mapping##*:}"

        # Find user by username - handle both JSON formats
        local user_id=$(_kcadm get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

        if [ -z "$user_id" ]; then
            log_warn "  User $username not found, skipping"
            continue
        fi

        # Split groups by comma and assign each
        IFS=',' read -ra group_array <<< "$groups"
        for group in "${group_array[@]}"; do
            # Find group by path
            local group_id=$(get_group_id "$group")

            if [ -z "$group_id" ]; then
                log_warn "  Group $group not found, skipping for $username"
                continue
            fi

            # Add user to group (idempotent)
            if _kcadm update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
                log_info "  $username: added to $group"
            else
                log_info "  $username: $group (already member or error)"
            fi
        done
    done

    log_info "User group assignment complete"
}

# =============================================================================
# Critical Production User Assignment
# =============================================================================

# Assign critical production users to groups
# Only runs in prod, handles users who need group membership for system access
assign_critical_prod_users() {
    # Only run in production
    if [ "$ENV" != "prod" ]; then
        return 0
    fi

    log_info "Assigning critical production users to groups..."

    # Critical users who need group membership for system access
    # C-Suite executives from hr-data.sql (EMP001-EMP004):
    #   - eve.thompson (CEO)
    #   - michael.roberts (CFO)
    #   - sarah.kim (CTO)
    #   - james.wilson (COO)
    local -a critical_users=(
        "eve.thompson:C-Suite"
        "michael.roberts:C-Suite"
        "sarah.kim:C-Suite"
        "james.wilson:C-Suite"
        "test-user.journey:All-Employees"
    )

    for mapping in "${critical_users[@]}"; do
        local username="${mapping%%:*}"
        local group="${mapping##*:}"

        # Handle both JSON formats
        local user_id=$(_kcadm get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

        if [ -z "$user_id" ]; then
            log_warn "  Critical user $username not found in Keycloak"
            continue
        fi

        local group_id=$(get_group_id "$group")

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
