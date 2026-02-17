#!/bin/bash
# =============================================================================
# Rotate Passwords to Complex Values
# =============================================================================
#
# Generates new complex passwords with special characters and updates
# GitHub Secrets. Terraform then pulls from GitHub Secrets on next apply.
#
# Architecture: GitHub Secrets (source of truth) → Terraform → VPS
#
# Usage:
#   ./rotate-passwords.sh [options]
#
# Options:
#   --dry-run     Show what would be updated without making changes
#   --env ENV     Target environment prefix (dev, stage, prod) - default: stage
#   --all         Rotate all passwords
#   --list        List passwords that would be rotated
#   --verify      Verify current password complexity
#
# Examples:
#   ./rotate-passwords.sh --list              # Show passwords to rotate
#   ./rotate-passwords.sh --dry-run           # Preview changes
#   ./rotate-passwords.sh --all               # Rotate all passwords
#   ./rotate-passwords.sh --env dev --all     # Rotate dev passwords
#   ./rotate-passwords.sh --verify            # Check current complexity
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated
#   - openssl for password generation
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
DRY_RUN=false
ENV="stage"
ACTION=""
REPO="jcornell3/tamshai-enterprise-ai"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }
log_secret() { echo -e "${CYAN}[SECRET]${NC} $1"; }

# =============================================================================
# Password Definitions
# =============================================================================
# Format: "GITHUB_SECRET_NAME:LENGTH:DESCRIPTION"
#
# These are the secrets that need complex passwords (special characters)
# Based on actual GitHub secrets in jcornell3/tamshai-enterprise-ai
# =============================================================================

# Stage/VPS environment passwords (currently in use on VPS)
STAGE_PASSWORDS=(
    "POSTGRES_PASSWORD:24:PostgreSQL main database password (stage)"
    "TAMSHAI_DB_PASSWORD:24:Tamshai DB password (stage)"
    "TAMSHAI_APP_PASSWORD:24:Tamshai app user password (stage)"
    "STAGE_TAMSHAI_APP_PASSWORD:24:Stage tamshai_app user (RLS enforced)"
    "KEYCLOAK_VPS_ADMIN_PASSWORD:24:Keycloak VPS admin password"
    "KEYCLOAK_DB_PASSWORD:24:Keycloak database password (stage)"
    "MONGODB_PASSWORD:24:MongoDB root password (stage)"
    "MINIO_ROOT_PASSWORD:24:MinIO root password (stage)"
    "ELASTIC_PASSWORD:24:Elasticsearch password (stage)"
    "VAULT_DEV_ROOT_TOKEN_ID:24:Vault dev root token"
    "VAULT_DEV_TOKEN:24:Vault dev token"
    "MCP_INTERNAL_SECRET:32:MCP internal service secret"
    "MCP_UI_CLIENT_SECRET:32:MCP UI client secret"
    "E2E_ADMIN_API_KEY:32:E2E test admin API key"
    "STAGE_MCP_GATEWAY_CLIENT_SECRET:32:Stage MCP Gateway client secret"
    "STAGE_MCP_HR_SERVICE_CLIENT_SECRET:32:Stage MCP HR service client secret"
)

# Dev environment passwords (local development)
DEV_PASSWORDS=(
    "POSTGRES_DEV_PASSWORD:24:PostgreSQL dev password"
    "TAMSHAI_DB_DEV_PASSWORD:24:Tamshai DB dev password"
    "TAMSHAI_APP_DEV_PASSWORD:24:Tamshai app dev password"
    "KEYCLOAK_DEV_ADMIN_PASSWORD:24:Keycloak dev admin password"
    "KEYCLOAK_DB_DEV_PASSWORD:24:Keycloak dev database password"
    "MONGODB_DEV_PASSWORD:24:MongoDB dev password"
    "REDIS_DEV_PASSWORD:24:Redis dev password"
)

# Production environment passwords (GCP)
PROD_PASSWORDS=(
    "MONGODB_ATLAS_PASSWORD_PROD:24:MongoDB Atlas production password"
    "PROD_MCP_HR_SERVICE_CLIENT_SECRET:32:Prod MCP HR service client secret"
)

