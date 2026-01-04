#!/bin/bash
# =============================================================================
# Tamshai Environment Rebuild
# =============================================================================
#
# Stop and optionally clean containers for rebuild. Does NOT destroy
# infrastructure - use teardown.sh for full environment destruction.
#
# Usage:
#   ./rebuild.sh [environment] [options]
#
# Environments:
#   dev         - Local development (default)
#   stage       - VPS staging (requires SSH)
#
# Options:
#   --volumes   - Also remove data volumes (DESTRUCTIVE to data!)
#   --all       - Remove everything including images
#   --force     - Skip confirmation prompts
#
# Examples:
#   ./rebuild.sh                    # Stop dev containers
#   ./rebuild.sh --volumes          # Stop and remove volumes
#   ./rebuild.sh stage              # Stop stage containers (via SSH)
#   ./rebuild.sh stage --all        # Full container/image cleanup on stage
#
# Note: For full infrastructure teardown, use teardown.sh instead.
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV="${1:-dev}"
REMOVE_VOLUMES=false
REMOVE_ALL=false
FORCE=false

# Parse options
shift || true
while [ $# -gt 0 ]; do
    case "$1" in
        --volumes|-v) REMOVE_VOLUMES=true; shift ;;
        --all|-a) REMOVE_ALL=true; REMOVE_VOLUMES=true; shift ;;
        --force|-f) FORCE=true; shift ;;
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
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi
}

teardown_dev() {
    log_info "Rebuilding dev environment (stopping containers)..."

    local compose_dir="$PROJECT_ROOT/infrastructure/docker"

    if [ ! -f "$compose_dir/docker-compose.yml" ]; then
        log_error "docker-compose.yml not found in $compose_dir"
        exit 1
    fi

    cd "$compose_dir"

    # Show what will be affected
    log_info "Containers to stop:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || echo "  (none running)"
    echo ""

    if [ "$REMOVE_VOLUMES" = "true" ]; then
        confirm "WARNING: This will DELETE ALL DATA in volumes!"
    fi

    # Perform teardown
    if [ "$REMOVE_ALL" = "true" ]; then
        log_info "Removing containers, volumes, and images..."
        docker compose down -v --rmi all --remove-orphans
    elif [ "$REMOVE_VOLUMES" = "true" ]; then
        log_info "Removing containers and volumes..."
        docker compose down -v --remove-orphans
    else
        log_info "Stopping containers..."
        docker compose down --remove-orphans
    fi

    log_info "Dev environment rebuild complete (containers stopped)"
}

teardown_stage() {
    log_info "Rebuilding stage environment (stopping containers)..."

    # Check for VPS host
    local VPS_HOST="${VPS_HOST:-5.78.159.29}"
    local VPS_USER="${VPS_USER:-root}"

    log_warn "This will stop containers on the VPS at $VPS_HOST (infrastructure preserved)"

    if [ "$REMOVE_VOLUMES" = "true" ]; then
        confirm "WARNING: This will DELETE ALL DATA on the VPS!"
    else
        confirm "This will stop all containers on the VPS."
    fi

    # SSH command builder
    local ssh_cmd="ssh $VPS_USER@$VPS_HOST"

    # Test SSH connection
    if ! $ssh_cmd "echo 'SSH connection successful'" 2>/dev/null; then
        log_error "Cannot connect to VPS via SSH"
        log_info "Ensure SSH key is configured for $VPS_USER@$VPS_HOST"
        exit 1
    fi

    # Build docker compose command
    local compose_cmd="cd /opt/tamshai && docker compose"

    if [ "$REMOVE_ALL" = "true" ]; then
        $ssh_cmd "$compose_cmd down -v --rmi all --remove-orphans"
    elif [ "$REMOVE_VOLUMES" = "true" ]; then
        $ssh_cmd "$compose_cmd down -v --remove-orphans"
    else
        $ssh_cmd "$compose_cmd down --remove-orphans"
    fi

    log_info "Stage environment rebuild complete (containers stopped, VPS preserved)"
}

show_help() {
    echo "Environment Rebuild (Container Management)"
    echo ""
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Stops and optionally cleans containers. Does NOT destroy infrastructure."
    echo "For full teardown (Terraform destroy), use teardown.sh instead."
    echo ""
    echo "Environments:"
    echo "  dev      - Local development (default)"
    echo "  stage    - VPS staging"
    echo ""
    echo "Options:"
    echo "  --volumes, -v   Remove data volumes (DESTRUCTIVE to data)"
    echo "  --all, -a       Remove everything including images"
    echo "  --force, -f     Skip confirmation prompts"
    echo ""
    echo "Examples:"
    echo "  $0                    # Stop dev containers"
    echo "  $0 --volumes          # Stop dev and remove volumes"
    echo "  $0 stage              # Stop stage containers"
    echo "  $0 stage --all        # Full cleanup on stage"
}

main() {
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
