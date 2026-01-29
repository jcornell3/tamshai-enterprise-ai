#!/bin/bash
# =============================================================================
# GCP Secret Management Library
# =============================================================================
#
# Functions for syncing secrets between GitHub and GCP Secret Manager.
# Addresses Issue #25 (trailing whitespace) and Phoenix rebuild requirements.
#
# Usage:
#   source /path/to/scripts/gcp/lib/secrets.sh
#   sync_secret_to_gcp "MY_SECRET" "secret-value"
#   verify_gcp_secrets
#
# Requirements:
#   - gcloud CLI authenticated
#   - GCP_PROJECT_ID environment variable set
#
# =============================================================================

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_secrets_info() { echo -e "${BLUE}[secrets]${NC} $1"; }
log_secrets_success() { echo -e "${GREEN}[secrets]${NC} $1"; }
log_secrets_warn() { echo -e "${YELLOW}[secrets]${NC} $1"; }
log_secrets_error() { echo -e "${RED}[secrets]${NC} $1"; }

# Resource prefix for DR portability (same pattern as cleanup.sh)
RESOURCE_PREFIX="${RESOURCE_PREFIX:-tamshai-prod}"

# Required GCP secrets for Phoenix rebuild
REQUIRED_GCP_SECRETS=(
    "${RESOURCE_PREFIX}-claude-api-key"
    "${RESOURCE_PREFIX}-db-password"
    "${RESOURCE_PREFIX}-keycloak-admin-password"
    "${RESOURCE_PREFIX}-keycloak-db-password"
    "${RESOURCE_PREFIX}-mongodb-uri"
    "mcp-hr-service-client-secret"
)

# GitHub to GCP secret name mapping
declare -A GITHUB_TO_GCP_MAP=(
    ["CLAUDE_API_KEY_PROD"]="${RESOURCE_PREFIX}-claude-api-key"
    ["PROD_DB_PASSWORD"]="${RESOURCE_PREFIX}-db-password"
    ["KEYCLOAK_ADMIN_PASSWORD_PROD"]="${RESOURCE_PREFIX}-keycloak-admin-password"
    ["KEYCLOAK_DB_PASSWORD_PROD"]="${RESOURCE_PREFIX}-keycloak-db-password"
    ["MONGODB_ATLAS_URI_PROD"]="${RESOURCE_PREFIX}-mongodb-uri"
    ["MCP_HR_SERVICE_CLIENT_SECRET"]="mcp-hr-service-client-secret"
    ["PROD_USER_PASSWORD"]="prod-user-password"
)

# Sanitize secret value (Issue #25 fix)
# Removes trailing whitespace, \r\n, and hidden characters
sanitize_secret() {
    local value="$1"
    # Remove trailing whitespace, carriage returns, newlines
    # Also handles Windows-style line endings
    echo -n "$value" | tr -d '\r' | sed 's/[[:space:]]*$//'
}

# Check if GCP secret exists
gcp_secret_exists() {
    local secret_name="$1"
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    gcloud secrets describe "$secret_name" --project="$project" &>/dev/null
}

# Create or update a GCP secret (idempotent)
ensure_gcp_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    # Sanitize the value
    local clean_value
    clean_value=$(sanitize_secret "$secret_value")

    if gcp_secret_exists "$secret_name"; then
        # Secret exists - add new version
        log_secrets_info "Updating secret: $secret_name"
        echo -n "$clean_value" | gcloud secrets versions add "$secret_name" \
            --project="$project" \
            --data-file=- 2>/dev/null
    else
        # Secret doesn't exist - create it
        log_secrets_info "Creating secret: $secret_name"
        echo -n "$clean_value" | gcloud secrets create "$secret_name" \
            --project="$project" \
            --replication-policy="automatic" \
            --data-file=- 2>/dev/null
    fi

    log_secrets_success "Secret $secret_name updated"
}

# Sync a single secret from GitHub to GCP
# Usage: sync_secret_to_gcp "GITHUB_SECRET_NAME" "value"
sync_secret_to_gcp() {
    local github_name="$1"
    local value="$2"

    # Look up GCP secret name from mapping
    local gcp_name="${GITHUB_TO_GCP_MAP[$github_name]:-}"

    if [ -z "$gcp_name" ]; then
        log_secrets_warn "No GCP mapping for GitHub secret: $github_name"
        return 0
    fi

    ensure_gcp_secret "$gcp_name" "$value"
}

