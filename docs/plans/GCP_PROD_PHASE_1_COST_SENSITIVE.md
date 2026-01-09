# Phase 1: Cost-Optimized Production (Pilot)

**Document Version**: 1.2
**Created**: January 2026
**Updated**: January 8, 2026
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
| | | • Web: `prod.tamshai.com` (main production website) | |
| | | • API: `api.tamshai.com` (MCP Gateway) | |
| | | • Auth: `auth.tamshai.com` (Keycloak) | |
| | | • App: `app.tamshai.com` (Portal/Dashboard) | |
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
| 2.5 | Create GCS bucket for static website (`prod.tamshai.com`) | 10 min | ⬜ |
| **Services** | | | |
| 3.1 | Build and push container images to Artifact Registry | 20 min | ⬜ |
| 3.2 | Deploy MCP Gateway to Cloud Run | 5 min | ⬜ |
| 3.3 | Deploy MCP Suite (HR, Finance, Sales, Support) to Cloud Run | 10 min | ⬜ |
| 3.4 | Deploy Keycloak to Cloud Run | 10 min | ⬜ |
| 3.5 | Deploy static website content to GCS (`prod.tamshai.com`) | 10 min | ⬜ |
| **Configuration** | | | |
| 4.1 | Configure Cloud Run domain mappings | 10 min | ⬜ |
| 4.2 | Provide DNS records for you to add | 5 min | ⬜ |
| 4.3 | Run database migrations | 10 min | ⬜ |
| 4.4 | Sync Keycloak realm configuration | 10 min | ⬜ |
| 4.5 | Run smoke tests and verify deployment | 15 min | ⬜ |
| **CI/CD** | | | |
| 5.1 | Create `.github/workflows/deploy-to-gcp.yml` workflow | 30 min | ⬜ |
| 5.2 | Test workflow with manual trigger | 15 min | ⬜ |
| **Flutter Native Clients** | | | |
| 6.1 | Build production Flutter clients (all platforms) | 15 min | ⬜ |
| 6.2 | Create GitHub release `v1.0.0` with production artifacts | 10 min | ⬜ |
| 6.3 | Update DownloadsPage to support prod release URL | 15 min | ⬜ |
| 6.4 | Configure Keycloak `tamshai-flutter-client` for prod redirect URIs | 10 min | ⬜ |
| **Documentation** | | | |
| 7.1 | Update CLAUDE.md with GCP deployment instructions | 15 min | ⬜ |
| 7.2 | Create runbook for common operations | 30 min | ⬜ |

**Total Estimated Implementation Time:** ~5-6 hours (spread across sessions)

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

| Record | Type | Value | Purpose |
|--------|------|-------|---------|
| prod.tamshai.com | CNAME | c.storage.googleapis.com | Main production website (static) |
| api.tamshai.com | CNAME | Cloud Run URL | MCP Gateway API |
| auth.tamshai.com | CNAME | Cloud Run URL | Keycloak authentication |
| app.tamshai.com | CNAME | Cloud Run URL | Portal/Dashboard app |

> **Note:** For `prod.tamshai.com`, the GCS bucket must be named exactly `prod.tamshai.com` for CNAME-based hosting to work. Alternatively, use Cloud Load Balancer with Cloud CDN for more flexibility.

### 4. Keycloak Sync

```bash
# Update Keycloak redirect URIs for production domains
# Includes: prod.tamshai.com, app.tamshai.com, api.tamshai.com
VPS_DOMAIN=tamshai.com ./keycloak/scripts/sync-realm.sh prod
```

**Required Redirect URIs (Web Clients):**
- `https://prod.tamshai.com/*`
- `https://app.tamshai.com/*`
- `https://api.tamshai.com/*`

**Required Redirect URIs (Flutter Native Clients):**
- `com.tamshai.ai://callback` (production OAuth callback)
- `com.tamshai.ai://logout` (production logout)
- `http://127.0.0.1/*` (desktop loopback)

