# VPS Setup Guide - Hetzner Deployment

**For**: Hetzner VPS (already provisioned)
**Target**: Staging/Production deployment
**Time**: ~30-45 minutes

---

## Prerequisites

You have:
- ✅ Hetzner VPS (CPX31: 4 vCPU, 8GB RAM, 160GB disk)
- ✅ VPS IP address
- ✅ Root password

You need:
- Local SSH client
- Claude API key from [Anthropic Console](https://console.anthropic.com/settings/keys)
- GitHub repository access

---

## Phase 1: SSH Hardening (15 minutes)

**⚠️ CRITICAL: Do this FIRST before anything else!**

### Step 1.1: Create SSH Key Pair

```bash
# On your local machine
ssh-keygen -t ed25519 -C "tamshai-staging-$(date +%Y%m%d)" -f ~/.ssh/tamshai_staging

# This creates:
# - ~/.ssh/tamshai_staging (private key - NEVER share)
# - ~/.ssh/tamshai_staging.pub (public key - safe to copy)
```

### Step 1.2: Copy Public Key to VPS

```bash
# Copy public key to VPS
ssh-copy-id -i ~/.ssh/tamshai_staging.pub root@<VPS_IP>

# Enter root password when prompted
```

### Step 1.3: Test Key-Based Login

```bash
# Test that key-based auth works
ssh -i ~/.ssh/tamshai_staging root@<VPS_IP>

# You should login WITHOUT password prompt
```

### Step 1.4: Disable Password Authentication

**⚠️ KEEP YOUR CURRENT SSH SESSION OPEN!**

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Change these lines:
PasswordAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
ChallengeResponseAuthentication no

# Save and exit (Ctrl+X, Y, Enter)

# Restart SSH
sudo systemctl restart sshd
```

### Step 1.5: Verify SSH Hardening

```bash
# In a NEW terminal (keep old one open!), test connection
ssh -i ~/.ssh/tamshai_staging root@<VPS_IP>

# Should work with key, no password prompt

# Try without key (should fail)
ssh root@<VPS_IP>
# Should see: Permission denied (publickey)
```

**✅ Only close original session after verifying key-based login works!**

---

## Phase 2: Install Core Dependencies (10 minutes)

### Step 2.1: System Update

```bash
# Update package lists
apt-get update

# Upgrade existing packages
apt-get upgrade -y

# Install essential tools
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    ufw \
    fail2ban \
    unzip
```

### Step 2.2: Install Docker

```bash
# Install Docker
apt-get install -y \
    docker.io \
    docker-compose-plugin

# Enable Docker service
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker compose version
```

Expected output:
```
Docker version 24.0.x
Docker Compose version v2.x.x
```

### Step 2.3: Configure Firewall

```bash
# Configure UFW (Uncomplicated Firewall)
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (CRITICAL - don't lock yourself out!)
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Vault (if using)
ufw allow 8200/tcp

# Enable firewall
ufw --force enable

# Check status
ufw status verbose
```

### Step 2.4: Configure Fail2Ban

```bash
# Enable fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Check status
fail2ban-client status sshd
```

---

## Phase 3: Install HashiCorp Vault (Optional, 15 minutes)

**Note**: Only install Vault if you want centralized secrets management. Otherwise, skip to Phase 4.

### Step 3.1: Download Installation Script

```bash
# Download script from repository
wget https://raw.githubusercontent.com/jcornell3/tamshai-enterprise-ai/main/scripts/vault-install.sh

# Make executable
chmod +x vault-install.sh

# Review script (recommended)
less vault-install.sh
```

### Step 3.2: Run Installation

```bash
# Run as root
sudo ./vault-install.sh

# The script will:
# 1. Install Vault binary
# 2. Create system user
# 3. Generate TLS certificates
# 4. Configure systemd service
# 5. Prompt for initialization
```

### Step 3.3: Initialize Vault

```
Do you want to initialize Vault now? (y/n) y
```

**⚠️ CRITICAL: Save the output!**

The script outputs:
```
Unseal Key 1: abc123...
Unseal Key 2: def456...
Unseal Key 3: ghi789...
Unseal Key 4: jkl012...
Unseal Key 5: mno345...

Initial Root Token: hvs.CAESIJ...
```

**IMMEDIATELY copy this to your password manager!**

### Step 3.4: Verify Vault

```bash
# Set environment variables
export VAULT_ADDR='https://127.0.0.1:8200'
export VAULT_SKIP_VERIFY=1  # Only for self-signed certs

# Check status
vault status

# Should show:
# Sealed: false
# Cluster Name: vault-cluster-...
```

### Step 3.5: Store Application Secrets

```bash
# Login with root token
vault login

# Store database password
vault kv put kv/staging/database \
    password="$(openssl rand -base64 32)"

# Store Keycloak secret
vault kv put kv/staging/keycloak \
    client_secret="$(openssl rand -base64 32)"

# Store API keys (replace with actual keys)
vault kv put kv/staging/api-keys \
    anthropic_api_key="sk-ant-api03-YOUR-KEY-HERE"

# Verify secrets stored
vault kv list kv/staging/
```

---

## Phase 4: Deploy Tamshai Services (20 minutes)

### Step 4.1: Clone Repository

```bash
# Create application directory
mkdir -p /opt/tamshai
cd /opt/tamshai

# Clone repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git .

# Verify files
ls -la
```

### Step 4.2: Configure Environment

```bash
# Navigate to Docker directory
cd infrastructure/docker

# Copy example environment file
cp .env.example .env

# Edit environment file
nano .env
```

**Edit `.env` file with your values:**

```bash
# CRITICAL: Set your Claude API key
CLAUDE_API_KEY=sk-ant-api03-YOUR-KEY-HERE

# Database passwords (generate strong passwords)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
MONGODB_PASSWORD=$(openssl rand -base64 32)

# Keycloak configuration
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 32)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 32)

