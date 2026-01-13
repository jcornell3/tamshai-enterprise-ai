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

## Issue #5: Wrong Mapper Type for Sub Claim (January 12, 2026)

### Symptoms
- Sub claim mapper was created but `sub` still missing from JWT
- Workflow logs showed "Sub claim mapper created successfully"
- User logged out/in but token still had no `sub` claim

### Root Cause: Wrong protocolMapper Type

The initial fix used `oidc-usermodel-attribute-mapper` which maps **custom user attributes** (from the Attributes tab). The Keycloak user ID is a **built-in property**, not a custom attribute.

**Wrong** (maps custom attributes):
```bash
-s protocolMapper=oidc-usermodel-attribute-mapper
```

**Correct** (maps built-in properties like id, username, email):
```bash
-s protocolMapper=oidc-usermodel-property-mapper
```

### Fixes Applied

| Fix | Commit | Purpose |
|-----|--------|---------|
| sync-realm.sh | ce8dd73 | Changed from `attribute-mapper` to `property-mapper` |

### Why This Matters

Keycloak has two different mapper types for user data:
- **oidc-usermodel-attribute-mapper**: Custom attributes added to users
- **oidc-usermodel-property-mapper**: Built-in properties (id, username, firstName, etc.)

The `id` property (user's UUID) is built-in, so it requires `property-mapper`.

---

## Issue #6: MCP Services Can't Connect to Cloud SQL (January 13, 2026)

### Symptoms
- mcp-hr returns: `{"status":"error","code":"DATABASE_ERROR","message":"Unable to connect to the HR database"}`
- All MCP services fail with database connection errors
- Error details show connection refused to localhost

### Root Cause: Wrong Environment Variables

Terraform was setting `DATABASE_URL` but MCP services expect individual `POSTGRES_*` variables:

**What Terraform Set**:
```hcl
env {
  name  = "DATABASE_URL"
  value = "postgresql://user:pass@/db?host=/cloudsql/..."
}
```

**What MCP Services Expect** (from `services/mcp-hr/src/database/connection.ts`):
```typescript
host: process.env.POSTGRES_HOST || 'localhost',     // Falls back to localhost!
port: parseInt(process.env.POSTGRES_PORT || '5433'),
database: process.env.POSTGRES_DB || 'tamshai_hr',
user: process.env.POSTGRES_USER || 'tamshai',
password: process.env.POSTGRES_PASSWORD || '...',
```

Since `POSTGRES_HOST` wasn't set, services defaulted to `localhost:5433` which doesn't exist in Cloud Run.

### Fixes Applied

| Fix | File | Changes |
|-----|------|---------|
| Add POSTGRES_* env vars | `infrastructure/terraform/modules/cloudrun/main.tf` | Replace DATABASE_URL with individual POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT |
| Add db_name per service | `infrastructure/terraform/modules/cloudrun/main.tf` | Each service gets its own database (tamshai_hr, tamshai_finance, etc.) |

### Database Configuration

| MCP Service | Primary Storage | PostgreSQL DB | Notes |
|-------------|-----------------|---------------|-------|
| mcp-hr | PostgreSQL | tamshai_hr | Employee data |
| mcp-finance | PostgreSQL | tamshai_finance | Invoices, budgets |
| mcp-sales | MongoDB | N/A | Uses MONGODB_URI |
| mcp-support | Elasticsearch | N/A | Knowledge base, tickets |

### Key Code Change

```hcl
# Before (wrong)
env {
  name  = "DATABASE_URL"
  value = "postgresql://..."
}

# After (correct)
env {
  name  = "POSTGRES_HOST"
  value = "/cloudsql/${each.value.cloudsql_instance}"
}
env {
  name  = "POSTGRES_DB"
  value = each.value.db_name  # e.g., "tamshai_hr"
}
env {
  name  = "POSTGRES_USER"
  value = var.tamshai_db_user
}
env {
  name  = "POSTGRES_PASSWORD"
  value = var.tamshai_db_password
}
```

---

## Issue #7: Elasticsearch Not Deployed in GCP (January 13, 2026)

### Symptoms
- mcp-support returns: `{"status":"error","code":"DATABASE_ERROR","message":"Failed to search knowledge base","details":{"errorMessage":"connect ECONNREFUSED 127.0.0.1:9201"}}`

### Root Cause: No Elasticsearch in Production

- Dev/Stage: Elasticsearch runs in Docker container on port 9201
- Production: No Elasticsearch deployed (Cloud Run only)

The mcp-support service defaults to `localhost:9201` when `ELASTICSEARCH_URL` is not set.

### Options

| Option | Effort | Cost | Notes |
|--------|--------|------|-------|
| **A) Deploy Elastic Cloud** | Medium | ~$16/month | Managed service, easy setup |
| **B) Deploy on GCE** | High | ~$20/month | Self-managed, complex |
| **C) Graceful degradation** | Low | $0 | Return friendly error for KB searches |
| **D) Use Cloud SQL FTS** | High | $0 | Requires code changes |

