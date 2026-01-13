# Production 403 Error Remediation Plan

**Date**: January 12, 2026
**Status**: Pending Approval
**Priority**: High (Production auth broken for eve.thompson)

## Problem Statement

Eve.thompson gets 403 Forbidden errors when accessing MCP Gateway API endpoints (e.g., `/api/mcp/finance/list_invoices`) despite having the `executive` role configured in Keycloak.

## Root Cause Analysis

### Finding: Group Assignment Skipped in Production

The `assign_user_groups()` function in `keycloak/scripts/sync-realm.sh` explicitly skips user-to-group assignment in production:

```bash
# Lines 609-612
if [ "$ENV" = "prod" ]; then
    log_info "Skipping user group assignment in production"
    return 0
fi
```

### How Roles Work

| Environment | User Creation | Group Assignment | Role Inheritance |
|-------------|---------------|------------------|------------------|
| **Dev** | identity-sync | `assign_user_groups()` runs | eve.thompson → C-Suite → `executive` role |
| **Stage** | identity-sync | `assign_user_groups()` runs | eve.thompson → C-Suite → `executive` role |
| **Prod** | identity-sync | **SKIPPED** | eve.thompson has NO group → NO roles |

### Token Flow

1. User authenticates via `web-portal` client
2. Keycloak issues JWT with `realm_access.roles` claim
3. MCP Gateway extracts roles from `payload.realm_access?.roles`
4. If roles array is empty → 403 Forbidden

### Evidence from Code

**sync-realm.sh line 619** - Mapping that should apply:
```bash
"eve.thompson:C-Suite"
```

**realm-export.json lines 160-165** - C-Suite group has executive role:
```json
{
  "name": "C-Suite",
  "path": "/C-Suite",
  "realmRoles": ["executive", "manager"]
}
```

**jwt-validator.ts lines 102-107** - How roles are extracted:
```typescript
const realmRoles = payload.realm_access?.roles || [];
const clientRoles = payload.resource_access?.[this.config.clientId]?.roles || [];
const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));
```

## Why This Design Exists

The production skip was intentional (per CLAUDE.md):

> **Prod-Specific Rules:**
> 1. Only `test-user.journey` is auto-provisioned
> 2. Identity sync is disabled
> 3. sync-realm.sh skips user functions
> 4. Corporate users must be manually created

**Rationale**: Production shouldn't have automated user provisioning for security reasons.

## Remediation Options

### Option A: Manual Keycloak Admin Fix (Recommended First)

**Risk Level**: Low
**Effort**: 5 minutes
**Persistence**: Survives service restarts, lost on Keycloak reimport

**Steps**:
1. Access Keycloak Admin Console:
   ```
   https://keycloak-fn44nd7wba-uc.a.run.app/auth/admin
   ```
2. Login with admin credentials (from GCP Secret Manager)
3. Navigate: Users → Search "eve.thompson" → Click user
4. Go to "Groups" tab → Click "Join Group"
5. Select "C-Suite" → Click "Join"
6. User must logout and login again to get new token

**Verification**:
```bash
# After user re-login, check the 403 response body for roles
# Or decode the JWT at jwt.io to verify realm_access.roles contains "executive"
```

**Pros**:
- Immediate fix
- No code changes
- No deployment required
- Doesn't affect dev/stage

**Cons**:
- Manual process
- Lost if Keycloak is reimported from realm-export.json
- Doesn't scale for multiple users

---

### Option B: Add Critical User Assignment Function

**Risk Level**: Medium
**Effort**: 30 minutes (code + deploy)
**Persistence**: Runs on every sync, survives reimports

**Changes to `keycloak/scripts/sync-realm.sh`**:

Add new function after `assign_user_groups()`:

```bash
# =============================================================================
# Critical Production User Assignment
# =============================================================================

# In production, we don't auto-assign all users to groups (security policy).
# However, certain critical users (e.g., CEO) need group membership for the
# system to function. This function handles those specific cases.
assign_critical_prod_users() {
    # Only run in production
    if [ "$ENV" != "prod" ]; then
        return 0
    fi

    log_info "Assigning critical production users to groups..."

    # Critical users who need group membership for system access
    # Format: username:group
    local -a critical_users=(
        "eve.thompson:C-Suite"
    )

    for mapping in "${critical_users[@]}"; do
        local username="${mapping%%:*}"
        local group="${mapping##*:}"

        local user_id=$($KCADM get users -r "$REALM" -q "username=$username" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$user_id" ]; then
            log_warn "  Critical user $username not found in Keycloak"
            continue
        fi

        local group_id=$($KCADM get groups -r "$REALM" -q "name=$group" --fields id 2>/dev/null | grep -o '"id" : "[^"]*"' | cut -d'"' -f4 | head -1)

        if [ -z "$group_id" ]; then
            log_warn "  Group $group not found"
            continue
        fi

        if $KCADM update "users/$user_id/groups/$group_id" -r "$REALM" -s realm="$REALM" -n 2>/dev/null; then
            log_info "  $username: added to $group"
        else
            log_info "  $username: already in $group or error"
        fi
    done
}
```

Update `main()` function to call it:

```bash
main() {
    # ... existing code ...

    # Assign users to groups (for dev/stage - restores role inheritance)
    assign_user_groups

    # Assign critical production users (CEO, etc.)
    assign_critical_prod_users    # <-- ADD THIS LINE

    log_info "=========================================="
    log_info "Keycloak Realm Sync - Complete"
    log_info "=========================================="
}
```

**Deployment**:
```bash
git add keycloak/scripts/sync-realm.sh
git commit -m "fix(keycloak): Add critical prod user group assignment for eve.thompson"
git push
# Workflow will auto-deploy and run sync
```

**Pros**:
- Automated and repeatable
- Survives Keycloak reimports
- Explicit list of critical users (auditable)
- Follows existing code patterns

**Cons**:
- Code change required
- Deployment needed
- Specific to listed users

---

### Option C: Enable Full Group Assignment in Prod

**Risk Level**: High
**Effort**: 10 minutes
**Persistence**: Permanent

**Change**: Remove the prod skip in `assign_user_groups()`:

```bash
assign_user_groups() {
    log_info "Assigning users to groups..."

    # REMOVE THESE LINES:
    # if [ "$ENV" = "prod" ]; then
    #     log_info "Skipping user group assignment in production"
    #     return 0
    # fi

    # ... rest of function ...
}
```

**Pros**:
- All users get proper roles automatically
- Simplest code change

**Cons**:
- Violates production security policy
- May conflict with manual user management
- Could assign test users (eve.thompson, alice.chen, etc.) in prod
- Not recommended per CLAUDE.md guidelines

---

### Option D: Direct Role Assignment (Alternative)

**Risk Level**: Low
**Effort**: 5 minutes

Instead of group membership, assign the `executive` realm role directly to eve.thompson.

**Steps**:
1. Keycloak Admin → Users → eve.thompson → Role Mappings
2. Under "Realm Roles", add `executive`

**Pros**:
- Direct and explicit
- No group dependency

**Cons**:
- Doesn't include `manager` role (which C-Suite group provides)
- Deviates from group-based RBAC model

## Recommended Approach

### Immediate (Today)
**Execute Option A** - Manual Keycloak fix to unblock eve.thompson

### Short-term (This Week)
**Implement Option B** - Add `assign_critical_prod_users()` function for automation

### Long-term (Future)
Document production user onboarding process that includes:
1. Identity sync creates user
2. Admin manually assigns to appropriate group
3. Or: Add user to `critical_users` array in sync-realm.sh

## Verification Checklist

After fix is applied:

- [ ] Eve.thompson logs out of portal
- [ ] Eve.thompson logs back in
- [ ] Navigate to Finance app
- [ ] Verify data loads without 403
- [ ] Check browser DevTools → Network → API call response
- [ ] Verify `realm_access.roles` in JWT contains `executive`

## Rollback Plan

If issues arise:

**Option A rollback**: Remove eve.thompson from C-Suite group in Keycloak Admin

**Option B rollback**:
```bash
git revert <commit-hash>
git push
```

## Files Affected

