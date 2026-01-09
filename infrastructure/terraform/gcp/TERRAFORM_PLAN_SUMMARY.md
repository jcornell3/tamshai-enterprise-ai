# Terraform Plan Summary - GCP Phase 1 Production

**Generated**: January 9, 2026
**Plan File**: `tfplan`
**Total Resources**: 67 to add, 0 to change, 0 to destroy

---

## Infrastructure Overview

### 1. Networking (10 resources)

| Resource | Type | Purpose |
|----------|------|---------|
| VPC Network | `google_compute_network.vpc` | Private network: `tamshai-prod-vpc` |
| Subnet | `google_compute_subnetwork.subnet` | CIDR: `10.0.0.0/24` (254 usable IPs) |
| Cloud Router | `google_compute_router.router` | NAT gateway for private instances |
| Cloud NAT | `google_compute_router_nat.nat` | Outbound internet access |
| VPC Connector | `google_vpc_access_connector.serverless_connector` | Cloud Run → Cloud SQL/Redis |
| Firewall - HTTP | `google_compute_firewall.allow_http` | Ports 80, 443 from `0.0.0.0/0` |
| Firewall - IAP SSH | `google_compute_firewall.allow_iap_ssh` | SSH via Identity-Aware Proxy |
| Firewall - Internal | `google_compute_firewall.allow_internal` | All traffic within VPC |
| Firewall - Connector | `google_compute_firewall.allow_serverless_connector` | VPC connector egress |
| Private IP Range | `google_compute_global_address.private_ip_range` | Cloud SQL private IP allocation |

### 2. Compute - Cloud Run (15 resources)

#### Artifact Registry
- **Repository**: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai`
- **Format**: Docker
- **Purpose**: Container images for all services

#### Cloud Run Services (6 services)

| Service | Memory | Min Instances | Max Instances | Access |
|---------|--------|---------------|---------------|--------|
| MCP Gateway | 1GiB | 0 | 2 | Public |
| MCP HR | 512MiB | 0 | 2 | Private |
| MCP Finance | 512MiB | 0 | 2 | Private |
| MCP Sales | 512MiB | 0 | 2 | Private |
| MCP Support | 512MiB | 0 | 2 | Private |
| Keycloak | 1GiB | 0 | 4 | Public |

**Configuration**:
- Timeout: 300s (5 minutes)
- VPC Access: Via `serverless_connector`
- Execution Environment: gen2
- Autoscaling: Scale to zero enabled (Phase 1 cost optimization)

#### IAM Bindings (8 bindings)
- MCP Gateway & Keycloak: Public access (`allUsers` invoker role)
- MCP Suite: Private access (only MCP Gateway can invoke)

### 3. Database - Cloud SQL (7 resources)

#### PostgreSQL Instance
- **Instance ID**: `tamshai-prod-postgres`
- **Tier**: `db-f1-micro` (shared-core, ~$10-15/month)
- **Version**: PostgreSQL 16
- **Availability**: Zonal (single zone)
- **Disk**: 10GB SSD
- **Private IP**: Yes (no public IP)
- **Backups**: Enabled (7-day retention)
- **SSL**: Enforced (`ENCRYPTED_ONLY`)

#### Databases (3 databases)
1. `keycloak` - Authentication/IAM data
2. `tamshai_hr` - HR/employee data
3. `tamshai_finance` - Financial data

#### Database Users (2 users)
1. `keycloak` - Keycloak service account
2. `tamshai_app` - Application service account (MCP servers)

#### VPC Connection
- **Service Networking Connection**: Links Cloud SQL to VPC for private access

### 4. Storage - Cloud Storage (5 resources)

| Bucket | Purpose | Public Access | Versioning |
|--------|---------|---------------|------------|
| `prod.tamshai.com` | Static website hosting | Yes (index.html, 404.html) | Enabled |
| `tamshai-prod-finance-docs-*` | Finance documents | No | Enabled |
| `tamshai-prod-public-docs-*` | Public documentation | Yes | Enabled |
| `tamshai-prod-logs-*` | Audit logs | No | Enabled (90-day lifecycle) |
| `tamshai-terraform-state-prod` | Terraform state | No | Enabled (already exists) |

### 5. Security - IAM & Secrets (33 resources)

#### Service Accounts (3)
1. `tamshai-prod-keycloak@...` - Keycloak Cloud Run service
2. `tamshai-prod-mcp-gateway@...` - MCP Gateway service
3. `tamshai-prod-mcp-servers@...` - MCP Suite services (shared)

#### Secret Manager Secrets (6 secrets + 5 versions)

| Secret | Auto-Generated | Purpose |
|--------|----------------|---------|
| `anthropic-api-key` | ❌ Manual | Claude API key (must be added manually) |
| `keycloak-admin-password` | ✅ Yes | Keycloak admin console access |
| `keycloak-db-password` | ✅ Yes | Keycloak database user password |
| `tamshai-db-password` | ✅ Yes | Application database user password |
| `mcp-gateway-client-secret` | ✅ Yes | OAuth client secret for MCP Gateway |
| `jwt-secret` | ✅ Yes | JWT signing key for tokens |

**Note**: Passwords are auto-generated using `random_password` (32 chars, special chars included).

#### IAM Bindings (13 bindings)
- Cloud SQL Client access for all service accounts
- Cloud Run Invoker role for MCP Gateway (to call MCP Suite)
- Secret Manager accessor roles for services

#### API Enablement
- Secret Manager API enabled

### 6. Utility VM - Compute Engine (2 resources)

#### Keycloak Instance (deprecated - using Cloud Run instead)
- **Machine Type**: e2-micro (~$7/month or free tier)
- **OS**: Debian 12
- **Disk**: 10GB standard persistent disk
- **Purpose**: Originally for Keycloak, now used for Redis/Bastion
- **Network**: Private IP + public IP (NAT)

#### MCP Gateway Instance (deprecated - using Cloud Run instead)
- **Machine Type**: e2-micro
- **Purpose**: Originally for MCP Gateway, now unused (Cloud Run replaces this)

**Note**: These VMs are legacy from compute module. Phase 1 uses Cloud Run exclusively. Consider removing these or repurposing for Redis.

---

## Deployment Outputs

After `terraform apply`, the following outputs will be available:

| Output | Description |
|--------|-------------|
| `artifact_registry_url` | Docker image repository URL |
| `mcp_gateway_url` | MCP Gateway Cloud Run URL |
| `mcp_hr_url` | MCP HR service URL |
| `mcp_finance_url` | MCP Finance service URL |
| `mcp_sales_url` | MCP Sales service URL |
| `mcp_support_url` | MCP Support service URL |
| `keycloak_url` | Keycloak authentication URL |
| `postgres_connection_name` | Cloud SQL connection name |
| `postgres_private_ip` | Database private IP (sensitive) |
| `serverless_connector_id` | VPC connector resource ID |
| `static_website_bucket_name` | Static website bucket name |
| `static_website_url` | Static website public URL |
| `utility_vm_ip` | Utility VM private IP (sensitive) |
| `utility_vm_public_ip` | Utility VM public IP (for SSH) |
| `vpc_network_name` | VPC network name |
| `dns_records` | DNS CNAME records to configure |
| `deployment_summary` | Full deployment summary |

---

## DNS Configuration Required

After deployment, add these DNS records in Cloudflare:

| Record | Type | Value |
|--------|------|-------|
| `api.tamshai.com` | CNAME | `<mcp_gateway_url>` (from output) |
| `auth.tamshai.com` | CNAME | `<keycloak_url>` (from output) |
| `prod.tamshai.com` | CNAME | `c.storage.googleapis.com` |

---

## Manual Steps Required

### 1. Add Claude API Key to Secret Manager

**After `terraform apply` completes**, run:

```bash
# Get your Claude API key from https://console.anthropic.com/
export CLAUDE_API_KEY="sk-ant-api03-YOUR_KEY_HERE"

