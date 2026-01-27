# Phoenix Rebuild v13 - Manual Actions Log

**Date**: January 26, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v12 post-rebuild fixes (secret fetching, E2E loading, workflow detection)
**Previous Rebuild**: v12 (January 26, 2026)
**Constraint**: Zero manual actions — script only, no operator GCP writes

## Pre-Rebuild Issues Fixed

These issues were identified during v12 and fixed in commit `d3d07c88` prior to this rebuild:

| Issue | Root Cause | Fix | File(s) |
|-------|-----------|-----|---------|
| PROD_USER_PASSWORD not fetched | GitHub Secret not available locally; `sync_prod_user_password()` expects env var | Added `read-github-secrets.sh --phoenix` fetch in Phase 10; added PROD_USER_PASSWORD to `export-test-secrets.yml` phoenix type | `phoenix-rebuild.sh`, `evacuate-region.sh`, `export-test-secrets.yml` |
| E2E tests fail silently | No test secrets loaded; `2>/dev/null` suppressed output | Added secret fetch via `read-github-secrets.sh --phoenix`; removed `2>/dev/null` | `phoenix-rebuild.sh`, `evacuate-region.sh` |
| Workflow detection "not found" | `gh workflow list` returns display names; grep for filename never matches | Replaced `gh workflow list \| grep` with `gh workflow view <filename>` | `secrets.sh` |

## Pre-Rebuild Checklist

- [x] PROD_USER_PASSWORD fetch fix committed (commit `d3d07c88`)
- [x] E2E secret loading fix committed
- [x] Workflow detection fix committed
- [x] DR script (evacuate-region.sh) updated with same fixes
- [x] Runbook updated to v3.6.0
- [x] Pre-flight checks passed (18/18, 0 failures, 21 warnings)
- [x] PROD_USER_PASSWORD available (via read-github-secrets.sh --phoenix)

## Expected Improvements from v12

| Issue | v12 Status | v13 Fix | v13 Expectation | v13 Result |
|-------|-----------|---------|-----------------|------------|
| PROD_USER_PASSWORD fetch | FAIL — not fetched from GitHub | `read-github-secrets.sh --phoenix` in Phase 10 | Fetched automatically, sync succeeds | **PASS** — "Phoenix secrets loaded into environment", "PROD_USER_PASSWORD found in environment" |
| E2E secret loading | FAIL — no secrets, output suppressed | Secrets loaded via --phoenix, no 2>/dev/null | E2E tests run with proper output | **PASS** — secrets loaded, Playwright output visible |
| Workflow detection | FAIL — display name vs filename | `gh workflow view <filename>` | Workflow found on first check | **PASS** — no "not found" warnings |
| #103 VPC peering stale reference | PARTIAL — compute API fallback needed | Compute API fallback already existed in script | May stall at 20 retries, then auto-fallback | **PASS** — service API exhausted 20 retries, compute API fallback deleted peering automatically |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| ~21:00 | 1-2 | Pre-flight + Secret verification | PASS | ~2 min |
| ~21:02 | 3 | Pre-destroy cleanup + Terraform destroy | PASS (0 manual actions) | ~15 min |
| ~21:17 | 4 | Terraform apply (infrastructure) | PASS | ~15 min |
| ~21:32 | 5 | Build container images | PASS | ~10 min |
| ~21:42 | 6 | Regenerate SA key | PASS | ~1 min |
| ~21:43 | 7 | Terraform Cloud Run (Stage 1-3) | PASS | ~20 min |
| ~22:03 | 8 | Deploy via GitHub Actions | PASS | ~8 min |
| ~22:11 | 9 | Configure TOTP | PASS | ~2 min |
| ~22:13 | 10 | Provision & Verify | PASS (workflow issues fixed mid-run) | ~10 min |
| ~22:23 | E2E | End-to-End Tests | PASS (6/6, 25.2s) | ~1 min |

**v13 Total Duration**: ~85 min
**Manual Actions**: **0** (constraint met: script only, no operator GCP writes)
**In-Flight Fixes**: **3** (workflow bugs discovered and fixed during rebuild)

---