**Keycloak Clients to Configure:**

| Client ID | Type | Purpose |
|-----------|------|---------|
| `tamshai-web-portal` | Public | Web portal (app.tamshai.com) |
| `tamshai-flutter-client` | Public | Flutter native apps |
| `mcp-gateway` | Confidential | Backend service authentication |

---

## GitHub CD Workflow: deploy-to-gcp

This section describes the Continuous Deployment workflow for automated deployments to GCP.

### Scope

The `deploy-to-gcp.yml` workflow handles automated deployment of all application components to the GCP production environment.

| Component | Deployment Method | Trigger |
|-----------|-------------------|---------|
| MCP Gateway | Cloud Run | Push to `main` |
| MCP Suite (HR, Finance, Sales, Support) | Cloud Run | Push to `main` |
| Keycloak | Cloud Run | Push to `main` |
| Static Website (`prod.tamshai.com`) | GCS Bucket | Push to `main` |
| Portal App (`app.tamshai.com`) | Cloud Run | Push to `main` |

### Workflow Triggers

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'services/**'
      - 'clients/web/**'
      - 'keycloak/**'
  workflow_dispatch:  # Manual trigger
    inputs:
      service:
        description: 'Service to deploy (all, gateway, hr, finance, sales, support, keycloak, web)'
        required: false
        default: 'all'
```

### Required GitHub Secrets

**Infrastructure Secrets:**

| Secret | Purpose | Source | Status |
|--------|---------|--------|--------|
| `GCP_PROJECT_ID` | Target GCP project | GCP Console | ⬜ Needed |
| `GCP_SA_KEY_PROD` | Service account JSON key | `claude-deployer` SA | ✅ Created |
| `GCP_REGION` | Deployment region (us-central1) | Static value | ⬜ Needed |

**Application Secrets:**

| Secret | Purpose | Source | Status |
|--------|---------|--------|--------|
| `CLAUDE_API_KEY_PROD` | Anthropic API key | Anthropic Console | ⬜ Needed |
| `MONGODB_ATLAS_URI_PROD` | MongoDB connection string | MongoDB Atlas | ⬜ Needed |
| `KEYCLOAK_ADMIN_PASSWORD_PROD` | Keycloak admin password | Generated | ⬜ Needed |
| `POSTGRES_PASSWORD_PROD` | Cloud SQL database password | Generated | ⬜ Needed |

**Build Configuration (Environment Variables):**

| Variable | Purpose | Stage Value | Prod Value |
|----------|---------|-------------|------------|
| `VITE_RELEASE_TAG` | Flutter release for downloads page | `v1.0.0-stage` | `v1.0.0` |
| `VITE_API_URL` | API endpoint | `https://vps.tamshai.com/api` | `https://api.tamshai.com` |
| `VITE_AUTH_URL` | Keycloak endpoint | `https://vps.tamshai.com/auth` | `https://auth.tamshai.com` |

### Workflow Implementation

**File:** `.github/workflows/deploy-to-gcp.yml`

