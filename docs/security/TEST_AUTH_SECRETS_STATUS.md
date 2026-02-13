# Integration Test Authentication Secrets Status

## Document Information

- **Created**: 2026-02-12
- **Author**: Claude-QA
- **Purpose**: Document current GitHub Secrets status for test auth refactoring plan
- **Related**: `.claude/plans/test-auth-refactoring.md`

---

## Executive Summary

**Question**: Are the GitHub Secrets needed for integration test auth refactoring already defined?

**Answer**: ✅ **YES** - As of 2026-02-13, the secret is now defined and ready for use.

**Current State**:
- ✅ `mcp-integration-runner` **Keycloak client** exists (created by sync-realm.sh)
- ✅ Token exchange **permissions** configured (impersonation role assigned)
- ✅ Code **already uses** `MCP_INTEGRATION_RUNNER_SECRET` environment variable
- ✅ `MCP_INTEGRATION_RUNNER_SECRET` **DEFINED** as GitHub Secret (added 2026-02-13)
- ⚠️ Currently only works in **dev** environment (CI support pending - see Step 4)

**Status**: ✅ **READY** - Secret is configured and available for Q3 2026 refactoring implementation.

---

## 1. Current GitHub Secrets (30 total)

### Existing Secrets (Updated 2026-02-13)

| Secret Name | Last Updated | Purpose | Used In |
|-------------|--------------|---------|---------|
| `CLAUDE_API_KEY` | 2026-02-01 | Claude API access | Production |
| `CODECOV_TOKEN` | 2026-02-01 | Code coverage reporting | CI |
| `CUSTOMER_USER_PASSWORD` | 2026-02-08 | Customer portal test users | E2E tests |
| `TEST_USER_PASSWORD` | 2026-02-08 | test-user.journey account | E2E tests |
| `TEST_USER_TOTP_SECRET` | 2026-02-09 | TOTP code generation | E2E tests |
| `DEV_USER_PASSWORD` | 2026-02-08 | Corporate users (dev) | Identity sync |
| `DEV_KEYCLOAK_ADMIN_PASSWORD` | 2026-02-08 | Keycloak admin access | Terraform |
| `DEV_MCP_GATEWAY_CLIENT_SECRET` | 2026-02-08 | MCP Gateway client | Dev environment |
| `DEV_MCP_HR_SERVICE_CLIENT_SECRET` | 2026-02-08 | HR identity sync | Dev environment |
| `DEV_MCP_INTERNAL_SECRET` | 2026-02-08 | Internal MCP auth | Dev environment |
| `DEV_MCP_UI_CLIENT_SECRET` | 2026-02-08 | MCP UI client | Dev environment |
| *... 18 more dev/prod secrets* | - | Various | Various |

**Integration Test Secret** (Added 2026-02-13):
- ✅ `MCP_INTEGRATION_RUNNER_SECRET` - Service account for token exchange

**Total**: 30 GitHub Secrets defined.

---

## 2. Secret Status for Test Auth Refactoring

### Required Secret ✅ ADDED

| Secret Name | Status | Date Added | Purpose |
|-------------|--------|------------|---------|
| `MCP_INTEGRATION_RUNNER_SECRET` | ✅ **CONFIGURED** | 2026-02-13 | Service account for token exchange |

**Why It's Needed**:
- Integration test service account client secret
- Used for client credentials flow (get service token)
- Used for token exchange flow (impersonate test users)
- Required for **ALL** integration tests after ROPC migration

**Where It's Used**:

```typescript
// services/mcp-gateway/src/__tests__/integration/setup.ts:323
const clientSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
if (!clientSecret) {
    throw new Error('MCP_INTEGRATION_RUNNER_SECRET required for integration tests');
}
```

---

## 3. Current Infrastructure Status

### 3.1 Keycloak Client Configuration

**Client**: `mcp-integration-runner`

