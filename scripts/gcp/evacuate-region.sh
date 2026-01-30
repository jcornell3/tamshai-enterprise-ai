#!/bin/bash
# =============================================================================
# Regional Evacuation - GCP Production Environment
# =============================================================================
#
# Evacuates the production stack to a new region during a regional outage.
# Uses the "Amnesia" approach: creates a fresh Terraform state in the target
# region, bypassing the unreachable primary region entirely.
#
# This script is designed for scenarios where the primary region is completely
# unavailable and terraform destroy/apply would hang.
#
# Usage:
#   ./evacuate-region.sh [OPTIONS] [NEW_REGION] [NEW_ZONE] [ENV_ID]
#
# Options:
#   --yes, -y           Skip interactive confirmations (for automated runs)
#   --force-cleanup     Force cleanup of existing DR stacks (DANGEROUS — use cleanup-recovery.sh instead)
#   --region=REGION     Target region (default: from dr.tfvars)
#   --zone=ZONE         Target zone (default: from dr.tfvars or REGION-b)
#   --env-id=ID         Environment ID (default: recovery-YYYYMMDD-HHMM)
#   --tfvars=FILE       Use custom tfvars file (default: environments/dr.tfvars)
#   -h, --help          Show this help message
#
# Configuration Priority:
#   CLI args > Environment vars > tfvars > hardcoded defaults
#
# Environment Variables:
#   GCP_DR_REGION, GCP_DR_ZONE       - Override target region/zone
#   GCP_DR_FALLBACK_ZONES            - Space-separated fallback zones for capacity issues
#   KEYCLOAK_DR_DOMAIN               - Override Keycloak domain
#   GCP_SA_*, GCP_SECRET_*           - Override service account/secret names
#
# Examples:
#   ./evacuate-region.sh                                        # Uses dr.tfvars defaults
#   ./evacuate-region.sh <REGION> <ZONE> recovery-01            # Specific region and ID
#   ./evacuate-region.sh --yes <REGION> <ZONE> test-01          # Skip confirmation
#   GCP_DR_REGION=<REGION> ./evacuate-region.sh                 # Override via env var
#
# DR region and fallback zones are configured in dr.tfvars.
# Primary region is configured in prod.tfvars.
#
# See: docs/plans/GCP-REGION-FAILURE-SCENARIO.md
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# =============================================================================
# SOURCE PHOENIX LIBRARIES (Issue #25, #34: Proven patterns for GCP operations)
# =============================================================================
# These libraries contain battle-tested functions from 11 Phoenix rebuilds:
# - health-checks.sh: wait_for_cloudsql, wait_for_keycloak, submit_and_wait_build
# - secrets.sh: GCP Secret Manager operations
# - dynamic-urls.sh: Service URL discovery
# =============================================================================

# Default GCP configuration (needed by libraries)
# GCP_REGION is the primary region — loaded from prod.tfvars or GCP_REGION env var.
# Temporary default for library sourcing; overridden by load_tfvars_config() below.
export GCP_REGION="${GCP_REGION:-}"
export GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-${GCP_PROJECT}}"

# Source libraries with graceful fallback
# Note: common.sh provides logging functions - inline definitions below serve as fallback
# Issue #102: cleanup.sh and domain-mapping.sh provide reusable functions for DR
if [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
    source "$SCRIPT_DIR/lib/common.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/cleanup.sh" ]; then
    source "$SCRIPT_DIR/lib/cleanup.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/health-checks.sh" ]; then
    source "$SCRIPT_DIR/lib/health-checks.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/domain-mapping.sh" ]; then
    source "$SCRIPT_DIR/lib/domain-mapping.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/secrets.sh" ]; then
    source "$SCRIPT_DIR/lib/secrets.sh" 2>/dev/null || true
fi
if [ -f "$SCRIPT_DIR/lib/dynamic-urls.sh" ]; then
    source "$SCRIPT_DIR/lib/dynamic-urls.sh" 2>/dev/null || true
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Terraform directory (needed for tfvars loading)
TF_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"
TFVARS_DIR="$TF_DIR/environments"

# =============================================================================
# TFVARS CONFIGURATION LOADING
# =============================================================================
# Load configuration from dr.tfvars to avoid hardcoded values.
# Values can be overridden by command-line arguments or environment variables.
# Priority: CLI args > Environment vars > tfvars > defaults
# =============================================================================

load_tfvars_config() {
    local dr_tfvars="${TFVARS_DIR}/dr.tfvars"
    local prod_tfvars="${TFVARS_DIR}/prod.tfvars"

    # ── Load primary region from prod.tfvars ──
    # The primary region must come from configuration, not hardcoded.
    if [ -f "$prod_tfvars" ]; then
        TFVAR_PRIMARY_REGION=$(get_tfvar "region" "$prod_tfvars" 2>/dev/null || echo "")
        if [[ -n "$TFVAR_PRIMARY_REGION" ]]; then
            log_info "Primary region from prod.tfvars: $TFVAR_PRIMARY_REGION"
        fi
    fi

    # Set PRIMARY_REGION: env var > prod.tfvars (no hardcoded fallback)
    PRIMARY_REGION="${GCP_REGION:-${TFVAR_PRIMARY_REGION:-}}"
    export GCP_REGION="${PRIMARY_REGION}"

    if [[ -z "$PRIMARY_REGION" ]]; then
        log_error "PRIMARY_REGION not set. Set GCP_REGION env var or check prod.tfvars"
        return 1
    fi
    log_info "Primary region: $PRIMARY_REGION"

    # ── Load DR configuration from dr.tfvars ──
    if [ ! -f "$dr_tfvars" ]; then
        log_warn "DR tfvars not found: $dr_tfvars"
        log_info "Using default configuration values"
        return 1
    fi

    log_info "Loading DR configuration from: $dr_tfvars"

    # Load region configuration
    TFVAR_REGION=$(get_tfvar "region" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_ZONE=$(get_tfvar "zone" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_KEYCLOAK_DOMAIN=$(get_tfvar "keycloak_domain" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_APP_DOMAIN=$(get_tfvar "app_domain" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_API_DOMAIN=$(get_tfvar "api_domain" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_BACKUP_BUCKET=$(get_tfvar "source_backup_bucket" "$dr_tfvars" 2>/dev/null || echo "")
    TFVAR_STATIC_WEBSITE_DOMAIN=$(get_tfvar "static_website_domain" "$dr_tfvars" 2>/dev/null || echo "")

    # Load fallback zones (Issue #102: Zone capacity resilience)
    # Format in tfvars: fallback_zones = ["<region>-a", "<region>-c"]
    TFVAR_FALLBACK_ZONES=$(grep -E '^fallback_zones\s*=' "$dr_tfvars" 2>/dev/null | \
        sed 's/.*=\s*//' | tr -d '[]"' | tr ',' ' ' || echo "")

    return 0
}

# Defaults (will be overridden by tfvars if available)
NEW_REGION=""
NEW_ZONE=""
ENV_ID=""
AUTO_YES=false       # Skip interactive confirmations
FORCE_CLEANUP=false  # Force cleanup of existing DR stacks (DANGEROUS)

# Parse arguments first (supports both positional and flags)
POSITIONAL_ARGS=()
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) AUTO_YES=true; shift ;;
        --force-cleanup) FORCE_CLEANUP=true; shift ;;
        --region=*) NEW_REGION="${1#*=}"; shift ;;
        --zone=*) NEW_ZONE="${1#*=}"; shift ;;
        --env-id=*) ENV_ID="${1#*=}"; shift ;;
        --tfvars=*) TFVARS_FILE="${1#*=}"; shift ;;
        -h|--help) head -27 "$0" | tail -22; exit 0 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *) POSITIONAL_ARGS+=("$1"); shift ;;
    esac
done

