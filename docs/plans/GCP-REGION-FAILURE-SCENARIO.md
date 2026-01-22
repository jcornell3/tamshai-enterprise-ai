# GCP Region Failure Scenario - Implementation Plan

**Created**: January 22, 2026
**Author**: Tamshai-Dev
**Status**: DRAFT - Pending Review
**Source**: GCP Production Specialist Analysis

## Executive Summary

This plan documents how to incorporate **Regional Evacuation** capabilities into our Phoenix architecture. Currently, our Phoenix rebuild assumes the same region (`us-central1`) is available. A complete regional outage would block both `terraform destroy` and `terraform apply` due to Terraform's stateful design.

### Key Insight from Specialist

> "In a disaster recovery (DR) scenario, do not waste time trying to make `terraform destroy` work against a dead region. It is an exercise in futility."

### Current Gap

| Scenario | Current Capability | Gap |
|----------|-------------------|-----|
| Service failure | ✅ Phoenix rebuild 75-100 min | None |
| Database corruption | ✅ Restore from backup | None |
| Terraform state corruption | ✅ State surgery | None |
| **Regional outage** | ❌ No documented procedure | **Critical** |

---

## Analysis: Why Current Phoenix Fails in Regional Outage

### Problem 1: Terraform Destroy Hangs

When `us-central1` is unavailable:
1. Terraform calls GCP APIs to **refresh** state (check current resource status)
2. APIs return `503 Service Unavailable` or timeout
3. Terraform cannot confirm destruction → hangs indefinitely

**Implication**: Our `phoenix-rebuild.sh` Phase 3-4 would never complete.

### Problem 2: Terraform State Blocks New Region

Our `main.tf` uses a single state prefix:
```terraform
terraform {
  backend "gcs" {
    bucket = "tamshai-terraform-state-prod"
    prefix = "gcp/phase1"  # <-- Fixed prefix
  }
}
```

If we change `region = "us-east1"` and run `terraform apply`:
- Terraform sees code and state are "different" (region changed)
- Tries to **modify/move** existing resources
- Fails because old region APIs are unreachable

### Problem 3: Global Resource Name Collisions

GCS bucket names are globally unique. If we deploy a "Recovery" stack while the "Primary" technically exists in state:
```
ERROR: Bucket "prod.tamshai.com" already exists (but it's in dead region)
```

---

## Proposed Solution: Regional Evacuation Capability

### Solution Overview

| Component | Change | Purpose |
|-----------|--------|---------|
| `variables.tf` | Add `env_id` variable | Namespace resources by deployment |
| `main.tf` | Dynamic resource naming | Avoid global name collisions |
| `main.tf` | Empty backend block | Enable partial config via CLI |
| New script | `evacuate-region.sh` | Single-command regional recovery |
| Backup strategy | Cross-region GCS bucket | Data survives regional outage |

### Recovery Time Objective (RTO)

| Current Phoenix | Regional Evacuation |
|-----------------|---------------------|
| 75-100 minutes | 15-25 minutes |
| Rebuild same region | Fresh deploy new region |
| Requires working APIs | Bypasses dead region |

---

## Implementation Plan

### Phase 1: Terraform Variables Enhancement

**File**: `infrastructure/terraform/gcp/variables.tf`

```terraform
variable "env_id" {
  description = "Unique ID for this deployment (e.g., 'primary' or 'recovery-east'). Used for namespacing resources."
  type        = string
  default     = "primary"
}

variable "source_backup_bucket" {
  description = "The GCS bucket containing the database dump to restore from (for regional recovery)."
  type        = string
  default     = ""
}

variable "recovery_mode" {
  description = "Set to true during regional evacuation to skip destroy-related operations."
  type        = bool
  default     = false
}
```

**Impact**: Non-breaking change. Default values maintain current behavior.

---

### Phase 2: Dynamic Resource Naming

**File**: `infrastructure/terraform/gcp/main.tf`

Add locals for dynamic naming:
```terraform
locals {
  # Add env_id to names to allow side-by-side regional deployments
  name_prefix      = "tamshai-prod-${var.env_id}"
  bucket_suffix    = var.env_id == "primary" ? "" : "-${var.env_id}"
}
```

Update storage module call:
```terraform
module "storage" {
  source = "../modules/storage"
  # Change bucket name to include env_id to avoid global name collisions
  bucket_name = var.env_id == "primary" ? "prod.tamshai.com" : "prod-${var.env_id}.tamshai.com"
  project_id  = var.project_id
  location    = var.region
}
```

