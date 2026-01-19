# Phoenix Recovery Process Improvements

## Overview

This document details proposed improvements to the Phoenix Rebuild process for GCP Production. The Phoenix Rebuild is a complete teardown and recreation of the production environment from scratch.

**Document Created**: January 18, 2026
**Context**: During Phoenix rebuild testing, a chicken-and-egg dependency was identified between Terraform Cloud Run service creation and container image availability.

---

## Problem Statement

### Current Issue

The Phoenix rebuild process encounters failures when Terraform attempts to create Cloud Run services before container images exist in Artifact Registry:

```
Terraform apply
  ├── Creates VPC, Subnets, Firewall ─────────────────── SUCCESS
  ├── Creates Service Accounts, IAM ──────────────────── SUCCESS
  ├── Creates Cloud SQL PostgreSQL ───────────────────── SUCCESS
  ├── Creates GCS Buckets ────────────────────────────── SUCCESS
  ├── Creates Artifact Registry ──────────────────────── SUCCESS
  ├── Creates Cloud Run Job (provision-users) ────────── FAILS (no image)
  ├── Creates Cloud Run Service (keycloak) ───────────── FAILS (no image)
  ├── Creates Cloud Run Service (mcp-gateway) ────────── FAILS (no image)
  ├── Creates Cloud Run Service (mcp-hr) ─────────────── FAILS (no image)
  ├── Creates Cloud Run Service (mcp-finance) ────────── FAILS (no image)
  ├── Creates Cloud Run Service (mcp-sales) ──────────── FAILS (no image)
  ├── Creates Cloud Run Service (mcp-support) ────────── FAILS (no image)
  └── Creates Cloud Run Service (web-portal) ─────────── FAILS (no image)
```

**Error Messages:**
```
Error: Error waiting to create Service: resource is in failed state "Ready:False",
message: Image 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-hr:latest' not found.
```

### Root Cause

Terraform's dependency graph creates Artifact Registry before Cloud Run services, but it cannot build container images. The images are built by Cloud Build (triggered by `deploy-to-gcp.yml`), which runs after Terraform.

### Current Workaround

1. Run `terraform apply` (partial failure expected)
2. Manually build images via Cloud Build
3. Re-run `terraform apply` to create Cloud Run services

This approach works but requires manual intervention and multiple terraform runs.

---

## Proposed Solutions

### Option A: Phased Terraform Apply (Recommended)

Split `terraform apply` into two phases using `-target` flags to control resource creation order.

#### Implementation

**Phase 1: Infrastructure Only**
```bash
terraform apply -auto-approve \
  -target=google_storage_bucket.terraform_state \
  -target=module.networking \
  -target=module.security \
  -target=module.database \
  -target=module.storage \
  -target=module.utility_vm \
  -target=module.cloudrun.google_artifact_registry_repository.tamshai
```

This creates:
- Terraform state bucket
- VPC, subnets, firewall rules, NAT, VPC connector
- Service accounts, IAM bindings, Secret Manager secrets
- Cloud SQL PostgreSQL instance and databases
- GCS buckets (finance-docs, public-docs, static website)
- Utility VMs (if enabled)
- Artifact Registry repository

**Phase 2: Build Container Images**
```bash
gcloud builds submit --config=scripts/gcp/cloudbuild-all-images.yaml
```

This builds and pushes all container images to Artifact Registry.

**Phase 3: Complete Terraform**
```bash
terraform apply -auto-approve
```

Now creates Cloud Run services successfully (images exist).

#### Advantages
- No changes to Terraform configuration required
- Maintains Terraform as single source of truth
- Clear dependency ordering
- Can be fully automated in a script

#### Disadvantages
- Requires maintaining list of target modules
- Three terraform commands instead of one
- New Cloud Build config file needed

#### Required Files

