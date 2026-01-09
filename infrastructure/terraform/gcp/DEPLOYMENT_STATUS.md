# GCP Phase 1 Deployment Status

**Last Updated**: January 9, 2026
**Status**: INFRASTRUCTURE COMPLETE - 47/60 resources deployed
**Remaining**: 13 Cloud Run services (pending Docker images)

---

## ✅ Successfully Deployed Infrastructure (47 resources)

### Networking (9 resources)
- ✅ VPC network (tamshai-prod-vpc)
- ✅ Subnet (10.0.0.0/24)
- ✅ Cloud Router
- ✅ Cloud NAT
- ✅ VPC Access Connector (tamshai-prod-connector)
- ✅ 4 Firewall rules (allow-internal, allow-http, allow-iap-ssh, allow-serverless-connector)

### Security & IAM (17 resources)
- ✅ 5 Random passwords (keycloak_admin, keycloak_db, tamshai_db, jwt_secret, mcp_gateway_client)
- ✅ 3 Service accounts (keycloak, mcp-gateway, mcp-servers)
- ✅ 6 Secret Manager secrets
- ✅ 6 Secret Manager secret versions (INCLUDING Claude API key!)
- ✅ 3 Project IAM member bindings (cloudsql.client, run.invoker)
- ✅ Secret Manager API enabled

### Storage (4 resources)
- ✅ Terraform state bucket (tamshai-terraform-state-prod)
- ✅ Logs bucket (tamshai-prod-logs)
- ✅ Public docs bucket (tamshai-prod-public-docs)
- ✅ Finance docs bucket (tamshai-prod-finance-docs)
- ⏸️ Static website bucket (DISABLED - requires domain ownership verification)

### Database (7 resources)
- ✅ Cloud SQL PostgreSQL instance (db-f1-micro, ENTERPRISE edition)
  - **Creation time: 13m11s** (normal for Cloud SQL)
- ✅ Private IP range allocation
- ✅ Service networking connection
- ✅ 3 Databases (keycloak, tamshai_hr, tamshai_finance)
- ✅ 2 Database users (keycloak, tamshai)

### Compute (3 resources)
- ✅ Artifact Registry repository (us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai)
- ✅ Utility VM: Keycloak (e2-micro) - **legacy, may not be actively used**
- ✅ Utility VM: MCP Gateway (e2-micro) - **legacy, may not be actively used**

---

## ⏳ Pending Resources (13) - Requires Docker Images

### Cloud Run Services (6)
- ⏳ mcp-gateway (Port 3100)
- ⏳ mcp-hr (Port 3101)
- ⏳ mcp-finance (Port 3102)
- ⏳ mcp-sales (Port 3103)
- ⏳ mcp-support (Port 3104)
- ⏳ keycloak (Port 8080)

### Cloud Run IAM Bindings (7)
- ⏳ 7 IAM member bindings for Cloud Run service access

**Blocker**: Docker images must be built and pushed to Artifact Registry before Cloud Run services can be created.

**Required Images**:
```
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-gateway:latest
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-hr:latest
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-finance:latest
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-sales:latest
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-support:latest
us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/keycloak:latest
```

---

## 🔧 Issues Resolved

### 1. APIs Not Enabled (FIXED)
**Issue**: All 12 required GCP APIs were disabled
**Fix**: Ran `gcloud services enable` for 12 APIs
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

### 2. Service Account Permissions (FIXED)
**Issue**: claude-deployer SA needed additional permissions
**Fix**: Added 4 roles via `gcloud projects add-iam-policy-binding`
**Total IAM Roles** (12):
1. roles/artifactregistry.admin
2. roles/cloudsql.admin
3. roles/compute.instanceAdmin.v1
4. roles/compute.networkAdmin
5. roles/compute.securityAdmin ✅ **(NEW - firewall create)**
6. roles/iam.serviceAccountAdmin
7. roles/iam.serviceAccountUser
8. roles/resourcemanager.projectIamAdmin
9. roles/run.admin
10. roles/secretmanager.admin
11. roles/storage.admin
12. roles/vpcaccess.admin

### 3. VPC Connector Naming (FIXED)
**Issue**: Name "tamshai-prod-vpc-connector" (26 chars) exceeds max (25 chars)
**Fix**: Changed to "tamshai-prod-connector" (23 chars)
**File**: `infrastructure/terraform/modules/networking/main.tf:113`

### 4. Static Website Bucket (FIXED)
**Issue**: prod.tamshai.com requires domain ownership verification
**Fix**: Disabled by setting `static_website_domain = ""` and made conditional in main.tf
**Files**:
- `infrastructure/terraform/gcp/terraform.tfvars:43`
- `infrastructure/terraform/gcp/main.tf:124`

### 5. Cloud SQL Database Edition (FIXED)
**Issue**: PostgreSQL 16 defaulted to ENTERPRISE_PLUS, which doesn't support db-f1-micro
**Fix**: Set `edition = "ENTERPRISE"` in settings block
**File**: `infrastructure/terraform/modules/database/main.tf:30`

