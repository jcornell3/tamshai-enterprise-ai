#!/bin/bash
# =============================================================================
# Test Keycloak User Creation
# =============================================================================
# This script tests whether we can create users via the Keycloak Admin API.
# Run this on the VPS to verify permissions before running the full workflow.
#
# Usage:
#   ssh root@vps.tamshai.com "bash -s" < scripts/test/test-keycloak-user-create.sh
#
# Or if already on VPS:
#   cd /opt/tamshai && ./scripts/test/test-keycloak-user-create.sh
#
# =============================================================================

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost/auth}"
REALM="tamshai-corp"
TEST_USERNAME="__test_user_create_$(date +%s)__"

echo "=== Keycloak User Creation Test ==="
echo "Keycloak URL: $KEYCLOAK_URL"
echo "Realm: $REALM"
echo "Test username: $TEST_USERNAME"
echo ""

# Get admin password from .env
if [ -f /opt/tamshai/.env ]; then
    KEYCLOAK_ADMIN_PASSWORD=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" /opt/tamshai/.env | cut -d= -f2-)
elif [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
    echo "Using KEYCLOAK_ADMIN_PASSWORD from environment"
else
    echo "ERROR: KEYCLOAK_ADMIN_PASSWORD not found"
    echo "Set it via: export KEYCLOAK_ADMIN_PASSWORD=yourpassword"
    exit 1
fi

echo "[1/6] Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [ -z "$TOKEN" ]; then
    echo "ERROR: Could not get admin token"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi
echo "[OK] Admin token obtained"

echo ""
echo "[2/6] Verifying realm exists..."
REALM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}" \
    -H "Authorization: Bearer $TOKEN")

if [ "$REALM_CHECK" != "200" ]; then
    echo "ERROR: Realm $REALM not found (HTTP $REALM_CHECK)"
    exit 1
fi
echo "[OK] Realm $REALM exists"

echo ""
echo "[3/6] Listing current users..."
USER_COUNT=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
    -H "Authorization: Bearer $TOKEN" | jq 'length')
echo "[OK] Found $USER_COUNT users in realm"

echo ""
echo "[4/6] Testing user creation (WITHOUT explicit ID)..."
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"$TEST_USERNAME\",
        \"email\": \"${TEST_USERNAME}@test.local\",
        \"firstName\": \"Test\",
        \"lastName\": \"Create\",
        \"enabled\": true,
        \"emailVerified\": true
    }")

CREATE_HTTP=$(echo "$CREATE_RESPONSE" | tail -n1)
CREATE_BODY=$(echo "$CREATE_RESPONSE" | head -n-1)

if [ "$CREATE_HTTP" = "201" ]; then
    echo "[OK] User created successfully (HTTP 201)"
elif [ "$CREATE_HTTP" = "409" ]; then
    echo "[OK] User already exists (HTTP 409) - this is fine"
elif [ "$CREATE_HTTP" = "403" ]; then
    echo "[FAIL] 403 Forbidden - admin cannot create users"
    echo "Response body: $CREATE_BODY"
    echo ""
    echo "Possible causes:"
    echo "  1. admin user doesn't have realm-admin role"
    echo "  2. realm has user creation restrictions"
    echo ""
    echo "Checking admin user roles..."
    curl -sf "${KEYCLOAK_URL}/admin/realms/master/users?username=admin" \
        -H "Authorization: Bearer $TOKEN" | jq '.[0] | {username, realmRoles, clientRoles}'
    exit 1
else
    echo "[FAIL] Unexpected response (HTTP $CREATE_HTTP)"
    echo "Response body: $CREATE_BODY"
    exit 1
fi

echo ""
echo "[5/6] Verifying user was created..."
NEW_USER=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=$TEST_USERNAME" \
    -H "Authorization: Bearer $TOKEN")
NEW_USER_ID=$(echo "$NEW_USER" | jq -r '.[0].id')

if [ -z "$NEW_USER_ID" ] || [ "$NEW_USER_ID" = "null" ]; then
    echo "[FAIL] Could not find created user"
    exit 1
fi
echo "[OK] User found with ID: $NEW_USER_ID"

echo ""
echo "[6/6] Cleaning up test user..."
DELETE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/$NEW_USER_ID" \
    -H "Authorization: Bearer $TOKEN")

if [ "$DELETE_HTTP" = "204" ]; then
    echo "[OK] Test user deleted"
else
    echo "[WARN] Could not delete test user (HTTP $DELETE_HTTP)"
fi

echo ""
echo "=== TEST PASSED ==="
echo "User creation via Admin API is working correctly."
echo "The workflow should succeed now."
