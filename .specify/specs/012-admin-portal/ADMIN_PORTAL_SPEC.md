# Admin Portal - User & Service Account Management System

**Version**: 1.0
**Status**: Approved for Implementation
**Created**: 2026-01-09
**Owner**: QA Lead / Dev Lead

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [API Specifications](#api-specifications)
5. [Database Schema](#database-schema)
6. [Security Model](#security-model)
7. [UI/UX Design](#uiux-design)
8. [Implementation Phases](#implementation-phases)
9. [Testing Strategy](#testing-strategy)
10. [Deployment & Operations](#deployment--operations)

---

## Overview

### Purpose

Provide administrative capabilities for managing Keycloak users, roles, and service accounts outside the HR employee provisioning flow. This is essential for:

- **Test Users**: QA/E2E testing accounts (e.g., test-user.journey)
- **Contractors**: Temporary access for external consultants
- **Partners**: External users with limited roles
- **Service Accounts**: Machine-to-machine OAuth client credentials for integrations

### Current State

| Capability | Status | Limitation |
|------------|--------|------------|
| HR Employee Auto-Provisioning | ✅ Working | Only for employees in PostgreSQL |
| Service Account Clients | ✅ Working | Managed via `sync-realm.sh` (CLI only) |
| Ad-hoc User Creation | ❌ Missing | Requires Keycloak Admin Console expertise |
| RBAC Visibility | ❌ Missing | No centralized view of role assignments |
| Audit Trail | ❌ Missing | No record of admin actions |

### Goals

1. **Programmatic Access**: REST API for user/role/service account management
2. **Self-Service UI**: Admin portal for creating users without Keycloak expertise
3. **RBAC Transparency**: Dashboard showing role distribution and hierarchy
4. **Audit Compliance**: Complete audit trail of all admin actions
5. **Security**: Role-based access to admin functions (admin/executive only)

---

## Problem Statement

### User Types Without Provisioning Path

| User Type | Use Case | Current Workaround | Problem |
|-----------|----------|-------------------|---------|
| **Test User** | E2E testing, automated journeys | Manual Keycloak import | Time-consuming, error-prone |
| **Contractor** | Temporary project access (3-6 months) | Create fake HR employee | Pollutes employee database |
| **External User** | Partner/vendor with limited access | Email credentials workaround | Security risk, no SSO |
| **Service Account** | API integration (Salesforce, Slack, etc.) | Manual OAuth client setup | Requires deep Keycloak knowledge |

### RBAC Visibility Gap

**Scenario**: Executive asks "Who has access to finance data?"

**Current Process**:
1. SSH into Keycloak container
2. Run `kcadm.sh` queries
3. Parse JSON output
4. Manually cross-reference with HR data

**Time Required**: 15-30 minutes
**Skill Required**: DevOps/Admin CLI proficiency

**Desired Process**:
1. Open Admin Portal
2. View RBAC Overview dashboard
3. Click "Finance-Read Role" → See member list

**Time Required**: 30 seconds
**Skill Required**: None (web UI)

---

## Solution Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                  Admin Portal UI                     │
│            (React + Vite + TailwindCSS)             │
│                                                      │
│  [Users] [RBAC] [Service Accounts] [Audit Log]     │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS + JWT
                   ▼
┌─────────────────────────────────────────────────────┐
│              MCP Gateway (Extended)                  │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  /admin/* Routes (New)                         │ │
│  │  - requireRole(['admin', 'executive'])         │ │
│  │  - User CRUD, Role Management, Service Accts   │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Keycloak Admin Client                         │ │
│  │  (@keycloak/keycloak-admin-client)             │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Audit Logger                                  │ │
│  │  (Logs to PostgreSQL admin schema)             │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
  ┌──────────┐         ┌──────────────┐
  │ Keycloak │         │  PostgreSQL  │
  │  (IAM)   │         │ (Audit Log)  │
  └──────────┘         └──────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Admin Portal UI** | User-friendly interface for admin operations |
| **MCP Gateway /admin Routes** | Business logic, validation, orchestration |
| **Keycloak Admin Client** | Direct Keycloak REST API integration |
| **Audit Logger** | Immutable audit trail in PostgreSQL |
| **PostgreSQL admin schema** | Audit log storage, query performance |

### Why Extend MCP Gateway (vs. New Microservice)?

**Pros**:
- ✅ Reuses existing JWT validation, RBAC middleware
- ✅ Single deployment artifact, simpler operations
- ✅ Faster to implement (no new service boilerplate)
- ✅ Centralized admin operations

**Cons**:
- ⚠️ Increases MCP Gateway scope (but within bounded context)
- ⚠️ Slightly higher memory footprint (Keycloak admin client)

**Decision**: Extend MCP Gateway. Admin operations are a natural fit for the "AI Orchestration Gateway" which already handles auth/authz.

---

## API Specifications

### Base Path

```
/admin/*
```

### Authentication

All `/admin/*` routes require:
- Valid JWT token (from Keycloak)
- `admin` or `executive` role in token

```typescript
// Middleware
router.use('/admin', authenticate, requireRole(['admin', 'executive']));
```

---

### User Management Endpoints

#### `GET /admin/users`

**Description**: List all users (paginated)

**Query Parameters**:
```typescript
{
  page?: number;         // Default: 1
  limit?: number;        // Default: 50, max: 100
  search?: string;       // Search username, email, name
  type?: 'all' | 'hr-source' | 'manual' | 'service-account';
  enabled?: boolean;     // Filter by enabled status
  role?: string;         // Filter by role name
}
```

**Response** (200 OK):
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "alice.chen",
      "email": "alice@tamshai.com",
      "firstName": "Alice",
      "lastName": "Chen",
      "enabled": true,
      "emailVerified": true,
      "createdTimestamp": 1704067200000,
      "attributes": {
        "department": ["HR"],
        "employeeId": ["E001"],
        "source": ["hr-database"]
      },
      "roles": ["hr-read", "hr-write"],
      "groups": []
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Missing/invalid JWT
- `403 Forbidden`: User lacks admin role
- `500 Internal Server Error`: Keycloak connection failure

---

#### `GET /admin/users/:userId`

**Description**: Get user details including roles, attributes, audit history

**Response** (200 OK):
```json
{
  "user": {
    "id": "uuid",
    "username": "test-user.journey",
    "email": "test-user@tamshai.com",
    "firstName": "Test",
    "lastName": "User",
    "enabled": true,
    "emailVerified": true,
    "createdTimestamp": 1704067200000,
    "attributes": {
      "department": ["Testing"],
      "employeeId": ["TEST001"],
      "source": ["manual"]
    },
    "roles": [],
    "groups": [],
    "requiredActions": [],
    "lastLogin": "2026-01-09T12:34:56Z",
    "loginCount": 42
  },
  "auditHistory": [
    {
      "timestamp": "2026-01-08T10:00:00Z",
      "action": "role_assigned",
      "adminUser": "admin",
      "details": { "role": "sales-read" }
    }
  ]
}
```

**Error Responses**:
- `404 Not Found`: User does not exist

---

#### `POST /admin/users`

**Description**: Create new user (test account, contractor, external user)

**Request Body**:
```json
{
  "username": "contractor.john",
  "email": "john.contractor@example.com",
  "firstName": "John",
  "lastName": "Contractor",
  "userType": "contractor",        // 'test' | 'contractor' | 'external'
  "temporaryPassword": "TempPass123!",
  "requirePasswordChange": true,
  "enabled": true,
  "emailVerified": false,
  "attributes": {
    "department": ["Engineering"],
    "contractEnd": ["2026-06-30"],
    "title": ["Senior Consultant"]
  },
  "roles": ["sales-read"]           // Initial role assignments
}
```

**Response** (201 Created):
```json
{
  "userId": "uuid",
  "username": "contractor.john",
  "email": "john.contractor@example.com",
  "temporaryPassword": "TempPass123!",
  "message": "User created successfully. Password must be changed on first login."
}
```

**Validation Rules**:
- Username: 3-50 chars, alphanumeric + `.`, `-`, `_`
- Email: Valid email format, unique in realm
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special
- Roles: Must be valid Keycloak roles

**Error Responses**:
- `400 Bad Request`: Validation failure
- `409 Conflict`: Username or email already exists

---

#### `PATCH /admin/users/:userId`

**Description**: Update user details

**Request Body** (all fields optional):
```json
{
  "email": "new-email@example.com",
  "firstName": "NewFirst",
  "lastName": "NewLast",
  "enabled": false,
  "emailVerified": true,
  "attributes": {
    "title": ["Updated Title"]
  }
}
```

**Response** (200 OK):
```json
{
  "message": "User updated successfully",
  "updatedFields": ["email", "enabled"]
}
```

**Business Rules**:
- Cannot disable users with source=hr-database (managed by identity-sync)
- Email changes trigger email verification reset
- Attribute updates are merged (not replaced)

---

#### `DELETE /admin/users/:userId`

**Description**: Delete user (soft delete for HR users, hard delete for manual users)

**Query Parameters**:
```typescript
{
  force?: boolean;  // Default: false. If true, hard delete even HR users
}
```

**Response** (200 OK):
```json
{
  "message": "User deleted successfully",
  "deleteType": "soft",  // 'soft' | 'hard'
  "restorable": true
}
```

**Business Rules**:
- HR-sourced users: Soft delete (set enabled=false, add deletedAt attribute)
- Manual users: Hard delete from Keycloak
- Service accounts: Cannot delete via this endpoint (use /admin/service-accounts)

**Error Responses**:
- `400 Bad Request`: Cannot delete service account via this endpoint
- `409 Conflict`: User has active sessions

---

#### `POST /admin/users/:userId/reset-password`

**Description**: Reset user password (admin-initiated)

**Request Body**:
```json
{
  "newPassword": "NewPass123!",
  "temporary": true    // Default: true (forces change on next login)
}
```

**Response** (200 OK):
```json
{
  "message": "Password reset successfully",
  "temporary": true
}
```

---

### Role Management Endpoints

#### `GET /admin/roles`

**Description**: List all realm roles

**Response** (200 OK):
```json
{
  "roles": [
    {
      "id": "uuid",
      "name": "hr-read",
      "description": "Read access to HR data",
      "composite": false,
      "clientRole": false,
      "members": 12
    },
    {
      "id": "uuid",
      "name": "executive",
      "description": "Executive-level access (composite)",
      "composite": true,
      "composites": {
        "realm": ["hr-read", "finance-read", "sales-read", "support-read"]
      },
      "members": 2
    }
  ]
}
```

---

#### `POST /admin/roles`

**Description**: Create new realm role

**Request Body**:
```json
{
  "name": "marketing-read",
  "description": "Read access to marketing data",
  "composite": false
}
```

**Response** (201 Created):
```json
{
  "roleId": "uuid",
  "name": "marketing-read",
  "message": "Role created successfully"
}
```

**Business Rules**:
- Role names: lowercase, alphanumeric + `-`
- Reserved names: admin, user, default-roles-*

**Error Responses**:
- `409 Conflict`: Role already exists

---

#### `DELETE /admin/roles/:roleName`

**Description**: Delete realm role

**Query Parameters**:
```typescript
{
  force?: boolean;  // Default: false. Must be true if role has members.
}
```

**Response** (200 OK):
```json
{
  "message": "Role deleted successfully",
  "previousMembers": 3
}
```

**Business Rules**:
- Cannot delete roles with active members unless force=true
- Deleting a role removes it from all users
- Cannot delete built-in roles (hr-read, finance-read, etc.)

**Error Responses**:
- `400 Bad Request`: Cannot delete built-in role
- `409 Conflict`: Role has members and force=false

---

#### `GET /admin/users/:userId/roles`

**Description**: Get user's assigned roles

**Response** (200 OK):
```json
{
  "userId": "uuid",
  "username": "alice.chen",
  "roles": [
    {
      "id": "uuid",
      "name": "hr-read",
      "description": "Read access to HR data",
      "assignedAt": "2026-01-01T00:00:00Z",
      "assignedBy": "admin"
    }
  ]
}
```

---

#### `POST /admin/users/:userId/roles`

**Description**: Assign role to user

**Request Body**:
```json
{
  "roleName": "finance-read"
}
```

**Response** (200 OK):
```json
{
  "message": "Role assigned successfully",
  "userId": "uuid",
  "roleName": "finance-read"
}
```

**Business Rules**:
- Cannot assign roles higher than your own (security check)
- Audit log entry created
- Role assignment is idempotent (no error if already assigned)

**Error Responses**:
- `403 Forbidden`: Cannot assign role higher than your own
- `404 Not Found`: User or role does not exist

---

#### `DELETE /admin/users/:userId/roles/:roleName`

**Description**: Revoke role from user

**Response** (200 OK):
```json
{
  "message": "Role revoked successfully",
  "userId": "uuid",
  "roleName": "finance-read"
}
```

**Business Rules**:
- Cannot revoke roles from yourself (prevents lockout)
- Audit log entry created
- Idempotent (no error if role not assigned)

**Error Responses**:
- `400 Bad Request`: Cannot revoke role from yourself

---

### Service Account Management Endpoints

#### `GET /admin/service-accounts`

**Description**: List all service account OAuth clients

**Response** (200 OK):
```json
{
  "serviceAccounts": [
    {
      "clientId": "mcp-hr-service",
      "name": "MCP HR Service",
      "description": "Identity sync service for HR employees",
      "enabled": true,
      "serviceAccountsEnabled": true,
      "serviceAccountUserId": "uuid",
      "roles": ["manage-users", "query-users"],
      "createdAt": "2025-01-01T00:00:00Z",
      "lastUsed": "2026-01-09T12:00:00Z",
      "type": "system"  // 'system' | 'integration' | 'test'
    }
  ]
}
```

---

#### `POST /admin/service-accounts`

**Description**: Create new service account (OAuth client with client credentials grant)

**Request Body**:
```json
{
  "clientId": "salesforce-integration",
  "name": "Salesforce Sync Integration",
  "description": "Syncs opportunities from Tamshai to Salesforce",
  "roles": ["sales-read"],
  "type": "integration",
  "attributes": {
    "owner": "alice.chen@tamshai.com",
    "expiry": "2026-12-31"
  }
}
```

**Response** (201 Created):
```json
{
  "clientId": "salesforce-integration",
  "clientSecret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "serviceAccountUserId": "uuid",
  "message": "Service account created successfully",
  "warning": "Client secret is shown only once. Store it securely."
}
```

**Security Notes**:
- Client secret is only displayed once at creation
- Must be stored in secure vault (HashiCorp Vault, AWS Secrets Manager)
- Cannot be retrieved later (only regenerated)

---

#### `POST /admin/service-accounts/:clientId/regenerate-secret`

**Description**: Rotate client secret (zero-downtime with grace period)

**Response** (200 OK):
```json
{
  "clientId": "salesforce-integration",
  "newSecret": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
  "message": "Client secret rotated successfully",
  "gracePeriod": "72 hours",
  "oldSecretExpiresAt": "2026-01-12T12:00:00Z"
}
```

**Business Rules**:
- Old secret remains valid for 72 hours (configurable)
- Allows zero-downtime rotation
- Audit log entry created

---

#### `DELETE /admin/service-accounts/:clientId`

**Description**: Delete service account

**Response** (200 OK):
```json
{
  "message": "Service account deleted successfully",
  "clientId": "salesforce-integration",
  "revokedSessions": 0
}
```

**Business Rules**:
- Cannot delete system service accounts (mcp-hr-service, etc.)
- All active tokens are immediately revoked

**Error Responses**:
- `400 Bad Request`: Cannot delete system service account

---

### RBAC Overview Endpoints

#### `GET /admin/rbac/overview`

**Description**: High-level RBAC summary for dashboard

**Response** (200 OK):
```json
{
  "summary": {
    "totalUsers": 42,
    "totalRoles": 12,
    "usersWithNoRoles": 3,
    "mostCommonRole": "sales-read",
    "recentRoleChanges": 5
  },
  "roleDistribution": [
    { "roleName": "executive", "members": 2 },
    { "roleName": "hr-read", "members": 5 },
    { "roleName": "finance-write", "members": 3 },
    { "roleName": "sales-read", "members": 8 }
  ],
  "roleHierarchy": {
    "executive": {
      "type": "composite",
      "composites": ["hr-read", "hr-write", "finance-read", "finance-write", "sales-read", "sales-write", "support-read", "support-write"]
    },
    "hr-write": {
      "type": "simple",
      "impliedBy": ["executive"]
    }
  }
}
```

---

#### `GET /admin/rbac/roles/:roleName/members`

**Description**: List all users with specific role

**Response** (200 OK):
```json
{
  "roleName": "finance-read",
  "description": "Read access to finance data",
  "members": [
    {
      "userId": "uuid",
      "username": "bob.martinez",
      "email": "bob@tamshai.com",
      "assignedAt": "2026-01-01T00:00:00Z",
      "assignedBy": "admin",
      "source": "direct"  // 'direct' | 'composite'
    }
  ],
  "totalMembers": 1
}
```

---

#### `GET /admin/audit-log`

**Description**: Audit trail of all admin actions

**Query Parameters**:
```typescript
{
  page?: number;
  limit?: number;
  actionType?: string;         // 'create_user', 'assign_role', etc.
  adminUserId?: string;
  targetUserId?: string;
  startDate?: string;           // ISO 8601
  endDate?: string;
}
```

**Response** (200 OK):
```json
{
  "auditEntries": [
    {
      "id": "uuid",
      "timestamp": "2026-01-09T12:00:00Z",
      "adminUserId": "uuid",
      "adminUsername": "alice.chen",
      "actionType": "assign_role",
      "targetUserId": "uuid",
      "targetUsername": "bob.martinez",
      "roleName": "finance-read",
      "details": {
        "reason": "Promoted to Finance Manager"
      },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "total": 156,
    "page": 1,
    "limit": 50
  }
}
```

---

## Database Schema

### New Schema: `admin`

```sql
CREATE SCHEMA IF NOT EXISTS admin;
```

### Audit Log Table

```sql
CREATE TABLE admin.user_management_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who performed the action
  admin_user_id UUID NOT NULL,
  admin_username TEXT NOT NULL,
  admin_email TEXT,

  -- What action was taken
  action_type TEXT NOT NULL,  -- 'create_user', 'update_user', 'delete_user',
                              -- 'assign_role', 'revoke_role', 'reset_password',
                              -- 'create_service_account', 'rotate_secret', etc.

  -- Who/what was affected
  target_user_id UUID,
  target_username TEXT,
  target_email TEXT,
  role_name TEXT,

  -- Additional context
  details JSONB,              -- Free-form additional data
  changes JSONB,              -- Before/after values for updates

  -- Security metadata
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,

  -- Compliance
  retention_until TIMESTAMPTZ -- For GDPR right-to-delete
);

-- Performance indexes
CREATE INDEX idx_audit_timestamp ON admin.user_management_audit(timestamp DESC);
CREATE INDEX idx_audit_admin ON admin.user_management_audit(admin_user_id);
CREATE INDEX idx_audit_target ON admin.user_management_audit(target_user_id);
CREATE INDEX idx_audit_action ON admin.user_management_audit(action_type);
CREATE INDEX idx_audit_role ON admin.user_management_audit(role_name) WHERE role_name IS NOT NULL;

-- Full-text search on details
CREATE INDEX idx_audit_details_gin ON admin.user_management_audit USING gin(details);

-- Row-level security (prevent deletion)
ALTER TABLE admin.user_management_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_append_only ON admin.user_management_audit
  FOR INSERT
  TO tamshai_app
  WITH CHECK (true);

-- Only allow SELECTs for tamshai_app
CREATE POLICY audit_read_only ON admin.user_management_audit
  FOR SELECT
  TO tamshai_app
  USING (true);

-- Prevent updates and deletes
-- (no UPDATE or DELETE policies = denied by default)

COMMENT ON TABLE admin.user_management_audit IS 'Immutable audit log for all admin portal actions. Append-only for compliance.';
```

### Service Account Metadata Table

```sql
CREATE TABLE admin.service_account_metadata (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  account_type TEXT NOT NULL,  -- 'system' | 'integration' | 'test'

  -- Ownership
  created_by_user_id UUID NOT NULL,
  created_by_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lifecycle
  last_used_at TIMESTAMPTZ,
  last_secret_rotation TIMESTAMPTZ,
  secret_expires_at TIMESTAMPTZ,

  -- Attributes
  attributes JSONB,

  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID,

  CONSTRAINT valid_account_type CHECK (account_type IN ('system', 'integration', 'test'))
);

CREATE INDEX idx_sa_type ON admin.service_account_metadata(account_type);
CREATE INDEX idx_sa_created_by ON admin.service_account_metadata(created_by_user_id);
CREATE INDEX idx_sa_last_used ON admin.service_account_metadata(last_used_at DESC);

COMMENT ON TABLE admin.service_account_metadata IS 'Metadata for service accounts (OAuth clients). Complements Keycloak client data.';
```

---

## Security Model

### Role-Based Access Control

#### Admin Portal Roles

| Role | Permissions | Use Case |
|------|-------------|----------|
| `admin` | Full admin portal access | IT administrators, DevOps |
| `executive` | View-only RBAC, cannot delete users | C-suite visibility |
| `hr-write` | Can create/disable users (no role changes) | HR managers |

### Authorization Matrix

| Endpoint | admin | executive | hr-write |
|----------|-------|-----------|----------|
| GET /admin/users | ✅ | ✅ | ✅ |
| POST /admin/users | ✅ | ❌ | ✅ |
| DELETE /admin/users | ✅ | ❌ | ❌ |
| POST /admin/users/:id/roles | ✅ | ❌ | ❌ |
| DELETE /admin/users/:id/roles | ✅ | ❌ | ❌ |
| POST /admin/roles | ✅ | ❌ | ❌ |
| DELETE /admin/roles | ✅ | ❌ | ❌ |
| POST /admin/service-accounts | ✅ | ❌ | ❌ |
| GET /admin/rbac/* | ✅ | ✅ | ❌ |
| GET /admin/audit-log | ✅ | ✅ | ❌ |

### Security Controls

#### 1. **Multi-Factor Authentication**

- Admin role assignment requires MFA enabled
- Enforced via Keycloak required actions
- TOTP (Google Authenticator, Authy) or WebAuthn (YubiKey)

#### 2. **Re-Authentication for Sensitive Actions**

```typescript
// Require fresh authentication (<15 minutes) for:
const SENSITIVE_ACTIONS = [
  'DELETE /admin/users/:userId',
  'POST /admin/service-accounts/:clientId/regenerate-secret',
  'POST /admin/users/:userId/roles (for executive role)',
];

// Check auth_time claim in JWT
if (Date.now() - token.auth_time > 15 * 60 * 1000) {
  throw new Error('Re-authentication required');
}
```

#### 3. **Privilege Escalation Prevention**

```typescript
// Cannot assign roles you don't have
function canAssignRole(adminRoles: string[], targetRole: string): boolean {
  // Executive can assign any role (super-admin)
  if (adminRoles.includes('executive')) return true;

  // Admin can assign any role except executive
  if (adminRoles.includes('admin') && targetRole !== 'executive') return true;

  // HR-write can only assign basic roles
  if (adminRoles.includes('hr-write')) {
    const ALLOWED_ROLES = ['hr-read', 'finance-read', 'sales-read', 'support-read'];
    return ALLOWED_ROLES.includes(targetRole);
  }

  return false;
}
```

#### 4. **Rate Limiting**

```typescript
// Redis-based rate limiting per admin user
const RATE_LIMITS = {
  'POST /admin/users': { max: 10, window: '1h' },
  'POST /admin/service-accounts': { max: 5, window: '1h' },
  'DELETE *': { max: 20, window: '1h' },
};
```

#### 5. **Audit Logging Requirements**

All admin actions MUST:
1. Log to `admin.user_management_audit` before execution
2. Include IP address, user agent, session ID
3. Capture before/after state for updates
4. Be immutable (no updates/deletes allowed)

#### 6. **Service Account Secret Security**

- Secrets only shown once at creation
- Stored hashed in Keycloak (never plaintext)
- Force rotation every 90 days
- Alert on unused accounts (>30 days)

---

## UI/UX Design

### Admin Portal Routes

```
/admin
  /users                      # Users dashboard
    /new                      # Create user modal
    /:userId                  # User detail page
      /edit                   # Edit user modal
  /rbac                       # RBAC overview dashboard
    /roles                    # Role list
      /:roleName              # Role members page
  /service-accounts           # Service accounts list
    /new                      # Create service account wizard
    /:clientId                # Service account detail
  /audit-log                  # Audit trail viewer
  /settings                   # Admin portal settings
```

### Page Designs

#### Users Dashboard (`/admin/users`)

**Features**:
- Search bar (username, email, name)
- Filter dropdowns (type, enabled, role)
- Sortable columns (username, email, created, last login)
- Bulk actions (disable, export CSV)
- "New User" button (top right)

**Table Columns**:
| Column | Width | Sortable |
|--------|-------|----------|
| Username | 20% | Yes |
| Email | 25% | Yes |
| Name | 20% | No |
| Roles | 20% | No |
| Source | 10% | Yes |
| Status | 5% | Yes |

**Actions**:
- Click row → User detail page
- Kebab menu → Edit, Disable, Reset Password, Delete

#### Create User Modal (`/admin/users/new`)

**Form Fields**:

```
┌────────────────────────────────────────┐
│ Create New User                [X]     │
├────────────────────────────────────────┤
│                                         │
│ Basic Information                       │
│ ┌─────────────────────────────────────┐│
│ │ Username *                          ││
│ │ [__________________________]        ││
│ │                                     ││
│ │ Email *                             ││
│ │ [__________________________]        ││
│ │                                     ││
│ │ First Name *    Last Name *         ││
│ │ [____________]  [____________]      ││
│ └─────────────────────────────────────┘│
│                                         │
│ User Type *                             │
│ ( ) Test User - For QA/E2E testing     │
│ (•) Contractor - Temporary access      │
│ ( ) External User - Partner/vendor     │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ Contract End Date (optional)        ││
│ │ [__/__/____]  📅                   ││
│ └─────────────────────────────────────┘│
│                                         │
│ Password                                │
│ ┌─────────────────────────────────────┐│
│ │ Temporary Password *                ││
│ │ [__________________________] 🔄     ││
│ │ (Generate button)                   ││
│ │                                     ││
│ │ ☑ Require password change on login ││
│ └─────────────────────────────────────┘│
│                                         │
│ Role Assignments                        │
│ ┌─────────────────────────────────────┐│
│ │ ☐ hr-read                           ││
│ │ ☐ hr-write                          ││
│ │ ☑ finance-read                      ││
│ │ ☐ finance-write                     ││
│ │ ☐ sales-read                        ││
│ │ ☐ sales-write                       ││
│ │ ☐ support-read                      ││
│ │ ☐ support-write                     ││
│ │ ☐ executive                         ││
│ └─────────────────────────────────────┘│
│                                         │
│              [Cancel]  [Create User]   │
└────────────────────────────────────────┘
```

**Validation**:
- Real-time validation with error messages
- Password strength indicator
- Duplicate username/email check on blur

#### User Detail Page (`/admin/users/:userId`)

**Sections**:

1. **Header**:
   - User avatar/initials
   - Name, username, email
   - Status badge (Active, Disabled)
   - Action buttons (Edit, Disable, Reset Password, Delete)

2. **Tabs**:
   - **Profile**: Basic info, attributes, created date
   - **Roles**: Assigned roles with "Add Role" button
   - **Sessions**: Active sessions, last login
   - **Audit History**: Recent actions involving this user

#### RBAC Overview Dashboard (`/admin/rbac`)

**Widgets**:

1. **Role Distribution Chart** (Bar chart):
   - X-axis: Role names
   - Y-axis: Member counts
   - Click bar → Navigate to role members page

2. **Role Hierarchy Tree** (Expandable):
   ```
   ├─ executive (composite)
   │  ├─ hr-read
   │  ├─ hr-write
   │  ├─ finance-read
   │  ├─ finance-write
   │  ├─ sales-read
   │  ├─ sales-write
   │  ├─ support-read
   │  └─ support-write
   ├─ admin
   └─ user (default)
   ```

3. **Recent Role Changes** (Timeline):
   - Last 10 role assignments/revocations
   - Click → View audit log entry detail

4. **Orphaned Users Alert** (If >0):
   - Users with no roles assigned
   - Link to filtered users list

#### Service Accounts List (`/admin/service-accounts`)

**Table Columns**:
| Column | Description |
|--------|-------------|
| Client ID | OAuth client identifier |
| Name | Human-readable name |
| Type | system / integration / test |
| Roles | Assigned realm roles |
| Last Used | Most recent token issuance |
| Actions | Rotate Secret, Delete |

**Create Service Account Wizard**:

**Step 1: Basic Info**
```
Service Account Name: [_____________________]
Client ID: [_____________________] (auto-generated)
Description: [_____________________]
Type: ( ) Integration  ( ) Test
```

**Step 2: Role Assignment**
```
Select roles for this service account:
☐ hr-read
☐ finance-read
☑ sales-read
☑ sales-write
```

**Step 3: Review & Create**
```
Summary:
  Name: Salesforce Integration
  Client ID: salesforce-integration
  Roles: sales-read, sales-write

[Back]  [Create Service Account]
```

**Step 4: Credentials Display** (⚠️ IMPORTANT)
```
┌────────────────────────────────────────┐
│ ⚠️ Save These Credentials Immediately  │
├────────────────────────────────────────┤
│ This is the ONLY time you will see    │
│ the client secret. Store it securely.  │
│                                         │
│ Client ID:                              │
│ salesforce-integration                  │
│ [Copy]                                  │
│                                         │
│ Client Secret:                          │
│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   │
│ [Copy]                                  │
│                                         │
│ Token Endpoint:                         │
│ https://vps.tamshai.com/auth/realms/   │
│ tamshai-corp/protocol/openid-connect/  │
│ token                                   │
│ [Copy]                                  │
│                                         │
│ Example cURL:                           │
│ curl -X POST <endpoint> \               │
│   -d grant_type=client_credentials \    │
│   -d client_id=<id> \                   │
│   -d client_secret=<secret>             │
│ [Copy]                                  │
│                                         │
│          [Done - I've Saved These]     │
└────────────────────────────────────────┘
```

#### Audit Log Viewer (`/admin/audit-log`)

**Features**:
- Infinite scroll table
- Filter by action type, admin user, date range
- Export to CSV/JSON
- Full-text search in details JSON

**Table Columns**:
| Column | Width |
|--------|-------|
| Timestamp | 15% |
| Admin User | 20% |
| Action | 15% |
| Target | 20% |
| Details | 30% |

**Detail Modal** (Click row):
```json
{
  "timestamp": "2026-01-09T12:00:00Z",
  "adminUser": "alice.chen (alice@tamshai.com)",
  "action": "assign_role",
  "target": "bob.martinez",
  "role": "finance-read",
  "details": {
    "reason": "Promoted to Finance Manager",
    "requestedBy": "eve.thompson"
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0 Chrome/120.0"
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1) - **START HERE**

**Goal**: Basic admin API infrastructure

**Tasks**:
- [ ] Install `@keycloak/keycloak-admin-client` in MCP Gateway
- [ ] Create `services/mcp-gateway/src/routes/admin.routes.ts`
- [ ] Add `requireRole(['admin', 'executive'])` middleware
- [ ] Set up PostgreSQL `admin` schema and audit table
- [ ] Create audit logging service (`src/services/audit-logger.ts`)
- [ ] Implement basic user CRUD endpoints (GET, POST, PATCH, DELETE)
- [ ] Write unit tests (target: 90%+ coverage)

**Deliverables**:
- Admin API responds to basic user management requests
- All actions logged to audit table
- Postman/curl examples documented

**Testing**:
```bash
# Test user creation
curl -X POST http://localhost:3100/admin/users \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test.contractor",
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "Contractor",
    "userType": "contractor",
    "temporaryPassword": "TempPass123!",
    "roles": ["sales-read"]
  }'
```

---

### Phase 2: Role Management API (Week 2)

**Goal**: Complete admin API with role/service account endpoints

**Tasks**:
- [ ] Implement role management endpoints (GET, POST, DELETE)
- [ ] Implement user role assignment endpoints (POST, DELETE)
- [ ] Implement service account endpoints (GET, POST, DELETE, regenerate-secret)
- [ ] Add privilege escalation checks
- [ ] Create service account metadata table
- [ ] Write integration tests (test against real Keycloak)

**Deliverables**:
- Full admin API complete
- OpenAPI/Swagger documentation generated
- Integration test suite passing

---

### Phase 3: Admin UI Foundation (Week 3)

**Goal**: Basic admin portal UI with user management

**Tasks**:
- [ ] Create new web app: `clients/web/apps/admin`
- [ ] Set up Vite + React + TypeScript + TailwindCSS
- [ ] Configure OAuth client (admin-portal) in Keycloak
- [ ] Implement authentication flow (redirect to Keycloak)
- [ ] Create main layout (sidebar navigation, header)
- [ ] Build Users Dashboard page (table, search, filter)
- [ ] Implement Create User modal
- [ ] Add user detail page

**Deliverables**:
- Admin portal accessible at `https://tamshai.local/admin`
- Users can be created/edited via UI
- Role checks enforce admin-only access

---

### Phase 4: RBAC Viewer (Week 4)

**Goal**: RBAC visibility dashboard

**Tasks**:
- [ ] Implement RBAC overview endpoint
- [ ] Build RBAC dashboard page
- [ ] Create role distribution chart (recharts or Chart.js)
- [ ] Add role hierarchy tree visualization
- [ ] Implement role members page
- [ ] Add recent role changes timeline

**Deliverables**:
- RBAC overview dashboard functional
- Executives can answer "Who has access to X?" in seconds

---

### Phase 5: Service Accounts UI (Week 5)

**Goal**: Self-service service account creation

**Tasks**:
- [ ] Build service accounts list page
- [ ] Implement create service account wizard (4 steps)
- [ ] Add credentials display with copy-to-clipboard
- [ ] Implement secret rotation UI
- [ ] Add service account detail page
- [ ] Create setup guide/documentation

**Deliverables**:
- Service accounts can be created via UI
- No Keycloak Admin Console access required

---

### Phase 6: Audit Log Viewer (Week 6)

**Goal**: Complete audit trail transparency

**Tasks**:
- [ ] Build audit log viewer page
- [ ] Implement filtering (date range, action type, user)
- [ ] Add full-text search
- [ ] Create audit entry detail modal
- [ ] Implement CSV/JSON export
- [ ] Add pagination/infinite scroll

**Deliverables**:
- All admin actions are visible and searchable
- Export functionality for compliance reporting

---

### Phase 7: Polish & Security (Week 7)

**Goal**: Production-ready hardening

**Tasks**:
- [ ] Security audit of admin endpoints (penetration testing)
- [ ] Implement rate limiting (Redis-backed)
- [ ] Add re-authentication requirement for sensitive actions
- [ ] Enforce MFA for admin role assignment
- [ ] Add user confirmation dialogs for destructive actions
- [ ] Create admin user guide documentation
- [ ] Load testing (k6) for admin API
- [ ] Set up monitoring/alerting for admin actions

**Deliverables**:
- Admin portal passes security audit
- Documentation complete
- Production deployment ready

---

## Testing Strategy

### Unit Tests (90%+ Coverage Target)

**File**: `services/mcp-gateway/src/routes/admin.routes.test.ts`

**Test Coverage**:
- ✅ Authentication middleware (401 on missing JWT)
- ✅ Authorization checks (403 on non-admin role)
- ✅ Input validation (400 on invalid data)
- ✅ User CRUD operations
- ✅ Role assignment/revocation
- ✅ Service account creation
- ✅ Audit logging (verify entries created)
- ✅ Privilege escalation prevention

**Mock Strategy**:
- Mock Keycloak Admin Client
- Use in-memory PostgreSQL (for audit log tests)
- Mock Redis (for rate limiting tests)

---

### Integration Tests (Against Real Keycloak)

**File**: `tests/integration/admin-api.test.ts`

**Setup**:
```typescript
beforeAll(async () => {
  // Start test Keycloak container
  await startKeycloakContainer();

  // Create test realm + admin user
  await setupTestRealm();

  // Get admin JWT
  adminToken = await getAdminToken();
});
```

**Test Scenarios**:
1. Create user → Verify in Keycloak
2. Assign role → Check user has role in Keycloak
3. Create service account → Get token with client credentials
4. Delete user → Verify removed from Keycloak
5. Audit log → Query PostgreSQL, verify entries

---

### E2E Tests (Playwright)

**File**: `tests/e2e/admin-portal.spec.ts`

**Test Scenarios**:
1. **Login Flow**: Admin logs in → Redirected to admin portal
2. **Create User**: Fill form → Submit → User appears in table
3. **Assign Role**: Open user detail → Add role → Role appears
4. **Create Service Account**: Wizard → Save credentials → Success
5. **RBAC Dashboard**: Load dashboard → Charts render → Click role → See members
6. **Audit Log**: Perform action → View audit log → Entry present

**Visual Regression Testing**:
- Snapshot testing for dashboard UI
- Ensure consistent styling across pages

---

### Security Testing

**Tools**:
- OWASP ZAP (automated security scan)
- Burp Suite (manual penetration testing)
- npm audit (dependency vulnerabilities)

**Test Cases**:
1. **Privilege Escalation**: Non-admin tries to access /admin/* → 403
2. **IDOR**: Admin A tries to modify user owned by Admin B → Allowed (admins are global)
3. **JWT Tampering**: Modified JWT signature → 401
4. **SQL Injection**: Malicious input in search → Sanitized
5. **XSS**: Script injection in user fields → Escaped
6. **CSRF**: Cross-site request → Blocked by CORS
7. **Rate Limiting**: 100 requests in 1 second → 429 Too Many Requests

---

### Performance Testing (k6)

**File**: `tests/performance/admin-api.k6.js`

**Scenarios**:
```javascript
export let options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 admins
    { duration: '3m', target: 10 },   // Hold at 10 admins
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests < 500ms
    'http_req_failed': ['rate<0.01'],   // < 1% error rate
  },
};
```

**Load Profile**:
- 10 concurrent admin users
- Mix of read-heavy (70%) and write operations (30%)
- Target: 95th percentile response time < 500ms

---

## Deployment & Operations

### Deployment Process

#### Dev Environment

```bash
# MCP Gateway already running, just restart to pick up new code
cd services/mcp-gateway
npm run build
npm run dev

# Admin portal (new app)
cd clients/web/apps/admin
npm run dev  # Runs on http://localhost:4005
```

**Keycloak Client Setup** (dev):
```bash
# Create admin-portal client
cd keycloak/scripts
./docker-sync-realm.sh dev

# Add to sync-realm.sh:
sync_admin_portal_client() {
  local client_json='{
    "clientId": "admin-portal",
    "name": "Tamshai Admin Portal",
    "enabled": true,
    "publicClient": true,
    "standardFlowEnabled": true,
    "redirectUris": ["http://localhost:4005/*"],
    "webOrigins": ["http://localhost:4005"],
    "attributes": {"pkce.code.challenge.method": "S256"}
  }'
  create_or_update_client "admin-portal" "$client_json"
}
```

---

#### Stage/Prod Deployment

**Docker Compose Update** (`docker-compose.yml`):

```yaml
services:
  web-admin:
    build:
      context: ./clients/web
      dockerfile: Dockerfile
      target: admin
    container_name: tamshai-web-admin
    restart: unless-stopped
    ports:
      - "4005:80"
    networks:
      - tamshai-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Caddy Routing** (`infrastructure/caddy/Caddyfile`):

```caddyfile
vps.tamshai.com {
  # Admin portal (requires admin role)
  handle /admin* {
    reverse_proxy web-admin:80
  }

  # Existing routes...
}
```

---

### Monitoring & Alerting

#### Metrics to Track

```typescript
// Prometheus metrics
const adminApiMetrics = {
  http_requests_total: counter,
  http_request_duration_seconds: histogram,
  admin_actions_total: counter({ labels: ['action_type'] }),
  failed_admin_actions_total: counter({ labels: ['error_type'] }),
  active_service_accounts: gauge,
  audit_log_entries_total: counter,
};
```

#### Alerts

```yaml
# Prometheus alerts
groups:
  - name: admin_portal
    rules:
      - alert: HighAdminAPIErrorRate
        expr: rate(failed_admin_actions_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Admin API error rate >5%"

      - alert: SuspiciousAdminActivity
        expr: rate(admin_actions_total{action_type="delete_user"}[5m]) > 10
        for: 1m
        annotations:
          summary: "Unusual number of user deletions"

      - alert: UnusedServiceAccounts
        expr: time() - service_account_last_used_timestamp > 30*24*60*60
        annotations:
          summary: "Service account unused for >30 days"
```

---

### Backup & Recovery

#### Audit Log Backup

```bash
# Daily backup to S3
pg_dump -h localhost -U tamshai -d tamshai_hr \
  -t admin.user_management_audit \
  -t admin.service_account_metadata \
  | gzip > audit-backup-$(date +%Y%m%d).sql.gz

aws s3 cp audit-backup-*.sql.gz s3://tamshai-audit-backups/
```

#### Retention Policy

- **Audit logs**: 7 years (SOC 2 / SOX compliance)
- **Service account metadata**: Indefinite (until deleted)
- **Soft-deleted users**: 90 days, then hard delete

---

### Runbook: Common Operations

#### Add New Admin User

```bash
# Option 1: Via Admin Portal UI
# 1. Login as existing admin
# 2. Go to /admin/users/new
# 3. Create user, assign 'admin' role

# Option 2: Via Keycloak Admin Console (bootstrap)
docker exec -it tamshai-keycloak /opt/keycloak/bin/kcadm.sh \
  create users -r tamshai-corp \
  -s username=new.admin \
  -s email=admin@tamshai.com \
  -s enabled=true

# Assign admin role
docker exec -it tamshai-keycloak /opt/keycloak/bin/kcadm.sh \
  add-roles -r tamshai-corp \
  --uusername new.admin \
  --rolename admin
```

#### Rotate Service Account Secret

```bash
# Via Admin Portal UI
# 1. Go to /admin/service-accounts
# 2. Click service account
# 3. Click "Rotate Secret"
# 4. Copy new secret to secure vault
# 5. Update integration within 72 hours
```

#### Export Audit Log for Compliance

```bash
# Via Admin Portal UI
# 1. Go to /admin/audit-log
# 2. Set date range (e.g., 2025-01-01 to 2025-12-31)
# 3. Click "Export CSV"
# 4. Save file for compliance archive
```

---

## Appendix

### A. Keycloak Admin Client Setup

```typescript
// services/mcp-gateway/src/lib/keycloak-admin.ts
import KcAdminClient from '@keycloak/keycloak-admin-client';

let kcAdminClient: KcAdminClient | null = null;

export async function getKeycloakAdminClient(): Promise<KcAdminClient> {
  if (!kcAdminClient) {
    kcAdminClient = new KcAdminClient({
      baseUrl: process.env.KEYCLOAK_URL || 'http://keycloak:8080/auth',
      realmName: 'master',
    });

    // Authenticate with admin credentials
    await kcAdminClient.auth({
      username: process.env.KEYCLOAK_ADMIN || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD!,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    // Auto-refresh token
    setInterval(async () => {
      await kcAdminClient!.auth({
        username: process.env.KEYCLOAK_ADMIN || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD!,
        grantType: 'password',
        clientId: 'admin-cli',
      });
    }, 58 * 1000); // Refresh every 58 seconds (token expires at 60s)
  }

  // Set realm to tamshai-corp
  kcAdminClient.setConfig({ realmName: 'tamshai-corp' });

  return kcAdminClient;
}
```

---

### B. Example: Create User Endpoint Implementation

```typescript
// services/mcp-gateway/src/routes/admin.routes.ts
router.post('/users', async (req, res) => {
  const { username, email, firstName, lastName, userType, temporaryPassword, roles } = req.body;

  // Validation
  if (!username || !email || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const kcAdmin = await getKeycloakAdminClient();

    // Create user in Keycloak
    const newUser = await kcAdmin.users.create({
      username,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: false,
      attributes: {
        userType: [userType],
        source: ['manual'],
      },
    });

    // Set password
    await kcAdmin.users.resetPassword({
      id: newUser.id,
      credential: {
        temporary: req.body.requirePasswordChange ?? true,
        type: 'password',
        value: temporaryPassword,
      },
    });

    // Assign roles
    if (roles && roles.length > 0) {
      const realmRoles = await kcAdmin.roles.find();
      const rolesToAssign = realmRoles.filter(r => roles.includes(r.name!));
      await kcAdmin.users.addRealmRoleMappings({
        id: newUser.id,
        roles: rolesToAssign.map(r => ({ id: r.id!, name: r.name! })),
      });
    }

    // Audit log
    await auditLogger.log({
      adminUserId: req.user.sub,
      adminUsername: req.user.preferred_username,
      actionType: 'create_user',
      targetUserId: newUser.id,
      targetUsername: username,
      details: { userType, roles },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      userId: newUser.id,
      username,
      email,
      message: 'User created successfully',
    });
  } catch (error) {
    if (error.response?.status === 409) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    throw error;
  }
});
```

---

### C. Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Backend API** | Node.js + Express + TypeScript |
| **Keycloak Integration** | @keycloak/keycloak-admin-client |
| **Database** | PostgreSQL (audit log) |
| **ORM** | node-postgres (pg) |
| **Frontend** | React + TypeScript + Vite |
| **Styling** | TailwindCSS |
| **Charts** | Recharts |
| **HTTP Client** | Axios (with JWT interceptor) |
| **Auth** | Keycloak OAuth 2.0 PKCE |
| **Testing** | Jest (unit), Playwright (E2E), k6 (load) |
| **Monitoring** | Prometheus + Grafana |

---

## Conclusion

This specification provides a complete blueprint for implementing a production-grade admin portal with:

- ✅ **User Management**: Create test users, contractors, external users
- ✅ **Role Management**: Assign/revoke roles, view RBAC hierarchy
- ✅ **Service Accounts**: Self-service OAuth client creation for integrations
- ✅ **Audit Trail**: Immutable log of all admin actions
- ✅ **Security**: MFA, re-auth, privilege escalation prevention, rate limiting
- ✅ **UI/UX**: Intuitive admin interface requiring no Keycloak expertise

**Next Steps**:
1. ✅ Review and approve spec (DONE)
2. 🚀 Begin Phase 1 implementation
3. 📊 Weekly progress reviews
4. 🎯 Target completion: 7 weeks

---

**Document Version**: 1.0
**Last Updated**: 2026-01-09
**Status**: Approved - Ready for Phase 1 Implementation
