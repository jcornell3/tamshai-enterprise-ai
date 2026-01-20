# Phoenix Rebuild v6 - Manual Actions Log

**Date**: January 20, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Validate v5.1 gap fixes (Gaps #50-59)
**Previous Rebuild**: v5 (January 19, 2026)

## Pre-Rebuild Checklist

- [x] All workflows passed after v5.1 fixes pushed
- [x] Gap #51 (REDIS_HOST) fix verified in Terraform
- [x] Gap #52-53 (Keycloak warmup, identity-sync) added to phoenix-rebuild.sh
- [x] Gap #54 (TEST_USER_PASSWORD env var) fix in reset-test-user-totp.py
- [x] Gap #59 (KEYCLOAK_REALM configurable) fix in E2E tests

## Expected Improvements from v5

| Gap # | Issue | v5 Status | v6 Expectation | v6 Result |
|-------|-------|-----------|----------------|-----------|
| 50 | Storage bucket force_destroy | Documented workaround | May need manual bucket empty | ❌ Manual cleanup required |
| 51 | mcp-gateway REDIS_HOST hardcoded | Fixed - uses var.redis_host | Zero manual REDIS_HOST fixes | ⚠️ Not tested (deployment via workflow) |
| 52 | Keycloak cold start timeout | Fixed - warmup loop added | Zero timeout failures | ⚠️ Not tested (manual deployment) |
| 53 | Corporate users not provisioned | Fixed - identity-sync step added | Users auto-provisioned | ❌ Users not provisioned |
| 54 | Hardcoded password in script | Fixed - uses TEST_USER_PASSWORD | Script works with env var | ✅ Script worked |
| 55-58 | Build documentation | Documented in script | Clear build patterns | ⚠️ Not tested |
| 59 | E2E realm hardcoded | Fixed - configurable via env var | E2E tests use correct realm | ✅ Tests use tamshai-corp |

## Timeline

| Time (UTC) | Phase | Action | Result | Duration |
|------------|-------|--------|--------|----------|
| 05:56:45 | 1 | Pre-flight checks | PARTIAL (15 failures - false negatives) | 4 min |
| 06:01:34 | 3 | Pre-destroy cleanup | FAILED - Terraform state issues | ~3 min |
| 06:02:00 | 4 | Terraform destroy | PARTIAL - Manual cleanup required | ~13 min |
| 06:25:00 | 5 | Terraform apply (infra) | SUCCESS - Infrastructure created | 16 min |
| 06:41:55 | 6 | Build container images | SUCCESS - via GitHub Actions | ~2 min |
| 06:43:00 | 7-8 | Deploy Cloud Run | PARTIAL - mcp-gateway needed manual fix | ~20 min |
| 07:02:43 | 9 | mcp-gateway manual fix | SUCCESS - KEYCLOAK_URL fix | 5 min |
| 07:03:48 | 10 | Identity-sync | PARTIAL - workflow bug | 2 min |
| 07:05:30 | 11 | Configure TOTP | SUCCESS | 2 min |
| 07:08:00 | 12 | E2E verification | PARTIAL - 3/6 passed | 2 min |

**Total Duration**: ~1h 12 min
**Manual Actions Required**: 10

---

## Phase 1: Pre-flight Checks

**Start Time**: 2026-01-20T05:56:45Z
**End Time**: 2026-01-20T06:01:00Z
**Duration**: ~4 min

**Commands**:
```bash
./scripts/gcp/phoenix-preflight.sh
```

**Result**: PARTIAL (15 failures - mostly false negatives)

**Findings**:
- Tools: All 6 PASS (gcloud, gh, terraform, curl, jq, docker)
- GCP Auth: FAIL (false negative - gcloud actually works)
- GitHub CLI: PASS
- GitHub Secrets: All 5 PASS
- GCP Secrets: All 6 FAIL (false negative - secrets exist, script check issue)
- DNS: 2 FAIL (expected - will be configured after rebuild)
- Images: All 7 FAIL (expected - will be built in Phase 6)
- Terraform: All 3 PASS

**Gap #60 (NEW)**: Preflight script `gcloud authenticated` check failing despite gcloud working correctly. The script's validation method differs from actual gcloud auth status.

**Workaround**: Skipped preflight with `--phase 3` flag to start from pre-destroy cleanup.

---

## Phase 3: Pre-destroy Cleanup (Combined with Phase 4)

**Start Time**: 2026-01-20T06:01:34Z
**Commands**:
```bash
echo "PHOENIX" | bash scripts/gcp/phoenix-rebuild.sh --phase 3
```

**Result**: FAILED - Terraform state inconsistency

---

## Phase 4: Terraform Destroy

**Start Time**: 2026-01-20T06:02:00Z
**Duration**: ~13 min

**Resources to Destroy**: 99

**Terraform Plan Summary**:
- Cloud Run services: 7 (keycloak, mcp-gateway, mcp-hr, mcp-finance, mcp-sales, mcp-support, web-portal)
- Cloud SQL: tamshai-prod-postgres
- VPC, Subnets, Firewall rules
- Service accounts and IAM bindings
- Storage buckets (prod.tamshai.com, finance-docs, public-docs)
- Artifact Registry
- Utility VMs

**Result**: PARTIAL - Terraform destroy failed on bucket, required manual cleanup

**Issues Encountered**:
1. **Gap #50**: Storage bucket `prod.tamshai.com` couldn't be deleted (missing `force_destroy=true`)
2. **Gap #61 (NEW)**: VPC Access Connector conflict - connector already exists when Terraform tried to recreate

**Error Messages**:
```
Error: Error trying to delete bucket prod.tamshai.com without `force_destroy` set to true
Error: Error creating Connector: googleapi: Error 409: Requested entity already exists
```

---

## Phase 4.1: Manual Cleanup (Required)

**Start Time**: 2026-01-20T06:15:00Z
**Duration**: ~10 min

Due to incomplete Terraform destroy, manual cleanup was required:

```bash
# 1. Delete VPC Access Connector (Gap #61)
gcloud compute networks vpc-access connectors delete tamshai-prod-connector \
  --region=us-central1 --quiet

# 2. Empty and delete bucket (Gap #50)
gcloud storage rm -r "gs://prod.tamshai.com/**" --quiet
gcloud storage buckets delete gs://prod.tamshai.com --quiet

# 3. Delete Cloud SQL (disable deletion protection first)
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet
gcloud sql instances delete tamshai-prod-postgres --quiet

# 4. Delete logs bucket
gcloud storage rm -r "gs://tamshai-prod-logs-gen-lang-client-0553641830/**" --quiet
gcloud storage buckets delete gs://tamshai-prod-logs-gen-lang-client-0553641830 --quiet

# 5. Delete VPC resources (in order)
# Firewalls
for fw in tamshai-prod-allow-http tamshai-prod-allow-iap-ssh \
          tamshai-prod-allow-internal tamshai-prod-allow-serverless-connector; do
  gcloud compute firewall-rules delete "$fw" --quiet
done

# Subnet
gcloud compute networks subnets delete tamshai-prod-subnet \
  --region=us-central1 --quiet

# Router
gcloud compute routers delete tamshai-prod-router --region=us-central1 --quiet

# Global address (for service networking)
gcloud compute addresses delete tamshai-prod-private-ip --global --quiet

# VPC
gcloud compute networks delete tamshai-prod-vpc --quiet
```

**Manual Actions Required**: 6 (VPC connector, bucket x2, Cloud SQL, VPC resources, global address)

**Gap #61 (NEW)**: VPC Access Connector not properly destroyed by Terraform. The connector delete operation is async and takes 2-3 minutes. Terraform state gets out of sync.

---

## Phase 5: Terraform Apply (Infrastructure)

**Start Time**: 2026-01-20T06:25:00Z
**End Time**: 2026-01-20T06:41:00Z
**Duration**: ~16 min

**Result**: SUCCESS

**Resources Created Successfully**:
- VPC: tamshai-prod-vpc
- VPC Access Connector: tamshai-prod-connector (2m40s)
- Firewalls: 4 rules (allow-http, allow-iap-ssh, allow-internal, allow-serverless-connector)
- Subnet: tamshai-prod-subnet
- Router + NAT: tamshai-prod-router, tamshai-prod-nat
- Cloud SQL: tamshai-prod-postgres (13m28s) ✅ CRITICAL
- Databases: keycloak, tamshai_hr, tamshai_finance
- DB Users: keycloak, tamshai
- Storage Buckets: prod.tamshai.com, finance-docs, public-docs, logs
- Artifact Registry: us-central1-docker.pkg.dev/.../tamshai
- Utility VMs: tamshai-prod-keycloak, tamshai-prod-mcp-gateway
- Service accounts and IAM bindings

**Cloud Run Services Not Created** (images not found - expected, need to build first):
- keycloak: Image 'keycloak:v2.0.0-postgres' not found
- mcp-hr, mcp-finance, mcp-sales, mcp-support: Images not found
- web-portal: Image not found

**Gap #62 (NEW)**: Terraform apply (infrastructure) phase tried to create Cloud Run services before images existed. The Phoenix rebuild script should build images BEFORE Cloud Run apply.

---

## Phase 6: Build Container Images

**Start Time**: 2026-01-20T06:41:55Z
**End Time**: 2026-01-20T06:43:52Z
**Duration**: ~2 min
**Method**: GitHub Actions - "Deploy to GCP Production" workflow
**Run ID**: 21162042853

**Images Built**:
- keycloak:v2.0.0-postgres ✅
- mcp-gateway:latest ✅
- mcp-hr:latest ✅
- mcp-finance:latest ✅
- mcp-sales:latest ✅
- mcp-support:latest ✅
- web-portal:latest ✅

**Result**: SUCCESS - All images built and pushed to Artifact Registry

---

## Phase 7-8: Deploy Cloud Run Services

**Start Time**: 2026-01-20T06:43:52Z
**End Time**: 2026-01-20T07:02:43Z
**Duration**: ~20 min

**Cloud Run Services Deployed**:
| Service | Status | URL |
|---------|--------|-----|
| keycloak | ✅ Ready | https://keycloak-fn44nd7wba-uc.a.run.app |
| mcp-hr | ✅ Ready | https://mcp-hr-fn44nd7wba-uc.a.run.app |
| mcp-finance | ✅ Ready | https://mcp-finance-fn44nd7wba-uc.a.run.app |
| mcp-sales | ✅ Ready | https://mcp-sales-fn44nd7wba-uc.a.run.app |
| mcp-support | ✅ Ready | https://mcp-support-fn44nd7wba-uc.a.run.app |
| web-portal | ✅ Ready | https://web-portal-fn44nd7wba-uc.a.run.app |
| mcp-gateway | ❌ Failed | Container startup failure |

**Gap #63 (NEW)**: mcp-gateway failed with "Keycloak validation failed" because:
1. KEYCLOAK_URL was missing `/auth` prefix
2. MCP_*_URL environment variables were empty

**Manual Fix Required**:
```bash
gcloud run services update mcp-gateway --region=us-central1 \
  --set-env-vars="KEYCLOAK_URL=https://keycloak-fn44nd7wba-uc.a.run.app/auth" \
  --set-env-vars="KEYCLOAK_REALM=tamshai-corp" \
  --set-env-vars="MCP_HR_URL=https://mcp-hr-fn44nd7wba-uc.a.run.app" \
  --set-env-vars="MCP_FINANCE_URL=https://mcp-finance-fn44nd7wba-uc.a.run.app" \
  --set-env-vars="MCP_SALES_URL=https://mcp-sales-fn44nd7wba-uc.a.run.app" \
  --set-env-vars="MCP_SUPPORT_URL=https://mcp-support-fn44nd7wba-uc.a.run.app"
```

**Result After Manual Fix**: SUCCESS - mcp-gateway running
**mcp-gateway URL**: https://mcp-gateway-1046947015464.us-central1.run.app

---

## Phase 9: Domain Mapping

**Start Time**: 2026-01-20T06:57:00Z

**Domain Mappings**:
| Domain | Service | Status |
|--------|---------|--------|
| app.tamshai.com | web-portal | ✅ Ready |
| auth.tamshai.com | keycloak | ⏳ Certificate Provisioning |

**Gap #64 (NEW)**: auth.tamshai.com domain mapping was not in Terraform state. Had to create manually:
```bash
gcloud beta run domain-mappings create --service=keycloak --domain=auth.tamshai.com --region=us-central1
```

**Gap #65 (NEW)**: Terraform should call `scripts/gcp/lib/domain-mapping.sh` for domain mapping creation. Currently domain mappings are not properly managed by Terraform during Phoenix rebuild.

**Issue**: auth.tamshai.com certificate is still provisioning after 15 minutes. Cloudflare proxy returns 525 (SSL handshake failure) while Google is provisioning the certificate.

---

## Phase 10: Identity Sync

**Start Time**: 2026-01-20T07:03:48Z
**Workflow Run**: 21162501640

**Result**: PARTIAL FAILURE

**Workflow Steps**:
- Pre-flight Checks: ✅ Passed
- Execute Provision Job: ✅ Passed
- Final Verification: ❌ Failed

**Gap #66 (NEW)**: provision-prod-users.yml workflow has a bug in the "Verify Keycloak Users" step. The curl URL is malformed - it's using relative path `/realms/master/...` instead of full URL.

**Users in Keycloak After Provision**:
- test-user.journey ✅

**Missing Users** (Gap #53 not fully fixed):
- eve.thompson ❌
- alice.chen ❌
- bob.martinez ❌

---

## Phase 11: Configure TOTP

**Start Time**: 2026-01-20T07:05:30Z
**Duration**: ~2 min

**Commands**:
```bash
export KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
export TEST_USER_PASSWORD=$(gcloud secrets versions access latest --secret=prod-user-password)
python keycloak/scripts/reset-test-user-totp.py prod
```

**Result**: SUCCESS

**Credentials Configured**:
- User: test-user.journey
- Password: ✅ Set
- OTP: ✅ E2E Test Authenticator

---

## Phase 12: E2E Verification

**Start Time**: 2026-01-20T07:08:00Z
**Duration**: ~2 min

**Commands**:
```bash
cd tests/e2e
npx playwright test login-journey --project=chromium --workers=1
```

**Result**: PARTIAL - 3/6 tests passed

| Test | Result | Notes |
|------|--------|-------|
| Display employee login page | ✅ Pass | |
| Redirect to Keycloak | ❌ Fail | auth.tamshai.com certificate not ready |
| Full login journey | ❌ Fail | Cannot redirect to Keycloak |
| Invalid credentials | ❌ Fail | Cannot redirect to Keycloak |
| Portal SPA loads | ✅ Pass | |
| No 404 for assets | ✅ Pass | |

**Root Cause**: auth.tamshai.com SSL certificate still provisioning. Cloudflare returns 525 errors.

---

## Summary of New Gaps Discovered

| Gap # | Description | Severity | Fix Required |
|-------|-------------|----------|--------------|
| 60 | Preflight gcloud auth check false negative | Low | Update validation method |
| 61 | VPC Access Connector not properly destroyed | Medium | Add explicit delete before Terraform |
| 62 | Cloud Run services created before images built | High | Reorder Phoenix phases |
| 63 | mcp-gateway missing KEYCLOAK_URL /auth prefix | High | Fix in deploy workflow |
| 64 | Domain mapping not in Terraform state | Medium | Import or recreate |
| 65 | Domain mapping not managed by Terraform | Medium | Call domain-mapping.sh from Terraform |
| 66 | provision-prod-users.yml curl URL bug | Medium | Fix URL construction |

---

## Manual Actions Summary

| # | Action | Duration | Gap # |
|---|--------|----------|-------|
| 1 | Skip preflight with --phase 3 | 1 min | #60 |
| 2 | Delete VPC Access Connector | 3 min | #61 |
| 3 | Empty and delete storage bucket | 2 min | #50 |
| 4 | Delete Cloud SQL instance | 2 min | - |
| 5 | Delete VPC resources | 3 min | - |
| 6 | Trigger "Deploy to GCP Production" workflow | 1 min | #62 |
| 7 | Fix mcp-gateway env vars | 2 min | #63 |
| 8 | Create auth.tamshai.com domain mapping | 1 min | #64, #65 |
| 9 | Trigger provision-prod-users workflow | 1 min | #53 |
| 10 | Run reset-test-user-totp.py | 2 min | #54 |

**Total Manual Actions**: 10
**Total Manual Time**: ~18 min

---

## Current Environment Status

**Cloud Run Services**: 7/7 Running
- keycloak: https://keycloak-fn44nd7wba-uc.a.run.app
- mcp-gateway: https://mcp-gateway-fn44nd7wba-uc.a.run.app
- mcp-hr: https://mcp-hr-fn44nd7wba-uc.a.run.app
- mcp-finance: https://mcp-finance-fn44nd7wba-uc.a.run.app
- mcp-sales: https://mcp-sales-fn44nd7wba-uc.a.run.app
- mcp-support: https://mcp-support-fn44nd7wba-uc.a.run.app
- web-portal: https://web-portal-fn44nd7wba-uc.a.run.app

**Domain Mappings**:
- app.tamshai.com → web-portal ✅
- auth.tamshai.com → keycloak ⏳ (certificate provisioning)

**Keycloak**:
- Realm: tamshai-corp ✅
- Test User: test-user.journey ✅ (with TOTP)
- Corporate Users: Not provisioned ❌

**E2E Tests**: 3/6 passing (blocked by auth.tamshai.com certificate)

---

## Next Steps

1. ~~Wait for auth.tamshai.com certificate to provision~~ ✅ Certificate shows Ready but Cloudflare 525 errors persist
2. **Investigate Cloudflare SSL mode** - May need to set to "Full (strict)" or disable proxy
3. Fix provision-prod-users.yml workflow URL bug
4. Re-run E2E tests after auth.tamshai.com works
5. Update Terraform to call domain-mapping.sh
6. Fix mcp-gateway deployment workflow to include /auth prefix

---

## Cloudflare 525 Error Issue

**Status**: Domain mapping shows Ready but Cloudflare returns 525 errors

The `gcloud beta run domain-mappings list` shows auth.tamshai.com with Status=True, but HTTPS requests through Cloudflare fail with 525 (SSL handshake failure).

**Possible Causes**:
1. Cloudflare SSL mode not set to "Full (strict)"
2. Certificate propagation delay (can take up to 24 hours)
3. Origin server (Cloud Run) not returning valid certificate to Cloudflare

**Workaround**:
- Use direct Cloud Run URL: https://keycloak-fn44nd7wba-uc.a.run.app/auth
- Or temporarily disable Cloudflare proxy for auth.tamshai.com (set to DNS only)

---

## Root Cause Analysis: 8 Recurring Issues

The following issues have recurred across v2, v3, v4, v5, and v6 Phoenix rebuilds. This analysis identifies root causes and proposes permanent fixes.

### Issue #1: Preflight Script gcloud Auth Check Failing

**File**: `scripts/gcp/phoenix-preflight.sh` (lines 122-147)

**Symptom**: Preflight reports "gcloud not authenticated" despite gcloud working correctly.

**Root Cause**: The script uses `gcloud auth list --filter="status:ACTIVE"` which doesn't work reliably with service accounts. Service accounts activated via `gcloud auth activate-service-account` may not appear in `auth list` the same way interactive logins do.

**Current Code**:
```bash
if gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | head -1 | grep -q "@"; then
```

**Fix**: Use `gcloud auth print-identity-token` or `gcloud config get-value account` instead:
```bash
if gcloud config get-value account 2>/dev/null | grep -q "@"; then
    # Authenticated
fi
```

---

### Issue #2: Storage Bucket force_destroy Not Working

**File**: `infrastructure/terraform/modules/storage/main.tf` (lines 100-147)

**Symptom**: `Error trying to delete bucket prod.tamshai.com without force_destroy set to true`

**Root Cause**: The `static_website` bucket has **versioning enabled**, and `force_destroy=true` does NOT delete noncurrent object versions. GCS buckets with versioning retain noncurrent versions even when the current objects are deleted.

**Current Code**:
```hcl
resource "google_storage_bucket" "static_website" {
  name          = var.static_website_bucket_name
  force_destroy = var.force_destroy  # TRUE in phoenix_mode

  versioning {
    enabled = true  # THIS CAUSES THE PROBLEM
  }
}
```

**Why force_destroy Fails**:
- `force_destroy=true` deletes current objects
- Versioning creates noncurrent versions on every overwrite
- Noncurrent versions are NOT deleted by force_destroy
- Terraform destroy fails because bucket is "not empty"

**Fix**: Add lifecycle rule to auto-delete noncurrent versions before destroy:
```hcl
lifecycle_rule {
  condition {
    num_newer_versions = 0
    with_state         = "ARCHIVED"
  }
  action {
    type = "Delete"
  }
}
```

**Or**: Add pre-destroy hook in phoenix-rebuild.sh:
```bash
# Before terraform destroy
gsutil versioning set off gs://prod.tamshai.com
gsutil rm -r gs://prod.tamshai.com/**
```

---

### Issue #3: VPC Connector 409 Error (Already Exists)

**File**: `scripts/gcp/phoenix-rebuild.sh` (lines 362-367)

**Symptom**: `Error creating Connector: googleapi: Error 409: Requested entity already exists`

**Root Cause**: The script uses `terraform state rm` which **ONLY removes the resource from Terraform's tracking** - it does NOT delete the actual GCP resource. The connector remains running in GCP.

**Current Code** (phoenix-rebuild.sh lines 362-367):
```bash
# Gap #25: Remove VPC connector from state BEFORE destroy
log_step "Removing VPC connector from state (Gap #25 - proactive)..."
terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
```

**Why This Doesn't Work**:
```
┌──────────────────────────────────────────────────────────────────────────┐
│  WHAT THE SCRIPT THINKS HAPPENS vs WHAT ACTUALLY HAPPENS                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Script Intent:                        Reality:                          │
│  ───────────────                       ────────                          │
│  1. Remove from state                  1. Connector removed from TF state│
│  2. terraform destroy                  2. TF skips connector (not in     │
│     (will delete connector)               state = nothing to destroy)    │
│  3. terraform apply                    3. GCP connector STILL EXISTS     │
│     (will create fresh connector)      4. TF tries to create connector   │
│                                        5. GCP returns 409 (already exists│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Timeline of Failure**:
```
T+0:00  phoenix-rebuild.sh: terraform state rm (removes from TF state)
T+0:01  VPC connector STILL EXISTS in GCP (never deleted!)
T+0:10  terraform destroy (skips connector - not in state)
T+0:30  terraform apply tries to create connector
T+0:31  GCP returns 409: "Requested entity already exists"
```

**Key Finding**: Nowhere in the scripts is there a `gcloud compute networks vpc-access connectors delete` command. The connector is NEVER actually deleted from GCP.

**Fix**: Actually DELETE the connector before state removal:
```bash
# Gap #25 FIX: ACTUALLY DELETE the connector, not just remove from state
log_step "Deleting VPC Access Connector (Gap #25 fix)..."
CONNECTOR_NAME="tamshai-prod-connector"

# First, actually delete from GCP
gcloud compute networks vpc-access connectors delete "$CONNECTOR_NAME" \
  --region=us-central1 --quiet 2>/dev/null || true

# Wait for deletion to complete (async operation takes 2-3 minutes)
while gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
  --region=us-central1 2>/dev/null; do
  echo "Waiting for VPC connector deletion (takes 2-3 minutes)..."
  sleep 15
done
echo "VPC connector deleted from GCP"

# THEN remove from state (cleanup)
terraform state rm 'module.networking.google_vpc_access_connector.serverless_connector[0]' 2>/dev/null || true
```

**Why Async Deletion Matters**:
- VPC connector deletion is asynchronous (2-3 minutes)
- Must poll until `gcloud describe` returns error (resource gone)
- Only then is it safe to run `terraform apply`

---

### Issue #4: Architecture Conflict - Terraform vs GitHub Actions (CRITICAL)

**Files Involved**:
- `infrastructure/terraform/modules/cloudrun/main.tf` (lines 1-550) - Terraform Cloud Run definitions
- `.github/workflows/deploy-to-gcp.yml` (lines 143-213) - GitHub Actions Cloud Run deployments

**Symptom**: Multiple issues cascade from this conflict:
- Domain mappings reference services that don't exist in Terraform state
- Environment variables differ between Terraform and workflow
- `terraform plan` shows drift (services exist but not managed by TF)
- Inconsistent service configurations between deploys

**Root Cause: BOTH SYSTEMS CREATE THE SAME RESOURCES**

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Terraform (gcp/main.tf)          GitHub Actions (deploy.yml)  │
│  ────────────────────────         ─────────────────────────── │
│  Creates Cloud Run services:      Also creates Cloud Run:      │
│  - keycloak                       - keycloak                   │
│  - mcp-gateway                    - mcp-gateway                │
│  - mcp-hr, mcp-finance...         - mcp-hr, mcp-finance...     │
│  - web-portal                     - web-portal                 │
│                                                                 │
│  Terraform State                  GCP Actual State             │
│  ───────────────                  ────────────────             │
│  "keycloak" → (created by TF)     "keycloak" → (updated by GH) │
│  ↑                                             │               │
│  └─────── STATE DRIFT ─────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Detailed Conflict Analysis**:

| Aspect | Terraform | GitHub Actions | Conflict |
|--------|-----------|----------------|----------|
| **Service Creation** | `google_cloud_run_service.keycloak` in cloudrun/main.tf | `gcloud run deploy keycloak` in deploy-to-gcp.yml | Both create same service |
| **Image Reference** | `image = "keycloak:${var.keycloak_image_tag}"` | `--image=...keycloak:v2.0.0-postgres` | Version can differ |
| **Environment Vars** | `var.keycloak_url` (may be empty) | Hardcoded `KEYCLOAK_URL=https://auth.tamshai.com/auth` | Different values |
| **Domain Mapping** | `google_cloud_run_domain_mapping.keycloak` references `google_cloud_run_service.keycloak.name` | Not managed | Depends on TF-managed service |

**Why This Causes Failures**:

1. **During Phoenix Rebuild**:
   - Terraform destroy removes services AND state
   - GitHub Actions deploys services (not tracked by TF)
   - Terraform apply tries to create services that already exist
   - Domain mappings fail because TF doesn't know about GH-created services

2. **During Normal Deployments**:
   - GitHub Actions updates services with new images/env vars
   - Terraform state shows old configuration
   - `terraform plan` shows unexpected changes
   - Running `terraform apply` reverts GH Actions changes

3. **Environment Variable Drift**:
   - Terraform: `KEYCLOAK_URL = var.keycloak_url` (dynamic, may be Cloud Run URL)
   - GitHub Actions: `KEYCLOAK_URL=https://auth.tamshai.com/auth` (hardcoded)
   - Result: Service works with one deployment method, breaks with the other

**Cascading Effects on Other Issues**:

| Gap # | How Architecture Conflict Causes It |
|-------|-------------------------------------|
| #62 | TF creates Cloud Run before images exist (TF manages services) |
| #63 | GH Actions hardcodes KEYCLOAK_URL differently than TF |
| #64 | Domain mapping references TF service, but service created by GH |
| #65 | Can't call domain-mapping.sh from TF if services not TF-managed |

**Historical Context: Why This Hybrid Approach Exists**

Looking at `docs/operations/PHOENIX_RECOVERY_IMPROVEMENTS.md`, four options were evaluated:

| Option | Approach | Verdict |
|--------|----------|---------|
| **A** | Phased Terraform Apply | **RECOMMENDED** |
| B | Placeholder Images | Too complex |
| C | GitHub Actions only | "Two sources of truth", "Configuration drift" |
| D | Terraform null_resource | Anti-pattern |

**The original recommendation was Option A (Terraform-only)**, and this worked in v3:
- PHOENIX_MANUAL_ACTIONSv3.md Phase 10: "SKIPPED (terraform already deployed all services)"
- Terraform successfully deployed all 7 Cloud Run services after images were built

**How the hybrid approach evolved**:
1. `deploy-to-gcp.yml` was created for **regular CI/CD** (feature deployments)
2. This workflow does BOTH build images AND deploy Cloud Run (coupled together)
3. During Phoenix rebuilds, someone started calling this workflow for convenience
4. This introduced the conflict - both Terraform AND GitHub Actions now manage Cloud Run

**The coupling problem in deploy-to-gcp.yml**:
```yaml
# Current: Build and Deploy are coupled
- name: Build and Push Keycloak
  run: |
    docker build -t ... keycloak
    docker push ...
- name: Deploy Keycloak        # <-- This conflicts with Terraform!
  run: gcloud run deploy keycloak ...
```

**Required Decision: Choose ONE Approach**

**Option A: Terraform-Only (Recommended for Phoenix)** ← User's preference
```hcl
# All Cloud Run services managed by Terraform
# GitHub Actions only builds images, doesn't deploy
```
- Pro: Single source of truth, state always accurate
- Pro: Domain mappings work correctly (reference TF-managed services)
- Pro: Already worked in Phoenix v3
- Con: Requires decoupling build from deploy in workflow

**Option B: GitHub Actions-Only**
```hcl
# Remove Cloud Run resources from Terraform
# GitHub Actions handles all deployments
```
- Pro: Simpler CI/CD, all logic in workflows
- Con: No Terraform state for Cloud Run
- Con: Domain mappings must be created manually or via gcloud
- Con: Against original design recommendation

**Option C: Hybrid with State Import**
```
Terraform: Infrastructure (VPC, SQL, buckets, IAM, domain mappings)
GitHub Actions: Application deployments (Cloud Run services only)

# Import GH-created services into TF state:
terraform import google_cloud_run_service.keycloak us-central1/keycloak
```
- Pro: Minimal changes required
- Con: Requires import after each fresh deploy
- Con: State can drift if not careful

**Important Clarification: The Conflict is Phoenix-Specific**

| Scenario | What happens | Conflict? |
|----------|--------------|-----------|
| **Regular CI/CD** | Push to main → GH Actions builds + deploys | **No** - Terraform not running |
| **Phoenix rebuild** | Terraform + GH Actions both try to create services | **YES** |

`deploy-to-gcp.yml` is the **production CI/CD pipeline**. It:
- Triggers on push to main (auto-deploy)
- Supports manual dispatch for selective deployments
- Has change detection, health checks, realm sync
- **Must NOT be modified to "build only"** - would break regular deployments

The conflict only occurs during **Phoenix rebuilds** when both Terraform and the workflow try to manage Cloud Run services from scratch.

---

**Proposed Fix for Phoenix v7 (Option A - Terraform-Only for Phoenix)**:

Keep `deploy-to-gcp.yml` unchanged for regular CI/CD. Create separate infrastructure for Phoenix:

**Step 1: Create Phoenix-specific build workflow**

```yaml
# .github/workflows/phoenix-build-images.yml (NEW - Phoenix use only)
name: Phoenix - Build All Images
on:
  workflow_dispatch:  # Manual trigger only

jobs:
  build-all:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}
      - name: Build and Push All Images (NO DEPLOY)
        run: |
          # Build all 7 images - Terraform will deploy them
          gcloud builds submit keycloak/ --tag=$AR_REPO/keycloak:v2.0.0-postgres
          gcloud builds submit services/mcp-gateway/ --tag=$AR_REPO/mcp-gateway:latest
          gcloud builds submit services/mcp-hr/ --tag=$AR_REPO/mcp-hr:latest
          gcloud builds submit services/mcp-finance/ --tag=$AR_REPO/mcp-finance:latest
          gcloud builds submit services/mcp-sales/ --tag=$AR_REPO/mcp-sales:latest
          gcloud builds submit services/mcp-support/ --tag=$AR_REPO/mcp-support:latest
          gcloud builds submit . -f clients/web/Dockerfile.prod --tag=$AR_REPO/web-portal:latest
          echo "Images built. Run 'terraform apply' to deploy."
```

**Step 2: Update phoenix-rebuild.sh**

```bash
# Phase 5: Build Images via Phoenix-specific workflow (NO DEPLOY)
log_step "Building container images..."
gh workflow run phoenix-build-images.yml --ref main
gh run watch --exit-status

# Phase 6: Terraform Apply (deploys Cloud Run using built images)
log_step "Deploying Cloud Run services via Terraform..."
terraform apply -auto-approve
# Terraform creates Cloud Run services
# Domain mappings reference TF-managed services - no conflict!

# Phase 7: DO NOT call deploy-to-gcp.yml!
# The workflow would conflict with Terraform-managed services
```

**Step 3: After Phoenix, resume normal CI/CD**

Once Phoenix is complete:
- Regular pushes to main trigger `deploy-to-gcp.yml` as usual
- GH Actions updates Cloud Run services (Terraform not running)
- No conflict because Terraform only runs during Phoenix

**Alternative: Option C (Import after Phoenix)**

If you prefer minimal changes, keep using `deploy-to-gcp.yml` for Phoenix but import services into Terraform state afterward:

```bash
# After deploy-to-gcp.yml completes during Phoenix:
for service in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
  terraform import "module.cloudrun.google_cloud_run_service.${service}" \
    "us-central1/${service}" 2>/dev/null || true
done
# Now Terraform state matches reality
```

**Pros**: No new workflows needed
**Cons**: Must remember to import after every Phoenix; state drift between imports

---

**Summary of Approaches**:

| Approach | Regular CI/CD | Phoenix Rebuild | Complexity |
|----------|---------------|-----------------|------------|
| **A: Phoenix-specific workflow** | `deploy-to-gcp.yml` (unchanged) | `phoenix-build-images.yml` + Terraform | Medium |
| **C: Import after Phoenix** | `deploy-to-gcp.yml` (unchanged) | Same workflow + `terraform import` | Low |

**Recommendation**: Option A is cleaner long-term (single source of truth during Phoenix), but Option C works with minimal changes if you're comfortable with post-Phoenix imports.

---

### Issue #5: Cloud Run Created Before Images Exist (Gap #62)

**File**: `scripts/gcp/phoenix-rebuild.sh` (Phase 5 vs Phase 6 order)

**Symptom**: Terraform apply fails with "Image not found" for Cloud Run services.

**Root Cause**: Phoenix rebuild order is:
1. Phase 5: Terraform apply (tries to create Cloud Run)
2. Phase 6: Build images (images now exist)

Cloud Run creation needs the image to exist first.

**Fix**: Reorder phases:
1. Build images FIRST
2. Then terraform apply with `--target` for Cloud Run

Or: Use `depends_on` in Terraform to skip Cloud Run until images ready (complex).

---

### Issue #6: deploy-gateway and sync-keycloak-realm Failures

**Files**:
- `.github/workflows/deploy-to-gcp.yml` (deploy-gateway job)
- `scripts/gcp/sync-keycloak-realm.sh`

**Symptom**: Jobs fail because Keycloak not reachable at auth.tamshai.com

**Root Cause**: The workflow assumes auth.tamshai.com DNS and certificate are already working. During Phoenix rebuild, domain mapping is created but certificate takes time to provision.

**Current Incorrect Logic**:
```yaml
# deploy-to-gcp.yml
KEYCLOAK_URL: https://auth.tamshai.com/auth  # Fails if cert not ready
```

**Fix**: Use Cloud Run URL during deploy, switch to domain after cert ready:
```bash
KEYCLOAK_URL=$(gcloud run services describe keycloak --region=us-central1 \
  --format="value(status.url)")/auth

# Later, after domain mapping ready:
KEYCLOAK_URL=https://auth.tamshai.com/auth
```

---

### Issue #7: Domain Mapping Not Managed by Terraform

**Files**:
- `infrastructure/terraform/modules/cloudrun/main.tf` (lines 532-551)
- `scripts/gcp/lib/domain-mapping.sh`

**Symptom**: Domain mappings don't exist after Terraform apply, must be created manually.

**Root Cause**: `google_cloud_run_domain_mapping.keycloak` depends on `google_cloud_run_service.keycloak`, but:
- If service created by GitHub Actions (not TF), the dependency fails
- TF doesn't know about the GH-created service
- Domain mapping resource is skipped or errors

**Connection to Issue #4**: This is a DIRECT consequence of the architecture conflict. Domain mappings CAN'T work properly when services are created outside Terraform.

**Fix (if using Terraform-managed services)**:
```hcl
resource "google_cloud_run_domain_mapping" "keycloak" {
  count    = var.keycloak_domain != "" ? 1 : 0
  location = var.region
  name     = var.keycloak_domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.keycloak.name
  }

  depends_on = [google_cloud_run_service.keycloak]
}
```

**Fix (if using GitHub Actions-managed services)**:
Add to deploy-to-gcp.yml:
```yaml
- name: Create domain mapping
  run: |
    source scripts/gcp/lib/domain-mapping.sh
    create_domain_mapping keycloak auth.tamshai.com
```

---

### Issue #8: Cloudflare 525 Despite Domain Mapping "Ready"

**Files**: `scripts/gcp/lib/domain-mapping.sh` (lines 49-77)

**Symptom**: `gcloud run domain-mappings describe` shows Ready, but HTTPS through Cloudflare returns 525.

**Root Cause**: The "Ready" status from GCP means:
- Domain mapping is configured
- DNS verification passed
- Certificate **request** submitted

It does NOT mean:
- Certificate is issued and deployed
- Origin server is returning valid TLS

**Certificate Propagation Timeline**:
```
T+0:00  Domain mapping created → Status: "Pending"
T+0:30  DNS verified → Status: "Ready" (MISLEADING!)
T+0:30  Certificate request submitted to Let's Encrypt
T+5:00  Certificate issued
T+10:00 Certificate deployed to Cloud Run edge
T+15:00 Full propagation to all edge locations
```

**Why 525 Occurs**:
1. Cloudflare receives request for auth.tamshai.com
2. Cloudflare connects to ghs.googlehosted.com (Cloud Run edge)
3. Cloud Run edge doesn't have certificate yet (still propagating)
4. TLS handshake fails → 525 error

**User Clarification**: "This is NOT a Cloudflare SSL mode issue! It is not a certificate issue as Cloudflare proxies these. All Cloudflare settings are correct."

**Correct Understanding**: The issue is timing. The ghs.googlehosted.com endpoint must have a valid certificate deployed before Cloudflare can connect. GCP's "Ready" status is premature - it doesn't wait for certificate deployment.

**Fix**: Add certificate verification to domain-mapping.sh:
```bash
wait_for_domain_ready() {
    local domain="$1"
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        # Check if HTTPS actually works, not just GCP status
        if curl -sf "https://${domain}/health" -o /dev/null 2>/dev/null; then
            echo "Domain $domain is fully ready (HTTPS working)"
            return 0
        fi
        echo "Waiting for certificate deployment (attempt $((attempt+1))/$max_attempts)..."
        sleep 30
        attempt=$((attempt+1))
    done
    echo "WARNING: Domain $domain certificate not ready after $((max_attempts * 30 / 60)) minutes"
    return 1
}
```

---

## Proposed Phoenix v7 Improvements

Based on the root cause analysis, the following changes would eliminate recurring manual interventions:

| Issue # | Fix | Owner | Effort |
|---------|-----|-------|--------|
| 1 | Update gcloud auth check in preflight | phoenix-preflight.sh | Low |
| 2 | Add lifecycle rule for noncurrent versions | storage/main.tf | Low |
| 3 | **Actually delete connector** (script only does `terraform state rm`, never `gcloud delete`) | phoenix-rebuild.sh | Medium |
| 4 | **Create `phoenix-build-images.yml`** (build only, no deploy) + let Terraform deploy Cloud Run | New workflow + phoenix-rebuild.sh | Medium |
| 5 | Reorder phases (build before TF apply) - solved by Issue #4 fix | phoenix-rebuild.sh | Low |
| 6 | Use dynamic KEYCLOAK_URL (Cloud Run URL → domain URL) | modules/cloudrun/main.tf | Low |
| 7 | Not needed if using Option A; OR auto-import after Phoenix if using Option C | phoenix-rebuild.sh | Low |
| 8 | Add HTTPS verification, not just GCP status | domain-mapping.sh | Low |

**Key Insight**: The conflict is **Phoenix-specific**. Regular CI/CD (`deploy-to-gcp.yml`) works fine because Terraform doesn't run during normal deployments. Don't modify `deploy-to-gcp.yml` - it would break regular CI/CD.

**Recommended Priority Order**:
1. **Issue #3 (VPC Connector)** - Blocks every rebuild, script never actually deletes the connector
2. **Issue #4 (Phoenix Build Workflow)** - Create `phoenix-build-images.yml` for Phoenix use; Terraform deploys
3. Issue #2 (Bucket versioning) - Blocks every rebuild
4. Issue #8 (Certificate wait) - Causes E2E test failures
5. Remaining issues - Lower impact

---

*Document completed: 2026-01-20T07:15:00Z*
*Last updated: 2026-01-20T09:00:00Z - Added Root Cause Analysis with historical context from v1-v5 documents*

---

## Issue #9: Provision Job Missing Secret Access (NEW - Found in v7 Testing)

**File**: `infrastructure/terraform/modules/security/main.tf`

**Symptom**: Terraform apply fails with:
```
Error code 9, message: Permission denied on secret: 
projects/XXX/secrets/tamshai-prod-keycloak-admin-password/versions/latest 
for service account tamshai-prod-provision@...
```

**Root Cause**: The provision job service account (`tamshai-prod-provision`) needs access to the `keycloak-admin-password` secret, but the IAM binding is created AFTER the job tries to deploy.

**Manual Fix**:
```bash
gcloud secrets add-iam-policy-binding tamshai-prod-keycloak-admin-password \
  --member="serviceAccount:tamshai-prod-provision@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Permanent Fix**: Add explicit `depends_on` in Terraform for provision job to wait for IAM bindings:
```hcl
resource "google_cloud_run_v2_job" "provision_users" {
  depends_on = [
    google_secret_manager_secret_iam_member.provision_keycloak_admin_password
  ]
  # ...
}
```

**Status**: Manual fix applied. Permanent fix TODO.

---

## Issue #10: Service Account Key Invalidated After Terraform Destroy (NEW - Found in v7 Testing)

**Files**: GitHub Secret `GCP_SA_KEY_PROD`, Terraform creates service account

**Symptom**: Phoenix build workflow fails with:
```
ERROR: (gcloud.auth.docker-helper) There was a problem refreshing auth tokens
('invalid_grant: Invalid JWT Signature.')
```

**Root Cause**: When Terraform destroys and recreates infrastructure:
1. Service accounts are destroyed
2. New service accounts are created with NEW keys
3. GitHub Secret `GCP_SA_KEY_PROD` still has the OLD key
4. Workflow authentication fails

**Manual Fix**:
```bash
# Create new key for the recreated service account
gcloud iam service-accounts keys create ./gcp-sa-key-temp.json \
  --iam-account=tamshai-prod-cicd@PROJECT.iam.gserviceaccount.com

# Update GitHub secret
gh secret set GCP_SA_KEY_PROD < ./gcp-sa-key-temp.json

# Clean up
rm ./gcp-sa-key-temp.json
```

**Permanent Fix**: Add to phoenix-rebuild.sh:
```bash
phase_post_destroy() {
    # After terraform destroy, save old key info
    # After terraform apply, regenerate keys and update GitHub secrets
}
```

**Status**: Manual fix applied. This should be automated in phoenix-rebuild.sh.

---

## Issue #11: Terraform Apply Timeout Causes 409 Conflicts (NEW - Found in v7 Testing)

**Symptom**: Terraform apply fails with:
```
Error: Error creating Service: googleapi: Error 409: Resource 'mcp-gateway' already exists.
Error: Error creating DomainMapping: googleapi: Error 409: Resource 'auth.tamshai.com' already exists.
```

**Root Cause**: Long-running Terraform operations can timeout on the client side while the resource is still being created in GCP:

1. Terraform starts creating `mcp-gateway` service (~20 minutes for first deploy with health checks)
2. Terraform starts creating `auth.tamshai.com` domain mapping (~15-20 minutes for DNS verification + certificate)
3. Client-side timeout occurs (my command timed out at ~10 minutes)
4. Resources ARE created in GCP (async operations completed)
5. Terraform state was NOT updated (client terminated early)
6. Retry `terraform apply` → GCP returns 409 (resources exist but not in state)

**Timeline**:
```
T+0:00   terraform apply starts creating mcp-gateway
T+0:00   terraform apply starts creating auth.tamshai.com domain mapping
T+10:00  Client timeout (state not updated)
T+15:00  GCP finishes creating domain mapping
T+20:00  GCP finishes creating mcp-gateway
T+20:01  User retries terraform apply
T+20:02  Terraform tries to create mcp-gateway → 409 "already exists"
T+20:02  Terraform tries to create auth.tamshai.com → 409 "already exists"
```

**Manual Fix** (import existing resources into state):
```bash
# Import mcp-gateway service
terraform import 'module.cloudrun.google_cloud_run_service.mcp_gateway' \
  'locations/us-central1/namespaces/PROJECT_ID/services/mcp-gateway'

# Import auth.tamshai.com domain mapping
terraform import 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' \
  'locations/us-central1/namespaces/PROJECT_ID/domainmappings/auth.tamshai.com'

# Retry apply
terraform apply
```

**Permanent Fix**: Increase Terraform timeouts for Cloud Run resources:
```hcl
resource "google_cloud_run_service" "mcp_gateway" {
  # ...
  timeouts {
    create = "30m"  # Default is 20m, increase to handle health check delays
    update = "30m"
  }
}

resource "google_cloud_run_domain_mapping" "keycloak" {
  # ...
  timeouts {
    create = "30m"  # Certificate provisioning can take 15-20 minutes
  }
}
```

**Alternative Fix**: Add post-apply recovery to phoenix-rebuild.sh:
```bash
# After terraform apply, if 409 errors occur, auto-import and retry
if ! terraform apply -auto-approve 2>&1 | grep -q "already exists"; then
    # Success
    exit 0
fi

# 409 errors detected - import and retry
for resource in mcp-gateway auth.tamshai.com; do
    terraform import ... "$resource" 2>/dev/null || true
done
terraform apply -auto-approve
```

**Status**: Manual fix applied (imports completed). Terraform apply succeeded after import.