# Verify all required GCP secrets exist
verify_gcp_secrets() {
    log_secrets_info "Verifying required GCP secrets..."

    local missing=0
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    for secret_name in "${REQUIRED_GCP_SECRETS[@]}"; do
        if gcp_secret_exists "$secret_name"; then
            log_secrets_success "  Found: $secret_name"
        else
            log_secrets_error "  Missing: $secret_name"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -gt 0 ]; then
        log_secrets_error "Missing $missing required secrets"
        return 1
    fi

    log_secrets_success "All required GCP secrets verified"
    return 0
}

# Get a secret value from GCP Secret Manager
get_gcp_secret() {
    local secret_name="$1"
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    gcloud secrets versions access latest --secret="$secret_name" --project="$project" 2>/dev/null
}

# Check secret for trailing whitespace (diagnostic)
check_secret_hygiene() {
    local secret_name="$1"
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    local value
    value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$project" 2>/dev/null) || {
        log_secrets_error "Could not access secret: $secret_name"
        return 1
    }

    # Check for trailing whitespace or \r
    local clean_value
    clean_value=$(sanitize_secret "$value")

    if [ "$value" != "$clean_value" ]; then
        log_secrets_warn "Secret '$secret_name' has trailing whitespace or \\r characters"
        echo "  Original length: ${#value}"
        echo "  Clean length: ${#clean_value}"
        return 1
    else
        log_secrets_success "Secret '$secret_name' is clean"
        return 0
    fi
}

# Check all required secrets for hygiene issues
check_all_secrets_hygiene() {
    log_secrets_info "Checking secret hygiene (Issue #25 fix)..."

    local issues=0

    for secret_name in "${REQUIRED_GCP_SECRETS[@]}"; do
        if ! check_secret_hygiene "$secret_name"; then
            issues=$((issues + 1))
        fi
    done

    if [ $issues -gt 0 ]; then
        log_secrets_warn "$issues secrets have hygiene issues"
        log_secrets_info "Run sync_all_secrets_from_github to fix"
        return 1
    fi

    log_secrets_success "All secrets pass hygiene check"
    return 0
}

# Sync all mapped secrets from GitHub to GCP
# Requires: GitHub CLI (gh) authenticated
sync_all_secrets_from_github() {
    log_secrets_info "Syncing all secrets from GitHub to GCP..."

    if ! command -v gh &>/dev/null; then
        log_secrets_error "GitHub CLI (gh) not installed"
        return 1
    fi

    if ! gh auth status &>/dev/null; then
        log_secrets_error "GitHub CLI not authenticated. Run: gh auth login"
        return 1
    fi

    local synced=0
    local failed=0

    for github_name in "${!GITHUB_TO_GCP_MAP[@]}"; do
        local gcp_name="${GITHUB_TO_GCP_MAP[$github_name]}"
        log_secrets_info "Syncing $github_name -> $gcp_name"

        # Get secret from GitHub
        # Note: gh secret list shows names but doesn't expose values
        # This function assumes you have the values available
        log_secrets_warn "  Cannot automatically read GitHub secret values"
        log_secrets_info "  Use: sync_secret_to_gcp '$github_name' '<value>'"
        failed=$((failed + 1))
    done

    if [ $failed -gt 0 ]; then
        log_secrets_warn "Manual intervention required for $failed secrets"
        echo ""
        echo "To sync secrets manually, run:"
        echo "  source scripts/gcp/lib/secrets.sh"
        echo "  sync_secret_to_gcp 'GITHUB_SECRET_NAME' '\$SECRET_VALUE'"
    fi
}

# Delete all versions of a secret except the latest (cleanup)
cleanup_secret_versions() {
    local secret_name="$1"
    local keep_versions="${2:-1}"
    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    log_secrets_info "Cleaning up old versions of $secret_name (keeping latest $keep_versions)..."

    # List all versions, sorted by version number descending
    local versions
    versions=$(gcloud secrets versions list "$secret_name" \
        --project="$project" \
        --format="value(name)" \
        --filter="state=enabled" \
        --sort-by="~name" 2>/dev/null)

    local count=0
    while read -r version; do
        count=$((count + 1))
        if [ $count -gt "$keep_versions" ]; then
            log_secrets_info "  Destroying version: $version"
            gcloud secrets versions destroy "$version" \
                --secret="$secret_name" \
                --project="$project" \
                --quiet 2>/dev/null || true
        fi
    done <<< "$versions"

    log_secrets_success "Cleanup complete for $secret_name"
}

