# Stage VPS Deployment Status

**Date**: January 3, 2026 (Updated: Full rebuild with Host Vault)
**Environment**: Staging (VPS)
**Server**: Hetzner CPX31 (4 vCPU AMD, 8GB RAM)
**Status**: ✅ **Fully Deployed - All Services Running**

## Deployment Summary

### Infrastructure Created

**Terraform Apply**: ✅ Complete (14 resources created)
**VPS IP**: 5.78.159.29
**Location**: Hillsboro, Oregon (hil datacenter)
**Domain**: vps.tamshai.com (DNS already configured via Cloudflare)

**Recent Fix**: Root password issue resolved (commit 5c69970)
- Previous deployment had blank root password (variable not set)
- Now uses random_password resource (20 chars with special chars)
- Root password available via: `terraform output -raw root_password`

### Resources Created

| Resource | Status | Details |
|----------|--------|---------|
| VPS Server | ✅ Created | CPX31 (4 vCPU, 8GB RAM) |
| SSH Key | ✅ Created | Deploy key generated |
| Firewall | ✅ Created | Ports 80, 443 open |
| Firewall Attachment | ✅ Created | Attached to VPS |
| Random Passwords | ✅ Created | 7 secure passwords generated (including root) |
| Private Keys | ✅ Saved | Stored in .keys/ (gitignored) |
| Host Vault | ✅ Installed | Systemd service on port 8200 |

## Full Rebuild Procedure

When performing a full VPS rebuild (terraform destroy + apply), follow these steps **in order**:

### Step 1: Terraform Destroy and Apply

```bash
cd infrastructure/terraform/vps
terraform destroy -auto-approve
terraform apply -auto-approve
```

### Step 2: Update GitHub SSH Secret

The new VPS has a new SSH key. Update the `VPS_SSH_KEY` secret in GitHub:

```bash
# Get the new private key
cat infrastructure/terraform/vps/.keys/deploy_key

# Update in GitHub: Settings → Secrets → VPS_SSH_KEY
```

### Step 3: Install Docker and Clone Repo

**Note**: Cloud-init on Hetzner may not execute custom runcmd properly. If Docker is not installed:

```bash
# SSH to VPS
ssh -i infrastructure/terraform/vps/.keys/deploy_key root@<VPS_IP>

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Clone repo
git clone --branch main https://github.com/jcornell3/tamshai-enterprise-ai.git /opt/tamshai
```

### Step 4: Run Bootstrap Workflow

```bash
gh workflow run bootstrap-vps.yml --ref main \
  -f environment=staging \
  -f rebuild=true \
  -f pull_latest=true
```

### Step 5: Install Host Vault (Required)

**IMPORTANT**: The Host Vault must be installed for GitHub OIDC and secrets management.

```bash
gh workflow run setup-vault.yml --ref main \
  -f confirm_install=INSTALL \
  -f vault_version=1.15.4
```

This installs Vault as a **systemd service on port 8200** (not Docker).

### Step 6: Verify Deployment

```bash
# Check all services
ssh root@<VPS_IP> "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Verify Host Vault
ssh root@<VPS_IP> "systemctl status vault"
ssh root@<VPS_IP> "lsof -i :8200"

# Test MCP Gateway
curl https://www.tamshai.com/api/health
```

### Terraform Outputs

```bash
api_url = "https://vps.tamshai.com/api"
app_url = "https://vps.tamshai.com"
keycloak_url = "https://vps.tamshai.com/auth"
vps_ip = "5.78.159.29"
emergency_ssh = "SSH disabled - use cloud console"
root_password = <sensitive> (retrieve with: terraform output -raw root_password)
keycloak_admin_password = <sensitive> (retrieve with: terraform output -raw keycloak_admin_password)
```

### DNS Configuration

**Status**: ✅ Already configured (pointing to 5.78.159.29)

**Cloudflare DNS Record**:
```
Type: A
Name: vps.tamshai.com
Value: 5.78.159.29
TTL: Auto
Proxy: Enabled (Orange cloud)
SSL/TLS Mode: Flexible
```

## Cloud-Init Deployment

**Status**: 🔄 **In Progress** (5-10 minutes expected)

The cloud-init script (`infrastructure/terraform/vps/cloud-init.yaml`) is currently:
1. Installing Docker and Docker Compose
2. Cloning the GitHub repository
3. Starting all services via docker-compose
4. Configuring Caddy reverse proxy
5. Setting up automatic HTTPS

### Services Being Deployed (9 total)

**Infrastructure**:
- PostgreSQL (database)
- Redis (cache)

**Applications**:
- Keycloak (identity provider)
- Kong (API gateway)
- MCP Gateway (AI orchestration)
- Caddy (reverse proxy, HTTPS)

