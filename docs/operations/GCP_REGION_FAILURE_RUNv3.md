# GCP Region Failure DR Run v3 - Run Log

**Date**: January 27, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production (simulated DR drill)
**Purpose**: Validate evacuate-region.sh after v2 bug fixes (Bugs #10-#11)
**Runbook**: GCP_REGION_FAILURE_RUNBOOK.md v1.4.0
**Primary Region**: us-central1 (available -- this is a drill, not an actual outage)
**Recovery Region**: us-west1 (Oregon)
**Constraint**: Zero manual actions -- script only, no operator GCP writes

## Pre-Run Issues Fixed

| Issue | Root Cause | Fix | Commit | File(s) |
|-------|-----------|-----|--------|---------|
| Phase 4 workflow dispatch HTTP 422 (Bug #10) | `deploy-to-gcp.yml` doesn't accept `region` input, hardcodes `vars.GCP_REGION` (us-central1) | Replaced workflow dispatch with direct `gcloud run services describe` verification | `2d873e74` | `evacuate-region.sh` |
| Cloud Build log-streaming false failures (Bug #11) | `gcloud builds submit` exits non-zero when SA lacks `roles/viewer` for log streaming | Added `submit_cloud_build_async()` using `--async` + polling via `gcloud builds describe` | `2d873e74` | `evacuate-region.sh` |

## Pre-Run Checklist

- [x] Bug #10 and #11 fixes committed and pushed (commit `2d873e74`)
- [x] v1 Bugs #1-#9 all fixed (committed in prior sessions)
- [x] `roles/viewer` added to claude-deployer SA (IAM fix for Bug #11)
- [x] v2 cleanup completed (recovery-20260127-0830 destroyed)
- [x] PROD_USER_PASSWORD available (via GitHub Secrets)

## Expected Validations

| Item | Expectation | Result |
|------|-------------|--------|
| evacuate-region.sh completes all phases | All phases pass | **FAIL** -- script failed at Phase 2 Stage 3 (mcp-gateway startup probe) |
| Bug #10 fix (Phase 4 service verification) | Phase 4 uses `gcloud run services describe` instead of workflow dispatch | **NOT REACHED** -- script exited at Phase 2 Stage 3 |
| Bug #11 fix (async Cloud Build) | Clean async output, no false errors | **PASS** -- 8/8 builds used async pattern successfully |
| SSL certificates for DR domains | auth-dr, app-dr, api-dr all get SSL | **FAIL** -- auth-dr.tamshai.com SSL timed out after 22 min |
| E2E tests against DR stack | 6/6 pass | **NOT REACHED** |
| Image replication (Phase 1.5) | All 8 images built in us-west1 | **PASS** -- all 8 rebuilt via async Cloud Build |

## Bugs Found This Run

### Bug #12 — Cleanup Script Deletes Shared Service Accounts (CRITICAL)

**Severity**: CRITICAL (breaks primary production deployment)
**Found During**: v3 DR investigation -- primary mcp-gateway returning HTTP 500

**Root Cause**: `cleanup-recovery.sh` Step 7 (lines 438-451) only removes the CICD service account from terraform state before `terraform destroy`. The four other global/shared service accounts are left in state and get DELETED by `terraform destroy`:

| Service Account | Purpose | Deleted by Cleanup | Recreated by v3 DR |
|---|---|---|---|
| `tamshai-prod-mcp-gateway` | MCP Gateway Cloud Run | UID `113591404415691813798` deleted | UID `102844688054061434443` created |
| `tamshai-prod-keycloak` | Keycloak Cloud Run | UID `107175236424040996691` deleted | UID `102014144883317940103` created |
| `tamshai-prod-provision` | Provision job | UID `109710093102945579456` deleted | UID `101735665998943608805` created |
| `tamshai-prod-mcp-servers` | MCP suite services | (deleted) | UID `110240760176470097212` created |

**Impact**: Primary Cloud Run services in us-central1 were deployed with the OLD SA UIDs. After cleanup deleted and DR recreated the SAs with new UIDs, the primary services cannot cold-start because the SA identity they're bound to no longer exists. The primary mcp-gateway returns HTTP 500 with "The request failed because the instance could not start successfully" and zero application logs.

**Evidence**:
```
# Secret Manager IAM shows deleted SA entries:
$ gcloud secrets get-iam-policy tamshai-prod-claude-api-key
bindings:
- members:
  - deleted:serviceAccount:tamshai-prod-mcp-gateway@...?uid=113591404415691813798
  - serviceAccount:tamshai-prod-mcp-gateway@...
  role: roles/secretmanager.secretAccessor
```

**Fix Required** (two-sided):
1. **`cleanup-recovery.sh`**: Remove ALL global/shared SAs from state before destroy (not just CICD)
2. **`evacuate-region.sh`**: Pre-import ALL global SAs (not just CICD) so terraform doesn't recreate them

**SAs to Add**:
- `module.security.google_service_account.mcp_gateway`
- `module.security.google_service_account.mcp_servers`
- `module.security.google_service_account.keycloak`
- `module.security.google_service_account.provision_job`

Plus their associated project-level IAM bindings:
- `module.security.google_project_iam_member.mcp_gateway_cloudsql_client`
- `module.security.google_project_iam_member.mcp_gateway_run_invoker`
- `module.security.google_project_iam_member.mcp_servers_cloudsql_client`
- `module.security.google_project_iam_member.keycloak_cloudsql_client`
- `module.security.google_project_iam_member.provision_job_cloudsql_client`
- `module.security.google_project_iam_member.cloudbuild_cloudsql_client`

---

## Timeline -- Evacuation

| Time (approx) | Phase | Action | Result | Duration |
|----------------|-------|--------|--------|----------|
| ~10:41 | 0 | Pre-flight checks | PASS | ~1 min |
| ~10:42 | 0.5 | Pre-cleanup | PASS (clean environment) | ~1 min |
| ~10:43 | 1 | Terraform init | PASS | ~2 min |
| ~10:45 | 1.5 | Image replication (Cloud Build) | PASS (8/8 async builds succeeded) | ~12 min |
| ~10:57 | 2 Pre-import | Import global resources (SA, secrets, AR) | PASS (10 imports) | ~5 min |
| ~11:02 | 2 Stage 1 | Terraform apply (93 resources) | PASS | ~20 min |
| ~11:22 | 2 Stage 2 | SSL wait for auth-dr.tamshai.com | **FAIL** (timed out at 22 min, HTTP 525) | ~22 min |
| ~11:44 | 2 Stage 3 | Deploy mcp-gateway | **FAIL** (startup probe failed -- Keycloak SSL not ready) | ~1 min |
| -- | 3-7 | Remaining phases | **NOT REACHED** | -- |

**Evacuation Duration**: ~63 min (aborted at Phase 2 Stage 3)
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
- GitHub secrets loaded into environment

**Manual Actions Required**: None

---

## Phase 0.5: Pre-cleanup

**Duration**: ~1 minute

**Result**: PASS

**Findings**:
- Environment ID: `recovery-20260127-1041`
- NAME_PREFIX: `tamshai-prod-recovery-20260127-1041`
- No leftover VPC found (clean environment after v2 cleanup)
- No stale terraform state locks

---

## Phase 1: Terraform Init

**Duration**: ~2 minutes

**Result**: PASS

**Findings**:
- State bucket: `tamshai-terraform-state-prod`
- State prefix: `gcp/recovery/recovery-20260127-1041`
- Fresh state initialized (no previous entries)
- Providers installed: google v7.16.0, random v3.8.0, null v3.2.4

---

## Phase 1.5: Image Replication

**Duration**: ~12 minutes

**Result**: PASS

**Bug #11 Fix Verified**: All 8 builds used the async pattern successfully. Clean output with build IDs and polling status -- no false errors.

| Image | Build ID | Duration | Status |
|-------|----------|----------|--------|
| keycloak | `bd092739-df60-440d-b8d8-671c17eaed57` | ~2 min | PASS |
| mcp-gateway | `42e8d304-8bb2-4773-a93d-99d8e178c76f` | ~2 min | PASS |
| mcp-hr | `db4f0db5-bd35-4635-9f9d-490233b68051` | ~2 min | PASS |
| mcp-finance | `6131b469-991c-4401-b1f4-0b06f0bd182b` | ~2 min | PASS |
| mcp-sales | `bb4ceb50-f6e4-4803-a5c7-01cbfb4596af` | ~1 min | PASS |
| mcp-support | `e519471f-fc48-4334-9d14-0fcdfbab0990` | ~1 min | PASS |
| web-portal | `a39fbefd-8032-4d7d-a4db-17939e18e2d0` | ~2 min | PASS |
| provision-job | `ccd1785a-13aa-4bd4-8e20-7adbd3de4635` | ~2 min | PASS |

Example clean async output:
```
[INFO]     Build submitted: bd092739-df60-440d-b8d8-671c17eaed57
[INFO]     Build in progress... (60s elapsed, status: WORKING)
[SUCCESS]     Rebuilt keycloak successfully
```

---

## Phase 2: Deploy Infrastructure

### Stage 1: Terraform Apply

**Duration**: ~20 minutes (14m18s for Cloud SQL)

**Result**: PASS — 93 added, 9 changed, 0 destroyed

**Key Resources Created**:
- VPC: `tamshai-prod-recovery-20260127-1041-vpc`
- VPC Connector: `tamshai-ae49e041` (us-west1)
- Cloud SQL: `tamshai-prod-postgres-recovery-20260127-1041` (14m18s)
- Databases: keycloak, tamshai_hr, tamshai_finance
- Cloud Run services: keycloak (3m41s), web-portal (18s), mcp-hr (18s), mcp-finance (18s), mcp-sales (18s), mcp-support (18s)
- Domain mappings: auth-dr.tamshai.com (8s), app-dr.tamshai.com (17s)
- Storage buckets: logs, public_docs, finance_docs, backups, static_website
- Utility VMs: tamshai-prod-keycloak (20s), tamshai-prod-mcp-gateway (30s)

**NOTE — Bug #12**: The terraform plan showed `module.security.google_service_account.mcp_gateway will be created` — this should have been an IMPORT of the existing SA, not a creation. The SA was deleted by the v2 cleanup, so terraform created a new one with a different UID.

### Stage 2: SSL Wait

**Duration**: 22.5 minutes (timed out)

**Result**: FAIL — auth-dr.tamshai.com SSL not ready after 22 min

**Observations**:
- HTTP 525 (SSL handshake failure) persisted for the full 22-minute timeout
- This is a new domain mapping for `auth-dr.tamshai.com` in us-west1
- GCP SSL certificate provisioning for new domain mappings can take 15-25+ minutes
- The 22-minute timeout (1350s) is insufficient for first-time DR domain provisioning
- Script correctly logged warnings and proceeded to Stage 3

### Stage 3: Deploy mcp-gateway

**Duration**: ~1 minute (1m10s)

**Result**: FAIL — Container startup probe failed

```
Error: Error waiting to create Service: resource is in failed state "Ready:False",
message: Revision 'mcp-gateway-00001-2g7' is not ready and cannot serve traffic.
The user-provided container failed the configured startup probe checks.
```

**Root Cause**: The mcp-gateway container checks Keycloak JWKS at startup (`https://auth-dr.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/certs`). Since auth-dr.tamshai.com SSL was not ready, the JWKS fetch fails, and the `/health` startup probe returns failure. The startup probe is configured with `failureThreshold: 12, periodSeconds: 5` (~60s), which is insufficient when SSL provisioning takes 22+ minutes.

**Script exited with error at Stage 3.**

---

## Phases 3-7: Not Reached

The script exited after Stage 3 failure. The following phases were not executed:
- Phase 3: SA Key Regeneration
- Phase 4: Verify Cloud Run Services (Bug #10 fix would have been tested here)
- Phase 5: Configure Users
- Phase 6: Verify Services
- Phase 7: Run E2E Tests

---

## Bug #12 Investigation (Post-Run)

### Discovery

During v3 monitoring, gcloud logs revealed the PRIMARY mcp-gateway in us-central1 was failing:

```
$ curl https://mcp-gateway-fn44nd7wba-uc.a.run.app/health
HTTP 500 (0.171s)

$ gcloud logging read "...mcp-gateway...us-central1..."
"The request failed because the instance could not start successfully."
```

### Root Cause Analysis

1. **v2 cleanup** (`cleanup-recovery.sh recovery-20260127-0830 --force`) ran `terraform destroy`
2. The recovery terraform state contained imported global SAs (mcp-gateway, keycloak, mcp-servers, provision-job)
3. Only the CICD SA was removed from state before destroy (Bug #7 fix, line 443)
4. `terraform destroy` **deleted all four unprotected SAs**
5. The v3 DR terraform then created NEW SAs with the same email but different UIDs
6. Primary Cloud Run services in us-central1 reference the OLD SA UIDs — they can't cold-start

### Evidence

```bash
# Current SA UID (recreated by v3 DR):
$ gcloud iam service-accounts describe tamshai-prod-mcp-gateway@...
uniqueId: '102844688054061434443'

# Secret IAM shows deleted SA with different UID:
$ gcloud secrets get-iam-policy tamshai-prod-claude-api-key
- deleted:serviceAccount:tamshai-prod-mcp-gateway@...?uid=113591404415691813798  # OLD
- serviceAccount:tamshai-prod-mcp-gateway@...  # NEW

# All four SAs have mismatched UIDs:
# mcp-gateway:  113591404415691813798 (deleted) → 102844688054061434443 (new)
# keycloak:     107175236424040996691 (deleted) → 102014144883317940103 (new)
# provision:    109710093102945579456 (deleted) → 101735665998943608805 (new)
# mcp-servers:  (deleted) → 110240760176470097212 (new)
```

### Cloud Run Error Timeline

| Timestamp (UTC) | Event |
|---|---|
| 17:32:39 | mcp-gateway graceful shutdown (scale to zero) |
| 18:45:39 | mcp-gateway graceful shutdown (working normally) |
| 19:19:48 | 6 concurrent cold-start attempts, all fail immediately |
| 19:19:49–51 | 12 rapid "instance could not start successfully" errors |
| 19:22:32 | Another failed cold-start attempt |

### gcloud Logs Examined

| Log Source | Findings |
|---|---|
| Cloud SQL (`cloudsql_database`, recovery instance) | Normal init: "system shutting down" → "system starting up" — standard Cloud SQL provisioning cycle |
| Cloud Run (`cloud_run_revision`, mcp-gateway, us-central1) | CRITICAL: "instance could not start successfully" — zero application logs, container crashes before init |
| Cloud Run (`cloud_run_revision`, mcp-gateway, us-west1) | Not yet created at time of investigation |
| Secret Manager audit logs | Empty (no access changes during DR) |
| IAM audit logs | Empty (SA operations not captured in default filter) |
| VPC connector (us-central1) | `tamshai-prod-conn` exists and READY — not the cause |

---

## v2 Bug Fix Validations

### Bug #10 — Phase 4 Workflow Dispatch (NOT VALIDATED)

Phase 4 was not reached. Bug #10 fix cannot be validated this run.

### Bug #11 — Cloud Build Async Pattern (VALIDATED ✅)

All 8 Cloud Build operations used `submit_cloud_build_async()`:
- Clean output: `Build submitted: <build-id>`, `Build in progress... (60s elapsed, status: WORKING)`, `Rebuilt <service> successfully`
- No false errors from log-streaming permissions
- All 8 builds completed successfully
- Additionally, `roles/viewer` was added to claude-deployer SA (IAM-level fix)

---

## Observations

### 1. SSL Timeout for New DR Domains

The 22-minute SSL timeout (1350s) is likely insufficient for first-time DR domain provisioning. In v2, auth-dr.tamshai.com took ~17 minutes — within the timeout. In v3, it exceeded 22 minutes. GCP SSL provisioning for new domain mappings is highly variable (15-25+ minutes). Consider increasing the timeout to 30 minutes for DR scenarios.

### 2. Stage 3 Has No SSL Wait Retry

When Stage 2 times out on SSL, Stage 3 immediately attempts to create mcp-gateway. The mcp-gateway can't start without Keycloak JWKS (requires SSL). The script should either:
- Wait for SSL to be ready before Stage 3 (even if Stage 2 timed out)
- Retry Stage 3 after a delay
- Allow Stage 3 mcp-gateway to be created without the startup probe initially, then update it

### 3. Primary Stack Broken by DR Cleanup

Bug #12 is the most severe issue found. The v2 cleanup destroyed shared service accounts, which broke the primary production deployment. This must be fixed before any future DR drills. A Phoenix rebuild of the primary stack is required to restore service.

### 4. Service Accounts Are Global (Not Regional)

GCP service accounts are project-level resources. Both the evacuation script and cleanup script must treat them as shared/protected — identical to how secrets and the CICD SA are handled. The fix should follow the existing pattern in lines 438-451 of `cleanup-recovery.sh`.

---

## Summary

| Metric | Value |
|--------|-------|
| **Outcome** | FAIL (Phase 2 Stage 3) |
| **Total Duration** | ~63 min |
| **Manual Actions** | 0 |
| **New Bugs Found** | 1 (Bug #12 — CRITICAL) |
| **v2 Bugs Validated** | 1 of 2 (Bug #11 ✅, Bug #10 not reached) |
| **Phases Completed** | 0, 0.5, 1, 1.5, 2 Stage 1 |
| **Phases Failed** | 2 Stage 2 (SSL timeout), 2 Stage 3 (mcp-gateway probe) |
| **Phases Not Reached** | 3, 4, 5, 6, 7 |
| **Primary Stack Impact** | BROKEN — Bug #12 destroyed shared SAs |
| **Recovery Required** | Phoenix rebuild of primary stack + Bug #12 fix |

## Files Modified (Bug #10 + #11 Fixes — Pre-Run)

| File | Change | Commit |
|------|--------|--------|
| `scripts/gcp/evacuate-region.sh` | Bug #10: Replaced Phase 4 workflow dispatch with `gcloud run services describe` verification loop | `2d873e74` |
| `scripts/gcp/evacuate-region.sh` | Bug #11: Added `submit_cloud_build_async()` helper using `--async` + polling | `2d873e74` |

## Files Requiring Modification (Bug #12 Fix)

| File | Required Change |
|------|----------------|
| `scripts/gcp/cleanup-recovery.sh` | Remove mcp-gateway, mcp-servers, keycloak, provision-job SAs and their project IAM bindings from state before destroy |
| `scripts/gcp/evacuate-region.sh` | Pre-import all 4 global SAs (not just CICD) so terraform doesn't recreate them |
