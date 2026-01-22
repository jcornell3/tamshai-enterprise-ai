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

## DNS Strategy

### Current DNS Configuration

| Domain | Target | Type | Purpose |
|--------|--------|------|---------|
| `api.tamshai.com` | `mcp-gateway-fn44nd7wba-uc.a.run.app` | CNAME | MCP Gateway API |
| `auth.tamshai.com` | `ghs.googlehosted.com` | CNAME | Keycloak (Cloud Run domain mapping) |
| `prod.tamshai.com` | GCS bucket website | CNAME | Static web portal |

**Note**: The `-uc` suffix in Cloud Run URLs indicates `us-central1`. New deployments in different regions get different URL suffixes (e.g., `-uw` for us-west1).

### DNS Problems During Regional Evacuation

#### Problem 1: Cloud Run URLs Are Region-Specific

When `api.tamshai.com` points to `mcp-gateway-fn44nd7wba-uc.a.run.app`:
- The URL is **permanently bound** to us-central1
- A new deployment in us-west1 gets a **different URL** (e.g., `mcp-gateway-xyz123-uw.a.run.app`)
- The CNAME must be updated to point to the new URL

**Impact**: After evacuation, `api.tamshai.com` will return errors until DNS is updated.

#### Problem 2: `ghs.googlehosted.com` Domain Mappings Are Region-Bound

Cloud Run domain mappings (`google_cloud_run_domain_mapping`) have a critical limitation:
- The mapping binds a domain to a Cloud Run service **in a specific region**
- You **cannot** create a domain mapping for `auth.tamshai.com` in us-west1 while the us-central1 mapping exists
- During an outage, you cannot delete the us-central1 mapping (Terraform state unreachable)

**Impact**: `auth.tamshai.com` cannot be remapped during evacuation without waiting for GCP to recover.

#### Problem 3: OAuth Redirect URIs

Keycloak clients (e.g., `tamshai-website`) have configured redirect URIs:
```
https://prod.tamshai.com/callback
https://api.tamshai.com/callback
```

If domains change during evacuation, OAuth flows will fail with "Invalid redirect_uri" errors.

### DNS Solution: Recovery CNAME Records

**Strategy**: Pre-configure DR CNAME records that can be activated during evacuation.

#### Pre-Configured DNS Records (Cloudflare)

| Domain | Normal State | During Evacuation |
|--------|--------------|-------------------|
| `api.tamshai.com` | `mcp-gateway-fn44nd7wba-uc.a.run.app` | Update to new us-west1 URL |
| `api-dr.tamshai.com` | Not configured (or placeholder) | Points to us-west1 MCP Gateway |
| `auth.tamshai.com` | `ghs.googlehosted.com` (us-central1 mapping) | **Cannot change** during outage |
| `auth-dr.tamshai.com` | `ghs.googlehosted.com` (us-west1 mapping) | Active during evacuation |
| `prod.tamshai.com` | GCS bucket | May need update if bucket recreated |

#### Pre-Configured OAuth Redirect URIs

Update Keycloak clients to accept **both** primary and recovery domains:

```json
{
  "clientId": "tamshai-website",
  "redirectUris": [
    "https://prod.tamshai.com/*",
    "https://prod-dr.tamshai.com/*",
    "https://api.tamshai.com/*",
    "https://api-dr.tamshai.com/*"
  ],
  "webOrigins": [
    "https://prod.tamshai.com",
    "https://prod-dr.tamshai.com"
  ]
}
```

**File to update**: `keycloak/realm-export.json`

### DNS Update Procedure During Evacuation

#### Step 1: Get New Cloud Run URLs

After evacuation completes, get the new service URLs:

```bash
# Get new URLs from Terraform output
cd infrastructure/terraform/gcp
terraform output mcp_gateway_url    # e.g., https://mcp-gateway-abc123-uw.a.run.app
terraform output keycloak_url       # e.g., https://keycloak-def456-uw.a.run.app
terraform output web_portal_url     # e.g., https://web-portal-ghi789-uw.a.run.app
```