| Option | Files Changed |
|--------|---------------|
| A | None (Keycloak Admin UI only) |
| B | `keycloak/scripts/sync-realm.sh` |
| C | `keycloak/scripts/sync-realm.sh` |
| D | None (Keycloak Admin UI only) |

---

---

## Resolution (January 13, 2026)

### Actual Root Cause Found

The 403 errors were NOT caused by missing group assignment (that was fixed earlier). The actual root cause was **broken protocol mappers** on the `web-portal` client:

**Source**: Commit `ec878fa` (Jan 1) created two Terraform resources without the required `client_id_for_role_mappings` parameter:
- `keycloak_openid_user_client_role_protocol_mapper.web_portal_roles`
- `keycloak_openid_user_client_role_protocol_mapper.web_portal_mcp_roles`

**When applied**: The `terraform-keycloak-prod.yml` workflow was run on January 11, which created these broken mappers in production Keycloak.

**Why it failed**: Without `client_id_for_role_mappings`, the mappers were created with a null `usermodel.clientRoleMapping.clientId` config, meaning no roles were added to JWT tokens.

### Fixes Applied

| Fix | Commit | Purpose |
|-----|--------|---------|
| Terraform config | `b1b0d69` | Added `client_id_for_role_mappings` to both mappers in `infrastructure/terraform/keycloak/main.tf` |
| Keycloak API | Manual | Updated both mappers in production Keycloak via Admin API |
| sync-realm.sh | `f168c85` | Added `sync_client_role_mappers()` function to permanently fix mappers on every sync |

### Verification

After fix, mappers now have correct configuration:
```json
{
  "name": "mcp-gateway-roles-mapper",
  "config": {
    "usermodel.clientRoleMapping.clientId": "mcp-gateway",
    "claim.name": "resource_access.mcp-gateway.roles"
  }
}
```

### User Action Required

Eve.thompson must:
1. Log out of portal at `app.tamshai.com`
2. Log back in to get fresh JWT with roles
3. Test Finance/HR/Sales/Support apps

**Status**: ✅ Fixed

---

## Issue #2: 401 Unauthorized from MCP Gateway (January 12, 2026)

### Symptoms
- Users got 401 errors when calling MCP Gateway APIs
- Keycloak tokens were valid but MCP Gateway rejected them

### Root Cause: Missing Audience Mapper

The `mcp-gateway-audience` mapper was either missing or broken on web clients. This mapper adds `mcp-gateway` to the `aud` claim in JWT tokens.

**Why it matters**: MCP Gateway validates that tokens are intended for it by checking `aud` claim contains `mcp-gateway`.

### Fixes Applied

| Fix | Commit | Purpose |
|-----|--------|---------|
| sync-realm.sh | (same session) | Updated `add_audience_mapper_to_client()` to UPDATE existing broken mappers instead of skipping them |

### Key Code Change

**Before** (just skipped if mapper existed):
```bash
if [ -n "$existing_mapper" ]; then
    log_info "    Audience mapper already exists, skipping"
    return 0
fi
```

**After** (updates existing mappers):
```bash
if [ -n "$existing_mapper" ]; then
    # Mapper exists - UPDATE it to ensure correct configuration
    local mapper_id=$(...)
    $KCADM update "clients/$client_uuid/protocol-mappers/models/$mapper_id" ...
fi
```

---

## Issue #3: 401 from Cloud Run MCP Servers (January 12, 2026)

### Symptoms
- MCP Gateway could reach MCP servers in dev/stage but not in GCP production
- MCP servers returned 401 Unauthorized

### Root Cause: Missing GCP Identity Token

In GCP Cloud Run, service-to-service calls require identity tokens for IAM authentication. The MCP Gateway was sending user JWT tokens but not GCP identity tokens.

**Technical Detail**: Cloud Run requires `Authorization: Bearer <identity-token>` where the identity token is obtained from the GCP metadata server.

### Fixes Applied

| Fix | Commit | Purpose |
|-----|--------|---------|
| gcp-auth.ts | New file | Created utility to fetch identity tokens from GCP metadata server |
| mcp-proxy.routes.ts | Updated | Added identity token to outgoing MCP server requests |
| package.json | Updated | Added `google-auth-library` dependency |

### Key Code

