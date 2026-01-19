#!/bin/bash
# =============================================================================
# Tamshai Vault Management Script
# =============================================================================
#
# Manage HashiCorp Vault secrets and configuration.
#
# Usage:
#   ./vault.sh [command] [environment]
#
# Commands:
#   status     Check Vault status
#   secrets    List secrets
#   get        Get a secret value
#   set        Set a secret value
#   rotate     Rotate a secret
#   policies   List policies
#   ui         Open Vault UI
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Examples:
#   ./vault.sh status dev
#   ./vault.sh secrets dev
#   ./vault.sh get dev tamshai/mcp-gateway
#   ./vault.sh set dev tamshai/test key=value
#   ./vault.sh ui dev
#
# Environment Variables (for stage):
#   VPS_HOST     - VPS IP address or hostname (required for stage operations)
#   VPS_SSH_USER - SSH username (default: root)
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load .env.local if it exists (for VPS_HOST and other local config)
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_ROOT/.env.local"
fi

COMMAND="${1:-status}"
ENV="${2:-dev}"
SECRET_PATH="${3:-}"
SECRET_VALUE="${4:-}"

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

# Configure Vault CLI based on environment
setup_vault() {
    if [ "$ENV" = "dev" ]; then
        export VAULT_ADDR="http://localhost:8200"
        export VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN:-dev-root-token}"
    else
        local vps_host="${VPS_HOST:-}"
        if [ -z "$vps_host" ]; then
            log_error "VPS_HOST not set. Either:"
            log_info "  1. Create .env.local with VPS_HOST=<ip>"
            log_info "  2. Export VPS_HOST environment variable"
            log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
            exit 1
        fi
        export VAULT_ADDR="https://${vps_host}:8200"
        if [ -z "${VAULT_TOKEN:-}" ]; then
            log_error "VAULT_TOKEN required for stage environment"
            exit 1
        fi
    fi
}

cmd_status() {
    log_header "Vault Status"

    setup_vault

    echo "Address: $VAULT_ADDR"
    echo ""

    if [ "$ENV" = "dev" ]; then
        docker exec tamshai-vault vault status || log_error "Vault not running"
    else
        vault status || log_error "Vault not accessible"
    fi
}

cmd_secrets() {
    log_header "Vault Secrets"

    setup_vault

    log_info "Listing secrets at tamshai/..."
    echo ""

    if [ "$ENV" = "dev" ]; then
        docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VAULT_TOKEN" \
            tamshai-vault vault kv list tamshai/ 2>/dev/null || echo "No secrets found or engine not enabled"
    else
        vault kv list tamshai/ 2>/dev/null || echo "No secrets found or engine not enabled"
    fi
}

cmd_get() {
    if [ -z "$SECRET_PATH" ]; then
        log_error "Secret path required"
        echo "Usage: $0 get [env] <path>"
        echo "Example: $0 get dev tamshai/mcp-gateway"
        exit 1
    fi

    log_header "Get Secret: $SECRET_PATH"

    setup_vault

    if [ "$ENV" = "dev" ]; then
        docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VAULT_TOKEN" \
            tamshai-vault vault kv get "$SECRET_PATH"
    else
        vault kv get "$SECRET_PATH"
    fi
}

cmd_set() {
    if [ -z "$SECRET_PATH" ] || [ -z "$SECRET_VALUE" ]; then
        log_error "Secret path and value required"
        echo "Usage: $0 set [env] <path> <key=value>"
        echo "Example: $0 set dev tamshai/test api_key=secret123"
        exit 1
    fi

    log_header "Set Secret: $SECRET_PATH"

    setup_vault

    if [ "$ENV" = "dev" ]; then
        docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VAULT_TOKEN" \
            tamshai-vault vault kv put "$SECRET_PATH" "$SECRET_VALUE"
    else
        vault kv put "$SECRET_PATH" "$SECRET_VALUE"
    fi

    log_info "Secret updated"
}

cmd_rotate() {
    if [ -z "$SECRET_PATH" ]; then
        log_error "Secret path required"
        echo "Usage: $0 rotate [env] <path>"
        exit 1
    fi

    log_header "Rotate Secret: $SECRET_PATH"

    setup_vault

    # Generate new random secret
    NEW_SECRET=$(openssl rand -base64 32)

    echo "New secret generated (32 bytes, base64 encoded)"
    read -p "Apply this rotation? (yes/no): " confirm

    if [ "$confirm" = "yes" ]; then
        if [ "$ENV" = "dev" ]; then
            docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VAULT_TOKEN" \
                tamshai-vault vault kv patch "$SECRET_PATH" value="$NEW_SECRET"
        else
            vault kv patch "$SECRET_PATH" value="$NEW_SECRET"
        fi
        log_info "Secret rotated"
    else
        log_info "Rotation cancelled"
    fi
}

cmd_policies() {
    log_header "Vault Policies"

    setup_vault

    if [ "$ENV" = "dev" ]; then
        docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="$VAULT_TOKEN" \
            tamshai-vault vault policy list
    else
        vault policy list
    fi
}

cmd_ui() {
    log_header "Opening Vault UI"

    if [ "$ENV" = "dev" ]; then
        local url="http://localhost:8200"
        log_info "Opening: $url"
        log_info "Token: ${VAULT_DEV_ROOT_TOKEN:-dev-root-token}"

        # Try to open browser
        if command -v start >/dev/null 2>&1; then
            start "$url"
        elif command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$url"
        elif command -v open >/dev/null 2>&1; then
            open "$url"
        else
            echo "Open this URL in your browser: $url"
        fi
    else
        local vps_host="${VPS_HOST:-}"
        if [ -z "$vps_host" ]; then
            log_error "VPS_HOST not set. Either:"
            log_info "  1. Create .env.local with VPS_HOST=<ip>"
            log_info "  2. Export VPS_HOST environment variable"
            log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
            exit 1
        fi
        local url="https://${vps_host}:8200"
        log_info "Vault UI: $url"
        log_warn "Ensure VPN/SSH tunnel is active for secure access"
    fi
}

show_help() {
    echo "Vault Management Script"
    echo ""
    echo "Usage: $0 [command] [environment] [args...]"
    echo ""
    echo "Commands:"
    echo "  status     Check Vault status"
    echo "  secrets    List secrets"
    echo "  get        Get a secret value"
    echo "  set        Set a secret value"
    echo "  rotate     Rotate a secret"
    echo "  policies   List policies"
    echo "  ui         Open Vault UI"
    echo ""
    echo "Environments: dev (default), stage"
}

main() {
    case "$COMMAND" in
        status)   cmd_status ;;
        secrets)  cmd_secrets ;;
        get)      cmd_get ;;
        set)      cmd_set ;;
        rotate)   cmd_rotate ;;
        policies) cmd_policies ;;
        ui)       cmd_ui ;;
        help|--help|-h) show_help ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
