# CI 401 Error - Comprehensive Debug Strategy

**Date**: December 31, 2025
**Status**: Multiple hypotheses, need empirical data
**Priority**: CRITICAL - Blocks all integration tests

## Current State

### Code Analysis Results

✅ **Already Fixed** (per CI-Errors.md document):
1. `clientSecret` correctly reads from `process.env.KEYCLOAK_CLIENT_SECRET` (rbac.test.ts:32)
2. Gateway uses `KEYCLOAK_URL: http://127.0.0.1:8180` to match tests (ci.yml:454)

❓ **Remaining Hypotheses**:
1. **Invalid Scope**: "roles" scope doesn't exist in Keycloak (my analysis)
2. **Client Secret Not Propagating**: GITHUB_ENV timing issue (original finding)
3. **Terraform Client Configuration**: Something wrong with client creation
4. **Keycloak Not Ready**: Realm not fully initialized when tests run

## Recommended: Add Comprehensive Debug Step

Add this step to `.github/workflows/ci.yml` **IMMEDIATELY BEFORE** "Run integration tests" (after line 485):

```yaml
      - name: Debug Keycloak Authentication Setup
        run: |
          echo "============================================"
          echo "Environment Variables Check"
          echo "============================================"
          echo "KEYCLOAK_CLIENT_SECRET is set: ${KEYCLOAK_CLIENT_SECRET:+YES}"
          echo "KEYCLOAK_CLIENT_SECRET length: $(echo -n "${KEYCLOAK_CLIENT_SECRET}" | wc -c)"
          echo "KEYCLOAK_URL: ${KEYCLOAK_URL}"
          echo "KEYCLOAK_REALM: ${KEYCLOAK_REALM}"
          echo ""

          echo "============================================"
          echo "Keycloak Client Verification (Admin API)"
          echo "============================================"

          # Get admin token
          echo "Getting admin token..."
          ADMIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:8180/realms/master/protocol/openid-connect/token \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=admin" \
            -d "grant_type=password")

          ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | jq -r '.access_token')

          if [ "$ADMIN_TOKEN" = "null" ] || [ -z "$ADMIN_TOKEN" ]; then
            echo "❌ Failed to get admin token"
            echo "Response: $ADMIN_RESPONSE"
            exit 1
          fi

          echo "✅ Admin token acquired"
          echo ""

          # Get mcp-gateway client configuration
          echo "Fetching mcp-gateway client configuration..."
          CLIENT_CONFIG=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
            "http://127.0.0.1:8180/admin/realms/tamshai-corp/clients?clientId=mcp-gateway")

          echo "Client exists: $(echo "$CLIENT_CONFIG" | jq -r 'if length > 0 then "YES" else "NO" end')"
          echo "Client ID: $(echo "$CLIENT_CONFIG" | jq -r '.[0].clientId // "NOT_FOUND"')"
          echo "Access Type: $(echo "$CLIENT_CONFIG" | jq -r '.[0].clientAuthenticatorType // "NOT_FOUND"')"
          echo "Direct Access Grants Enabled: $(echo "$CLIENT_CONFIG" | jq -r '.[0].directAccessGrantsEnabled // "NOT_FOUND"')"
          echo "Standard Flow Enabled: $(echo "$CLIENT_CONFIG" | jq -r '.[0].standardFlowEnabled // "NOT_FOUND"')"
          echo "Service Accounts Enabled: $(echo "$CLIENT_CONFIG" | jq -r '.[0].serviceAccountsEnabled // "NOT_FOUND"')"
          echo ""

          # Get client's default scopes
          CLIENT_UUID=$(echo "$CLIENT_CONFIG" | jq -r '.[0].id')
          echo "Client UUID: $CLIENT_UUID"
          echo ""

          echo "Fetching client default scopes..."
          DEFAULT_SCOPES=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
            "http://127.0.0.1:8180/admin/realms/tamshai-corp/clients/$CLIENT_UUID/default-client-scopes")

          echo "Default scopes:"
          echo "$DEFAULT_SCOPES" | jq -r '.[].name'
          echo ""

          # Get alice.chen user
          echo "Fetching alice.chen user..."
          USER_INFO=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
            "http://127.0.0.1:8180/admin/realms/tamshai-corp/users?username=alice.chen")

          echo "User exists: $(echo "$USER_INFO" | jq -r 'if length > 0 then "YES" else "NO" end')"
          echo "User enabled: $(echo "$USER_INFO" | jq -r '.[0].enabled // "NOT_FOUND"')"
          echo "Email verified: $(echo "$USER_INFO" | jq -r '.[0].emailVerified // "NOT_FOUND"')"
          echo ""

          USER_UUID=$(echo "$USER_INFO" | jq -r '.[0].id')

          # Get user's roles
          echo "Fetching alice.chen roles..."
          USER_ROLES=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
            "http://127.0.0.1:8180/admin/realms/tamshai-corp/users/$USER_UUID/role-mappings/realm")

          echo "User roles:"
          echo "$USER_ROLES" | jq -r '.[].name'
          echo ""

          echo "============================================"
          echo "Test 1: Token Acquisition with openid profile email"
          echo "============================================"

          # Test token acquisition WITHOUT "roles" scope
          RESPONSE_1=$(curl -s -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
            -d "grant_type=password" \
            -d "client_id=mcp-gateway" \
            -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
            -d "username=alice.chen" \
            -d "password=[REDACTED-DEV-PASSWORD]" \
            -d "scope=openid profile email")

          if echo "$RESPONSE_1" | jq -e '.access_token' > /dev/null 2>&1; then
            echo "✅ Token acquisition successful (without 'roles' scope)"
            echo "Token preview: $(echo "$RESPONSE_1" | jq -r '.access_token' | cut -c1-50)..."
            echo ""
            echo "Token claims:"
            echo "$RESPONSE_1" | jq -r '.access_token' | cut -d. -f2 | base64 -d 2>/dev/null | jq '.resource_access'
          else
            echo "❌ Token acquisition failed (without 'roles' scope)"
            echo "Response: $RESPONSE_1"
            echo ""
          fi

          echo ""
          echo "============================================"
          echo "Test 2: Token Acquisition with openid profile email roles"
          echo "============================================"

          # Test token acquisition WITH "roles" scope (what tests currently do)
          RESPONSE_2=$(curl -s -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
            -d "grant_type=password" \
            -d "client_id=mcp-gateway" \
            -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
            -d "username=alice.chen" \
            -d "password=[REDACTED-DEV-PASSWORD]" \
            -d "scope=openid profile email roles")

          if echo "$RESPONSE_2" | jq -e '.access_token' > /dev/null 2>&1; then
            echo "✅ Token acquisition successful (with 'roles' scope)"
            echo "Token preview: $(echo "$RESPONSE_2" | jq -r '.access_token' | cut -c1-50)..."
          else
            echo "❌ Token acquisition failed (with 'roles' scope)"
            echo "Response: $RESPONSE_2"
            echo ""
            echo "Parsing error details..."
            echo "Error: $(echo "$RESPONSE_2" | jq -r '.error // "NO_ERROR_FIELD"')"
            echo "Error description: $(echo "$RESPONSE_2" | jq -r '.error_description // "NO_DESCRIPTION"')"
          fi

          echo ""
          echo "============================================"
          echo "Summary"
          echo "============================================"

          if echo "$RESPONSE_1" | jq -e '.access_token' > /dev/null 2>&1; then
            if echo "$RESPONSE_2" | jq -e '.access_token' > /dev/null 2>&1; then
              echo "✅ Both scope variations work - Issue is elsewhere"
            else
              echo "❌ 'roles' scope causes failure - Remove from tests or add client scope"
            fi
          else
            echo "❌ Token acquisition fails regardless of scopes - Check client secret or configuration"
          fi
```