# =============================================================================
# GAP #41: Sync secrets from environment variables to GCP
# =============================================================================
# This function reads secrets from environment variables (as set by GitHub Actions)
# and syncs them to GCP Secret Manager. This enables Phoenix rebuild automation.
#
# Usage in GitHub Actions:
#   export CLAUDE_API_KEY_PROD="${{ secrets.CLAUDE_API_KEY_PROD }}"
#   export MCP_HR_SERVICE_CLIENT_SECRET="${{ secrets.MCP_HR_SERVICE_CLIENT_SECRET }}"
#   ./phoenix-rebuild.sh
#
# The phoenix-rebuild.sh will call sync_secrets_from_env automatically.

sync_secrets_from_env() {
    log_secrets_info "Syncing secrets from environment variables to GCP (Gap #41)..."

    local synced=0
    local skipped=0

    # Check each mapped GitHub secret name in environment
    for github_name in "${!GITHUB_TO_GCP_MAP[@]}"; do
        local gcp_name="${GITHUB_TO_GCP_MAP[$github_name]}"
        local env_value="${!github_name:-}"

        if [ -n "$env_value" ]; then
            log_secrets_info "  Syncing $github_name -> $gcp_name"
            if ensure_gcp_secret "$gcp_name" "$env_value"; then
                synced=$((synced + 1))
            fi
        else
            log_secrets_warn "  Skipping $github_name (not in environment)"
            skipped=$((skipped + 1))
        fi
    done

    log_secrets_success "Synced $synced secrets, skipped $skipped"

    if [ $skipped -gt 0 ]; then
        log_secrets_warn "Some secrets were not in environment - they may need manual sync"
        echo ""
        echo "To set missing secrets before Phoenix rebuild:"
        echo "  export GITHUB_SECRET_NAME='secret-value'"
        echo "  # Or sync manually:"
        echo "  source scripts/gcp/lib/secrets.sh"
        echo "  ensure_gcp_secret 'gcp-secret-name' 'value'"
    fi

    return 0
}

# Create mcp-hr-service-client-secret if it doesn't exist (Gap #41 helper)
# This is needed because the secret is created by Terraform but may not have a version
ensure_mcp_hr_client_secret() {
    local project="${GCP_PROJECT_ID:-}"
    local secret_name="mcp-hr-service-client-secret"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    # Check if secret exists
    if ! gcp_secret_exists "$secret_name"; then
        log_secrets_info "Creating $secret_name..."
        local new_secret
        new_secret=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
        ensure_gcp_secret "$secret_name" "$new_secret"
        log_secrets_success "Created $secret_name with random value"
        echo ""
        log_secrets_warn "Remember to sync this value back to GitHub:"
        echo "  gh secret set MCP_HR_SERVICE_CLIENT_SECRET < <(gcloud secrets versions access latest --secret=$secret_name)"
        return 0
    fi

    # Check if secret has any versions
    local version_count
    version_count=$(gcloud secrets versions list "$secret_name" --project="$project" --format="value(name)" 2>/dev/null | wc -l)

    if [ "$version_count" -eq 0 ]; then
        log_secrets_info "$secret_name exists but has no versions - adding one..."
        local new_secret
        new_secret=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
        echo -n "$new_secret" | gcloud secrets versions add "$secret_name" --project="$project" --data-file=-
        log_secrets_success "Added version to $secret_name"
        echo ""
        log_secrets_warn "Remember to sync this value back to GitHub:"
        echo "  gh secret set MCP_HR_SERVICE_CLIENT_SECRET < <(gcloud secrets versions access latest --secret=$secret_name)"
    else
        log_secrets_success "$secret_name already has $version_count version(s)"
    fi

    return 0
}

# =============================================================================
# Gap #102: PROD_USER_PASSWORD Sync (Phoenix Rebuild Lesson)
# =============================================================================
# Terraform creates the prod-user-password secret with a random value.
# After Phoenix rebuild or DR evacuation, corporate users must use the known
# password from GitHub Secrets so operators can log in.
#
# This function syncs PROD_USER_PASSWORD from environment to GCP Secret Manager.
# Used by both phoenix-rebuild.sh and evacuate-region.sh before user provisioning.
# =============================================================================

