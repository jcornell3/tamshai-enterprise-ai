#!/bin/bash
# =============================================================================
# Rotate Keycloak Client Secrets (H4 - Automated Secret Rotation)
# =============================================================================
#
# Rotates Keycloak client secrets and updates GitHub Secrets.
# Part of the H4 automated secret rotation implementation.
#
# Usage:
#   ./rotate-keycloak-secrets.sh [options]
#
# Options:
#   --dry-run     Show what would be rotated without making changes
#   --env ENV     Target environment (dev, stage) - default: stage
#   --client ID   Rotate only this client (default: all MCP clients)
#   --yes, -y     Auto-confirm (no interactive prompt)
#
# Prerequisites:
#   - GitHub CLI (gh) authenticated
#   - Keycloak admin credentials in environment or GitHub Secrets
#   - curl, jq installed
#
# Rotated Clients:
#   - mcp-gateway (MCP_GATEWAY_CLIENT_SECRET)
#   - mcp-hr-service (MCP_HR_SERVICE_CLIENT_SECRET)
#   - mcp-ui (MCP_UI_CLIENT_SECRET)
#   - mcp-integration-runner (MCP_INTEGRATION_RUNNER_SECRET)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
DRY_RUN=false
AUTO_CONFIRM=false
ENV="stage"
TARGET_CLIENT=""
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
# Client Definitions
# =============================================================================
# Format: "client_id:github_secret_name:description"

CLIENTS=(
    "mcp-gateway:MCP_GATEWAY_CLIENT_SECRET:MCP Gateway confidential client"
    "mcp-hr-service:MCP_HR_SERVICE_CLIENT_SECRET:MCP HR identity sync service"
    "mcp-ui:MCP_UI_CLIENT_SECRET:MCP UI generative components"
    "mcp-integration-runner:MCP_INTEGRATION_RUNNER_SECRET:Integration test runner"
)

# Stage-specific overrides
STAGE_CLIENTS=(
    "mcp-gateway:STAGE_MCP_GATEWAY_CLIENT_SECRET:Stage MCP Gateway"
    "mcp-hr-service:STAGE_MCP_HR_SERVICE_CLIENT_SECRET:Stage MCP HR service"
)

# =============================================================================
# Functions
# =============================================================================

# Get Keycloak admin token
get_admin_token() {
    local keycloak_url="$1"
    local admin_password="$2"

    local response
    response=$(curl -sf -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        --data-urlencode "password=${admin_password}" \
        -d "grant_type=password" 2>/dev/null || echo "")

    if [ -z "$response" ]; then
        log_error "Failed to get admin token from Keycloak"
        return 1
    fi

    echo "$response" | jq -r '.access_token // empty'
}

# Get client UUID from client_id
get_client_uuid() {
    local keycloak_url="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"

    local response
    response=$(curl -sf "${keycloak_url}/admin/realms/${realm}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $token" 2>/dev/null || echo "[]")

    echo "$response" | jq -r '.[0].id // empty'
}

# Get current client secret
get_client_secret() {
    local keycloak_url="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"

    local response
    response=$(curl -sf "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer $token" 2>/dev/null || echo "{}")

    echo "$response" | jq -r '.value // empty'
}

# Regenerate client secret
regenerate_client_secret() {
    local keycloak_url="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"

    local response
    response=$(curl -sf -X POST "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" 2>/dev/null || echo "{}")

    echo "$response" | jq -r '.value // empty'
}

# Update GitHub secret
update_github_secret() {
    local secret_name="$1"
    local secret_value="$2"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would update GitHub secret: $secret_name"
        return 0
    fi

    # Use --body flag to avoid stdin issues with special characters
    if gh secret set "$secret_name" --repo "$REPO" --body "$secret_value" < /dev/null 2>/dev/null; then
        log_info "Updated GitHub secret: $secret_name"
        return 0
    else
        log_error "Failed to update GitHub secret: $secret_name"
        return 1
    fi
}

# Rotate a single client
rotate_client() {
    local keycloak_url="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"
    local github_secret="$5"
    local description="$6"

    log_secret "Rotating: $client_id ($description)"

    # Get client UUID
    local client_uuid
    client_uuid=$(get_client_uuid "$keycloak_url" "$token" "$realm" "$client_id")

    if [ -z "$client_uuid" ]; then
        log_warn "Client not found: $client_id (skipping)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would regenerate secret for: $client_id (UUID: $client_uuid)"
        log_info "[DRY-RUN] Would update GitHub secret: $github_secret"
        return 0
    fi

    # Regenerate secret in Keycloak
    local new_secret
    new_secret=$(regenerate_client_secret "$keycloak_url" "$token" "$realm" "$client_uuid")

    if [ -z "$new_secret" ]; then
        log_error "Failed to regenerate secret for: $client_id"
        return 1
    fi

    log_info "Keycloak secret regenerated for: $client_id"

    # Update GitHub secret
    if ! update_github_secret "$github_secret" "$new_secret"; then
        log_error "Failed to sync to GitHub: $github_secret"
        return 1
    fi

    return 0
}

