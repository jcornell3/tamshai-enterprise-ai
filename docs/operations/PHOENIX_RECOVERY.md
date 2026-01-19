# Phoenix Recovery Procedures

This document describes how to recover Tamshai Enterprise AI environments from scratch following the **Phoenix Architecture** principle: any environment should be destroyable and recreatable without manual intervention.

**Last Updated**: January 19, 2026
**Version**: 2.0 (Updated with lessons from Phoenix rebuild 2026-01-18/19)

## Overview

### What is Phoenix Architecture?

Phoenix Architecture means:
1. **Declarative Infrastructure**: All infrastructure is defined in code (Terraform, Docker Compose)
2. **Immutable State**: Environments are rebuilt, not patched
3. **Automated Provisioning**: Users, data, and configuration are auto-provisioned on deploy
4. **Idempotent Operations**: Running deploy twice produces the same result

### Why Phoenix Matters

| Traditional | Phoenix |
|-------------|---------|
| Snowflake servers | Cattle servers |
| Manual fixes | Automated recovery |
| "Don't touch production" | "Destroy and recreate" |
| Configuration drift | Consistent state |
| Fear of changes | Confidence in deploys |

## Environment Recovery Matrix

| Environment | Recovery Method | Time | Data Loss |
|-------------|-----------------|------|-----------|
| **Dev** | Terraform destroy + apply | 5-10 min | None (sample data reloaded) |
| **Stage** | Terraform destroy + apply | 15-20 min | None (sample data reloaded) |
| **Prod** | Full Phoenix rebuild | **~100 min** | **User data if not backed up** |

> **Note**: Prod recovery time increased from 10-15 min to ~100 min based on Phoenix rebuild lessons learned (Jan 2026). See [PHOENIX_RUNBOOK.md](./PHOENIX_RUNBOOK.md) for detailed phases.

## Dev Environment Recovery

### Prerequisites

- Docker Desktop running
- Terraform 1.5+
- Git repository cloned

### Full Recovery Procedure

```bash
# Step 1: Navigate to Terraform directory
cd infrastructure/terraform/dev

# Step 2: Destroy existing environment
terraform destroy -var-file=dev.tfvars -auto-approve
# This destroys: Docker containers, volumes, networks
# Takes ~30 seconds

# Step 3: Recreate environment
terraform apply -var-file=dev.tfvars -auto-approve
# This creates: All containers, imports realm, loads sample data
# Takes ~3-5 minutes (first run longer due to image pulls)

# Step 4: Verify services are running
docker compose ps
# All services should show "healthy" or "running"

# Step 5: Verify Keycloak is ready
curl -sf http://localhost:8180/auth/health/ready && echo "OK"

# Step 6: Verify sample data
./scripts/infra/keycloak.sh users dev
# Should show 8+ bootstrap users (alice.chen, bob.martinez, etc.)
```

### Post-Recovery Verification

```bash
# Check all services
./scripts/infra/status.sh dev

# Run health check
./scripts/mcp/health-check.sh dev

# Test SSO login (optional)
./scripts/test/login-journey.sh dev
```

### What Gets Recreated

| Component | Source | Notes |
|-----------|--------|-------|
| Keycloak realm | `keycloak/realm-export-dev.json` | Bootstrap users included |
| HR employees | `sample-data/hr-data.sql` | Via PostgreSQL init |
| Finance data | `sample-data/finance-data.sql` | Via PostgreSQL init |
| Sales data | `sample-data/sales-data.js` | Via MongoDB init |
| Support data | `sample-data/support-data.ndjson` | Via Elasticsearch init |
| Client config | `sync-realm.sh` | Audience mappers, clients |

## Stage (VPS) Environment Recovery

### Prerequisites

- Terraform 1.5+
- Hetzner Cloud account with API token
- GitHub repository with secrets configured

### Full Recovery Procedure

