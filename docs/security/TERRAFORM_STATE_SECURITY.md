# Terraform State Security

**Document Version**: 1.0
**Last Updated**: 2025-12-31
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: Production Guidelines

---

## Overview

This document outlines security requirements and best practices for managing Terraform state files, which may contain sensitive data including:
- Database passwords
- SSH private keys
- API keys and secrets
- Resource identifiers
- Network configurations

**Security Classification**: CONFIDENTIAL - State files contain production secrets

---

## State Encryption Requirements

### Terraform Cloud (Current)

**VPS Staging Environment** (`infrastructure/terraform/vps/`):
- **Backend**: Terraform Cloud
- **Organization**: `tamshai`
- **Workspace**: `tamshai-vps-staging`
- **Encryption**: ✅ Enabled by default (AES-256)
- **Access Control**: Workspace RBAC

**Configuration**:
```hcl
# infrastructure/terraform/vps/main.tf
terraform {
  cloud {
    organization = "tamshai"
    workspaces {
      name = "tamshai-vps-staging"
    }
  }
}
```

**Security Features**:
- ✅ State encrypted at rest (AES-256)
- ✅ State encrypted in transit (TLS 1.2+)
- ✅ Version history (rollback capability)
- ✅ State locking (prevents concurrent modifications)
- ✅ Audit logging (who changed what, when)
- ✅ RBAC (role-based access control)

### GCP Production (Planned)

**Production Environment** (`infrastructure/terraform/`):
- **Backend**: GCS bucket with customer-managed encryption
- **Bucket**: `tamshai-prod-terraform-state`
- **Encryption**: Customer-managed encryption keys (CMEK) via Cloud KMS
- **Access Control**: IAM with least privilege

**Planned Configuration**:
```hcl
terraform {
  backend "gcs" {
    bucket                      = "tamshai-prod-terraform-state"
    prefix                      = "terraform/state"
    encryption_key              = "projects/PROJECT_ID/locations/global/keyRings/terraform/cryptoKeys/state"
    impersonate_service_account = "terraform@PROJECT_ID.iam.gserviceaccount.com"
  }
}
```

**Additional Security**:
- ✅ Bucket versioning enabled (disaster recovery)
- ✅ Object lifecycle management (30-day retention)
- ✅ Bucket logging enabled (audit trail)
- ✅ Uniform bucket-level access (no ACLs)
- ✅ Public access prevention enforced

---

## Sensitive Data in State

### Current Secrets in State

The following sensitive resources are stored in Terraform state:

#### VPS Staging (`infrastructure/terraform/vps/main.tf`)

1. **SSH Private Key** (`tls_private_key.deploy_key`)
   - **Type**: RSA 4096-bit private key
   - **Purpose**: Emergency VPS access
   - **Risk**: High - full server access
   - **Mitigation**: Encrypted Terraform Cloud state, RBAC access control
   - **Suppression**: Line 194 (`#checkov:skip=CKV_SECRET_6`)

2. **Root Password** (`random_password.root_password`)
   - **Type**: 20-character random password
   - **Purpose**: Emergency console access (rarely used)
   - **Risk**: Medium - SSH key auth preferred
   - **Mitigation**: Encrypted Terraform Cloud state, RBAC access control
   - **Suppression**: Line 179 (`#checkov:skip=CKV_SECRET_6`)

3. **Database Passwords**
   - `random_password.keycloak_db_password` (24 characters)
   - `random_password.mongodb_password` (24 characters)
   - `random_password.postgres_password` (24 characters)
   - **Risk**: High - database access
   - **Mitigation**: Encrypted state, rotated via Terraform

4. **Service Secrets**
   - `random_password.minio_password` (24 characters)
   - `random_password.jwt_secret` (64 characters)
   - **Risk**: Medium-High - service authentication
   - **Mitigation**: Encrypted state

#### GCP Production (Planned)

1. **Database Passwords** (`modules/database/main.tf`)
   - `google_sql_user.keycloak_user.password`
   - `google_sql_user.tamshai_user.password`
   - **Risk**: Critical - production database access
   - **Mitigation**: GCS backend with Cloud KMS encryption

2. **Service Account Keys** (if used)
   - **Risk**: Critical - GCP resource access
   - **Recommendation**: Use Workload Identity instead of keys

---

## Access Control

### Terraform Cloud Workspace RBAC

**Workspace**: `tamshai-vps-staging`

| Role | Permissions | Who |
|------|-------------|-----|
| **Admin** | Full access (plan, apply, state) | John Cornell (owner) |
| **Write** | Plan, apply (no direct state access) | DevOps team |
| **Read** | View runs, outputs (no state download) | Developers |
| **Plan** | Create plans only (no apply) | CI/CD automation |

