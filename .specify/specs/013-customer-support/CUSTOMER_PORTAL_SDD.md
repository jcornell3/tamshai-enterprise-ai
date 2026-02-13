# Customer Support Portal - Software Design Document

**Version**: 1.0
**Date**: February 2026
**Author**: Tamshai-Dev
**Status**: Approved

---

## 1. Executive Summary

The Customer Support Portal extends Tamshai Corp's enterprise AI platform to external customers, enabling them to submit support tickets, access knowledge base articles, and manage their organization's support contacts. This module introduces multi-realm Keycloak architecture to maintain complete security isolation between employee and customer data.

### Key Objectives

1. **Security Isolation**: Separate authentication realm prevents data leakage
2. **Self-Service**: Customers can submit and track tickets 24/7
3. **Lead Customer Model**: Hierarchical organization management with transfer workflow
4. **Knowledge Base Access**: Reduce ticket volume through KB deflection

---

## 2. System Context & Scope

### 2.1 In Scope

- Customer-facing web portal for ticket management
- Multi-realm Keycloak authentication (tamshai-customers realm)
- Customer-specific MCP tools with organization-level filtering
- Lead Customer Contact hierarchy with transfer capabilities
- Public Knowledge Base access for customers
- Integration with existing MCP Support server

### 2.2 Out of Scope

- Customer self-registration (future Phase 2)
- Customer billing integration
- Live chat functionality
- Mobile-native customer apps

### 2.3 Dependencies

| System | Dependency Type | Description |
|--------|-----------------|-------------|
| Keycloak | Hard | OIDC authentication provider |
| MCP Gateway | Hard | AI query routing and context |
| MCP Support | Hard | Support ticket backend |
| MongoDB | Hard | Ticket and KB storage |
| Redis | Soft | Confirmation workflow storage |

---

## 3. Stakeholders & User Personas

### 3.1 Stakeholders

| Stakeholder | Interest | Influence |
|-------------|----------|-----------|
| Support Team | Reduced ticket load, better customer context | High |
| Customers | Self-service, faster resolution | High |
| Security Team | Data isolation compliance | High |
| Product | Customer satisfaction metrics | Medium |

### 3.2 User Personas

#### Jane Smith - Lead Customer Contact (Acme Corp)

- **Role**: IT Director at customer organization
- **Needs**: Single view of all org support tickets, manage team access
- **Pain Points**: Calling support for updates, managing multiple contacts
- **Goals**: Quick resolution, visibility into team's issues

#### Bob Developer - Basic Customer (Acme Corp)

- **Role**: Developer at customer organization
- **Needs**: Submit tickets, track own issues
- **Pain Points**: Waiting for lead to submit tickets, no visibility
- **Goals**: Self-service ticket submission, see relevant KB articles

---

## 4. Functional Requirements

### 4.1 Authentication & Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | System SHALL authenticate customers via tamshai-customers Keycloak realm | Must |
| FR-002 | System SHALL support OIDC PKCE flow for customer portal | Must |
| FR-003 | Lead customers SHALL see all organization tickets | Must |
| FR-004 | Basic customers SHALL only see own tickets | Must |
| FR-005 | System SHALL include organization_id in JWT claims | Must |

### 4.2 Ticket Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-010 | Customers SHALL be able to create new tickets | Must |
| FR-011 | Customers SHALL be able to view ticket status and history | Must |
| FR-012 | Customers SHALL be able to add comments to tickets | Must |
| FR-013 | Internal notes SHALL NOT be visible to customers | Must |
| FR-014 | Tickets SHALL have organization_id for filtering | Must |

### 4.3 Knowledge Base

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-020 | Customers SHALL be able to search public KB articles | Must |
| FR-021 | KB search SHALL support full-text search | Must |
| FR-022 | System SHOULD suggest KB articles during ticket creation | Should |
| FR-023 | System SHALL track KB article helpfulness ratings | Should |

### 4.4 Contact Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-030 | Lead customers SHALL view organization contacts | Must |
| FR-031 | Lead customers SHALL invite new contacts (pending_confirmation) | Must |
| FR-032 | Lead customers SHALL transfer lead role (pending_confirmation) | Must |
| FR-033 | Basic customers SHALL NOT access contact management | Must |

---

## 5. Non-Functional Requirements

### 5.1 Security

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Customer realm MUST be isolated from internal realm | No cross-realm token validation |
| NFR-002 | Internal notes MUST NOT be exposed via any API | 100% enforcement |
| NFR-003 | Organization data MUST be filtered at database layer | RLS or application filter |
| NFR-004 | Session timeout SHOULD be 4 hours for customers | 4hr access token |

### 5.2 Performance

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-010 | Ticket list SHALL load within 500ms | P95 < 500ms |
| NFR-011 | KB search SHALL return results within 1s | P95 < 1000ms |
| NFR-012 | Portal SHALL support 100 concurrent customers | No degradation |

### 5.3 Availability

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-020 | Portal SHALL have 99.5% uptime | Monthly SLA |
| NFR-021 | System SHALL gracefully handle Keycloak outages | Show maintenance page |

