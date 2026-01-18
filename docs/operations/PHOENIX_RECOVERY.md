# Phoenix Recovery Procedures

This document describes how to recover Tamshai Enterprise AI environments from scratch following the **Phoenix Architecture** principle: any environment should be destroyable and recreatable without manual intervention.

**Last Updated**: January 18, 2026

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
| **Stage** | Terraform destroy + apply | 5-10 min | None (sample data reloaded) |
| **Prod** | Terraform destroy + apply | 10-15 min | **User data if not backed up** |

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

### Prerequisites

- Terraform 1.5+
- GCP project with billing enabled
- Service account with required permissions
- GitHub repository with GCP secrets configured
- gcloud CLI authenticated

### Complete Phoenix Rebuild Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GCP PROD PHOENIX REBUILD SEQUENCE                    │
├─────────────────────────────────────────────────────────────────────────┤
│  1. terraform destroy + apply    │ Recreate GCP infrastructure          │
│  2. gcloud builds submit         │ Rebuild Cloud Run Job image          │
│  3. deploy-to-gcp.yml            │ Deploy all Cloud Run services        │
│  4. provision-prod-users.yml     │ Load HR data, sync users to Keycloak │
│  5. provision-prod-data.yml      │ Load Finance, Sales, Support data    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Full Recovery Procedure

```bash
# Step 1: Navigate to Terraform directory
cd infrastructure/terraform/gcp

# Step 2: Destroy existing infrastructure
terraform destroy -auto-approve
# WARNING: This destroys ALL production data if not backed up!
# Takes ~5-10 minutes (Cloud Run, Cloud SQL, etc.)

# Step 3: Recreate infrastructure
terraform apply -auto-approve
# This creates: Cloud Run services, Cloud SQL, Secret Manager, VPC connector, etc.
# Takes ~10-15 minutes

# Step 4: Rebuild Cloud Run Job image (required after entrypoint.sh changes)
gcloud builds submit \
  --config=scripts/gcp/provision-job/cloudbuild.yaml \
  --project=gen-lang-client-0553641830
# Takes ~2-3 minutes

# Step 5: Deploy all services
gh workflow run deploy-to-gcp.yml -f service=all
# Monitor: gh run watch
# Deploys: Keycloak, MCP Gateway, MCP Suite, Web Portal
# Takes ~5-10 minutes

# Step 6: Load HR data and sync users to Keycloak
gh workflow run provision-prod-users.yml -f action=all -f dry_run=false
# Monitor: gh run watch
# Loads: sample-data/hr-data.sql → Cloud SQL
# Syncs: HR employees → Keycloak users
# Takes ~2-3 minutes

# Step 7: Load Finance, Sales, Support sample data
gh workflow run provision-prod-data.yml -f data_set=all -f dry_run=false
# Monitor: gh run watch
# Loads: Finance → Cloud SQL, Sales/Support → MongoDB Atlas
# Takes ~2-3 minutes
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
cloud-sql-proxy gen-lang-client-0553641830:us-central1:tamshai-prod-postgres --port=5432 &
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
# Stage
gh secret set TEST_USER_PASSWORD -b "NewPassword123!"
gh workflow run deploy-vps.yml --ref main

# Prod
gcloud secrets versions add tamshai-prod-keycloak-admin-password --data-file=<(echo -n "NewAdminPassword!")
gh workflow run deploy-to-gcp.yml --ref main
```

## Related Documentation

- [KEYCLOAK_MANAGEMENT.md](./KEYCLOAK_MANAGEMENT.md) - Keycloak-specific operations
- [IDENTITY_SYNC.md](./IDENTITY_SYNC.md) - User provisioning details
- [E2E_USER_TESTS.md](../testing/E2E_USER_TESTS.md) - E2E test procedures
- [TEST_USER_JOURNEY.md](../testing/TEST_USER_JOURNEY.md) - Test user credentials

---

*Last Updated: January 18, 2026*
*Status: Active - Aligned with Phoenix Architecture principles*
