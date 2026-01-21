#!/bin/bash
# =============================================================================
# Phoenix Rebuild Pre-flight Checks
# =============================================================================
#
# Validates all prerequisites before starting a Phoenix rebuild.
# Run this BEFORE any destructive operations to catch issues early.
#
# Checks:
#   1. GitHub secrets exist and are accessible
#   2. GCP secrets exist in Secret Manager
#   3. DNS records are correctly configured
#   4. Container images exist in Artifact Registry
#   5. Secret hygiene (no trailing whitespace - Issue #25)
#   6. Required tools are installed
#
# Usage:
#   ./phoenix-preflight.sh [--verbose] [--fix]
#
# Options:
#   --verbose    Show detailed output
#   --fix        Attempt to fix issues (where possible)
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#
# =============================================================================

# Issue #16/#26: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source libraries
source "$SCRIPT_DIR/lib/secrets.sh"
source "$SCRIPT_DIR/lib/health-checks.sh"
source "$SCRIPT_DIR/lib/dynamic-urls.sh"

# Options
VERBOSE=false
FIX_ISSUES=false

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --verbose|-v) VERBOSE=true; shift ;;
        --fix) FIX_ISSUES=true; shift ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_section() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"; }
log_check() { echo -e "${BLUE}[CHECK]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC}  $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC}  $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC}  $1"; }

# Track failures
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

check() {
    local name="$1"
    local result="$2"

    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    if [ "$result" = "0" ]; then
        log_pass "$name"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        log_fail "$name"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

warn() {
    local name="$1"
    log_warn "$name"
    WARNINGS=$((WARNINGS + 1))
}

# =============================================================================
# Check 1: Required Tools
# =============================================================================
check_required_tools() {
    log_section "1. Required Tools"

    local tools=("gcloud" "gh" "terraform" "curl" "jq" "docker")
    local missing=0

    for tool in "${tools[@]}"; do
        log_check "$tool installed"
        if command -v "$tool" &>/dev/null; then
            check "$tool installed" 0
        else
            check "$tool installed" 1
            missing=$((missing + 1))
        fi
    done

    return $missing
}

# =============================================================================
# Check 2: GCP Authentication
# =============================================================================
check_gcp_auth() {
    log_section "2. GCP Authentication"

    log_check "gcloud authenticated"
    # Use gcloud config get-value account - works reliably with both interactive logins
    # and service accounts (gcloud auth list --filter can fail with service accounts)
    #
    # Note: Temporarily disable 'set -u' because gcloud wrapper script uses
    # CLOUDSDK_PYTHON without checking if it's set, causing "unbound variable" error
    local account=""
    set +u  # Disable unbound variable check for gcloud
    account=$(gcloud config get-value account 2>/dev/null || true)
    set -u  # Re-enable unbound variable check

    # Check if account contains @ (indicating valid email format)
    # Use [[ ]] with pattern matching to avoid pipefail issues with grep
    if [[ -n "$account" && "$account" == *"@"* ]]; then
        check "gcloud authenticated as $account" 0
    else
        # Fallback: try gcloud auth list for edge cases
        set +u
        account=$(gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | head -1 || true)
        set -u
        if [[ -n "$account" && "$account" == *"@"* ]]; then
            check "gcloud authenticated as $account" 0
        else
            check "gcloud authenticated" 1
            return 1
        fi
    fi

    log_check "GCP project configured"
    local project=""
    set +u  # Disable unbound variable check for gcloud
    project=$(gcloud config get-value project 2>/dev/null || true)
    set -u  # Re-enable unbound variable check
    if [[ -n "$project" ]]; then
        check "GCP project: $project" 0
        export GCP_PROJECT_ID="$project"
    else
        check "GCP project configured" 1
        return 1
    fi

    return 0
}

# =============================================================================
# Check 3: GitHub CLI
# =============================================================================
check_github_cli() {
    log_section "3. GitHub CLI Authentication"

    log_check "gh CLI authenticated"
    if gh auth status &>/dev/null; then
        check "gh CLI authenticated" 0
    else
        check "gh CLI authenticated" 1
        echo "    Run: gh auth login"
        return 1
    fi

    log_check "Repository access"
    if gh repo view &>/dev/null; then
        check "Repository accessible" 0
    else
        check "Repository accessible" 1
        return 1
    fi

    return 0
}

# =============================================================================
# Check 4: GitHub Secrets
# =============================================================================
check_github_secrets() {
    log_section "4. GitHub Secrets"

    local required_secrets=(
        "GCP_SA_KEY_PROD"
        "GCP_PROJECT_ID"
        "TEST_USER_PASSWORD"
        "TEST_USER_TOTP_SECRET_RAW"
        "CLAUDE_API_KEY_PROD"
    )

    local missing=0

    # Get list of secrets (names only - values are hidden)
    local existing_secrets
    existing_secrets=$(gh secret list --json name -q '.[].name' 2>/dev/null) || existing_secrets=""

    for secret in "${required_secrets[@]}"; do
        log_check "GitHub secret: $secret"
        if echo "$existing_secrets" | grep -q "^${secret}$"; then
            check "GitHub secret: $secret exists" 0
        else
            check "GitHub secret: $secret" 1
            missing=$((missing + 1))
        fi
    done

    return $missing
}

# =============================================================================
# Check 5: GCP Secrets
# =============================================================================
check_gcp_secrets() {
    log_section "5. GCP Secret Manager"

    local project="${GCP_PROJECT_ID:-}"

    if [ -z "$project" ]; then
        log_fail "GCP_PROJECT_ID not set"
        return 1
    fi

    local missing=0
    local found=0

    for secret_name in "${REQUIRED_GCP_SECRETS[@]}"; do
        log_check "GCP secret: $secret_name"
        if gcp_secret_exists "$secret_name"; then
            check "GCP secret: $secret_name exists" 0
            found=$((found + 1))
        else
            # Issue #12: GCP secrets are created by Terraform during Phoenix rebuild
            # Missing secrets are expected for fresh rebuilds - use warn, not fail
            warn "GCP secret: $secret_name will be created by Terraform"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -gt 0 ]; then
        log_info "$missing GCP secrets will be created during Phase 2 (secret sync) and Phase 5 (Terraform apply)"
    fi

    return 0  # Not a blocking failure - secrets are created during rebuild
}

