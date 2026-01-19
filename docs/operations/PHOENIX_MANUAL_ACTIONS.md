# Phoenix Rebuild - Manual Actions Documentation

This document records all manual interventions required during the Phoenix rebuild process on 2026-01-18/19.
These should be automated in the next iteration of `scripts/gcp/phoenix-rebuild.sh`.

## Pre-Destroy Actions

### 1. Force-unlock Terraform State (if stale lock exists)
```bash
cd infrastructure/terraform/gcp
terraform force-unlock -force <LOCK_ID>
```
**Automation**: Check for stale locks before destroy, auto-unlock if older than 1 hour.

## Post-Destroy Verification

### 1a. Verify All Resources Destroyed
After terraform destroy completes, verify no orphaned resources remain:
```bash
# Check Cloud Run services
gcloud run services list --region=us-central1 --format="value(name)" | grep -E "^(keycloak|mcp-|web-portal)" && echo "ERROR: Cloud Run services still exist"

# Check Cloud Run jobs
gcloud run jobs list --region=us-central1 --format="value(name)" | grep provision && echo "ERROR: Cloud Run jobs still exist"

# Check Cloud SQL instances
gcloud sql instances list --format="value(name)" | grep tamshai && echo "ERROR: Cloud SQL instance still exists"

# Check storage buckets (except terraform state)
gcloud storage buckets list --format="value(name)" | grep -E "tamshai-prod-(logs|finance|public)" && echo "WARNING: Storage buckets still exist"

# Check secrets
gcloud secrets list --format="value(name)" | grep -E "^(tamshai-prod-|mcp-hr-service)" && echo "WARNING: Secrets still exist"

# Check VPC and networking
gcloud compute networks list --format="value(name)" | grep tamshai && echo "ERROR: VPC still exists"
```
**Automation**: Script should fail if any critical resources (Cloud Run, Cloud SQL, VPC) still exist.

### 1b. Remove Stale Resources from Terraform State
If terraform state has references to resources that were deleted outside of terraform:
```bash
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["support"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.keycloak'
terraform state rm 'module.cloudrun.google_cloud_run_service.web_portal[0]'
```
**Rationale**: Stale state entries cause apply to fail when trying to update non-existent resources.

## Post-Destroy / Pre-Apply Actions

### 2. Delete Existing GCP Secrets
Secrets may persist from previous deployment if terraform destroy didn't clean them up.
```bash
for secret in \
  tamshai-prod-keycloak-admin-password \
  tamshai-prod-keycloak-db-password \
  tamshai-prod-db-password \
  tamshai-prod-anthropic-api-key \
  tamshai-prod-mcp-gateway-client-secret \
  tamshai-prod-jwt-secret \
  mcp-hr-service-client-secret \
  prod-user-password; do
  gcloud secrets delete "$secret" --quiet 2>/dev/null || true
done
```

### 3. Delete Cloud SQL Instance (if exists)
```bash
gcloud sql instances delete tamshai-prod-postgres --quiet
```

### 4. Delete Cloud Run Job (provision-users)
```bash
gcloud run jobs delete provision-users --region=us-central1 --quiet
```

### 5. Create/Verify Terraform State Bucket
```bash
gcloud storage buckets create gs://tamshai-terraform-state-prod \
  --location=US \
  --uniform-bucket-level-access \
  2>/dev/null || echo "Bucket already exists"
```

### 6. Disable Bootstrap State Bucket Terraform File
```bash
mv infrastructure/terraform/gcp/bootstrap-state-bucket.tf \
   infrastructure/terraform/gcp/bootstrap-state-bucket.tf.disabled
```
**Rationale**: The state bucket is a bootstrap resource that should persist. Managing it with Terraform causes circular dependency.

## During Terraform Apply

### 7. Staged Terraform Apply (vpc_connector_id dependency)
```bash
# Stage 1: Networking first
terraform apply -target=module.networking -auto-approve

# Stage 2: Full apply
terraform apply -auto-approve
```
**Root Cause**: `module.security.google_cloud_run_v2_job.provision_users` has a `count` that depends on `var.vpc_connector_id` which is unknown until networking is applied.

