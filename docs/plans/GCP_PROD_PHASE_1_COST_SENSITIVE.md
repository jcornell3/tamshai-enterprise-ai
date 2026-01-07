# Phase 1: Cost-Optimized Production (Pilot)

**Document Version**: 1.0
**Created**: January 2026
**Status**: Planning

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
| 1 | **Provide GCP Project** | Create or designate a GCP project for production | ⬜ |
| | | • Project ID: `________________` | |
| | | • Project Number: `________________` | |
| | | • Billing Account linked: Yes / No | |
| 2 | **Enable Required APIs** | Enable these APIs in GCP Console (or Claude can do via `gcloud`) | ⬜ |
| | | • Cloud Run API | |
| | | • Cloud SQL Admin API | |
| | | • Secret Manager API | |
| | | • Compute Engine API | |
| | | • Artifact Registry API | |
| 3 | **Provide Domain Decision** | Which domain(s) will be used? | ⬜ |
| | | • API: `api.________________` | |
| | | • Auth: `auth.________________` | |
| | | • App: `app.________________` | |
| | | • DNS Provider: Cloudflare / Google Cloud DNS / Other | |
| 4 | **Provide Claude API Key** | From https://console.anthropic.com | ⬜ |
| | | • Key will be stored in Secret Manager | |
| 5 | **MongoDB Atlas Decision** | Choose one: | ⬜ |
| | | • ⬜ Use MongoDB Atlas M0 (Free) - provide Atlas org/project | |
| | | • ⬜ Self-host on Utility VM (simpler, no external dependency) | |
| 6 | **Choose GCP Region** | Recommended: `us-central1` (cheapest) | ⬜ |
| | | • Alternative: `________________` | |
| 7 | **Confirm Budget** | Approve estimated $50-80/mo spend | ⬜ |
| 8 | **Service Account Permissions** | Grant Claude deployment access (one of): | ⬜ |
| | | • ⬜ Provide Service Account JSON key | |
| | | • ⬜ Grant `roles/editor` to Claude's SA | |
| | | • ⬜ Use `gcloud auth login` interactively | |

### 🟢 Claude Actions (Implementation)

Once prerequisites are provided, Claude will execute these tasks:

| Phase | Task | Estimated Time |
|-------|------|----------------|
| **Setup** | | |
| 1.1 | Create/update `infrastructure/terraform/gcp/` Terraform modules | 2-3 hours |
| 1.2 | Configure GCP provider with your project ID | 10 min |
| 1.3 | Create `terraform.tfvars` with your inputs | 10 min |
| **Infrastructure** | | |
| 2.1 | Deploy VPC and networking (Serverless VPC Connector) | 15 min |
| 2.2 | Deploy Cloud SQL PostgreSQL instance | 10-15 min |
| 2.3 | Deploy Utility VM (Redis + Bastion) | 5 min |
| 2.4 | Configure Secret Manager with credentials | 10 min |
| **Services** | | |
| 3.1 | Build and push container images to Artifact Registry | 20 min |
| 3.2 | Deploy MCP Gateway to Cloud Run | 5 min |
| 3.3 | Deploy MCP Suite (HR, Finance, Sales, Support) to Cloud Run | 10 min |
| 3.4 | Deploy Keycloak to Cloud Run | 10 min |
| **Configuration** | | |
| 4.1 | Configure Cloud Run domain mappings | 10 min |
| 4.2 | Provide DNS records for you to add | 5 min |
| 4.3 | Run database migrations | 10 min |
| 4.4 | Sync Keycloak realm configuration | 10 min |
| 4.5 | Run smoke tests and verify deployment | 15 min |
| **Documentation** | | |
| 5.1 | Update CLAUDE.md with GCP deployment instructions | 15 min |
| 5.2 | Create runbook for common operations | 30 min |

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

*Document created by Claude Code*