**scripts/gcp/cloudbuild-all-images.yaml**
```yaml
# Cloud Build configuration to build all service images
# Used during Phoenix rebuild before Cloud Run services are created

steps:
  # Build Keycloak image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/keycloak:v2.0.0-postgres'
      - '-f'
      - 'keycloak/Dockerfile'
      - 'keycloak'
    id: 'build-keycloak'

  # Build MCP Gateway image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-gateway:latest'
      - '-f'
      - 'services/mcp-gateway/Dockerfile'
      - 'services/mcp-gateway'
    id: 'build-mcp-gateway'

  # Build MCP HR image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-hr:latest'
      - '-f'
      - 'services/mcp-hr/Dockerfile'
      - 'services/mcp-hr'
    id: 'build-mcp-hr'

  # Build MCP Finance image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-finance:latest'
      - '-f'
      - 'services/mcp-finance/Dockerfile'
      - 'services/mcp-finance'
    id: 'build-mcp-finance'

  # Build MCP Sales image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-sales:latest'
      - '-f'
      - 'services/mcp-sales/Dockerfile'
      - 'services/mcp-sales'
    id: 'build-mcp-sales'

  # Build MCP Support image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-support:latest'
      - '-f'
      - 'services/mcp-support/Dockerfile'
      - 'services/mcp-support'
    id: 'build-mcp-support'

  # Build Web Portal image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/web-portal:latest'
      - '-f'
      - 'clients/web/Dockerfile'
      - 'clients/web'
    id: 'build-web-portal'

  # Build Provision Job image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai-prod/provision-job:latest'
      - '-f'
      - 'scripts/gcp/provision-job/Dockerfile'
      - '.'
    id: 'build-provision-job'

# Push all images
images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/keycloak:v2.0.0-postgres'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-gateway:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-hr:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-finance:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-sales:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-support:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai/web-portal:latest'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/tamshai-prod/provision-job:latest'

options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'

timeout: '1800s'  # 30 minutes
```

---

### Option B: Placeholder Images

Use a placeholder image (like `gcr.io/cloudrun/hello`) in Terraform, then update services with real images via deploy workflow.

#### Implementation

**Terraform Configuration Change (modules/cloudrun/variables.tf)**
```hcl
variable "use_placeholder_images" {
  description = "Use placeholder images for initial creation (Phoenix rebuild)"
  type        = bool
  default     = false
}

variable "placeholder_image" {
  description = "Placeholder image for initial Cloud Run service creation"
  type        = string
  default     = "gcr.io/cloudrun/hello"
}
```

**Terraform Configuration Change (modules/cloudrun/main.tf)**
```hcl
resource "google_cloud_run_service" "mcp_suite" {
  for_each = toset(["hr", "finance", "sales", "support"])

  template {
    spec {
      containers {
        image = var.use_placeholder_images ? var.placeholder_image : "${var.artifact_registry}/mcp-${each.key}:latest"
      }
    }
  }
}
```

**Phoenix Rebuild Usage**
```bash
# Create with placeholder images
terraform apply -var="use_placeholder_images=true"

# Deploy real images
gh workflow run deploy-to-gcp.yml

# Update Terraform state (optional, for consistency)
terraform apply -var="use_placeholder_images=false"
```

#### Advantages
- Single terraform apply command
- Simple conceptually
- No target flags needed

#### Disadvantages
- Services temporarily run placeholder image
- Requires Terraform variable changes
- State may show placeholder image until next apply
- Health checks may fail during placeholder phase

---

### Option C: Remove Cloud Run from Terraform

Let `deploy-to-gcp.yml` workflow fully manage Cloud Run services (create and update), while Terraform only manages infrastructure.

#### Implementation

**Remove from Terraform:**
- `module.cloudrun.google_cloud_run_service.*`
- Keep: `module.cloudrun.google_artifact_registry_repository.tamshai`

**Update deploy-to-gcp.yml:**
```yaml
- name: Deploy MCP Gateway
  run: |
    gcloud run deploy mcp-gateway \
      --image=${{ env.REGISTRY }}/mcp-gateway:${{ github.sha }} \
      --region=${{ env.REGION }} \
      --platform=managed \
      --vpc-connector=tamshai-prod-connector \
      --service-account=tamshai-prod-mcp-gateway@${{ env.PROJECT_ID }}.iam.gserviceaccount.com \
      --set-env-vars="..." \
      --allow-unauthenticated  # or --no-allow-unauthenticated
```

#### Advantages
- No dependency issues
- Simpler Terraform configuration
- Deploy workflow has full control

#### Disadvantages
- **Two sources of truth** for Cloud Run configuration
- Loses infrastructure-as-code benefits
- Configuration drift possible
- Harder to audit/review changes
- Service account and networking still in Terraform (partial dependency)

---

### Option D: Terraform null_resource with Cloud Build

Use Terraform's `null_resource` with `local-exec` provisioner to trigger Cloud Build before Cloud Run services.

#### Implementation

```hcl
resource "null_resource" "build_images" {
  depends_on = [google_artifact_registry_repository.tamshai]

  triggers = {
    # Rebuild when source changes (use git commit hash)
    source_hash = var.source_commit_hash
  }

  provisioner "local-exec" {
    command = "gcloud builds submit --config=scripts/gcp/cloudbuild-all-images.yaml --project=${var.project_id}"
    working_dir = "${path.root}/../../.."
  }
}

resource "google_cloud_run_service" "mcp_gateway" {
  depends_on = [null_resource.build_images]
  # ... rest of configuration
}
```

#### Advantages
- Single terraform apply
- Automated image building
- Dependency explicitly defined