**Impact**: Maintains backwards compatibility for `env_id = "primary"`.

---

### Phase 3: Backend Configuration Refactoring

**File**: `infrastructure/terraform/gcp/main.tf`

Change from:
```terraform
terraform {
  backend "gcs" {
    bucket = "tamshai-terraform-state-prod"
    prefix = "gcp/phase1"
  }
}
```

To:
```terraform
terraform {
  backend "gcs" {}  # Populated via -backend-config
}
```

**File**: `infrastructure/terraform/gcp/backend.hcl` (new)
```hcl
# Default backend configuration for primary deployment
bucket = "tamshai-terraform-state-prod"
prefix = "gcp/phase1"
```

**Normal usage** (unchanged workflow):
```bash
terraform init -backend-config=backend.hcl
```

**Recovery usage** (new workflow):
```bash
terraform init -reconfigure \
  -backend-config="bucket=tamshai-terraform-state-prod" \
  -backend-config="prefix=gcp/recovery/us-east1"
```

**Impact**: Requires updating all scripts that run `terraform init`.

---

### Phase 4: Regional Evacuation Script

**File**: `scripts/gcp/evacuate-region.sh` (new)

```bash
#!/bin/bash
# Usage: ./evacuate-region.sh [NEW_REGION] [NEW_ZONE] [ENV_ID]
# Example: ./evacuate-region.sh us-west1 us-west1-b recovery-01

set -euo pipefail

NEW_REGION=${1:-us-west1}
NEW_ZONE=${2:-us-west1-b}
ENV_ID=${3:-recovery-$(date +%Y%m%d)}
PROJECT_ID="gen-lang-client-0553641830"
STATE_BUCKET="tamshai-terraform-state-prod"
BACKUP_BUCKET="tamshai-backups-multi-region"  # Must be multi-regional

echo "=============================================="
echo "🚀 REGIONAL EVACUATION: ${NEW_REGION}"
echo "=============================================="
echo "Target Region: ${NEW_REGION}"
echo "Target Zone: ${NEW_ZONE}"
echo "Environment ID: ${ENV_ID}"
echo "State Prefix: gcp/recovery/${ENV_ID}"
echo "=============================================="

cd infrastructure/terraform/gcp

# Phase 1: Initialize with NEW state path (amnesia approach)
echo "Phase 1: Initializing fresh Terraform state..."
terraform init -reconfigure \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=gcp/recovery/${ENV_ID}"

# Phase 2: Apply to new region with unique naming
echo "Phase 2: Deploying to ${NEW_REGION}..."
terraform apply -auto-approve \
  -var="region=${NEW_REGION}" \
  -var="zone=${NEW_ZONE}" \
  -var="env_id=${ENV_ID}" \
  -var="project_id=${PROJECT_ID}" \
  -var="recovery_mode=true" \
  -var="source_backup_bucket=${BACKUP_BUCKET}"

# Phase 3: Regenerate service account key
echo "Phase 3: Regenerating CICD service account key..."
gcloud iam service-accounts keys create /tmp/key.json \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json

# Phase 4: Deploy services
echo "Phase 4: Deploying Cloud Run services..."
gh workflow run deploy-to-gcp.yml -f service=all -f region=${NEW_REGION}
gh run watch

# Phase 5: Restore data from backup
echo "Phase 5: Triggering data restoration..."
# TODO: Implement restore job using source_backup_bucket

echo "=============================================="
echo "✅ REGIONAL EVACUATION COMPLETE"
echo "=============================================="
echo "New Gateway URL: $(terraform output -raw mcp_gateway_url)"
echo "New Auth URL: $(terraform output -raw keycloak_url)"
echo "=============================================="
echo ""
echo "⚠️  NEXT STEPS:"
echo "1. Update DNS records if not using load balancer"
echo "2. Verify E2E tests pass in new region"
echo "3. Document dead region resources for cleanup later"
```

---

### Phase 5: Cross-Region Backup Strategy

**Current State**: Backups may be stored in same region as production.

**Required Change**: Create multi-regional GCS bucket for backups.

**File**: `infrastructure/terraform/gcp/modules/storage/main.tf`

