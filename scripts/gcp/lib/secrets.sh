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

set -euo pipefail

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

# Required GCP secrets for Phoenix rebuild
REQUIRED_GCP_SECRETS=(
    "tamshai-prod-anthropic-api-key"
    "tamshai-prod-db-password"
    "tamshai-prod-keycloak-admin-password"
    "tamshai-prod-keycloak-db-password"
    "tamshai-prod-mongodb-uri"
    "mcp-hr-service-client-secret"
)

# GitHub to GCP secret name mapping
declare -A GITHUB_TO_GCP_MAP=(
    ["CLAUDE_API_KEY_PROD"]="tamshai-prod-anthropic-api-key"
    ["PROD_DB_PASSWORD"]="tamshai-prod-db-password"
    ["KEYCLOAK_ADMIN_PASSWORD_PROD"]="tamshai-prod-keycloak-admin-password"
    ["KEYCLOAK_DB_PASSWORD_PROD"]="tamshai-prod-keycloak-db-password"
    ["MONGODB_URI_PROD"]="tamshai-prod-mongodb-uri"
    ["MCP_HR_SERVICE_CLIENT_SECRET"]="mcp-hr-service-client-secret"
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

echo "[secrets] Library loaded"