```yaml
name: Deploy to GCP Production

on:
  push:
    branches: [main]
    paths:
      - 'services/**'
      - 'clients/web/**'
      - 'keycloak/**'
  workflow_dispatch:
    inputs:
      service:
        description: 'Service to deploy'
        required: false
        default: 'all'

env:
  GCP_REGION: us-central1
  AR_REPO: us-central1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/tamshai

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      gateway: ${{ steps.changes.outputs.gateway }}
      mcp-suite: ${{ steps.changes.outputs.mcp-suite }}
      keycloak: ${{ steps.changes.outputs.keycloak }}
      web: ${{ steps.changes.outputs.web }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: changes
        with:
          filters: |
            gateway:
              - 'services/mcp-gateway/**'
            mcp-suite:
              - 'services/mcp-hr/**'
              - 'services/mcp-finance/**'
              - 'services/mcp-sales/**'
              - 'services/mcp-support/**'
            keycloak:
              - 'keycloak/**'
            web:
              - 'clients/web/**'

  deploy-gateway:
    needs: detect-changes
    if: needs.detect-changes.outputs.gateway == 'true' || github.event.inputs.service == 'all' || github.event.inputs.service == 'gateway'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker ${{ env.GCP_REGION }}-docker.pkg.dev --quiet

      - name: Build and Push Image
        run: |
          docker build -t ${{ env.AR_REPO }}/mcp-gateway:${{ github.sha }} \
                       -t ${{ env.AR_REPO }}/mcp-gateway:latest \
                       services/mcp-gateway
          docker push ${{ env.AR_REPO }}/mcp-gateway:${{ github.sha }}
          docker push ${{ env.AR_REPO }}/mcp-gateway:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy mcp-gateway \
            --image=${{ env.AR_REPO }}/mcp-gateway:${{ github.sha }} \
            --region=${{ env.GCP_REGION }} \
            --platform=managed \
            --allow-unauthenticated \
            --min-instances=0 \
            --max-instances=2 \
            --memory=1Gi \
            --timeout=300 \
            --set-secrets=CLAUDE_API_KEY=claude-api-key:latest \
            --set-secrets=MONGODB_URI=mongodb-atlas-uri:latest

  deploy-mcp-suite:
    needs: detect-changes
    if: needs.detect-changes.outputs.mcp-suite == 'true' || github.event.inputs.service == 'all'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [mcp-hr, mcp-finance, mcp-sales, mcp-support]
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.GCP_REGION }}-docker.pkg.dev --quiet

      - name: Build and Push
        run: |
          docker build -t ${{ env.AR_REPO }}/${{ matrix.service }}:${{ github.sha }} \
                       -t ${{ env.AR_REPO }}/${{ matrix.service }}:latest \
                       services/${{ matrix.service }}
          docker push ${{ env.AR_REPO }}/${{ matrix.service }}:${{ github.sha }}
          docker push ${{ env.AR_REPO }}/${{ matrix.service }}:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ matrix.service }} \
            --image=${{ env.AR_REPO }}/${{ matrix.service }}:${{ github.sha }} \
            --region=${{ env.GCP_REGION }} \
            --platform=managed \
            --no-allow-unauthenticated \
            --min-instances=0 \
            --max-instances=2 \
            --memory=512Mi \
            --timeout=300

  deploy-static-website:
    needs: detect-changes
    if: needs.detect-changes.outputs.web == 'true' || github.event.inputs.service == 'all' || github.event.inputs.service == 'web'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: clients/web/package-lock.json

      - name: Install and Build
        working-directory: clients/web
        run: |
          npm ci
          npm run build

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - name: Deploy to GCS
        run: |
          gsutil -m rsync -r -d clients/web/dist gs://prod.tamshai.com
          gsutil web set -m index.html -e 404.html gs://prod.tamshai.com

  notify:
    needs: [deploy-gateway, deploy-mcp-suite, deploy-static-website]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Deployment Summary
        run: |
          echo "## Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "| Component | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-----------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Gateway | ${{ needs.deploy-gateway.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| MCP Suite | ${{ needs.deploy-mcp-suite.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Static Website | ${{ needs.deploy-static-website.result }} |" >> $GITHUB_STEP_SUMMARY
```

### Deployment Flow

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Detect Changes  │──── paths-filter determines which services changed
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌───────┐ ┌───────┐ ┌─────────┐ ┌───────┐
│Gateway│ │MCP HR │ │Keycloak │ │Static │
│       │ │Finance│ │         │ │Website│
│       │ │Sales  │ │         │ │       │
│       │ │Support│ │         │ │       │
└───┬───┘ └───┬───┘ └────┬────┘ └───┬───┘
    │         │          │          │
    ▼         ▼          ▼          ▼
