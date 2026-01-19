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
  tamshai-prod-logs-gen-lang-client-0553641830

# Static website bucket (if needed)
terraform import 'module.storage.google_storage_bucket.static_website' \
  prod.tamshai.com
```

### 10. Remove Stale Resources from Terraform State
If terraform has stale state for deleted resources:
```bash
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["hr"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["finance"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["sales"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.mcp_suite["support"]'
terraform state rm 'module.cloudrun.google_cloud_run_service.keycloak'
terraform state rm 'module.cloudrun.google_cloud_run_service.web_portal[0]'
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
  --iam-account=tamshai-prod-cicd@gen-lang-client-0553641830.iam.gserviceaccount.com
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
  --member="serviceAccount:tamshai-prod-mcp-servers@gen-lang-client-0553641830.iam.gserviceaccount.com" \
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

## Recommended Phoenix Script Enhancements

1. **Pre-destroy cleanup**: Delete secrets, Cloud Run jobs before terraform destroy
2. **Staged apply**: Always run networking module first
3. **Secret versioning**: After creating secrets, add initial versions
4. **Service account key rotation**: Auto-update GitHub secret after terraform apply
5. **Health gates**: Wait for Cloud SQL before deploying Cloud Run services
6. **Idempotent cleanup**: Delete Cloud Run services in failed state before redeploy