### Current State

mcp-support knowledge base features are non-functional in production. Ticket management may still work if it doesn't require Elasticsearch.

**Recommendation**: Implement Option C (graceful degradation) short-term, Option A (Elastic Cloud) long-term.

---

## Issue #8: Empty Production Databases (January 13, 2026)

### Symptoms
- API calls succeed but return empty arrays
- No employees, invoices, or other data displayed

### Root Cause: Sample Data Not Loaded

Cloud SQL databases were created by Terraform but contain no data:

| Database | Status | Data |
|----------|--------|------|
| keycloak | ✅ Working | Keycloak manages its own schema |
| tamshai_hr | ⚠️ Empty | No employee records |
| tamshai_finance | ⚠️ Empty | No invoices/budgets |

### How Dev/Stage Get Data

- Docker Compose mounts `sample-data/*.sql` files
- PostgreSQL container runs init scripts on first start
- Data is automatically seeded

### Production Data Options

| Option | Effort | Notes |
|--------|--------|-------|
| **A) Load sample data via Cloud SQL proxy** | Medium | One-time manual task |
| **B) Create data seeding workflow** | Medium | Automated for future deploys |
| **C) Real data integration** | High | Connect to actual HR/Finance systems |

### To Load Sample Data Manually

```bash
# Connect via Cloud SQL Auth Proxy
cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE=tcp:5432

# In another terminal, run sample data scripts
psql -h localhost -U tamshai -d tamshai_hr -f sample-data/hr/employees.sql
psql -h localhost -U tamshai -d tamshai_finance -f sample-data/finance/invoices.sql
```

---

## Complete Issue Summary

| Issue | HTTP Status | Error Message | Root Cause | Fix Location |
|-------|-------------|---------------|------------|--------------|
| #1 Broken role mappers | 403 | No roles in token | Missing `client_id_for_role_mappings` | Terraform + sync-realm.sh |
| #2 Missing audience | 401 | Invalid audience | No `mcp-gateway` in `aud` claim | sync-realm.sh |
| #3 Cloud Run auth | 401 | Unauthorized | No GCP identity token | gcp-auth.ts + mcp-proxy.routes.ts |
| #4 Missing sub claim | 400 | MISSING_USER_CONTEXT | No `sub` claim in JWT | sync-realm.sh |
| #5 Wrong mapper type | 400 | MISSING_USER_CONTEXT | Used attribute-mapper instead of property-mapper | sync-realm.sh |
| #6 Database env vars | DATABASE_ERROR | Can't connect to database | Wrong env vars (DATABASE_URL vs POSTGRES_*) | modules/cloudrun/main.tf |
| #7 No Elasticsearch | DATABASE_ERROR | Connect ECONNREFUSED 9201 | Elasticsearch not deployed in GCP | Not yet fixed |
| #8 Empty databases | N/A | Zero records returned | Sample data not loaded in Cloud SQL | Manual data load required |

## Lessons Learned

1. **Protocol mappers must be idempotent**: `sync-realm.sh` functions should UPDATE existing mappers, not just skip them
2. **GCP Cloud Run requires identity tokens**: Service-to-service calls need IAM authentication
3. **JWT claims can be missing**: Don't assume standard OIDC claims are present; explicitly map them
4. **Test with real tokens**: Decode JWTs to verify all expected claims are present
5. **Match env var names to code**: Check what env vars the code actually reads, don't assume `DATABASE_URL` is universal
6. **Dev/Prod parity**: Services that work in Docker may fail in Cloud Run due to missing dependencies (Elasticsearch, Redis)
7. **Empty databases are silent failures**: APIs return empty arrays, which looks like "working but no data"

