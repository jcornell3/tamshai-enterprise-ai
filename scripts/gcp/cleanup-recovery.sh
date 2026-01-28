#!/bin/bash
# =============================================================================
# Recovery Stack Cleanup - GCP Production Environment
# =============================================================================
#
# Destroys a DR/recovery stack created by evacuate-region.sh.
# Use this after failing back to the primary region, or to clean up test stacks.
#
# This is the companion script to evacuate-region.sh:
#   - evacuate-region.sh  → Creates recovery stack
#   - cleanup-recovery.sh → Destroys recovery stack
#
# Usage:
#   ./cleanup-recovery.sh <ENV_ID> [options]
#   ./cleanup-recovery.sh --list              # List existing recovery stacks
#
# Arguments:
#   ENV_ID        The recovery environment ID (e.g., recovery-20260122-1430)
#
# Options:
#   --list        List all recovery stacks in the state bucket
#   --force       Skip confirmation prompts (DANGEROUS)
#   --dry-run     Show what would be destroyed without destroying
#   --keep-dns    Don't revert DNS CNAMEs to primary
#   -h, --help    Show this help message
#
# Examples:
#   ./cleanup-recovery.sh --list
#   ./cleanup-recovery.sh recovery-20260122-1430
#   ./cleanup-recovery.sh recovery-20260122-1430 --dry-run
#   ./cleanup-recovery.sh recovery-20260122-1430 --force
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - terraform installed
#   - Access to tamshai-terraform-state-prod bucket
#
# See: docs/plans/GCP-REGION-FAILURE-SCENARIO.md
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# =============================================================================
# SOURCE LIBRARIES
# =============================================================================

# Source common library (provides logging functions)
# Fallback definitions below in case common.sh is not available
if [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
    source "$SCRIPT_DIR/lib/common.sh" 2>/dev/null || true
fi

# Note: cleanup.sh will be sourced in terraform_destroy after GCP_DR_REGION is set

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
# Values can be overridden by environment variables.
# Priority: Environment vars > tfvars > hardcoded defaults
# =============================================================================

load_tfvars_config() {
    local dr_tfvars="${TFVARS_DIR}/dr.tfvars"
    local prod_tfvars="${TFVARS_DIR}/prod.tfvars"

    # Load primary region from prod.tfvars
    if [ -f "$prod_tfvars" ]; then
        TFVAR_PRIMARY_REGION=$(get_tfvar "region" "$prod_tfvars" 2>/dev/null || echo "")
    fi

    if [ ! -f "$dr_tfvars" ]; then
        return 1
    fi

    # Load Keycloak configuration
    TFVAR_KEYCLOAK_DOMAIN=$(get_tfvar "keycloak_domain" "$dr_tfvars" 2>/dev/null || echo "")
    # Load static website domain (Bug #30: DR uses separate bucket)
    TFVAR_STATIC_WEBSITE_DOMAIN=$(get_tfvar "static_website_domain" "$dr_tfvars" 2>/dev/null || echo "")

    return 0
}

# Load tfvars configuration (provides defaults)
load_tfvars_config || true

# GCP Configuration
PROJECT_ID="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"

# Bucket names: Environment vars > defaults
STATE_BUCKET="${GCP_STATE_BUCKET:-tamshai-terraform-state-prod}"

# Keycloak configuration: Environment vars > tfvars > defaults
KEYCLOAK_DR_DOMAIN="${KEYCLOAK_DR_DOMAIN:-${TFVAR_KEYCLOAK_DOMAIN:-auth-dr.tamshai.com}}"

# Static website domain: Environment vars > tfvars > defaults (Bug #30)
STATIC_DR_DOMAIN="${STATIC_DR_DOMAIN:-${TFVAR_STATIC_WEBSITE_DOMAIN:-prod-dr.tamshai.com}}"
# Production static website bucket (shared, do NOT delete)
STATIC_PROD_BUCKET="${STATIC_PROD_BUCKET:-prod.tamshai.com}"

# Bug #15: Primary region for same-region detection (artifact registry cleanup)
# Loaded from prod.tfvars or PRIMARY_REGION env var (no hardcoded default)
PRIMARY_REGION="${PRIMARY_REGION:-${TFVAR_PRIMARY_REGION:-}}"

# Default options
FORCE=false
DRY_RUN=false
KEEP_DNS=false
LIST_MODE=false
ENV_ID=""

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
# HELPER FUNCTIONS
# =============================================================================

show_help() {
    head -40 "$0" | tail -35
    exit 0
}

confirm() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    echo -e "${YELLOW}"
    read -p "$1 [y/N] " -n 1 -r
    echo -e "${NC}"
    [[ $REPLY =~ ^[Yy]$ ]]
}

