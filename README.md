# Tamshai Enterprise AI

[![](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/ci.yml)  
[![](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/codeql.yml)  
[![](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml/badge.svg)](https://github.com/jcornell3/tamshai-enterprise-ai/actions/workflows/security.yml)  
[![](https://qlty.sh/badges/jcornell3/tamshai-enterprise-ai/maintainability.svg)](https://qlty.sh/gh/jcornell3/tamshai-enterprise-ai)  
[![](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)  
![](https://img.shields.io/badge/Architecture-v1.5-blue)  
![](https://img.shields.io/badge/Status-Production%20Deployed-brightgreen)

Enterprise-grade AI access system enabling secure Claude AI integration with role-based data access. Employees use AI assistants while data access respects existing security boundaries through defense-in-depth architecture.

> **New to the project?** See the [Quick Start Deployment Guide](docs/deployment/QUICK_START.md) for complete prerequisites, dependency installation, and step-by-step setup instructions. 

## Background

The project was completely coded by Claude Code, with architectural oversight by Gemini Pro and ChatGPT acted as a compliance officer (security, S-OX, GDPR, SOC-2). But before anyone says this was "vibe-coded", I challenge you. The AIs (as of January 2026) are absolutely great at coding. However, I had to spend two months, 10 hours/day managing these AI junior coders. Issues that I encountered are the AI's desire to take the easiest short-term path, wanting to implement hacks vs true fixes, and a gradual reduction in context windows over time that resulted in poor decisions and outright deviations from project goals. As someone with 40+ years in coding and infrastructure experience, it's absolutely necessary to have senior skills to oversee AI coding, especially with complex full-stack development that requires process inter-dependence and major infrastructure requirements.

The Tamshai Enterprise AI project addresses the critical security gap in deploying Generative AI within the enterprise: maintaining granular data governance. While modern enterprises strictly secure application data using Single Sign-On (SSO) and Group-Based RBAC, standard AI integrations often bypass these controls by accessing data as a high-privileged system user.

This project solves that challenge by implementing **Identity Propagation** between Keycloak (OpenID Connect) and the Model Context Protocol (MCP). Instead of using a shared service account, the system passes the authenticated user's specific identity and group claims directly to the data layer. This enables the enforcement of **Row Level Security (RLS)** for every AI interaction, ensuring that AI agents can only access the specific data resources a user is explicitly authorized to view.

With an architecture vision that I developed, I started this project using GitHub's **Spec-Driven Development (SDD)** to generate a clear set of specs, plans and tasks for Claude Code to implement against. After a month, I added the use of **Test-Driven Development (TDD)** for application (but not infrastructure) development. Now all apps go through a plan/RED phase/GREEN phase process for coding work.

## Architecture 
    
    ` ┌─────────────────┐  
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
    `

## Features

### Core Capabilities

* **Secure AI Access**: Claude AI integration with role-based access control
* **Defense in Depth**: 6 security layers from network to data
* **SSO with MFA**: Keycloak with TOTP/WebAuthn support
* **MCP Protocol**: Model Context Protocol for secure AI-to-data communication
* **Multi-Platform**: Flutter clients for Windows, macOS, Linux, Android
* **Enterprise Ready**: Audit logging, token revocation, rate limiting

### v1.5 Enhancements (Current)

* **Project Journey Agent**: AI-powered MCP server for project onboarding, knowledge indexing, and contextual assistance

### v1.4 Enhancements

* **SSE Streaming**: Real-time AI response streaming via Server-Sent Events
* **Truncation Warnings**: AI-visible warnings when data exceeds query limits
* **Human-in-the-Loop**: Confirmation flow for destructive operations (delete, update)
* **LLM-Friendly Errors**: Structured error responses with suggested actions for AI self-correction

## Infrastructure Stack
Layer
Technology
Purpose
**Containers**
Docker Compose
Local dev & CI orchestration
**Infrastructure as Code**
Terraform
Dev, VPS, and GCP deployment
**Reverse Proxy**
Caddy
HTTPS termination, path-based routing
**Identity**
Keycloak
SSO, OIDC, TOTP MFA
**API Gateway**
Kong
Rate limiting, JWT validation
**AI Orchestration**
MCP Gateway (Node.js)
Claude API integration, prompt defense
**Databases**
PostgreSQL, MongoDB, Elasticsearch, Redis
Domain data, search, caching
**CI/CD**
GitHub Actions
Automated testing, multi-environment deployment
**Secrets - VPS**
HashiCorp Vault
SSH certificates for VPS access
**Secrets - GCP**
GCP Secret Manager
API keys, database credentials, service accounts
**Secrets - CI/CD**
GitHub Secrets
Workflow credentials, deployment keys

### Multi-Environment Deployment
Environment
Platform
Method
Status
**CI**
GitHub Actions
Docker Compose
✅ Automated
**Dev**
Docker Desktop
Terraform + Docker Compose
✅ Local
**Stage**
Hetzner Cloud (CPX31)
Terraform + GitHub Actions (Vault SSH)
✅ Deployed
**Prod**
Google Cloud Run
Terraform + Cloud Run
✅ Deployed

## Quick Start

> **Complete Setup Guide**: For detailed prerequisites including all required and optional dependencies, platform-specific setup (Windows/macOS/Linux), and troubleshooting, see the **[Quick Start Deployment Guide](docs/deployment/QUICK_START.md)**. 

### Prerequisites

#### Required Software
Software
Version
Purpose
Download
**Git**
2.40+
Version control
[git-scm.com](https://git-scm.com/downloads)
**Docker Desktop**
4.0+
Container runtime
[docker.com](https://www.docker.com/products/docker-desktop/)
**Node.js**
20 LTS
MCP Gateway, tests
[nodejs.org](https://nodejs.org/)
**Flutter**
3.24+
Desktop/mobile client
[flutter.dev](https://docs.flutter.dev/get-started/install)
**Terraform**
1.5+
Infrastructure deployment
[terraform.io](https://developer.hashicorp.com/terraform/install)
**GitHub CLI**
2.40+
CI/CD, workflow triggers
[cli.github.com](https://cli.github.com/)

#### Flutter Client Requirements

For Flutter desktop/mobile development, see the [Flutter Client Setup Guide](clients/unified_flutter/README.md) for platform-specific requirements:

* Windows (Visual Studio 2022 with C++ workload)
* macOS (Xcode Command Line Tools, CocoaPods)
* Linux (clang, cmake, ninja-build, GTK3)
* Android (JDK 17, Android SDK)
* iOS (Xcode, CocoaPods)

#### System Requirements

* **RAM**: 8GB minimum, 16GB recommended
* **Disk**: 20GB free space
* **OS**: Windows 10/11, macOS 12+, or Ubuntu 20.04+

### Verify Installation

Run these commands to verify your development environment: 
    
    `# Git  
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
    `

### Development Setup

#### 1\. Add Hosts File Entry (One-Time)

The dev environment uses HTTPS at `https://www.tamshai-playground.local`. Add this entry to your hosts file:

**Windows** (run PowerShell as Administrator): 
    
    `Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "127.0.0.1 tamshai-playground.local www.tamshai-playground.local"  
    `

**macOS/Linux**: 
    
    `echo "127.0.0.1 tamshai-playground.local www.tamshai-playground.local" | sudo tee -a /etc/hosts  
    `

#### 2\. Clone and Configure 
    
    `# Clone repository  
    git clone https://github.com/jcornell3/tamshai-enterprise-ai.git  
    cd tamshai-enterprise-ai  
      
    # Set environment variables (one-time)  
    # Windows PowerShell:  
    .\scripts\setup-terraform-dev-env.ps1  
      
    # Or manually set TF_VAR_claude_api_key environment variable  
    # Get your API key from https://console.anthropic.com  
    `

#### 3\. Deploy with Terraform (Recommended) 
    
    `cd infrastructure/terraform/dev  
    terraform init                          # First time only  
    terraform apply -var-file=dev.tfvars    # Deploy all services  
      
    # Access the application  
    # https://www.tamshai-playground.local (accept self-signed certificate warning)  
    `

#### Alternative: Docker Compose Only 
    
    `cd infrastructure/docker  
    cp .env.example .env  
    # Edit .env with your CLAUDE_API_KEY  
    docker compose up -d  
    `

#### Legacy Setup Script (Deprecated) 
    
    `./scripts/setup-dev.sh  # Still works but Terraform is preferred  
    `

### Flutter Client Setup

See the [Flutter Client Setup Guide](clients/unified_flutter/README.md) for complete instructions. 
    
    `cd clients/unified_flutter  
    flutter pub get  
    flutter pub run build_runner build --delete-conflicting-outputs  
    flutter run -d windows  # or macos, linux, android  
    `

## Project Structure 
    
    `tamshai-enterprise-ai/  
    ├── services/  
    │   ├── mcp-gateway/        # AI orchestration service (Node.js) - Claude API integration  
    │   ├── mcp-journey/        # Project Journey Agent - onboarding & knowledge indexing  
    │   ├── mcp-hr/             # HR data MCP server (PostgreSQL)  
    │   ├── mcp-finance/        # Finance data MCP server (PostgreSQL)  
    │   ├── mcp-sales/          # Sales/CRM MCP server (MongoDB)  
    │   └── mcp-support/        # Support ticket MCP server (Elasticsearch/MongoDB)  
    ├── clients/  
    │   ├── unified_flutter/    # Cross-platform Flutter client (Windows/macOS/Linux/Android)  
    │   └── web/                # Web apps monorepo (Turborepo)  
    │       ├── apps/           # Portal, HR, Finance, Sales, Support web apps  
    │       └── packages/       # Shared packages (auth, ui, tailwind-config)  
    ├── apps/  
    │   └── tamshai-website/    # Corporate website (static HTML/CSS)  
    ├── infrastructure/  
    │   ├── docker/             # Docker Compose configs for dev/stage  
    │   └── terraform/          # IaC for dev, VPS, and GCP deployment  
    ├── keycloak/               # Keycloak realm configuration and sync scripts  
    ├── sample-data/            # Sample data for development (SQL, JS, NDJSON)  
    ├── scripts/                # Utility scripts (infra, MCP, testing, GCP, VPS)  
    ├── docs/                   # Documentation (architecture, deployment, security)  
    └── tests/  
    ├── e2e/                # Playwright E2E tests with TOTP support  
    ├── integration/        # Integration tests  
    ├── performance/        # k6 performance tests  
    └── terraform/          # Terraform validation tests  
    `

## Deployment

### CI/CD Pipeline

The project uses GitHub Actions for automated testing and deployment:
Workflow
Trigger
Purpose
`ci.yml`
Push/PR
Lint, type check, unit tests, integration tests
`codeql.yml`
Push/PR/Weekly
Security scanning (SAST)
`security.yml`
Push/PR
Dependency audit, secret detection
`deploy-vps.yml`
Push to main
Automated VPS deployment via Vault SSH

### VPS Staging

The staging environment runs on Hetzner Cloud with automated deployments.

**Regular Deployment**: 
    
    `# Trigger via GitHub Actions (preferred)  
    gh workflow run deploy-vps.yml --ref main  
      
    # Manual deployment (if needed)  
    cd infrastructure/terraform/vps  
    terraform init  
    terraform apply  
    `

**Phoenix Rebuild** (complete environment rebuild): 
    
    `# Full teardown and rebuild of VPS environment  
    cd infrastructure/terraform/vps  
    terraform destroy -auto-approve  # Destroys VPS completely  
    terraform apply -auto-approve    # Creates fresh VPS (~5-10 min for cloud-init)  
      
    # Trigger deployment after cloud-init completes  
    gh workflow run deploy-vps.yml --ref main  
    `

**Access**: `https://vps.tamshai.com` via Cloudflare

See [VPS Deployment Guide](infrastructure/terraform/vps/README.md) for details.

### GCP Production

Production runs on Google Cloud Run with Cloud SQL and Memorystore.

**Regular Deployment**: 
    
    `# Trigger via GitHub Actions (preferred)  
    gh workflow run deploy-to-gcp.yml --ref main  
      
    # Manual deployment  
    cd infrastructure/terraform/gcp  
    terraform init  
    terraform apply -var-file=prod.tfvars  
    `

**Phoenix Rebuild** (complete environment rebuild): 
    
    `# Pre-flight checks (validate state, check costs)  
    ./scripts/gcp/phoenix-preflight.sh  
      
    # Full rebuild (~30-45 minutes)  
    ./scripts/gcp/phoenix-rebuild.sh  
      
    # Post-rebuild: provision users and sample data  
    gh workflow run provision-prod-users.yml --ref main  
    gh workflow run provision-prod-data.yml --ref main  
    `

**Production Services**:

* All MCP services (Gateway, HR, Finance, Sales, Support) on Cloud Run
* Cloud SQL PostgreSQL for HR/Finance data
* Memorystore Redis for caching
* Keycloak for identity management
* Automated deployments via GitHub Actions

See [GCP Production Guide](infrastructure/terraform/gcp/README.md) and [Phoenix Runbook](docs/operations/PHOENIX_RUNBOOK.md) for details.

## Security

* **Authentication**: Keycloak OIDC with PKCE
* **Authorization**: Hierarchical RBAC with role inheritance
* **Token Security**: 5-min access tokens, Redis revocation cache
* **API Security**: Kong rate limiting, input validation
* **Prompt Defense**: 5-layer prompt injection prevention
* **Data Security**: PostgreSQL RLS, field-level masking

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Documentation

### Getting Started

* [Quick Start Deployment Guide](docs/deployment/QUICK_START.md) - Prerequisites, dependencies, and setup
* [CLAUDE.md](CLAUDE.md) - Comprehensive development guide
* [Terraform Dev Setup](infrastructure/terraform/dev/README.md) - Local development with Terraform

### Architecture

* [Architecture Overview](docs/architecture/overview.md)
* [Security Model](docs/architecture/security-model.md)
* [Architecture Specs](.specify/ARCHITECTURE_SPECS.md) - All specifications and ADRs
* [v1.4 Implementation Summary](docs/architecture/V1.4_IMPLEMENTATION_SUMMARY.md) - SSE streaming, truncation warnings, HITL

### Infrastructure

* [Port Allocation](docs/development/PORT_ALLOCATION.md) - Service port assignments
* [VPS Deployment](infrastructure/terraform/vps/README.md) - Hetzner Cloud setup
* [GCP Production Deployment](docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md) - Cloud Run deployment
* [Terraform State Security](docs/security/TERRAFORM_STATE_SECURITY.md)

### Testing

* [Test User Journey](docs/testing/TEST_USER_JOURNEY.md) - E2E test user documentation
* [Keycloak User Testing](docs/troubleshooting/KEYCLOAK_USER_TESTING_METHODOLOGIES.md) - Testing methodologies

### Contributing

* [Contributing Guide](CONTRIBUTING.md)
* [Changelog](CHANGELOG.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## Support

* [GitHub Issues](https://github.com/jcornell3/tamshai-enterprise-ai/issues)
* [Security Issues](SECURITY.md)
<!-- MCP-CONFIG-START
{
  "$schema": "https://modelcontextprotocol.io/schema/v1/server-config.json",
  "name": "tamshai-journey",
  "description": "Tamshai Project Journey Agent - AI-powered project history and onboarding assistant",
  "type": "http",
  "environments": {
    "dev": {
      "base_url": "https://www.tamshai-playground.local/mcp-journey"
    },
    "stage": {
      "base_url": "https://www.tamshai.com/mcp-journey"
    }
  },
  "endpoints": {
    "health": "/health",
    "tools": "/mcp/tools/{toolName}",
    "resources": "/mcp/resources"
  },
  "tools": ["search_journey", "query_failures", "lookup_adr", "get_context", "list_pivots"],
  "discovery": "/.well-known/mcp.json"
}
MCP-CONFIG-END -->

Our AI Agent manifest is available at [https://tamshai.com/.well-known/mcp.json](https://tamshai.com/.well-known/mcp.json) 