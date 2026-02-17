# Vault Access Guide

This document describes how to securely access HashiCorp Vault on the VPS environment.

**Last Updated:** 2026-02-17
**Security Level:** Internal Use Only

---

## Overview

Vault runs on the VPS and listens on `https://127.0.0.1:8200` (localhost only). The Vault port is **NOT** exposed to the public internet for security reasons.

All access to Vault must be done through one of these methods:
1. **SSH Tunnel** (recommended for interactive use)
2. **SSH Command Execution** (recommended for scripts/automation)

---

## Method 1: SSH Tunnel (Interactive Access)

Use this method when you need to interact with Vault via the CLI or web UI from your local machine.

### Step 1: Create the SSH Tunnel

```bash
# Create SSH tunnel forwarding local port 8200 to VPS Vault
ssh -i infrastructure/terraform/vps/.keys/deploy_key \
    -L 8200:127.0.0.1:8200 \
    -N -f \
    root@$(cd infrastructure/terraform/vps && terraform output -raw vps_ip)
```

**Flags:**
- `-L 8200:127.0.0.1:8200` - Forward local port 8200 to Vault on VPS
- `-N` - Don't execute remote command (tunnel only)
- `-f` - Run in background

### Step 2: Access Vault Locally

Once the tunnel is established, access Vault as if it were running locally:

```bash
# Set environment
export VAULT_ADDR='https://127.0.0.1:8200'
export VAULT_SKIP_VERIFY=1  # Self-signed cert in dev/stage

# Check Vault status
vault status

# Login with root token (get from Terraform or GitHub Secrets)
vault login $(cd infrastructure/terraform/vps && terraform output -raw vault_dev_root_token 2>/dev/null || echo "use-github-secret")

# Or use the GitHub Secret
vault login $VAULT_DEV_ROOT_TOKEN_ID

# List secrets
vault secrets list
vault kv list tamshai/

# Read a secret
vault kv get tamshai/mcp-gateway
```

### Step 3: Access Vault Web UI

With the tunnel active, open in your browser:

```
https://127.0.0.1:8200/ui
```

Accept the self-signed certificate warning and login with the root token.

### Step 4: Close the Tunnel

```bash
# Find and kill the SSH tunnel process
pkill -f "ssh.*-L 8200:127.0.0.1:8200"

# Or find the PID and kill it
ps aux | grep "ssh.*8200"
kill <PID>
```

---

## Method 2: SSH Command Execution (Automation)

Use this method in scripts and CI/CD workflows. Commands are executed directly on the VPS.

### Basic Commands

```bash
VPS_KEY="infrastructure/terraform/vps/.keys/deploy_key"
VPS_IP=$(cd infrastructure/terraform/vps && terraform output -raw vps_ip)

# Check Vault status
ssh -i $VPS_KEY root@$VPS_IP \
    "VAULT_ADDR='https://127.0.0.1:8200' VAULT_SKIP_VERIFY=1 vault status"

# Read a secret
ssh -i $VPS_KEY root@$VPS_IP \
    "VAULT_ADDR='https://127.0.0.1:8200' VAULT_SKIP_VERIFY=1 \
     VAULT_TOKEN=\$(cat /opt/tamshai/.vault-token) \
     vault kv get -format=json tamshai/mcp-gateway"

# List all secrets
ssh -i $VPS_KEY root@$VPS_IP \
    "VAULT_ADDR='https://127.0.0.1:8200' VAULT_SKIP_VERIFY=1 \
     VAULT_TOKEN=\$(cat /opt/tamshai/.vault-token) \
     vault kv list tamshai/"
```

### GitHub Actions Pattern

All GitHub Actions workflows use this pattern:

```yaml
- name: Check Vault Status
  run: |
    ssh -o StrictHostKeyChecking=no -i $SSH_KEY_PATH $VPS_USER@$VPS_HOST << 'EOF'
      export VAULT_ADDR='https://127.0.0.1:8200'
      export VAULT_SKIP_VERIFY=1
      vault status
    EOF
```

---

## Security Considerations

### Why No Public Access?

Exposing Vault port 8200 to the internet (`0.0.0.0/0`) creates significant risks:

1. **Brute Force Attacks** - Attackers can attempt to guess tokens/credentials
2. **Vulnerability Exploitation** - Any Vault CVE becomes directly exploitable
3. **DDoS Target** - Public endpoint can be targeted for denial of service
4. **Credential Stuffing** - Stolen credentials from other breaches can be tried

### SSH Tunnel Benefits

1. **Authentication Required** - Must have SSH key to establish tunnel
2. **Encrypted Transport** - All traffic encrypted through SSH
3. **Audit Trail** - SSH connections are logged
4. **No Public Exposure** - Vault only accessible from localhost

### Token Management

| Token Type | Location | Use Case |
|------------|----------|----------|
| Root Token | Terraform state / GitHub Secret | Emergency admin access |
| AppRole | Vault itself | Service authentication |
| Periodic Token | Generated at runtime | Short-lived operations |

**Best Practice:** Use AppRole authentication for services, not the root token.

---

## Troubleshooting

### Cannot Connect Through Tunnel

```bash
# Check if tunnel is established
ss -tlnp | grep 8200
# or
netstat -tlnp | grep 8200

# Check if Vault is running on VPS
ssh -i $VPS_KEY root@$VPS_IP "docker ps | grep vault"
ssh -i $VPS_KEY root@$VPS_IP "ss -tlnp | grep 8200"
```

### Vault Sealed

```bash
# Check seal status
ssh -i $VPS_KEY root@$VPS_IP \
    "VAULT_ADDR='https://127.0.0.1:8200' VAULT_SKIP_VERIFY=1 vault status"

# If sealed, unseal (dev mode auto-unseals on restart)
ssh -i $VPS_KEY root@$VPS_IP \
    "docker restart tamshai-dev-vault"
```

### Certificate Errors

The VPS Vault uses a self-signed certificate. Always use `VAULT_SKIP_VERIFY=1` in dev/stage:

```bash
export VAULT_SKIP_VERIFY=1
```

For production, configure proper TLS certificates.

---

## Quick Reference

| Task | Command |
|------|---------|
| Create tunnel | `ssh -i .keys/deploy_key -L 8200:127.0.0.1:8200 -N -f root@VPS_IP` |
| Check status | `VAULT_ADDR='https://127.0.0.1:8200' vault status` |
| Login | `vault login $VAULT_DEV_ROOT_TOKEN_ID` |
| List secrets | `vault kv list tamshai/` |
| Read secret | `vault kv get tamshai/mcp-gateway` |
| Close tunnel | `pkill -f "ssh.*-L 8200"` |

---

## Related Documentation

- [VPS Access & Phoenix Rebuild](.claude/vps-access-and-phoenix.md)
- [Terraform State Security](docs/security/TERRAFORM_STATE_SECURITY.md)
- [Security Concerns](docs/security/SECURITY_CONCERNS.md)
