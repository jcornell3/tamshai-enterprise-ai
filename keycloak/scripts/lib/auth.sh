#!/bin/bash
# =============================================================================
# Keycloak Authentication and Environment Configuration
# =============================================================================
# Provides environment configuration and kcadm authentication functions.
#
# Required Variables (set by caller):
#   ENV - Environment name (dev, stage, prod)
#   REALM - Keycloak realm name
#
# Exported Variables:
#   KEYCLOAK_URL - Keycloak server URL
#   ADMIN_USER - Admin username
#   ADMIN_PASS - Admin password
#   KCADM - Path to kcadm.sh
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/auth.sh"
#   configure_environment
#   kcadm_login
#
# =============================================================================

# Source common utilities (always source to ensure _kcadm is defined)
SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_LIB_DIR/common.sh"

# =============================================================================
# KCADM Path Resolution
# =============================================================================

# Get the path to kcadm.sh based on environment
# Checks KEYCLOAK_HOME, PATH, then default Docker container location
get_kcadm_path() {
    if [ -n "${KEYCLOAK_HOME:-}" ] && [ -f "${KEYCLOAK_HOME}/bin/kcadm.sh" ]; then
        echo "$KEYCLOAK_HOME/bin/kcadm.sh"
    elif command -v kcadm.sh &> /dev/null; then
        echo "kcadm.sh"
    else
        echo "/opt/keycloak/bin/kcadm.sh"
    fi
}

# Initialize KCADM variable
KCADM="${KCADM:-$(get_kcadm_path)}"

# =============================================================================
# Environment Configuration
# =============================================================================

# Configure environment-specific variables
# Sets KEYCLOAK_URL, ADMIN_USER, ADMIN_PASS based on ENV
configure_environment() {
    case "$ENV" in
        dev)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required - set in .env file}"
            ;;
        stage)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required for stage}"
            ;;
        prod)
            KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080/auth}"
            ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
            ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required for prod}"
            ;;
        *)
            log_error "Unknown environment: $ENV"
            return 1
            ;;
    esac

    log_info "Environment: $ENV"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Realm: $REALM"
}

# =============================================================================
# Keycloak Admin CLI Authentication
# =============================================================================

# Authenticate to Keycloak using kcadm
# Requires KEYCLOAK_URL, ADMIN_USER, ADMIN_PASS to be set
kcadm_login() {
    log_info "Authenticating to Keycloak..."
    if ! _kcadm config credentials \
        --server "$KEYCLOAK_URL" \
        --realm master \
        --user "$ADMIN_USER" \
        --password "$ADMIN_PASS"; then
        log_error "Authentication failed"
        return 1
    fi
    log_info "Authentication successful"
}
