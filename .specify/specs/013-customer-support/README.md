# 012 - Customer Support Portal Module

## Overview

The Customer Support Portal enables external customers to submit tickets, view Knowledge Base articles, and manage their organization's support contacts. This module introduces multi-realm Keycloak architecture with complete security isolation between employees and customers.

## Key Features

- **Multi-Realm Authentication**: Separate `tamshai-customers` realm for customer security isolation
- **Lead Customer Contact**: Hierarchical customer roles with organization management capabilities
- **Customer Ticket Submission**: Full ticket lifecycle from customer perspective
- **Knowledge Base Access**: Public KB article search and viewing
- **Lead Transfer Workflow**: Human-in-the-loop confirmation for lead contact transfers

## Quick Start

### Prerequisites

1. Running Tamshai dev environment (Terraform or Docker Compose)
2. Keycloak with both `tamshai` and `tamshai-customers` realms
3. MongoDB with support collections

### Development

```bash
# Start customer portal (port 4006)
cd clients/web/apps/customer-support
npm install
npm run dev

# Start MCP Support server (port 3104)
cd services/mcp-support
npm run dev
```

### Ports

| Service | Port (Dev) | Port (Docker) |
|---------|------------|---------------|
| Customer Portal | 4006 | 4006 |
| MCP Support | 3104 | 3104 |

### User Roles

| Role | Capabilities |
|------|--------------|
| `lead-customer` | View/create org tickets, manage contacts, transfer lead |
| `basic-customer` | View/create own tickets only |

## Documentation

| Document | Description |
|----------|-------------|
| [CUSTOMER_PORTAL_SDD.md](CUSTOMER_PORTAL_SDD.md) | Full Software Design Document |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | System architecture diagrams |
| [02-MULTI_REALM_KEYCLOAK.md](02-MULTI_REALM_KEYCLOAK.md) | Dual-realm configuration |
| [03-DATABASE_SCHEMA.md](03-DATABASE_SCHEMA.md) | MongoDB collections |
| [04-MCP_TOOLS_SPEC.md](04-MCP_TOOLS_SPEC.md) | Customer and internal tools |
| [05-AUTHORIZATION_MATRIX.md](05-AUTHORIZATION_MATRIX.md) | Role-permission mapping |
| [06-LEAD_TRANSFER_WORKFLOW.md](06-LEAD_TRANSFER_WORKFLOW.md) | State machine and flow |
| [07-API_CONTRACTS.md](07-API_CONTRACTS.md) | Request/response schemas |
| [08-UI_WIREFRAMES.md](08-UI_WIREFRAMES.md) | Page layouts |
| [09-TEST_PLAN.md](09-TEST_PLAN.md) | TDD scenarios |
| [10-DEPLOYMENT_GUIDE.md](10-DEPLOYMENT_GUIDE.md) | Docker and setup |

## Architecture Overview

```
                    ┌─────────────────┐
     Employees      │  tamshai realm  │
        │           │   (internal)    │
        ▼           └────────┬────────┘
   ┌─────────────┐           │
   │   Portal    │           │
   │  (Landing)  │           │
   └──────┬──────┘           │
          │                  │
          │   ┌──────────────┴──────────────┐
          │   │                             │
          ▼   ▼                             ▼
   ┌─────────────┐                 ┌─────────────────┐
   │  Internal   │                 │tamshai-customers│
   │   Apps      │                 │     realm       │
   │(HR,Finance) │                 │   (external)    │
   └──────┬──────┘                 └────────┬────────┘
          │                                 │
          │     ┌───────────────┐           │
          └────►│  MCP Support  │◄──────────┘
                │ Dual-Realm    │
                └───────────────┘
```

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Feb 2026 | Tamshai-Dev | Initial specification |