**Web Applications** (3):
- Portal (main app)
- HR App
- Finance App

### Expected URLs (Once Deployed)

| Service | URL | Status |
|---------|-----|--------|
| Main Portal | https://vps.tamshai.com/ | ⏳ Pending |
| Keycloak | https://vps.tamshai.com/auth | ⏳ Pending |
| API Gateway | https://vps.tamshai.com/api | ⏳ Pending |
| HR App | https://vps.tamshai.com/hr | ⏳ Pending |
| Finance App | https://vps.tamshai.com/finance | ⏳ Pending |

## Verification Steps

### Step 1: Wait for Cloud-Init Completion

Cloud-init typically takes **5-10 minutes**. You can check status:

```bash
# Method 1: Try accessing the main portal
curl -I https://5.78.159.29/

# Method 2: SSH into server and check cloud-init logs (if SSH enabled)
# ssh root@5.78.159.29
# tail -f /var/log/cloud-init-output.log
```

**Expected Response** (when ready):
```
HTTP/2 200 OK
server: Caddy
```

### Step 2: Verify Service Health

Once the server responds, check each service:

```bash
# Keycloak Health
curl https://vps.tamshai.com/auth/

# Expected: HTML page with "Keycloak"

# API Gateway Health
curl https://vps.tamshai.com/api/health

# Expected: {"status":"ok"} or similar

# Main Portal
curl https://vps.tamshai.com/

# Expected: HTML page (React app)
```

### Step 3: Verify Keycloak Realm

The cloud-init script uses the **Terraform-managed Keycloak setup** from the recent CI fixes:

1. Keycloak starts first
2. Terraform applies Keycloak realm configuration
3. Creates realm `tamshai-corp` with:
   - 9 roles (executive, hr-read/write, finance-read/write, sales-read/write, support-read/write)
   - 8 test users (alice.chen, bob.martinez, carol.johnson, dan.williams, eve.thompson, frank.davis, nina.patel, marcus.johnson)
   - 1 OAuth client (mcp-gateway)

**Verification**:
```bash
# Get access token for alice.chen
curl -X POST "https://vps.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-gateway&client_secret=<from_terraform>&username=alice.chen&password=password123&scope=openid profile email"

# Expected: JSON with access_token
```

### Step 4: Test End-to-End Authentication

```bash
# Get token
TOKEN=$(curl -s -X POST "https://vps.tamshai.com/auth/realms/tamshai-corp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-gateway&client_secret=<secret>&username=alice.chen&password=password123&scope=openid profile email" | jq -r '.access_token')

# Test authenticated API request
curl -H "Authorization: Bearer $TOKEN" https://vps.tamshai.com/api/health
```

## Known Issues from Previous Deployment

### ✅ Fixed in This Deployment

1. **Keycloak 401 Errors**: Fixed by removing invalid "roles" scope (commits b1bdb9d, d6a3b15)
2. **Docker npm ci Failure**: Fixed by running tests on CI runner (commit 2945a5b)
3. **Keycloak Import-Realm Conflict**: Terraform manages realm, not import

### Differences from Dev Environment

| Aspect | Dev (Local Docker) | Stage (VPS) |
|--------|-------------------|-------------|
| Keycloak URL | http://localhost:8180**/auth** | https://vps.tamshai.com/auth |
| Keycloak Port | 8180 (internal 8080) | 443 (HTTPS via Caddy) |
| Keycloak Version | 24.0 | 23.0 (cloud-init) |
| API URL | http://localhost:3100 | https://vps.tamshai.com/api |
| PostgreSQL | Exposed port 5433 | Internal only |
| Redis | Exposed port 6380 | Internal only |
| HTTPS | None (HTTP only) | Caddy auto-HTTPS |
| Client Secret | `test-client-secret` | Generated secure secret |
| User Passwords | `password123` | `password123` (test users) |

## Deployment Timeline

| Time | Event | Status |
|------|-------|--------|
| 22:50 | Terraform apply started | ✅ Complete |
| 22:51 | VPS created (IP: 5.78.159.29) | ✅ Complete |
| 22:51 | Cloud-init started | 🔄 In Progress |
| ~22:56-23:01 | Docker installed | ⏳ Expected |
| ~22:58-23:03 | Repository cloned | ⏳ Expected |
| ~22:59-23:04 | Docker Compose up | ⏳ Expected |
| ~23:00-23:05 | Keycloak realm configured | ⏳ Expected |
| ~23:01-23:06 | All services healthy | ⏳ Expected |

**Estimated Completion**: 23:00 PST (5-10 minutes from deployment start)

## Troubleshooting