# =============================================================================
# Check 6: Secret Hygiene (Issue #25)
# =============================================================================
check_secret_hygiene() {
    log_section "6. Secret Hygiene (Issue #25)"

    local issues=0

    for secret_name in "${REQUIRED_GCP_SECRETS[@]}"; do
        log_check "Secret hygiene: $secret_name"

        if ! gcp_secret_exists "$secret_name"; then
            warn "Secret not found, skipping hygiene check: $secret_name"
            continue
        fi

        local value
        value=$(get_gcp_secret "$secret_name" 2>/dev/null) || {
            warn "Could not access secret: $secret_name"
            continue
        }

        local clean_value
        clean_value=$(sanitize_secret "$value")

        if [ "$value" = "$clean_value" ]; then
            check "Secret hygiene: $secret_name is clean" 0
        else
            check "Secret hygiene: $secret_name has trailing whitespace" 1
            echo "    Original: ${#value} chars, Clean: ${#clean_value} chars"
            issues=$((issues + 1))

            if [ "$FIX_ISSUES" = true ]; then
                log_info "Fixing: $secret_name"
                ensure_gcp_secret "$secret_name" "$clean_value"
            fi
        fi
    done

    return $issues
}

# =============================================================================
# Check 7: DNS Configuration
# =============================================================================
check_dns() {
    log_section "7. DNS Configuration"

    # Issue #12: DNS is managed by Cloudflare, which proxies to Cloud Run.
    # During Phoenix rebuild, Cloud Run services don't exist yet, so DNS won't resolve.
    # We check if Cloudflare is configured (CNAME exists), not if the endpoint responds.

    # Check auth.tamshai.com points to Google/Cloudflare
    log_check "DNS: auth.tamshai.com -> Google/Cloudflare"

    local auth_cname
    auth_cname=$(dig +short auth.tamshai.com CNAME 2>/dev/null) || auth_cname=""

    if echo "$auth_cname" | grep -qi "ghs.googlehosted.com\|run.app"; then
        check "DNS: auth.tamshai.com resolves to Google" 0
    elif [ -n "$auth_cname" ]; then
        # Has a CNAME - likely Cloudflare proxy
        check "DNS: auth.tamshai.com has CNAME: $auth_cname" 0
    else
        # May be an A record (Cloudflare proxied)
        local auth_ip
        auth_ip=$(dig +short auth.tamshai.com A 2>/dev/null) || auth_ip=""
        if [ -n "$auth_ip" ]; then
            # A record exists (likely Cloudflare proxy IP)
            check "DNS: auth.tamshai.com has A record: $auth_ip (Cloudflare proxied)" 0
        else
            # No DNS record at all - this IS a problem
            warn "DNS: auth.tamshai.com has no DNS record - configure in Cloudflare"
        fi
    fi

    # Check prod.tamshai.com
    log_check "DNS: prod.tamshai.com"
    local prod_record
    prod_record=$(dig +short prod.tamshai.com 2>/dev/null | head -1) || prod_record=""
    if [ -n "$prod_record" ]; then
        check "DNS: prod.tamshai.com resolves to $prod_record" 0
    else
        warn "DNS: prod.tamshai.com may not be configured in Cloudflare"
    fi

    return 0
}