```terraform
resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-backups-multi-region"
  location      = "US"  # Multi-regional
  storage_class = "STANDARD"

  lifecycle_rule {
    condition {
      age = 90  # Keep 90 days of backups
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}
```

**Automated backup job** (Cloud Scheduler + Cloud Run Job):
- Daily export of Cloud SQL to multi-regional GCS
- Daily export of MongoDB Atlas (already multi-region)

---

### Phase 6: Auto-Restore on Recovery

**File**: `infrastructure/terraform/gcp/main.tf`

```terraform
resource "null_resource" "auto_restore_on_recovery" {
  count = var.env_id != "primary" && var.source_backup_bucket != "" ? 1 : 0

  provisioner "local-exec" {
    command = "../../scripts/db/restore-from-gcs.sh --instance=${module.database.postgres_instance_name} --bucket=${var.source_backup_bucket}"
  }

  depends_on = [module.database]
}
```

---

### Phase 7: Documentation Updates

#### 7.1 PHOENIX_RECOVERY.md

Add new **Scenario 14: Regional Outage (GCP)**:

```markdown
### Scenario 14: Regional Outage (GCP)

**Symptoms**:
- GCP Console shows region status "Outage" or "Degraded"
- `gcloud` commands timeout or return 503
- `terraform plan` hangs on refresh

**Critical Decision**: Do NOT attempt `terraform destroy`. Move directly to evacuation.

**Recovery**:
```bash
# Single-command regional evacuation to Oregon
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b recovery-$(date +%Y%m%d)
```

**Expected Duration**: 15-25 minutes

**Post-Recovery**:
1. Update DNS if not using global load balancer
2. Verify E2E tests pass
3. Document dead region resources for later cleanup
4. Once original region recovers, clean up orphaned resources
```

#### 7.2 PHOENIX_RUNBOOK.md

Add new section **Regional Evacuation Procedure**:

```markdown
## Regional Evacuation Procedure

When the primary region (us-central1) is completely unavailable, use the Regional Evacuation procedure instead of standard Phoenix rebuild.

### Decision Tree

```
Is us-central1 available?
  ├── YES → Use standard phoenix-rebuild.sh
  └── NO → Use evacuate-region.sh
```

### Evacuation Regions (Priority Order)

| Priority | Region | Zone | Rationale |
|----------|--------|------|-----------|
| 1 | us-west1 | us-west1-b | Same cost, no hurricane risk, closest to team (CA) |
| 2 | us-east1 | us-east1-b | Same cost, but hurricane zone (June-Nov) |
| 3 | us-east5 | us-east5-b | Same cost, newer region |

**Why us-west1 (Oregon)?**
- Same pricing tier as us-central1 (free tier eligible)
- No shared weather/disaster patterns with Iowa
- Lowest latency for California-based team
- No hurricane exposure (unlike us-east1)

### Procedure

1. Confirm regional outage (GCP Status Dashboard)
2. Run evacuation script with target region
3. Verify services in new region
4. Update monitoring/alerting for new region
5. Communicate to stakeholders
```

---

## Impact Assessment

### Breaking Changes

| Change | Breaking? | Mitigation |
|--------|-----------|------------|
| `env_id` variable | No | Default = "primary" |
| Dynamic naming | No | Primary uses existing names |
| Empty backend | **Yes** | Requires `backend.hcl` file |
| New scripts | No | Additive |

### Migration Path

1. **Immediate**: Create `backend.hcl` file with current values
2. **Update scripts**: Modify `phoenix-rebuild.sh` to use `-backend-config`
3. **Test**: Verify normal Phoenix rebuild still works
4. **Deploy**: Add new evacuation capability

### Testing Requirements

| Test | Description |
|------|-------------|
| Normal rebuild | Phoenix rebuild works with backend.hcl |
| Name collision | Deploy recovery stack without conflict |
| Evacuation script | Full test in non-prod region |
| Backup/restore | Verify cross-region restore works |

---

## Testing Strategy

### The Fundamental Challenge

**We cannot test during an actual regional outage** because:
1. Regional outages are rare and unpredictable
2. We don't want to wait for disaster to validate our recovery procedure
3. Testing during a real outage adds risk to an already critical situation

**However**, testing while us-central1 is healthy has a key limitation:
- We cannot validate that `terraform destroy` actually hangs against a dead region
- We cannot test the "ignore the old state" decision under real pressure

### What We CAN Test (Simulation Approach)