```bash
# Step 1: Navigate to Terraform directory
cd infrastructure/terraform/vps

# Step 2: Destroy existing VPS
terraform destroy -auto-approve
# This destroys: VPS, firewall, SSH keys
# Takes ~30 seconds

# Step 3: Recreate VPS
terraform apply -auto-approve
# This creates: New VPS, firewall, generates new SSH key
# Takes ~60 seconds
# NOTE: Terraform automatically updates GitHub VPS_SSH_KEY secret

# Step 4: Wait for cloud-init to complete
# Cloud-init runs on VPS boot: installs Docker, clones repo, starts services
# Takes ~5-10 minutes
# Monitor via: ssh root@$(terraform output -raw vps_ip) 'tail -f /var/log/cloud-init-output.log'

# Step 5: Trigger deployment workflow
gh workflow run deploy-vps.yml --ref main

# Step 6: Monitor deployment
gh run list --workflow=deploy-vps.yml --limit 1
gh run watch
```

### Post-Recovery Verification

```bash
# Get VPS IP
export VPS_HOST=$(terraform output -raw vps_ip)

# Check services via HTTPS
curl -sf https://www.tamshai.com/health && echo "OK"
curl -sf https://www.tamshai.com/auth/health/ready && echo "OK"

# Verify users exist
./scripts/infra/keycloak.sh users stage

# Run E2E tests (verifies full login flow)
cd tests/e2e
rm -rf .totp-secrets/test-user.journey-stage.secret
npx cross-env TEST_ENV=stage TEST_USER_PASSWORD="..." playwright test login-journey.ui.spec.ts --workers=1 --project=chromium
```

### What Gets Recreated

| Component | Source | How |
|-----------|--------|-----|
| VPS infrastructure | `terraform/vps/main.tf` | Terraform apply |
| Docker services | `cloud-init.yaml` | Cloud-init on boot |
| Keycloak realm | `realm-export-stage.json` | Docker volume mount |
| Test user credentials | GitHub Secrets | `deploy-vps.yml` substitution |
| HR employees | `sample-data/hr-data.sql` | Phoenix check in deploy-vps.yml |
| Identity sync | `identity-sync` container | Provisions HR→Keycloak |
| Sample data | Various files | `reseed_data=true` option |

### Stage-Specific Phoenix Features

The `deploy-vps.yml` workflow implements Phoenix principles:

1. **Secret Substitution**: `__TEST_USER_PASSWORD__` placeholders are replaced at deploy time
2. **Identity-Sync Fatal**: Deployment fails if user provisioning fails
3. **HR Data Phoenix Check**: Loads sample data if database is empty
4. **User Count Verification**: Requires minimum 2 users after deployment

## Prod (GCP) Environment Recovery

> **IMPORTANT**: For detailed step-by-step instructions, see [PHOENIX_RUNBOOK.md](./PHOENIX_RUNBOOK.md).
> For gap documentation and troubleshooting, see [PHOENIX_MANUAL_ACTIONS.md](./PHOENIX_MANUAL_ACTIONS.md).

### Prerequisites

- Terraform 1.5+
- GCP project with billing enabled
- Service account with required permissions
- GitHub repository with GCP secrets configured
- gcloud CLI authenticated

### Complete Phoenix Rebuild Sequence (10 Phases)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GCP PROD PHOENIX REBUILD SEQUENCE                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Pre-flight checks      │ Validate tools, secrets, DNS         │
│  Phase 2: Secret sync            │ Verify GCP Secret Manager             │
│  Phase 3: Pre-destroy cleanup    │ Delete jobs, disable protections     │
│  Phase 4: Terraform destroy      │ Destroy all GCP infrastructure       │
│  Phase 5: Post-destroy verify    │ FAIL if orphaned resources exist     │
│  Phase 6: Terraform apply        │ Staged: networking first, then full  │
│  Phase 7: Domain mapping         │ Create auth.tamshai.com → keycloak   │
│  Phase 8: Deploy via GHA         │ Deploy all Cloud Run services        │
│  Phase 9: Configure TOTP         │ Set test-user.journey credentials    │
│  Phase 10: Verify                │ E2E tests, health checks             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Quick Recovery (Automated)

