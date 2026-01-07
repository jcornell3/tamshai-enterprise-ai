# Phase 1: Cost-Optimized Production (Pilot)

**Document Version**: 1.0
**Created**: January 2026
**Status**: Planning

## Executive Summary

This deployment phase is designed for **very low traffic** (e.g., internal testing, beta users, < 10 concurrent users). The priority is **functionality over redundancy**. We minimize fixed costs by using shared-core infrastructure and serverless scaling to zero.

**Estimated Monthly Cost:** ~$50 - $80 USD

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
