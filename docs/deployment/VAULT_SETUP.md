# HashiCorp Vault Setup Guide for Hetzner VPS

Complete guide to installing and configuring HashiCorp Vault for Tamshai secrets management.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Why HashiCorp Vault](#why-hashicorp-vault)
3. [Architecture Overview](#architecture-overview)
4. [Installation](#installation)
5. [Initial Configuration](#initial-configuration)
6. [Secrets Management](#secrets-management)
7. [GitHub Actions Integration](#github-actions-integration)
8. [Application Integration](#application-integration)
9. [Backup & Recovery](#backup--recovery)
10. [Security Hardening](#security-hardening)
11. [Troubleshooting](#troubleshooting)

## Prerequisites

**GitHub Secrets Required:**

The following GitHub Secrets must be configured before running Vault setup commands:

| Secret Name | Description | Used In |
|-------------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL database password | Database connection |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak client secret for authentication | SSO configuration |
| `CLAUDE_API_KEY` | Anthropic Claude API key | AI service |
| `PINECONE_API_KEY` | Pinecone vector database API key | Vector search |
| `VAULT_DB_PASSWORD` | Vault's PostgreSQL admin password | Vault database plugin |
| `VAULT_ADMIN_PASSWORD` | Vault admin user password | Vault authentication |

**Configure via GitHub UI:**

```text
Repository → Settings → Secrets and variables → Actions → New repository secret
```

**Note:** All example commands below use `${SECRET_NAME}` syntax to reference these GitHub Secrets.

## Why HashiCorp Vault

### Problems with GitHub Secrets

**Static Secrets:**
- ❌ Manually updated (no rotation)
- ❌ Long-lived credentials
- ❌ No expiration/TTL
- ❌ Leaked secrets persist

**No Audit Trail:**
- ❌ Who accessed what secret?
- ❌ When was it used?
- ❌ From which service?

**Limited Access Control:**
- ❌ All-or-nothing per environment
- ❌ No fine-grained permissions
- ❌ Can't restrict by service

### Vault Advantages

**Dynamic Secrets:**
- ✅ Generated on-demand
- ✅ Automatic expiration (TTL)
- ✅ Auto-rotation
- ✅ Revoked when no longer needed

**Complete Audit:**
- ✅ Every access logged
- ✅ Who, what, when, where
- ✅ Compliance reports

**Fine-Grained Access:**
- ✅ Policy-based control
- ✅ Per-service permissions
- ✅ Temporary access tokens

**Additional Features:**
- ✅ Encryption as a Service
- ✅ SSH key management
- ✅ Database credential rotation
- ✅ PKI (Certificate Authority)

### Cost Comparison

**GitHub Secrets:**
- Free, but limited features

**HashiCorp Vault:**
- **Self-hosted (recommended)**: $0/month (uses ~512MB RAM on your VPS)
- **HCP Vault**: $0.50/hour (~$360/month) - overkill for startup

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    Hetzner VPS                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Vault      │  │  PostgreSQL  │  │   Keycloak   │ │
│  │  :8200       │  │   :5432      │  │   :8080      │ │
│  └──────┬───────┘  └──────────────┘  └──────────────┘ │
│         │                                              │
│         │ Get DB credentials                          │
│         │ Get Keycloak secrets                        │
│         │                                              │
│  ┌──────▼────────────────────────────────────────────┐ │
│  │         Docker Compose Stack                      │ │
│  │  (API Gateway, AI Service, Flutter Backend)      │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │
                         │ HTTPS :8200
                         │
                 ┌───────┴────────┐
                 │  GitHub Actions│
                 │    CI/CD       │
                 └────────────────┘
```

### Data Flow

1. **GitHub Actions** authenticates to Vault (AppRole)
2. **Vault** provides temporary token
3. **Action** fetches secrets (DB password, API keys)
4. **Action** deploys application with secrets
5. **Application** fetches its own secrets from Vault
6. **Secrets expire** after TTL (e.g., 24 hours)

## Installation

### System Requirements

- Hetzner VPS running Ubuntu 22.04
- Root or sudo access
- At least 1GB RAM (512MB for Vault + overhead)
- Open port 8200 (firewall configured)

### Automated Installation

```bash
# 1. Download installation script
wget https://raw.githubusercontent.com/youraccount/tamshai/main/scripts/vault-install.sh

# 2. Make executable
chmod +x vault-install.sh

# 3. Run installation
sudo bash vault-install.sh

# Follow prompts for initialization
```

### Manual Installation (Alternative)

```bash
# 1. Add HashiCorp repository
wget -O- https://apt.releases.hashicorp.com/gpg | \
    gpg --dearmor | \
    sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
    https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
    sudo tee /etc/apt/sources.list.d/hashicorp.list

# 2. Install Vault
sudo apt update && sudo apt install vault

# 3. Verify installation
vault --version
```

### Docker Installation (Alternative)

```bash
# Create Vault directories
mkdir -p /opt/vault/{data,config,logs}

# Create docker-compose.yml
cat > /opt/vault/docker-compose.yml <<EOF
version: '3.8'

services:
  vault:
    image: hashicorp/vault:1.15
    container_name: vault
    restart: unless-stopped
    ports:
      - "8200:8200"
    cap_add:
      - IPC_LOCK
    volumes:
      - ./data:/vault/data
      - ./config:/vault/config
      - ./logs:/vault/logs
    environment:
      - VAULT_ADDR=https://127.0.0.1:8200
    command: server
    networks:
      - tamshai_network

networks:
  tamshai_network:
    external: true
EOF

# Start Vault
cd /opt/vault
docker-compose up -d
```

## Initial Configuration

### Step 1: Initialize Vault

```bash
# Set environment variables
export VAULT_ADDR='https://127.0.0.1:8200'
export VAULT_SKIP_VERIFY=1  # Only for self-signed certs

# Initialize (creates unseal keys and root token)
vault operator init -key-shares=5 -key-threshold=3

# OUTPUT (SAVE THIS SECURELY!):
# Unseal Key 1: abc123...
# Unseal Key 2: def456...
# Unseal Key 3: ghi789...
# Unseal Key 4: jkl012...
# Unseal Key 5: mno345...
#
# Initial Root Token: hvs.CAESIJ...
```

**CRITICAL:** Save these keys in a password manager (NOT in Git!)

### Step 2: Unseal Vault

Vault starts sealed. You need 3 of 5 keys to unseal:

```bash
# Unseal with 3 keys
vault operator unseal abc123...  # Key 1
vault operator unseal def456...  # Key 2
vault operator unseal ghi789...  # Key 3

# Check status
vault status
# Should show: Sealed: false
```

**Note:** Vault must be unsealed after every restart.

### Step 3: Login with Root Token

```bash
# Login
vault login hvs.CAESIJ...

# Verify
vault token lookup
```

### Step 4: Enable Secrets Engines

```bash
# Enable KV v2 (key-value store)
vault secrets enable -version=2 kv

# Enable database secrets engine (dynamic credentials)
vault secrets enable database

# Enable transit (encryption as a service)
vault secrets enable transit

# List enabled engines
vault secrets list
```

## Secrets Management

### Static Secrets (KV Store)

```bash
# Store production database credentials
vault kv put kv/production/database \
    host="localhost" \
    port="5432" \
    database="tamshai" \
    username="tamshai_user" \
    password="${DB_PASSWORD}"

# Store Keycloak secrets
# Use GitHub Secrets: KEYCLOAK_CLIENT_SECRET
vault kv put kv/production/keycloak \
    realm="tamshai" \
    client_id="tamshai-flutter-client" \
    client_secret="${KEYCLOAK_CLIENT_SECRET}"

# Store API keys
# Use GitHub Secrets: CLAUDE_API_KEY, PINECONE_API_KEY
vault kv put kv/production/api-keys \
    anthropic_api_key="${CLAUDE_API_KEY}" \
    pinecone_api_key="${PINECONE_API_KEY}"

# Read secrets
vault kv get kv/production/database

# Read specific field
vault kv get -field=password kv/production/database

# List secrets
vault kv list kv/production
```

### Dynamic Database Credentials

```bash
# Configure PostgreSQL connection
vault write database/config/postgresql \
    plugin_name=postgresql-database-plugin \
    allowed_roles="tamshai-app" \
    connection_url="postgresql://{{username}}:{{password}}@localhost:5432/tamshai?sslmode=disable" \
    username="vault_admin" \
    password="${VAULT_DB_PASSWORD}"

# Create role (defines permissions)
vault write database/roles/tamshai-app \
    db_name=postgresql \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

# Generate credentials (creates temporary user)
vault read database/creds/tamshai-app

# OUTPUT:
# Key                Value
# ---                -----
# lease_id           database/creds/tamshai-app/abc123
# lease_duration     1h
# username           v-root-tamshai-app-abc123
# password           A1a-randompassword
```

**Benefits:**
- Credentials expire after 1 hour
- Auto-revoked when lease expires
- No long-lived credentials
- Automatic rotation

### Policy-Based Access Control

```bash
# Create policy for CI/CD
cat > cicd-policy.hcl <<EOF
# Read production secrets
path "kv/data/production/*" {
  capabilities = ["read", "list"]
}

# Generate database credentials
path "database/creds/tamshai-app" {
  capabilities = ["read"]
}
EOF

vault policy write cicd-policy cicd-policy.hcl

# Create policy for developers
cat > developer-policy.hcl <<EOF
# Read/write development secrets
path "kv/data/development/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Read-only production secrets
path "kv/data/production/*" {
  capabilities = ["read", "list"]
}
EOF

vault policy write developer-policy developer-policy.hcl

# List policies
vault policy list

# Read policy
vault policy read cicd-policy
```

### AppRole Authentication (for CI/CD)

```bash
# Enable AppRole auth method
vault auth enable approle

# Create role for GitHub Actions
vault write auth/approle/role/github-actions \
    token_policies="cicd-policy" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    secret_id_num_uses=0

# Get Role ID (static, safe to commit)
vault read auth/approle/role/github-actions/role-id
# role_id: 12345678-1234-1234-1234-123456789012

# Generate Secret ID (sensitive, store in GitHub Secrets)
vault write -f auth/approle/role/github-actions/secret-id
# secret_id: abcdef12-3456-7890-abcd-ef1234567890

# Test login
vault write auth/approle/login \
    role_id="12345678-1234-1234-1234-123456789012" \
    secret_id="abcdef12-3456-7890-abcd-ef1234567890"
```

## GitHub Actions Integration

### Step 1: Store Vault Credentials in GitHub

1. Go to GitHub repo → Settings → Secrets → Actions
2. Add secrets:
   - `VAULT_ADDR`: `https://vault.tamshai.com:8200`
   - `VAULT_ROLE_ID`: `12345678-1234-1234-1234-123456789012`
   - `VAULT_SECRET_ID`: `abcdef12-3456-7890-abcd-ef1234567890`

### Step 2: Use Vault in GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Hetzner

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Login to Vault
      - name: Import Secrets from Vault
        uses: hashicorp/vault-action@v2
        id: vault
        with:
          url: ${{ secrets.VAULT_ADDR }}
          method: approle
          roleId: ${{ secrets.VAULT_ROLE_ID }}
          secretId: ${{ secrets.VAULT_SECRET_ID }}
          secrets: |
            kv/data/production/database password | DB_PASSWORD ;
            kv/data/production/keycloak client_secret | KEYCLOAK_SECRET ;
            kv/data/production/api-keys anthropic_api_key | ANTHROPIC_API_KEY
      
      # Use secrets in deployment
      - name: Deploy Application
        env:
          DB_PASSWORD: ${{ steps.vault.outputs.DB_PASSWORD }}
          KEYCLOAK_SECRET: ${{ steps.vault.outputs.KEYCLOAK_SECRET }}
          ANTHROPIC_API_KEY: ${{ steps.vault.outputs.ANTHROPIC_API_KEY }}
        run: |
          # Deploy with secrets
          echo "Deploying with Vault secrets..."
          # Your deployment commands here
```

### Alternative: Direct Vault CLI

```yaml
- name: Install Vault CLI
  run: |
    wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor > /tmp/vault.gpg
    sudo mv /tmp/vault.gpg /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
    sudo apt update && sudo apt install vault

- name: Login to Vault
  env:
    VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
  run: |
    export VAULT_TOKEN=$(vault write -field=token auth/approle/login \
      role_id="${{ secrets.VAULT_ROLE_ID }}" \
      secret_id="${{ secrets.VAULT_SECRET_ID }}")
    echo "VAULT_TOKEN=$VAULT_TOKEN" >> $GITHUB_ENV

- name: Get Secrets
  env:
    VAULT_ADDR: ${{ secrets.VAULT_ADDR }}
    VAULT_TOKEN: ${{ env.VAULT_TOKEN }}
  run: |
    DB_PASSWORD=$(vault kv get -field=password kv/production/database)
    echo "DB_PASSWORD=$DB_PASSWORD" >> $GITHUB_ENV
```

## Application Integration

### Python Example

```python
# requirements.txt
hvac==2.1.0

# app/vault_client.py
import hvac
import os

class VaultClient:
    def __init__(self):
        self.client = hvac.Client(
            url=os.getenv('VAULT_ADDR', 'https://vault.tamshai.com:8200'),
            verify=True  # Set to False for self-signed certs (dev only)
        )
        
        # AppRole authentication
        role_id = os.getenv('VAULT_ROLE_ID')
        secret_id = os.getenv('VAULT_SECRET_ID')
        
        self.client.auth.approle.login(
            role_id=role_id,
            secret_id=secret_id
        )
    
    def get_secret(self, path, key=None):
        """Get secret from KV v2 store"""
        secret = self.client.secrets.kv.v2.read_secret_version(
            path=path,
            mount_point='kv'
        )
        
        data = secret['data']['data']
        
        if key:
            return data[key]
        return data
    
    def get_db_credentials(self, role='tamshai-app'):
        """Get dynamic database credentials"""
        response = self.client.secrets.database.generate_credentials(
            name=role
        )
        
        return {
            'username': response['data']['username'],
            'password': response['data']['password'],
            'lease_id': response['lease_id'],
            'lease_duration': response['lease_duration']
        }

# Usage
vault = VaultClient()

# Get static secrets
db_config = vault.get_secret('production/database')
api_key = vault.get_secret('production/api-keys', 'anthropic_api_key')

# Get dynamic credentials
db_creds = vault.get_db_credentials()
print(f"Username: {db_creds['username']}")
print(f"Password: {db_creds['password']}")
print(f"Expires in: {db_creds['lease_duration']} seconds")
```

### Docker Compose Integration

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    image: tamshai-api:latest
    environment:
      - VAULT_ADDR=https://vault.tamshai.com:8200
      - VAULT_ROLE_ID=${VAULT_ROLE_ID}
      - VAULT_SECRET_ID=${VAULT_SECRET_ID}
    depends_on:
      - vault-agent

  # Vault Agent (sidecar for secret management)
  vault-agent:
    image: hashicorp/vault:1.15
    volumes:
      - ./vault-agent-config.hcl:/vault/config/agent.hcl
      - vault-secrets:/vault/secrets
    command: agent -config=/vault/config/agent.hcl

volumes:
  vault-secrets:
```

### Environment Variable Injection

```bash
# .env.vault (template)
DB_HOST={{ with secret "kv/data/production/database" }}{{ .Data.data.host }}{{ end }}
DB_PASSWORD={{ with secret "kv/data/production/database" }}{{ .Data.data.password }}{{ end }}
ANTHROPIC_API_KEY={{ with secret "kv/data/production/api-keys" }}{{ .Data.data.anthropic_api_key }}{{ end }}

# Render template
vault kv get -format=json kv/production/database | \
    jq -r '.data.data | to_entries | map("\(.key)=\(.value)") | .[]' > .env
```

## Backup & Recovery

### Backup Vault Data

```bash
# Backup encrypted data directory
tar -czf vault-backup-$(date +%Y%m%d).tar.gz /opt/vault/data

# Backup to remote storage
rsync -avz /opt/vault/data/ backup-server:/backups/vault/

# Automated backup script
cat > /usr/local/bin/vault-backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/vault"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/vault-$DATE.tar.gz" /opt/vault/data
# Keep last 30 days
find "$BACKUP_DIR" -name "vault-*.tar.gz" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/vault-backup.sh

# Add to crontab (daily at 2 AM)
echo "0 2 * * * /usr/local/bin/vault-backup.sh" | crontab -
```

### Disaster Recovery

```bash
# 1. Install Vault on new server
# 2. Restore data directory
tar -xzf vault-backup-20241228.tar.gz -C /

# 3. Start Vault
systemctl start vault

# 4. Unseal Vault (need 3 of 5 keys)
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# 5. Verify data
vault login <root-token>
vault kv list kv/production
```

### Unseal Key Management

**Option 1: Manual (Current Setup)**
- Store 5 keys in different locations
- 3 keys needed to unseal
- Most secure, but manual

**Option 2: Auto-Unseal (Production)**

```hcl
# vault.hcl
seal "transit" {
  address         = "https://vault-primary:8200"
  disable_renewal = "false"
  key_name        = "autounseal"
  mount_path      = "transit/"
}
```

**Option 3: Cloud Auto-Unseal**

```hcl
# AWS KMS
seal "awskms" {
  region     = "eu-central-1"
  kms_key_id = "12345678-1234-1234-1234-123456789012"
}
```

## Security Hardening

### 1. TLS Certificates

Replace self-signed certificates:

```bash
# Using Let's Encrypt
certbot certonly --standalone -d vault.tamshai.com

# Update Vault config
cat > /etc/vault.d/vault.hcl <<EOF
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/etc/letsencrypt/live/vault.tamshai.com/fullchain.pem"
  tls_key_file  = "/etc/letsencrypt/live/vault.tamshai.com/privkey.pem"
}
EOF

# Restart Vault
systemctl restart vault

# Remove VAULT_SKIP_VERIFY
unset VAULT_SKIP_VERIFY
```

### 2. Enable Audit Logging

```bash
# Enable file audit
vault audit enable file file_path=/var/log/vault/audit.log

# Enable syslog audit
vault audit enable syslog

# View audit logs
tail -f /var/log/vault/audit.log | jq .
```

### 3. Limit Root Token Usage

```bash
# Create admin user instead of using root token
vault auth enable userpass

vault write auth/userpass/users/admin \
    password="${VAULT_ADMIN_PASSWORD}" \
    policies="admin"

# Login as admin
vault login -method=userpass username=admin

# Revoke root token
vault token revoke hvs.CAESIJ...
```

### 4. Network Security

```bash
# Restrict Vault access to specific IPs
# In firewall (ufw)
ufw delete allow 8200/tcp
ufw allow from 1.2.3.4 to any port 8200  # GitHub Actions IP
ufw allow from 5.6.7.8 to any port 8200  # Office IP

# Or use nginx reverse proxy
# See NGINX_VAULT_PROXY.md for configuration
```

### 5. Regular Security Audits

```bash
# Review audit logs
vault audit list

# Check token status
vault token lookup

# Review policies
vault policy list

# Check active leases
vault list sys/leases/lookup/database/creds/tamshai-app
```

## Troubleshooting

### Issue: Vault is Sealed

```bash
# Check status
vault status
# Sealed: true

# Solution: Unseal with 3 keys
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### Issue: Permission Denied

```bash
# Check current token
vault token lookup

# Check policy
vault policy read <policy-name>

# Renew token
vault token renew

# Login again if expired
vault login
```

### Issue: Cannot Connect to Vault

```bash
# Check if Vault is running
systemctl status vault

# Check network
curl -k https://localhost:8200/v1/sys/health

# Check firewall
ufw status
```

### Issue: Secret Not Found

```bash
# List all secrets
vault kv list kv/production

# Check exact path
vault kv get kv/production/database

# Verify mount point
vault secrets list
```

### Issue: Dynamic Credentials Not Working

```bash
# Test database connection
vault write database/config/postgresql -force

# Check role configuration
vault read database/roles/tamshai-app

# Generate credentials manually
vault read database/creds/tamshai-app
```

## Performance Tuning

### Memory Usage

```bash
# Check Vault memory usage
ps aux | grep vault

# Typical usage: 100-500MB
# Adjust if needed in systemd service
```

### Storage Backend

For production with high load, consider switching from file to Consul:

```hcl
storage "consul" {
  address = "127.0.0.1:8500"
  path    = "vault/"
}
```

## Monitoring

### Health Checks

```bash
# Simple health check
curl -k https://localhost:8200/v1/sys/health

# Detailed status
vault status -format=json

# Add to monitoring (Prometheus)
# Vault exposes metrics at /v1/sys/metrics
```

### Systemd Service Monitoring

```bash
# Check service status
systemctl status vault

# View logs
journalctl -u vault -f

# Check for errors
journalctl -u vault --since "1 hour ago" | grep -i error
```

## Next Steps

1. ✅ Install Vault
2. ✅ Initialize and unseal
3. ✅ Create policies
4. ✅ Set up AppRole for GitHub Actions
5. ⬜ Integrate with applications
6. ⬜ Set up backup automation
7. ⬜ Replace self-signed certificates
8. ⬜ Configure auto-unseal (optional)
9. ⬜ Set up monitoring/alerting

## Resources

- [Vault Documentation](https://developer.hashicorp.com/vault/docs)
- [Vault API](https://developer.hashicorp.com/vault/api-docs)
- [Vault Tutorials](https://developer.hashicorp.com/vault/tutorials)
- [Production Hardening](https://developer.hashicorp.com/vault/tutorials/operations/production-hardening)
