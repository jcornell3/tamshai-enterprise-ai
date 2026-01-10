# GCP Production Issues & Fix Plan

**Last Updated**: 2026-01-10 01:41 UTC
**Status**: Production deployment blocked since Jan 9
**Workaround**: Using VPS staging (vps.tamshai.com) - **4/4 E2E tests passing** ✅

---

## Current Status

### ✅ Working
- **VPS Staging**: Fully operational
  - URL: https://vps.tamshai.com
  - Keycloak: https://vps.tamshai.com/auth
  - E2E tests: 4/4 passing
  - MCP Gateway: Running
  - All MCP Suite services: Running

### ✅ GCP Infrastructure Deployed (52/60 resources)
- VPC, Cloud NAT, VPC Connector
- Cloud SQL PostgreSQL (3 databases)
- Secret Manager (6 secrets including Claude API key)
- Artifact Registry
- MCP Suite Cloud Run services (hr, finance, sales, support) - **All running**

### ❌ GCP Cloud Run Services Failing (2 services)
- **mcp-gateway**: Container startup failure
- **keycloak**: Container startup failure

**Error**: "The user-provided container failed the configured startup probe checks"

---

## Root Cause Analysis

### Issue #1: Missing Environment Variables

**Problem**: Gateway and Keycloak Cloud Run services missing required env vars

**Current Configuration** (.github/workflows/deploy-to-gcp.yml):
```yaml
# MCP Gateway (lines 87-101)
--set-secrets=CLAUDE_API_KEY=tamshai-prod-anthropic-api-key:latest
--set-env-vars=NODE_ENV=production
```

**Missing Environment Variables**:
```bash
# Keycloak Configuration (CRITICAL)
KEYCLOAK_URL=https://keycloak-[CLOUD_RUN_URL]/auth
KEYCLOAK_ISSUER=https://keycloak-[CLOUD_RUN_URL]/auth/realms/tamshai-corp
JWKS_URI=https://keycloak-[CLOUD_RUN_URL]/auth/realms/tamshai-corp/protocol/openid-connect/certs

# Redis Configuration
REDIS_HOST=[MEMORYSTORE_IP or use fail-open mode]
REDIS_PORT=6379

# MCP Suite URLs
MCP_HR_URL=https://mcp-hr-[CLOUD_RUN_URL]
MCP_FINANCE_URL=https://mcp-finance-[CLOUD_RUN_URL]
MCP_SALES_URL=https://mcp-sales-[CLOUD_RUN_URL]
MCP_SUPPORT_URL=https://mcp-support-[CLOUD_RUN_URL]

# Database (if needed - currently not used by gateway)
POSTGRES_HOST=[CLOUD_SQL_IP]
POSTGRES_DB=tamshai_hr
POSTGRES_USER=tamshai
POSTGRES_PASSWORD=[from Secret Manager]
```

### Issue #2: Keycloak Configuration

**Problem**: Keycloak needs Cloud SQL connection + realm import

**Missing Configuration**:
```yaml
# Keycloak environment variables
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://[CLOUD_SQL_IP]:5432/keycloak
KC_DB_USERNAME=keycloak
KC_DB_PASSWORD=[from Secret Manager: tamshai-prod-keycloak-db-password]
KC_HOSTNAME=https://keycloak-[CLOUD_RUN_URL]
KC_PROXY=edge
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=[from Secret Manager: tamshai-prod-keycloak-admin-password]
```

**VPC Connector**: Needed for Cloud SQL private IP access
```yaml
--vpc-connector=tamshai-prod-connector
--vpc-egress=private-ranges-only
```

### Issue #3: Cloud Run Service URLs (Chicken-and-Egg)

**Problem**: Services need each other's URLs, but URLs aren't known until deployed

**Solution**: Deploy in phases
1. Deploy Keycloak first (with placeholder gateway URL)
2. Get Keycloak URL
3. Deploy Gateway (with actual Keycloak URL)
4. Update Keycloak config with actual Gateway URL

---

## Fix Plan

### Phase 1: Get Cloud SQL Private IP
```bash
# In GCP Console or gcloud CLI
gcloud sql instances describe tamshai-prod-db \
  --project=gen-lang-client-0553641830 \
  --format="get(ipAddresses[0].ipAddress)"
```

### Phase 2: Deploy Keycloak with Full Config

