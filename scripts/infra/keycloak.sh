#!/bin/bash
# =============================================================================
# Tamshai Keycloak Management Script
# =============================================================================
#
# Manage Keycloak configuration, clients, and users.
# Works in both dev and stage environments.
#
# Usage:
#   ./keycloak.sh [command] [environment] [options]
#
# Commands:
#   sync       Sync clients and configuration
#   status     Show Keycloak status and realm info
#   clients    List all clients in realm
#   users      List users (with optional role filter)
#   scopes     List client scopes
#   logs       Show Keycloak container logs
#
# Environments:
#   dev    - Local Docker (default)
#   stage  - VPS staging server
#
# Examples:
#   ./keycloak.sh sync dev              # Sync dev Keycloak
#   ./keycloak.sh sync stage            # Sync stage Keycloak
#   ./keycloak.sh status dev            # Show Keycloak status
#   ./keycloak.sh clients dev           # List all clients
#   ./keycloak.sh users dev             # List all users
#   ./keycloak.sh scopes dev            # List client scopes
#   ./keycloak.sh logs dev              # Show Keycloak logs
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

COMMAND="${1:-status}"
ENV="${2:-dev}"
REALM="tamshai-corp"
CONTAINER="tamshai-keycloak"

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

# Configure kcadm based on environment
setup_kcadm() {
    local admin_user="${KEYCLOAK_ADMIN:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
    local keycloak_url="http://localhost:8080/auth"

    if [ "$ENV" = "stage" ]; then
        admin_pass="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required for stage}"
    fi

    # Run kcadm in container
    run_kcadm() {
        if [ "$ENV" = "dev" ]; then
            MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
        else
            ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
                "docker exec -e KEYCLOAK_ADMIN_PASSWORD=\"\$KEYCLOAK_ADMIN_PASSWORD\" $CONTAINER /opt/keycloak/bin/kcadm.sh $*"
        fi
    }

    # Login to Keycloak
    log_info "Authenticating to Keycloak..."
    run_kcadm config credentials --server "$keycloak_url" --realm master --user "$admin_user" --password "$admin_pass"
}

cmd_sync() {
    log_header "Syncing Keycloak Configuration"

    local sync_script="$PROJECT_ROOT/keycloak/scripts/sync-realm.sh"

    if [ "$ENV" = "dev" ]; then
        # Copy and run sync script in container
        docker cp "$sync_script" "$CONTAINER:/tmp/sync-realm.sh"
        docker exec -u 0 "$CONTAINER" bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh && chmod 755 /tmp/sync-realm.sh'
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /tmp/sync-realm.sh dev
    else
        local vps_host="${VPS_HOST:-5.78.159.29}"
        local vps_user="${VPS_SSH_USER:-root}"

        ssh "$vps_user@$vps_host" << 'SYNC'
cd /opt/tamshai
export $(cat .env | grep -v '^#' | xargs)
docker cp keycloak/scripts/sync-realm.sh tamshai-keycloak:/tmp/sync-realm.sh
docker exec -u 0 tamshai-keycloak bash -c 'sed -i "s/\r$//" /tmp/sync-realm.sh && chmod 755 /tmp/sync-realm.sh'
docker exec -e KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD" tamshai-keycloak /tmp/sync-realm.sh stage
SYNC
    fi

    log_info "Sync complete"
}

cmd_status() {
    log_header "Keycloak Status"

    # Check container status
    echo "Container Status:"
    if [ "$ENV" = "dev" ]; then
        docker ps --filter "name=$CONTAINER" --format "  {{.Names}}: {{.Status}}"
    else
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
            "docker ps --filter 'name=$CONTAINER' --format '  {{.Names}}: {{.Status}}'"
    fi

    # Check health endpoint
    echo ""
    echo "Health Check:"
    local health_url
    if [ "$ENV" = "dev" ]; then
        health_url="http://localhost:8180/health/ready"
    else
        health_url="https://${VPS_HOST:-5.78.159.29}/auth/health/ready"
    fi

    if curl -sf "$health_url" >/dev/null 2>&1; then
        echo -e "  ${GREEN}[OK]${NC} Keycloak is healthy"
    else
        echo -e "  ${RED}[FAIL]${NC} Keycloak health check failed"
    fi

    # Show realm info
    echo ""
    echo "Realm: $REALM"
}

cmd_clients() {
    log_header "Keycloak Clients"
    setup_kcadm

    if [ "$ENV" = "dev" ]; then
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get clients -r "$REALM" \
            --fields clientId,enabled,publicClient,defaultClientScopes
    else
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
            "docker exec $CONTAINER /opt/keycloak/bin/kcadm.sh get clients -r $REALM --fields clientId,enabled,publicClient,defaultClientScopes"
    fi
}

cmd_users() {
    log_header "Keycloak Users"
    setup_kcadm

    if [ "$ENV" = "dev" ]; then
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM" \
            --fields username,email,enabled,emailVerified
    else
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
            "docker exec $CONTAINER /opt/keycloak/bin/kcadm.sh get users -r $REALM --fields username,email,enabled,emailVerified"
    fi
}

cmd_scopes() {
    log_header "Client Scopes"
    setup_kcadm

    if [ "$ENV" = "dev" ]; then
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get client-scopes -r "$REALM" \
            --fields name,protocol,description
    else
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
            "docker exec $CONTAINER /opt/keycloak/bin/kcadm.sh get client-scopes -r $REALM --fields name,protocol,description"
    fi
}

cmd_logs() {
    log_header "Keycloak Logs (last 100 lines)"

    if [ "$ENV" = "dev" ]; then
        docker logs --tail 100 "$CONTAINER"
    else
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST:-5.78.159.29}" \
            "docker logs --tail 100 $CONTAINER"
    fi
}

show_help() {
    echo "Keycloak Management Script"
    echo ""
    echo "Usage: $0 [command] [environment]"
    echo ""
    echo "Commands:"
    echo "  sync     Sync clients and configuration"
    echo "  status   Show Keycloak status"
    echo "  clients  List all clients"
    echo "  users    List all users"
    echo "  scopes   List client scopes"
    echo "  logs     Show container logs"
    echo ""
    echo "Environments: dev (default), stage"
}

main() {
    case "$COMMAND" in
        sync)    cmd_sync ;;
        status)  cmd_status ;;
        clients) cmd_clients ;;
        users)   cmd_users ;;
        scopes)  cmd_scopes ;;
        logs)    cmd_logs ;;
        help|--help|-h) show_help ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