#### Disadvantages
- Mixes Terraform with external processes (anti-pattern)
- Cloud Build runs every terraform apply (unless triggers managed)
- Requires gcloud CLI on terraform runner
- Long terraform apply times (includes build)
- Harder to debug build failures

---

## Recommendation

**Option A (Phased Terraform Apply)** is recommended for the following reasons:

1. **No Terraform Changes**: Uses existing Terraform configuration with `-target` flags
2. **Clean Separation**: Clear phases with explicit purposes
3. **Automation Ready**: Can be scripted for repeatable execution
4. **Debugging**: Each phase can be run/debugged independently
5. **Standard Practice**: Target-based applies are common for complex dependencies

---

## Proposed Phoenix Rebuild Sequence

### Updated Sequence

| Step | Description | Command/Workflow |
|------|-------------|------------------|
| 1a | Terraform Infrastructure | `terraform apply -target=...` (infrastructure only) |
| 1b | Build All Images | `gcloud builds submit --config=cloudbuild-all-images.yaml` |
| 1c | Terraform Cloud Run | `terraform apply` (complete) |
| 2 | Deploy Services | `deploy-to-gcp.yml` workflow |
| 3 | Provision Users | `provision-prod-users.yml` workflow |
| 4 | Provision Data | `provision-prod-data.yml` workflow |
| 5 | E2E Tests | `e2e-tests.yml` workflow or manual |

### Automation Script

**scripts/infra/phoenix-rebuild.sh**
```bash
#!/bin/bash
# =============================================================================
# Phoenix Rebuild Script - GCP Production
# =============================================================================
# Complete teardown and rebuild of GCP production environment.
#
# Usage:
#   ./scripts/infra/phoenix-rebuild.sh [--destroy-only] [--skip-destroy]
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate permissions
#   - terraform CLI installed
#   - gh CLI authenticated for workflow triggers
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TERRAFORM_DIR="$PROJECT_ROOT/infrastructure/terraform/gcp"

GCP_PROJECT="${PROJECT_ID}"
GCP_REGION="us-central1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
DESTROY_ONLY=false
SKIP_DESTROY=false
for arg in "$@"; do
  case $arg in
    --destroy-only) DESTROY_ONLY=true ;;
    --skip-destroy) SKIP_DESTROY=true ;;
  esac
done

echo "=============================================="
echo "   PHOENIX REBUILD - GCP Production"
echo "=============================================="
echo "Project: $GCP_PROJECT"
echo "Region:  $GCP_REGION"
echo "=============================================="

# Confirmation
read -p "This will DESTROY and REBUILD production. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  log_error "Aborted."
  exit 1
fi

# =============================================================================
# Step 0: Terraform Destroy (if not skipped)
# =============================================================================
if [ "$SKIP_DESTROY" = false ]; then
  log_info "Step 0: Destroying existing infrastructure..."
  cd "$TERRAFORM_DIR"

  # Disable deletion protection for Cloud SQL
  gcloud sql instances patch tamshai-prod-postgres \
    --no-deletion-protection \
    --project=$GCP_PROJECT 2>/dev/null || true

  terraform destroy -auto-approve

  log_info "Infrastructure destroyed."
fi

if [ "$DESTROY_ONLY" = true ]; then
  log_info "Destroy-only mode. Exiting."
  exit 0
fi

# =============================================================================
# Step 1a: Terraform Apply - Infrastructure Only
# =============================================================================
log_info "Step 1a: Creating infrastructure (no Cloud Run services)..."
cd "$TERRAFORM_DIR"

terraform init

terraform apply -auto-approve \
  -target=google_storage_bucket.terraform_state \
  -target=module.networking \
  -target=module.security \
  -target=module.database \
  -target=module.storage \
  -target=module.utility_vm \
  -target=module.cloudrun.google_artifact_registry_repository.tamshai

log_info "Infrastructure created."

# =============================================================================
# Step 1b: Build All Container Images
# =============================================================================
log_info "Step 1b: Building all container images..."
cd "$PROJECT_ROOT"

gcloud builds submit \
  --config=scripts/gcp/cloudbuild-all-images.yaml \
  --project=$GCP_PROJECT

log_info "Images built and pushed to Artifact Registry."

# =============================================================================
# Step 1c: Terraform Apply - Complete (Cloud Run Services)
# =============================================================================
log_info "Step 1c: Creating Cloud Run services..."
cd "$TERRAFORM_DIR"

terraform apply -auto-approve

log_info "Cloud Run services created."

# =============================================================================
# Step 2: Deploy Services via GitHub Actions
# =============================================================================
log_info "Step 2: Triggering deploy-to-gcp.yml workflow..."
cd "$PROJECT_ROOT"

gh workflow run deploy-to-gcp.yml --ref main

# Wait for workflow to start
sleep 5
RUN_ID=$(gh run list --workflow=deploy-to-gcp.yml --limit 1 --json databaseId -q '.[0].databaseId')
log_info "Workflow run ID: $RUN_ID"
log_info "Waiting for deployment to complete..."

gh run watch $RUN_ID

log_info "Deployment complete."

# =============================================================================
# Step 3: Provision Users
# =============================================================================
log_info "Step 3: Triggering provision-prod-users.yml workflow..."

gh workflow run provision-prod-users.yml --ref main -f dry_run=false

sleep 5
RUN_ID=$(gh run list --workflow=provision-prod-users.yml --limit 1 --json databaseId -q '.[0].databaseId')
log_info "Waiting for user provisioning to complete..."

gh run watch $RUN_ID

log_info "User provisioning complete."

# =============================================================================
# Step 4: Provision Sample Data
# =============================================================================
log_info "Step 4: Triggering provision-prod-data.yml workflow..."

gh workflow run provision-prod-data.yml --ref main -f data_set=all -f dry_run=false

sleep 5
RUN_ID=$(gh run list --workflow=provision-prod-data.yml --limit 1 --json databaseId -q '.[0].databaseId')
log_info "Waiting for data provisioning to complete..."

gh run watch $RUN_ID

log_info "Data provisioning complete."

# =============================================================================
# Step 5: E2E Tests
# =============================================================================
log_info "Step 5: Running E2E tests..."

cd "$PROJECT_ROOT/tests/e2e"
npm run test:login:prod

log_info "E2E tests complete."

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=============================================="
echo "   PHOENIX REBUILD COMPLETE"
echo "=============================================="
echo ""
log_info "All steps completed successfully."
echo ""
echo "Next steps:"
echo "  1. Verify services at https://prod.tamshai.com"
echo "  2. Check Cloud Run console for service health"
echo "  3. Review Cloud SQL connections"
echo ""
```

