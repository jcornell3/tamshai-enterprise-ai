# Phoenix Rebuild v3 - Manual Actions Log

**Date**: January 19, 2026
**Operator**: Claude-Dev (Tamshai-Dev)
**Environment**: GCP Production
**Purpose**: Full Phoenix rebuild following runbook v2.2.0
**Previous Rebuild**: v2 (same day, earlier session)

## Pre-Rebuild Checklist

- [ ] All workflows passed after pushing fixes
- [ ] Backup production data (if needed)
- [ ] Notify stakeholders

## Timeline

| Time (UTC) | Phase | Action | Result |
|------------|-------|--------|--------|
| 19:16:01 | 1 | Pre-flight checks | PASS |
| 19:17:24 | 2 | Secret verification | PASS |
| 19:17:59 | 3 | Pre-destroy cleanup | PASS |
| 19:20:05 | 4 | Terraform destroy | PASS (manual fixes) |
| 19:31:08 | 5 | Post-destroy verification | PASS |
| 19:33:00 | 6 | Terraform apply (infra) | PASS (manual fixes) |
| 19:57:54 | 7 | Build container images | PASS (manual fixes) |
| 20:21:30 | 8 | Regenerate SA key | PASS |
| 20:22:00 | 9 | Terraform Cloud Run | PASS (manual fixes) |
| 20:50:00 | 10 | Deploy via GitHub Actions | SKIPPED |
| 21:05:00 | 11 | Configure TOTP | PASS (pre-configured) |
| 21:10:00 | 12 | Verification | PASS |

---

## Phase 1: Pre-flight Checks

**Start Time**: 2026-01-19T19:16:01Z

```bash
# Commands executed:
gcloud auth list
terraform --version
gh auth status
gcloud config get-value project
gcloud secrets list --format="value(name)" | grep -E "^(tamshai-prod-|mcp-hr-service)"
gcloud run services list --region=us-central1
gcloud sql instances list
```

**Result**: PASS

**Findings**:
- gcloud: Authenticated as claude-deployer@gen-lang-client-0553641830.iam.gserviceaccount.com
- terraform: v1.14.3
- gh: Logged in as jcornell3
- Project: gen-lang-client-0553641830
- GCP secrets: 8 secrets found (all required secrets present)
- Cloud Run: 7 services running (keycloak, mcp-finance, mcp-gateway, mcp-hr, mcp-sales, mcp-support, web-portal)
- Cloud SQL: tamshai-prod-postgres (RUNNABLE)

**Manual Actions Required**: None

---

## Phase 2: Secret Verification

**Start Time**: 2026-01-19T19:17:24Z

```bash
# Commands executed:
# Check all secrets have versions
for secret in tamshai-prod-anthropic-api-key tamshai-prod-db-password \
  tamshai-prod-keycloak-admin-password tamshai-prod-keycloak-db-password \
  tamshai-prod-mongodb-uri mcp-hr-service-client-secret; do
  gcloud secrets versions list "$secret" --limit=1
done

# Check for trailing whitespace (Issue #25)
for secret in tamshai-prod-keycloak-admin-password tamshai-prod-db-password mcp-hr-service-client-secret; do
  gcloud secrets versions access latest --secret="$secret" | xxd | tail -1
done
```

**Result**: PASS

**Findings**:
- tamshai-prod-anthropic-api-key: 1 version
- tamshai-prod-db-password: 1 version
- tamshai-prod-keycloak-admin-password: 1 version
- tamshai-prod-keycloak-db-password: 1 version
- tamshai-prod-mongodb-uri: 2 versions
- mcp-hr-service-client-secret: 1 version
- All secrets pass hygiene check (no trailing whitespace)

**Manual Actions Required**: None

---

## Phase 3: Pre-Destroy Cleanup

**Start Time**: 2026-01-19T19:17:59Z