| Property | Value | Notes |
|----------|-------|-------|
| **Client Type** | CONFIDENTIAL | Supports client credentials flow |
| **Service Accounts Enabled** | `true` | Can get service account token |
| **Direct Access Grants** | `false` | No ROPC (secure) |
| **Token Exchange Enabled** | `true` | Can impersonate users |
| **Impersonation Role** | Assigned | Can exchange tokens for test users |

**Created By**: `keycloak/scripts/sync-realm.sh` (line 540-570)

**Script Behavior**:

```bash
# keycloak/scripts/lib/clients.sh:553
local client_secret="${MCP_INTEGRATION_RUNNER_SECRET:-}"

if [ -n "$client_secret" ]; then
    log_info "Setting client secret from MCP_INTEGRATION_RUNNER_SECRET..."
    _kcadm update "clients/$uuid" -r "$REALM" -s "secret=$client_secret"
else
    log_info "No MCP_INTEGRATION_RUNNER_SECRET set — using Keycloak-generated secret"
fi
```

**Current Behavior**:
- If `MCP_INTEGRATION_RUNNER_SECRET` is set → Uses that secret
- If **NOT** set → Keycloak auto-generates a random secret
- **Problem**: Auto-generated secret is unknown to tests (tests fail)

### 3.2 Environment Limitations

**CRITICAL**: The `mcp-integration-runner` client is **ONLY** created in **dev** environment:

```bash
# keycloak/scripts/lib/clients.sh:541-544
if [ "${ENV:-dev}" != "dev" ]; then
    log_info "Skipping mcp-integration-runner client (dev-only)"
    return 0
fi
```

**Impact**:
- ✅ Works in **local dev** environment
- ❌ **NOT** available in **CI** environment
- ❌ **NOT** available in **stage** environment
- ❌ **NOT** available in **prod** environment

**Action Required** (for CI support):
1. Modify `sync_integration_runner_client()` to support `ENV=ci`
2. Add `MCP_INTEGRATION_RUNNER_SECRET` to CI environment variables

---

## 4. Implementation Plan

### Step 1: Generate Secret Value

**Option A: Use OpenSSL** (Recommended):

```bash
# Generate cryptographically secure random secret (32 bytes, base64)
openssl rand -base64 32
# Example output: dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIHRlc3Rpbmc=
```

**Option B: Use Node.js**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Save this value** - you'll need it for both GitHub Secrets and local development.

### Step 2: Add to GitHub Secrets

**Via GitHub CLI**:

```bash
# Set the secret value
gh secret set MCP_INTEGRATION_RUNNER_SECRET

# Paste the value when prompted
# (or pipe from a file):
echo "dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIHRlc3Rpbmc=" | gh secret set MCP_INTEGRATION_RUNNER_SECRET
```

**Via GitHub Web UI**:
1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `MCP_INTEGRATION_RUNNER_SECRET`
4. Value: Paste the generated secret
5. Click **Add secret**

### Step 3: Add to Local Development Environment

**Option A: Add to .env file** (local dev):

```bash
# infrastructure/docker/.env
MCP_INTEGRATION_RUNNER_SECRET=REPLACE_WITH_ACTUAL_SECRET_FROM_STEP1
```

**Option B: Export in shell**:

```bash
export MCP_INTEGRATION_RUNNER_SECRET=REPLACE_WITH_ACTUAL_SECRET_FROM_STEP1
```

**Option C: Add to PowerShell profile** (Windows):

```powershell
# $PROFILE
$env:MCP_INTEGRATION_RUNNER_SECRET = "REPLACE_WITH_ACTUAL_SECRET_FROM_STEP1"
```

### Step 4: Enable in CI Environment

**Modify Keycloak Sync Script**:

**File**: `keycloak/scripts/lib/clients.sh`