#### Step 2: Update Cloudflare DNS

**Option A: Update Primary Domains** (if clients can handle brief downtime)

```bash
# Using Cloudflare API
# First, get the record ID for api.tamshai.com
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=api.tamshai.com&type=CNAME" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" | jq '.result[0].id'

# Update api.tamshai.com CNAME (replace RECORD_ID with value from above)
curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"CNAME\",\"name\":\"api\",\"content\":\"mcp-gateway-abc123-uw.a.run.app\",\"proxied\":true}"
```

**Option B: Create DR CNAME Record**

```bash
# Create auth-dr.tamshai.com CNAME (for Keycloak DR)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"CNAME\",\"name\":\"auth-dr\",\"content\":\"ghs.googlehosted.com\",\"proxied\":true}"
```

**Environment Variables**: `CF_API_TOKEN` and `CF_ZONE_ID` are stored as GitHub Secrets and should be exported before running these commands.

#### Step 3: Handle Keycloak Domain Mapping

**The `auth.tamshai.com` domain CANNOT be remapped** during the outage because:
1. `google_cloud_run_domain_mapping` in us-central1 still "owns" the domain
2. Creating the same mapping in us-west1 returns: `Domain is already mapped to another service`

**Solutions**:

| Approach | Pros | Cons |
|----------|------|------|
| Use `auth-dr.tamshai.com` | Works immediately | Clients must know about DR domain |
| Use raw Cloud Run URL | No domain mapping needed | URL is ugly, changes each deploy |
| Wait for GCP recovery | No DNS changes | Could be hours/days |
| Contact GCP Support | May release domain | Slow during major outage |

**Recommended**: Pre-provision `auth-dr.tamshai.com` domain mapping in us-west1:

```terraform
# In modules/cloudrun/main.tf - add recovery domain mapping
resource "google_cloud_run_domain_mapping" "keycloak_dr" {
  count = var.keycloak_dr_domain != "" ? 1 : 0

  name     = var.keycloak_dr_domain  # e.g., "auth-dr.tamshai.com"
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.keycloak.name
  }
}
```

#### Step 4: Update Web Portal Configuration

The web portal needs to know which Keycloak URL to use:

**Build-time configuration** (`clients/web/.env.production`):
```bash
# Primary
VITE_KEYCLOAK_URL=https://auth.tamshai.com/auth

# During evacuation, rebuild with:
VITE_KEYCLOAK_URL=https://auth-dr.tamshai.com/auth
```

**Or use runtime configuration** (recommended for DR):
```typescript
// In web portal code
const KEYCLOAK_URL = window.ENV?.KEYCLOAK_URL
  || import.meta.env.VITE_KEYCLOAK_URL
  || 'https://auth.tamshai.com/auth';
```

### DNS Propagation Time

| DNS Provider | Propagation Time | Notes |
|--------------|------------------|-------|
| Cloudflare (proxied) | ~30 seconds | Instant for proxied records |
| Cloudflare (DNS only) | 1-5 minutes | TTL-dependent |
| Route53 | 1-5 minutes | 60s default TTL |
| GoDaddy/others | 5-30 minutes | Varies by TTL |

**Cloudflare Advantage**: With proxied records, DNS changes take effect almost immediately because traffic routes through Cloudflare's edge network.

### Testing DNS Failover

#### Test 1: Recovery Domain Pre-Configuration

**Purpose**: Verify recovery domains can be mapped before an outage.

```bash
# 1. Create domain mapping for auth-dr.tamshai.com in us-west1
# (requires domain verification in Google Search Console first)

# 2. Add DNS record in Cloudflare pointing to ghs.googlehosted.com

# 3. Verify SSL certificate provisions (may take 15-30 minutes)
curl -I https://auth-dr.tamshai.com/auth/realms/tamshai-corp
# Should return 200 OK with valid SSL

# 4. Test OAuth flow with recovery domain
# Update test client to use auth-dr.tamshai.com
```

#### Test 2: DNS Update Speed

**Purpose**: Measure actual DNS propagation time.