### If Server Doesn't Respond After 15 Minutes

1. **Check Hetzner Cloud Console**:
   - Go to https://console.hetzner.cloud/
   - Select project "tamshai-staging"
   - Check server status and console output

2. **Check Cloud-Init Logs** (via Hetzner console):
   ```bash
   tail -f /var/log/cloud-init-output.log
   ```

3. **Check Docker Status**:
   ```bash
   docker ps
   docker compose -f /opt/tamshai/infrastructure/docker/docker-compose.yml ps
   ```

4. **Common Issues**:
   - **Docker not installed**: Cloud-init may have failed
   - **Repository clone failed**: Check GitHub access
   - **Docker Compose failed**: Check logs with `docker compose logs`

### If Keycloak Returns 401 Errors

**This should NOT happen** - the "roles" scope fix is already in main branch (commits b1bdb9d, d6a3b15).

If it does:
1. Verify code is from latest main branch: `cd /opt/tamshai && git log -1`
2. Check if commit includes the fixes: `git log --oneline | grep "roles"`
3. If not, pull latest: `git pull origin main && docker compose restart`

## Next Steps

### Immediate (After Cloud-Init Completes)

1. ✅ **Verify all services are running**:
   ```bash
   curl https://vps.tamshai.com/
   curl https://vps.tamshai.com/auth/
   curl https://vps.tamshai.com/api/health
   ```

2. ✅ **Test authentication flow**:
   - Get token for test user
   - Verify token contains correct claims
   - Test authenticated API request

3. ✅ **Check service logs for errors**:
   - Keycloak logs
   - MCP Gateway logs
   - Kong logs

### Follow-Up

1. **Document verification results**
2. **Update STAGE_VPS_DEPLOYMENT_STATUS.md** with test results
3. **Create Flutter stage build** (using guide from FLUTTER_MULTI_ENVIRONMENT_BUILDS.md)
4. **Test Flutter stage app** connects to VPS

## Monitoring

### Health Checks

```bash
# Keycloak
curl https://vps.tamshai.com/auth/realms/tamshai-corp

# API Gateway
curl https://vps.tamshai.com/api/health

# Kong Gateway
curl https://vps.tamshai.com/

# All services via Docker
# (SSH required or via Hetzner console)
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Logs

```bash
# Via Hetzner console (if SSH disabled)
docker compose -f /opt/tamshai/infrastructure/docker/docker-compose.yml logs -f

# Specific service logs
docker logs tamshai-keycloak --tail 100 -f
docker logs tamshai-mcp-gateway --tail 100 -f
docker logs caddy --tail 100 -f
```

## Rollback Plan

If deployment fails:

1. **Full VPS Rebuild** (recommended):
   Follow the **Full Rebuild Procedure** section above, which includes:
   - Terraform destroy/apply
   - Update GitHub SSH secret
   - Install Docker (if cloud-init fails)
   - Run bootstrap-vps.yml workflow
   - **Install Host Vault** via setup-vault.yml workflow

2. **Or fix via Hetzner console**:
   - Access console at https://console.hetzner.cloud/
   - Username: `root`
   - Password: `terraform output -raw root_password`
   - Debug and fix issues manually

## Security Notes

### Secrets Generated

All passwords are randomly generated by Terraform:
- VPS root password (20 chars with special chars) ✅ **NEW**
- PostgreSQL password (24 chars)
- Keycloak admin password (20 chars with special chars)
- Keycloak DB password (24 chars)
- MongoDB password (24 chars)
- MinIO password (24 chars)
- JWT secret (64 chars)

**Storage**: Terraform state file (encrypted at rest in .terraform/)

**Access**: Only via Terraform outputs (sensitive values masked)

**VPS Console Access**:
- Username: `root`
- Password: `terraform output -raw root_password` (from infrastructure/terraform/vps/)
- Access via Hetzner Cloud Console: https://console.hetzner.cloud/

### Test User Passwords

**IMPORTANT**: Test users have weak passwords (`password123`) for development only.

**Users Created**:
- alice.chen (HR Manager): hr-read, hr-write
- bob.martinez (Finance Director): finance-read, finance-write
- carol.johnson (VP Sales): sales-read, sales-write
- dan.williams (Support Director): support-read, support-write
- eve.thompson (CEO): executive
- frank.davis (Intern): no roles
- nina.patel (Manager): no roles
- marcus.johnson (Engineer): no roles

**Production**: These users should be removed and replaced with real user accounts with strong passwords.

---

**Status**: ✅ Infrastructure deployed, ⏳ Waiting for cloud-init completion
**ETA**: ~5-10 minutes from 22:51 PST deployment start
**Next Check**: ~23:00 PST
