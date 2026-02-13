# Keycloak Token Exchange - Resolution Summary

**Date**: 2026-02-12
**Status**: ✅ PRIMARY ISSUE RESOLVED
**Remaining Work**: Token claims configuration

---

## Problem Solved ✅

**Issue**: Keycloak Admin API `policies` field not persisting on permission updates.

**Root Cause**: Keycloak Authorization API requires **Read-Modify-Write** pattern:
- ❌ **Wrong**: Send partial permission object with just `policies` field
- ✅ **Right**: GET full object → Modify → PUT complete object back

**Credit**: Solution pattern identified by Gemini AI

---

## Solution Implemented

### Script Created: `keycloak/scripts/configure-token-exchange.sh`

**What it does**:
1. Authenticates as Keycloak admin
2. Verifies all required resources exist
3. Creates client policy for `mcp-integration-runner`
4. Enables users management permissions
5. **READ**: Fetches complete impersonate permission object
6. **MODIFY**: Adds policy ID to `policies` array using `jq`
7. **WRITE**: Sends complete modified object back to Keycloak
8. Verifies the binding persisted

**Usage**:

```bash
cd keycloak/scripts
./configure-token-exchange.sh
```

**Output**:

```
==================================================
Keycloak Token Exchange Configuration
==================================================
[1/7] Authenticating as admin... ✅
[2/7] Looking up realm-management client... ✅
[3/7] Verifying mcp-integration-runner client... ✅
[4/7] Creating client policy... ✅
[5/7] Enabling users management permissions... ✅
[6/7] Binding policy (read-modify-write)... ✅
[7/7] Verifying binding persisted... ✅

✅ Token Exchange Configuration Complete!
```

---

## Results

### Before

```json
{
  "error": "access_denied",
  "error_description": "Client not allowed to exchange"
}
```

Keycloak logs:

```
reason="subject not allowed to impersonate"
```

### After

```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 300,
  "token_type": "Bearer"
}
```

**Token exchange successful!** ✅

---

## Test Results

### Integration Tests

```bash
cd tests/integration
npm test -- auth-token-exchange.test.ts
```

**Result**:
- ✅ **9 passing** (was 5 before)
- ❌ 7 failing (down from 11)

**Progress**: 56% passing (up from 31%)

### What Works Now ✅

1. ✅ Client credentials authentication
2. ✅ Service token acquisition
3. ✅ Token exchange request (no more "subject not allowed to impersonate")
4. ✅ Token caching
5. ✅ Concurrent token requests
6. ✅ Service token refresh
7. ✅ Error handling for invalid client secret
8. ✅ Error handling for non-existent users
9. ✅ Network error handling

### What's Still Broken ❌

**Issue**: Exchanged tokens missing user claims

**Failing Tests**:
1. ❌ `preferred_username` field is `undefined` in exchanged token
2. ❌ `resource_access` doesn't contain user roles (empty array)
3. ❌ MCP Gateway returns 401 when using exchanged token
4. ❌ Token lifecycle tests fail due to missing username claim

**Root Cause**: Token exchange configuration incomplete - missing scope/claim mappings

**Example**:

```javascript
const payload = decodeToken(aliceToken);
console.log(payload.preferred_username); // undefined (should be "alice.chen")
console.log(payload.resource_access?.['mcp-gateway']?.roles); // [] (should include "hr-read", "hr-write")
```

---

## Next Steps

### 1. Investigate Token Claims (Required)

**Research Needed**:
- What scopes need to be requested in token exchange?
- Do we need to add `requested_token_type` parameter?
- Are there claim mappers missing on the client?
- Does token exchange inherit user roles by default?

**Test Command**:

```bash
# Current token exchange call
curl -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SERVICE_TOKEN" \
  -d "requested_subject=alice.chen"

# Try adding scopes?
curl -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SERVICE_TOKEN" \
  -d "requested_subject=alice.chen" \
  -d "scope=openid profile email roles"

# Try requesting specific token type?
curl -X POST "http://localhost:8180/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=$SERVICE_TOKEN" \
  -d "requested_subject=alice.chen" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token"
```

### 2. Update TestAuthProvider (If Needed)

**File**: `tests/shared/auth/token-exchange.ts`

If token exchange requires different parameters, update the `getUserToken()` method:

```typescript
async getUserToken(username: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: this.clientId,
    client_secret: this.clientSecret,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: serviceToken,
    requested_subject: username,
    // Add if needed:
    scope: 'openid profile email roles',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token'
  });
  // ...
}
```

### 3. Make Configuration Idempotent

**Add to**: `keycloak/scripts/sync-realm.sh` or create new post-deploy hook

```bash
# After realm import, run token exchange configuration
echo "Configuring token exchange permissions..."
./configure-token-exchange.sh
```

**Or**: Export realm after successful configuration and update `realm-export-dev.json`

---

## Documentation Updates

### Updated Files

1. ✅ `keycloak-token-exchange-blocking-issue.md` - Added resolution section
2. ✅ `keycloak-token-exchange-quick-ref.md` - Updated status to RESOLVED
3. ✅ `keycloak/scripts/configure-token-exchange.sh` - New script created

### Files to Update (After Claims Fixed)

1. `test-auth-refactoring.md` - Mark Phase 1 complete, document claims issue
2. `keycloak-token-exchange-ui-steps.md` - Add note about scripted approach
3. `README.md` or `CLAUDE.md` - Document token exchange setup

---

## Key Learnings

### 1. Keycloak Authorization API Pattern

**Lesson**: Authorization resources require full object updates, not partial.

**Pattern**:

```bash
# 1. READ full state
CURRENT=$(curl GET /permission/{id})

# 2. MODIFY with jq
UPDATED=$(echo "$CURRENT" | jq '.policies += ["new-policy-id"]')

# 3. WRITE complete object
curl PUT /permission/{id} -d "$UPDATED"
```

### 2. HTTP Status Codes

**201 Created** is a valid success status for permission updates, not just 200/204.

### 3. Token Exchange Complexity

Token exchange involves multiple configuration layers:
- ✅ Features enabled (`token-exchange`, `admin-fine-grained-authz`)
- ✅ Service account with impersonation role
- ✅ Client policy created
- ✅ Policy bound to impersonate permission
- ⚠️ Scope/claim configuration (TBD)
- ⚠️ Client mappers (TBD)

---

## References

### External

- [Keycloak Token Exchange](https://www.keycloak.org/securing-apps/token-exchange)
- [RFC 8693 - OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)

### Internal

- Primary Issue Report: `.claude/plans/keycloak-token-exchange-blocking-issue.md`
- Quick Reference: `.claude/plans/keycloak-token-exchange-quick-ref.md`
- UI Steps (Alternative): `.claude/plans/keycloak-token-exchange-ui-steps.md`
- Test Auth Plan: `.claude/plans/test-auth-refactoring.md`

---

## Timeline

| Time | Event |
|------|-------|
| 14:00 | Started Phoenix rebuild |
| 14:30 | Enabled token-exchange features |
| 15:00 | Created client and policy |
| 15:30 | Discovered API binding issue |
| 16:00 | Attempted 3 different API approaches |
| 17:00 | Documented issue for third-party review |
| 18:00 | Received Gemini solution (Read-Modify-Write) |
| 18:15 | Implemented and tested script |
| 18:30 | ✅ Token exchange working, 9/16 tests passing |

**Total Time**: 4.5 hours
**Blocking Issue Resolution**: Read-Modify-Write pattern
**Time to Implement Solution**: 30 minutes

---

**Document Version**: 1.0
**Status**: Active - Claims issue under investigation
**Next Review**: After token claims resolved