# Shared/Legacy secrets (used across environments - handle with care)
SHARED_PASSWORDS=(
    "KEYCLOAK_ADMIN_PASSWORD:24:Keycloak admin password (shared)"
    "MCP_GATEWAY_CLIENT_SECRET:32:MCP Gateway client secret (shared)"
    "MCP_HR_SERVICE_CLIENT_SECRET:32:MCP HR service client secret (shared)"
    "MCP_INTEGRATION_RUNNER_SECRET:32:MCP integration runner secret"
    "VAULT_ROOT_TOKEN:24:Vault root token (prod)"
)

# =============================================================================
# Functions
# =============================================================================

# Generate a complex password with special characters
generate_complex_password() {
    local length="${1:-24}"

    # Use openssl to generate random bytes, then base64 encode
    # Replace some characters to ensure special chars are included
    # This ensures: uppercase, lowercase, numbers, and special chars
    local password=""

    # Generate base random string
    password=$(openssl rand -base64 $((length * 2)) | tr -d '\n' | head -c "$length")

    # Ensure at least one of each required character type
    # by replacing characters at random positions
    local special_chars='!@#$%^&*()_+-=[]{}|;:,.<>?'
    local upper='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    local lower='abcdefghijklmnopqrstuvwxyz'
    local digits='0123456789'

    # Get random characters from each set
    local rand_special="${special_chars:RANDOM % ${#special_chars}:1}"
    local rand_upper="${upper:RANDOM % ${#upper}:1}"
    local rand_lower="${lower:RANDOM % ${#lower}:1}"
    local rand_digit="${digits:RANDOM % ${#digits}:1}"

    # Replace first 4 characters to guarantee complexity
    password="${rand_upper}${rand_lower}${rand_digit}${rand_special}${password:4}"

    # Shuffle the password (if shuf is available)
    if command -v shuf &>/dev/null; then
        password=$(echo "$password" | fold -w1 | shuf | tr -d '\n')
    fi

    echo "$password"
}

# Check if a password is complex (has special characters)
is_complex_password() {
    local password="$1"

    # Check for at least one special character
    if [[ "$password" =~ [^a-zA-Z0-9] ]]; then
        return 0  # Has special characters
    else
        return 1  # No special characters
    fi
}

# Update a GitHub secret
update_github_secret() {
    local secret_name="$1"
    local secret_value="$2"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would update $secret_name (${#secret_value} chars)"
        # Show first 4 and last 4 chars for verification
        local preview="${secret_value:0:4}...${secret_value: -4}"
        log_info "  Preview: $preview"
    else
        echo -n "$secret_value" | gh secret set "$secret_name" --repo "$REPO"
        log_info "Updated $secret_name"
    fi
}

# Get current value of a GitHub secret (returns empty if can't read)
# Note: GitHub API doesn't allow reading secret values, only checking existence
check_secret_exists() {
    local secret_name="$1"
    gh secret list --repo "$REPO" 2>/dev/null | grep -q "^$secret_name" && return 0 || return 1
}

# List all passwords that would be rotated
list_passwords() {
    log_header "Passwords to Rotate for Environment: $ENV"

    local passwords=()
    case "$ENV" in
        dev)    passwords=("${DEV_PASSWORDS[@]}") ;;
        stage)  passwords=("${STAGE_PASSWORDS[@]}") ;;
        prod)   passwords=("${PROD_PASSWORDS[@]}") ;;
        shared) passwords=("${SHARED_PASSWORDS[@]}") ;;
        all)
            passwords=("${DEV_PASSWORDS[@]}" "${STAGE_PASSWORDS[@]}" "${PROD_PASSWORDS[@]}" "${SHARED_PASSWORDS[@]}")
            ;;
    esac

    echo ""
    printf "%-40s %-8s %s\n" "SECRET NAME" "LENGTH" "DESCRIPTION"
    printf "%-40s %-8s %s\n" "----------------------------------------" "--------" "--------------------"

    for entry in "${passwords[@]}"; do
        IFS=':' read -r name length desc <<< "$entry"

        # Check if secret exists
        local status="[NEW]"
        if check_secret_exists "$name"; then
            status="[EXISTS]"
        fi

        printf "%-40s %-8s %s %s\n" "$name" "$length" "$desc" "$status"
    done

    echo ""
    log_info "Total: ${#passwords[@]} passwords"
}

