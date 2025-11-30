# Tamshai Corp Enterprise AI Access System

[![Status](https://img.shields.io/badge/Status-Approved-green.svg)](docs/architecture/)
[![Version](https://img.shields.io/badge/Version-1.3%20FINAL-blue.svg)](docs/architecture/)
[![Security Review](https://img.shields.io/badge/Security%20Review-Passed-green.svg)](docs/architecture/)

## Overview

Enterprise AI Access System enabling secure Claude AI integration with role-based data access. Employees can use AI assistants while ensuring data access respects existing security boundaries.

**Approval Status:** ✅ Fully Approved for Implementation
- Technical Lead: Gemini 3 Thinking (Approved)
- Security Reviewer: ChatGPT 5.1 (Approved)  
- Project Sponsor: John Cornell (Approved)

## Architecture Highlights

- **SSO + MFA**: Keycloak with TOTP (standard users) and WebAuthn (privileged roles in production)
- **Hierarchical Access**: Self → Manager → HR → Executive access model
- **AI Security**: Prompt injection defense, tool allow-listing, field masking for LLM
- **Defense in Depth**: Kong Gateway → MCP Gateway → MCP Servers → RLS/App Filters → Databases
- **Comprehensive Audit**: AI-specific logging with intent, justification, and PII scrubbing

## Quick Start

### Prerequisites

- Docker Desktop with Docker Compose
- Node.js 18+ and npm
- 8GB RAM minimum

### Setup

```bash
# Clone the repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git
cd tamshai-enterprise-ai

# Run setup script
./scripts/setup-dev.sh
```

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Keycloak Admin | http://localhost:8180 | admin / admin |
| API Gateway | http://localhost:8100 | - |
| MCP Gateway | http://localhost:3100 | - |
| MinIO Console | http://localhost:9102 | minioadmin / minioadmin |

### Test Users

All users have password: `[REDACTED-DEV-PASSWORD]` and must configure TOTP on first login.

| User | Role | Access |
|------|------|--------|
| eve.thompson | CEO | Executive (all read) |
| alice.chen | VP of HR | HR (all employees) |
| bob.martinez | Finance Director | Finance (all finance) |
| nina.patel | Engineering Manager | Manager (team only) |
| marcus.johnson | Software Engineer | Self only |

## Project Structure

```
tamshai-enterprise-ai/
├── docs/                    # Documentation
│   ├── architecture/        # Architecture documents (v1.3 FINAL)
│   └── development/         # Development guides
├── infrastructure/
│   ├── docker/              # Docker Compose setup
│   ├── kubernetes/          # K8s manifests (production)
│   └── gcp/                 # GCP Terraform (production)
├── services/
│   └── mcp-gateway/         # AI orchestration service
├── sample-data/             # Test data and SQL scripts
└── scripts/                 # Setup and utility scripts
```

## Documentation

- [Architecture Document v1.3 FINAL](docs/architecture/) - Full approved architecture
- [Port Allocation](docs/development/PORT_ALLOCATION.md) - Service ports and networking
- [Security Model](docs/architecture/) - Defense-in-depth details

## Security Features

### Authentication & Authorization
- OIDC with Keycloak (SSO)
- TOTP MFA for all users
- WebAuthn/FIDO2 for privileged roles (production)
- JWT token propagation with 5-minute lifetime
- Redis-backed token revocation

### AI-Specific Security
- Prompt injection defense (5 layers)
- Tool allow-listing per role
- Field-level masking before LLM
- Query result limits (50 records max)
- AI audit logging with PII scrubbing

### Infrastructure Security
- mTLS for service-to-service
- PostgreSQL Row Level Security (HR data)
- Application-level filters (MongoDB, Elasticsearch)
- Encryption at rest (all data stores)
- Network segmentation with egress whitelist

## Development Phases

1. ✅ Foundation - Docker, Keycloak, Redis
2. 🔄 Security Layer - mTLS, RLS, audit logging
3. ⏳ MCP Core - Gateway with AI security
4. ⏳ MCP Suite - HR, Finance, Sales, Support servers
5. ⏳ Sample Apps - Web applications
6. ⏳ AI Desktop - Electron app
7. ⏳ Ops Tooling - Rate limiting, monitoring
8. ⏳ Production - K8s deployment
9. ⏳ Documentation - Final docs

## Environment Strategy

| Aspect | PoC (Current) | Production |
|--------|---------------|------------|
| Data | Dummy/synthetic | Real enterprise data |
| LLM | Claude Pro | Claude Enterprise or local |
| Device Trust | BYOD | MDM required |
| Admin MFA | TOTP | WebAuthn required |
| RPO/RTO | 1 day | 4 hours / 1 hour |

## Cost Estimates

- **PoC**: ~$25-35/month
- **Production HA**: ~$300-400/month

## Contributing

This is an internal project. Contact the project team for contribution guidelines.

## License

Proprietary - Tamshai Corp Internal Use Only

## Contacts

- Project Sponsor: John Cornell
- Technical Lead: [Internal Contact]
- Security: [Internal Contact]

---

*Architecture v1.3 FINAL - Approved November 30, 2025*