```bash
# Commands executed:
# Delete Cloud Run job
gcloud run jobs delete provision-users --region=us-central1 --quiet
# Result: Deleted job [provision-users]

# Gap #38: Delete Cloud Run services BEFORE terraform destroy
for svc in keycloak mcp-gateway mcp-hr mcp-finance mcp-sales mcp-support web-portal; do
  gcloud run services delete "$svc" --region=us-central1 --quiet
done
# Result: All 7 services deleted

# Wait for connections to close
sleep 10

# Disable Cloud SQL deletion protection
gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection --quiet
# Result: deletionProtectionEnabled set to false
```

**Result**: PASS

**Findings**:
- provision-users job: Deleted
- keycloak: Deleted
- mcp-gateway: Deleted
- mcp-hr: Deleted
- mcp-finance: Deleted
- mcp-sales: Deleted
- mcp-support: Deleted
- web-portal: Deleted
- Cloud SQL deletion protection: Disabled

**Manual Actions Required**: None (Gap #38 fix worked as expected)

---

## Phase 4: Terraform Destroy

**Start Time**: 2026-01-19T19:20:05Z

```bash
cd infrastructure/terraform/gcp
terraform destroy -auto-approve
```

**Result**: PASS (after manual fixes)

**Initial Errors** (2 errors, same as v2):
1. `Error: failed to delete user keycloak: role "keycloak" cannot be dropped because some objects depend on it`
   - **Gap #40**: Keycloak user has dependent objects in PostgreSQL
2. `Error: trying to delete bucket prod.tamshai.com without force_destroy set to true`
   - **Gap #39**: Storage bucket force_destroy not enabled

**Manual Actions Required**:

**Gap #39 Fix - Storage Bucket**:
```bash
# Empty bucket contents
gcloud storage rm -r "gs://prod.tamshai.com/**"
# Result: 28 objects removed

# Bucket was deleted as part of the rm operation
```

**Gap #40 Fix - Cloud SQL Instance**:
```bash
# Delete Cloud SQL instance to remove keycloak user dependencies
gcloud sql instances delete tamshai-prod-postgres --quiet
# Result: Deleted in ~30 seconds
```

**State Cleanup**:
```bash
# Remove stale state entries
terraform state rm 'module.database.google_sql_user.keycloak_user'
terraform state rm 'module.database.google_sql_database_instance.postgres'
terraform state rm 'module.storage.google_storage_bucket.static_website[0]'
```

**Second terraform destroy attempt - Errors**:
- `Error: Unable to remove Service Networking Connection` - Gap #23
- VPC blocked by service networking

**Gap #23 Fix - Service Networking**:
```bash
terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection'
terraform state rm 'module.database.google_compute_global_address.private_ip_range'
```

**Third terraform destroy attempt - Errors**:
- VPC blocked by orphaned private IP address (Gap #24)

**Gap #24 Fix - Orphaned Private IP**:
```bash
gcloud compute addresses delete tamshai-prod-private-ip --global --quiet
# Result: Deleted successfully
```

**Fourth terraform destroy attempt - Errors**:
- `Error: Invalid count argument` - vpc_connector_id dependency (Gap #25)

**Gap #25 Fix - Targeted Destroy**:
```bash
terraform destroy -target=module.networking.google_compute_network.vpc -auto-approve
# Result: VPC destroyed successfully
```

**Total Destroy Duration**: ~11 minutes (with manual interventions)

**Gaps Encountered**:
| Gap # | Issue | Resolution |
|-------|-------|------------|
| #39 | Storage bucket force_destroy=false | Emptied and deleted bucket manually |
| #40 | Keycloak user has dependencies | Deleted Cloud SQL instance manually |
| #23 | Service networking blocks VPC | Removed from terraform state |
| #24 | Orphaned private IP blocks VPC | Deleted manually with gcloud |
| #25 | vpc_connector_id count dependency | Used targeted destroy |

---

## Phase 5: Post-Destroy Verification

**Start Time**: 2026-01-19T19:31:08Z

```bash
# Verify all resources are destroyed
gcloud run services list --region=us-central1 --format="value(name)" | wc -l  # 0
gcloud sql instances list --format="value(name)" | wc -l  # 0
gcloud compute networks list --format="value(name)" | grep -c tamshai  # 0
```

**Result**: PASS

**Findings**:
- Cloud Run services: 0 (all deleted)
- Cloud Run jobs: 0 (provision-users deleted)
- Cloud SQL instances: 0 (tamshai-prod-postgres deleted)
- VPC networks: 0 (tamshai-prod-vpc deleted)
- Private IP addresses: 0 (tamshai-prod-private-ip deleted)

**Manual Actions Required**: None

---

## Phase 6: Terraform Infrastructure Apply

**Start Time**: 2026-01-19T19:33:00Z

```bash
cd infrastructure/terraform/gcp
terraform init -upgrade
terraform apply -target=module.networking -auto-approve
terraform apply -auto-approve
```

**Result**: PASS (after manual fixes)

**Initial Errors**:
1. `Error: instanceAlreadyExists` - Cloud SQL instance created but not in state
2. `Error: Image not found` - Container images not built yet (expected at this phase)

**Gap #44 - Cloud SQL State Mismatch**:
Cloud SQL instance was created but terraform didn't track it in state due to timeout during PENDING_CREATE.

**Manual Actions Required**:

**Gap #44 Fix - Import Cloud SQL Instance**:
```bash
# Cloud SQL was in PENDING_CREATE state for ~15 minutes (normal for first creation)
# After it became RUNNABLE, imported into terraform state:
terraform import 'module.database.google_sql_database_instance.postgres' \
  'projects/gen-lang-client-0553641830/instances/tamshai-prod-postgres'
# Result: Import successful
```

**Gap #41 Fix - mcp-hr-service-client-secret Version Missing**:
```bash
# Secret existed but had no version (from previous destroy)
openssl rand -base64 32 | gcloud secrets versions add mcp-hr-service-client-secret --data-file=-
# Result: Created version 2
```

**Findings**:
- VPC created successfully
- Cloud SQL created (RUNNABLE after ~15 minutes)
- Artifact Registry created
- Storage buckets created
- Service accounts created
- IAM bindings configured

**Gaps Encountered**:
| Gap # | Issue | Resolution |
|-------|-------|------------|
| #41 | mcp-hr-service-client-secret missing version | Added version manually |
| #44 | Cloud SQL instance state mismatch | Imported into terraform state |

---

## Phase 7: Build Container Images

**Start Time**: 2026-01-19T19:57:54Z

```bash
PROJECT_ID="gen-lang-client-0553641830"
REGION="us-central1"

# Build all services using Cloud Build
gcloud builds submit services/mcp-gateway --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-gateway:latest
gcloud builds submit services/mcp-hr --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-hr:latest
gcloud builds submit services/mcp-finance --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-finance:latest
gcloud builds submit services/mcp-sales --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-sales:latest
gcloud builds submit services/mcp-support --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/mcp-support:latest
gcloud builds submit keycloak --tag=${REGION}-docker.pkg.dev/${PROJECT_ID}/tamshai/keycloak:v2.0.0-postgres
gcloud builds submit clients/web --config=/tmp/cloudbuild-web.yaml
```

**Result**: PASS (after manual fixes)

**Initial Errors**:
1. Keycloak build failed 2x with `COPY --chmod=755` BuildKit syntax
2. web-portal build failed - no Dockerfile in clients/web directory

**Gap #45 - Keycloak Dockerfile BuildKit Syntax**:
The `COPY --chmod=755` syntax requires Docker BuildKit which is not enabled by default in Cloud Build.

**Manual Actions Required**:

**Gap #45 Fix - Keycloak BuildKit Compatibility**:
```bash
# Created Dockerfile.cloudbuild without --chmod flag:
# Changed: COPY --chmod=755 scripts/ /opt/keycloak/scripts/
# To:     COPY scripts/ /opt/keycloak/scripts/
#         USER root
#         RUN chmod -R 755 /opt/keycloak/scripts/
#         USER keycloak

# Rebuilt with compatible Dockerfile
mv keycloak/Dockerfile keycloak/Dockerfile.original
mv keycloak/Dockerfile.cloudbuild keycloak/Dockerfile
gcloud builds submit keycloak --tag=...
mv keycloak/Dockerfile keycloak/Dockerfile.cloudbuild
mv keycloak/Dockerfile.original keycloak/Dockerfile
# Result: Build successful
```

**Gap #46 Fix - web-portal Dockerfile Path**:
```bash
# Dockerfile.prod is at clients/web/Dockerfile.prod and expects to be built from repo root
# Created cloudbuild.yaml to specify the correct Dockerfile path:
cat > /tmp/cloudbuild-web.yaml << 'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_IMAGE}', '-f', 'clients/web/Dockerfile.prod', '.']
images:
  - '${_IMAGE}'
substitutions:
  _IMAGE: us-central1-docker.pkg.dev/gen-lang-client-0553641830/tamshai/web-portal:latest
EOF
gcloud builds submit . --config=/tmp/cloudbuild-web.yaml
# Result: Build successful
```

**Images Built**:
| Image | Tag | Status |
|-------|-----|--------|
| mcp-gateway | latest | SUCCESS |
| mcp-hr | latest | SUCCESS |
| mcp-finance | latest | SUCCESS |
| mcp-sales | latest | SUCCESS |
| mcp-support | latest | SUCCESS |
| keycloak | v2.0.0-postgres | SUCCESS |
| web-portal | latest | SUCCESS |

**Gaps Encountered**:
| Gap # | Issue | Resolution |
|-------|-------|------------|
| #45 | Keycloak Dockerfile uses BuildKit --chmod | Created compatible Dockerfile |
| #46 | web-portal Dockerfile path incorrect | Created cloudbuild.yaml |

---

## Phase 8: Regenerate Service Account Key

**Start Time**: 2026-01-19T20:21:30Z

```bash
PROJECT_ID="gen-lang-client-0553641830"
SA_EMAIL="tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts keys create /tmp/gcp-key.json --iam-account=$SA_EMAIL
gh secret set GCP_SA_KEY_PROD < /tmp/gcp-key.json
rm /tmp/gcp-key.json
```

**Result**: PASS

**Findings**:
- Created new key ID: e2e960471657afb6047a6ac2cd76c7a2d16dae36
- Updated GitHub secret GCP_SA_KEY_PROD
- Temporary key file removed

**Manual Actions Required**: None

---

## Phase 9: Terraform Cloud Run

**Start Time**: 2026-01-19T20:22:00Z

```bash
cd infrastructure/terraform/gcp
terraform apply -auto-approve
```

**Result**: PASS (manual fixes required, domain mapping still provisioning SSL)

**Initial Errors**:
1. `Permission denied on secret: tamshai-prod-mongodb-uri` - MCP services can't access MongoDB URI secret
2. `Resource 'auth.tamshai.com' already exists` - Domain mapping already exists

**Gap #47 - MongoDB URI Secret Access Missing**:
Service account `tamshai-prod-mcp-gateway` doesn't have access to the MongoDB URI secret after Phoenix rebuild.

**Manual Actions Required**:

**Gap #47 Fix - Grant Secret Access**:
```bash
PROJECT_ID="gen-lang-client-0553641830"
SA_EMAIL="tamshai-prod-mcp-gateway@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=${PROJECT_ID}
# Result: IAM policy updated
```

**Gap #48 - Domain Mapping Already Exists**:
The domain mapping for auth.tamshai.com already existed from a previous deployment, causing conflict.

**Note**: Domain mapping import failed due to null outputs from MCP services. Terraform apply will handle this after MCP services are recreated.

**Gaps Encountered**:
| Gap # | Issue | Resolution |
|-------|-------|------------|
| #47 | MongoDB URI secret access missing | Granted secretAccessor role |
| #48 | Domain mapping already exists | Will be handled by terraform refresh |

---

## Phase 10: Deploy via GitHub Actions

**Start Time**: 2026-01-19T20:50:00Z

**Result**: SKIPPED (terraform already deployed all services)

**Findings**:
All 7 Cloud Run services deployed and READY via terraform apply:
- keycloak: https://keycloak-1046947015464.us-central1.run.app
- mcp-gateway: https://mcp-gateway-1046947015464.us-central1.run.app
- mcp-hr: https://mcp-hr-1046947015464.us-central1.run.app
- mcp-finance: https://mcp-finance-1046947015464.us-central1.run.app
- mcp-sales: https://mcp-sales-1046947015464.us-central1.run.app
- mcp-support: https://mcp-support-1046947015464.us-central1.run.app
- web-portal: https://web-portal-1046947015464.us-central1.run.app

**Manual Actions Required**: None

---

## Phase 11: Configure TOTP

**Start Time**: 2026-01-19T21:05:00Z

```bash
# Verified TOTP configuration via Keycloak Admin API
KEYCLOAK_URL="https://keycloak-1046947015464.us-central1.run.app"
ADMIN_PASS=$(gcloud secrets versions access latest --secret=tamshai-prod-keycloak-admin-password)
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ADMIN_PASS', safe=''))")

# Get admin token
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/auth/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=$ENCODED_PASS&grant_type=password")

# Verified test-user.journey credentials
curl -s "$KEYCLOAK_URL/auth/admin/realms/tamshai-corp/users/4a18513c-0f47-4569-8c73-9a75753cfb9b/credentials" \
  -H "Authorization: Bearer $TOKEN"
```

**Result**: PASS (TOTP pre-configured from realm import)

**Findings**:
- test-user.journey user exists (ID: 4a18513c-0f47-4569-8c73-9a75753cfb9b)
- User has `totp: true` flag
- Password credential: argon2 hash (created 1768854344125)
- OTP credential: TOTP, 30s period, 6 digits, HmacSHA1 (created 1768854344258)
- Credentials imported from realm-export.json during Keycloak startup

**Note**: Realm name is `tamshai-corp` (not `tamshai`). URLs using `/auth/realms/tamshai` will return 404.

**Manual Actions Required**: None (TOTP was pre-configured in realm export)

---

## Phase 12: Verification

**Start Time**: 2026-01-19T21:06:00Z

```bash
# Verify Cloud Run services
gcloud run services list --region=us-central1

# Health checks
curl -s "https://mcp-gateway-1046947015464.us-central1.run.app/health"
curl -s "https://keycloak-1046947015464.us-central1.run.app/auth/realms/tamshai-corp/.well-known/openid-configuration"

# Custom domain check
curl -s -o /dev/null -w "HTTP: %{http_code}\n" "https://auth.tamshai.com/auth/realms/tamshai-corp"
```

**Result**: PASS

**Service Status** (all READY):
| Service | Status | URL |
|---------|--------|-----|
| keycloak | READY | https://keycloak-1046947015464.us-central1.run.app |
| mcp-gateway | READY | https://mcp-gateway-1046947015464.us-central1.run.app |
| mcp-hr | READY | https://mcp-hr-1046947015464.us-central1.run.app |
| mcp-finance | READY | https://mcp-finance-1046947015464.us-central1.run.app |
| mcp-sales | READY | https://mcp-sales-1046947015464.us-central1.run.app |
| mcp-support | READY | https://mcp-support-1046947015464.us-central1.run.app |
| web-portal | READY | https://web-portal-1046947015464.us-central1.run.app |

**Health Check Results**:
| Endpoint | HTTP | Notes |
|----------|------|-------|
| mcp-gateway /health | 200 | Healthy (token cache degraded - no Redis) |
| keycloak tamshai-corp realm | 200 | Realm responding |
| auth.tamshai.com (custom domain) | 200 | Custom domain working |
| prod.tamshai.com | 404 | Not configured (expected) |

**MCP Gateway Health Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-19T21:10:03.925Z",
  "version": "0.1.0",
  "components": {
    "tokenRevocationCache": {
      "status": "degraded",
      "cacheSize": 0,
      "consecutiveFailures": 2
    }
  }
}
```

**Keycloak OIDC Discovery**:
- Issuer: https://auth.tamshai.com/auth/realms/tamshai-corp
- Authorization endpoint: https://auth.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/auth

**Cloud SQL**: RUNNABLE (PostgreSQL 16)

**E2E Tests**: PASS (5/6 passed, 1 skipped - full login needs production credentials in CI/CD)

```bash
cd tests/e2e && set "TEST_ENV=prod" && npx playwright test login-journey --project=chromium

Running 6 tests using 6 workers

  ok 6 [chromium] › specs\login-journey.ui.spec.ts:507:7 › Portal SPA Rendering › should not have 404 errors for assets (3.8s)
  ok 5 [chromium] › specs\login-journey.ui.spec.ts:477:7 › Portal SPA Rendering › should load portal without JavaScript errors (3.8s)
  ok 3 [chromium] › specs\login-journey.ui.spec.ts:341:7 › Employee Login Journey › should display employee login page with SSO button (4.2s)
  ok 1 [chromium] › specs\login-journey.ui.spec.ts:357:7 › Employee Login Journey › should redirect to Keycloak when clicking SSO (4.6s)
  ok 2 [chromium] › specs\login-journey.ui.spec.ts:454:7 › Employee Login Journey › should handle invalid credentials gracefully (5.1s)
  -  4 [chromium] › Full login journey with credentials [SKIPPED - no local credentials]

  1 skipped
  5 passed (6.9s)
```

**Manual Actions Required**: None

---

## Summary

### New Gaps Found (v3) - ALL REMEDIATED

| # | Gap | Root Cause | Automation Fix | Status |
|---|-----|------------|----------------|--------|
| 41 | mcp-hr-service-client-secret missing version | Secret created without version | **Terraform now creates default version** in security module | ✅ FIXED |
| 44 | Cloud SQL instance state mismatch | Terraform lost track during long PENDING_CREATE | **Auto-import in Phase 4** if instance exists but not in state | ✅ FIXED |
| 45 | Keycloak Dockerfile BuildKit syntax | `COPY --chmod=755` requires BuildKit not in Cloud Build | **Phase 5 uses Dockerfile.cloudbuild** automatically | ✅ FIXED |
| 46 | web-portal Dockerfile path incorrect | Dockerfile.prod in clients/web expects repo root | **Phase 5 builds from repo root** with inline cloudbuild.yaml | ✅ FIXED |
| 47 | MongoDB URI secret access missing | SA IAM binding not recreated after destroy | **Terraform security module** now grants MCP Gateway access | ✅ FIXED |
| 48 | Domain mapping already exists | Domain mapping persists across destroys | **Phase 7 checks if exists** before creating | ✅ FIXED |

### Gaps Resolved (from v2)

| # | Gap | Status |
|---|-----|--------|
| 38 | Keycloak database locked | Implemented in phoenix-rebuild.sh |
| 39 | Storage bucket force_destroy | Added phoenix_mode variable |
| 42 | provision_users deletion protection | Set deletion_protection=false in Terraform |
| 43 | MCP servers missing MongoDB URI access | Added IAM binding in Terraform |

### Automation Score

**v3 Actual (before fixes)**:
- Total Phases: 12
- Phases with Manual Actions: 4 (Phases 4, 6, 7, 9)
- Phases Fully Automated: 7
- Automation Success Rate: **58%**

**v4 Expected (after fixes applied)**:
- Total Phases: 12
- Phases with Manual Actions: **0** (all gaps remediated)
- Phases Fully Automated: **11** (Phase 10 skipped)
- Automation Success Rate: **100%** (excluding skipped phases)

### Total Phoenix Rebuild Time

- **Start**: 2026-01-19T19:16:00Z
- **End**: 2026-01-19T21:10:00Z
- **Total Duration**: ~1 hour 54 minutes

### Key Findings

1. **Cloud SQL PENDING_CREATE timeout** (Gap #44): Terraform loses state during extended Cloud SQL creation (~15 min). Requires import afterward.

2. **BuildKit not enabled in Cloud Build** (Gap #45): `COPY --chmod=755` syntax fails. Need Dockerfile.cloudbuild without BuildKit-specific syntax.

3. **Secret IAM bindings not recreated** (Gap #47): After Phoenix rebuild, service account IAM bindings to secrets must be reapplied.

4. **Realm name is tamshai-corp**: Production realm is `tamshai-corp`, not `tamshai`. Important for OIDC configuration.

5. **Token revocation cache degraded**: MCP Gateway runs without Redis in GCP prod. Token revocation relies on JWT expiry.

---

### Why Phoenix v3 Took Longer Than v2

| Factor | v2 | v3 | Impact |
|--------|----|----|--------|
| Cloud SQL creation | Already existed | Fresh creation (~15 min) | +15 min |
| Image builds | Images existed | All 7 images rebuilt | +10 min |
| SSL wait (removed in automation) | N/A | Domain mapping SSL provisioning | +12 min |
| Manual gap fixes | Fewer gaps | 6 new gaps to fix | +15 min |
| Debug time for admin login | N/A | URL encoding issue investigation | +5 min |

**Total additional time: ~57 minutes**

**Root Causes**:
1. **v2 was a partial rebuild** - some resources already existed from v1
2. **v3 was a true fresh rebuild** - all resources created from scratch
3. **SSL provisioning wait was unnecessary** - Cloudflare handles SSL at the edge
4. **Manual intervention for gaps** - automation not yet handling all known issues

---

### Automation Improvements Made (Post-v3)

The following improvements were made to `scripts/gcp/phoenix-rebuild.sh` after this rebuild:

| Issue | Before | After |
|-------|--------|-------|
| Gap #39 (Storage bucket) | Reactive - fixed after destroy failed | **Proactive** - bucket emptied before destroy |
| Gap #40 (Cloud SQL keycloak user) | Reactive - manual fix | **Proactive** - instance deleted before destroy |
| Gap #23 (Service networking) | Reactive - after destroy failed | **Proactive** - state removed before destroy |
| Gap #24 (Orphaned private IP) | Reactive - after destroy failed | **Proactive** - IP deleted before destroy |
| Gap #41 (mcp-hr-service-client-secret) | Phase 4 (too late) | **Phase 2** - ensured BEFORE any terraform |
| Gap #45 (Keycloak BuildKit) | Manual Dockerfile switch | **Automatic** - uses Dockerfile.cloudbuild |
| Gap #46 (web-portal Dockerfile path) | Manual cloudbuild.yaml | **Automatic** - builds from repo root with -f |
| SSL provisioning wait | 5+ minute wait | **Removed** - Cloudflare handles SSL |

---

### Cloudflare SSL Configuration Note

**Why Cloud Run domain mapping creates SSL certificates:**
- Cloud Run domain mappings require verified DNS and provision Google-managed SSL certs
- This is independent of Cloudflare's SSL termination

**Why we don't need to wait for Cloud Run SSL:**
- `auth.tamshai.com` DNS points to Cloudflare (proxied)
- Cloudflare terminates SSL from clients using its own certificate
- Cloudflare connects to Cloud Run via `ghs.googlehosted.com` CNAME
- Cloud Run's SSL cert is only for the Cloudflare→Cloud Run leg
- Cloudflare "Full (Strict)" mode works with origin certificates

**Result:** No need to wait for Cloud Run SSL provisioning - saves 10+ minutes per rebuild.

---

*Log completed: 2026-01-19T21:10:00Z*
