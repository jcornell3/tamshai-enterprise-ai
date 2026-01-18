#!/bin/bash
# =============================================================================
# User Provisioning Job Entrypoint
# =============================================================================
# Environment variables (set by Cloud Run):
#   ACTION              - verify-only, load-hr-data, load-finance-data, sync-users, all
#   DRY_RUN             - true/false
#   FORCE_PASSWORD_RESET - true/false
#   CLOUD_SQL_INSTANCE  - Connection name (project:region:instance)
#   DB_PASSWORD         - PostgreSQL password
#   KC_ADMIN_PASSWORD   - Keycloak admin password
#   KC_CLIENT_SECRET    - MCP HR service client secret
#   PROD_USER_PASSWORD  - Password for provisioned users
#   KEYCLOAK_URL        - Keycloak base URL (with /auth)
#   KEYCLOAK_REALM      - Keycloak realm name
# =============================================================================

set -e

ACTION="${ACTION:-verify-only}"
DRY_RUN="${DRY_RUN:-false}"
FORCE_PASSWORD_RESET="${FORCE_PASSWORD_RESET:-false}"
PROXY_PID=""

echo "=============================================="
echo "User Provisioning Job"
echo "=============================================="
echo "Action:              ${ACTION}"
echo "Dry Run:             ${DRY_RUN}"
echo "Force Password Reset: ${FORCE_PASSWORD_RESET}"
echo "Cloud SQL Instance:  ${CLOUD_SQL_INSTANCE}"
echo "Keycloak URL:        ${KEYCLOAK_URL}"
echo "=============================================="

# -----------------------------------------------------------------------------
# Cleanup function
# -----------------------------------------------------------------------------
cleanup() {
    if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" 2>/dev/null; then
        echo "[INFO] Stopping Cloud SQL Proxy..."
        kill "$PROXY_PID" 2>/dev/null || true
        wait "$PROXY_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Start Cloud SQL Proxy
# -----------------------------------------------------------------------------
start_proxy() {
    echo "[INFO] Starting Cloud SQL Proxy..."
    cloud-sql-proxy "$CLOUD_SQL_INSTANCE" \
        --private-ip \
        --port=5432 \
        --quiet &
    PROXY_PID=$!

    # Wait for proxy to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost 5432 2>/dev/null; then
            echo "[OK] Cloud SQL Proxy ready (PID: $PROXY_PID)"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    echo "[ERROR] Cloud SQL Proxy failed to start"
    exit 1
}

# -----------------------------------------------------------------------------
# Verify current state
# -----------------------------------------------------------------------------
verify_state() {
    echo ""
    echo "=== Verifying Current State ==="

    # Count employees in database
    export PGPASSWORD="$DB_PASSWORD"
    if EMPLOYEE_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_hr -t -c \
        "SELECT COUNT(*) FROM hr.employees WHERE UPPER(status) = 'ACTIVE';" 2>/dev/null | tr -d ' \n'); then
        echo "[OK] Connected to Cloud SQL"
        echo "[INFO] Active employees: $EMPLOYEE_COUNT"
        echo "employee_count=$EMPLOYEE_COUNT" > /tmp/verify-state.env
    else
        echo "[WARN] Could not query employees table (may not exist yet)"
        echo "employee_count=0" > /tmp/verify-state.env
    fi

    # Check Keycloak
    echo ""
    echo "[INFO] Checking Keycloak..."
    KC_TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=$KC_ADMIN_PASSWORD" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")

    if [ -z "$KC_TOKEN" ]; then
        echo "[WARN] Could not get Keycloak admin token"
        echo "keycloak_users=unknown" >> /tmp/verify-state.env
    else
        echo "[OK] Keycloak authentication successful"
        USER_COUNT=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?max=1000" \
            -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null | grep -o '"username"' | wc -l || echo "0")
        echo "[INFO] Keycloak users in ${KEYCLOAK_REALM}: $USER_COUNT"
        echo "keycloak_users=$USER_COUNT" >> /tmp/verify-state.env
    fi

    echo ""
    echo "=== State Summary ==="
    cat /tmp/verify-state.env
}

