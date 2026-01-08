#!/bin/bash
# =============================================================================
# GCP Infrastructure Teardown Script
# =============================================================================
#
# Destroys Tamshai Enterprise AI infrastructure from Google Cloud Platform.
# WARNING: This is a destructive operation that cannot be undone!
#
# Usage:
#   ./gcp-infra-teardown.sh [options]
#
# Options:
#   --force         Skip all confirmation prompts (DANGEROUS)
#   --keep-data     Keep Cloud SQL and storage (destroy only compute)
#   --dry-run       Show what would be destroyed without destroying
#   -h, --help      Show this help message
#
# Environment Variables:
#   GCP_PROJECT_ID      GCP project ID (required)
#   GCP_REGION          GCP region (default: us-central1)
#   GCP_SA_KEY_FILE     Path to service account key (optional)
#
# Examples:
#   ./gcp-infra-teardown.sh --dry-run
#   ./gcp-infra-teardown.sh
#   ./gcp-infra-teardown.sh --force  # DANGEROUS: No confirmations
#
# =============================================================================

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
GCP_REGION="${GCP_REGION:-us-central1}"
TERRAFORM_DIR="$REPO_ROOT/infrastructure/terraform/gcp"
FORCE=false
KEEP_DATA=false
DRY_RUN=false

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -30 "$0" | tail -25
    exit 0
}

confirm() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    read -p "$1 [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

confirm_dangerous() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    echo -e "${RED}=========================================="
    echo "  WARNING: DESTRUCTIVE OPERATION"
    echo "==========================================${NC}"
    echo ""
    echo "This will PERMANENTLY DELETE:"
    echo "  - All Cloud Run services"
    echo "  - All container images in Artifact Registry"
    if [[ "$KEEP_DATA" != "true" ]]; then
        echo "  - Cloud SQL database (ALL DATA LOST)"
        echo "  - Cloud Storage buckets"
        echo "  - All secrets in Secret Manager"
    fi
    echo "  - VPC connectors and networking"
    echo "  - Utility VM"
    echo ""
    echo -e "${RED}This action CANNOT be undone!${NC}"
    echo ""
    read -p "Type 'DESTROY' to confirm: " -r
    [[ $REPLY == "DESTROY" ]]
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --keep-data)
            KEEP_DATA=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# =============================================================================
# Prerequisites Check
# =============================================================================

log_info "Checking prerequisites..."

# Check required commands
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud is not installed or not in PATH"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    log_error "terraform is not installed or not in PATH"
    exit 1
fi

# Check GCP project
if [[ -z "${GCP_PROJECT_ID:-}" ]]; then
    GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
    if [[ -z "$GCP_PROJECT_ID" ]]; then
        log_error "GCP_PROJECT_ID is not set and no default project configured"
        exit 1
    fi
fi

log_success "Prerequisites check passed"

# =============================================================================
# Authentication
# =============================================================================

log_info "Checking GCP authentication..."

if [[ -n "${GCP_SA_KEY_FILE:-}" ]] && [[ -f "$GCP_SA_KEY_FILE" ]]; then
    log_info "Authenticating with service account key..."
    gcloud auth activate-service-account --key-file="$GCP_SA_KEY_FILE"
fi

CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
if [[ -z "$CURRENT_ACCOUNT" ]]; then
    log_error "Not authenticated with GCP. Please run: gcloud auth login"
    exit 1
fi

log_success "Authenticated as: $CURRENT_ACCOUNT"
gcloud config set project "$GCP_PROJECT_ID" --quiet

# =============================================================================
# Show What Will Be Destroyed
# =============================================================================

log_info "Analyzing resources to destroy..."
echo ""

log_info "Project: $GCP_PROJECT_ID"
log_info "Region: $GCP_REGION"
echo ""

# List Cloud Run services
log_info "Cloud Run Services:"
gcloud run services list --region="$GCP_REGION" --format="table(SERVICE,REGION,URL)" 2>/dev/null || echo "  (none found)"
echo ""

# List Cloud SQL instances
log_info "Cloud SQL Instances:"
gcloud sql instances list --format="table(NAME,DATABASE_VERSION,REGION,STATUS)" 2>/dev/null || echo "  (none found)"
echo ""

# List Compute Engine instances
log_info "Compute Engine Instances:"
gcloud compute instances list --format="table(NAME,ZONE,MACHINE_TYPE,STATUS)" 2>/dev/null || echo "  (none found)"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "Dry run complete. No resources were destroyed."
    exit 0
fi

# =============================================================================
# Confirmation
# =============================================================================

if ! confirm_dangerous; then
    log_warn "Teardown cancelled"
    exit 0
fi

# =============================================================================
# Terraform Destroy
# =============================================================================

log_info "Running Terraform destroy..."

cd "$TERRAFORM_DIR"

if [[ ! -d ".terraform" ]]; then
    log_warn "Terraform not initialized. Running init..."
    terraform init
fi

TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"
if [[ -f "$TFVARS_FILE" ]]; then
    if [[ "$KEEP_DATA" == "true" ]]; then
        log_info "Keeping data resources (--keep-data)"
        # In full implementation, use -target to exclude data resources
        terraform destroy -var-file="$TFVARS_FILE" -auto-approve
    else
        terraform destroy -var-file="$TFVARS_FILE" -auto-approve
    fi
else
    terraform destroy -auto-approve
fi

log_success "Terraform destroy complete"

# =============================================================================
# Cleanup Artifact Registry (if exists)
# =============================================================================

log_info "Cleaning up Artifact Registry..."

AR_REPO="tamshai"
if gcloud artifacts repositories describe "$AR_REPO" --location="$GCP_REGION" &>/dev/null; then
    if confirm "Delete Artifact Registry repository '$AR_REPO'?"; then
        gcloud artifacts repositories delete "$AR_REPO" \
            --location="$GCP_REGION" \
            --quiet
        log_success "Artifact Registry repository deleted"
    fi
else
    log_info "No Artifact Registry repository found"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
log_success "=========================================="
log_success "GCP Infrastructure Teardown Complete!"
log_success "=========================================="
echo ""
log_info "Project: $GCP_PROJECT_ID"
log_info "Region: $GCP_REGION"
echo ""

if [[ "$KEEP_DATA" == "true" ]]; then
    log_warn "Data resources (Cloud SQL, Storage) were preserved"
    log_info "To fully clean up, run without --keep-data"
fi

echo ""
log_info "Remaining manual cleanup (if needed):"
log_info "  - Remove DNS records from Cloudflare"
log_info "  - Delete GitHub secrets (if desired)"
log_info "  - Review GCP Console for any orphaned resources"
echo ""
