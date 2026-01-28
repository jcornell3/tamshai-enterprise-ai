#!/bin/bash
# =============================================================================
# GCP Common Library - Shared Utilities
# =============================================================================
#
# Common functions shared across GCP deployment and DR scripts:
# - evacuate-region.sh
# - cleanup-recovery.sh
# - phoenix-rebuild.sh
#
# Usage:
#   source /path/to/scripts/gcp/lib/common.sh
#   log_phase "1" "DEPLOY INFRASTRUCTURE"
#   log_step "Creating VPC..."
#   if confirm "Proceed with deployment?"; then
#     log_success "User confirmed"
#   fi
#
# This library uses set -eo pipefail but NOT set -u because gcloud wrapper
# uses unbound $CLOUDSDK_PYTHON variable (Issue #16).
#
# Ref: Issue #102 - Unify prod and DR deployments
# =============================================================================

# Strict mode (but not -u due to gcloud compatibility)
set -eo pipefail

# =============================================================================
# COLORS
# =============================================================================

# Export colors so they're available in subshells
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export NC='\033[0m'

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

# Log a major phase with decorative header
# Usage: log_phase "1" "DEPLOY INFRASTRUCTURE"
log_phase() {
    echo -e "\n${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}  PHASE $1: $2${NC}"
    echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
}

# Log a step within a phase
# Usage: log_step "Creating VPC..."
log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Log informational message
# Usage: log_info "Region: ${GCP_REGION}"
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Log success message
# Usage: log_success "VPC created"
log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Log warning message
# Usage: log_warn "Service not ready yet"
log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Log error message
# Usage: log_error "Failed to create resource"
log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# CONFIRMATION FUNCTION
# =============================================================================

# Ask for user confirmation (supports --force/AUTO_YES bypass)
# Usage: if confirm "Proceed?"; then echo "Yes"; fi
#
# Environment variables that bypass confirmation:
#   FORCE=true    - Used by cleanup-recovery.sh
#   AUTO_YES=true - Used by evacuate-region.sh
confirm() {
    local prompt="${1:-Continue?}"

    # Check for force/auto modes
    if [[ "${FORCE:-false}" == "true" ]] || [[ "${AUTO_YES:-false}" == "true" ]]; then
        return 0
    fi

    echo -e "${YELLOW}"
    read -p "$prompt [y/N] " -n 1 -r
    echo -e "${NC}"
    [[ $REPLY =~ ^[Yy]$ ]]
}

# =============================================================================
# GCP CONFIGURATION HELPERS
# =============================================================================

# Get project ID from multiple sources (env vars, gcloud config)
# Usage: PROJECT_ID=$(get_project_id)
get_project_id() {
    echo "${GCP_PROJECT:-${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}}"
}

# Get default region from environment or gcloud config
# Usage: REGION=$(get_default_region)
get_default_region() {
    echo "${GCP_REGION:-$(gcloud config get-value compute/region 2>/dev/null || echo "")}"
}

# =============================================================================
# TFVARS HELPERS
# =============================================================================

# Load tfvars file and extract a specific variable value
# Usage: REGION=$(get_tfvar "region" "environments/prod.tfvars")
get_tfvar() {
    local var_name="$1"
    local tfvars_file="$2"

    if [ ! -f "$tfvars_file" ]; then
        log_error "tfvars file not found: $tfvars_file"
        return 1
    fi

    # Extract value using grep and sed
    # Handles: var = "value" or var = value
    grep "^${var_name}\\s*=" "$tfvars_file" | \
        sed 's/.*=\s*//; s/"//g; s/^\s*//; s/\s*$//'
}

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

# Get terraform state prefix for environment
# Usage: PREFIX=$(get_state_prefix "primary")
#        PREFIX=$(get_state_prefix "recovery-20260123")
get_state_prefix() {
    local env_id="${1:-primary}"

    if [[ "$env_id" == "primary" ]]; then
        echo "gcp/phase1"
    else
        echo "gcp/recovery/${env_id}"
    fi
}

# Check if a state path exists in GCS
# Usage: if state_exists "gcp/recovery/test-01"; then ...
state_exists() {
    local state_prefix="$1"
    local bucket="${STATE_BUCKET:-tamshai-terraform-state-prod}"

    gcloud storage ls "gs://${bucket}/${state_prefix}/" &>/dev/null 2>&1
}

# =============================================================================
# RESOURCE HELPERS
# =============================================================================

# Wait for a condition with timeout
# Usage: wait_for "Cloud SQL ready" 300 "gcloud sql instances describe NAME ..."
wait_for() {
    local description="$1"
    local timeout_seconds="${2:-300}"
    local check_command="$3"
    local interval="${4:-10}"

    local elapsed=0

    log_info "Waiting for: $description (timeout: ${timeout_seconds}s)"

    while [ $elapsed -lt $timeout_seconds ]; do
        if eval "$check_command" &>/dev/null 2>&1; then
            log_success "$description - ready"
            return 0
        fi

        log_info "  Waiting... (${elapsed}s / ${timeout_seconds}s)"
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    log_error "$description - timeout after ${timeout_seconds}s"
    return 1
}

# =============================================================================
# EXPORT FUNCTIONS
# =============================================================================
# Export functions so they're available when sourcing this file

export -f log_phase log_step log_info log_success log_warn log_error
export -f confirm
export -f get_project_id get_default_region
export -f get_tfvar get_state_prefix state_exists
export -f wait_for
