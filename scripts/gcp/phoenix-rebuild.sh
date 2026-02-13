#!/bin/bash
# =============================================================================
# Phoenix Rebuild - GCP Production Environment
# =============================================================================
#
# Complete rebuild of the GCP production environment from scratch.
# Implements lessons learned from Issues #20-25.
#
# Phases:
#   1. Pre-flight      - Run all validation checks
#   2. Secret Sync     - Sync GitHub secrets to GCP Secret Manager
#   3. Terraform Destroy - Disable deletion protection, destroy
#   4. Terraform Infra - Create VPC, Cloud SQL, Artifact Registry
#   5. Build Images    - Cloud Build all 8 images
#   6. Regenerate Keys - Create new CICD SA key, update GitHub secret
#   7. Terraform Cloud Run - Complete terraform apply
#   8. Deploy Services - Trigger deploy-to-gcp.yml with health gates
#   9. Configure TOTP  - Set test-user.journey TOTP
#   10. Provision & Verify - Users, data, E2E tests
#
# Usage:
#   ./phoenix-rebuild.sh [options]
#
# Options:
#   --skip-preflight   Skip pre-flight checks
#   --skip-destroy     Skip terraform destroy (partial rebuild)
#   --resume           Resume from last checkpoint
#   --phase N          Start from specific phase (1-10)
#   --dry-run          Show what would be done without executing
#
# =============================================================================

# Issue #16: Using set -eo (not -u) because gcloud wrapper uses unbound $CLOUDSDK_PYTHON
# This causes all gcloud commands to fail with "unbound variable" when -u is enabled
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Bug #20 SAFETY: Unset GCP_DR_REGION to ensure phoenix NEVER uses a DR region.
# This protects against accidental cross-contamination if user ran a DR script
# earlier in the same shell session.
unset GCP_DR_REGION

# Default GCP configuration (resolved from prod.tfvars or GCP_REGION env var below)
export GCP_REGION="${GCP_REGION:-}"

# Issue #17: GCP_PROJECT must be set before sourcing libraries (verify.sh requires it)
export GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

# Source libraries
source "$SCRIPT_DIR/lib/common.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/secrets.sh"
source "$SCRIPT_DIR/lib/health-checks.sh"
source "$SCRIPT_DIR/lib/dynamic-urls.sh"
source "$SCRIPT_DIR/lib/verify.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/cleanup.sh" 2>/dev/null || true
source "$SCRIPT_DIR/lib/domain-mapping.sh" 2>/dev/null || true

# Terraform directory (needed for tfvars loading)
TF_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"
TFVARS_DIR="$TF_DIR/environments"

# =============================================================================
# TFVARS CONFIGURATION LOADING (Issue #102)
# =============================================================================
# Load configuration from prod.tfvars to avoid hardcoded values.
# Values can be overridden by environment variables.
# Priority: Environment vars > tfvars > hardcoded defaults
# =============================================================================

load_tfvars_config() {
    local tfvars_file="${TFVARS_DIR}/prod.tfvars"

    if [ ! -f "$tfvars_file" ]; then
        return 1
    fi

    # Load configuration values
    TFVAR_REGION=$(get_tfvar "region" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_ZONE=$(get_tfvar "zone" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_KEYCLOAK_DOMAIN=$(get_tfvar "keycloak_domain" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_STATIC_WEBSITE_DOMAIN=$(get_tfvar "static_website_domain" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_APP_DOMAIN=$(get_tfvar "app_domain" "$tfvars_file" 2>/dev/null || echo "")
    TFVAR_API_DOMAIN=$(get_tfvar "api_domain" "$tfvars_file" 2>/dev/null || echo "")

    return 0
}

# Load tfvars configuration
load_tfvars_config || true

# Apply configuration: Environment vars > tfvars (no hardcoded region default)
export GCP_REGION="${GCP_REGION:-${TFVAR_REGION:-}}"
if [[ -z "$GCP_REGION" ]]; then
    echo "ERROR: GCP_REGION not set. Set via env var or check prod.tfvars" >&2
    exit 1
fi
export GCP_ZONE="${GCP_ZONE:-${TFVAR_ZONE:-${GCP_REGION}-c}}"

# Keycloak domain: env var > tfvars > default
KEYCLOAK_DOMAIN="${KEYCLOAK_DOMAIN:-${TFVAR_KEYCLOAK_DOMAIN:-${KEYCLOAK_DOMAIN}}}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-tamshai-corp}"

# Domain configuration: env var > tfvars > defaults
STATIC_WEBSITE_DOMAIN="${STATIC_WEBSITE_DOMAIN:-${TFVAR_STATIC_WEBSITE_DOMAIN:-prod.tamshai.com}}"
APP_DOMAIN="${APP_DOMAIN:-${TFVAR_APP_DOMAIN:-app.tamshai.com}}"
API_DOMAIN="${API_DOMAIN:-${TFVAR_API_DOMAIN:-api.tamshai.com}}"

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

# Checkpoint file for resume capability
CHECKPOINT_FILE="${HOME}/.phoenix-rebuild-progress.json"

# Options
SKIP_PREFLIGHT=false
SKIP_DESTROY=false
RESUME_MODE=false
START_PHASE=1
DRY_RUN=false
AUTO_YES=false  # Gap #61: Skip interactive confirmations for automated runs

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
        --skip-destroy) SKIP_DESTROY=true; shift ;;
        --resume) RESUME_MODE=true; shift ;;
        --phase) START_PHASE="$2"; shift 2 ;;
        --phase=*) START_PHASE="${1#*=}"; shift ;;  # Issue #22: Support --phase=N syntax
        --dry-run) DRY_RUN=true; shift ;;
        --yes|-y) AUTO_YES=true; shift ;;  # Gap #61: Skip interactive confirmations
        -h|--help) show_help; exit 0 ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_phase() { echo -e "\n${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"; echo -e "${MAGENTA}║  PHASE $1: $2${NC}"; echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
Phoenix Rebuild - GCP Production Environment

Usage: ./phoenix-rebuild.sh [options]

Options:
  --skip-preflight   Skip pre-flight checks
  --skip-destroy     Skip terraform destroy (partial rebuild)
  --resume           Resume from last checkpoint
  --phase N          Start from specific phase (1-10)
  --dry-run          Show what would be done without executing
  --yes, -y          Skip interactive confirmations (for automated runs)
  -h, --help         Show this help message

Phases:
  1. Pre-flight      Run all validation checks
  2. Secret Sync     Sync secrets to GCP Secret Manager
  3. Terraform Destroy Destroy existing infrastructure
  4. Terraform Infra Create VPC, Cloud SQL, Artifact Registry
  5. Build Images    Cloud Build all container images
  6. Regenerate Keys Create new CICD SA key
  7. Terraform Cloud Run Deploy Cloud Run services
  8. Deploy Services Trigger GitHub Actions workflow
  9. Configure TOTP  Set test-user.journey TOTP
  10. Provision & Verify Users, data, E2E tests

Environment Variables:
  GCP_PROJECT_ID     GCP project ID (or set via gcloud config)
  KEYCLOAK_ADMIN_PASSWORD  Keycloak admin password
  TEST_USER_TOTP_SECRET_RAW Raw TOTP secret for test user

EOF
}

# =============================================================================
# Checkpoint Management
# =============================================================================
save_checkpoint() {
    local phase="$1"
    local status="$2"
    local message="${3:-}"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$CHECKPOINT_FILE" << EOF
{
    "phase": $phase,
    "status": "$status",
    "message": "$message",
    "timestamp": "$timestamp",
    "project_id": "${GCP_PROJECT_ID:-unknown}",
    "script_version": "1.0.0"
}
EOF

    log_info "Checkpoint saved: Phase $phase - $status"
}

load_checkpoint() {
    if [ -f "$CHECKPOINT_FILE" ]; then
        local phase
        phase=$(jq -r '.phase' "$CHECKPOINT_FILE" 2>/dev/null) || phase=1
        local status
        status=$(jq -r '.status' "$CHECKPOINT_FILE" 2>/dev/null) || status="unknown"
        local timestamp
        timestamp=$(jq -r '.timestamp' "$CHECKPOINT_FILE" 2>/dev/null) || timestamp="unknown"

        log_info "Found checkpoint: Phase $phase ($status) at $timestamp"
        echo "$phase"
    else
        echo "1"
    fi
}

clear_checkpoint() {
    if [ -f "$CHECKPOINT_FILE" ]; then
        rm -f "$CHECKPOINT_FILE"
        log_info "Checkpoint cleared"
    fi
}

# =============================================================================
# Phase 1: Pre-flight Checks
# =============================================================================
phase_1_preflight() {
    log_phase "1" "Pre-flight Checks"

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
            log_warn "Failed to fetch GitHub secrets — some phases may fail"
            log_warn "Ensure 'gh auth status' is authenticated and export-test-secrets.yml exists"
        fi
    else
        log_warn "read-github-secrets.sh not found at $secrets_script"
    fi

    # Verify critical secret was loaded
    if [ -z "${PROD_USER_PASSWORD:-}" ]; then
        log_warn "PROD_USER_PASSWORD not available after secret fetch"
        log_warn "Corporate users will get random passwords after rebuild"
    fi

    if [ "$SKIP_PREFLIGHT" = true ]; then
        log_warn "Skipping pre-flight checks (--skip-preflight)"
        save_checkpoint 1 "skipped"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run: ./scripts/gcp/phoenix-preflight.sh"
        return 0
    fi

    log_step "Running pre-flight validation..."

    if "$SCRIPT_DIR/phoenix-preflight.sh"; then
        log_success "Pre-flight checks passed"
        save_checkpoint 1 "completed"
        return 0
    else
        log_error "Pre-flight checks failed"
        save_checkpoint 1 "failed"
        echo ""
        echo "Fix the issues above and run with --resume to continue."
        exit 1
    fi
}