```typescript
// services/mcp-gateway/src/utils/gcp-auth.ts
export async function getIdentityToken(targetUrl: string): Promise<string | null> {
  if (!(await checkGCPEnvironment())) {
    return null;  // Not on GCP, skip
  }
  // Fetch identity token for target audience
  const client = await authInstance.getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  return headers['Authorization'].substring(7);  // Strip 'Bearer '
}

// services/mcp-gateway/src/routes/mcp-proxy.routes.ts
const identityToken = await getIdentityToken(server.url);
const mcpResponse = await axios.post(targetUrl, body, {
  headers: {
    ...(identityToken && { Authorization: `Bearer ${identityToken}` }),
  },
});
```

---

## Issue #4: 400 MISSING_USER_CONTEXT from MCP Servers (January 12, 2026)

### Symptoms
- After fixing Cloud Run auth (Issue #3), got 400 instead of 401
- MCP HR returned: `{"status":"error","code":"MISSING_USER_CONTEXT","message":"User context is required"}`

### Root Cause: Missing `sub` Claim in JWT

The JWT token was missing the `sub` (subject) claim entirely. MCP Gateway extracts `userId` from `payload.sub`:

```typescript
// jwt-validator.ts line 149
userId: payload.sub || ''  // Returns empty string if sub missing
```

When `userId` is empty, MCP servers return 400 because they can't identify the user.

### Why Sub Claim Was Missing

The `web-portal` client didn't have a protocol mapper to include the `sub` claim. While OpenID Connect should include `sub` by default, certain Keycloak configurations can result in it being omitted.

### Fixes Applied

| Fix | Commit | Purpose |
|-----|--------|---------|
| sync-realm.sh | (this session) | Added `sync_sub_claim_mapper()` function to ensure `sub` claim is included |

### Key Code

```bash
# keycloak/scripts/sync-realm.sh
add_sub_claim_mapper_to_client() {
    local client_id="$1"
    # Create mapper that adds user's Keycloak ID as 'sub' claim
    $KCADM create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" \
        -s name="subject-claim-mapper" \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-usermodel-attribute-mapper \
        -s 'config."user.attribute"=id' \
        -s 'config."claim.name"=sub' \
        -s 'config."access.token.claim"=true' \
        -s 'config."id.token.claim"=true'
}

sync_sub_claim_mapper() {
    add_sub_claim_mapper_to_client "web-portal"
    add_sub_claim_mapper_to_client "tamshai-website"
    add_sub_claim_mapper_to_client "tamshai-flutter-client"
}
```

---

## Complete Issue Summary

| Issue | HTTP Status | Error Message | Root Cause | Fix Location |
|-------|-------------|---------------|------------|--------------|
| #1 Broken role mappers | 403 | No roles in token | Missing `client_id_for_role_mappings` | Terraform + sync-realm.sh |
| #2 Missing audience | 401 | Invalid audience | No `mcp-gateway` in `aud` claim | sync-realm.sh |
| #3 Cloud Run auth | 401 | Unauthorized | No GCP identity token | gcp-auth.ts + mcp-proxy.routes.ts |
| #4 Missing sub claim | 400 | MISSING_USER_CONTEXT | No `sub` claim in JWT | sync-realm.sh |

## Lessons Learned

1. **Protocol mappers must be idempotent**: `sync-realm.sh` functions should UPDATE existing mappers, not just skip them
2. **GCP Cloud Run requires identity tokens**: Service-to-service calls need IAM authentication
3. **JWT claims can be missing**: Don't assume standard OIDC claims are present; explicitly map them
4. **Test with real tokens**: Decode JWTs to verify all expected claims are present

## Verification After All Fixes

Eve.thompson must:
1. Log out of portal at `app.tamshai.com`
2. Log back in to get fresh JWT
3. Decode JWT at jwt.io and verify:
   - `sub` claim is present (user's Keycloak ID)
   - `aud` claim contains `mcp-gateway`
   - `realm_access.roles` contains `executive`
   - `resource_access.mcp-gateway.roles` contains roles
4. Test Finance/HR/Sales/Support apps

**Status**: ✅ All fixes applied, pending user verification
