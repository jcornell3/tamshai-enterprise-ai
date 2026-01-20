# Phoenix Rebuild Runbook

**Last Updated**: January 20, 2026
**Version**: 3.0.0
**Owner**: Platform Team

## Overview

This runbook provides instructions for performing a complete Phoenix rebuild of the GCP production environment. A Phoenix rebuild destroys all infrastructure and recreates it from scratch.

**Primary Method**: Use `phoenix-rebuild.sh` - all manual procedures are automated.

### When to Use Phoenix Rebuild

- **Disaster Recovery**: Production is unrecoverable
- **Security Incident**: Compromise requires clean rebuild
- **Major Infrastructure Changes**: Terraform state is corrupted
- **Cost Optimization**: Need to recreate with different specs
- **Testing DR Procedures**: Quarterly DR drills

### Estimated Duration: ~60 minutes (automated)

---

## Pre-requisites

### Required Tools

- [ ] `gcloud` CLI authenticated
- [ ] `gh` CLI authenticated
- [ ] `terraform` >= 1.5
- [ ] `curl`, `jq`

### Required Access

- [ ] GCP Project Owner or Editor role
- [ ] GitHub repository admin access
- [ ] Access to GitHub Secrets

### Required Secrets

**GitHub Secrets**:
- `GCP_SA_KEY_PROD`, `GCP_PROJECT_ID`
- `TEST_USER_PASSWORD`, `TEST_USER_TOTP_SECRET_RAW`
- `CLAUDE_API_KEY_PROD`

**GCP Secret Manager**:
- `tamshai-prod-anthropic-api-key`, `tamshai-prod-db-password`
- `tamshai-prod-keycloak-admin-password`, `tamshai-prod-keycloak-db-password`
- `tamshai-prod-mongodb-uri`, `mcp-hr-service-client-secret`

---

## Phoenix Rebuild Procedure

### Step 1: Run Pre-flight Checks

```bash
./scripts/gcp/phoenix-preflight.sh
```

**Checkpoints**:
- [ ] All required tools installed
- [ ] GCP/GitHub authentication valid
- [ ] All secrets exist (GitHub and GCP)
- [ ] No secret hygiene issues

### Step 2: Execute Phoenix Rebuild

```bash
./scripts/gcp/phoenix-rebuild.sh
```

**Options**:
```bash
./scripts/gcp/phoenix-rebuild.sh --dry-run      # Preview only
./scripts/gcp/phoenix-rebuild.sh --resume       # Resume from checkpoint
./scripts/gcp/phoenix-rebuild.sh --phase 5      # Start from specific phase
```

### Step 3: Monitor Progress

The script executes 10 phases automatically:

| Phase | What It Does | Checkpoint |
|-------|--------------|------------|
| 1 | Pre-flight checks | Tools and auth validated |
| 2 | Secret sync | GCP secrets verified |
| 3 | Pre-destroy cleanup | State locks cleared, services deleted |
| 4 | Terraform destroy | All resources destroyed |
| 5 | Terraform apply (infra) | VPC, Cloud SQL, Registry created |
| 6 | Build images | All 7 container images built |
| 7 | Regenerate SA key | GitHub secret updated, key validated (Issue #10 fix) |
| 8 | Terraform apply (Cloud Run) | Services deployed, 409 auto-recovery (Issue #11 fix) |
| 9 | Deploy via GitHub Actions | Full deployment completed |
| 10 | Configure TOTP & verify | E2E tests pass |

### Step 4: Verify Completion

```bash
# Check all services are healthy
gcloud run services list --region=us-central1

# Verify Keycloak
curl -sf https://auth.tamshai.com/auth/health/ready && echo "OK"

# Run E2E tests
cd tests/e2e && npm run test:login:prod
```

**Final Checkpoints**:
- [ ] All Cloud Run services show "Ready"
- [ ] Keycloak accessible at https://auth.tamshai.com
- [ ] E2E login test passes
- [ ] Web portal accessible at https://app.tamshai.com

---

## Troubleshooting

### Terraform destroy fails on Cloud SQL

```bash
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection
gcloud sql instances delete tamshai-prod-postgres --quiet
```

### Cloud Run deployment fails with "Image not found"

```bash
# Verify images exist
gcloud artifacts docker images list us-central1-docker.pkg.dev/$(gcloud config get-value project)/tamshai
```

### GCP_SA_KEY_PROD invalid after rebuild

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/key.json \
    --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json
```

### Secret has trailing whitespace (Issue #25)

```bash
source scripts/gcp/lib/secrets.sh
check_secret_hygiene "tamshai-prod-keycloak-admin-password"
```

### Terraform state lock stuck

```bash
terraform force-unlock -force <LOCK_ID>
```

### Issue #9: Provision Job Permission Denied

**Symptom**: Provision job fails with "Permission denied on secret" during first execution after Phoenix rebuild.

**Cause**: IAM binding race condition - the Cloud Run job was created before its IAM bindings were fully applied by Terraform.

**Prevention**: The `google_cloud_run_v2_job.provision_users` resource now has `depends_on` for all required IAM bindings (`infrastructure/terraform/modules/security/main.tf`).

**Manual Fix** (if encountered):
```bash
PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="tamshai-prod-provision@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant secret access manually
for secret in tamshai-prod-db-password tamshai-prod-keycloak-admin-password mcp-hr-service-client-secret tamshai-prod-user-password; do
    gcloud secrets add-iam-policy-binding "$secret" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/secretmanager.secretAccessor"
done

# Re-run the provision job
gcloud run jobs execute provision-users --region=us-central1 --wait
```

### Issue #10: Service Account Key Invalid After Manual Terraform Apply

**Symptom**: GitHub workflows fail with "Invalid JWT Signature" or "Could not deserialize key data" after running `terraform apply` manually (not using `phoenix-rebuild.sh`).

**Cause**: When running terraform manually (bypassing `phoenix-rebuild.sh`), Phase 6 (key regeneration) doesn't execute. The CICD service account is recreated with Terraform, but GitHub secret `GCP_SA_KEY_PROD` still has the old key.

**Prevention**: Always use `phoenix-rebuild.sh` which handles key regeneration and validation in Phase 6.

**Manual Fix**:
```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/key.json \
    --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json

# Verify the key works
gcloud auth activate-service-account --key-file=/tmp/key.json
gcloud projects describe "$PROJECT_ID" --format="value(projectId)"
```

### Issue #11: Terraform 409 "Already Exists" Error

**Symptom**: `terraform apply` fails with:
```
Error: Error creating Service: googleapi: Error 409: Resource 'mcp-gateway' already exists.
Error: Error creating DomainMapping: googleapi: Error 409: Resource 'auth.tamshai.com' already exists.
```

**Cause**: A previous `terraform apply` timed out or was interrupted. The resources were created in GCP, but Terraform state wasn't updated. Cloud Run services can take 15-30 minutes to create, especially when certificates are being provisioned.

**Prevention**:
- `phoenix-rebuild.sh` now includes 409 auto-recovery logic in Phase 7
- Terraform timeout blocks have been increased to 30 minutes for Cloud Run resources
- Always use `phoenix-rebuild.sh` instead of manual `terraform apply`

**Manual Fix** (import existing resources):
```bash
cd infrastructure/terraform/gcp
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

# Import Cloud Run services (only if they exist)
for svc in mcp-gateway keycloak mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
    if gcloud run services describe "$svc" --region="$REGION" &>/dev/null; then
        terraform import "module.cloudrun.google_cloud_run_service.${svc//-/_}" \
            "locations/${REGION}/namespaces/${PROJECT_ID}/services/${svc}" 2>/dev/null || true
    fi
done

# Import domain mapping
if gcloud beta run domain-mappings describe --domain=auth.tamshai.com --region="$REGION" &>/dev/null 2>&1; then
    terraform import 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' \
        "locations/${REGION}/namespaces/${PROJECT_ID}/domainmappings/auth.tamshai.com" 2>/dev/null || true
fi

# Retry apply
terraform apply
```

For additional troubleshooting scenarios, see [Appendix B](#appendix-b-manual-procedures-fallback).

---

## Post-Phoenix Checklist

- [ ] All E2E tests pass
- [ ] Users can log in with TOTP
- [ ] MCP services respond to queries
- [ ] Monitoring dashboards show data
- [ ] Update team on completion
- [ ] Document any issues encountered

---

## Related Documentation

- [Phoenix Manual Actions](./PHOENIX_MANUAL_ACTIONS.md) - Gap documentation
- [Phoenix Recovery](./PHOENIX_RECOVERY.md) - Emergency recovery procedures
- [Identity Sync](./IDENTITY_SYNC.md) - User provisioning
- [Keycloak Management](./KEYCLOAK_MANAGEMENT.md) - Keycloak operations

---

## Appendix A: Phoenix Process Files

### Terraform Files

**Root Configuration** (`infrastructure/terraform/gcp/`):
| File | Purpose |
|------|---------|
| `main.tf` | Root module, orchestrates all submodules |
| `variables.tf` | Input variables including `phoenix_mode` |
| `outputs.tf` | Output values (URLs, IPs, etc.) |

**Modules** (`infrastructure/terraform/modules/`):

| Module | Purpose |
|--------|---------|
| `cloudrun/` | Cloud Run services |
| `compute/` | Utility VM (Redis, Bastion) |
| `database/` | Cloud SQL PostgreSQL |
| `networking/` | VPC, Subnets, VPC Connector |
| `security/` | Service accounts, Secret Manager, IAM |
| `storage/` | GCS buckets |

### Phoenix Scripts

| Script | Purpose |
|--------|---------|
| `scripts/gcp/phoenix-preflight.sh` | Pre-flight validation |
| `scripts/gcp/phoenix-rebuild.sh` | Main orchestrator |
| `scripts/gcp/lib/secrets.sh` | Secret sync functions |
| `scripts/gcp/lib/health-checks.sh` | Health check functions |
| `scripts/gcp/lib/dynamic-urls.sh` | URL discovery |

### GitHub Actions Workflows

| Workflow | Purpose |
|----------|---------|
| `deploy-to-gcp.yml` | Deploy all services to Cloud Run |
| `provision-prod-users.yml` | Provision users to Keycloak |
| `provision-prod-data.yml` | Load sample data |

---

## Appendix B: Manual Procedures (Fallback)

> **Note**: These procedures are automated by `phoenix-rebuild.sh`. Use only if automation fails.

### Phase 1: Pre-flight Checks

```bash
./scripts/gcp/phoenix-preflight.sh
```

### Phase 2: Secret Sync

```bash
source scripts/gcp/lib/secrets.sh
verify_gcp_secrets
check_all_secrets_hygiene
```

### Phase 3: Terraform Destroy

```bash
cd infrastructure/terraform/gcp

# Pre-destroy cleanup (automated in phoenix-rebuild.sh)
gcloud run jobs delete provision-users --region=us-central1 --quiet 2>/dev/null || true

for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
  gcloud run services delete "$svc" --region=us-central1 --quiet 2>/dev/null || true
done
sleep 10

gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet 2>/dev/null || true

terraform destroy -auto-approve
```

**If destroy fails on service networking (Gap #23)**:
```bash
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
terraform state rm 'module.networking.google_service_networking_connection.private_vpc_connection' 2>/dev/null || true
terraform destroy -auto-approve
```

**If destroy fails on VPC (Gap #24, #25)**:
```bash
gcloud compute addresses list --global --format="value(name)" | grep -E "(tamshai|google-managed)" | \
  xargs -I {} gcloud compute addresses delete {} --global --quiet

terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
```

### Phase 4: Terraform Infrastructure

```bash
cd infrastructure/terraform/gcp
terraform init -upgrade
terraform apply -target=module.networking -auto-approve
terraform apply -auto-approve

source scripts/gcp/lib/secrets.sh
ensure_mcp_hr_client_secret
```

### Phase 5: Build Container Images

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

for service in mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support keycloak; do
    gcloud builds submit services/$service \
        --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/${service}:latest --quiet
done

gcloud builds submit clients/web \
    --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/web-portal:latest --quiet
```

### Phase 6: Regenerate Service Account Key

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/gcp-key.json \
    --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/gcp-key.json
rm /tmp/gcp-key.json
```

### Phase 7: Terraform Cloud Run

```bash
cd infrastructure/terraform/gcp
terraform apply -auto-approve

# Domain mapping (automated via import in phoenix-rebuild.sh)
gcloud beta run domain-mappings create \
  --service=keycloak --domain=auth.tamshai.com --region=us-central1 2>/dev/null || true
```

### Phase 8: Deploy via GitHub Actions

```bash
gh workflow run deploy-to-gcp.yml --ref main -f service=all
gh run watch
```

### Phase 9: Configure TOTP

```bash
export KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
export AUTO_CONFIRM=true
./keycloak/scripts/set-user-totp.sh prod test-user.journey
```

### Phase 10: Verify

```bash
cd tests/e2e
npm run test:login:prod
```

---

## Appendix C: Workload Identity Federation (Future)

Currently, Phoenix rebuilds require regenerating `GCP_SA_KEY_PROD` because service account keys are destroyed with `terraform destroy`.

With Workload Identity Federation:
- No `GCP_SA_KEY_PROD` to manage
- No Phase 6 (key regeneration)
- More secure (no long-lived credentials)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 3.1.0 | Jan 20, 2026 | Tamshai-Dev | Added Issues #9, #10, #11 troubleshooting; Phase 7 validates SA key; Phase 8 has 409 recovery |
| 3.0.0 | Jan 20, 2026 | Tamshai-Dev | Restructured: minimal main runbook, manual procedures moved to Appendix B |
| 2.3.0 | Jan 20, 2026 | Tamshai-Dev | Gap #49 fix, removed SSL waiting, automated pre-destroy cleanup |
| 2.2.0 | Jan 2026 | Tamshai-Dev | Added Gaps #38-43 fixes |
| 2.1.0 | Jan 2026 | Tamshai-QA | Added Gaps #1a-#37 |
| 2.0.0 | Jan 2026 | Tamshai-QA | Complete rewrite with automated scripts |
| 1.0.0 | Dec 2025 | Tamshai-Dev | Initial version |
