#!/bin/bash
#
# E2E Login Test with TOTP Backup/Restore
#
# This script safely runs E2E login tests for users with TOTP enabled by:
# 1. Backing up the user's TOTP credential from Keycloak database
# 2. Temporarily switching the realm to standard browser flow (no OTP)
# 3. Restarting Keycloak to apply the flow changes
# 4. Running the Playwright E2E login test
# 5. Restoring the TOTP credential and browser-with-otp flow
# 6. Restarting Keycloak to restore normal OTP-required login
#
# The user's authenticator app continues working after the test because
# the exact same credential record is restored to the database.
#
# Usage:
#   ./e2e-login-with-totp-backup.sh [dev|stage] [username]
#
# Examples:
#   ./e2e-login-with-totp-backup.sh dev eve.thompson
#   ./e2e-login-with-totp-backup.sh stage alice.chen
#
# Environment variables:
#   TEST_ENV        - Environment to test (dev or stage)
#   TEST_USERNAME   - Username to test (default: eve.thompson)
#   GITHUB_BACKUP   - If "true", also backs up credential to GitHub Secrets
#   VPS_HOST        - Stage VPS IP address (required for stage)
#   VPS_SSH_USER    - Stage VPS SSH user (default: root)
#
# Requirements:
#   - Dev: Docker running with tamshai-postgres and tamshai-keycloak containers
#   - Stage: SSH key configured for VPS access
#   - Node.js and npm installed (for Playwright tests)
#

set -e

# Configuration
ENV="${1:-dev}"
USERNAME="${2:-eve.thompson}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/tests/e2e/.totp-backups"
BACKUP_FILE="$BACKUP_DIR/${USERNAME}-totp-credential.json"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Determine database connection based on environment
if [ "$ENV" = "dev" ]; then
    POSTGRES_CONTAINER="tamshai-postgres"
    POSTGRES_USER="postgres"
    POSTGRES_DB="keycloak"
    KEYCLOAK_URL="https://www.tamshai.local"
    USE_SSH=false
