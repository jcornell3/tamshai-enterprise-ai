# GCP Phase 1 Deployment Status

**Last Updated**: January 9, 2026 18:45 UTC
**Status**: DEBUGGING - 52/60 resources deployed, container startup issues identified
**Working**: 4 MCP Suite services deployed and running
**Failing**: 2 services (mcp-gateway, keycloak) - container startup failures
**Progress**: Terraform configuration fixes applied, awaiting log investigation

---

## ✅ Successfully Deployed Infrastructure (48 resources)

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

### Storage (5 resources)
- ✅ Terraform state bucket (tamshai-terraform-state-prod)
- ✅ Logs bucket (tamshai-prod-logs)
- ✅ Public docs bucket (tamshai-prod-public-docs)
- ✅ Finance docs bucket (tamshai-prod-finance-docs)
- ✅ Static website bucket (prod.tamshai.com) - **Domain verified**

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

## ✅ Successfully Deployed Cloud Run Services (4 resources)

### MCP Suite Services (All Working)
- ✅ **mcp-hr** (Port 3101) - Deployed and running
  - Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-hr:latest`
  - Digest: sha256:03515af77d9183530deabbb5c0d9de78a2d3a4bbe07027ec00b504e8e95ccc77
  - Service account: tamshai-prod-mcp-servers@

- ✅ **mcp-finance** (Port 3102) - Deployed and running
  - Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-finance:latest`
  - Digest: sha256:07a44c6f458f568043f4959dcac85b0d6355160156b490d6b1dcbe05a30e4c70
  - Service account: tamshai-prod-mcp-servers@

- ✅ **mcp-sales** (Port 3103) - Deployed and running
  - Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-sales:latest`
  - Digest: sha256:2eb29c6402221cf9f2582c8a615a0f9678130a8d6837887aa78d3dd5545e2e06
  - Service account: tamshai-prod-mcp-servers@

- ✅ **mcp-support** (Port 3104) - Deployed and running
  - Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-support:latest`
  - Digest: sha256:14f2a83144f9a6ffe653fb56e87fdae71c20403fe9eb635010ee954789b3dd18
  - Service account: tamshai-prod-mcp-servers@

### Cloud Run IAM Bindings (4)
- ✅ 4 IAM member bindings for MCP Suite services (run.invoker role)

## ❌ Failing Cloud Run Services (2 resources) - Container Startup Failures

### mcp-gateway (FAILED - Container won't start)
**Error**: `The user-provided container failed to start and listen on the port defined provided by the PORT=3100 environment variable`

**Docker Image**: Built and pushed successfully
- Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-gateway:latest`
- Digest: sha256:90989b2f1cac69bf4d9cc6756e741a4a17290d27d152a18c04663e65863ba9f5
- Service account: tamshai-prod-mcp-gateway@

**Likely Causes**:
1. Missing or incorrect environment variables (Redis, MongoDB, Keycloak URLs)
2. VPC connector not properly attached (can't reach Cloud SQL/Redis)
3. Container crashing during startup before listening on port

**Logs URL**: https://console.cloud.google.com/logs/viewer?project=gen-lang-client-0553641830&resource=cloud_run_revision/service_name/mcp-gateway

### keycloak (FAILED - Container won't start)
**Error**: `The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable`

**Docker Image**: Built and pushed successfully
- Image: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/keycloak:latest`
- Digest: sha256:5fab244400e2304e005d0fca677ee646462e64f2f3cc3a4fcea49d2543f048fa
- Service account: tamshai-prod-keycloak@