---

## Additional Improvements Identified

### 1. Terraform Destroy Blockers

During Phoenix rebuild testing, the following resources blocked `terraform destroy`:

| Resource | Blocker | Solution |
|----------|---------|----------|
| Cloud SQL | `deletion_protection = true` | Disable via gcloud before destroy |
| GCS Buckets | `force_destroy = false` | Empty buckets manually or set `force_destroy = true` |
| VPC | Active VPC connector | Delete connector first |

**Recommendation**: Add a pre-destroy script or Terraform configuration option for Phoenix rebuilds.

### 2. Secret Manager Versions

Secrets created by Terraform may not have initial versions, causing Cloud Run failures:

```
Error: Secret mcp-hr-service-client-secret/versions/latest was not found
```

**Recommendation**: Ensure all secrets have initial versions created by Terraform or sync from GitHub Secrets.

### 3. Resource Import

Resources created outside Terraform (manually or by other processes) need to be imported:

```bash
terraform import module.security.google_cloud_run_v2_job.provision_users \
  projects/PROJECT_ID/locations/REGION/jobs/provision-users
```

**Recommendation**: Document all importable resources and include import commands in Phoenix rebuild docs.

---

## Service Account Key Management

### Problem

When `terraform destroy` runs, it deletes the CICD service account (`tamshai-prod-cicd`). When `terraform apply` recreates it, **a completely new service account is created** with a new identity. The old service account key stored in GitHub Secrets (`GCP_SA_KEY_PROD`) is now invalid.

**Symptom**: Deploy workflow fails with:
```
ERROR: (gcloud.auth.docker-helper) There was a problem refreshing auth tokens:
('invalid_grant: Invalid JWT Signature.')

denied: Unauthenticated request. Unauthenticated requests do not have permission
"artifactregistry.repositories.uploadArtifacts"
```

### Solution: Automated Key Regeneration

The `claude-deployer` service account has been granted `roles/iam.serviceAccountKeyAdmin`, enabling automated key management during Phoenix rebuilds.

#### Required IAM Role

```bash
# Grant serviceAccountKeyAdmin to claude-deployer (one-time setup)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:claude-deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountKeyAdmin"
```

#### Key Regeneration Process

After `terraform apply` creates new service accounts:

```bash
# 1. Create new key for CICD service account
gcloud iam service-accounts keys create ./gcp-sa-key-prod.json \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}

# 2. Update GitHub secret
gh secret set GCP_SA_KEY_PROD < ./gcp-sa-key-prod.json

# 3. Clean up local key file (SECURITY: never commit!)
rm ./gcp-sa-key-prod.json

# 4. Verify key works
gcloud iam service-accounts keys list \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}
```

### Integration into Phoenix Rebuild Sequence

