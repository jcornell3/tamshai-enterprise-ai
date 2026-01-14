# Architecture v1.4 - Quick Start Deployment Guide

**Version**: 1.4.2
**Last Updated**: January 13, 2026
**Status**: Ready for Deployment

---

## Prerequisites

Before deploying, ensure you have all required software installed and available in your system PATH.

### System Requirements

- ✅ 8GB RAM minimum (16GB recommended)
- ✅ 20GB free disk space
- ✅ Claude API Key from [Anthropic Console](https://console.anthropic.com/settings/keys)
- ✅ Windows: WSL2 enabled for shell scripts (or Git Bash)

---

## Required Dependencies

### Core Infrastructure (MANDATORY)

These tools are **required** for any development or deployment:

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **git** | 2.40+ | Version control | [git-scm.com](https://git-scm.com/downloads) | `git --version` |
| **docker** | 24.0+ | Container runtime | [docker.com](https://www.docker.com/products/docker-desktop/) | `docker --version` |
| **docker compose** | 2.20+ | Container orchestration | Included with Docker Desktop | `docker compose version` |
| **node** | 20 LTS+ | JavaScript runtime | [nodejs.org](https://nodejs.org/) | `node --version` |
| **npm** | 10.0+ | Package manager | Included with Node.js | `npm --version` |

### Cloud & GitHub Tools (REQUIRED for CI/CD)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **gh** | 2.40+ | GitHub CLI, workflow triggers, secret management | [cli.github.com](https://cli.github.com/) | `gh --version` |
| **terraform** | 1.5+ | Infrastructure as Code (VPS/GCP deployment) | [terraform.io](https://developer.hashicorp.com/terraform/install) | `terraform --version` |
| **gcloud** | 500+ | Google Cloud CLI (production only) | [cloud.google.com](https://cloud.google.com/sdk/docs/install) | `gcloud --version` |

### Flutter Development (REQUIRED for Desktop/Mobile)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **flutter** | 3.24+ | Flutter SDK | [flutter.dev](https://docs.flutter.dev/get-started/install) | `flutter --version` |
| **dart** | 3.4+ | Dart SDK (included with Flutter) | Included with Flutter | `dart --version` |

### SSH & Remote Access (REQUIRED for VPS)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **ssh** | OpenSSH 8+ | Remote VPS access | Built-in (Win10+), [OpenSSH](https://learn.microsoft.com/windows-server/administration/openssh/openssh_install_firstuse) | `ssh -V` |
| **ssh-keygen** | OpenSSH 8+ | SSH key generation | Included with OpenSSH | `ssh-keygen --help` |
| **ssh-keyscan** | OpenSSH 8+ | Host key retrieval | Included with OpenSSH | `ssh-keyscan --help` |

### Database Clients (RECOMMENDED)

These are available via Docker containers, but local installation helps debugging:

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **psql** | 15+ | PostgreSQL client | [postgresql.org](https://www.postgresql.org/download/) | `psql --version` |
| **mongosh** | 2.0+ | MongoDB shell | [mongodb.com](https://www.mongodb.com/try/download/shell) | `mongosh --version` |
| **redis-cli** | 7+ | Redis client | [redis.io](https://redis.io/docs/install/) (or use Docker) | `redis-cli --version` |

### JSON & Text Processing (RECOMMENDED)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **jq** | 1.6+ | JSON parsing in scripts | [jqlang.github.io](https://jqlang.github.io/jq/download/) | `jq --version` |
| **curl** | 7.80+ | HTTP requests, health checks | Built-in (most systems) | `curl --version` |

### Testing Tools (OPTIONAL)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **oathtool** | 2.6+ | TOTP code generation for E2E tests | [nongnu.org](https://www.nongnu.org/oath-toolkit/) or `apt install oathtool` | `oathtool --version` |
| **k6** | 0.45+ | Performance/load testing | [k6.io](https://k6.io/docs/get-started/installation/) | `k6 version` |

### Python (OPTIONAL - Admin Scripts)

| Executable | Version | Purpose | Download | Verify Command |
|------------|---------|---------|----------|----------------|
| **python3** | 3.8+ | Admin utility scripts | [python.org](https://www.python.org/downloads/) | `python3 --version` |

---

## Platform-Specific Setup

### Windows

Windows requires additional configuration for shell scripts:

1. **Enable WSL2** (recommended):
   ```powershell
   wsl --install
   ```
   Then install dependencies inside WSL2 Ubuntu.

2. **Alternative: Git Bash**
   - Installed with Git for Windows
   - Provides bash, curl, ssh, and POSIX utilities
   - Set as default terminal in VS Code

3. **Docker Desktop WSL2 Backend**:
   ```powershell
   # In Docker Desktop settings:
   # Settings → General → Use the WSL 2 based engine ✓
   ```

4. **Add to PATH** (PowerShell as Admin):
   ```powershell
   # Example: Add gcloud to PATH
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\<USER>\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin", "User")
   ```

### macOS

```bash
# Install Homebrew first
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install all dependencies
brew install git gh docker node terraform jq mongosh postgresql redis oath-toolkit k6

# Install Flutter
brew install --cask flutter

# Install gcloud
brew install --cask google-cloud-sdk
```

### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Core tools
sudo apt install -y git curl jq

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Terraform
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform

# GitHub CLI
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install -y gh

# Database clients
sudo apt install -y postgresql-client redis-tools
# MongoDB shell: https://www.mongodb.com/try/download/shell

# Testing tools
sudo apt install -y oathtool

# Flutter: https://docs.flutter.dev/get-started/install/linux
```

---

## Verify All Dependencies

Run this script to verify all required tools are installed:

```bash
#!/bin/bash
# Save as verify-dependencies.sh

echo "=== Core Infrastructure ==="
git --version || echo "❌ git NOT FOUND"
docker --version || echo "❌ docker NOT FOUND"
docker compose version || echo "❌ docker compose NOT FOUND"
node --version || echo "❌ node NOT FOUND"
npm --version || echo "❌ npm NOT FOUND"

echo ""
echo "=== Cloud & GitHub Tools ==="
gh --version 2>/dev/null || echo "⚠️ gh (GitHub CLI) not found - needed for CI/CD"
terraform --version 2>/dev/null || echo "⚠️ terraform not found - needed for VPS/GCP deploy"
gcloud --version 2>/dev/null | head -1 || echo "⚠️ gcloud not found - needed for GCP production"

echo ""
echo "=== Flutter Development ==="
flutter --version 2>/dev/null | head -1 || echo "⚠️ flutter not found - needed for desktop client"

echo ""
echo "=== SSH Tools ==="
ssh -V 2>&1 || echo "❌ ssh NOT FOUND"

echo ""
echo "=== Database Clients ==="
psql --version 2>/dev/null || echo "⚠️ psql not found (can use Docker)"
mongosh --version 2>/dev/null || echo "⚠️ mongosh not found (can use Docker)"
redis-cli --version 2>/dev/null || echo "⚠️ redis-cli not found (can use Docker)"

echo ""
echo "=== Utilities ==="
jq --version 2>/dev/null || echo "⚠️ jq not found - install for JSON parsing"
curl --version | head -1 || echo "❌ curl NOT FOUND"

echo ""
echo "=== Testing Tools ==="
oathtool --version 2>/dev/null || echo "⚠️ oathtool not found - needed for E2E TOTP tests"
k6 version 2>/dev/null || echo "⚠️ k6 not found - needed for performance tests"

echo ""
echo "=== Python ==="
python3 --version 2>/dev/null || python --version 2>/dev/null || echo "⚠️ python not found - needed for admin scripts"

echo ""
echo "Verification complete. ❌ = Required, ⚠️ = Recommended"
```

Or use the npm script:
```bash
cd services/mcp-gateway
npm run verify:deps  # If available
```

---

## Quick Dependency Install (Copy-Paste)

### Windows (via winget)

```powershell
# Run in PowerShell as Administrator
winget install Git.Git
winget install GitHub.cli
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS.LTS
winget install Hashicorp.Terraform
winget install Google.CloudSDK
winget install jqlang.jq
winget install stedolan.jq  # Alternative
# Flutter: Download from https://flutter.dev
```

### macOS (via Homebrew)

```bash
brew install git gh node terraform jq mongosh postgresql redis oath-toolkit k6
brew install --cask docker flutter google-cloud-sdk
```

### Linux (Quick Script)

```bash
# Save and run: curl -fsSL https://your-repo/install-deps.sh | bash
# Or manually run commands from Linux section above
```

---

## Common PATH Issues

### Symptom: "command not found" Errors

**Windows Solutions:**
```powershell
# Check current PATH
echo $env:Path -split ';'

# Add to PATH permanently (PowerShell as Admin)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\path\to\executable", "User")

# Refresh PATH in current session
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
```

**Common Windows PATH Locations:**
| Tool | Typical PATH |
|------|--------------|
| gcloud | `C:\Users\<USER>\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin` |
| terraform | `C:\Users\<USER>\AppData\Local\Programs\Terraform` |
| flutter | `C:\Users\<USER>\flutter\bin` |
| node/npm | `C:\Program Files\nodejs` |
| docker | `C:\Program Files\Docker\Docker\resources\bin` |

**macOS/Linux Solutions:**
```bash
# Check current PATH
echo $PATH | tr ':' '\n'

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$PATH:/path/to/executable"

# Reload shell
source ~/.bashrc  # or ~/.zshrc
```

---

## Docker Container Alternatives

If you can't install tools locally, use Docker containers:

```bash
# PostgreSQL client
docker run -it --rm postgres:15-alpine psql -h host.docker.internal -U tamshai

# MongoDB shell
docker run -it --rm mongo:7 mongosh mongodb://host.docker.internal:27018

# Redis CLI
docker run -it --rm redis:7-alpine redis-cli -h host.docker.internal -p 6380

# jq for JSON processing
docker run -it --rm ghcr.io/jqlang/jq --help

# Terraform
docker run -it --rm -v $(pwd):/workspace -w /workspace hashicorp/terraform:latest plan
```

---

## Quick Start (5 Minutes)

### 1. Configure Environment

```bash
cd infrastructure/docker

# Copy example environment file
cp .env.example .env

# Edit .env and add your Claude API key
nano .env  # or use your preferred editor
```

**Critical**: Set your `CLAUDE_API_KEY` in the .env file:
```bash
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE
```

### 2. Build All Services

```bash
# Build all Docker images (takes 2-3 minutes)
docker compose build

# Verify images were created
docker images | grep docker-mcp
```

Expected output:
```
docker-mcp-finance    latest    ce9ecd4dd662   211MB
docker-mcp-gateway    latest    33ed09036160   264MB
docker-mcp-hr         latest    347daa07485d   247MB
docker-mcp-sales      latest    a8a44dcfe1d7   220MB
docker-mcp-support    latest    7e3e16ab317e   252MB
```

### 3. Start All Services

```bash
# Start all services in detached mode
docker compose up -d

# Wait for services to be healthy (30-60 seconds)
docker compose ps
```

### 4. Verify Health

```bash
# Check all MCP servers
for port in 3100 3101 3102 3103 3104; do
  echo "Checking port $port..."
  curl -s "http://localhost:$port/health" | jq .
done
```

Expected output for each:
```json
{
  "status": "healthy",
  "service": "mcp-<name>",
  "version": "1.4.0",
  "database": "connected",
  "timestamp": "2025-12-08T..."
}
```

---

## Service URLs

After successful startup, access services at:

| Service | URL | Purpose |
|---------|-----|---------|
| **Corporate Website** | http://localhost:8080 | Static company website |
| **MCP Gateway** | http://localhost:3100 | AI orchestration (SSE streaming) |
| **MCP HR** | http://localhost:3101 | Employee data with RLS |
| **MCP Finance** | http://localhost:3102 | Financial data with RLS |
| **MCP Sales** | http://localhost:3103 | CRM data (MongoDB) |
| **MCP Support** | http://localhost:3104 | Tickets/KB (Elasticsearch) |
| **Keycloak** | http://localhost:8180 | Identity provider |
| **Kong Gateway** | http://localhost:8100 | API gateway |
| **PostgreSQL** | localhost:5433 | Database |
| **MongoDB** | localhost:27018 | Document store |
| **Elasticsearch** | localhost:9201 | Search engine |
| **Redis** | localhost:6380 | Confirmation cache |

### VPS Production URLs (Path-Based Routing)

When deployed to VPS with Caddy reverse proxy:

| Path | Service | Description |
|------|---------|-------------|
| `/` | tamshai-website | Corporate website (root) |
| `/auth/*` | Keycloak | Authentication & SSO |
| `/api/*` | MCP Gateway | AI query API |
| `/app/*` | Web Portal | Internal web applications |
| `/hr/*` | Web HR | HR department app |
| `/finance/*` | Web Finance | Finance department app |
| `/sales/*` | Web Sales | Sales department app |
| `/support/*` | Web Support | Support department app |

---

## Testing v1.4 Features

### Test 1: SSE Streaming

```bash
# Via MCP Gateway (requires authentication token)
curl -N -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3100/api/query?query=list%20all%20employees"
```

Expected: Real-time streaming with `data: {...}\n\n` format and `[DONE]` marker.

### Test 2: Truncation Detection

```bash
# Direct to HR server (bypass auth for testing)
curl -X POST "http://localhost:3101/tools/list_employees" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "limit": 50 },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-read"]
    }
  }' | jq '.metadata'
```

Expected output if >50 employees exist:
```json
{
  "truncated": true,
  "returnedCount": 50,
  "warning": "⚠️ Showing 50 of 50+ employees. Results are incomplete..."
}
```

### Test 3: Confirmation Flow

```bash
# Step 1: Request deletion (returns pending_confirmation)
CONFIRMATION=$(curl -X POST "http://localhost:3101/tools/delete_employee" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "employeeId": "employee-uuid" },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-write"]
    }
  }' | jq -r '.confirmationId')

echo "Confirmation ID: $CONFIRMATION"

# Step 2: Check Redis (confirmation stored with 5-min TTL)
docker compose exec redis redis-cli GET "pending:$CONFIRMATION"

# Step 3: Approve via Gateway (requires auth token)
curl -X POST "http://localhost:3100/api/confirm/$CONFIRMATION" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "approved": true }'
```

### Test 4: LLM-Friendly Errors

```bash
# Try to access non-existent employee
curl -X POST "http://localhost:3101/tools/get_employee" \
  -H "Content-Type: application/json" \
  -d '{
    "input": { "employeeId": "00000000-0000-0000-0000-000000000000" },
    "userContext": {
      "userId": "test-user",
      "username": "test",
      "roles": ["hr-read"]
    }
  }' | jq .
```

Expected output:
```json
{
  "status": "error",
  "code": "EMPLOYEE_NOT_FOUND",
  "message": "Employee with ID \"00000000-0000-0000-0000-000000000000\" was not found",
  "suggestedAction": "Please verify the employee ID is correct. You can search for employees using the list_employees tool with filters.",
  "details": {
    "employeeId": "00000000-0000-0000-0000-000000000000"
  }
}
```

---

## Troubleshooting

### Issue: Docker Compose Build Fails

**Symptom**: `ERROR: failed to solve`

**Solution**:
```bash
# Clean up Docker cache
docker system prune -a

# Rebuild from scratch
docker compose build --no-cache
```

### Issue: Services Not Healthy

**Symptom**: `docker compose ps` shows "unhealthy" status

**Solution**:
```bash
# Check logs for specific service
docker compose logs mcp-hr

# Common issues:
# 1. Database not ready yet - wait 30 seconds
# 2. Redis connection failed - check redis service
# 3. Environment variable missing - check .env file
```

### Issue: Claude API Key Error

**Symptom**: `CLAUDE_API_KEY variable is not set`

**Solution**:
```bash
# Verify .env file exists
ls -la infrastructure/docker/.env

# Check if variable is set
grep CLAUDE_API_KEY infrastructure/docker/.env

# Restart services after updating .env
docker compose down
docker compose up -d
```

### Issue: Port Conflicts

**Symptom**: `port is already allocated`

**Solution**:
```bash
# Check what's using the port
lsof -i :3100

# Option 1: Stop the conflicting service
# Option 2: Change port in docker-compose.yml
```

### Issue: Database Connection Errors

**Symptom**: `database connection: FAILED`

**Solution**:
```bash
# Check PostgreSQL logs
docker compose logs postgres

# Verify database is healthy
docker compose exec postgres pg_isready -U tamshai

# Restart database
docker compose restart postgres

# Wait for health check to pass
docker compose ps postgres
```

---

## Stopping Services

### Graceful Shutdown

```bash
# Stop all services (data persists)
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

### Remove Everything

```bash
# Stop services
docker compose down -v

# Remove images
docker rmi $(docker images | grep docker-mcp | awk '{print $3}')

# Clean up system
docker system prune -a
```

---

## Flutter Desktop Client

The unified Flutter client provides a cross-platform desktop/mobile interface with:
- OAuth authentication with Keycloak (PKCE flow)
- Real-time SSE streaming for AI responses
- Voice input using system microphone
- Secure token storage
- v1.4 features: truncation warnings, HITL confirmations

### Quick Start (Windows)

```bash
cd clients/unified_flutter

# Install dependencies
flutter pub get

# Generate code (Freezed models)
flutter pub run build_runner build --delete-conflicting-outputs

# Run on Windows
flutter run -d windows
```

### Platform-Specific Setup

**Windows** (requires Visual Studio 2022 with C++ workload):
```powershell
flutter config --enable-windows-desktop
flutter run -d windows
```

**macOS**:
```bash
xcode-select --install
sudo gem install cocoapods
flutter config --enable-macos-desktop
flutter run -d macos
```

**Linux**:
```bash
sudo apt-get install clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev
flutter config --enable-linux-desktop
flutter run -d linux
```

### Android Development Setup

For building the Android mobile app:

1. **Install JDK 17** (Temurin recommended):
   ```bash
   # Windows - Download from https://adoptium.net/temurin/releases/?version=17
   # macOS
   brew install openjdk@17
   # Ubuntu/Debian
   sudo apt install openjdk-17-jdk
   ```

2. **Install Android SDK**:
   ```bash
   # Set environment variables
   export ANDROID_HOME="$HOME/Android/Sdk"
   export JAVA_HOME="$HOME/Java/jdk-17.0.17+10"  # Adjust path

   # Install packages
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME \
     "platform-tools" "build-tools;34.0.0" "platforms;android-34" "platforms;android-36"

   # Accept licenses
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
   ```

3. **Configure Flutter**:
   ```bash
   flutter config --android-sdk ~/Android/Sdk
   flutter config --jdk-dir ~/Java/jdk-17.0.17+10
   flutter doctor -v
   ```

4. **Build APK**:
   ```bash
   flutter build apk --release
   # Output: build/app/outputs/flutter-apk/app-release.apk
   ```

---

## Development Workflow

### Local Development (Without Docker)

```bash
# Terminal 1: Start databases
docker compose up -d postgres mongodb elasticsearch redis

# Terminal 2: Run MCP Gateway locally
cd services/mcp-gateway
npm run dev

# Terminal 3: Run MCP HR locally
cd services/mcp-hr
npm run dev

# Repeat for other servers...
```

### Hot Reload in Docker

```bash
# Mount source code as volume (edit docker-compose.yml)
volumes:
  - ../../services/mcp-hr/src:/app/src

# Use tsx watch mode
command: npx tsx watch src/index.ts
```

### Debugging

```bash
# View real-time logs
docker compose logs -f mcp-gateway

# View logs with timestamps
docker compose logs -t mcp-hr

# Filter logs
docker compose logs mcp-finance | grep ERROR

# Execute shell in container
docker compose exec mcp-gateway sh
```

---

## Next Steps

After successful deployment:

1. ✅ **Run Verification Script**
   ```bash
   ./scripts/verify-mcp-servers.sh
   ```

2. ✅ **Configure Keycloak**
   - Access: http://localhost:8180
   - Login: admin/admin
   - Import realm: Already done via realm-export.json
   - Test users: See README.md for credentials

3. ✅ **Test Integration**
   - Get JWT token from Keycloak
   - Test Gateway SSE endpoint
   - Verify confirmation flow
   - Check audit logs

4. ✅ **Run Flutter Desktop Client**
   ```bash
   cd clients/unified_flutter
   flutter pub get
   flutter pub run build_runner build --delete-conflicting-outputs
   flutter run -d windows  # or macos, linux
   ```
   - Login with test user credentials
   - Test AI chat with voice input
   - Verify real-time streaming responses

5. ✅ **Verify Corporate Website**
   - Access: http://localhost:8080
   - Check responsive design
   - Verify navigation links

---

## Production Deployment

### VPS Deployment (Hetzner/DigitalOcean)

> **📖 Complete Guide:** For detailed instructions, troubleshooting, and security configuration, see the [VPS Deployment Guide](../../infrastructure/terraform/vps/README.md).

The project includes Terraform configuration for fully automated VPS deployment with **no manual SSH required**.

#### Prerequisites for VPS Deployment

| Requirement | Description |
|-------------|-------------|
| **Terraform** v1.5+ | [Install guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) |
| **Cloud Provider Account** | [DigitalOcean](https://cloud.digitalocean.com/account/api/tokens) or [Hetzner](https://console.hetzner.cloud/) |
| **Domain Name** | With DNS access to create A record |
| **Claude API Key** | From [Anthropic Console](https://console.anthropic.com/settings/keys) |
| **SSH Hardening** | **Important:** Follow [SSH hardening guidelines](./COMPLETE_SETUP_GUIDE.md#step-63-production-hardening) after deployment |

#### Cost Estimates

| Provider | Size | RAM | Monthly Cost |
|----------|------|-----|--------------|
| Hetzner CX21 | 2 vCPU | 4GB | ~$5 |
| Hetzner CX31 | 2 vCPU | 8GB | ~$10 |
| DigitalOcean s-2vcpu-4gb | 2 vCPU | 4GB | ~$24 |
| DigitalOcean s-4vcpu-8gb | 4 vCPU | 8GB | ~$48 |

**Recommendation:** Start with Hetzner CX31 ($10/month) for staging environments.

#### Quick Deploy

```bash
cd infrastructure/terraform/vps

# 1. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with:
#   - cloud_provider: "hetzner" or "digitalocean"
#   - do_token or hcloud_token: Your API token
#   - domain: Your domain (e.g., "app.example.com")
#   - email: For Let's Encrypt certificates
#   - claude_api_key: Your Anthropic API key

# 2. Deploy (takes ~5-10 minutes)
terraform init
terraform plan    # Review changes
terraform apply   # Confirm with 'yes'

# 3. Configure DNS (one A record)
# Terraform outputs the required DNS record:
#   A    app.example.com    → <VPS_IP>

# 4. Access your deployment
terraform output app_url        # Main URL
terraform output keycloak_url   # Keycloak admin
```

#### What Gets Deployed

```
Internet → Caddy (HTTPS/TLS) → Docker Containers
           ├── /              → Corporate Website
           ├── /auth/*        → Keycloak (SSO)
           ├── /api/*         → MCP Gateway (AI)
           ├── /app/*         → Web Portal
           ├── /hr/*          → HR App
           ├── /finance/*     → Finance App
           ├── /sales/*       → Sales App
           └── /support/*     → Support App
                    ↓
           [Internal Network]
           PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
           (No external ports - databases internal only)
```

#### Automated Updates

Once deployed, updates are automatic via GitHub Actions:
- Push to `main` branch triggers deployment
- No SSH access required
- Rollback via git revert

**📖 Full Guide:** [VPS Deployment Guide](../../infrastructure/terraform/vps/README.md) - includes troubleshooting, security details, and cleanup instructions.

### Cloud Deployment (GCP/AWS)

For enterprise cloud deployment:

1. **Review Security**:
   - Change all default passwords
   - Use Secret Manager for credentials
   - Enable mTLS between services
   - Configure firewall rules

2. **Scale Services**:
   ```bash
   docker compose up -d --scale mcp-hr=3
   ```

3. **Configure Monitoring**:
   - Prometheus for metrics
   - Grafana for dashboards
   - Loki for log aggregation

4. **Set up CI/CD**:
   - GitHub Actions for builds
   - Automated testing
   - Blue-green deployment

See [Production Deployment Guide](./PRODUCTION.md) for details.

---

## Staging Environment

### Current Deployment

**Status**: ✅ Operational (deployed 2025-12-29 03:29 UTC)

**Infrastructure:**
- **VPS**: Hetzner CPX31 (4 vCPU, 8GB RAM, 160GB NVMe)
- **IP**: Set via `$VPS_HOST` (get from Terraform: `terraform output -raw vps_ip`)
- **Location**: Hillsboro, Oregon (hil datacenter)
- **Domain**: vps.tamshai.com (via Cloudflare)

**Services Running:**
- All 18 containers healthy
- Caddy reverse proxy serving website
- Vault for secrets management
- Full stack: PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO

**Access:**
- Website: https://vps.tamshai.com
- Keycloak: https://vps.tamshai.com/auth
- API Gateway: https://vps.tamshai.com/api
- MCP Gateway: http://$VPS_HOST:3100 (internal)

### Cloudflare Configuration

Since tamshai.com is hosted on Cloudflare, follow these steps to connect to the VPS:

#### Step 1: Configure DNS Record

In Cloudflare Dashboard:
1. Go to **DNS** tab
2. Add/Update A record:
   ```
   Type: A
   Name: vps (for vps.tamshai.com)
   IPv4 Address: <VPS_IP from terraform output>
   Proxy status: Proxied (orange cloud icon)
   TTL: Auto
   ```

#### Step 2: Set SSL/TLS Mode

In Cloudflare Dashboard → **SSL/TLS** tab:
- **Recommended**: **Flexible** (Cloudflare ↔ Visitor: HTTPS, Cloudflare ↔ Origin: HTTP)
- **Alternative**: **Full** (requires HTTPS on origin - Caddy will auto-provision)

**Why Flexible is fine:**
- Caddy is behind Cloudflare's proxy
- Cloudflare handles all public SSL/TLS
- Origin server (VPS) only needs HTTP
- Cloudflare provides DDoS protection and caching

#### Step 3: Verify Connection

After DNS propagates (5-10 minutes):
```bash
# Test from your machine
curl -I https://tamshai.com
curl -I https://www.tamshai.com

# Should return HTTP 200 and serve website
```

#### Optional: Cloudflare Page Rules

Add page rules for better performance:
1. **Cache Everything** for static content:
   ```
   URL: tamshai.com/assets/*
   Settings: Cache Level = Cache Everything
   ```

2. **Redirect www to apex**:
   ```
   URL: www.tamshai.com/*
   Settings: Forwarding URL (301) = https://tamshai.com/$1
   ```

### Future Subdomain Routing

When ready to expose applications, update Caddyfile on VPS:

```bash
ssh root@$VPS_HOST  # Use IP, not domain (Cloudflare can't proxy SSH)

# Edit Caddyfile
nano /opt/caddy/Caddyfile

# Add subdomain routing:
# app.tamshai.com {
#     reverse_proxy localhost:4000  # Web portal
# }
#
# api.tamshai.com {
#     reverse_proxy localhost:8100  # Kong Gateway
# }
#
# auth.tamshai.com {
#     reverse_proxy localhost:8180  # Keycloak
# }

# Restart Caddy
cd /opt/caddy && docker compose restart
```

Then add corresponding A records in Cloudflare for each subdomain.

---

## Support & Resources

- **Documentation**: `docs/architecture/V1.4_IMPLEMENTATION_SUMMARY.md`
- **Code Examples**: `docs/development/V1.4_CODE_EXAMPLES.md`
- **Architecture Overview**: `docs/architecture/overview.md`
- **GitHub Issues**: https://github.com/jcornell3/tamshai-enterprise-ai/issues

---

*Last Updated: January 13, 2026*
*Architecture Version: 1.4.2*
*All services operational and ready for deployment ✅*