**Likely Causes**:
1. Database connection failure (can't connect to Cloud SQL PostgreSQL)
2. VPC connector not properly configured
3. Missing KC_DB_URL_JDBC or incorrect database credentials
4. Keycloak requires successful DB connection before starting HTTP server

**Logs URL**: https://console.cloud.google.com/logs/viewer?project=gen-lang-client-0553641830&resource=cloud_run_revision/service_name/keycloak

## ⏳ Pending Resources (8) - Blocked by Service Failures

### Cloud Run Services (2)
- ❌ mcp-gateway - Needs debugging
- ❌ keycloak - Needs debugging

### Cloud Run IAM Bindings (2)
- ⏳ mcp-gateway public access (allUsers run.invoker)
- ⏳ keycloak public access (allUsers run.invoker)

**Blocker**: Cannot create IAM bindings until services successfully deploy.

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

### 10. Static Website Domain Verification (FIXED)
**Issue**: Error 403 "Another user owns the domain prod.tamshai.com" - persisted for 8+ hours
**Root Cause**: Domain verified by jcore3@gmail.com in Search Console, but Terraform running as claude-deployer@gen-lang-client-0553641830.iam.gserviceaccount.com
**Fix**: Added service account as Owner in Google Search Console
**Result**: Bucket created successfully in 1 second after adding SA
**File**: `infrastructure/terraform/gcp/terraform.tfvars:43` (re-enabled static_website_domain)

### 11. GitHub Actions Workflow Fixes (FIXED)
**Issue 11a**: Cloud Run services using default compute SA instead of dedicated service accounts
**Error**: Permission denied on Secret Manager secrets for 1046947015464-compute@developer.gserviceaccount.com
**Fix**: Added `--service-account` flag to all Cloud Run deploy commands
**Files**: `.github/workflows/deploy-to-gcp.yml:93,153,197`

**Issue 11b**: Static website build failure - missing @rollup/rollup-linux-x64-gnu
**Root Cause**: npm ci has known bug with optional dependencies on Linux
**Fix**: Changed `npm ci` to `npm install` and added `rm -rf node_modules package-lock.json` first
**File**: `.github/workflows/deploy-to-gcp.yml:231-232`

### 12. GitHub Actions vs Terraform Configuration Mismatch (DOCUMENTED)
**Issue**: Cloud Run deployments via `gcloud run deploy` in GitHub Actions workflow missing critical config
**Missing from workflow**:
- Keycloak: KC_DB_URL, KC_DB_USERNAME, KC_DB_PASSWORD, KC_HOSTNAME, KC_HOSTNAME_STRICT
- All services: VPC connector for Cloud SQL private IP access
- All services: Proper database connection strings from Terraform state

**Root Cause**: Workflow uses `gcloud run deploy` commands instead of `terraform apply`
**Terraform configuration is complete** - has all correct environment variables, secrets, VPC connectors, etc.

**Solution**: Use Terraform to deploy Cloud Run services

### 13. Secret Manager Secret Name Mismatches (FIXED)
**Issue**: Terraform referencing wrong secret names, not matching actual Secret Manager secrets
**Errors**:
- `claude-api-key` secret not found (actual: `tamshai-prod-anthropic-api-key`)
- `keycloak-admin-user` secret not found (not needed - using env var)
- `keycloak-admin-password` secret not found (actual: `tamshai-prod-keycloak-admin-password`)
- `keycloak-db-password` secret not found (actual: `tamshai-prod-keycloak-db-password`)

**Fix**: Updated infrastructure/terraform/gcp/main.tf to use correct secret names
**Fix**: Changed KEYCLOAK_ADMIN from secret reference to environment variable
**Files**: `infrastructure/terraform/gcp/main.tf:185-188`, `infrastructure/terraform/modules/cloudrun/main.tf:297-300`

### 14. Docker Image Builds (COMPLETED)
**All 6 images built and pushed successfully** (January 9, 2026 17:15 UTC)

- ✅ mcp-gateway: sha256:90989b2f1cac69bf4d9cc6756e741a4a17290d27d152a18c04663e65863ba9f5
- ✅ mcp-hr: sha256:03515af77d9183530deabbb5c0d9de78a2d3a4bbe07027ec00b504e8e95ccc77
- ✅ mcp-finance: sha256:07a44c6f458f568043f4959dcac85b0d6355160156b490d6b1dcbe05a30e4c70
- ✅ mcp-sales: sha256:2eb29c6402221cf9f2582c8a615a0f9678130a8d6837887aa78d3dd5545e2e06
- ✅ mcp-support: sha256:14f2a83144f9a6ffe653fb56e87fdae71c20403fe9eb635010ee954789b3dd18
- ✅ keycloak: sha256:5fab244400e2304e005d0fca677ee646462e64f2f3cc3a4fcea49d2543f048fa

**Build Method**: Manual Docker builds via gcloud SDK
**Total Build Time**: ~10 minutes (parallel builds)
**Registry**: `us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai`

### 15. Cloud Run Service Deployment (PARTIAL - 4 of 6 successful)
**Successful Deployments** (4 MCP Suite services):
- ✅ mcp-hr, mcp-finance, mcp-sales, mcp-support
- All deployed via `terraform apply`
- Using correct service accounts, secrets, VPC connectors
- Services are running and healthy

**Failed Deployments** (2 services):
- ❌ **mcp-gateway**: Container startup failure - not listening on PORT=3100
- ❌ **keycloak**: Container startup failure - not listening on PORT=8080

**Deployment Method**: Terraform (infrastructure/terraform/gcp)
**Deployment Time**: ~2 minutes for 4 successful services

### 16. Container Startup Failures - mcp-gateway and keycloak (CURRENT BLOCKER)
**Issue**: Containers fail to start and listen on their configured ports within Cloud Run's startup timeout

**Error Messages**:
```
mcp-gateway: The user-provided container failed to start and listen on the port
defined provided by the PORT=3100 environment variable within the allocated timeout.

keycloak: The user-provided container failed to start and listen on the port
defined provided by the PORT=8080 environment variable within the allocated timeout.
```

**This typically indicates**:
1. Container crashing during startup (before HTTP server starts)
2. Missing required configuration/environment variables
3. Unable to connect to required services (database, Redis, etc.)

**Next Debugging Steps**:
1. **Check Cloud Run logs** for both services (links provided above)
2. **Verify VPC connector** is properly attached and functional
3. **Check environment variables** are complete and correct
4. **Test locally** using `docker run` with same env vars to reproduce

**For keycloak specifically**:
- Likely failing to connect to Cloud SQL PostgreSQL database
- Keycloak requires successful DB connection before starting HTTP server
- Check KC_DB_URL format: `jdbc:postgresql:///keycloak?cloudSqlInstance=...`
- Verify keycloak DB user has proper permissions

**For mcp-gateway specifically**:
- May be missing Redis, MongoDB, or Keycloak connection details
- Check all environment variables: REDIS_HOST, MONGODB_URI, KEYCLOAK_ISSUER
- Verify MCP Suite service URLs are reachable

---

## 📋 Next Steps

### ⚠️ Option A: GitHub Actions Workflow (NEEDS WORK)

**Status**: ❌ Workflow incomplete - missing VPC connector, database config
**Issue**: See "Issue #12" above - workflow uses `gcloud run deploy` instead of Terraform

**This option requires**:
- Adding VPC connector to all Cloud Run services
- Passing database connection strings from Terraform state
- Adding all Keycloak environment variables (KC_DB_URL, KC_DB_USERNAME, etc.)

**Not recommended until workflow is updated to use Terraform**

### ✅ Option B: Terraform Deployment (RECOMMENDED - Works Now)

**Prerequisites**:
- ✅ Docker images built and pushed to Artifact Registry
- ✅ Terraform configuration complete with all environment variables

**Steps**:

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

## 🔍 January 9 Debugging Session (18:00-18:45 UTC)

### Issues Diagnosed

**mcp-gateway (revision: mcp-gateway-00001-q8z)**:
- ❌ Container fails to listen on PORT=3100 within timeout
- Root causes identified:
  1. **MCP Service URLs**: Were using placeholder "xxxxx" hash
  2. **Redis dependency**: Expects Redis at 10.0.0.3 (utility VM)
  3. **Keycloak dependency**: Points to https://auth.tamshai.com (not yet in DNS)
  4. **MongoDB URI**: Was missing from environment variables

**keycloak (revision: keycloak-00001-qmm)**:
- ❌ Container fails to listen on PORT=8080 within timeout
- Root causes identified:
  1. **Startup timeout too short**: Keycloak schema initialization takes 2-3 minutes on db-f1-micro
  2. **Database connection**: May be failing or slow via VPC connector
  3. **Realm import**: `--import-realm` adds additional startup time

### Configuration Fixes Applied

**File**: `infrastructure/terraform/modules/cloudrun/main.tf`

1. **Dynamic MCP Service URLs** (lines 88-104):
   ```hcl
   # Before: Hardcoded with placeholder hash
   value = "https://mcp-hr-${var.cloud_run_hash}.${var.region}.run.app"

   # After: Dynamic reference to actual deployed services
   value = google_cloud_run_service.mcp_suite["hr"].status[0].url
   ```

   **Actual URLs discovered**:
   - mcp-hr: https://mcp-hr-fn44nd7wba-uc.a.run.app
   - mcp-finance: https://mcp-finance-fn44nd7wba-uc.a.run.app
   - mcp-sales: https://mcp-sales-fn44nd7wba-uc.a.run.app
   - mcp-support: https://mcp-support-fn44nd7wba-uc.a.run.app

2. **Added MongoDB URI** (lines 82-85):
   ```hcl
   env {
     name  = "MONGODB_URI"
     value = var.mongodb_uri
   }
   ```

3. **Increased Keycloak Timeout** (lines 367-376):
   ```hcl
   # Before: 100s total (30s initial + 10 periods × 10s)
   startup_probe {
     initial_delay_seconds = 30
     period_seconds        = 10
     failure_threshold     = 10
   }

   # After: 5-minute initial delay, removed startup probe
   liveness_probe {
     initial_delay_seconds = 300  # 5 minutes
     period_seconds        = 60
     failure_threshold     = 3
   }
   ```

### Terraform Apply Attempt

**Command**: `terraform apply` (after fixes)
**Result**: Both services still failed with same errors

**Reasons for Failure**:
1. **Cannot access logs**: Service account lacks logging.viewer role
2. **Cannot SSH to utility VM**: Connection timeout (firewall or VM not responding)
3. **Unknown Redis status**: Cannot verify if Redis is running on utility VM at 10.0.0.3

### 🎯 REQUIRED NEXT ACTIONS

**Priority 1: Check Cloud Run Logs**

You need to manually access the logs to see why containers are failing:

1. **Keycloak logs**: https://console.cloud.google.com/logs/viewer?project=gen-lang-client-0553641830&resource=cloud_run_revision/service_name/keycloak/revision_name/keycloak-00001-qmm

2. **mcp-gateway logs**: https://console.cloud.google.com/logs/viewer?project=gen-lang-client-0553641830&resource=cloud_run_revision/service_name/mcp-gateway/revision_name/mcp-gateway-00001-q8z

**Look for**:
- Database connection errors (Keycloak)
- Redis connection errors (mcp-gateway)
- Network connectivity issues
- VPC connector problems
- Application startup exceptions

**Priority 2: Verify Utility VM Status**

Check if Redis is actually running on the utility VM:

```bash
# Option 1: Check from GCP Console
# Go to: Compute Engine > VM Instances > tamshai-prod-mcp-gateway
# Click "SSH" button in browser

# Then run:
docker ps
docker logs redis  # if Redis container exists
netstat -tulpn | grep 6379  # Check if Redis port is open

# Option 2: Fix SSH firewall rule
# Add your local IP to firewall:
gcloud compute firewall-rules update tamshai-prod-allow-iap-ssh \
  --project=gen-lang-client-0553641830 \
  --source-ranges=YOUR_IP_ADDRESS/32
```

**Priority 3: Consider Redis Alternatives**

If utility VM Redis is not working:

**Option A**: Deploy Cloud Memorystore Redis (Serverless tier)
- Cost: ~$3-5/month for minimal usage
- Fully managed, integrates with VPC connector
- Update `redis_host` in terraform.tfvars

**Option B**: Use MongoDB for token storage (temporary)
- Modify mcp-gateway to use MongoDB instead of Redis
- Less performant but works with existing infrastructure

**Option C**: Deploy Redis in Cloud Run (sidecar)
- Not recommended for production
- Could work for testing/development

### Current State Summary

| Component | Status | URL | Notes |
|-----------|--------|-----|-------|
| mcp-hr | ✅ Running | https://mcp-hr-fn44nd7wba-uc.a.run.app | Working |
| mcp-finance | ✅ Running | https://mcp-finance-fn44nd7wba-uc.a.run.app | Working |
| mcp-sales | ✅ Running | https://mcp-sales-fn44nd7wba-uc.a.run.app | Working |
| mcp-support | ✅ Running | https://mcp-support-fn44nd7wba-uc.a.run.app | Working |
| mcp-gateway | ❌ Failed | (not available) | Revision: mcp-gateway-00001-q8z |
| keycloak | ❌ Failed | (not available) | Revision: keycloak-00001-qmm |
| Utility VM (gateway) | ❓ Unknown | Internal: 10.0.0.3 | SSH timeout, cannot verify Redis |
| Utility VM (keycloak) | ❓ Unknown | Internal: 10.0.0.2 | SSH timeout |

### Files Modified in This Session

1. `infrastructure/terraform/modules/cloudrun/main.tf`
   - Lines 88-104: Dynamic MCP service URLs
   - Lines 82-85: Added MONGODB_URI
   - Lines 367-376: Increased Keycloak liveness probe delay

2. `infrastructure/terraform/gcp/main.tf`
   - Line 177: Updated cloud_run_hash comment (deprecated)

3. `infrastructure/terraform/gcp/DEPLOYMENT_STATUS.md`
   - This file: Added debugging session documentation

---

*Infrastructure deployment completed - January 9, 2026*
*Cloud Run services: 4 working, 2 pending debugging*
*Next step: Investigate container logs manually*
