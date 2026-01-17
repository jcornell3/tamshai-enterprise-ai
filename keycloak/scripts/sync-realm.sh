#!/bin/bash
# =============================================================================
# Keycloak Realm Synchronization Script
# =============================================================================
#
# This script synchronizes Keycloak configuration from source files to a
# running Keycloak instance. It's idempotent - safe to run multiple times.
#
# Usage:
#   ./sync-realm.sh [environment]
#
# Environments:
#   dev    - Local development (default)
#   stage  - VPS staging
#   prod   - Production
#
# Examples:
#   ./sync-realm.sh           # Sync to local dev
#   ./sync-realm.sh stage     # Sync to VPS stage
#
# Requirements:
#   - Keycloak must be running and accessible
#   - Admin credentials must be available
#   - For Docker: run inside container or with docker exec
#
# Environment Variables:
#   VPS_DOMAIN - VPS domain name for redirect URIs (default: vps.tamshai.com)
#
# =============================================================================

set -euo pipefail
set +H  # Disable history expansion to handle passwords with special characters like !

# =============================================================================
# Script Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REALM="tamshai-corp"
ENV="${1:-dev}"

# =============================================================================
# Source Library Modules
# =============================================================================

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/auth.sh"
source "$SCRIPT_DIR/lib/scopes.sh"
source "$SCRIPT_DIR/lib/clients.sh"
source "$SCRIPT_DIR/lib/mappers.sh"
source "$SCRIPT_DIR/lib/groups.sh"
source "$SCRIPT_DIR/lib/users.sh"

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "=========================================="
    log_info "Keycloak Realm Sync - Starting"
    log_info "=========================================="

    # Configure environment and authenticate
    configure_environment
    kcadm_login

    # Ensure standard OIDC scopes exist
    create_standard_scopes

    # Cache scope IDs once (avoid repeated API calls)
    cache_scope_ids

    # Sync all clients
    sync_website_client
    sync_flutter_client
    sync_web_portal_client
    sync_mcp_gateway_client
    sync_mcp_hr_service_client
    sync_sample_app_clients

    # Sync audience mapper on all web clients
    # This is critical for MCP Gateway token validation
    sync_audience_mapper

    # Sync subject (sub) claim mapper on all web clients
    # This ensures the 'sub' claim is included in tokens for user identification
    sync_sub_claim_mapper

    # Sync client role mappers on web-portal
    # This ensures mcp-gateway roles are included in tokens for authorization
    sync_client_role_mappers

    # Provision test user (for E2E testing)
    provision_test_user

    # Set test user password from environment variable
    # This updates password for users imported from realm export
    set_test_user_password

    # Sync C-Suite group (ensures executive and manager roles are assigned)
    sync_c_suite_group

    # Sync All-Employees group (for self-access via RLS)
    sync_all_employees_group

    # Assign users to groups (for dev/stage - restores role inheritance)
    assign_user_groups

    # Assign critical production users (CEO, etc.) to groups
    # This runs ONLY in prod and handles users who need group membership
    assign_critical_prod_users

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}

main "$@"
