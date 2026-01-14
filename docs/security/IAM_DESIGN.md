# Identity and Access Management (IAM) Design

**Project**: Tamshai Enterprise AI
**Version**: 1.4 (January 2026)
**Status**: Production

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Authentication Flow](#authentication-flow)
4. [Authorization Model](#authorization-model)
   - [User → Group → Role → Policy Chain](#user--group--role--policy-chain)
   - [Role Hierarchy](#role-hierarchy)
   - [Client Roles vs Realm Roles](#client-roles-vs-realm-roles)
5. [Keycloak Configuration](#keycloak-configuration)
   - [Realm Settings](#realm-settings)
   - [Groups](#groups)
   - [Roles](#roles)
   - [Clients](#clients)
   - [Protocol Mappers](#protocol-mappers)
6. [MCP Gateway Authorization](#mcp-gateway-authorization)
   - [Role-to-MCP Server Mapping](#role-to-mcp-server-mapping)
   - [JWT Token Validation](#jwt-token-validation)
7. [Database-Level Security (RLS)](#database-level-security-rls)
   - [PostgreSQL Row Level Security](#postgresql-row-level-security)
   - [Session Variable Propagation](#session-variable-propagation)
   - [RLS Policy Examples](#rls-policy-examples)
8. [Terraform IAM Configuration](#terraform-iam-configuration)
9. [Service Account Authentication](#service-account-authentication)
10. [Security Best Practices](#security-best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The Tamshai Enterprise AI system implements a **defense-in-depth** security model with multiple authorization layers:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **1. Authentication** | Keycloak OIDC + PKCE | Verify user identity with MFA |
| **2. API Gateway** | Kong | Rate limiting, CORS, JWT validation |
| **3. Application** | MCP Gateway | Role-based MCP server routing |
| **4. Service** | MCP Servers | Tool allow-listing, application filtering |
| **5. Database** | PostgreSQL RLS | Row-level data access control |
| **6. Network** | mTLS (prod) | Encrypted service-to-service communication |

This document focuses on **Layers 1, 3, and 5** - the IAM components that control who can access what data.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER AUTHENTICATION                             │
│                                                                             │
│  ┌─────────┐    ┌───────────────┐    ┌──────────────────────────────────┐  │
│  │ Browser │───►│ Keycloak SSO  │───►│ JWT Token with Claims:           │  │
│  │ or App  │    │ (OIDC + PKCE) │    │ - sub: user-uuid                 │  │
│  └─────────┘    │ + TOTP MFA    │    │ - resource_access.mcp-gateway.   │  │
│                 └───────────────┘    │   roles: [hr-read, executive]    │  │
│                                      │ - aud: [mcp-gateway]             │  │
│                                      └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             KEYCLOAK IAM MODEL                               │
│                                                                             │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   USERS     │    │     GROUPS      │    │     CLIENT ROLES            │ │
│  │             │    │                 │    │     (mcp-gateway)           │ │
│  │ eve.thompson│───►│ C-Suite         │───►│ executive (composite)       │ │
│  │ alice.chen  │───►│ HR-Department   │───►│ hr-read, hr-write           │ │
│  │ bob.martinez│───►│ Finance-Team    │───►│ finance-read, finance-write │ │
│  │ carol.johnson───►│ Sales-Managers  │───►│ sales-read, sales-write     │ │
│  │ dan.williams│───►│ Support-Team    │───►│ support-read, support-write │ │
│  └─────────────┘    └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP GATEWAY AUTHORIZATION                          │
│                                                                             │
│  JWT Token ──► Extract Roles ──► Map to MCP Servers ──► Allow/Deny Access   │
│                                                                             │
│  Role Mapping:                                                              │
│  ┌────────────────┬──────────────────────────────────────────────────────┐ │
│  │ User Role      │ Accessible MCP Servers                               │ │
│  ├────────────────┼──────────────────────────────────────────────────────┤ │
│  │ hr-read        │ mcp-hr                                               │ │
│  │ finance-read   │ mcp-finance                                          │ │
│  │ sales-read     │ mcp-sales                                            │ │
│  │ support-read   │ mcp-support                                          │ │
│  │ executive      │ mcp-hr, mcp-finance, mcp-sales, mcp-support          │ │
│  └────────────────┴──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATABASE ROW-LEVEL SECURITY (RLS)                         │
│                                                                             │
│  MCP Server ──► Set Session Variables ──► Execute Query ──► RLS Filters     │
│                                                                             │
│  Session Variables:                                                         │
│  - app.current_user_id    = 'user-uuid'                                     │
│  - app.current_user_roles = 'hr-read,hr-write'                              │
│  - app.current_user_department = 'Human Resources'                          │
│                                                                             │
│  RLS Policy Example (hr.employees):                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ USING (                                                              │  │
│  │   email = current_setting('app.current_user_id')  -- Self access    │  │
│  │   OR current_setting('app.current_user_roles') LIKE '%hr-read%'     │  │
│  │   OR current_setting('app.current_user_roles') LIKE '%executive%'   │  │
│  │   OR hr.is_manager_of(current_setting('app.current_user_id'), id)   │  │
│  │ )                                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### OIDC Authorization Code Flow with PKCE

```
┌──────────┐      ┌───────────────┐      ┌─────────────┐
│  Client  │      │   Keycloak    │      │ MCP Gateway │
│ (Browser)│      │  (IdP/SSO)    │      │   (API)     │
└────┬─────┘      └───────┬───────┘      └──────┬──────┘
     │                    │                     │
     │ 1. /authorize      │                     │
     │ + code_challenge   │                     │
     │ ─────────────────► │                     │
     │                    │                     │
     │ 2. Login Page      │                     │
     │ ◄───────────────── │                     │
     │                    │                     │
     │ 3. Username/Pass   │                     │
     │ ─────────────────► │                     │
     │                    │                     │
     │ 4. TOTP Code       │                     │
     │ ─────────────────► │                     │
     │                    │                     │
     │ 5. Redirect + code │                     │
     │ ◄───────────────── │                     │
     │                    │                     │
     │ 6. /token          │                     │
     │ + code_verifier    │                     │
     │ ─────────────────► │                     │
     │                    │                     │
     │ 7. JWT Tokens      │                     │
     │ ◄───────────────── │                     │
     │                    │                     │
     │ 8. API Request + Bearer Token            │
     │ ────────────────────────────────────────►│
     │                    │                     │
     │                    │  9. Validate Token  │
     │                    │ ◄───────────────────│
     │                    │                     │
     │                    │  10. Token Valid    │
     │                    │ ───────────────────►│
     │                    │                     │
     │ 11. API Response                         │
     │ ◄────────────────────────────────────────│
```

### Token Lifecycle

| Token Type | Lifetime | Purpose |
|------------|----------|---------|
| Access Token | 5 min (dev), 15 min (prod) | API authorization |
| Refresh Token | 30 min | Obtain new access tokens |
| ID Token | Same as access | User identity claims |

### MFA Enforcement

- **Algorithm**: TOTP (HmacSHA1, RFC 6238)
- **Digits**: 6
- **Period**: 30 seconds
- **Enforcement**: Required for all users via `browser-with-otp` authentication flow

---

## Authorization Model

### User → Group → Role → Policy Chain

The authorization model follows a hierarchical chain:

```
USER ──► GROUP ──► ROLE ──► POLICY
                     │         │
                     │         └──► Database RLS
                     │
                     └──► MCP Server Access
```

| Layer | Managed In | Example |
|-------|------------|---------|
| **User** | Keycloak, HR Sync | `alice.chen` |
| **Group** | Keycloak Groups | `HR-Department` |
| **Role** | Keycloak Client Roles | `hr-read`, `hr-write` |
| **Policy** | PostgreSQL RLS, MCP Gateway | `employee_hr_access` |

### Role Hierarchy

```
executive (composite role)
├── hr-read
├── finance-read
├── sales-read
└── support-read

Department Roles (independent):
├── hr-read → hr-write
├── finance-read → finance-write
├── sales-read → sales-write
└── support-read → support-write

Special Roles:
├── manager (for manager hierarchy access)
└── intern (minimal access)
```

### Access Levels

| Level | Description | Example User |
|-------|-------------|--------------|
| **Self** | Own data only | Marcus Johnson (Engineer) |
| **Manager** | Direct reports' data | Nina Patel (Eng Manager) |
| **Department** | All department data | Alice Chen (VP of HR) |
| **Executive** | All data (read-only) | Eve Thompson (CEO) |

### Client Roles vs Realm Roles

| Type | Scope | Used For | Example |
|------|-------|----------|---------|
| **Client Role** | Specific to `mcp-gateway` client | API authorization | `hr-read`, `finance-write` |
| **Realm Role** | Global across realm | Group inheritance | `manager`, `executive` |

**Important**: Roles defined on the `mcp-gateway` client appear in JWT tokens under:
```json
{
  "resource_access": {
    "mcp-gateway": {
      "roles": ["hr-read", "hr-write", "executive"]
    }
  }
}
```

---

## Keycloak Configuration

### Realm Settings

| Setting | Development | Production |
|---------|-------------|------------|
| Realm Name | `tamshai-corp` | `tamshai-corp` |
| SSL Required | `external` | `all` |
| Registration | Disabled | Disabled |
| Email Verification | Disabled | Enabled |
| Password Policy | `length(8)` | `length(12) + upperCase + lowerCase + digits + specialChars` |
| Access Token Lifespan | 5 min | 15 min |

### Groups

Groups provide role inheritance for users:

| Group | Roles Assigned | Description |
|-------|----------------|-------------|
| `C-Suite` | `executive`, `manager` | Executive leadership |
| `HR-Department` | `hr-read`, `hr-write` | HR staff |
| `Finance-Team` | `finance-read`, `finance-write` | Finance staff |
| `Sales-Team` | `sales-read` | Sales representatives |
| `Sales-Managers` | `sales-read`, `sales-write`, `manager` | Sales management |
| `Support-Team` | `support-read` | Support agents |
| `Engineering-Team` | (none) | Engineering ICs |
| `Engineering-Managers` | `manager` | Engineering management |
| `IT-Team` | (none) | IT staff |
| `Managers` | `manager` | Cross-functional managers |

### User-to-Group Mapping

Managed by `sync-realm.sh`:

```bash
# User → Group mappings (from sync-realm.sh)
"eve.thompson:C-Suite"
"alice.chen:HR-Department,Managers"
"bob.martinez:Finance-Team,Managers"
"carol.johnson:Sales-Managers"
"dan.williams:Support-Team,Managers"
"frank.davis:IT-Team"
"nina.patel:Engineering-Managers"
"marcus.johnson:Engineering-Team"
```

### Roles

Client roles defined on `mcp-gateway`:

| Role | Type | Description |
|------|------|-------------|
| `hr-read` | Simple | Read access to HR data |
| `hr-write` | Simple | Write access to HR data |
| `finance-read` | Simple | Read access to finance data |
| `finance-write` | Simple | Write access to finance data |
| `sales-read` | Simple | Read access to sales/CRM data |
| `sales-write` | Simple | Write access to sales/CRM data |
| `support-read` | Simple | Read access to support data |
| `support-write` | Simple | Write access to support data |
| `executive` | **Composite** | Includes: hr-read, finance-read, sales-read, support-read |

**Terraform Definition** (`infrastructure/terraform/keycloak/main.tf`):

```hcl
resource "keycloak_role" "executive" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "executive"
  description = "Executive access (read all departments)"

  composite_roles = [
    keycloak_role.hr_read.id,
    keycloak_role.finance_read.id,
    keycloak_role.sales_read.id,
    keycloak_role.support_read.id,
  ]
}
```

### Clients

| Client ID | Type | Purpose |
|-----------|------|---------|
| `mcp-gateway` | Confidential | Backend API gateway |
| `web-portal` | Public | Browser SPA (PKCE) |
| `tamshai-website` | Public | Marketing site SSO |
| `tamshai-flutter-client` | Public | Mobile/desktop app |
| `mcp-hr-service` | Confidential | Identity sync service account |
| `hr-app`, `finance-app`, `sales-app`, `support-app` | Public | Department web apps |

### Protocol Mappers

Critical mappers that ensure roles appear in JWT tokens:

| Mapper Name | Client | Purpose |
|-------------|--------|---------|
| `client-roles-mapper` | mcp-gateway | Include mcp-gateway roles in tokens |
| `mcp-gateway-roles-mapper` | web-portal | Include mcp-gateway roles in web-portal tokens |
| `mcp-gateway-audience` | web-portal, tamshai-website, tamshai-flutter-client | Add `mcp-gateway` to audience claim |
| `subject-claim-mapper` | All web clients | Ensure `sub` claim is present |

**Why Mappers Matter**:
Without proper protocol mappers, JWT tokens may have empty or missing role claims, causing 401/403 errors even for authenticated users.

---

## MCP Gateway Authorization

### Role-to-MCP Server Mapping

The MCP Gateway routes requests based on user roles:

**File**: `services/mcp-gateway/src/mcp/role-mapper.ts`

```typescript
export function createDefaultMCPServers(mcpServerUrls: {
  hr: string;
  finance: string;
  sales: string;
  support: string;
}): MCPServerConfig[] {
  return [
    {
      name: 'hr',
      url: mcpServerUrls.hr,
      requiredRoles: ['hr-read', 'hr-write', 'executive'],
      description: 'HR data including employees, departments, org structure',
    },
    {
      name: 'finance',
      url: mcpServerUrls.finance,
      requiredRoles: ['finance-read', 'finance-write', 'executive'],
      description: 'Financial data including budgets, reports, invoices',
    },
    {
      name: 'sales',
      url: mcpServerUrls.sales,
      requiredRoles: ['sales-read', 'sales-write', 'executive'],
      description: 'CRM data including customers, deals, pipeline',
    },
    {
      name: 'support',
      url: mcpServerUrls.support,
      requiredRoles: ['support-read', 'support-write', 'executive'],
      description: 'Support data including tickets, knowledge base',
    },
  ];
}
```

### Access Decision Logic

A user can access an MCP server if they have **ANY** of the server's required roles:

```typescript
export function getAccessibleMCPServers(
  userRoles: string[],
  servers: MCPServerConfig[]
): MCPServerConfig[] {
  return servers.filter((server) =>
    server.requiredRoles.some((role) => userRoles.includes(role))
  );
}
```

**Example Access Decisions**:

| User | Roles | Accessible MCP Servers |
|------|-------|------------------------|
| eve.thompson | `executive` | hr, finance, sales, support |
| alice.chen | `hr-read`, `hr-write` | hr |
| bob.martinez | `finance-read`, `finance-write` | finance |
| marcus.johnson | (none) | (none) |

### JWT Token Validation

**File**: `services/mcp-gateway/src/middleware/auth.middleware.ts`

```typescript
export function createAuthMiddleware(config: AuthMiddlewareConfig) {
  return async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7); // Remove "Bearer "

    // 1. Validate token signature with Keycloak JWKS
    const userContext = await jwtValidator.validateToken(token);

    // 2. Check token revocation in Redis
    if (await isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // 3. Attach user context to request
    req.userContext = userContext;
    next();
  };
}
```

**User Context Structure**:
```typescript
interface UserContext {
  userId: string;      // Keycloak user UUID
  username: string;    // e.g., "alice.chen"
  email: string;       // e.g., "alice@tamshai.com"
  roles: string[];     // e.g., ["hr-read", "hr-write"]
  groups: string[];    // e.g., ["/HR-Department", "/Managers"]
}
```

---

## Database-Level Security (RLS)

### PostgreSQL Row Level Security

Row Level Security (RLS) provides defense-in-depth by enforcing access control at the database level, even if application logic is bypassed.

**Key Principle**: Even if an attacker compromises the MCP Gateway, they cannot access data beyond what RLS policies allow.

### Database Users

| User | BYPASSRLS | Purpose |
|------|-----------|---------|
| `tamshai` | Yes | Admin operations, identity sync |
| `tamshai_app` | **No** | MCP servers, application queries |

**File**: `sample-data/hr-data.sql`

```sql
-- Admin user with BYPASSRLS for sync operations
ALTER USER tamshai BYPASSRLS;

-- Application user without BYPASSRLS - RLS enforced
CREATE ROLE tamshai_app WITH LOGIN PASSWORD 'changeme';
-- Note: tamshai_app does NOT have BYPASSRLS
```

### Session Variable Propagation

MCP servers set session variables before executing queries:

```typescript
// Set user context for RLS policies
await db.query(`
  SET LOCAL app.current_user_id = $1;
  SET LOCAL app.current_user_roles = $2;
  SET LOCAL app.current_user_department = $3;
`, [userId, roles.join(','), department]);
```

### RLS Policy Examples

#### HR Employee Access

**File**: `sample-data/hr-data.sql`

```sql
-- Enable RLS on employees table
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;

-- Policy: Self-access (any employee can view their own record)
CREATE POLICY employee_self_access ON hr.employees
FOR SELECT USING (
  email = current_setting('app.current_user_id', true)
);

-- Policy: HR staff can view all employees
CREATE POLICY employee_hr_access ON hr.employees
FOR SELECT USING (
  current_setting('app.current_user_roles', true) LIKE '%hr-read%'
  OR current_setting('app.current_user_roles', true) LIKE '%hr-write%'
);

-- Policy: Executives can view all employees (read-only)
CREATE POLICY employee_executive_access ON hr.employees
FOR SELECT USING (
  current_setting('app.current_user_roles', true) LIKE '%executive%'
);

-- Policy: Managers can view their direct reports
CREATE POLICY employee_manager_access ON hr.employees
FOR SELECT USING (
  hr.is_manager_of(
    current_setting('app.current_user_id', true)::uuid,
    id
  )
);
```

#### Manager Hierarchy Function

```sql
-- Function to check if a user is a manager of an employee
-- Uses SECURITY DEFINER to bypass RLS when checking hierarchy
CREATE OR REPLACE FUNCTION hr.is_manager_of(
  manager_user_id UUID,
  employee_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  current_manager UUID;
  max_depth INT := 10;
  depth INT := 0;
BEGIN
  -- Get the manager chain
  SELECT manager_id INTO current_manager
  FROM hr.employees WHERE id = employee_id;

  WHILE current_manager IS NOT NULL AND depth < max_depth LOOP
    IF current_manager = manager_user_id THEN
      RETURN TRUE;
    END IF;
    SELECT manager_id INTO current_manager
    FROM hr.employees WHERE id = current_manager;
    depth := depth + 1;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;  -- Run with creator's privileges to avoid RLS recursion
```

#### Finance Budget Access

**File**: `sample-data/finance-data.sql`

```sql
ALTER TABLE finance.department_budgets ENABLE ROW LEVEL SECURITY;

-- Finance staff can view all budgets
CREATE POLICY budget_finance_access ON finance.department_budgets
FOR SELECT USING (
  current_setting('app.current_user_roles', true) LIKE '%finance-read%'
  OR current_setting('app.current_user_roles', true) LIKE '%finance-write%'
);

-- Executives can view all budgets
CREATE POLICY budget_executive_access ON finance.department_budgets
FOR SELECT USING (
  current_setting('app.current_user_roles', true) LIKE '%executive%'
);

-- Department managers can view their department's budget
CREATE POLICY budget_department_access ON finance.department_budgets
FOR SELECT USING (
  department = current_setting('app.current_user_department', true)
  AND current_setting('app.current_user_roles', true) LIKE '%manager%'
);
```

### RLS Policy Summary

| Table | Policies | Access Model |
|-------|----------|--------------|
| `hr.employees` | 7 | Self, Manager, HR, Executive |
| `hr.performance_reviews` | 3 | Self, Manager, HR |
| `hr.departments` | 1 | Public read |
| `hr.grade_levels` | 1 | Public read |
| `finance.department_budgets` | 4 | Finance, Executive, Department manager |
| `finance.invoices` | 4 | Finance, Executive, Department |
| `finance.financial_reports` | 5 | Public (published), Finance, Executive, Creator |
| `finance.expenses` | 6 | Self, Finance, Executive, Manager |

---

## Terraform IAM Configuration

### Keycloak Terraform Resources

**File**: `infrastructure/terraform/keycloak/main.tf`

```hcl
# Realm
resource "keycloak_realm" "tamshai_corp" {
  realm = "tamshai-corp"
  # ... settings
}

# Client Roles (on mcp-gateway)
resource "keycloak_role" "hr_read" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "hr-read"
  description = "Read access to HR data"
}

# Composite Role
resource "keycloak_role" "executive" {
  realm_id    = keycloak_realm.tamshai_corp.id
  client_id   = keycloak_openid_client.mcp_gateway.id
  name        = "executive"
  description = "Executive access (read all departments)"

  composite_roles = [
    keycloak_role.hr_read.id,
    keycloak_role.finance_read.id,
    keycloak_role.sales_read.id,
    keycloak_role.support_read.id,
  ]
}

# User with Roles
resource "keycloak_user" "alice_chen" {
  realm_id   = keycloak_realm.tamshai_corp.id
  username   = "alice.chen"
  email      = "alice@tamshai.com"
  # ...
}

resource "keycloak_user_roles" "alice_chen_roles" {
  realm_id = keycloak_realm.tamshai_corp.id
  user_id  = keycloak_user.alice_chen.id
  role_ids = [
    keycloak_role.hr_read.id,
    keycloak_role.hr_write.id,
  ]
}
```

### GCP IAM Configuration

**File**: `infrastructure/terraform/modules/security/main.tf`

```hcl
# Service Accounts
resource "google_service_account" "mcp_gateway" {
  account_id   = "${var.environment}-mcp-gateway"
  display_name = "MCP Gateway Service Account"
}

resource "google_service_account" "mcp_servers" {
  account_id   = "${var.environment}-mcp-servers"
  display_name = "MCP Servers Service Account"
}

# Cloud Run Invoker permissions (service-to-service)
resource "google_cloud_run_service_iam_member" "mcp_gateway_invoke_hr" {
  service  = google_cloud_run_service.mcp_hr.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.mcp_gateway.email}"
}
```

---

## Service Account Authentication

### Identity Sync Service Account

The `mcp-hr-service` client is used for syncing HR employees to Keycloak:

**Configuration** (`sync-realm.sh`):

```bash
sync_mcp_hr_service_client() {
    local client_json='{
        "clientId": "mcp-hr-service",
        "enabled": true,
        "publicClient": false,
        "serviceAccountsEnabled": true,
        "standardFlowEnabled": false,
        "directAccessGrantsEnabled": false,
        # ...
    }'

    # Assign realm-management roles for Admin API access
    $KCADM add-roles -r "$REALM" \
        --uusername "service-account-mcp-hr-service" \
        --cclientid realm-management \
        --rolename manage-users

    $KCADM add-roles -r "$REALM" \
        --uusername "service-account-mcp-hr-service" \
        --cclientid realm-management \
        --rolename view-users
}
```

### Client Credentials Flow

```bash
# Obtain service account token
curl -X POST "$KEYCLOAK_URL/protocol/openid-connect/token" \
  -d "client_id=mcp-hr-service" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

---

## Security Best Practices

### Token Security

1. **Short Token Lifetimes**: Access tokens expire in 5-15 minutes
2. **Token Revocation**: Redis cache tracks revoked token JTIs
3. **PKCE Required**: All public clients must use PKCE for authorization code flow
4. **No Direct Access Grants**: Browser apps cannot use password grant

### Role Assignment

1. **Least Privilege**: Assign minimum required roles
2. **Group-Based Assignment**: Prefer group membership over direct role assignment
3. **Composite Roles**: Use composite roles for cross-department access
4. **Separation of Duties**: Write roles separate from read roles

### Database Security

1. **RLS Always Enabled**: Never disable RLS on sensitive tables
2. **Application User**: Use `tamshai_app` (no BYPASSRLS) for all application queries
3. **Session Variables**: Always set user context before queries
4. **Audit Logging**: `access_audit_log` table tracks data access

### Production Hardening

1. **mTLS**: Encrypt all service-to-service communication
2. **SSL Required**: Force HTTPS for all Keycloak connections
3. **No Test Users**: Production realm has no pre-seeded users
4. **Secret Rotation**: Rotate client secrets and passwords regularly

---

## Troubleshooting

### Common 401/403 Errors

| Symptom | Cause | Solution |
|---------|-------|----------|
| 401 Unauthorized | Missing/expired token | Check token expiration, refresh |
| 401 "Invalid issuer" | Keycloak URL mismatch | Ensure consistent Keycloak URLs |
| 403 "Your roles: None" | Missing role mapper | Run `sync-realm.sh` to add mappers |
| 403 "ACCESS_DENIED" | Missing required role | Assign user to appropriate group |
| 403 HTML (Cloud Run) | Missing GCP identity token | Check service account IAM bindings |

### Debugging JWT Tokens

```bash
# Decode token (header.payload.signature)
echo "$TOKEN" | cut -d. -f2 | base64 -d | jq .

# Check for roles
echo "$TOKEN" | cut -d. -f2 | base64 -d | jq '.resource_access["mcp-gateway"].roles'

# Check audience
echo "$TOKEN" | cut -d. -f2 | base64 -d | jq '.aud'
```

### Verifying RLS Policies

```bash
# Connect as tamshai_app (RLS enforced)
docker exec -it postgres psql -U tamshai_app -d tamshai_hr

# Set user context
SET app.current_user_id = 'marcus@tamshai.com';
SET app.current_user_roles = '';

# Query should return only Marcus's record
SELECT * FROM hr.employees;

# Query as HR user
SET app.current_user_roles = 'hr-read';
SELECT * FROM hr.employees;  -- Returns all employees
```

### Keycloak Management Commands

```bash
# Sync clients and roles
./scripts/infra/keycloak.sh sync dev

# List users and roles
./scripts/infra/keycloak.sh users dev

# View Keycloak logs
./scripts/infra/keycloak.sh logs dev
```

---

## Related Documentation

- [Security Model](../architecture/security-model.md)
- [Keycloak Management Guide](../operations/KEYCLOAK_MANAGEMENT.md)
- [Dev/Prod Config Differences](../keycloak/DEV_PROD_CONFIG_DIFFERENCES.md)
- [IAM Security Remediation Plan](IAM_SECURITY_REMEDIATION_PLAN.md)
- [IAM Portal Alignment Plan](IAM_PORTAL_ALIGNMENT_PLAN.md)
- [IAM Self-Access Plan](../plans/IAM_SELF_ACCESS_PLAN.md) - Plan to enable self-access for all employees
- [Security Layer Specification](../../.specify/specs/002-security-layer/spec.md)

---

*Last Updated: January 13, 2026*
*Author: Tamshai-Dev*
*Version: 1.0*
