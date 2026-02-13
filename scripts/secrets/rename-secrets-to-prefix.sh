#!/bin/bash
# =============================================================================
# Rename GitHub Secrets to DEV_ Prefix Convention
# =============================================================================
#
# This script renames GitHub secrets from the old naming convention to the
# new environment-specific prefix convention (DEV_*, STAGE_*, PROD_*).
#
# Usage:
#   ./rename-secrets-to-prefix.sh [--dry-run] [--delete-old]
#
# Options:
#   --dry-run     Show what would be done without making changes
#   --delete-old  Delete old secrets after creating new ones
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated
#   - Repository access with secrets write permission
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Options
DRY_RUN=false
DELETE_OLD=false

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --delete-old) DELETE_OLD=true; shift ;;
        --help|-h)
            head -20 "$0" | tail -15
            exit 0
            ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Check prerequisites
check_prerequisites() {
    log_header "Checking Prerequisites"

    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) not installed"
        exit 1
    fi
    log_info "GitHub CLI found"

    if ! gh auth status &>/dev/null 2>&1; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi
    log_info "GitHub CLI authenticated"
}

# Get secret value by triggering workflow and downloading artifact
get_secret_value() {
    local secret_name="$1"
    local temp_dir="$2"

    if [ -f "$temp_dir/$secret_name" ]; then
        cat "$temp_dir/$secret_name" | tr -d '\n\r'
    else
        echo ""
    fi
}

# Rename mapping: OLD_NAME -> NEW_NAME
declare -A RENAME_MAP=(
    # Keycloak
    ["KEYCLOAK_DEV_ADMIN_PASSWORD"]="DEV_KEYCLOAK_ADMIN_PASSWORD"
    ["KEYCLOAK_DB_DEV_PASSWORD"]="DEV_KEYCLOAK_DB_PASSWORD"

    # Databases
    ["MONGODB_DEV_PASSWORD"]="DEV_MONGODB_PASSWORD"
    ["POSTGRES_DEV_PASSWORD"]="DEV_POSTGRES_PASSWORD"
    ["TAMSHAI_DB_DEV_PASSWORD"]="DEV_TAMSHAI_DB_PASSWORD"
    ["REDIS_DEV_PASSWORD"]="DEV_REDIS_PASSWORD"

    # Vault
    ["VAULT_DEV_ROOT_TOKEN"]="DEV_VAULT_ROOT_TOKEN"

    # MCP Secrets
    ["MCP_GATEWAY_CLIENT_SECRET"]="DEV_MCP_GATEWAY_CLIENT_SECRET"
    ["MCP_HR_SERVICE_CLIENT_SECRET"]="DEV_MCP_HR_SERVICE_CLIENT_SECRET"
    ["MCP_INTERNAL_SECRET"]="DEV_MCP_INTERNAL_SECRET"
    ["MCP_UI_CLIENT_SECRET"]="DEV_MCP_UI_CLIENT_SECRET"

    # Other services
    ["E2E_ADMIN_API_KEY"]="DEV_E2E_ADMIN_API_KEY"
    ["ELASTIC_PASSWORD"]="DEV_ELASTIC_PASSWORD"
    ["MINIO_ROOT_USER"]="DEV_MINIO_ROOT_USER"
    ["MINIO_ROOT_PASSWORD"]="DEV_MINIO_ROOT_PASSWORD"

    # API Keys
    ["GEMINI_API_KEY"]="DEV_GEMINI_API_KEY"
    ["CLAUDE_API_KEY"]="DEV_CLAUDE_API_KEY"
)

# Main function
main() {
    log_header "GitHub Secrets Rename Script"
    echo "Mode: $([ "$DRY_RUN" = true ] && echo "DRY RUN" || echo "LIVE")"
    echo "Delete old: $([ "$DELETE_OLD" = true ] && echo "YES" || echo "NO")"
    echo ""

    check_prerequisites

    # Get list of existing secrets
    log_header "Fetching Existing Secrets"
    local existing_secrets
    existing_secrets=$(gh secret list --json name -q '.[].name' 2>/dev/null || echo "")

    if [ -z "$existing_secrets" ]; then
        log_error "Could not fetch secrets list"
        exit 1
    fi

    echo "Found $(echo "$existing_secrets" | wc -l) secrets"

    # Process each rename
    log_header "Processing Renames"

    local renamed=0
    local skipped=0
    local already_exists=0

    for old_name in "${!RENAME_MAP[@]}"; do
        local new_name="${RENAME_MAP[$old_name]}"

        # Check if old secret exists
        if ! echo "$existing_secrets" | grep -q "^${old_name}$"; then
            log_warn "OLD secret not found: $old_name (skipping)"
            skipped=$((skipped + 1))
            continue
        fi

        # Check if new secret already exists
        if echo "$existing_secrets" | grep -q "^${new_name}$"; then
            log_info "NEW secret already exists: $new_name (skipping)"
            already_exists=$((already_exists + 1))
            continue
        fi

        echo ""
        log_info "Renaming: $old_name -> $new_name"

        if [ "$DRY_RUN" = true ]; then
            echo "  [DRY-RUN] Would copy $old_name to $new_name"
            if [ "$DELETE_OLD" = true ]; then
                echo "  [DRY-RUN] Would delete $old_name"
            fi
        else
            # We can't read secret values directly, so we need user input
            echo "  Enter the value for $old_name (or press Enter to skip):"
            read -rs secret_value

            if [ -z "$secret_value" ]; then
                log_warn "  Skipped (no value provided)"
                skipped=$((skipped + 1))
                continue
            fi

            # Create new secret
            echo "$secret_value" | gh secret set "$new_name"
            log_info "  Created: $new_name"

            # Optionally delete old secret
            if [ "$DELETE_OLD" = true ]; then
                gh secret delete "$old_name" --yes 2>/dev/null || true
                log_info "  Deleted: $old_name"
            fi

            renamed=$((renamed + 1))
        fi
    done

    # Summary
    log_header "Summary"
    echo "Renamed: $renamed"
    echo "Skipped: $skipped"
    echo "Already exists: $already_exists"

    if [ "$DRY_RUN" = true ]; then
        echo ""
        log_warn "This was a dry run. No changes were made."
        log_info "Run without --dry-run to apply changes."
    fi

    # Show remaining secrets that need manual attention
    log_header "Manual Steps Required"
    echo ""
    echo "Since GitHub doesn't allow reading secret values directly,"
    echo "you need to manually copy values for each secret."
    echo ""
    echo "Quick commands to create new secrets (copy value from old):"
    echo ""

    for old_name in "${!RENAME_MAP[@]}"; do
        local new_name="${RENAME_MAP[$old_name]}"
        if echo "$existing_secrets" | grep -q "^${old_name}$"; then
            if ! echo "$existing_secrets" | grep -q "^${new_name}$"; then
                echo "# $old_name -> $new_name"
                echo "gh secret set $new_name"
                echo ""
            fi
        fi
    done
}

main "$@"