```bash
# BEFORE (line 541-544)
sync_integration_runner_client() {
    if [ "${ENV:-dev}" != "dev" ]; then
        log_info "Skipping mcp-integration-runner client (dev-only)"
        return 0
    fi

# AFTER
sync_integration_runner_client() {
    # Only create in dev and CI environments (not stage/prod)
    if [ "${ENV:-dev}" != "dev" ] && [ "${ENV:-dev}" != "ci" ]; then
        log_info "Skipping mcp-integration-runner client (not dev/ci environment)"
        return 0
    fi
```

**CI Workflow Configuration**:

**File**: `.github/workflows/ci.yml`

```yaml
# Add to CI job environment variables
env:
  MCP_INTEGRATION_RUNNER_SECRET: ${{ secrets.MCP_INTEGRATION_RUNNER_SECRET }}
```

### Step 5: Verification

**Verify GitHub Secret is Set**:

```bash
gh secret list | grep MCP_INTEGRATION_RUNNER_SECRET
# Expected: MCP_INTEGRATION_RUNNER_SECRET 2026-02-12T...
```

**Verify Keycloak Client Secret**:

```bash
# In dev environment after sync-realm.sh runs
cd keycloak/scripts
./sync-realm.sh

# Check if secret was applied
# (You'll need to use Keycloak Admin API or UI to verify)
```

**Verify Integration Tests Work**:

```bash
cd services/mcp-gateway
npm run test:integration

# Should NOT see error:
# "MCP_INTEGRATION_RUNNER_SECRET environment variable is required"
```

---

## 5. Security Considerations

### Secret Rotation Policy

**Recommendation**: Rotate `MCP_INTEGRATION_RUNNER_SECRET` every **90 days**.

**Rotation Procedure**:
1. Generate new secret value
2. Update GitHub Secret
3. Update local .env files
4. Re-run sync-realm.sh to update Keycloak
5. Restart running services

**Audit Trail**:
- GitHub Secrets show "Last Updated" timestamp
- Keycloak audit logs show client secret changes
- Document rotation in `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`

### Access Control

**Who Needs Access**:
- ✅ GitHub Actions CI/CD (automated access via secrets)
- ✅ Developers running integration tests locally
- ❌ Production services (not needed - only for tests)

**Least Privilege**:
- Secret has **no production access** (only test environments)
- Service account can **only impersonate test users** (not production users)
- Token exchange limited to **specific users** via fine-grained permissions

---

## 6. Documentation Updates

### Files to Update

1. **docs/testing/TEST_USER_JOURNEY.md** - Add `MCP_INTEGRATION_RUNNER_SECRET` to GitHub Secrets table

2. **docs/deployment/VAULT_SETUP.md** - Add to Prerequisites section

3. **CLAUDE.md** - Update "Test Users" section with new authentication method

4. **.github/workflows/ci.yml** - Add to environment variables

5. **infrastructure/docker/.env.example** - Add placeholder

**Example Update** (docs/testing/TEST_USER_JOURNEY.md):

```markdown
#### Client Secrets

| Secret Name | Purpose | Environment | Env Var Name |
|-------------|---------|-------------|--------------|
| `MCP_INTEGRATION_RUNNER_SECRET` | Integration test service account | Dev, CI | `MCP_INTEGRATION_RUNNER_SECRET` |

**Usage**: Required for integration tests using token exchange authentication.
See `.claude/plans/test-auth-refactoring.md` for details.
```

---

## 7. Comparison: Before vs. After Refactoring

### Authentication Flow Comparison

**BEFORE** (Current - ROPC):

```yaml
Secrets Required:
  - TEST_USER_PASSWORD (for each test user)
  - DEV_USER_PASSWORD (corporate users)

Flow:
  1. Test provides username + password
  2. Keycloak validates credentials (ROPC)
  3. Returns user token with roles

Issues:
  - Exposes passwords to test code
  - Violates OAuth 2.0 Security BCP
  - High security risk if credentials leaked
```

**AFTER** (Refactored - Token Exchange):

