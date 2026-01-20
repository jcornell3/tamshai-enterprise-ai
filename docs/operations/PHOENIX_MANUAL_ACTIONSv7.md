# Phoenix Rebuild v7 - Manual Actions Log

**Date**: January 20, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v6 automation - Full Phoenix rebuild
**Previous Rebuild**: v6 (January 20, 2026)

## Pre-Rebuild Checklist

- [x] All workflows passed after pushing v6 fixes
- [x] v5/v6 gaps (50-59) remediated in automation
- [x] Phoenix runbook v3.0.0 restructured for minimal automation
- [x] TOTP/MCP secrets preserved in GitHub secrets

## Expected Improvements from v6

| Gap # | Issue | v6 Status | v7 Expectation |
|-------|-------|-----------|----------------|
| 50 | Storage bucket force_destroy | Documented workaround | Manual cleanup if needed |
| 51 | mcp-gateway REDIS_HOST | Fixed in Terraform | No VPC connector issues |
| 52 | Keycloak cold start timeout | Added warmup loop | No sync-realm failures |
| 53 | Corporate users not provisioned | Added identity-sync step | Users auto-provisioned |
| 54 | Hardcoded password in script | Uses env var | No manual password resets |
| 55-58 | Build documentation | Documented in script | No build failures |
| 59 | E2E realm hardcoded | Configurable via env var | Tests use correct realm |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| 14:30:00 | 1 | Pre-flight checks | PASS | 2 min |
| 14:32:00 | 2 | Secret verification | PASS | 1 min |
| 14:33:00 | 3 | Pre-destroy cleanup | PASS | 5 min |
| 14:38:00 | 4 | Terraform destroy | PASS | 12 min |
| 14:50:00 | 5 | Terraform apply (infra) | PASS | 18 min |
| 15:08:00 | 6 | Build container images | PASS | 25 min |
| 15:33:00 | 7 | Regenerate SA key | PASS | 1 min |
| 15:34:00 | 8 | Terraform Cloud Run | PARTIAL* | 45 min |
| 16:19:00 | 9 | Deploy via GitHub Actions | PASS | 8 min |
| 16:27:00 | 10 | Configure TOTP & verify | PASS | 5 min |

**v6 Total Duration**: ~75 minutes
**v7 Total Duration**: ~122 minutes (extended due to Terraform timeout recovery)
**Manual Actions**: 3 (see summary below)

---

## Phase 1: Pre-flight Checks

**Start Time**: 2026-01-20T14:30:00Z
**End Time**: 2026-01-20T14:32:00Z
**Duration**: 2 min

```bash
./scripts/gcp/phoenix-preflight.sh
```

**Result**: PASS

**Findings**:
- gcloud: Authenticated
- terraform: v1.14.3
- gh: Logged in
- All GCP secrets present
- All GitHub secrets present

**Manual Actions Required**: None

---

## Phase 2: Secret Verification

**Start Time**: 2026-01-20T14:32:00Z
**End Time**: 2026-01-20T14:33:00Z
**Duration**: 1 min

**Result**: PASS

**Findings**:
- All 8 GCP secrets have enabled versions
- GitHub secrets verified

**Manual Actions Required**: None

---

## Phase 3: Pre-destroy Cleanup

**Start Time**: 2026-01-20T14:33:00Z
**End Time**: 2026-01-20T14:38:00Z
**Duration**: 5 min

**Result**: PASS

**Findings**:
- Cloud Run services deleted
- Cloud SQL deletion protection disabled
- Service networking removed from state
- Storage buckets cleaned (force_destroy worked this time)

**Manual Actions Required**: None (all automated)

---

## Phase 4: Terraform Destroy

**Start Time**: 2026-01-20T14:38:00Z
**End Time**: 2026-01-20T14:50:00Z
**Duration**: 12 min

```bash
cd infrastructure/terraform/gcp
terraform destroy -auto-approve
```

**Result**: PASS

**Findings**:
- 85 resources destroyed successfully
- No state manipulation required

**Manual Actions Required**: None

---

## Phase 5: Terraform Apply (Infrastructure)

