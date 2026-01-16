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
#   sync-users Sync users from HR database to Keycloak
#   reimport   Re-import client configs from realm-export (keeps users)
#   reset      Reset Keycloak database (fresh realm import)
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
#   ./keycloak.sh reimport dev          # Re-import client configs (keeps users)
#   ./keycloak.sh status dev            # Show Keycloak status
#   ./keycloak.sh clients dev           # List all clients
#   ./keycloak.sh users dev             # List all users
#   ./keycloak.sh scopes dev            # List client scopes
#   ./keycloak.sh logs dev              # Show Keycloak logs
#
# Environment Variables (for stage):
#   VPS_HOST               - VPS IP address or hostname (required for stage)
#   VPS_SSH_USER           - SSH username (default: root)
#   KEYCLOAK_ADMIN_PASSWORD - Keycloak admin password (for admin commands)
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

# Validate VPS_HOST is set for stage operations
require_vps_host() {
    if [ -z "${VPS_HOST:-}" ]; then
        log_error "VPS_HOST not set. Either:"
        log_info "  1. Create .env.local with VPS_HOST=<ip>"
        log_info "  2. Export VPS_HOST environment variable"
        log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
        exit 1
    fi
}

# Configure kcadm based on environment
setup_kcadm() {
    local admin_user="${KEYCLOAK_ADMIN:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required - set in .env file}"
    local keycloak_url="http://localhost:8080/auth"

    # Run kcadm in container
    run_kcadm() {
        if [ "$ENV" = "dev" ]; then
            MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
        else
            require_vps_host
            ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
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
        require_vps_host
        local vps_host="${VPS_HOST}"
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

cmd_sync_users() {
    log_header "Syncing Users from HR Database"

    local compose_dir="$PROJECT_ROOT/infrastructure/docker"

    if [ "$ENV" = "dev" ]; then
        cd "$compose_dir"
        local default_password="${USER_PASSWORD:-password123}"

        # Authenticate kcadm
        log_info "Authenticating to Keycloak..."
        MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080/auth --realm master \
            --user "${KEYCLOAK_ADMIN:-admin}" --password "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required}"

        # Fetch employees from HR database
        log_info "Fetching employees from HR database..."
        local employees=$(docker compose exec -T postgres psql -U tamshai -d tamshai_hr -t -A -F '|' -c "
            SELECT
                e.email,
                LOWER(SPLIT_PART(e.email, '@', 1)) as username,
                e.first_name,
                e.last_name,
                COALESCE(d.code, 'OTHER') as dept_code,
                e.is_manager,
                e.id::text as employee_id
            FROM hr.employees e
            LEFT JOIN hr.departments d ON e.department_id = d.id
            WHERE e.status = 'ACTIVE'
            AND e.deleted_at IS NULL
            ORDER BY e.last_name, e.first_name;
        ")

        local synced=0
        local failed=0

        echo "$employees" | while IFS='|' read -r email username first_name last_name dept_code is_manager employee_id; do
            if [ -z "$email" ]; then continue; fi

            log_info "Processing: $username ($first_name $last_name)"

            # Check if user exists
            local user_id=$(MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

            if [ -n "$user_id" ]; then
                echo "  Updating existing user..."
                MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh update "users/$user_id" -r "$REALM" \
                    -s "email=$email" \
                    -s "firstName=$first_name" \
                    -s "lastName=$last_name" \
                    -s "enabled=true" \
                    -s "emailVerified=true" 2>/dev/null || echo "  [WARN] Update failed"
            else
                echo "  Creating new user..."
                MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh create users -r "$REALM" \
                    -s "username=$username" \
                    -s "email=$email" \
                    -s "firstName=$first_name" \
                    -s "lastName=$last_name" \
                    -s "enabled=true" \
                    -s "emailVerified=true" 2>/dev/null || { echo "  [WARN] Create failed"; continue; }

                user_id=$(MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

                # Set password for new user
                if [ -n "$user_id" ]; then
                    MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh set-password -r "$REALM" \
                        --username "$username" --new-password "$default_password" --temporary=false 2>/dev/null || \
                        echo "  [WARN] Password set failed"
                fi
            fi

            # Assign roles based on department
            if [ -n "$user_id" ]; then
                local roles=""
                case "$dept_code" in
                    EXEC)    roles="executive" ;;
                    HR)      roles="hr-read hr-write" ;;
                    FIN)     roles="finance-read finance-write" ;;
                    SALES)   roles="sales-read sales-write" ;;
                    SUPPORT) roles="support-read support-write" ;;
                esac

                if [ "$is_manager" = "t" ]; then
                    roles="$roles manager"
                fi

                for role in $roles; do
                    MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh add-roles -r "$REALM" \
                        --uusername "$username" --rolename "$role" 2>/dev/null || true
                done

                if [ -n "$roles" ]; then
                    echo "  Assigned roles: $roles"
                fi
            fi
        done

    else
        require_vps_host
        local vps_host="${VPS_HOST}"
        local vps_user="${VPS_SSH_USER:-root}"

        log_info "Running user sync on VPS..."
        ssh "$vps_user@$vps_host" << 'SYNC_VPS'
set -e
cd /opt/tamshai
export $(cat .env | grep -v '^#' | xargs)

REALM="tamshai-corp"
CONTAINER="tamshai-keycloak"
DEFAULT_PASSWORD="${USER_PASSWORD:?USER_PASSWORD required for stage/prod sync}"

echo "[INFO] Authenticating to Keycloak..."
docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080/auth --realm master \
    --user "${KEYCLOAK_ADMIN:-admin}" --password "$KEYCLOAK_ADMIN_PASSWORD"

echo "[INFO] Fetching employees from HR database..."
employees=$(docker compose exec -T tamshai-postgres psql -U tamshai -d tamshai_hr -t -A -F '|' -c "
    SELECT
        e.email,
        LOWER(SPLIT_PART(e.email, '@', 1)) as username,
        e.first_name,
        e.last_name,
        COALESCE(d.code, 'OTHER') as dept_code,
        e.is_manager,
        e.id::text as employee_id
    FROM hr.employees e
    LEFT JOIN hr.departments d ON e.department_id = d.id
    WHERE e.status = 'ACTIVE'
    AND e.deleted_at IS NULL
    ORDER BY e.last_name, e.first_name;
")

echo "$employees" | while IFS='|' read -r email username first_name last_name dept_code is_manager employee_id; do
    if [ -z "$email" ]; then continue; fi

    echo "[INFO] Processing: $username ($first_name $last_name)"

    user_id=$(docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -n "$user_id" ]; then
        echo "  Updating existing user..."
        docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh update "users/$user_id" -r "$REALM" \
            -s "email=$email" -s "firstName=$first_name" -s "lastName=$last_name" \
            -s "enabled=true" -s "emailVerified=true" 2>/dev/null || echo "  [WARN] Update failed"
    else
        echo "  Creating new user..."
        docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh create users -r "$REALM" \
            -s "username=$username" -s "email=$email" -s "firstName=$first_name" \
            -s "lastName=$last_name" -s "enabled=true" -s "emailVerified=true" 2>/dev/null || { echo "  [WARN] Create failed"; continue; }

        user_id=$(docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -n "$user_id" ]; then
            docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh set-password -r "$REALM" \
                --username "$username" --new-password "$DEFAULT_PASSWORD" --temporary=false 2>/dev/null || \
                echo "  [WARN] Password set failed"
        fi
    fi

    if [ -n "$user_id" ]; then
        roles=""
        case "$dept_code" in
            EXEC)    roles="executive" ;;
            HR)      roles="hr-read hr-write" ;;
            FIN)     roles="finance-read finance-write" ;;
            SALES)   roles="sales-read sales-write" ;;
            SUPPORT) roles="support-read support-write" ;;
        esac

        if [ "$is_manager" = "t" ]; then
            roles="$roles manager"
        fi

        for role in $roles; do
            docker exec "$CONTAINER" /opt/keycloak/bin/kcadm.sh add-roles -r "$REALM" \
                --uusername "$username" --rolename "$role" 2>/dev/null || true
        done

        if [ -n "$roles" ]; then
            echo "  Assigned roles: $roles"
        fi
    fi
