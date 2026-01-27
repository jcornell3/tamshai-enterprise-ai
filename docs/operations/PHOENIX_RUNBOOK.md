# Phoenix Rebuild Runbook

**Last Updated**: January 26, 2026
**Version**: 3.8.0
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

> **Regional Outage?** If the primary region (us-central1) is completely unavailable, **DO NOT use Phoenix Rebuild**. Use [GCP Regional Failure Runbook](./GCP_REGION_FAILURE_RUNBOOK.md) instead. Phoenix requires the region to be accessible for `terraform destroy`.

### Decision Tree

```
Is us-central1 available?
  │
  ├── YES → Use THIS RUNBOOK (Phoenix Rebuild)
  │
  └── NO (GCP Status shows outage) → Use GCP_REGION_FAILURE_RUNBOOK.md
```

### Estimated Duration: 75-100 minutes (automated)

> **Note**: Duration varies based on SSL certificate provisioning time (~10-17 minutes on fresh rebuild). v11 completed in ~98 minutes.

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
./scripts/gcp/phoenix-rebuild.sh --yes          # Skip interactive confirmation (recommended for CI/automated runs)
./scripts/gcp/phoenix-rebuild.sh --dry-run      # Preview only
./scripts/gcp/phoenix-rebuild.sh --resume       # Resume from checkpoint
./scripts/gcp/phoenix-rebuild.sh --phase 5      # Start from specific phase
```

> **Tip**: Use `--yes` (or `-y`) to skip the `Type 'PHOENIX' to confirm` prompt. Required for non-interactive/automated runs.

### Step 3: Monitor Progress

The script executes 10 phases automatically:

| Phase | What It Does | Duration | Checkpoint |
|-------|--------------|----------|------------|
| 1-2 | Pre-flight + Secret sync | ~2 min | Tools, auth, GCP secrets verified |
| 3 | Pre-destroy cleanup | ~5 min | State locks cleared (Issue #36), services deleted |
| 4 | Terraform destroy + apply | ~20 min | VPC, Cloud SQL (~13 min), Registry created |
| 5 | Build container images | ~12 min | All 8 container images built |
| 6 | Regenerate SA key | ~1 min | GitHub secret updated, key validated (Issue #10) |
| 7 | Terraform Cloud Run (staged) | ~20 min | Stage 1: Keycloak → Stage 2: SSL wait (~17 min) → Stage 3: mcp-gateway (Issue #37) |
| 8 | Deploy via GitHub Actions | ~8 min | Full deployment completed, 409 auto-recovery (Issue #11) |
| 9 | Configure TOTP | ~2 min | test-user.journey TOTP configured |
| 10 | Provision & Verify | ~7 min | provision-users Cloud Build (Issue #32), E2E tests pass (6/6) |

### Step 4: Verify Completion

```bash
# Check all services are healthy
gcloud run services list --region=us-central1

# Verify Keycloak
curl -sf https://auth.tamshai.com/auth/health/ready && echo "OK"

# Run E2E tests (use read-github-secrets.sh to load credentials)
cd tests/e2e
eval $(../../scripts/secrets/read-github-secrets.sh --e2e --env)
npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1
# Expected: 6/6 tests pass
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

### Issue #32: provision-users `_REGION` Substitution Error

**Symptom**: provision-users Cloud Build fails with:
```
ERROR: (gcloud.builds.submit) INVALID_ARGUMENT: key "_REGION" in the substitution data is not matched in the template
```

**Cause**: Cloud Build doesn't support nested substitution references in `substitutions` defaults. The original code tried to use `${_REGION}` inside another substitution value.

**Prevention**: Fixed in `cloudbuild-provision-users.yaml` - CLOUD_SQL_INSTANCE is now constructed inline in each step's `env` block instead of using a substitution default.

**Verification**: provision-users Cloud Build completes successfully without substitution errors.

### Issue #36: Terraform State Lock Deadlock

**Symptom**: "Error acquiring the state lock" that cannot be resolved by waiting.

**Cause**: The original script used `terraform plan` to detect locks, but this could itself create new locks if interrupted, causing a deadlock.