The updated Phoenix rebuild sequence includes key regeneration as **Step 1d**:

| Step | Description | Automated |
|------|-------------|-----------|
| 1a | Terraform destroy | Yes |
| 1b | Terraform apply (infrastructure) | Yes |
| 1c | Build all container images | Yes |
| **1d** | **Regenerate CICD service account key** | **Yes** |
| 1e | Terraform apply (Cloud Run services) | Yes |
| 2 | Deploy services (deploy-to-gcp.yml) | Yes |
| 3 | Provision users | Yes |
| 4 | Provision data | Yes |
| 5 | E2E tests | Yes |

### Future Improvement: Workload Identity Federation

**Best Practice**: Replace service account keys with Workload Identity Federation (WIF). This eliminates stored keys entirely by allowing GitHub Actions to authenticate directly to GCP using OIDC tokens.

**Benefits of WIF**:
- No keys to rotate or manage
- No secrets to store in GitHub
- Short-lived credentials (automatic expiry)
- Better audit trail

**Implementation**:
```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-actions" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Provider for GitHub
gcloud iam workload-identity-pools providers create-oidc "github" \
  --location="global" \
  --workload-identity-pool="github-actions" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Allow GitHub repo to impersonate service account
gcloud iam service-accounts add-iam-policy-binding \
  tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository/OWNER/REPO"
```

**Status**: Planned for future implementation. Current solution uses regenerated keys.

---

## References