**Update `.github/workflows/deploy-to-gcp.yml` (lines 191-207)**:
```yaml
- name: Deploy to Cloud Run
  run: |
    # Get Cloud SQL IP
    CLOUDSQL_IP=$(gcloud sql instances describe tamshai-prod-db \
      --format="get(ipAddresses[0].ipAddress)")

    gcloud run deploy keycloak \
      --image=${{ env.AR_REPO }}/keycloak:${{ github.sha }} \
      --region=${{ env.GCP_REGION }} \
      --platform=managed \
      --service-account=tamshai-prod-keycloak@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
      --allow-unauthenticated \
      --min-instances=0 \
      --max-instances=4 \
      --memory=1Gi \
      --cpu=1 \
      --timeout=600 \
      --vpc-connector=tamshai-prod-connector \
      --vpc-egress=private-ranges-only \
      --set-secrets=KEYCLOAK_ADMIN_PASSWORD=tamshai-prod-keycloak-admin-password:latest,KC_DB_PASSWORD=tamshai-prod-keycloak-db-password:latest \
      --set-env-vars="KEYCLOAK_ADMIN=admin,KC_DB=postgres,KC_DB_URL=jdbc:postgresql://${CLOUDSQL_IP}:5432/keycloak,KC_DB_USERNAME=keycloak,KC_PROXY=edge,KC_HTTP_PORT=8080"
```

**Note**: KC_HOSTNAME will be set after getting Keycloak URL

### Phase 3: Get Keycloak URL and Deploy Gateway

**Update `.github/workflows/deploy-to-gcp.yml` (lines 87-101)**:
```yaml
- name: Deploy to Cloud Run
  run: |
    # Get Keycloak URL (deployed in previous job)
    KEYCLOAK_URL=$(gcloud run services describe keycloak \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")

    # Get MCP Suite URLs
    MCP_HR_URL=$(gcloud run services describe mcp-hr \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")
    MCP_FINANCE_URL=$(gcloud run services describe mcp-finance \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")
    MCP_SALES_URL=$(gcloud run services describe mcp-sales \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")
    MCP_SUPPORT_URL=$(gcloud run services describe mcp-support \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")

    gcloud run deploy mcp-gateway \
      --image=${{ env.AR_REPO }}/mcp-gateway:${{ github.sha }} \
      --region=${{ env.GCP_REGION }} \
      --platform=managed \
      --service-account=tamshai-prod-mcp-gateway@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
      --allow-unauthenticated \
      --min-instances=0 \
      --max-instances=2 \
      --memory=1Gi \
      --cpu=1 \
      --timeout=300 \
      --set-secrets=CLAUDE_API_KEY=tamshai-prod-anthropic-api-key:latest \
      --set-env-vars="NODE_ENV=production,KEYCLOAK_URL=${KEYCLOAK_URL}/auth,KEYCLOAK_ISSUER=${KEYCLOAK_URL}/auth/realms/tamshai-corp,JWKS_URI=${KEYCLOAK_URL}/auth/realms/tamshai-corp/protocol/openid-connect/certs,MCP_HR_URL=${MCP_HR_URL},MCP_FINANCE_URL=${MCP_FINANCE_URL},MCP_SALES_URL=${MCP_SALES_URL},MCP_SUPPORT_URL=${MCP_SUPPORT_URL},TOKEN_REVOCATION_FAIL_OPEN=true"
```

### Phase 4: Update Keycloak with Gateway URL

**Add to workflow after gateway deployment**:
```yaml
- name: Update Keycloak with Gateway URL
  run: |
    GATEWAY_URL=$(gcloud run services describe mcp-gateway \
      --region=${{ env.GCP_REGION }} \
      --format="get(status.url)")

    # Update Keycloak hostname
    gcloud run services update keycloak \
      --region=${{ env.GCP_REGION }} \
      --update-env-vars="KC_HOSTNAME=${GATEWAY_URL}"
```

### Phase 5: Run Realm Sync (Already Implemented)

The `sync-keycloak-realm` job is already in the workflow (lines 209-263).
Just ensure it runs after Keycloak is fully configured.

---

## Testing Plan

### 1. Local Verification
```bash
# Build gateway locally
cd services/mcp-gateway
npm run build

# Test container
docker build -t test-gateway .
docker run -p 3000:3000 \
  -e KEYCLOAK_URL=https://vps.tamshai.com/auth \
  -e CLAUDE_API_KEY=$CLAUDE_API_KEY \
  -e TOKEN_REVOCATION_FAIL_OPEN=true \
  test-gateway

# Should start without errors
curl http://localhost:3000/health
```