```bash
# Run the automated Phoenix rebuild script
./scripts/gcp/phoenix-rebuild.sh

# Or with options:
./scripts/gcp/phoenix-rebuild.sh --dry-run   # Preview only
./scripts/gcp/phoenix-rebuild.sh --resume    # Resume from checkpoint
```

### Full Recovery Procedure (Manual)

```bash
# ============================================================
# PHASE 1-2: Pre-flight and Secret Verification
# ============================================================
./scripts/gcp/phoenix-preflight.sh

# ============================================================
# PHASE 3: Pre-Destroy Cleanup (CRITICAL)
# ============================================================
cd infrastructure/terraform/gcp

# Delete Cloud Run jobs (Gap #42: deletion_protection now false in Terraform, but cleanup still recommended)
gcloud run jobs delete provision-users --region=us-central1 --quiet 2>/dev/null || true

# Gap #38: Delete Cloud Run services BEFORE terraform destroy
# This releases database connections that would otherwise block keycloak DB deletion
for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
  gcloud run services delete "$svc" --region=us-central1 --quiet 2>/dev/null || true
done
sleep 10  # Wait for connections to close

# Disable Cloud SQL deletion protection
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet 2>/dev/null || true

# ============================================================
# PHASE 4: Terraform Destroy
# ============================================================
terraform destroy -auto-approve
# WARNING: This destroys ALL production data if not backed up!

# If destroy fails on VPC, see PHOENIX_RUNBOOK.md troubleshooting

# ============================================================
# PHASE 5: Post-Destroy Verification (CRITICAL - FAIL FAST)
# ============================================================
# Verify all resources destroyed - FAIL if any remain
gcloud run services list --region=us-central1 --format="value(name)" | \
  grep -E "^(keycloak|mcp-|web-portal)" && echo "ERROR: Cloud Run still exists" && exit 1
gcloud sql instances list --format="value(name)" | \
  grep tamshai && echo "ERROR: Cloud SQL still exists" && exit 1
echo "Post-destroy verification PASSED"

# Delete persisted secrets
for secret in tamshai-prod-keycloak-admin-password tamshai-prod-keycloak-db-password \
  tamshai-prod-db-password tamshai-prod-anthropic-api-key mcp-hr-service-client-secret; do
  gcloud secrets delete "$secret" --quiet 2>/dev/null || true
done

# ============================================================
# PHASE 6: Terraform Apply (STAGED)
# ============================================================
terraform init -upgrade

# CRITICAL: Networking module MUST complete first
terraform apply -target=module.networking -auto-approve

# Then full apply
terraform apply -auto-approve

# Add version to mcp-hr-service-client-secret (Terraform creates shell only)
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets versions add mcp-hr-service-client-secret --data-file=- 2>/dev/null || true

# ============================================================
# PHASE 7: Domain Mapping (CRITICAL)
# ============================================================
# Cloudflare DNS persists but GCP domain mapping is destroyed
gcloud beta run domain-mappings create \
  --service=keycloak \
  --domain=auth.tamshai.com \
  --region=us-central1 2>/dev/null || true

# Wait for domain to be routable (Cloudflare handles SSL)
echo "Waiting for auth.tamshai.com to be routable..."
for i in {1..30}; do
  STATUS=$(gcloud beta run domain-mappings describe \
    --domain=auth.tamshai.com --region=us-central1 \
    --format="value(status.conditions[2].status)" 2>/dev/null || echo "Unknown")
  [[ "$STATUS" == "True" ]] && echo "Domain routable!" && break
  echo "  Waiting... ($((i*10))s, status: $STATUS)"
  sleep 10
done

# ============================================================
# PHASE 8: Regenerate CICD Key and Deploy
# ============================================================
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create /tmp/key.json \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/key.json
rm /tmp/key.json

# Deploy all services
gh workflow run deploy-to-gcp.yml -f service=all
gh run watch

# ============================================================
# PHASE 9-10: Configure TOTP and Verify
# ============================================================
# Set TOTP for test-user.journey
export KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
export AUTO_CONFIRM=true
./keycloak/scripts/set-user-totp.sh prod test-user.journey

# Run E2E tests
cd tests/e2e
npm run test:login:prod
```