# =============================================================================
# Phase 2: Secret Sync
# =============================================================================
# CRITICAL: Gap #41 - mcp-hr-service-client-secret must have a version
# BEFORE Terraform runs. This phase ensures all secrets exist with versions.
# =============================================================================
phase_2_secret_sync() {
    log_phase "2" "Secret Sync (GitHub -> GCP)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would sync secrets to GCP Secret Manager"
        return 0
    fi

    # Gap #41: Sync secrets from environment variables to GCP
    log_step "Syncing secrets from environment variables (Gap #41)..."
    sync_secrets_from_env || log_warn "Some secrets could not be synced from environment"

    # Gap #41 / Issue #102: Sync mcp-hr-service-client-secret from GitHub
    # This MUST happen BEFORE any Terraform operations because Terraform creates
    # the secret shell but doesn't add a version, causing Cloud Run deployment to fail.
    # Issue #102: GitHub Secrets is the source of truth - sync from env, don't generate random.
    log_step "CRITICAL: Syncing mcp-hr-service-client-secret from GitHub (Gap #41, Issue #102)..."
    sync_mcp_hr_client_secret || {
        log_error "FAILED to sync mcp-hr-service-client-secret from GitHub"
        log_error "This will cause Cloud Run deployment to fail!"
        log_error "Ensure MCP_HR_SERVICE_CLIENT_SECRET is set in environment (from GitHub Actions)"
        log_error "Manual fix: export MCP_HR_SERVICE_CLIENT_SECRET='value' then re-run"
        exit 1
    }

    log_step "Verifying GCP secrets exist..."

    if verify_gcp_secrets; then
        log_success "All required GCP secrets verified"
    else
        log_warn "Some GCP secrets missing - they may need manual creation"
        echo ""
        echo "Required secrets:"
        for secret in "${REQUIRED_GCP_SECRETS[@]}"; do
            echo "  - $secret"
        done
        echo ""
        echo "Create missing secrets using:"
        echo "  gcloud secrets create SECRET_NAME --data-file=- <<< 'value'"
    fi

    log_step "Checking secret hygiene (Issue #25 fix)..."
    check_all_secrets_hygiene || log_warn "Some secrets have hygiene issues"

    save_checkpoint 2 "completed"
    log_success "Phase 2 complete"
}

