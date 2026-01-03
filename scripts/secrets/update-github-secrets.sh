#!/bin/bash
# =============================================================================
# Update GitHub Secrets from Terraform Output
# =============================================================================
#
# Automates updating GitHub repository secrets after Terraform changes.
# Useful after SSH key rotation, VPS recreation, or secret updates.
#
# Usage:
#   ./update-github-secrets.sh [environment] [options]
#
# Environments:
#   dev    - Development environment (default)
#   stage  - Staging VPS environment
#
# Options:
#   --dry-run    Show what would be updated without making changes
#   --ssh-key    Update only VPS_SSH_KEY
#   --all        Update all secrets from Terraform outputs
#
# Examples:
#   ./update-github-secrets.sh stage --ssh-key     # Update SSH key only
#   ./update-github-secrets.sh stage --all         # Update all secrets
#   ./update-github-secrets.sh stage --dry-run     # Preview changes
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated
#   - Terraform state available
#   - Appropriate repository permissions
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV="${1:-stage}"
ACTION=""
DRY_RUN=false

# Parse arguments
shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --ssh-key) ACTION="ssh-key"; shift ;;
        --all) ACTION="all"; shift ;;
        *) shift ;;
    esac
done

# Default to all if no action specified
ACTION="${ACTION:-all}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Check prerequisites
check_prerequisites() {
    log_header "Checking Prerequisites"

    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) not installed"
        echo "Install: https://cli.github.com/"
        exit 1
    fi
    log_info "GitHub CLI found"

    if ! gh auth status &>/dev/null; then
        log_error "GitHub CLI not authenticated"
        echo "Run: gh auth login"
        exit 1
    fi
    log_info "GitHub CLI authenticated"

    if ! command -v terraform &>/dev/null; then
        log_error "Terraform not installed"
        exit 1
    fi
    log_info "Terraform found"
}

# Get Terraform directory for environment
get_terraform_dir() {
    case "$ENV" in
        dev)   echo "$PROJECT_ROOT/infrastructure/terraform/dev" ;;
        stage) echo "$PROJECT_ROOT/infrastructure/terraform/vps" ;;
        *)     log_error "Unknown environment: $ENV"; exit 1 ;;
    esac
}

# Update a single secret
update_secret() {
    local secret_name="$1"
    local secret_value="$2"

    if [ -z "$secret_value" ]; then
        log_warn "Secret $secret_name is empty, skipping"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would update $secret_name (${#secret_value} chars)"
    else
        echo "$secret_value" | gh secret set "$secret_name"
        log_info "Updated $secret_name"
    fi
}

# Update SSH key from Terraform output
update_ssh_key() {
    log_header "Updating VPS SSH Key"

    local tf_dir=$(get_terraform_dir)

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform directory not found: $tf_dir"
        exit 1
    fi

    cd "$tf_dir"

    # Check if Terraform state exists
    if [ ! -f "terraform.tfstate" ] && [ ! -d ".terraform" ]; then
        log_error "Terraform not initialized in $tf_dir"
        echo "Run: terraform init && terraform apply"
        exit 1
    fi

    # Try to get SSH key from Terraform output
    local ssh_key=""

    # Method 1: Direct output (if exposed)
    ssh_key=$(terraform output -raw ssh_private_key 2>/dev/null) || true

    # Method 2: From local file (if Terraform writes to file)
    if [ -z "$ssh_key" ] && [ -f ".keys/deploy_key" ]; then
        ssh_key=$(cat ".keys/deploy_key")
        log_info "Using SSH key from .keys/deploy_key"
    fi

    # Method 3: From tls_private_key resource in state
    if [ -z "$ssh_key" ]; then
        ssh_key=$(terraform show -json 2>/dev/null | \
            jq -r '.values.root_module.resources[] | select(.type=="tls_private_key") | .values.private_key_openssh' 2>/dev/null) || true
    fi

    if [ -z "$ssh_key" ] || [ "$ssh_key" = "null" ]; then
        log_error "Could not retrieve SSH private key from Terraform"
        echo ""
        echo "Possible solutions:"
        echo "  1. Add 'output \"ssh_private_key\" { value = tls_private_key.deploy.private_key_openssh sensitive = true }' to outputs.tf"
        echo "  2. Ensure .keys/deploy_key file exists"
        echo "  3. Check terraform state: terraform show -json | jq '.values.root_module.resources[] | select(.type==\"tls_private_key\")'"
        exit 1
    fi

    update_secret "VPS_SSH_KEY" "$ssh_key"
}

# Update all secrets
update_all_secrets() {
    log_header "Updating All Secrets"

    local tf_dir=$(get_terraform_dir)
    cd "$tf_dir"

    # SSH Key
    update_ssh_key

    # VPS Host IP
    local vps_ip=$(terraform output -raw vps_ip 2>/dev/null) || true
    if [ -n "$vps_ip" ]; then
        update_secret "VPS_HOST" "$vps_ip"
    fi

    # Additional secrets could be added here
    # update_secret "KEYCLOAK_ADMIN_PASSWORD" "$(terraform output -raw keycloak_admin_password 2>/dev/null)" || true
}

# Show current secrets (names only)
show_current_secrets() {
    log_header "Current Repository Secrets"
    gh secret list || log_warn "Could not list secrets"
}

main() {
    echo "=========================================="
    echo "Update GitHub Secrets"
    echo "=========================================="
    echo "Environment: $ENV"
    echo "Action: $ACTION"
    echo "Dry Run: $DRY_RUN"
    echo ""

    check_prerequisites
    show_current_secrets

    case "$ACTION" in
        ssh-key)
            update_ssh_key
            ;;
        all)
            update_all_secrets
            ;;
        *)
            log_error "Unknown action: $ACTION"
            exit 1
            ;;
    esac

    log_header "Summary"
    if [ "$DRY_RUN" = true ]; then
        log_info "Dry run complete - no changes made"
    else
        log_info "Secrets updated successfully"
        echo ""
        echo "Verify with: gh secret list"
    fi
}

main "$@"