```bash
# 1. Note current CNAME target
dig api.tamshai.com CNAME

# 2. Update CNAME in Cloudflare (via API or dashboard)
# Start timer

# 3. Poll until new target resolves
while true; do
  dig +short api.tamshai.com CNAME | grep -q "new-target" && break
  sleep 5
done
# Stop timer - record propagation time
```

### DNS Checklist for Evacuation Script

Add to `scripts/gcp/evacuate-region.sh`:

```bash
# Phase 7: DNS Configuration
log_phase "7" "DNS CONFIGURATION"

log_step "Getting new service URLs..."
NEW_GATEWAY_URL=$(terraform output -raw mcp_gateway_url)
NEW_KEYCLOAK_URL=$(terraform output -raw keycloak_url)
NEW_PORTAL_URL=$(terraform output -raw web_portal_url)

log_info "New MCP Gateway: $NEW_GATEWAY_URL"
log_info "New Keycloak: $NEW_KEYCLOAK_URL"
log_info "New Web Portal: $NEW_PORTAL_URL"

echo ""
log_warn "╔══════════════════════════════════════════════════════════════════╗"
log_warn "║                    MANUAL DNS UPDATES REQUIRED                   ║"
log_warn "╠══════════════════════════════════════════════════════════════════╣"
log_warn "║ Update the following DNS records in Cloudflare:                  ║"
log_warn "║                                                                  ║"
log_warn "║ 1. api.tamshai.com → ${NEW_GATEWAY_URL#https://}                 ║"
log_warn "║                                                                  ║"
log_warn "║ 2. auth.tamshai.com CANNOT be changed during outage.            ║"
log_warn "║    Use auth-dr.tamshai.com instead (pre-configured).            ║"
log_warn "║                                                                  ║"
log_warn "║ 3. Rebuild web portal with new Keycloak URL if needed:          ║"
log_warn "║    VITE_KEYCLOAK_URL=https://auth-dr.tamshai.com/auth           ║"
log_warn "╚══════════════════════════════════════════════════════════════════╝"
```

---

## DR Domain Implementation Requirements

### Overview

The `-dr` CNAME strategy requires changes across multiple files, scripts, and processes. This section documents all required modifications for a complete DR-aware system.

### Files Requiring DR Domain Updates

#### 1. Keycloak Realm Configuration

**File**: `keycloak/realm-export.json`

**Current State**: Redirect URIs and web origins only include primary domains.

**Required Changes**: Add `-dr` domains to all clients.

```json
{
  "clientId": "tamshai-website",
  "redirectUris": [
    "https://prod.tamshai.com/*",
    "https://prod-dr.tamshai.com/*",    // ADD
    "https://app.tamshai.com/*",
    "https://app-dr.tamshai.com/*"      // ADD
  ],
  "webOrigins": [
    "https://prod.tamshai.com",
    "https://prod-dr.tamshai.com",      // ADD
    "https://app.tamshai.com",
    "https://app-dr.tamshai.com"        // ADD
  ],
  "attributes": {
    "post.logout.redirect.uris": "...##https://prod-dr.tamshai.com/*##https://app-dr.tamshai.com/*"  // APPEND
  }
}
```

**Clients to update**:
- `tamshai-website` (main SSO client)
- `web-portal` (SPA portal)
- `mcp-gateway` (API gateway)
- `hr-app`, `finance-app`, `sales-app`, `support-app`

#### 2. Web Portal Auth Configuration

**File**: `clients/web/packages/auth/src/config.ts`

**Current State**: Detects `prod.tamshai.com` and `app.tamshai.com`.

**Required Changes**: Add DR hostname detection.