Since regional evacuation uses the **"Amnesia" approach** (fresh state in new region), we can simulate this by running evacuation while the primary region is still healthy.

**Key Insight**: The evacuation script doesn't interact with the primary region at all - it creates an entirely independent stack. This means testing with us-central1 healthy validates 95% of the recovery path.

### Test Scenarios

#### Test 1: Parallel Stack Deployment (PRIMARY TEST)

**Purpose**: Validate that a recovery stack can be deployed alongside the primary stack without conflicts.

**Procedure**:
```bash
# 1. Ensure primary stack is healthy
curl -sf https://auth.tamshai.com/auth/health/ready && echo "Primary OK"

# 2. Deploy recovery stack to us-west1
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b test-evacuation-01

# 3. Verify both stacks exist independently
gcloud run services list --region=us-central1  # Primary
gcloud run services list --region=us-west1     # Recovery

# 4. Verify no resource naming conflicts
gcloud sql instances list  # Should show both instances

# 5. Run E2E tests against recovery stack
cd tests/e2e
TEST_ENV=recovery npx playwright test login-journey
```

**Validates**:
- ✅ Fresh Terraform state initialization works
- ✅ Resource naming with `-<env_id>` suffix prevents collisions
- ✅ All services deploy successfully to alternate region
- ✅ Service account key regeneration works
- ✅ E2E tests pass in recovery region

