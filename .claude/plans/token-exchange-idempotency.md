# Token Exchange Configuration - Idempotency Implementation

**Date**: 2026-02-12
**Status**: ✅ COMPLETE
**Related**: `keycloak-token-exchange-RESOLUTION.md`

---

## Summary

Made the token exchange permission configuration idempotent by integrating it into the Keycloak realm sync process. The configuration now survives Phoenix rebuilds and can be applied consistently across environments.

---

## Changes Made

### 1. Created Authorization Library Module

**File**: `keycloak/scripts/lib/authz.sh` (NEW)

**Purpose**: Provides Authorization Services management functions for fine-grained permissions.

**Key Functions**:

#### `get_admin_token()`

- Authenticates to Keycloak REST API
- Returns access token for Authorization Services calls
- Uses admin credentials from environment

#### `rest_api_call(method, endpoint, body)`

- Generic REST API wrapper
- Used for Authorization Services endpoints (not supported by kcadm)
- Returns response body and HTTP status

#### `policy_exists(rm_client_uuid, policy_name)`

- Checks if a client policy exists
- Returns 0 if exists, 1 if not

#### `get_policy_id(rm_client_uuid, policy_name)`

- Retrieves policy UUID by name
- Returns empty string if not found

#### `sync_token_exchange_permissions()`

- **Main function**: Configures token exchange permissions
- Only runs in dev/ci environments (test-only feature)
- Implements Read-Modify-Write pattern for policy binding
- Idempotent: Safe to run multiple times

**Implementation Details**:

```bash
sync_token_exchange_permissions() {
    # 1. Guard: Only dev/ci environments
    if [ "$ENV" != "dev" ] && [ "$ENV" != "ci" ]; then
        return 0
    fi

    # 2. Get admin token for REST API
    ADMIN_TOKEN=$(get_admin_token)

    # 3. Lookup realm-management client UUID
    rm_client_uuid=$(get_client_uuid "realm-management")

    # 4. Verify mcp-integration-runner exists
    mcp_client_uuid=$(get_client_uuid "mcp-integration-runner")

    # 5. Create or get client policy
    if policy_exists "$rm_client_uuid" "mcp-integration-runner-policy"; then
        policy_id=$(get_policy_id "$rm_client_uuid" "mcp-integration-runner-policy")
    else
        # Create new policy with POST
        policy_id=$(...)
    fi

    # 6. Enable users management permissions
    rest_api_call PUT "users-management-permissions" '{"enabled": true}'
    impersonate_perm_id=$(extract from response)

    # 7. READ-MODIFY-WRITE: Bind policy to permission
    current_perm=$(rest_api_call GET "clients/$rm_client_uuid/authz/.../permission/$impersonate_perm_id")

    # Check if already bound (idempotency)
    if policy already in policies array; then
        return 0
    fi

    modified_perm=$(jq add policy_id to policies array)
    rest_api_call PUT "clients/$rm_client_uuid/authz/.../permission/scope/$impersonate_perm_id" "$modified_perm"

    # 8. Verify binding persisted
    verify_perm=$(rest_api_call GET ...)
    if policies array is null or empty; then
        log_error and return 1
    fi
}
```

### 2. Updated Main Sync Script

**File**: `keycloak/scripts/sync-realm.sh` (MODIFIED)

**Changes**:

1. **Added library import** (line 53):

   ```bash
   source "$SCRIPT_DIR/lib/authz.sh"
   ```

2. **Added function call** (after line 92):

   ```bash
   # Sync token exchange permissions (dev/ci only)
   # Configures Authorization Services to allow mcp-integration-runner to impersonate users
   sync_token_exchange_permissions
   ```

**Execution Order**:

```text
1. configure_environment()
2. kcadm_login()
3. create_standard_scopes()
4. sync_all_clients()
5. sync_audience_mapper()
6. sync_sub_claim_mapper()
7. sync_client_role_mappers()
8. sync_token_exchange_permissions()  ← NEW
9. provision_test_user()
10. set_passwords()
11. sync_groups()
12. assign_user_groups()
```

---

## How It Works

### First Run (Fresh Environment)

