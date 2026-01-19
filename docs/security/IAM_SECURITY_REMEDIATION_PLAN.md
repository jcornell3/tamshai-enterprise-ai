# IAM Security Remediation Plan

**Created**: January 10, 2026
**Priority**: HIGH - Must fix before next production deployment
**Status**: Documented, Not Yet Implemented
**GitHub Issues**: Security Alerts #77, #78

---

## Executive Summary

Two critical security alerts were identified by Checkov (Terraform security scanner) related to overly broad IAM permissions for the CI/CD service account. The CI/CD service account currently has project-level `roles/iam.serviceAccountUser` permission, which allows it to impersonate **ANY** service account in the project - a significant privilege escalation risk.

**Risk Level**: HIGH
**Attack Vector**: Compromised CI/CD could impersonate any service account (Keycloak, databases, etc.)
**Recommended Action**: Replace project-level binding with resource-scoped bindings

---

## Affected Alerts

### Alert #78: CKV_GCP_41
- **Rule**: "Ensure that IAM users are not assigned the Service Account User or Service Account Token Creator roles at project level"
- **Severity**: error (critical)
- **Location**: `infrastructure/terraform/modules/security/main.tf:295`

### Alert #77: CKV_GCP_49
- **Rule**: "Ensure roles do not impersonate or manage Service Accounts used at project level"
- **Severity**: error (critical)
- **Location**: `infrastructure/terraform/modules/security/main.tf:295`

---

## Current Implementation (Vulnerable)

**File**: `infrastructure/terraform/modules/security/main.tf`

```hcl
# Line 295-299 - CURRENT (TOO BROAD)
resource "google_project_iam_member" "cicd_service_account_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"  # ❌ PROJECT-LEVEL PERMISSION
  member  = "serviceAccount:${google_service_account.cicd.email}"
}
```

### Why This Is Dangerous

1. **Privilege Escalation**: CI/CD can impersonate ANY service account in the project
2. **Lateral Movement**: Compromised CI/CD could access Keycloak, databases, storage
3. **Data Breach Risk**: Attacker could impersonate high-privilege accounts
4. **Audit Trail Confusion**: Actions appear to come from legitimate service accounts

### Current Service Accounts in Project

- `tamshai-prod-cicd@PROJECT_ID.iam.gserviceaccount.com` (CI/CD)
- `tamshai-prod-keycloak@PROJECT_ID.iam.gserviceaccount.com` (Keycloak)
- `tamshai-prod-mcp-gateway@PROJECT_ID.iam.gserviceaccount.com` (MCP Gateway)
- `tamshai-prod-mcp-servers@PROJECT_ID.iam.gserviceaccount.com` (MCP Servers)

With current permissions, CI/CD can impersonate ALL of these.

---

## Recommended Fix (Resource-Scoped)

Replace the project-level binding with resource-scoped bindings that grant access ONLY to the specific service accounts that CI/CD legitimately needs to use.

### Implementation

**File**: `infrastructure/terraform/modules/security/main.tf`

```hcl
# =============================================================================
# CI/CD Service Account Impersonation - RESOURCE SCOPED (SECURE)
# =============================================================================

# REMOVE the existing project-level binding
# DELETE lines 295-299:
# resource "google_project_iam_member" "cicd_service_account_user" {
#   project = var.project_id
#   role    = "roles/iam.serviceAccountUser"
#   member  = "serviceAccount:${google_service_account.cicd.email}"
# }

# REPLACE with resource-scoped bindings for each service account that CI/CD deploys

# Allow CI/CD to impersonate Keycloak service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_keycloak_sa" {
  service_account_id = google_service_account.keycloak.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Allow CI/CD to impersonate MCP Gateway service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_mcp_gateway_sa" {
  service_account_id = google_service_account.mcp_gateway.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Allow CI/CD to impersonate MCP Servers service account (for Cloud Run deployments)
resource "google_service_account_iam_member" "cicd_can_use_mcp_servers_sa" {
  service_account_id = google_service_account.mcp_servers.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cicd.email}"
}

# Note: CI/CD does NOT need to impersonate its own service account, so no binding for cicd SA
```

### Why This Is Secure

1. **Principle of Least Privilege**: CI/CD can ONLY impersonate accounts it needs for deployments
2. **Limited Blast Radius**: Compromised CI/CD cannot access other service accounts
3. **Explicit Authorization**: Each impersonation permission is documented and justified
4. **Audit Compliance**: Meets SOC 2, GDPR, and GCP security best practices

---

## Deployment Workflow Usage Analysis

To confirm which service accounts CI/CD actually needs, here's what the deployment workflow does:

**File**: `.github/workflows/deploy-to-gcp.yml`

### Keycloak Deployment (Lines 195-249)
```yaml
- name: Deploy to Cloud Run
  run: |
    gcloud run deploy keycloak \
      --service-account=tamshai-prod-keycloak@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com
```
**Needs**: `roles/iam.serviceAccountUser` on Keycloak SA ✅

### MCP Gateway Deployment (Lines 93-125)
```yaml
- name: Deploy to Cloud Run
  run: |
    gcloud run deploy mcp-gateway \
      --service-account=tamshai-prod-mcp-gateway@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com
```
**Needs**: `roles/iam.serviceAccountUser` on MCP Gateway SA ✅