elif [ "$ENV" = "stage" ]; then
    # Stage environment - connect via SSH to VPS
    # Requires VPS_HOST and VPS_SSH_USER environment variables
    VPS_HOST="${VPS_HOST:-}"
    if [ -z "$VPS_HOST" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi
    VPS_SSH_USER="${VPS_SSH_USER:-root}"

    # Test SSH connectivity
    if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$VPS_SSH_USER@$VPS_HOST" "echo ok" >/dev/null 2>&1; then
        log_error "Cannot connect to stage VPS via SSH. Ensure SSH key is configured."
        log_error "Set VPS_HOST and VPS_SSH_USER environment variables if needed."
        exit 1
    fi

    POSTGRES_CONTAINER="postgres"
    POSTGRES_USER="postgres"
    POSTGRES_DB="keycloak"
    KEYCLOAK_URL="https://www.tamshai.com"
    USE_SSH=true
else
    log_error "Unknown environment: $ENV"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Helper function to run docker commands (locally or via SSH)
run_docker() {
    if [ "$USE_SSH" = true ]; then
        ssh "$VPS_SSH_USER@$VPS_HOST" "docker $*"
    else
        docker "$@"
    fi
}

# Function to get user ID from username
get_user_id() {
    local username="$1"
    run_run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
        "SELECT id FROM user_entity WHERE username = '$username' AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp');" \
        2>/dev/null | tr -d ' \n'
}

# Function to backup TOTP credential
backup_totp_credential() {
    local user_id="$1"
    log_info "Backing up TOTP credential for user ID: $user_id"

    # Get the full credential row as JSON
    run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
        "SELECT row_to_json(c) FROM credential c WHERE user_id = '$user_id' AND type = 'otp';" \
        2>/dev/null | tr -d ' \n' > "$BACKUP_FILE"

    if [ ! -s "$BACKUP_FILE" ]; then
        log_warn "No TOTP credential found for user - test will run without TOTP"
        rm -f "$BACKUP_FILE"
        return 1
    fi

    log_info "TOTP credential backed up to: $BACKUP_FILE"

    # Optionally backup to GitHub Secrets
    if [ "$GITHUB_BACKUP" = "true" ]; then
        log_info "Backing up to GitHub Secrets..."
        local secret_name="E2E_TOTP_BACKUP_${USERNAME//./_}"
        gh secret set "$secret_name" < "$BACKUP_FILE"
        log_info "Backed up to GitHub Secret: $secret_name"
    fi

    return 0
}

# Function to disable TOTP (delete credential and switch browser flow)
disable_totp() {
    local user_id="$1"
    log_info "Disabling TOTP for user ID: $user_id"

    # Delete the TOTP credential
    run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
        "DELETE FROM credential WHERE user_id = '$user_id' AND type = 'otp';" \
        2>/dev/null

    # Get the standard browser flow ID (without OTP required)
    local standard_browser_flow=$(run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
        "SELECT id FROM authentication_flow WHERE alias = 'browser' AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp');" \
        2>/dev/null | tr -d ' \n')

    if [ -n "$standard_browser_flow" ]; then
        log_info "Switching realm to standard browser flow (without OTP requirement)"
        run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
            "UPDATE realm SET browser_flow = '$standard_browser_flow' WHERE name = 'tamshai-corp';" \
            2>/dev/null

        # Restart Keycloak to clear auth flow cache
        log_info "Restarting Keycloak to apply flow changes..."
        run_docker restart ${ENV}-keycloak 2>/dev/null || run_docker restart tamshai-keycloak 2>/dev/null || run_docker restart keycloak >/dev/null 2>&1

        # Wait for Keycloak to be ready
        log_info "Waiting for Keycloak to be ready..."
        local max_wait=60
        local waited=0
        while [ $waited -lt $max_wait ]; do
            if curl -s -k "$KEYCLOAK_URL/auth/health/ready" | grep -q "UP" 2>/dev/null; then
                break
            fi
            sleep 2
            waited=$((waited + 2))
        done

        if [ $waited -ge $max_wait ]; then
            log_warn "Keycloak may not be fully ready, continuing anyway..."
        else
            log_info "Keycloak is ready"
        fi
    fi

    log_info "TOTP disabled"
}

# Function to restore TOTP credential
restore_totp_credential() {
    local user_id="$1"

    if [ ! -f "$BACKUP_FILE" ]; then
        log_warn "No backup file found - skipping restore"
        return 1
    fi

    log_info "Restoring TOTP credential for user ID: $user_id"

    # Use Node.js to parse JSON and generate SQL (jq not available on Windows)
    # Convert Git Bash path to Windows path for Node.js
    local win_backup_file
    if [[ "$BACKUP_FILE" == /c/* ]]; then
        win_backup_file="C:${BACKUP_FILE:2}"
    else
        win_backup_file="$BACKUP_FILE"
    fi

    local sql=$(node -e "
        const fs = require('fs');
        const backup = JSON.parse(fs.readFileSync('$win_backup_file', 'utf8'));
        const salt = backup.salt ? \"'\" + backup.salt + \"'\" : 'NULL';
        const sql = \`INSERT INTO credential (id, salt, type, user_id, created_date, user_label, secret_data, credential_data, priority)
VALUES ('\${backup.id}', \${salt}, 'otp', '\${backup.user_id}', \${backup.created_date}, '\${backup.user_label}', '\${backup.secret_data}', '\${backup.credential_data}', \${backup.priority});\`;
        console.log(sql);
    ")

    # Execute the restore SQL
    run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$sql" 2>/dev/null

    # Restore the browser-with-otp flow
    local otp_browser_flow=$(run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
        "SELECT id FROM authentication_flow WHERE alias = 'browser-with-otp' AND realm_id = (SELECT id FROM realm WHERE name = 'tamshai-corp');" \
        2>/dev/null | tr -d ' \n')

    if [ -n "$otp_browser_flow" ]; then
        log_info "Restoring browser-with-otp flow for realm"
        run_docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
            "UPDATE realm SET browser_flow = '$otp_browser_flow' WHERE name = 'tamshai-corp';" \
            2>/dev/null

        # Restart Keycloak to apply flow changes
        log_info "Restarting Keycloak to apply restored flow..."
        run_docker restart ${ENV}-keycloak 2>/dev/null || run_docker restart tamshai-keycloak 2>/dev/null || run_docker restart keycloak >/dev/null 2>&1

        # Wait for Keycloak to be ready (shorter wait since we're done testing)
        sleep 5
    fi

    log_info "TOTP credential restored"

    # Clean up local backup file
    rm -f "$BACKUP_FILE"
    log_info "Local backup file removed"

    # Clean up GitHub Secret if it was used
    if [ "$GITHUB_BACKUP" = "true" ]; then
        local secret_name="E2E_TOTP_BACKUP_${USERNAME//./_}"
        gh secret delete "$secret_name" 2>/dev/null || true
        log_info "GitHub Secret removed: $secret_name"
    fi
}

# Function to run the E2E test
run_e2e_test() {
    log_info "Running E2E login test..."

    cd "$PROJECT_ROOT/tests/e2e"

    # Run the test without TOTP secret (since TOTP is disabled)
    TEST_ENV="$ENV" TEST_USERNAME="$USERNAME" \
        npx playwright test specs/login-journey.ui.spec.ts \
        --project=chromium \
        --workers=1 \
        --grep "complete full login"

    return $?
}

# Main execution
main() {
    log_info "Starting E2E login test with TOTP backup/restore"
    log_info "Environment: $ENV"
    log_info "Username: $USERNAME"
    echo ""

    # Get user ID
    USER_ID=$(get_user_id "$USERNAME")
    if [ -z "$USER_ID" ]; then
        log_error "User not found: $USERNAME"
        exit 1
    fi
    log_info "Found user ID: $USER_ID"

    # Track if we need to restore
    NEED_RESTORE=false
    TEST_EXIT_CODE=0

    # Backup TOTP credential
    if backup_totp_credential "$USER_ID"; then
        NEED_RESTORE=true

        # Disable TOTP
        disable_totp "$USER_ID"
    fi

    echo ""

    # Run the test (capture exit code but don't exit on failure)
    set +e
    run_e2e_test
    TEST_EXIT_CODE=$?
    set -e

    echo ""

    # Restore TOTP credential if we backed it up
    if [ "$NEED_RESTORE" = true ]; then
        restore_totp_credential "$USER_ID"
    fi

    echo ""

    # Report result
    if [ $TEST_EXIT_CODE -eq 0 ]; then
        log_info "E2E login test PASSED"
    else
        log_error "E2E login test FAILED (exit code: $TEST_EXIT_CODE)"
    fi

    exit $TEST_EXIT_CODE
}

# Trap to ensure restore happens even on script failure
cleanup() {
    if [ "$NEED_RESTORE" = true ] && [ -f "$BACKUP_FILE" ]; then
        log_warn "Script interrupted - attempting to restore TOTP credential..."
        USER_ID=$(get_user_id "$USERNAME")
        if [ -n "$USER_ID" ]; then
            restore_totp_credential "$USER_ID"
        fi
    fi
}
trap cleanup EXIT

main
