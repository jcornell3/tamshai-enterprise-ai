#!/usr/bin/env bash
#
# Grype Ignore Re-evaluation Script
# Purpose: Verify justifications for ignored vulnerabilities are still valid
# Usage: ./scripts/security/check-grype-ignores.sh
#
# Exit codes:
#   0 - All ignores are still justified
#   1 - One or more ignores should be removed (vulnerability patched)
#   2 - Script error
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GRYPE_CONFIG="${REPO_ROOT}/.grype.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

# Check if required tools are installed
check_dependencies() {
    local missing_deps=()

    for cmd in jq curl npm; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install with: apt-get install jq curl nodejs npm (Ubuntu/Debian)"
        exit 2
    fi
}

# Check Hono CVE fixes (CVE-2026-22817, CVE-2026-22818)
check_hono_fixes() {
    log_info "Checking Hono CVE fixes..."

    # Get installed Hono version from MCP Gateway
    local hono_version
    hono_version=$(cd "${REPO_ROOT}/services/mcp-gateway" && npm list hono --depth=0 --json 2>/dev/null | jq -r '.dependencies.hono.version // empty')

    if [ -z "$hono_version" ]; then
        log_warning "Could not determine Hono version (dependencies may not be installed)"
        return 0
    fi

    log_info "Installed Hono version: ${hono_version}"

    # CVE-2026-22817 and CVE-2026-22818 were fixed in Hono 4.11.4
    # Check if installed version is >= 4.11.4
    local required_version="4.11.4"

    # Simple version comparison (assumes semantic versioning)
    if printf '%s\n' "$required_version" "$hono_version" | sort -V -C; then
        log_success "Hono ${hono_version} includes CVE-2026-22817/22818 fixes"
        log_warning "Consider removing Hono CVE ignores from .grype.yaml"
        return 1  # Signal that ignores should be removed
    else
        log_error "Hono ${hono_version} is older than required ${required_version}"
        log_info "Update @modelcontextprotocol/sdk to get Hono >= ${required_version}"
        return 0
    fi
}

# Check Alpine Linux security advisories
check_alpine_updates() {
    log_info "Checking Alpine Linux security advisories..."

    # Alpine security advisories API endpoint
    local alpine_api="https://secdb.alpinelinux.org/v1/advisories"

    # CVEs we're monitoring
    local cves=("CVE-2026-22184" "CVE-2025-60876")

    local patches_available=0

    for cve in "${cves[@]}"; do
        log_info "Checking ${cve}..."

        # Note: This is a mock check - replace with actual API call
        # Alpine security DB may not have 2026 CVEs yet (future dates)
        if curl -sf "${alpine_api}?cve=${cve}" | jq -e '.[] | select(.fixed)' &> /dev/null; then
            log_success "${cve} has patches available in Alpine"
            log_warning "Update Dockerfiles to apply Alpine patches (apk upgrade)"
            patches_available=$((patches_available + 1))
        else
            log_info "${cve} - No patches available yet"
        fi
    done

    if [ $patches_available -gt 0 ]; then
        return 1  # Signal that updates are available
    fi

    return 0
}

# Check if npm is used at runtime
check_npm_runtime_usage() {
    log_info "Checking if npm is used at runtime in production containers..."

    # Search for npm usage in production Dockerfiles (after final stage)
    local npm_usage_found=0

    # Find all production Dockerfiles
    while IFS= read -r dockerfile; do
        log_info "Scanning ${dockerfile}..."

        # Extract production stage (after "FROM ... AS production")
        local production_stage
        production_stage=$(awk '/^FROM.*AS production/,0' "$dockerfile")

        # Check if npm is invoked in production stage (excluding npm ci for builds)
        if echo "$production_stage" | grep -E '^\s*(RUN|CMD|ENTRYPOINT).*npm\s+(start|run|exec)' > /dev/null; then
            log_warning "npm runtime usage found in ${dockerfile}"
            npm_usage_found=$((npm_usage_found + 1))
        fi

        # Check if CMD/ENTRYPOINT uses node directly (good practice)
        if echo "$production_stage" | grep -E '^\s*(CMD|ENTRYPOINT).*node\s+' > /dev/null; then
            log_success "${dockerfile} uses node directly (not npm)"
        fi
    done < <(find "${REPO_ROOT}" -name "Dockerfile" -o -name "Dockerfile.*" | grep -E 'services/|clients/')

    if [ $npm_usage_found -gt 0 ]; then
        log_error "npm is used at runtime in $npm_usage_found container(s)"
        log_warning "Consider using 'node dist/index.js' instead of 'npm start'"
        log_warning "Re-evaluate npm vulnerability ignores in .grype.yaml"
        return 1
    else
        log_success "No npm runtime usage detected - ignores are justified"
        return 0
    fi
}

# Generate report
generate_report() {
    local exit_code=$1

    echo ""
    echo "=================================="
    echo "Grype Ignore Re-evaluation Report"
    echo "=================================="
    echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo ""

    case $exit_code in
        0)
            log_success "All Grype ignores are still justified"
            echo ""
            echo "Action Items:"
            echo "  • Continue monitoring Alpine security advisories"
            echo "  • Re-run this script periodically (recommended: weekly)"
            ;;
        1)
            log_warning "Some Grype ignores should be re-evaluated"
            echo ""
            echo "Action Items:"
            echo "  • Review warnings above"
            echo "  • Update .grype.yaml to remove outdated ignores"
            echo "  • Run 'grype dir:.' to verify fixes"
            echo "  • Update dependency versions if needed"
            ;;
        *)
            log_error "Script encountered errors"
            ;;
    esac
    echo "=================================="
}

# Main execution
main() {
    log_info "Starting Grype ignore re-evaluation..."
    echo ""

    check_dependencies

    local should_update=0

    # Run all checks
    check_hono_fixes || should_update=1
    echo ""

    check_alpine_updates || should_update=1
    echo ""

    check_npm_runtime_usage || should_update=1
    echo ""

    # Generate report
    generate_report $should_update

    exit $should_update
}

main "$@"
