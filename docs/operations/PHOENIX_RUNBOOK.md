# Phoenix Rebuild Runbook

**Last Updated**: January 2026
**Version**: 2.0.0
**Owner**: Platform Team

## Overview

This runbook provides step-by-step instructions for performing a complete Phoenix rebuild of the GCP production environment. A Phoenix rebuild destroys all infrastructure and recreates it from scratch.

### When to Use Phoenix Rebuild

- **Disaster Recovery**: Production is unrecoverable
- **Security Incident**: Compromise requires clean rebuild
- **Major Infrastructure Changes**: Terraform state is corrupted
- **Cost Optimization**: Need to recreate with different specs
- **Testing DR Procedures**: Quarterly DR drills

### Estimated Duration

| Phase | Duration | Notes |
|-------|----------|-------|
| Pre-flight | 5 min | Validation checks |
| Secret Sync | 5 min | GitHub -> GCP |
| Terraform Destroy | 10 min | Destroy all resources |
| Terraform Infra | 15 min | VPC, Cloud SQL, Registry |
| Build Images | 20 min | Cloud Build all images |
| Regenerate Keys | 5 min | SA key rotation |
| Terraform Cloud Run | 10 min | Deploy services |
| Deploy via GHA | 15 min | GitHub Actions deployment |
| Configure TOTP | 5 min | Test user setup |
| Verify | 10 min | E2E tests |
| **TOTAL** | **~100 min** | |

---

## Pre-requisites

### Required Tools

- [ ] `gcloud` CLI authenticated
- [ ] `gh` CLI authenticated
- [ ] `terraform` >= 1.5
- [ ] `curl`, `jq`
- [ ] `docker` (for local builds)

### Required Access

- [ ] GCP Project Owner or Editor role
- [ ] GitHub repository admin access
- [ ] Access to GitHub Secrets

### Required Secrets (GitHub)

| Secret | Purpose |
|--------|---------|
| `GCP_SA_KEY_PROD` | GCP service account key |
| `GCP_PROJECT_ID` | GCP project ID |
| `TEST_USER_PASSWORD` | Test user password |
| `TEST_USER_TOTP_SECRET_RAW` | Raw TOTP secret for test user |
| `CLAUDE_API_KEY_PROD` | Anthropic API key |

### Required Secrets (GCP Secret Manager)

| Secret | Purpose |
|--------|---------|
| `tamshai-prod-anthropic-api-key` | Anthropic API key |
| `tamshai-prod-db-password` | PostgreSQL password |
| `tamshai-prod-keycloak-admin-password` | Keycloak admin |
| `tamshai-prod-keycloak-db-password` | Keycloak DB |
| `tamshai-prod-mongodb-uri` | MongoDB Atlas URI |
| `mcp-hr-service-client-secret` | MCP HR client secret |

---

## Quick Start (Automated)

For a fully automated Phoenix rebuild:

```bash
# 1. Run pre-flight checks
./scripts/gcp/phoenix-preflight.sh

# 2. Execute Phoenix rebuild
./scripts/gcp/phoenix-rebuild.sh

# Or with options:
./scripts/gcp/phoenix-rebuild.sh --dry-run      # Preview only
./scripts/gcp/phoenix-rebuild.sh --resume       # Resume from checkpoint
./scripts/gcp/phoenix-rebuild.sh --phase 5      # Start from phase 5
```

---

## Manual Execution (Step-by-Step)

### Phase 1: Pre-flight Checks (5 min)

**Objective**: Validate all prerequisites before any destructive operations.

```bash
# Run pre-flight script
./scripts/gcp/phoenix-preflight.sh
```