1. `sync_integration_runner_client()` creates the mcp-integration-runner client
2. Assigns 'impersonate' role to service account
3. `sync_token_exchange_permissions()` runs:
   - Creates client policy (type: client, clients: [mcp-integration-runner])
   - Enables users management permissions
   - Binds policy to impersonate permission (Read-Modify-Write)
   - Verifies binding persisted

**Result**: Token exchange configured, 9/16 tests passing

### Subsequent Runs (Idempotent)

1. `sync_integration_runner_client()` updates existing client (no-op for immutable properties)
2. `sync_token_exchange_permissions()` runs:
   - Finds existing policy by name
   - Checks if policy already bound to permission
   - If bound: Returns early (no-op)
   - If not bound: Binds using Read-Modify-Write

**Result**: No changes, configuration unchanged

### Phoenix Rebuild (Terraform Destroy + Apply)

1. Terraform destroys Keycloak container and volume
2. Terraform creates new Keycloak container
3. Keycloak imports realm from `realm-export-dev.json`
4. `sync-realm.sh` runs automatically (post-deploy hook)
5. Token exchange permissions configured via `sync_token_exchange_permissions()`

**Result**: Configuration restored, survives rebuild

---

## Testing

### Manual Test

```bash
# Run sync script manually (inside Keycloak container)
cd keycloak/scripts
./docker-sync-realm.sh dev tamshai-pg-keycloak

# Expected output:
# ==========================================
# Keycloak Realm Sync - Starting
# ==========================================
# ...
# Syncing token exchange permissions for mcp-integration-runner...
#   Authenticating for REST API access...
#   Looking up realm-management client...
#   realm-management UUID: f0408dd8-81f9-4bc9-8207-fc1c782c0070
#   Verifying mcp-integration-runner client...
#   mcp-integration-runner UUID: 1d627f52-bb73-40fe-93f5-812b40cebdaf
#   Creating client policy...
#   Policy already exists: cfdb972d-6ce9-4fdf-9216-a83d71707ec1
#   Enabling users management permissions...
#   Impersonate permission ID: efd9e24d-0f0e-462b-8c91-1dcd16bde196
#   Binding policy to impersonate permission (read-modify-write)...
#   Policy already bound to impersonate permission
#   Token exchange permissions configured successfully
# ==========================================
# Keycloak Realm Sync - Complete
# ==========================================
```

### Integration Tests

```bash
cd tests/integration
npm test -- auth-token-exchange.test.ts

# Expected: 9 of 16 passing (56% success rate)
# Passing tests:
# ✅ Client credentials authentication
# ✅ Service token acquisition
# ✅ Token exchange request (no "subject not allowed to impersonate")
# ✅ Token caching
# ✅ Concurrent token requests
# ✅ Service token refresh
# ✅ Error handling (invalid secret, non-existent users, network errors)
```

### Phoenix Rebuild Test

```bash
cd infrastructure/terraform/dev
terraform destroy -var-file=dev.tfvars -auto-approve
terraform apply -var-file=dev.tfvars -auto-approve

# Wait for services (~5 minutes)

# Test token exchange
cd ../../../tests/integration
npm test -- auth-token-exchange.test.ts

# Expected: 9 of 16 passing (configuration persisted)
```

---

## Architecture

### Before (Manual Script)

```text
User → configure-token-exchange.sh → Keycloak REST API
       (manual, one-time)            (policy binding)
```

**Problems**:
- Manual execution required
- Lost on Phoenix rebuild
- Not tracked in version control

### After (Integrated)

```text
Terraform → docker-compose → Keycloak → realm import
                ↓
           sync-realm.sh → lib/authz.sh → REST API
           (automatic)     (idempotent)    (policy binding)
```

**Benefits**:
- Automatic execution on deploy
- Survives Phoenix rebuilds
- Version controlled (part of sync-realm.sh)
- Idempotent (safe to run multiple times)

---

## Environment Behavior

| Environment | Token Exchange Config | Rationale |
|-------------|----------------------|-----------|
| **dev** | ✅ Configured | Integration tests need token exchange |
| **ci** | ✅ Configured | CI pipelines run integration tests |
| **stage** | ❌ Skipped | No integration tests on VPS |
| **prod** | ❌ Skipped | Production security policy |

**Guard Logic**:

