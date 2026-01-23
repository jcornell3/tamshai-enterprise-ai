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

# Note: cleanup.sh will be sourced in terraform_destroy after GCP_REGION is set

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
    local tfvars_file="${TFVARS_DIR}/dr.tfvars"

    if [ ! -f "$tfvars_file" ]; then
        return 1
    fi

    # Load Keycloak configuration
    TFVAR_KEYCLOAK_DOMAIN=$(get_tfvar "keycloak_domain" "$tfvars_file" 2>/dev/null || echo "")

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
        echo "  ./evacuate-region.sh us-west1 us-west1-b recovery-test"
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
        log_warn "Could not detect region from state. Defaulting to us-west1"
        RECOVERY_REGION="us-west1"
    fi

    log_success "Recovery region: $RECOVERY_REGION"
}

# =============================================================================
# TERRAFORM DESTROY
# =============================================================================
# PROACTIVE cleanup pattern (adapted from phoenix-rebuild.sh Phase 3)
#
# Key difference from reactive cleanup:
# - Delete resources and WAIT for deletion BEFORE terraform destroy
# - Prevents terraform failures that require manual intervention
#
# Deletion order (with async waits):
#   1. Cloud Run services (10s wait for DB connections to close) - Gap #38
#   2. Cloud SQL instance (3 min async wait) - Issue #14
#   3. VPC peering connection (2 min async wait) - Issue #14
#   4. Private IP addresses
#   5. VPC connector (5 min async wait) - Gap #25
#   6. Storage buckets (empty before destroy) - Gap #39
#   7. Secrets (delete before destroy to avoid IAM binding errors) - Issue #28
#   8. Terraform state lock cleanup - Issue #36
# =============================================================================