### MCP Servers Deployment (Lines 127-159)
```yaml
- name: Deploy to Cloud Run
  run: |
    gcloud run deploy mcp-hr \
      --service-account=tamshai-prod-mcp-servers@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com
```
**Needs**: `roles/iam.serviceAccountUser` on MCP Servers SA ✅

### Conclusion
CI/CD needs impersonation permissions for **exactly 3 service accounts**:
1. Keycloak
2. MCP Gateway
3. MCP Servers

All other service accounts in the project should be inaccessible to CI/CD.

---

## Testing Plan

### Pre-Deployment Testing

1. **Terraform Plan**:
   ```bash
   cd infrastructure/terraform
   terraform plan -var-file=prod.tfvars
   ```
   - Verify 1 resource deleted (project-level binding)
   - Verify 3 resources created (resource-scoped bindings)

2. **Local Validation**:
   ```bash
   terraform validate
   checkov -f modules/security/main.tf
   ```
   - Confirm alerts #77 and #78 are resolved

### Post-Deployment Testing

3. **Deployment Test**:
   - Trigger deployment workflow
   - Verify all services deploy successfully
   - Confirm CI/CD can impersonate required service accounts

4. **Security Validation**:
   - Attempt to impersonate unauthorized service account (should fail)
   - Verify project-level binding is removed:
     ```bash
     gcloud projects get-iam-policy PROJECT_ID \
       --flatten="bindings[].members" \
       --filter="bindings.role:roles/iam.serviceAccountUser"
     ```
   - Confirm only resource-level bindings exist

---

## Rollback Plan

If deployments fail after the change:

1. **Immediate Rollback**:
   ```bash
   cd infrastructure/terraform
   terraform apply -var-file=prod.tfvars -target=google_project_iam_member.cicd_service_account_user
   ```
   This re-creates the project-level binding temporarily.

2. **Investigate**:
   - Check deployment logs for permission errors
   - Identify which service account needs access
   - Add resource-scoped binding for that specific account

3. **Re-apply Fix**:
   - Remove temporary project-level binding
   - Ensure all necessary resource-scoped bindings are in place

---

## Implementation Steps

### Step 1: Update Terraform Code
```bash
# Edit the file
nano infrastructure/terraform/modules/security/main.tf

# Lines to modify: 295-299
# Replace project-level binding with 3 resource-scoped bindings (see code above)
```

### Step 2: Validate Changes
```bash
cd infrastructure/terraform
terraform validate
terraform fmt
checkov -f modules/security/main.tf | grep "CKV_GCP_41\|CKV_GCP_49"
```

### Step 3: Plan Deployment
```bash
terraform plan -var-file=prod.tfvars -out=iam-fix.tfplan
terraform show iam-fix.tfplan | grep "service_account_iam_member"
```

### Step 4: Apply to Production
```bash
# Apply with approval
terraform apply -var-file=prod.tfvars

# Verify bindings
gcloud iam service-accounts get-iam-policy tamshai-prod-keycloak@PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts get-iam-policy tamshai-prod-mcp-gateway@PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts get-iam-policy tamshai-prod-mcp-servers@PROJECT_ID.iam.gserviceaccount.com
```

### Step 5: Test Deployments
```bash
# Trigger a test deployment
gh workflow run deploy-to-gcp.yml --ref main -f service=gateway

# Monitor for permission errors
gh run watch
```

### Step 6: Verify Security Alerts Resolved
```bash
# Check GitHub Security tab
# Alerts #77 and #78 should auto-close after next scan
```

---

## Timeline

- **Documentation**: ✅ Complete (January 10, 2026)
- **Implementation**: ⏳ Pending
- **Testing**: ⏳ Pending
- **Deployment**: ⏳ Pending
- **Verification**: ⏳ Pending

**Estimated Time**: 30-60 minutes
**Recommended Window**: Before next production deployment

---

## Additional Security Considerations

### Other Alerts (Lower Priority)

The security scan identified 28 additional alerts:
- **23 errors**: Mostly intentional configurations (public website, APIs)
- **5 warnings**: Database/network configurations

These should be addressed with:
1. Checkov suppression comments for intentional configs
2. Terraform changes for legitimate issues
3. Prioritized during Phase 6 (Monitoring & Hardening)

### Monitoring Recommendations

After fixing IAM permissions:
1. Enable Cloud Audit Logs for IAM operations
2. Set up alerts for service account impersonation
3. Review service account usage monthly
4. Implement least-privilege reviews quarterly

---

## References

- **Checkov Rule CKV_GCP_41**: https://docs.bridgecrew.io/docs/bc_gcp_iam_1
- **Checkov Rule CKV_GCP_49**: https://docs.bridgecrew.io/docs/bc_gcp_iam_7
- **GCP IAM Best Practices**: https://cloud.google.com/iam/docs/best-practices-service-accounts
- **GitHub Security Alerts**: https://github.com/jcornell3/tamshai-enterprise-ai/security/code-scanning

---

## Sign-Off

**Created By**: Claude-QA (Tamshai QA Team)
**Reviewed By**: Pending
**Approved By**: Pending
**Implemented By**: Pending

---

**Last Updated**: January 10, 2026
**Next Review**: After implementation
