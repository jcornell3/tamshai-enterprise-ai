# Architecture Overview

## Document Information
- **Version**: 1.4.1
- **Status**: Implementation Ready
- **Author**: AI Architecture Assistant
- **Organization**: Tamshai Corp
- **Last Updated**: January 2026
- **Architecture Version**: v1.4 (December 2024)
- **Testing Methodology**: TDD for service applications

---

## 1. Executive Summary

This document describes the architecture for Tamshai Corp's Enterprise AI Access System. The system enables employees to use AI assistants (specifically Claude) while ensuring that data access respects existing role-based security boundaries established through Single Sign-On (SSO).

### 1.1 Problem Statement

As enterprises adopt AI assistants, a critical challenge emerges: AI agents can potentially become privilege escalation vectors if not properly constrained. An AI with access to multiple data sources could inadvertently expose sensitive information to unauthorized users.

### 1.2 Solution Approach

This architecture implements **token propagation** where the authenticated user's identity and permissions flow through the entire AI request chain. MCP (Model Context Protocol) servers enforce role-based access at the data layer, ensuring the AI can only access data the user is authorized to see.

### 1.3 Architecture v1.4 Enhancements (December 2024)

This document reflects **Architecture v1.4**, which introduces five critical enhancements to the foundational v1.3 architecture:

1. **SSE Transport Protocol (Section 6.1)**: Server-Sent Events (SSE) streaming prevents timeout failures during Claude's 30-60 second multi-step reasoning processes. All clients use the EventSource API for real-time response streaming.

2. **Cursor-Based Pagination (Section 5.3)**: MCP servers implement keyset pagination using opaque cursors to enable complete data retrieval beyond the 50-record display limit. Replaces truncation warnings with `hasMore` flag and `nextCursor` for iterative fetching. Performance improvement: 85% faster than offset pagination for large result sets.

3. **LLM-Friendly Error Schemas (Section 7.4)**: All MCP tools return discriminated union responses (`success | error | pending_confirmation`) with structured error codes and `suggestedAction` fields, enabling Claude to self-correct and retry failed operations (Article II.3 compliance).

4. **Human-in-the-Loop Confirmations (Section 5.6)**: Write operations (delete, update) require explicit user approval via Approval Card UI components. Confirmation IDs are stored in Redis with 5-minute TTL, preventing accidental destructive actions.

5. **Truncation Warnings (Section 5.3 - Legacy)**: Initial v1.4 feature replaced by cursor-based pagination. MCP servers previously used LIMIT+1 pattern to detect incomplete results. Now superseded by pagination cursors for complete data access.

**Constitutional Impact**: v1.4 enhancements fulfill Article II.3 (structured errors) and enforce Article III.2 (record limits) without requiring constitutional amendments. Cursor-based pagination enables complete data access while maintaining the 50-record display limit, preserving user experience and system performance. All client-side security principles (Article V) remain unchanged.