# Sync PROD_USER_PASSWORD from environment to GCP Secret Manager
# Usage: sync_prod_user_password
#   Reads PROD_USER_PASSWORD from environment variable.
#   Updates the prod-user-password secret in GCP Secret Manager.
#   Returns 0 on success, 1 if password not available.
sync_prod_user_password() {
    local project="${GCP_PROJECT_ID:-${GCP_PROJECT:-}}"
    local secret_name="prod-user-password"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set - cannot sync prod user password"
        return 1
    fi

    log_secrets_info "Syncing PROD_USER_PASSWORD to GCP Secret Manager (Issue #102 fix)..."

    # Check if password is available in environment
    if [ -n "${PROD_USER_PASSWORD:-}" ]; then
        log_secrets_info "PROD_USER_PASSWORD found in environment - updating GCP secret..."
        if ensure_gcp_secret "$secret_name" "$PROD_USER_PASSWORD"; then
            log_secrets_success "prod-user-password updated in GCP Secret Manager"
            return 0
        else
            log_secrets_error "Failed to update prod-user-password in GCP Secret Manager"
            return 1
        fi
    fi

    # Try to check if GitHub secret exists (informational only - can't read values)
    if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
        local gh_has_secret
        gh_has_secret=$(gh secret list --json name -q '.[].name' 2>/dev/null | grep -c "^PROD_USER_PASSWORD$" || echo "0")

        if [ "$gh_has_secret" -gt 0 ]; then
            log_secrets_warn "PROD_USER_PASSWORD exists in GitHub Secrets but not in environment"
            log_secrets_warn "Set PROD_USER_PASSWORD env var before running this script:"
            echo "  export PROD_USER_PASSWORD=\${{ secrets.PROD_USER_PASSWORD }}"
        else
            log_secrets_warn "PROD_USER_PASSWORD not found in GitHub Secrets"
        fi
    else
        log_secrets_warn "PROD_USER_PASSWORD not set in environment"
        log_secrets_warn "Corporate users may get a random Terraform-generated password"
    fi

    log_secrets_warn "To set manually: echo -n 'password' | gcloud secrets versions add $secret_name --data-file=- --project=$project"
    return 1
}

# =============================================================================
# MongoDB URI Secret Management (Gap #32)
# =============================================================================
# The mongodb-uri secret is a global GCP secret that must exist before terraform.
# It contains the MongoDB Atlas connection string and is manually created.
# Both production and DR deployments share this secret.
#
# These functions are used by both phoenix-rebuild.sh and evacuate-region.sh
# to ensure consistent handling of the mongodb-uri secret.
# =============================================================================

# Verify mongodb-uri secret exists (required before terraform)
# Returns 0 if exists, 1 if missing (with helpful error message)
verify_mongodb_uri_secret() {
    local project="${GCP_PROJECT_ID:-$1}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    log_secrets_info "Verifying mongodb-uri secret exists (required for terraform)..."

    local mongodb_secret="${RESOURCE_PREFIX}-mongodb-uri"
    if gcloud secrets describe "$mongodb_secret" --project="$project" &>/dev/null 2>&1; then
        log_secrets_success "MongoDB URI secret exists"
        return 0
    else
        log_secrets_error "MongoDB URI secret '${mongodb_secret}' not found!"
        log_secrets_error "This secret is required for terraform to succeed."
        echo ""
        log_secrets_info "To create it:"
        echo "  gcloud secrets create ${mongodb_secret} --replication-policy=automatic"
        echo "  echo -n 'mongodb+srv://...' | gcloud secrets versions add ${mongodb_secret} --data-file=-"
        echo ""
        log_secrets_info "See scripts/gcp/README.md for full MongoDB Atlas setup instructions."
        return 1
    fi
}

# Add IAM binding for MCP servers to access mongodb-uri secret (Gap #32)
# This is idempotent - safe to call multiple times
ensure_mongodb_uri_iam_binding() {
    local project="${GCP_PROJECT_ID:-$1}"

    if [ -z "$project" ]; then
        log_secrets_error "GCP_PROJECT_ID not set"
        return 1
    fi

    log_secrets_info "Adding MongoDB URI IAM binding (Gap #32)..."
    local sa_name="${GCP_SA_MCP_SERVERS:-${RESOURCE_PREFIX}-mcp-servers}"
    local sa_email="${sa_name}@${project}.iam.gserviceaccount.com"
    local mongodb_secret="${RESOURCE_PREFIX}-mongodb-uri"

    if gcloud secrets describe "$mongodb_secret" --project="$project" &>/dev/null; then
        gcloud secrets add-iam-policy-binding "$mongodb_secret" \
            --member="serviceAccount:${sa_email}" \
            --role="roles/secretmanager.secretAccessor" \
            --project="$project" \
            --quiet 2>/dev/null || log_secrets_info "IAM binding may already exist"
        log_secrets_success "MongoDB URI IAM binding verified"
        return 0
    else
        log_secrets_warn "MongoDB URI secret not found - skipping IAM binding"
        return 1
    fi
}

