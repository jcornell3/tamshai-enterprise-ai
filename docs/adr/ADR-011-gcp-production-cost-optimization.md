# ADR-011: GCP Production Cost Optimization

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-011: GCP Production Cost Optimization",
  "headline": "Cost-Sensitive Architecture Strategy for GCP Production Deployment",
  "description": "Documents the decisions made to minimize GCP production costs while maintaining enterprise functionality",
  "datePublished": "2026-01-05",
  "dateModified": "2026-01-21",
  "keywords": ["gcp", "cost-optimization", "free-tier", "cloud-run", "cloud-sql", "production"],
  "learningResourceType": "architecture-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Google Cloud Platform" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

The Tamshai Enterprise AI system needed a production environment on GCP. Initial estimates for a "standard" GCP architecture were $200-400/month. For an MVP/demo environment, this was excessive.

**Goal**: Deploy production with enterprise features for <$50/month.

## Decision

Implement a cost-sensitive architecture maximizing free tier usage and choosing lowest-cost options for required paid services.

### Cost Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cost Optimization Tiers                       │
│                                                                  │
│   Tier 1: Free Forever           Tier 2: Free Trial/Credits     │
│   - Cloud Run (2M requests)      - $300 GCP credits (90 days)   │
│   - Artifact Registry (500MB)    - Cloud SQL free trial         │
│   - Cloud Storage (5GB)                                         │
│   - MongoDB Atlas M0                                            │
│                                                                  │
│   Tier 3: Minimal Paid           Tier 4: Avoided                │
│   - Cloud SQL db-f1-micro        - Elasticsearch ($95+/mo)      │
│   - Cloud NAT (required)         - GKE cluster                  │
│   - Load Balancer                - Dedicated VMs                │
└─────────────────────────────────────────────────────────────────┘
```

### Service Choices

| Service | Option Chosen | Monthly Cost | Alternative Avoided |
|---------|---------------|--------------|---------------------|
| Compute | Cloud Run | ~$0 (free tier) | GKE ($70+) |
| PostgreSQL | Cloud SQL db-f1-micro | ~$8 | db-n1-standard-1 ($25+) |
| MongoDB | Atlas M0 Free | $0 | Elastic Cloud ($95+) |
| Static Hosting | GCS | ~$0 | Firebase Hosting |
| Container Registry | Artifact Registry | ~$0 (500MB free) | Docker Hub |
| DNS | Cloudflare (external) | $0 | Cloud DNS ($0.20/zone) |
| CDN | Cloudflare (external) | $0 | Cloud CDN |

### Architecture Constraints Accepted

1. **Cloud SQL db-f1-micro**:
   - Shared vCPU, 614MB RAM
   - Adequate for demo/MVP workloads
   - Can scale up when needed

2. **Cloud Run Cold Starts**:
   - First request may take 2-5 seconds
   - Acceptable for non-real-time workloads
   - Can set min-instances=1 if needed ($)

3. **MongoDB Atlas M0**:
   - 512MB storage limit
   - Shared cluster
   - Sufficient for support ticket data

4. **No Elasticsearch in Prod**:
   - Led to ADR-005 (Backend Abstraction)
   - MongoDB handles support queries adequately

### Monthly Cost Breakdown

| Service | Cost |
|---------|------|
| Cloud SQL (db-f1-micro) | $7.67 |
| Cloud NAT | $1.00 |
| Load Balancer | $18.00 |
| Egress (estimated) | $1.00 |
| Cloud Run | $0.00 |
| GCS | $0.00 |
| MongoDB Atlas | $0.00 |
| **Total** | **~$28/month** |

## Alternatives Considered

### Standard GCP Architecture

**Rejected because**:
- GKE cluster: $70+/month minimum
- Standard Cloud SQL: $25+/month
- Total would exceed $150/month
- Overkill for MVP/demo workload

### All-Free Architecture

**Not Possible because**:
- Cloud SQL has no always-free tier for PostgreSQL
- Load Balancer required for custom domain SSL
- Some NAT egress unavoidable

### Self-Managed on Compute Engine

**Rejected because**:
- Minimum e2-micro: $6/month but only 1GB RAM
- Would need multiple VMs for services
- More operational overhead
- Cloud Run free tier more generous

## Consequences

### Positive

- **86% Cost Reduction**: ~$28/month vs $200+ standard
- **Enterprise Features**: Full OAuth, RBAC, AI integration
- **Scalable Path**: Can upgrade individual services as needed
- **Free Tier Buffer**: Room for growth before paid usage

### Negative

- **Performance Limits**: Cold starts, shared resources
- **Storage Limits**: MongoDB 512MB, must manage data growth
- **No Elasticsearch**: Required backend abstraction (ADR-005)
- **Manual Scaling**: No auto-scaling for cost control

### Scaling Path

When usage grows beyond free tier:

| Trigger | Action | Cost Impact |
|---------|--------|-------------|
| Cloud Run >2M req/mo | Pay per request | +$0.40/million |
| Cloud SQL needs more RAM | Upgrade to db-g1-small | +$17/month |
| MongoDB >512MB | Upgrade to M2 | +$9/month |
| Need warm Cloud Run | Set min-instances=1 | +$15/service |

## References

- `docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md` - Full deployment plan
- `docs/plans/GCP_PROD_PHASE_2_HIGH_AVAILABILITY.md` - Future scaling plan
- `infrastructure/terraform/gcp/main.tf` - Terraform configuration

## Related Decisions

- ADR-005: MCP Support Backend Abstraction (no Elasticsearch)
- ADR-008: VPS Staging vs GCP (cost optimization theme)
- ADR-006: GCS SPA Routing (Cloud Run needed anyway)

---

*This ADR is part of the Tamshai Project Journey - proving enterprise AI doesn't require enterprise budgets.*
