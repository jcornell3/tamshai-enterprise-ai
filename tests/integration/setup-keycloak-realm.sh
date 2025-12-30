#!/bin/bash
set -euo pipefail  # Strict error handling

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${KEYCLOAK_REALM:-tamshai-corp}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Function: Get admin access token
get_admin_token() {
  log_info "Getting admin access token..."
  local token=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=$ADMIN_USER" \
    -d "password=$ADMIN_PASSWORD" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

  if [ -z "$token" ] || [ "$token" == "null" ]; then
    log_error "Failed to get admin token. Is Keycloak running at $KEYCLOAK_URL?"
    log_error "Check: curl -sf $KEYCLOAK_URL/"
    exit 1
  fi

  echo "$token"
}

# Function: Create role (idempotent)
create_role() {
  local role_name=$1
  # Capture both status code and response body for debugging
  local temp_file=$(mktemp)
  local response=$(curl -sf -w "%{http_code}" -o "$temp_file" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "'$role_name'"}' 2>/dev/null)

  if [ "$response" == "201" ]; then
    log_info "Created role: $role_name"
    rm -f "$temp_file"
  elif [ "$response" == "409" ]; then
    log_warn "Role already exists: $role_name"
    rm -f "$temp_file"
  else
    log_error "Failed to create role $role_name (HTTP $response)"
    if [ -f "$temp_file" ] && [ -s "$temp_file" ]; then
      log_error "Response body: $(cat $temp_file)"
    fi
    rm -f "$temp_file"
    return 1
  fi
}

# Function: Create user (idempotent)
create_user() {
  local username=$1
  local email=$2
  local password=$3

  local response=$(curl -sf -w "%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "username": "'$username'",
      "email": "'$email'",
      "enabled": true,
      "credentials": [{"type": "password", "value": "'$password'", "temporary": false}]
    }' 2>/dev/null)

  if [ "$response" == "201" ]; then
    log_info "Created user: $username"
    # Extract user ID from API
    local user_id=$(curl -sf -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$username" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
    echo "$user_id"
  elif [ "$response" == "409" ]; then
    log_warn "User already exists: $username"
    # Get existing user ID
    local user_id=$(curl -sf -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$username" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
    echo "$user_id"
  else
    log_error "Failed to create user $username (HTTP $response)"
    return 1
  fi
}

# Function: Assign role to user
assign_role() {
  local user_id=$1
  local role_name=$2

  # Get role representation
  local role=$(curl -sf -X GET "$KEYCLOAK_URL/admin/realms/$REALM/roles/$role_name" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  if [ -z "$role" ]; then
    log_error "Role not found: $role_name"
    return 1
  fi

  curl -sf -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$user_id/role-mappings/realm" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[$role]" > /dev/null

  log_info "Assigned role $role_name to user $user_id"
}

# Function: Create client (idempotent)
create_client() {
  local response=$(curl -sf -w "%{http_code}" -o /dev/null -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "clientId": "mcp-gateway",
      "enabled": true,
      "publicClient": false,
      "secret": "test-client-secret",
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": true,
      "redirectUris": ["http://localhost:3100/*"],
      "webOrigins": ["http://localhost:3100"]
    }' 2>/dev/null)

  if [ "$response" == "201" ]; then
    log_info "Created client: mcp-gateway"
  elif [ "$response" == "409" ]; then
    log_warn "Client already exists: mcp-gateway"
  else
    log_error "Failed to create client (HTTP $response)"
    return 1
  fi
}

# Main execution
main() {
  log_info "Starting Keycloak realm setup for $REALM..."

  # Get admin token
  ADMIN_TOKEN=$(get_admin_token)

  # Create roles (skip if SKIP_ROLE_CREATION is set)
  if [ "${SKIP_ROLE_CREATION:-false}" == "true" ]; then
    log_info "Skipping role creation (SKIP_ROLE_CREATION=true)"
  else
    log_info "Creating roles..."
    for role in hr-read hr-write finance-read finance-write sales-read sales-write support-read support-write executive; do
      create_role "$role"
    done
  fi

  # Create client
  log_info "Creating mcp-gateway client..."
  create_client

  # Create users
  log_info "Creating test users..."

  # alice.chen - HR Manager
  alice_id=$(create_user "alice.chen" "alice@tamshai.com" "password123")
  assign_role "$alice_id" "hr-read"
  assign_role "$alice_id" "hr-write"

  # bob.martinez - Finance Director
  bob_id=$(create_user "bob.martinez" "bob@tamshai.com" "password123")
  assign_role "$bob_id" "finance-read"
  assign_role "$bob_id" "finance-write"

  # carol.johnson - Sales VP
  carol_id=$(create_user "carol.johnson" "carol@tamshai.com" "password123")
  assign_role "$carol_id" "sales-read"
  assign_role "$carol_id" "sales-write"

  # dan.williams - Support Director
  dan_id=$(create_user "dan.williams" "dan@tamshai.com" "password123")
  assign_role "$dan_id" "support-read"
  assign_role "$dan_id" "support-write"

  # eve.thompson - Executive
  eve_id=$(create_user "eve.thompson" "eve@tamshai.com" "password123")
  assign_role "$eve_id" "executive"

  # frank.davis - Intern (no roles)
  frank_id=$(create_user "frank.davis" "frank@tamshai.com" "password123")

  # nina.patel - Manager
  nina_id=$(create_user "nina.patel" "nina@tamshai.com" "password123")
  # Note: manager role behavior depends on application logic

  # marcus.johnson - Engineer
  marcus_id=$(create_user "marcus.johnson" "marcus@tamshai.com" "password123")

  log_info "Keycloak realm setup complete!"
  log_info "Realm: $REALM"
  log_info "Users: alice.chen, bob.martinez, carol.johnson, dan.williams, eve.thompson, frank.davis, nina.patel, marcus.johnson"
  log_info "Client: mcp-gateway (secret: test-client-secret)"
  log_info "Password for all users: password123"
}

# Run main function
main
