#!/bin/bash
# =============================================================================
# Tamshai User Validation Test
# =============================================================================
#
# Validates that both bootstrap users and HR-synced users exist and are
# properly configured in Keycloak.
#
# Usage:
#   ./user-validation.sh [environment]
#
# Environments:
#   dev    - Local development (default)
#   stage  - VPS staging
#
# Tests:
#   1. Bootstrap users exist (from realm export)
#   2. HR-synced users exist (from sync-users command)
#   3. Users have correct roles assigned
#   4. Users can authenticate (via admin API check)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

ENV="${1:-dev}"
REALM="tamshai-corp"
CONTAINER="tamshai-keycloak"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_step() { echo -e "${BLUE}[TEST]${NC} $1"; }

FAILED=0
PASSED=0

test_step() {
    local name="$1"
    local result="$2"

    if [ "$result" = "0" ]; then
        log_info "$name"
        PASSED=$((PASSED + 1))
    else
        log_error "$name"
        FAILED=$((FAILED + 1))
    fi
}

# Run kcadm command
run_kcadm() {
    if [ "$ENV" = "dev" ]; then
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@" 2>/dev/null
    else
        local vps_host="${VPS_HOST:-}"
        if [ -z "$vps_host" ]; then
            log_error "VPS_HOST not set. Either:"
            log_step "  1. Create .env.local with VPS_HOST=<ip>"
            log_step "  2. Export VPS_HOST environment variable"
            log_step "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
            exit 1
        fi
        ssh "${VPS_SSH_USER:-root}@${vps_host}" \
            "docker exec $CONTAINER /opt/keycloak/bin/kcadm.sh $*" 2>/dev/null
    fi
}

setup_auth() {
    log_step "Authenticating to Keycloak..."

    local admin_user="${KEYCLOAK_ADMIN:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required - set in .env file}"

    run_kcadm config credentials --server http://localhost:8080/auth \
        --realm master --user "$admin_user" --password "$admin_pass"

    if [ $? -eq 0 ]; then
        test_step "Keycloak authentication" 0
    else
        test_step "Keycloak authentication" 1
        log_error "Cannot authenticate to Keycloak - aborting tests"
        exit 1
    fi
}

# =============================================================================
# Bootstrap User Tests
# =============================================================================

# Bootstrap users expected from realm-export-dev.json
BOOTSTRAP_USERS="alice.chen bob.martinez carol.johnson dan.williams eve.thompson frank.davis marcus.johnson nina.patel"

test_bootstrap_users() {
    log_step "Testing bootstrap users (from realm export)..."

    for username in $BOOTSTRAP_USERS; do
        local user_json
        user_json=$(run_kcadm get users -r "$REALM" -q "username=$username" 2>/dev/null) || user_json=""

        if echo "$user_json" | grep -q "\"username\" : \"$username\""; then
            test_step "Bootstrap user exists: $username" 0
        else
            test_step "Bootstrap user exists: $username" 1
        fi
    done
}