**Checkpoints**:
- [ ] All required tools installed
- [ ] GCP authentication valid
- [ ] GitHub CLI authenticated
- [ ] All GitHub secrets exist
- [ ] All GCP secrets exist
- [ ] No secret hygiene issues (Issue #25)
- [ ] DNS records configured

**Rollback**: No destructive operations yet.

---

### Phase 2: Secret Sync (5 min)

**Objective**: Ensure GCP Secret Manager has all required secrets.

```bash
# Source the secrets library
source scripts/gcp/lib/secrets.sh

# Verify GCP secrets
verify_gcp_secrets

# Check for hygiene issues (trailing whitespace)
check_all_secrets_hygiene
```

**If secrets missing**:
```bash
# Create a secret
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Update an existing secret
echo -n "secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

**Checkpoints**:
- [ ] All required GCP secrets exist
- [ ] No trailing whitespace in secrets

---

### Phase 3: Terraform Destroy (10 min)

**Objective**: Destroy all existing GCP infrastructure.

```bash
cd infrastructure/terraform/gcp

# Pre-destroy cleanup (Gap #21, #22)
# Delete Cloud Run jobs (have deletion_protection)
gcloud run jobs delete provision-users --region=us-central1 --quiet 2>/dev/null || true

# Disable Cloud SQL deletion protection
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet 2>/dev/null || true

# Destroy infrastructure
terraform destroy -auto-approve
```

**If destroy fails on service networking (Gap #23)**:
```bash
# Remove service networking from state (blocks VPC deletion)
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
terraform state rm 'module.database.google_compute_global_address.private_ip_range' 2>/dev/null || true

# Retry destroy
terraform destroy -auto-approve
```

**If destroy fails on VPC (Gap #24, #25)**:
```bash
# Delete orphaned private IP addresses
gcloud compute addresses list --global --format="value(name)" | grep tamshai | \
  xargs -I {} gcloud compute addresses delete {} --global --quiet

# Targeted destroy if vpc_connector_id count fails
terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
```

**Post-Destroy Verification (Gap #1a)** - CRITICAL:
```bash
# Verify all resources are destroyed - FAIL if any exist
gcloud run services list --region=us-central1 --format="value(name)" | \
  grep -E "^(keycloak|mcp-|web-portal)" && echo "ERROR: Cloud Run services still exist" && exit 1

gcloud run jobs list --region=us-central1 --format="value(name)" | \
  grep provision && echo "ERROR: Cloud Run jobs still exist" && exit 1

gcloud sql instances list --format="value(name)" | \
  grep tamshai && echo "ERROR: Cloud SQL still exists" && exit 1

gcloud compute networks list --format="value(name)" | \
  grep tamshai && echo "ERROR: VPC still exists" && exit 1

echo "Post-destroy verification PASSED"
```

**Remove stale state entries (Gap #1b)**:
```bash
# Remove Cloud Run services from state (may reference deleted resources)
for svc in hr finance sales support; do
  terraform state rm "module.cloudrun.google_cloud_run_service.mcp_suite[\"$svc\"]" 2>/dev/null || true
done
terraform state rm 'module.cloudrun.google_cloud_run_service.keycloak' 2>/dev/null || true
terraform state rm 'module.cloudrun.google_cloud_run_service.web_portal[0]' 2>/dev/null || true
```

**Checkpoints**:
- [ ] Cloud Run jobs deleted
- [ ] Cloud SQL deletion protection disabled
- [ ] `terraform destroy` completes successfully
- [ ] Post-destroy verification passes (no orphaned resources)
- [ ] Stale state entries removed

**Rollback**: Cannot roll back destruction. Proceed to Phase 4 to rebuild.

---

### Phase 4: Terraform Infrastructure (15 min)

**Objective**: Create core infrastructure (VPC, Cloud SQL, Artifact Registry).

```bash
cd infrastructure/terraform/gcp

# Delete persisted secrets from previous deployment (Gap #2)
for secret in \
  tamshai-prod-keycloak-admin-password \
  tamshai-prod-keycloak-db-password \
  tamshai-prod-db-password \
  tamshai-prod-anthropic-api-key \
  tamshai-prod-mcp-gateway-client-secret \
  tamshai-prod-jwt-secret \
  mcp-hr-service-client-secret \
  prod-user-password \
  tamshai-prod-mongodb-uri; do
  gcloud secrets delete "$secret" --quiet 2>/dev/null || true
done

# Initialize Terraform
terraform init -upgrade

# STAGED APPLY (Gap #7, #25): Networking module MUST complete first
# This avoids vpc_connector_id count dependency issues
terraform apply -target=module.networking -auto-approve

# Then apply remaining infrastructure
terraform apply -auto-approve
```

**If apply fails with "409 Conflict" on storage buckets (Gap #28)**:
```bash
# Import existing buckets instead of recreating
terraform import 'module.storage.google_storage_bucket.static_website[0]' prod.tamshai.com
terraform import 'module.storage.google_storage_bucket.finance_docs' \
  tamshai-prod-finance-docs-$(gcloud config get-value project)

# Retry apply
terraform apply -auto-approve
```

**If apply fails due to outputs referencing missing services (Gap #17)**:
```bash
# Temporarily wrap outputs.tf with try() - see PHOENIX_MANUAL_ACTIONS.md #17
# After imports complete, revert the changes
```

**Checkpoints**:
- [ ] Secrets deleted from previous deployment
- [ ] VPC created: `gcloud compute networks list`
- [ ] Cloud SQL running: `gcloud sql instances list`
- [ ] Artifact Registry exists: `gcloud artifacts repositories list`
- [ ] VPC Connector ready: `gcloud compute networks vpc-access connectors list`
- [ ] Storage buckets created (or imported)

**Wait for Cloud SQL**:
```bash
# Wait for Cloud SQL to be RUNNABLE (may take 5-10 min)
source scripts/gcp/lib/health-checks.sh
wait_for_cloudsql "tamshai-prod-postgres" 600
```

---

### Phase 5: Build Container Images (20 min)

**Objective**: Build and push all container images to Artifact Registry.

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

# Build each service
for service in mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support keycloak; do
    echo "Building $service..."
    gcloud builds submit services/$service \
        --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/${service}:latest \
        --quiet
done

# Build web-portal (different path)
gcloud builds submit clients/web \
    --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/web-portal:latest \
    --quiet
```

**Checkpoints**:
- [ ] All 7 images built successfully
- [ ] Images visible in Artifact Registry:
  ```bash
  gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai
  ```

---

### Phase 6: Regenerate Service Account Key (5 min)

**Objective**: Create new CICD service account key and update GitHub secret.

```bash
PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com"

# Create new key
gcloud iam service-accounts keys create /tmp/gcp-key.json \
    --iam-account=$SA_EMAIL

# Update GitHub secret
gh secret set GCP_SA_KEY_PROD < /tmp/gcp-key.json

# Clean up
rm /tmp/gcp-key.json
```

**Checkpoints**:
- [ ] New key created
- [ ] GitHub secret updated: `gh secret list | grep GCP_SA_KEY_PROD`

---

### Phase 7: Terraform Cloud Run (10 min)

**Objective**: Deploy Cloud Run services via Terraform.

```bash
cd infrastructure/terraform/gcp

# Add version to mcp-hr-service-client-secret (Gap #26)
# Terraform creates the secret but not the version
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets versions add mcp-hr-service-client-secret --data-file=- 2>/dev/null || true

# Add MongoDB URI IAM binding (Gap #32)
PROJECT_ID=$(gcloud config get-value project)
gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
  --member="serviceAccount:tamshai-prod-mcp-servers@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" 2>/dev/null || true

# Full apply
terraform apply -auto-approve
```

**Create auth.tamshai.com domain mapping (Gap #35)** - CRITICAL:
```bash
# Cloudflare DNS (auth.tamshai.com → ghs.googlehosted.com) persists after destroy,
# but the GCP domain mapping that routes to keycloak is destroyed

gcloud beta run domain-mappings create \
  --service=keycloak \
  --domain=auth.tamshai.com \
  --region=us-central1 2>/dev/null || echo "Domain mapping may already exist"
```

**Wait for domain mapping to be routable (Gap #16, #36)** - CRITICAL:
```bash
# mcp-gateway depends on auth.tamshai.com being reachable
# Cloudflare handles SSL - we just wait for GCP routing

echo "Waiting for auth.tamshai.com domain mapping to be routable..."
TIMEOUT=300
ELAPSED=0
while [[ $ELAPSED -lt $TIMEOUT ]]; do
  STATUS=$(gcloud beta run domain-mappings describe \
    --domain=auth.tamshai.com \
    --region=us-central1 \
    --format="value(status.conditions[2].status)" 2>/dev/null || echo "Unknown")

  if [[ "$STATUS" == "True" ]]; then
    echo "Domain mapping is routable!"
    break
  fi

  echo "  Waiting... ($ELAPSED s elapsed, status: $STATUS)"
  sleep 10
  ELAPSED=$((ELAPSED + 10))
done

# Verify Keycloak is reachable via HTTPS
curl -sf -o /dev/null -w "Keycloak HTTP status: %{http_code}\n" \
  "https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration" || \
  echo "WARNING: Keycloak not yet reachable - may need more time"
```

**Checkpoints**:
- [ ] mcp-hr-service-client-secret has a version
- [ ] MongoDB URI IAM binding exists
- [ ] All Cloud Run services created: `gcloud run services list`
- [ ] VPC connector attached to services
- [ ] Service accounts assigned
- [ ] auth.tamshai.com domain mapping created
- [ ] Domain mapping is routable (DomainRoutable=True)
- [ ] Keycloak reachable at https://auth.tamshai.com

---

### Phase 8: Deploy via GitHub Actions (15 min)

**Objective**: Trigger full deployment through GitHub Actions.

```bash
# Trigger deployment
gh workflow run deploy-to-gcp.yml --ref main -f service=all

# Monitor progress
gh run list --workflow=deploy-to-gcp.yml --limit=1
gh run watch
```

**Checkpoints**:
- [ ] Workflow completes successfully
- [ ] All services healthy:
  ```bash
  source scripts/gcp/lib/health-checks.sh
  quick_health_check
  ```

---

### Phase 9: Configure TOTP (5 min)

**Objective**: Set TOTP credential for test-user.journey.

```bash
# Set environment variables
export KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
export AUTO_CONFIRM=true

# Run TOTP setup
./keycloak/scripts/set-user-totp.sh prod test-user.journey
```

**Checkpoints**:
- [ ] TOTP credential created
- [ ] Verify with TOTP code:
  ```bash
  oathtool --totp --base32 "JBSWY3DPEHPK3PXP"
  ```

---

### Phase 10: Provision and Verify (10 min)

**Objective**: Run E2E tests to verify the rebuild.

```bash
# Print discovered URLs
source scripts/gcp/lib/dynamic-urls.sh
print_discovered_urls

# Run E2E login test
cd tests/e2e
npm run test:login:prod
```

**Checkpoints**:
- [ ] Keycloak accessible at https://auth.tamshai.com
- [ ] Web portal accessible
- [ ] E2E login test passes
- [ ] MCP Gateway responds to health check

---

## Troubleshooting

### Issue: Terraform destroy fails

**Symptom**: `terraform destroy` hangs or fails on Cloud SQL.

**Resolution**:
```bash
# Disable deletion protection
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection

# Force delete if needed
gcloud sql instances delete tamshai-prod-postgres --quiet
```

### Issue: Cloud Run deployment fails with "Image not found"

**Symptom**: Cloud Run can't pull images from Artifact Registry.

**Resolution**:
```bash
# Verify images exist
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai

# If missing, rebuild
gcloud builds submit services/mcp-gateway --tag=...
```

### Issue: Keycloak returns 401

**Symptom**: Authentication fails after Phoenix rebuild.

**Resolution**:
1. Wait for Keycloak to fully start (check `/health` endpoint)
2. Verify realm was imported
3. Re-run sync-realm.sh if needed

### Issue: Secret has trailing whitespace (Issue #25)

**Symptom**: Authentication fails due to corrupted password.

**Resolution**:
```bash
source scripts/gcp/lib/secrets.sh

# Check hygiene
check_secret_hygiene "tamshai-prod-keycloak-admin-password"

# Fix by re-creating with sanitized value
echo -n "clean-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

### Issue: GCP_SA_KEY_PROD invalid after rebuild

**Symptom**: GitHub Actions can't authenticate to GCP.

**Resolution**:
Phase 6 regenerates this key. If missed:
```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/key.json \
    --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json
```

### Issue: deploy-static-website fails with "storage.buckets.get" error (Gap #37)

**Symptom**: `gcloud storage rsync` fails with permission denied.
```
ERROR: tamshai-prod-cicd@...iam.gserviceaccount.com does not have storage.buckets.get access
```

**Root Cause**: `roles/storage.objectAdmin` doesn't include `storage.buckets.get` which rsync needs.

**Resolution**:
```bash
# Fixed in Terraform (storage module now includes roles/storage.legacyBucketReader)
# Run terraform apply to create the IAM binding:
cd infrastructure/terraform/gcp
terraform apply -target=module.storage -auto-approve

# Or manually add the binding:
gcloud storage buckets add-iam-policy-binding gs://prod.tamshai.com \
  --member="serviceAccount:tamshai-prod-cicd@$(gcloud config get-value project).iam.gserviceaccount.com" \
  --role="roles/storage.legacyBucketReader"
```

### Issue: Terraform destroy hangs on VPC (Gap #23, #24, #25)

**Symptom**: `terraform destroy` times out on VPC or networking resources.

**Resolution**:
```bash
# 1. Remove service networking from state
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection'
terraform state rm 'module.database.google_compute_global_address.private_ip_range'

# 2. Delete orphaned private IP addresses
gcloud compute addresses list --global --format="value(name)" | grep tamshai | \
  xargs -I {} gcloud compute addresses delete {} --global --quiet

# 3. Targeted destroy of VPC
terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
```

### Issue: auth.tamshai.com not reachable after rebuild (Gap #35, #36)

**Symptom**: mcp-gateway fails to start because it can't reach Keycloak.

**Root Cause**: Cloudflare DNS persists but GCP domain mapping is destroyed.

**Resolution**:
```bash
# Create the domain mapping
gcloud beta run domain-mappings create \
  --service=keycloak \
  --domain=auth.tamshai.com \
  --region=us-central1

# Wait for it to be routable (Cloudflare handles SSL)
gcloud beta run domain-mappings describe \
  --domain=auth.tamshai.com \
  --region=us-central1 \
  --format="value(status.conditions[2].status)"
# Should return "True"

# Verify HTTPS access
curl -sf https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration
```

### Issue: Storage bucket location mismatch (Gap #20)

**Symptom**: Terraform wants to recreate bucket due to location difference (US vs US-CENTRAL1).

**Resolution**:
Already fixed in storage module with `lifecycle { ignore_changes = [location] }`.
If still occurring:
```bash
# Remove from state and re-import
terraform state rm 'module.storage.google_storage_bucket.static_website[0]'
terraform import 'module.storage.google_storage_bucket.static_website[0]' prod.tamshai.com
```

---

## Workload Identity Federation (Future)

### Current State

Currently, Phoenix rebuilds require regenerating `GCP_SA_KEY_PROD` (Phase 6) because:
- Service account keys are destroyed with `terraform destroy`
- GitHub Actions uses key-based authentication

### Future Improvement: Workload Identity Federation

With WIF, no keys need to be managed:

```yaml
# Future deploy-to-gcp.yml with WIF
- name: Authenticate to GCP
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/123456/locations/global/workloadIdentityPools/github/providers/github-actions'
    service_account: 'tamshai-prod-cicd@project.iam.gserviceaccount.com'
```

**Benefits**:
- No `GCP_SA_KEY_PROD` to manage
- No Phase 6 (key regeneration)
- More secure (no long-lived credentials)

**Migration**:
1. Create Workload Identity Pool
2. Create Provider for GitHub
3. Grant SA permissions to WIF
4. Update workflow authentication

---

## Post-Phoenix Checklist

After a successful Phoenix rebuild:

- [ ] All E2E tests pass
- [ ] Users can log in with TOTP
- [ ] MCP services respond to queries
- [ ] Monitoring dashboards show data
- [ ] Update team on completion
- [ ] Document any issues encountered
- [ ] Update this runbook if needed

---

## Related Documentation

- [Phoenix Manual Actions](./PHOENIX_MANUAL_ACTIONS.md) - **Detailed gap documentation and resolutions**
- [Phoenix Recovery](./PHOENIX_RECOVERY.md) - Emergency recovery procedures
- [Phoenix Recovery Improvements](./PHOENIX_RECOVERY_IMPROVEMENTS.md) - Lessons learned
- [Identity Sync](./IDENTITY_SYNC.md) - User provisioning
- [Keycloak Management](./KEYCLOAK_MANAGEMENT.md) - Keycloak operations

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.1.0 | Jan 2026 | Tamshai-QA | Added Gaps #1a-#37 from Phoenix rebuild 2026-01-18/19 |
| 2.0.0 | Jan 2026 | Tamshai-QA | Complete rewrite with automated scripts |
| 1.0.0 | Dec 2025 | Tamshai-Dev | Initial version |
