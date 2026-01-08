# Phase 1: Cost-Optimized Production (Pilot)

**Document Version**: 1.1
**Created**: January 2026
**Updated**: January 7, 2026
**Status**: Prerequisites Complete (8/8) - Ready for Implementation

## Executive Summary

This deployment phase is designed for **very low traffic** (e.g., internal testing, beta users, < 10 concurrent users). The priority is **functionality over redundancy**. We minimize fixed costs by using shared-core infrastructure and serverless scaling to zero.

**Estimated Monthly Cost:** ~$50 - $80 USD

---

## Action Items & Responsibilities

This section clarifies what **you (project owner)** must provide vs. what **Claude (deployment expert)** will implement.

### 🔴 User Actions (Prerequisites)

These items require your input or action before deployment can proceed:

| # | Action | Details | Status |
|---|--------|---------|--------|
| 1 | **Provide GCP Project** | GCP project designated for production | ✅ |
| | | • Project ID/Number: *(stored in secrets)* | |
| | | • Billing Account linked: Yes | |
| 2 | **Enable Required APIs** | Claude will enable via `gcloud` | ✅ |
| | | • Cloud Run API | |
| | | • Cloud SQL Admin API | |
| | | • Secret Manager API | |
| | | • Compute Engine API | |
| | | • Artifact Registry API | |
| 3 | **Provide Domain Decision** | Domain configuration confirmed | ✅ |
| | | • API: `api.tamshai.com` | |
| | | • Auth: `auth.tamshai.com` | |
| | | • App: `app.tamshai.com` | |
| | | • DNS Provider: Cloudflare | |
| 4 | **Provide Claude API Key** | Key provided *(stored in secrets)* | ✅ |
| | | • Will be stored in GCP Secret Manager | |
| 5 | **MongoDB Atlas Decision** | See [Appendix A](#appendix-a-mongodb-atlas-m0-setup) | ✅ |
| | | • ✅ Use MongoDB Atlas M0 (Free) | |
| | | • ⬜ Self-host on Utility VM | |
| 6 | **Choose GCP Region** | `us-central1` | ✅ |
| 7 | **Confirm Budget** | Approved (~$50-80/mo) | ✅ |
| 8 | **Service Account Permissions** | Service account created with all roles | ✅ |
| | | • ✅ `claude-deployer` SA with 8 roles granted | |
| | | • ✅ Key stored in `GCP_SA_KEY_PROD` GitHub secret | |

> **Note:** GCP Project credentials and Claude API key are stored securely and not committed to the repository.

### 🟢 Claude Actions (Implementation)

Once prerequisites are provided, Claude will execute these tasks:

| Phase | Task | Estimated Time | Status |
|-------|------|----------------|--------|
| **Setup** | | | |
| 1.1 | Create `scripts/gcp/gcp-infra-deploy.sh` deployment script | 30 min | ✅ |
| 1.2 | Create `scripts/gcp/gcp-infra-teardown.sh` teardown script | 20 min | ✅ |
| 1.3 | Create/update `infrastructure/terraform/gcp/` Terraform modules | 2-3 hours | ⬜ |
| 1.4 | Configure GCP provider with your project ID | 10 min | ⬜ |
| 1.5 | Create `terraform.tfvars` with your inputs | 10 min | ⬜ |
| **Infrastructure** | | | |
| 2.1 | Deploy VPC and networking (Serverless VPC Connector) | 15 min | ⬜ |
| 2.2 | Deploy Cloud SQL PostgreSQL instance | 10-15 min | ⬜ |
| 2.3 | Deploy Utility VM (Redis + Bastion) | 5 min | ⬜ |
| 2.4 | Configure Secret Manager with credentials | 10 min | ⬜ |
| **Services** | | | |
| 3.1 | Build and push container images to Artifact Registry | 20 min | ⬜ |
| 3.2 | Deploy MCP Gateway to Cloud Run | 5 min | ⬜ |
| 3.3 | Deploy MCP Suite (HR, Finance, Sales, Support) to Cloud Run | 10 min | ⬜ |
| 3.4 | Deploy Keycloak to Cloud Run | 10 min | ⬜ |
| **Configuration** | | | |
| 4.1 | Configure Cloud Run domain mappings | 10 min | ⬜ |
| 4.2 | Provide DNS records for you to add | 5 min | ⬜ |
| 4.3 | Run database migrations | 10 min | ⬜ |
| 4.4 | Sync Keycloak realm configuration | 10 min | ⬜ |
| 4.5 | Run smoke tests and verify deployment | 15 min | ⬜ |
| **Documentation** | | | |
| 5.1 | Update CLAUDE.md with GCP deployment instructions | 15 min | ⬜ |
| 5.2 | Create runbook for common operations | 30 min | ⬜ |

**Total Estimated Implementation Time:** ~4-5 hours (spread across sessions)

### 🟡 Shared Actions (Collaboration Required)

| Task | Your Role | Claude's Role |
|------|-----------|---------------|
| DNS Configuration | Add records in your DNS provider | Provide exact records needed |
| SSL Certificates | Verify domain ownership if prompted | Configure Google-managed certs |
| Initial Testing | Log in and test as end user | Run automated health checks |
| Cost Monitoring | Set up billing alerts in GCP Console | Configure Cloud Monitoring dashboards |

---

## Infrastructure Specification

### 1. Compute Layer (Serverless)

| Component | Service | Configuration |
|-----------|---------|---------------|
| MCP Gateway | Cloud Run | 1 vCPU, 512MiB-1GiB RAM |
| MCP Finance | Cloud Run | 1 vCPU, 512MiB RAM |
| MCP HR | Cloud Run | 1 vCPU, 512MiB RAM |
| MCP Sales | Cloud Run | 1 vCPU, 512MiB RAM |
| MCP Support | Cloud Run | 1 vCPU, 512MiB RAM |

**Configuration:**
- **Scaling:** Min instances = 0 (Scale to zero enabled), Max instances = 2
- **Request Timeout:** 300s (allows for Claude API streaming responses)
- **Concurrency:** 80 requests per instance
- **Rationale:** You only pay when code is running. With low traffic, this will be nearly free.

### 2. Identity Layer (Keycloak)

**Service:** Cloud Run

**Configuration:**
- Use the optimized Keycloak Quarkus distribution
- **Startup Probe:** TCP socket on 8080 (Keycloak takes time to boot, expect ~30s cold starts)
- **Min Instances:** 0 (Accepting cold start latency) or 1 (for better UX, adds ~$25/mo)

**Alternative Low-Cost:** Deploy Keycloak on the same VM as the "Utility" box (see below) to save the Cloud Run overhead if cold starts are annoying.

### 3. Data Layer (Shared Core)

#### PostgreSQL Database
- **Service:** Cloud SQL for PostgreSQL
- **Tier:** `db-f1-micro` or `db-g1-small` (Shared Core)
- **Availability:** Zonal (Single Zone)
- **Disk:** 10GB SSD (recommended for Keycloak performance)
- **Public IP:** Off (Private IP only)
- **Automated Backups:** Enabled (7-day retention)

#### MongoDB (Document Store)
- **Service:** MongoDB Atlas M0 (Free Tier) or self-hosted on Utility VM
- **Configuration:** 512MB storage, shared cluster
- **Use Case:** Support tickets, audit logs

#### Redis (Caching)
- **Service:** Compute Engine VM (Utility Box)
- **Note:** GCP Memorystore minimum cost is ~$35/mo
- **Strategy:** Deploy a single `e2-micro` VM (Free tier eligible in some regions)
- **Workload:** Run Redis in Docker on this VM. Also use this VM as a Bastion Host/Jump box.
- **Cost:** ~$7/mo (or free with free tier)

### 4. Networking & Security

| Component | Service | Notes |
|-----------|---------|-------|
| Ingress | Cloud Run Domain Mapping | Or Global External HTTP(S) Load Balancer |
| SSL Certificates | Google-managed | Auto-renewal |
| Secrets | Secret Manager | Pay per access, negligible for low traffic |
| VPC | Default VPC | Private connectivity to Cloud SQL |

### 5. Monitoring & Logging

- **Service:** Cloud Logging + Cloud Monitoring (included)
- **Alerts:** Basic uptime checks (free tier)
- **Log Retention:** 30 days (default)

---

## Cost Breakdown

| Service | Monthly Estimate | Notes |
|---------|------------------|-------|
| Cloud Run (5 services) | $5-15 | Scale to zero, pay per request |
| Cloud Run (Keycloak) | $0-25 | Min=0 is free when idle |
| Cloud SQL (db-f1-micro) | $10-15 | Shared core, zonal |
| Utility VM (e2-micro) | $0-7 | Free tier eligible |
| Secret Manager | $1-2 | ~1000 accesses/month |
| Cloud Storage | $1-2 | Container images, backups |
| Networking | $5-10 | Egress, load balancer |
| **Total** | **$22-76** | Varies by usage |

---

## Environment Variables

All services should use environment variables for configuration:

```bash
# Database (from Secret Manager)
DATABASE_URL=postgres://user:pass@/tamshai?host=/cloudsql/PROJECT:REGION:INSTANCE

# Keycloak
KEYCLOAK_URL=https://auth.tamshai.com
KEYCLOAK_REALM=tamshai-corp

# Redis (Utility VM internal IP)
REDIS_HOST=10.x.x.x
REDIS_PORT=6379

# Claude API (from Secret Manager)
CLAUDE_API_KEY=projects/PROJECT/secrets/claude-api-key/versions/latest
```

---

## Deployment Procedure

### 1. Terraform Configuration

```bash
cd infrastructure/terraform/gcp

# Create workspace for pilot
terraform workspace new tamshai-prod-pilot

# Apply with cost-sensitive variables
terraform apply \
  -var="cloud_sql_tier=db-f1-micro" \
  -var="cloud_run_min_instances=0" \
  -var="cloud_run_max_instances=2" \
  -var="environment=prod-pilot"
```

### 2. Database Migration

```bash
# Seed data from VPS staging backup
./scripts/db/backup.sh stage
./scripts/db/restore.sh gcp ./backups/stage/latest/
```

### 3. DNS Configuration

| Record | Type | Value |
|--------|------|-------|
| api.tamshai.com | CNAME | Cloud Run URL |
| auth.tamshai.com | CNAME | Cloud Run URL (Keycloak) |
| app.tamshai.com | CNAME | Cloud Run URL (Portal) |

### 4. Keycloak Sync

```bash
# Update Keycloak redirect URIs for production domain
VPS_DOMAIN=tamshai.com ./keycloak/scripts/sync-realm.sh prod
```

---

## Risks & Limitations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cold Starts | First request 10-30s latency | Set min_instances=1 for Keycloak ($25/mo) |
| No Failover | System down if zone fails | Accept for pilot; upgrade in Phase 2 |
| Shared CPU Throttling | Sustained load degrades performance | Monitor CPU; upgrade tier if needed |
| Single DB Instance | No HA, maintenance windows | Schedule maintenance off-hours |

---

## Upgrade Path to Phase 2

When ready for higher availability:

1. **Cloud SQL:** Upgrade to `db-custom-1-3840` with HA replica
2. **Cloud Run:** Set min_instances=1 for all services
3. **Redis:** Migrate to Memorystore
4. **Load Balancer:** Add Cloud Armor WAF
5. **Monitoring:** Enable detailed metrics and alerting

See: `GCP_PROD_PHASE_2_HIGH_AVAILABILITY.md`

---

## References

- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Cloud SQL Pricing](https://cloud.google.com/sql/pricing)
- [Keycloak on Cloud Run](https://www.keycloak.org/guides#getting-started)
- [CLAUDE.md - Production Section](../../CLAUDE.md)

---

## Appendix A: MongoDB Atlas M0 Setup

If you choose **MongoDB Atlas M0 (Free Tier)** instead of self-hosting on the Utility VM, you'll need to complete these steps:

### What You Need to Provide

| Item | Required? | Notes |
|------|-----------|-------|
| MongoDB Atlas Account | Yes | Free to create at https://cloud.mongodb.com |
| Connection String | Yes | Claude will store this in Secret Manager |
| IP Allowlist Entry | Yes | Cloud Run's egress IP (provided after deployment) |

### Step-by-Step Setup (~15 minutes)

**1. Create Atlas Account** (skip if you have one)
```
1. Go to https://cloud.mongodb.com/
2. Sign up with Google, GitHub, or email
3. Verify your email
```

**2. Create a Free Cluster**
```
1. Click "Build a Database"
2. Select "M0 FREE" tier
3. Choose cloud provider: Google Cloud (recommended for lower latency)
4. Choose region: Same as your GCP region (e.g., us-central1 → Iowa)
5. Cluster name: tamshai-prod (or your preference)
6. Click "Create Cluster" (takes 1-3 minutes)
```

**3. Create Database User**
```
1. Go to "Database Access" in left sidebar
2. Click "Add New Database User"
3. Authentication: Password
4. Username: tamshai_app
5. Password: (generate a strong password, save it securely)
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"
```

**4. Configure Network Access**
```
1. Go to "Network Access" in left sidebar
2. Click "Add IP Address"
3. For initial setup: "Allow Access from Anywhere" (0.0.0.0/0)
   ⚠️ After deployment, Claude will provide Cloud Run's egress IP to restrict this
4. Click "Confirm"
```

**5. Get Connection String**
```
1. Go to "Database" → Click "Connect" on your cluster
2. Select "Connect your application"
3. Driver: Node.js, Version: 5.5 or later
4. Copy the connection string (looks like):
   mongodb+srv://tamshai_app:<password>@tamshai-prod.xxxxx.mongodb.net/
5. Replace <password> with your actual password
```

**6. Provide to Claude**
```
Connection String: mongodb+srv://tamshai_app:YOUR_PASSWORD@tamshai-prod.xxxxx.mongodb.net/tamshai
```

### Self-Hosted Alternative (Recommended)

If this seems like too much overhead, choose **self-host on Utility VM**:
- No external account needed
- Claude deploys MongoDB in Docker on the Utility VM
- Same functionality, simpler setup
- Slight trade-off: Backups are manual (but Claude will configure automated backup scripts)

---

## Appendix B: GCP Service Account Setup

Claude needs permissions to deploy infrastructure to your GCP project. Choose one of these options:

### Option A: Service Account with JSON Key (Recommended)

Best for: Automation, CI/CD, or when you want Claude to work independently.

**Step 1: Create Service Account**

```bash
# Set your project ID
PROJECT_ID="your-project-id"

# Create the service account
gcloud iam service-accounts create claude-deployer \
  --project=$PROJECT_ID \
  --display-name="Claude Code Deployer" \
  --description="Service account for Claude Code to deploy Tamshai infrastructure"
```

**Step 2: Grant Required Roles**

```bash
# The service account email
SA_EMAIL="claude-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant required roles (least privilege for this deployment)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/vpcaccess.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.admin"
```

**Step 3: Create and Download Key**

```bash
# Create JSON key file
gcloud iam service-accounts keys create claude-deployer-key.json \
  --iam-account=$SA_EMAIL \
  --project=$PROJECT_ID

# The key is saved to claude-deployer-key.json
# ⚠️ Keep this file secure - it grants access to your GCP project
```

**Step 4: Provide Key to Claude**

Either:
- Share the contents of `claude-deployer-key.json` securely
- Or place it at `infrastructure/terraform/gcp/credentials.json` (gitignored)

### Option B: Interactive gcloud Login (Simpler)

Best for: One-time deployments, working together in real-time.

**Step 1: Authenticate**

```bash
# Login with your Google account
gcloud auth login

# Set the project
gcloud config set project your-project-id

# Enable application default credentials (for Terraform)
gcloud auth application-default login
```

**Step 2: Verify Access**

```bash
# Test that you have access
gcloud projects describe your-project-id
```

**That's it!** Claude will use your authenticated session.

> **Note:** This option requires you to be logged in during deployment. The session expires after ~1 hour of inactivity.

### Roles Explained

| Role | Purpose |
|------|---------|
| `roles/run.admin` | Deploy and manage Cloud Run services |
| `roles/cloudsql.admin` | Create and configure Cloud SQL instances |
| `roles/compute.instanceAdmin.v1` | Create Utility VM (Compute Engine) |
| `roles/secretmanager.admin` | Store API keys and credentials |
| `roles/artifactregistry.admin` | Push Docker images |
| `roles/iam.serviceAccountUser` | Allow Cloud Run to use service accounts |
| `roles/vpcaccess.admin` | Create Serverless VPC Connector |
| `roles/storage.admin` | Create Cloud Storage buckets |

### Security Best Practices

1. **Rotate keys regularly** - Delete and recreate keys every 90 days
2. **Delete key after deployment** - If using Option A for one-time setup
3. **Use Workload Identity** - For production CI/CD (Phase 2+)
4. **Audit access** - Check IAM audit logs periodically

---

*Document created by Claude Code*