- [Terraform Target Documentation](https://developer.hashicorp.com/terraform/cli/commands/plan#target-resource-address)
- [Cloud Build Configuration](https://cloud.google.com/build/docs/build-config-file-schema)
- [Cloud Run Deployment](https://cloud.google.com/run/docs/deploying)
- [Phoenix Rebuild Sequence](../plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md)

---

## Appendix: Lessons Learned (January 2026)

### Issues Encountered During Phoenix Rebuild Testing

1. **Cloud SQL deletion_protection**: Must be disabled via `gcloud sql instances patch --no-deletion-protection` before terraform destroy

2. **GCS bucket contents**: Buckets with objects cannot be deleted with `force_destroy = false`. Either empty first or temporarily set `force_destroy = true`

3. **gsutil Python version**: gsutil requires Python 3.9-3.13, but system had 3.14. Use `gcloud storage` commands instead

4. **Terraform state bucket**: If state bucket is deleted, must be recreated manually before `terraform init`

5. **VPC connector dependency**: VPC connector must be deleted before VPC can be destroyed

6. **Cloud Run Job image**: provision-job image must be built before terraform can create the Cloud Run Job

7. **Secret versions**: Secrets without versions cause Cloud Run service creation to fail

8. **Resource already exists**: Resources created outside of terraform state need to be imported

9. **Service account keys invalidated**: Terraform destroy deletes service accounts. After terraform apply recreates them, **new keys must be generated** and GitHub Secrets (`GCP_SA_KEY_PROD`) must be updated. The deploy workflow will fail with `invalid_grant: Invalid JWT Signature` if the old key is used.

10. **Static website bucket already exists**: The static website bucket (`prod.tamshai.com`) may already exist from a previous deployment. Terraform will fail with "bucket already exists" error. Either import the bucket or delete it manually before apply.

11. **MongoDB URI secret not created by Terraform**: The `tamshai-prod-mongodb-uri` secret is expected by MCP services but is not created by the Terraform security module. It must be created manually and populated with the value from GitHub secret `MONGODB_ATLAS_URI_PROD`.

12. **Secret Manager IAM bindings incomplete**: After Phoenix rebuild, service accounts may lack `secretmanager.secretAccessor` role on specific secrets. Terraform creates the secrets but IAM bindings may not be complete for all service account/secret combinations.

13. **Static website bucket IAM missing for CICD**: The `tamshai-prod-cicd` service account needs `roles/storage.admin` (not just `objectAdmin`) to use `gcloud storage rsync`. The `storage.admin` role includes `storage.buckets.get` permission required for rsync operations. Grant at project level:
    ```bash
    gcloud projects add-iam-policy-binding PROJECT_ID \
      --member="serviceAccount:tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com" \
      --role="roles/storage.admin"
    ```

14. **Cloud SQL private IP changes after Phoenix rebuild**: The Cloud SQL instance gets a new private IP after destroy/apply. Hardcoded IPs in deploy workflow (Keycloak KC_DB_URL) must be updated. **Solution**: After terraform apply, get the new IP and update deploy-to-gcp.yml:
    ```bash
    NEW_IP=$(gcloud sql instances describe tamshai-prod-postgres --project=PROJECT_ID --format="value(ipAddresses[0].ipAddress)")
    echo "Update deploy-to-gcp.yml KC_DB_URL with: jdbc:postgresql://${NEW_IP}:5432/keycloak"
    ```

15. **Cloud Run service URLs change after Phoenix rebuild**: Cloud Run service URLs include the project number (e.g., `https://keycloak-1046947015464.us-central1.run.app`). After Phoenix rebuild, the MCP Gateway environment variables (KEYCLOAK_URL, JWKS_URI, MCP_*_URL) must be updated to reflect the new URLs. Custom domain mappings (auth.tamshai.com) also need to be reconfigured.

16. **CICD service account missing Cloud SQL IAM**: After Phoenix rebuild, the `tamshai-prod-cicd` service account lacks `roles/cloudsql.client` permission needed for Cloud SQL Proxy connections. The provision-prod-users workflow fails with:
    ```
    googleapi: Error 403: boss::NOT_AUTHORIZED: Not authorized to access resource.
    Possibly missing permission cloudsql.instances.get on resource instances/tamshai-prod-postgres
    ```
    **Solution**: Grant the role after terraform apply:
    ```bash
    gcloud projects add-iam-policy-binding PROJECT_ID \
      --member="serviceAccount:tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com" \
      --role="roles/cloudsql.client"
    ```

17. **Cloud SQL private IP not accessible from GitHub Actions**: Cloud SQL only has private IP (no public IP for security). GitHub Actions runners run on the public internet and **cannot connect to private IPs** even with Cloud SQL Proxy and IAM authentication. The Cloud SQL Proxy fails with:
    ```
    instance does not have IP of type "PUBLIC"
    (connection name = "${PROJECT_ID}:us-central1:tamshai-prod-postgres")
    ```
    **Solution**: Use Cloud Run Job instead of direct connection. The `provision-users` Cloud Run Job:
    - Runs inside VPC via VPC connector
    - Uses Cloud SQL Proxy with `--private-ip` flag
    - Has access to all required secrets

    **Architecture**:
    ```
    GitHub Actions -> gcloud run jobs execute -> Cloud Run Job (VPC) -> Cloud SQL (private IP)
    ```

    The `provision-prod-users.yml` workflow was refactored to execute the Cloud Run Job:
    ```bash
    gcloud run jobs execute provision-users \
      --region=us-central1 \
      --update-env-vars="ACTION=all,DRY_RUN=false" \
      --async
    ```

    **Anti-pattern**: Do NOT enable public IP on Cloud SQL just to allow GitHub Actions access. This creates a security vulnerability.

18. **Cloud Run Job has outdated Keycloak URL**: After Phoenix rebuild, Cloud Run service URLs change (include project number). The `provision-users` Cloud Run Job's KEYCLOAK_URL environment variable still points to the old URL.

    **Symptom**: Job fails with connection refused or 404 errors when trying to authenticate with Keycloak.

    **Solution**: Update the Cloud Run Job after Phoenix rebuild:
    ```bash
    # Get the new Keycloak URL
    NEW_KC_URL=$(gcloud run services describe keycloak --region=us-central1 --format="value(status.url)")/auth

    # Update the provision-users job
    gcloud run jobs update provision-users \
      --region=us-central1 \
      --update-env-vars="KEYCLOAK_URL=$NEW_KC_URL"
    ```

    **Also update**: The `provision-prod-users.yml` workflow's `KEYCLOAK_URL` environment variable.

    **Future improvement**: Store Keycloak URL in Secret Manager or use service discovery instead of hardcoding.

19. **Keycloak admin password with special characters fails auth**: The Keycloak admin password may contain special characters like `*`, `&`, `#` etc. that need URL-encoding when used in HTTP POST form data. Without encoding, curl sends malformed data and auth fails.

    **Symptom**: "[WARN] Could not get Keycloak admin token" even though password is correct.

    **Solution**: URL-encode the password before using in curl:
    ```bash
    urlencode() {
        python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))"
    }
    KC_PASS_ENCODED=$(urlencode "$KC_ADMIN_PASSWORD")
    curl -d "password=${KC_PASS_ENCODED}" ...
    ```

    The entrypoint.sh has been updated to URL-encode all password fields.

20. **Python3 not installed in provision-job image**: The URL encoding fix (Issue #19) uses `python3` for URL encoding, but the base image (`node:20-bookworm-slim`) does not include Python. The job fails with:
    ```
    /entrypoint.sh: line 30: python3: command not found
    Container called exit(127).
    ```

    **Solution**: Update the Dockerfile to install python3:
    ```dockerfile
    RUN apt-get update && apt-get install -y --no-install-recommends \
        postgresql-client \
        curl \
        ca-certificates \
        netcat-openbsd \
        bash \
        python3 \
        jq \
        && rm -rf /var/lib/apt/lists/*
    ```

    Then rebuild and deploy the image:
    ```bash
    gcloud builds submit --config=scripts/gcp/provision-job/cloudbuild.yaml --project=PROJECT_ID
    NEW_DIGEST=$(gcloud artifacts docker images describe \
      us-central1-docker.pkg.dev/PROJECT_ID/tamshai-prod/provision-job:latest \
      --format="value(image_summary.digest)")
    gcloud run jobs update provision-users \
      --region=us-central1 \
      --image="us-central1-docker.pkg.dev/PROJECT_ID/tamshai-prod/provision-job@$NEW_DIGEST"
    ```

21. **Keycloak image tag mismatch**: Terraform references `keycloak:v2.0.0-postgres` but the deploy workflow only tags with `${{ github.sha }}` and `latest`. After Phoenix rebuild, terraform apply fails with:
    ```
    Image 'us-central1-docker.pkg.dev/.../keycloak:v2.0.0-postgres' not found.
    ```

    **Solution**: Update `.github/workflows/deploy-to-gcp.yml` to also tag with `v2.0.0-postgres`:
    ```yaml
    - name: Build and Push
      run: |
        docker build -t ${{ env.AR_REPO }}/keycloak:${{ github.sha }} \
                     -t ${{ env.AR_REPO }}/keycloak:latest \
                     -t ${{ env.AR_REPO }}/keycloak:v2.0.0-postgres \
                     keycloak
        docker push ${{ env.AR_REPO }}/keycloak:${{ github.sha }}
        docker push ${{ env.AR_REPO }}/keycloak:latest
        docker push ${{ env.AR_REPO }}/keycloak:v2.0.0-postgres
    ```

    **Immediate fix**: Tag the existing `latest` image:
    ```bash
    gcloud artifacts docker tags add \
      us-central1-docker.pkg.dev/PROJECT_ID/tamshai/keycloak:latest \
      us-central1-docker.pkg.dev/PROJECT_ID/tamshai/keycloak:v2.0.0-postgres
    ```

22. **Cloud SQL private IP hardcoded in Terraform**: The Keycloak `KC_DB_URL` in `modules/cloudrun/main.tf` had a hardcoded IP (`10.180.0.3`) instead of using the dynamic IP from the database module. After Phoenix rebuild, Cloud SQL may get a different private IP.

    **Symptom**: Keycloak fails to start with "container failed to start and listen on the port".

    **Solution**: Update Terraform to use dynamic IP:
    ```hcl
    # In modules/cloudrun/variables.tf - add variable
    variable "postgres_private_ip" {
      description = "Cloud SQL PostgreSQL private IP address"
      type        = string
    }

    # In modules/cloudrun/main.tf - use variable
    env {
      name  = "KC_DB_URL"
      value = "jdbc:postgresql://${var.postgres_private_ip}:5432/keycloak"
    }

    # In gcp/main.tf - pass the value
    postgres_private_ip = module.database.postgres_private_ip
    ```

23. **Domain mapping not created by Terraform**: After Phoenix rebuild, the `auth.tamshai.com` domain mapping for Keycloak was missing. The `google_cloud_run_domain_mapping.keycloak` resource exists in Terraform but wasn't being created.

    **Root cause**: The `keycloak_domain` variable was set correctly (`auth.tamshai.com`) but the domain mapping wasn't in Terraform state after Phoenix rebuild.

    **Solution**: Run `terraform apply` to create the domain mapping. Ensure DNS is configured to point to `ghs.googlehosted.com` (CNAME record).

24. **mcp-hr-service client secret mismatch**: The identity sync fails with Keycloak authentication error because the client secret in Keycloak doesn't match the secret in GCP Secret Manager.

    **Symptom**: provision-users job shows:
    ```
    Authenticating with Keycloak...
    Identity sync failed
    ```

    **Root cause**: The `sync-realm.sh` script was getting `MCP_HR_SERVICE_CLIENT_SECRET` from GitHub Secrets, but the Cloud Run Job uses the secret from GCP Secret Manager (`mcp-hr-service-client-secret`). These two sources had different values.

    **Solution**: Updated `deploy-to-gcp.yml` to fetch `MCP_HR_SERVICE_CLIENT_SECRET` from GCP Secret Manager instead of GitHub Secrets:
    ```yaml
    # In sync-keycloak-realm job
    export MCP_HR_SERVICE_CLIENT_SECRET=$(gcloud secrets versions access latest --secret=mcp-hr-service-client-secret)
    ```

    **Principle**: GCP Secret Manager is the single source of truth for production secrets. All components (Keycloak, Cloud Run Jobs, Cloud Run Services) should use the same secret from Secret Manager.

25. **Trailing whitespace in GCP Secret Manager secret**: The identity sync still failed after fixing Issue #24 because the secret in GCP Secret Manager contained trailing `\r\r\n` (Windows line endings).

    **Symptom**: "Network response was not OK" during Keycloak client_credentials authentication. The log showed `secretLength: 46` but the actual secret should be 44 characters.

    **Root cause**: The secret was created with trailing Windows line endings (`0d 0d 0a`). These extra characters caused the authentication to fail because the secret didn't match.

    **Diagnosis**:
    ```bash
    # Check raw bytes of secret
    gcloud secrets versions access latest --secret=mcp-hr-service-client-secret | xxd
    # Output showed: ...qM6/PuSGilg=\r\r\n (trailing 0d 0d 0a)
    ```

    **Solution**: Create a new secret version without trailing whitespace:
    ```bash
    gcloud secrets versions access latest --secret=mcp-hr-service-client-secret \
      | tr -d '\r\n' \
      | gcloud secrets versions add mcp-hr-service-client-secret --data-file=-
    ```

    **Prevention**: When creating secrets, always strip trailing whitespace:
    ```bash
    echo -n "secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-
    # The -n flag prevents echo from adding a newline
    ```

### Commands Reference

```bash
# Disable Cloud SQL deletion protection
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --project=PROJECT_ID

# Empty and delete GCS bucket
gcloud storage rm -r gs://BUCKET_NAME/**
gcloud storage buckets delete gs://BUCKET_NAME

# Create state bucket manually
gcloud storage buckets create gs://tamshai-terraform-state-prod --location=US

# Import existing Cloud Run Job
terraform import module.security.google_cloud_run_v2_job.provision_users \
  projects/PROJECT_ID/locations/REGION/jobs/provision-users

# Add secret version
echo -n "secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-

# Regenerate CICD service account key (requires iam.serviceAccountKeys.create permission)
gcloud iam service-accounts keys create ./gcp-sa-key-prod.json \
  --iam-account=tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com \
  --project=PROJECT_ID

# Update GitHub secret with new key (base64 encoded)
gh secret set GCP_SA_KEY_PROD < ./gcp-sa-key-prod.json

# Clean up local key file (IMPORTANT - don't commit!)
rm ./gcp-sa-key-prod.json

# Create missing mongodb-uri secret
gcloud secrets create tamshai-prod-mongodb-uri --project=PROJECT_ID --replication-policy=automatic

# Sync MongoDB URI from GitHub to GCP
# Step 1: Run export-gcp-secrets workflow to get the value
gh workflow run export-gcp-secrets.yml -f confirm="EXPORT_SECRETS"
sleep 30  # Wait for workflow to complete
gh run download $(gh run list --workflow=export-gcp-secrets.yml --limit 1 --json databaseId -q '.[0].databaseId') \
  -n terraform-tfvars-gcp-prod -D ./temp-secrets

# Step 2: Extract and add MongoDB URI to GCP Secret Manager
cat ./temp-secrets/terraform.tfvars | grep mongodb_atlas_uri | \
  sed 's/.*= "//' | sed 's/"$//' > ./temp-secrets/mongodb-uri.txt
cat ./temp-secrets/mongodb-uri.txt | \
  gcloud secrets versions add tamshai-prod-mongodb-uri --data-file=- --project=PROJECT_ID

# Step 3: Clean up (SECURITY: always remove secret files!)
rm -rf ./temp-secrets

# Grant Secret Accessor to service accounts
for secret in tamshai-prod-mongodb-uri tamshai-prod-db-password tamshai-prod-anthropic-api-key; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:tamshai-prod-mcp-servers@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" --project=PROJECT_ID
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:tamshai-prod-mcp-gateway@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" --project=PROJECT_ID
done

# Grant Keycloak access to its secrets
for secret in tamshai-prod-keycloak-admin-password tamshai-prod-keycloak-db-password; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:tamshai-prod-keycloak@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" --project=PROJECT_ID
done

# Grant CICD access to static website bucket
gcloud storage buckets add-iam-policy-binding gs://prod.tamshai.com \
  --member="serviceAccount:tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Grant CICD access to Cloud SQL (for provision workflows using Cloud SQL Proxy)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Execute provision-users Cloud Run Job (preferred method - uses VPC private IP)
gcloud run jobs execute provision-users \
  --region=us-central1 \
  --update-env-vars="ACTION=all,DRY_RUN=false,FORCE_PASSWORD_RESET=false" \
  --project=PROJECT_ID

# Check provision job execution status
gcloud run jobs executions list --job=provision-users --region=us-central1 --limit=5

# Get provision job logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=provision-users" \
  --limit=50 --format="value(textPayload)"
```