### 6. pgaudit.log Format (FIXED)
**Issue**: Value "ddl, write" rejected (space not allowed)
**Fix**: Changed to "ddl,write" (no spaces)
**File**: `infrastructure/terraform/modules/database/main.tf:104`

### 7. log_min_messages Case (FIXED)
**Issue**: "ERROR" uppercase not accepted
**Fix**: Changed to lowercase "error"
**File**: `infrastructure/terraform/modules/database/main.tf:88`

### 8. Cloud Run PORT Environment Variable (FIXED)
**Issue**: PORT is reserved by Cloud Run and automatically set
**Fix**: Removed PORT env variable from MCP Suite services
**File**: `infrastructure/terraform/modules/cloudrun/main.tf:213-214`

### 9. Outputs Null Reference (FIXED)
**Issue**: deployment_summary referenced null static_website_url
**Fix**: Made website outputs conditional with null checks
**File**: `infrastructure/terraform/gcp/outputs.tf:149,156`

---

## 📋 Next Steps

### Option A: GitHub Actions CI/CD Deployment (Recommended)

**Prerequisites**:
- ✅ Artifact Registry created
- ✅ Service accounts configured
- ✅ Secrets stored in Secret Manager

**Steps**:
```bash
# Trigger GitHub Actions workflow to build and deploy
gh workflow run deploy-to-gcp.yml --ref main

# Monitor deployment
gh run list --workflow=deploy-to-gcp.yml --limit 5
gh run watch
```

**What the workflow does**:
1. Builds Docker images for all 6 services
2. Pushes images to Artifact Registry
3. Runs `terraform apply` to create Cloud Run services
4. Verifies health checks

### Option B: Manual Docker Build & Push

**Build and push images manually**:
```bash
# Authenticate with Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Set variables
PROJECT_ID="gen-lang-client-0553641830"
REGION="us-central1"
REPO="tamshai"

# Build and push MCP Gateway
cd services/mcp-gateway
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-gateway:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-gateway:latest

# Build and push MCP HR
cd ../mcp-hr
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-hr:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-hr:latest

# Build and push MCP Finance
cd ../mcp-finance
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-finance:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-finance:latest

# Build and push MCP Sales
cd ../mcp-sales
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-sales:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-sales:latest

# Build and push MCP Support
cd ../mcp-support
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-support:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/mcp-support:latest

# Build and push Keycloak
cd ../../infrastructure/docker/keycloak
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/keycloak:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO/keycloak:latest

# Retry Terraform apply
cd ../../../infrastructure/terraform/gcp
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/gcp-sa-key.json"
terraform apply -auto-approve
```

### Post-Deployment

1. **Get DNS Records**:
```bash
terraform output dns_records
```

2. **Configure DNS in Cloudflare**:
- api.tamshai.com → CNAME to MCP Gateway Cloud Run URL
- auth.tamshai.com → CNAME to Keycloak Cloud Run URL

3. **Verify Deployment**:
```bash
curl https://api.tamshai.com/health
curl https://auth.tamshai.com/health/ready
```

4. **Domain Ownership Verification** (Optional - for static website):
- Visit: https://search.google.com/search-console/welcome?new_url_prefix=prod.tamshai.com
- Add verification TXT record to DNS
- Set `static_website_domain = "prod.tamshai.com"` in terraform.tfvars
- Run `terraform apply` again

---

## 🎯 Deployment Achievements

✅ **Core Infrastructure**: VPC, networking, firewall rules all operational
✅ **Database**: PostgreSQL 16 (ENTERPRISE edition) with 3 databases configured
✅ **Security**: All secrets including Claude API key in Secret Manager
✅ **Authentication**: 12 IAM roles assigned to claude-deployer SA
✅ **Storage**: 3 operational buckets (logs, public-docs, finance-docs)
✅ **Container Registry**: Artifact Registry ready for Docker images
✅ **Legacy VMs**: 2 utility VMs for backup/testing (may not be actively used)

**Infrastructure Cost**: ~$20-30/month (without Cloud Run services)
**Estimated Total Cost**: $50-80/month (with Cloud Run services)

---

## 📁 Important Files

- **terraform.tfvars**: Contains `project_id`, `mongodb_atlas_uri`, `claude_api_key` (gitignored)
- **gcp-sa-key.json**: Service account credentials (gitignored)
- **Artifact Registry URL**: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai`

---

## 🚨 Rollback Instructions

If deployment fails and you need to destroy resources:

```bash
cd infrastructure/terraform/gcp
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/gcp-sa-key.json"
terraform destroy -auto-approve
```

**Warning**: This will delete all 47 deployed resources including database and secrets!

---

*Infrastructure deployment completed - January 9, 2026*
*Cloud Run services pending Docker image build*
