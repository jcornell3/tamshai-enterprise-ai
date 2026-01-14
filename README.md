# Tamshai Enterprise AI

[![CI](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml)
[![Security](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml)
[![qlty](https://qlty.sh/badges/jcornell3/tamshai-enterprise-ai/maintainability.svg)](https://qlty.sh/gh/jcornell3/tamshai-enterprise-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Architecture: v1.4](https://img.shields.io/badge/Architecture-v1.4-blue)
![Status: VPS Staging Deployed](https://img.shields.io/badge/Status-VPS%20Staging%20Deployed-brightgreen)

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees use AI assistants while data access respects existing security boundaries through defense-in-depth architecture.

> **New to the project?** See the [Quick Start Deployment Guide](docs/deployment/QUICK_START.md) for complete prerequisites, dependency installation, and step-by-step setup instructions.

## Architecture

```
                    ┌─────────────────┐
                    │   Clients       │
                    │ (Flutter/Web)   │
                    └────────┬────────┘
                             │ HTTPS + JWT
                    ┌────────▼────────┐
                    │  Caddy Proxy    │
                    │  (TLS/Routing)  │
                    └────────┬────────┘
                             │
   ┌─────────────────────────┼─────────────────────────┐
   │            │            │            │            │
┌──▼──┐   ┌─────▼─────┐  ┌───▼───┐  ┌────▼────┐  ┌────▼────┐
│ Web │   │ Keycloak  │  │  MCP  │  │  Web    │  │ Flutter │
│Site │   │ (Auth)    │  │Gateway│  │  Apps   │  │ Client  │
└─────┘   └───────────┘  └───┬───┘  └─────────┘  └─────────┘
                             │
        ┌────────────┬───────┼───────┬────────────┐
        │            │       │       │            │
┌───────▼───────┐ ┌──▼───────▼───┐ ┌─▼────────┐ ┌─▼──────────┐
│    MCP HR     │ │ MCP Finance  │ │MCP Sales │ │MCP Support │
│  (Employees)  │ │  (Budgets)   │ │  (CRM)   │ │ (Tickets)  │
└───────┬───────┘ └──────┬───────┘ └────┬─────┘ └─────┬──────┘
        │                │              │             │
┌───────▼───────┐ ┌──────▼───────┐ ┌────▼─────┐ ┌─────▼──────┐
│  PostgreSQL   │ │  PostgreSQL  │ │ MongoDB  │ │Elasticsearch│
└───────────────┘ └──────────────┘ └──────────┘ └────────────┘
```

## Features

### Core Capabilities
- **Secure AI Access**: Claude AI integration with role-based access control
- **Defense in Depth**: 6 security layers from network to data
- **SSO with MFA**: Keycloak with TOTP/WebAuthn support
- **MCP Protocol**: Model Context Protocol for secure AI-to-data communication
- **Multi-Platform**: Flutter clients for Windows, macOS, Linux, Android
- **Enterprise Ready**: Audit logging, token revocation, rate limiting

### v1.4 Enhancements (Current)
- **SSE Streaming**: Real-time AI response streaming via Server-Sent Events
- **Truncation Warnings**: AI-visible warnings when data exceeds query limits
- **Human-in-the-Loop**: Confirmation flow for destructive operations (delete, update)
- **LLM-Friendly Errors**: Structured error responses with suggested actions for AI self-correction

## Infrastructure Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Containers** | Docker Compose | Local dev & CI orchestration |
| **Infrastructure as Code** | Terraform | Dev, VPS, and GCP deployment |
| **Reverse Proxy** | Caddy | HTTPS termination, path-based routing |
| **Identity** | Keycloak | SSO, OIDC, TOTP MFA |
| **API Gateway** | Kong | Rate limiting, JWT validation |
| **AI Orchestration** | MCP Gateway (Node.js) | Claude API integration, prompt defense |
| **Databases** | PostgreSQL, MongoDB, Elasticsearch, Redis | Domain data, search, caching |
| **CI/CD** | GitHub Actions | Automated testing, VPS deployment |
| **Secrets** | HashiCorp Vault | SSH certificates for VPS access |

### Multi-Environment Deployment

| Environment | Platform | Method | Status |
|-------------|----------|--------|--------|
| **CI** | GitHub Actions | Docker Compose | ✅ Automated |
| **Dev** | Docker Desktop | Terraform + Docker Compose | ✅ Local |
| **Stage** | Hetzner Cloud (CPX31) | Terraform + GitHub Actions (Vault SSH) | ✅ Deployed (vps.tamshai.com) |
| **Prod** | Google Cloud Run | Terraform + Cloud Run | ✅ Phase 1 Complete |

## Quick Start

> **Complete Setup Guide**: For detailed prerequisites including all required and optional dependencies, platform-specific setup (Windows/macOS/Linux), and troubleshooting, see the **[Quick Start Deployment Guide](docs/deployment/QUICK_START.md)**.

### Prerequisites

#### Required Software

| Software | Version | Purpose | Download |
|----------|---------|---------|----------|
| **Git** | 2.40+ | Version control | [git-scm.com](https://git-scm.com/downloads) |
| **Docker Desktop** | 4.0+ | Container runtime | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Node.js** | 20 LTS | MCP Gateway, tests | [nodejs.org](https://nodejs.org/) |
| **Flutter** | 3.24+ | Desktop/mobile client | [flutter.dev](https://docs.flutter.dev/get-started/install) |
| **Terraform** | 1.5+ | Infrastructure deployment | [terraform.io](https://developer.hashicorp.com/terraform/install) |
| **GitHub CLI** | 2.40+ | CI/CD, workflow triggers | [cli.github.com](https://cli.github.com/) |

#### Windows-Specific Requirements

For Flutter Windows desktop development:

1. **Visual Studio 2022** (Community edition is free)
   - Download: [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/)
   - Required workloads during installation:
     - **"Desktop development with C++"**
     - Windows 10/11 SDK (10.0.19041.0 or later)
   - Or install via command line:
     ```powershell
     winget install Microsoft.VisualStudio.2022.Community
     # Then run Visual Studio Installer and add C++ workload
     ```

2. **Flutter Windows Desktop Support**
   ```powershell
   flutter doctor          # Verify installation
   flutter config --enable-windows-desktop
   ```

#### macOS-Specific Requirements

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CocoaPods (for iOS/macOS)
sudo gem install cocoapods

# Enable macOS desktop
flutter config --enable-macos-desktop
```

#### Linux-Specific Requirements

```bash
# Ubuntu/Debian
sudo apt-get install clang cmake ninja-build pkg-config \
  libgtk-3-dev liblzma-dev libstdc++-12-dev

# Enable Linux desktop
flutter config --enable-linux-desktop
```

#### Android Development Requirements

For Flutter Android development (mobile app):

1. **Java Development Kit (JDK) 17**
   - Download from [Adoptium](https://adoptium.net/temurin/releases/?version=17)
   - Or via command line:
     ```bash
     # Windows (PowerShell) - Download and extract to C:\Users\<username>\Java
     curl -L -o jdk17.zip "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"

     # macOS
     brew install openjdk@17

     # Ubuntu/Debian
     sudo apt install openjdk-17-jdk
     ```

2. **Android SDK Command-Line Tools**
   - Download from [Android Developer](https://developer.android.com/studio#command-line-tools-only)
   - Extract to `Android/Sdk/cmdline-tools/latest/`
   - Or via command line:
     ```bash
     # Windows - Create SDK directory and download
     mkdir -p ~/Android/Sdk/cmdline-tools
     curl -o ~/Android/commandlinetools.zip https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
     unzip ~/Android/commandlinetools.zip -d ~/Android/Sdk/cmdline-tools
     mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
     ```

3. **Install SDK Packages** (requires JAVA_HOME set)
   ```bash
   # Set JAVA_HOME (adjust path to your JDK location)
   export JAVA_HOME="/c/Users/<username>/Java/jdk-17.0.17+10"  # Windows Git Bash
   # or
   export JAVA_HOME="$HOME/Java/jdk-17.0.17+10"  # macOS/Linux

   # Install required packages
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME \
     "platform-tools" "build-tools;34.0.0" "platforms;android-34" "platforms;android-36"

   # Accept all licenses
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
   ```

4. **Configure Flutter**
   ```bash
   # Point Flutter to your SDK and JDK
   flutter config --android-sdk ~/Android/Sdk
   flutter config --jdk-dir ~/Java/jdk-17.0.17+10

   # Verify setup
   flutter doctor -v
   ```

5. **Environment Variables** (add to shell profile)
   ```bash
   export ANDROID_HOME="$HOME/Android/Sdk"
   export JAVA_HOME="$HOME/Java/jdk-17.0.17+10"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
   ```

#### System Requirements

- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 20GB free space
- **OS**: Windows 10/11, macOS 12+, or Ubuntu 20.04+

### Verify Installation

Run these commands to verify your development environment:

```bash
# Git
git --version              # Should be 2.40+

# Docker
docker --version           # Should be 24.0+
docker compose version     # Should be v2.20+

# Node.js
node --version             # Should be v20+
npm --version              # Should be 10+

# Flutter
flutter --version          # Should be 3.24+
flutter doctor             # Should show all green checkmarks
```

### Development Setup

#### 1. Add Hosts File Entry (One-Time)

The dev environment uses HTTPS at `https://www.tamshai.local`. Add this entry to your hosts file:

**Windows** (run PowerShell as Administrator):
```powershell
Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 tamshai.local www.tamshai.local"
```

**macOS/Linux**:
```bash
echo "127.0.0.1 tamshai.local www.tamshai.local" | sudo tee -a /etc/hosts
```

#### 2. Clone and Configure

```bash
# Clone repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git
cd tamshai-enterprise-ai

# Set environment variables (one-time)
# Windows PowerShell:
.\scripts\setup-terraform-dev-env.ps1

# Or manually set TF_VAR_claude_api_key environment variable
# Get your API key from https://console.anthropic.com
```

#### 3. Deploy with Terraform (Recommended)

```bash
cd infrastructure/terraform/dev
terraform init                          # First time only
terraform apply -var-file=dev.tfvars    # Deploy all services

# Access the application
# https://www.tamshai.local (accept self-signed certificate warning)
```

#### Alternative: Docker Compose Only

```bash
cd infrastructure/docker
cp .env.example .env
# Edit .env with your CLAUDE_API_KEY
docker compose up -d
```

#### Legacy Setup Script (Deprecated)

```bash
./scripts/setup-dev.sh  # Still works but Terraform is preferred
```

### Flutter Client Setup

```bash
cd clients/unified_flutter

# Get dependencies
flutter pub get

# Generate code (Freezed models)
flutter pub run build_runner build --delete-conflicting-outputs

# Run on Windows
flutter run -d windows

# Run on macOS
flutter run -d macos

# Run on Linux
flutter run -d linux

# Run on Android (requires connected device or emulator)
flutter run -d android

# Build Android APK
flutter build apk --release

# Build Android App Bundle (for Play Store)
flutter build appbundle --release
```

### Access Services

**Primary Access** (via Caddy HTTPS proxy):
| Service | URL | Notes |
|---------|-----|-------|
| Main Application | https://www.tamshai.local | Accept self-signed cert |
| Keycloak Auth | https://www.tamshai.local/auth | SSO login |
| API Gateway | https://www.tamshai.local/api | Kong-proxied APIs |

**Direct Service Access** (for debugging):
| Service | URL | Credentials |
|---------|-----|-------------|
| Keycloak Admin | http://localhost:8180 | admin / admin |
| MCP Gateway | http://localhost:3100 | JWT required |
| Kong Gateway | http://localhost:8100 | - |
| MinIO Console | http://localhost:9102 | minioadmin / minioadmin |

### Test Users

All users: password `[REDACTED-DEV-PASSWORD]`, TOTP secret `[REDACTED-DEV-TOTP]`

| Username | Role | Access |
|----------|------|--------|
| eve.thompson | executive | All departments (read) |
| alice.chen | hr-read, hr-write | HR data |
| bob.martinez | finance-read, finance-write | Finance data |
| carol.johnson | sales-read, sales-write | Sales/CRM data |
| dan.williams | support-read, support-write | Tickets, KB |

**E2E Test User**: `test-user.journey` (exists in all environments, no data access)

## Project Structure

```
tamshai-enterprise-ai/
├── services/
│   ├── mcp-gateway/        # AI orchestration service (Node.js) - Claude API integration
│   ├── mcp-hr/             # HR data MCP server (PostgreSQL)
│   ├── mcp-finance/        # Finance data MCP server (PostgreSQL)
│   ├── mcp-sales/          # Sales/CRM MCP server (MongoDB)
│   └── mcp-support/        # Support ticket MCP server (Elasticsearch/MongoDB)
├── clients/
│   ├── unified_flutter/    # Cross-platform Flutter client (Windows/macOS/Linux/Android)
│   └── web/                # Web client packages (auth, portal)
├── apps/
│   ├── tamshai-website/    # Corporate website (static HTML/CSS)
│   └── web/                # Web portal applications (HR, Finance, Sales, Support)
├── infrastructure/
│   ├── docker/             # Docker Compose configs for dev/stage
│   └── terraform/          # IaC for dev, VPS, and GCP deployment
├── keycloak/               # Keycloak realm configuration and sync scripts
├── sample-data/            # Sample data for development (SQL, JS, NDJSON)
├── scripts/                # Utility scripts (infra, MCP, testing)
├── docs/                   # Documentation (architecture, deployment, security)
└── tests/
    ├── e2e/                # Playwright E2E tests with TOTP support
    ├── integration/        # Integration tests
    └── performance/        # k6 performance tests
```

## Development

### MCP Gateway

```bash
cd services/mcp-gateway
npm install
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm test         # Run unit tests
npm run lint     # Lint code
```

### Flutter Client

```bash
cd clients/unified_flutter
flutter pub get
flutter run -d windows  # or macos, linux
flutter test            # Run widget tests
```

### Integration Tests

```bash
cd tests/integration
npm install
npm test  # Requires running Docker services
```

## Deployment

### CI/CD Pipeline

The project uses GitHub Actions for automated testing and deployment:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR | Lint, type check, unit tests, integration tests |
| `codeql.yml` | Push/PR/Weekly | Security scanning (SAST) |
| `security.yml` | Push/PR | Dependency audit, secret detection |
| `deploy-vps.yml` | Push to main | Automated VPS deployment via Vault SSH |

### VPS Staging (Current)

The staging environment runs on Hetzner Cloud with automated deployments:

```bash
# Manual deployment (if needed)
cd infrastructure/terraform/vps
terraform init
terraform apply

# Or trigger via GitHub Actions
gh workflow run deploy-vps.yml --ref main
```

**Access**: Configured via Cloudflare (see deployment secrets)

See [VPS Deployment Guide](infrastructure/terraform/vps/README.md) for details.

### GCP Production

Production is deployed on Google Cloud Run with Cloud SQL and Memorystore:

```bash
cd infrastructure/terraform/gcp
terraform init
terraform apply -var-file=prod.tfvars
```

**Current Production Status**:
- Phase 1 Complete: Core infrastructure, Cloud Run services, Keycloak
- MCP Gateway and HR/Finance services operational
- Automated deployments via GitHub Actions

See [infrastructure/terraform/gcp/README.md](infrastructure/terraform/gcp/README.md) for GCP configuration and [docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md](docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md) for deployment details.

## Security

- **Authentication**: Keycloak OIDC with PKCE
- **Authorization**: Hierarchical RBAC with role inheritance
- **Token Security**: 5-min access tokens, Redis revocation cache
- **API Security**: Kong rate limiting, input validation
- **Prompt Defense**: 5-layer prompt injection prevention
- **Data Security**: PostgreSQL RLS, field-level masking

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Documentation

### Getting Started
- [Quick Start Deployment Guide](docs/deployment/QUICK_START.md) - Prerequisites, dependencies, and setup
- [CLAUDE.md](CLAUDE.md) - Comprehensive development guide
- [Terraform Dev Setup](infrastructure/terraform/dev/README.md) - Local development with Terraform

### Architecture
- [Architecture Overview](docs/architecture/overview.md)
- [Security Model](docs/architecture/security-model.md)
- [Architecture Specs](.specify/ARCHITECTURE_SPECS.md) - All specifications and ADRs
- [v1.4 Implementation Summary](docs/architecture/V1.4_IMPLEMENTATION_SUMMARY.md) - SSE streaming, truncation warnings, HITL

### Infrastructure
- [Port Allocation](docs/development/PORT_ALLOCATION.md) - Service port assignments
- [VPS Deployment](infrastructure/terraform/vps/README.md) - Hetzner Cloud setup
- [GCP Production Deployment](docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md) - Cloud Run deployment
- [Terraform State Security](docs/security/TERRAFORM_STATE_SECURITY.md)

### Testing
- [Test User Journey](docs/testing/TEST_USER_JOURNEY.md) - E2E test user documentation
- [Keycloak User Testing](docs/troubleshooting/KEYCLOAK_USER_TESTING_METHODOLOGIES.md) - Testing methodologies

### Contributing
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## Support

- [GitHub Issues](https://github.com/jcornell3/tamshai-enterprise-ai/issues)
- [Security Issues](SECURITY.md)