## Verification After All Fixes

### Authentication Fixes (Issues #1-5) - ✅ VERIFIED

Eve.thompson JWT now contains:
- ✅ `sub`: `a8c39c58-11cc-4c28-b9fe-cbb2ad754bb9`
- ✅ `aud`: `mcp-gateway`
- ✅ `realm_access.roles`: executive, manager, hr-read, sales-read, support-read, finance-read
- ✅ `resource_access.mcp-gateway.roles`: executive, hr-read, sales-read, support-read, finance-read

### Database Connectivity (Issue #6) - ⏳ PENDING TERRAFORM APPLY

After Terraform apply:
1. MCP HR should connect to Cloud SQL
2. Test: `curl https://mcp-gateway-.../api/mcp/hr/list_employees`
3. Expected: Either employee data (if loaded) or empty array (not DATABASE_ERROR)

### Elasticsearch (Issue #7) - ❌ NOT FIXED

Knowledge base features in mcp-support will not work until Elasticsearch is deployed.

### Sample Data (Issue #8) - ⏳ PENDING DATA LOAD

After Terraform apply succeeds:
1. Connect to Cloud SQL via proxy
2. Load sample data scripts
3. Verify data appears in apps

**Current Status**:
- ✅ Issues #1-5: Authentication fully working
- ⏳ Issue #6: Terraform changes ready, needs `terraform apply`
- ❌ Issue #7: Elasticsearch not deployed (future work)
- ⏳ Issue #8: Data load needed after Issue #6 is fixed

---

## Issue #9: JWT Issuer Mismatch - 401 Errors (January 13, 2026)

### Symptoms

- Users logged in successfully but got 401 Unauthorized when accessing MCP Gateway APIs
- Portal apps showed blank white screen or loading state
- MCP Gateway logs showed "Invalid token issuer"

### Root Cause: CI Workflow and Terraform Out of Sync

Two different deployment configurations were using different Keycloak URLs:

| Configuration Source | KEYCLOAK_ISSUER / VITE_KEYCLOAK_URL |
|---------------------|-------------------------------------|
| **Terraform** (local `terraform apply`) | `https://auth.tamshai.com/auth/realms/tamshai-corp` |
| **CI Workflow** (GitHub Actions) | `https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp` |

**How the mismatch occurred:**

1. Terraform `cloudrun/main.tf` was updated to use custom domain `auth.tamshai.com`
2. `terraform apply` was run locally, deploying MCP Gateway with new issuer URL
3. CI workflow `deploy-to-gcp.yml` still had hardcoded Cloud Run URLs
4. Web portal (built by CI) authenticated via Cloud Run URL → JWT `iss` = Cloud Run URL
5. MCP Gateway validated against `auth.tamshai.com` → JWT rejected → 401 Unauthorized

### Technical Detail: JWT Issuer Validation

When a user authenticates, Keycloak issues a JWT with an `iss` (issuer) claim matching the URL they authenticated against:

```json
{
  "iss": "https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp",
  "sub": "user-uuid",
  "aud": ["mcp-gateway"]
}
```

MCP Gateway rejects tokens where `iss` doesn't match its configured `KEYCLOAK_ISSUER`.

### Hardcoded URLs in deploy-to-gcp.yml (Before Fix)

```yaml
# Line 110 - deploy-gateway job
KEYCLOAK_ISSUER=https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp

# Line 216 - deploy-keycloak job
KC_HOSTNAME=https://keycloak-fn44nd7wba-uc.a.run.app/auth

# Line 270 - sync-keycloak-realm job
KEYCLOAK_URL: https://keycloak-fn44nd7wba-uc.a.run.app/auth

# Line 341 - deploy-web-portal job
VITE_KEYCLOAK_URL: https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp
```

### Fix Applied

Updated `.github/workflows/deploy-to-gcp.yml` to use `auth.tamshai.com` everywhere:

| Location | Before | After |
|----------|--------|-------|
| deploy-gateway `KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-gateway `KEYCLOAK_ISSUER` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-gateway `JWKS_URI` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-keycloak `KC_HOSTNAME` | `https://keycloak-fn44nd7wba-uc.a.run.app/auth` | `auth.tamshai.com` |
| sync-keycloak-realm `KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| sync-keycloak-realm health checks | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-web-portal `VITE_KEYCLOAK_URL` | `keycloak-fn44nd7wba-uc.a.run.app` | `auth.tamshai.com` |
| deploy-web-portal `--memory` | `256Mi` | `512Mi` (gen2 requirement) |

### Commit Reference

- **Commit**: `9a19af8` - `fix(ci): Use auth.tamshai.com consistently for Keycloak URLs`

### Domain Mapping Already Configured

No DNS changes required - the custom domain was already set up:

- **DNS**: `auth.tamshai.com` CNAME → `ghs.googlehosted.com`
- **Cloud Run Domain Mapping**: Terraform resource `google_cloud_run_domain_mapping.keycloak[0]`
- **SSL Certificate**: Automatically provisioned by Google (status: Ready, CertificateProvisioned)

### Verification After Fix

1. CI workflow must rebuild and deploy web-portal with new `VITE_KEYCLOAK_URL`
2. Users authenticate via `https://auth.tamshai.com/...`
3. JWT `iss` claim = `https://auth.tamshai.com/auth/realms/tamshai-corp`
4. MCP Gateway `KEYCLOAK_ISSUER` = `https://auth.tamshai.com/auth/realms/tamshai-corp`
5. Issuer matches → Token accepted → 200 OK

### Lessons Learned

1. **Keep CI and Terraform in sync** - Both deployment paths must use identical configuration values
2. **Custom domains require consistency** - Once you configure a custom domain, use it everywhere
3. **Build-time vs runtime config** - `VITE_*` variables are baked into the build; changing them requires rebuilding
4. **Check all deployment paths** - Manual `terraform apply` and CI workflows can diverge silently

---

## Updated Issue Summary

| Issue | HTTP Status | Error Message | Root Cause | Status |
|-------|-------------|---------------|------------|--------|
| #1 Broken role mappers | 403 | No roles in token | Missing `client_id_for_role_mappings` | ✅ Fixed |
| #2 Missing audience | 401 | Invalid audience | No `mcp-gateway` in `aud` claim | ✅ Fixed |
| #3 Cloud Run auth | 403 HTML | Unauthorized | No GCP identity token | ✅ Fixed |
| #4 Missing sub claim | 400 | MISSING_USER_CONTEXT | No `sub` claim in JWT | ✅ Fixed |
| #5 Wrong mapper type | 400 | MISSING_USER_CONTEXT | Used attribute-mapper instead of property-mapper | ✅ Fixed |
| #6 Database env vars | DATABASE_ERROR | Can't connect to database | Wrong env vars (DATABASE_URL vs POSTGRES_*) | ✅ Fixed |
| #7 No Elasticsearch | DATABASE_ERROR | Connect ECONNREFUSED 9201 | Elasticsearch not deployed in GCP | ❌ Not Fixed |
| #8 Empty databases | N/A | Zero records returned | Sample data not loaded in Cloud SQL | ⏳ Pending |
| #9 JWT issuer mismatch | 401 | Invalid token issuer | CI/Terraform URL mismatch | ✅ Fixed |
| #10 KC_PROXY_HEADERS missing | 403 | HTTPS required | Keycloak not reading X-Forwarded-Proto | ✅ Fixed |
| #11 CI missing DB config | DATABASE_ERROR | Unable to connect to HR database | CI workflow missing POSTGRES_* env vars | ✅ Fixed |

---

## Issue #11: CI Workflow Missing Database Configuration (January 13, 2026)

### Symptoms

- MCP HR returns: `{"status":"error","code":"DATABASE_ERROR","message":"Unable to connect to the HR database"}`
- All MCP services fail with database connection errors
- Issue appeared after fixing Issue #6 (Terraform was fixed but CI workflow was not)

### Root Cause: CI Workflow Deploys Differently Than Terraform

The `deploy-mcp-suite` job in `.github/workflows/deploy-to-gcp.yml` only set `NODE_ENV=production`:

```yaml
--set-env-vars=NODE_ENV=production
```

Meanwhile, Terraform's `cloudrun/main.tf` sets all database environment variables:

| Setting | Terraform | CI Workflow (Before) |
|---------|-----------|---------------------|
| POSTGRES_HOST | `/cloudsql/...` or `10.180.0.3` | **MISSING** |
| POSTGRES_PORT | `5432` | **MISSING** |
| POSTGRES_DB | `tamshai_hr`, etc. | **MISSING** |
| POSTGRES_USER | `tamshai` | **MISSING** |
| POSTGRES_PASSWORD | From secret | **MISSING** |
| VPC connector | `tamshai-prod-connector` | **MISSING** |

