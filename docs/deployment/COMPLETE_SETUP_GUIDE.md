# Complete DevSecOps Setup Guide for Tamshai on Hetzner

End-to-end guide for setting up production-ready CI/CD with Terraform Cloud, HashiCorp Vault, and GitHub Actions.

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Hetzner VPS Setup](#phase-1-hetzner-vps-setup)
4. [Phase 2: Terraform Cloud](#phase-2-terraform-cloud)
5. [Phase 3: HashiCorp Vault](#phase-3-hashicorp-vault)
6. [Phase 4: GitHub Actions](#phase-4-github-actions)
7. [Phase 5: Testing](#phase-5-testing)
8. [Phase 6: Go Live](#phase-6-go-live)
9. [Ongoing Operations](#ongoing-operations)

## Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           .github/workflows/deploy.yml               │  │
│  │  • Security scanning                                 │  │
│  │  • Build & test                                      │  │
│  │  • Terraform plan/apply                             │  │
│  │  • Deploy to Hetzner                                │  │
│  └────────────┬──────────────────────┬──────────────────┘  │
└───────────────┼──────────────────────┼─────────────────────┘
                │                      │
                ▼                      ▼
    ┌───────────────────┐  ┌───────────────────┐
    │ Terraform Cloud   │  │  HashiCorp Vault  │
    │                   │  │  (on Hetzner VPS) │
    │ • State storage   │  │                   │
    │ • State locking   │  │ • Secrets storage │
    │ • Encryption      │  │ • Dynamic creds   │
    └─────────┬─────────┘  │ • Audit logs      │
              │            └─────────┬─────────┘
              │                      │
              ▼                      ▼
    ┌─────────────────────────────────────┐
    │         Hetzner VPS                 │
    │                                     │
    │  ┌──────────┐  ┌──────────┐       │
    │  │  Vault   │  │ Docker   │       │
    │  │  :8200   │  │ Compose  │       │
    │  └──────────┘  └────┬─────┘       │
    │                     │              │
    │  ┌──────────────────▼────────────┐│
    │  │   Tamshai Services            ││
    │  │ • API Gateway                 ││
    │  │ • AI Service                  ││
    │  │ • PostgreSQL                  ││
    │  │ • Keycloak                    ││
    │  │ • Pinecone proxy              ││
    │  └───────────────────────────────┘│
    └─────────────────────────────────────┘
```

### Why This Architecture?

**Terraform Cloud:**
- ✅ Encrypted state storage (secrets safe)
- ✅ State locking (no corruption)
- ✅ Version history (rollback capability)
- ✅ Free for small teams

**HashiCorp Vault:**
- ✅ Dynamic secrets (auto-rotation)
- ✅ Complete audit trail
- ✅ Fine-grained access control
- ✅ Self-hosted (no additional cost)

**GitHub Actions:**
- ✅ Native GitHub integration
- ✅ Extensive marketplace
- ✅ Free minutes (2000/month private repos)
- ✅ Self-hosted runners option

**Total Monthly Cost: $0** (just VPS cost, which you need anyway)

## Prerequisites

### Required Accounts

- [x] GitHub account
- [x] Hetzner Cloud account
- [x] Terraform Cloud account (free)

### Required Tools (Local Development)

```bash
# Terraform
brew install terraform  # macOS
# or
wget https://releases.hashicorp.com/terraform/1.6.0/...

# Vault CLI (optional, for testing)
brew install vault

# Git
brew install git

# SSH key
ssh-keygen -t rsa -b 4096 -C "deploy@tamshai.com" -f ~/.ssh/tamshai_rsa
```

### Required Information

Gather these before starting:
- [ ] Hetzner API token
- [ ] Domain name (optional: vault.tamshai.com)
- [ ] Email for Let's Encrypt
- [ ] Slack webhook URL (for notifications)

## Phase 1: Hetzner VPS Setup

### Step 1.1: Create Hetzner Account

1. Go to: https://www.hetzner.com/cloud
2. Sign up / Login
3. Create new project: "Tamshai Production"

### Step 1.2: Generate API Token

1. Go to: Security → API Tokens
2. Click "Generate API Token"
3. Settings:
   - **Description**: Terraform automation
   - **Permissions**: Read & Write
4. Copy token: `abc123...`
5. Save to password manager

### Step 1.3: Choose Server

**Recommended for Tamshai:**

**Starter (MVP):**
- **Type**: CPX21
- **vCPU**: 3
- **RAM**: 4 GB
- **Storage**: 80 GB
- **Cost**: ~€5.83/month
- **Use case**: MVP, development, staging

**Production:**
- **Type**: CPX31
- **vCPU**: 4
- **RAM**: 8 GB
- **Storage**: 160 GB
- **Cost**: ~€11.90/month
- **Use case**: Production with room to grow

**Location:** Nuremberg (nbg1) - closest to EU users

### Step 1.4: Manual VPS Creation (Optional)

If you want to create VPS manually before Terraform:

1. Go to: Cloud → Create server
2. Select:
   - **Location**: Nuremberg
   - **Image**: Ubuntu 22.04
   - **Type**: CPX21
   - **SSH Key**: Upload your public key
3. Click "Create & Buy now"
4. Note the IP address

## Phase 2: Terraform Cloud

### Step 2.1: Create Terraform Cloud Account

Follow: `TERRAFORM_CLOUD_SETUP.md` sections 1-3

**Quick version:**
```bash
# 1. Sign up at https://app.terraform.io/signup
# 2. Create organization: "tamshai"
# 3. Create API token
# 4. Save token to password manager
```

### Step 2.2: Set Up Project Structure

```bash
# Clone your repo
git clone https://github.com/youraccount/tamshai.git
cd tamshai

# Create terraform directory
mkdir -p terraform
cd terraform

# Create main.tf (see TERRAFORM_CLOUD_SETUP.md)
```

### Step 2.3: Configure Terraform Cloud Backend

```hcl
# terraform/main.tf
terraform {
  cloud {
    organization = "tamshai"
    workspaces {
      name = "tamshai-production"
    }
  }
  
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

# Variables and resources...
# (See TERRAFORM_CLOUD_SETUP.md for complete configuration)
```

### Step 2.4: Login and Initialize

```bash
# Login to Terraform Cloud
terraform login
# Opens browser, generates token

# Initialize
terraform init
# Migrates local state to cloud (if exists)

# Plan infrastructure
terraform plan

# Apply (creates VPS)
terraform apply
```

### Step 2.5: Add Hetzner Token to Workspace

1. Go to: Terraform Cloud → Workspace → Variables
2. Add variable:
   - **Key**: `hetzner_token`
   - **Value**: Your Hetzner API token
   - **Sensitive**: ✅ Checked
3. Save

## Phase 3: HashiCorp Vault

### Step 3.1: SSH into VPS

```bash
# Get VPS IP from Terraform output
terraform output server_ip

# SSH into server
ssh root@<VPS_IP>
```

### Step 3.2: Install Vault

```bash
# Download installation script
wget https://raw.githubusercontent.com/youraccount/tamshai/main/scripts/vault-install.sh

# Make executable
chmod +x vault-install.sh

# Run installation
sudo bash vault-install.sh

# Follow prompts
# Select "yes" when asked to initialize
```

**IMPORTANT:** The script will output:
```
Unseal Key 1: abc123...
Unseal Key 2: def456...
Unseal Key 3: ghi789...
Unseal Key 4: jkl012...
Unseal Key 5: mno345...

Initial Root Token: hvs.CAESIJ...
```

**CRITICAL: Save these immediately to password manager!**

### Step 3.3: Store Initial Secrets

```bash
# Set environment variables
export VAULT_ADDR='https://127.0.0.1:8200'
export VAULT_SKIP_VERIFY=1

# Login with root token
vault login hvs.CAESIJ...

# Store production secrets
vault kv put kv/production/database \
    host="localhost" \
    port="5432" \
    database="tamshai" \
    username="tamshai_user" \
    password="CHANGE_THIS_PASSWORD"

vault kv put kv/production/keycloak \
    realm="tamshai" \
    client_id="tamshai-flutter-client" \
    client_secret="CHANGE_THIS_SECRET"

vault kv put kv/production/api-keys \
    anthropic_api_key="sk-ant-..." \
    pinecone_api_key="pcsk-..." \
    supabase_key="eyJ..."
```

### Step 3.4: Create AppRole for GitHub Actions

```bash
# Enable AppRole auth
vault auth enable approle

# Create policy for CI/CD
cat > cicd-policy.hcl <<EOF
path "kv/data/production/*" {
  capabilities = ["read", "list"]
}
path "kv/data/staging/*" {
  capabilities = ["read", "list"]
}
EOF

vault policy write cicd-policy cicd-policy.hcl

# Create role
vault write auth/approle/role/github-actions \
    token_policies="cicd-policy" \
    token_ttl=1h \
    token_max_ttl=4h

# Get Role ID (static, safe to commit)
vault read auth/approle/role/github-actions/role-id
# Copy: role_id

# Generate Secret ID (sensitive, store in GitHub Secrets)
vault write -f auth/approle/role/github-actions/secret-id
# Copy: secret_id
```

Save both IDs to password manager.

## Phase 4: GitHub Actions

### Step 4.1: Add Secrets to GitHub

1. Go to: GitHub repo → Settings → Secrets → Actions
2. Click "New repository secret"
3. Add each secret:

```
TF_API_TOKEN          = <Terraform Cloud API token>
HETZNER_TOKEN         = <Hetzner API token>
VAULT_ADDR            = https://<VPS_IP>:8200
VAULT_ROLE_ID         = <AppRole Role ID>
VAULT_SECRET_ID       = <AppRole Secret ID>
PRODUCTION_HOST       = <VPS_IP>
SSH_PRIVATE_KEY       = <Contents of ~/.ssh/tamshai_rsa>
SLACK_WEBHOOK         = <Slack webhook URL> (optional)
GITGUARDIAN_API_KEY   = <GitGuardian API key> (optional)
SNYK_TOKEN            = <Snyk token> (optional)
```

### Step 4.2: Configure Workflow File

```bash
# Copy workflow to your repo
mkdir -p .github/workflows
cp /path/to/deploy.yml .github/workflows/
```

### Step 4.3: Configure Environments

1. Go to: Settings → Environments
2. Create "staging" environment:
   - No protection rules
3. Create "production" environment:
   - **Protection rules**:
     - ✅ Required reviewers: 2
     - ✅ Wait timer: 5 minutes
   - **Deployment branches**: Only `main`

### Step 4.4: Initial Commit

```bash
# Add all files
git add .

# Commit
git commit -m "feat: Initial DevSecOps pipeline setup"

# Push to develop (triggers staging deploy)
git push origin develop

# Watch workflow
# Go to: Actions tab in GitHub
```

## Phase 5: Testing

### Step 5.1: Test Staging Deployment

```bash
# Create develop branch if needed
git checkout -b develop

# Make a change
echo "# Test" >> README.md

# Commit and push
git add .
git commit -m "test: Trigger staging deployment"
git push origin develop

# Monitor:
# 1. GitHub Actions workflow runs
# 2. Security scans pass
# 3. Terraform plan created
# 4. Deployment to staging succeeds
```

### Step 5.2: Test Production Deployment

```bash
# Merge to main (via PR)
git checkout main
git merge develop
git push origin main

# Or create PR in GitHub UI

# Monitor:
# 1. All stages pass
# 2. Manual approval required
# 3. Terraform applies
# 4. Secrets fetched from Vault
# 5. Deployment succeeds
# 6. Health checks pass
```

### Step 5.3: Verify Secrets Management

```bash
# SSH into VPS
ssh deploy@<VPS_IP>

# Check .env file exists
cat /opt/tamshai/.env

# Should contain values from Vault
# DB_PASSWORD=...
# KEYCLOAK_CLIENT_SECRET=...
# etc.

# Check Vault audit logs
ssh root@<VPS_IP>
vault audit list
tail -f /var/log/vault/audit.log | jq .
```

### Step 5.4: Test Secret Rotation

```bash
# Update secret in Vault
vault kv put kv/production/database password="NewPassword123"

# Trigger redeployment
git commit --allow-empty -m "chore: Trigger redeploy"
git push origin main

# Verify new password deployed
ssh deploy@<VPS_IP> cat /opt/tamshai/.env | grep DB_PASSWORD
```

## Phase 6: Go Live

### Step 6.1: Domain Configuration

```bash
# Add A record for your domain
# vault.tamshai.com → <VPS_IP>

# Install Let's Encrypt certificate
ssh root@<VPS_IP>
apt-get install -y certbot
certbot certonly --standalone -d vault.tamshai.com

# Update Vault config
vim /etc/vault.d/vault.hcl
# Change tls_cert_file and tls_key_file paths

# Restart Vault
systemctl restart vault

# Unseal Vault
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### Step 6.2: Update GitHub Secrets

Update `VAULT_ADDR` in GitHub:
```
VAULT_ADDR = https://vault.tamshai.com:8200
```

Remove `VAULT_SKIP_VERIFY` if you set it.

### Step 6.3: Production Hardening

```bash
# On VPS
ssh root@<VPS_IP>

# 1. Enable firewall rules
ufw limit 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8200/tcp  # Vault
ufw --force enable

# 2. Set up automatic security updates
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# 3. Configure fail2ban
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 4. Set up backup cron
crontab -e
# Add:
# 0 2 * * * /usr/local/bin/vault-backup.sh
```

### Step 6.4: Monitoring Setup

```bash
# Install monitoring
docker-compose -f monitoring/docker-compose.yml up -d

# Services:
# - Prometheus (metrics)
# - Grafana (dashboards)
# - Loki (logs)
# - Alertmanager (alerts)
```

## Ongoing Operations

### Daily Tasks

**Monitor deployments:**
- Check GitHub Actions runs
- Review Vault audit logs
- Monitor application logs

**Commands:**
```bash
# View recent deployments
tail -n 50 /var/log/deployments.log

# Check Vault status
vault status

# View running services
docker ps
```

### Weekly Tasks

**Security:**
- Review security scan results
- Update dependencies
- Rotate sensitive credentials

**Infrastructure:**
- Review Terraform state
- Check resource usage
- Review cost optimization

### Monthly Tasks

**Vault:**
- Rotate AppRole secrets
- Review access policies
- Backup encryption keys

**Terraform:**
- Review state versions
- Clean up old resources
- Update provider versions

### Emergency Procedures

**Vault Sealed After Reboot:**
```bash
ssh root@<VPS_IP>
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

**Deployment Failed:**
```bash
# Check logs
ssh deploy@<VPS_IP>
docker-compose logs -f

# Rollback
cd /opt/tamshai
docker-compose down
git checkout <previous-commit>
docker-compose up -d
```

**Secret Compromised:**
```bash
# 1. Immediately revoke in Vault
vault kv delete kv/production/<secret-path>

# 2. Generate new secret
vault kv put kv/production/<secret-path> key="new-value"

# 3. Trigger redeployment
git commit --allow-empty -m "chore: Rotate compromised secret"
git push origin main

# 4. Check audit logs
vault audit list
```

## Cost Breakdown

### Monthly Costs

```
Hetzner VPS (CPX21):      €5.83
Terraform Cloud:          €0 (free tier)
HashiCorp Vault:          €0 (self-hosted)
GitHub Actions:           €0 (free tier)
Domain (optional):        €1/month
──────────────────────────────
Total:                    €6.83/month (~$7.50)
```

### Cost Optimization

**Stay on free tiers:**
- Terraform Cloud: <500 resources, <5 users
- GitHub Actions: <2000 minutes/month
- Use self-hosted Vault (not HCP)

**Upgrade triggers:**
- Need >500 Terraform resources → Terraform Cloud Team ($20/user/mo)
- Need >2000 CI/CD minutes → GitHub Team ($4/user/mo)
- Need Vault HA → HCP Vault ($360/mo) or cluster

## Troubleshooting

See individual guides:
- `TERRAFORM_CLOUD_SETUP.md` - Terraform issues
- `VAULT_SETUP.md` - Vault issues
- `GITHUB_ACTIONS_TROUBLESHOOTING.md` - CI/CD issues

## Next Steps

1. ✅ Set up infrastructure
2. ✅ Configure secrets management
3. ✅ Implement CI/CD pipeline
4. ⬜ Add monitoring/alerting
5. ⬜ Implement backup automation
6. ⬜ Set up disaster recovery
7. ⬜ Document runbooks
8. ⬜ Train team on operations

## Resources

- [Terraform Cloud Docs](https://developer.hashicorp.com/terraform/cloud-docs)
- [Vault Docs](https://developer.hashicorp.com/vault/docs)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Hetzner Cloud Docs](https://docs.hetzner.com/cloud/)

---

## Deployment History

### Staging Environment - December 28, 2025

**Infrastructure:**
- **VPS**: Hetzner CPX31 (4 vCPU, 8GB RAM, 160GB NVMe)
- **IP**: $VPS_HOST
- **Location**: Helsinki, Finland
- **OS**: Ubuntu 24.04 LTS
- **Cost**: €11.90/month

**Timeline:**
- **Deployed**: 2025-12-29 03:29 UTC
- **Status**: ✅ All services operational

**Components Deployed:**
- ✅ HashiCorp Vault 1.15.4 (https://$VPS_HOST:8200)
- ✅ 18 Docker containers (all healthy)
- ✅ Caddy reverse proxy (serving tamshai.com)
- ✅ UFW firewall + Fail2ban
- ✅ SSH key-based authentication only

**Services:**
- MCP Gateway + 4 MCP servers (HR, Finance, Sales, Support)
- Kong API Gateway
- Keycloak authentication
- PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
- 5 web applications (Portal, HR, Finance, Sales, Support)

**Vault Configuration:**
- Unseal keys stored in GitHub Secrets
- TLS with self-signed certificates
- Ready for secrets management

**Pending Configuration:**
- ⏳ Cloudflare DNS → $VPS_HOST
- ⏳ SSL/TLS mode: Flexible or Full
- ⏳ Keycloak realm import
- ⏳ Flutter client connection test

See [VPS_SETUP_GUIDE.md](VPS_SETUP_GUIDE.md) for complete deployment details.
