#!/bin/bash
# =============================================================================
# Common Shell Utilities for Tamshai Scripts
# =============================================================================
#
# Source this file in your scripts:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SCRIPT_DIR/../lib/common.sh"
#
# Or from project root:
#   source "scripts/lib/common.sh"
#
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Logging Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

# -----------------------------------------------------------------------------
# Environment Validation
# -----------------------------------------------------------------------------

# Validate environment name and return it (or exit with error)
# Usage: ENV=$(validate_environment "$1")
validate_environment() {
    local env="${1:-dev}"
    case "$env" in
        dev|stage|prod)
            echo "$env"
            ;;
        *)
            log_error "Unknown environment: $env"
            log_info "Valid environments: dev, stage, prod"
            return 1
            ;;
    esac
}

# -----------------------------------------------------------------------------
# .env.local Loading
# -----------------------------------------------------------------------------

# Load .env.local if it exists (for VPS_HOST and other local config)
# Usage: load_env_local
load_env_local() {
    local env_file="${ENV_LOCAL_PATH:-}"

    # If ENV_LOCAL_PATH not set, look in standard locations
    if [ -z "$env_file" ]; then
        # Try project root first
        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        local project_root
        project_root="$(cd "$script_dir/../.." && pwd)"

        if [ -f "$project_root/.env.local" ]; then
            env_file="$project_root/.env.local"
        elif [ -f ".env.local" ]; then
            env_file=".env.local"
        fi
    fi

    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
        # shellcheck source=/dev/null
        source "$env_file"
    fi
}

# -----------------------------------------------------------------------------
# VPS Configuration
# -----------------------------------------------------------------------------

# Require VPS_HOST to be set (exits with helpful error if not)
# Usage: require_vps_host
require_vps_host() {
    if [ -z "${VPS_HOST:-}" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        return 1
    fi
}

# Get VPS host with validation (loads .env.local first)
# Usage: VPS=$(get_vps_host)
get_vps_host() {
    load_env_local
    require_vps_host || return 1
    echo "${VPS_HOST}"
}

# Get VPS SSH user (defaults to root)
# Usage: SSH_USER=$(get_vps_ssh_user)
get_vps_ssh_user() {
    echo "${VPS_SSH_USER:-root}"
}
