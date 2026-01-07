# Phase 2: High-Availability Production (Enterprise)

**Document Version**: 1.0
**Created**: January 2026
**Status**: Planning
**Prerequisite**: Phase 1 deployed and validated

## Executive Summary

This phase establishes an Enterprise Service Level Agreement (SLA) environment. Even with **low traffic**, enterprise clients often mandate **High Availability (HA)** (redundancy against zonal failure) and strict security boundaries. The goal is **uptime**, not massive throughput.

**Estimated Monthly Cost:** ~$250 - $400 USD

**Target SLA:** 99.9% uptime (8.76 hours downtime/year max)

---

## Infrastructure Specification

### 1. Compute Layer (Redundant)

**Service:** Google Cloud Run

| Component | Min Instances | Max Instances | Memory | Notes |
|-----------|---------------|---------------|--------|-------|
| MCP Gateway | 1 | 10 | 1GiB | Always warm |
| MCP Finance | 1 | 5 | 512MiB | Always warm |
| MCP HR | 1 | 5 | 512MiB | Always warm |
| MCP Sales | 1 | 5 | 512MiB | Always warm |
| MCP Support | 1 | 5 | 512MiB | Always warm |
| Keycloak | 2 | 4 | 1GiB | HA with Infinispan |

**Configuration:**
- **Region:** Single Region (e.g., `us-central1`), spanning multiple zones automatically
- **Scaling:** Min instances = 1 per critical service (eliminates cold starts)
- **Keycloak:** Min instances = 2 (ensures session continuity during updates/crashes)
- **Request Timeout:** 300s (allows for Claude API streaming)

### 2. Data Layer (Resilient)

#### PostgreSQL Database
- **Service:** Cloud SQL for PostgreSQL
- **Tier:** `db-custom-1-3840` (1 vCPU, 3.75GB RAM) - Smallest dedicated tier for production
- **Availability:** **REGIONAL (HA)** - Automatic failover to standby zone
- **Backup:** Automated backups + Point-in-Time Recovery (PITR)
- **Retention:** 30 days
- **Disk:** 20GB SSD with auto-grow

#### Redis (Caching)
- **Service:** Cloud Memorystore for Redis
- **Tier:** **Standard Tier** (High Availability)
- **Size:** 1 GB (smallest available)
- **Replica:** 1 Read Replica in different zone
- **Reasoning:** If Redis fails, users get logged out. Memorystore HA prevents this.

#### MongoDB (Document Store)
- **Service:** MongoDB Atlas M10 (or M2 for cost savings)
- **Configuration:** Dedicated cluster with automated backups
- **Availability:** Multi-AZ replication

### 3. Security & Networking (Enterprise)

| Component | Service | Configuration |
|-----------|---------|---------------|
| Load Balancer | Global External Application Load Balancer | Multi-region capable |
| WAF | Cloud Armor | Rate limiting, SQL injection/XSS protection |
| VPC | Serverless VPC Access Connector | Private Cloud SQL/Redis connectivity |
| SSL | Google-managed certificates | Auto-renewal |
| Secrets | Secret Manager | Versioned, audit-logged |

**Cloud Armor Rules:**
- Rate limiting: 100 requests/min per IP
- SQL injection protection (OWASP CRS)
- XSS protection rules
- Geo-blocking (optional)

### 4. Operations & Monitoring

| Component | Configuration | Alert Threshold |
|-----------|---------------|-----------------|
| Uptime Checks | Global, every 1 minute | < 99.9% triggers alert |
| Error Rate | 5xx responses | > 1% triggers alert |
| Latency | P95 response time | > 2s triggers alert |
| CPU Utilization | Cloud Run instances | > 80% triggers scale-up |
| Database Connections | Cloud SQL | > 80% triggers alert |

**Notification Channels:**
- Email (primary)
- Slack webhook (optional)
- PagerDuty (optional for critical)

---

## Cost Breakdown

| Service | Monthly Estimate | Notes |
|---------|------------------|-------|
| Cloud Run (6 services, min=1) | $50-75 | Always-on instances |
| Cloud SQL (HA, db-custom-1-3840) | $80-100 | Regional HA |
| Memorystore (Standard, 1GB) | $35-50 | HA Redis |
| MongoDB Atlas (M2/M10) | $10-60 | Depends on tier |
| Load Balancer + Cloud Armor | $40-50 | Global LB + WAF |
| Secret Manager | $2-5 | ~5000 accesses/month |
| Cloud Storage | $2-5 | Images, backups |
| Networking (Egress) | $10-20 | Varies by traffic |
| **Total** | **$229-365** | Typical: ~$300/mo |

---

## Migration from Phase 1

### Step 1: Upgrade Database to HA