```typescript
// Add to getKeycloakConfig()
function getKeycloakConfig() {
  const hostname = window.location.hostname;
  const origin = window.location.origin;
  const basePath = getAppBasePath();

  // GCP Production - Primary OR Recovery
  // prod.tamshai.com / prod-dr.tamshai.com / app.tamshai.com / app-dr.tamshai.com
  const prodHosts = ['prod.tamshai.com', 'prod-dr.tamshai.com', 'app.tamshai.com', 'app-dr.tamshai.com'];
  if (prodHosts.includes(hostname)) {
    // Use environment variable which can be set differently for DR builds
    const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL;
    return {
      authority: keycloakUrl,
      client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'web-portal',
      redirect_uri: `${origin}${basePath}/callback`,
      post_logout_redirect_uri: origin,
    };
  }
  // ... rest of function
}
```

**Build-time DR configuration**:
```bash
# Primary build
VITE_KEYCLOAK_URL=https://auth.tamshai.com/auth/realms/tamshai-corp

# DR build
VITE_KEYCLOAK_URL=https://auth-dr.tamshai.com/auth/realms/tamshai-corp
```

#### 3. Dynamic URL Discovery Library

**File**: `scripts/gcp/lib/dynamic-urls.sh`

**Current State**: Falls back to `auth.tamshai.com` if Keycloak URL discovery fails.

**Required Changes**: Add DR-aware fallback logic.

```bash
# Modify discover_keycloak_url()
discover_keycloak_url() {
    local url
    url=$(discover_service_url "keycloak") || {
        # Check if we're in DR mode
        if [ "${DR_MODE:-false}" = "true" ]; then
            log_urls_warn "Falling back to auth-dr.tamshai.com (DR mode)" >&2
            echo "https://auth-dr.tamshai.com"
        else
            log_urls_warn "Falling back to auth.tamshai.com" >&2
            echo "https://auth.tamshai.com"
        fi
        return 0
    }
    echo "$url"
}

# Add DR mode detection
is_dr_mode() {
    # Check environment variable or Terraform workspace
    if [ "${DR_MODE:-false}" = "true" ]; then
        return 0
    fi
    # Check if env_id indicates recovery
    if [[ "${ENV_ID:-primary}" == recovery-* ]]; then
        return 0
    fi
    return 1
}
```

#### 4. GitHub Actions Workflows

**Files**:
- `.github/workflows/deploy-to-gcp.yml`
- `.github/workflows/phoenix-build-images.yml`

**Required Changes**: Add DR mode input and environment detection.

```yaml
# deploy-to-gcp.yml
inputs:
  dr_mode:
    description: 'Enable disaster recovery mode'
    required: false
    default: 'false'
    type: boolean

env:
  DR_MODE: ${{ inputs.dr_mode }}
  KEYCLOAK_DOMAIN: ${{ inputs.dr_mode == 'true' && 'auth-dr.tamshai.com' || 'auth.tamshai.com' }}
  PORTAL_DOMAIN: ${{ inputs.dr_mode == 'true' && 'prod-dr.tamshai.com' || 'prod.tamshai.com' }}
```

#### 5. E2E Test Configuration

**File**: `tests/e2e/specs/login-journey.ui.spec.ts`

**Required Changes**: Add DR environment support.

```typescript
const environments = {
  prod: {
    baseUrl: process.env.PROD_BASE_URL || 'https://prod.tamshai.com',
    keycloakUrl: process.env.PROD_KEYCLOAK_URL || 'https://auth.tamshai.com',
  },
  'prod-dr': {
    baseUrl: process.env.PROD_DR_BASE_URL || 'https://prod-dr.tamshai.com',
    keycloakUrl: process.env.PROD_DR_KEYCLOAK_URL || 'https://auth-dr.tamshai.com',
  },
};
```

### prod.tamshai.com (Static Website) - Recommended Approach

#### Current Configuration

```
prod.tamshai.com → CNAME → c.storage.googleapis.com
                          ↓
                   GCS Bucket: prod.tamshai.com (us-central1)
```

**Problem**: If us-central1 is down, the GCS bucket is inaccessible.

#### Solution: Multi-Regional Bucket

Change the static website bucket from regional to **multi-regional "US"**:

```terraform
# modules/storage/main.tf
resource "google_storage_bucket" "static_website" {
  name     = var.static_website_domain
  location = "US"  # Multi-regional - survives any single US region outage
  # ... rest of configuration unchanged
}
```

