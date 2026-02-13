#!/usr/bin/env bash
#
# Sanitize Documentation Secrets
# Purpose: Replace example secrets in documentation with placeholders
# Usage: ./scripts/security/sanitize-docs.sh [--dry-run]
#
# Exit codes:
#   0 - Success
#   1 - Failure
#   2 - Script error
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# shellcheck disable=SC2317
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
# shellcheck disable=SC2317
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
# shellcheck disable=SC2317
log_warning() { echo -e "${YELLOW}[WARN]${NC} $*"; }
# shellcheck disable=SC2317
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

FILES_CHANGED=0

sanitize_file() {
    local file=$1
    local description=$2

    if [ ! -f "$file" ]; then
        log_warning "File not found: $file"
        return
    fi

    log_info "Sanitizing: $file"
    log_info "  $description"

    if $DRY_RUN; then
        echo "  [DRY RUN] Would sanitize this file"
        return
    fi

    # Create backup
    cp "$file" "$file.bak"

    # Apply sanitizations (will be defined below for each file)
    local changes_made=false

    # Add inline allowlist comments for example secrets
    # This allows detect-secrets to ignore these lines

    case "$file" in
        *VAULT_SETUP.md)
            # Documentation already uses GitHub Secrets references:
            # - ${DB_PASSWORD} (GitHub Secret: DB_PASSWORD)
            # - ${KEYCLOAK_CLIENT_SECRET} (GitHub Secret: KEYCLOAK_CLIENT_SECRET)
            # - ${CLAUDE_API_KEY} (GitHub Secret: CLAUDE_API_KEY)
            # - ${PINECONE_API_KEY} (GitHub Secret: PINECONE_API_KEY)
            # - ${VAULT_DB_PASSWORD} (GitHub Secret: VAULT_DB_PASSWORD)
            # - ${VAULT_ADMIN_PASSWORD} (GitHub Secret: VAULT_ADMIN_PASSWORD)
            # No sanitization needed - file already references GitHub Secrets
            log_info "  Already using GitHub Secrets references"
            ;;
    esac

    if $changes_made; then
        log_success "  Sanitized!"
        FILES_CHANGED=$((FILES_CHANGED + 1))
    else
        # Restore from backup if no changes
        mv "$file.bak" "$file"
        log_info "  No changes needed"
    fi
}

echo "========================================"
echo "Documentation Secret Sanitization"
echo "========================================"
echo ""

if $DRY_RUN; then
    log_warning "DRY RUN MODE - No files will be modified"
    echo ""
fi

# Sanitize documentation files
log_info "Starting documentation sanitization..."
echo ""

# Vault setup guide
sanitize_file "${REPO_ROOT}/docs/deployment/VAULT_SETUP.md" \
    "Replace Vault example secrets with environment variable placeholders"

# Add more files as needed
# sanitize_file "${REPO_ROOT}/docs/testing/E2E_USER_TESTS.md" \
#     "Replace test credentials with placeholders"

echo ""
log_success "Sanitization complete!"
echo ""
echo "Files modified: $FILES_CHANGED"
echo ""

if ! $DRY_RUN && [ $FILES_CHANGED -gt 0 ]; then
    log_info "Backup files created with .bak extension"
    log_info "To restore: find docs -name '*.bak' -exec bash -c 'mv \"\$1\" \"\${1%.bak}\"' _ {} \\;"
fi

exit 0