# =============================================================================
# Phase 3: Terraform Destroy
# =============================================================================
phase_3_destroy() {
    log_phase "3" "Terraform Destroy"

    if [ "$SKIP_DESTROY" = true ]; then
        log_warn "Skipping terraform destroy (--skip-destroy)"
        save_checkpoint 3 "skipped"
        return 0
    fi

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform directory not found: $tf_dir"
        exit 1
    fi

    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform destroy in $tf_dir"
        return 0
    fi

    # =============================================================================
    # Bug #14: Detect and remove recovery VPCs from primary terraform state
    # =============================================================================
    # After DR evacuation, the primary terraform state may contain a recovery VPC
    # (e.g., tamshai-prod-recovery-20260127-1041-vpc). If not removed, terraform
    # destroy/apply will try to delete it, fail on phantom firewall rules (GCP
    # eventual consistency), and block ALL resource operations.
    # =============================================================================
    log_step "Checking for recovery VPC in primary terraform state (Bug #14)..."

    local state_vpc_name=""
    state_vpc_name=$(terraform state show 'module.networking.google_compute_network.vpc' 2>/dev/null \
        | grep -E '^\s+name\s*=' | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "")

    if [[ -n "$state_vpc_name" && "$state_vpc_name" == *"recovery"* ]]; then
        log_warn "Recovery VPC found in primary state: $state_vpc_name"
        log_warn "Removing all networking resources from state to prevent terraform failure..."

        # Remove the recovery VPC and all related networking resources
        terraform state rm 'module.networking.google_compute_network.vpc' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_subnetwork.subnet' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_router.router' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_router_nat.nat' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true
        terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_global_address.private_ip_range' 2>/dev/null || true
        terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true

        log_success "Recovery VPC removed from primary terraform state"
    elif [ -n "$state_vpc_name" ]; then
        log_info "Primary state VPC is correct: $state_vpc_name"
    else
        log_info "No VPC found in primary state (clean state)"
    fi

    # Also scan GCP for orphaned recovery VPCs and attempt cleanup
    local recovery_vpcs
    recovery_vpcs=$(gcloud compute networks list \
        --filter="name~^tamshai-prod-recovery-" \
        --format="value(name)" \
        --project="${GCP_PROJECT_ID}" 2>/dev/null) || recovery_vpcs=""

    if [ -n "$recovery_vpcs" ]; then
        log_warn "Orphaned recovery VPCs found in GCP — attempting cleanup..."
        while read -r rvpc; do
            [ -z "$rvpc" ] && continue
            log_info "  Cleaning up recovery VPC: $rvpc"

            # Delete firewall rules on this VPC
            local rvpc_fws
            rvpc_fws=$(gcloud compute firewall-rules list \
                --filter="network:${rvpc}" \
                --format="value(name)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || rvpc_fws=""
            while read -r fw; do
                [ -z "$fw" ] && continue
                gcloud compute firewall-rules delete "$fw" --quiet --project="${GCP_PROJECT_ID}" 2>/dev/null || true
            done <<< "$rvpc_fws"

            # Delete subnets
            local rvpc_subnets
            rvpc_subnets=$(gcloud compute networks subnets list \
                --network="$rvpc" \
                --format="csv[no-heading](name,region)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || rvpc_subnets=""
            while IFS=',' read -r sn_name sn_region; do
                [ -z "$sn_name" ] && continue
                gcloud compute networks subnets delete "$sn_name" \
                    --region="$sn_region" --quiet --project="${GCP_PROJECT_ID}" 2>/dev/null || true
            done <<< "$rvpc_subnets"

            # Delete the VPC
            gcloud compute networks delete "$rvpc" --quiet --project="${GCP_PROJECT_ID}" 2>/dev/null || \
                log_warn "  Could not delete $rvpc — may have phantom firewall references (GCP eventual consistency)"
        done <<< "$recovery_vpcs"
    fi

    # Pre-destroy cleanup (Gap #21, #22, #38)
    log_step "Running pre-destroy cleanup..."

    log_step "Deleting Cloud Run jobs (Gap #21)..."
    gcloud run jobs delete provision-users --region="${GCP_REGION}" --quiet 2>/dev/null || true

    # Gap #38: Delete Cloud Run services BEFORE terraform destroy
    # This releases database connections that would otherwise block keycloak DB deletion
    log_step "Deleting Cloud Run services to release DB connections (Gap #38)..."
    local services=("keycloak" "mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "web-portal")
    for svc in "${services[@]}"; do
        if gcloud run services describe "$svc" --region="${GCP_REGION}" &>/dev/null; then
            log_info "  Deleting $svc..."
            gcloud run services delete "$svc" --region="${GCP_REGION}" --quiet 2>/dev/null || true
        fi
    done
    log_info "Waiting for connections to close..."
    sleep 10

    log_step "Disabling deletion protection on Cloud SQL (Gap #22)..."
    local instance_name="tamshai-prod-postgres"
    if gcloud sql instances describe "$instance_name" &>/dev/null; then
        gcloud sql instances patch "$instance_name" \
            --no-deletion-protection \
            --quiet 2>/dev/null || log_warn "Could not disable deletion protection"
    fi

    # =============================================================================
    # PROACTIVE cleanup for KNOWN destroy issues (Gaps #39, #40, #23, #24, #25)
    # These are handled BEFORE terraform destroy to prevent failures
    # =============================================================================

    # Handle terraform state lock (common issue after interrupted operations)
    # Issue #36 Fix: Check GCS directly for lock file (avoids creating new locks)
    log_step "Checking for stale terraform state locks..."
    local LOCK_FILE="gs://tamshai-terraform-state-prod/gcp/phase1/default.tflock"
    if gcloud storage cat "$LOCK_FILE" &>/dev/null; then
        log_warn "Found stale lock file in GCS - force unlocking..."
        local lock_id
        lock_id=$(gcloud storage cat "$LOCK_FILE" 2>/dev/null | grep -o '"ID":"[0-9]*"' | grep -o '[0-9]*' | head -1) || true
        if [ -n "$lock_id" ]; then
            log_info "  Force unlocking lock ID: $lock_id"
            terraform force-unlock -force "$lock_id" 2>/dev/null || true
        fi
        # Also delete the lock file directly as backup
        log_info "  Removing lock file from GCS..."
        gcloud storage rm "$LOCK_FILE" 2>/dev/null || true
    fi

    # Gap #39: Empty ALL storage buckets BEFORE destroy (force_destroy=false in terraform)
    # Bucket names derived from variables (supports prod.tamshai.com and prod-dr.tamshai.com)
    log_step "Emptying storage buckets before destroy (Gap #39)..."
    local buckets=("${STATIC_WEBSITE_DOMAIN}" "tamshai-prod-finance-docs" "tamshai-prod-finance-docs-${GCP_PROJECT_ID}")
    # Skip empty bucket names (DR may not have static website domain set)
    local non_empty_buckets=()
    for b in "${buckets[@]}"; do
        [ -n "$b" ] && non_empty_buckets+=("$b")
    done
    buckets=("${non_empty_buckets[@]}")
    for bucket in "${buckets[@]}"; do
        if gcloud storage ls "gs://${bucket}" &>/dev/null 2>&1; then
            log_info "  Emptying gs://${bucket}..."
            gcloud storage rm -r "gs://${bucket}/**" 2>/dev/null || log_info "  Bucket ${bucket} already empty"
        fi
    done

    # Gap #40 + Issue #14: Delete Cloud SQL instance AND WAIT for deletion
    # Cloud SQL deletion is async - VPC peering can't be deleted until Cloud SQL is gone
    log_step "Deleting Cloud SQL instance (Gap #40 + Issue #14 dependency)..."
    if gcloud sql instances describe "$instance_name" &>/dev/null; then
        log_warn "Deleting Cloud SQL instance: $instance_name (takes 30-90 seconds)"
        gcloud sql instances delete "$instance_name" --quiet 2>/dev/null || log_warn "Cloud SQL deletion command may have failed"

        # Issue #14: WAIT for Cloud SQL deletion to complete
        # VPC peering cannot be deleted while Cloud SQL is still using the connection
        local sql_wait=0
        local sql_max_wait=18  # 18 * 10s = 3 minutes max
        while gcloud sql instances describe "$instance_name" &>/dev/null; do
            sql_wait=$((sql_wait + 1))
            if [ $sql_wait -ge $sql_max_wait ]; then
                log_warn "Cloud SQL deletion timeout - VPC peering deletion may fail"
                break
            fi
            echo "   Waiting for Cloud SQL deletion... [$sql_wait/$sql_max_wait]"
            sleep 10
        done

        if ! gcloud sql instances describe "$instance_name" &>/dev/null; then
            log_success "Cloud SQL instance deleted"
        fi

        # Remove from state since we deleted it manually
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.postgres_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.tamshai_user' 2>/dev/null || true  # Issue #27
        terraform state rm 'module.database.google_sql_database.keycloak_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
    fi

    # =============================================================================
    # Issue #103 FIX: Delete VPC Access Connector before terraform destroy
    # =============================================================================
    # VPC connectors have known terraform timeout issues. Delete via gcloud and
    # remove from state. VPC peering and private IP are left in terraform state —
    # terraform destroy handles them through its dependency graph. If terraform
    # fails on VPC peering (GCP stale references after Cloud SQL deletion), the
    # error handler below retries with gcloud fallback.
    # =============================================================================

    # Delete VPC Access Connector (Issue #103)
    # Uses shared library function which handles:
    #   - Primary connector deletion + wait
    #   - Orphaned connector scan
    #   - Auto-created firewall rule cleanup (aet-* pattern)
    log_step "Deleting VPC Access Connector (Gap #25 + Issue #103)..."
    if type delete_vpc_connector_and_wait &>/dev/null; then
        delete_vpc_connector_and_wait || log_warn "VPC connector cleanup had issues — continuing"
    else
        log_error "delete_vpc_connector_and_wait not available — cleanup.sh library may not have loaded"
    fi

    # Remove VPC connector from Terraform state (deleted via gcloud above)
    log_step "Removing VPC connector from Terraform state..."
    terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true

    # VPC peering (service_networking_connection) and private IP (compute_global_address)
    # remain in terraform state — terraform destroy deletes them in dependency order.

    log_success "Proactive cleanup complete - terraform destroy handles VPC peering + private IP"

    # =============================================================================
    # Issue #28 FIX: Delete secrets and remove IAM bindings BEFORE terraform destroy
    # =============================================================================
    # Secrets persist across terraform destroy, causing 409 conflicts on next apply.
    # More importantly, if we delete secrets after terraform starts destroying,
    # terraform will fail trying to delete IAM bindings for non-existent secrets.
    #
    # Solution: Delete secrets and remove their IAM bindings from state BEFORE
    # terraform destroy runs.
    # =============================================================================
    log_step "Pre-emptively deleting secrets (Gap #2 moved before destroy - Issue #28)..."
    # Use configuration variables for secret names
    for secret in \
        "${SECRET_KEYCLOAK_ADMIN_PASSWORD}" \
        "${SECRET_KEYCLOAK_DB_PASSWORD}" \
        "${SECRET_DB_PASSWORD}" \
        "${SECRET_CLAUDE_API_KEY}" \
        "${SECRET_MCP_GATEWAY_CLIENT}" \
        "${SECRET_JWT}" \
        mcp-hr-service-client-secret \
        prod-user-password; do
        gcloud secrets delete "$secret" --quiet 2>/dev/null || true
    done

    log_step "Removing secret IAM bindings from state BEFORE destroy (Issue #28)..."
    # Keycloak-related IAM bindings
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.keycloak_admin_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.keycloak_db_access' 2>/dev/null || true
    # MCP Gateway-related IAM bindings
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_anthropic_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_client_secret_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_jwt_access' 2>/dev/null || true
    # MCP Servers-related IAM bindings
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_servers_db_access' 2>/dev/null || true
    # Cloud Build-related IAM bindings
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.cloudbuild_db_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.cloudbuild_keycloak_admin' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.cloudbuild_mcp_hr_client' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.cloudbuild_prod_user_password' 2>/dev/null || true
    # Provision job-related IAM bindings
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.provision_job_db_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.provision_job_keycloak_admin' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.provision_job_mcp_hr_client' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.provision_job_prod_user_password' 2>/dev/null || true
    # Secret shells and versions (they were just deleted via gcloud)
    terraform state rm 'module.security.google_secret_manager_secret.keycloak_admin_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.keycloak_db_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.tamshai_db_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.anthropic_api_key' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.mcp_gateway_client_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.jwt_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.mcp_hr_service_client_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret.prod_user_password' 2>/dev/null || true
    # Secret versions
    terraform state rm 'module.security.google_secret_manager_secret_version.keycloak_admin_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.keycloak_db_password' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.anthropic_api_key' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.mcp_gateway_client_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.jwt_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.mcp_hr_service_client_secret' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_version.prod_user_password' 2>/dev/null || true

    # Remove cicd service account from state (has prevent_destroy=true)
    # The cicd SA persists across Phoenix rebuilds to preserve its key in GitHub Secrets
    log_step "Removing cicd service account from state (prevent_destroy lifecycle)..."
    terraform state rm 'module.security.google_service_account.cicd' 2>/dev/null || true

    # ── Bug #15: Temporarily disable prevent_destroy for full phoenix teardown ──
    # prevent_destroy must be a literal bool in .tf files (terraform limitation #22544, #30957).
    # We sed-toggle it to false for destroy, then git-restore afterward.
    # This allows phoenix to destroy everything while keeping prevent_destroy = true
    # as the committed/deployed default that protects against accidental destruction.
    local TF_MODULES_DIR="$PROJECT_ROOT/infrastructure/terraform/modules"

    log_step "Disabling prevent_destroy for phoenix teardown (Bug #15)..."
    sed -i 's/prevent_destroy = true/prevent_destroy = false/g' \
        "${TF_MODULES_DIR}/storage/main.tf" \
        "${TF_MODULES_DIR}/security/main.tf" \
        "${TF_MODULES_DIR}/cloudrun/main.tf"
    log_info "prevent_destroy disabled in storage, security, cloudrun modules"

    log_step "Running terraform destroy..."
    echo ""
    echo -e "${YELLOW}WARNING: This will DESTROY all GCP infrastructure!${NC}"
    # Gap #61: Skip wait if --yes flag is set (for automated runs)
    if [ "$AUTO_YES" = true ]; then
        log_warn "AUTO_YES=true - skipping 10-second warning delay"
    else
        echo "Press Ctrl+C to abort, or wait 10 seconds to continue..."
        sleep 10
    fi

    terraform destroy -auto-approve || {
        log_warn "Terraform destroy had errors - attempting cleanup..."

        # =============================================================================
        # GAPS #23-25: Comprehensive Terraform State Cleanup
        # =============================================================================
        # These gaps address common Phoenix rebuild blockers:
        # - Gap #23: Service networking connection blocks VPC deletion
        # - Gap #24: Private IP address blocks VPC deletion
        # - Gap #25: VPC connector count dependency causes errors
        #
        # The state cleanup removes resources that would otherwise require manual
        # deletion or cause circular dependency issues during destroy.

        # Issue #14 FIX (fallback): Delete VPC peering FIRST, then private IP
        log_step "Deleting VPC peering connection (Issue #14 - fallback)..."
        gcloud services vpc-peerings delete \
            --network="tamshai-prod-vpc" \
            --service=servicenetworking.googleapis.com \
            --quiet 2>/dev/null || true
        # Brief wait for peering deletion
        sleep 15

        # Gap #23: Remove service networking from state
        log_step "Removing service networking from state (Gap #23)..."
        terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true

        # Gap #24: Delete private IP (now possible after peering deleted)
        log_step "Deleting orphaned private IP (Gap #24)..."
        gcloud compute addresses delete tamshai-prod-private-ip --global --quiet 2>/dev/null || true

        # Gap #25 + Issue #103: Delete VPC connector and auto-created firewall rules
        log_step "Deleting VPC connector and auto-created firewall rules (Gap #25 + Issue #103 - fallback)..."
        delete_vpc_connector_and_wait 2>/dev/null || true
        # Also remove from state
        terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true

        # Additional state cleanup for persistent resources
        log_step "Removing Cloud SQL resources from state..."
        terraform state rm 'module.database.google_sql_database.keycloak_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.postgres_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.tamshai_user' 2>/dev/null || true  # Issue #27
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true

        # Retry targeted VPC destroy
        log_step "Attempting targeted VPC destroy..."
        terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve 2>/dev/null || true

        # Final retry of full destroy
        log_step "Retrying terraform destroy..."
        terraform destroy -auto-approve || log_warn "Destroy may be incomplete - verify manually"
    }

    # ── Bug #15: Restore prevent_destroy = true (committed default) ──
    # This must happen after destroy, regardless of success or failure.
    # Phase 4 terraform apply will then create resources with prevent_destroy = true.
    log_step "Restoring prevent_destroy protections (Bug #15)..."
    git checkout -- \
        "${TF_MODULES_DIR}/storage/main.tf" \
        "${TF_MODULES_DIR}/security/main.tf" \
        "${TF_MODULES_DIR}/cloudrun/main.tf"
    log_info "prevent_destroy restored to true in all modules"

    # Post-destroy verification (Gap #1a)
    log_step "Running post-destroy verification (Gap #1a)..."

    local verification_failed=false

    # Check for orphaned Cloud Run services
    if gcloud run services list --region="${GCP_REGION}" --format="value(name)" 2>/dev/null | grep -qE "^(keycloak|mcp-|web-portal)"; then
        log_warn "Orphaned Cloud Run services found - deleting..."
        for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
            gcloud run services delete "$svc" --region="${GCP_REGION}" --quiet 2>/dev/null || true
        done
    fi

    # Check for orphaned Cloud SQL — actively delete if found
    if gcloud sql instances list --format="value(name)" 2>/dev/null | grep -q "tamshai"; then
        log_warn "Orphaned Cloud SQL instance found - deleting..."
        gcloud sql instances patch "tamshai-prod-postgres" --no-deletion-protection --quiet 2>/dev/null || true
        gcloud sql instances delete "tamshai-prod-postgres" --quiet 2>/dev/null || true
        local sql_wait=0
        while gcloud sql instances describe "tamshai-prod-postgres" &>/dev/null; do
            sql_wait=$((sql_wait + 1))
            if [ $sql_wait -ge 18 ]; then
                log_error "Cloud SQL deletion timed out after 3 minutes"
                verification_failed=true
                break
            fi
            echo "   Waiting for Cloud SQL deletion... [$sql_wait/18]"
            sleep 10
        done
        [ "$verification_failed" != true ] && log_success "Orphaned Cloud SQL deleted"
    fi

    # Check for orphaned VPCs — actively delete if found (Bug #14: handles recovery VPCs too)
    # Deletion order per VPC: VMs → firewall rules → subnets → routers → VPC network
    local all_tamshai_vpcs
    all_tamshai_vpcs=$(gcloud compute networks list \
        --filter="name~^tamshai-prod" \
        --format="value(name)" \
        --project="${GCP_PROJECT_ID}" 2>/dev/null) || all_tamshai_vpcs=""

    if [ -n "$all_tamshai_vpcs" ]; then
        while read -r vpc_name; do
            [ -z "$vpc_name" ] && continue
            log_warn "Orphaned VPC found: $vpc_name — cleaning up resources..."

            # Step 1: Delete all VM instances on this VPC (they block subnet deletion)
            local vm_instances
            vm_instances=$(gcloud compute instances list \
                --filter="networkInterfaces.network:${vpc_name}" \
                --format="csv[no-heading](name,zone)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || true
            if [ -n "$vm_instances" ]; then
                log_info "Deleting VM instances on VPC $vpc_name..."
                while IFS=',' read -r vm_name vm_zone; do
                    [ -z "$vm_name" ] && continue
                    log_info "  Deleting VM: $vm_name (zone: $vm_zone)"
                    gcloud compute instances delete "$vm_name" \
                        --zone="$vm_zone" --quiet --project="${GCP_PROJECT_ID}" 2>&1 || \
                        log_warn "  Failed to delete VM $vm_name"
                done <<< "$vm_instances"
            fi

            # Step 2: Delete all firewall rules on this VPC
            local fw_rules
            fw_rules=$(gcloud compute firewall-rules list \
                --filter="network:${vpc_name}" \
                --format="value(name)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || true
            if [ -n "$fw_rules" ]; then
                log_info "Deleting firewall rules on $vpc_name..."
                while read -r rule; do
                    [ -z "$rule" ] && continue
                    log_info "  Deleting firewall rule: $rule"
                    gcloud compute firewall-rules delete "$rule" --quiet --project="${GCP_PROJECT_ID}" 2>&1 || \
                        log_warn "  Failed to delete firewall rule $rule"
                done <<< "$fw_rules"
            fi

            # Step 2b: Delete auto-created VPC connector firewall rules (Issue #103)
            # Network filter misses auto-created aet-* rules — use shared library fallback
            delete_vpc_connector_firewall_rules 2>/dev/null || true

            # Step 3: Delete all subnets in this VPC
            local subnets
            subnets=$(gcloud compute networks subnets list \
                --network="${vpc_name}" \
                --format="csv[no-heading](name,region)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || true
            if [ -n "$subnets" ]; then
                log_info "Deleting subnets on $vpc_name..."
                while IFS=',' read -r subnet_name subnet_region; do
                    [ -z "$subnet_name" ] && continue
                    log_info "  Deleting subnet: $subnet_name (region: $subnet_region)"
                    gcloud compute networks subnets delete "$subnet_name" \
                        --region="$subnet_region" --quiet --project="${GCP_PROJECT_ID}" 2>&1 || \
                        log_warn "  Failed to delete subnet $subnet_name"
                done <<< "$subnets"
            fi

            # Step 4: Delete Cloud Routers (and their NAT gateways) on this VPC
            local routers
            routers=$(gcloud compute routers list \
                --filter="network:${vpc_name}" \
                --format="csv[no-heading](name,region)" \
                --project="${GCP_PROJECT_ID}" 2>/dev/null) || true
            if [ -n "$routers" ]; then
                log_info "Deleting Cloud Routers on $vpc_name..."
                while IFS=',' read -r router_name router_region; do
                    [ -z "$router_name" ] && continue
                    log_info "  Deleting router: $router_name (region: $router_region)"
                    gcloud compute routers delete "$router_name" \
                        --region="$router_region" --quiet --project="${GCP_PROJECT_ID}" 2>&1 || \
                        log_warn "  Failed to delete router $router_name"
                done <<< "$routers"
            fi

            # Step 5: Delete the VPC network
            log_info "Deleting VPC network: ${vpc_name}"
            if gcloud compute networks delete "${vpc_name}" --quiet --project="${GCP_PROJECT_ID}" 2>&1; then
                log_success "Orphaned VPC deleted: $vpc_name"
            else
                log_error "Failed to delete VPC $vpc_name - checking remaining dependencies:"
                gcloud compute routers list --filter="network:${vpc_name}" --project="${GCP_PROJECT_ID}" 2>&1 || true
                gcloud compute networks subnets list --network="${vpc_name}" --project="${GCP_PROJECT_ID}" 2>&1 || true
                gcloud compute instances list --filter="networkInterfaces.network:${vpc_name}" --project="${GCP_PROJECT_ID}" 2>&1 || true
                verification_failed=true
            fi
        done <<< "$all_tamshai_vpcs"
    fi

    # Gap #1b: Remove stale state entries
    log_step "Removing stale state entries (Gap #1b)..."
    for resource in \
        'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]' \
        'module.cloudrun.google_cloud_run_service.mcp_suite["support"]' \
        'module.cloudrun.google_cloud_run_service.keycloak' \
        'module.cloudrun.google_cloud_run_service.mcp_gateway' \
        'module.cloudrun.google_cloud_run_service.web_portal[0]'; do
        terraform state rm "$resource" 2>/dev/null || true
    done

    # Note: Gap #2 (secret deletion) and Issue #28 (IAM binding state removal) are now
    # handled BEFORE terraform destroy to prevent the "secret not found" errors.
    # See the pre-destroy cleanup section above.

    if [ "$verification_failed" = true ]; then
        log_error "Post-destroy verification failed - manual cleanup required"
        save_checkpoint 3 "failed"
        exit 1
    fi

    save_checkpoint 3 "completed"
    log_success "Phase 3 complete - Infrastructure destroyed and verified"
}

# =============================================================================
# Phase 4: Terraform Infrastructure
# =============================================================================
phase_4_infrastructure() {
    log_phase "4" "Terraform Infrastructure (VPC, Cloud SQL, Registry)"

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"
    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform init && terraform apply (target=infra)"
        return 0
    fi

    log_step "Initializing Terraform..."
    terraform init -upgrade

    # =============================================================================
    # Bug #14 Safety Net: Verify no recovery VPC in state before apply
    # =============================================================================
    # This catches the case where Phase 3 was skipped (--phase 4, --skip-destroy)
    # or the recovery VPC was imported after Phase 3 ran.
    # =============================================================================
    log_step "Verifying no recovery VPC in terraform state (Bug #14 safety net)..."
    local p4_vpc_name=""
    p4_vpc_name=$(terraform state show 'module.networking.google_compute_network.vpc' 2>/dev/null \
        | grep -E '^\s+name\s*=' | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "")

    if [[ -n "$p4_vpc_name" && "$p4_vpc_name" == *"recovery"* ]]; then
        log_warn "Recovery VPC detected in state: $p4_vpc_name"
        log_warn "Removing to prevent terraform apply failure (Bug #14 safety net)..."
        terraform state rm 'module.networking.google_compute_network.vpc' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_subnetwork.subnet' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_router.router' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_router_nat.nat' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
        terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true
        terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.networking.google_compute_global_address.private_ip_range' 2>/dev/null || true
        terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
        terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true
        log_success "Recovery VPC removed from state — terraform apply will create fresh resources"
    elif [ -n "$p4_vpc_name" ]; then
        log_info "State VPC is correct: $p4_vpc_name"
    else
        log_info "No VPC in state (clean apply expected)"
    fi

    # Issue #24: Create artifact registry FIRST using gcloud
    # Terraform targeted apply can fail if provision_users job tries to update before images exist
    # Creating via gcloud is more reliable and avoids the chicken-and-egg problem
    log_step "Ensuring Artifact Registry exists (Issue #24)..."
    local registry_name="tamshai"
    if ! gcloud artifacts repositories describe "$registry_name" --location="${GCP_REGION}" &>/dev/null; then
        log_info "Creating Artifact Registry: $registry_name"
        gcloud artifacts repositories create "$registry_name" \
            --location="${GCP_REGION}" \
            --repository-format=docker \
            --description="Docker container images for Tamshai Enterprise AI" \
            --project="${GCP_PROJECT_ID}" || log_warn "Artifact Registry creation may have failed"
    else
        log_info "Artifact Registry already exists: $registry_name"
    fi

    # Import artifact registry into terraform state if not already there
    if ! terraform state show 'module.cloudrun.google_artifact_registry_repository.tamshai' &>/dev/null; then
        log_info "Importing Artifact Registry into Terraform state..."
        terraform import 'module.cloudrun.google_artifact_registry_repository.tamshai' \
            "projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/repositories/${registry_name}" || log_warn "Import may have failed"
    fi

    # Import cicd service account (removed from state in Phase 3 due to prevent_destroy)
    local cicd_email="${SA_CICD}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
    if ! terraform state show 'module.security.google_service_account.cicd' &>/dev/null; then
        if gcloud iam service-accounts describe "$cicd_email" &>/dev/null 2>&1; then
            log_info "Importing cicd service account into Terraform state..."
            terraform import 'module.security.google_service_account.cicd' \
                "projects/${GCP_PROJECT_ID}/serviceAccounts/${cicd_email}" || log_warn "cicd SA import may have failed"
        fi
    fi

    # Import existing workload service accounts (they survive terraform destroy when state is empty)
    log_step "Importing existing service accounts into Terraform state..."
    local sa_imports=(
        "${SA_KEYCLOAK}:module.security.google_service_account.keycloak"
        "${SA_MCP_GATEWAY}:module.security.google_service_account.mcp_gateway"
        "${SA_MCP_SERVERS}:module.security.google_service_account.mcp_servers"
        "${SA_PROVISION}:module.security.google_service_account.provision_job"
    )
    for sa_entry in "${sa_imports[@]}"; do
        local sa_name="${sa_entry%%:*}"
        local tf_resource="${sa_entry##*:}"
        local sa_email="${sa_name}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
        if ! terraform state show "$tf_resource" &>/dev/null 2>&1; then
            if gcloud iam service-accounts describe "$sa_email" &>/dev/null 2>&1; then
                log_info "  Importing $sa_name..."
                terraform import "$tf_resource" \
                    "projects/${GCP_PROJECT_ID}/serviceAccounts/${sa_email}" 2>/dev/null || \
                    log_warn "  Import of $sa_name may have failed"
            fi
        fi
    done

    # Issue #30: Build provision-job BEFORE terraform apply
    # The provision_users Cloud Run Job in module.security references this image.
    # Without building it first, terraform will fail with "image not found" error.
    #
    # Issue #30b: Use minimal build context to avoid uploading 7.6GB repo
    # Only copy the files actually needed by the Dockerfile:
    # - services/mcp-hr/ (for identity-sync)
    # - sample-data/*.sql (SQL sample data)
    # - scripts/gcp/provision-job/ (Dockerfile and entrypoint)
    log_step "Building provision-job image (Issue #30: required before module.security)..."
    local registry="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${registry_name}"
    if [ -f "$PROJECT_ROOT/scripts/gcp/provision-job/Dockerfile" ]; then
        # Create minimal build context (~50MB instead of 7.6GB)
        local build_context="/tmp/provision-job-context-$$"
        mkdir -p "$build_context/services" "$build_context/sample-data" "$build_context/scripts/gcp"

        log_info "Creating minimal build context for provision-job..."
        cp -r "$PROJECT_ROOT/services/mcp-hr" "$build_context/services/"
        rm -rf "$build_context/services/mcp-hr/node_modules"  # Exclude host node_modules — Dockerfile runs npm ci
        cp "$PROJECT_ROOT/sample-data"/*.sql "$build_context/sample-data/" 2>/dev/null || true
        cp -r "$PROJECT_ROOT/scripts/gcp/provision-job" "$build_context/scripts/gcp/"

        local provision_config="/tmp/provision-cloudbuild-phase4-$$.yaml"
        cat > "$provision_config" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/provision-job:latest', '-f', 'scripts/gcp/provision-job/Dockerfile', '.']
images:
  - '${registry}/provision-job:latest'
EOF
        # Use the helper function from health-checks.sh for VPC-SC compatible builds
        if command -v submit_and_wait_build &>/dev/null; then
            submit_and_wait_build "$build_context" "--config=$provision_config" || log_warn "provision-job build failed"
        else
            # Fallback to direct gcloud builds submit
            gcloud builds submit "$build_context" \
                --config="$provision_config" \
                --project="${GCP_PROJECT_ID}" || log_warn "provision-job build failed"
        fi
        rm -f "$provision_config"
        rm -rf "$build_context"
        log_success "provision-job image built successfully"
    else
        log_warn "No Dockerfile found for provision-job - terraform may fail"
    fi

    log_step "Creating infrastructure (VPC, Cloud SQL)..."
    # First, create just the infrastructure without Cloud Run services
    # This allows images to be built before Cloud Run needs them
    # Note: Artifact registry is already created above via gcloud (Issue #24)
    terraform apply -auto-approve \
        -target=module.networking \
        -target=module.security \
        -target=module.database \
        -target=module.storage \
        2>/dev/null || {
        log_warn "Targeted apply had errors - checking for Gap #44 (Cloud SQL state mismatch)..."

        # Gap #44: Cloud SQL instance may exist but not be in Terraform state
        # This happens when Cloud SQL creation takes >15 minutes and Terraform loses track
        local instance_name="tamshai-prod-postgres"
        if gcloud sql instances describe "$instance_name" &>/dev/null; then
            log_step "Cloud SQL instance exists - checking if it needs to be imported (Gap #44)..."

            # Check if instance is in terraform state
            if ! terraform state show 'module.database.google_sql_database_instance.postgres' &>/dev/null; then
                log_warn "Cloud SQL instance exists in GCP but not in Terraform state - importing..."
                terraform import 'module.database.google_sql_database_instance.postgres' \
                    "projects/${GCP_PROJECT_ID}/instances/${instance_name}" || log_warn "Import may have failed"
            fi
        fi

        # Retry apply after potential import
        terraform apply -auto-approve || log_warn "Terraform apply may be incomplete"
    }

    # Cloud SQL with private networking (ipv4Enabled=false) can take 15-27 minutes.
    # Root cause: google_service_networking_connection reports "created" at the API level,
    # but the underlying VPC peering handshake continues propagating internally. Cloud SQL
    # sits in PENDING_CREATE waiting for the internal IP assignment to complete.
    #
    # Diagnostic commands if PENDING_CREATE exceeds 30 minutes:
    #   gcloud sql operations list --instance=tamshai-prod-postgres --limit=5
    #   gcloud sql operations describe [OPERATION_ID]   # Look for error/status messages
    #   gcloud services vpc-peerings list --network=tamshai-prod-vpc
    #   gcloud compute addresses list --global --filter="purpose=VPC_PEERING"
    #   # Verify: range >= /24, no overlap with subnet CIDR (10.0.0.0/24)
    #   # Check Service Agent: service-[PROJECT_NUMBER]@gcp-sa-cloud-sql.iam.gserviceaccount.com
    log_step "Waiting for Cloud SQL to be ready..."
    wait_for_cloudsql "tamshai-prod-postgres" 1800  # 30 min — Cloud SQL with private networking can take 25+ min

    # Ensure Cloud SQL Service Agent exists (auto-created but can lag behind instance creation)
    # This SA is needed for backup bucket IAM bindings (backups_cloudsql_writer)
    log_step "Ensuring Cloud SQL Service Agent exists..."
    gcloud beta services identity create \
        --service=sqladmin.googleapis.com \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || log_warn "Could not create Cloud SQL Service Agent (may already exist)"

    # Gap #26/41 / Issue #102: Sync mcp-hr-service-client-secret from GitHub
    log_step "Syncing mcp-hr-service-client-secret from GitHub (Gap #26/41, Issue #102)..."
    sync_mcp_hr_client_secret || log_warn "Could not sync mcp-hr-service-client-secret"

    save_checkpoint 4 "completed"
    log_success "Phase 4 complete - Infrastructure created"
}

# =============================================================================
# Phase 5: Build Images
# =============================================================================
# NOTE: Images MUST be built BEFORE Phase 7 (Cloud Run) because Terraform
# will fail with "image not found" if Cloud Run is created before images exist.
#
# BUILD PATTERNS (Gaps #55-58 documentation):
# ============================================
# 1. MCP Services (standard build):
#    gcloud builds submit services/$service \
#      --tag=${REGISTRY}/${service}:latest
#    Context: services/$service (contains Dockerfile)
#
# 2. Keycloak (Gap #55, #56):
#    gcloud builds submit keycloak/ \
#      --tag=.../keycloak:v2.0.0-postgres
#      --config=<inline-cloudbuild.yaml>
#    Uses Dockerfile.cloudbuild (no BuildKit --chmod flags)
#    Cloud Build doesn't support BuildKit-specific syntax
#
# 3. Web Portal (Gap #57, #58):
#    gcloud builds submit . \
#      --config=<inline-cloudbuild.yaml with -f clients/web/Dockerfile.prod>
#    MUST be built from repo root because Dockerfile.prod references:
#    - COPY clients/web/package*.json
#    - COPY clients/web/ (monorepo paths)
#
# KEY INSIGHT: The --tag flag ONLY works when:
#   a) Dockerfile is in the build context root, OR
#   b) You use a cloudbuild.yaml with explicit --dockerfile flag
# =============================================================================
phase_5_build_images() {
    log_phase "5" "Build Container Images"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would trigger Cloud Build for all images"
        return 0
    fi

    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    local region="${GCP_REGION}"
    local registry="${region}-docker.pkg.dev/${project}/tamshai"

    log_step "Building container images via Cloud Build..."

    # Build MCP services (standard Dockerfile)
    # Issue #25: Use submit_and_wait_build to handle VPC-SC log streaming issues
    local mcp_services=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support")
    for service in "${mcp_services[@]}"; do
        log_info "Building $service..."
        if [ -f "$PROJECT_ROOT/services/$service/Dockerfile" ]; then
            submit_and_wait_build "$PROJECT_ROOT/services/$service" \
                "--tag=${registry}/${service}:latest" || log_warn "Build failed for $service"
        else
            log_warn "No Dockerfile found for $service"
        fi
    done

    # Gap #45: Keycloak - use Dockerfile.cloudbuild to avoid BuildKit --chmod issue
    # Issue #20: Can't use both --tag and --config (mutually exclusive)
    # Issue #21: Process substitution <() doesn't work on Windows
    log_info "Building keycloak (using Dockerfile.cloudbuild for Cloud Build compatibility)..."
    if [ -f "$PROJECT_ROOT/keycloak/Dockerfile.cloudbuild" ]; then
        # Create temp cloudbuild.yaml (Windows-compatible)
        local keycloak_config="/tmp/keycloak-cloudbuild-$$.yaml"
        cat > "$keycloak_config" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/keycloak:v2.0.0-postgres', '-f', 'Dockerfile.cloudbuild', '.']
images:
  - '${registry}/keycloak:v2.0.0-postgres'
EOF
        # Issue #25: Use submit_and_wait_build to handle VPC-SC log streaming issues
        submit_and_wait_build "$PROJECT_ROOT/keycloak" \
            "--config=$keycloak_config" || log_warn "Keycloak build failed"
        rm -f "$keycloak_config"
    elif [ -f "$PROJECT_ROOT/keycloak/Dockerfile" ]; then
        # Fallback to regular Dockerfile (may fail if using BuildKit syntax)
        log_warn "Dockerfile.cloudbuild not found, using regular Dockerfile (may fail)"
        submit_and_wait_build "$PROJECT_ROOT/keycloak" \
            "--tag=${registry}/keycloak:v2.0.0-postgres" || log_warn "Keycloak build failed - create Dockerfile.cloudbuild without --chmod flag"
    else
        log_error "No Dockerfile found for keycloak"
    fi

    # Issue #26/#30b: provision-job - use minimal build context (~50MB instead of 7.6GB repo)
    # Only copies files actually needed by the Dockerfile
    log_info "Building provision-job (minimal context for fast upload)..."
    if [ -f "$PROJECT_ROOT/scripts/gcp/provision-job/Dockerfile" ]; then
        # Create minimal build context
        local provision_context="/tmp/provision-job-context-phase5-$$"
        mkdir -p "$provision_context/services" "$provision_context/sample-data" "$provision_context/scripts/gcp"
        cp -r "$PROJECT_ROOT/services/mcp-hr" "$provision_context/services/"
        rm -rf "$provision_context/services/mcp-hr/node_modules"  # Exclude host node_modules — Dockerfile runs npm ci
        cp "$PROJECT_ROOT/sample-data"/*.sql "$provision_context/sample-data/" 2>/dev/null || true
        cp -r "$PROJECT_ROOT/scripts/gcp/provision-job" "$provision_context/scripts/gcp/"

        local provision_config="/tmp/provision-cloudbuild-$$.yaml"
        cat > "$provision_config" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/provision-job:latest', '-f', 'scripts/gcp/provision-job/Dockerfile', '.']
images:
  - '${registry}/provision-job:latest'
EOF
        submit_and_wait_build "$provision_context" \
            "--config=$provision_config" || log_warn "provision-job build failed"
        rm -f "$provision_config"
        rm -rf "$provision_context"
    else
        log_warn "No Dockerfile found for provision-job"
    fi

    # Gap #46: web-portal - must be built from repo root with -f flag
    # Issue #21: Process substitution <() doesn't work on Windows/Git Bash
    log_info "Building web-portal (from repo root with explicit Dockerfile path)..."
    if [ -f "$PROJECT_ROOT/clients/web/Dockerfile.prod" ]; then
        # Create temp cloudbuild.yaml (Windows-compatible)
        local webportal_config="/tmp/webportal-cloudbuild-$$.yaml"
        cat > "$webportal_config" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${registry}/web-portal:latest', '-f', 'clients/web/Dockerfile.prod', '.']
images:
  - '${registry}/web-portal:latest'
EOF
        # Issue #25: Use submit_and_wait_build to handle VPC-SC log streaming issues
        submit_and_wait_build "$PROJECT_ROOT" \
            "--config=$webportal_config" || log_warn "web-portal build failed"
        rm -f "$webportal_config"
    else
        log_warn "No Dockerfile.prod found for web-portal"
    fi

    # Verify all images were built
    log_step "Verifying images in Artifact Registry..."
    local all_images=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support" "keycloak" "provision-job" "web-portal")
    local missing=0
    for img in "${all_images[@]}"; do
        if gcloud artifacts docker images describe "${registry}/${img}:latest" &>/dev/null 2>&1 || \
           gcloud artifacts docker images describe "${registry}/${img}:v2.0.0-postgres" &>/dev/null 2>&1; then
            log_success "  Found: $img"
        else
            log_error "  MISSING: $img"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -gt 0 ]; then
        log_error "$missing images are missing - Cloud Run deployment will fail!"
        log_error "Fix the build issues above before continuing."
        save_checkpoint 5 "failed"
        exit 1
    fi

    save_checkpoint 5 "completed"
    log_success "Phase 5 complete - All images built"
}

# =============================================================================
# Phase 6: Regenerate Service Account Key
# =============================================================================
phase_6_regenerate_keys() {
    log_phase "6" "Regenerate Service Account Keys"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would regenerate CICD SA key and update GitHub secret"
        return 0
    fi

    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
    local sa_email="${SA_CICD}@${project}.iam.gserviceaccount.com"
    local key_file="/tmp/gcp-sa-key-$$.json"

    log_step "Creating new service account key for ${SA_CICD}..."

    # Check if SA exists
    if ! gcloud iam service-accounts describe "$sa_email" &>/dev/null; then
        log_warn "Service account $sa_email not found - may be created by Terraform"
        save_checkpoint 6 "skipped"
        return 0
    fi

    # Create new key
    gcloud iam service-accounts keys create "$key_file" \
        --iam-account="$sa_email" \
        --quiet

    if [ ! -f "$key_file" ]; then
        log_error "Failed to create service account key"
        exit 1
    fi

    log_step "Updating GitHub secret: GCP_SA_KEY_PROD..."

    if gh secret set GCP_SA_KEY_PROD < "$key_file"; then
        log_success "GitHub secret updated"
    else
        log_error "Failed to update GitHub secret"
        rm -f "$key_file"
        exit 1
    fi

    # Issue #10 Fix: Validate the new key works before continuing
    log_step "Validating new SA key (Issue #10 fix)..."

    # Temporarily activate the new key to verify it works
    local current_account
    current_account=$(gcloud config get-value account 2>/dev/null) || true

    if gcloud auth activate-service-account --key-file="$key_file" 2>/dev/null; then
        # Verify we can access the project
        if gcloud projects describe "$project" --format="value(projectId)" &>/dev/null; then
            log_success "New SA key validated - can access project"
        else
            log_error "New SA key cannot access project!"
            rm -f "$key_file"
            exit 1
        fi

        # Restore previous auth if we had one
        if [ -n "$current_account" ]; then
            gcloud config set account "$current_account" 2>/dev/null || true
        fi
    else
        log_warn "Could not validate new SA key (may need manual verification)"
    fi

    # Clean up
    rm -f "$key_file"

    save_checkpoint 6 "completed"
    log_success "Phase 6 complete - Keys regenerated and validated"
}

# =============================================================================
# Phase 7: Terraform Cloud Run
# =============================================================================
phase_7_cloud_run() {
    log_phase "7" "Terraform Cloud Run Services"

    local tf_dir="$PROJECT_ROOT/infrastructure/terraform/gcp"
    cd "$tf_dir"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run terraform apply (full)"
        return 0
    fi

    # Ensure Cloud SQL Service Agent exists (needed for backups bucket IAM)
    # This agent is auto-created but can lag behind - force creation to avoid terraform errors
    log_step "Ensuring Cloud SQL Service Agent exists..."
    gcloud beta services identity create \
        --service=sqladmin.googleapis.com \
        --project="${GCP_PROJECT_ID}" 2>/dev/null || log_warn "Could not create Cloud SQL Service Agent (may already exist)"

    # Bug #9 Fix: Delete existing domain mappings so Terraform can recreate them fresh.
    # google_cloud_run_domain_mapping has NO update function in the Terraform provider.
    # Importing them causes "doesn't support update" errors during apply because Terraform
    # detects drift in provider-managed attributes (terraform_labels) but cannot update.
    # Solution: delete stale mappings from GCP + remove from state → Terraform creates fresh.
    log_step "Cleaning up stale domain mappings (Bug #9 fix)..."
    local region="${GCP_REGION}"
    local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"

    # Helper: delete domain mapping from GCP and remove from Terraform state
    cleanup_domain_mapping() {
        local domain="$1"
        local tf_address="$2"
        local label="$3"

        if gcloud beta run domain-mappings describe --domain="${domain}" --region="$region" &>/dev/null 2>&1; then
            log_info "Found existing ${label} domain mapping (${domain}) - deleting for clean recreate..."
            # Remove from Terraform state first (if present) to avoid state/GCP mismatch
            terraform state rm "${tf_address}" &>/dev/null 2>&1 || true
            # Delete from GCP so Terraform can create fresh
            gcloud beta run domain-mappings delete --domain="${domain}" --region="$region" --quiet 2>/dev/null || \
                log_warn "Could not delete ${domain} domain mapping - may need manual cleanup"
        else
            log_info "No existing ${label} domain mapping found - will be created by Terraform"
            # Also ensure it's not orphaned in state
            terraform state rm "${tf_address}" &>/dev/null 2>&1 || true
        fi
    }

    cleanup_domain_mapping "${KEYCLOAK_DOMAIN}" \
        'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' "keycloak"
    cleanup_domain_mapping "${APP_DOMAIN}" \
        'module.cloudrun.google_cloud_run_domain_mapping.web_portal[0]' "web-portal"
    cleanup_domain_mapping "${API_DOMAIN}" \
        'module.cloudrun.google_cloud_run_domain_mapping.mcp_gateway[0]' "mcp-gateway"

    # Issue #31: Preemptive Artifact Registry import (before terraform apply)
    # The repository may exist from Phase 5 builds but not be in terraform state
    log_step "Checking for existing Artifact Registry to import (Issue #31)..."
    if gcloud artifacts repositories describe tamshai --location="$region" &>/dev/null 2>&1; then
        if ! terraform state show 'module.cloudrun.google_artifact_registry_repository.tamshai' &>/dev/null 2>&1; then
            log_info "Importing existing Artifact Registry repository..."
            terraform import 'module.cloudrun.google_artifact_registry_repository.tamshai' \
                "projects/${project}/locations/${region}/repositories/tamshai" 2>/dev/null || \
                log_warn "Artifact Registry import failed - may already be in state"
        else
            log_info "Artifact Registry already in terraform state"
        fi
    else
        log_info "Artifact Registry does not exist yet - will be created by terraform"
    fi

    # Import existing static website bucket if it exists but isn't in state
    # Supports both prod.tamshai.com (prod) and prod-dr.tamshai.com (DR)
    if [ -n "${STATIC_WEBSITE_DOMAIN}" ]; then
        log_step "Checking for existing static website bucket to import (${STATIC_WEBSITE_DOMAIN})..."
        if gcloud storage ls "gs://${STATIC_WEBSITE_DOMAIN}" &>/dev/null 2>&1; then
            if ! terraform state show 'module.storage.google_storage_bucket.static_website[0]' &>/dev/null 2>&1; then
                log_info "Importing existing static website bucket: ${STATIC_WEBSITE_DOMAIN}"
                terraform import 'module.storage.google_storage_bucket.static_website[0]' \
                    "${STATIC_WEBSITE_DOMAIN}" 2>/dev/null || \
                    log_warn "Static website bucket import failed - may already be in state"
            else
                log_info "Static website bucket already in terraform state"
            fi
        else
            log_info "Static website bucket does not exist yet - will be created by terraform"
        fi
    else
        log_info "No static website domain configured - skipping bucket import"
    fi

    # Issue #35: Wait for SSL certificate BEFORE terraform apply
    # mcp-gateway startup probes call ${KEYCLOAK_DOMAIN} for JWT validation
    # If SSL isn't ready, startup probe fails with HTTP 525
    log_step "Checking SSL certificate status before deploying services (Issue #35)..."
    if gcloud beta run domain-mappings describe --domain=${KEYCLOAK_DOMAIN} --region="$region" &>/dev/null 2>&1; then
        log_info "Domain mapping exists - checking if SSL certificate is deployed..."
        local ssl_ready=false
        local max_attempts=30  # 15 minutes max (30 * 30s)

        for attempt in $(seq 1 $max_attempts); do
            if curl -sf "https://${KEYCLOAK_DOMAIN}/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then
                log_success "SSL certificate is deployed and working!"
                ssl_ready=true
                break
            fi
            if [ $attempt -eq 1 ]; then
                log_info "SSL certificate not ready yet - waiting (this can take 10-15 minutes)..."
            fi
            log_info "  Waiting for SSL certificate... (attempt $attempt/$max_attempts)"
            sleep 30
        done

        if [ "$ssl_ready" = false ]; then
            log_warn "SSL certificate not verified after 15 minutes"
            log_warn "mcp-gateway may fail startup probes - check GCP console if deploy fails"
        fi
    else
        log_info "Domain mapping does not exist yet - SSL check will happen after terraform apply"
    fi

    # Issue #37 Fix: Split terraform apply into two stages
    # Stage 1: Deploy Keycloak + MCP Suite + domain mapping (creates SSL cert)
    # Stage 2: Wait for SSL, then deploy mcp-gateway (which needs Keycloak JWKS)

    log_step "Stage 1: Deploying Keycloak and MCP Suite (Issue #37 fix)..."
    log_info "mcp-gateway will be deployed in Stage 2 after SSL is ready"

    # Deploy everything EXCEPT mcp-gateway first
    # This creates the keycloak domain mapping and starts SSL provisioning
    local stage1_targets=(
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

    terraform apply -auto-approve "${stage1_targets[@]}" || {
        log_error "Stage 1 terraform apply failed"
        save_checkpoint 7 "failed"
        exit 1
    }
    log_success "Stage 1 complete - Keycloak and MCP Suite deployed"

    # Stage 2: Wait for SSL certificate on ${KEYCLOAK_DOMAIN}
    log_step "Stage 2: Waiting for SSL certificate on ${KEYCLOAK_DOMAIN} (Issue #37 fix)..."
    log_info "SSL provisioning typically takes 10-15 minutes for new domain mappings"

    local ssl_ready=false
    local max_ssl_attempts=45  # 22.5 minutes max (45 * 30s)

    for attempt in $(seq 1 $max_ssl_attempts); do
        if curl -sf "https://${KEYCLOAK_DOMAIN}/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then
            log_success "SSL certificate is deployed and working!"
            ssl_ready=true
            break
        fi
        if [ $attempt -eq 1 ]; then
            log_info "SSL certificate not ready yet - starting wait loop..."
        fi
        log_info "  Waiting for SSL certificate... (attempt $attempt/$max_ssl_attempts)"
        sleep 30
    done

    if [ "$ssl_ready" = false ]; then
        log_error "SSL certificate not ready after 22.5 minutes"
        log_error "mcp-gateway cannot start without SSL - check GCP Console"
        log_error "Domain mapping: https://console.cloud.google.com/run/domains?project=$GCP_PROJECT_ID"
        save_checkpoint 7 "failed"
        exit 1
    fi

    # Stage 3: Deploy mcp-gateway (now that SSL is ready)
    log_step "Stage 3: Deploying mcp-gateway (SSL is ready)..."

    # Issue #11 Fix: Handle 409 conflicts from previous interrupted applies
    local apply_output
    local apply_exit_code=0

    # Run full terraform apply to create mcp-gateway
    apply_output=$(terraform apply -auto-approve 2>&1) || apply_exit_code=$?

    if [ $apply_exit_code -ne 0 ]; then
        # Check if this is a recoverable error (409 conflict or domain mapping update)
        local is_409=false
        local is_domain_update=false
        echo "$apply_output" | grep -q "Error 409.*already exists" && is_409=true
        echo "$apply_output" | grep -q "doesn't support update" && is_domain_update=true

        if [ "$is_409" = true ] || [ "$is_domain_update" = true ]; then
            [ "$is_409" = true ] && log_warn "Detected 409 conflict - resources exist but not in state (Issue #11)"
            [ "$is_domain_update" = true ] && log_warn "Detected domain mapping update error (Bug #9)"
            log_info "Attempting auto-recovery..."

            local region="${GCP_REGION}"
            local project="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"

            # Import Cloud Run services if they exist but not in state (services support updates)
            if echo "$apply_output" | grep -q "mcp-gateway.*already exists"; then
                if gcloud run services describe mcp-gateway --region="$region" &>/dev/null; then
                    log_info "Importing existing mcp-gateway service..."
                    terraform import 'module.cloudrun.google_cloud_run_service.mcp_gateway' \
                        "locations/${region}/namespaces/${project}/services/mcp-gateway" 2>/dev/null || true
                fi
            fi

            if echo "$apply_output" | grep -q "keycloak.*already exists"; then
                if gcloud run services describe keycloak --region="$region" &>/dev/null; then
                    log_info "Importing existing keycloak service..."
                    terraform import 'module.cloudrun.google_cloud_run_service.keycloak' \
                        "locations/${region}/namespaces/${project}/services/keycloak" 2>/dev/null || true
                fi
            fi

            for svc in hr finance sales support; do
                if echo "$apply_output" | grep -q "mcp-${svc}.*already exists"; then
                    if gcloud run services describe "mcp-${svc}" --region="$region" &>/dev/null; then
                        log_info "Importing existing mcp-${svc} service..."
                        terraform import "module.cloudrun.google_cloud_run_service.mcp_suite[\"${svc}\"]" \
                            "locations/${region}/namespaces/${project}/services/mcp-${svc}" 2>/dev/null || true
                    fi
                fi
            done

            if echo "$apply_output" | grep -q "web-portal.*already exists"; then
                if gcloud run services describe web-portal --region="$region" &>/dev/null; then
                    log_info "Importing existing web-portal service..."
                    terraform import 'module.cloudrun.google_cloud_run_service.web_portal[0]' \
                        "locations/${region}/namespaces/${project}/services/web-portal" 2>/dev/null || true
                fi
            fi

            # Bug #9 Fix: Domain mappings DON'T support updates — delete + recreate instead of import
            if echo "$apply_output" | grep -q "domain_mapping.*doesn't support update\|${KEYCLOAK_DOMAIN}.*already exists\|${APP_DOMAIN}.*already exists\|${API_DOMAIN}.*already exists"; then
                log_info "Cleaning up domain mappings for fresh creation (Bug #9)..."
                for dm_domain in "${KEYCLOAK_DOMAIN}" "${APP_DOMAIN}" "${API_DOMAIN}"; do
                    local tf_addr=""
                    case "$dm_domain" in
                        "${KEYCLOAK_DOMAIN}") tf_addr='module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' ;;
                        "${APP_DOMAIN}") tf_addr='module.cloudrun.google_cloud_run_domain_mapping.web_portal[0]' ;;
                        "${API_DOMAIN}") tf_addr='module.cloudrun.google_cloud_run_domain_mapping.mcp_gateway[0]' ;;
                    esac
                    if gcloud beta run domain-mappings describe --domain="${dm_domain}" --region="$region" &>/dev/null 2>&1; then
                        log_info "Deleting stale ${dm_domain} domain mapping..."
                        terraform state rm "${tf_addr}" &>/dev/null 2>&1 || true
                        gcloud beta run domain-mappings delete --domain="${dm_domain}" --region="$region" --quiet 2>/dev/null || true
                    fi
                done
            fi

            # Issue #31: Import Artifact Registry if it exists but not in state
            if echo "$apply_output" | grep -q "artifact_registry.*already exists\|Repository.*already exists"; then
                if gcloud artifacts repositories describe tamshai --location="$region" &>/dev/null; then
                    log_info "Importing existing Artifact Registry repository..."
                    terraform import 'module.cloudrun.google_artifact_registry_repository.tamshai' \
                        "projects/${project}/locations/${region}/repositories/tamshai" 2>/dev/null || true
                fi
            fi

            # Retry terraform apply after recovery
            log_step "Retrying terraform apply after recovery (Issue #11 / Bug #9)..."
            terraform apply -auto-approve || {
                log_error "Terraform apply failed even after recovery"
                log_error "Original error output:"
                echo "$apply_output"
                log_error ""
                log_error "Manual intervention may be required. Check:"
                log_error "  - Cloud Run console: https://console.cloud.google.com/run"
                log_error "  - Terraform state: terraform state list"
                save_checkpoint 7 "failed"
                exit 1
            }
            log_success "Auto-recovery successful - apply completed"
        else
            log_error "Terraform apply failed with unrecoverable error:"
            echo "$apply_output"
            save_checkpoint 7 "failed"
            exit 1
        fi
    else
        log_success "Terraform apply completed successfully"
    fi

    # Gap #32: Add MongoDB URI IAM binding for MCP servers
    # Uses shared function from lib/secrets.sh
    ensure_mongodb_uri_iam_binding "${GCP_PROJECT_ID}" || true

    # Verify domain mappings exist (Terraform should have created them in Stage 1/3)
    # This is a safety net — if Terraform failed silently, create via gcloud
    log_step "Verifying domain mappings exist..."
    local region="${GCP_REGION}"

    for dm_domain in "${KEYCLOAK_DOMAIN}" "${APP_DOMAIN}" "${API_DOMAIN}"; do
        local dm_service=""
        case "$dm_domain" in
            "${KEYCLOAK_DOMAIN}") dm_service="keycloak" ;;
            "${APP_DOMAIN}") dm_service="web-portal" ;;
            "${API_DOMAIN}") dm_service="mcp-gateway" ;;
        esac
        if gcloud beta run domain-mappings describe --domain="${dm_domain}" --region="$region" &>/dev/null; then
            log_info "Domain mapping ${dm_domain} → ${dm_service} exists"
        else
            log_warn "Domain mapping ${dm_domain} missing - creating via gcloud..."
            gcloud beta run domain-mappings create \
                --service="${dm_service}" \
                --domain="${dm_domain}" \
                --region="$region" 2>/dev/null || log_warn "  Could not create ${dm_domain} mapping - may need manual creation"
        fi
    done

    # =============================================================================
    # SSL CERTIFICATE VERIFICATION (Issue #8 Fix)
    # =============================================================================
    # Even with Cloudflare, Cloud Run MUST have a valid SSL certificate deployed.
    # Cloudflare (in Full/Strict mode) connects to ghs.googlehosted.com via HTTPS
    # and verifies the certificate. If Cloud Run's certificate isn't ready,
    # Cloudflare returns a 525 error (SSL handshake failed).
    #
    # GCP's domain mapping "Ready" status is MISLEADING - it only means DNS is
    # verified, NOT that the certificate is deployed. Certificate deployment
    # typically takes 10-15 minutes after the mapping is created.
    # =============================================================================
    log_step "Verifying SSL certificate deployment (Issue #8 fix)..."

    # First, quick check of GCP status (informational only)
    local mapping_status
    mapping_status=$(gcloud beta run domain-mappings describe \
        --domain=${KEYCLOAK_DOMAIN} \
        --region="$region" \
        --format="value(status.conditions[0].type)" 2>/dev/null || echo "Unknown")
    log_info "GCP domain mapping status: $mapping_status (note: may show Ready before cert is deployed)"

    # The authoritative check - wait for HTTPS to actually work
    log_info "Waiting for SSL certificate to be deployed..."
    log_info "This can take 10-15 minutes - be patient!"

    if type wait_for_ssl_certificate &>/dev/null; then
        # Use the domain-mapping.sh function if available
        if wait_for_ssl_certificate "${KEYCLOAK_DOMAIN}" "/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" 900; then
            log_success "SSL certificate verified - HTTPS is working!"
        else
            log_warn "SSL certificate not verified after 15 minutes"
            log_warn "You may need to wait longer or check the GCP console"
            log_warn "E2E tests may fail with 525 errors until certificate is ready"
        fi
    else
        # Fallback: simple curl check
        local ssl_ready=false
        for i in {1..30}; do
            if curl -sf "https://${KEYCLOAK_DOMAIN}/auth/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then
                log_success "SSL certificate deployed and working!"
                ssl_ready=true
                break
            fi
            log_info "  Waiting for certificate... (attempt $i/30)"
            sleep 30
        done
        if [ "$ssl_ready" = false ]; then
            log_warn "SSL certificate may not be ready - check E2E tests"
        fi
    fi

    # =============================================================================
    # SSL CERTIFICATE VERIFICATION FOR ALL DOMAIN MAPPINGS
    # =============================================================================
    # Issue #102 Fix: Also verify SSL certificates for app and api domains.
    # Uses shared wait_for_all_domain_ssl() from lib/domain-mapping.sh.
    # Without this, E2E tests fail with HTTP 525 (SSL handshake failed).
    # =============================================================================
    log_step "Verifying SSL certificates for app and api domains (Issue #102 fix)..."
    wait_for_all_domain_ssl "${KEYCLOAK_DOMAIN}" "${APP_DOMAIN}" "${API_DOMAIN}" || true

    save_checkpoint 7 "completed"
    log_success "Phase 7 complete - Cloud Run services configured"
}

# =============================================================================
# Phase 8: Deploy Services via GitHub Actions
# =============================================================================
phase_8_deploy() {
    log_phase "8" "Deploy Services"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would trigger deploy-to-gcp.yml workflow"
        return 0
    fi

    log_step "Triggering GitHub Actions deployment..."

    gh workflow run deploy-to-gcp.yml --ref main -f service=all

    log_step "Waiting for workflow to complete..."

    # Wait for workflow to start
    sleep 10

    # Get the latest run ID
    local run_id
    run_id=$(gh run list --workflow=deploy-to-gcp.yml --limit=1 --json databaseId -q '.[0].databaseId')

    if [ -n "$run_id" ]; then
        log_info "Monitoring workflow run: $run_id"

        # Watch the run (with timeout)
        timeout 1800 gh run watch "$run_id" || {
            log_warn "Workflow monitoring timed out - check GitHub Actions"
        }
    fi

    log_step "Waiting for services to be healthy..."
    wait_for_all_services 300 || log_warn "Some services may not be healthy"

    save_checkpoint 8 "completed"
    log_success "Phase 8 complete - Services deployed"
}

# =============================================================================
# Phase 9: Configure TOTP
# =============================================================================
# Gap #52: Keycloak Cloud Run cold start takes 30-60s. We need to warm it up
# before running sync-keycloak-realm or the script will timeout.
# =============================================================================
phase_9_totp() {
    log_phase "9" "Configure Test User TOTP"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would configure TOTP for test-user.journey"
        return 0
    fi

    # Gap #52: Warm up Keycloak before TOTP configuration
    # Uses shared warmup_keycloak() from lib/health-checks.sh
    warmup_keycloak "" "${KEYCLOAK_REALM}" 10 || log_warn "Keycloak warmup incomplete"

    local totp_script="$PROJECT_ROOT/keycloak/scripts/set-user-totp.sh"

    if [ ! -f "$totp_script" ]; then
        log_warn "TOTP script not found: $totp_script"
        save_checkpoint 9 "skipped"
        return 0
    fi

    log_step "Setting TOTP for test-user.journey..."

    # Get admin password from GCP Secret Manager
    local admin_password
    admin_password=$(get_gcp_secret "${SECRET_KEYCLOAK_ADMIN_PASSWORD}") || {
        log_error "Could not get Keycloak admin password from ${SECRET_KEYCLOAK_ADMIN_PASSWORD}"
        exit 1
    }

    # Get TOTP secret - priority: env var > GitHub Secrets
    # Gap #60: Fetch from GitHub Secrets for single source of truth
    local totp_secret="${TEST_USER_TOTP_SECRET_RAW:-}"

    if [ -z "$totp_secret" ]; then
        log_info "TEST_USER_TOTP_SECRET_RAW not set, fetching from GitHub Secrets..."
        if command -v gh &> /dev/null; then
            # Use gh CLI to fetch secret via workflow (--phoenix exports TEST_USER_TOTP_SECRET_RAW)
            local secrets_output
            secrets_output=$("$PROJECT_ROOT/scripts/secrets/read-github-secrets.sh" --phoenix 2>&1) || secrets_output=""
            totp_secret=$(echo "$secrets_output" | grep "^TEST_USER_TOTP_SECRET_RAW=" | cut -d'=' -f2) || totp_secret=""

            if [ -n "$totp_secret" ]; then
                log_success "Fetched TEST_USER_TOTP_SECRET_RAW from GitHub Secrets"
            else
                log_error "Could not fetch TEST_USER_TOTP_SECRET_RAW from GitHub Secrets"
                log_error "Set TEST_USER_TOTP_SECRET_RAW env var or ensure GitHub Secret exists"
                exit 1
            fi
        else
            log_error "gh CLI not available and TEST_USER_TOTP_SECRET_RAW not set"
            log_error "Install gh CLI or set TEST_USER_TOTP_SECRET_RAW env var"
            exit 1
        fi
    fi

    # Run with AUTO_CONFIRM for non-interactive mode
    export KEYCLOAK_ADMIN_PASSWORD="$admin_password"
    export AUTO_CONFIRM=true
    # Bug #27 fix: Set KEYCLOAK_URL explicitly to use the correct domain
    export KEYCLOAK_URL="https://${KEYCLOAK_DOMAIN}/auth"

    chmod +x "$totp_script"
    "$totp_script" prod test-user.journey "$totp_secret" || {
        log_warn "TOTP configuration may have failed - check manually"
    }
    unset KEYCLOAK_URL  # Clean up

    save_checkpoint 9 "completed"
    log_success "Phase 9 complete - TOTP configured"
}

# =============================================================================
# Phase 10: Provision and Verify
# =============================================================================
# Gap #53: Corporate users (eve.thompson, etc.) must be provisioned via
# identity-sync workflow after Phoenix rebuild. This phase ensures they exist.
# =============================================================================
phase_10_verify() {
    log_phase "10" "Provision Users and Verify"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would run user provisioning and E2E tests"
        return 0
    fi

    log_step "Printing discovered URLs..."
    print_discovered_urls

    log_step "Running health checks..."
    quick_health_check || log_warn "Some services may not be healthy"

    # GitHub secrets were fetched in Phase 1 (pre-flight). Re-fetch only if missing.
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

    # Issue #102: Sync PROD_USER_PASSWORD from GitHub Secrets to GCP Secret Manager
    # Uses shared sync_prod_user_password() from lib/secrets.sh
    log_step "Syncing PROD_USER_PASSWORD to GCP Secret Manager (Issue #102 fix)..."
    sync_prod_user_password || log_warn "PROD_USER_PASSWORD sync failed - corporate users may have random password"

    # Gap #53: Trigger identity-sync to provision corporate users
    # Uses shared trigger_identity_sync() from lib/secrets.sh
    # Issue #102: Pass force_password_reset=true after fresh Keycloak deployment
    # to ensure corporate users get the known PROD_USER_PASSWORD
    log_step "Triggering identity-sync workflow (Gap #53, Issue #102)..."
    trigger_identity_sync "true" "" "all" "true" || log_warn "Identity sync may have failed"

    log_step "Provisioning users (local script)..."
    # Trigger user provisioning if available
    local provision_script="$PROJECT_ROOT/scripts/gcp/provision-users.sh"
    if [ -f "$provision_script" ]; then
        chmod +x "$provision_script"
        "$provision_script" || log_warn "User provisioning may have failed"
    fi

    # Issue #102: Load sample data (Finance, Sales, Support)
    # Uses shared trigger_sample_data_load() from lib/secrets.sh
    log_step "Loading sample data (Finance, Sales, Support)..."
    trigger_sample_data_load "true" "" "all" || log_warn "Sample data loading may have failed"

    log_step "Running E2E login test..."
    cd "$PROJECT_ROOT/tests/e2e"
    if [ -f "package.json" ]; then
        # Secrets (TEST_USER_PASSWORD, TEST_USER_TOTP_SECRET) already loaded
        # from read-github-secrets.sh --phoenix earlier in this phase
        # Use npx cross-env for Windows compatibility (npm scripts use Unix syntax)
        if npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1; then
            log_success "E2E tests passed"
        else
            log_warn "E2E tests failed — check output above for details"
        fi
    fi

    save_checkpoint 10 "completed"
    clear_checkpoint  # All done, clear the checkpoint
    log_success "Phase 10 complete - Verification complete"
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║           PHOENIX REBUILD - GCP Production                     ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  This script will rebuild the entire GCP production            ║"
    echo "║  environment from scratch. This is a DESTRUCTIVE operation.    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
        echo ""
    fi

    # Handle resume mode
    if [ "$RESUME_MODE" = true ]; then
        START_PHASE=$(load_checkpoint)
        log_info "Resuming from phase $START_PHASE"
    fi

    # Confirm before proceeding
    # Gap #61: Skip confirmation if --yes flag is set (for automated runs)
    if [ "$DRY_RUN" = false ] && [ "$START_PHASE" -le 3 ]; then
        if [ "$AUTO_YES" = true ]; then
            log_warn "AUTO_YES=true - skipping interactive confirmation"
            log_warn "This will DESTROY and rebuild production!"
        else
            echo -e "${RED}WARNING: This will DESTROY and rebuild production!${NC}"
            echo "Type 'PHOENIX' to confirm: "
            read -r confirmation

            if [ "$confirmation" != "PHOENIX" ]; then
                echo "Aborted."
                exit 0
            fi
        fi
    fi

    # Set GCP project
    GCP_PROJECT_ID="${GCP_PROJECT_ID:-${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}}"
    export GCP_PROJECT_ID

    if [ -z "$GCP_PROJECT_ID" ]; then
        log_error "GCP_PROJECT_ID not set"
        exit 1
    fi

    log_info "Project: $GCP_PROJECT_ID"
    log_info "Starting from Phase: $START_PHASE"
    echo ""

    # Run phases
    [ "$START_PHASE" -le 1 ] && phase_1_preflight
    [ "$START_PHASE" -le 2 ] && phase_2_secret_sync
    [ "$START_PHASE" -le 3 ] && phase_3_destroy
    [ "$START_PHASE" -le 4 ] && phase_4_infrastructure
    [ "$START_PHASE" -le 5 ] && phase_5_build_images
    [ "$START_PHASE" -le 6 ] && phase_6_regenerate_keys
    [ "$START_PHASE" -le 7 ] && phase_7_cloud_run
    [ "$START_PHASE" -le 8 ] && phase_8_deploy
    [ "$START_PHASE" -le 9 ] && phase_9_totp
    [ "$START_PHASE" -le 10 ] && phase_10_verify

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           PHOENIX REBUILD COMPLETE!                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify services at https://${KEYCLOAK_DOMAIN}"
    echo "  2. Run full E2E test suite: cd tests/e2e && npm test"
    echo "  3. Check monitoring dashboards"
    echo ""
}

main "$@"