**Prevention**: Fixed in `phoenix-rebuild.sh` Phase 3 - now checks GCS lock file directly at `gs://tamshai-terraform-state-prod/gcp/phase1/default.tflock` instead of using `terraform plan`.

**Manual Fix**:
```bash
LOCK_FILE="gs://tamshai-terraform-state-prod/gcp/phase1/default.tflock"
if gcloud storage cat "$LOCK_FILE" &>/dev/null; then
    lock_id=$(gcloud storage cat "$LOCK_FILE" | grep -o '"ID":"[0-9]*"' | grep -o '[0-9]*')
    terraform force-unlock -force "$lock_id"
    gcloud storage rm "$LOCK_FILE"
fi
```

### Issue #37: mcp-gateway SSL Startup Failure

**Symptom**: mcp-gateway fails Cloud Run startup probe with:
```
STARTUP HTTP probe failed 12 times consecutively
error: "Request failed with status code 525" (SSL handshake failed)
jwksUri: https://auth.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/certs
```

**Cause**: mcp-gateway validates JWT tokens against Keycloak's JWKS endpoint on startup. If deployed simultaneously with Keycloak's domain mapping, the SSL certificate for `auth.tamshai.com` isn't ready yet (takes 10-17 minutes).

**Prevention**: Fixed in `phoenix-rebuild.sh` Phase 7 - now uses staged deployment:
1. **Stage 1**: Deploy Keycloak, MCP Suite, web-portal, domain mappings
2. **Stage 2**: Poll for SSL certificate readiness on `auth.tamshai.com` (every 30 seconds)
3. **Stage 3**: Deploy mcp-gateway only after SSL is confirmed ready

**Typical SSL Wait**: 10-17 minutes on fresh rebuild (34 polling attempts in v11).

### Issue #103: VPC Peering Deletion Blocked by Dependencies

**Symptom**: `delete_vpc_peering_robust()` exhausts 20 retries (10 minutes) with error:
```
FLOW_SN_DC_RESOURCE_PREVENTING_DELETE_CONNECTION (subject: 171113)
```

**Cause**: GCP service networking holds stale references after Cloud SQL or VPC connector deletion. Dependencies must be cleaned before peering can be deleted.

**Diagnostic Commands**:
```bash
PROJECT_ID=$(gcloud config get-value project)

# Check for Cloud SQL instances (primary blocker)
gcloud sql instances list --project="$PROJECT_ID" --format="table(name,state)"

# Check for VPC Access Connectors
gcloud compute networks vpc-access connectors list \
    --region=us-central1 --project="$PROJECT_ID" --format="table(name,state,network)"

# Check for VPC peering status
gcloud compute networks peerings list \
    --network=tamshai-prod-vpc --project="$PROJECT_ID"

# Check for reserved private IP ranges (used by service networking)
gcloud compute addresses list --global --project="$PROJECT_ID" \
    --format="table(name,address,prefixLength,purpose,status)"

# Check service networking connections
gcloud services vpc-peerings list \
    --network=tamshai-prod-vpc --project="$PROJECT_ID"

# Check for Filestore instances (also use service networking)
gcloud filestore instances list --project="$PROJECT_ID" 2>/dev/null || echo "Filestore API not enabled"
```

**Prevention**: Fixed in `cleanup.sh` — `check_and_clean_vpc_peering_dependencies()` now checks and cleans Cloud SQL, VPC connectors, and Filestore before attempting peering deletion. Phase 3 also reorders VPC connector deletion before peering deletion.

### Issue #103: VPC Deletion Blocked by Auto-Created Firewall Rules

**Symptom**: VPC deletion fails after terraform destroy with:
```
The network resource 'tamshai-prod-vpc' is already being used by 'aet-uscentral1-tamshai--prod--conn-egrfw'
```

**Cause**: GCP auto-creates firewall rules for VPC Access Connectors with pattern `aet-<region-no-hyphens>-<sanitized-name>-{egrfw,ingfw}`. These persist even after the connector is deleted and are not managed by Terraform.

