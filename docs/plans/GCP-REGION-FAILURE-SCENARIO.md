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