### 8. Add Secret Version to mcp-hr-service-client-secret
Terraform creates the secret but doesn't add a version.
```bash
printf "$(openssl rand -base64 32)" > /tmp/secret.txt
gcloud secrets versions add mcp-hr-service-client-secret --data-file=/tmp/secret.txt
rm /tmp/secret.txt
```

### 9. Import Existing Resources into Terraform State
If resources already exist, import them:
```bash
# Logs bucket
terraform import 'module.storage.google_storage_bucket.logs' \
  tamshai-prod-logs-${PROJECT_ID}

# Static website bucket (if needed)
terraform import 'module.storage.google_storage_bucket.static_website' \
  prod.tamshai.com
```

## Post-Terraform Apply

### 11. Delete Failed Cloud Run Services
If services were created with missing images:
```bash
for svc in keycloak mcp-finance mcp-hr mcp-sales mcp-support web-portal; do
  gcloud run services delete "$svc" --region=us-central1 --quiet 2>/dev/null || true
done
```

### 12. Regenerate CICD Service Account Key
After terraform recreates the service account, update GitHub secret:
```bash
gcloud iam service-accounts keys create /tmp/gcp-sa-key.json \
  --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com
gh secret set GCP_SA_KEY_PROD < /tmp/gcp-sa-key.json
rm /tmp/gcp-sa-key.json
```

### 13. Create Static Website Bucket
If not created by terraform:
```bash
gcloud storage buckets create gs://prod.tamshai.com \
  --location=US \
  --uniform-bucket-level-access
```

