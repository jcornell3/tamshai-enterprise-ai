#!/bin/bash

# Keycloak Token Helper Script
# Gets JWT access token for testing MCP Gateway authentication
#
# Usage:
#   ./scripts/get-keycloak-token.sh <username>
#   ./scripts/get-keycloak-token.sh alice.chen
#   TOKEN=$(./scripts/get-keycloak-token.sh eve.thompson)

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180}"
REALM="${KEYCLOAK_REALM:-tamshai-corp}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-mcp-gateway}"
CLIENT_SECRET="${MCP_GATEWAY_CLIENT_SECRET:-}"

# Token exchange service account (preferred method - no user password needed)
RUNNER_SECRET="${MCP_INTEGRATION_RUNNER_SECRET:-}"

# Default password from environment (ROPC fallback only - used when RUNNER_SECRET is not set)
DEFAULT_PASSWORD="${KEYCLOAK_PASSWORD:-${DEV_USER_PASSWORD:-${TEST_PASSWORD:-}}}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print usage
usage() {
  cat << EOF
Usage: $0 [OPTIONS] <username>

Get JWT access token from Keycloak for testing.

OPTIONS:
  -h, --help              Show this help message
  -r, --realm REALM       Keycloak realm (default: tamshai-corp)
  -c, --client CLIENT     Client ID (default: mcp-gateway)
  -p, --password PASS     User password (ROPC fallback only)
  -u, --url URL           Keycloak URL (default: http://localhost:8180)
  -j, --json              Output full JSON response (default: token only)
  -v, --verbose           Show detailed information

AUTHENTICATION:
  Preferred: Token exchange via mcp-integration-runner (set MCP_INTEGRATION_RUNNER_SECRET)
  Fallback:  ROPC password grant (set DEV_USER_PASSWORD or use -p flag)

EXAMPLES:
  # Get token for alice.chen via token exchange (preferred)
  export MCP_INTEGRATION_RUNNER_SECRET=\$(gh secret get MCP_INTEGRATION_RUNNER_SECRET)
  $0 alice.chen

  # Get token for eve.thompson (CEO/Executive)
  $0 eve.thompson

  # Use token in curl request
  TOKEN=\$($0 alice.chen)
  curl -H "Authorization: Bearer \$TOKEN" http://localhost:3100/api/query

  # Get full token response
  $0 --json alice.chen

  # ROPC fallback (when MCP_INTEGRATION_RUNNER_SECRET is not set)
  $0 --password mypassword alice.chen

TEST USERS (all have password: [REDACTED-DEV-PASSWORD]):
  alice.chen      - HR Manager (hr-read, hr-write)
  bob.martinez    - Finance Director (finance-read, finance-write)
  carol.johnson   - VP of Sales (sales-read, sales-write)
  dan.williams    - Support Director (support-read, support-write)
  eve.thompson    - CEO (executive - all permissions)
  nina.patel      - Engineering Manager (manager)
  marcus.johnson  - Software Engineer (user)
  frank.davis     - IT Intern (intern)

EOF
}

# Parse arguments
OUTPUT_JSON=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      usage
      exit 0
      ;;
    -r|--realm)
      REALM="$2"
      shift 2
      ;;
    -c|--client)
      CLIENT_ID="$2"
      shift 2
      ;;
    -p|--password)
      DEFAULT_PASSWORD="$2"
      shift 2
      ;;
    -u|--url)
      KEYCLOAK_URL="$2"
      shift 2
      ;;
    -j|--json)
      OUTPUT_JSON=true
      shift
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -*)
      echo -e "${RED}Error: Unknown option $1${NC}" >&2
      usage
      exit 1
      ;;
    *)
      USERNAME="$1"
      shift
      ;;
  esac
done

# Check if username provided
if [ -z "$USERNAME" ]; then
  echo -e "${RED}Error: Username required${NC}" >&2
  usage
  exit 1
fi

# Check if Keycloak is accessible
if $VERBOSE; then
  echo -e "${YELLOW}Checking Keycloak at $KEYCLOAK_URL...${NC}" >&2
fi

if ! curl -s -f "$KEYCLOAK_URL/realms/$REALM" > /dev/null 2>&1; then
  echo -e "${RED}Error: Keycloak realm '$REALM' not accessible at $KEYCLOAK_URL${NC}" >&2
  echo -e "${YELLOW}Hints:${NC}" >&2
  echo "  1. Check if Keycloak is running: docker compose ps keycloak" >&2
  echo "  2. Check if realm exists: curl $KEYCLOAK_URL/realms/$REALM" >&2
  echo "  3. Import realm: See keycloak/realm-export.json" >&2
  exit 1
fi

if $VERBOSE; then
  echo -e "${GREEN}✓ Keycloak realm accessible${NC}" >&2
  echo -e "${YELLOW}Requesting token for $USERNAME...${NC}" >&2
fi

# Request token
TOKEN_ENDPOINT="$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token"