**Why This Approach**:
- **No DNS change needed** during evacuation - `prod.tamshai.com` continues to work
- **No web portal rebuild** required during evacuation
- **Minimal cost increase** - ~20% more for storage (negligible for static sites)
- **Simplest operations** - one less thing to manage during an incident

**Implementation**:
```bash
# Add variable to modules/storage/variables.tf
variable "static_website_location" {
  description = "Location for static website bucket (region or multi-region)"
  type        = string
  default     = "US"  # Multi-regional for DR resilience
}

# Update modules/storage/main.tf
resource "google_storage_bucket" "static_website" {
  name     = var.static_website_domain
  location = var.static_website_location  # Use variable instead of var.region
  # ...
}
```

**Note**: The existing bucket may need to be recreated since GCS bucket location cannot be changed in place. Plan for a brief outage or use `terraform state mv` with a new bucket.

### Recommended DR Domain Architecture

#### Target State

| Domain | Purpose | DNS Target | Notes |
|--------|---------|------------|-------|
| `prod.tamshai.com` | Web Portal | `c.storage.googleapis.com` | **Multi-regional bucket** - works in any US region |
| `api.tamshai.com` | MCP Gateway | Cloud Run URL (updated during DR) | CNAME updated via Cloudflare |
| `auth.tamshai.com` | Keycloak (primary) | `ghs.googlehosted.com` | Bound to us-central1 |
| `auth-dr.tamshai.com` | Keycloak (DR) | `ghs.googlehosted.com` | Pre-configured for us-west1 |

#### Why This Architecture

1. **`prod.tamshai.com` uses multi-regional bucket** → No action needed during evacuation
2. **`api.tamshai.com` CNAME is updated** → Simple DNS change (~30 seconds with Cloudflare)
3. **`auth-dr.tamshai.com` is pre-configured** → Avoids domain mapping conflict
4. **Web portal rebuilt with DR Keycloak URL** → Points to `auth-dr.tamshai.com`

---

### Pre-Evacuation Setup (Do Before Any Incident)

These steps must be completed **before** a regional outage occurs.

#### Step 1: Update Keycloak Realm with DR Domains

```bash
# Edit keycloak/realm-export.json to add DR redirect URIs
# Then apply to production Keycloak

./keycloak/scripts/sync-realm.sh prod
```

#### Step 2: Verify DR Domain in Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `auth-dr.tamshai.com`
3. Verify via DNS TXT record in Cloudflare

#### Step 3: Create DR Domain Mapping in us-west1

```bash
# This creates a "standby" Keycloak in us-west1 that's ready to receive traffic
# The service doesn't need to exist yet - mapping will activate when service deploys

gcloud run domain-mappings create \
  --domain=auth-dr.tamshai.com \
  --region=us-west1 \
  --service=keycloak
```

#### Step 4: Pre-Configure Cloudflare DNS

In Cloudflare dashboard, create these records:

| Type | Name | Target | Proxy | Status |
|------|------|--------|-------|--------|
| CNAME | `auth-dr` | `ghs.googlehosted.com` | Yes | Active (ready for DR) |
| CNAME | `api` | `mcp-gateway-fn44nd7wba-uc.a.run.app` | Yes | Active (will update during DR) |

#### Step 5: Convert Static Website Bucket to Multi-Regional

```bash
cd infrastructure/terraform/gcp

# Apply with multi-regional location
# NOTE: This requires bucket recreation - schedule brief maintenance window
terraform apply -var="static_website_location=US"
```

---

### During Evacuation Procedure

When us-central1 is confirmed down, execute these steps:

#### Step 1: Run Evacuation Script (15-20 minutes)

```bash
./scripts/gcp/evacuate-region.sh us-west1 us-west1-b recovery-$(date +%Y%m%d)
```

This script:
- Creates fresh Terraform state in us-west1
- Deploys all infrastructure (Cloud SQL, networking, etc.)
- Deploys Cloud Run services
- Configures test user TOTP
- Outputs new service URLs