## What This Debug Step Does

1. **Verifies Environment Variables**: Confirms `KEYCLOAK_CLIENT_SECRET` is set and has non-zero length
2. **Checks Keycloak Client Configuration**: Uses Admin API to verify:
   - Client exists with correct ID
   - Direct access grants are enabled
   - Default scopes are configured correctly
3. **Verifies Test User**: Confirms alice.chen exists, is enabled, has correct roles
4. **Tests Token Acquisition (without "roles")**: Tries `openid profile email` scopes
5. **Tests Token Acquisition (with "roles")**: Tries `openid profile email roles` scopes
6. **Provides Clear Diagnosis**: Shows exactly which test succeeds/fails

## Expected Outcomes

### Scenario 1: "roles" Scope Issue (My Hypothesis)

```
✅ Test 1: Token acquisition successful (without 'roles' scope)
❌ Test 2: Token acquisition failed (with 'roles' scope)
Error: invalid_scope
Error description: Invalid scopes: roles
```

**Fix**: Remove "roles" from test scopes OR add client scope resource

### Scenario 2: Client Secret Issue (Original Hypothesis)

```
❌ Test 1: Token acquisition failed (without 'roles' scope)
❌ Test 2: Token acquisition failed (with 'roles' scope)
Error: unauthorized_client
Error description: Invalid client or Invalid client credentials
```

**Fix**: Debug Terraform output export

### Scenario 3: Both Work (Configuration OK)

```
✅ Test 1: Token acquisition successful (without 'roles' scope)
✅ Test 2: Token acquisition successful (with 'roles' scope)
```

**Conclusion**: Issue is in test code or Gateway configuration, not Keycloak

## Implementation

**File**: `.github/workflows/ci.yml`
**Location**: After line 485 ("Install dependencies")
**Before**: "Run integration tests" step

```yaml
      - name: Install dependencies
        working-directory: tests/integration
        run: npm ci

      - name: Debug Keycloak Authentication Setup  # ← ADD HERE
        run: |
          # ... paste debug script above ...

      - name: Run integration tests
        working-directory: tests/integration
        run: npm test
```

## Alternative Quick Fix (If "roles" Scope Is The Issue)

If you want to bypass debugging and just test the "roles" scope hypothesis:

**File**: `tests/integration/rbac.test.ts`
**Line**: 64

```typescript
// BEFORE:
scope: 'openid profile email roles',

// AFTER:
scope: 'openid profile email',
```

Then retrigger CI. If tests pass, we've confirmed the hypothesis.

## Next Steps

1. ✅ **Add debug step** to `.github/workflows/ci.yml`
2. ⚠️ **Commit and push** to trigger CI
3. ⚠️ **Review CI logs** for debug output
4. ⚠️ **Apply appropriate fix** based on debug results
5. ⚠️ **Document resolution** in `docs/CI_FIXES_2025-12-30.md`

---

**Status**: Awaiting debug output
**Estimated Debug Time**: 5 minutes (single CI run)
**Estimated Fix Time**: 2 minutes (once root cause confirmed)