# =============================================================================
# Main
# =============================================================================

show_help() {
    head -40 "$0" | tail -37
    exit 0
}

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --yes|-y) AUTO_CONFIRM=true; shift ;;
        --env) ENV="$2"; shift 2 ;;
        --client) TARGET_CLIENT="$2"; shift 2 ;;
        --help|-h) show_help ;;
        *) log_error "Unknown option: $1"; show_help ;;
    esac
done

main() {
    log_header "Keycloak Secret Rotation (H4)"
    echo "Environment: $ENV"
    echo "Dry Run: $DRY_RUN"
    echo ""

    # Prerequisites check
    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) not installed"
        exit 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    fi

    if ! command -v jq &>/dev/null; then
        log_error "jq not installed"
        exit 1
    fi

    # Determine Keycloak URL and credentials based on environment
    local keycloak_url
    local admin_password
    local realm="tamshai-corp"

    case "$ENV" in
        dev)
            keycloak_url="http://localhost:8180/auth"
            admin_password="${KEYCLOAK_DEV_ADMIN_PASSWORD:-admin}"
            ;;
        stage)
            # Use internal URL when running from VPS (detected by presence of /opt/tamshai)
            # This allows the script to work both from CI/CD (external) and from VPS (internal)
            if [ -d "/opt/tamshai" ]; then
                # Running on VPS - use internal Docker network URL
                keycloak_url="http://keycloak:8080"
                log_info "Detected VPS environment, using internal Keycloak URL"
            else
                # Running externally (CI/CD, local) - use public URL
                keycloak_url="https://www.tamshai.com/auth"
            fi
            admin_password="${KEYCLOAK_VPS_ADMIN_PASSWORD:-}"

            # Try to get from GitHub secrets if not set
            if [ -z "$admin_password" ]; then
                log_warn "KEYCLOAK_VPS_ADMIN_PASSWORD not set, attempting to run via SSH..."
                log_error "Remote rotation via SSH not implemented yet"
                log_info "Set KEYCLOAK_VPS_ADMIN_PASSWORD and try again"
                exit 1
            fi
            ;;
        *)
            log_error "Unknown environment: $ENV"
            exit 1
            ;;
    esac

    log_info "Keycloak URL: $keycloak_url"
    log_info "Realm: $realm"

    # Get admin token
    log_info "Authenticating with Keycloak..."
    local token
    token=$(get_admin_token "$keycloak_url" "$admin_password")

    if [ -z "$token" ]; then
        log_error "Failed to authenticate with Keycloak"
        exit 1
    fi
    log_info "Authentication successful"

    # Select clients to rotate
    local clients_to_rotate=()

    if [ -n "$TARGET_CLIENT" ]; then
        # Single client rotation
        for entry in "${CLIENTS[@]}" "${STAGE_CLIENTS[@]}"; do
            IFS=':' read -r cid secret desc <<< "$entry"
            if [ "$cid" = "$TARGET_CLIENT" ]; then
                clients_to_rotate+=("$entry")
                break
            fi
        done

        if [ ${#clients_to_rotate[@]} -eq 0 ]; then
            log_error "Client not found: $TARGET_CLIENT"
            exit 1
        fi
    else
        # All clients for environment
        if [ "$ENV" = "stage" ]; then
            clients_to_rotate=("${STAGE_CLIENTS[@]}" "${CLIENTS[@]}")
        else
            clients_to_rotate=("${CLIENTS[@]}")
        fi
    fi

    # Confirmation
    if [ "$DRY_RUN" = false ] && [ "$AUTO_CONFIRM" = false ]; then
        echo ""
        log_warn "This will regenerate secrets for ${#clients_to_rotate[@]} Keycloak clients"
        log_warn "Services using these secrets will need to be redeployed"
        echo ""
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Aborted"
            exit 0
        fi
    fi

    # Rotate each client
    log_header "Rotating Client Secrets"
    local success=0
    local failed=0

    for entry in "${clients_to_rotate[@]}"; do
        IFS=':' read -r client_id github_secret description <<< "$entry"

        if rotate_client "$keycloak_url" "$token" "$realm" "$client_id" "$github_secret" "$description"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done

    # Summary
    log_header "Rotation Summary"
    log_info "Successful: $success"
    if [ $failed -gt 0 ]; then
        log_error "Failed: $failed"
    fi

    if [ "$DRY_RUN" = false ] && [ $success -gt 0 ]; then
        echo ""
        log_warn "NEXT STEPS:"
        log_info "1. Trigger deployment to apply new secrets"
        log_info "   gh workflow run deploy-vps.yml"
        log_info "2. Verify services are working after deployment"
    fi
}

main "$@"
