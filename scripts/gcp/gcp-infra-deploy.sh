#!/bin/bash
# =============================================================================
# GCP Infrastructure Deployment Script
# =============================================================================
#
# Deploys Tamshai Enterprise AI infrastructure to Google Cloud Platform.
# This script orchestrates the full deployment process for Phase 1.
#
# Usage:
#   ./gcp-infra-deploy.sh [options]
#
# Options:
#   --init          Run terraform init before apply
#   --plan          Run terraform plan only (no apply)
#   --skip-apis     Skip enabling GCP APIs
#   --skip-build    Skip building container images
#   --skip-deploy   Skip deploying services (infra only)
#   --force         Skip confirmation prompts
#   -h, --help      Show this help message
#
# Environment Variables:
#   GCP_PROJECT_ID      GCP project ID (required)
#   GCP_REGION          GCP region (default: us-central1)
#   GCP_SA_KEY_FILE     Path to service account key (optional)
#
# Examples:
#   ./gcp-infra-deploy.sh --init
#   ./gcp-infra-deploy.sh --plan
#   GCP_PROJECT_ID=my-project ./gcp-infra-deploy.sh
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
RUN_INIT=false
PLAN_ONLY=false
SKIP_APIS=false
SKIP_BUILD=false
SKIP_DEPLOY=false
FORCE=false

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
    head -35 "$0" | tail -30
    exit 0
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed or not in PATH"
        return 1
    fi
    return 0
}

confirm() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi
    read -p "$1 [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --init)
            RUN_INIT=true
            shift
            ;;
        --plan)
            PLAN_ONLY=true
            shift
            ;;
        --skip-apis)
            SKIP_APIS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        --force)
            FORCE=true
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
MISSING_COMMANDS=()
check_command "gcloud" || MISSING_COMMANDS+=("gcloud")
check_command "terraform" || MISSING_COMMANDS+=("terraform")
check_command "docker" || MISSING_COMMANDS+=("docker")

