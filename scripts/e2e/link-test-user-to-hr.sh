#!/bin/bash
# =============================================================================
# Link test-user.journey Keycloak ID to HR Database
# =============================================================================
# This script ensures the HR database employee record for test-user.journey
# has the correct keycloak_user_id matching the actual Keycloak user.
#
# Use this script when:
# - E2E tests fail with "EMPLOYEE_NOT_FOUND" errors
# - The globalSetup previously recreated the Keycloak user with a new ID
# - After a fresh environment deployment
#
# Prerequisites:
# - Docker containers running (keycloak, postgres)
# - KEYCLOAK_ADMIN_PASSWORD set in environment
#
# Usage:
#   ./scripts/e2e/link-test-user-to-hr.sh
# =============================================================================

set -euo pipefail

REALM="tamshai-corp"
TEST_USERNAME="test-user.journey"
KEYCLOAK_CONTAINER="${KEYCLOAK_CONTAINER:-tamshai-keycloak}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-tamshai-postgres}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8180/auth}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "=== Link test-user.journey to HR Database ==="

# Step 1: Get admin token
echo "[1/4] Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')
if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: Failed to get admin token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi
echo "Admin token acquired"

# Step 2: Get Keycloak user ID
echo "[2/4] Looking up ${TEST_USERNAME} in Keycloak..."
USER_RESPONSE=$(curl -s -X GET \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${TEST_USERNAME}&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

KEYCLOAK_USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id // empty')
if [ -z "$KEYCLOAK_USER_ID" ]; then
  echo "ERROR: User ${TEST_USERNAME} not found in Keycloak"
  echo "Response: $USER_RESPONSE"
  echo ""
  echo "To fix: Ensure test-user.journey exists in Keycloak."
  echo "Run: ./scripts/infra/deploy.sh dev --sync"
  exit 1
fi
echo "Found Keycloak user ID: ${KEYCLOAK_USER_ID}"

# Step 3: Check if HR employee record exists
echo "[3/4] Checking HR database for TEST001 employee..."
EXISTING_KC_ID=$(docker exec "${POSTGRES_CONTAINER}" psql -U tamshai -d tamshai_hr -tAc \
  "SELECT keycloak_user_id FROM hr.employees WHERE employee_number = 'TEST001';" 2>/dev/null || echo "")

if [ -z "$EXISTING_KC_ID" ]; then
  echo "No existing employee record found - creating..."

  docker exec "${POSTGRES_CONTAINER}" psql -U tamshai -d tamshai_hr -c "
    INSERT INTO hr.employees (
      id, employee_id, employee_number, first_name, last_name, email, work_email,
      phone, department_id, manager_id, title, grade, hire_date, salary,
      bonus_target_pct, location, is_manager, keycloak_user_id
    ) VALUES (
      'e2e00001-0000-0000-0000-000000000001', 'TEST001', 'TEST001', 'Test', 'User',
      'test-user@tamshai.local', 'test-user@tamshai.local', '+1-555-000-0001',
      'd1000000-0000-0000-0000-000000000001', 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
      'Journey Test Account', 'L5', '2024-01-01', 0.00, 0, 'Remote', false,
      '${KEYCLOAK_USER_ID}'
    ) ON CONFLICT (employee_number) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id;
  "
  echo "Employee record created"
else
  echo "Existing keycloak_user_id: ${EXISTING_KC_ID}"

  if [ "$EXISTING_KC_ID" = "$KEYCLOAK_USER_ID" ]; then
    echo "HR database already linked correctly - no update needed"
  else
    echo "Updating keycloak_user_id to match current Keycloak user..."
    docker exec "${POSTGRES_CONTAINER}" psql -U tamshai -d tamshai_hr -c "
      UPDATE hr.employees
      SET keycloak_user_id = '${KEYCLOAK_USER_ID}'
      WHERE employee_number = 'TEST001';
    "
    echo "HR database updated"
  fi
fi

# Step 4: Verify the link
echo "[4/4] Verifying link..."
VERIFY_RESULT=$(docker exec "${POSTGRES_CONTAINER}" psql -U tamshai -d tamshai_hr -tAc \
  "SELECT first_name, last_name, keycloak_user_id FROM hr.employees WHERE employee_number = 'TEST001';")

echo ""
echo "=== SUCCESS ==="
echo "Employee record: ${VERIFY_RESULT}"
echo "Keycloak user ID: ${KEYCLOAK_USER_ID}"
echo ""
echo "The test-user.journey account is now linked to the HR database."
echo "E2E tests should be able to query org chart and other HR data."