# =============================================================================
# Check 8: Artifact Registry Images
# =============================================================================
check_artifact_registry() {
    log_section "8. Artifact Registry Images"

    local project="${GCP_PROJECT_ID:-}"
    local region="${GCP_REGION}"
    local repo="tamshai"

    if [ -z "$project" ]; then
        log_fail "GCP_PROJECT_ID not set"
        return 1
    fi

    local required_images=(
        "mcp-gateway"
        "mcp-hr"
        "mcp-finance"
        "mcp-sales"
        "mcp-support"
        "keycloak"
        "web-portal"
    )

    local missing=0
    local found=0

    for image in "${required_images[@]}"; do
        log_check "Image: $image"

        if gcloud artifacts docker images list "${region}-docker.pkg.dev/${project}/${repo}/${image}" \
            --limit=1 --format="value(package)" 2>/dev/null | grep -q "$image"; then
            check "Image: $image exists" 0
            found=$((found + 1))
        else
            # Issue #12: Images are built during Phase 6 of Phoenix rebuild
            # Missing images are expected for fresh rebuilds - use warn, not fail
            warn "Image: $image will be built in Phase 6"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -gt 0 ]; then
        log_info "$missing images will be built during Phase 6 (Build Container Images)"
    fi

    return 0  # Images will be built, so not a blocking failure
}

# =============================================================================
# Check 9: Terraform State
# =============================================================================
check_terraform() {
    log_section "9. Terraform Configuration"

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"

    log_check "Terraform directory exists"
    if [ -d "$tf_dir" ]; then
        check "Terraform directory: $tf_dir" 0
    else
        check "Terraform directory: $tf_dir" 1
        return 1
    fi

    log_check "Terraform initialized"
    if [ -d "$tf_dir/.terraform" ]; then
        check "Terraform initialized" 0
    else
        warn "Terraform not initialized (run: cd $tf_dir && terraform init)"
    fi

    log_check "terraform.tfvars exists"
    if [ -f "$tf_dir/terraform.tfvars" ]; then
        check "terraform.tfvars exists" 0
    else
        warn "terraform.tfvars not found (may use defaults)"
    fi

    return 0
}

# =============================================================================
# Check 10: Current Service Status (informational)
# =============================================================================
check_current_status() {
    log_section "10. Current Service Status (Informational)"

    log_info "Checking if services currently exist..."

    local services=("keycloak" "mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "web-portal")
    local existing=0

    for service in "${services[@]}"; do
        local url
        url=$(discover_service_url "$service" 2>/dev/null) || url=""

        if [ -n "$url" ]; then
            log_info "  $service: $url"
            existing=$((existing + 1))
        fi
    done

    if [ $existing -eq 0 ]; then
        log_info "No existing Cloud Run services found (clean Phoenix rebuild)"
    else
        log_info "$existing services currently deployed"
    fi

    return 0
}

# =============================================================================
# Summary
# =============================================================================
print_summary() {
    log_section "PREFLIGHT CHECK SUMMARY"

    echo ""
    echo "  Total Checks:  $TOTAL_CHECKS"
    echo -e "  ${GREEN}Passed:${NC}        $PASSED_CHECKS"
    echo -e "  ${RED}Failed:${NC}        $FAILED_CHECKS"
    echo -e "  ${YELLOW}Warnings:${NC}      $WARNINGS"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  PREFLIGHT CHECKS PASSED - Ready for Phoenix rebuild${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        return 0
    else
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  PREFLIGHT CHECKS FAILED - $FAILED_CHECKS issue(s) must be resolved${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Fix the issues above before proceeding with Phoenix rebuild."
        echo "Run with --fix to attempt automatic fixes where possible."
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║         Phoenix Rebuild Pre-flight Checks                      ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  This script validates all prerequisites before Phoenix        ║"
    echo "║  rebuild. Run this BEFORE any destructive operations.          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    check_required_tools || true
    check_gcp_auth || true
    check_github_cli || true
    check_github_secrets || true
    check_gcp_secrets || true
    check_secret_hygiene || true
    check_dns || true
    check_artifact_registry || true
    check_terraform || true
    check_current_status || true

    print_summary
}

main "$@"