Without these, MCP services fell back to `localhost:5433` which doesn't exist in Cloud Run.

### Fix Applied

**File**: `.github/workflows/deploy-to-gcp.yml`

**Changes**:

1. Added database names to matrix:
```yaml
include:
  - service: mcp-hr
    port: 3101
    db_name: tamshai_hr
  - service: mcp-finance
    port: 3102
    db_name: tamshai_finance
  # ... etc
```

2. Added VPC connector and database configuration:
```yaml
--vpc-connector=tamshai-prod-connector \
--vpc-egress=private-ranges-only \
--set-secrets=POSTGRES_PASSWORD=tamshai-prod-db-password:latest \
--set-env-vars="NODE_ENV=production,POSTGRES_HOST=10.180.0.3,POSTGRES_PORT=5432,POSTGRES_DB=${{ matrix.db_name }},POSTGRES_USER=tamshai"
```

### Commit Reference

- **Commit**: `6133084` - `fix(ci): Add database configuration to MCP suite deployment`

### Lessons Learned

1. **CI/Terraform drift is a recurring theme** - Issues #9, #10, and #11 all stem from the same root cause
2. **Test after CI deployments** - Terraform apply works ≠ CI deployment works
3. **Document all deployment paths** - Having both Terraform and CI deploying the same services is risky

---

## Issue #10: KC_PROXY_HEADERS Missing - HTTPS Required Error (January 13, 2026)

### Symptoms