#### Step 2: Update api.tamshai.com DNS (30 seconds)

Get the new MCP Gateway URL from script output, then update Cloudflare:

```bash
# Option A: Via Cloudflare Dashboard
# Update api.tamshai.com CNAME to new URL (e.g., mcp-gateway-xyz123-uw.a.run.app)

# Option B: Via Cloudflare API (if CF_API_TOKEN and CF_ZONE_ID are set)
# The evacuation script attempts this automatically
```

#### Step 3: Rebuild and Deploy Web Portal (5 minutes)

```bash
cd clients/web

# Build with DR Keycloak URL
VITE_KEYCLOAK_URL=https://auth-dr.tamshai.com/auth/realms/tamshai-corp \
  npm run build

# Deploy to multi-regional bucket (same bucket, different Keycloak URL baked in)
gsutil -m rsync -r -d dist/ gs://prod.tamshai.com/
```

**Note**: Since the bucket is multi-regional, `prod.tamshai.com` continues to work. Users don't need to change URLs.

#### Step 4: Verify Services

```bash
# Test Keycloak health
curl -sf https://auth-dr.tamshai.com/auth/health/ready

# Test MCP Gateway health
curl -sf https://api.tamshai.com/health

# Test web portal loads
curl -sf https://prod.tamshai.com/

# Run E2E tests
cd tests/e2e
TEST_ENV=prod-dr npm run test:login
```

#### Step 5: Communicate to Stakeholders

- Internal: "Production services have been evacuated to us-west1. All URLs remain the same."
- If needed: "Use `auth-dr.tamshai.com` if prompted for authentication issues."

---

### Post-Recovery Procedure

When us-central1 recovers:

#### Option A: Stay on DR (Recommended if stable)

1. Continue operating on us-west1
2. Clean up orphaned us-central1 resources later
3. Consider us-west1 as new primary

#### Option B: Migrate Back to Primary

1. **Verify primary region fully healthy** (wait 24-48 hours)
2. **Export any data changes** from DR databases
3. **Restore data to primary** Cloud SQL
4. **Rebuild web portal** with primary Keycloak URL:
   ```bash
   VITE_KEYCLOAK_URL=https://auth.tamshai.com/auth/realms/tamshai-corp \
     npm run build
   gsutil -m rsync -r -d dist/ gs://prod.tamshai.com/
   ```
5. **Revert api.tamshai.com DNS** to primary MCP Gateway URL
6. **Destroy DR stack** to avoid ongoing costs:
   ```bash
   cd infrastructure/terraform/gcp
   terraform init -reconfigure \
     -backend-config="bucket=tamshai-terraform-state-prod" \
     -backend-config="prefix=gcp/recovery/<ENV_ID>"
   terraform destroy -var="phoenix_mode=true"
   ```

### Summary: Required Code Changes

| File | Change | Status |
|------|--------|--------|
| `keycloak/realm-export.json` | Add `*-dr.tamshai.com` redirect URIs | 🔴 Required |
| `clients/web/packages/auth/src/config.ts` | Add `prod-dr.tamshai.com` hostname detection | 🔴 Required |
| `infrastructure/terraform/modules/storage/variables.tf` | Add `static_website_location` variable | 🔴 Required |
| `infrastructure/terraform/modules/storage/main.tf` | Use location variable for static bucket | 🔴 Required |
| `scripts/gcp/evacuate-region.sh` | Phase 7 DNS guidance | ✅ Done |
| `scripts/gcp/lib/dynamic-urls.sh` | Add DR_MODE fallback | 🟡 Recommended |
| `.github/workflows/deploy-to-gcp.yml` | Add `dr_mode` workflow input | 🟡 Recommended |
| `tests/e2e/specs/login-journey.ui.spec.ts` | Add `prod-dr` environment | 🟡 Recommended |

---

### Implementation Checklist

#### Phase 1: Pre-Evacuation Setup (Do Now)

