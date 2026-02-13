# CI TypeScript Error Remediation Plan

## 📋 Executive Summary

**GitHub Actions Run**: [21934210542](https://github.com/bunnyfoo/Tamshai-AI-Playground/actions/runs/21934210542)

**Root Cause**: TypeScript error in integration test setup - `process.env.MCP_INTEGRATION_RUNNER_SECRET` is `string | undefined` but URLSearchParams requires `string`

**Impact**:
- ❌ Gateway - Node 20 (Type check failed)
- ❌ Gateway - Node 22 (Type check failed)
- ❌ Docker - Build Check (Build failed due to type error)
- ❌ Container - Trivy Scan (Skipped due to build failure)

---

## 🐛 Error Details

**File**: `services/mcp-gateway/src/__tests__/integration/setup.ts`
**Line**: 348

**Error Message**:

```text
Argument of type '{ grant_type: string; client_id: string;
client_secret: string | undefined; ... }' is not assignable to
parameter of type 'string | Record<string, string> | ...'
```

**Problem Code**:

```typescript
export async function getImpersonatedToken(username: string): Promise<string> {
    const serviceToken = await getServiceAccountToken();

    const response = await axios.post(
        `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            client_id: 'mcp-integration-runner',
            client_secret: process.env.MCP_INTEGRATION_RUNNER_SECRET,  // ❌ string | undefined
            subject_token: serviceToken,
            requested_subject: username,
            audience: 'mcp-gateway',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}
```

---

## ✅ Solution

### Pattern to Follow

The same file already has the correct pattern in `getServiceAccountToken`:

```typescript
async function getServiceAccountToken(): Promise<string> {
    const clientSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
    if (!clientSecret) {
        throw new Error('MCP_INTEGRATION_RUNNER_SECRET environment variable is required for integration tests');
    }

    const response = await axios.post(
        `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
            client_id: 'mcp-integration-runner',
            client_secret: clientSecret,  // ✅ Validated as string
            grant_type: 'client_credentials',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}
```

### Proposed Fix

**Option 1: Add validation (Recommended)**

```typescript
export async function getImpersonatedToken(username: string): Promise<string> {
    const serviceToken = await getServiceAccountToken();

    // Validate client secret is available
    const clientSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
    if (!clientSecret) {
        throw new Error('MCP_INTEGRATION_RUNNER_SECRET environment variable is required for integration tests');
    }

    const response = await axios.post(
        `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            client_id: 'mcp-integration-runner',
            client_secret: clientSecret,  // ✅ Now typed as string
            subject_token: serviceToken,
            requested_subject: username,
            audience: 'mcp-gateway',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}
```

**Option 2: Non-null assertion (Alternative)**

```typescript
client_secret: process.env.MCP_INTEGRATION_RUNNER_SECRET!,
```

**Why Option 1 is Better**:
- Provides clear error message if secret is missing
- Consistent with existing pattern in `getServiceAccountToken`
- Fails fast with actionable error
- Better developer experience

---

## 📝 Implementation Steps

### Step 1: Fix TypeScript Error

1. Edit `services/mcp-gateway/src/__tests__/integration/setup.ts`
2. Add client secret validation to `getImpersonatedToken` function
3. Follow the same pattern as `getServiceAccountToken`

### Step 2: Verify Fix Locally

```bash
cd services/mcp-gateway
npm run typecheck
```

Expected output: ✅ No errors

### Step 3: Commit and Push

```bash
git add services/mcp-gateway/src/__tests__/integration/setup.ts
git commit -m "fix(mcp-gateway): validate client secret in getImpersonatedToken

TypeScript error: URLSearchParams requires all values to be string, but
process.env.MCP_INTEGRATION_RUNNER_SECRET is string | undefined.

Solution:
- Add client secret validation at function start
- Throw clear error if MCP_INTEGRATION_RUNNER_SECRET is not set
- Matches pattern from getServiceAccountToken function

Fixes GitHub Actions runs:
- Gateway - Node 20 type check failure
- Gateway - Node 22 type check failure
- Docker build failure (dependent on type check)
- Trivy scan failure (dependent on build)

Closes #21934210542"

git push
```

### Step 4: Verify CI Passes

- Monitor GitHub Actions run
- Verify Gateway - Node 20 ✅
- Verify Gateway - Node 22 ✅
- Verify Docker - Build Check ✅
- Verify Container - Trivy Scan ✅

---

## 🎯 Success Criteria

- [ ] TypeScript type check passes locally
- [ ] GitHub Actions Gateway - Node 20 job passes
- [ ] GitHub Actions Gateway - Node 22 job passes
- [ ] Docker build completes successfully
- [ ] Trivy container scan completes
- [ ] No regression in other tests

---

## 🔍 Root Cause Analysis

**Why Did This Happen?**

TypeScript's type system correctly identified that `process.env` values are `string | undefined`. The `URLSearchParams` constructor requires all values to be `string`, not `string | undefined`.

**Why Wasn't This Caught Earlier?**

This code was likely written before TypeScript's stricter checks, or the `@types/node` definitions were updated to be more precise about environment variable types.

**Preventive Measures**:
1. ✅ TypeScript strict mode is already enabled
2. ✅ CI runs type checks on all pushes
3. 💡 Consider adding a utility function for required env vars:

   ```typescript
   function requireEnv(key: string): string {
       const value = process.env[key];
       if (!value) {
           throw new Error(`${key} environment variable is required`);
       }
       return value;
   }

   // Usage:
   client_secret: requireEnv('MCP_INTEGRATION_RUNNER_SECRET')
   ```

---

## 📊 Impact Assessment

**Severity**: HIGH (Blocks CI pipeline)
**Effort**: LOW (5-minute fix)
**Risk**: LOW (Isolated to test setup, clear fix)

**Affected Areas**:
- Integration test setup only
- No production code impact
- No changes to test logic

---

## 🚀 Quick Fix Command

```bash
# Navigate to file
cd services/mcp-gateway/src/__tests__/integration

# Apply fix (manual edit required)
# Add validation at line 344 (after serviceToken assignment)

# Verify
cd ../../../..
npm run typecheck

# Commit
git add .
git commit -m "fix(mcp-gateway): validate client secret in getImpersonatedToken"
git push
```

---

**Created**: 2026-02-12
**Status**: Ready for Implementation
**Estimated Time**: 5 minutes
