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

# Disable deletion protection on Cloud SQL
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet

# Destroy infrastructure
terraform destroy -auto-approve
```

**Checkpoints**:
- [ ] Cloud SQL deletion protection disabled
- [ ] `terraform destroy` completes successfully
- [ ] Verify no orphaned resources: `gcloud compute instances list`

**Rollback**: Cannot roll back destruction. Proceed to Phase 4 to rebuild.

---

### Phase 4: Terraform Infrastructure (15 min)

**Objective**: Create core infrastructure (VPC, Cloud SQL, Artifact Registry).

```bash
cd infrastructure/terraform/gcp

# Initialize Terraform
terraform init -upgrade

# Apply infrastructure targets first
terraform apply -auto-approve \
    -target=google_compute_network.vpc \
    -target=google_sql_database_instance.postgres \
    -target=google_artifact_registry_repository.docker \
    -target=google_vpc_access_connector.connector
```

**Checkpoints**:
- [ ] VPC created: `gcloud compute networks list`
- [ ] Cloud SQL running: `gcloud sql instances list`
- [ ] Artifact Registry exists: `gcloud artifacts repositories list`
- [ ] VPC Connector ready: `gcloud compute networks vpc-access connectors list`

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

# Full apply
terraform apply -auto-approve
```

**Checkpoints**:
- [ ] All Cloud Run services created: `gcloud run services list`
- [ ] VPC connector attached to services
- [ ] Service accounts assigned

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

- [Phoenix Recovery](./PHOENIX_RECOVERY.md) - Emergency recovery procedures
- [Phoenix Recovery Improvements](./PHOENIX_RECOVERY_IMPROVEMENTS.md) - Lessons learned
- [Identity Sync](./IDENTITY_SYNC.md) - User provisioning
- [Keycloak Management](./KEYCLOAK_MANAGEMENT.md) - Keycloak operations

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | Jan 2026 | Tamshai-QA | Complete rewrite with automated scripts |
| 1.0.0 | Dec 2025 | Tamshai-Dev | Initial version |