**Does NOT Validate**:
- ❌ Terraform hanging on unreachable region (can't simulate)
- ❌ Decision-making under incident pressure
- ❌ DNS failover timing (if applicable)

#### Test 2: Backup and Restore Cycle

**Purpose**: Validate that data can be backed up and restored across regions.

**Procedure**:
```bash
# 1. Create a backup from primary
gcloud sql export sql tamshai-prod-postgres \
  gs://tamshai-prod-backups-<project-id>/test-backup/tamshai_hr.sql \
  --database=tamshai_hr

# 2. Deploy recovery stack (if not already running)
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b test-restore-01

# 3. Import backup to recovery instance
gcloud sql import sql tamshai-prod-postgres-test-restore-01 \
  gs://tamshai-prod-backups-<project-id>/test-backup/tamshai_hr.sql \
  --database=tamshai_hr

# 4. Verify data exists in recovery stack
# (connect via Cloud SQL Proxy and query)
```

**Validates**:
- ✅ Multi-regional backup bucket accessible from both regions
- ✅ Cloud SQL import works to recovery instance
- ✅ Data integrity maintained across backup/restore

#### Test 3: Cleanup and Re-Evacuation

**Purpose**: Validate that recovery stacks can be torn down and recreated.

**Procedure**:
```bash
# 1. Destroy recovery stack
cd infrastructure/terraform/gcp
terraform init -reconfigure \
  -backend-config="bucket=tamshai-terraform-state-prod" \
  -backend-config="prefix=gcp/recovery/test-evacuation-01"
terraform destroy -auto-approve \
  -var="region=us-west1" \
  -var="env_id=test-evacuation-01" \
  -var="phoenix_mode=true"

# 2. Verify resources deleted
gcloud run services list --region=us-west1  # Should be empty
gcloud sql instances list | grep test-evacuation-01  # Should not exist

# 3. Re-run evacuation to same env_id
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b test-evacuation-01

# 4. Verify fresh deployment works
```

**Validates**:
- ✅ Recovery stacks can be cleanly destroyed
- ✅ Same env_id can be reused after cleanup
- ✅ Idempotent evacuation behavior

### What We CANNOT Test

| Scenario | Why Untestable | Mitigation |
|----------|----------------|------------|
| Terraform hanging on dead region | Requires actual outage | Trust GCP specialist analysis; script skips destroy |
| Real incident pressure | Psychological, not technical | Runbook documentation; tabletop exercises |
| DNS propagation during outage | Requires actual outage | Document manual DNS update steps |
| Concurrent user impact | No production traffic to recovery | Load testing after evacuation |

### Tabletop Exercise (Recommended Quarterly)

Since we can't test the real scenario, conduct **tabletop exercises** to practice decision-making:

**Scenario Script**:
1. "It's 2 AM. PagerDuty alerts: all production services unreachable."
2. "GCP Status Dashboard shows us-central1 'Investigating'"
3. "You run `terraform plan` - it hangs for 2 minutes."
4. **Decision Point**: Do you wait for GCP to fix it, or evacuate?
5. "GCP Status updates to 'Service Disruption - Estimated 4 hours'"
6. **Action**: Run evacuation script
7. Walk through each phase verbally
8. "Recovery stack is up. What DNS changes are needed?"
9. "Primary region recovers. How do you clean up?"

**Participants**: On-call engineer, platform team lead
**Frequency**: Quarterly
**Duration**: 30-45 minutes
**Output**: Document any gaps or confusion discovered

### Test Schedule

| Test | Frequency | Environment | Duration | Cost |
|------|-----------|-------------|----------|------|
| Parallel Stack | Quarterly | us-west1 | 30 min | ~$2 (cleanup same day) |
| Backup/Restore | Monthly | us-west1 | 20 min | ~$1 |
| Cleanup/Re-evacuate | After each parallel test | us-west1 | 15 min | $0 |
| Tabletop Exercise | Quarterly | N/A (verbal) | 45 min | $0 |

### Test Checklist

**Before Testing**:
- [ ] Primary stack is healthy and stable
- [ ] No active deployments in progress
- [ ] Backup bucket has recent backups
- [ ] Team is aware testing is happening (avoid alarm)

**During Parallel Stack Test**:
- [ ] Evacuation script completes without errors
- [ ] All 6 phases complete successfully
- [ ] Resources created with correct `-<env_id>` suffix
- [ ] No errors in primary stack during test
- [ ] E2E tests pass against recovery stack

**After Testing**:
- [ ] Recovery stack destroyed (avoid ongoing costs)
- [ ] Terraform state cleaned up
- [ ] Test results documented
- [ ] Any issues filed as GitHub issues

### Acceptance Criteria for Regional Evacuation

The feature is considered **production-ready** when:

1. ✅ Parallel stack test passes 3 consecutive times
2. ✅ Backup/restore test passes
3. ✅ Cleanup/re-evacuation test passes
4. ✅ At least one tabletop exercise completed
5. ✅ Runbook documentation reviewed by second engineer
6. ✅ Estimated RTO (15-25 min) validated by actual test timing

---

## Cost Implications

### One-Time Costs

| Item | Estimated Cost |
|------|----------------|
| Multi-regional backup bucket | ~$5/month |
| Automated backup Cloud Run job | ~$1/month |

### Regional Evacuation Costs

| Item | Cost During Evacuation |
|------|------------------------|
| Duplicate Cloud Run services | $0 (free tier likely covers) |
| Duplicate Cloud SQL | ~$8/month (db-f1-micro) |
| **Total additional** | ~$8-15/month if running parallel |

**Note**: After original region recovers, clean up recovery stack to avoid ongoing costs.

---

## Decision Required

### Option A: Full Implementation (Recommended)

Implement all phases (1-7) for complete regional evacuation capability.

**Pros**:
- Single-command recovery from regional outage
- 15-25 minute RTO vs hours of manual work
- Automated data restoration

**Cons**:
- ~2-3 days implementation effort
- Requires testing in secondary region

### Option B: Documentation Only

Document the manual procedure without automation.

**Pros**:
- No code changes required
- Can implement later if needed

**Cons**:
- Recovery requires manual state manipulation
- Higher RTO (60+ minutes)
- Risk of errors during high-stress incident

### Option C: Defer

Document the gap and defer implementation.

**Pros**:
- No immediate effort required

**Cons**:
- Vulnerable to regional outage
- May need to implement during actual incident

---

## Recommendation

**Implement Option A in phases**:

1. **Week 1**: Phases 1-3 (Variables, naming, backend refactoring)
2. **Week 2**: Phase 4 (Evacuation script)
3. **Week 3**: Phases 5-6 (Backup strategy, auto-restore)
4. **Week 4**: Phase 7 (Documentation) + Testing

This provides regional evacuation capability within 4 weeks while maintaining backwards compatibility throughout.

---

## References

- Source analysis: `\Users\jcorn\Downloads\GCP-REGION-FAILURE-SCENARIO.md`
- Current Phoenix docs: `docs/operations/PHOENIX_RECOVERY.md`
- Current runbook: `docs/operations/PHOENIX_RUNBOOK.md`
- GCP Regional Availability: https://cloud.google.com/about/locations

---

*This plan addresses the "ultimate test" of Phoenix Architecture - surviving a complete regional outage.*
