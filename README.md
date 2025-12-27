# Tamshai Enterprise AI

[![CI](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml)
[![Security](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml)
[![qlty](https://qlty.sh/badges/jcornell3/tamshai-enterprise-ai/maintainability.svg)](https://qlty.sh/gh/jcornell3/tamshai-enterprise-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees use AI assistants while data access respects existing security boundaries through defense-in-depth architecture.

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
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌──────▼──────┐
│   Keycloak    │   │   MCP Gateway   │   │  Web Apps   │
│   (Auth/SSO)  │   │ (AI Orchestrate)│   │  (Portal)   │
└───────────────┘   └────────┬────────┘   └─────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌──────▼──────┐
│    MCP HR     │   │  MCP Finance    │   │  MCP Sales  │
│   (Employee)  │   │   (Budgets)     │   │    (CRM)    │
└───────┬───────┘   └────────┬────────┘   └──────┬──────┘
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌──────▼──────┐
│  PostgreSQL   │   │   PostgreSQL    │   │   MongoDB   │
└───────────────┘   └─────────────────┘   └─────────────┘
```

## Features

- **Secure AI Access**: Claude AI integration with role-based access control
- **Defense in Depth**: 6 security layers from network to data
- **SSO with MFA**: Keycloak with TOTP/WebAuthn support
- **MCP Protocol**: Model Context Protocol for secure AI-to-data communication
- **Multi-Platform**: Flutter clients for Windows, macOS, Linux, iOS, Android
- **Enterprise Ready**: Audit logging, token revocation, rate limiting

## Quick Start

### Prerequisites

#### Required Software

| Software | Version | Purpose | Download |
|----------|---------|---------|----------|
| **Git** | 2.40+ | Version control | [git-scm.com](https://git-scm.com/downloads) |
| **Docker Desktop** | 4.0+ | Container runtime | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Node.js** | 20 LTS | MCP Gateway, tests | [nodejs.org](https://nodejs.org/) |
| **Flutter** | 3.24+ | Desktop/mobile client | [flutter.dev](https://docs.flutter.dev/get-started/install) |

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

```bash
# Clone repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git
cd tamshai-enterprise-ai

# Run setup script (recommended)
./scripts/setup-dev.sh

# Or manual setup:
cd infrastructure/docker
cp .env.example .env
# Edit .env with your CLAUDE_API_KEY from console.anthropic.com
docker compose up -d
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
```

### Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Keycloak Admin | http://localhost:8180 | admin / admin |
| MCP Gateway | http://localhost:3100 | JWT required |
| Kong Gateway | http://localhost:8100 | - |

### Test Users

All users: password `[REDACTED-DEV-PASSWORD]`, TOTP secret `[REDACTED-DEV-TOTP]`

| Username | Role | Access |
|----------|------|--------|
| eve.thompson | executive | All departments |
| alice.chen | hr-read, hr-write | HR data |
| bob.martinez | finance-read, finance-write | Finance data |
| carol.johnson | sales-read, sales-write | Sales/CRM data |

## Project Structure

```
tamshai-enterprise-ai/
├── services/
│   ├── mcp-gateway/        # AI orchestration service (Node.js)
│   ├── mcp-hr/             # HR data MCP server
│   ├── mcp-finance/        # Finance data MCP server
│   ├── mcp-sales/          # Sales/CRM MCP server
│   └── mcp-support/        # Support ticket MCP server
├── clients/
│   └── unified_flutter/    # Cross-platform Flutter client
├── apps/
│   └── web/                # Web portal applications
├── infrastructure/
│   ├── docker/             # Docker Compose configs
│   └── terraform/          # IaC for cloud deployment
├── keycloak/               # Keycloak realm configuration
├── sample-data/            # Sample data for development
└── tests/
    └── integration/        # Integration tests
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

### VPS Deployment (Hetzner/DigitalOcean)

```bash
cd infrastructure/terraform/vps
cp terraform.tfvars.example terraform.tfvars
# Edit with your values
terraform init
terraform apply
```

See [VPS Deployment Guide](infrastructure/terraform/vps/README.md) for details.

## Security

- **Authentication**: Keycloak OIDC with PKCE
- **Authorization**: Hierarchical RBAC with role inheritance
- **Token Security**: 5-min access tokens, Redis revocation cache
- **API Security**: Kong rate limiting, input validation
- **Prompt Defense**: 5-layer prompt injection prevention
- **Data Security**: PostgreSQL RLS, field-level masking

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Documentation

- [CLAUDE.md](CLAUDE.md) - Comprehensive development guide
- [Architecture Overview](docs/architecture/overview.md)
- [Security Model](docs/architecture/security-model.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## Support

- [GitHub Issues](https://github.com/jcornell3/tamshai-enterprise-ai/issues)
- [Security Issues](SECURITY.md)