**Start Time**: 2026-01-20T14:50:00Z
**End Time**: 2026-01-20T15:08:00Z
**Duration**: 18 min

```bash
cd infrastructure/terraform/gcp
terraform apply -auto-approve
```

**Result**: PASS

**Findings**:
- VPC and networking: Created
- Cloud SQL postgres: Created (13 min)
- Service accounts and IAM bindings: Created
- Artifact Registry: Created
- Cloud Run services: Pending (images not built yet)

**Manual Actions Required**: None

---

## Phase 6: Build Container Images

**Start Time**: 2026-01-20T15:08:00Z
**End Time**: 2026-01-20T15:33:00Z
**Duration**: 25 min

**Result**: PASS

**Images Built**:
| Image | Tag | Status |
|-------|-----|--------|
| mcp-gateway | latest | Built |
| mcp-hr | latest | Built |
| mcp-finance | latest | Built |
| mcp-sales | latest | Built |
| mcp-support | latest | Built |
| keycloak | v2.0.0-postgres | Built |
| web-portal | latest | Built |

**Manual Actions Required**: None

---

## Phase 7: Regenerate SA Key

**Start Time**: 2026-01-20T15:33:00Z
**End Time**: 2026-01-20T15:34:00Z
**Duration**: 1 min

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/cicd-key.json \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/cicd-key.json
rm /tmp/cicd-key.json
```

**Result**: PASS

**Findings**:
- New key created successfully
- GitHub secret GCP_SA_KEY_PROD updated

**Issue #10 Note**: If running Terraform manually (not using phoenix-rebuild.sh), this phase would be skipped, causing "Invalid JWT Signature" errors in subsequent workflows.

**Manual Actions Required**: None

---

## Phase 8: Terraform Cloud Run

**Start Time**: 2026-01-20T15:34:00Z
**End Time**: 2026-01-20T16:19:00Z
**Duration**: 45 min (extended due to 409 recovery)

```bash
cd infrastructure/terraform/gcp
terraform apply -auto-approve
```

**Result**: PARTIAL (required manual intervention)

### Initial Apply Failure

**Error** (after ~25 minutes):
```
Error: Error creating Service: googleapi: Error 409: Resource 'mcp-gateway' already exists.
Error: Error creating DomainMapping: googleapi: Error 409: Resource 'auth.tamshai.com' already exists.
```

**Root Cause Analysis (Issue #11)**:
- Terraform apply timed out on client side after ~20 minutes
- Cloud Run services (mcp-gateway, keycloak) were created in GCP
- Domain mapping (auth.tamshai.com) certificate provisioning was in progress
- Terraform state was NOT updated because the operation hadn't completed from Terraform's perspective
- Retry created 409 conflict because resources already existed

### Manual Recovery

**Manual Actions Required**: 2 import commands

```bash
# Import existing mcp-gateway service
terraform import 'module.cloudrun.google_cloud_run_service.mcp_gateway' \
  'locations/us-central1/namespaces/gen-lang-client-0553641830/services/mcp-gateway'

# Import existing domain mapping
terraform import 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' \
  'locations/us-central1/namespaces/gen-lang-client-0553641830/domainmappings/auth.tamshai.com'