### Sample Data Targets

| Data | Database | Loaded By | Connection Method |
|------|----------|-----------|-------------------|
| HR | Cloud SQL `tamshai_hr` | provision-prod-users.yml | Cloud SQL Proxy |
| Finance | Cloud SQL `tamshai_finance` | provision-prod-data.yml | Cloud Run Job (VPC connector) |
| Sales | MongoDB Atlas `tamshai_sales` | provision-prod-data.yml | Direct (public Atlas) |
| Support | MongoDB Atlas `tamshai_support` | provision-prod-data.yml | Direct (public Atlas) |

**Note:** Cloud SQL has private IP only. HR data uses Cloud SQL Proxy from GitHub Actions. Finance data uses the Cloud Run Job which has VPC connector access.

### Prod-Specific Considerations

| Item | Dev/Stage | Prod |
|------|-----------|------|
| Sample data | Auto-loaded | NOT loaded |
| HR users | Identity-sync | Manual provisioning |
| Test users | Bootstrap | `test-user.journey` only |
| TOTP | Auto-captured | Pre-configured secret |

**Why Prod is Different**:
- No test users with known passwords (security)
- Identity sync disabled (requires planning for real HR data)
- Only `test-user.journey` exists (safe, no data access)

### Post-Recovery Verification

```bash
# Check Cloud Run services
gcloud run services list --region=us-central1

# Verify Keycloak
curl -sf https://auth.tamshai.com/auth/health/ready && echo "OK"

# Verify HR data (via Cloud SQL Proxy)
cloud-sql-proxy ${PROJECT_ID}:us-central1:tamshai-prod-postgres --port=5432 &
PGPASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-db-password) \
  psql -h localhost -p 5432 -U tamshai -d tamshai_hr -c "SELECT COUNT(*) FROM hr.employees;"

# Verify Finance data
PGPASSWORD=$(gcloud secrets versions access latest --secret=tamshai-prod-db-password) \
  psql -h localhost -p 5432 -U tamshai -d tamshai_finance -c "SELECT COUNT(*) FROM finance.invoices;"

# Verify Sales/Support data (MongoDB Atlas)
MONGODB_URI=$(gcloud secrets versions access latest --secret=tamshai-prod-mongodb-uri)
mongosh "$MONGODB_URI" --eval "db.getSiblingDB('tamshai_sales').customers.countDocuments()"
mongosh "$MONGODB_URI" --eval "db.getSiblingDB('tamshai_support').tickets.countDocuments()"

# Run E2E tests
cd tests/e2e
npx cross-env TEST_ENV=prod TEST_USER_PASSWORD="..." playwright test login-journey.ui.spec.ts --workers=1 --project=chromium
```

## Disaster Recovery Scenarios

### Scenario 1: Corrupted Database

**Symptoms**: Services crash, data inconsistent, migrations fail

**Recovery**:
```bash
# Option A: Full Phoenix recovery (recommended)
terraform destroy && terraform apply
gh workflow run deploy-[env].yml

# Option B: Database-only recovery
./scripts/db/restore.sh [env] ./backups/[latest]/
docker compose restart keycloak mcp-gateway
```

### Scenario 2: Keycloak Won't Start

**Symptoms**: 500 errors on login, "realm not found", migration failures

**Recovery**:
```bash
# Reset Keycloak only (preserves other services)
./scripts/infra/keycloak.sh reset [env]
./scripts/infra/keycloak.sh sync [env]
./scripts/infra/keycloak.sh sync-users [env]
```

### Scenario 3: Secret Rotation Required

**Symptoms**: Security incident, password leak, key rotation policy