# -----------------------------------------------------------------------------
# Load HR sample data
# -----------------------------------------------------------------------------
load_hr_data() {
    if [ "$ACTION" != "load-hr-data" ] && [ "$ACTION" != "all" ]; then
        echo "[SKIP] Action is ${ACTION}, skipping HR data load"
        return 0
    fi

    echo ""
    echo "=== Loading HR Sample Data ==="

    if [ "$DRY_RUN" = "true" ]; then
        echo "[DRY RUN] Would load sample-data/hr-data.sql"
        echo "File size: $(wc -l < /app/sample-data/hr-data.sql) lines"
        return 0
    fi

    export PGPASSWORD="$DB_PASSWORD"
    echo "[INFO] Loading HR data from sample-data/hr-data.sql..."
    psql -h localhost -p 5432 -U tamshai -d tamshai_hr -f /app/sample-data/hr-data.sql

    EMPLOYEE_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_hr -t -c \
        "SELECT COUNT(*) FROM hr.employees WHERE UPPER(status) = 'ACTIVE';" | tr -d ' \n')
    echo "[OK] HR data loaded: $EMPLOYEE_COUNT active employees"
}

# -----------------------------------------------------------------------------
# Load Finance sample data
# -----------------------------------------------------------------------------
load_finance_data() {
    if [ "$ACTION" != "load-finance-data" ] && [ "$ACTION" != "all" ]; then
        echo "[SKIP] Action is ${ACTION}, skipping Finance data load"
        return 0
    fi

    echo ""
    echo "=== Loading Finance Sample Data ==="

    if [ "$DRY_RUN" = "true" ]; then
        echo "[DRY RUN] Would load sample-data/finance-data.sql"
        echo "File size: $(wc -l < /app/sample-data/finance-data.sql) lines"
        return 0
    fi

    export PGPASSWORD="$DB_PASSWORD"

    # Create database if it doesn't exist (finance-data.sql handles the \c switch)
    echo "[INFO] Loading Finance data from sample-data/finance-data.sql..."
    psql -h localhost -p 5432 -U tamshai -d postgres -f /app/sample-data/finance-data.sql

    INVOICE_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_finance -t -c \
        "SELECT COUNT(*) FROM finance.invoices;" 2>/dev/null | tr -d ' \n' || echo "0")
    EXPENSE_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_finance -t -c \
        "SELECT COUNT(*) FROM finance.expense_reports;" 2>/dev/null | tr -d ' \n' || echo "0")
    echo "[OK] Finance data loaded: $INVOICE_COUNT invoices, $EXPENSE_COUNT expense reports"
}

# -----------------------------------------------------------------------------
# Ensure mcp-hr-service has realm-management permissions for role assignment
# -----------------------------------------------------------------------------
ensure_service_account_permissions() {
    echo ""
    echo "=== Ensuring Service Account Permissions ==="

    # Get admin token
    KC_TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=$KC_ADMIN_PASSWORD" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")

    if [ -z "$KC_TOKEN" ]; then
        echo "[WARN] Could not get admin token - skipping permission check"
        return 0
    fi

    # Get mcp-hr-service client ID
    CLIENT_ID=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=mcp-hr-service" \
        -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    if [ -z "$CLIENT_ID" ]; then
        echo "[WARN] mcp-hr-service client not found"
        return 0
    fi

    echo "[INFO] mcp-hr-service client ID: $CLIENT_ID"

    # Get service account user ID
    SA_USER_ID=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${CLIENT_ID}/service-account-user" \
        -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    if [ -z "$SA_USER_ID" ]; then
        echo "[WARN] Service account user not found"
        return 0
    fi

    echo "[INFO] Service account user ID: $SA_USER_ID"

    # Get realm-management client ID
    REALM_MGMT_ID=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=realm-management" \
        -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

    if [ -z "$REALM_MGMT_ID" ]; then
        echo "[WARN] realm-management client not found"
        return 0
    fi

    echo "[INFO] realm-management client ID: $REALM_MGMT_ID"

    # Get all realm-management roles
    ROLES_JSON=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${REALM_MGMT_ID}/roles" \
        -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null || echo "[]")

    # Function to get role ID by name
    get_role_id() {
        local role_name="$1"
        echo "$ROLES_JSON" | grep -o "{[^}]*\"name\":\"$role_name\"[^}]*}" | grep -o '"id":"[^"]*"' | cut -d'"' -f4
    }

    # Required roles for identity sync with role assignment
    REQUIRED_ROLES="manage-users view-users query-users view-realm manage-realm"

    for role in $REQUIRED_ROLES; do
        ROLE_ID=$(get_role_id "$role")
        if [ -n "$ROLE_ID" ]; then
            echo "[INFO] Assigning $role role (ID: $ROLE_ID)..."
            HTTP_CODE=$(curl -sf -w "%{http_code}" -o /dev/null -X POST \
                "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${SA_USER_ID}/role-mappings/clients/${REALM_MGMT_ID}" \
                -H "Authorization: Bearer $KC_TOKEN" \
                -H "Content-Type: application/json" \
                -d "[{\"id\":\"$ROLE_ID\",\"name\":\"$role\"}]" 2>/dev/null || echo "000")

            if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
                echo "[OK] $role role assigned"
            elif [ "$HTTP_CODE" = "409" ]; then
                echo "[OK] $role role already assigned"
            else
                echo "[WARN] Could not assign $role role (HTTP $HTTP_CODE)"
            fi
        else
            echo "[WARN] Role $role not found"
        fi
    done

    echo "[OK] Service account permissions verified"
}

