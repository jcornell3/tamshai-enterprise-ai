#!/bin/bash
# =============================================================================
# Keycloak User Sync from HR Database
# =============================================================================
#
# Syncs employees from the HR PostgreSQL database to Keycloak users.
# Creates new users, updates existing ones, and assigns roles based on
# department and manager status.
#
# Usage:
#   ./sync-users.sh [environment]
#
# Environments:
#   dev    - Local development (default)
#   stage  - VPS staging
#
# Role Mapping:
#   Executive (EXEC)     → executive (composite role with all read access)
#   Human Resources (HR) → hr-read, hr-write
#   Finance (FIN)        → finance-read, finance-write
#   Sales (SALES)        → sales-read, sales-write
#   Support (SUPPORT)    → support-read, support-write
#   Other departments    → (no special roles)
#   Managers             → manager role added
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALM="tamshai-corp"
ENV="${1:-dev}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configure based on environment
configure_environment() {
    case "$ENV" in
        dev)
            KEYCLOAK_URL="http://localhost:8080/auth"
            POSTGRES_HOST="localhost"
            POSTGRES_PORT="5433"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required - set in .env file}"
            # Default dev password for synced users (DEV_USER_PASSWORD)
            DEFAULT_PASSWORD="${USER_PASSWORD:-password123}"
            ;;
        stage)
            KEYCLOAK_URL="http://localhost:8080/auth"  # Inside container
            POSTGRES_HOST="postgres"  # Docker network
            POSTGRES_PORT="5432"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required}"
            # Stage uses USER_PASSWORD (from STAGE_USER_PASSWORD GitHub Secret)
            DEFAULT_PASSWORD="${USER_PASSWORD:?USER_PASSWORD required for stage}"
            ;;
        *)
            log_error "Unknown environment: $ENV"
            exit 1
            ;;
    esac

    log_info "Environment: $ENV"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Realm: $REALM"
}

# Keycloak Admin CLI wrapper
KCADM="/opt/keycloak/bin/kcadm.sh"

kcadm_login() {
    log_info "Authenticating to Keycloak..."
    $KCADM config credentials \
        --server "$KEYCLOAK_URL" \
        --realm master \
        --user "$ADMIN_USER" \
        --password "$ADMIN_PASS"
    log_info "Authentication successful"
}

# Get user by username
get_user_id() {
    local username="$1"
    $KCADM get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | \
        grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1
}

# Get role ID by name
get_role_id() {
    local role_name="$1"
    $KCADM get roles -r "$REALM" -q "name=$role_name" --fields id 2>/dev/null | \
        grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1
}

# Map department code to Keycloak roles
get_roles_for_department() {
    local dept_code="$1"
    local is_manager="$2"
    local roles=""

    case "$dept_code" in
        EXEC)
            roles="executive"
            ;;
        HR)
            roles="hr-read hr-write"
            ;;
        FIN)
            roles="finance-read finance-write"
            ;;
        SALES)
            roles="sales-read sales-write"
            ;;
        SUPPORT)
            roles="support-read support-write"
            ;;
        *)
            # No department-specific roles
            roles=""
            ;;
    esac

    # Add manager role if applicable
    if [ "$is_manager" = "t" ] || [ "$is_manager" = "true" ]; then
        roles="$roles manager"
    fi

    echo "$roles"
}

# Create or update a Keycloak user
sync_user() {
    local username="$1"
    local email="$2"
    local first_name="$3"
    local last_name="$4"
    local dept_code="$5"
    local is_manager="$6"
    local employee_id="$7"

    local user_id=$(get_user_id "$username")

    if [ -n "$user_id" ]; then
        log_info "  Updating existing user: $username"
        $KCADM update "users/$user_id" -r "$REALM" \
            -s "email=$email" \
            -s "firstName=$first_name" \
            -s "lastName=$last_name" \
            -s "enabled=true" \
            -s "emailVerified=true" \
            -s "attributes.employee_id=[\"$employee_id\"]" \
            -s "attributes.department=[\"$dept_code\"]"
    else
        log_info "  Creating new user: $username"
        $KCADM create users -r "$REALM" \
            -s "username=$username" \
            -s "email=$email" \
            -s "firstName=$first_name" \
            -s "lastName=$last_name" \
            -s "enabled=true" \
            -s "emailVerified=true" \
            -s "attributes.employee_id=[\"$employee_id\"]" \
            -s "attributes.department=[\"$dept_code\"]"

        user_id=$(get_user_id "$username")

        # Set password for new user
        if [ -n "$user_id" ]; then
            $KCADM set-password -r "$REALM" --username "$username" \
                --new-password "$DEFAULT_PASSWORD" --temporary=false 2>/dev/null || \
                log_warn "  Failed to set password for $username"
        fi
    fi

    # Assign roles
    if [ -n "$user_id" ]; then
        local roles=$(get_roles_for_department "$dept_code" "$is_manager")
        for role in $roles; do
            $KCADM add-roles -r "$REALM" --uusername "$username" --rolename "$role" 2>/dev/null || \
                log_warn "  Failed to assign role $role to $username"
        done

        if [ -n "$roles" ]; then
            log_info "  Assigned roles: $roles"
        fi
    fi
}

# Fetch employees from HR database and sync to Keycloak
sync_all_users() {
    log_info "Fetching employees from HR database..."

    local query="
        SELECT
            e.email,
            LOWER(SPLIT_PART(e.email, '@', 1)) as username,
            e.first_name,
            e.last_name,
            COALESCE(d.code, 'OTHER') as dept_code,
            e.is_manager,
            e.id::text as employee_id
        FROM hr.employees e
        LEFT JOIN hr.departments d ON e.department_id = d.id
        WHERE e.status = 'ACTIVE'
        AND e.deleted_at IS NULL
        ORDER BY e.last_name, e.first_name;
    "

    local count=0
    local success=0
    local failed=0

    # Execute query and process results
    if [ "$ENV" = "dev" ]; then
        # For dev, connect from outside container
        PGPASSWORD="${POSTGRES_PASSWORD:-changeme}" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
            -U tamshai -d tamshai_hr -t -A -F '|' -c "$query" | \
        while IFS='|' read -r email username first_name last_name dept_code is_manager employee_id; do
            if [ -n "$email" ]; then
                count=$((count + 1))
                if sync_user "$username" "$email" "$first_name" "$last_name" "$dept_code" "$is_manager" "$employee_id"; then
                    success=$((success + 1))
                else
                    failed=$((failed + 1))
                fi
            fi
        done
    else
        # For stage, run inside postgres container via SSH
        log_warn "Stage sync not yet implemented - run from VPS"
        return 1
    fi

    log_info "Sync complete: processed users"
}

# =============================================================================
# Main
# =============================================================================

main() {
    log_info "=========================================="
    log_info "Keycloak User Sync from HR Database"
    log_info "=========================================="

    configure_environment
    kcadm_login
    sync_all_users

    log_info "=========================================="
    log_info "User Sync Complete"
    log_info "=========================================="
}

main "$@"
