# Phoenix Rebuild v15 — Run Log

**Date**: January 27, 2026
**Operator**: Claude (automated)
**Manual Actions**: 0 (fully automated after Bug #9 fix)
**Outcome**: SUCCESS (6/6 E2E tests passed)
**Script Version**: phoenix-rebuild.sh (post-Bug #9 fix)

## Summary

Phoenix rebuild v15 was a two-part run:
1. **v15a**: Initial run — failed at Phase 7 Stage 1 due to Bug #9 (domain mapping "doesn't support update")
2. **v15b**: Resumed from Phase 7 after fixing Bug #9 — completed successfully

## Bug Found: Bug #9 — Domain Mapping Update Error

**Severity**: BLOCKING (script exits at Phase 7)
**Root Cause**: `google_cloud_run_domain_mapping` has NO update function in the Google Terraform provider. When stale domain mappings (persisting from previous deployments) are imported into fresh Terraform state, Terraform detects drift in provider-managed attributes (`terraform_labels`, `goog-terraform-provisioned`) and attempts an in-place update, which fails with:

```
Error: doesn't support update
  with module.cloudrun.google_cloud_run_domain_mapping.keycloak[0],
  on ..\modules\cloudrun\main.tf line 569
Error: doesn't support update
  with module.cloudrun.google_cloud_run_domain_mapping.web_portal[0],
  on ..\modules\cloudrun\main.tf line 636
```

Despite `lifecycle { ignore_changes = [metadata, spec] }`, the `terraform_labels` attribute (added by the Google provider automatically) is NOT covered by `ignore_changes` and triggers the update attempt.

**Fix Applied**:
- `phoenix-rebuild.sh`: Replaced domain mapping import logic with delete-then-recreate pattern
- `evacuate-region.sh`: Added same delete-then-recreate pattern for DR retry scenarios
- Stage 3 error recovery: Added "doesn't support update" detection alongside existing 409 handling

## Phase Timeline (v15b — resumed from Phase 7)

| Phase | Name | Duration | Result | Notes |
|-------|------|----------|--------|-------|
| 7 | Cloud Run Services | ~20 min | PASS | Bug #9 fix: deleted 3 stale domain mappings, fresh creation worked |
| 7.1 | Stage 1 | ~2 min | PASS | 2 to add, 0 to change (keycloak + web-portal domain mappings) |
| 7.2 | Stage 2 (SSL wait) | ~1 sec | PASS | auth.tamshai.com SSL immediately ready (cached from v15a) |
| 7.3 | Stage 3 (mcp-gateway) | ~1 min | PASS | Full apply completed successfully |
| 7.4 | SSL verification | ~15 min | WARN | api.tamshai.com SSL timed out (525 for >15 min), non-blocking |
| 8 | Deploy Services | ~5 min | PASS | All 8 deploy jobs + sync-keycloak-realm |
| 9 | Configure TOTP | ~1 min | PASS | test-user.journey TOTP configured via user update method |
| 10 | Provision & Verify | ~10 min | PASS | Users provisioned, data loaded, 6/6 E2E passed |

### Phase 7 Detail — Bug #9 Fix Verified

```
[STEP] Cleaning up stale domain mappings (Bug #9 fix)...
[INFO] Found existing keycloak domain mapping (auth.tamshai.com) - deleting for clean recreate...
[INFO] Found existing web-portal domain mapping (app.tamshai.com) - deleting for clean recreate...
[INFO] Found existing mcp-gateway domain mapping (api.tamshai.com) - deleting for clean recreate...
...
Plan: 2 to add, 0 to change, 0 to destroy.  ← Fresh creation, no update!
[SUCCESS] Stage 1 complete - Keycloak and MCP Suite deployed
```

### Phase 8 Detail — All Deploy Jobs

| Job | Duration | Status |
|-----|----------|--------|
| deploy-static-website | 35s | PASS |
| deploy-mcp-mongodb (mcp-sales) | 1m8s | PASS |
| deploy-mcp-mongodb (mcp-support) | 1m5s | PASS |
| deploy-mcp-postgres (mcp-finance) | 1m5s | PASS |
| deploy-mcp-postgres (mcp-hr) | 1m11s | PASS |
| deploy-web-portal | ~1m30s | PASS |
| deploy-gateway | 1m38s | PASS |
| deploy-keycloak | 1m36s | PASS |
| sync-keycloak-realm | ~30s | PASS |

### Phase 10 Detail — Provisioning & E2E

| Step | Duration | Status |
|------|----------|--------|
| provision-prod-users | 3m40s + 31s verify | PASS |
| provision-prod-data (Support) | 56s | PASS |
| provision-prod-data (Sales) | 53s | PASS |
| provision-prod-data (Finance) | 1m48s | PASS |
| E2E Login Journey (6 tests) | 30.6s | PASS |

### E2E Test Results

```
Running 6 tests using 1 worker

  ok 1 › should display employee login page with SSO button (4.0s)
  ok 2 › should redirect to Keycloak when clicking SSO (3.6s)
  ok 3 › should complete full login journey with credentials (12.7s)
  ok 4 › should handle invalid credentials gracefully (2.0s)
  ok 5 › should load portal without JavaScript errors (937ms)
  ok 6 › should not have 404 errors for assets (939ms)

  6 passed (30.6s)
```

## Observations (Non-blocking)

1. **api.tamshai.com SSL provisioning**: Took >15 min (timed out during Phase 7 verification). This is known GCP behavior for new domain mappings — the certificate provisioning can take 15-20 min. The script correctly proceeds with a warning. By the time E2E tests ran in Phase 10, SSL was working.

2. **Phase 10 quick health check**: Shows MCP suite services (mcp-hr, mcp-finance, mcp-sales, mcp-support) and Keycloak as "unhealthy". This is expected — the quick health check uses unauthenticated HTTP calls, but MCP services require Cloud Run IAM authentication. Phase 8 correctly verified them via `gcloud run services describe` (which checks auth-protected readiness).

3. **Phase 10 re-fetches GitHub secrets**: Despite being loaded in Phase 1 (pre-flight), Phase 10 re-fetches them. This is redundant but harmless — ensures secrets are available even when resuming from Phase 10 directly.

## Files Modified (Bug #9 Fix)

| File | Change |
|------|--------|
| `scripts/gcp/phoenix-rebuild.sh` | Replaced domain mapping import with delete-then-recreate; updated Stage 3 error recovery to handle "doesn't support update"; updated domain mapping verification to check all 3 domains |
| `scripts/gcp/evacuate-region.sh` | Added domain mapping cleanup before staged deployment for DR retry resilience |