**Access Policy**:
- ✅ 2FA required for all users
- ✅ Session timeout: 24 hours
- ✅ IP allowlist (optional): Office/VPN IPs only
- ✅ API tokens: Scoped to workspace, 90-day expiration

### GCP IAM (Production)

**State Bucket Access**:
- `roles/storage.objectViewer` - Terraform read state
- `roles/storage.objectCreator` - Terraform write state (via service account)
- `roles/cloudkms.cryptoKeyEncrypterDecrypter` - Encrypt/decrypt state

**Principle**: Only Terraform service account has write access; humans use `terraform plan` via CI/CD

---

## State Locking

### Terraform Cloud

- **Mechanism**: Built-in locking via Terraform Cloud API
- **Lock Timeout**: 20 minutes (configurable)
- **Force Unlock**: Requires admin role

**Lock Behavior**:
```bash
$ terraform apply
Acquiring state lock. This may take a few moments...
# Terraform Cloud automatically locks the workspace
# Other users see: "Workspace is locked by user@example.com"
```

### GCS Backend (Production)

- **Mechanism**: GCS object metadata locking
- **Lock File**: `{prefix}/default.tflock`
- **Lock Timeout**: 10 minutes (default)

**Configuration**:
```hcl
backend "gcs" {
  bucket = "tamshai-prod-terraform-state"
  prefix = "terraform/state"
  # Locking enabled by default
}
```

---

## Secret Rotation

### Automated Rotation (Recommended)

**Database Passwords**:
1. Update `var.keycloak_db_password` in Terraform Cloud variables (mark sensitive)
2. Run `terraform apply` to update Cloud SQL user password
3. Update Kubernetes secrets (via CI/CD)
4. Restart affected pods with new credentials

**SSH Keys**:
1. Generate new key: `terraform taint tls_private_key.deploy_key`
2. Apply: `terraform apply` (creates new key, updates VPS)
3. Download new private key from local output: `.keys/deploy_key`
4. Remove old key from local machines

**Rotation Schedule**:
- **Production DB passwords**: Every 90 days (automated via CI/CD)
- **SSH keys**: Every 180 days or on personnel changes
- **API keys/secrets**: Every 90 days

### Emergency Rotation (Compromise)

**If state is compromised**:
1. **IMMEDIATE**: Rotate all secrets in state
2. **URGENT**: Review audit logs for unauthorized access
3. **REQUIRED**: Notify security team, document incident
4. **FOLLOW-UP**: Investigate root cause, update access controls

**Rotation Procedure**:
```bash
# 1. Taint all secret resources
terraform taint random_password.keycloak_db_password
terraform taint random_password.postgres_password
terraform taint tls_private_key.deploy_key

# 2. Apply (generates new secrets)
terraform apply

# 3. Update application configurations
# (Automated via cloud-init or Kubernetes)

# 4. Verify services restart successfully
# (Monitor health endpoints)
```

---

## State Backup & Recovery

### Terraform Cloud Backups

**Automatic Backups**:
- ✅ Every state change versioned automatically
- ✅ 100+ versions retained (configurable)
- ✅ Soft delete (30-day recovery window)

**Manual Backup**:
```bash
# Download current state
terraform state pull > backups/terraform-$(date +%Y%m%d).tfstate

# Encrypt backup
gpg --encrypt --recipient john@tamshai.com terraform-20251231.tfstate

# Store securely (e.g., 1Password, encrypted USB)
```

**Recovery**:
```bash
# List state versions
terraform state list

# Rollback to specific version (via Terraform Cloud UI)
# Settings > General > State Versions > [Select version] > Rollback
```

### GCS Backend Backups (Production)

**Bucket Versioning**:
```hcl
resource "google_storage_bucket" "terraform_state" {
  name     = "tamshai-prod-terraform-state"
  location = "US"

  versioning {
    enabled = true  # Keep all state versions
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 30  # Keep 30 most recent versions
    }
    action {
      type = "Delete"
    }
  }
}
```

**Recovery**:
```bash
# List object versions
gsutil ls -a gs://tamshai-prod-terraform-state/terraform/state/

# Restore specific version
gsutil cp gs://tamshai-prod-terraform-state/terraform/state/default.tfstate#1234567890 \
  gs://tamshai-prod-terraform-state/terraform/state/default.tfstate
```

---

## Local State Security (Dev Only)

### Development Environment (`infrastructure/terraform/dev/`)

**Status**: ⚠️ Local state used intentionally for dev
**Risk**: 🟢 LOW - Single developer, ephemeral environment
**State File**: `terraform.tfstate` (gitignored)