**Keycloak Configuration**
- [ ] Edit `keycloak/realm-export.json`:
  - [ ] Add `https://prod-dr.tamshai.com/*` to all client `redirectUris`
  - [ ] Add `https://prod-dr.tamshai.com` to all client `webOrigins`
  - [ ] Add `https://auth-dr.tamshai.com/*` to `post.logout.redirect.uris`
- [ ] Run `./keycloak/scripts/sync-realm.sh prod` to apply changes
- [ ] Verify in Keycloak Admin UI that DR URIs are present

**Domain Verification**
- [ ] Add `auth-dr.tamshai.com` to Google Search Console
- [ ] Add DNS TXT verification record in Cloudflare
- [ ] Complete domain verification

**Domain Mapping**
- [ ] Create domain mapping: `gcloud run domain-mappings create --domain=auth-dr.tamshai.com --region=us-west1 --service=keycloak`
- [ ] Wait for SSL certificate provisioning (~15-30 minutes)
- [ ] Verify: `curl -I https://auth-dr.tamshai.com` returns valid SSL

**Cloudflare DNS**
- [ ] Create CNAME: `auth-dr` → `ghs.googlehosted.com` (proxied)
- [ ] Verify `api.tamshai.com` CNAME exists and note current target

**Static Website Bucket**
- [ ] Add `static_website_location` variable to `modules/storage/variables.tf`
- [ ] Update `modules/storage/main.tf` to use variable
- [ ] Schedule maintenance window for bucket migration
- [ ] Apply: `terraform apply -var="static_website_location=US"`
- [ ] Verify `prod.tamshai.com` still loads correctly

**Web Portal Auth Config**
- [ ] Update `clients/web/packages/auth/src/config.ts`:
  - [ ] Add `prod-dr.tamshai.com` to `prodHosts` array
- [ ] Test locally with mocked hostname

#### Phase 2: Validation Testing

- [ ] Test OAuth flow against `auth-dr.tamshai.com` (use test client)
- [ ] Run parallel stack test (see Testing Strategy section)
- [ ] Verify E2E tests pass with `TEST_ENV=prod-dr`
- [ ] Conduct tabletop exercise with on-call team
- [ ] Document any issues and remediate

#### Phase 3: Operational Readiness

- [x] Add Cloudflare API credentials to GitHub Secrets (for auto DNS update)
  - [x] `CF_API_TOKEN` - API token with DNS edit permissions
  - [x] `CF_ZONE_ID` - Zone ID for tamshai.com
- [ ] Update on-call runbook with evacuation procedure link
- [ ] Brief on-call team on evacuation script location and usage
- [ ] Schedule quarterly DR drill

---

### Long-Term DNS Solutions

#### Option 1: Global Load Balancer (Recommended for Production)

Google Cloud Load Balancer with serverless NEGs provides automatic failover:

```terraform
# Simplified - full config is more complex
resource "google_compute_region_network_endpoint_group" "mcp_gateway" {
  for_each = toset(["us-central1", "us-west1"])

  name                  = "mcp-gateway-neg-${each.key}"
  region                = each.key
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = "mcp-gateway"
  }
}

resource "google_compute_backend_service" "mcp_gateway" {
  name = "mcp-gateway-backend"

  dynamic "backend" {
    for_each = google_compute_region_network_endpoint_group.mcp_gateway
    content {
      group = backend.value.id
    }
  }
}
```

**Pros**: Automatic failover, no DNS changes needed during outage
**Cons**: ~$18/month for load balancer, more complex setup

#### Option 2: Multi-Region Cloud Run (Future GCP Feature)

GCP has announced plans for multi-region Cloud Run with automatic failover. Monitor for availability.

#### Option 3: Cloudflare Load Balancing

Use Cloudflare's load balancing with health checks:

```
api.tamshai.com → Cloudflare LB
                   ├── Pool: us-central1 (primary)
                   │   └── mcp-gateway-xxx-uc.a.run.app
                   └── Pool: us-west1 (failover)
                       └── mcp-gateway-yyy-uw.a.run.app
```

**Pros**: Works with current Cloud Run setup, fast failover
**Cons**: Additional Cloudflare cost (~$5/month for basic LB)

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
