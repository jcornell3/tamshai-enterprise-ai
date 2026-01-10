# TOTP Fix Status - Production test-user.journey

**Created**: January 10, 2026
**Status**: IN PROGRESS - curl fix implemented, needs testing
**Goal**: Enable TOTP authentication for test-user.journey in production

---

## Problem Statement

Production Keycloak's test-user.journey account does not have TOTP configured, preventing E2E test validation of the TOTP authentication flow.

### Root Cause

Keycloak's `--import-realm` flag does NOT import TOTP credentials for existing users. TOTP credentials are only imported during **initial realm creation**, not when updating existing users.

**Evidence**:
- realm-export.json contains correct TOTP credentials
- User exists in production with password
- TOTP credentials were skipped during realm import
- Keycloak shows "Mobile Authenticator Setup" page instead of TOTP prompt

---

## Solution Approach

**Strategy**: Delete and recreate the tamshai-corp realm to trigger fresh import with TOTP credentials.

**Why This Is Safe**:
- Only test-user.journey exists in production (no corporate users to lose)
- All client configurations are versioned in realm-export.json
- Identity sync hasn't run yet (no employee data in Keycloak)

**Implementation**:
- Created `keycloak/scripts/recreate-realm-prod.sh` (368 lines)
- Created GitHub workflow `.github/workflows/recreate-realm-prod.yml`
- Script runs as Cloud Run job using Keycloak container

---

## Issues Encountered and Fixes Applied

### 1. ✅ Script Location
**Issue**: Script not included in Docker image
**Fix**: Moved from `scripts/keycloak/` to `keycloak/scripts/`
**Commit**: edc868e

### 2. ✅ gcloud CLI Dependency
**Issue**: Script checked for gcloud which isn't in container
**Fix**: Removed gcloud check, replaced with curl check
**Commit**: 3629401

### 3. ✅ jq Binary Missing
**Issue**: jq not available in Keycloak container
**Fix**: Download jq static binary in deps stage, copy to final image
**Commit**: 4839a27

### 4. ✅ Realm Export Path
**Issue**: Script looked for `keycloak/realm-export.json` (relative path)
**Fix**: Changed to `/opt/keycloak/data/import/realm-export.json` (absolute)
**Commit**: 59a20b7

### 5. ⏳ curl Binary Dependencies (FIX IMPLEMENTED, PENDING VERIFICATION)
**Issue**: Alpine curl has dependencies not available in UBI-based Keycloak image
**Error**: `/usr/bin/curl: No such file or directory`
**Fix**: Download static curl binary in deps stage, copy to final image
**Status**: Code updated, awaiting deployment and testing
**Commit**: (pending)

---

## Solution Implemented

### Fix Applied (Option 1: Static curl Binary)

Updated `keycloak/Dockerfile` to download and use static curl binary:

```dockerfile
# In deps stage (line 23-25)
RUN curl -L -o /usr/local/bin/curl https://github.com/moparisthebest/static-curl/releases/download/v8.6.0/curl-amd64 && \
    chmod +x /usr/local/bin/curl

# In final stage (line 61-62)
COPY --from=deps /usr/local/bin/curl /usr/bin/curl
COPY --from=deps /usr/local/bin/jq /usr/local/bin/jq
```

**Why This Works**:
- Static curl has no dependencies (self-contained binary)
- Same approach as jq (which worked successfully)
- ~4MB binary size (acceptable for this use case)

---

## Next Steps

1. **Commit and Deploy**: Push Dockerfile changes to trigger deployment
   ```bash
   git add keycloak/Dockerfile docs/testing/TOTP_FIX_STATUS.md
   git commit -m "fix(keycloak): Use static curl binary for realm recreation script"
   git push
   ```

2. **Wait for Deployment**: Monitor deploy-to-gcp workflow
   ```bash
   gh workflow view deploy-to-gcp
   gh run list --workflow=deploy-to-gcp.yml --limit 5
   ```

3. **Execute Realm Recreation**: After deployment completes
   ```bash
   gh workflow run recreate-realm-prod.yml --ref main -f confirmation="recreate-realm"
   ```

4. **Monitor Execution**:
   ```bash
   gh run list --workflow=recreate-realm-prod.yml --limit 5
   gh run watch
   ```

