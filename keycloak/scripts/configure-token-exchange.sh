#!/bin/bash
set -e

# ============================================================================
# Keycloak Token Exchange Configuration - Read-Modify-Write Pattern
# ============================================================================
#
# This script configures token exchange permissions for the mcp-integration-runner
# service account using the proper read-modify-write pattern required by Keycloak's
# Authorization API.
#
# Prerequisites:
# - Keycloak running with token-exchange and admin-fine-grained-authz features enabled
# - mcp-integration-runner client created with service account enabled
# - Users management permissions enabled
#
# Usage:
#   ./configure-token-exchange.sh
#
# Reference:
#   .claude/plans/keycloak-token-exchange-blocking-issue.md
# ============================================================================

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180/auth}"
REALM="tamshai-corp"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "=================================================="
echo "Keycloak Token Exchange Configuration"
echo "=================================================="
echo "Keycloak URL: $KEYCLOAK_URL"
echo "Realm: $REALM"
echo ""

# Step 1: Authenticate and get admin token (prefer client credentials over ROPC)
echo "[1/7] Authenticating as admin..."
if [ -n "${KEYCLOAK_ADMIN_CLIENT_SECRET:-}" ]; then
  echo "  Using client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET)"
  ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=admin-cli" \
    -d "client_secret=$KEYCLOAK_ADMIN_CLIENT_SECRET" \
    -d "grant_type=client_credentials" | jq -r '.access_token')
else
  echo "  Using ROPC fallback (admin username/password)"
  ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$ADMIN_USER" \
    -d "password=$ADMIN_PASS" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')
fi

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Failed to authenticate. Check KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD."
  exit 1
fi

echo "✅ Authenticated successfully"
echo ""

# Step 2: Get realm-management client UUID
echo "[2/7] Looking up realm-management client..."
RM_CLIENT_UUID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=realm-management" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ "$RM_CLIENT_UUID" == "null" ] || [ -z "$RM_CLIENT_UUID" ]; then
  echo "❌ realm-management client not found"
  exit 1
fi

echo "✅ realm-management UUID: $RM_CLIENT_UUID"
echo ""

# Step 3: Verify mcp-integration-runner client exists
echo "[3/7] Verifying mcp-integration-runner client..."
MCP_CLIENT_UUID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=mcp-integration-runner" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ "$MCP_CLIENT_UUID" == "null" ] || [ -z "$MCP_CLIENT_UUID" ]; then
  echo "❌ mcp-integration-runner client not found. Create it first."
  exit 1
fi

echo "✅ mcp-integration-runner UUID: $MCP_CLIENT_UUID"
echo ""

# Step 4: Create or get client policy
echo "[4/7] Creating client policy for mcp-integration-runner..."
POLICY_NAME="mcp-integration-runner-policy"

# Check if policy already exists
EXISTING_POLICY=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients/$RM_CLIENT_UUID/authz/resource-server/policy?name=$POLICY_NAME" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$EXISTING_POLICY" | jq -e '.[0].id' > /dev/null 2>&1; then
  POLICY_ID=$(echo "$EXISTING_POLICY" | jq -r '.[0].id')
  echo "✅ Policy already exists: $POLICY_ID"
else
  # Create new policy
  POLICY_RESULT=$(curl -s -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients/$RM_CLIENT_UUID/authz/resource-server/policy/client" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "client",
      "logic": "POSITIVE",
      "decisionStrategy": "UNANIMOUS",
      "name": "'"$POLICY_NAME"'",
      "description": "Allow MCP integration runner to perform token exchange",
      "clients": ["'"$MCP_CLIENT_UUID"'"]
    }')

  POLICY_ID=$(echo "$POLICY_RESULT" | jq -r '.id')

  if [ "$POLICY_ID" == "null" ] || [ -z "$POLICY_ID" ]; then
    echo "❌ Failed to create policy"
    echo "$POLICY_RESULT" | jq '.'
    exit 1
  fi

  echo "✅ Policy created: $POLICY_ID"
fi

echo ""

# Step 5: Enable users management permissions if not already enabled
echo "[5/7] Enabling users management permissions..."
USERS_PERM_RESULT=$(curl -s -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users-management-permissions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}')

IMPERSONATE_PERM_ID=$(echo "$USERS_PERM_RESULT" | jq -r '.scopePermissions.impersonate')

if [ "$IMPERSONATE_PERM_ID" == "null" ] || [ -z "$IMPERSONATE_PERM_ID" ]; then
  echo "❌ Failed to get impersonate permission ID"
  echo "$USERS_PERM_RESULT" | jq '.'
  exit 1
fi

echo "✅ Impersonate permission ID: $IMPERSONATE_PERM_ID"
echo ""

# Step 6: Read-Modify-Write - Bind policy to impersonate permission
echo "[6/7] Binding policy to impersonate permission (read-modify-write)..."

# READ: Get current permission state
CURRENT_PERM=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients/$RM_CLIENT_UUID/authz/resource-server/permission/$IMPERSONATE_PERM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Current permission state:"
echo "$CURRENT_PERM" | jq '{id, name, policies}'
echo ""

# MODIFY: Add policy ID to policies array (ensuring uniqueness)
MODIFIED_PERM=$(echo "$CURRENT_PERM" | jq --arg policy_id "$POLICY_ID" '
  if .policies == null then
    .policies = [$policy_id]
  else
    .policies = (.policies + [$policy_id] | unique)
  end
')

echo "Modified permission (will update):"
echo "$MODIFIED_PERM" | jq '{id, name, policies}'
echo ""

# WRITE: Send complete modified object back
UPDATE_RESULT=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$RM_CLIENT_UUID/authz/resource-server/permission/scope/$IMPERSONATE_PERM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$MODIFIED_PERM")

HTTP_STATUS=$(echo "$UPDATE_RESULT" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE_BODY=$(echo "$UPDATE_RESULT" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" != "204" ] && [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ]; then
  echo "❌ Failed to update permission (HTTP $HTTP_STATUS)"
  echo "$RESPONSE_BODY"
  exit 1
fi

echo "✅ Permission updated (HTTP $HTTP_STATUS)"
echo ""

# Step 7: Verify the binding persisted
echo "[7/7] Verifying policy binding persisted..."
sleep 2  # Give Keycloak a moment to persist

VERIFY_PERM=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients/$RM_CLIENT_UUID/authz/resource-server/permission/$IMPERSONATE_PERM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

VERIFY_POLICIES=$(echo "$VERIFY_PERM" | jq -r '.policies')

if [ "$VERIFY_POLICIES" == "null" ] || [ "$VERIFY_POLICIES" == "[]" ]; then
  echo "❌ Policy binding did NOT persist"
  echo "$VERIFY_PERM" | jq '{id, name, policies}'
  exit 1
fi

echo "✅ Policy binding verified:"
echo "$VERIFY_PERM" | jq '{id, name, policies}'
echo ""

echo "=================================================="
echo "✅ Token Exchange Configuration Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Test token exchange:"
echo "   cd tests/integration"
echo "   npm test -- auth-token-exchange.test.ts"
echo ""
echo "2. If tests pass, export realm for idempotency:"
echo "   See: .claude/plans/keycloak-token-exchange-ui-steps.md (Step 9)"
echo ""