**Diagnostic Commands**:
```bash
PROJECT_ID=$(gcloud config get-value project)

# List all firewall rules in the VPC
gcloud compute firewall-rules list \
    --filter="network:tamshai-prod-vpc" \
    --project="$PROJECT_ID" --format="table(name,network,direction)"

# Fallback: search by auto-created name pattern (if network filter fails)
gcloud compute firewall-rules list \
    --project="$PROJECT_ID" --format="value(name)" | grep -E "^aet-"

# Check VPC for remaining subnets/routers blocking deletion
gcloud compute networks subnets list \
    --network=tamshai-prod-vpc --project="$PROJECT_ID"
gcloud compute routers list \
    --filter="network:tamshai-prod-vpc" --project="$PROJECT_ID"

# Check overall VPC status
gcloud compute networks describe tamshai-prod-vpc \
    --project="$PROJECT_ID" --format="table(name,subnetworks[],peerings[])"
```

**Prevention**: Fixed in `cleanup.sh` — `delete_vpc_connector_firewall_rules()` now runs after VPC connector deletion to clean up `aet-*` firewall rules with a fallback name-pattern search.

### PROD_USER_PASSWORD Not Available During Rebuild

**Symptom**: `sync_prod_user_password()` warns "not in environment". Corporate users get random Terraform-generated passwords instead of the known `PROD_USER_PASSWORD`.

**Cause**: `PROD_USER_PASSWORD` is a GitHub Secret, not available as a local environment variable. Phase 10 called `sync_prod_user_password()` without first fetching the secret.

**Prevention**: Fixed in `phoenix-rebuild.sh` Phase 10 and `evacuate-region.sh` Phase 5 — now calls `read-github-secrets.sh --phoenix` to fetch `PROD_USER_PASSWORD` (and other Phoenix secrets) from GitHub before the sync step. The `export-test-secrets.yml` workflow's `phoenix` type now includes `PROD_USER_PASSWORD`, `TEST_USER_PASSWORD`, and `TEST_USER_TOTP_SECRET`.

### E2E Tests Fail Silently in Script

**Symptom**: E2E tests report "may have failed" but no output is visible. Manual run with secrets loaded passes 6/6.

**Cause**: Two issues: (1) No test secrets (`TEST_USER_PASSWORD`, `TEST_USER_TOTP_SECRET`) loaded before Playwright execution. (2) `npm run test:login:prod 2>/dev/null` suppressed all output including errors.

**Prevention**: Fixed in `phoenix-rebuild.sh` Phase 10 and `evacuate-region.sh` Phase 6 — Phoenix secrets are now loaded via `read-github-secrets.sh --phoenix` earlier in the phase, and `2>/dev/null` is removed so test output is visible.

### Workflow Detection Reports "Not Found" After Retries

**Symptom**: `trigger_identity_sync()` and `trigger_sample_data_load()` warn "workflow not found after 3 attempts" even though the workflows exist and can be triggered successfully.

**Cause**: `gh workflow list` returns display names (e.g., "Provision Production Users") but the script grepped for filenames (e.g., "provision-prod-users"). The pattern never matches because display names don't contain filenames.

**Prevention**: Fixed in `secrets.sh` — replaced `gh workflow list | grep` with `gh workflow view <filename>`, which accepts workflow filenames directly and returns success/failure without needing to parse display names.

### Provision-prod-users Final Verification Fails with curl exit 3

**Symptom**: Final Verification job in `provision-prod-users.yml` fails immediately with `Process completed with exit code 3` (curl URL malformat).

**Cause**: `${{ env.KEYCLOAK_URL }}` was referenced in the workflow but never defined in the `env:` block. The Keycloak URL must be discovered dynamically since it's a Cloud Run-generated URL.

**Prevention**: Fixed in `provision-prod-users.yml` — the Final Verification job now includes a `Discover Keycloak URL` step that uses `gcloud run services describe keycloak --format="value(status.url)"` and sets the result in `$GITHUB_ENV`. The verification step also guards against missing URLs by skipping gracefully.

### Cloud Run Job Polling Treats "Unknown" Status as Failure

**Symptom**: `provision-prod-users.yml` Execute Provision Job reports `[ERROR] Job failed` at 0 seconds with `Condition: Completed = Unknown`.

