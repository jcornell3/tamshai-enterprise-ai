# Integration Test 401 Error - Token Acquisition Failure

**Date**: December 31, 2025
**CI Run**: #20613388161
**Status**: ⚠️ Under Investigation

## Summary

After successfully deploying Keycloak realm with Terraform (25 resources, zero errors), integration tests are failing with HTTP 401 Unauthorized errors when attempting to acquire access tokens from Keycloak.

**Test Results**: 67/74 tests failing, all with same error pattern

## Error Details

### Error Location

File: `tests/integration/rbac.test.ts`
Function: `getAccessToken` (lines 55-72)
Failing Line: 67 (axios.post to token endpoint)

### Error Message

```
● MCP HR Server - Read Tools › list_employees › Returns employees with success status
  AxiosError: Request failed with status code 401

  109 |   });
  110 |
> 111 |   const response = await axios.post<TokenResponse>(tokenUrl, params, {
      |                    ^
  112 |     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  113 |   });
  114 |
```

### Token Request Details

**Endpoint**: `http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token`

**Request Parameters**:
```javascript
{
  grant_type: 'password',  // Resource Owner Password Grant
  client_id: 'mcp-gateway',
  client_secret: process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret',
  username: 'alice.chen',  // Example test user
  password: 'password123',
  scope: 'openid profile email roles'
}
```

## Terraform Deployment Status

✅ **Successful** - All resources created without errors:

```
Apply complete! Resources: 25 added, 0 changed, 0 destroyed.

Outputs:
  environment = "ci"
  keycloak_url = "http://localhost:8180"
  mcp_gateway_client_id = "mcp-gateway"
  mcp_gateway_client_secret = <sensitive>
  realm_id = "tamshai-corp"
  realm_name = "tamshai-corp"
  roles_created = [
    "hr-read",
    "hr-write",
    "finance-read",
    "finance-write",
    "sales-read",
    "sales-write",
    "support-read",
    "support-write",
    "executive",
  ]
```

## Root Cause Hypotheses

### Hypothesis 1: Client Secret Mismatch

**Likelihood**: HIGH
**Evidence**: Client secret is marked `<sensitive>` in Terraform output, may not be exported correctly to tests

**Verification Steps**:
1. Add debug logging to CI workflow before integration tests:
   ```yaml
   - name: Debug Terraform Outputs
     working-directory: infrastructure/terraform/keycloak
     run: |
       echo "Client ID: $(terraform output -raw mcp_gateway_client_id)"
       echo "Client secret length: $(terraform output -raw mcp_gateway_client_secret | wc -c)"
       echo "KEYCLOAK_CLIENT_SECRET env var set: ${KEYCLOAK_CLIENT_SECRET:+YES}"
       echo "KEYCLOAK_CLIENT_SECRET length: ${#KEYCLOAK_CLIENT_SECRET}"
   ```

2. Test authentication manually in CI:
   ```yaml
   - name: Test Keycloak Token Acquisition
     run: |
       curl -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
         -d "grant_type=password" \
         -d "client_id=mcp-gateway" \
         -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
         -d "username=alice.chen" \
         -d "password=password123" \
         -d "scope=openid profile email roles" | jq .
   ```

### Hypothesis 2: Direct Access Grants Not Enabled

**Likelihood**: MEDIUM
**Evidence**: Terraform resource may not have enabled direct access grants for mcp-gateway client

**Verification**:
Check `infrastructure/terraform/keycloak/main.tf` for:
```hcl
resource "keycloak_openid_client" "mcp_gateway" {
  # ...
  direct_access_grants_enabled = true  # ← REQUIRED for password grant
  # ...
}
```

If missing, add this property to the client resource.

### Hypothesis 3: Test User Passwords Incorrect

**Likelihood**: MEDIUM
**Evidence**: Terraform creates users with passwords from variables, may not match test expectations

**Expected**: Tests expect password `password123` for all users
**Actual**: Terraform uses `var.test_user_password` from `environments/ci.tfvars`

**Verification**:
```bash
# Check ci.tfvars
grep test_user_password infrastructure/terraform/keycloak/environments/ci.tfvars
```

**Expected Output**:
```hcl
test_user_password = "password123"
```

### Hypothesis 4: Realm Not Fully Initialized

**Likelihood**: LOW
**Evidence**: Terraform succeeded, but Keycloak may need time to process changes

**Test**: Add delay before integration tests:
```yaml
- name: Wait for Keycloak realm to be ready
  run: sleep 10
```

### Hypothesis 5: Client Credentials Not Found by Keycloak

**Likelihood**: MEDIUM
**Evidence**: 401 could mean Keycloak doesn't recognize the client_id or rejects the client_secret