## Phase 1-2: Pre-flight Checks & Secret Verification

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- All 18 prerequisite checks passed, 0 failures, 21 warnings (expected for clean rebuild)
- PROD_USER_PASSWORD pre-flight check: set in environment (no warning triggered)
- GitHub secrets accessible
- GCP authentication successful (claude-deployer service account)
- All 6 GCP Secret Manager secrets verified and clean

**Manual Actions Required**: None

---

## Phase 3: Pre-destroy Cleanup + Terraform Destroy

**Duration**: ~15 minutes

**Result**: PASS (0 manual actions)

**Pre-destroy Cleanup**:
- Cloud Run jobs deleted (Gap #21)
- 7 Cloud Run services deleted
- Cloud SQL deletion protection disabled (Gap #22)
- Storage buckets emptied
- Cloud SQL instance deleted successfully
- 6 Cloud SQL resources removed from Terraform state
- VPC connector `tamshai-prod-conn` found and deleted (Issue #103)
- VPC connector firewall rules cleaned up (Issue #103)
- VPC connector removed from Terraform state

**Issue #103 Finding — VPC Peering (FULLY AUTOMATED)**:
- Service networking API (`gcloud services vpc-peerings delete`) blocked by `RESOURCE_PREVENTING_DELETE`
- Exhausted 20/20 retries (service API path)
- **Script automatically fell back to compute API**: "Falling back to compute API (force-delete from consumer side)..."
- VPC peering force-deleted via `gcloud compute networks peerings delete`
- Script detected peering was gone and continued
- Private IP addresses cleaned up, Terraform destroy completed

**Key Improvement from v12**: In v12, the compute API fallback required manual operator intervention (1 manual action). In v13, the script's built-in compute API fallback handled it automatically — **zero manual actions**.

**Manual Actions Required**: None

---

## Phase 4: Terraform Apply (Infrastructure)

**Duration**: ~15 minutes (Cloud SQL: ~9m25s)

**Result**: PASS

**Resources Created**:
- VPC (`tamshai-prod-vpc`), subnet, Cloud Router, Cloud NAT
- VPC Access Connector (`tamshai-prod-conn`)
- Service networking connection + private IP range
- Cloud SQL PostgreSQL (`tamshai-prod-postgres`)
- 3 databases: `keycloak`, `tamshai_hr`, `tamshai_finance`
- 2 database users: `keycloak`, `tamshai`
- 8 GCP Secret Manager secrets with versions
- 6 service accounts with IAM bindings
- Artifact Registry (imported, pre-existing)
- Storage buckets
- Utility VM (34.41.147.29)

**Manual Actions Required**: None

---

## Phase 5: Build Container Images

**Duration**: ~10 minutes

**Result**: PASS

**Images Built**:
| Image | Attempt | Status |
|-------|---------|--------|
| mcp-gateway | 1/3 | SUCCESS |
| mcp-hr | 1/3 | SUCCESS |
| mcp-finance | 1/3 | SUCCESS |
| mcp-sales | 1/3 | SUCCESS |
| mcp-support | 1/3 | SUCCESS |
| keycloak (Dockerfile.cloudbuild) | 1/3 | SUCCESS |
| provision-job | 1/3 | SUCCESS |
| web-portal (from repo root) | 1/3 | SUCCESS |

All 8 images built on first attempt and verified in Artifact Registry.

**Manual Actions Required**: None

---

## Phase 6: Regenerate SA Key

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- New SA key created for tamshai-prod-cicd
- GitHub secret `GCP_SA_KEY_PROD` updated
- SA key validated — can access project (Issue #10 fix)

**Manual Actions Required**: None

---

## Phase 7: Terraform Cloud Run (Staged - Issue #37 Fix)

**Duration**: ~20 minutes (SSL wait included)

**Result**: PASS

**Stage 1**: Deployed Keycloak, MCP Suite, web-portal, domain mappings

**Stage 2**: SSL certificate verification
- `auth.tamshai.com` — HTTP 200 (SSL ready)
- `app.tamshai.com` — HTTP 301 (SSL ready)
- `api.tamshai.com` — HTTP 302 (SSL ready)

**Stage 3**: Deployed mcp-gateway after SSL confirmed

**Domain Mappings**:
| Domain | Service | Status |
|--------|---------|--------|
| `auth.tamshai.com` | keycloak | **CREATED** (SSL ready) |
| `app.tamshai.com` | web-portal | **CREATED** (SSL ready) |
| `api.tamshai.com` | mcp-gateway | **CREATED** (SSL ready) |

**Manual Actions Required**: None

---

## Phase 8: Deploy via GitHub Actions

**Duration**: ~8 minutes

**Result**: PASS

**Workflow Jobs**: All deploy jobs completed successfully (keycloak, mcp-gateway, mcp-hr, mcp-finance, mcp-sales, mcp-support, web-portal, static-website, sync-keycloak-realm).

**Manual Actions Required**: None

---

## Phase 9: Configure TOTP

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- test-user.journey TOTP configured via `set-user-totp.sh`
- TOTP secret provisioned from TEST_USER_TOTP_SECRET_RAW

**Manual Actions Required**: None

---

## Phase 10: Provision Users & Verify

**Duration**: ~10 minutes

**Result**: PASS (after in-flight workflow fixes)

**v12 Fix Validation**:
| Step | Result | Notes |
|------|--------|-------|
| Phoenix secrets fetch | **PASS** | "Phoenix secrets loaded into environment" |
| PROD_USER_PASSWORD sync | **PASS** | "PROD_USER_PASSWORD found in environment" — v12 fix validated |
| Identity sync (provision-prod-users) | **PASS** | Workflow triggered and completed (after 2 in-flight fixes) |
| Sample data load (provision-prod-data) | **PASS** | Loaded successfully |
| E2E tests (in-script) | **FAIL** | `'TEST_ENV' is not recognized` — Windows cmd.exe issue (fixed in-flight) |

**In-Flight Issue 1: Provision-prod-users Final Verification curl exit code 3**

The `provision-prod-users.yml` workflow's Final Verification job failed because `${{ env.KEYCLOAK_URL }}` was never defined in the workflow env block. The comment said "discovered dynamically" but no discovery step existed. curl got a URL with no hostname — exit code 3 (URL malformat).

**Fix**: Added `Discover Keycloak URL` step using `gcloud run services describe keycloak --format="value(status.url)"` and set result in `$GITHUB_ENV`. Added guard to skip verification if URL not discovered.

**Commit**: `33ea1dc3`

**In-Flight Issue 2: Cloud Run Job polling — Completed=Unknown treated as failure**

After fix 1, the workflow failed again. Polling logic used `if True... else... (failure)`. When the Cloud Run Job had just started, status was `Completed=Unknown` (not yet determined), which fell into the `else` branch and was treated as failure.

**Fix**: Changed `else` to `elif [ "$CONDITION_STATUS" = "False" ]` so `Unknown` continues the wait loop. Added comment explaining `Unknown = still running`.

**Commit**: `54a71c8b`

**In-Flight Issue 3: E2E test Windows compatibility**

Phoenix rebuild script ran `npm run test:login:prod` which executes `TEST_ENV=prod playwright test...` — Unix-only syntax. On Windows, npm spawns cmd.exe which can't parse `TEST_ENV=prod` prefix.

**Fix**: Replaced with `npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1` directly in the script.

**Commit**: `a09208ed`

**Manual Actions Required**: None (all fixes were script/workflow changes, not GCP writes)

---

## E2E Tests

**Result**: **PASS** (6/6, 25.2s)

After all three in-flight fixes were applied:
```
6 passed (25.2s)
```

All 6 login journey tests passed with proper secrets loaded via `read-github-secrets.sh --phoenix`.

**Blocking Requirement**: ALL 6 tests must pass for rebuild to be considered successful (PHOENIX_RUNBOOK v3.6.0) — **MET**.

---

## Summary

### Manual Actions Count

| Phase | v12 Manual Actions | v13 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | 0 |
| 2. Secret verification | 0 | 0 |
| 3. Pre-destroy cleanup | **1** (VPC peering compute API) | **0** (compute API fallback automated) |
| 4. Terraform apply | 0 | 0 |
| 5. Build images | 0 | 0 |
| 6. Regenerate SA key | 0 | 0 |
| 7. Terraform Cloud Run | 0 | 0 |
| 8. Deploy via GHA | 0 | 0 |
| 9. Configure TOTP | 0 | 0 |
| 10. Verification | 0 | 0 |
| **TOTAL** | **1** | **0** |

### Issues Validated

| Issue | Description | v12 Status | v13 Validation |
|-------|-------------|------------|----------------|
| PROD_USER_PASSWORD fetch | Auto-fetch from GitHub Secrets | FAIL | **PASS** — fetched via read-github-secrets.sh --phoenix |
| E2E secret loading | Load secrets before Playwright | FAIL | **PASS** — secrets loaded, output visible |
| Workflow detection | gh workflow view vs list | FAIL | **PASS** — no "not found" warnings |
| Domain mappings | api/app/auth.tamshai.com | PASS | **PASS** — all 3 created by Terraform |
| #103 | VPC peering stale reference | PARTIAL (manual fallback) | **PASS** — compute API fallback fully automated |
| #36 | Terraform state lock deadlock | PASS | **PASS** — no deadlock |
| #37 | mcp-gateway SSL startup failure | PASS | **PASS** — staged deployment working |

### In-Flight Issues (discovered and fixed during v13)

| Issue | Root Cause | Fix | Commit |
|-------|-----------|-----|--------|
| provision-prod-users Final Verification curl exit 3 | `${{ env.KEYCLOAK_URL }}` never defined in workflow; no discovery step existed | Added `Discover Keycloak URL` step using `gcloud run services describe` | `33ea1dc3` |
| Cloud Run Job polling treats Unknown as failure | Polling `else` branch caught `Completed=Unknown` (job still starting) as failure | Changed to `elif "$CONDITION_STATUS" = "False"` so Unknown continues loop | `54a71c8b` |
| E2E `TEST_ENV=prod` fails on Windows | `npm run test:login:prod` uses Unix-only syntax; cmd.exe can't parse it | Replaced with `npx cross-env TEST_ENV=prod playwright test ...` | `a09208ed` |

### Blocking Requirements (PHOENIX_RUNBOOK v3.6.0)

- [x] **User password provisioning complete** — Corporate users provisioned with known PROD_USER_PASSWORD (auto-fetched from GitHub Secrets)
- [x] **ALL E2E tests pass (6/6)** — 6/6 passed (25.2s)

---

## Deployed Services

### Cloud Run URLs

| Service | URL |
|---------|-----|
| Keycloak | https://keycloak-fn44nd7wba-uc.a.run.app |
| MCP Gateway | https://mcp-gateway-fn44nd7wba-uc.a.run.app |
| MCP HR | https://mcp-hr-fn44nd7wba-uc.a.run.app |
| MCP Finance | https://mcp-finance-fn44nd7wba-uc.a.run.app |
| MCP Sales | https://mcp-sales-fn44nd7wba-uc.a.run.app |
| MCP Support | https://mcp-support-fn44nd7wba-uc.a.run.app |
| Web Portal | https://web-portal-fn44nd7wba-uc.a.run.app |

### Custom Domains

| Domain | Service | v12 Status | v13 Status |
|--------|---------|-----------|-----------|
| https://auth.tamshai.com | Keycloak | CREATED | **CREATED** (SSL ready) |
| https://api.tamshai.com | MCP Gateway | CREATED | **CREATED** (SSL ready) |
| https://app.tamshai.com | Web Portal | CREATED | **CREATED** (SSL ready) |
| https://prod.tamshai.com | Marketing Site (GCS) | EXISTS | **EXISTS** |

### Cloud SQL

- **Instance**: tamshai-prod-postgres
- **Connection Name**: gen-lang-client-0553641830:us-central1:tamshai-prod-postgres

### Utility VM

- **Public IP**: 34.41.147.29

---

**End of Phoenix v13 Log**
*Status: COMPLETE*
*Started: 2026-01-26 ~21:00 UTC*
*Manual Actions: 0*
*E2E Tests: 6/6 PASS (25.2s)*
*In-Flight Fixes: 3 (provision-prod-users KEYCLOAK_URL, polling Unknown, E2E cross-env)*
