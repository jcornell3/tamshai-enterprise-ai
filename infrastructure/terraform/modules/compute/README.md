# Compute Module (GCE VMs)

## ⚠️ DEPRECATION NOTICE FOR GCP PHASE 1/2

This module is designed for **GCE VM-based deployments** (Compute Engine instances) and is **NOT used in Phase 1 or Phase 2 GCP production deployments**.

### Current Usage

| Environment | Uses This Module? | Architecture |
|-------------|-------------------|--------------|
| **VPS Staging** | ✅ Yes | Hetzner Cloud VMs |
| **Phase 1 GCP** | ❌ No | Cloud Run (serverless) |
| **Phase 2 GCP** | ❌ No | Cloud Run (serverless) |

### GCP Phase 1/2 Architecture

Both Phase 1 and Phase 2 GCP deployments use **Cloud Run** (serverless containers), not GCE VMs:

- **MCP Gateway**: Cloud Run service
- **MCP Suite** (HR, Finance, Sales, Support): Cloud Run services
- **Keycloak**: Cloud Run service
- **Database**: Cloud SQL (managed PostgreSQL)
- **Redis**: Memorystore (Phase 2) or Utility VM (Phase 1)

See:
- Phase 1 config: `infrastructure/terraform/gcp/main.tf`
- Cloud Run module: `infrastructure/terraform/modules/cloudrun/`
- Phase 1 plan: `docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md`
- Phase 2 plan: `docs/plans/GCP_PROD_PHASE_2_HIGH_AVAILABILITY.md`

### Checkov Security Alerts

The following Checkov alerts **DO NOT APPLY** to Phase 1/2 GCP deployments:

| Alert | Rule | Reason |
|-------|------|--------|
| 44 | CKV_GCP_38 | VM disk encryption - **No VMs in Phase 1/2** |
| 42 | CKV_GCP_40 | VM public IPs - **No VMs in Phase 1/2** |
| 41 | CKV_GCP_38 | VM disk encryption - **No VMs in Phase 1/2** |
| 39 | CKV_GCP_40 | VM public IPs - **No VMs in Phase 1/2** |

These alerts are only relevant for VPS staging deployments, which use Hetzner Cloud VMs.

### Phase 1 Utility VM Exception

Phase 1 does include **one** e2-micro VM for:
- Redis (since Memorystore is too expensive for Phase 1)
- Bastion host for SSH access to private resources

However, this is managed differently than the Keycloak/MCP Gateway VMs this module was designed for.

---

*For Cloud Run deployment configuration, see `infrastructure/terraform/modules/cloudrun/`*