- JWKS endpoint (`/auth/realms/tamshai-corp/protocol/openid-connect/certs`) returns 403
- Error response: `{"error":"invalid_request","error_description":"HTTPS required"}`
- MCP Gateway startup probe fails (can't validate JWTs without JWKS)
- All services return 503 Service Unavailable

### Root Cause: Missing KC_PROXY_HEADERS in CI Workflow

Cloud Run uses a load balancer that terminates HTTPS and forwards HTTP to containers. The original request protocol is passed via `X-Forwarded-Proto` header. Without `KC_PROXY_HEADERS=xforwarded`, Keycloak doesn't read this header and assumes requests are HTTP.

| Setting | CI Workflow (Before) | Terraform | CI Workflow (After) |
|---------|---------------------|-----------|---------------------|
| KC_PROXY | edge ✅ | edge ✅ | edge ✅ |
| KC_PROXY_HEADERS | **MISSING** ❌ | xforwarded ✅ | xforwarded ✅ |

**Technical flow without fix:**
1. Browser makes HTTPS request to `https://auth.tamshai.com/auth/...`
2. Cloud Run load balancer terminates SSL, forwards as HTTP + `X-Forwarded-Proto: https`
3. Keycloak ignores the header (KC_PROXY_HEADERS not set)
4. Keycloak sees HTTP request, responds with "HTTPS required"

**Technical flow with fix:**
1. Browser makes HTTPS request to `https://auth.tamshai.com/auth/...`
2. Cloud Run load balancer terminates SSL, forwards as HTTP + `X-Forwarded-Proto: https`
3. Keycloak reads `X-Forwarded-Proto` header (KC_PROXY_HEADERS=xforwarded)
4. Keycloak treats request as HTTPS, responds normally

### Fix Applied

**File**: `.github/workflows/deploy-to-gcp.yml` (line 216)

**Before:**
```yaml
--set-env-vars="...,KC_PROXY=edge,KC_HTTP_RELATIVE_PATH=/auth"
```

**After:**
```yaml
--set-env-vars="...,KC_PROXY=edge,KC_PROXY_HEADERS=xforwarded,KC_HTTP_RELATIVE_PATH=/auth"
```

### Commit Reference

- **Commit**: `1e51cf2` - `fix(keycloak): Add KC_PROXY_HEADERS=xforwarded to fix HTTPS detection`

### Verification

After deploying the fix:

```bash
# JWKS endpoint now returns 200 with keys
curl -s -w "\nHTTP: %{http_code}\n" "https://auth.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/certs"
# HTTP: 200

# MCP Gateway health is restored
curl -s "https://mcp-gateway-fn44nd7wba-uc.a.run.app/health"
# {"status":"healthy",...}
```

### Lessons Learned

1. **Compare CI workflow with Terraform** - Configuration drift between deployment methods causes subtle failures
2. **KC_PROXY=edge is not enough** - You also need KC_PROXY_HEADERS=xforwarded for load balancers
3. **"HTTPS required" on HTTPS requests** - Indicates proxy header configuration issue, not DNS or certificate problem
4. **Startup probes cascade** - If Keycloak JWKS fails, MCP Gateway startup fails, causing 503 for all endpoints

---

## Issue #12: Cloud SQL SSL Requirement and MongoDB Configuration (January 13, 2026)

### Symptoms

- MCP HR returns: `{"status":"error","code":"DATABASE_ERROR","message":"Unable to connect to the HR database"}`
- All MCP services fail with database connection errors
- Cloud SQL connection rejected with: `pg_hba.conf rejects connection for host "...", user "tamshai", database "tamshai_hr", no encryption`

### Root Cause: SSL Not Enabled for PostgreSQL Connections

Cloud SQL is configured with `ssl_mode = ENCRYPTED_ONLY` in Terraform, meaning all database connections must use SSL encryption. The Node.js `pg` library doesn't use SSL by default.

**Why the error occurred:**
1. Terraform creates Cloud SQL with `ssl_mode = ENCRYPTED_ONLY` (security best practice)
2. MCP services connect using `pg` library without SSL configuration
3. Cloud SQL rejects non-SSL connections with "no encryption" error
4. Services return DATABASE_ERROR to clients

**Initial Wrong Approach:**

⚠️ **DO NOT modify source code to fix this issue** - that would break dev/stage environments that don't require SSL.

**Correct Approach:**

The `pg` library respects the `PGSSLMODE` environment variable, allowing SSL to be enabled without code changes.

### Secondary Issue: MongoDB URI Not Configured

MCP services also need `MONGODB_URI` environment variable. The CI workflow was missing this configuration entirely.

### Fixes Applied

| Fix | File | Changes |
|-----|------|---------|
| Add PGSSLMODE=require | `.github/workflows/deploy-to-gcp.yml` | Added to `--set-env-vars` in deploy-mcp-suite |
| Add PGSSLMODE=require | `infrastructure/terraform/modules/cloudrun/main.tf` | Added env block for MCP Suite services |
| Create MongoDB secret | GCP Secret Manager | Created `tamshai-prod-mongodb-uri` secret |
| Grant IAM access | GCP IAM | Added secretAccessor role to MCP servers service account |
| Add MONGODB_URI from secret | `.github/workflows/deploy-to-gcp.yml` | Added `MONGODB_URI=tamshai-prod-mongodb-uri:latest` to `--set-secrets` |
| Add MONGODB_URI from secret | `infrastructure/terraform/modules/cloudrun/main.tf` | Added dynamic block for MongoDB secret reference |

### Key Code Changes

**Terraform (`modules/cloudrun/main.tf`)** - Added to MCP Suite services:

```hcl
# PostgreSQL SSL mode - required for Cloud SQL with ssl_mode=ENCRYPTED_ONLY
env {
  name  = "PGSSLMODE"
  value = "require"
}

# MongoDB URI - use Secret Manager if configured
dynamic "env" {
  for_each = var.mongodb_uri_secret != "" ? [1] : []
  content {
    name = "MONGODB_URI"
    value_from {
      secret_key_ref {
        name = var.mongodb_uri_secret
        key  = "latest"
      }
    }
  }
}
```

**CI Workflow (`deploy-to-gcp.yml`)** - deploy-mcp-suite job:

```yaml
--set-secrets=POSTGRES_PASSWORD=tamshai-prod-db-password:latest,MONGODB_URI=tamshai-prod-mongodb-uri:latest \
--set-env-vars="NODE_ENV=production,POSTGRES_HOST=10.180.0.3,POSTGRES_PORT=5432,POSTGRES_DB=${{ matrix.db_name }},POSTGRES_USER=tamshai,PGSSLMODE=require"
```

### GCP Secret Manager Configuration

```bash
# Create the secret
gcloud secrets create tamshai-prod-mongodb-uri \
  --project=gen-lang-client-0553641830 \
  --replication-policy=automatic

# Add the secret value
gcloud secrets versions add tamshai-prod-mongodb-uri \
  --project=gen-lang-client-0553641830 \
  --data-file=-
# (Enter MongoDB Atlas URI when prompted)

# Grant IAM access to MCP servers service account
gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
  --project=gen-lang-client-0553641830 \
  --member="serviceAccount:tamshai-prod-mcp-servers@gen-lang-client-0553641830.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Terraform Plan Verification

```
Plan: 0 to add, 7 to change, 0 to destroy
```

Changes affect all 4 MCP Suite services (hr, finance, sales, support) plus minor changes to other services.

### Environment Variable Approach - Why This Works

The `pg` library (Node.js PostgreSQL client) automatically reads `PGSSLMODE` from environment:

```typescript
// services/mcp-hr/src/database/connection.ts
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  // ... other options
});
// pg library automatically reads PGSSLMODE from environment
```

This means:
- **Dev/Stage**: No `PGSSLMODE` set → SSL not required (works with local Docker PostgreSQL)
- **Prod**: `PGSSLMODE=require` → SSL required (works with Cloud SQL)

### Lessons Learned

1. **Don't modify source code for environment-specific behavior** - Use environment variables instead
2. **Check what env vars libraries respect** - Many libraries like `pg` have undocumented env var support
3. **CI/Terraform must stay in sync** - This is now the fourth issue (9, 10, 11, 12) caused by drift
4. **Use Secret Manager for sensitive values** - MongoDB URI contains credentials
5. **PGSSLMODE is the standard PostgreSQL way** - Works with any PostgreSQL client library

### Updated Issue Summary

| Issue | HTTP Status | Error Message | Root Cause | Status |
|-------|-------------|---------------|------------|--------|
| #1 Broken role mappers | 403 | No roles in token | Missing `client_id_for_role_mappings` | ✅ Fixed |
| #2 Missing audience | 401 | Invalid audience | No `mcp-gateway` in `aud` claim | ✅ Fixed |
| #3 Cloud Run auth | 403 HTML | Unauthorized | No GCP identity token | ✅ Fixed |
| #4 Missing sub claim | 400 | MISSING_USER_CONTEXT | No `sub` claim in JWT | ✅ Fixed |
| #5 Wrong mapper type | 400 | MISSING_USER_CONTEXT | Used attribute-mapper instead of property-mapper | ✅ Fixed |
| #6 Database env vars | DATABASE_ERROR | Can't connect to database | Wrong env vars (DATABASE_URL vs POSTGRES_*) | ✅ Fixed |
| #7 No Elasticsearch | DATABASE_ERROR | Connect ECONNREFUSED 9201 | Elasticsearch not deployed in GCP | ❌ Not Fixed |
| #8 Empty databases | N/A | Zero records returned | Sample data not loaded in Cloud SQL | ⏳ Pending |
| #9 JWT issuer mismatch | 401 | Invalid token issuer | CI/Terraform URL mismatch | ✅ Fixed |
| #10 KC_PROXY_HEADERS missing | 403 | HTTPS required | Keycloak not reading X-Forwarded-Proto | ✅ Fixed |
| #11 CI missing DB config | DATABASE_ERROR | Unable to connect to HR database | CI workflow missing POSTGRES_* env vars | ✅ Fixed |
| #12 Cloud SQL SSL required | DATABASE_ERROR | pg_hba.conf rejects, no encryption | PGSSLMODE not set + MongoDB URI missing | ✅ Fixed |
| #13 Unix socket vs TCP mismatch | DATABASE_ERROR | server does not support SSL | PGSSLMODE with Unix socket | ✅ Fixed |

---

## Issue #13: Unix Socket vs TCP Connection Mismatch (January 13, 2026)

### Symptoms

- MCP HR returns: `{"status":"error","code":"DATABASE_ERROR","message":"Unable to connect to the HR database"}`
- Cloud Run logs show: `error=The server does not support SSL connections`

### Root Cause: Incompatible Connection Method and SSL Setting

**Two ways to connect Cloud Run to Cloud SQL:**

| Method | POSTGRES_HOST | SSL | Security Layer |
|--------|---------------|-----|----------------|
| **Unix Socket** | `/cloudsql/project:region:instance` | ❌ Not supported | Cloud SQL Auth Proxy |
| **TCP via VPC** | `10.180.0.3` (private IP) | ✅ Required | PostgreSQL SSL |

**The Problem:**

Terraform was configured with Unix socket path BUT also had `PGSSLMODE=require`:

```hcl
# Terraform (WRONG combination)
POSTGRES_HOST = "/cloudsql/project:region:instance"  # Unix socket
PGSSLMODE = "require"                                 # Expects SSL
```

Unix socket connections don't use PostgreSQL-level SSL - they're secured by the Cloud SQL Auth Proxy at the transport layer. Setting `PGSSLMODE=require` with a Unix socket causes the `pg` library to request SSL negotiation, which the Unix socket doesn't support.

**CI vs Terraform Drift:**

| Deployment | POSTGRES_HOST | PGSSLMODE | Cloud SQL Connector | Result |
|------------|---------------|-----------|---------------------|--------|
| Terraform | `/cloudsql/...` | require | Yes | ❌ SSL error |
| CI Workflow | `10.180.0.3` | require | No | ✅ Works |

### Decision: Standardize on Unix Socket (Option C)

**Why Unix Socket:**

1. **Google's recommended approach** for Cloud Run → Cloud SQL
2. **Simpler configuration** - no need to manage private IPs
3. **Automatic IAM authentication** via Cloud SQL Auth Proxy
4. **No SSL configuration needed** - proxy handles encryption
5. **Works with `ssl_mode=ENCRYPTED_ONLY`** - Unix sockets bypass this check (it only applies to TCP)

**Why NOT TCP:**

1. Requires hardcoding or passing private IP addresses
2. Requires explicit SSL configuration
3. More moving parts (VPC connector + SSL)

### Fixes Applied

| Fix | File | Changes |
|-----|------|---------|
| Remove PGSSLMODE | `modules/cloudrun/main.tf` | Removed `PGSSLMODE=require` env block |
| Add Cloud SQL connector to CI | `deploy-to-gcp.yml` | Added `--add-cloudsql-instances` flag |
| Change POSTGRES_HOST in CI | `deploy-to-gcp.yml` | Changed from `10.180.0.3` to `/cloudsql/...` |
| Remove PGSSLMODE from CI | `deploy-to-gcp.yml` | Removed from `--set-env-vars` |

### Key Code Changes

**Terraform (`modules/cloudrun/main.tf`):**

```hcl
# REMOVED - Unix socket doesn't support PostgreSQL SSL
# env {
#   name  = "PGSSLMODE"
#   value = "require"
# }

