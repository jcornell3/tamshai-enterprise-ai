# TOTP Fix Status - Production test-user.journey

**Created**: January 10, 2026
**Resolved**: January 14, 2026
**Status**: ✅ **RESOLVED** - E2E tests passing with TOTP authentication

---

## Problem Statement

Production Keycloak's test-user.journey account TOTP authentication was failing with `NullPointerException`, preventing E2E test validation of the TOTP authentication flow.

### Root Causes Identified

1. **secretData Format Error**: The `secretData` field in realm-export.json contained extra fields (`period`, `digits`, `algorithm`) that Keycloak's `OTPSecretData` class doesn't recognize, causing deserialization to fail and leave `secretData` as NULL.

2. **Keycloak Import Behavior**: The `--import-realm` flag only imports realms on first container startup. Subsequent deployments don't update existing user credentials, including TOTP.

3. **Realm Deletion Approach Failed**: Deleting the realm via Admin API while the container is running does NOT trigger reimport - only a new container revision would trigger `--import-realm` again.

---

## Solution Implemented

### 1. Fixed secretData Format

**Before (BROKEN)**:
```json
{
  "type": "otp",
  "secretData": "{\"value\":\"...\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}",
  "credentialData": "{\"subType\":\"totp\"}"
}
```

**After (CORRECT)**:
```json
{
  "type": "otp",
  "secretData": "{\"value\":\"__TEST_USER_TOTP_SECRET__\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\"}"
}
```

### 2. GitHub Secrets Configuration

| Secret | Purpose |
|--------|---------|
| `TEST_USER_TOTP_SECRET_RAW` | Raw secret for Keycloak realm-export.json |
| `TEST_USER_TOTP_SECRET` | BASE32 secret for E2E tests |

### 3. Removed Realm Deletion from Workflow

The `sync-keycloak-realm` job no longer deletes the realm, as this approach doesn't work:
- Keycloak only imports realms on container startup
- Running containers don't reimport after realm deletion
- New container revisions are needed for fresh imports

### 4. E2E Test Auto-Capture

The E2E test framework now automatically handles TOTP setup:
1. Detects TOTP setup page (if user has no TOTP configured)
2. Clicks "Unable to scan?" to reveal text secret
3. Extracts BASE32 secret from page
4. Generates TOTP code using `oathtool`
5. Completes TOTP setup
6. Saves captured secret to `.totp-secrets/` for future runs

---

## Verification

### Test Results (January 14, 2026)

```bash
cd tests/e2e
TEST_ENV=prod TEST_TOTP_SECRET="$TEST_USER_TOTP_SECRET" \
  npx playwright test login-journey.ui.spec.ts --project=chromium --workers=1
```

**Output**:
```
Running 6 tests using 1 worker

  ok 1 [chromium] › should display employee login page with SSO button (2.7s)
  ok 2 [chromium] › should redirect to Keycloak when clicking SSO (1.4s)
  ok 3 [chromium] › should complete full login journey with credentials (10.9s)
  ok 4 [chromium] › should handle invalid credentials gracefully (1.8s)
  ok 5 [chromium] › should load portal without JavaScript errors (911ms)
  ok 6 [chromium] › should not have 404 errors for assets (886ms)

  6 passed (21.7s)
```

---

## Files Modified

### Configuration
- `keycloak/realm-export.json` - Fixed secretData format, added placeholder

### Workflows
- `.github/workflows/deploy-to-gcp.yml` - Removed realm deletion, improved TOTP injection

### Documentation
- `docs/testing/TEST_USER_JOURNEY.md` - Updated with resolution and new findings
- `docs/testing/TOTP_FIX_STATUS.md` - This file (marked as resolved)

---

## Key Learnings

1. **Keycloak OTPSecretData class** only accepts the `value` field in `secretData`. Other TOTP parameters must be in `credentialData`.

2. **Keycloak --import-realm** runs only at container startup and only if the realm doesn't exist in the database.

3. **Realm deletion via Admin API** doesn't trigger reimport on running containers.

4. **E2E tests should use single worker** (`--workers=1`) when authenticating as the same user to avoid session conflicts.

5. **TOTP secrets must be in raw format for Keycloak** (not BASE32), but E2E tests use BASE32 format with oathtool.

---

## Test User Credentials

| Field | Value |
|-------|-------|
| **Username** | `test-user.journey` |
| **Password** | `[STORED IN GITHUB SECRETS]` (see `TEST_PASSWORD`) |
| **TOTP Secret (BASE32)** | `[STORED IN GITHUB SECRETS]` (see `TEST_USER_TOTP_SECRET`) |
| **TOTP Secret (Raw)** | `[STORED IN GITHUB SECRETS]` (see `TEST_USER_TOTP_SECRET_RAW`) |

**Generate TOTP Code**:
```bash
oathtool --totp --base32 "$TEST_USER_TOTP_SECRET"
# Output: 6-digit code valid for 30 seconds
```

---

## Related Documentation

- [TEST_USER_JOURNEY.md](./TEST_USER_JOURNEY.md) - Complete test user documentation
- [TOTP_SETUP_FIX_PLAN.md](./TOTP_SETUP_FIX_PLAN.md) - Original fix plan (superseded)

---

**Last Updated**: January 14, 2026
**Status**: ✅ **RESOLVED**
**Verified By**: E2E tests passing on production