┌─────────────────────────────────────────┐
│           Artifact Registry             │
│  (Container images tagged with SHA)     │
└─────────────────────────────────────────┘
    │         │          │          │
    ▼         ▼          ▼          ▼
┌─────────────────────────────────────────┐
│              Cloud Run                  │
│  (Zero-downtime rolling deployment)     │
└─────────────────────────────────────────┘
```

### Rollback Procedure

```bash
# List recent revisions
gcloud run revisions list --service=mcp-gateway --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic mcp-gateway \
  --region=us-central1 \
  --to-revisions=mcp-gateway-00005-abc=100

# Or redeploy specific commit
gh workflow run deploy-to-gcp.yml \
  -f service=gateway \
  --ref <previous-commit-sha>
```

### Manual Deployment

```bash
# Deploy all services manually
gh workflow run deploy-to-gcp.yml -f service=all

# Deploy specific service
gh workflow run deploy-to-gcp.yml -f service=gateway
gh workflow run deploy-to-gcp.yml -f service=web
```

### Monitoring Deployments

```bash
# View workflow runs
gh run list --workflow=deploy-to-gcp.yml

# Watch current deployment
gh run watch

# View Cloud Run service status
gcloud run services list --region=us-central1
```

---

## Flutter Native Client Deployment

This section outlines the deployment process for Flutter native clients (Windows, macOS, iOS, Android) for production.

### Current State (as of January 8, 2026)

| Environment | GitHub Release | Downloads Page URL | Status |
|-------------|----------------|---------------------|--------|
| Stage | `v1.0.0-stage` | Hardcoded in DownloadsPage.tsx | ✅ Deployed |
| Production | `v1.0.0` (planned) | Needs environment-aware logic | ⬜ Pending |

**Note:** The DownloadsPage currently points to `v1.0.0-stage` release. For production, we need either:
1. A separate production downloads page, OR
2. Environment-aware logic to serve the correct release based on deployment target

### Build Process

The existing workflow (`.github/workflows/build-flutter-native.yml`) already supports production builds:

```bash
# Trigger production build manually
gh workflow run build-flutter-native.yml -f environment=prod -f platforms=all

# Or via release tag
git tag v1.0.0
git push origin v1.0.0
# This triggers build-flutter-native.yml via release event
```

### Production Artifact Names

| Platform | Installer | Portable/Store |
|----------|-----------|----------------|
| Windows | `tamshai-prod-windows.msix` | `tamshai-prod-windows-portable.zip` |
| macOS | `tamshai-prod-macos.dmg` | `tamshai-prod-macos-portable.zip` |
| Android | `tamshai-prod.apk` | `tamshai-prod.aab` (Play Store) |
| iOS | `tamshai-prod.ipa` (signed) | `tamshai-prod-ios-unsigned.zip` |

### Production Release Creation

```bash
# 1. Trigger production build
gh workflow run build-flutter-native.yml -f environment=prod -f platforms=all

# 2. Wait for build completion
gh run watch

# 3. Download artifacts
gh run download <run-id> --dir ./prod-artifacts

# 4. Create production release
gh release create v1.0.0 \
  --title "Tamshai Enterprise AI v1.0.0" \
  --notes "Production release for GCP deployment" \
  ./prod-artifacts/**/*
