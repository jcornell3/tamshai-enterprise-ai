# SSH Access Management Policy

**Document ID**: SEC-POL-003
**Version**: 1.0
**Effective Date**: January 1, 2026
**Review Cycle**: Annual
**Classification**: Internal

## 1. Purpose

This policy establishes requirements for secure SSH access to production and staging infrastructure, ensuring compliance with SOC 2 Trust Service Criteria and Sarbanes-Oxley (S-OX) Section 404 requirements for IT General Controls (ITGC).

## 2. Scope

This policy applies to:
- All VPS and cloud infrastructure SSH access
- CI/CD pipeline deployment credentials
- Administrator and developer access to production systems
- Automated service accounts requiring SSH connectivity

## 3. Compliance Framework Mapping

### SOC 2 Trust Service Criteria

| Criteria | Requirement | Implementation |
|----------|-------------|----------------|
| CC6.1 | Logical access security | Short-lived SSH certificates (10-minute TTL) |
| CC6.2 | Access provisioning | GitHub OIDC authentication via Vault |
| CC6.3 | Access modification/removal | Automatic certificate expiry, no manual key rotation |
| CC6.6 | System boundaries | Vault CA-signed certificates only |
| CC6.7 | Transmission protection | SSH with certificate-based auth |
| CC7.2 | Monitoring access | Vault audit logs for all certificate issuance |

### S-OX Section 404 ITGC Controls

| Control Area | Requirement | Implementation |
|--------------|-------------|----------------|
| Access Controls | Segregation of duties | Vault role-based policies |
| Change Management | Audit trail | Vault audit logs, GitHub Actions logs |
| Operations | Automated controls | Certificate auto-expiry, no manual intervention |
| Security | Principle of least privilege | 10-minute TTL, workflow-specific roles |

## 4. Technical Implementation

### 4.1 HashiCorp Vault SSH Secrets Engine

All SSH access to production infrastructure MUST use HashiCorp Vault's SSH Secrets Engine for certificate signing.

**Architecture**:
```
GitHub Actions Workflow
         │
         │ 1. Request OIDC Token
         ▼
GitHub OIDC Provider
         │
         │ 2. JWT Token
         ▼
HashiCorp Vault (JWT Auth)
         │
         │ 3. Vault Token
         ▼
SSH Secrets Engine
         │
         │ 4. Signed Certificate (10min TTL)
         ▼
VPS SSH (TrustedUserCAKeys)
```

### 4.2 Certificate Lifecycle

| Parameter | Value | Justification |
|-----------|-------|---------------|
| Certificate TTL | 10 minutes | Limits exposure window |
| Maximum TTL | 30 minutes | Accommodates long deployments |
| Key Type | Ed25519 | Modern, secure algorithm |
| Principal | root | Required for deployment |
| Vault Token TTL | 15 minutes | Slightly longer than cert TTL |

### 4.3 Authentication Flow

1. **GitHub OIDC**: Workflow requests JWT from GitHub's OIDC provider
2. **Vault JWT Auth**: Validates GitHub JWT claims (repository, actor)
3. **Policy Enforcement**: Vault applies role-specific policies
4. **Certificate Signing**: Vault signs ephemeral SSH public key
5. **SSH Connection**: VPS validates certificate against Vault CA

## 5. Access Control Requirements

### 5.1 Permitted Access Patterns

| Pattern | Allowed | Example |
|---------|---------|---------|
| Automated CI/CD | Yes | GitHub Actions deployments |
| Emergency admin access | Yes | Via Vault-signed certificate |
| Static SSH keys | No | Prohibited in production |
| Password authentication | No | Disabled in sshd_config |
| Root login with password | No | Disabled in sshd_config |

### 5.2 Prohibited Practices

- **Static SSH Keys**: No long-lived SSH private keys in GitHub Secrets or CI/CD
- **Shared Credentials**: Each workflow must authenticate individually
- **Key Reuse**: Ephemeral keys generated per workflow run
- **Manual Key Distribution**: All keys signed through Vault

## 6. Audit and Monitoring

### 6.1 Vault Audit Logging

All certificate signing requests are logged in Vault's audit log:

```json
{
  "type": "request",
  "time": "2026-01-01T12:00:00Z",
  "auth": {
    "token_type": "service",
    "policies": ["github-deploy-ssh"],
    "metadata": {
      "role": "github-deploy"
    }
  },
  "request": {
    "operation": "update",
    "path": "ssh-client-signer/sign/github-deploy",
    "data": {
      "public_key": "[REDACTED]",
      "valid_principals": "root"
    }
  }
}
```

### 6.2 Retention Requirements

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Vault audit logs | 7 years | Encrypted S3/GCS |
| GitHub Actions logs | 90 days | GitHub Enterprise |
| SSH authentication logs | 90 days | VPS syslog |

### 6.3 Alerting

The following events MUST trigger security alerts:

- Failed Vault authentication attempts
- Certificate signing requests outside business hours
- Multiple certificate requests from same workflow in short period
- Attempts to sign certificates for unauthorized principals

## 7. Emergency Access Procedures

### 7.1 Break-Glass Procedure

In case Vault is unavailable:

1. Security team retrieves backup SSH key from secure vault
2. Access is logged in incident management system
3. Key is rotated immediately after access
4. Post-incident review within 24 hours

### 7.2 Vault Recovery

1. Unseal keys stored in GitHub Secrets (3-of-5 threshold)
2. Automated unsealing via workflow_dispatch trigger
3. Root token stored separately for emergency recovery

## 8. Configuration Requirements

### 8.1 VPS SSH Configuration

```
# /etc/ssh/sshd_config
PermitRootLogin prohibit-password
PasswordAuthentication no
TrustedUserCAKeys /etc/ssh/vault-ca.pub
AuthorizedPrincipalsFile none
```

### 8.2 Vault SSH Role Configuration

```hcl
vault write ssh-client-signer/roles/github-deploy \
  key_type=ca \
  default_user=root \
  allowed_users="root,tamshai" \
  allowed_extensions="permit-pty,permit-port-forwarding" \
  ttl=10m \
  max_ttl=30m
```

### 8.3 GitHub OIDC Configuration

```hcl
vault write auth/jwt/role/github-deploy \
  role_type=jwt \
  bound_audiences="https://github.com/jcornell3" \
  bound_claims='{"repository":"jcornell3/tamshai-enterprise-ai"}' \
  user_claim=actor \
  policies="github-deploy-ssh" \
  ttl=15m
```

## 9. Roles and Responsibilities

| Role | Responsibility |
|------|----------------|
| Security Team | Vault configuration, policy management, audit review |
| DevOps Team | Workflow integration, certificate troubleshooting |
| Development Team | Proper use of Vault SSH action in workflows |
| Compliance Team | Annual policy review, audit preparation |

## 10. Exceptions

Exceptions to this policy require:

1. Written approval from Security Lead
2. Documented business justification
3. Compensating controls
4. Time-limited exception period (max 90 days)
5. Quarterly review

### Current Exceptions

| Exception | Justification | Expiry |
|-----------|---------------|--------|
| bootstrap-vps.yml | Required for Vault initialization | Permanent |
| setup-vault.yml | Required for Vault installation | Permanent |
| fix-vault-roles.yml | Required for Vault configuration | Permanent |
| get-vault-credentials.yml | Required for credential retrieval | Permanent |

## 11. Implementation Status

### Completed

- [x] HashiCorp Vault installed on VPS (v1.15.4)
- [x] SSH Secrets Engine enabled and configured
- [x] GitHub OIDC authentication configured
- [x] VPS configured to trust Vault CA
- [x] Deploy workflows updated to use Vault SSH
- [x] Migration workflows updated to use Vault SSH

### Pending

- [ ] Remove static VPS_SSH_KEY from GitHub Secrets
- [ ] Enable Vault audit logging
- [ ] Configure alerting for security events

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-01 | Tamshai-QA | Initial policy creation |

## 13. References

- [HashiCorp Vault SSH Secrets Engine](https://developer.hashicorp.com/vault/docs/secrets/ssh)
- [GitHub OIDC Token Authentication](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AICPA SOC 2 Trust Service Criteria](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/sorhome)
- [Vault SSH Implementation](./VAULT_SSH_SECRETS_ENGINE.md)