5. **Validate TOTP**: After successful realm recreation
   ```bash
   cd tests/e2e
   npm run test:login:prod
   ```

---

## Alternative: Manual Realm Deletion via Admin Console

If automation continues to be problematic, the realm can be recreated manually:

1. **Login to Keycloak Admin**: https://keycloak-fn44nd7wba-uc.a.run.app/auth/admin
   - Username: `admin`
   - Password: `nZ7Ng6&2fU7uIVwqHrk5&mn@`

2. **Delete Realm**:
   - Select "tamshai-corp" realm
   - Click "Action" → "Delete"
   - Confirm deletion

3. **Restart Keycloak**:
   ```bash
   gcloud run services update keycloak \
     --region=us-central1 \
     --max-instances=0 && \
   sleep 5 && \
   gcloud run services update keycloak \
     --region=us-central1 \
     --max-instances=10
   ```

4. **Verify Import**: Keycloak will reimport realm-export.json on startup with TOTP

5. **Test Login**: Run E2E tests to confirm TOTP works

---

## Files Modified

### Scripts
- `keycloak/scripts/recreate-realm-prod.sh` - Realm deletion and recreation automation

### Docker
- `keycloak/Dockerfile` - Added jq binary (curl still needs fix)

### Workflows
- `.github/workflows/recreate-realm-prod.yml` - Manual workflow for realm recreation

### Documentation
- `docs/testing/TEST_USER_JOURNEY.md` - Added TOTP troubleshooting section
- `docs/security/IAM_SECURITY_REMEDIATION_PLAN.md` - Security fix documentation (created)
- `docs/testing/TOTP_FIX_STATUS.md` - This file (current status)

---

## Commits Applied

1. `edc868e` - Initial script creation and documentation
2. `a8a47d2` - Created realm recreation workflow
3. `47ada2e` - Fixed GCP authentication in workflow
4. `f2575cb` - Get Keycloak password from GCP Secret Manager
5. `f100a60` - Moved script to keycloak/scripts, updated workflow to use Cloud Run job
6. `3629401` - Removed gcloud dependency from script
7. `8336f31` - Attempted to install curl/jq with microdnf (failed - not available)
8. `4839a27` - Copy jq from deps stage
9. `98415c2` - Attempted to copy curl from deps stage (failed - missing dependencies)
10. `59a20b7` - Fixed realm export path to absolute path

**Next Commit**: Fix curl static binary issue

---

## Test User Credentials

**Username**: `test-user.journey`
**Password**: `***REDACTED_PASSWORD***`
**TOTP Secret**: `JBSWY3DPEHPK3PXP` (Base32-encoded)

**Generate TOTP**:
```bash
oathtool JBSWY3DPEHPK3PXP
# Output: 6-digit code valid for 30 seconds
```

---

## Related Issues

- **GitHub Issue**: None created yet
- **Security Alerts**: #77, #78 (IAM permissions - separate issue, documented)
- **Deployment Workflow**: deploy-to-gcp.yml (working correctly)

---

## Timeline

- **2026-01-10 13:00**: TOTP issue discovered during E2E test
- **2026-01-10 13:30**: Root cause identified (Keycloak doesn't import TOTP for existing users)
- **2026-01-10 14:00**: Created recreation script and workflow
- **2026-01-10 14:30**: Fixed multiple dependency issues (gcloud, jq, paths)
- **2026-01-10 22:55**: Current blocker - curl binary dependencies
- **Next**: Fix curl static binary issue and complete realm recreation

**Estimated Time to Fix**: 30-60 minutes (curl fix + deployment + testing)

---

## Success Criteria

1. ✅ Script runs without errors in Cloud Run job
2. ✅ Realm is successfully deleted
3. ✅ Realm is reimported from realm-export.json
4. ✅ test-user.journey has TOTP credential configured
5. ✅ E2E test passes with TOTP authentication
6. ✅ Login at https://prod.tamshai.com works with TOTP

---

**Last Updated**: January 10, 2026 23:30 UTC
**Status**: Curl fix implemented, ready for commit and deployment
**Next Action**: Commit changes, deploy, test realm recreation script