```

### Downloads Page Update Strategy

**Option A: Environment Variable (Recommended)**

Update `DownloadsPage.tsx` to use an environment variable:

```typescript
// Determine release tag based on environment
const releaseTag = import.meta.env.VITE_RELEASE_TAG || 'v1.0.0-stage';
const githubReleasesBase = `https://github.com/jcornell3/tamshai-enterprise-ai/releases/download/${releaseTag}`;
```

Then configure per-environment:
- Stage: `VITE_RELEASE_TAG=v1.0.0-stage`
- Production: `VITE_RELEASE_TAG=v1.0.0`

**Option B: Separate URLs**

Maintain parallel release URLs:
- Stage downloads: `releases/download/v1.0.0-stage/`
- Production downloads: `releases/download/v1.0.0/`

### Keycloak Configuration for Production Flutter

Add production redirect URIs to `tamshai-flutter-client`:

```json
{
  "clientId": "tamshai-flutter-client",
  "redirectUris": [
    "http://127.0.0.1/*",
    "com.tamshai.stage://callback",
    "com.tamshai.stage://logout",
    "com.tamshai.ai://callback",
    "com.tamshai.ai://logout"
  ],
  "webOrigins": [
    "http://127.0.0.1",
    "com.tamshai.stage",
    "com.tamshai.ai"
  ]
}
```

### iOS App Store Signing (Future)

For iOS App Store distribution, configure these GitHub secrets:

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE_P12` | Distribution certificate (base64) |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_PROVISIONING_PROFILE` | App Store provisioning profile (base64) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

---

## Backup & Recovery Strategy

This section outlines a cost-effective backup strategy that maintains "Phoenix" capability - the ability to completely reprovision the environment from scratch while preserving critical data.

### Design Principles

1. **Leverage GCP Native Features** - No expensive third-party backup tools
2. **Pay-as-you-go Storage** - Only pay for what you store
3. **Phoenix Architecture** - Don't back up what you can rebuild
4. **Portable Exports** - SQL/JSON dumps for environment migration

### Backup Methods by Resource

#### 1. Cloud SQL: Automated Backups + PITR (Priority #1)

The database is the primary source of truth and gets the most backup investment.

**Configuration:**
```hcl
# infrastructure/terraform/gcp/modules/database/main.tf
settings {
  tier = "db-f1-micro"
  backup_configuration {
    enabled            = true
    start_time         = "03:00"  # UTC - quiet hours
    retention_settings {
      retained_backups = 7
      retention_unit   = "COUNT"
    }
    point_in_time_recovery_enabled = true
  }
}
```

| Setting | Value | Rationale |
|---------|-------|-----------|
| Retention | 7 backups | Minimum needed; rarely need older than a week |
| PITR | Enabled | Recover to any second; write-ahead logs are tiny for low traffic |
| Start Time | 03:00 UTC | During lowest traffic period |

**Cost:** ~$0.20/month for 1GB database

#### 2. Phoenix Exports (Weekly SQL/MongoDB Dumps)

Portable dumps for environment migration and disaster recovery beyond GCP.

**Method:** Cloud Scheduler triggers weekly exports to GCS Coldline bucket.

```bash
# Weekly export job (Cloud Scheduler)
gcloud sql export sql tamshai-db \
  gs://tamshai-backups-coldline/sql/$(date +%Y%m%d).sql.gz \
  --database=tamshai

# MongoDB Atlas export (since M0 has no native backups)
mongodump --uri="$MONGODB_ATLAS_URI" \
  --archive | gsutil cp - gs://tamshai-backups-coldline/mongodb/$(date +%Y%m%d).archive
```

| Resource | Export Frequency | Storage Class | Retention |
|----------|------------------|---------------|-----------|
| PostgreSQL | Weekly | Coldline | 30 days |
| MongoDB | Weekly | Coldline | 30 days |
| Keycloak Realm | Weekly | Coldline | 30 days |

**Cost:** ~$0.03/month total

#### 3. Keycloak Realm Export

Critical for disaster recovery - without realm export, users must be manually recreated.

```bash
# Weekly Keycloak realm export
docker exec keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export --realm tamshai-corp

gsutil cp /tmp/export/tamshai-corp-realm.json \
  gs://tamshai-backups-coldline/keycloak/$(date +%Y%m%d)-realm.json