**Recovery**:
```bash
# Stage: Update GitHub secrets
gh secret set TEST_USER_PASSWORD -b "new_password"
gh secret set KEYCLOAK_VPS_ADMIN_PASSWORD -b "new_admin_password"

# Redeploy to apply new secrets
gh workflow run deploy-vps.yml --ref main

# Prod: Update GCP Secret Manager
gcloud secrets versions add TEST_USER_PASSWORD --data-file=-
gcloud secrets versions add KEYCLOAK_ADMIN_PASSWORD --data-file=-

# Redeploy
gh workflow run deploy-to-gcp.yml --ref main
```

### Scenario 4: VPS IP Changed

**Symptoms**: After Terraform destroy/apply, IP address changes

**Recovery**:
```bash
# Get new IP
cd infrastructure/terraform/vps
export NEW_IP=$(terraform output -raw vps_ip)

# Terraform automatically updates GitHub secret VPS_SSH_KEY
# Update any manual scripts that reference old IP
echo "New VPS IP: $NEW_IP"

# DNS is handled by Cloudflare (www.tamshai.com)
# If using raw IP for SSH, update your local references
```

### Scenario 5: Terraform Destroy Hangs on VPC (Prod)

**Symptoms**: `terraform destroy` times out on VPC or networking resources

**Root Cause**: Service networking connection, orphaned private IP, or VPC connector blocks deletion (Gaps #23-25)

**Recovery**:
```bash
cd infrastructure/terraform/gcp

# Gap #23: Remove service networking from state
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection'
terraform state rm 'module.database.google_compute_global_address.private_ip_range'

# Gap #24: Delete orphaned private IP addresses
gcloud compute addresses list --global --format="value(name)" | grep tamshai | \
  xargs -I {} gcloud compute addresses delete {} --global --quiet

# Gap #25: Remove VPC connector references from state
terraform state rm 'module.networking.google_vpc_access_connector.connector[0]' 2>/dev/null || true
terraform state rm 'module.networking.google_vpc_access_connector.connector' 2>/dev/null || true

# Targeted destroy of VPC
terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
```

**Note**: The `phoenix-rebuild.sh` script now handles all these state cleanup operations automatically.

### Scenario 6: auth.tamshai.com Not Reachable After Rebuild (Prod)

**Symptoms**: mcp-gateway fails to start, Keycloak unreachable at custom domain

**Root Cause**: Cloudflare DNS persists but GCP domain mapping was destroyed

**Recovery**:
```bash
# Create the domain mapping
gcloud beta run domain-mappings create \
  --service=keycloak \
  --domain=auth.tamshai.com \
  --region=us-central1

# Wait for it to be routable
gcloud beta run domain-mappings describe \
  --domain=auth.tamshai.com --region=us-central1 \
  --format="value(status.conditions[2].status)"
# Should return "True"

# Verify HTTPS access (Cloudflare handles SSL)
curl -sf https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration
```

### Scenario 7: deploy-static-website Fails with Permission Error (Prod)

**Symptoms**: `gcloud storage rsync` fails with "storage.buckets.get" permission denied

**Root Cause**: CICD service account missing `roles/storage.legacyBucketReader`

**Recovery**:
```bash
# Apply Terraform to create IAM binding (fixed in storage module)
cd infrastructure/terraform/gcp
terraform apply -target=module.storage -auto-approve

# Or manually add the binding
gcloud storage buckets add-iam-policy-binding gs://prod.tamshai.com \
  --member="serviceAccount:tamshai-prod-cicd@$(gcloud config get-value project).iam.gserviceaccount.com" \
  --role="roles/storage.legacyBucketReader"
```

### Scenario 8: Terraform State Lock Stuck

**Symptoms**: "Error acquiring the state lock" message

**Root Cause**: Previous terraform command crashed or was interrupted

**Recovery**:
```bash
cd infrastructure/terraform/gcp

# Get lock ID from error message
# Force unlock (use ID from error)
terraform force-unlock -force <LOCK_ID>

# Retry operation
terraform apply -auto-approve
```

### Scenario 9: MCP Services Fail with MongoDB URI Permission Error (Prod)

**Symptoms**: `gcloud run deploy mcp-*` fails with "Permission denied on secret: tamshai-prod-mongodb-uri"

**Root Cause**: MCP servers service account doesn't have access to the MongoDB URI secret. (Gap #43)

**Status**: ✅ **FIXED IN TERRAFORM** (January 2026)

The `modules/security/main.tf` now includes:
- Data source for external `tamshai-prod-mongodb-uri` secret
- IAM binding for MCP servers SA to access the secret
- Controlled by `enable_mongodb_uri_access` variable (default: true)

**Recovery** (if issue still occurs):
```bash
# Manual fallback - Add IAM binding for MCP servers to access MongoDB URI secret
gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
  --member="serviceAccount:tamshai-prod-mcp-servers@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Re-trigger deployment
gh workflow run deploy-to-gcp.yml --ref main
```

### Scenario 10: GitHub Secrets Not Synced to GCP (Prod)

**Symptoms**: `terraform apply` creates secrets but Cloud Run services fail with "secret version not found"

**Root Cause**: Terraform creates GCP Secret Manager secrets as empty shells. Values must be populated from GitHub secrets. (Gap #41)

**Status**: ✅ **AUTOMATION AVAILABLE** (January 2026)

The `scripts/gcp/lib/secrets.sh` library now includes:
- `sync_secrets_from_env()` - Syncs secrets from environment variables to GCP
- `ensure_mcp_hr_client_secret()` - Creates mcp-hr-service-client-secret with version if missing
- `phoenix-rebuild.sh` Phase 2 automatically calls these functions

**Automated Recovery** (preferred):
```bash
# Export secrets as environment variables (e.g., from GitHub Actions)
export CLAUDE_API_KEY_PROD="sk-ant-..."
export MCP_HR_SERVICE_CLIENT_SECRET="..."

# Run Phoenix rebuild which handles secret sync automatically
./scripts/gcp/phoenix-rebuild.sh
```

**Manual Recovery** (fallback):
```bash
# Source the secrets library
source scripts/gcp/lib/secrets.sh

# Ensure mcp-hr-service-client-secret has a version
ensure_mcp_hr_client_secret

# Or generate and sync manually
MCP_HR_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo -n "$MCP_HR_SECRET" | gcloud secrets versions add mcp-hr-service-client-secret --data-file=-

# Update GitHub secret to match
echo -n "$MCP_HR_SECRET" | gh secret set MCP_HR_SERVICE_CLIENT_SECRET

# Re-trigger deployment
gh workflow run deploy-to-gcp.yml --ref main
```

### Scenario 11: Keycloak Database Locked During Destroy (Prod)

**Symptoms**: `terraform destroy` fails with "database 'keycloak' is being accessed by other users"

**Root Cause**: Cloud Run services maintain active connections to Cloud SQL. When terraform tries to delete the keycloak database, connections are still open. (Gap #38)

**Status**: ✅ **FIXED IN PHOENIX-REBUILD.SH** (January 2026)

The `phoenix-rebuild.sh` Phase 3 now automatically deletes all Cloud Run services before terraform destroy, releasing database connections.

**Recovery** (if running manual destroy):
```bash
# Delete Cloud Run services BEFORE terraform destroy
for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
  gcloud run services delete "$svc" --region=us-central1 --quiet 2>/dev/null || true
done

# Wait for connections to close
sleep 10

# Then run terraform destroy
terraform destroy -auto-approve
```

### Scenario 12: Storage Bucket Won't Delete Without force_destroy (Prod)

**Symptoms**: `terraform destroy` fails with "Error trying to delete bucket without force_destroy set to true"

**Root Cause**: Production storage buckets have `force_destroy=false` to prevent accidental data loss. During Phoenix rebuild, this blocks bucket deletion. (Gap #39)

**Status**: ✅ **PHOENIX MODE AVAILABLE** (January 2026)

The `phoenix_mode` variable in `infrastructure/terraform/gcp/variables.tf` now controls `force_destroy` on storage buckets.

**Recovery**:
```bash
cd infrastructure/terraform/gcp

# Option 1: Use phoenix_mode variable
terraform destroy -var="phoenix_mode=true" -auto-approve

# Option 2: Empty and delete bucket manually
gcloud storage rm -r gs://prod.tamshai.com/** 2>/dev/null || true
gcloud storage buckets delete gs://prod.tamshai.com --quiet
```

**Note**: `phoenix_mode=true` should only be used during full environment rebuilds.

## Recovery Checklist

Use this checklist after any Phoenix recovery:

### Dev Environment
- [ ] `docker compose ps` shows all services running
- [ ] Keycloak health endpoint returns 200
- [ ] Login as alice.chen works
- [ ] HR MCP shows employee data
- [ ] Finance MCP shows budget data
- [ ] Sales MCP shows deals
- [ ] Support MCP shows tickets

### Stage Environment
- [ ] `https://www.tamshai.com/health` returns 200
- [ ] `https://www.tamshai.com/auth/health/ready` returns 200
- [ ] test-user.journey can log in
- [ ] HR employees synced to Keycloak (≥2 users)
- [ ] E2E tests pass (6/6)

### Prod Environment
- [ ] All Cloud Run services healthy
- [ ] Keycloak health endpoint returns 200
- [ ] test-user.journey can log in
- [ ] E2E tests pass (6/6)
- [ ] Monitoring alerts not firing

## Backup Procedures

### Before Phoenix Recovery

Always backup before destroy if you have important data:

```bash
# Backup all databases
./scripts/db/backup.sh [env]

# Backup location
ls ./backups/[env]/[timestamp]/
# - postgres-tamshai_hr.dump
# - postgres-tamshai_finance.dump
# - mongodb-tamshai_sales.archive
# - elasticsearch-support_tickets.json
```

### After Phoenix Recovery

Restore from backup if needed:

```bash
# Full restore
./scripts/db/restore.sh [env] ./backups/[env]/[timestamp]/

# Individual database restore
docker exec -i postgres psql -U tamshai -d tamshai_hr < backup.sql
```

## Required Secrets

Phoenix recovery depends on secrets being pre-configured. Below are the required secrets for each environment.

### GitHub Secrets (Stage/VPS)

Required for `deploy-vps.yml` workflow:

| Secret Name | Description | How to Set |
|-------------|-------------|------------|
| `VPS_HOST` | VPS IP address | `terraform output -raw vps_ip` |
| `VPS_SSH_KEY` | SSH private key (Ed25519) | Auto-updated by Terraform |
| `VPS_SSH_USER` | SSH username | `root` (default) |
| `KEYCLOAK_VPS_ADMIN_PASSWORD` | Keycloak admin password | Auto-generated by Terraform |
| `TEST_USER_PASSWORD` | test-user.journey password | Manual: `gh secret set TEST_USER_PASSWORD` |
| `TEST_USER_TOTP_SECRET_RAW` | TOTP raw secret | Manual: `gh secret set TEST_USER_TOTP_SECRET_RAW` |
| `STAGE_USER_PASSWORD` | HR-synced users password | Manual: `gh secret set STAGE_USER_PASSWORD` |
| `CLAUDE_API_KEY` | Anthropic API key | Manual: from console.anthropic.com |

**Setup after Terraform apply:**
```bash
cd infrastructure/terraform/vps

# VPS_SSH_KEY is auto-updated by Terraform
# Verify: gh secret list | grep VPS_SSH_KEY

# Set other secrets manually
gh secret set TEST_USER_PASSWORD -b "YourSecurePassword123!"
gh secret set TEST_USER_TOTP_SECRET_RAW -b "JBSWY3DPEHPK3PXP"
gh secret set STAGE_USER_PASSWORD -b "TamshaiTemp123!"
gh secret set CLAUDE_API_KEY -b "sk-ant-api03-..."
```

### GCP Secret Manager (Prod)

Required for `deploy-to-gcp.yml` workflow:

| Secret Name | Description | How to Create |
|-------------|-------------|---------------|
| `tamshai-prod-anthropic-api-key` | Claude API key | `gcloud secrets create ...` |
| `tamshai-prod-keycloak-admin-password` | Keycloak admin | Auto by Terraform |
| `tamshai-prod-keycloak-db-password` | Keycloak DB | Auto by Terraform |
| `tamshai-prod-db-password` | PostgreSQL password | Auto by Terraform |
| `tamshai-prod-mongodb-uri` | MongoDB Atlas URI | Manual |

**GitHub Secrets for GCP:**

| Secret Name | Description |
|-------------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_SA_KEY_PROD` | Service account key JSON |
| `TEST_USER_PASSWORD` | test-user.journey password |
| `TEST_USER_TOTP_SECRET_RAW` | TOTP raw secret |

**Setup after Terraform apply:**
```bash
cd infrastructure/terraform/gcp

# Create secrets
gcloud secrets create tamshai-prod-anthropic-api-key --data-file=<(echo -n "sk-ant-api03-...")

# Verify secrets exist
gcloud secrets list --filter="name:tamshai-prod"
```

### Dev Environment

Dev uses GitHub Secrets injected via Terraform environment variables:

| Secret Name | Description | How to Set |
|-------------|-------------|------------|
| `DEV_USER_PASSWORD` | Corporate users password | `gh secret set DEV_USER_PASSWORD` |
| `TEST_USER_PASSWORD` | test-user.journey password | `gh secret set TEST_USER_PASSWORD` |
| `CLAUDE_API_KEY_DEV` | Anthropic API key (dev) | `gh secret set CLAUDE_API_KEY_DEV` |

**Local Dev Setup:**
```bash
# Export secrets as TF_VAR_* environment variables
# Use scripts/secrets/export-test-secrets.yml workflow to fetch from GitHub
export TF_VAR_test_user_password=$(gh secret get TEST_USER_PASSWORD 2>/dev/null || echo "")
export TF_VAR_dev_user_password=$(gh secret get DEV_USER_PASSWORD 2>/dev/null || echo "")
export TF_VAR_claude_api_key=$(gh secret get CLAUDE_API_KEY_DEV 2>/dev/null || echo "")

# Then run terraform
terraform apply -var-file=dev.tfvars
```

### Secret Rotation

When rotating secrets:

1. **Update secret source** (GitHub/GCP Secret Manager)
2. **Redeploy** to apply new values
3. **Clear caches** (Redis token cache, browser sessions)

```bash
# Prod - Keycloak admin password rotation
# Generate new secure password and store it
NEW_PASSWORD=$(openssl rand -base64 24)
echo -n "$NEW_PASSWORD" | gcloud secrets versions add tamshai-prod-keycloak-admin-password --data-file=-
gh workflow run deploy-to-gcp.yml --ref main
```

> **Note**: `TEST_USER_PASSWORD` is a fixed credential stored in GitHub secrets. It should be **retrieved and used**, not rotated. The test-user.journey account uses this password across all environments.

## Related Documentation

- [PHOENIX_RUNBOOK.md](./PHOENIX_RUNBOOK.md) - **Detailed step-by-step runbook with checkpoints**
- [PHOENIX_MANUAL_ACTIONS.md](./PHOENIX_MANUAL_ACTIONS.md) - **Gap documentation and troubleshooting**
- [KEYCLOAK_MANAGEMENT.md](./KEYCLOAK_MANAGEMENT.md) - Keycloak-specific operations
- [IDENTITY_SYNC.md](./IDENTITY_SYNC.md) - User provisioning details
- [E2E_USER_TESTS.md](../testing/E2E_USER_TESTS.md) - E2E test procedures
- [TEST_USER_JOURNEY.md](../testing/TEST_USER_JOURNEY.md) - Test user credentials

---

*Last Updated: January 19, 2026*
*Status: Active - Updated with Phoenix rebuild lessons learned (Gaps #1-43)*