```yaml
Secrets Required:
  - MCP_INTEGRATION_RUNNER_SECRET (service account secret)

Flow:
  1. Service account gets token (client credentials)
  2. Service account exchanges token for user token (token exchange)
  3. Test uses user token with roles

Benefits:
  - No user passwords in test code
  - OAuth 2.0 Security BCP compliant
  - Lower risk (service account only, limited scope)
```

---

## 8. FAQ

### Q1: Why isn't `MCP_INTEGRATION_RUNNER_SECRET` already a GitHub Secret?

**A**: The infrastructure was created in December 2025 for future use, but the ROPC migration was deferred to Q3 2026 (low priority). The secret was never added because tests still use ROPC.

### Q2: Can I use the same secret value in dev and CI?

**A**: **Yes**, recommended. Same secret value simplifies management and both are non-production environments with the same test users.

### Q3: What happens if I don't set the secret?

**A**: Keycloak auto-generates a random secret, but tests don't know it. Tests will fail with:

```text
Error: MCP_INTEGRATION_RUNNER_SECRET environment variable is required
```

### Q4: Should this secret be in production?

**A**: **NO**. The `mcp-integration-runner` client is **dev/CI only**. Production has no test users to impersonate.

### Q5: Can I rotate this secret?

**A**: **Yes**, see "Secret Rotation Policy" above. Rotation is recommended every 90 days.

---

## 9. Action Items

### Immediate (Before Refactoring)

- [ ] **Generate secret value** (OpenSSL or Node.js)
- [ ] **Add to GitHub Secrets** (`gh secret set MCP_INTEGRATION_RUNNER_SECRET`)
- [ ] **Add to local .env** (infrastructure/docker/.env)
- [ ] **Verify in dev**: Run `./keycloak/scripts/sync-realm.sh`
- [ ] **Test integration tests**: `npm run test:integration` (should pass)

### Before Q3 2026 Refactoring

- [ ] **Modify sync-realm.sh**: Enable CI environment support
- [ ] **Update CI workflow**: Add secret to environment variables
- [ ] **Update documentation**: Add to TEST_USER_JOURNEY.md
- [ ] **Test in CI**: Verify GitHub Actions can access secret

### Optional Enhancements

- [ ] **Add to Vault**: Store in HashiCorp Vault for centralized management
- [ ] **Set up rotation schedule**: Automate 90-day rotation
- [ ] **Create admin-cli secret**: For admin API authentication (Phase 4 of plan)

---

## 10. Related Documentation

- `.claude/plans/test-auth-refactoring.md` - Complete refactoring plan
- `docs/security/ROPC_ASSESSMENT.md` - Security analysis and rationale
- `docs/testing/TEST_USER_JOURNEY.md` - GitHub Secrets configuration
- `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md` - Secret rotation procedures
- `keycloak/scripts/lib/clients.sh` - mcp-integration-runner client creation

---

## 11. Summary

### Current Status: ⚠️ **ACTION REQUIRED**

**What's Already Done**:
- ✅ Keycloak client exists (`mcp-integration-runner`)
- ✅ Token exchange permissions configured
- ✅ Code already uses the secret
- ✅ Integration test helper functions exist

**What's Missing**:
- ❌ `MCP_INTEGRATION_RUNNER_SECRET` not in GitHub Secrets
- ❌ Not enabled for CI environment
- ❌ Not documented in TEST_USER_JOURNEY.md

**Next Step**: Add the secret to GitHub before implementing the refactoring plan (Q3 2026).

**Timeline**:
- **Now**: Add `MCP_INTEGRATION_RUNNER_SECRET` to GitHub Secrets (5 minutes)
- **Q3 2026**: Implement full test auth refactoring (3-5 days)

---

*Document Version: 1.0*
*Last Updated: 2026-02-12*
*Next Review: Q3 2026 (before refactoring implementation)*