if [[ ${#MISSING_COMMANDS[@]} -gt 0 ]]; then
    log_error "Missing required commands: ${MISSING_COMMANDS[*]}"
    log_info "Please install the missing tools and try again."
    exit 1
fi

# Check GCP project
if [[ -z "${GCP_PROJECT_ID:-}" ]]; then
    # Try to get from gcloud config
    GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
    if [[ -z "$GCP_PROJECT_ID" ]]; then
        log_error "GCP_PROJECT_ID is not set and no default project configured"
        log_info "Set GCP_PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID"
        exit 1
    fi
fi

log_success "Prerequisites check passed"
log_info "Project: $GCP_PROJECT_ID"
log_info "Region: $GCP_REGION"

# =============================================================================
# Authentication
# =============================================================================

log_info "Checking GCP authentication..."

if [[ -n "${GCP_SA_KEY_FILE:-}" ]] && [[ -f "$GCP_SA_KEY_FILE" ]]; then
    log_info "Authenticating with service account key..."
    gcloud auth activate-service-account --key-file="$GCP_SA_KEY_FILE"
fi

# Verify authentication
CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || echo "")
if [[ -z "$CURRENT_ACCOUNT" ]]; then
    log_error "Not authenticated with GCP. Please run: gcloud auth login"
    exit 1
fi

log_success "Authenticated as: $CURRENT_ACCOUNT"

# Set project
gcloud config set project "$GCP_PROJECT_ID" --quiet

# =============================================================================
# Enable Required APIs
# =============================================================================

if [[ "$SKIP_APIS" != "true" ]]; then
    log_info "Enabling required GCP APIs..."

    REQUIRED_APIS=(
        "run.googleapis.com"              # Cloud Run
        "sqladmin.googleapis.com"         # Cloud SQL Admin
        "secretmanager.googleapis.com"    # Secret Manager
        "compute.googleapis.com"          # Compute Engine
        "artifactregistry.googleapis.com" # Artifact Registry
        "vpcaccess.googleapis.com"        # Serverless VPC Access
        "cloudresourcemanager.googleapis.com" # Resource Manager
        "iam.googleapis.com"              # IAM
    )

    for api in "${REQUIRED_APIS[@]}"; do
        log_info "  Enabling $api..."
        gcloud services enable "$api" --quiet || log_warn "Failed to enable $api (may already be enabled)"
    done

    log_success "Required APIs enabled"
else
    log_info "Skipping API enablement (--skip-apis)"
fi

# =============================================================================
# Terraform Deployment
# =============================================================================

log_info "Preparing Terraform deployment..."

if [[ ! -d "$TERRAFORM_DIR" ]]; then
    log_warn "Terraform directory not found: $TERRAFORM_DIR"
    log_info "Creating directory structure..."
    mkdir -p "$TERRAFORM_DIR"
fi

cd "$TERRAFORM_DIR"

# Initialize Terraform
if [[ "$RUN_INIT" == "true" ]] || [[ ! -d ".terraform" ]]; then
    log_info "Initializing Terraform..."
    terraform init
fi

# Create/update tfvars if needed
TFVARS_FILE="$TERRAFORM_DIR/terraform.tfvars"
if [[ ! -f "$TFVARS_FILE" ]]; then
    log_info "Creating terraform.tfvars..."
    cat > "$TFVARS_FILE" << EOF
# GCP Project Configuration
project_id = "$GCP_PROJECT_ID"
region     = "$GCP_REGION"

# Phase 1: Cost-Optimized Settings
environment = "prod"

# Cloud SQL
cloud_sql_tier = "db-f1-micro"

# Cloud Run
cloud_run_min_instances = 0
cloud_run_max_instances = 2

# Keycloak
keycloak_min_instances = 0
EOF
    log_success "Created terraform.tfvars"
fi

# Plan or Apply
if [[ "$PLAN_ONLY" == "true" ]]; then
    log_info "Running Terraform plan..."
    terraform plan -var-file="$TFVARS_FILE"
    log_success "Terraform plan complete"
    exit 0
fi

if confirm "Deploy infrastructure with Terraform?"; then
    log_info "Running Terraform apply..."
    terraform apply -var-file="$TFVARS_FILE" -auto-approve
    log_success "Terraform apply complete"
else
    log_warn "Terraform apply cancelled"
    exit 0
fi

# =============================================================================
# Build Container Images
# =============================================================================

if [[ "$SKIP_BUILD" != "true" ]] && [[ "$SKIP_DEPLOY" != "true" ]]; then
    log_info "Building and pushing container images..."

    # Get Artifact Registry URL
    AR_REPO="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/tamshai"

    # Configure Docker for Artifact Registry
    gcloud auth configure-docker "$GCP_REGION-docker.pkg.dev" --quiet

    # Build and push services
    SERVICES=("mcp-gateway" "mcp-hr" "mcp-finance" "mcp-sales" "mcp-support")

    for service in "${SERVICES[@]}"; do
        SERVICE_DIR="$REPO_ROOT/services/$service"
        if [[ -d "$SERVICE_DIR" ]]; then
            log_info "  Building $service..."
            docker build -t "$AR_REPO/$service:latest" "$SERVICE_DIR"
            docker push "$AR_REPO/$service:latest"
        else
            log_warn "  Service directory not found: $SERVICE_DIR"
        fi
    done

    # Build Keycloak
    KEYCLOAK_DIR="$REPO_ROOT/keycloak"
    if [[ -d "$KEYCLOAK_DIR" ]]; then
        log_info "  Building keycloak..."
        docker build -t "$AR_REPO/keycloak:latest" "$KEYCLOAK_DIR"
        docker push "$AR_REPO/keycloak:latest"
    fi

    log_success "Container images built and pushed"
else
    log_info "Skipping container build (--skip-build or --skip-deploy)"
fi

# =============================================================================
# Deploy Cloud Run Services
# =============================================================================

if [[ "$SKIP_DEPLOY" != "true" ]]; then
    log_info "Deploying Cloud Run services..."

    # This will be handled by Terraform in the full implementation
    # For now, log that manual deployment may be needed
    log_warn "Cloud Run deployment is handled by Terraform modules"
    log_info "Verify services in GCP Console: https://console.cloud.google.com/run"
else
    log_info "Skipping service deployment (--skip-deploy)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
log_success "=========================================="
log_success "GCP Infrastructure Deployment Complete!"
log_success "=========================================="
echo ""
log_info "Project: $GCP_PROJECT_ID"
log_info "Region: $GCP_REGION"
echo ""
log_info "Next Steps:"
log_info "  1. Configure DNS records in Cloudflare"
log_info "  2. Run database migrations"
log_info "  3. Sync Keycloak realm configuration"
log_info "  4. Run smoke tests"
echo ""
log_info "Useful Commands:"
log_info "  View services: gcloud run services list --region=$GCP_REGION"
log_info "  View logs: gcloud run services logs read SERVICE_NAME --region=$GCP_REGION"
log_info "  Teardown: ./scripts/gcp/gcp-infra-teardown.sh"
echo ""