**Security Measures**:
- ✅ `.tfstate` files in `.gitignore` (never commit)
- ✅ Disk encryption enabled (Windows BitLocker / macOS FileVault)
- ✅ Backup to encrypted location (1Password, encrypted USB)
- ⚠️ No state locking (acceptable for single developer)

**Recommendation for Teams**:
```hcl
# Migrate dev to Terraform Cloud when team grows
terraform {
  cloud {
    organization = "tamshai"
    workspaces {
      name = "tamshai-local-dev"
    }
  }
}
```

---

## Compliance & Audit

### SOC 2 Type II Requirements

**State Access Logging**:
- ✅ Terraform Cloud: Audit logs track all state access (download, modify, view)
- ✅ GCS Backend: Cloud Logging tracks all bucket operations
- ✅ Retention: 90 days (dev), 7 years (production)

**Access Reviews**:
- **Quarterly**: Review workspace/IAM permissions
- **On Personnel Change**: Immediately revoke access for departing staff
- **Annual**: Full audit of Terraform access patterns

### GDPR Compliance

**PII in State**:
- ⚠️ User emails may appear in outputs (avoid)
- ⚠️ Customer data should NOT be in infrastructure state
- ✅ State is encrypted (protects against unauthorized access)

**Right to Erasure**:
- Infrastructure state typically doesn't contain customer PII
- If PII detected: Sanitize state, rotate secrets, update infrastructure

---

## Security Checklist

### Deployment Checklist

**Before `terraform apply`**:
- [ ] Backend encryption verified (Terraform Cloud or GCS+KMS)
- [ ] Workspace/bucket RBAC configured (least privilege)
- [ ] Secrets marked as sensitive in variable definitions
- [ ] `.gitignore` includes `*.tfstate*` and `.terraform/`
- [ ] Team trained on state security (never commit state)

**After Deployment**:
- [ ] Verify state is encrypted (check backend configuration)
- [ ] Download state backup (encrypted, stored securely)
- [ ] Review audit logs for unexpected access
- [ ] Document state location in runbook

### Ongoing Maintenance

- [ ] **Monthly**: Review Terraform Cloud audit logs
- [ ] **Quarterly**: Rotate production database passwords
- [ ] **Quarterly**: Review workspace/IAM permissions
- [ ] **Annually**: Rotate SSH keys and API secrets
- [ ] **On Personnel Change**: Revoke Terraform access immediately

---

## Incident Response

### Suspected State Compromise

**Detection Indicators**:
- Unexpected Terraform Cloud state downloads
- Unauthorized GCS bucket access (Cloud Logging alerts)
- Infrastructure changes not matching approved plans
- Alerts from secrets scanning tools (Gitleaks, GitHub Secret Scanning)

**Response Procedure**:
1. **Contain** (0-15 minutes):
   - Revoke all Terraform API tokens
   - Disable compromised user accounts
   - Enable IP allowlist on Terraform Cloud workspace

2. **Assess** (15-60 minutes):
   - Review audit logs (who accessed state, when)
   - Identify which secrets were exposed
   - Determine blast radius (which resources affected)

3. **Remediate** (1-4 hours):
   - Rotate ALL secrets in state (see Emergency Rotation above)
   - Update application configurations
   - Verify services restart successfully

4. **Document** (4-24 hours):
   - Write incident report (timeline, root cause, impact)
   - Update security procedures to prevent recurrence
   - Notify stakeholders (security team, management)

**Contact**:
- **Security Lead**: John Cornell (john@tamshai.com)
- **Terraform Cloud Support**: support@hashicorp.com
- **GCP Security**: https://cloud.google.com/support

---

## References

### Internal Documentation
- [Security Remediation Plan](../keycloak-findings/2025-12-31-security-remediation-plan.md)
- [Phase 5 Security Analysis](../keycloak-findings/2025-12-31-phase5-remaining-issues.md)
- [VPS Firewall Justification](./VPS_FIREWALL_JUSTIFICATION.md)

### External Resources
- [Terraform Cloud Security](https://developer.hashicorp.com/terraform/cloud-docs/security)
- [GCS Backend Documentation](https://developer.hashicorp.com/terraform/language/settings/backends/gcs)
- [Cloud KMS Encryption](https://cloud.google.com/kms/docs/encrypt-decrypt)
- [Terraform Sensitive Data](https://developer.hashicorp.com/terraform/language/state/sensitive-data)

---

**Document Owner**: DevOps Team
**Review Cycle**: Quarterly (or after security incidents)
**Next Review**: 2025-03-31