**Cause**: The polling loop used an `else` branch that treated any status other than `True` as failure. When a Cloud Run Job has just started, its condition status is `Unknown` (not yet determined), which fell into the failure branch.

**Prevention**: Fixed in `provision-prod-users.yml` — polling now uses explicit `elif [ "$CONDITION_STATUS" = "False" ]` to only break on actual failure. `Unknown` status continues the wait loop.

### E2E Tests Fail with "'TEST_ENV' is not recognized" on Windows

**Symptom**: Phoenix rebuild E2E test step fails with `'TEST_ENV' is not recognized as an internal or external command`.

**Cause**: `npm run test:login:prod` invokes `TEST_ENV=prod playwright test...` which is Unix-only shell syntax. On Windows, npm spawns `cmd.exe` which cannot parse environment variable prefixes.

**Prevention**: Fixed in `phoenix-rebuild.sh` — E2E tests now use `npx cross-env TEST_ENV=prod playwright test login-journey --project=chromium --workers=1` which works cross-platform. The `cross-env` package is a devDependency of the e2e test project.

For additional troubleshooting scenarios, see [Appendix B](#appendix-b-manual-procedures-fallback).

---

## Post-Phoenix Checklist

### Blocking Requirements (MUST pass before declaring rebuild successful)

- [ ] **User password provisioning complete** — Corporate users provisioned with known `PROD_USER_PASSWORD` (not random Terraform-generated passwords). Verify via Keycloak admin or test login.
- [ ] **ALL E2E tests pass (6/6)** — Run `npm run test:login:prod` in `tests/e2e/`. Zero failures required. Partial passes are NOT acceptable.

> **These two items are hard blockers.** A Phoenix rebuild is NOT considered successful until both are verified. If either fails, investigate and remediate before declaring the rebuild complete.

### Additional Verification

- [ ] Users can log in with TOTP
- [ ] MCP services respond to queries
- [ ] Monitoring dashboards show data
- [ ] Update team on completion
- [ ] Document any issues encountered

---

## Related Documentation

- [GCP Regional Failure Runbook](./GCP_REGION_FAILURE_RUNBOOK.md) - **For regional outages** (15-25 min RTO)
- [Phoenix Manual Actions v14](./PHOENIX_MANUAL_ACTIONSv14.md) - Latest rebuild log (0 manual actions)
- [Phoenix Manual Actions v13](./PHOENIX_MANUAL_ACTIONSv13.md) - Previous rebuild log (1 manual action)
- [Phoenix Manual Actions v12](./PHOENIX_MANUAL_ACTIONSv12.md) - Rebuild log (1 manual action)
- [Phoenix Manual Actions v11](./PHOENIX_MANUAL_ACTIONSv11.md) - Rebuild log (0 manual actions)
- [Phoenix Recovery](./PHOENIX_RECOVERY.md) - Emergency recovery procedures (13 scenarios)
- [Identity Sync](./IDENTITY_SYNC.md) - User provisioning
- [Keycloak Management](./KEYCLOAK_MANAGEMENT.md) - Keycloak operations
- [E2E User Tests](../testing/E2E_USER_TESTS.md) - E2E test procedures
- [Test User Journey](../testing/TEST_USER_JOURNEY.md) - Test user credentials

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
| `scripts/gcp/lib/cleanup.sh` | Cleanup functions (VPC, Cloud SQL, connectors, firewall rules) |
| `scripts/gcp/lib/secrets.sh` | Secret sync functions |
| `scripts/gcp/lib/health-checks.sh` | Health check functions |
| `scripts/gcp/lib/dynamic-urls.sh` | URL discovery |

### Regional Evacuation Scripts

| Script | Purpose |
|--------|---------|
| `scripts/gcp/evacuate-region.sh` | Create recovery stack in alternate region |
| `scripts/gcp/cleanup-recovery.sh` | Destroy recovery stack after failback |

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

### Phase 3: Pre-destroy Cleanup + Terraform Destroy

```bash
cd infrastructure/terraform/gcp

# Issue #36 fix: Check for stuck state locks via GCS file (not terraform plan)
LOCK_FILE="gs://tamshai-terraform-state-prod/gcp/phase1/default.tflock"
if gcloud storage cat "$LOCK_FILE" &>/dev/null; then
    lock_id=$(gcloud storage cat "$LOCK_FILE" | grep -o '"ID":"[0-9]*"' | grep -o '[0-9]*')
    terraform force-unlock -force "$lock_id"
    gcloud storage rm "$LOCK_FILE"
fi

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

### Phase 7: Terraform Cloud Run (Staged - Issue #37 Fix)

```bash
cd infrastructure/terraform/gcp

# Stage 1: Deploy Keycloak, MCP Suite, web-portal, domain mappings (NOT mcp-gateway)
terraform apply -target=module.cloudrun_services.google_cloud_run_v2_service.keycloak -auto-approve
terraform apply -target=module.cloudrun_services.google_cloud_run_domain_mapping.auth_domain -auto-approve
# Deploy other services except mcp-gateway...

# Stage 2: Wait for SSL certificate on auth.tamshai.com
echo "Waiting for SSL certificate..."
attempts=0
max_attempts=40  # ~20 minutes
while [ $attempts -lt $max_attempts ]; do
    if curl -sf https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration > /dev/null 2>&1; then
        echo "SSL ready after $attempts attempts"
        break
    fi
    echo "Attempt $((attempts+1))/$max_attempts - SSL not ready, waiting 30s..."
    sleep 30
    ((attempts++))
done

# Stage 3: Deploy mcp-gateway (SSL is now ready)
terraform apply -target=module.cloudrun_services.google_cloud_run_v2_service.mcp_gateway -auto-approve
```

**Note**: Typical SSL wait is 10-17 minutes (34 attempts in v11). The `phoenix-rebuild.sh` script handles this automatically.

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
| 3.8.0 | Jan 27, 2026 | Tamshai-Dev | v14 rebuild: 0 manual actions; validated v13 fixes (KEYCLOAK_URL, polling, cross-env); documented provision-users Cloud Run Job container failure |
| 3.7.0 | Jan 26, 2026 | Tamshai-Dev | Added v13 issues: provision-prod-users KEYCLOAK_URL discovery, Cloud Run Job polling Unknown status, E2E cross-env Windows fix; updated related docs |
| 3.6.0 | Jan 26, 2026 | Tamshai-Dev | Added v12 issues: PROD_USER_PASSWORD fetch, E2E silent failure, workflow detection fix; updated DR script |
| 3.5.0 | Jan 26, 2026 | Tamshai-Dev | Added blocking requirements: user password provisioning and ALL E2E tests must pass for successful rebuild |
| 3.4.0 | Jan 26, 2026 | Tamshai-Dev | Added Issue #103 troubleshooting: VPC peering dependency diagnostics and auto-created firewall rule diagnostics |
| 3.3.0 | Jan 22, 2026 | Tamshai-Dev | Added decision tree and reference to GCP Regional Failure Runbook; added Regional Evacuation Scripts section |
| 3.2.0 | Jan 21, 2026 | Tamshai-Dev | Added Issues #32, #36, #37 from v10/v11 rebuilds; updated phase table with durations; updated E2E test command; staged Phase 7 with SSL wait |
| 3.1.0 | Jan 20, 2026 | Tamshai-Dev | Added Issues #9, #10, #11 troubleshooting; Phase 7 validates SA key; Phase 8 has 409 recovery |
| 3.0.0 | Jan 20, 2026 | Tamshai-Dev | Restructured: minimal main runbook, manual procedures moved to Appendix B |
| 2.3.0 | Jan 20, 2026 | Tamshai-Dev | Gap #49 fix, removed SSL waiting, automated pre-destroy cleanup |
| 2.2.0 | Jan 2026 | Tamshai-Dev | Added Gaps #38-43 fixes |
| 2.1.0 | Jan 2026 | Tamshai-QA | Added Gaps #1a-#37 |
| 2.0.0 | Jan 2026 | Tamshai-QA | Complete rewrite with automated scripts |
| 1.0.0 | Dec 2025 | Tamshai-Dev | Initial version |