# Network configuration
SUBNET=172.30.0.0/16
```

**If using Vault**, retrieve secrets:
```bash
# Get from Vault instead of generating
export POSTGRES_PASSWORD=$(vault kv get -field=password kv/staging/database)
export CLAUDE_API_KEY=$(vault kv get -field=anthropic_api_key kv/staging/api-keys)
```

### Step 4.3: Build Docker Images

```bash
# Build all services (takes 5-10 minutes)
docker compose build

# Verify images created
docker images | grep docker-mcp
```

Expected output:
```
docker-mcp-gateway    latest    ...    264MB
docker-mcp-hr         latest    ...    247MB
docker-mcp-finance    latest    ...    211MB
docker-mcp-sales      latest    ...    220MB
docker-mcp-support    latest    ...    252MB
```

### Step 4.4: Start Services

```bash
# Start all services in detached mode
docker compose up -d

# Wait for services to be healthy (30-60 seconds)
docker compose ps

# Check logs
docker compose logs -f mcp-gateway
```

### Step 4.5: Verify Services

```bash
# Check all health endpoints
curl http://localhost:3100/health  # MCP Gateway
curl http://localhost:3101/health  # MCP HR
curl http://localhost:3102/health  # MCP Finance
curl http://localhost:3103/health  # MCP Sales
curl http://localhost:3104/health  # MCP Support
curl http://localhost:8180/health  # Keycloak

# Expected: {"status":"healthy",...}
```

---

## Phase 5: Configure Reverse Proxy (Optional)

**For production access via domain name**

### Step 5.1: Install Caddy

```bash
# Install Caddy web server
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

### Step 5.2: Configure Caddyfile

```bash
# Edit Caddyfile
nano /etc/caddy/Caddyfile
```

**Add configuration:**
```
# Replace with your domain
app.yourdomain.com {
    # Automatic HTTPS via Let's Encrypt

    # Corporate website
    reverse_proxy / localhost:8080

    # Keycloak
    reverse_proxy /auth/* localhost:8180

    # MCP Gateway (AI API)
    reverse_proxy /api/* localhost:3100
}
```

### Step 5.3: Start Caddy

```bash
# Restart Caddy
systemctl restart caddy

# Check status
systemctl status caddy

# View logs
journalctl -u caddy -f
```

### Step 5.4: Configure DNS

**In your domain registrar (Cloudflare, Namecheap, etc.):**

Add A record:
```
Type: A
Name: app (or @)
Value: <VPS_IP>
TTL: Auto
```

