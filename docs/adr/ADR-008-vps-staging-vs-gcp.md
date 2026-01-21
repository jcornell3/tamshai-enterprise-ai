# ADR-008: VPS Staging vs GCP Staging

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-008: VPS Staging vs GCP Staging",
  "headline": "Decision to Use Hetzner VPS for Staging Instead of GCP",
  "description": "Documents the decision to use Hetzner Cloud VPS for staging environment instead of a separate GCP project",
  "datePublished": "2025-12-20",
  "dateModified": "2026-01-21",
  "keywords": ["vps", "hetzner", "gcp", "staging", "cost-optimization", "infrastructure"],
  "learningResourceType": "architecture-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Hetzner Cloud" },
    { "@type": "SoftwareApplication", "name": "Google Cloud Platform" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (December 2025)

## Context

The project needed a staging environment that:

1. Mirrors production architecture (containers, Keycloak, databases)
2. Is accessible externally for testing and demos
3. Costs significantly less than production
4. Can be quickly rebuilt for testing

**Question**: Should staging run on GCP (matching production) or a simpler VPS?

## Decision

Use **Hetzner Cloud VPS** (CPX31: 4 vCPU, 8GB RAM) for staging instead of GCP.

### Cost Comparison

| Resource | GCP Staging | Hetzner VPS |
|----------|-------------|-------------|
| Compute | Cloud Run ~$30/mo | CPX31 $15/mo |
| Database | Cloud SQL ~$15/mo | Docker PostgreSQL $0 |
| Load Balancer | $18/mo | Caddy (included) $0 |
| Networking | ~$5/mo | Included $0 |
| **Total** | **~$68/mo** | **~$15/mo** |

**Savings**: ~$53/month (78% reduction)

### Architecture

```
Production (GCP):                    Staging (VPS):
┌─────────────────────────┐         ┌─────────────────────────┐
│ Cloud Run Services      │         │ Docker Compose          │
│ Cloud SQL PostgreSQL    │         │ All services in Docker  │
│ MongoDB Atlas           │         │ Single VM               │
│ Cloud Load Balancer     │         │ Caddy reverse proxy     │
│ GCS Static Hosting      │         │ Cloudflare DNS/CDN      │
└─────────────────────────┘         └─────────────────────────┘
```

### VPS Specification

| Component | Value |
|-----------|-------|
| Provider | Hetzner Cloud |
| Location | Hillsboro, Oregon (hil) |
| Plan | CPX31 |
| vCPU | 4 AMD cores |
| RAM | 8 GB |
| Storage | 160 GB NVMe |
| IP | Static IPv4 + IPv6 |

## Alternatives Considered

### GCP Staging Project

**Rejected because**:
- Minimum ~$68/month even with free tier usage
- Complexity of managing two GCP projects
- Cloud Run cold starts affect testing
- Would consume free tier credits needed for prod

### Local Docker Only

**Rejected because**:
- Not accessible externally
- Can't test OAuth redirects with real domain
- No HTTPS for Keycloak testing
- Team members can't share access

### AWS/Azure VPS

**Rejected because**:
- Similar or higher pricing
- Hetzner has superior price/performance ratio
- US West (Oregon) location available
- Simple pricing model

## Consequences

### Positive

- **78% Cost Reduction**: $15/mo vs $68/mo
- **Simpler Architecture**: Single VM with Docker Compose
- **Fast Rebuilds**: Full environment in ~10 minutes
- **SSH Access**: Direct debugging capability
- **No Cold Starts**: Services always warm
- **Terraform Managed**: Infrastructure as code

### Negative

- **Not Identical to Prod**: Docker Compose vs Cloud Run
- **Single Point of Failure**: One VM vs distributed
- **Manual Scaling**: No auto-scaling capability
- **Different Networking**: No VPC, uses Docker network

### Acceptable Trade-offs

| Production Feature | Staging Equivalent | Acceptable? |
|-------------------|-------------------|-------------|
| Cloud Run | Docker containers | ✅ Same containers |
| Cloud SQL | Docker PostgreSQL | ✅ Same queries |
| Cloud Load Balancer | Caddy | ✅ Same HTTPS |
| Auto-scaling | Fixed resources | ✅ Not needed for staging |
| 99.9% SLA | Best-effort | ✅ Staging can have downtime |

## Implementation

### Terraform

```hcl
# infrastructure/terraform/vps/main.tf
resource "hcloud_server" "staging" {
  name        = "tamshai-stage"
  server_type = "cpx31"
  location    = "hil"
  image       = "ubuntu-22.04"

  user_data = file("${path.module}/cloud-init.yaml")
}
```

### Deployment

```bash
# Full VPS rebuild
cd infrastructure/terraform/vps
terraform destroy -auto-approve
terraform apply -auto-approve
# Wait for cloud-init (~5-10 min)
gh workflow run deploy-vps.yml
```

## References

- `docs/deployment/VPS_SETUP_GUIDE.md` - VPS setup instructions
- `docs/deployment/STAGE_VPS_DEPLOYMENT_STATUS.md` - Deployment status
- `infrastructure/terraform/vps/` - VPS Terraform configuration
- `infrastructure/cloud-init/cloud-init.yaml` - Cloud-init script

## Related Decisions

- ADR-003: Nginx to Caddy Migration (Caddy chosen for VPS simplicity)
- ADR-011: GCP Cost Optimization (same cost-conscious approach)
- ADR-002: Phoenix Rebuild Evolution (VPS enables fast rebuilds)

---

*This ADR is part of the Tamshai Project Journey - documenting that staging doesn't need to match production exactly.*
