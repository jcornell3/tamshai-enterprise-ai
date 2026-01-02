#!/bin/bash
# =============================================================================
# Tamshai Service Rollback Script
# =============================================================================
#
# Rollback services to a previous deployment state.
#
# Usage:
#   ./rollback.sh [environment] [options]
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Options:
#   --commit=<hash>   Rollback to specific git commit
#   --steps=<n>       Rollback n commits (default: 1)
#   --list            List recent deployments
#   --dry-run         Show what would be rolled back
#   --backup          Create backup before rollback
#
# Examples:
#   ./rollback.sh dev --steps=1          # Rollback 1 commit in dev
#   ./rollback.sh stage --commit=abc123  # Rollback to specific commit
#   ./rollback.sh stage --list           # List recent commits
#   ./rollback.sh stage --backup         # Backup then rollback
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV="${1:-dev}"
COMMIT=""
STEPS=1
LIST_ONLY=false
DRY_RUN=false
BACKUP=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        dev|stage) ENV="$arg" ;;
        --commit=*) COMMIT="${arg#*=}" ;;
        --steps=*) STEPS="${arg#*=}" ;;
        --list) LIST_ONLY=true ;;
        --dry-run) DRY_RUN=true ;;
        --backup) BACKUP=true ;;
    esac
done

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

list_deployments_dev() {
    log_header "Recent Git Commits (Dev)"

    cd "$PROJECT_ROOT"

    echo "Recent commits:"
    git log --oneline -n 10

    echo ""
    echo "Current HEAD:"
    git log --oneline -n 1
}

list_deployments_stage() {
    log_header "Recent Git Commits (Stage)"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << 'LIST'
cd /opt/tamshai

echo "Recent commits:"
git log --oneline -n 10

echo ""
echo "Current HEAD:"
git log --oneline -n 1

echo ""
echo "Deployment tags (if any):"
git tag -l "deploy-*" | tail -5
LIST
}

confirm_rollback() {
    local target_commit="$1"

    echo -e "${YELLOW}WARNING: This will rollback services to a previous state!${NC}"
    echo ""
    echo "Environment: $ENV"
    echo "Target commit: $target_commit"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN - No changes will be made"
        return 0
    fi

    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

get_rollback_commit() {
    if [ -n "$COMMIT" ]; then
        echo "$COMMIT"
    else
        # Get commit N steps back
        git rev-parse "HEAD~${STEPS}"
    fi
}

rollback_dev() {
    log_header "Rolling Back Dev Environment"

    cd "$PROJECT_ROOT"

    # Determine target commit
    local target_commit
    target_commit=$(get_rollback_commit)

    log_info "Target commit: $target_commit"
    git log --oneline -n 1 "$target_commit"

    # Confirm
    confirm_rollback "$target_commit"

    if [ "$DRY_RUN" = true ]; then
        log_info "Would reset to: $target_commit"
        log_info "Would rebuild: docker compose up -d --build"
        return 0
    fi

    # Create backup if requested
    if [ "$BACKUP" = true ]; then
        log_info "Creating backup before rollback..."
        "$SCRIPT_DIR/../db/backup.sh" dev all || log_warn "Backup failed, continuing..."
    fi

    # Checkout the target commit
    log_info "Checking out $target_commit..."
    git checkout "$target_commit"

    # Rebuild services
    log_info "Rebuilding services..."
    cd "$PROJECT_ROOT/infrastructure/docker"
    docker compose up -d --build

    # Wait for services
    log_info "Waiting for services to start..."
    sleep 15

    # Health check
    "$SCRIPT_DIR/status.sh" dev || true

    log_info "Rollback complete"
    log_warn "Note: You are now in 'detached HEAD' state"
    log_warn "To return to main branch: git checkout main"
}

rollback_stage() {
    log_header "Rolling Back Stage Environment"

    local vps_host="${VPS_HOST:-5.78.159.29}"
    local vps_user="${VPS_SSH_USER:-root}"

    # Determine target commit
    local target_commit
    if [ -n "$COMMIT" ]; then
        target_commit="$COMMIT"
    else
        # Need to get the commit from the remote
        target_commit=$(ssh "$vps_user@$vps_host" "cd /opt/tamshai && git rev-parse HEAD~${STEPS}")
    fi

    log_info "Target commit: $target_commit"

    # Confirm
    confirm_rollback "$target_commit"

    if [ "$DRY_RUN" = true ]; then
        log_info "Would reset stage to: $target_commit"
        return 0
    fi

    # Perform rollback on VPS
    ssh -o ConnectTimeout=30 "$vps_user@$vps_host" << ROLLBACK
set -e
cd /opt/tamshai

echo "=== Creating deployment tag for current state ==="
CURRENT_COMMIT=\$(git rev-parse HEAD)
git tag "pre-rollback-\$(date +%Y%m%d_%H%M%S)" "\$CURRENT_COMMIT" 2>/dev/null || true

$( [ "$BACKUP" = true ] && echo '
echo "=== Creating backup before rollback ==="
./scripts/db/backup.sh stage all || echo "Backup failed, continuing..."
' )

echo "=== Resetting to target commit ==="
git fetch origin
git reset --hard "$target_commit"

echo "=== Loading environment ==="
export \$(cat .env | grep -v '^#' | xargs)

echo "=== Rebuilding services ==="
docker compose -f docker-compose.vps.yml up -d --build

echo "=== Waiting for services ==="
sleep 30

echo "=== Health check ==="
curl -sf http://localhost:3100/health && echo " MCP Gateway: OK" || echo " MCP Gateway: FAILED"
curl -sf http://localhost:8080/auth/health/ready && echo " Keycloak: OK" || echo " Keycloak: FAILED"

echo ""
echo "=== Rollback complete ==="
echo "Current commit: \$(git rev-parse HEAD)"
ROLLBACK

    log_info "Stage rollback complete"
}

show_help() {
    echo "Service Rollback Script"
    echo ""
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  dev    - Local Docker (default)"
    echo "  stage  - VPS staging server"
    echo ""
    echo "Options:"
    echo "  --commit=<hash>   Rollback to specific git commit"
    echo "  --steps=<n>       Rollback n commits (default: 1)"
    echo "  --list            List recent deployments"
    echo "  --dry-run         Show what would be rolled back"
    echo "  --backup          Create backup before rollback"
    echo ""
    echo "Examples:"
    echo "  $0 dev --steps=1"
    echo "  $0 stage --commit=abc123"
    echo "  $0 stage --list"
    echo "  $0 stage --backup --steps=2"
}

main() {
    echo "Tamshai Service Rollback"
    echo "Environment: $ENV"
    echo ""

    # Handle help
    if [ "${1:-}" = "help" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
        show_help
        exit 0
    fi

    # List mode
    if [ "$LIST_ONLY" = true ]; then
        if [ "$ENV" = "dev" ]; then
            list_deployments_dev
        else
            list_deployments_stage
        fi
        exit 0
    fi

    # Perform rollback
    if [ "$ENV" = "dev" ]; then
        rollback_dev
    else
        rollback_stage
    fi
}

main "$@"