# =============================================================================
# LIST RECOVERY STACKS
# =============================================================================

list_recovery_stacks() {
    log_phase "LIST" "RECOVERY STACKS"

    log_step "Scanning state bucket for recovery stacks..."

    # List all prefixes under gcp/recovery/
    local stacks
    stacks=$(gcloud storage ls "gs://${STATE_BUCKET}/gcp/recovery/" 2>/dev/null | \
        sed 's|gs://'"${STATE_BUCKET}"'/gcp/recovery/||g' | \
        sed 's|/$||g' | \
        grep -v '^$' || true)

    if [ -z "$stacks" ]; then
        log_info "No recovery stacks found in gs://${STATE_BUCKET}/gcp/recovery/"
        echo ""
        log_info "To create a recovery stack, run:"
        echo "  ./evacuate-region.sh <REGION> <ZONE> recovery-test"
        exit 0
    fi

    echo ""
    echo -e "${CYAN}Found recovery stacks:${NC}"
    echo "─────────────────────────────────────────"
    printf "%-30s %s\n" "ENV_ID" "STATE PATH"
    echo "─────────────────────────────────────────"

    for stack in $stacks; do
        printf "%-30s %s\n" "$stack" "gcp/recovery/$stack"
    done

    echo "─────────────────────────────────────────"
    echo ""
    log_info "To destroy a recovery stack, run:"
    echo "  ./cleanup-recovery.sh <ENV_ID>"
    echo ""
    log_info "Example:"
    echo "  ./cleanup-recovery.sh $(echo "$stacks" | head -1)"
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

preflight_checks() {
    log_phase "0" "PRE-FLIGHT CHECKS"

    local errors=0

    # Check required tools
    log_step "Checking required tools..."
    for tool in gcloud terraform; do
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

    # Check ENV_ID format
    log_step "Validating ENV_ID..."
    if [[ ! "$ENV_ID" =~ ^recovery- ]] && [[ ! "$ENV_ID" =~ ^test- ]]; then
        log_warn "ENV_ID '$ENV_ID' doesn't start with 'recovery-' or 'test-'"
        log_warn "This script is designed for recovery/test stacks only."
        if ! confirm "Are you sure you want to continue?"; then
            log_error "Aborted by user."
            exit 1
        fi
    fi

    # Check if state exists
    log_step "Checking if recovery state exists..."
    if ! gcloud storage ls "gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/" &>/dev/null; then
        log_error "No Terraform state found for ENV_ID: $ENV_ID"
        log_info "Run './cleanup-recovery.sh --list' to see available stacks"
        exit 1
    fi
    log_success "Found state at: gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/"

    if [ $errors -gt 0 ]; then
        log_error "Pre-flight checks failed with $errors error(s)"
        exit 1
    fi

    log_success "All pre-flight checks passed"
}

# =============================================================================
# DETECT REGION FROM STATE
# =============================================================================

detect_region() {
    log_phase "1" "DETECT RECOVERY REGION"

    log_step "Reading region from Terraform state..."

    # Initialize terraform to read state
    cd "$TF_DIR"

    terraform init -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="prefix=gcp/recovery/${ENV_ID}" \
        -input=false \
        >/dev/null 2>&1 || true

    # Try to get region from state
    RECOVERY_REGION=$(terraform output -raw region 2>/dev/null || echo "")

    if [ -z "$RECOVERY_REGION" ]; then
        # Fall back to DR tfvars region
        RECOVERY_REGION=$(get_tfvar "region" "${TFVARS_DIR}/dr.tfvars" 2>/dev/null || echo "")
        if [ -n "$RECOVERY_REGION" ]; then
            log_warn "Could not detect region from state. Using dr.tfvars: $RECOVERY_REGION"
        else
            log_error "Could not detect recovery region from state or dr.tfvars"
            exit 1
        fi
    fi

    log_success "Recovery region: $RECOVERY_REGION"
}

# =============================================================================
# TERRAFORM DESTROY
# =============================================================================
# Uses the common cleanup library (lib/cleanup.sh) which implements the
# Phoenix patterns with async waits. This ensures consistency between
# phoenix-rebuild.sh and cleanup-recovery.sh.
#
# The cleanup library handles:
#   - Gap #38: Cloud Run service deletion + 10s wait
#   - Issue #14: Cloud SQL async wait (3 min) + VPC peering async wait (2 min)
#   - Gap #25: VPC connector async wait (5 min)
#   - Gap #39: Storage bucket emptying
#   - Issue #28: Secret deletion before destroy
#   - Issue #36: Terraform state lock cleanup
# =============================================================================

terraform_destroy() {
    log_phase "2" "TERRAFORM DESTROY"

    cd "$TF_DIR"

    log_step "Initializing Terraform with recovery backend..."
    terraform init -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="prefix=gcp/recovery/${ENV_ID}" \
        -input=false

    # =========================================================================
    # STALE STATE DETECTION (Bug #17)
    # =========================================================================
    # Old DR runs may have imported production resources into recovery state.
    # If no actual recovery GCP resources exist (VPC or Cloud SQL with the
    # ENV_ID suffix), this is a stale state — just delete it and skip destroy.
    # =========================================================================
    log_step "Checking for actual recovery GCP resources..."
    local recovery_vpc="tamshai-prod-${ENV_ID}-vpc"
    local recovery_sql="tamshai-prod-postgres-${ENV_ID}"
    local has_recovery_vpc=false
    local has_recovery_sql=false

    if gcloud compute networks describe "$recovery_vpc" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        has_recovery_vpc=true
        log_info "Found recovery VPC: $recovery_vpc"
    fi

    if gcloud sql instances describe "$recovery_sql" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        has_recovery_sql=true
        log_info "Found recovery Cloud SQL: $recovery_sql"
    fi

    if [[ "$has_recovery_vpc" == "false" && "$has_recovery_sql" == "false" ]]; then
        log_warn "════════════════════════════════════════════════════════════════════"
        log_warn "STALE STATE DETECTED (Bug #17)"
        log_warn "════════════════════════════════════════════════════════════════════"
        log_warn "No recovery GCP resources found for ENV_ID: $ENV_ID"
        log_warn "This state likely contains production resources imported by a buggy DR run."
        log_warn "Deleting stale terraform state (no terraform destroy needed)..."
        echo ""

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN: Would delete state at gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/"
            return 0
        fi

        # Delete the stale state file
        gcloud storage rm -r "gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/" 2>/dev/null || {
            log_warn "Failed to delete state — may need manual cleanup"
        }
        log_success "Stale state deleted for $ENV_ID"
        return 0
    fi

    log_step "Planning destruction..."

    # Note: TF_ARGS is global (not local) so cleanup_networking_resources can access it
    TF_ARGS=(
        -var="project_id=${PROJECT_ID}"
        -var="region=${RECOVERY_REGION}"
        -var="zone=${RECOVERY_REGION}-b"
        -var="env_id=${ENV_ID}"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=${KEYCLOAK_DR_DOMAIN}"
        -var="mongodb_atlas_uri=mongodb://placeholder:27017"
        -var="claude_api_key=placeholder"
    )

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would destroy with these settings:"
        echo "  ENV_ID:  $ENV_ID"
        echo "  Region:  $RECOVERY_REGION"
        echo "  Project: $PROJECT_ID"
        echo ""
        terraform plan -destroy "${TF_ARGS[@]}"
        log_warn "DRY RUN: No resources were destroyed"
        return 0
    fi

    # Show what will be destroyed
    echo ""
    log_warn "This will PERMANENTLY DESTROY the following:"
    echo "  • Cloud Run services (*-${ENV_ID})"
    echo "  • Cloud SQL instance (tamshai-prod-postgres-${ENV_ID})"
    echo "  • VPC network and subnets"
    echo "  • All associated IAM bindings"
    echo "  • Terraform state for $ENV_ID"
    echo ""

    if ! confirm "Are you absolutely sure you want to destroy this recovery stack?"; then
        log_error "Destruction cancelled by user."
        exit 1
    fi

    # =============================================================================
    # Configure cleanup library environment variables
    # Bug #20: Use GCP_DR_REGION (not GCP_REGION) to prevent accidentally acting on production
    # =============================================================================
    export GCP_DR_REGION="${RECOVERY_REGION}"
    export GCP_PROJECT="${PROJECT_ID}"
    export NAME_PREFIX="tamshai-prod-${ENV_ID}"
    export RESOURCE_PREFIX="tamshai-prod"
    # Note: ENV_ID is already set globally

    local name_suffix="-${ENV_ID}"

    # Source cleanup library
    if [ -f "$SCRIPT_DIR/lib/cleanup.sh" ]; then
        source "$SCRIPT_DIR/lib/cleanup.sh"
        log_info "Cleanup library loaded (NAME_PREFIX=$NAME_PREFIX, ENV_ID=$ENV_ID)"
    else
        log_error "Cleanup library not found: $SCRIPT_DIR/lib/cleanup.sh"
        log_error "Cannot proceed without cleanup library"
        exit 1
    fi

    # =============================================================================
    # PROACTIVE PRE-DESTROY CLEANUP (Bug #15 — defense-in-depth)
    # =============================================================================
    # Bug #15 redesign: The previous approach used individual state removals and
    # called cleanup_leftover_resources() which destroys shared production resources
    # (Cloud Run services, storage buckets). The new approach uses:
    #   1. RECOVERY_CLEANUP=true env guard to block cleanup_leftover_resources()
    #   2. cleanup_recovery_resources() for recovery-safe gcloud cleanup (VPC/SQL only)
    #   3. remove_shared_resources_from_state() whitelist to keep only recovery resources
    #   4. verify_no_shared_resources_in_state() as final safety gate before destroy
    #   5. prevent_destroy=true on all shared terraform resources as infrastructure-level safety net
    # =============================================================================
    log_step "=== Starting PROACTIVE pre-destroy cleanup (Bug #15 safe flow) ==="

    # Set recovery cleanup guard — blocks cleanup_leftover_resources() if accidentally called
    export RECOVERY_CLEANUP=true

    # Step 1: Clean up stale terraform state locks (Issue #36)
    if type cleanup_terraform_state_lock &>/dev/null; then
        cleanup_terraform_state_lock "$STATE_BUCKET" "gcp/recovery/${ENV_ID}"
    fi

    # Step 2: Skip storage bucket emptying (Bug #15)
    # Storage buckets are shared with production. Do NOT empty them.
    log_step "Skipping storage bucket emptying (shared with prod — Bug #15)..."

    # Step 3: DO NOT delete secrets during recovery cleanup (Bug #5)
    # Secrets (tamshai-prod-*) are shared between prod and DR environments.
    log_step "Skipping secret deletion (shared with prod — Bug #5)..."

    # Step 4: Recovery-safe gcloud cleanup (VPC, Cloud SQL, networking only)
    # This replaces cleanup_leftover_resources() which would destroy Cloud Run
    # services and empty storage buckets (production resources).
    if type cleanup_recovery_resources &>/dev/null; then
        log_step "Running recovery-safe resource cleanup (Bug #15)..."
        cleanup_recovery_resources "$name_suffix" || {
            log_warn "Recovery cleanup had warnings - continuing with state removal"
        }
    else
        log_warn "cleanup_recovery_resources not available - using individual functions"
        # Fallback: individual recovery-safe functions only
        if type disable_cloudsql_deletion_protection &>/dev/null; then
            disable_cloudsql_deletion_protection "$name_suffix"
        fi
        if type delete_vpc_connector_and_wait &>/dev/null; then
            delete_vpc_connector_and_wait || log_warn "VPC connector deletion may have failed"
        fi
        if type delete_vpc_peering_robust &>/dev/null; then
            delete_vpc_peering_robust || log_warn "VPC peering deletion may have failed"
        fi
        if type delete_orphaned_private_ip &>/dev/null; then
            delete_orphaned_private_ip "$name_suffix"
        fi
    fi

    # Step 4.5: Remove orphaned Cloud SQL child resources from state (Bug #19)
    # After cleanup_recovery_resources() deletes Cloud SQL, child resources (databases, users)
    # remain in state but fail on terraform refresh because parent instance is gone.
    # Remove them BEFORE terraform refresh/destroy to prevent "instance does not exist" errors.
    local recovery_sql="tamshai-prod-postgres${name_suffix}"
    if ! gcloud sql instances describe "$recovery_sql" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_step "Removing orphaned Cloud SQL child resources from state (Bug #19)..."
        # Cloud SQL instance was deleted - remove child resources that would fail refresh
        terraform state rm 'module.database.google_sql_database.keycloak_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.tamshai_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true
        log_info "Removed orphaned Cloud SQL resources from state"
    fi

    # Step 5: Remove ALL shared resources from terraform state (Bug #15 whitelist)
    # This replaces the previous manual state rm commands (Bug #5, #7, #12) with
    # a future-proof whitelist: only networking, database, and utility_vm modules
    # are kept. Everything else (storage, security, cloudrun) is removed.
    if type remove_shared_resources_from_state &>/dev/null; then
        log_step "Removing shared resources from state (Bug #15 whitelist)..."
        remove_shared_resources_from_state || {
            log_error "Failed to remove shared resources from state"
            log_error "ABORTING to protect production resources"
            exit 1
        }
    else
        log_warn "remove_shared_resources_from_state not available - using legacy removal"
        # Legacy fallback: manually remove known shared resources from state
        if type remove_all_problematic_state &>/dev/null; then
            remove_all_problematic_state
        fi
        # Remove service accounts (Bug #7, #12)
        terraform state rm 'module.security.google_service_account.cicd' 2>/dev/null || true
        terraform state rm 'module.security.google_service_account.keycloak' 2>/dev/null || true
        terraform state rm 'module.security.google_service_account.mcp_gateway' 2>/dev/null || true
        terraform state rm 'module.security.google_service_account.mcp_servers' 2>/dev/null || true
        terraform state rm 'module.security.google_service_account.provision_job' 2>/dev/null || true
    fi

    # Step 6: Verify no shared resources remain in state (Bug #15 safety gate)
    if type verify_no_shared_resources_in_state &>/dev/null; then
        log_step "Verifying no shared resources in state (Bug #15 safety gate)..."
        if ! verify_no_shared_resources_in_state; then
            log_error "SAFETY GATE FAILED — shared resources still in terraform state!"
            log_error "Cannot proceed with terraform destroy. Manual intervention required."
            exit 1
        fi
    fi

    log_success "=== Pre-destroy cleanup complete (Bug #15 safe flow) ==="

    # Refresh Terraform state to pick up manual changes
    log_step "Refreshing Terraform state..."
    terraform refresh "${TF_ARGS[@]}" -compact-warnings 2>/dev/null || log_warn "State refresh had warnings"

    # =============================================================================
    # TERRAFORM DESTROY
    # =============================================================================
    log_step "Running terraform destroy..."
    if ! terraform destroy -auto-approve "${TF_ARGS[@]}"; then
        log_warn "Terraform destroy had errors - attempting fallback cleanup..."

        # Use library's robust VPC deletion as fallback
        if type delete_vpc_network_robust &>/dev/null; then
            log_step "Using library's robust VPC deletion..."
            delete_vpc_network_robust || log_warn "VPC deletion may need manual cleanup"
        fi

        # Final retry
        log_step "Final terraform destroy retry..."
        if ! terraform destroy -auto-approve "${TF_ARGS[@]}"; then
            # Bug #19: If VPC can't be deleted (GCP timing issue), remove remaining
            # resources from state and delete the state file. The VPC will eventually
            # be cleaned up by GCP or a future cleanup run.
            log_warn "Terraform destroy still failing - checking remaining resources..."

            local remaining_resources
            remaining_resources=$(terraform state list 2>/dev/null || true)

            if [[ -n "$remaining_resources" ]]; then
                log_warn "Removing remaining resources from state (Bug #19 fallback):"
                echo "$remaining_resources" | while read -r resource; do
                    log_info "  Removing: $resource"
                    terraform state rm "$resource" 2>/dev/null || true
                done
            fi

            # Delete the terraform state file
            log_step "Deleting terraform state (resources cleaned, state orphaned)..."
            gcloud storage rm -r "gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/" 2>/dev/null || true

            log_warn "Recovery cleanup completed with warnings:"
            log_warn "  - Terraform state deleted"
            log_warn "  - VPC may still exist in GCP (will be cleaned up eventually)"
            log_warn "  - Check: https://console.cloud.google.com/networking/networks?project=${PROJECT_ID}"

            # Return success since state is clean
            return 0
        fi
    fi

    log_success "Recovery stack destroyed successfully"

    # Step 7: Clean up Artifact Registry in recovery region (Bug #15 same-region check)
    # Images from phase1_5_replicate_images() are created via gcloud (not Terraform)
    # and persist after terraform destroy. Stale images cause future DR runs to
    # deploy outdated code if digest comparison is bypassed or unavailable.
    #
    # Bug #15: When recovery region == primary region (same-region DR), the artifact
    # registry is shared and must NOT be deleted. Only delete when in a different region.
    log_step "Cleaning up Artifact Registry in recovery region..."
    local registry_repo="tamshai"
    if [[ "$RECOVERY_REGION" != "$PRIMARY_REGION" ]]; then
        if gcloud artifacts repositories describe "$registry_repo" \
            --location="$RECOVERY_REGION" \
            --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting Artifact Registry repository '$registry_repo' in $RECOVERY_REGION (different from primary: $PRIMARY_REGION)"
            gcloud artifacts repositories delete "$registry_repo" \
                --location="$RECOVERY_REGION" \
                --project="$PROJECT_ID" \
                --quiet 2>/dev/null && \
                log_success "  Artifact Registry cleaned up" || \
                log_warn "  Failed to delete Artifact Registry (manual cleanup may be needed)"
        else
            log_info "  No Artifact Registry repository found in $RECOVERY_REGION"
        fi
    else
        log_warn "  Skipping Artifact Registry cleanup (recovery region $RECOVERY_REGION == primary region $PRIMARY_REGION — Bug #15)"
    fi

    # Step 8: Clean up DR static website bucket (Bug #30)
    # The DR static website bucket is NOT shared with production - it's a separate
    # bucket created by evacuate-region.sh for the DR domain (e.g., prod-dr.tamshai.com).
    # The production bucket (prod.tamshai.com) is NEVER deleted here.
    log_step "Cleaning up DR static website bucket..."
    if [[ -n "$STATIC_DR_DOMAIN" && "$STATIC_DR_DOMAIN" != "$STATIC_PROD_BUCKET" ]]; then
        local dr_static_bucket="gs://${STATIC_DR_DOMAIN}"
        if gcloud storage buckets describe "$dr_static_bucket" &>/dev/null 2>&1; then
            log_info "  Deleting DR static website bucket: $dr_static_bucket"
            # Empty the bucket first (required for deletion)
            gcloud storage rm -r "${dr_static_bucket}/**" 2>/dev/null || true
            # Delete the bucket
            gcloud storage buckets delete "$dr_static_bucket" --quiet 2>/dev/null && \
                log_success "  DR static website bucket deleted" || \
                log_warn "  Failed to delete DR static website bucket (manual cleanup may be needed)"
        else
            log_info "  No DR static website bucket found: $dr_static_bucket"
        fi
    else
        log_info "  No DR-specific static website bucket to clean up"
    fi
}

# =============================================================================
# CLEANUP NETWORKING RESOURCES (FALLBACK - uses library)
# =============================================================================
# This is a thin wrapper around the cleanup library's full_environment_cleanup.
# It's only called if terraform destroy fails after the initial proactive cleanup.
# =============================================================================

cleanup_networking_resources() {
    local name_suffix="-${ENV_ID}"

    log_warn "Entering fallback networking cleanup..."

    # Use library's full_environment_cleanup if available
    if type full_environment_cleanup &>/dev/null; then
        log_step "Using library's full_environment_cleanup..."
        full_environment_cleanup "$name_suffix" || log_warn "Full cleanup had warnings"
    elif type delete_vpc_network_robust &>/dev/null; then
        # Fallback to individual library functions
        log_step "Using library's individual cleanup functions..."

        if type delete_vpc_peering_robust &>/dev/null; then
            delete_vpc_peering_robust || true
        fi

        if type delete_orphaned_private_ip &>/dev/null; then
            delete_orphaned_private_ip "$name_suffix"
        fi

        if type delete_vpc_connector_and_wait &>/dev/null; then
            delete_vpc_connector_and_wait || true
        fi

        if type delete_cloud_router &>/dev/null; then
            delete_cloud_router
        fi

        if type delete_firewall_rules &>/dev/null; then
            delete_firewall_rules
        fi

        if type delete_vpc_subnets &>/dev/null; then
            delete_vpc_subnets
        fi

        delete_vpc_network_robust || log_warn "VPC deletion may need manual cleanup"
    else
        log_error "Cleanup library functions not available"
        log_error "Manual cleanup required. Check GCP Console:"
        log_error "  - VPC: https://console.cloud.google.com/networking/networks?project=${PROJECT_ID}"
        log_error "  - Cloud SQL: https://console.cloud.google.com/sql/instances?project=${PROJECT_ID}"
        return 1
    fi

    # Final retry of terraform destroy
    log_step "Retrying terraform destroy for remaining resources..."
    local remaining
    remaining=$(terraform state list 2>/dev/null | wc -l)
    if [ "$remaining" -gt 0 ]; then
        log_info "  $remaining resources remaining in state"
        terraform destroy -auto-approve "${TF_ARGS[@]}" || {
            log_error "Terraform destroy still failing. Remaining resources:"
            terraform state list 2>/dev/null
            return 1
        }
    else
        log_info "No remaining resources in Terraform state"
    fi

    log_success "Fallback cleanup completed"
}

# =============================================================================
# CLEANUP STATE
# =============================================================================

cleanup_state() {
    log_phase "3" "CLEANUP TERRAFORM STATE"

    log_step "Removing Terraform state from bucket..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would delete gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/"
        return 0
    fi

    if confirm "Delete Terraform state from gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/?"; then
        gcloud storage rm -r "gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/" 2>/dev/null || true
        log_success "Terraform state removed"
    else
        log_warn "Terraform state retained (manual cleanup required)"
    fi
}

# =============================================================================
# DNS GUIDANCE
# =============================================================================

dns_guidance() {
    log_phase "4" "DNS CONFIGURATION"

    if [[ "$KEEP_DNS" == "true" ]]; then
        log_info "Skipping DNS guidance (--keep-dns specified)"
        return 0
    fi

    echo ""
    log_info "If you pointed DR CNAMEs to recovery services, you can now:"
    echo ""
    echo "  Option 1: Delete DR DNS records (recommended if not needed)"
    echo "  ─────────────────────────────────────────────────────────────"
    echo "  Delete: ${KEYCLOAK_DR_DOMAIN}"
    echo "  Delete: api-dr.tamshai.com"
    echo "  Delete: app-dr.tamshai.com"
    echo ""
    echo "  Option 2: Leave pointing to recovery URLs (for quick failback)"
    echo "  ────────────────────────────────────────────────────────────────"
    echo "  Keep current values - they'll fail gracefully until next evacuation"
    echo ""
    log_info "Note: Production uses direct Cloud Run URLs (e.g., mcp-gateway-xxx.a.run.app),"
    log_info "NOT ghs.googlehosted.com. DR domains should follow the same pattern."
    echo ""
}

# =============================================================================
# SUMMARY
# =============================================================================

show_summary() {
    log_phase "5" "CLEANUP COMPLETE"

    if [[ "$DRY_RUN" == "true" ]]; then
        echo ""
        log_warn "DRY RUN COMPLETE - No resources were modified"
        echo ""
        log_info "To perform actual cleanup, run without --dry-run:"
        echo "  ./cleanup-recovery.sh $ENV_ID"
        return 0
    fi

    echo ""
    log_success "Recovery stack '$ENV_ID' has been destroyed"
    echo ""
    echo "  Destroyed:"
    echo "  ✓ Cloud Run services"
    echo "  ✓ Cloud SQL instance"
    echo "  ✓ VPC networking"
    echo "  ✓ IAM bindings"
    echo "  ✓ Artifact Registry (recovery region)"
    echo "  ✓ Terraform state"
    echo ""
    log_info "Primary stack remains unaffected."
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --list)
                LIST_MODE=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --keep-dns)
                KEEP_DNS=true
                shift
                ;;
            -h|--help)
                show_help
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                ;;
            *)
                if [ -z "$ENV_ID" ]; then
                    ENV_ID="$1"
                else
                    log_error "Unexpected argument: $1"
                    show_help
                fi
                shift
                ;;
        esac
    done

    # List mode
    if [[ "$LIST_MODE" == "true" ]]; then
        list_recovery_stacks
        exit 0
    fi

    # Require ENV_ID - but first check if any recovery stacks exist
    if [ -z "$ENV_ID" ]; then
        # Check if any recovery stacks exist
        local stacks
        stacks=$(gcloud storage ls "gs://${STATE_BUCKET}/gcp/recovery/" 2>/dev/null | grep -v '^$' || true)

        if [ -z "$stacks" ]; then
            log_info "No recovery stacks found - nothing to clean up"
            exit 0
        fi

        # Stacks exist but no ENV_ID specified
        log_error "ENV_ID is required"
        echo ""
        echo "Usage: ./cleanup-recovery.sh <ENV_ID> [options]"
        echo ""
        echo "Run './cleanup-recovery.sh --list' to see available recovery stacks"
        exit 1
    fi

    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  RECOVERY STACK CLEANUP - DESTRUCTIVE OPERATION${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  ENV_ID:      $ENV_ID"
    echo "  Project:     $PROJECT_ID"
    echo "  State:       gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/"
    echo "  Dry Run:     $DRY_RUN"
    echo ""

    # Run cleanup phases
    preflight_checks
    detect_region
    terraform_destroy
    cleanup_state
    dns_guidance
    show_summary
}

main "$@"