terraform_destroy() {
    log_phase "2" "TERRAFORM DESTROY"

    cd "$TF_DIR"

    log_step "Initializing Terraform with recovery backend..."
    terraform init -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="prefix=gcp/recovery/${ENV_ID}" \
        -input=false

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

    # Source cleanup library (now that GCP_REGION is set)
    export GCP_REGION="${RECOVERY_REGION}"
    export GCP_PROJECT="${PROJECT_ID}"
    export NAME_PREFIX="tamshai-prod-${ENV_ID}"
    export RESOURCE_PREFIX="tamshai-prod"
    export ENV_ID="${ENV_ID}"

    if [ -f "$SCRIPT_DIR/lib/cleanup.sh" ]; then
        source "$SCRIPT_DIR/lib/cleanup.sh" 2>/dev/null || true
        log_info "Cleanup library loaded"
    fi

    local name_suffix="-${ENV_ID}"
    local vpc_name="tamshai-prod-vpc${name_suffix}"
    local postgres_instance="tamshai-prod-postgres${name_suffix}"
    local connector_name="tamshai-prod-connector${name_suffix}"

    # =============================================================================
    # PROACTIVE PRE-DESTROY CLEANUP (Phoenix pattern)
    # These deletions happen BEFORE terraform destroy to prevent failures
    # =============================================================================

    log_step "=== Starting PROACTIVE pre-destroy cleanup (Phoenix pattern) ==="

    # -------------------------------------------------------------------------
    # Step 1: Delete Cloud Run services FIRST (Gap #38)
    # Releases database connections that would block Cloud SQL deletion
    # -------------------------------------------------------------------------
    log_step "Step 1: Deleting Cloud Run services to release DB connections (Gap #38)..."
    local services=("keycloak${name_suffix}" "mcp-gateway${name_suffix}" "mcp-hr${name_suffix}" "mcp-finance${name_suffix}" "mcp-sales${name_suffix}" "mcp-support${name_suffix}" "web-portal${name_suffix}")
    for svc in "${services[@]}"; do
        if gcloud run services describe "$svc" --region="${RECOVERY_REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
            log_info "  Deleting $svc..."
            gcloud run services delete "$svc" --region="${RECOVERY_REGION}" --project="${PROJECT_ID}" --quiet 2>/dev/null || true
        fi
    done
    log_info "Waiting 10s for database connections to close..."
    sleep 10

    # -------------------------------------------------------------------------
    # Step 2: Delete Cloud SQL instance and WAIT (Issue #14)
    # VPC peering can't be deleted while Cloud SQL is using the connection
    # -------------------------------------------------------------------------
    log_step "Step 2: Deleting Cloud SQL instance with async wait (Issue #14)..."
    if gcloud sql instances describe "$postgres_instance" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        # Disable deletion protection first
        log_info "  Disabling deletion protection..."
        gcloud sql instances patch "$postgres_instance" \
            --no-deletion-protection \
            --project="$PROJECT_ID" \
            --quiet 2>/dev/null || true

        log_warn "  Deleting Cloud SQL instance: $postgres_instance (takes 30-90 seconds)"
        gcloud sql instances delete "$postgres_instance" --project="$PROJECT_ID" --quiet 2>/dev/null || log_warn "Cloud SQL deletion command may have failed"

        # Issue #14: WAIT for Cloud SQL deletion to complete (3 min max)
        local sql_wait=0
        local sql_max_wait=18  # 18 * 10s = 3 minutes max
        while gcloud sql instances describe "$postgres_instance" --project="$PROJECT_ID" &>/dev/null 2>&1; do
            sql_wait=$((sql_wait + 1))
            if [ $sql_wait -ge $sql_max_wait ]; then
                log_warn "  Cloud SQL deletion timeout after 3 minutes - continuing anyway"
                break
            fi
            log_info "  Waiting for Cloud SQL deletion... [$sql_wait/$sql_max_wait]"
            sleep 10
        done

        if ! gcloud sql instances describe "$postgres_instance" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_success "  Cloud SQL instance deleted"
        fi

        # Remove from terraform state since we deleted it manually
        log_info "  Removing Cloud SQL from Terraform state..."
        terraform state rm 'module.database.google_sql_database_instance.postgres' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.keycloak' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.tamshai' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.hr_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_database.finance_db' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.tamshai' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.keycloak_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.postgres_user' 2>/dev/null || true
        terraform state rm 'module.database.google_sql_user.tamshai_user' 2>/dev/null || true
    else
        log_info "  Cloud SQL instance not found (may already be deleted)"
    fi

    # -------------------------------------------------------------------------
    # Step 3: Delete VPC peering and WAIT (Issue #14)
    # Must be deleted BEFORE private IP deletion
    # -------------------------------------------------------------------------
    log_step "Step 3: Deleting VPC peering connection with async wait (Issue #14)..."
    if gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT_ID" 2>/dev/null | grep -q "servicenetworking"; then
        log_info "  VPC peering exists - deleting..."
        gcloud services vpc-peerings delete \
            --network="$vpc_name" \
            --service=servicenetworking.googleapis.com \
            --project="$PROJECT_ID" \
            --quiet 2>/dev/null || log_warn "  VPC peering deletion may have failed"

        # Wait for peering deletion (2 min max)
        local peering_wait=0
        local peering_max_wait=12  # 12 * 10s = 2 minutes max
        while gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT_ID" 2>/dev/null | grep -q "servicenetworking"; do
            peering_wait=$((peering_wait + 1))
            if [ $peering_wait -ge $peering_max_wait ]; then
                log_warn "  VPC peering deletion timeout after 2 minutes - continuing anyway"
                break
            fi
            log_info "  Waiting for VPC peering deletion... [$peering_wait/$peering_max_wait]"
            sleep 10
        done

        if ! gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT_ID" 2>/dev/null | grep -q "servicenetworking"; then
            log_success "  VPC peering deleted"
        fi
    else
        log_info "  VPC peering does not exist - skipping"
    fi

    # Remove from terraform state
    terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
    terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Step 4: Delete private IP addresses (Gap #24)
    # Now possible after peering is deleted
    # -------------------------------------------------------------------------
    log_step "Step 4: Deleting private IP addresses (Gap #24)..."
    local private_ip_names=("tamshai-prod-private-ip${name_suffix}" "google-managed-services-${vpc_name}" "tamshai-prod-private-ip-range${name_suffix}")
    for ip_name in "${private_ip_names[@]}"; do
        if gcloud compute addresses describe "$ip_name" --global --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting $ip_name..."
            gcloud compute addresses delete "$ip_name" --global --project="$PROJECT_ID" --quiet 2>/dev/null || log_warn "  Could not delete $ip_name"
        fi
    done

    # Remove from terraform state
    terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true
    terraform state rm 'module.networking.google_compute_global_address.private_ip_range' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Step 5: Delete VPC connector and WAIT (Gap #25)
    # Async operation takes 2-3 minutes, must complete before subnet deletion
    # -------------------------------------------------------------------------
    log_step "Step 5: Deleting VPC Access Connector with async wait (Gap #25)..."
    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="${RECOVERY_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_info "  VPC connector exists - deleting..."
        gcloud compute networks vpc-access connectors delete "$connector_name" \
            --region="${RECOVERY_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || log_warn "  VPC connector deletion initiated"

        # Wait for deletion to complete (5 min max)
        local connector_wait=0
        local connector_max_wait=20  # 20 * 15s = 5 minutes max
        while gcloud compute networks vpc-access connectors describe "$connector_name" \
            --region="${RECOVERY_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; do
            connector_wait=$((connector_wait + 1))
            if [ $connector_wait -ge $connector_max_wait ]; then
                log_warn "  VPC connector deletion timeout after 5 minutes - continuing anyway"
                break
            fi
            log_info "  Waiting for VPC connector deletion (takes 2-3 minutes)... [$connector_wait/$connector_max_wait]"
            sleep 15
        done

        if ! gcloud compute networks vpc-access connectors describe "$connector_name" \
            --region="${RECOVERY_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_success "  VPC connector deleted"
        fi
    else
        log_info "  VPC connector does not exist - skipping"
    fi

    # Remove from terraform state
    terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Step 6: Empty storage buckets (Gap #39)
    # force_destroy=false in terraform, must empty manually
    # -------------------------------------------------------------------------
    log_step "Step 6: Emptying storage buckets (Gap #39)..."
    local bucket_names=("tamshai-prod-finance-docs${name_suffix}" "tamshai-prod-logs${name_suffix}")
    for bucket in "${bucket_names[@]}"; do
        if gcloud storage ls "gs://${bucket}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Emptying gs://${bucket}..."
            gcloud storage rm -r "gs://${bucket}/**" 2>/dev/null || log_info "  Bucket ${bucket} already empty or does not exist"
        fi
    done

    # -------------------------------------------------------------------------
    # Step 7: Delete secrets BEFORE terraform destroy (Issue #28)
    # Prevents IAM binding deletion failures for non-existent secrets
    # -------------------------------------------------------------------------
    log_step "Step 7: Deleting secrets to prevent IAM binding errors (Issue #28)..."
    local secret_prefix="tamshai-prod"
    local secrets_to_delete=(
        "${secret_prefix}-keycloak-admin-password${name_suffix}"
        "${secret_prefix}-keycloak-db-password${name_suffix}"
        "${secret_prefix}-db-password${name_suffix}"
        "${secret_prefix}-anthropic-api-key${name_suffix}"
        "${secret_prefix}-mcp-gateway-client-secret${name_suffix}"
        "${secret_prefix}-jwt-secret${name_suffix}"
        "mcp-hr-service-client-secret${name_suffix}"
    )
    for secret in "${secrets_to_delete[@]}"; do
        if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting secret: $secret"
            gcloud secrets delete "$secret" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi
    done

    # Remove secret IAM bindings from state BEFORE destroy
    log_info "  Removing secret IAM bindings from Terraform state..."
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.keycloak_admin_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.keycloak_db_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_anthropic_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_client_secret_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_gateway_jwt_access' 2>/dev/null || true
    terraform state rm 'module.security.google_secret_manager_secret_iam_member.mcp_servers_db_access' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Step 8: Handle terraform state lock (Issue #36)
    # -------------------------------------------------------------------------
    log_step "Step 8: Checking for stale Terraform state locks (Issue #36)..."
    local lock_file="gs://${STATE_BUCKET}/gcp/recovery/${ENV_ID}/default.tflock"
    if gcloud storage cat "$lock_file" &>/dev/null 2>&1; then
        log_warn "  Found stale lock file - force unlocking..."
        local lock_id
        lock_id=$(gcloud storage cat "$lock_file" 2>/dev/null | grep -o '"ID":"[0-9]*"' | grep -o '[0-9]*' | head -1) || true
        if [ -n "$lock_id" ]; then
            log_info "  Force unlocking lock ID: $lock_id"
            terraform force-unlock -force "$lock_id" 2>/dev/null || true
        fi
        gcloud storage rm "$lock_file" 2>/dev/null || true
    fi

    log_success "=== Pre-destroy cleanup complete - terraform destroy should succeed ==="

    # Refresh Terraform state to pick up manual changes
    log_step "Refreshing Terraform state..."
    terraform refresh "${TF_ARGS[@]}" -compact-warnings 2>/dev/null || log_warn "State refresh had warnings"

    # =============================================================================
    # TERRAFORM DESTROY (should succeed after proactive cleanup)
    # =============================================================================
    log_step "Running terraform destroy..."
    if ! terraform destroy -auto-approve "${TF_ARGS[@]}"; then
        log_warn "Terraform destroy had errors - attempting fallback cleanup..."
        cleanup_networking_resources
    fi

    log_success "Recovery stack destroyed successfully"
}

# =============================================================================
# CLEANUP NETWORKING RESOURCES (FALLBACK)
# =============================================================================
# This is a FALLBACK handler for any remaining networking resources that
# weren't cleaned up by the proactive pre-destroy cleanup. In most cases,
# this should not be needed since proactive cleanup handles everything.
#
# If you're seeing this function execute, it means:
# 1. A proactive cleanup step timed out or failed silently
# 2. There's an edge case not covered by proactive cleanup
# 3. Resources were created by a different process
# =============================================================================

cleanup_networking_resources() {
    local name_suffix="-${ENV_ID}"
    local vpc_name="tamshai-prod-vpc${name_suffix}"

    log_warn "Entering fallback networking cleanup (proactive cleanup may have missed something)..."

    # -------------------------------------------------------------------------
    # Fallback Step 1: VPC peering (in case proactive cleanup timed out)
    # -------------------------------------------------------------------------
    log_step "Fallback: Checking for remaining VPC peering..."
    if gcloud services vpc-peerings list --network="$vpc_name" --project="$PROJECT_ID" 2>/dev/null | grep -q "servicenetworking"; then
        log_warn "  VPC peering still exists - attempting deletion..."
        gcloud services vpc-peerings delete \
            --network="$vpc_name" \
            --service=servicenetworking.googleapis.com \
            --project="$PROJECT_ID" \
            --quiet 2>/dev/null || true
        sleep 30  # Brief wait
    fi

    # Remove from terraform state
    terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
    terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Fallback Step 2: Private IP addresses
    # -------------------------------------------------------------------------
    log_step "Fallback: Checking for remaining private IP addresses..."
    local private_ip_names=("tamshai-prod-private-ip${name_suffix}" "google-managed-services-${vpc_name}" "tamshai-prod-private-ip-range${name_suffix}")
    for ip_name in "${private_ip_names[@]}"; do
        if gcloud compute addresses describe "$ip_name" --global --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting $ip_name..."
            gcloud compute addresses delete "$ip_name" --global --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi
    done

    terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true
    terraform state rm 'module.networking.google_compute_global_address.private_ip_range' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Fallback Step 3: VPC connector
    # -------------------------------------------------------------------------
    local connector_name="tamshai-prod-connector${name_suffix}"
    log_step "Fallback: Checking for remaining VPC connector..."
    if gcloud compute networks vpc-access connectors describe "$connector_name" \
        --region="${RECOVERY_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_warn "  VPC connector still exists - attempting deletion..."
        gcloud compute networks vpc-access connectors delete "$connector_name" \
            --region="${RECOVERY_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        sleep 60  # Wait for async deletion
    fi

    terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
    terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true

    # -------------------------------------------------------------------------
    # Fallback Step 4: VPC network with routes cleanup
    # -------------------------------------------------------------------------
    log_step "Fallback: Checking for remaining VPC network..."
    if gcloud compute networks describe "$vpc_name" --project="$PROJECT_ID" &>/dev/null 2>&1; then
        log_warn "  VPC still exists - cleaning up routes and attempting deletion..."

        # Delete any peering routes that might block VPC deletion
        local routes
        routes=$(gcloud compute routes list --filter="network:${vpc_name}" --format="value(name)" --project="$PROJECT_ID" 2>/dev/null) || true
        for route in $routes; do
            if [[ "$route" == *"peering"* ]]; then
                log_info "  Deleting peering route: $route"
                gcloud compute routes delete "$route" --project="$PROJECT_ID" --quiet 2>/dev/null || true
            fi
        done

        # Delete Cloud Router if exists
        local router_name="tamshai-prod-router${name_suffix}"
        if gcloud compute routers describe "$router_name" --region="${RECOVERY_REGION}" --project="$PROJECT_ID" &>/dev/null 2>&1; then
            log_info "  Deleting Cloud Router: $router_name"
            gcloud compute routers delete "$router_name" --region="${RECOVERY_REGION}" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        fi

        # Delete subnets
        local subnets
        subnets=$(gcloud compute networks subnets list --filter="network:${vpc_name}" --format="value(name,region)" --project="$PROJECT_ID" 2>/dev/null) || true
        while IFS=$'\t' read -r subnet_name subnet_region; do
            if [ -n "$subnet_name" ]; then
                log_info "  Deleting subnet: $subnet_name"
                gcloud compute networks subnets delete "$subnet_name" --region="$subnet_region" --project="$PROJECT_ID" --quiet 2>/dev/null || true
            fi
        done <<< "$subnets"

        # Delete firewall rules
        local firewalls
        firewalls=$(gcloud compute firewall-rules list --filter="network:${vpc_name}" --format="value(name)" --project="$PROJECT_ID" 2>/dev/null) || true
        for fw in $firewalls; do
            log_info "  Deleting firewall rule: $fw"
            gcloud compute firewall-rules delete "$fw" --project="$PROJECT_ID" --quiet 2>/dev/null || true
        done

        # Try to delete the VPC network
        log_info "  Attempting VPC deletion..."
        gcloud compute networks delete "$vpc_name" --project="$PROJECT_ID" --quiet 2>/dev/null || log_warn "  Could not delete VPC (may have remaining dependencies)"
    fi

    # -------------------------------------------------------------------------
    # Final retry of terraform destroy
    # -------------------------------------------------------------------------
    log_step "Retrying terraform destroy for remaining resources..."
    local remaining
    remaining=$(terraform state list 2>/dev/null | wc -l)
    if [ "$remaining" -gt 0 ]; then
        log_info "  $remaining resources remaining in state"
        terraform destroy -auto-approve "${TF_ARGS[@]}" || {
            log_error "Terraform destroy still failing. Remaining resources:"
            terraform state list 2>/dev/null
            log_error ""
            log_error "Manual cleanup may be required. Check GCP Console:"
            log_error "  - VPC: https://console.cloud.google.com/networking/networks?project=${PROJECT_ID}"
            log_error "  - Cloud SQL: https://console.cloud.google.com/sql/instances?project=${PROJECT_ID}"
            log_error "  - Cloud Run: https://console.cloud.google.com/run?project=${PROJECT_ID}"
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

    # Require ENV_ID
    if [ -z "$ENV_ID" ]; then
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
