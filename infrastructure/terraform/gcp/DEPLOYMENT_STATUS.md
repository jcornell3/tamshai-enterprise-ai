# GCP Phase 1 Deployment Status

**Last Updated**: January 9, 2026
**Status**: PARTIAL DEPLOYMENT - 26/60 resources created

---

## ✅ Successfully Created Resources (26)

### Security & IAM
- ✅ 5 Random passwords (keycloak_admin, keycloak_db, tamshai_db, jwt_secret, mcp_gateway_client)
- ✅ 3 Service accounts (keycloak, mcp-gateway, mcp-servers)
- ✅ 6 Secret Manager secrets created
- ✅ 6 Secret Manager secret versions (INCLUDING Claude API key!)
- ✅ Secret Manager API enabled

### Storage
- ✅ Terraform state bucket (tamshai-terraform-state-prod)
- ✅ Logs bucket (tamshai-prod-logs)
- ✅ Public docs bucket (tamshai-prod-public-docs)
- ✅ Finance docs bucket (tamshai-prod-finance-docs)
- ❌ Static website bucket (prod.tamshai.com) - **requires domain ownership verification**

### Networking (Partial)
- ✅ VPC network (tamshai-prod-vpc)
- ✅ Subnet (10.0.0.0/24)
- ✅ Cloud Router
- ✅ Cloud NAT

---

## ⏳ Pending Resources (34)

### Networking (7)
- ⏳ VPC Access Connector (fixed naming issue: tamshai-prod-connector)
- ⏳ Firewall rules (4): allow-http, allow-iap-ssh, allow-internal, allow-serverless-connector

### Cloud Run (15)
- ⏳ Artifact Registry repository
- ⏳ 6 Cloud Run services (mcp-gateway, mcp-hr, mcp-finance, mcp-sales, mcp-support, keycloak)
- ⏳ 8 IAM bindings for Cloud Run services

### Database (7)
- ⏳ Cloud SQL instance (db-f1-micro PostgreSQL 16)
- ⏳ Private IP range allocation
- ⏳ Service networking connection
- ⏳ 3 Databases (keycloak, tamshai_hr, tamshai_finance)
- ⏳ 2 Database users (keycloak, tamshai_app)

### Utility VMs (2)
- ⏳ Keycloak VM (e2-micro) - **legacy, may not be used**
- ⏳ MCP Gateway VM (e2-micro) - **legacy, may not be used**

### Security IAM (3)
- ⏳ IAM bindings for service accounts (cloudsql.client, run.invoker roles)

---

## 🔧 Issues Resolved

### 1. APIs Not Enabled
**Issue**: All GCP APIs were disabled on new project
**Fixed**: Ran `gcloud services enable` for 12 APIs
**APIs Enabled**:
- serviceusage.googleapis.com
- cloudresourcemanager.googleapis.com
- iam.googleapis.com
- compute.googleapis.com
- vpcaccess.googleapis.com
- servicenetworking.googleapis.com
- run.googleapis.com
- sqladmin.googleapis.com
- secretmanager.googleapis.com
- artifactregistry.googleapis.com
- storage-api.googleapis.com
- storage-component.googleapis.com

### 2. Service Account Missing Permissions
**Issue**: claude-deployer SA had 8 roles but needed 3 more for Terraform
**Fixed**: Added roles via `gcloud projects add-iam-policy-binding`
**Original Roles** (8):
- roles/artifactregistry.admin
- roles/cloudsql.admin
- roles/compute.instanceAdmin.v1
- roles/iam.serviceAccountUser
- roles/run.admin
- roles/secretmanager.admin
- roles/storage.admin
- roles/vpcaccess.admin

**Added Roles** (3):
- ✅ roles/compute.networkAdmin (create VPCs, firewalls)
- ✅ roles/iam.serviceAccountAdmin (create service accounts)
- ✅ roles/resourcemanager.projectIamAdmin (manage project IAM bindings)

**Total**: 11 roles now assigned

### 3. VPC Connector Naming Error
**Issue**: Name "tamshai-prod-vpc-connector" (26 chars) exceeds max length (25 chars)
**Fixed**: Changed to "tamshai-prod-connector" (23 chars)
**File**: `infrastructure/terraform/modules/networking/main.tf:113`

### 4. Static Website Bucket Domain Ownership
**Issue**: `prod.tamshai.com` requires domain ownership verification in Google Search Console
**Workaround**: Disabled static website bucket by setting `static_website_domain = ""`
**File**: `infrastructure/terraform/gcp/variables.tf:91`
**User Action Required**: Verify domain at https://search.google.com/search-console/welcome?new_url_prefix=prod.tamshai.com

---

## 📋 Next Steps

### Immediate (Retry Terraform Apply)
```bash
cd infrastructure/terraform/gcp
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/gcp-sa-key.json"
terraform apply -auto-approve
```

**Expected**: 34 remaining resources should deploy successfully

### Post-Deployment

1. **Get DNS Records**:
```bash
terraform output dns_records
```

2. **Configure DNS in Cloudflare**:
- api.tamshai.com → CNAME to MCP Gateway URL
- auth.tamshai.com → CNAME to Keycloak URL

3. **Verify Domain Ownership** (optional, for static website):
- Visit: https://search.google.com/search-console/welcome?new_url_prefix=prod.tamshai.com
- Add verification TXT record to DNS
- Re-enable static website bucket: `static_website_domain = "prod.tamshai.com"`
- Run `terraform apply` again

4. **Deploy Application Code**:
```bash
gh workflow run deploy-to-gcp.yml --ref main
```

5. **Run Smoke Tests**:
```bash
curl https://api.tamshai.com/health
curl https://auth.tamshai.com/health/ready
```

---

## 🎯 Key Achievements

✅ **Secrets Management**: All secrets including Claude API key successfully stored in Secret Manager
✅ **Authentication**: Service account fully configured with 11 roles
✅ **APIs**: All 12 required GCP APIs enabled
✅ **Networking**: VPC and subnet created
✅ **Storage**: 3 of 4 storage buckets operational

---

## 📁 Important Files

- **terraform.tfvars**: Contains `project_id`, `mongodb_atlas_uri`, `claude_api_key` (gitignored)
- **gcp-sa-key.json**: Service account credentials (gitignored)
- **tfplan**: Stale (regenerate before next apply)

---

## 🚨 Rollback Instructions

If deployment fails and you need to destroy partial resources:

```bash
cd infrastructure/terraform/gcp
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/gcp-sa-key.json"
terraform destroy -auto-approve
```

**Warning**: This will delete all 26 created resources including secrets!

---

*Generated during GCP Phase 1 deployment - Session paused at 26/60 resources*