if [ -n "$RUNNER_SECRET" ]; then
  # Preferred method: Token exchange via mcp-integration-runner
  if $VERBOSE; then
    echo -e "${YELLOW}Using token exchange (mcp-integration-runner)...${NC}" >&2
  fi

  # Step 1: Get service account token
  SVC_RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=mcp-integration-runner" \
    -d "client_secret=$RUNNER_SECRET" \
    -d "grant_type=client_credentials")

  if echo "$SVC_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    ERROR=$(echo "$SVC_RESPONSE" | jq -r '.error')
    ERROR_DESC=$(echo "$SVC_RESPONSE" | jq -r '.error_description // "No description"')
    echo -e "${RED}Error getting service token: $ERROR${NC}" >&2
    echo -e "${RED}Description: $ERROR_DESC${NC}" >&2
    echo -e "${YELLOW}Hints:${NC}" >&2
    echo "  - Verify MCP_INTEGRATION_RUNNER_SECRET is correct" >&2
    echo "  - Check if mcp-integration-runner client exists in Keycloak" >&2
    exit 1
  fi

  SVC_TOKEN=$(echo "$SVC_RESPONSE" | jq -r '.access_token')

  # Step 2: Exchange for user token
  RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=mcp-integration-runner" \
    -d "client_secret=$RUNNER_SECRET" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
    -d "subject_token=$SVC_TOKEN" \
    -d "requested_subject=$USERNAME" \
    -d "scope=openid profile roles")

  if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    ERROR_DESC=$(echo "$RESPONSE" | jq -r '.error_description // "No description"')
    echo -e "${RED}Error exchanging token for $USERNAME: $ERROR${NC}" >&2
    echo -e "${RED}Description: $ERROR_DESC${NC}" >&2
    echo -e "${YELLOW}Hints:${NC}" >&2
    echo "  - Check if user '$USERNAME' exists in Keycloak" >&2
    echo "  - Verify token exchange permissions are configured" >&2
    echo "  - See: keycloak/scripts/configure-token-exchange.sh" >&2
    exit 1
  fi
else
  # Fallback: ROPC (requires password and direct_access_grants_enabled=true)
  if [ -z "$DEFAULT_PASSWORD" ]; then
    echo -e "${RED}Error: No authentication method configured${NC}" >&2
    echo -e "${YELLOW}Set MCP_INTEGRATION_RUNNER_SECRET (preferred) or DEV_USER_PASSWORD (ROPC fallback)${NC}" >&2
    exit 1
  fi

  if $VERBOSE; then
    echo -e "${YELLOW}Using ROPC fallback (password grant)...${NC}" >&2
    echo -e "${YELLOW}Note: Requires direct_access_grants_enabled=true in Keycloak${NC}" >&2
  fi

  RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "username=$USERNAME" \
    -d "password=$DEFAULT_PASSWORD" \
    -d "grant_type=password" \
    -d "scope=openid")

  if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    ERROR_DESC=$(echo "$RESPONSE" | jq -r '.error_description // "No description"')
    echo -e "${RED}Error: $ERROR${NC}" >&2
    echo -e "${RED}Description: $ERROR_DESC${NC}" >&2

    if [ "$ERROR" = "unauthorized_client" ]; then
      echo -e "${YELLOW}Hints:${NC}" >&2
      echo "  - ROPC (direct access grants) is disabled. Use token exchange instead:" >&2
      echo "    export MCP_INTEGRATION_RUNNER_SECRET=\$(gh secret get MCP_INTEGRATION_RUNNER_SECRET)" >&2
    elif [ "$ERROR" = "invalid_grant" ]; then
      echo -e "${YELLOW}Hints:${NC}" >&2
      echo "  - Check if username '$USERNAME' exists in Keycloak" >&2
      echo "  - Verify password is correct" >&2
    fi

    exit 1
  fi
fi

# Extract token
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo -e "${RED}Error: Failed to extract access token${NC}" >&2
  echo -e "${YELLOW}Response:${NC}" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

# Output based on mode
if $OUTPUT_JSON; then
  echo "$RESPONSE" | jq .
else
  if $VERBOSE; then
    echo -e "${GREEN}✓ Token obtained successfully${NC}" >&2

    # Decode and display token info
    HEADER=$(echo "$ACCESS_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq . 2>/dev/null || echo "{}")
    PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq . 2>/dev/null || echo "{}")

    echo "" >&2
    echo -e "${YELLOW}Token Information:${NC}" >&2
    echo "$PAYLOAD" | jq -r '"  User: \(.preferred_username // "unknown")"' >&2
    echo "$PAYLOAD" | jq -r '"  Subject: \(.sub // "unknown")"' >&2
    echo "$PAYLOAD" | jq -r '"  Issuer: \(.iss // "unknown")"' >&2
    echo "$PAYLOAD" | jq -r '"  Expires: \(.exp // "unknown") (\((.exp // 0) - (now | floor)) seconds)"' >&2

    ROLES=$(echo "$PAYLOAD" | jq -r '.realm_access.roles // .resource_access["mcp-gateway"].roles // [] | join(", ")')
    echo "  Roles: $ROLES" >&2

    echo "" >&2
    echo -e "${YELLOW}Usage:${NC}" >&2
    echo "  TOKEN=\$($0 $USERNAME)" >&2
    echo "  curl -H \"Authorization: Bearer \$TOKEN\" http://localhost:3100/api/query" >&2
    echo "" >&2
  fi

  # Output just the token
  echo "$ACCESS_TOKEN"
fi