# =============================================================================
# Gap #60: TOTP Secret Fetching
# =============================================================================
# The test user TOTP secret is stored in GitHub Secrets. This function fetches
# it for use in E2E tests and TOTP configuration.
#
# Used by both phoenix-rebuild.sh and evacuate-region.sh for TOTP setup.
# =============================================================================

# Fetch TOTP secret from environment or GitHub Secrets (Gap #60)
# Usage: fetch_totp_secret [env_var_name]
#   env_var_name: Environment variable to check first (default: TEST_USER_TOTP_SECRET_RAW)
# Returns: TOTP secret in TOTP_SECRET variable, exits 1 if not found
fetch_totp_secret() {
    local env_var="${1:-TEST_USER_TOTP_SECRET_RAW}"
    local secret_value="${!env_var:-}"

    log_secrets_info "Fetching TOTP secret (Gap #60)..."

    # Check environment variable first
    if [ -n "$secret_value" ]; then
        log_secrets_success "TOTP secret found in environment variable: $env_var"
        TOTP_SECRET="$secret_value"
        return 0
    fi

    log_secrets_info "$env_var not set, attempting to fetch from GitHub Secrets..."

    # Try fetching from GitHub using gh CLI
    if ! command -v gh &>/dev/null; then
        log_secrets_error "gh CLI not available and $env_var not set"
        log_secrets_error "Install gh CLI or set $env_var env var"
        return 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_secrets_error "gh CLI not authenticated. Run: gh auth login"
        return 1
    fi

    # Try to get the secret value via workflow dispatch
    # Note: GitHub doesn't expose secret values directly, so we check if it exists
    local secret_exists
    secret_exists=$(gh secret list 2>/dev/null | grep -c "^${env_var}" || echo "0")

    if [ "$secret_exists" -gt 0 ]; then
        log_secrets_warn "Secret $env_var exists in GitHub but cannot be fetched directly"
        log_secrets_info "Pass $env_var as an environment variable when running the script:"
        log_secrets_info "  export $env_var=\${{ secrets.$env_var }}"
        return 1
    else
        log_secrets_error "Secret $env_var not found in GitHub Secrets"
        log_secrets_error "Create it with: gh secret set $env_var"
        return 1
    fi
}

# =============================================================================
# Gap #53: Identity Sync / User Provisioning
# =============================================================================
# Corporate users are provisioned via the provision-prod-users workflow.
# This function triggers that workflow and optionally waits for completion.
#
# Used by both phoenix-rebuild.sh and evacuate-region.sh to provision users.
# =============================================================================

