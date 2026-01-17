#!/bin/bash
# =============================================================================
# Common utilities for Keycloak sync scripts
# =============================================================================
# Provides logging functions and color codes used across all library modules.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
#
# =============================================================================

# Colors for output (safe to redefine)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Logging Functions (only define if not already defined)
# =============================================================================

if ! type log_info &>/dev/null 2>&1; then
    log_info() {
        echo -e "${GREEN}[INFO]${NC} $1"
    }
fi

if ! type log_warn &>/dev/null 2>&1; then
    log_warn() {
        echo -e "${YELLOW}[WARN]${NC} $1"
    }
fi

if ! type log_error &>/dev/null 2>&1; then
    log_error() {
        echo -e "${RED}[ERROR]${NC} $1"
    }
fi

# =============================================================================
# KCADM Helper (supports mock function in tests)
# =============================================================================

# Helper to call kcadm (uses mock function if available, otherwise $KCADM path)
# This enables unit testing with mocked kcadm functions
# Always define this function - it's specific to Keycloak scripts
_kcadm() {
    # Check for mock function using multiple methods for compatibility
    # declare -F is most reliable for checking if a function is defined
    if declare -F kcadm &>/dev/null; then
        kcadm "$@"
    elif type kcadm &>/dev/null 2>&1 && [ "$(type -t kcadm)" = "function" ]; then
        kcadm "$@"
    else
        ${KCADM:-/opt/keycloak/bin/kcadm.sh} "$@"
    fi
}

# =============================================================================
# Shell Options (applied when sourced)
# =============================================================================

# These are typically set in the main script but can be set here as defaults
# set -euo pipefail
# set +H  # Disable history expansion to handle passwords with special characters like !