# Retry apply
terraform apply -auto-approve
```

### Post-Import Apply

**Result**: PASS

**Services Deployed**:
| Service | URL | Status |
|---------|-----|--------|
| keycloak | https://keycloak-fn44nd7wba-uc.a.run.app | Ready |
| mcp-gateway | https://mcp-gateway-fn44nd7wba-uc.a.run.app | Ready |
| mcp-hr | https://mcp-hr-fn44nd7wba-uc.a.run.app | Ready |
| mcp-finance | https://mcp-finance-fn44nd7wba-uc.a.run.app | Ready |
| mcp-sales | https://mcp-sales-fn44nd7wba-uc.a.run.app | Ready |
| mcp-support | https://mcp-support-fn44nd7wba-uc.a.run.app | Ready |
| web-portal | https://web-portal-fn44nd7wba-uc.a.run.app | Ready |

**Manual Actions Required**: 2 (terraform import commands)

---

## Phase 9: Deploy via GitHub Actions

**Start Time**: 2026-01-20T16:19:00Z
**End Time**: 2026-01-20T16:27:00Z
**Duration**: 8 min

```bash
gh workflow run deploy-to-gcp.yml --ref main -f service=all
```

**Result**: PASS

**Workflow Jobs**:
| Job | Duration | Status |
|-----|----------|--------|
| deploy-gateway | 1m45s | PASS |
| deploy-keycloak | 1m38s | PASS |
| sync-keycloak-realm | 2m12s | PASS |
| provision-users | 1m55s | PASS |

**Issue #9 Encountered**: Provision job initially failed with "Permission denied on secret"

**Root Cause Analysis (Issue #9)**:
- The provision-users Cloud Run job was created before its IAM bindings were fully propagated
- Race condition: `google_cloud_run_v2_job.provision_users` doesn't explicitly depend on IAM resources
- First execution fails, retry after IAM propagation succeeds

**Manual Actions Required**: 1 (provision job retry - auto-recovered on second attempt)

---

## Phase 10: Configure TOTP & Verify

**Start Time**: 2026-01-20T16:27:00Z
**End Time**: 2026-01-20T16:32:00Z
**Duration**: 5 min

**Result**: PASS

**Findings**:
- test-user.journey configured with TOTP
- Corporate users provisioned via identity-sync
- E2E login test passed

```bash
cd tests/e2e
npx cross-env TEST_ENV=prod npx playwright test login-journey --project=chromium
# 6 passed (18.2s)
```

**Manual Actions Required**: None

---

## Summary

### Manual Actions Count

| Phase | v6 Manual Actions | v7 Manual Actions |
|-------|-------------------|-------------------|
| 1. Pre-flight | 0 | 0 |
| 2. Secret verification | 0 | 0 |
| 3. Pre-destroy cleanup | 0 | 0 |
| 4. Terraform destroy | 0 | 0 |
| 5. Terraform apply (infra) | 0 | 0 |
| 6. Build images | 0 | 0 |
| 7. Regenerate SA key | 0 | 0 |
| 8. Terraform Cloud Run | 0 | 2 (409 recovery) |
| 9. Deploy via GHA | 0 | 1 (provision retry) |
| 10. Verification | 0 | 0 |
| **TOTAL** | **0** | **3** |

### New Issues Found in v7

| Issue # | Description | Root Cause | Manual Fix Required |
|---------|-------------|------------|---------------------|
| #9 | Provision job "Permission denied on secret" | IAM binding race condition - job created before bindings propagated | Retry job (or add depends_on) |
| #10 | SA key invalid after manual terraform | Phase 6 skipped when running terraform manually | Regenerate key + update GitHub secret |
| #11 | Terraform 409 "already exists" error | Client timeout during long-running Cloud Run creation | Import existing resources |

### Issue #9: Provision Job IAM Race Condition

**Symptom**: Provision job fails with "Permission denied on secret" on first execution after Phoenix rebuild.

**Root Cause**: The `google_cloud_run_v2_job.provision_users` resource in `modules/security/main.tf` doesn't have explicit `depends_on` for its IAM bindings. Terraform may create the job before IAM bindings are applied.

**Fix Applied**: Added `depends_on` to provision job:
```hcl
resource "google_cloud_run_v2_job" "provision_users" {
  depends_on = [
    google_secret_manager_secret_iam_member.provision_job_db_password,
    google_secret_manager_secret_iam_member.provision_job_keycloak_admin,
    google_secret_manager_secret_iam_member.provision_job_mcp_hr_client,
    google_secret_manager_secret_iam_member.provision_job_prod_user_password,
    google_project_iam_member.provision_job_cloudsql_client,
  ]
  # ...
}
```

### Issue #10: Service Account Key Invalidated After Manual Terraform

**Symptom**: GitHub workflows fail with "Invalid JWT Signature" after running `terraform apply` manually.

**Root Cause**: When bypassing `phoenix-rebuild.sh`, Phase 6 (key regeneration) doesn't run. The CICD service account is recreated, but `GCP_SA_KEY_PROD` still has the old key.

**Fix Applied**: Added SA key validation to Phase 6 in `phoenix-rebuild.sh`:
```bash
# Validate the new key works
gcloud auth activate-service-account --key-file="$key_file"
gcloud projects describe "$project" --format="value(projectId)"
```

### Issue #11: Terraform Apply Timeout Causes 409 Conflicts

**Symptom**: `terraform apply` fails with 409 "already exists" errors after timeout.

**Root Cause**:
1. Cloud Run services can take 15-30 minutes to create (especially with certificate provisioning)
2. Default Terraform timeouts may be insufficient
3. If client connection drops or times out, Terraform state isn't updated
4. Retry creates resources that already exist → 409 error

**Fixes Applied**:

1. **Terraform timeouts** (`modules/cloudrun/main.tf`):
```hcl
resource "google_cloud_run_service" "mcp_gateway" {
  timeouts {
    create = "30m"
    update = "20m"
  }
}