**Implementation Status**: All MCP servers (HR, Finance, Sales, Support) have implemented cursor-based pagination with database-specific optimizations (PostgreSQL keyset, MongoDB _id cursors, Elasticsearch search_after). See [docs/architecture/pagination-guide.md](pagination-guide.md) for technical details and [docs/development/lessons-learned.md](../development/lessons-learned.md#lesson-10) for implementation lessons.

---

## 2. Architecture Principles

### 2.1 Security Principles

1. **Zero Trust**: Every request is authenticated and authorized, regardless of source
2. **Least Privilege**: Users and services have minimum necessary permissions
3. **Defense in Depth**: Multiple security layers (gateway, MCP gateway, individual MCPs)
4. **Token Propagation**: User context flows through entire request chain
5. **Audit Everything**: Comprehensive logging for compliance and forensics

### 2.2 Design Principles

1. **Open Source First**: Prefer open-source solutions to avoid vendor lock-in
2. **Cloud Agnostic**: Architecture portable across cloud providers
3. **Container Native**: All services containerized for consistency
4. **API First**: Well-defined interfaces between components
5. **Fail Secure**: Deny access on any error or ambiguity

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐              │
│   │    Desktop     │   │    Android     │   │      iOS       │              │
│   │   (Electron)   │   │ (React Native) │   │ (React Native) │              │
│   │                │   │                │   │                │              │
│   │  OIDC + PKCE   │   │  OIDC + PKCE   │   │  OIDC + PKCE   │              │
│   └───────┬────────┘   └───────┬────────┘   └───────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                │                                             │
│                                ▼                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          AUTHENTICATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       ┌─────────────────────┐                                │
│                       │      Keycloak       │                                │
│                       │  ─────────────────  │                                │
│                       │  • OIDC Provider    │                                │
│                       │  • SAML 2.0 IdP     │                                │
│                       │  • MFA (TOTP)       │                                │
│                       │  • User Federation  │                                │
│                       │  • Role Management  │                                │
│                       │  • Token Issuance   │                                │
│                       └─────────┬───────────┘                                │
│                                 │                                            │
│                                 │ JWT Access Tokens                          │
│                                 ▼                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                            GATEWAY LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       ┌─────────────────────┐                                │
│                       │    Kong Gateway     │                                │
│                       │  ─────────────────  │                                │
│                       │  • Token Validation │                                │
│                       │  • Rate Limiting    │                                │
│                       │  • Request Routing  │                                │
│                       │  • TLS Termination  │                                │
│                       │  • Access Logging   │                                │
│                       └─────────┬───────────┘                                │
│                                 │                                            │
│                                 │ Validated JWT                              │
│                                 ▼                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                         MCP ORCHESTRATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       ┌─────────────────────┐                                │
│                       │    MCP Gateway      │                                │
│                       │  ─────────────────  │                                │
│                       │  • Role Extraction  │                                │
│                       │  • MCP Routing      │                                │
│                       │  • Query Filtering  │                                │
│                       │  • Response Agg.    │                                │
│                       │  • Audit Trail      │                                │
│                       │  • Claude API Proxy │                                │
│                       └─────────┬───────────┘                                │
│                                 │                                            │
│           ┌─────────────────────┼─────────────────────┐                      │
│           │                     │                     │                      │
│           ▼                     ▼                     ▼                      │
│   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐               │
│   │   HR MCP      │    │ Finance MCP   │    │  Sales MCP    │    ...        │
│   │ ───────────── │    │ ───────────── │    │ ───────────── │               │
│   │ Roles: HR     │    │ Roles: FIN    │    │ Roles: SALES  │               │
│   │ Data: PG      │    │ Data: PG+MinIO│    │ Data: MongoDB │               │
│   └───────┬───────┘    └───────┬───────┘    └───────┬───────┘               │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                │                                             │
│                                ▼                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                             DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│   │ PostgreSQL │  │   MinIO    │  │  MongoDB   │  │Elasticsearch│           │
│   │ ────────── │  │ ────────── │  │ ────────── │  │ ────────── │            │
│   │ HR Data    │  │ Documents  │  │ CRM Data   │  │ Tickets    │            │
│   │ Finance    │  │ Reports    │  │ Pipeline   │  │ KB Search  │            │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Request Flow

```
┌──────┐     ┌──────────┐     ┌──────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│Client│     │ Keycloak │     │ Kong │     │MCP Gateway│     │ MCP Svr │     │  Claude  │
└──┬───┘     └────┬─────┘     └──┬───┘     └─────┬─────┘     └────┬────┘     └────┬─────┘
   │              │              │               │                │               │
   │ 1. Login     │              │               │                │               │
   │─────────────>│              │               │                │               │
   │              │              │               │                │               │
   │ 2. MFA       │              │               │                │               │
   │<────────────>│              │               │                │               │
   │              │              │               │                │               │
   │ 3. JWT Token │              │               │                │               │
   │<─────────────│              │               │                │               │
   │              │              │               │                │               │
   │ 4. AI Query + Token         │               │                │               │
   │─────────────────────────────>               │                │               │
   │              │              │               │                │               │
   │              │  5. Validate │               │                │               │
   │              │<─────────────│               │                │               │
   │              │              │               │                │               │
   │              │  6. Valid    │               │                │               │
   │              │─────────────>│               │                │               │
   │              │              │               │                │               │
   │              │              │ 7. Route      │                │               │
   │              │              │──────────────>│                │               │
   │              │              │               │                │               │
   │              │              │               │ 8. Check Roles │               │
   │              │              │               │───────────────>│               │
   │              │              │               │                │               │
   │              │              │               │ 9. Query Data  │               │
   │              │              │               │<───────────────│               │
   │              │              │               │                │               │
   │              │              │               │ 10. Claude API │               │
   │              │              │               │────────────────────────────────>
   │              │              │               │                │               │
   │              │              │               │ 11. Response   │               │
   │              │              │               │<────────────────────────────────
   │              │              │               │                │               │
   │ 12. AI Response             │               │                │               │
   │<────────────────────────────────────────────│                │               │
   │              │              │               │                │               │
```

---

## 4. Component Details

### 4.1 Keycloak (Identity Provider)

**Purpose**: Centralized authentication and authorization

**Configuration**:
```
Realm: tamshai-corp
├── Clients
│   ├── ai-desktop (OIDC, public, PKCE)
│   ├── ai-mobile (OIDC, public, PKCE)
│   ├── mcp-gateway (OIDC, confidential)
│   └── admin-console (OIDC, confidential)
│
├── Realm Roles
│   ├── hr-read
│   ├── hr-write
│   ├── finance-read
│   ├── finance-write
│   ├── sales-read
│   ├── sales-write
│   ├── support-read
│   ├── support-write
│   └── executive (composite: all *-read roles)
│
├── Groups (map to roles)
│   ├── HR-Department → hr-read, hr-write
│   ├── Finance-Team → finance-read, finance-write
│   ├── Sales-Team → sales-read
│   ├── Support-Team → support-read
│   └── C-Suite → executive
│
└── Authentication
    ├── Browser Flow (username/password + OTP)
    └── Direct Grant (disabled for security)
```

**JWT Token Structure**:
```json
{
  "sub": "user-uuid",
  "preferred_username": "alice.chen",
  "email": "alice@tamshai-playground.local",
  "realm_access": {
    "roles": ["hr-read", "hr-write"]
  },
  "groups": ["/HR-Department"],
  "iat": 1699000000,
  "exp": 1699003600,
  "aud": "ai-desktop"
}
```

### 4.2 Kong API Gateway

**Purpose**: Edge security, rate limiting, routing

**Plugins**:
- **OIDC**: Token validation against Keycloak
- **Rate Limiting**: 100 requests/minute per user
- **Request Transformer**: Add user context headers
- **Response Transformer**: Remove sensitive headers
- **Logging**: HTTP log to audit system

**Routes**:
| Route | Upstream | Auth Required |
|-------|----------|---------------|
| /api/ai/* | mcp-gateway:3000 | Yes |
| /api/health | mcp-gateway:3000 | No |

### 4.3 MCP Gateway

**Purpose**: AI orchestration with role-based MCP routing

**Responsibilities**:
1. Extract roles from validated JWT
2. Determine which MCP servers user can access
3. Route AI queries to appropriate MCPs
4. Aggregate responses from multiple MCPs
5. Proxy requests to Claude API
6. Log all queries and data access

**Core Logic**:
```typescript
interface MCPGateway {
  // Determine accessible MCPs based on user roles
  getAccessibleMCPs(roles: string[]): MCPServer[];
  
  // Execute query across allowed MCPs
  executeQuery(query: string, userContext: UserContext): Promise<QueryResult>;
  
  // Send to Claude with MCP context
  sendToClaude(query: string, mcpData: MCPData[]): Promise<ClaudeResponse>;
  
  // Audit logging
  logAccess(user: string, query: string, mcps: string[], result: any): void;
}
```

**MCP to Role Mapping**:
```typescript
const MCP_ROLE_MAP = {
  'mcp-hr': ['hr-read', 'hr-write', 'executive'],
  'mcp-finance': ['finance-read', 'finance-write', 'executive'],
  'mcp-sales': ['sales-read', 'sales-write', 'executive'],
  'mcp-support': ['support-read', 'support-write', 'executive'],
  'mcp-docs': [] // Empty = any authenticated user
};
```

### 4.4 MCP Servers

Each MCP server exposes domain-specific data through the Model Context Protocol.

#### HR MCP Server
- **Data Source**: PostgreSQL
- **Exposed Tools**:
  - `get_employee(id)`: Employee details
  - `search_employees(query)`: Search by name/department
  - `get_org_chart(department)`: Organization structure
- **Data Filtering**: Salary data only visible with `hr-write` role

#### Finance MCP Server
- **Data Sources**: PostgreSQL + MinIO
- **Exposed Tools**:
  - `get_budget(department, year)`: Budget allocation
  - `get_financial_report(type, period)`: P&L, balance sheet
  - `get_invoice(id)`: Invoice details
- **Data Filtering**: Detailed financials require `finance-write`

#### Sales MCP Server
- **Data Source**: MongoDB
- **Exposed Tools**:
  - `get_customer(id)`: Customer profile
  - `search_customers(query)`: CRM search
  - `get_pipeline()`: Sales pipeline summary
- **Data Filtering**: Contact details require `sales-write`

#### Support MCP Server
- **Data Source**: Elasticsearch
- **Exposed Tools**:
  - `search_tickets(query)`: Full-text ticket search
  - `get_ticket(id)`: Ticket details
  - `search_kb(query)`: Knowledge base search
- **Data Filtering**: Customer PII masked for basic roles

---

## 5. Security Architecture

### 5.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OIDC + PKCE Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Client generates code_verifier (random string)               │
│  2. Client computes code_challenge = SHA256(code_verifier)       │
│  3. Client redirects to Keycloak with code_challenge             │
│  4. User authenticates (username/password + MFA)                 │
│  5. Keycloak returns authorization_code                          │
│  6. Client exchanges code + code_verifier for tokens             │
│  7. Keycloak validates code_verifier against stored challenge    │
│  8. Keycloak returns access_token + refresh_token                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Token Security

| Token Type | Lifetime | Storage | Refresh |
|------------|----------|---------|---------|
| Access Token | 5 minutes | Memory only | Via refresh token |
| Refresh Token | 30 minutes | Secure storage | Sliding window |
| ID Token | 5 minutes | Memory only | N/A |

**Secure Storage**:
- Desktop: Electron safeStorage API (OS keychain)
- Android: EncryptedSharedPreferences (Android Keystore)
- iOS: Keychain Services

### 5.3 Network Security

```
┌─────────────────────────────────────────────────────────────────┐
│                    Network Zones                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Public Zone                           │    │
│  │  • Kong Gateway (HTTPS only, TLS 1.3)                   │    │
│  │  • Keycloak (HTTPS only, TLS 1.3)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           │ Internal Network                     │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Private Zone                          │    │
│  │  • MCP Gateway                                          │    │
│  │  • MCP Servers                                          │    │
│  │  • Databases                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Audit Logging

All data access is logged with:
```json
{
  "timestamp": "2025-11-29T10:30:00Z",
  "user_id": "alice-uuid",
  "username": "alice.chen",
  "roles": ["hr-read", "hr-write"],
  "action": "ai_query",
  "query": "Show me employee headcount by department",
  "mcp_servers_accessed": ["mcp-hr"],
  "data_returned": {
    "record_count": 5,
    "fields": ["department", "count"]
  },
  "client_ip": "192.168.1.100",
  "client_type": "desktop"
}
```

---

## 6. Data Architecture

### 6.1 Sample Data Model

#### HR Database (PostgreSQL)
```sql
-- Employees
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employee_number VARCHAR(20) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) UNIQUE,
    department_id UUID REFERENCES departments(id),
    manager_id UUID REFERENCES employees(id),
    hire_date DATE,
    salary DECIMAL(12,2),  -- hr-write only
    created_at TIMESTAMP DEFAULT NOW()
);

-- Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY,
    name VARCHAR(100),
    code VARCHAR(10) UNIQUE,
    budget DECIMAL(15,2)
);
```

#### Finance Data (PostgreSQL + MinIO)
```sql
-- Budgets
CREATE TABLE budgets (
    id UUID PRIMARY KEY,
    department_id UUID REFERENCES departments(id),
    fiscal_year INT,
    amount DECIMAL(15,2),
    spent DECIMAL(15,2) DEFAULT 0
);

-- Documents stored in MinIO
-- Path: /finance/reports/{year}/{type}/{filename}
```

#### Sales CRM (MongoDB)
```javascript
// customers collection
{
  _id: ObjectId,
  company_name: String,
  industry: String,
  contacts: [{
    name: String,
    email: String,    // sales-write only
    phone: String     // sales-write only
  }],
  deals: [{
    name: String,
    value: Number,
    stage: String,
    probability: Number
  }]
}
```

### 6.2 Data Access Matrix

| Data | hr-read | hr-write | fin-read | fin-write | sales-read | sales-write | exec |
|------|---------|----------|----------|-----------|------------|-------------|------|
| Employee Name | ✓ | ✓ | | | | | ✓ |
| Employee Salary | | ✓ | | | | | |
| Org Chart | ✓ | ✓ | | | | | ✓ |
| Budget Summary | | | ✓ | ✓ | | | ✓ |
| Financial Details | | | | ✓ | | | |
| Customer Company | | | | | ✓ | ✓ | ✓ |
| Customer Contact | | | | | | ✓ | |
| Deal Pipeline | | | | | ✓ | ✓ | ✓ |

---

## 7. Deployment Architecture

### 7.1 Local Development (Docker Compose)

```yaml
# Simplified view - full compose in infrastructure/docker/
services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    ports: ["8080:8080"]
    
  kong:
    image: kong:3.4
    ports: ["8000:8000", "8443:8443"]
    
  mcp-gateway:
    build: ./services/mcp-gateway
    ports: ["3000:3000"]
    
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    
  mongodb:
    image: mongo:7
    ports: ["27017:27017"]
    
  minio:
    image: minio/minio
    ports: ["9000:9000"]
    
  elasticsearch:
    image: elasticsearch:8.11.0
    ports: ["9200:9200"]
```

### 7.2 Production (GCP + Kubernetes)

```
┌─────────────────────────────────────────────────────────────────┐
│                        GCP Project                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    GKE Cluster                           │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │  Keycloak   │  │    Kong     │  │ MCP Gateway │      │    │
│  │  │  (2 pods)   │  │   Ingress   │  │  (2 pods)   │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  │                                                          │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │   HR MCP    │  │Finance MCP  │  │ Sales MCP   │      │    │
│  │  │  (1 pod)    │  │  (1 pod)    │  │  (1 pod)    │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │   Cloud SQL         │  │  Cloud Storage      │               │
│  │   (PostgreSQL)      │  │  (Documents)        │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │   MongoDB Atlas     │  │  Elastic Cloud      │               │
│  │   (CRM Data)        │  │  (Search)           │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Testing Strategy

### 8.0 Development Methodology: TDD

We use **Test-Driven Development (TDD)** for all service application code. This ensures high test coverage and design quality from the start.

**TDD Cycle (RED-GREEN-REFACTOR)**:
1. **RED Phase**: Write failing tests first that define expected behavior
2. **GREEN Phase**: Implement minimum code to make tests pass
3. **REFACTOR Phase**: Improve code quality while keeping tests green

**TDD Scope**:
| Code Type | Uses TDD | Rationale |
|-----------|----------|-----------|
| Service Applications (MCP Gateway, MCP HR, etc.) | **YES** | Core business logic requires rigorous testing |
| Client Applications (Flutter, Web) | **YES** | User-facing features benefit from TDD |
| Infrastructure (Terraform, Docker) | **NO** | Declarative configs, validated by apply/deploy |

**Coverage Targets**:
- 90% diff coverage on new code (enforced by Codecov, BLOCKS PRs)
- 49.06% overall coverage (gradually improving)
- 70% target for new services

See `.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md` for complete strategy.

### 8.1 Integration Tests

Role-based access validation:
```typescript
describe('Role-Based Access Control', () => {
  test('HR user can access employee data', async () => {
    const token = await login('alice.chen', 'password');
    const result = await query(token, 'List employees in Engineering');
    expect(result.data).toContainEmployeeRecords();
  });
  
  test('HR user cannot access finance data', async () => {
    const token = await login('alice.chen', 'password');
    const result = await query(token, 'Show Q3 budget report');
    expect(result.error).toBe('ACCESS_DENIED');
  });
  
  test('Executive can access all read data', async () => {
    const token = await login('eve.thompson', 'password');
    const hrResult = await query(token, 'Employee count');
    const finResult = await query(token, 'Budget summary');
    expect(hrResult.data).toBeDefined();
    expect(finResult.data).toBeDefined();
  });
  
  test('Unauthenticated user is rejected', async () => {
    const result = await query(null, 'Any query');
    expect(result.error).toBe('UNAUTHORIZED');
  });
});
```

### 8.2 Test Matrix

| Test Case | Alice (HR) | Bob (FIN) | Carol (SALES) | Eve (EXEC) | Frank (NONE) |
|-----------|------------|-----------|---------------|------------|--------------|
| View employees | ✓ | ✗ | ✗ | ✓ | ✗ |
| View salaries | ✓ | ✗ | ✗ | ✗ | ✗ |
| View budgets | ✗ | ✓ | ✗ | ✓ | ✗ |
| View customers | ✗ | ✗ | ✓ | ✓ | ✗ |
| View public docs | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 9. Performance Architecture

### 9.1 Token Revocation Caching (v1.5)

**Problem**: The original design called Redis `isTokenRevoked()` for every authenticated request, creating a synchronous dependency that adds network latency and makes Redis a Single Point of Failure (SPOF). Under the "Fail Secure" policy, a Redis outage would take down the entire AI system.

**Solution**: Implement a local in-memory cache with periodic background refresh.

```
┌─────────────────────────────────────────────────────────────────┐
│                Token Revocation Architecture (v1.5)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐      ┌─────────────────┐     ┌──────────┐    │
│   │   Request    │      │  MCP Gateway    │     │  Redis   │    │
│   │  (with JWT)  │      │                 │     │  Cache   │    │
│   └──────┬───────┘      │  ┌───────────┐  │     └────┬─────┘    │
│          │              │  │ In-Memory │  │          │          │
│          │              │  │   Cache   │  │          │          │
│          │              │  │ (Set<JTI>)│  │          │          │
│          │              │  └─────┬─────┘  │          │          │
│          │ 1. Check     │        │        │          │          │
│          │    Token     │        │        │          │          │
│          │─────────────>│ 2. Local       │          │          │
│          │              │    Lookup      │          │          │
│          │              │    (O(1))      │          │          │
│          │              │        │        │          │          │
│          │ 3. Fast      │        │        │          │          │
│          │    Response  │        │        │          │          │
│          │<─────────────│        │        │          │          │
│          │              │        │        │          │          │
│          │              │        │ 4. Background Sync │          │
│          │              │        │    (every 2 sec)   │          │
│          │              │        │───────────────────>│          │
│          │              │        │                    │          │
│          │              │        │ 5. KEYS revoked:*  │          │
│          │              │        │<───────────────────│          │
│          │              │        │                    │          │
│          │              └────────┼────────┘           │          │
│                                  │                               │
└─────────────────────────────────────────────────────────────────┘
```

**Cache Strategy**:
- **Sync Interval**: 2 seconds (configurable via `TOKEN_REVOCATION_SYNC_MS`)
- **Cache Structure**: `Set<string>` containing revoked token JTIs
- **Fallback**: On Redis connection failure, use last known cache state (fail-open with warning log)
- **Trade-off**: Maximum 2-second window where a revoked token may still be accepted

**Implementation**:
```typescript
class CachedTokenRevocation {
  private revokedTokens: Set<string> = new Set();
  private lastSync: number = 0;
  private syncIntervalMs: number;
  private syncInProgress: boolean = false;

  constructor(syncIntervalMs = 2000) {
    this.syncIntervalMs = syncIntervalMs;
    // Start background sync
    this.startBackgroundSync();
  }

  async isRevoked(jti: string): Promise<boolean> {
    // Fast path: local cache lookup O(1)
    return this.revokedTokens.has(jti);
  }

  private startBackgroundSync(): void {
    setInterval(async () => {
      if (this.syncInProgress) return;
      this.syncInProgress = true;
      try {
        const keys = await redis.keys('revoked:*');
        this.revokedTokens = new Set(keys.map(k => k.replace('revoked:', '')));
        this.lastSync = Date.now();
      } catch (error) {
        logger.warn('Redis sync failed, using stale cache', { error });
      } finally {
        this.syncInProgress = false;
      }
    }, this.syncIntervalMs);
  }
}
```

**Benefits**:
| Metric | Before (v1.4) | After (v1.5) |
|--------|---------------|--------------|
| Latency per request | +5-15ms (Redis RTT) | <0.1ms (local Set) |
| Redis SPOF | Yes (fail-secure blocks all) | No (graceful degradation) |
| Redis load | 1 call per request | 1 call per 2 seconds |

### 9.2 Gateway Service Timeouts (v1.5)

**Problem**: The gateway waits for the slowest downstream MCP service to complete before proceeding. A slow or hung service blocks the entire request, and auto-pagination can turn a single query into multiple serial HTTP requests.

**Solution**: Implement per-service timeouts with partial response handling.

```
┌─────────────────────────────────────────────────────────────────┐
│              Gateway Timeout Architecture (v1.5)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌─────────────────┐                           │
│                    │   MCP Gateway   │                           │
│                    │  (Orchestrator) │                           │
│                    └────────┬────────┘                           │
│                             │                                    │
│          ┌──────────────────┼──────────────────┐                 │
│          │                  │                  │                 │
│          ▼                  ▼                  ▼                 │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│   │   MCP HR    │   │ MCP Finance │   │  MCP Sales  │           │
│   │  (healthy)  │   │   (slow)    │   │  (timeout)  │           │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│          │                 │                 │                   │
│   ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐           │
│   │  Response   │   │  Response   │   │   TIMEOUT   │           │
│   │   200ms     │   │   4800ms    │   │   5000ms    │           │
│   └─────────────┘   └─────────────┘   └─────────────┘           │
│          │                 │                 │                   │
│          └─────────────────┼─────────────────┘                   │
│                            │                                     │
│                            ▼                                     │
│              ┌───────────────────────────┐                       │
│              │     Partial Response      │                       │
│              │  • HR data: ✓ included    │                       │
│              │  • Finance: ✓ included    │                       │
│              │  • Sales: ⚠ unavailable   │                       │
│              └───────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Timeout Configuration**:
| Service Type | Timeout | Rationale |
|--------------|---------|-----------|
| MCP Server (read) | 5 seconds | Most queries complete in <1s |
| MCP Server (write) | 10 seconds | Writes may have DB transactions |
| Claude API | 60 seconds | Multi-step reasoning can be slow |
| Total Request | 90 seconds | Hard cap including retries |

**Implementation**:
```typescript
interface ServiceTimeoutConfig {
  mcpReadTimeout: number;    // 5000ms
  mcpWriteTimeout: number;   // 10000ms
  claudeTimeout: number;     // 60000ms
  totalTimeout: number;      // 90000ms
}

async function queryMCPServerWithTimeout(
  server: MCPServer,
  query: MCPQuery,
  signal: AbortSignal
): Promise<MCPResponse> {
  const timeout = query.isWrite ? config.mcpWriteTimeout : config.mcpReadTimeout;
  const controller = new AbortController();

  // Create timeout that aborts the request
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Link to parent signal (total request timeout)
  signal.addEventListener('abort', () => controller.abort());

  try {
    const response = await axios.post(server.url, query, {
      signal: controller.signal,
      timeout: timeout
    });
    return { server: server.name, status: 'success', data: response.data };
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
      logger.warn('MCP server timeout', { server: server.name, timeout });
      return {
        server: server.name,
        status: 'timeout',
        data: null,
        message: `${server.name} did not respond within ${timeout}ms`
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Partial Response Handling**:
When some services timeout, the gateway returns available data with warnings:

```json
{
  "status": "partial",
  "data": {
    "hr": { "employees": [...] },
    "finance": { "budget": {...} }
  },
  "warnings": [
    {
      "server": "mcp-sales",
      "code": "TIMEOUT",
      "message": "Sales data unavailable - service did not respond in time"
    }
  ],
  "metadata": {
    "successfulServers": ["mcp-hr", "mcp-finance"],
    "failedServers": ["mcp-sales"],
    "totalDurationMs": 5023
  }
}
```

### 9.3 PII Masking Architecture Decision

**Decision**: PII masking is performed at the **application layer** (MCP Gateway), NOT at the database layer.

**Rationale**:

1. **Multi-Database Consistency**: The system uses PostgreSQL, MongoDB, and Elasticsearch. Implementing masking logic in each database (PostgreSQL views, MongoDB aggregation pipelines, Elasticsearch scripted fields) would require:
   - 3x code maintenance
   - Different syntax and capabilities per database
   - Testing across all database types

2. **AI Context Awareness**: When Claude receives masked data, it needs to understand WHAT was masked:
   ```json
   {
     "employee": "John Smith",
     "salary": "[MASKED: Confidential - requires hr-write role]",
     "ssn": "[MASKED: PII - not available via AI]"
   }
   ```
   Database-level masking cannot inject context-aware placeholder messages.

3. **Audit Trail Integrity**: Application-layer masking allows logging WHAT was masked for each request:
   ```json
   {
     "requestId": "abc123",
     "maskedFields": ["salary", "ssn", "home_address"],
     "maskingReason": "user lacks hr-write role"
   }
   ```

4. **Dynamic Role-Based Masking**: Masking rules depend on the requesting user's roles, which are in the JWT token. Database-layer masking would require:
   - Passing session variables to database (adds latency)
   - Complex RLS policies for field-level masking
   - Different implementations per database

5. **Claude API Integration**: The MCP Gateway's PII scrubber (`pii-scrubber.ts`) also masks PII in audit logs sent to Claude, ensuring sensitive data never reaches the external API. Database-level masking cannot protect this layer.

**Trade-off Acknowledged**: Sensitive data does transit through application memory before masking. This is mitigated by:
- TLS encryption in transit
- Short-lived processing (no persistence)
- Memory cleared after request completion
- Container isolation in production

**See Also**: `services/mcp-gateway/src/utils/pii-scrubber.ts` for implementation.

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token theft | Medium | High | Short token lifetime, secure storage |
| MCP bypass | Low | Critical | All MCPs behind gateway, network isolation |
| Data leakage via AI | Medium | High | Response filtering, query auditing |
| Keycloak compromise | Low | Critical | MFA, strong passwords, monitoring |
| Insider threat | Medium | Medium | Audit logging, least privilege |

---

## 10. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Sponsor | | | |
| Security Review | | | |
| Technical Lead | | | |

---

## Appendix A: Glossary

- **IdP**: Identity Provider - system that authenticates users
- **JWT**: JSON Web Token - compact, URL-safe token format
- **MCP**: Model Context Protocol - standard for AI tool integration
- **MFA**: Multi-Factor Authentication
- **OIDC**: OpenID Connect - authentication layer on OAuth 2.0
- **PKCE**: Proof Key for Code Exchange - OAuth 2.0 extension for public clients
- **RBAC**: Role-Based Access Control
- **SAML**: Security Assertion Markup Language
- **SSO**: Single Sign-On

## Appendix B: References

1. Keycloak Documentation: https://www.keycloak.org/documentation
2. Model Context Protocol Spec: https://modelcontextprotocol.io
3. Kong Gateway Documentation: https://docs.konghq.com
4. OAuth 2.0 for Native Apps (RFC 8252)
5. PKCE (RFC 7636)