**Verification**: Query Keycloak Admin API to verify client exists:
```bash
# Get admin token
ADMIN_TOKEN=$(curl -X POST http://127.0.0.1:8180/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

# Get mcp-gateway client details
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:8180/admin/realms/tamshai-corp/clients?clientId=mcp-gateway" | jq .
```

**Expected Output**: Client object with `directAccessGrantsEnabled: true`

## Recommended Action Plan

### Step 1: Verify Client Secret Propagation (Immediate)

Add debug step to CI workflow:
```yaml
- name: Debug Keycloak Configuration
  working-directory: infrastructure/terraform/keycloak
  run: |
    echo "=== Terraform Outputs ==="
    terraform output -json | jq 'with_entries(select(.key != "mcp_gateway_client_secret"))'
    echo ""
    echo "=== Environment Variables ==="
    echo "KEYCLOAK_CLIENT_SECRET set: ${KEYCLOAK_CLIENT_SECRET:+YES}"
    echo "KEYCLOAK_CLIENT_SECRET length: $(echo -n "${KEYCLOAK_CLIENT_SECRET}" | wc -c)"
    echo ""
    echo "=== Manual Token Test ==="
    curl -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
      -d "grant_type=password" \
      -d "client_id=mcp-gateway" \
      -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
      -d "username=alice.chen" \
      -d "password=password123" | jq .
```

### Step 2: Verify Terraform Configuration

**Check**: `infrastructure/terraform/keycloak/main.tf`

Ensure `keycloak_openid_client.mcp_gateway` has:
- `direct_access_grants_enabled = true`
- `standard_flow_enabled = true`
- `service_accounts_enabled = true`

**Check**: `infrastructure/terraform/keycloak/environments/ci.tfvars`

Ensure:
- `test_user_password = "password123"`
- `mcp_gateway_client_secret` matches test expectations

### Step 3: Test Token Acquisition Outside Tests

**In CI workflow**, before running integration tests:
```yaml
- name: Verify Keycloak Authentication
  run: |
    echo "Testing token acquisition for alice.chen..."
    TOKEN_RESPONSE=$(curl -s -X POST http://127.0.0.1:8180/realms/tamshai-corp/protocol/openid-connect/token \
      -d "grant_type=password" \
      -d "client_id=mcp-gateway" \
      -d "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
      -d "username=alice.chen" \
      -d "password=password123")

    if echo "$TOKEN_RESPONSE" | jq -e '.access_token' > /dev/null; then
      echo "✅ Token acquisition successful"
      echo "Token preview: $(echo "$TOKEN_RESPONSE" | jq -r '.access_token' | cut -c1-50)..."
    else
      echo "❌ Token acquisition failed"
      echo "Response: $TOKEN_RESPONSE"
      exit 1
    fi
```

## Next Steps

1. **Immediate**: Add debug steps to CI workflow (Step 1) and re-run
2. **If client secret mismatch**: Fix secret export in ci.yml
3. **If direct access grants disabled**: Update Terraform resource
4. **If password mismatch**: Update ci.tfvars or test file
5. **Once identified**: Update `docs/CI_FIXES_2025-12-30.md` with resolution

## Related Files

- **Test File**: `tests/integration/rbac.test.ts` (lines 55-72)
- **Terraform Client**: `infrastructure/terraform/keycloak/main.tf` (keycloak_openid_client resource)
- **Terraform Config**: `infrastructure/terraform/keycloak/environments/ci.tfvars`
- **CI Workflow**: `.github/workflows/ci.yml` (Integration Tests job)
- **Jest Setup**: `tests/integration/jest.setup.js` (user preparation)

## Additional Context

### CI Workflow Token Export

Current implementation in `.github/workflows/ci.yml` (lines ~410-415):
```yaml
- name: Setup Keycloak Realm with Terraform
  working-directory: infrastructure/terraform/keycloak
  run: |
    terraform init
    terraform apply -auto-approve -var-file=environments/ci.tfvars
    echo "KEYCLOAK_CLIENT_SECRET=$(terraform output -raw mcp_gateway_client_secret)" >> $GITHUB_ENV
```

### Test Configuration

Tests expect these credentials:
- **Client ID**: `mcp-gateway`
- **Client Secret**: `test-client-secret` (default) or `$KEYCLOAK_CLIENT_SECRET` (from env)
- **Test Users**: All use password `password123`

### Expected Keycloak Client Configuration

```hcl
resource "keycloak_openid_client" "mcp_gateway" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = "mcp-gateway"

  enabled = true
  access_type = "CONFIDENTIAL"  # Requires client_secret

  # CRITICAL: Enable Resource Owner Password Grant
  direct_access_grants_enabled = true
  standard_flow_enabled = true
  service_accounts_enabled = true

  # Client secret
  client_secret = var.mcp_gateway_client_secret
}
```

---

**Status**: Awaiting debug output from next CI run
**Priority**: HIGH - Blocks all integration tests
**Impact**: 67/74 tests failing (90% failure rate)