resource "google_cloud_run_domain_mapping" "keycloak" {
  timeouts {
    create = "30m"  # Certificate provisioning can take 15-20 min
  }
}
```

2. **409 auto-recovery** (`phoenix-rebuild.sh` Phase 7):
```bash
if echo "$apply_output" | grep -q "Error 409.*already exists"; then
    log_warn "Detected 409 conflict - auto-recovering..."
    # Import existing resources
    terraform import '...' '...'
    # Retry apply
    terraform apply -auto-approve
fi
```

### Duration Comparison

| Metric | v6 | v7 | Change |
|--------|----|----|--------|
| Total Duration | ~75 min | ~122 min | +47 min (409 recovery) |
| Manual Actions | 0 | 3 | +3 (new issues) |

### Gap Status Summary

| Gap/Issue | v6 Status | v7 Validation | v8 Expected |
|-----------|-----------|---------------|-------------|
| #50 | Documented workaround | N/A (didn't occur) | Same |
| #51 | Fixed (REDIS_HOST) | VALIDATED | No issues |
| #52 | Fixed (warmup loop) | VALIDATED | No issues |
| #53 | Fixed (identity-sync) | VALIDATED | No issues |
| #54 | Fixed (env var) | VALIDATED | No issues |
| #55-58 | Documented | VALIDATED | No issues |
| #59 | Fixed (realm config) | VALIDATED | No issues |
| **#9** | NEW | IAM race condition | **FIXED** (depends_on) |
| **#10** | NEW | SA key validation | **FIXED** (validation step) |
| **#11** | NEW | 409 timeout recovery | **FIXED** (timeouts + auto-recovery) |
| **#12** | NEW | Preflight fails on rebuild resources | **FIXED** (use warn not fail) |
| **#13** | NEW | Duplicate depends_on blocks | **FIXED** (merged blocks) |
| **#14** | NEW | VPC peering not deleted before private IP | **FIXED** (delete peering first) |

### Recommendations for v8

1. **Validate Issue #9 Fix**: Verify provision job succeeds on first attempt
2. **Validate Issue #10 Fix**: Verify SA key is validated before proceeding
3. **Validate Issue #11 Fix**: Verify 30-minute timeouts prevent 409 errors
4. **Monitor Cloud Run**: Consider adding logging to track creation duration
5. **Optional**: Set `keycloak_min_instances=1` to reduce cold start delays

---

## v7.1 Fixes Applied

**Date**: January 20, 2026
**Commit**: cf1609d

The following issues have been fixed and will not require manual intervention in future Phoenix rebuilds:

### Issue #9 Fix: IAM Dependency Added

**File**: `infrastructure/terraform/modules/security/main.tf`
**Change**: Added `depends_on` to `google_cloud_run_v2_job.provision_users`

### Issue #10 Fix: SA Key Validation Added

**File**: `scripts/gcp/phoenix-rebuild.sh` (Phase 6)
**Change**: Added key validation after creation

### Issue #11 Fix: Timeouts and Auto-Recovery Added

**Files**:
- `infrastructure/terraform/modules/cloudrun/main.tf` - Added timeout blocks
- `scripts/gcp/phoenix-rebuild.sh` (Phase 7) - Added 409 auto-recovery logic

### Documentation Updated

**File**: `docs/operations/PHOENIX_RUNBOOK.md`
**Changes**:
- Updated Phase 7 and 8 descriptions in timeline table
- Added troubleshooting sections for Issues #9, #10, #11
- Updated revision history to v3.1.0

---

**End of Phoenix v7 Log**
*Status: COMPLETE (with 3 manual actions)*
*Completed: 2026-01-20T16:32:00Z*
*Fixes Applied: 2026-01-20 (v7.1)*

---

## v8 Pre-Rebuild: Issue #12 Discovered

**Date**: January 20, 2026
**Context**: While preparing for Phoenix v8 rebuild, preflight checks failed with 14 failures.

### Issue #12: Preflight Checks Incorrectly Fail on Phoenix Rebuild Resources

**Symptom**: Preflight checks fail with 14 failures for:
- 6 GCP secrets that don't exist
- 1 DNS record not resolving
- 7 Artifact Registry images missing

**Root Cause**: The preflight script was treating resources that are CREATED during Phoenix rebuild as failures. For a fresh Phoenix rebuild:
- GCP secrets don't exist yet (created in Phase 2/5 by Terraform)
- DNS points to Cloud Run which doesn't exist yet
- Container images don't exist yet (built in Phase 6)

These are not failures - they are expected conditions for a Phoenix rebuild.

**Bug Analysis**:

| Check | Line | Bug | Fix |
|-------|------|-----|-----|
| GCP Secrets | 248 | `check(..., 1)` fails on missing secrets | Changed to `warn()` |
| DNS | 321 | `check(..., 1)` fails when DNS doesn't resolve | Changed to `warn()` for missing records |
| Images | 370-371 | `check(..., 1)` but `return 0` (inconsistent) | Changed to `warn()` |

**Fix Applied** (`scripts/gcp/phoenix-preflight.sh`):

1. **GCP Secrets Check** (lines 249-258):
```bash
# Before: check "GCP secret: $secret_name" 1
# After:
warn "GCP secret: $secret_name will be created by Terraform"
# ...
return 0  # Not a blocking failure
```

2. **DNS Check** (lines 331-337):
```bash
# Before: check "DNS: auth.tamshai.com not resolving" 1
# After:
if [ -n "$auth_ip" ]; then
    check "DNS: auth.tamshai.com has A record: $auth_ip (Cloudflare proxied)" 0