# Note: PGSSLMODE is NOT set when using Unix socket via Cloud SQL connector
# Unix socket connections are secured by the Cloud SQL Auth Proxy at the transport layer
```

**CI Workflow (`deploy-to-gcp.yml`):**

```yaml
# Before (TCP connection)
--set-env-vars="...,POSTGRES_HOST=10.180.0.3,...,PGSSLMODE=require"

# After (Unix socket via Cloud SQL connector)
--add-cloudsql-instances=${{ secrets.GCP_PROJECT_ID }}:${{ env.GCP_REGION }}:tamshai-prod-postgres \
--set-env-vars="...,POSTGRES_HOST=/cloudsql/${{ secrets.GCP_PROJECT_ID }}:${{ env.GCP_REGION }}:tamshai-prod-postgres,..."
```

### Environment Alignment

| Environment | Connection Method | SSL Config | Impact |
|-------------|-------------------|------------|--------|
| **Dev** | Docker network (`postgres`) | None | ✅ No change |
| **Stage** | Docker network (`postgres`) | None | ✅ No change |
| **Prod (Terraform)** | Unix socket | None (proxy encrypted) | ✅ Fixed |
| **Prod (CI)** | Unix socket | None (proxy encrypted) | ✅ Aligned |

### Security Note

Both connection methods are secure:

- **Unix Socket**: Cloud SQL Auth Proxy encrypts traffic at transport layer
- **TCP + SSL**: PostgreSQL protocol-level encryption

The `ssl_mode=ENCRYPTED_ONLY` setting on Cloud SQL only applies to TCP connections. Unix socket connections via the Cloud SQL connector are inherently secure and bypass this check.

### Lessons Learned

1. **Unix socket ≠ TCP** - They have fundamentally different SSL behaviors
2. **PGSSLMODE only applies to TCP** - Don't set it with Unix socket connections
3. **Keep Terraform and CI aligned** - This was the 5th issue caused by drift
4. **Google recommends Unix socket** for Cloud Run → Cloud SQL connections