# Bug #32 Fix: Check if provision-users Cloud Run Job exists in the specified region
# Returns 0 if exists, 1 if not
# Usage: check_provision_job_exists <region> [project]
check_provision_job_exists() {
    local region="${1:?Region required}"
    local project="${2:-$GCP_PROJECT}"

    if gcloud run jobs describe provision-users \
        --region="$region" \
        --project="$project" &>/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Trigger identity-sync workflow to provision corporate users (Gap #53)
# Usage: trigger_identity_sync [wait_for_completion] [repo] [action] [force_password_reset] [region] [cloud_sql_instance]
#   wait_for_completion: true/false - whether to wait for workflow (default: true)
#   repo: GitHub repo (default: auto-detect from git remote)
#   action: Action to perform (default: all) - verify-only, load-hr-data, sync-users, all
#   force_password_reset: true/false - reset passwords for existing users (default: false)
#   region: GCP region (optional - defaults to workflow's vars.GCP_REGION)
#   cloud_sql_instance: Cloud SQL instance name (optional - defaults to tamshai-prod-postgres)
#
# Phoenix Rebuild Lesson (Issue #102):
#   After fresh Keycloak deployment, pass force_password_reset=true to ensure
#   corporate users get the known PROD_USER_PASSWORD instead of Keycloak-generated
#   random passwords. The entrypoint.sh runs a two-step process:
#     Step 1: Normal sync (create users)
#     Step 2: Force password reset (set known passwords)
#
# Bug #28 fix: Added region and cloud_sql_instance parameters for DR support
trigger_identity_sync() {
    local wait_for_completion="${1:-true}"
    local repo="${2:-}"
    local action="${3:-all}"
    local force_password_reset="${4:-false}"
    local region="${5:-}"
    local cloud_sql_instance="${6:-}"

    log_secrets_info "Triggering identity-sync workflow (Gap #53)..."
    log_secrets_info "  Action: $action"
    log_secrets_info "  Force password reset: $force_password_reset"
    [ -n "$region" ] && log_secrets_info "  Region: $region"
    [ -n "$cloud_sql_instance" ] && log_secrets_info "  Cloud SQL: $cloud_sql_instance"

    # Bug #32 Fix: Check if provision-users job exists in target region
    local target_region="${region:-${GCP_REGION:-us-central1}}"
    if ! check_provision_job_exists "$target_region"; then
        log_secrets_error "provision-users job not found in $target_region"
        log_secrets_error "BUILD FAILURE: Job must exist before provisioning can run"
        log_secrets_error "Ensure terraform apply included module.security with enable_provision_job=true"
        return 1
    fi

    # Check gh CLI
    if ! command -v gh &>/dev/null; then
        log_secrets_error "gh CLI not available - cannot trigger workflow"
        log_secrets_error "Install gh CLI: https://cli.github.com/"
        return 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_secrets_error "gh CLI not authenticated. Run: gh auth login"
        return 1
    fi

    # Detect repo if not provided
    if [ -z "$repo" ]; then
        repo=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null) || repo=""
        if [ -z "$repo" ]; then
            repo="jcornell3/tamshai-enterprise-ai"
            log_secrets_info "Using default repo: $repo"
        fi
    fi

    # Check if workflow exists using gh workflow view (accepts filenames directly,
    # unlike gh workflow list which returns display names)
    if ! gh workflow view provision-prod-users.yml --repo "$repo" &>/dev/null; then
        log_secrets_warn "provision-prod-users.yml workflow not found"
        log_secrets_info "Attempting to trigger workflow anyway..."
    fi

    # Trigger the workflow with parameters
    # Bug #28 fix: Include region and cloud_sql_instance if provided
    log_secrets_info "Running provision-prod-users workflow..."
    local workflow_args=(
        --repo "$repo"
        --ref main
        -f action="$action"
        -f dry_run=false
        -f force_password_reset="$force_password_reset"
    )
    [ -n "$region" ] && workflow_args+=(-f region="$region")
    [ -n "$cloud_sql_instance" ] && workflow_args+=(-f cloud_sql_instance="$cloud_sql_instance")

    if ! gh workflow run provision-prod-users.yml "${workflow_args[@]}"; then
        log_secrets_error "Could not trigger provision-prod-users workflow"
        return 1
    fi

    if [ "$wait_for_completion" != "true" ]; then
        log_secrets_success "Workflow triggered (not waiting for completion)"
        return 0
    fi

    # Wait for workflow to start and complete
    log_secrets_info "Waiting for workflow to start..."
    sleep 10

    local run_id
    run_id=$(gh run list --repo "$repo" --workflow=provision-prod-users.yml --limit=1 --json databaseId -q '.[0].databaseId' 2>/dev/null)

    if [ -n "$run_id" ]; then
        log_secrets_info "Monitoring workflow run: $run_id"
        if gh run watch "$run_id" --repo "$repo" --exit-status; then
            log_secrets_success "Identity sync completed successfully"
            return 0
        else
            log_secrets_warn "Identity sync workflow failed or timed out"
            log_secrets_info "Check: gh run view $run_id --repo $repo"
            return 1
        fi
    else
        log_secrets_warn "Could not get workflow run ID - check GitHub Actions manually"
        return 1
    fi
}

# =============================================================================
# Gap #102: Sample Data Loading (Phoenix Rebuild Lesson)
# =============================================================================
# After Phoenix rebuild or DR evacuation, Finance/Sales/Support sample data
# must be loaded separately from user provisioning.
#
# This triggers the provision-prod-data.yml workflow which loads:
#   - Finance: Cloud SQL PostgreSQL (via Cloud Run Job with VPC connector)
#   - Sales: MongoDB Atlas (direct from GitHub Actions)
#   - Support: MongoDB Atlas (direct from GitHub Actions)
# =============================================================================

# Trigger sample data loading workflow
# Usage: trigger_sample_data_load [wait_for_completion] [repo] [data_set] [region] [cloud_sql_instance]
#   wait_for_completion: true/false - whether to wait for workflow (default: true)
#   repo: GitHub repo (default: auto-detect from git remote)
#   data_set: Data to load (default: all) - all, finance, sales, support
#   region: GCP region (optional - defaults to workflow's vars.GCP_REGION)
#   cloud_sql_instance: Cloud SQL instance name (optional - defaults to tamshai-prod-postgres)
#
# Bug #28 fix: Added region and cloud_sql_instance parameters for DR support
trigger_sample_data_load() {
    local wait_for_completion="${1:-true}"
    local repo="${2:-}"
    local data_set="${3:-all}"
    local region="${4:-}"
    local cloud_sql_instance="${5:-}"

    log_secrets_info "Triggering sample data load workflow (Issue #102 fix)..."
    log_secrets_info "  Data set: $data_set"
    [ -n "$region" ] && log_secrets_info "  Region: $region"
    [ -n "$cloud_sql_instance" ] && log_secrets_info "  Cloud SQL: $cloud_sql_instance"

    # Bug #32 Fix: Check if provision-users job exists in target region
    local target_region="${region:-${GCP_REGION:-us-central1}}"
    if ! check_provision_job_exists "$target_region"; then
        log_secrets_error "provision-users job not found in $target_region"
        log_secrets_error "BUILD FAILURE: Job must exist before data loading can run"
        log_secrets_error "Ensure terraform apply included module.security with enable_provision_job=true"
        return 1
    fi

    # Check gh CLI
    if ! command -v gh &>/dev/null; then
        log_secrets_error "gh CLI not available - cannot trigger workflow"
        return 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_secrets_error "gh CLI not authenticated. Run: gh auth login"
        return 1
    fi

    # Detect repo if not provided
    if [ -z "$repo" ]; then
        repo=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null) || repo=""
        if [ -z "$repo" ]; then
            repo="jcornell3/tamshai-enterprise-ai"
            log_secrets_info "Using default repo: $repo"
        fi
    fi

    # Check if workflow exists using gh workflow view (accepts filenames directly,
    # unlike gh workflow list which returns display names)
    if ! gh workflow view provision-prod-data.yml --repo "$repo" &>/dev/null; then
        log_secrets_warn "provision-prod-data.yml workflow not found"
        log_secrets_info "Attempting to trigger workflow anyway..."
    fi

    # Trigger the workflow with parameters
    # Bug #28 fix: Include region and cloud_sql_instance if provided
    log_secrets_info "Running provision-prod-data workflow (data_set=$data_set)..."
    local workflow_args=(
        --repo "$repo"
        --ref main
        -f data_set="$data_set"
        -f dry_run=false
    )
    [ -n "$region" ] && workflow_args+=(-f region="$region")
    [ -n "$cloud_sql_instance" ] && workflow_args+=(-f cloud_sql_instance="$cloud_sql_instance")

    if ! gh workflow run provision-prod-data.yml "${workflow_args[@]}"; then
        log_secrets_error "Could not trigger provision-prod-data workflow"
        return 1
    fi

    if [ "$wait_for_completion" != "true" ]; then
        log_secrets_success "Data load workflow triggered (not waiting for completion)"
        return 0
    fi

    # Wait for workflow to start and complete
    log_secrets_info "Waiting for data load workflow to start..."
    sleep 10

    local run_id
    run_id=$(gh run list --repo "$repo" --workflow=provision-prod-data.yml --limit=1 --json databaseId -q '.[0].databaseId' 2>/dev/null)

    if [ -n "$run_id" ]; then
        log_secrets_info "Monitoring data load workflow run: $run_id"
        if gh run watch "$run_id" --repo "$repo" --exit-status; then
            log_secrets_success "Sample data loaded successfully"
            return 0
        else
            log_secrets_warn "Sample data loading workflow failed or timed out"
            log_secrets_info "Check: gh run view $run_id --repo $repo"
            return 1
        fi
    else
        log_secrets_warn "Could not get workflow run ID - check GitHub Actions manually"
        return 1
    fi
}

echo "[secrets] Library loaded (RESOURCE_PREFIX=$RESOURCE_PREFIX)"
