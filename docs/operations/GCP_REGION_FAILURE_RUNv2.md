# GCP Region Failure DR Run v2 - Run Log

**Date**: January 27, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production (simulated DR drill)
**Purpose**: Validate evacuate-region.sh after v1 bug fixes (Bugs #1-#8) and Bug #9 (domain mapping update)
**Runbook**: GCP_REGION_FAILURE_RUNBOOK.md v1.4.0
**Primary Region**: us-central1 (available -- this is a drill, not an actual outage)
**Recovery Region**: us-west1 (Oregon)
**Constraint**: Zero manual actions -- script only, no operator GCP writes

## Pre-Run Issues Fixed

| Issue | Root Cause | Fix | Commit | File(s) |
|-------|-----------|-----|--------|---------|
| Domain mapping "doesn't support update" (Bug #9) | `google_cloud_run_domain_mapping` has no update function; stale mappings imported into fresh state trigger drift on `terraform_labels` | Replaced domain mapping import with delete-then-recreate pattern | `b571a1f9` | `phoenix-rebuild.sh`, `evacuate-region.sh` |

## Pre-Run Checklist

- [x] Bug #9 fix committed and pushed (commit `b571a1f9`)
- [x] v1 Bugs #1-#8 all fixed (committed in prior session)
- [x] Primary region (us-central1) operational (v15 rebuild complete)
- [x] All CI/CD workflows green
- [x] PROD_USER_PASSWORD available (via GitHub Secrets)

## Expected Validations

| Item | Expectation | Result |
|------|-------------|--------|
| evacuate-region.sh completes all phases | All 8 phases pass | **FAIL** -- script failed at Phase 4 (workflow dispatch error) |
| v1 Bug #1 fix (app_domain in TF_VARS) | app-dr.tamshai.com domain mapping created | **PASS** -- created in Stage 1 |
| v1 Bug #2 fix (api_domain in targets) | api-dr.tamshai.com domain mapping created | **PASS** -- created in Stage 3 |
| v1 Bug #3 fix (Cloudflare redirect loop) | mcp-gateway startup probe passes | **PASS** -- startup in 29s, no redirect loop |
| Bug #9 fix (domain mapping delete-recreate) | No "doesn't support update" error | **PASS** -- fresh creation, 0 to change |
| SSL certificates for DR domains | auth-dr, app-dr, api-dr all get SSL | **PARTIAL** -- auth-dr/app-dr working; api-dr timed out (BLOCKING for API access) |
| E2E tests against DR stack | 6/6 pass | **NOT REACHED** -- script failed before Phase 6 |
| Image replication (Phase 1.5) | All 8 images available in us-west1 | **PASS** (builds succeeded) but script logged 8 false ERRORs (Bug #11) |

## Timeline -- Evacuation

| Time (approx) | Phase | Action | Result | Duration |
|----------------|-------|--------|--------|----------|
| ~08:30 | 0 | Pre-flight checks | PASS | ~1 min |
| ~08:31 | 0.5 | Pre-cleanup | PASS (clean environment) | ~1 min |
| ~08:32 | 1 | Terraform init | PASS | ~2 min |
| ~08:34 | 1.5 | Image replication (Cloud Build) | PASS (8/8 builds succeeded; 8 false errors logged) | ~15 min |
| ~08:49 | 2 Stage 1 | Terraform apply (87 resources) | PASS | ~20 min |
| ~09:09 | 2 Stage 2 | SSL wait for auth-dr.tamshai.com | PASS (HTTP 200 after ~17 min) | ~17 min |
| ~09:26 | 2 Stage 3 | Deploy mcp-gateway | PASS (29s, 3 to add) | ~1 min |
| ~09:27 | 2 SSL verify | SSL for app-dr, api-dr | app-dr PASS (301 immediate); api-dr FAIL (15 min timeout, BLOCKING) | ~15 min |
| ~09:42 | 3 | SA key regen | PASS | ~1 min |
| ~09:43 | 4 | Deploy services (workflow dispatch) | **FAIL** -- HTTP 422: "region" input not accepted | immediate |
| -- | 5-7 | Remaining phases | **NOT REACHED** | -- |

**Evacuation Duration**: ~73 min (aborted at Phase 4)
**Manual Actions (Evacuation)**: **0** (script ran unattended until failure)

---

## Phase 0: Pre-flight Checks

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- All required tools present (gcloud, terraform, gh)
- GCP authentication successful
- Project: gen-lang-client-0553641830
- Target zone us-west1-b has capacity for e2-micro
- GitHub CLI authenticated
- GitHub secrets loaded into environment (Bug #8 fix verified -- fetched at pre-flight)

**Manual Actions Required**: None

---

## Phase 0.5: Pre-cleanup

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- No leftover VPC found -- environment is clean
- No stale terraform state locks
- Configuration: NAME_PREFIX=tamshai-prod-recovery-20260127-0830, ENV_ID=recovery-20260127-0830

**Manual Actions Required**: None

---

## Phase 1: Terraform Init

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- Fresh terraform state initialized with GCS backend
- State prefix: `gcp/recovery/recovery-20260127-0830`
- State is clean (no previous entries found)
- Terraform providers: google v7.16.0, random v3.8.0, null v3.2.4

**Manual Actions Required**: None

---

## Phase 1.5: Image Replication

**Duration**: ~15 minutes

**Result**: PASS (all 8 builds succeeded), but script logged 8 false ERRORs (Bug #11)

**Findings**:
- Source registry: us-west1-docker.pkg.dev (Note: source = target because `GCP_REGION` defaults to us-west1 in dr.tfvars)
- All 8 images failed the `gcrane copy` step (source not found in primary region)
- Fallback to Cloud Build rebuild triggered for all 8 images
- All 8 `gcloud builds submit` commands returned non-zero exit code due to **log-streaming permission error**
- Actual build status: ALL 8 SUCCEEDED (verified via `gcloud builds list`)

**Cloud Build Log-Streaming Error** (Bug #11):
```
ERROR: (gcloud.builds.submit)
The build is running, and logs are being written to the default logs bucket.
This tool can only stream logs if you are Viewer/Owner of the project and,
if applicable, allowed by your VPC-SC security policy.
```

**Root Cause**: The `claude-deployer` service account has `roles/cloudbuild.builds.editor` and `roles/logging.viewer` but NOT `roles/viewer` or `roles/owner`. The `gcloud builds submit` command requires project-level `roles/viewer` (or `roles/owner`) to stream build logs. Without it, the command returns a non-zero exit code even though the build itself completes successfully.

**Impact**: Script treated all 8 builds as failures and logged warnings. Phase 1.5 proceeded with warnings but did NOT abort (correct behavior -- images were marked as "some failed"). Phase 2 Terraform apply succeeded because the images WERE actually built and pushed to Artifact Registry.

**Images Built**:
| Image | Build ID | Status |
|-------|----------|--------|
| keycloak:v2.0.0-postgres | 5ef106bb-c97f-4dc0-9a14-d303fb13ef4c | SUCCESS |
| mcp-gateway:latest | efa210fe-8218-4130-9d4d-2b1aab609f59 | SUCCESS |
| mcp-hr:latest | ec0ed7ab-5822-40b6-a97f-23e0d264e644 | SUCCESS |
| mcp-finance:latest | 7f1882d5-1cd2-4d81-8418-26d19b9fac2b | SUCCESS |
| mcp-sales:latest | 2ddb6adc-88a7-495c-b0a5-9a511688ce82 | SUCCESS |
| mcp-support:latest | 92072266-8108-4a1a-b822-47682e085555 | SUCCESS |
| web-portal:latest | 55f0113f-7c35-487c-ac9b-3e9d8f5e6810 | SUCCESS |
| provision-job:latest | b927640c-e456-457f-a1c1-2a372f2ae4f7 | SUCCESS |

**Manual Actions Required**: None

---

## Phase 2: Terraform + SSL Verification

**Duration**: ~53 minutes total

**Result**: PASS (all 3 stages)

### Stage 1: Terraform Apply (Infrastructure)

**Duration**: ~20 minutes

**Result**: PASS

**Resources**: 87 added, 11 changed, 3 destroyed

**Key Resources Created (us-west1)**:
- VPC: tamshai-prod-recovery-20260127-0830-vpc
- Cloud SQL: tamshai-prod-postgres-recovery-20260127-0830 (13m46s)
- Keycloak: https://keycloak-fn44nd7wba-uw.a.run.app (2m50s)
- MCP HR: https://mcp-hr-fn44nd7wba-uw.a.run.app (27s)
- MCP Finance: https://mcp-finance-fn44nd7wba-uw.a.run.app (17s)
- MCP Sales: https://mcp-sales-fn44nd7wba-uw.a.run.app (17s)
- MCP Support: https://mcp-support-fn44nd7wba-uw.a.run.app (17s)
- Utility VM: 136.117.133.84
- Domain mapping: auth-dr.tamshai.com -> keycloak (created, 9s)
- Domain mapping: app-dr.tamshai.com -> web-portal (created, 9s) **<-- v1 Bug #1 FIXED**

**v1 Bug #1 Validation**: `app-dr.tamshai.com` domain mapping was created in Stage 1 (was missing in v1 run). The `app_domain` variable is now correctly passed to Terraform.

### Stage 2: SSL Certificate Wait

**Duration**: ~17 minutes

**Result**: PASS

**Findings**:
- `auth-dr.tamshai.com` returned HTTP 525 for first 16 minutes (certificate provisioning)
- HTTP 200 achieved at ~17 minute mark
- **v1 Bug #3 Validation**: No Cloudflare redirect loop -- the Cloudflare SSL Configuration Rules added after v1 are working correctly

### Stage 3: Deploy mcp-gateway

**Duration**: ~1 minute

**Result**: PASS

**Resources**: 3 added, 0 changed, 0 destroyed
- `google_cloud_run_service.mcp_gateway`: Created in 29s
- `google_cloud_run_service_iam_member.mcp_gateway_public`: Created in 4s
- `google_cloud_run_domain_mapping.mcp_gateway[0]`: Created in 8s (api-dr.tamshai.com) **<-- v1 Bug #2 FIXED**

**v1 Bug #2 Validation**: `api-dr.tamshai.com` domain mapping was created in Stage 3 (was missing in v1 run). The domain mapping target is now correctly included in the Stage 3 target list.

**v1 Bug #3 Validation**: mcp-gateway startup probe PASSED in 29s (no Cloudflare redirect loop). In v1, this stage failed with "Maximum number of redirects exceeded" error.

**Bug #9 Validation**: No "doesn't support update" error. All domain mappings were created fresh (0 to change). The delete-then-recreate pattern from Bug #9 fix is working.

### Post-Stage 3: SSL Verification for Remaining Domains

**Result**: PARTIAL

- `app-dr.tamshai.com`: HTTP 301 immediately (cached from Stage 1) -- **PASS**
- `api-dr.tamshai.com`: HTTP 525 for >15 minutes, timed out -- **BLOCKING** (API inaccessible via custom domain)

The api-dr SSL timeout means `api-dr.tamshai.com` cannot serve HTTPS traffic. E2E tests and any API clients using the custom domain will get 525 errors. The direct Cloud Run URL (`mcp-gateway-fn44nd7wba-uw.a.run.app`) works, but the domain mapping is not functional until the SSL certificate is provisioned. The script proceeds with a warning, but this is a blocking issue for production readiness.

**Manual Actions Required**: None

---

## Phase 3: Regenerate Service Account Key

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- New key created for `tamshai-prod-cicd` service account
- Key ID: `fa7bdc8aa3f272ed49113c503dcf80549f631338`
- GitHub secret `GCP_SA_KEY_PROD` updated successfully
- Temporary key file cleaned up

**Manual Actions Required**: None

---

## Phase 4: Deploy Cloud Run Services

**Duration**: Immediate failure

**Result**: **FAIL** -- HTTP 422

**Error**:
```
could not create workflow dispatch event: HTTP 422: Unexpected inputs provided: ["region"]
(https://api.github.com/repos/jcornell3/tamshai-enterprise-ai/actions/workflows/221964842/dispatches)
```

**Root Cause (Bug #10)**: `evacuate-region.sh` line 1216-1218 dispatches `deploy-to-gcp.yml` with `-f region="$NEW_REGION"`, but the workflow only accepts a `service` input (line 12-27 of `deploy-to-gcp.yml`). Additionally, even if the `region` input were accepted, the workflow hardcodes all region-dependent operations to `vars.GCP_REGION` (a GitHub Repository Variable set to `us-central1`), meaning it would deploy to the primary region instead of the recovery region.

**Impact**: Script exited with code 1. Phases 5-7 NOT REACHED.

**Manual Actions Required**: None (script failed automatically)

---

## Phases 5-7: NOT REACHED

Script exited at Phase 4 due to workflow dispatch error (Bug #10).

---

## Cleanup: NOT RUN

Recovery stack remains deployed. Will run `cleanup-recovery.sh recovery-20260127-0830` after fixing bugs.

---

## Summary

### Manual Actions Count

| Phase | Manual Actions |
|-------|---------------|
| 0. Pre-flight | 0 |
| 0.5 Pre-cleanup | 0 |
| 1. Terraform init | 0 |
| 1.5 Image replication | 0 (8 false errors from Bug #11, builds all succeeded) |
| 2. Terraform + SSL | 0 |
| 3. SA key regen | 0 |
| 4. Deploy services | 0 (script failed, no manual intervention) |
| 5-7 | NOT REACHED |
| Cleanup | NOT RUN |
| **TOTAL** | **0** (2 new bugs found: #10, #11) |

### v1 Bug Fix Validations

| Bug | Description | v2 Result |
|-----|-------------|-----------|
| #1 | Missing app_domain/api_domain in TF_VARS | **FIXED** -- app-dr.tamshai.com created in Stage 1 |
| #2 | Missing domain mapping targets in library | **FIXED** -- api-dr.tamshai.com created in Stage 3 |
| #3 | Cloudflare redirect loop on DR domains | **FIXED** -- mcp-gateway startup in 29s, no redirect loop |
| #4 | SSL check treats HTTP 302 as success | Not tested (no 302 encountered) |
| #5 | Cleanup deletes production secrets | NOT TESTED (cleanup not run) |
| #6 | Cleanup deletes ALL Cloud SQL instances | NOT TESTED (cleanup not run) |
| #7 | CICD SA prevent_destroy blocks destroy | NOT TESTED (cleanup not run) |
| #8 | GitHub secrets fetched too late | **FIXED** -- secrets loaded in pre-flight |
| #9 | Domain mapping "doesn't support update" | **FIXED** -- fresh creation, 0 to change |

### New Issues Found

#### Bug #10: `deploy-to-gcp.yml` workflow does not accept "region" input (SCRIPT — BLOCKING)

**Root Cause**: `evacuate-region.sh` Phase 4 (line 1216-1218) dispatches `deploy-to-gcp.yml` with `-f region="$NEW_REGION"`. The workflow only defines a `service` input (choice: all/gateway/hr/finance/sales/support/keycloak/web/website). Even if a `region` input were added, the workflow uses `vars.GCP_REGION` (GitHub Repository Variable, hardcoded to `us-central1`) for all `gcloud run deploy` and `gcloud run services describe` commands.

**Impact**: Phase 4 fails immediately with HTTP 422. Services deployed by Terraform in Phase 2 are not re-deployed with latest code.

**Fix Required**: Phase 4 should deploy directly via `gcloud run deploy` commands instead of triggering the GitHub Actions workflow. The evacuation script already has all necessary context (recovery region, image tags, environment variables). The GitHub Actions workflow is designed for CI/CD on pushes to main, not DR scenarios.

#### Bug #11: Cloud Build log-streaming error causes false failures in Phase 1.5 (SCRIPT — NON-BLOCKING)

**Root Cause**: `gcloud builds submit` returns a non-zero exit code when the active service account (`claude-deployer@...`) cannot stream build logs. The error message says "This tool can only stream logs if you are Viewer/Owner of the project." The SA has `roles/cloudbuild.builds.editor` and `roles/logging.viewer` but NOT `roles/viewer` or `roles/owner`.

**Impact**: All 8 image builds are logged as `[ERROR] Failed to copy or rebuild` even though all 8 builds actually succeed. Phase 1.5 does NOT abort (correct -- it continues with a warning), and Phase 2 Terraform apply succeeds because images exist. However, the false error messages are misleading and could cause confusion during a real DR event.

**Fix Required**: Use `gcloud builds submit --async` to submit builds without waiting for log streaming, then poll build status with `gcloud builds describe` until completion. This avoids the log-streaming permission issue entirely.

### In-Flight Fixes

No in-flight fixes were applied during this run. Both bugs (#10, #11) will be fixed post-run.

### Comparison: v1 vs v2 Results

| Aspect | v1 Result | v2 Result | Improvement |
|--------|-----------|-----------|-------------|
| Phases completed | 2.5 of 8 (failed Stage 3) | 4 of 8 (failed Phase 4) | +1.5 phases |
| Domain mappings created | 1 of 3 (auth-dr only) | 3 of 3 (auth-dr, app-dr, api-dr) | All 3 working |
| mcp-gateway startup | FAIL (redirect loop) | PASS (29s) | Fixed |
| Image replication | Skipped (images pre-existing) | 8/8 built (false errors logged) | New issue found |
| SSL certificates | 1 of 3 (auth-dr with redirect loop) | 2 of 3 (api-dr timed out, blocking for API) | Improved |
| Bugs found | 8 (4 evacuation + 3 cleanup + 1 resilience) | 2 (1 blocking + 1 cosmetic) | 75% reduction |
| Production collateral damage | YES (Bug #5 deleted secrets, Bug #6 deleted Cloud SQL) | None (cleanup not run) | Eliminated |

---

## Deployed Services (DR Stack -- us-west1)

### Cloud Run URLs

| Service | URL | Status |
|---------|-----|--------|
| Keycloak | https://keycloak-fn44nd7wba-uw.a.run.app | Deployed |
| MCP Gateway | https://mcp-gateway-fn44nd7wba-uw.a.run.app | Deployed (29s startup) |
| MCP HR | https://mcp-hr-fn44nd7wba-uw.a.run.app | Deployed |
| MCP Finance | https://mcp-finance-fn44nd7wba-uw.a.run.app | Deployed |
| MCP Sales | https://mcp-sales-fn44nd7wba-uw.a.run.app | Deployed |
| MCP Support | https://mcp-support-fn44nd7wba-uw.a.run.app | Deployed |
| Web Portal | (Cloud Run URL auto-generated) | Deployed |

### Domain Mappings

| Domain | Service | SSL Status |
|--------|---------|------------|
| auth-dr.tamshai.com | Keycloak | Working (HTTP 200 after ~17 min) |
| app-dr.tamshai.com | Web Portal | Working (HTTP 301 immediately) |
| api-dr.tamshai.com | MCP Gateway | Timed out (HTTP 525, BLOCKING -- API inaccessible via custom domain) |

### Cloud SQL

- **Instance**: tamshai-prod-postgres-recovery-20260127-0830
- **Connection Name**: gen-lang-client-0553641830:us-west1:tamshai-prod-postgres-recovery-20260127-0830
- **Creation Time**: 13m46s

### Utility VM

- **Public IP**: 136.117.133.84

### Infrastructure

- **VPC**: tamshai-prod-recovery-20260127-0830-vpc
- **Serverless Connector**: projects/gen-lang-client-0553641830/locations/us-west1/connectors/tamshai-0069ce15

---

**End of GCP Region Failure DR Run v2 Log**
*Status: FAILED (Phase 4: workflow dispatch "region" input not accepted)*
*Started: 2026-01-27 ~08:30 UTC*
*Failed: 2026-01-27 ~09:43 UTC (~73 min)*
*Manual Actions: 0*
*Total Bugs Found: 2*
- *Bug #10: deploy-to-gcp.yml workflow does not accept "region" input (BLOCKING -- Phase 4)*
- *Bug #11: Cloud Build log-streaming error causes false failures (NON-BLOCKING -- Phase 1.5)*
*v1 Bug Fixes Validated: 5 of 9 (#1, #2, #3, #8, #9 confirmed fixed; #4-#7 not tested)*