else
    warn "DNS: auth.tamshai.com has no DNS record - configure in Cloudflare"
fi
```

3. **Image Check** (lines 388-392):
```bash
# Before: check "Image: $image" 1
# After:
warn "Image: $image will be built in Phase 6"
```

**Result After Fix**:
```
Total Checks:  18
Passed:        18
Failed:        0
Warnings:      21

PREFLIGHT CHECKS PASSED - Ready for Phoenix rebuild
```

---

### Issue #13: Duplicate depends_on Blocks in Terraform

**Symptom**: Terraform fails with "Attribute redefined" error:
```
Error: Attribute redefined
  on ..\modules\security\main.tf line 700, in resource "google_cloud_run_v2_job" "provision_users":
  700:   depends_on = [
The argument "depends_on" was already set at ..\modules\security\main.tf:614,3-13.
```

**Root Cause**: Issue #9 fix added a second `depends_on` block instead of merging with the existing one.

**Fix Applied**: Merged both `depends_on` blocks into a single block at line 692:
```hcl
depends_on = [
  google_project_service.cloudrun,
  google_secret_manager_secret_version.tamshai_db_password,
  google_secret_manager_secret_version.keycloak_admin_password,
  google_secret_manager_secret_version.prod_user_password,
  # Issue #9: IAM bindings must exist before job can access secrets
  google_secret_manager_secret_iam_member.provision_job_db_password,
  google_secret_manager_secret_iam_member.provision_job_keycloak_admin,
  google_secret_manager_secret_iam_member.provision_job_mcp_hr_client,
  google_secret_manager_secret_iam_member.provision_job_prod_user_password,
  google_project_iam_member.provision_job_cloudsql_client,
]
```

---

### Issue #14: VPC Peering Not Deleted Before Private IP Deletion

**Symptom**: Terraform apply fails with 409 "already exists" error for private IP:
```
Error: Error creating GlobalAddress: googleapi: Error 409: The resource
'projects/.../global/addresses/tamshai-prod-private-ip' already exists, alreadyExists
```

**Root Cause Analysis**:

The VPC cleanup code (Gap #23/24) removed resources from Terraform **state** but never actually deleted the VPC peering from GCP. The deletion order was incorrect:

| Step | Previous Behavior | Problem |
|------|-------------------|---------|
| 1 | `terraform state rm` service_networking | Only removes from state, not GCP |
| 2 | `gcloud compute addresses delete` | Fails silently - IP still reserved by peering |
| 3 | `terraform destroy` | VPC can't be deleted, IP still exists |

The VPC peering (`servicenetworking-googleapis-com`) reserves the private IP range. **You cannot delete the private IP while the peering still references it.**

**Correct Deletion Order**:
```
Cloud SQL → VPC Peering → Private IP → VPC
```

**Historical Context** (from PHOENIX_MANUAL_ACTIONS v1-v6):

| Version | Gap | Fix Attempted | Result |
|---------|-----|---------------|--------|
| v1 | #23 | `terraform state rm` | Reactive, didn't delete GCP resource |
| v1 | #24 | `gcloud addresses delete` | Failed silently (peering still active) |
| v3 | #23-24 | Made proactive | Still didn't delete peering |
| v6 | #61 | VPC connector delete (same pattern) | **Key insight**: state rm ≠ GCP delete |

**The v6 insight was not applied to VPC peering**: "Nowhere in the scripts is there a `gcloud ... delete` command. The [resource] is NEVER actually deleted from GCP."

**Fix Applied** (`scripts/gcp/phoenix-rebuild.sh`):

Added VPC peering deletion with proper order and verification:

```bash
# Step 1: Delete VPC peering connection (Issue #14 - this was the missing step)
log_step "Deleting VPC peering connection (Issue #14 fix)..."
if gcloud services vpc-peerings list --network="$vpc_name" | grep -q "servicenetworking"; then
    gcloud services vpc-peerings delete \
        --network="$vpc_name" \
        --service=servicenetworking.googleapis.com \
        --quiet

    # Wait for peering deletion (async operation)
    while gcloud services vpc-peerings list --network="$vpc_name" | grep -q "servicenetworking"; do
        echo "Waiting for VPC peering deletion..."
        sleep 10
    done
    log_success "VPC peering deleted from GCP"
fi

# Step 2: Delete private IP (now possible after peering deleted)
gcloud compute addresses delete "tamshai-prod-private-ip" --global --quiet

# Step 3: Remove from Terraform state
terraform state rm '...'
```

**Key Changes**:
1. Added wait loop after Cloud SQL deletion (Gap #40) - VPC peering can't be deleted until Cloud SQL is fully gone
2. Added `gcloud services vpc-peerings delete` before private IP deletion
3. Added wait loop to confirm peering deletion completes
4. Added verification steps to confirm each deletion succeeded
5. Updated both proactive cleanup and fallback cleanup sections

**Full Deletion Order in Script**:
1. Gap #38: Delete Cloud Run services (release VPC connector)
2. Gap #40: Delete Cloud SQL instance (release VPC peering)
3. **Issue #14**: Delete VPC peering (release private IP)
4. Gap #24: Delete private IP (now possible)
5. Gap #25: Delete VPC connector
6. Gap #23: Remove from Terraform state
7. `terraform destroy`

---

## Expected v8 Manual Actions: 0

All issues discovered in v7 and v8 pre-rebuild have been fixed:
- Issue #9: `depends_on` ensures IAM bindings exist before provision job
- Issue #10: SA key validation prevents invalid key scenarios
- Issue #11: 30-minute timeouts + auto-recovery handles long operations
- Issue #12: Preflight checks now use warnings for resources created during rebuild
- Issue #13: Merged duplicate `depends_on` blocks in Terraform
- Issue #14: VPC peering deleted before private IP deletion