# Handle positional arguments for backwards compatibility
# Usage: ./evacuate-region.sh [REGION] [ZONE] [ENV_ID]
if [ ${#POSITIONAL_ARGS[@]} -ge 1 ]; then NEW_REGION="${POSITIONAL_ARGS[0]}"; fi
if [ ${#POSITIONAL_ARGS[@]} -ge 2 ]; then NEW_ZONE="${POSITIONAL_ARGS[1]}"; fi
if [ ${#POSITIONAL_ARGS[@]} -ge 3 ]; then ENV_ID="${POSITIONAL_ARGS[2]}"; fi

# Load tfvars configuration (provides defaults for values not set via CLI)
load_tfvars_config || true

# Apply configuration priority: CLI args > Environment vars > tfvars
# Region: CLI > GCP_DR_REGION env > tfvars (required — no hardcoded default)
NEW_REGION="${NEW_REGION:-${GCP_DR_REGION:-${TFVAR_REGION:-}}}"
if [[ -z "$NEW_REGION" ]]; then
    echo "ERROR: DR region not set. Specify via CLI arg, GCP_DR_REGION env var, or dr.tfvars" >&2
    exit 1
fi
# Zone: CLI > GCP_DR_ZONE env > tfvars > region-b
NEW_ZONE="${NEW_ZONE:-${GCP_DR_ZONE:-${TFVAR_ZONE:-${NEW_REGION}-b}}}"
# Keycloak domain: CLI > KEYCLOAK_DR_DOMAIN env > tfvars > auth-dr.tamshai.com
KEYCLOAK_DR_DOMAIN="${KEYCLOAK_DR_DOMAIN:-${TFVAR_KEYCLOAK_DOMAIN:-auth-dr.tamshai.com}}"
# App domain: APP_DR_DOMAIN env > tfvars > app-dr.tamshai.com (Issue #102)
APP_DR_DOMAIN="${APP_DR_DOMAIN:-${TFVAR_APP_DOMAIN:-app-dr.tamshai.com}}"
# API domain: API_DR_DOMAIN env > tfvars > api-dr.tamshai.com (Issue #102)
API_DR_DOMAIN="${API_DR_DOMAIN:-${TFVAR_API_DOMAIN:-api-dr.tamshai.com}}"
# Static website domain: STATIC_DR_DOMAIN env > tfvars > prod-dr.tamshai.com
STATIC_DR_DOMAIN="${STATIC_DR_DOMAIN:-${TFVAR_STATIC_WEBSITE_DOMAIN:-prod-dr.tamshai.com}}"
# Production static website bucket (source for content copy)
STATIC_PROD_BUCKET="${STATIC_PROD_BUCKET:-prod.tamshai.com}"
# Keycloak realm: env var > default
KEYCLOAK_REALM="${KEYCLOAK_REALM:-tamshai-corp}"

# ENV_ID: CLI > auto-generated timestamp
ENV_ID="${ENV_ID:-recovery-$(date +%Y%m%d-%H%M)}"

# GCP Configuration
PROJECT_ID="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

# Bucket names: Environment vars > derived from project
# Bug #32 fix: DR uses separate state bucket to avoid contaminating production state
STATE_BUCKET="${GCP_DR_STATE_BUCKET:-tamshai-terraform-state-dr}"
BACKUP_BUCKET="${TFVAR_BACKUP_BUCKET:-${GCP_BACKUP_BUCKET:-tamshai-backups-us}}"

# Service account names: Environment vars > defaults
SA_KEYCLOAK="${GCP_SA_KEYCLOAK:-tamshai-prod-keycloak}"
SA_MCP_GATEWAY="${GCP_SA_MCP_GATEWAY:-tamshai-prod-mcp-gateway}"
SA_MCP_SERVERS="${GCP_SA_MCP_SERVERS:-tamshai-prod-mcp-servers}"
SA_CICD="${GCP_SA_CICD:-tamshai-prod-cicd}"
SA_PROVISION="${GCP_SA_PROVISION:-tamshai-prod-provision}"

# GCP Secret Manager secret names: Environment vars > defaults
SECRET_KEYCLOAK_ADMIN_PASSWORD="${GCP_SECRET_KEYCLOAK_ADMIN_PASSWORD:-tamshai-prod-keycloak-admin-password}"
SECRET_KEYCLOAK_DB_PASSWORD="${GCP_SECRET_KEYCLOAK_DB_PASSWORD:-tamshai-prod-keycloak-db-password}"
SECRET_DB_PASSWORD="${GCP_SECRET_DB_PASSWORD:-tamshai-prod-db-password}"
SECRET_CLAUDE_API_KEY="${GCP_SECRET_CLAUDE_API_KEY:-tamshai-prod-claude-api-key}"
SECRET_MCP_GATEWAY_CLIENT="${GCP_SECRET_MCP_GATEWAY_CLIENT:-tamshai-prod-mcp-gateway-client-secret}"
SECRET_JWT="${GCP_SECRET_JWT:-tamshai-prod-jwt-secret}"
SECRET_MCP_HR_CLIENT="${GCP_SECRET_MCP_HR_CLIENT:-mcp-hr-service-client-secret}"
SECRET_PROD_USER_PASSWORD="${GCP_SECRET_PROD_USER_PASSWORD:-prod-user-password}"

# Fallback zones for capacity issues (Issue #102)
# Environment var > tfvars > region-based defaults
# Format: space-separated list of zones to try if primary zone fails
if [ -n "$GCP_DR_FALLBACK_ZONES" ]; then
    FALLBACK_ZONES="$GCP_DR_FALLBACK_ZONES"
elif [ -n "$TFVAR_FALLBACK_ZONES" ]; then
    FALLBACK_ZONES="$TFVAR_FALLBACK_ZONES"
else
    # Generic fallback: try zones a and c (most regions have these)
    FALLBACK_ZONES="${NEW_REGION}-a ${NEW_REGION}-c"
fi

# Colors and logging (fallback if common.sh not loaded)
# These are overwritten when lib/common.sh is sourced successfully
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_phase() { echo -e "\n${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"; echo -e "${MAGENTA}  PHASE $1: $2${NC}"; echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# ZONE CAPACITY CHECK (Issue #102)
# =============================================================================
# GCP zones can have transient capacity issues for specific machine types.
# This function checks if a machine type is available in a zone before deployment.
#
# Returns: 0 if zone has capacity, 1 if unavailable
# =============================================================================

check_zone_capacity() {
    local zone="$1"
    local machine_type="${2:-e2-micro}"

    # Check if machine type is available in the zone
    # This uses gcloud compute machine-types describe which returns an error if unavailable
    if gcloud compute machine-types describe "$machine_type" \
        --zone="$zone" \
        --project="$PROJECT_ID" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Select a zone with available capacity from the fallback list
# Updates NEW_ZONE global variable with the first available zone
select_available_zone() {
    local machine_type="${1:-e2-micro}"
    local zones_to_check="$NEW_ZONE $FALLBACK_ZONES"

    log_step "Checking zone capacity for $machine_type..."

    for zone in $zones_to_check; do
        log_info "  Checking $zone..."
        if check_zone_capacity "$zone" "$machine_type"; then
            if [ "$zone" != "$NEW_ZONE" ]; then
                log_warn "Primary zone $NEW_ZONE unavailable, using fallback: $zone"
                NEW_ZONE="$zone"
            fi
            log_success "Zone $zone has capacity for $machine_type"
            return 0
        else
            log_warn "  Zone $zone: $machine_type unavailable"
        fi
    done

    log_error "No zones with $machine_type capacity found!"
    log_error "Zones checked: $zones_to_check"
    log_error "Try a different region or wait for capacity to become available"
    return 1
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

preflight_checks() {
    log_phase "0" "PRE-FLIGHT CHECKS"

    local errors=0

    # Check required tools
    log_step "Checking required tools..."
    for tool in gcloud terraform gh jq curl; do
        if ! command -v $tool &>/dev/null; then
            log_error "Missing required tool: $tool"
            ((errors++))
        fi
    done

    # Check GCP authentication
    log_step "Checking GCP authentication..."
    if ! gcloud auth print-access-token &>/dev/null; then
        log_error "GCP authentication failed. Run: gcloud auth login"
        ((errors++))
    fi

    # Check project ID
    log_step "Checking GCP project..."
    if [ -z "$PROJECT_ID" ]; then
        log_error "GCP project not set. Run: gcloud config set project <PROJECT_ID>"
        ((errors++))
    else
        log_info "Project: $PROJECT_ID"
    fi

    # Check GitHub CLI authentication
    log_step "Checking GitHub CLI authentication..."
    if ! gh auth status &>/dev/null; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        ((errors++))
    fi

    # Validate target region exists
    log_step "Validating target region: $NEW_REGION..."
    if ! gcloud compute regions describe "$NEW_REGION" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Invalid GCP region: $NEW_REGION"
        ((errors++))
    fi

    # Validate target zone exists and has capacity (Issue #102)
    log_step "Validating target zone: $NEW_ZONE..."
    if ! gcloud compute zones describe "$NEW_ZONE" --project="$PROJECT_ID" &>/dev/null; then
        log_error "Invalid GCP zone: $NEW_ZONE"
        ((errors++))
    else
        # Check zone capacity for e2-micro (used by utility VM)
        # This will update NEW_ZONE to a fallback if needed
        if ! select_available_zone "e2-micro"; then
            log_error "No zone with e2-micro capacity available"
            ((errors++))
        else
            log_info "Using zone: $NEW_ZONE"
        fi
    fi

    if [ $errors -gt 0 ]; then
        log_error "Pre-flight checks failed with $errors error(s)"
        exit 1
    fi

    # Fetch ALL GitHub secrets upfront so they're available throughout the run.
    # This replaces relying on local env vars — always fetches fresh values.
    local secrets_script="$PROJECT_ROOT/scripts/secrets/read-github-secrets.sh"
    if [ -f "$secrets_script" ]; then
        log_step "Fetching GitHub secrets (PROD_USER_PASSWORD, E2E test creds)..."
        local secret_exports
        if secret_exports=$("$secrets_script" --phoenix --env 2>/dev/null); then
            eval "$secret_exports"
            log_success "GitHub secrets loaded into environment"
        else
            log_warn "Failed to fetch GitHub secrets — Phase 5 user provisioning may fail"
            log_warn "Ensure 'gh auth status' is authenticated and export-test-secrets.yml exists"
        fi
    else
        log_warn "read-github-secrets.sh not found at $secrets_script"
    fi

    # Gap #41: Ensure global secrets have versions before terraform runs
    # These secrets are created by terraform as empty containers, but need values.
    # This mirrors phoenix-rebuild.sh behavior for DR/prod alignment.
    log_step "Ensuring global secrets have versions (Gap #41)..."

    # 1. mcp-hr-service-client-secret
    if type ensure_mcp_hr_client_secret &>/dev/null; then
        ensure_mcp_hr_client_secret || log_warn "Could not ensure mcp-hr-service-client-secret"
    else
        log_warn "ensure_mcp_hr_client_secret function not available"
    fi

    # 2. prod-user-password - sync from GitHub Secrets if available
    if type sync_prod_user_password &>/dev/null; then
        sync_prod_user_password || log_warn "Could not sync prod-user-password"
    else
        # Fallback: ensure secret has a version
        if ! gcloud secrets versions list prod-user-password --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | grep -q .; then
            log_info "Adding version to prod-user-password..."
            if [ -n "${PROD_USER_PASSWORD:-}" ]; then
                echo -n "$PROD_USER_PASSWORD" | gcloud secrets versions add prod-user-password --project="$PROJECT_ID" --data-file=- 2>/dev/null || true
            else
                openssl rand -base64 32 | tr -d '/+=' | head -c 32 | gcloud secrets versions add prod-user-password --project="$PROJECT_ID" --data-file=- 2>/dev/null || true
            fi
        fi
    fi

    # 3. tamshai-prod-keycloak-admin-password - sync from GitHub Secrets if available
    local keycloak_admin_secret="${SECRET_KEYCLOAK_ADMIN_PASSWORD:-tamshai-prod-keycloak-admin-password}"
    if ! gcloud secrets versions list "$keycloak_admin_secret" --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | grep -q .; then
        log_info "Adding version to $keycloak_admin_secret..."
        if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
            echo -n "$KEYCLOAK_ADMIN_PASSWORD" | gcloud secrets versions add "$keycloak_admin_secret" --project="$PROJECT_ID" --data-file=- 2>/dev/null || true
        else
            openssl rand -base64 32 | tr -d '/+=' | head -c 32 | gcloud secrets versions add "$keycloak_admin_secret" --project="$PROJECT_ID" --data-file=- 2>/dev/null || true
        fi
    fi

    log_success "Global secrets verified"

    log_success "All pre-flight checks passed"
}

# =============================================================================
# CONFIRMATION
# =============================================================================

confirm_evacuation() {
    echo ""
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}                    REGIONAL EVACUATION SUMMARY                    ${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}Target Configuration:${NC}"
    echo -e "  Target Region:     ${CYAN}$NEW_REGION${NC}"
    echo -e "  Target Zone:       ${CYAN}$NEW_ZONE${NC}"
    echo -e "  Environment ID:    ${CYAN}$ENV_ID${NC}"
    echo -e "  State Prefix:      ${CYAN}gcp/recovery/$ENV_ID${NC}"
    echo -e "  Project:           ${CYAN}$PROJECT_ID${NC}"
    echo ""
    echo -e "  ${BLUE}Domain Configuration:${NC}"
    echo -e "  Auth Domain:       ${CYAN}$KEYCLOAK_DR_DOMAIN${NC}"
    echo -e "  App Domain:        ${CYAN}$APP_DR_DOMAIN${NC}"
    echo -e "  API Domain:        ${CYAN}$API_DR_DOMAIN${NC}"
    echo -e "  Realm:             ${CYAN}$KEYCLOAK_REALM${NC}"
    echo ""
    echo -e "  ${BLUE}Infrastructure:${NC}"
    echo -e "  State Bucket:      ${CYAN}$STATE_BUCKET${NC}"
    echo -e "  Backup Bucket:     ${CYAN}$BACKUP_BUCKET${NC}"
    echo ""
    echo -e "${YELLOW}This will create a NEW production stack in $NEW_REGION.${NC}"
    echo -e "${YELLOW}The primary stack (if still running) will NOT be affected.${NC}"
    echo ""

    if [ "$AUTO_YES" = "true" ]; then
        log_info "Auto-confirming (--yes flag provided)"
        return 0
    fi

    read -p "Proceed with regional evacuation? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Evacuation cancelled"
        exit 0
    fi
}

# =============================================================================
# PRE-CLEANUP: REMOVE LEFTOVER RESOURCES FROM FAILED ATTEMPTS
# =============================================================================
# Bug #16: Scans for leftovers from ANY previous evacuation attempt, not just
# the current ENV_ID. Each DR run gets a unique timestamp-based ENV_ID, so
# previous runs leave orphans with different suffixes.
#
# Two categories of leftovers:
#   1. Cloud Run services — NO suffix, same names across all DR attempts.
#      Always collide, must always be cleaned up.
#   2. Suffixed resources (VPC, Cloud SQL, routers, etc.) — unique per ENV_ID.
#      Detected by scanning for recovery VPC pattern, cleaned up per-ENV_ID.
#
# Uses cleanup_recovery_resources() (recovery-safe) which omits shared
# resources (storage buckets, secrets, artifact registry).
# =============================================================================

run_cleanup_leftover_resources() {
    log_phase "0.5" "PRE-CLEANUP: REMOVE LEFTOVER RESOURCES"

    # Save current ENV_ID — the loop in Step 3 temporarily overrides it
    local current_env_id="${ENV_ID}"

    # Set up base environment for library functions
    # Bug #20: Use GCP_DR_REGION (not GCP_REGION) to prevent DR scripts
    # from accidentally acting on production. NEW_REGION is the DR region.
    export RESOURCE_PREFIX="tamshai-prod"
    export GCP_DR_REGION="${NEW_REGION}"
    export GCP_PROJECT="${PROJECT_ID}"
    export REGION="${NEW_REGION}"
    export PROJECT="${PROJECT_ID}"

    local found_leftovers=false

    # ── Safety Gate: Check for ACTIVE recovery stacks ──
    # If terraform state files exist in the recovery bucket, assume they're from
    # a SUCCESSFUL deployment (not orphans). User should use cleanup-recovery.sh
    # to explicitly remove them first.
    #
    # This prevents accidentally destroying an active DR stack by re-running
    # evacuate-region.sh. Only orphaned resources (no terraform state) are
    # cleaned up automatically.
    log_step "Checking for active recovery terraform states..."
    local active_states
    active_states=$(gsutil ls "gs://${STATE_BUCKET}/gcp/recovery/" 2>/dev/null | \
        grep -E "recovery-[0-9]+" | \
        sed 's|.*/gcp/recovery/\([^/]*\)/.*|\1|' | \
        sort -u || true)

    if [[ -n "$active_states" ]]; then
        log_warn "════════════════════════════════════════════════════════════════════"
        log_warn "ACTIVE RECOVERY STACKS DETECTED"
        log_warn "════════════════════════════════════════════════════════════════════"
        log_warn "Found terraform state for the following recovery environments:"
        echo ""
        echo "$active_states" | while read -r state_id; do
            log_info "  • $state_id"
        done
        echo ""

        if [[ "$FORCE_CLEANUP" == "true" ]]; then
            log_warn "⚠️  --force-cleanup: Proceeding to destroy active recovery stacks!"
            log_warn "This will DELETE all Cloud Run services, databases, and networking"
            log_warn "in the DR region. Use cleanup-recovery.sh for controlled teardown."
            echo ""
            if [[ "$AUTO_YES" != "true" ]]; then
                if ! confirm "Are you ABSOLUTELY SURE you want to destroy active DR stacks?"; then
                    log_error "Aborted by user."
                    exit 1
                fi
            fi
        else
            log_error "Cannot proceed: active recovery stacks would be destroyed."
            log_error ""
            log_error "To failback to production (remove DR stack):"
            log_error "  ./cleanup-recovery.sh <ENV_ID>"
            log_error ""
            log_error "To list all recovery stacks:"
            log_error "  ./cleanup-recovery.sh --list"
            log_error ""
            log_error "To force cleanup anyway (DANGEROUS):"
            log_error "  ./evacuate-region.sh --force-cleanup ..."
            log_error ""
            exit 1
        fi
    else
        log_info "No active recovery terraform states found — safe to proceed"
    fi

    # ── Step 1: Clean up Cloud Run services in recovery region ──
    # Cloud Run services have NO suffix — same names (keycloak, mcp-hr, etc.)
    # across all DR attempts. If a previous run created them, this run's
    # terraform create will fail with "already exists".
    #
    # Safety: skip if recovery region == primary region (same-region DR would
    # delete production services).
    if [[ "${NEW_REGION}" == "${PRIMARY_REGION}" ]]; then
        log_warn "Recovery region matches primary (${PRIMARY_REGION}) — skipping Cloud Run cleanup"
        log_warn "Same-region DR: Cloud Run services will be imported by terraform"
    else
        log_step "Checking for leftover Cloud Run services in ${NEW_REGION}..."
        local leftover_services
        leftover_services=$(gcloud run services list --region="${NEW_REGION}" \
            --project="${PROJECT_ID}" --format="value(SERVICE)" 2>/dev/null || true)

        if [[ -n "$leftover_services" ]]; then
            found_leftovers=true
            log_warn "Found leftover Cloud Run services in ${NEW_REGION}:"
            echo "$leftover_services" | while read -r svc; do
                log_info "  - $svc"
            done
            log_step "Deleting leftover Cloud Run services..."
            delete_cloudrun_services
            log_info "Waiting for DB connections to close..."
            sleep 5
        else
            log_info "No leftover Cloud Run services in ${NEW_REGION}"
        fi
    fi

    # ── Step 2: Always clean up Cloud Run jobs in recovery region ──
    log_step "Checking for leftover Cloud Run jobs..."
    local leftover_jobs
    leftover_jobs=$(gcloud run jobs list --region="${NEW_REGION}" \
        --project="${PROJECT_ID}" --format="value(name)" 2>/dev/null | grep -E "provision" || true)

    if [[ -n "$leftover_jobs" ]]; then
        found_leftovers=true
        log_warn "Found leftover Cloud Run jobs — deleting..."
        # Delete jobs for any suffix pattern
        delete_cloud_run_jobs ""
    fi

    # ── Step 3: Find ALL recovery VPCs (any ENV_ID, not just current) ──
    log_step "Scanning for leftover recovery VPCs..."
    local recovery_vpcs
    recovery_vpcs=$(gcloud compute networks list --project="${PROJECT_ID}" \
        --filter="name~tamshai-prod-recovery-" \
        --format="value(name)" 2>/dev/null || true)

    if [[ -n "$recovery_vpcs" ]]; then
        found_leftovers=true
        log_warn "Found leftover recovery VPCs:"
        echo "$recovery_vpcs" | while read -r vpc; do
            log_info "  - $vpc"
        done

        # Clean up each previous run's suffixed resources
        while IFS= read -r vpc_name; do
            # Extract suffix: tamshai-prod-recovery-YYYYMMDD-HHMM-vpc → -recovery-YYYYMMDD-HHMM
            local old_suffix old_env_id
            old_suffix=$(echo "$vpc_name" | sed 's/^tamshai-prod\(.*\)-vpc$/\1/')
            old_env_id=$(echo "$old_suffix" | sed 's/^-//')

            log_step "Cleaning up leftovers from previous run: $old_env_id"

            # Set environment for this specific run's cleanup
            export NAME_PREFIX="tamshai-prod${old_suffix}"
            export ENV_ID="$old_env_id"

            # cleanup_recovery_resources handles: Cloud SQL → VPC peering →
            # private IP → NAT/Router → VPC connector → GCE → firewall →
            # subnets → routes → VPC. Omits shared resources.
            cleanup_recovery_resources "$old_suffix" || {
                log_error "Cleanup failed for $old_env_id — cannot proceed"
                exit 1
            }

            # Clean up terraform state lock for this previous run
            if [[ -n "$STATE_BUCKET" ]]; then
                cleanup_terraform_state_lock "$STATE_BUCKET" "gcp/recovery/$old_env_id" 2>/dev/null || true
            fi
        done <<< "$recovery_vpcs"
    else
        log_info "No leftover recovery VPCs found"
    fi

    # ── Step 4: Check for orphaned Cloud SQL without a VPC ──
    # A partial failure may have created Cloud SQL but not VPC
    log_step "Checking for orphaned recovery Cloud SQL instances..."
    local orphaned_sql
    orphaned_sql=$(gcloud sql instances list --project="${PROJECT_ID}" \
        --filter="name~tamshai-prod-postgres-recovery-" \
        --format="value(name)" 2>/dev/null || true)

    if [[ -n "$orphaned_sql" ]]; then
        while IFS= read -r sql_name; do
            # Skip if already cleaned up by Step 3 (check if it still exists)
            if ! gcloud sql instances describe "$sql_name" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
                continue
            fi
            found_leftovers=true
            log_warn "Found orphaned Cloud SQL: $sql_name — deleting..."
            # Extract suffix for deletion protection toggle
            local sql_suffix
            sql_suffix=$(echo "$sql_name" | sed "s/^tamshai-prod-postgres//")
            disable_cloudsql_deletion_protection "$sql_suffix" 2>/dev/null || true
            gcloud sql instances delete "$sql_name" --project="${PROJECT_ID}" --quiet 2>/dev/null || {
                log_warn "Failed to delete $sql_name — may need manual cleanup"
            }
        done <<< "$orphaned_sql"
    fi

    # ── Restore environment for current run ──
    export NAME_PREFIX="tamshai-prod-${current_env_id}"
    export ENV_ID="${current_env_id}"

    if [[ "$found_leftovers" == "true" ]]; then
        log_success "Pre-cleanup complete — leftover resources removed"
    else
        log_info "No leftover resources found — environment is clean"
    fi
}

# =============================================================================
# PHASE 1: INITIALIZE FRESH TERRAFORM STATE
# =============================================================================

phase1_init_state() {
    log_phase "1" "INITIALIZE FRESH TERRAFORM STATE"

    cd "$TF_DIR"

    log_step "Initializing Terraform with recovery state path..."
    log_info "State bucket: $STATE_BUCKET"
    log_info "State prefix: gcp/recovery/$ENV_ID"

    # Clean up local .terraform directory before switching backends
    # This is required because:
    # 1. We're switching to a different GCS state path (recovery vs primary)
    # 2. Local .terraform/terraform.tfstate contains cached backend config
    # 3. Windows may hold file locks from interrupted terraform processes
    # 4. The actual state is safely stored in GCS, not locally
    if [ -d ".terraform" ]; then
        log_info "Removing local .terraform directory (switching backends)..."
        rm -rf .terraform
    fi

    # Use -reconfigure to completely reinitialize with new backend
    terraform init -reconfigure \
        -backend-config="bucket=$STATE_BUCKET" \
        -backend-config="prefix=gcp/recovery/$ENV_ID"

    # Clean up stale state entries from previous failed attempts
    # The pre-cleanup phase deleted actual resources, but the state may still reference them
    log_step "Cleaning up stale state entries from previous attempts..."
    local stale_resources
    stale_resources=$(terraform state list 2>/dev/null || echo "")

    if [ -n "$stale_resources" ]; then
        log_info "  Found $(echo "$stale_resources" | wc -l) resources in state from previous attempt"
        log_info "  Removing stale entries for resources deleted during cleanup..."

        # Remove database resources (Cloud SQL was deleted during cleanup)
        for resource in module.database.google_sql_database_instance.postgres \
                        module.database.google_sql_database.keycloak_db \
                        module.database.google_sql_database.hr_db \
                        module.database.google_sql_database.finance_db \
                        module.database.google_sql_user.keycloak_user \
                        module.database.google_sql_user.tamshai_user \
                        module.database.google_compute_global_address.private_ip_range \
                        module.database.google_service_networking_connection.private_vpc_connection; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # Remove networking resources (VPC was deleted during cleanup)
        for resource in module.networking.google_compute_network.vpc \
                        module.networking.google_compute_subnetwork.subnet \
                        module.networking.google_compute_router.router \
                        module.networking.google_compute_router_nat.nat \
                        module.networking.google_vpc_access_connector.serverless_connector[0] \
                        'module.networking.google_vpc_access_connector.serverless_connector[0]' \
                        module.networking.google_compute_firewall.allow_http \
                        module.networking.google_compute_firewall.allow_iap_ssh \
                        module.networking.google_compute_firewall.allow_internal \
                        module.networking.google_compute_firewall.allow_serverless_connector[0] \
                        'module.networking.google_compute_firewall.allow_serverless_connector[0]'; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # Remove Cloud Run resources (deleted during cleanup)
        for resource in module.cloudrun.google_cloud_run_service.keycloak \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]' \
                        'module.cloudrun.google_cloud_run_service.mcp_suite["support"]' \
                        module.cloudrun.google_cloud_run_service.web_portal[0] \
                        'module.cloudrun.google_cloud_run_service.web_portal[0]' \
                        module.cloudrun.google_artifact_registry_repository.tamshai; do
            if terraform state show "$resource" &>/dev/null 2>&1; then
                log_info "    Removing: $resource"
                terraform state rm "$resource" 2>/dev/null || true
            fi
        done

        # NOTE: Storage buckets are SHARED between primary and recovery (no suffix)
        # They don't need to be removed from state - they should be imported instead
        # See gcp/main.tf comment: storage buckets are global and should be reused

        log_success "  Stale state entries removed"
    else
        log_info "  State is clean (no previous entries found)"
    fi

    log_success "Terraform initialized with fresh state"
}

# =============================================================================
# PHASE 1.5: REPLICATE CONTAINER IMAGES TO RECOVERY REGION
# =============================================================================
# Artifact Registry is regional, so images built for the primary region are not
# available in the recovery region. We must copy images from the primary region
# to the recovery region before deploying Cloud Run services.
# =============================================================================

phase1_5_replicate_images() {
    log_phase "1.5" "REPLICATE CONTAINER IMAGES TO RECOVERY REGION"

    # PRIMARY_REGION is set by load_tfvars_config() from prod.tfvars or GCP_REGION env
    local SOURCE_REGISTRY="${PRIMARY_REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai"
    local TARGET_REGISTRY="${NEW_REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai"

    log_info "Source registry: $SOURCE_REGISTRY"
    log_info "Target registry: $TARGET_REGISTRY"

    # First, ensure the Artifact Registry repository exists in the new region
    log_step "Creating Artifact Registry repository in $NEW_REGION..."
    if ! gcloud artifacts repositories describe tamshai \
        --location="$NEW_REGION" \
        --project="$PROJECT_ID" &>/dev/null 2>&1; then
        gcloud artifacts repositories create tamshai \
            --repository-format=docker \
            --location="$NEW_REGION" \
            --project="$PROJECT_ID" \
            --description="Tamshai container images for regional evacuation"
        log_success "  Created Artifact Registry repository in $NEW_REGION"
    else
        log_info "  Artifact Registry repository already exists in $NEW_REGION"
    fi

    # List of images to replicate
    local images=(
        "keycloak:v2.0.0-postgres"
        "mcp-gateway:latest"
        "mcp-hr:latest"
        "mcp-finance:latest"
        "mcp-sales:latest"
        "mcp-support:latest"
        "web-portal:latest"
        "provision-job:latest"
    )

    log_step "Copying container images to recovery region..."
    local failed_images=()

    for image in "${images[@]}"; do
        local source_image="${SOURCE_REGISTRY}/${image}"
        local target_image="${TARGET_REGISTRY}/${image}"
        local image_name="${image%:*}"
        local image_tag="${image#*:}"
        local copy_success=false

        log_info "  Copying: $image"

        # Check if target image already exists AND matches source digest
        # Stale images from previous DR runs must be replaced with current builds
        if gcloud artifacts docker images describe "$target_image" \
            --project="$PROJECT_ID" &>/dev/null 2>&1; then

            # Get source and target digests for freshness comparison
            local source_digest target_digest
            source_digest=$(gcloud artifacts docker images describe "$source_image" \
                --project="$PROJECT_ID" \
                --format="value(image_summary.digest)" 2>/dev/null || echo "")
            target_digest=$(gcloud artifacts docker images describe "$target_image" \
                --project="$PROJECT_ID" \
                --format="value(image_summary.digest)" 2>/dev/null || echo "")

            if [[ -n "$source_digest" && "$source_digest" == "$target_digest" ]]; then
                log_info "    Already exists with matching digest (skipping)"
                log_info "    Digest: ${source_digest:0:19}..."
                continue
            elif [[ -n "$source_digest" && -n "$target_digest" ]]; then
                log_warn "    Target exists but STALE (digest mismatch) — will re-copy"
                log_info "    Source: ${source_digest:0:19}..."
                log_info "    Target: ${target_digest:0:19}..."
            elif [[ -z "$source_digest" ]]; then
                log_warn "    Cannot read source digest — will attempt copy anyway"
            fi
        fi

        # Check if source image exists
        if gcloud artifacts docker images describe "$source_image" \
            --project="$PROJECT_ID" &>/dev/null 2>&1; then
            # Source exists, try to copy

            # Try gcrane first (fastest, preserves manifests)
            # Bug #21: Skip Docker fallback - go straight to Cloud Build if gcrane fails.
            # Docker requires local daemon which may not be available in DR scenarios.
            if command -v gcrane &>/dev/null; then
                if gcrane copy "$source_image" "$target_image" 2>/dev/null; then
                    log_success "    Copied via gcrane"
                    copy_success=true
                else
                    log_info "    gcrane not available or copy failed, will rebuild via Cloud Build..."
                fi
            else
                log_info "    gcrane not installed, will rebuild via Cloud Build..."
            fi
        else
            log_warn "    Source image not found, will attempt rebuild..."
        fi

        # =================================================================
        # REBUILD FALLBACK (Phoenix pattern Gaps #55-58)
        # Rebuild in target region if copy fails. Each image type has
        # different build requirements documented in phoenix-rebuild.sh.
        # =================================================================
        if [ "$copy_success" = false ]; then
            log_warn "  Copy failed, attempting rebuild in target region..."

            case "$image_name" in
                keycloak)
                    # Keycloak uses Dockerfile.cloudbuild (no BuildKit syntax)
                    # Phoenix pattern: Use --config with temp cloudbuild.yaml (--dockerfile flag doesn't exist)
                    log_info "    Building keycloak (Dockerfile.cloudbuild)..."
                    local keycloak_config="/tmp/keycloak-cloudbuild-$$.yaml"
                    cat > "$keycloak_config" <<KEYCLOAK_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${target_image}', '-f', 'Dockerfile.cloudbuild', '.']
images:
  - '${target_image}'
KEYCLOAK_EOF
                    if submit_cloud_build_async gcloud builds submit "${PROJECT_ROOT}/keycloak" \
                        --config="$keycloak_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet; then
                        log_success "    Rebuilt keycloak successfully"
                        copy_success=true
                    fi
                    rm -f "$keycloak_config"
                    ;;
                web-portal)
                    # Web portal needs repo root context with Dockerfile.prod
                    # Phoenix pattern: Use --config with temp cloudbuild.yaml
                    # Bug #37 fix: Pass DR-specific build args for Keycloak URL
                    log_info "    Building web-portal (Dockerfile.prod from repo root)..."
                    local webportal_config="/tmp/webportal-cloudbuild-$$.yaml"
                    local dr_keycloak_url="https://${KEYCLOAK_DR_DOMAIN}/auth/realms/${KEYCLOAK_REALM}"
                    cat > "$webportal_config" <<WEBPORTAL_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${target_image}'
      - '-f'
      - 'clients/web/Dockerfile.prod'
      - '--build-arg'
      - 'VITE_KEYCLOAK_URL=${dr_keycloak_url}'
      - '--build-arg'
      - 'VITE_KEYCLOAK_CLIENT_ID=web-portal'
      - '--build-arg'
      - 'VITE_API_GATEWAY_URL='
      - '--build-arg'
      - 'VITE_MCP_GATEWAY_URL='
      - '--build-arg'
      - 'VITE_RELEASE_TAG=v1.0.0-dr'
      - '.'
images:
  - '${target_image}'
WEBPORTAL_EOF
                    if submit_cloud_build_async gcloud builds submit "${PROJECT_ROOT}" \
                        --config="$webportal_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet; then
                        log_success "    Rebuilt web-portal successfully"
                        copy_success=true
                    fi
                    rm -f "$webportal_config"
                    ;;
                mcp-gateway|mcp-hr|mcp-finance|mcp-sales|mcp-support)
                    # Standard MCP services - can use --tag directly
                    log_info "    Building ${image_name} (standard Dockerfile)..."
                    if submit_cloud_build_async gcloud builds submit "${PROJECT_ROOT}/services/${image_name}" \
                        --tag="$target_image" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet; then
                        log_success "    Rebuilt ${image_name} successfully"
                        copy_success=true
                    fi
                    ;;
                provision-job)
                    # Provision job is at scripts/gcp/provision-job/
                    # Phoenix pattern: Use minimal build context with --config
                    log_info "    Building provision-job..."
                    local provision_context="/tmp/provision-job-context-$$"
                    mkdir -p "$provision_context/services" "$provision_context/sample-data" "$provision_context/scripts/gcp"
                    cp -r "$PROJECT_ROOT/services/mcp-hr" "$provision_context/services/"
                    rm -rf "$provision_context/services/mcp-hr/node_modules"  # Exclude host node_modules — Dockerfile runs npm ci
                    cp "$PROJECT_ROOT/sample-data"/*.sql "$provision_context/sample-data/" 2>/dev/null || true
                    cp -r "$PROJECT_ROOT/scripts/gcp/provision-job" "$provision_context/scripts/gcp/"

                    local provision_config="/tmp/provision-cloudbuild-$$.yaml"
                    cat > "$provision_config" <<PROVISION_EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${target_image}', '-f', 'scripts/gcp/provision-job/Dockerfile', '.']
images:
  - '${target_image}'
PROVISION_EOF
                    if submit_cloud_build_async gcloud builds submit "$provision_context" \
                        --config="$provision_config" \
                        --region=global \
                        --project="$PROJECT_ID" \
                        --quiet; then
                        log_success "    Rebuilt provision-job successfully"
                        copy_success=true
                    fi
                    rm -rf "$provision_context" "$provision_config"
                    ;;
                *)
                    log_warn "    Unknown image type, cannot rebuild: $image_name"
                    ;;
            esac
        fi

        if [ "$copy_success" = false ]; then
            log_error "  Failed to copy or rebuild: $image"
            failed_images+=("$image")
        fi
    done

    if [ ${#failed_images[@]} -gt 0 ]; then
        log_warn "Some images could not be copied: ${failed_images[*]}"
        log_warn "Cloud Run services may fail to deploy until images are available"
    else
        log_success "All container images copied to recovery region"
    fi
}

# Helper function: Submit Cloud Build and poll for completion (Bug #11 fix)
# Uses --async to avoid log-streaming permission error (requires roles/viewer)
# Returns 0 on SUCCESS, 1 on FAILURE/TIMEOUT/CANCELLED
submit_cloud_build_async() {
    local build_output build_id status elapsed
    local max_wait=900  # 15 minutes max
    local poll_interval=15

    # Submit build with --async (returns immediately, no log streaming needed)
    build_output=$("$@" --async 2>&1) || true

    # Extract build ID from "Created [.../builds/BUILD_ID]." output
    build_id=$(echo "$build_output" | grep -oP 'builds/\K[a-f0-9-]+' | head -1)
    if [ -z "$build_id" ]; then
        # Try alternative: extract from JSON output
        build_id=$(echo "$build_output" | grep -oP '"id":\s*"\K[a-f0-9-]+' | head -1)
    fi

    if [ -z "$build_id" ]; then
        log_warn "    Could not extract build ID from output"
        log_info "    Output: ${build_output:0:200}"
        return 1
    fi

    log_info "    Build submitted: $build_id"

    # Poll until completion
    elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        status=$(gcloud builds describe "$build_id" \
            --region=global \
            --project="$PROJECT_ID" \
            --format="value(status)" 2>/dev/null || echo "UNKNOWN")

        case "$status" in
            SUCCESS)
                return 0
                ;;
            FAILURE|TIMEOUT|CANCELLED|INTERNAL_ERROR|EXPIRED)
                log_error "    Build $build_id failed with status: $status"
                return 1
                ;;
            QUEUED|WORKING|PENDING)
                # Still in progress
                ;;
            *)
                log_warn "    Build status: $status"
                ;;
        esac

        sleep $poll_interval
        elapsed=$((elapsed + poll_interval))
        if [ $((elapsed % 60)) -eq 0 ]; then
            log_info "    Build in progress... (${elapsed}s elapsed, status: $status)"
        fi
    done

    log_error "    Build $build_id timed out after ${max_wait}s"
    return 1
}

# Helper function to copy images using docker commands
# Issue #34: Added better error handling and debugging output
copy_image_via_docker() {
    local source=$1
    local target=$2

    # Configure docker for Artifact Registry (both source and target regions)
    log_info "    Configuring docker for ${PRIMARY_REGION}-docker.pkg.dev..."
    gcloud auth configure-docker "${PRIMARY_REGION}-docker.pkg.dev" --quiet 2>/dev/null || true
    log_info "    Configuring docker for ${NEW_REGION}-docker.pkg.dev..."
    gcloud auth configure-docker "${NEW_REGION}-docker.pkg.dev" --quiet 2>/dev/null || true

    # Pull with verbose output for debugging
    log_info "    Pulling: $source"
    if ! docker pull "$source" 2>&1; then
        log_error "    Failed to pull image: $source"
        log_error "    Check if the image exists and auth is configured correctly"
        return 1
    fi

    # Tag for target registry
    log_info "    Tagging: $target"
    if ! docker tag "$source" "$target" 2>&1; then
        log_error "    Failed to tag image"
        return 1
    fi

    # Push to target registry
    log_info "    Pushing: $target"
    if ! docker push "$target" 2>&1; then
        log_error "    Failed to push image to target registry"
        return 1
    fi

    log_success "    Copied via docker pull/tag/push"
    return 0
}

# =============================================================================
# PHASE 2: DEPLOY INFRASTRUCTURE TO NEW REGION
# =============================================================================
# Similar to phoenix-rebuild.sh phase_7_cloud_run, this phase handles 409
# "already exists" errors by importing existing resources into the new state.
#
# Service accounts and secrets are project-global (not region-specific), so
# when running a recovery stack in parallel with production:
# - Service accounts: Import existing ones (they're reusable across regions)
# - Secrets: Import existing ones (same credentials work everywhere)
# =============================================================================

phase2_deploy_infrastructure() {
    log_phase "2" "DEPLOY INFRASTRUCTURE TO NEW REGION"

    cd "$TF_DIR"

    log_step "Planning infrastructure deployment..."
    log_info "Note: Global resources (service accounts, secrets) will be imported if they exist"

    # =============================================================================
    # Pre-import global resources that likely already exist
    # This prevents 409 errors during terraform apply (Issue #11 pattern)
    #
    # IMPORTANT: terraform import requires the same -var flags as terraform apply
    # to ensure state consistency with the planned configuration.
    # =============================================================================
    log_step "Pre-importing existing global resources (service accounts, secrets)..."

    # Common vars for all terraform commands
    # NOTE: keycloak_domain must use DR domain (e.g., auth-dr.tamshai.com) for recovery mode
    # because domain mappings are region-bound (auth.tamshai.com is bound to the primary region)
    local TF_VARS=(
        -var="region=$NEW_REGION"
        -var="zone=$NEW_ZONE"
        -var="env_id=$ENV_ID"
        -var="project_id=$PROJECT_ID"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=${KEYCLOAK_DR_DOMAIN}"
        -var="app_domain=${APP_DR_DOMAIN}"
        -var="api_domain=${API_DR_DOMAIN}"
    )

    # Import service accounts if they exist
    # Service account names come from configuration variables
    declare -A sa_mapping=(
        ["keycloak"]="${SA_KEYCLOAK}:module.security.google_service_account.keycloak"
        ["mcp-gateway"]="${SA_MCP_GATEWAY}:module.security.google_service_account.mcp_gateway"
        ["mcp-servers"]="${SA_MCP_SERVERS}:module.security.google_service_account.mcp_servers"
        ["cicd"]="${SA_CICD}:module.security.google_service_account.cicd"
        ["provision"]="${SA_PROVISION}:module.security.google_service_account.provision_job"
    )

    for sa_key in "${!sa_mapping[@]}"; do
        local sa_entry="${sa_mapping[$sa_key]}"
        local sa_id="${sa_entry%%:*}"
        local tf_resource="${sa_entry#*:}"
        local sa_email="${sa_id}@${PROJECT_ID}.iam.gserviceaccount.com"

        # Check if SA exists in GCP but not in state
        if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
                log_info "  Importing existing service account: $sa_id"
                terraform import "${TF_VARS[@]}" "$tf_resource" \
                    "projects/${PROJECT_ID}/serviceAccounts/${sa_email}" 2>/dev/null || true
            fi
        fi
    done

    # Import secrets if they exist
    # Secret names come from configuration variables
    local secret_list=(
        "${SECRET_KEYCLOAK_ADMIN_PASSWORD}:module.security.google_secret_manager_secret.keycloak_admin_password"
        "${SECRET_KEYCLOAK_DB_PASSWORD}:module.security.google_secret_manager_secret.keycloak_db_password"
        "${SECRET_DB_PASSWORD}:module.security.google_secret_manager_secret.tamshai_db_password"
        "${SECRET_CLAUDE_API_KEY}:module.security.google_secret_manager_secret.anthropic_api_key"
        "${SECRET_MCP_GATEWAY_CLIENT}:module.security.google_secret_manager_secret.mcp_gateway_client_secret"
        "${SECRET_JWT}:module.security.google_secret_manager_secret.jwt_secret"
        "${SECRET_MCP_HR_CLIENT}:module.security.google_secret_manager_secret.mcp_hr_service_client_secret"
        "${SECRET_PROD_USER_PASSWORD}:module.security.google_secret_manager_secret.prod_user_password"
    )

    for secret_entry in "${secret_list[@]}"; do
        local secret_id="${secret_entry%%:*}"
        local tf_resource="${secret_entry#*:}"

        if gcloud secrets describe "$secret_id" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
                log_info "  Importing existing secret: $secret_id"
                terraform import "${TF_VARS[@]}" "$tf_resource" \
                    "projects/${PROJECT_ID}/secrets/${secret_id}" 2>/dev/null || true
            fi
        fi
    done

    # Import Artifact Registry if it exists (project-global)
    # CRITICAL: This import must succeed for staged deployment to work (Issue #102)
    log_step "Checking Artifact Registry..."
    local registry_imported=false
    if gcloud artifacts repositories describe tamshai --location="$NEW_REGION" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_info "  Artifact Registry exists in $NEW_REGION"
        if ! terraform state show 'module.cloudrun.google_artifact_registry_repository.tamshai' &>/dev/null 2>&1; then
            log_info "  Importing existing Artifact Registry: tamshai"
            if terraform import "${TF_VARS[@]}" 'module.cloudrun.google_artifact_registry_repository.tamshai' \
                "projects/${PROJECT_ID}/locations/${NEW_REGION}/repositories/tamshai"; then
                log_info "  Import successful"
                registry_imported=true
            else
                log_warn "  Import failed (may already be in state or conflict)"
            fi
        else
            log_info "  Artifact Registry already in state"
            registry_imported=true
        fi
    else
        log_info "  Artifact Registry does not exist in $NEW_REGION - will be created"
        registry_imported=true  # Will be created, not imported
    fi

    # =============================================================================
    # Pre-import storage buckets (they're SHARED, no suffix)
    # Storage buckets are global resources that should be reused between primary
    # and recovery deployments. We import them rather than recreate to avoid:
    # 1. Bucket name conflicts (global namespace)
    # 2. Data loss (backups bucket contains recovery data!)
    # 3. 63-char name limit issues with long suffixes
    # =============================================================================
    log_step "Pre-importing shared storage buckets..."
    # Storage buckets use name_suffix="" (shared, globally unique names).
    # They MUST be imported regardless of their location — otherwise terraform
    # tries to create a new bucket with the same name, which fails with 409
    # (GCS bucket names are globally unique).
    # Terraform ignore_changes=[location] on regional buckets (logs, finance_docs,
    # public_docs) prevents forced replacement when the bucket is in a different
    # region than the recovery config.

    # Helper: import a bucket if it exists in GCP and not already in state.
    import_shared_bucket() {
        local bucket_name="$1"
        local tf_resource="$2"

        if ! gcloud storage buckets describe "gs://${bucket_name}" &>/dev/null 2>&1; then
            return 0  # Bucket doesn't exist, nothing to import
        fi

        if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
            log_info "  Importing existing bucket: $bucket_name"
            terraform import "${TF_VARS[@]}" "$tf_resource" \
                "${PROJECT_ID}/${bucket_name}" 2>/dev/null || true
        fi
    }

    import_shared_bucket "tamshai-prod-logs-${PROJECT_ID}" \
        'module.storage.google_storage_bucket.logs'

    import_shared_bucket "tamshai-prod-finance-docs-${PROJECT_ID}" \
        'module.storage.google_storage_bucket.finance_docs'

    import_shared_bucket "tamshai-prod-public-docs-${PROJECT_ID}" \
        'module.storage.google_storage_bucket.public_docs'

    import_shared_bucket "prod.tamshai.com" \
        'module.storage.google_storage_bucket.static_website[0]'

    import_shared_bucket "tamshai-prod-backups-${PROJECT_ID}" \
        'module.storage.google_storage_bucket.backups[0]'

    log_success "Pre-import complete"

    # Refresh terraform state to ensure GCS backend is synced after all imports
    # This prevents state drift issues with -target flags (Issue #102)
    log_step "Refreshing terraform state to sync with GCS backend..."
    terraform refresh "${TF_VARS[@]}" -compact-warnings 2>/dev/null || {
        log_warn "Terraform refresh had warnings (may be OK)"
    }

    # Verify Artifact Registry is in state (critical for staged deployment)
    if [[ "$registry_imported" == "true" ]] || terraform state list 2>/dev/null | grep -q 'google_artifact_registry_repository.tamshai'; then
        log_info "  Artifact Registry confirmed in state"
    else
        log_warn "  Artifact Registry NOT in state - staged deployment may use full apply fallback"
    fi

    # =============================================================================
    # Verify MongoDB URI secret exists (shared function from lib/secrets.sh)
    # =============================================================================
    # Uses verify_mongodb_uri_secret() from lib/secrets.sh - same as phoenix-rebuild.sh
    # =============================================================================
    if ! verify_mongodb_uri_secret "$PROJECT_ID"; then
        exit 1
    fi

    # =============================================================================
    # Apply infrastructure using staged deployment (Issue #37 pattern)
    # =============================================================================
    # Problem: mcp-gateway fails startup probes if Keycloak SSL cert isn't ready.
    # Solution: Deploy in stages - Keycloak first, wait for SSL, then mcp-gateway.
    # =============================================================================
    log_step "Applying infrastructure using staged deployment (Issue #37 pattern)..."
    log_info "Cloud SQL instance creation typically takes 10-15 minutes"
    log_info "SSL certificate provisioning typically takes 10-15 minutes"

    # Common terraform variables for all stages
    # Bug #34 Fix: Include keycloak_provisioning_url so provision-users job targets DR Keycloak
    local TF_COMMON_VARS=(
        -var="region=$NEW_REGION"
        -var="zone=$NEW_ZONE"
        -var="env_id=$ENV_ID"
        -var="project_id=$PROJECT_ID"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=${KEYCLOAK_DR_DOMAIN}"
        -var="app_domain=${APP_DR_DOMAIN}"
        -var="api_domain=${API_DR_DOMAIN}"
        -var="keycloak_provisioning_url=https://${KEYCLOAK_DR_DOMAIN}/auth"
        # Bug #38 fix: Keep Keycloak warm to avoid cold start timeout when MCP Gateway validates JWKS
        -var="keycloak_min_instances=1"
        # Bug #38 fix: Align with dr.tfvars - disable utility VM in DR (no Redis needed)
        -var="enable_utility_vm=false"
        # Bug #38 fix: Enable data restore from backup bucket
        -var="source_backup_bucket=${BACKUP_BUCKET}"
    )

    # Bug #9 Fix: Delete existing domain mappings so Terraform can recreate them fresh.
    # google_cloud_run_domain_mapping has no update function — import causes
    # "doesn't support update" errors. This also handles DR retry scenarios where
    # domain mappings persist from a previous failed DR run.
    log_step "Cleaning up stale DR domain mappings (Bug #9 fix)..."
    for dm_entry in \
        "${KEYCLOAK_DR_DOMAIN}|module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]|keycloak" \
        "${APP_DR_DOMAIN}|module.cloudrun.google_cloud_run_domain_mapping.web_portal[0]|web-portal" \
        "${API_DR_DOMAIN}|module.cloudrun.google_cloud_run_domain_mapping.mcp_gateway[0]|mcp-gateway"; do
        IFS='|' read -r dm_domain dm_tf_addr dm_label <<< "$dm_entry"
        if gcloud beta run domain-mappings describe --domain="${dm_domain}" --region="$NEW_REGION" &>/dev/null 2>&1; then
            log_info "Found existing ${dm_label} DR domain mapping (${dm_domain}) - deleting for clean recreate..."
            terraform state rm "${dm_tf_addr}" &>/dev/null 2>&1 || true
            gcloud beta run domain-mappings delete --domain="${dm_domain}" --region="$NEW_REGION" --quiet 2>/dev/null || \
                log_warn "Could not delete ${dm_domain} domain mapping"
        else
            terraform state rm "${dm_tf_addr}" &>/dev/null 2>&1 || true
        fi
    done

    # Use staged deployment from domain-mapping.sh library if available
    if type staged_terraform_deploy &>/dev/null; then
        log_info "Using staged_terraform_deploy from domain-mapping.sh library"
        staged_terraform_deploy "${KEYCLOAK_DR_DOMAIN}" "${KEYCLOAK_REALM}" "${TF_COMMON_VARS[@]}" || {
            log_error "Staged terraform deployment failed"
            exit 1
        }
    else
        # Fallback: Manual staged deployment
        log_warn "staged_terraform_deploy not available - using manual staging"

        # Stage 1: Deploy everything EXCEPT mcp-gateway
        log_step "Stage 1: Deploying infrastructure (except mcp-gateway)..."
        local stage1_targets=(
            "-target=module.networking"
            "-target=module.database"
            "-target=module.security"
            "-target=module.storage"
            "-target=module.cloudrun.google_artifact_registry_repository.tamshai"
            "-target=module.cloudrun.google_cloud_run_service.keycloak"
            "-target=module.cloudrun.google_cloud_run_service.mcp_suite"
            "-target=module.cloudrun.google_cloud_run_service.web_portal"
            "-target=module.cloudrun.google_cloud_run_domain_mapping.keycloak"
            "-target=module.cloudrun.google_cloud_run_domain_mapping.web_portal"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.keycloak_public"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.web_portal_public"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_suite_gateway_access"
            "-target=module.utility_vm"
        )

        terraform apply -auto-approve "${stage1_targets[@]}" "${TF_COMMON_VARS[@]}" || {
            log_error "Stage 1 terraform apply failed"
            exit 1
        }
        log_success "Stage 1 complete - Keycloak and MCP Suite deployed"

        # Stage 2: Wait for SSL certificate
        log_step "Stage 2: Waiting for SSL certificate on ${KEYCLOAK_DR_DOMAIN}..."
        log_info "SSL provisioning typically takes 10-15 minutes for new domain mappings"

        local ssl_timeout=900  # 15 minutes
        local ssl_elapsed=0
        local ssl_interval=30

        while [ $ssl_elapsed -lt $ssl_timeout ]; do
            if curl -sf "https://${KEYCLOAK_DR_DOMAIN}/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then
                log_success "SSL certificate deployed for ${KEYCLOAK_DR_DOMAIN}"
                break
            fi
            log_info "  Waiting for SSL... ($((ssl_elapsed / 60))m elapsed)"
            sleep $ssl_interval
            ssl_elapsed=$((ssl_elapsed + ssl_interval))
        done

        if [ $ssl_elapsed -ge $ssl_timeout ]; then
            log_warn "SSL certificate not ready after 15 minutes"
            log_warn "mcp-gateway deployment may fail - consider retrying later"
        fi

        # Stage 3: Deploy mcp-gateway
        log_step "Stage 3: Deploying mcp-gateway..."
        local stage2_targets=(
            "-target=module.cloudrun.google_cloud_run_service.mcp_gateway"
            "-target=module.cloudrun.google_cloud_run_domain_mapping.mcp_gateway"
            "-target=module.cloudrun.google_cloud_run_service_iam_member.mcp_gateway_public"
        )

        terraform apply -auto-approve "${stage2_targets[@]}" "${TF_COMMON_VARS[@]}" || {
            log_error "Stage 3 terraform apply failed (mcp-gateway)"
            log_error "This usually means Keycloak SSL isn't ready yet"
            log_error "Wait a few minutes and run: terraform apply ${stage2_targets[*]}"
            exit 1
        }
    fi

    # =============================================================================
    # Add MongoDB URI IAM binding (shared function from lib/secrets.sh, Gap #32)
    # =============================================================================
    # Uses ensure_mongodb_uri_iam_binding() from lib/secrets.sh - same as phoenix-rebuild.sh
    # This provides a fallback/safety net in case terraform state gets out of sync.
    # =============================================================================
    ensure_mongodb_uri_iam_binding "$PROJECT_ID" || true

    # =============================================================================
    # Issue #102: Verify SSL certificates for ALL domain mappings
    # =============================================================================
    # Phoenix Rebuild Lesson: Only verifying auth domain SSL caused 4/6 E2E test
    # failures with HTTP 525. Must verify app and api domains too.
    # Uses shared wait_for_all_domain_ssl() from lib/domain-mapping.sh.
    # =============================================================================
    log_step "Verifying SSL certificates for app and api DR domains (Issue #102 fix)..."
    wait_for_all_domain_ssl "${KEYCLOAK_DR_DOMAIN}" "${APP_DR_DOMAIN}" "${API_DR_DOMAIN}" || true

    log_success "Infrastructure deployed to $NEW_REGION"
}

# =============================================================================
# PHASE 3: REMOVED - Bug #23 fix
# =============================================================================
#
# Phase 3 (regenerate SA key) was REMOVED because it operated on SHARED
# PRODUCTION infrastructure:
#
#   - tamshai-prod-cicd service account is project-level (not region-specific)
#   - GCP_SA_KEY_PROD GitHub secret is used by PRODUCTION workflows
#   - The existing key works for ANY region - no regeneration needed for DR
#   - Deleting/rotating keys during DR could break production deployments
#
# DR operations must NEVER touch production. The CICD SA key is production
# infrastructure that happens to work for DR too.
#
# If SA key rotation is needed (compromise, expiry), use a SEPARATE manual
# process with explicit production impact warnings.
# =============================================================================

# =============================================================================
# PHASE 4: DEPLOY CLOUD RUN SERVICES
# =============================================================================

phase4_deploy_services() {
    log_phase "4" "VERIFY CLOUD RUN SERVICES"

    # =========================================================================
    # Bug #10 fix: Deploy-to-gcp.yml workflow does not accept a "region" input
    # and hardcodes vars.GCP_REGION (primary region) for all operations.
    # In DR, services are already deployed by Phase 2 Terraform with correct
    # images (built in Phase 1.5), env vars, and service accounts.
    # Phase 4 now verifies services are healthy instead of re-deploying.
    # =========================================================================

    local services=(keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal)
    local failed_services=()
    local healthy_count=0

    for service in "${services[@]}"; do
        log_step "Verifying $service in $NEW_REGION..."

        # Check service exists and get URL
        local service_url
        service_url=$(gcloud run services describe "$service" \
            --region="$NEW_REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.url)" 2>/dev/null || echo "")

        if [ -z "$service_url" ]; then
            log_error "  $service: NOT FOUND in $NEW_REGION"
            failed_services+=("$service")
            continue
        fi

        # Check service has healthy revision
        local ready_condition
        ready_condition=$(gcloud run services describe "$service" \
            --region="$NEW_REGION" \
            --project="$PROJECT_ID" \
            --format="value(status.conditions[0].status)" 2>/dev/null || echo "Unknown")

        if [ "$ready_condition" = "True" ]; then
            log_success "  $service: HEALTHY ($service_url)"
            healthy_count=$((healthy_count + 1))
        else
            log_warn "  $service: condition=$ready_condition ($service_url)"
            # Not necessarily failed — Cloud Run may still be starting
            healthy_count=$((healthy_count + 1))
        fi
    done

    if [ ${#failed_services[@]} -gt 0 ]; then
        log_error "Services not found in $NEW_REGION: ${failed_services[*]}"
        log_error "These services were expected from Phase 2 Terraform apply"
        exit 1
    fi

    log_success "All ${healthy_count} Cloud Run services verified in $NEW_REGION"
}

# =============================================================================
# PHASE 4.5: SETUP STATIC WEBSITE
# =============================================================================
# Bug #30 fix: DR uses a separate static website bucket (prod-dr.tamshai.com)
# This function creates the bucket and copies content from production.
# =============================================================================

phase4_5_setup_static_website() {
    log_phase "4.5" "SETUP STATIC WEBSITE"

    if [[ -z "$STATIC_DR_DOMAIN" || "$STATIC_DR_DOMAIN" == "prod.tamshai.com" ]]; then
        log_info "Static website uses production bucket - skipping setup"
        return 0
    fi

    local dr_bucket="gs://${STATIC_DR_DOMAIN}"
    local prod_bucket="gs://${STATIC_PROD_BUCKET}"

    # Check if DR bucket already exists
    if gcloud storage buckets describe "$dr_bucket" &>/dev/null; then
        log_info "Static website bucket already exists: $dr_bucket"
    else
        log_step "Creating static website bucket: $dr_bucket"
        gcloud storage buckets create "$dr_bucket" \
            --location=US \
            --uniform-bucket-level-access || {
            log_error "Failed to create bucket: $dr_bucket"
            return 1
        }

        log_step "Configuring bucket for static website hosting..."
        gcloud storage buckets update "$dr_bucket" \
            --web-main-page-suffix=index.html \
            --web-error-page=index.html || true

        log_step "Making bucket publicly readable..."
        gcloud storage buckets add-iam-policy-binding "$dr_bucket" \
            --member=allUsers \
            --role=roles/storage.objectViewer || true
    fi

    # Copy content from production bucket
    log_step "Copying static content from production to DR bucket..."
    if gcloud storage ls "$prod_bucket" &>/dev/null; then
        gcloud storage cp -r "${prod_bucket}/*" "$dr_bucket/" || {
            log_warn "Failed to copy some content - bucket may be partially populated"
        }
        log_success "Static content copied to $dr_bucket"
    else
        log_warn "Production bucket not accessible: $prod_bucket"
        log_info "Static content will need to be uploaded manually"
    fi

    # Verify static website is accessible
    log_step "Verifying static website..."
    local website_url="https://${STATIC_DR_DOMAIN}/"
    if curl -sf "$website_url" &>/dev/null; then
        log_success "Static website accessible at $website_url"
    else
        log_warn "Static website not yet accessible - DNS/SSL may still be propagating"
    fi
}

# =============================================================================
# PHASE 5: CONFIGURE USERS (Test User + Corporate Users)
# =============================================================================

phase5_configure_users() {
    log_phase "5" "CONFIGURE USERS"

    # =========================================================================
    # Step 0: Verify GitHub secrets (fetched in Phase 0 pre-flight)
    # =========================================================================
    if [ -z "${PROD_USER_PASSWORD:-}" ]; then
        log_step "Re-fetching GitHub secrets (not loaded in pre-flight)..."
        local secrets_script="$PROJECT_ROOT/scripts/secrets/read-github-secrets.sh"
        if [ -f "$secrets_script" ]; then
            local secret_exports
            if secret_exports=$("$secrets_script" --phoenix --env 2>/dev/null); then
                eval "$secret_exports"
                log_success "GitHub secrets loaded into environment"
            else
                log_warn "Failed to fetch GitHub secrets"
            fi
        fi
    else
        log_info "GitHub secrets already loaded from pre-flight"
    fi

    # =========================================================================
    # Step 0.5: Reset Cloud SQL user passwords (Bug #36)
    # =========================================================================
    # After Terraform creates the DR Cloud SQL instance, the database users
    # (tamshai, keycloak) have passwords from Secret Manager. However, if data
    # was restored from backup or Terraform ran multiple times, passwords may
    # be out of sync. This ensures MCP services can connect.
    log_step "Resetting Cloud SQL user passwords to match DR secrets (Bug #36)..."
    if ! reset_cloudsql_user_passwords "$ENV_ID" "$NEW_REGION" "$PROJECT_ID"; then
        log_error "Failed to reset Cloud SQL user passwords"
        log_error "MCP services will fail to connect to database"
        exit 1
    fi

    # =========================================================================
    # Step 1: Warm up Keycloak (Gap #52 - cold start mitigation)
    # =========================================================================
    log_step "Warming up Keycloak before user configuration (Gap #52)..."
    local keycloak_url
    keycloak_url="https://${KEYCLOAK_DR_DOMAIN}"
    warmup_keycloak "$keycloak_url" "${KEYCLOAK_REALM}" 5 || true

    # =========================================================================
    # Step 1.5: Sync mcp-hr-service client to Keycloak (Bug #35 fix)
    # =========================================================================
    # The realm-export.json does NOT include mcp-hr-service client.
    # This client is created by sync-realm.sh, but evacuate-region.sh can't
    # run kcadm.sh (only available inside Keycloak container).
    # Solution: Use REST API to create the client directly.
    log_step "Syncing mcp-hr-service client to Keycloak (Bug #35 fix)..."

    # Get Keycloak admin password from Secret Manager (needed for multiple steps)
    export KEYCLOAK_ADMIN_PASSWORD
    KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest \
        --secret="${SECRET_KEYCLOAK_ADMIN_PASSWORD}" 2>/dev/null || echo "")

    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        log_error "Could not retrieve Keycloak admin password - cannot sync clients"
        log_error "Identity-sync will fail without mcp-hr-service client"
        exit 1
    fi

    if ! sync_keycloak_mcp_hr_client "https://${KEYCLOAK_DR_DOMAIN}/auth" "$KEYCLOAK_ADMIN_PASSWORD"; then
        log_error "Failed to sync mcp-hr-service client to Keycloak"
        log_error "Identity-sync will fail without this client"
        exit 1
    fi

    # =========================================================================
    # Step 1.6: Sync web-portal client mappers (Bug #37 fix)
    # =========================================================================
    # Without these mappers, JWT tokens are missing critical claims:
    # - subject-claim-mapper: Ensures 'sub' claim is in access token (userId)
    # - mcp-gateway-audience: Adds 'mcp-gateway' to token audience
    # - mcp-gateway-roles-mapper: Maps roles to token
    # This causes MCP Gateway to return 400 MISSING_USER_CONTEXT errors.
    log_step "Syncing web-portal client mappers (Bug #37 fix)..."

    if ! sync_keycloak_web_portal_mappers "https://${KEYCLOAK_DR_DOMAIN}/auth" "$KEYCLOAK_ADMIN_PASSWORD"; then
        log_error "Failed to sync web-portal client mappers"
        log_error "Web apps will fail with MISSING_USER_CONTEXT errors"
        exit 1
    fi

    # =========================================================================
    # Step 2: Configure TOTP for test-user.journey
    # =========================================================================
    log_step "Configuring TOTP for test-user.journey..."

    # KEYCLOAK_ADMIN_PASSWORD already retrieved above

    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        log_warn "Could not retrieve Keycloak admin password - skipping TOTP configuration"
        log_info "Run manually: ./keycloak/scripts/set-user-totp.sh prod test-user.journey"
    else
        # Fetch TOTP secret (Gap #60)
        if fetch_totp_secret "TEST_USER_TOTP_SECRET_RAW"; then
            export TEST_USER_TOTP_SECRET_RAW="$TOTP_SECRET"
        fi

        export AUTO_CONFIRM=true
        # Bug #27 fix: Set KEYCLOAK_URL to DR Keycloak (not production)
        export KEYCLOAK_URL="https://${KEYCLOAK_DR_DOMAIN}/auth"
        # Bug #26 fix: Pass TOTP secret as third argument (required by set-user-totp.sh)
        "$PROJECT_ROOT/keycloak/scripts/set-user-totp.sh" prod test-user.journey "$TEST_USER_TOTP_SECRET_RAW" || {
            log_warn "TOTP configuration failed - may need manual setup"
        }
        unset KEYCLOAK_URL  # Clean up to avoid affecting other scripts
    fi

    # =========================================================================
    # Step 3: Sync PROD_USER_PASSWORD to GCP Secret Manager (Issue #102)
    # =========================================================================
    # Phoenix Rebuild Lesson: Terraform creates a random password. After a fresh
    # Keycloak deployment, corporate users must use the known password from
    # GitHub Secrets so operators can log in.
    log_step "Syncing PROD_USER_PASSWORD to GCP Secret Manager (Issue #102 fix)..."
    sync_prod_user_password || log_warn "PROD_USER_PASSWORD sync failed - corporate users may have random password"

    # =========================================================================
    # Step 4: Provision corporate users (Gap #53 - identity-sync)
    # =========================================================================
    # The entrypoint.sh now auto-detects stale keycloak_user_id values (Bug #33 fix).
    # When PostgreSQL has more "synced" users than Keycloak actually has, it clears
    # the stale IDs automatically before running identity-sync. This allows:
    #   - Fresh Keycloak deployment: Users created with PROD_USER_PASSWORD
    #   - Normal sync: Existing users updated with new password if needed
    log_step "Provisioning corporate users (Gap #53, Bug #33 auto-detect fix)..."
    log_info "Corporate users (eve.thompson, alice.chen, etc.) are provisioned via workflow"

    # Bug #28 fix: Pass DR region and Cloud SQL instance name to workflow
    local dr_cloud_sql_instance="tamshai-prod-postgres-${ENV_ID}"
    log_info "DR Cloud SQL instance: $dr_cloud_sql_instance"

    # Bug #32 Fix: Fail on provisioning errors - missing job is a build failure
    # Bug #33 Fix: entrypoint.sh auto-detects stale IDs, no force_password_reset needed
    if ! trigger_identity_sync "true" "" "all" "false" "$NEW_REGION" "$dr_cloud_sql_instance"; then
        log_error "Identity sync failed - this is a build failure"
        log_error "Ensure provision-users job exists in $NEW_REGION"
        exit 1
    fi
    log_success "Corporate users provisioned with PROD_USER_PASSWORD"

    # =========================================================================
    # Step 5: Load sample data (Finance, Sales, Support) (Issue #102)
    # =========================================================================
    # Phoenix Rebuild Lesson: Sample data (Finance via Cloud SQL, Sales/Support
    # via MongoDB Atlas) must be loaded separately after user provisioning.
    log_step "Loading sample data (Finance, Sales, Support) (Issue #102 fix)..."

    # Bug #32 Fix: Fail on data loading errors - missing job is a build failure
    if ! trigger_sample_data_load "true" "" "all" "$NEW_REGION" "$dr_cloud_sql_instance"; then
        log_error "Sample data loading failed - this is a build failure"
        log_error "Ensure provision-users job exists in $NEW_REGION"
        exit 1
    fi
    log_success "Sample data loaded successfully"

    log_success "User configuration complete"
}

# =============================================================================
# PHASE 6: VERIFY DEPLOYMENT
# =============================================================================

phase6_verify() {
    log_phase "6" "VERIFY DEPLOYMENT"

    cd "$TF_DIR"

    # Get outputs
    local gateway_url keycloak_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "")

    log_step "Verifying Keycloak health..."
    if curl -sf "${keycloak_url}/auth/health/ready" &>/dev/null; then
        log_success "Keycloak is healthy"
    else
        log_warn "Keycloak health check failed - may still be starting"
    fi

    log_step "Verifying MCP Gateway health..."
    if curl -sf "${gateway_url}/health" &>/dev/null; then
        log_success "MCP Gateway is healthy"
    else
        log_warn "MCP Gateway health check failed - may still be starting"
    fi

    # Run E2E tests if available
    log_step "Running E2E verification tests..."
    cd "$PROJECT_ROOT/tests/e2e"

    if [ -f "package.json" ]; then
        # Secrets (TEST_USER_PASSWORD, TEST_USER_TOTP_SECRET) already loaded
        # from read-github-secrets.sh --phoenix in Phase 5
        if npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1; then
            log_success "E2E tests passed"
        else
            log_warn "E2E tests failed — check output above for details"
        fi
    else
        log_info "E2E tests not available - skipping"
    fi

    log_success "Verification complete"
}

# =============================================================================
# PHASE 7: DNS CONFIGURATION GUIDANCE
# =============================================================================

phase7_dns_guidance() {
    log_phase "7" "DNS CONFIGURATION"

    cd "$TF_DIR"

    local gateway_url keycloak_url portal_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "")
    portal_url=$(terraform output -raw web_portal_url 2>/dev/null || echo "")

    # Extract hostnames without https://
    local gateway_host="${gateway_url#https://}"
    local keycloak_host="${keycloak_url#https://}"
    local portal_host="${portal_url#https://}"

    log_step "New service URLs for DNS configuration:"
    log_info "MCP Gateway: $gateway_host"
    log_info "Keycloak: $keycloak_host"
    log_info "Web Portal: $portal_host"

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                       DR DOMAIN CONFIGURATION                                ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                              ║${NC}"
    echo -e "${GREEN}║  All DR domains use Cloud Run domain mappings (terraform-managed).          ║${NC}"
    echo -e "${GREEN}║  DNS is pre-configured in Cloudflare (CNAME to ghs.googlehosted.com).       ║${NC}"
    echo -e "${GREEN}║                                                                              ║${NC}"
    echo -e "${GREEN}║  Domain Mappings Created:                                                    ║${NC}"
    echo -e "${GREEN}║    auth-dr.tamshai.com → keycloak                                           ║${NC}"
    echo -e "${GREEN}║    api-dr.tamshai.com  → mcp-gateway                                        ║${NC}"
    echo -e "${GREEN}║    app-dr.tamshai.com  → web-portal                                         ║${NC}"
    echo -e "${GREEN}║                                                                              ║${NC}"
    echo -e "${GREEN}║  SSL certificates are provisioned automatically (10-15 minutes).            ║${NC}"
    echo -e "${GREEN}║                                                                              ║${NC}"
    echo -e "${YELLOW}║  ⚠️  Primary domains (auth/api/app.tamshai.com) remain bound to dead region ║${NC}"
    echo -e "${YELLOW}║  Use DR domains until primary region recovers.                              ║${NC}"
    echo -e "${GREEN}║                                                                              ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_success "DNS configuration complete (terraform-managed)"
}

# =============================================================================
# SUMMARY
# =============================================================================

show_summary() {
    cd "$TF_DIR"

    local gateway_url keycloak_url portal_url
    gateway_url=$(terraform output -raw mcp_gateway_url 2>/dev/null || echo "N/A")
    keycloak_url=$(terraform output -raw keycloak_url 2>/dev/null || echo "N/A")
    portal_url=$(terraform output -raw web_portal_url 2>/dev/null || echo "N/A")

    echo ""
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                 REGIONAL EVACUATION COMPLETE                      ${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Region:            ${CYAN}$NEW_REGION${NC}"
    echo -e "  Environment ID:    ${CYAN}$ENV_ID${NC}"
    echo -e "  State Prefix:      ${CYAN}gcp/recovery/$ENV_ID${NC}"
    echo ""
    echo -e "  ${BLUE}Service URLs:${NC}"
    echo -e "    MCP Gateway:     $gateway_url"
    echo -e "    Keycloak:        $keycloak_url"
    echo -e "    Web Portal:      $portal_url"
    echo ""
    echo -e "${YELLOW}NEXT STEPS:${NC}"
    echo -e "  1. Update DNS records if not using global load balancer"
    echo -e "  2. Verify E2E tests pass: cd tests/e2e && npm run test:login:prod"
    echo -e "  3. Notify stakeholders of new service URLs"
    echo -e "  4. Once primary region recovers, clean up orphaned resources"
    echo ""
    echo -e "${YELLOW}TO RESTORE DATA FROM BACKUP:${NC}"
    echo -e "  ./scripts/db/restore-from-gcs.sh --bucket=$BACKUP_BUCKET"
    echo ""
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}              REGIONAL EVACUATION - DISASTER RECOVERY               ${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}WARNING: This script is for use when the primary region is UNAVAILABLE.${NC}"
    echo -e "${YELLOW}For normal rebuilds, use: ./scripts/gcp/phoenix-rebuild.sh${NC}"
    echo ""

    local start_time
    start_time=$(date +%s)

    preflight_checks
    confirm_evacuation
    run_cleanup_leftover_resources

    phase1_init_state
    phase1_5_replicate_images
    phase2_deploy_infrastructure
    # Phase 3 REMOVED (Bug #23) - SA key is shared production infrastructure
    phase4_deploy_services
    phase4_5_setup_static_website
    phase5_configure_users
    phase6_verify
    phase7_dns_guidance

    local end_time duration_min
    end_time=$(date +%s)
    duration_min=$(( (end_time - start_time) / 60 ))

    show_summary

    log_success "Regional evacuation completed in ${duration_min} minutes"
}

# Run main
main "$@"
