# Terraform Dev Environment

Full-stack Terraform configuration for local Docker Compose development. Mimics VPS/production structure but targets Docker Desktop.

## Overview

**Purpose**: Manage all 19 Docker Compose services with Terraform for Infrastructure-as-Code consistency across dev/stage/prod.

**Architecture**: Hybrid approach combining:
- Docker Compose for container orchestration (via `local-exec`)
- Terraform for environment configuration and secrets management
- Keycloak realm via Docker `--import-realm` (consistent across all environments)

**Services Managed** (19 total):
- **Infrastructure** (5): PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
- **Identity** (1): Keycloak (via Docker --import-realm)
- **API Gateway** (1): Kong
- **MCP Servers** (5): Gateway, HR, Finance, Sales, Support
- **Web Apps** (6): Portal, HR, Finance, Sales, Support, Website
- **Token Cache** (1): Redis

## Prerequisites

1. **Docker Desktop 4.0+** with Docker Compose v2+
2. **Terraform 1.5+** installed
3. **Windows PowerShell** (for environment setup script)
4. **Claude API Key** from https://console.anthropic.com/settings/keys
5. **Hosts file entry** for HTTPS access (see below)

### Hosts File Setup (Required for HTTPS)

Add the following entry to your hosts file to enable `https://www.tamshai.local`:

**Windows (Admin PowerShell):**
```powershell
Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1  tamshai.local www.tamshai.local"
```

**Linux/macOS:**
```bash
echo "127.0.0.1  tamshai.local www.tamshai.local" | sudo tee -a /etc/hosts
```

**Verify:**
```bash
ping tamshai.local
# Should resolve to 127.0.0.1
```

**Note:** Terraform will fail with a clear error message if the hosts file entry is missing.

## Quick Start

### 1. Setup Environment Variables

Run the PowerShell setup script to configure TF_VAR_* environment variables:

```powershell
# From project root
.\scripts\setup-terraform-dev-env.ps1

# Enter your Claude API key when prompted (secure input)
# sk-ant-api03-your-key-here

# IMPORTANT: Restart your terminal for changes to take effect
```

**Verify Variables**:
```powershell
Get-ChildItem Env:TF_VAR_*
```

### 2. Stop Existing Docker Services

```bash
cd infrastructure/docker
docker compose down
```

### 3. Initialize Terraform

```bash
cd infrastructure/terraform/dev
terraform init
```

### 4. Review Plan

```bash
terraform plan -var-file=dev.tfvars
```

**Expected Output**:
- Create .env file with generated credentials
- Start 19 Docker services via `docker compose up -d`
- Wait for services to be healthy
- Create Keycloak realm with 25 resources (1 realm, 9 roles, 8 users, 1 client)

### 5. Apply Configuration

```bash
terraform apply -var-file=dev.tfvars
```

**Deployment Time**: ~3-5 minutes (includes service health checks)

### 6. Verify Deployment

```bash
# Primary access URL (HTTPS)
terraform output tamshai_local_url
# Open in browser: https://www.tamshai.local
# Accept the self-signed certificate warning

# Check all service URLs
terraform output services

# View Keycloak admin credentials
terraform output keycloak_url
echo "Username: admin"
terraform output -raw mcp_gateway_client_secret

# Test MCP Gateway
curl http://localhost:3100/health

# View test users for development
terraform output test_users
```

## What Terraform Manages

### 1. Environment File Generation

Terraform creates `infrastructure/docker/.env` with:
- Database credentials (PostgreSQL, MongoDB)
- Keycloak admin password
- MinIO storage credentials
- Claude API key
- Redis password (optional)

**Template**: `templates/docker.env.tftpl`

### 2. Docker Compose Lifecycle

**Start Services**:
```bash
terraform apply -var-file=dev.tfvars
```

Terraform runs:
```bash
cd infrastructure/docker
docker compose up -d
```

**Stop Services** (manual cleanup):
```bash
cd infrastructure/docker
docker compose down
```

**Note**: `auto_stop_services = false` by default (services persist after `terraform destroy`)

### 3. Keycloak Realm Management

Keycloak realm is loaded via Docker's `--import-realm` flag from:
- **Dev/Stage**: `keycloak/realm-export-dev.json` (includes test users)
- **Production**: `keycloak/realm-export.json` (no test users)