done

echo "[INFO] User sync complete"
SYNC_VPS
    fi

    log_info "User sync complete"
}

cmd_reimport() {
    log_header "Re-importing Client Configurations"
    log_info "This updates client configurations from realm-export without losing users."

    if [ "$ENV" = "dev" ]; then
        local realm_file="$PROJECT_ROOT/keycloak/realm-export-dev.json"
    else
        local realm_file="$PROJECT_ROOT/keycloak/realm-export.json"
    fi

    if [ ! -f "$realm_file" ]; then
        log_error "Realm export file not found: $realm_file"
        return 1
    fi

    log_info "Using realm file: $realm_file"

    # Get admin token
    log_info "Getting admin token..."
    local keycloak_url
    local insecure=""
    if [ "$ENV" = "dev" ]; then
        keycloak_url="http://localhost:8180"
    else
        require_vps_host
        keycloak_url="https://${VPS_HOST}"
        insecure="-k"
    fi

    local admin_user="${KEYCLOAK_ADMIN:-admin}"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD required}"

    local token_response
    token_response=$(curl $insecure -sf -X POST "$keycloak_url/auth/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=$admin_user" \
        -d "password=$admin_pass" \
        -d "grant_type=password" 2>&1)

    local token
    token=$(echo "$token_response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        echo "$token_response"
        return 1
    fi

    log_info "Got admin token"

    # Parse clients from realm export and update each
    log_info "Updating client configurations..."

    # Use jq if available, otherwise use a simpler approach
    if command -v jq &> /dev/null; then
        local clients
        clients=$(jq -c '.clients[] | select(.clientId != null)' "$realm_file")

        echo "$clients" | while read -r client_json; do
            local client_id
            client_id=$(echo "$client_json" | jq -r '.clientId')

            if [ -z "$client_id" ] || [ "$client_id" = "null" ]; then
                continue
            fi

            log_info "  Processing client: $client_id"

            # Get the internal ID for this client
            local client_info
            client_info=$(curl $insecure -sf -X GET \
                "$keycloak_url/auth/admin/realms/$REALM/clients?clientId=$client_id" \
                -H "Authorization: Bearer $token" 2>&1)

            local internal_id
            internal_id=$(echo "$client_info" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

            if [ -z "$internal_id" ]; then
                log_warn "    Client not found in Keycloak, skipping"
                continue
            fi

            # Get protocol mappers from the export
            local mappers
            mappers=$(echo "$client_json" | jq -c '.protocolMappers // []')

            if [ "$mappers" != "[]" ] && [ "$mappers" != "null" ]; then
                echo "$mappers" | jq -c '.[]' | while read -r mapper_json; do
                    local mapper_name
                    mapper_name=$(echo "$mapper_json" | jq -r '.name')

                    log_info "    Adding/updating mapper: $mapper_name"

                    # Try to create the mapper (will fail if exists, that's ok)
                    curl $insecure -sf -X POST \
                        "$keycloak_url/auth/admin/realms/$REALM/clients/$internal_id/protocol-mappers/models" \
                        -H "Authorization: Bearer $token" \
                        -H "Content-Type: application/json" \
                        -d "$mapper_json" 2>/dev/null || \
                        log_warn "      Mapper may already exist or update failed"
                done
            fi
        done
    else
        log_warn "jq not installed - using simplified reimport"
        log_info "Installing audience mapper for tamshai-website client..."

        # Get tamshai-website client ID
        local client_info
        client_info=$(curl $insecure -sf -X GET \
            "$keycloak_url/auth/admin/realms/$REALM/clients?clientId=tamshai-website" \
            -H "Authorization: Bearer $token" 2>&1)

        local internal_id
        internal_id=$(echo "$client_info" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

        if [ -n "$internal_id" ]; then
            curl $insecure -sf -X POST \
                "$keycloak_url/auth/admin/realms/$REALM/clients/$internal_id/protocol-mappers/models" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d '{
                    "name": "mcp-gateway-audience",
                    "protocol": "openid-connect",
                    "protocolMapper": "oidc-audience-mapper",
                    "consentRequired": false,
                    "config": {
                        "included.client.audience": "mcp-gateway",
                        "id.token.claim": "false",
                        "access.token.claim": "true"
                    }
                }' 2>/dev/null && log_info "  Audience mapper added" || log_warn "  Mapper may already exist"
        fi
    fi

    log_info "Re-import complete. Users must log out and back in to get new tokens."
}

cmd_reset() {
    log_header "Resetting Keycloak Database"
    log_warn "This will DELETE all Keycloak data and re-import the realm!"
    log_warn "All users, sessions, and configuration will be lost."

    read -p "Are you sure? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        return 0
    fi

    if [ "$ENV" = "dev" ]; then
        local compose_dir="$PROJECT_ROOT/infrastructure/docker"
        cd "$compose_dir"

        log_info "Stopping Keycloak..."
        docker compose stop keycloak

        log_info "Removing Keycloak database tables..."
        # Run as postgres superuser and grant to keycloak user (KC_DB_USERNAME in docker-compose)
        docker compose exec -T postgres psql -U postgres -d keycloak -c "
            DROP SCHEMA IF EXISTS public CASCADE;
            CREATE SCHEMA public AUTHORIZATION keycloak;
            GRANT ALL ON SCHEMA public TO keycloak;
        " || log_warn "Database reset may have partially failed"

        log_info "Restarting Keycloak (will re-import realm)..."
        docker compose up -d keycloak

        log_info "Waiting for Keycloak to be ready..."
        for i in 1 2 3 4 5 6 7 8 9 10; do
            if curl -sf "http://localhost:8180/health/ready" >/dev/null 2>&1; then
                log_info "Keycloak is ready"
                break
            fi
            echo "  Waiting... attempt $i/10"
            sleep 10
        done

    else
        require_vps_host
        local vps_host="${VPS_HOST}"
        local vps_user="${VPS_SSH_USER:-root}"

        ssh "$vps_user@$vps_host" << 'RESET'
set -e
cd /opt/tamshai
export $(cat .env | grep -v '^#' | xargs)

echo "[INFO] Stopping Keycloak..."
docker compose stop keycloak

echo "[INFO] Removing Keycloak database tables..."
docker compose exec -T tamshai-postgres psql -U postgres -d keycloak -c "
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public AUTHORIZATION keycloak;
    GRANT ALL ON SCHEMA public TO keycloak;
" || echo "[WARN] Database reset may have partially failed"

echo "[INFO] Restarting Keycloak (will re-import realm)..."
docker compose up -d keycloak

echo "[INFO] Waiting for Keycloak to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf "http://localhost:8080/auth/health/ready" >/dev/null 2>&1; then
        echo "[INFO] Keycloak is ready"
        break
    fi
    echo "  Waiting... attempt $i/10"
    sleep 10
done
RESET
    fi

    log_info "Reset complete. Running sync to ensure clients are configured..."
    cmd_sync
}

cmd_status() {
    log_header "Keycloak Status"

    # Check container status
    echo "Container Status:"
    if [ "$ENV" = "dev" ]; then
        docker ps --filter "name=$CONTAINER" --format "  {{.Names}}: {{.Status}}"
    else
        require_vps_host
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
            "docker ps --filter 'name=$CONTAINER' --format '  {{.Names}}: {{.Status}}'"
    fi

    # Check health endpoint
    echo ""
    echo "Health Check:"
    local health_url
    if [ "$ENV" = "dev" ]; then
        health_url="http://localhost:8180/health/ready"
    else
        require_vps_host
        health_url="https://${VPS_HOST}/auth/health/ready"
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
        require_vps_host
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
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
        require_vps_host
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
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
        require_vps_host
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
            "docker exec $CONTAINER /opt/keycloak/bin/kcadm.sh get client-scopes -r $REALM --fields name,protocol,description"
    fi
}

cmd_logs() {
    log_header "Keycloak Logs (last 100 lines)"

    if [ "$ENV" = "dev" ]; then
        docker logs --tail 100 "$CONTAINER"
    else
        require_vps_host
        ssh "${VPS_SSH_USER:-root}@${VPS_HOST}" \
            "docker logs --tail 100 $CONTAINER"
    fi
}

show_help() {
    echo "Keycloak Management Script"
    echo ""
    echo "Usage: $0 [command] [environment]"
    echo ""
    echo "Commands:"
    echo "  sync       Sync clients and configuration"
    echo "  sync-users Sync users from HR database to Keycloak"
    echo "  reimport   Re-import client configs from realm-export (keeps users)"
    echo "  reset      Reset Keycloak database (fresh realm import)"
    echo "  status     Show Keycloak status"
    echo "  clients    List all clients"
    echo "  users      List all users"
    echo "  scopes     List client scopes"
    echo "  logs       Show container logs"
    echo ""
    echo "Environments: dev (default), stage"
}

main() {
    case "$COMMAND" in
        sync)       cmd_sync ;;
        sync-users) cmd_sync_users ;;
        reimport)   cmd_reimport ;;
        reset)      cmd_reset ;;
        status)     cmd_status ;;
        clients)    cmd_clients ;;
        users)      cmd_users ;;
        scopes)     cmd_scopes ;;
        logs)       cmd_logs ;;
        help|--help|-h) show_help ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