test_bootstrap_user_roles() {
    log_step "Testing bootstrap user roles..."

    # alice.chen should have hr-read, hr-write
    local alice_roles
    alice_roles=$(run_kcadm get users -r "$REALM" -q "username=alice.chen" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    if [ -n "$alice_roles" ]; then
        local roles
        roles=$(run_kcadm get users/$alice_roles/role-mappings/realm -r "$REALM" 2>/dev/null | grep -o '"name" : "[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        if echo "$roles" | grep -q "hr-read" && echo "$roles" | grep -q "hr-write"; then
            test_step "alice.chen has HR roles" 0
        else
            test_step "alice.chen has HR roles (found: $roles)" 1
        fi
    else
        test_step "alice.chen has HR roles (user not found)" 1
    fi

    # eve.thompson should have executive role
    local eve_id
    eve_id=$(run_kcadm get users -r "$REALM" -q "username=eve.thompson" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    if [ -n "$eve_id" ]; then
        local roles
        roles=$(run_kcadm get users/$eve_id/role-mappings/realm -r "$REALM" 2>/dev/null | grep -o '"name" : "[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        if echo "$roles" | grep -q "executive"; then
            test_step "eve.thompson has executive role" 0
        else
            test_step "eve.thompson has executive role (found: $roles)" 1
        fi
    else
        test_step "eve.thompson has executive role (user not found)" 1
    fi
}

# =============================================================================
# HR-Synced User Tests
# =============================================================================

# Sample HR-synced users to verify (not in bootstrap)
HR_SYNCED_USERS="brian.a lisa.a kevin.b jennifer.l james.w"

test_hr_synced_users() {
    log_step "Testing HR-synced users (from sync-users command)..."

    local hr_user_count=0
    local total_users
    total_users=$(run_kcadm get users -r "$REALM" --fields username 2>/dev/null | grep -c '"username"' || echo "0")

    for username in $HR_SYNCED_USERS; do
        local user_json
        user_json=$(run_kcadm get users -r "$REALM" -q "username=$username" 2>/dev/null) || user_json=""

        if echo "$user_json" | grep -q "\"username\" : \"$username\""; then
            test_step "HR-synced user exists: $username" 0
            hr_user_count=$((hr_user_count + 1))
        else
            test_step "HR-synced user exists: $username" 1
        fi
    done

    # Check total user count (bootstrap + HR synced)
    if [ "$total_users" -ge 50 ]; then
        test_step "HR sync complete: $total_users users (expected 50+)" 0
    else
        test_step "HR sync complete: $total_users users (expected 50+)" 1
        log_warn "  Run: ./scripts/infra/keycloak.sh sync-users $ENV"
    fi
}

test_hr_user_roles() {
    log_step "Testing HR-synced user roles..."

    # jennifer.l (HR dept) should have hr-read, hr-write
    local jennifer_id
    jennifer_id=$(run_kcadm get users -r "$REALM" -q "username=jennifer.l" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    if [ -n "$jennifer_id" ]; then
        local roles
        roles=$(run_kcadm get users/$jennifer_id/role-mappings/realm -r "$REALM" 2>/dev/null | grep -o '"name" : "[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        if echo "$roles" | grep -q "hr-read"; then
            test_step "jennifer.l (HR) has HR roles" 0
        else
            test_step "jennifer.l (HR) has HR roles (found: $roles)" 1
        fi
    else
        test_step "jennifer.l (HR) has HR roles (user not found - run sync-users)" 1
    fi

    # james.w (EXEC dept) should have executive role
    local james_id
    james_id=$(run_kcadm get users -r "$REALM" -q "username=james.w" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)
    if [ -n "$james_id" ]; then
        local roles
        roles=$(run_kcadm get users/$james_id/role-mappings/realm -r "$REALM" 2>/dev/null | grep -o '"name" : "[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
        if echo "$roles" | grep -q "executive"; then
            test_step "james.w (EXEC) has executive role" 0
        else
            test_step "james.w (EXEC) has executive role (found: $roles)" 1
        fi
    else
        test_step "james.w (EXEC) has executive role (user not found - run sync-users)" 1
    fi
}

# =============================================================================
# User Count Validation
# =============================================================================

test_user_counts() {
    log_step "Validating user counts..."

    local kc_user_count
    kc_user_count=$(run_kcadm get users -r "$REALM" --fields username 2>/dev/null | grep -c '"username"' || echo "0")

    local compose_dir="$PROJECT_ROOT/infrastructure/docker"

    if [ "$ENV" = "dev" ]; then
        local hr_count
        hr_count=$(docker compose -f "$compose_dir/docker-compose.yml" exec -T postgres \
            psql -U tamshai -d tamshai_hr -t -c \
            "SELECT COUNT(*) FROM hr.employees WHERE status='ACTIVE' AND deleted_at IS NULL;" 2>/dev/null | tr -d ' ') || hr_count="0"

        echo "  Keycloak users: $kc_user_count"
        echo "  HR employees: $hr_count"

        if [ "$kc_user_count" -ge "$hr_count" ]; then
            test_step "Keycloak has all HR employees ($kc_user_count >= $hr_count)" 0
        else
            test_step "Keycloak has all HR employees ($kc_user_count < $hr_count)" 1
            log_warn "  Run: ./scripts/infra/keycloak.sh sync-users $ENV"
        fi
    else
        echo "  Keycloak users: $kc_user_count"
        if [ "$kc_user_count" -ge 50 ]; then
            test_step "Keycloak has expected user count ($kc_user_count >= 50)" 0
        else
            test_step "Keycloak has expected user count ($kc_user_count < 50)" 1
        fi
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "========================================"
    echo "Tamshai User Validation Test"
    echo "========================================"
    echo "Environment: $ENV"
    echo ""

    setup_auth

    echo ""
    test_bootstrap_users
    test_bootstrap_user_roles

    echo ""
    test_hr_synced_users
    test_hr_user_roles

    echo ""
    test_user_counts

    echo ""
    echo "========================================"
    echo "Test Results"
    echo "========================================"
    echo -e "Passed: ${GREEN}$PASSED${NC}"
    echo -e "Failed: ${RED}$FAILED${NC}"

    if [ "$FAILED" -gt 0 ]; then
        echo ""
        log_error "Some tests failed. Suggested fixes:"
        echo "  1. Ensure Keycloak is running: docker compose ps"
        echo "  2. Sync realm: ./scripts/infra/keycloak.sh sync $ENV"
        echo "  3. Sync users: ./scripts/infra/keycloak.sh sync-users $ENV"
        return 1
    else
        echo ""
        log_info "All tests passed!"
        return 0
    fi
}

main "$@"