**Realm Contents**:
- 1 realm: `tamshai`
- 9 roles: `executive`, `hr-read`, `hr-write`, `finance-read`, etc.
- 8 test users: `alice.chen`, `bob.martinez`, `carol.johnson`, etc.
- 1 OAuth client: `mcp-gateway`

**Why Docker Import (not Terraform provider)**:
- Consistent across all environments (dev/stage/prod)
- Faster startup (no API calls required)
- Works offline (realm embedded in codebase)
- Simpler deployment (no provider dependency)

**To modify the realm**:
1. Make changes in Keycloak admin UI (http://localhost:8180)
2. Export realm: Realm Settings > Action > Partial Export
3. Update `keycloak/realm-export-dev.json` or `realm-export.json`

### 4. Service Health Checks

Terraform waits for critical services:
- PostgreSQL: `pg_isready -U postgres`
- Keycloak: `http://localhost:8180/health/ready`
- Kong: `http://localhost:8100`
- MCP Gateway: `http://localhost:3100/health`

**Timeout**: 30-60 seconds per service

## Configuration

### dev.tfvars

Main configuration file with defaults. **All sensitive values come from TF_VAR_* environment variables** set by `setup-terraform-dev-env.ps1`.

**Key Settings**:
- `auto_start_services = true` - Start Docker on apply
- `auto_stop_services = false` - Keep services running on destroy
- `manage_keycloak_realm = true` - Manage Keycloak with Terraform

### Environment Variables (TF_VAR_*)

Set via `scripts/setup-terraform-dev-env.ps1`:

**Required**:
- `TF_VAR_claude_api_key` - Claude API key (personal, for local dev)
- `TF_VAR_keycloak_admin_password` - Keycloak admin password
- `TF_VAR_test_user_password` - Test user passwords
- `TF_VAR_mcp_gateway_client_secret` - OAuth client secret

**Optional** (have defaults):
- `TF_VAR_postgres_password` - PostgreSQL password (default: `changeme`)
- `TF_VAR_mongodb_root_password` - MongoDB password (default: `changeme`)
- `TF_VAR_minio_root_password` - MinIO password (default: `changeme`)
- `TF_VAR_redis_password` - Redis password (default: empty, no auth)

## Common Operations

### View Service URLs

```bash
terraform output services
```

**Output**:
```
{
  keycloak = { url = "http://localhost:8180/auth", port = 8180 }
  mcp_gateway = { url = "http://localhost:3100", port = 3100 }
  web_portal = { url = "http://localhost:4000", port = 4000 }
  ...
}
```

### View Test Users

```bash
terraform output test_users
```

### Restart Services

**Option 1**: Terraform (recreates .env, restarts all services)
```bash
terraform apply -var-file=dev.tfvars
```

**Option 2**: Docker Compose (faster, no Terraform state change)
```bash
cd infrastructure/docker
docker compose restart mcp-gateway
```

### Update Environment Variables

1. Edit values in `setup-terraform-dev-env.ps1` or set manually:
   ```powershell
   setx TF_VAR_claude_api_key "sk-ant-api03-new-key"
   ```

2. Restart terminal

3. Reapply Terraform:
   ```bash
   terraform apply -var-file=dev.tfvars
   ```

### Clean Up

**Stop Services** (keep data):
```bash
cd infrastructure/docker
docker compose down
```

**Remove All Data** (⚠️ destructive):
```bash
cd infrastructure/docker
docker compose down -v  # Deletes volumes
```

**Clean Terraform State**:
```bash
cd infrastructure/terraform/dev
terraform destroy -var-file=dev.tfvars
```

## Troubleshooting

### Issue: Terraform can't find environment variables

**Error**: `Error: No value for required variable`

**Solution**:
1. Run setup script: `.\scripts\setup-terraform-dev-env.ps1`
2. **Restart terminal completely** (close and reopen)
3. Verify: `Get-ChildItem Env:TF_VAR_*`

### Issue: Docker services already running

**Error**: `docker compose up -d` fails with "port already in use"

**Solution**:
```bash
# Stop existing services
cd infrastructure/docker
docker compose down

# Then reapply Terraform
cd ../terraform/dev
terraform apply -var-file=dev.tfvars
```

### Issue: Keycloak realm already exists

**Error**: `HTTP 409 Conflict. Response body: {"errorMessage":"Realm with name tamshai-corp already exists"}`

**Cause**: Docker's `--import-realm` flag imported realm before Terraform ran

**Solution**:
```bash
# Option 1: Drop Keycloak database (fresh start)
docker exec tamshai-postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak;"
docker exec tamshai-postgres psql -U postgres -c "CREATE DATABASE keycloak WITH OWNER keycloak;"
docker restart tamshai-keycloak
sleep 30

# Option 2: Disable Keycloak module temporarily
# In dev.tfvars: manage_keycloak_realm = false
terraform apply -var-file=dev.tfvars
```

### Issue: Services not healthy after 60 seconds

**Error**: Terraform times out waiting for services

**Solution**:
```bash
# Check service logs
docker compose logs keycloak
docker compose logs postgres

# Common causes:
# 1. Keycloak waiting for database (wait longer, it can take 60-90s)
# 2. Port conflicts (check with: lsof -i :8180)
# 3. Insufficient resources (Docker Desktop needs 8GB RAM)
```

### Issue: .env file not generated

**Error**: Docker containers fail to start, missing environment variables

**Solution**:
```bash
# Check Terraform state
terraform state list | grep local_file.docker_env

# Force recreate .env
terraform taint local_file.docker_env
terraform apply -var-file=dev.tfvars
```

## Architecture: Terraform vs Docker Compose

### Why Use Terraform for Dev?

**Consistency**: Same IaC pattern across dev/stage/prod
- **Dev**: Terraform manages local Docker Compose
- **Stage**: Terraform provisions VPS + cloud-init
- **Prod**: Terraform provisions GCP resources

**Benefits**:
1. **Secrets Management**: TF_VAR_* variables instead of .env files in git
2. **Dependency Management**: Terraform ensures services start in correct order
3. **Health Checks**: Terraform waits for services to be ready before continuing
4. **Modular**: Keycloak realm management separated from Docker infrastructure
5. **Reproducible**: `terraform apply` creates identical environment every time

### What Terraform Doesn't Manage

**Container Images**: Docker Compose still builds and manages images

**Volumes**: Named volumes managed by Docker, not Terraform

**Networks**: Docker Compose creates `tamshai-network`, Terraform doesn't modify it

**Service Configuration**: docker-compose.yml defines service configs, Terraform orchestrates lifecycle

## Comparison with VPS/Stage

| Aspect | Dev (Terraform) | VPS/Stage (Terraform) |
|--------|-----------------|------------------------|
| **Target** | Local Docker Desktop | Hetzner Cloud VPS |
| **Provisioning** | `local-exec` docker compose | `hcloud_server` resource |
| **Bootstrap** | Local shell commands | cloud-init template |
| **Secrets** | TF_VAR_* env vars | random_password resources |
| **Networking** | Docker network | Firewall rules |
| **State** | Local file | Local file (.gitignore'd) |
| **Keycloak** | Docker --import-realm | Docker --import-realm |

**Philosophy**: Dev mimics stage/prod structure but targets local infrastructure.

**Unified Keycloak Strategy**: All environments (dev/stage/prod) use Docker's `--import-realm` for consistent realm setup.

## Next Steps

**After successful deployment**:

1. **Test Keycloak**:
   ```bash
   # Get admin password
   terraform output -raw keycloak_admin_password

   # Open Keycloak admin console
   open http://localhost:8180/auth
   # Username: admin
   # Password: (from output above)
   ```

2. **Test MCP Gateway**:
   ```bash
   curl http://localhost:3100/health

   # Expected: {"status": "ok", "service": "mcp-gateway"}
   ```

3. **Run Integration Tests**:
   ```bash
   cd services/mcp-gateway
   npm run test:integration

   # Expected: 74/74 tests passing
   ```

4. **Access Web Portal**:
   ```bash
   open http://localhost:4000
   ```

## Related Documentation

- **Setup Script**: `scripts/README.md`
- **Keycloak Module**: `infrastructure/terraform/keycloak/TERRAFORM_KEYCLOAK_DEPLOYMENT.md`
- **VPS Deployment**: `infrastructure/terraform/vps/main.tf`
- **Docker Compose**: `infrastructure/docker/README.md`
- **Action Item**: `docs/action-items/terraform-dev-full-stack.md`

---

**Created**: 2025-12-30
**Last Updated**: 2025-12-30
**Maintained By**: Tamshai Dev Team