Wait 5-10 minutes for DNS propagation, then access:
- `https://app.yourdomain.com` - Corporate website
- `https://app.yourdomain.com/auth` - Keycloak
- `https://app.yourdomain.com/api/health` - MCP Gateway

---

## Phase 6: Monitoring & Maintenance

### Step 6.1: Set Up Monitoring

```bash
# Check disk usage
df -h

# Check memory
free -h

# Check Docker stats
docker stats

# Check logs
docker compose logs --tail=100 -f
```

### Step 6.2: Backup Configuration

```bash
# Backup critical files
mkdir -p /root/backups

# Backup environment config
cp /opt/tamshai/infrastructure/docker/.env /root/backups/.env.backup

# Backup Vault keys (if using Vault)
cp /root/vault-init.txt /root/backups/vault-init.txt.backup

# Set proper permissions
chmod 600 /root/backups/*
```

### Step 6.3: Automated Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-tamshai.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Backup databases
docker compose -f /opt/tamshai/infrastructure/docker/docker-compose.yml \
    exec -T postgres pg_dumpall -U tamshai > "$BACKUP_DIR/postgres.sql"

# Backup MongoDB
docker compose -f /opt/tamshai/infrastructure/docker/docker-compose.yml \
    exec -T mongodb mongodump --archive > "$BACKUP_DIR/mongodb.archive"

# Keep only last 7 days
find /root/backups/ -type d -mtime +7 -exec rm -rf {} +
EOF

# Make executable
chmod +x /usr/local/bin/backup-tamshai.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-tamshai.sh") | crontab -
```

---

## Troubleshooting

### Issue: Can't SSH with key

```bash
# Check SSH key permissions (on local machine)
chmod 600 ~/.ssh/tamshai_staging
chmod 644 ~/.ssh/tamshai_staging.pub

# Check VPS authorized_keys
ssh -i ~/.ssh/tamshai_staging root@<VPS_IP> cat ~/.ssh/authorized_keys

# Check SSH logs on VPS
tail -f /var/log/auth.log
```

### Issue: Docker services won't start

```bash
# Check Docker status
systemctl status docker

# Check container logs
docker compose logs <service-name>

# Restart Docker
systemctl restart docker
docker compose up -d
```

### Issue: Out of memory

```bash
# Check memory usage
free -h
docker stats

# Stop non-critical services
docker compose stop mcp-sales mcp-support

# Add swap (if needed)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Issue: Firewall blocking access

```bash
# Check firewall status
ufw status verbose

# Temporarily disable (for testing only!)
ufw disable

# Re-enable after fixing rules
ufw enable
```

---

## Security Checklist

Before going to production:

- [x] SSH password authentication disabled
- [x] Root login only via SSH key
- [x] Firewall (UFW) configured and enabled
- [x] Fail2ban installed and running
- [x] All default passwords changed
- [ ] SSL/TLS certificates configured (Let's Encrypt)
- [ ] Vault initialized with strong unseal keys
- [ ] Backups configured and tested
- [ ] Monitoring alerts configured
- [ ] Security updates automated

---

## Next Steps

1. **Test the deployment**:
   ```bash
   curl https://app.yourdomain.com/api/health
   ```

2. **Configure Keycloak**:
   - Access: `https://app.yourdomain.com/auth`
   - Login with admin credentials
   - Import realm configuration
   - Create users

3. **Test Flutter client**:
   - Update client configuration
   - Point to VPS URL
   - Test authentication flow

4. **Set up GitHub Actions**:
   - Follow `GITHUB_ACTIONS_GUIDE.md`
   - Configure secrets in GitHub
   - Enable automated deployments

5. **Monitor and optimize**:
   - Review logs daily
   - Monitor resource usage
   - Adjust container resources as needed

---

## Support & Resources

- **Vault Guide**: `docs/deployment/VAULT_SETUP.md`
- **Terraform Cloud**: `docs/deployment/TERRAFORM_CLOUD_SETUP.md`
- **GitHub Actions**: `docs/deployment/GITHUB_ACTIONS_GUIDE.md`
- **Architecture Docs**: `docs/architecture/overview.md`
- **GitHub Issues**: https://github.com/jcornell3/tamshai-enterprise-ai/issues

---

**Estimated Total Time**: 30-45 minutes
**Cost**: ~€11.90/month (Hetzner CPX31)
**Status**: Production-ready deployment ✅