### 2. Deploy to GCP (Manual First)
```bash
# Set gcloud project
gcloud config set project gen-lang-client-0553641830

# Deploy Keycloak manually first
cd keycloak
gcloud run deploy keycloak \
  --image=us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/keycloak:latest \
  --region=us-central1 \
  --platform=managed \
  --service-account=tamshai-prod-keycloak@gen-lang-client-0553641830.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --vpc-connector=tamshai-prod-connector \
  --vpc-egress=private-ranges-only \
  --set-secrets=KEYCLOAK_ADMIN_PASSWORD=tamshai-prod-keycloak-admin-password:latest,KC_DB_PASSWORD=tamshai-prod-keycloak-db-password:latest \
  --set-env-vars="KEYCLOAK_ADMIN=admin,KC_DB=postgres,KC_DB_URL=jdbc:postgresql://[CLOUD_SQL_IP]:5432/keycloak,KC_DB_USERNAME=keycloak,KC_PROXY=edge"

# Get Keycloak URL
KEYCLOAK_URL=$(gcloud run services describe keycloak --region=us-central1 --format="get(status.url)")
echo "Keycloak URL: $KEYCLOAK_URL"

# Deploy Gateway manually
cd ../services/mcp-gateway
gcloud run deploy mcp-gateway \
  --image=us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/mcp-gateway:latest \
  --region=us-central1 \
  --platform=managed \
  --service-account=tamshai-prod-mcp-gateway@gen-lang-client-0553641830.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-secrets=CLAUDE_API_KEY=tamshai-prod-anthropic-api-key:latest \
  --set-env-vars="NODE_ENV=production,KEYCLOAK_URL=${KEYCLOAK_URL}/auth,TOKEN_REVOCATION_FAIL_OPEN=true"

# Check if it starts
gcloud run services describe mcp-gateway --region=us-central1
```

### 3. Run E2E Tests
```bash
# Update test script for GCP production URLs
export KEYCLOAK_URL="https://keycloak-[HASH]-uc.a.run.app/auth"
./scripts/test/journey-e2e-automated.sh prod
```

---

## Required Access

To implement this fix, you need:

1. **GCP Console Access**: https://console.cloud.google.com
   - Project: `gen-lang-client-0553641830`
   - Permissions: Cloud Run Admin, Secret Manager Accessor

2. **gcloud CLI** (already installed):
   ```bash
   # Authenticate
   gcloud auth activate-service-account \
     --key-file=infrastructure/terraform/gcp/gcp-sa-key.json

   # Set project
   gcloud config set project gen-lang-client-0553641830
   ```

3. **Cloud SQL IP Address**: Get from console or CLI
   ```bash
   gcloud sql instances describe tamshai-prod-db \
     --format="get(ipAddresses[0].ipAddress)"
   ```

---

## Estimated Timeline

- **Phase 1** (Get Cloud SQL IP): 5 minutes
- **Phase 2** (Deploy Keycloak): 10 minutes
- **Phase 3** (Deploy Gateway): 10 minutes
- **Phase 4** (Update configs): 5 minutes
- **Phase 5** (Test E2E): 10 minutes

**Total**: ~40 minutes (manual deployment)
**Automated**: Update workflow, trigger deployment (~20 minutes)

---

## Current Workaround

**Use VPS Staging for development and testing:**
- URL: https://vps.tamshai.com
- Keycloak: https://vps.tamshai.com/auth
- E2E Tests: `./scripts/test/journey-e2e-automated.sh stage`
- Status: **4/4 tests passing** ✅

---

## Admin Portal Status

**Admin Portal work is SAFE** - all code is on feature branch:
- Branch: `feature/admin-portal-wip`
- Status: Phase 1 implementation complete
- Blocker: Lazy initialization needed for production (see `services/mcp-gateway/TODO.md`)

**Next Steps for Admin Portal**:
1. Complete unit tests (21 failures to fix)
2. Implement lazy initialization in audit-logger.ts
3. Manual API testing
4. Merge to main once GCP production is fixed

---

**Last Updated**: 2026-01-10 01:41 UTC
**Next Action**: Fix GCP production environment variables (requires gcloud access)