### 14. Add IAM Bindings for Secrets
If permissions are missing:
```bash
# MongoDB URI access for MCP servers
gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri \
  --member="serviceAccount:tamshai-prod-mcp-servers@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## CI/CD Workflow Fixes

### 15. PostgreSQL IP Discovery Fallback
The Cloud SQL private IP discovery fails in some jobs. Use fallback:
```yaml
# In deploy-to-gcp.yml, keycloak deploy step
POSTGRES_IP="${{ needs.discover-urls.outputs.postgres_ip }}"
if ! [[ "$POSTGRES_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  POSTGRES_IP="10.145.0.5"  # Fallback to known private IP
fi
```

## Terraform State Reconciliation (Added 2026-01-18)

These actions are needed when Cloud Run services exist in GCP but aren't in Terraform state.

### 16. Import Cloud Run Services into Terraform State
If terraform apply hangs creating services that already exist:
```bash
# Kill the stuck terraform apply
terraform force-unlock -force <LOCK_ID>

# Import each Cloud Run service
terraform import 'module.cloudrun.google_cloud_run_service.keycloak' \
  us-central1/keycloak
terraform import 'module.cloudrun.google_cloud_run_service.mcp_gateway' \
  us-central1/mcp-gateway
terraform import 'module.cloudrun.google_cloud_run_service.web_portal[0]' \
  us-central1/web-portal

# For MCP suite services, temporarily modify outputs.tf first (see #17)
terraform import 'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]' \
  us-central1/mcp-hr
terraform import 'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]' \
  us-central1/mcp-finance
terraform import 'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]' \
  us-central1/mcp-sales
terraform import 'module.cloudrun.google_cloud_run_service.mcp_suite["support"]' \
  us-central1/mcp-support
```

### 17. Temporary outputs.tf Modification for Sequential Imports
MCP suite imports fail because outputs reference all 4 services. Temporarily wrap with try():
```bash
# Edit infrastructure/terraform/modules/cloudrun/outputs.tf
# Change:
#   value = google_cloud_run_service.mcp_suite["hr"].status[0].url
# To:
#   value = try(google_cloud_run_service.mcp_suite["hr"].status[0].url, null)

# Apply to all 4 MCP service outputs and service_urls map
# After all imports complete, revert the changes
```
**Automation**: Create import script that temporarily patches outputs.tf.

### 18. Import Domain Mapping
If domain mapping already exists:
```bash
terraform import 'module.cloudrun.google_cloud_run_domain_mapping.keycloak[0]' \
  'locations/us-central1/namespaces/${PROJECT_ID}/domainmappings/auth.tamshai.com'
```

### 19. Import Storage Buckets
If storage buckets already exist (409 conflict):
```bash
terraform import 'module.storage.google_storage_bucket.finance_docs' \
  tamshai-prod-finance-docs-${PROJECT_ID}
terraform import 'module.storage.google_storage_bucket.public_docs' \
  tamshai-prod-public-docs-${PROJECT_ID}
terraform import 'module.storage.google_storage_bucket.static_website[0]' \
  prod.tamshai.com
```

### 20. Handle Storage Bucket Location Mismatch
If static_website bucket exists in different region (US vs US-CENTRAL1):
```bash
# Option 1: Add lifecycle ignore_changes (PERMANENT FIX - already applied)
# In infrastructure/terraform/modules/storage/main.tf, static_website resource:
lifecycle {
  ignore_changes = [location]
}

# Option 2: Remove from state and re-import (if lifecycle not working)
terraform state rm 'module.storage.google_storage_bucket.static_website[0]'
terraform import 'module.storage.google_storage_bucket.static_website[0]' \
  prod.tamshai.com
```
**Note**: The lifecycle fix is now permanent in the storage module.

## Summary of Root Causes

| Issue | Root Cause | Fix Priority |
|-------|------------|--------------|
| Stale terraform lock | Previous apply killed mid-process | High |
| Secrets already exist | terraform destroy doesn't delete secrets | High |
| vpc_connector_id count | Depends on unknown value at plan time | High |
| CICD key invalid | SA recreated, key regenerated | High |
| Missing secret versions | Terraform creates secret shell only | Medium |
| Cloud Run failed state | Missing images at deploy time | Medium |
| PostgreSQL IP discovery | Job doesn't have cloudsql.admin role | Low |
| Cloud Run state mismatch | Services exist in GCP but not in Terraform state | High |
| MCP suite import failures | Outputs reference all 4 services during partial import | Medium |
| Storage bucket location | Bucket in US but Terraform expects US-CENTRAL1 | Medium |

## Additional Gaps Found (2026-01-19 Phoenix Rebuild)

These gaps were discovered during a full Phoenix rebuild execution:

### Terraform Destroy Gaps

| # | Gap | Root Cause | Manual Action | Fix Priority |
|---|-----|------------|---------------|--------------|
| 21 | Cloud Run Job deletion_protection | Default enabled | `gcloud run jobs delete` | High |
| 22 | Cloud SQL deletion_protection | Must disable before delete | `gcloud sql instances patch --no-deletion-protection` | High |
| 23 | Service networking connection blocked | Cloud SQL references it | `terraform state rm` + wait for Cloud SQL deletion | High |
| 24 | Private IP address blocks VPC deletion | Persists after state rm | `gcloud compute addresses delete` | Medium |
| 25 | vpc_connector_id count dependency | Unknown at destroy time | Targeted destroy of VPC | Medium |

### Terraform Apply Gaps

| # | Gap | Root Cause | Manual Action | Fix Priority |
|---|-----|------------|---------------|--------------|
| 26 | mcp-hr-service-client-secret no version | Terraform creates empty secret | `gcloud secrets versions add` | High |
| 27 | Cloud Run services fail (no images) | Images must exist before apply | Delete services, run deploy workflow first | High |
| 28 | Static website bucket 409 conflict | Bucket persists from previous deploy | `terraform import` the bucket | Medium |
| 29 | Failed Cloud Run services block operations | Null status in outputs.tf | Delete services + state rm before import | High |

### Deploy Workflow Gaps

| # | Gap | Root Cause | Fix Applied | Fix Priority |
|---|-----|------------|-------------|--------------|
| 30 | Hardcoded PostgreSQL IP fallback stale | IP changes per rebuild | Dynamic gcloud query added | High |
| 31 | CICD SA missing cloudsql.viewer | Can't query Cloud SQL IP | Added role in Terraform | High |
| 32 | MongoDB URI secret IAM missing | mcp-servers can't access | Manual IAM binding added | High |
| 33 | Static website bucket IAM not applied | Import doesn't create IAM | terraform apply after import | Medium |
| 34 | Keycloak health check timeout | 60s too short for cold start | Increase timeout to 120s | Low |
| 35 | auth.tamshai.com Cloud Run domain mapping missing | Cloudflare DNS (auth.tamshai.com → ghs.googlehosted.com) persists, but GCP domain mapping that routes to keycloak service is destroyed | `gcloud beta run domain-mappings create --service=keycloak --domain=auth.tamshai.com --region=us-central1` | High |
| 36 | mcp-gateway can't start | Depends on auth.tamshai.com being routable | Create domain mapping before deploying gateway | Critical |
| 37 | CICD SA missing storage.buckets.get permission | `roles/storage.objectAdmin` doesn't include `storage.buckets.get` which `gcloud storage rsync` requires | Fixed in Terraform: Added `roles/storage.legacyBucketReader` to storage module IAM | High |

### Deployment Order Dependencies

Correct deployment order after Phoenix rebuild:
1. Terraform apply (networking module first, then full apply)
2. Create/regenerate CICD service account key → update GitHub secret
3. Create auth.tamshai.com domain mapping → keycloak
4. Wait for domain mapping to be routable (Cloudflare handles SSL)
5. Deploy Keycloak (must start first)
6. Deploy MCP services (hr, finance, sales, support)
7. Deploy mcp-gateway (depends on auth.tamshai.com being reachable)
8. Deploy web-portal
9. Sync Keycloak realm
10. Run E2E tests to verify

## Gap Resolution Plan by Stage

This section consolidates all gaps into actionable steps organized by Phoenix rebuild stage.

### Stage 1: Pre-Destroy

**Goal**: Prepare resources for clean destruction.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 1 | Check for and remove stale terraform locks | `terraform force-unlock -force <LOCK_ID>` (if lock > 1 hour old) |
| 21 | Disable Cloud Run Job deletion protection | `gcloud run jobs delete provision-users --region=us-central1 --quiet` |
| 22 | Disable Cloud SQL deletion protection | `gcloud sql instances patch tamshai-prod-postgres --no-deletion-protection` |

### Stage 2: During Destroy

**Goal**: Handle resources that block terraform destroy.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 23 | Remove service networking from state before Cloud SQL deletion completes | `terraform state rm 'module.database.google_service_networking_connection.private_vpc_connection'` |
| 24 | Delete orphaned private IP address | `gcloud compute addresses delete tamshai-prod-private-ip --global --quiet` |
| 25 | Use targeted destroy for VPC when vpc_connector_id count fails | `terraform destroy -target=module.networking.google_compute_network.vpc` |

### Stage 3: Post-Destroy Verification

**Goal**: Verify clean slate before apply. Fail-fast if resources remain.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 1a | Verify no orphaned Cloud Run services | `gcloud run services list --region=us-central1 --format="value(name)" \| grep -E "^(keycloak\|mcp-\|web-portal)"` |
| 1a | Verify no orphaned Cloud SQL | `gcloud sql instances list --format="value(name)" \| grep tamshai` |
| 1a | Verify no orphaned VPC | `gcloud compute networks list --format="value(name)" \| grep tamshai` |
| 1b | Remove stale Cloud Run entries from terraform state | `terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]'` (repeat for each) |
| 2 | Delete persisted secrets | Loop through secrets with `gcloud secrets delete "$secret" --quiet` |
| 3 | Delete Cloud SQL if still exists | `gcloud sql instances delete tamshai-prod-postgres --quiet` |
| 4 | Delete Cloud Run job if still exists | `gcloud run jobs delete provision-users --region=us-central1 --quiet` |

### Stage 4: Pre-Apply

**Goal**: Prepare for terraform apply.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 5 | Ensure terraform state bucket exists | `gcloud storage buckets create gs://tamshai-terraform-state-prod --location=US --uniform-bucket-level-access` |
| 6 | Disable bootstrap state bucket file | `mv infrastructure/terraform/gcp/bootstrap-state-bucket.tf infrastructure/terraform/gcp/bootstrap-state-bucket.tf.disabled` |

### Stage 5: During Apply

**Goal**: Handle terraform apply issues.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 7, 25 | Staged apply: networking first | `terraform apply -target=module.networking -auto-approve && terraform apply -auto-approve` |
| 8, 26 | Add version to mcp-hr-service-client-secret | `openssl rand -base64 32 \| gcloud secrets versions add mcp-hr-service-client-secret --data-file=-` |
| 9, 28 | Import existing storage buckets (409 conflict) | `terraform import 'module.storage.google_storage_bucket.static_website[0]' prod.tamshai.com` |
| 17 | Temporarily wrap outputs.tf with try() for imports | Edit outputs.tf, add `try(..., null)` wrappers, import, then revert |
| 20 | Handle bucket location mismatch | Already fixed: `lifecycle { ignore_changes = [location] }` in storage module |
| 37 | CICD SA bucket reader IAM | Already fixed: `roles/storage.legacyBucketReader` added to storage module |

### Stage 6: Post-Apply

**Goal**: Configure resources terraform doesn't fully manage.

| Gap # | Resolution | Command |
|-------|------------|---------|
| 11, 27, 29 | Delete failed Cloud Run services (no images) | `for svc in keycloak mcp-finance mcp-hr mcp-sales mcp-support web-portal; do gcloud run services delete "$svc" --region=us-central1 --quiet; done` |
| 12 | Regenerate CICD SA key and update GitHub | `gcloud iam service-accounts keys create /tmp/key.json --iam-account=tamshai-prod-cicd@${PROJECT_ID}.iam.gserviceaccount.com && gh secret set GCP_SA_KEY_PROD < /tmp/key.json` |
| 14, 32 | Add missing IAM bindings for secrets | `gcloud secrets add-iam-policy-binding tamshai-prod-mongodb-uri --member="serviceAccount:tamshai-prod-mcp-servers@${PROJECT_ID}.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"` |
| 35 | Create auth.tamshai.com domain mapping | `gcloud beta run domain-mappings create --service=keycloak --domain=auth.tamshai.com --region=us-central1` |

### Stage 7: Deploy Workflow

**Goal**: Trigger CI/CD deployment after infrastructure is ready.

| Gap # | Resolution | Implementation |
|-------|------------|----------------|
| 30 | Dynamic PostgreSQL IP discovery | Already fixed in deploy-to-gcp.yml: queries Cloud SQL directly |
| 31 | CICD SA needs cloudsql.viewer | Already fixed in Terraform security module |
| 33 | Static website bucket IAM after import | Run `terraform apply -target=module.storage` after importing bucket |
| 34 | Keycloak health check timeout | Increase to 120s in Cloud Run service config |
| 36 | Deploy gateway after auth.tamshai.com routable | Wait for `gcloud beta run domain-mappings describe --domain=auth.tamshai.com` shows DomainRoutable=True |

### Stage 8: Post-Deploy Verification

**Goal**: Verify all services are healthy.

| Check | Command |
|-------|---------|
| All 7 Cloud Run services running | `gcloud run services list --region=us-central1 --format="table(name,status.conditions[0].status)"` |
| auth.tamshai.com reachable | `curl -sf https://auth.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration` |
| mcp-gateway healthy | `curl -sf https://mcp-gateway-fn44nd7wba-uc.a.run.app/health` |
| E2E tests pass | `cd tests/e2e && npm run test:login:prod` |

---

## Recommended Phoenix Script Enhancements

1. **Post-destroy verification**: Verify all resources deleted before proceeding to apply (fail-fast)
2. **Pre-destroy cleanup**: Delete secrets, Cloud Run jobs before terraform destroy
3. **Staged apply**: Always run networking module first
4. **Secret versioning**: After creating secrets, add initial versions
5. **Service account key rotation**: Auto-update GitHub secret after terraform apply
6. **Health gates**: Wait for Cloud SQL before deploying Cloud Run services
7. **Idempotent cleanup**: Delete Cloud Run services in failed state before redeploy
8. **State reconciliation**: Check for existing Cloud Run services before apply, auto-import if needed
9. **outputs.tf patcher**: Script to temporarily add try() wrappers for sequential imports
10. **Storage bucket import**: Auto-detect 409 conflicts and import existing buckets
11. **Lifecycle management**: Ensure storage module has location ignore_changes for static_website
12. **Dynamic PostgreSQL IP**: Query Cloud SQL directly instead of hardcoded fallback
13. **CICD cloudsql.viewer role**: Required for PostgreSQL IP discovery
14. **Domain mapping creation**: Create auth.tamshai.com mapping before gateway deploy
15. **Extended health check timeout**: 120s instead of 60s for Keycloak cold starts
16. **Domain routing wait**: Poll until DomainRoutable=True (Cloudflare handles SSL)
17. **CICD bucket reader IAM**: Ensure `roles/storage.legacyBucketReader` for `gcloud storage rsync` to work
