#!/bin/bash
# =============================================================================
# Tamshai Environment Teardown (Full Infrastructure Destruction)
# =============================================================================
#
# Completely destroys Tamshai environments using Terraform.
# This script DESTROYS infrastructure - use rebuild.sh for container restarts.
#
# Usage:
#   ./teardown.sh [environment] [options]
#
# Environments:
#   dev         - Local development (Terraform destroy + container cleanup)
#   stage       - VPS staging (Terraform destroy - DESTROYS VPS!)
#
# Options:
#   --force     - Skip confirmation prompts (DANGEROUS!)
#   --keep-state - Don't remove Terraform state files
#
# Examples:
#   ./teardown.sh dev              # Destroy local dev environment
#   ./teardown.sh stage            # Destroy VPS (IRREVERSIBLE!)
#   ./teardown.sh stage --force    # Destroy without confirmation
#
# WARNING: This script DESTROYS infrastructure. Data will be LOST.
#          For container restarts without destroying infra, use rebuild.sh
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV="${1:-}"
FORCE=false
KEEP_STATE=false

# Parse options
shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --force|-f) FORCE=true; shift ;;
        --keep-state) KEEP_STATE=true; shift ;;
        *) shift ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

confirm() {
    if [ "$FORCE" = "true" ]; then
        return 0
    fi

    local message="$1"
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    ⚠️  DESTRUCTIVE OPERATION ⚠️                  ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}$message${NC}"
    echo ""
    read -p "Type 'DESTROY' to confirm: " -r
    echo
    if [[ "$REPLY" != "DESTROY" ]]; then
        log_info "Teardown cancelled"
        exit 0
    fi
}

check_terraform() {
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed"
        echo "Install Terraform: https://developer.hashicorp.com/terraform/downloads"
        exit 1
    fi
}

teardown_dev() {
    log_warn "DESTROYING dev environment..."

    local terraform_dir="$PROJECT_ROOT/infrastructure/terraform/dev"
    local compose_dir="$PROJECT_ROOT/infrastructure/docker"

    if [ ! -d "$terraform_dir" ]; then
        log_error "Terraform dev directory not found: $terraform_dir"
        exit 1
    fi

    confirm "This will DESTROY the local dev environment:
  - Stop and remove all Docker containers
  - Remove all Docker volumes (DATA WILL BE LOST)
  - Remove Docker networks
  - Clean up Terraform state"

    # Step 1: Stop containers first
    log_info "Stopping Docker containers..."
    if [ -f "$compose_dir/docker-compose.yml" ]; then
        cd "$compose_dir"
        docker compose down -v --remove-orphans 2>/dev/null || true
    fi

    # Step 2: Terraform destroy
    log_info "Running Terraform destroy..."
    cd "$terraform_dir"

    if [ -f "terraform.tfstate" ] || [ -d ".terraform" ]; then
        terraform destroy -auto-approve -var-file=dev.tfvars 2>/dev/null || {
            log_warn "Terraform destroy had issues (may already be destroyed)"
        }
    else
        log_warn "No Terraform state found - skipping Terraform destroy"
    fi

    # Step 3: Clean up state files if requested
    if [ "$KEEP_STATE" = "false" ]; then
        log_info "Cleaning up Terraform state files..."
        rm -rf .terraform terraform.tfstate terraform.tfstate.backup .terraform.lock.hcl 2>/dev/null || true
    fi

    # Step 4: Remove generated .env file
    if [ -f "$compose_dir/.env" ]; then
        log_info "Removing generated .env file..."
        rm -f "$compose_dir/.env"
    fi

    log_info "Dev environment DESTROYED"
    echo ""
    echo "To recreate: cd infrastructure/terraform/dev && terraform apply -var-file=dev.tfvars"
}

teardown_stage() {
    log_warn "DESTROYING stage VPS environment..."

    local terraform_dir="$PROJECT_ROOT/infrastructure/terraform/vps"

    if [ ! -d "$terraform_dir" ]; then
        log_error "Terraform VPS directory not found: $terraform_dir"
        exit 1
    fi

    cd "$terraform_dir"

    # Check for required environment variables
    if [ -z "${TF_VAR_hcloud_token:-}" ]; then
        log_error "TF_VAR_hcloud_token environment variable not set"
        echo ""
        echo "Set it with:"
        echo "  export TF_VAR_hcloud_token='your-hetzner-token'"
        echo ""
        echo "Or use PowerShell:"
        echo '  $env:TF_VAR_hcloud_token = "your-hetzner-token"'
        exit 1
    fi

    # Get current VPS info if available
    local vps_ip=""
    if [ -f "terraform.tfstate" ]; then
        vps_ip=$(terraform output -raw vps_ip 2>/dev/null || echo "unknown")
    fi

    confirm "This will PERMANENTLY DESTROY the stage VPS:
  - Hetzner VPS at ${vps_ip:-unknown} will be DELETED
  - All data on the VPS will be LOST
  - SSH keys will be removed from Hetzner
  - Firewall rules will be deleted

  This action is IRREVERSIBLE!"

    # Step 1: Terraform destroy
    log_info "Running Terraform destroy on VPS..."

    if [ -f "terraform.tfstate" ] || [ -d ".terraform" ]; then
        # Initialize if needed
        if [ ! -d ".terraform" ]; then
            terraform init
        fi

        terraform destroy -auto-approve || {
            log_error "Terraform destroy failed"
            echo ""
            echo "You may need to manually delete resources in Hetzner Cloud Console:"
            echo "  https://console.hetzner.cloud/"
            exit 1
        }
    else
        log_warn "No Terraform state found - VPS may already be destroyed"
    fi

    # Step 2: Clean up local files
    if [ "$KEEP_STATE" = "false" ]; then
        log_info "Cleaning up local files..."
        rm -rf .terraform terraform.tfstate terraform.tfstate.backup .terraform.lock.hcl 2>/dev/null || true
        rm -rf .keys 2>/dev/null || true
    fi

    log_info "Stage VPS DESTROYED"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Update GitHub secrets if you recreate the VPS:${NC}"
    echo "  gh secret set VPS_SSH_KEY < infrastructure/terraform/vps/.keys/deploy_key"
    echo ""
    echo "To recreate: cd infrastructure/terraform/vps && terraform apply"
}

show_help() {
    echo "Environment Teardown (Full Infrastructure Destruction)"
    echo ""
    echo "Usage: $0 <environment> [options]"
    echo ""
    echo -e "${RED}WARNING: This script DESTROYS infrastructure permanently!${NC}"
    echo "For container restarts without destroying infra, use rebuild.sh instead."
    echo ""
    echo "Environments:"
    echo "  dev      - Local development environment"
    echo "  stage    - VPS staging (Hetzner Cloud)"
    echo ""
    echo "Options:"
    echo "  --force, -f     Skip confirmation (DANGEROUS!)"
    echo "  --keep-state    Don't remove Terraform state files"
    echo ""
    echo "Examples:"
    echo "  $0 dev                    # Destroy local dev"
    echo "  $0 stage                  # Destroy VPS"
    echo "  $0 stage --force          # Destroy VPS without confirmation"
    echo ""
    echo "Alternative scripts:"
    echo "  rebuild.sh    - Stop containers without destroying infrastructure"
    echo "  deploy.sh     - Deploy/redeploy containers"
}

main() {
    if [ -z "$ENV" ]; then
        show_help
        exit 1
    fi

    check_terraform

    case "$ENV" in
        dev)
            teardown_dev
            ;;
        stage)
            teardown_stage
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown environment: $ENV"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
