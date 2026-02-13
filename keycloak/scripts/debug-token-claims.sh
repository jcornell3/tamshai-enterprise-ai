#!/bin/bash

# =============================================================================
# Token Exchange Claims Debugger
# =============================================================================
# Diagnoses token exchange issues by inspecting JWT claims.
# Use this to verify that scope and client scopes are working correctly.
#
# Usage:
#   ./debug-token-claims.sh
#
# Prerequisites:
#   - MCP_INTEGRATION_RUNNER_SECRET environment variable set
#   - Keycloak running and accessible
#   - Test user (alice.chen) exists
# =============================================================================

set -euo pipefail

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180/auth}"
REALM="tamshai-corp"
CLIENT_ID="mcp-integration-runner"
CLIENT_SECRET="${MCP_INTEGRATION_RUNNER_SECRET:?MCP_INTEGRATION_RUNNER_SECRET must be set}"
TEST_USER="alice.chen"

echo "=========================================="
echo "Token Exchange Claims Debugger"
echo "=========================================="
echo "Keycloak URL: $KEYCLOAK_URL"
echo "Realm: $REALM"
echo "Client: $CLIENT_ID"
echo "Test User: $TEST_USER"
echo ""

# Step 1: Get Service Account Token
echo "[1/4] Getting Service Account Token..."
SA_TOKEN_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=client_credentials")

SA_TOKEN=$(echo "$SA_TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$SA_TOKEN" ]; then
  echo "❌ Failed to get service account token"
  echo "$SA_TOKEN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Service account token acquired"
echo ""

# Step 2: Token Exchange WITHOUT scope (to see the problem)
echo "[2/4] Token Exchange WITHOUT scope parameter..."
EXCHANGE_NO_SCOPE_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SA_TOKEN" \
  -d "requested_subject=$TEST_USER")

EXCHANGED_TOKEN_NO_SCOPE=$(echo "$EXCHANGE_NO_SCOPE_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$EXCHANGED_TOKEN_NO_SCOPE" ]; then
  echo "❌ Token exchange failed (permissions not configured?)"
  echo "$EXCHANGE_NO_SCOPE_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Token exchanged successfully"
echo ""
echo "Decoded Claims (WITHOUT scope):"
echo "$EXCHANGED_TOKEN_NO_SCOPE" | awk -F. '{print $2}' | base64 -d 2>/dev/null | jq '{
  sub: .sub,
  preferred_username: .preferred_username,
  resource_access: .resource_access
}'
echo ""

# Step 3: Token Exchange WITH scope="openid profile"
echo "[3/4] Token Exchange WITH scope='openid profile'..."
EXCHANGE_WITH_SCOPE_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SA_TOKEN" \
  -d "requested_subject=$TEST_USER" \
  -d "scope=openid profile")

EXCHANGED_TOKEN_WITH_SCOPE=$(echo "$EXCHANGE_WITH_SCOPE_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$EXCHANGED_TOKEN_WITH_SCOPE" ]; then
  echo "❌ Token exchange with scope failed"
  echo "$EXCHANGE_WITH_SCOPE_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Token exchanged with scope"
echo ""
echo "Decoded Claims (WITH scope='openid profile'):"
echo "$EXCHANGED_TOKEN_WITH_SCOPE" | awk -F. '{print $2}' | base64 -d 2>/dev/null | jq '{
  sub: .sub,
  preferred_username: .preferred_username,
  resource_access: .resource_access
}'
echo ""

# Step 4: Full token analysis
echo "[4/4] Full Token Analysis..."
echo "=========================================="
FULL_CLAIMS=$(echo "$EXCHANGED_TOKEN_WITH_SCOPE" | awk -F. '{print $2}' | base64 -d 2>/dev/null)

echo "Subject (sub): $(echo "$FULL_CLAIMS" | jq -r '.sub')"
echo "Username (preferred_username): $(echo "$FULL_CLAIMS" | jq -r '.preferred_username // "❌ MISSING"')"
echo "Resource Access (mcp-gateway roles):"
echo "$FULL_CLAIMS" | jq -r '.resource_access."mcp-gateway".roles // "❌ MISSING" | if type == "array" then .[] else . end'
echo ""

# Diagnosis
HAS_USERNAME=$(echo "$FULL_CLAIMS" | jq -r '.preferred_username // empty')
HAS_ROLES=$(echo "$FULL_CLAIMS" | jq -r '.resource_access."mcp-gateway".roles // empty')

echo "=========================================="
echo "Diagnosis:"
echo "=========================================="

if [ -z "$HAS_USERNAME" ]; then
  echo "❌ preferred_username is MISSING"
  echo "   Root Cause: Client lacks 'profile' scope or username mapper"
  echo "   Fix: Run fix-client-scopes.sh to assign default client scopes"
else
  echo "✅ preferred_username is present: $HAS_USERNAME"
fi

if [ -z "$HAS_ROLES" ]; then
  echo "❌ resource_access roles are MISSING"
  echo "   Root Cause: Client lacks 'roles' scope or client role mapper"
  echo "   Fix: Run fix-client-scopes.sh to assign default client scopes"
else
  echo "✅ resource_access roles are present"
fi

echo ""
echo "=========================================="
echo "Recommendation:"
echo "=========================================="
if [ -z "$HAS_USERNAME" ] || [ -z "$HAS_ROLES" ]; then
  echo "1. Run: ./fix-client-scopes.sh"
  echo "2. Update TestAuthProvider to include scope='openid profile'"
  echo "3. Retest integration tests"
else
  echo "✅ Token claims look good! Integration tests should pass."
fi
echo ""