```bash
cd infrastructure/terraform/gcp

# Update variables
terraform apply \
  -var="cloud_sql_availability_type=REGIONAL" \
  -var="cloud_sql_tier=db-custom-1-3840"

# Note: This triggers a ~5 minute instance restart
```

### Step 2: Provision Memorystore

```bash
# Add Memorystore to Terraform
terraform apply -var="use_memorystore=true"

# Update Cloud Run services with new Redis host
# REDIS_HOST will point to Memorystore private IP
```

### Step 3: Scale Up Cloud Run

```bash
terraform apply \
  -var="cloud_run_min_instances=1" \
  -var="keycloak_min_instances=2"
```

### Step 4: Enable Cloud Armor

```bash
terraform apply -var="enable_cloud_armor=true"
```

### Step 5: Decommission Phase 1 Resources

```bash
# Remove Utility VM after Memorystore is stable
terraform apply -var="create_utility_vm=false"
```

---

## High Availability Architecture

```
                    ┌─────────────────────────────────────┐
                    │      Global Load Balancer           │
                    │         + Cloud Armor               │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────┐
                    │                                     │
           ┌────────▼────────┐              ┌─────────────▼─────────────┐
           │   us-central1-a │              │      us-central1-b        │
           │                 │              │                           │
           │  ┌───────────┐  │              │  ┌───────────┐            │
           │  │Cloud Run  │  │              │  │Cloud Run  │            │
           │  │(Services) │  │              │  │(Services) │            │
           │  └─────┬─────┘  │              │  └─────┬─────┘            │
           │        │        │              │        │                  │
           └────────┼────────┘              └────────┼──────────────────┘
                    │                                │
                    └────────────┬───────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼─────────┐ ┌──────▼──────┐ ┌────────▼────────┐
    │   Cloud SQL       │ │ Memorystore │ │  MongoDB Atlas  │
    │   (HA Replica)    │ │ (HA Redis)  │ │  (Multi-AZ)     │
    └───────────────────┘ └─────────────┘ └─────────────────┘
```

---

## Disaster Recovery

### RTO/RPO Targets

| Metric | Target | Achieved By |
|--------|--------|-------------|
| RTO (Recovery Time) | < 15 minutes | Automated failover |
| RPO (Data Loss) | < 5 minutes | PITR + replication |

### Failover Scenarios

| Scenario | Auto-Recovery | Manual Action |
|----------|---------------|---------------|
| Cloud Run instance crash | Yes (< 30s) | None |
| Zone failure | Yes (< 5 min) | None |
| Cloud SQL primary failure | Yes (< 2 min) | None |
| Redis primary failure | Yes (< 30s) | None |
| Region failure | No | DNS failover to backup region |

### Backup Strategy

| Data | Backup Frequency | Retention | Recovery Method |
|------|------------------|-----------|-----------------|
| PostgreSQL | Continuous (PITR) | 30 days | Point-in-time restore |
| MongoDB | Daily snapshots | 7 days | Atlas restore |
| Secrets | Versioned | 90 days | Secret Manager versions |
| Configuration | Git | Unlimited | Terraform apply |

---

## Security Compliance

### SOC 2 Alignment

| Control | Implementation |
|---------|----------------|
| Access Control | IAM roles, Secret Manager |
| Audit Logging | Cloud Audit Logs enabled |
| Encryption at Rest | Default (Cloud SQL, Memorystore) |
| Encryption in Transit | TLS 1.3 enforced |
| Network Isolation | VPC, private IPs |

### Monitoring & Alerting

```bash
# Example: Create uptime check
gcloud monitoring uptime-check-configs create tamshai-api \
  --display-name="Tamshai API Health" \
  --http-check-path="/health" \
  --http-check-request-method=GET \
  --monitored-resource-labels=host=api.tamshai.com
```

---

## Upgrade Path to Phase 3 (Multi-Region)

When global presence is required:

1. **Multi-Region Cloud Run:** Deploy to `us-west1`, `europe-west1`
2. **Global Database:** Cloud Spanner or multi-region Cloud SQL
3. **CDN:** Cloud CDN for static assets
4. **DNS:** Cloud DNS with geo-routing
5. **Cost:** ~$800-1200/mo

---

## References

- [Cloud SQL High Availability](https://cloud.google.com/sql/docs/postgres/high-availability)
- [Memorystore for Redis](https://cloud.google.com/memorystore/docs/redis)
- [Cloud Armor WAF](https://cloud.google.com/armor/docs/cloud-armor-overview)
- [Cloud Run Best Practices](https://cloud.google.com/run/docs/tips/general)
- [GCP_PROD_PHASE_1_COST_SENSITIVE.md](./GCP_PROD_PHASE_1_COST_SENSITIVE.md)

---

*Document created by Claude Code*