```bash
if [ "$ENV" != "dev" ] && [ "$ENV" != "ci" ]; then
    log_info "Skipping token exchange permissions (test environments only)"
    return 0
fi
```

---

## Remaining Work

### 1. Fix Token Claims Issue

**Problem**: Exchanged tokens missing user claims
- `preferred_username` is undefined
- `resource_access` is empty array

**Impact**: 7 of 16 tests still failing

**Investigation Needed**:
- Try adding `scope` parameter to token exchange request
- Try adding `requested_token_type` parameter
- Check if claim mappers are missing on mcp-integration-runner client
- Verify token exchange inherits user roles by default

**Next Steps**:
1. Research Keycloak token exchange scope configuration
2. Test different token exchange parameters
3. Update TestAuthProvider if needed
4. Document solution when found

### 2. Update Realm Export (Optional)

**Current State**: Token exchange config is applied via sync script (code-based)

**Alternative**: Export realm after configuration and update realm-export-dev.json

**Pros**:
- No script execution needed on first boot
- Configuration visible in realm export

**Cons**:
- Realm exports are large and hard to diff
- Authorization settings can be complex
- Script approach is more maintainable

**Recommendation**: Keep script-based approach (current implementation)

---

## Key Learnings

### 1. Read-Modify-Write Pattern

**Lesson**: Keycloak Authorization API requires full object updates, not partial.

**Wrong**:

```bash
curl -X PUT /permission/{id} -d '{"policies": ["policy-id"]}'
# Result: HTTP 200, but policies: null on subsequent GET
```

**Right**:

```bash
CURRENT=$(curl GET /permission/{id})
MODIFIED=$(echo "$CURRENT" | jq '.policies += ["policy-id"]')
curl PUT /permission/{id} -d "$MODIFIED"
# Result: HTTP 201, policies array persisted
```

### 2. REST API vs kcadm

**kcadm**: Good for clients, users, roles, scopes
**REST API**: Required for Authorization Services (policies, permissions, resources)

**Why**: kcadm doesn't support fine-grained authorization endpoints

### 3. Idempotency Checks

**Always check if resource exists before creating**:

```bash
if policy_exists "$name"; then
    policy_id=$(get_policy_id "$name")
else
    policy_id=$(create_policy "$name")
fi
```

**Check if binding already exists before modifying**:

```bash
if policy already in permission.policies; then
    return 0  # No-op
fi
```

### 4. HTTP Status Codes

**Accept multiple success codes**:
- 200 OK - Resource updated
- 201 Created - Resource created (permissions use this)
- 204 No Content - Update successful, no response body

```bash
if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ] && [ "$HTTP_STATUS" != "204" ]; then
    log_error "Failed (HTTP $HTTP_STATUS)"
    return 1
fi
```

---

## References

### Internal Documentation

- [Token Exchange Resolution](.claude/plans/keycloak-token-exchange-RESOLUTION.md)
- [Blocking Issue Report](.claude/plans/keycloak-token-exchange-blocking-issue.md)
- [Quick Reference](.claude/plans/keycloak-token-exchange-quick-ref.md)
- [UI Steps (Alternative)](.claude/plans/keycloak-token-exchange-ui-steps.md)

### Code Files

- `keycloak/scripts/lib/authz.sh` - Authorization services library (NEW)
- `keycloak/scripts/sync-realm.sh` - Main sync script (MODIFIED)
- `keycloak/scripts/configure-token-exchange.sh` - Standalone script (REFERENCE)

### External Resources

- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)
- [OAuth 2.0 Token Exchange (RFC 8693)](https://datatracker.ietf.org/doc/html/rfc8693)
- [Keycloak REST API](https://www.keycloak.org/docs-api/24.0.5/rest-api/)

---

## Success Criteria

- [x] Token exchange configuration is idempotent
- [x] Configuration survives Keycloak restart
- [x] Configuration survives Phoenix rebuild
- [x] Code is version controlled (part of sync-realm.sh)
- [x] Only runs in dev/ci environments (security policy)
- [x] Uses Read-Modify-Write pattern (correct API usage)
- [x] Includes idempotency checks (no duplicate policies)
- [ ] Integration tests pass (9/16 - blocked on claims issue)

---

**Document Version**: 1.0
**Status**: Idempotency complete, claims issue remains
**Next Review**: After token claims issue resolved
