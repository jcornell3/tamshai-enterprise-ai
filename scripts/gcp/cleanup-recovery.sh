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
# CONFIGURATION
# =============================================================================

# GCP Configuration
PROJECT_ID="${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"
STATE_BUCKET="tamshai-terraform-state-prod"

# Terraform directory
TF_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"

# Default options
FORCE=false
DRY_RUN=false
KEEP_DNS=false
LIST_MODE=false
ENV_ID=""

# Colors
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

terraform_destroy() {
    log_phase "2" "TERRAFORM DESTROY"

    cd "$TF_DIR"

    log_step "Initializing Terraform with recovery backend..."
    terraform init -reconfigure \
        -backend-config="bucket=${STATE_BUCKET}" \
        -backend-config="prefix=gcp/recovery/${ENV_ID}" \
        -input=false

    log_step "Planning destruction..."

    local tf_args=(
        -var="project_id=${PROJECT_ID}"
        -var="region=${RECOVERY_REGION}"
        -var="zone=${RECOVERY_REGION}-b"
        -var="env_id=${ENV_ID}"
        -var="recovery_mode=true"
        -var="phoenix_mode=true"
        -var="keycloak_domain=auth-dr.tamshai.com"
        -var="mongodb_atlas_uri=mongodb://placeholder:27017"
        -var="claude_api_key=placeholder"
    )

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would destroy with these settings:"
        echo "  ENV_ID:  $ENV_ID"
        echo "  Region:  $RECOVERY_REGION"
        echo "  Project: $PROJECT_ID"
        echo ""
        terraform plan -destroy "${tf_args[@]}"
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

    # Disable Cloud SQL deletion protection before destroy
    local postgres_instance="tamshai-prod-postgres-${ENV_ID}"
    log_step "Disabling Cloud SQL deletion protection for ${postgres_instance}..."
    if gcloud sql instances describe "$postgres_instance" --project="$PROJECT_ID" &>/dev/null; then
        gcloud sql instances patch "$postgres_instance" \
            --no-deletion-protection \
            --project="$PROJECT_ID" \
            --quiet 2>/dev/null || log_warn "Could not disable deletion protection (may already be disabled)"
    else
        log_info "Cloud SQL instance not found (may already be deleted)"
    fi

    log_step "Destroying recovery stack..."
    terraform destroy -auto-approve "${tf_args[@]}"

    log_success "Recovery stack destroyed successfully"
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
    echo "  Delete: auth-dr.tamshai.com"
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
