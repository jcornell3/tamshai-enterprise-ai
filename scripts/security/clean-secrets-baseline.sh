#!/usr/bin/env bash
#
# Clean Secrets Baseline - Remove Build Artifacts
# Purpose: Remove build artifacts and false positives from .secrets.baseline
# Usage: ./scripts/security/clean-secrets-baseline.sh
#
# Exit codes:
#   0 - Success
#   1 - Failure
#   2 - Script error
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BASELINE_FILE="${REPO_ROOT}/.secrets.baseline"
BACKUP_FILE="${BASELINE_FILE}.backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# shellcheck disable=SC2317
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

# shellcheck disable=SC2317
log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

# shellcheck disable=SC2317
log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

# shellcheck disable=SC2317
log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    log_info "Install with: apt-get install jq (Ubuntu/Debian) or brew install jq (macOS)"
    exit 2
fi

# Backup current baseline
log_info "Creating backup of .secrets.baseline..."
cp "${BASELINE_FILE}" "${BACKUP_FILE}"
log_success "Backup created: ${BACKUP_FILE}"

# Get file counts before cleanup
TOTAL_FILES_BEFORE=$(jq -r '.results | keys | length' "${BASELINE_FILE}")
TOTAL_SECRETS_BEFORE=$(jq -r '[.results | to_entries | .[].value | length] | add' "${BASELINE_FILE}")

log_info "Current state:"
log_info "  Files: ${TOTAL_FILES_BEFORE}"
log_info "  Secrets: ${TOTAL_SECRETS_BEFORE}"
echo ""

# Patterns to remove (build artifacts and false positives)
log_info "Removing build artifacts and false positives..."

# Create list of patterns to exclude
# shellcheck disable=SC2034
EXCLUDE_PATTERNS=(
    'tsbuildinfo'
    '.turbo/cache'
    'tests/performance/.*-results\.json'
    'tests/performance/summary\.json'
    '\.metadata'
    '\.xcscheme'
    '-meta\.json'
)

# Build jq filter to remove excluded patterns
JQ_FILTER='
  .results | to_entries |
  map(
    select(
      .key |
      (test("tsbuildinfo") or
       test("\\\\.turbo/cache") or
       test("tests/performance/.*-results\\\\.json") or
       test("tests/performance/summary\\\\.json") or
       test("\\\\.metadata$") or
       test("\\\\.xcscheme$") or
       test("-meta\\\\.json$")) | not
    )
  ) |
  from_entries
'

# Create new baseline with filtered results
jq ".results = (${JQ_FILTER})" "${BASELINE_FILE}" > "${BASELINE_FILE}.tmp"
mv "${BASELINE_FILE}.tmp" "${BASELINE_FILE}"

# Get file counts after cleanup
TOTAL_FILES_AFTER=$(jq -r '.results | keys | length' "${BASELINE_FILE}")
TOTAL_SECRETS_AFTER=$(jq -r '[.results | to_entries | .[].value | length] | add // 0' "${BASELINE_FILE}")

REMOVED_FILES=$((TOTAL_FILES_BEFORE - TOTAL_FILES_AFTER))
REMOVED_SECRETS=$((TOTAL_SECRETS_BEFORE - TOTAL_SECRETS_AFTER))

echo ""
log_success "Cleanup complete!"
echo ""
echo "==================================="
echo "Secrets Baseline Cleanup Summary"
echo "==================================="
echo ""
echo "Before:"
echo "  Files:   ${TOTAL_FILES_BEFORE}"
echo "  Secrets: ${TOTAL_SECRETS_BEFORE}"
echo ""
echo "After:"
echo "  Files:   ${TOTAL_FILES_AFTER}"
echo "  Secrets: ${TOTAL_SECRETS_AFTER}"
echo ""
echo "Removed:"
echo "  Files:   ${REMOVED_FILES} (-$((REMOVED_FILES * 100 / TOTAL_FILES_BEFORE))%)"
echo "  Secrets: ${REMOVED_SECRETS} (-$((REMOVED_SECRETS * 100 / TOTAL_SECRETS_BEFORE))%)"
echo "==================================="
echo ""

# Show top remaining files by secret count
echo "Top 10 files with most secrets (remaining):"
jq -r '.results | to_entries | map("\(.value | length)\t\(.key)") | .[]' "${BASELINE_FILE}" | \
    sort -rn | head -10 | awk '{printf "  %3d  %s\n", $1, $2}'
echo ""

log_info "Backup file: ${BACKUP_FILE}"
log_info "To restore: mv ${BACKUP_FILE} ${BASELINE_FILE}"
echo ""

exit 0