# Verify current password complexity
verify_passwords() {
    log_header "Verifying Password Complexity"
    log_warn "Note: Cannot read GitHub secret values directly."
    log_info "Checking which secrets exist..."
    echo ""

    local passwords=()
    case "$ENV" in
        dev)    passwords=("${DEV_PASSWORDS[@]}") ;;
        stage)  passwords=("${STAGE_PASSWORDS[@]}") ;;
        prod)   passwords=("${PROD_PASSWORDS[@]}") ;;
        shared) passwords=("${SHARED_PASSWORDS[@]}") ;;
        all)
            passwords=("${DEV_PASSWORDS[@]}" "${STAGE_PASSWORDS[@]}" "${PROD_PASSWORDS[@]}" "${SHARED_PASSWORDS[@]}")
            ;;
    esac

    local exists=0
    local missing=0

    for entry in "${passwords[@]}"; do
        IFS=':' read -r name length desc <<< "$entry"

        if check_secret_exists "$name"; then
            log_info "✓ $name exists"
            ((exists++))
        else
            log_warn "✗ $name MISSING"
            ((missing++))
        fi
    done

    echo ""
    log_info "Summary: $exists exist, $missing missing"

    if [ $missing -gt 0 ]; then
        log_warn "Run with --all to create missing secrets with complex passwords"
    fi
}

# Rotate all passwords for the specified environment
rotate_all_passwords() {
    log_header "Rotating Passwords for Environment: $ENV"

    local passwords=()
    case "$ENV" in
        dev)    passwords=("${DEV_PASSWORDS[@]}") ;;
        stage)  passwords=("${STAGE_PASSWORDS[@]}") ;;
        prod)   passwords=("${PROD_PASSWORDS[@]}") ;;
        shared) passwords=("${SHARED_PASSWORDS[@]}") ;;
        all)
            passwords=("${DEV_PASSWORDS[@]}" "${STAGE_PASSWORDS[@]}" "${PROD_PASSWORDS[@]}" "${SHARED_PASSWORDS[@]}")
            ;;
    esac

    if [ "$DRY_RUN" = false ]; then
        echo ""
        log_warn "⚠️  WARNING: This will rotate ${#passwords[@]} passwords!"
        log_warn "⚠️  Services using these passwords will need to be redeployed."
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Aborted."
            exit 0
        fi
    fi

    echo ""
    local updated=0
    local failed=0

    for entry in "${passwords[@]}"; do
        IFS=':' read -r name length desc <<< "$entry"

        log_secret "Rotating: $name ($desc)"

        # Generate new complex password
        local new_password
        new_password=$(generate_complex_password "$length")

        # Verify it's complex
        if ! is_complex_password "$new_password"; then
            log_error "Generated password is not complex enough, retrying..."
            new_password=$(generate_complex_password "$length")
        fi

        # Update GitHub secret
        if update_github_secret "$name" "$new_password"; then
            ((updated++))
        else
            log_error "Failed to update $name"
            ((failed++))
        fi
    done

    echo ""
    log_header "Rotation Summary"
    log_info "Updated: $updated"
    if [ $failed -gt 0 ]; then
        log_error "Failed: $failed"
    fi

    if [ "$DRY_RUN" = false ]; then
        echo ""
        log_warn "NEXT STEPS:"
        log_info "1. Run 'terraform apply' to update VPS with new passwords"
        log_info "2. Or run Phoenix rebuild: terraform destroy && terraform apply"
        log_info "3. Verify services are working after deployment"
    fi
}

# =============================================================================
# Argument Parsing
# =============================================================================

show_help() {
    head -35 "$0" | tail -32
    exit 0
}

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --env) ENV="$2"; shift 2 ;;
        --all) ACTION="rotate"; shift ;;
        --list) ACTION="list"; shift ;;
        --verify) ACTION="verify"; shift ;;
        --help|-h) show_help ;;
        *) log_error "Unknown option: $1"; show_help ;;
    esac
done

# Default action
ACTION="${ACTION:-list}"

# =============================================================================
# Main
# =============================================================================

main() {
    echo "=========================================="
    echo "Password Rotation Tool"
    echo "=========================================="
    echo "Environment: $ENV"
    echo "Action: $ACTION"
    echo "Dry Run: $DRY_RUN"
    echo "Repository: $REPO"
    echo ""

    # Check prerequisites
    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) not installed"
        exit 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi

    if ! command -v openssl &>/dev/null; then
        log_error "openssl not installed (needed for password generation)"
        exit 1
    fi

    case "$ACTION" in
        list)
            list_passwords
            ;;
        verify)
            verify_passwords
            ;;
        rotate)
            rotate_all_passwords
            ;;
        *)
            log_error "Unknown action: $ACTION"
            exit 1
            ;;
    esac
}

main "$@"