# Add to Secret Manager
echo -n "$CLAUDE_API_KEY" | gcloud secrets versions add anthropic-api-key --data-file=-
```

### 2. Verify Secret Manager IAM

Ensure MCP Gateway service account has access:

```bash
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:tamshai-prod-mcp-gateway@gen-lang-client-0553641830.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Cost Estimate

| Resource Category | Monthly Cost |
|-------------------|--------------|
| Cloud Run (6 services, scale-to-zero) | $5-15 |
| Cloud SQL (db-f1-micro, zonal) | $10-15 |
| Utility VM (2x e2-micro) | $0-14 (free tier eligible) |
| VPC Connector (2-3 instances) | $12-18 |
| Storage (buckets + state) | $1-2 |
| Secret Manager | $0.30 |
| Networking (NAT, egress) | $5-10 |
| **Total** | **~$35-75/month** |

**Notes**:
- Lower end assumes free tier usage (e2-micro VMs)
- Cloud Run cost depends on actual usage (scale-to-zero saves money)
- No charge for idle Cloud Run services

---

## Security Highlights

✅ **Private Cloud SQL**: No public IP, VPC-only access
✅ **SSL Enforced**: `ssl_mode = "ENCRYPTED_ONLY"`
✅ **Auto-generated Passwords**: 32-char random passwords
✅ **IAM Least Privilege**: Service accounts with minimal permissions
✅ **Secret Manager**: Centralized secret storage
✅ **Firewall Rules**: Restrictive ingress, internal traffic allowed
✅ **Shielded VMs**: Secure boot, vTPM, integrity monitoring
✅ **Backup Enabled**: 7-day automated backups for Cloud SQL

---

## Next Steps

1. **Review this plan** - Ensure all resources are expected
2. **Run `terraform apply "tfplan"`** - Deploy infrastructure (~10-15 minutes)
3. **Add Claude API key** - Manual step (see above)
4. **Configure DNS** - Add CNAME records in Cloudflare
5. **Deploy application code** - Trigger `.github/workflows/deploy-to-gcp.yml`
6. **Run smoke tests** - Verify all services are healthy

---

*Plan generated by Terraform v1.0+, Google Provider v7.15.0*
