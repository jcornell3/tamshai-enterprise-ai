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

- Docker Desktop 4.0+ with Docker Compose v2
- Node.js 20+ and npm 10+
- 8GB RAM minimum (16GB recommended)

### Development Setup

```bash
# Clone repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git
cd tamshai-enterprise-ai

# Run setup script
./scripts/setup-dev.sh

# Or manual setup:
cd infrastructure/docker
cp .env.example .env
# Edit .env with your CLAUDE_API_KEY
docker compose up -d
```

### Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Keycloak Admin | http://localhost:8180 | admin / admin |
| MCP Gateway | http://localhost:3100 | JWT required |
| Kong Gateway | http://localhost:8100 | - |

### Test Users

All users: password `password123`, TOTP secret `JBSWY3DPEHPK3PXP`

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