# -----------------------------------------------------------------------------
# Sync users to Keycloak
# -----------------------------------------------------------------------------
sync_users() {
    if [ "$ACTION" != "sync-users" ] && [ "$ACTION" != "all" ]; then
        echo "[SKIP] Action is ${ACTION}, skipping user sync"
        return 0
    fi

    echo ""
    echo "=== Syncing Users to Keycloak ==="

    # Ensure service account has required permissions for role assignment
    ensure_service_account_permissions

    if [ "$DRY_RUN" = "true" ]; then
        echo "[DRY RUN] Would run identity-sync"
        echo "  KEYCLOAK_URL: ${KEYCLOAK_URL}"
        echo "  KEYCLOAK_REALM: ${KEYCLOAK_REALM}"
        echo "  Force Password Reset: ${FORCE_PASSWORD_RESET}"
        return 0
    fi

    # Build sync arguments
    # --no-redis: Cloud Run Job has no Redis, use no-op queue
    SYNC_ARGS="--no-redis"
    if [ "$FORCE_PASSWORD_RESET" = "true" ]; then
        SYNC_ARGS="$SYNC_ARGS --force-password-reset"
    fi

    # Set environment for identity-sync
    export POSTGRES_HOST=localhost
    export POSTGRES_PORT=5432
    export POSTGRES_DB=tamshai_hr
    export POSTGRES_USER=tamshai
    export POSTGRES_PASSWORD="$DB_PASSWORD"
    export KEYCLOAK_URL="$KEYCLOAK_URL"
    export KEYCLOAK_REALM="$KEYCLOAK_REALM"
    export KEYCLOAK_CLIENT_ID=mcp-hr-service
    export KEYCLOAK_CLIENT_SECRET="$KC_CLIENT_SECRET"
    export DEFAULT_USER_PASSWORD="$PROD_USER_PASSWORD"
    export ENVIRONMENT=prod

    cd /app/services/mcp-hr
    echo "[INFO] Running identity-sync..."
    npx tsx src/scripts/sync-identities.ts $SYNC_ARGS || {
        echo "[ERROR] Identity sync failed"
        exit 1
    }

    echo "[OK] User sync completed"
}

# -----------------------------------------------------------------------------
# Final verification
# -----------------------------------------------------------------------------
final_verify() {
    echo ""
    echo "=== Final Verification ==="

    export PGPASSWORD="$DB_PASSWORD"

    EMPLOYEE_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_hr -t -c \
        "SELECT COUNT(*) FROM hr.employees WHERE UPPER(status) = 'ACTIVE';" 2>/dev/null | tr -d ' \n' || echo "0")

    SYNCED_COUNT=$(psql -h localhost -p 5432 -U tamshai -d tamshai_hr -t -c \
        "SELECT COUNT(*) FROM hr.employees WHERE keycloak_user_id IS NOT NULL;" 2>/dev/null | tr -d ' \n' || echo "0")

    KC_TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=$KC_ADMIN_PASSWORD" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || echo "")

    if [ -n "$KC_TOKEN" ]; then
        KC_USER_COUNT=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?max=1000" \
            -H "Authorization: Bearer $KC_TOKEN" 2>/dev/null | grep -o '"username"' | wc -l || echo "unknown")
    else
        KC_USER_COUNT="unknown"
    fi

    # Load initial state
    source /tmp/verify-state.env 2>/dev/null || true

    echo ""
    echo "=============================================="
    echo "PROVISIONING SUMMARY"
    echo "=============================================="
    echo "Action:              ${ACTION}"
    echo "Dry Run:             ${DRY_RUN}"
    echo ""
    echo "BEFORE:"
    echo "  HR Employees:      ${employee_count:-unknown}"
    echo "  Keycloak Users:    ${keycloak_users:-unknown}"
    echo ""
    echo "AFTER:"
    echo "  HR Employees:      $EMPLOYEE_COUNT"
    echo "  Synced to KC:      $SYNCED_COUNT"
    echo "  Keycloak Users:    $KC_USER_COUNT"
    echo "=============================================="
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
start_proxy
verify_state
load_hr_data
load_finance_data
sync_users
final_verify

echo ""
echo "[SUCCESS] Provisioning job completed"