---

## 6. Architecture Decision Records

### ADR-001: Separate Keycloak Realm for Customers

**Decision**: Create `tamshai-customers` realm instead of adding customer roles to `tamshai`

**Rationale**:
- Complete security boundary between employee and customer data
- Different authentication policies (MFA optional for customers)
- Independent user lifecycle management
- Regulatory compliance requirements

**Consequences**:
- MCP servers must validate tokens from both realms
- Portal must redirect to correct realm for login
- Adds operational complexity for realm management

### ADR-002: Lead Customer Contact Model

**Decision**: Implement hierarchical customer roles with single lead per organization

**Rationale**:
- Matches B2B support patterns (Zendesk, Salesforce)
- Provides clear escalation path for account issues
- Simplifies organization management

**Consequences**:
- Need lead transfer workflow with confirmation
- Must handle edge case of lead leaving organization
- Single point of failure if lead unavailable

### ADR-003: Customer Tickets Separate from Internal

**Decision**: Add customer-specific fields to existing tickets collection

**Rationale**:
- Reuse existing ticket infrastructure
- Internal support sees unified view
- Simpler data model than separate collections

**Consequences**:
- Need visibility field to control data exposure
- Internal notes must be strictly separated
- Projection queries must exclude internal data

---

## 7. Data Flow Diagrams

### 7.1 Customer Login Flow

```
Customer → Portal → Keycloak (tamshai-customers) → JWT
                                                     │
                                                     ▼
                           MCP Gateway ← Portal (with JWT)
                                │
                                ▼
                          MCP Support (dual-realm validation)
                                │
                                ▼
                             MongoDB
```

### 7.2 Ticket Submission Flow

```
Customer → Portal → MCP Gateway → MCP Support
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
          Validate Org                              Create Ticket
          (from JWT)                                (with org_id)
                 │                                         │
                 └────────────────────┬────────────────────┘
                                      │
                                      ▼
                              Return Ticket ID
```

### 7.3 Lead Transfer Flow

```
Lead Customer → Portal → MCP Support
                              │
                              ▼
                    Create pending_confirmation
                              │
                              ▼
                    Store in Redis (5min TTL)
                              │
                              ▼
                    Return confirmation message
                              │
                              ▼
           Portal shows Approval Card
                              │
           ┌──────────────────┴──────────────────┐
           │                                      │
        Approve                                Reject
           │                                      │
           ▼                                      ▼
    Execute transfer                       Cancel operation
    Update audit_log                       Delete from Redis
```

---

## 8. Security Considerations

### 8.1 Data Exposure Prevention

| Risk | Mitigation |
|------|------------|
| Internal notes exposed | Never project internal_notes in customer queries |
| Cross-organization data | Filter by organization_id from JWT claims |
| Employee data in customer realm | Separate JWKS endpoints, no cross-validation |

### 8.2 Authentication Security

| Control | Implementation |
|---------|----------------|
| PKCE Flow | Required for public client |
| Token Validation | Dual-realm JWKS with realm indicator |
| Session Management | 4hr access token, 8hr refresh |

### 8.3 Authorization Controls

| Control | Implementation |
|---------|----------------|
| Lead-only operations | Role check in MCP tools |
| Organization isolation | JWT organization_id claim |
| Audit logging | All write operations logged |

---

## 9. Integration Points

### 9.1 Inbound Integrations

| Source | Target | Method | Data |
|--------|--------|--------|------|
| Portal | MCP Gateway | REST/SSE | Queries with JWT |
| Portal | Keycloak | OIDC | Authentication |

### 9.2 Outbound Integrations

| Source | Target | Method | Data |
|--------|--------|--------|------|
| MCP Support | MongoDB | Driver | Tickets, KB |
| MCP Support | Redis | Driver | Confirmations |
| MCP Support | Internal Support App | Shared DB | Unified tickets |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| Lead Customer Contact | Primary contact for an organization with admin privileges |
| Basic Customer | Regular customer user with limited visibility |
| Organization | Customer company entity with subscription |
| Dual-Realm | Architecture supporting tokens from multiple Keycloak realms |
| KB Deflection | Reducing tickets by showing relevant knowledge base articles |

---

## Appendices

- [A. Architecture Diagrams](01-ARCHITECTURE.md)
- [B. Multi-Realm Configuration](02-MULTI_REALM_KEYCLOAK.md)
- [C. Database Schema](03-DATABASE_SCHEMA.md)
- [D. MCP Tools Specification](04-MCP_TOOLS_SPEC.md)
- [E. Authorization Matrix](05-AUTHORIZATION_MATRIX.md)
- [F. Lead Transfer Workflow](06-LEAD_TRANSFER_WORKFLOW.md)
- [G. API Contracts](07-API_CONTRACTS.md)
- [H. UI Wireframes](08-UI_WIREFRAMES.md)
- [I. Test Plan](09-TEST_PLAN.md)
- [J. Deployment Guide](10-DEPLOYMENT_GUIDE.md)