```

#### 4. Frontend Assets: GCS Object Versioning

No separate backup needed - versioning provides instant rollback.

**Configuration:**
```bash
gsutil versioning set on gs://tamshai-frontend
```

**Rollback procedure:**
```bash
# List versions
gsutil ls -a gs://tamshai-frontend/index.html

# Restore previous version
gsutil cp gs://tamshai-frontend/index.html#1234567890 gs://tamshai-frontend/index.html
```

**Cost:** ~$0.05/month for 5-10 versions of ~50MB assets

#### 5. Secret Manager: Version History

Secrets are automatically versioned by GCP.

**Strategy:**
- Keep only 2 active versions per secret
- Never hard-delete secret versions
- Rollback by updating Terraform to reference previous version

**Cost:** ~$0.06/month

#### 6. Redis (Memorystore Basic): No Backup

**Rationale:** Basic tier Redis does not support persistence. Upgrading to Standard tier triples cost.

**Architecture Requirement:** Application must handle "Cold Redis":
- Token revocation checks fall back gracefully
- Session cache misses trigger re-authentication
- No critical state stored only in Redis

### Backup Cost Summary

| Resource | Method | Est. Monthly Cost |
|----------|--------|-------------------|
| Cloud SQL | Auto-backup + PITR (7 backups) | ~$0.20 |
| Cloud SQL | Weekly dump to Coldline | ~$0.01 |
| MongoDB Atlas | Weekly mongodump to Coldline | ~$0.01 |
| Keycloak | Weekly realm export to GCS | ~$0.01 |
| Frontend | GCS Object Versioning | ~$0.05 |
| Secrets | Version History (2 versions) | ~$0.06 |
| **Total** | | **< $0.50/mo** |

### Recovery Procedures

#### Database Point-in-Time Recovery
```bash
# Restore to specific time
gcloud sql instances clone tamshai-db tamshai-db-restored \
  --point-in-time="2026-01-07T10:30:00Z"
```

#### Full Environment Rebuild (Phoenix)
```bash
# 1. Provision infrastructure
./scripts/gcp/gcp-infra-deploy.sh --init

# 2. Restore database from dump
gsutil cp gs://tamshai-backups-coldline/sql/latest.sql.gz - | gunzip | \
  gcloud sql import sql tamshai-db -

# 3. Restore MongoDB
gsutil cp gs://tamshai-backups-coldline/mongodb/latest.archive - | \
  mongorestore --uri="$MONGODB_ATLAS_URI" --archive

# 4. Import Keycloak realm
# (Handled by sync-realm.sh or manual import)
```

### GCS Bucket Lifecycle Policy

Automatically delete old backups to control costs:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 30,
          "matchesStorageClass": ["COLDLINE"]
        }
      }
    ]
  }
}
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
Connection String: mongodb+srv://tamshai_app:<password>@tamshai-prod.<cluster-id>.mongodb.net/tamshai
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

## Document Changelog

### Version 1.2 (January 8, 2026)

**Additions:**
- Added "Flutter Native Client Deployment" section with:
  - Current state (stage vs production)
  - Production build process
  - Artifact naming conventions
  - Release creation workflow
  - Downloads page update strategy
  - iOS App Store signing secrets (future)
- Added tasks 6.1-6.4 for Flutter production deployment
- Enhanced "Required GitHub Secrets" section with:
  - Infrastructure vs Application secrets separation
  - Build configuration environment variables
  - Status tracking for each secret
- Updated "Keycloak Sync" section with:
  - Flutter native client redirect URIs (`com.tamshai.ai://`)
  - Desktop loopback URIs
  - Keycloak clients table

**Context:**
These additions were identified after deploying stage Flutter builds (v1.0.0-stage) and recognizing the need for production-specific configuration.

### Version 1.1 (January 7, 2026)

- Initial complete plan with all prerequisites marked complete
- Added deployment scripts and workflow definitions

### Version 1.0 (January 2026)

- Initial document creation

---

*Document created by Claude Code*
