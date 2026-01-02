# Keycloak Atomic Migration - Development Plan (TDD)

**Issue**: #62
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Created**: 2026-01-01
**Status**: Ready for Implementation
**Prerequisite**: Issue #61 (Incremental Deployment Workflows) - CLOSED

---

## Overview

This document defines the TDD-based implementation plan for migrating from Federated (pull) to Atomic (push) identity architecture. The HR Service will push user changes to Keycloak via Admin API, ensuring atomic transactions for provisioning and revocation.

### Architecture Change

**Current (Federated)**:
```
Keycloak ←── LDAP/Sync ── HR Database
    │
    └── User Login
```

**Target (Atomic)**:
```
HR Database
    ↑
    │ CRUD Operations
    │
MCP HR Service ──── Admin API ────► Keycloak
                                        │
                                        └── User Login
```

---

## Phase 1: Infrastructure Changes (2 hours)

### 1.1 Add Service Account Client to Terraform

**File**: `infrastructure/terraform/keycloak/main.tf`

Add after the existing `mcp_gateway` client:

```hcl
# ============================================================
# MCP HR Service Account (Identity Provisioning)
# ============================================================
# This client enables MCP HR to manage users via Keycloak Admin API.
# Used for atomic user provisioning during employee onboarding/offboarding.

resource "keycloak_openid_client" "mcp_hr_service_account" {
  realm_id  = keycloak_realm.tamshai_corp.id
  client_id = "mcp-hr-service-account"
  name      = "MCP HR Service Account (Identity Provisioning)"

  enabled                      = true
  access_type                  = "CONFIDENTIAL"
  service_accounts_enabled     = true
  standard_flow_enabled        = false
  direct_access_grants_enabled = false

  valid_redirect_uris = []
}

# Grant manage-users role to service account
resource "keycloak_openid_client_service_account_realm_role" "hr_manage_users" {
  realm_id                = keycloak_realm.tamshai_corp.id
  service_account_user_id = keycloak_openid_client.mcp_hr_service_account.service_account_user_id
  role                    = "manage-users"
}

# Grant manage-realm role for session management
resource "keycloak_openid_client_service_account_realm_role" "hr_manage_realm" {
  realm_id                = keycloak_realm.tamshai_corp.id
  service_account_user_id = keycloak_openid_client.mcp_hr_service_account.service_account_user_id
  role                    = "manage-realm"
}

output "mcp_hr_service_account_secret" {
  description = "Client secret for MCP HR service account"
  value       = keycloak_openid_client.mcp_hr_service_account.client_secret
  sensitive   = true
}
```

### 1.2 Add Environment Variable

**File**: `infrastructure/terraform/keycloak/variables.tf`

```hcl
variable "atomic_mode" {
  description = "Enable atomic identity architecture (HR pushes to Keycloak)"
  type        = bool
  default     = false
}
```

**File**: `infrastructure/terraform/keycloak/environments/dev.tfvars`
```hcl
atomic_mode = true
```

**File**: `infrastructure/terraform/keycloak/environments/ci.tfvars`
```hcl
atomic_mode = true
```

**File**: `infrastructure/terraform/keycloak/environments/stage.tfvars`
```hcl
atomic_mode = true
```

### 1.3 Verification

```bash
cd infrastructure/terraform/keycloak
terraform plan -var-file=environments/dev.tfvars
# Should show: 3 to add (service account client + 2 role assignments)
```

---

## Phase 2: Database Schema (1 hour)

### 2.1 Create Audit Access Logs Table

**File**: `services/mcp-hr/migrations/003_audit_access_logs.sql`

```sql
-- Audit table for identity provisioning events (S-OX compliance)
CREATE TABLE IF NOT EXISTS hr.audit_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES hr.employees(id),
  action VARCHAR(50) NOT NULL CHECK (action IN ('USER_CREATED', 'USER_TERMINATED', 'USER_DELETED', 'ROLE_CHANGED')),
  keycloak_user_id VARCHAR(255),
  permissions_snapshot JSONB,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Index for compliance queries
CREATE INDEX idx_audit_access_logs_employee ON hr.audit_access_logs(employee_id);
CREATE INDEX idx_audit_access_logs_action ON hr.audit_access_logs(action);
CREATE INDEX idx_audit_access_logs_created_at ON hr.audit_access_logs(created_at);

-- Add termination columns to employees table
ALTER TABLE hr.employees
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'deleted')),
ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS keycloak_user_id VARCHAR(255);

-- Comment for compliance documentation
COMMENT ON TABLE hr.audit_access_logs IS 'S-OX compliant audit trail for identity provisioning. Retain 7 years.';
```

---

## Phase 3: IdentityService Implementation (8 hours)

### 3.1 Install Dependencies

```bash
cd services/mcp-hr
npm install @keycloak/keycloak-admin-client bullmq
npm install -D @types/bullmq
```

### 3.2 Create IdentityService

**File**: `services/mcp-hr/src/services/identity.ts`

```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';
import { Pool, PoolClient } from 'pg';
import { Queue } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface EmployeeData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
}

export interface TerminationResult {
  success: boolean;
  keycloakUserId: string;
  sessionsRevoked: number;
  scheduledDeletionAt: Date;
}

export class IdentityService {
  private kcAdmin: KcAdminClient;
  private db: Pool;
  private cleanupQueue: Queue;
  private isAuthenticated = false;

  constructor(db: Pool) {
    this.db = db;

    this.kcAdmin = new KcAdminClient({
      baseUrl: config.keycloak.url,
      realmName: config.keycloak.realm,
    });

    this.cleanupQueue = new Queue('identity-cleanup', {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });
  }

  /**
   * Authenticate with Keycloak using service account credentials.
   * Must be called before any user management operations.
   */
  async authenticate(): Promise<void> {
    if (this.isAuthenticated) return;

    await this.kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: config.keycloak.hrServiceAccountClientId,
      clientSecret: config.keycloak.hrServiceAccountClientSecret,
    });

    this.isAuthenticated = true;
    logger.info('IdentityService authenticated with Keycloak');
  }

  /**
   * Create user in Keycloak during employee onboarding.
   * MUST be called within a database transaction for atomicity.
   *
   * @throws Error if Keycloak creation fails (caller should rollback transaction)
   */
  async createUserInKeycloak(
    employeeData: EmployeeData,
    client: PoolClient
  ): Promise<string> {
    await this.authenticate();

    try {
      // 1. Create Keycloak user
      const { id: keycloakUserId } = await this.kcAdmin.users.create({
        realm: config.keycloak.realm,
        username: employeeData.email,
        email: employeeData.email,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        enabled: true,
        emailVerified: false,
        requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
        attributes: {
          employeeId: [employeeData.id],
          department: [employeeData.department],
        },
      });

      // 2. Assign department role
      const departmentRole = await this.getDepartmentRole(employeeData.department);
      if (departmentRole) {
        await this.kcAdmin.users.addClientRoleMappings({
          id: keycloakUserId,
          clientUniqueId: config.keycloak.mcpGatewayClientId,
          roles: [{ id: departmentRole.id!, name: departmentRole.name! }],
        });
      }

      // 3. Update employee record with Keycloak user ID
      await client.query(
        `UPDATE hr.employees SET keycloak_user_id = $1 WHERE id = $2`,
        [keycloakUserId, employeeData.id]
      );

      // 4. Log provisioning event
      await client.query(
        `INSERT INTO hr.audit_access_logs
         (employee_id, action, keycloak_user_id, details, created_by)
         VALUES ($1, 'USER_CREATED', $2, $3, $4)`,
        [
          employeeData.id,
          keycloakUserId,
          JSON.stringify({ department: employeeData.department }),
          'system',
        ]
      );

      logger.info('User created in Keycloak', {
        employeeId: employeeData.id,
        keycloakUserId,
        email: employeeData.email,
      });

      return keycloakUserId;

    } catch (error) {
      logger.error('Failed to create user in Keycloak', {
        employeeId: employeeData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to provision Keycloak user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Terminate user access (offboarding).
   * Immediate disable + session revocation, delayed deletion (72 hours).
   */
  async terminateUser(employeeId: string): Promise<TerminationResult> {
    await this.authenticate();

    // 1. Get employee record
    const employeeResult = await this.db.query(
      `SELECT keycloak_user_id, email FROM hr.employees WHERE id = $1`,
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const { keycloak_user_id: keycloakUserId, email } = employeeResult.rows[0];

    if (!keycloakUserId) {
      throw new Error(`Employee ${employeeId} has no Keycloak user`);
    }

    // 2. Fetch current roles for audit snapshot
    const roleMappings = await this.kcAdmin.users.listClientRoleMappings({
      id: keycloakUserId,
      clientUniqueId: config.keycloak.mcpGatewayClientId,
    });

    const permissionsSnapshot = {
      roles: roleMappings.map(r => r.name),
      timestamp: new Date().toISOString(),
    };

    // 3. Write permissions snapshot to audit log
    await this.db.query(
      `INSERT INTO hr.audit_access_logs
       (employee_id, action, keycloak_user_id, permissions_snapshot, created_by)
       VALUES ($1, 'USER_TERMINATED', $2, $3, $4)`,
      [employeeId, keycloakUserId, JSON.stringify(permissionsSnapshot), 'system']
    );

    // 4. Disable user (immediate effect)
    await this.kcAdmin.users.update(
      { id: keycloakUserId },
      { enabled: false }
    );

    // 5. Revoke all active sessions
    const sessions = await this.kcAdmin.users.listSessions({ id: keycloakUserId });
    await this.kcAdmin.users.logout({ id: keycloakUserId });

    // 6. Update employee record
    await this.db.query(
      `UPDATE hr.employees
       SET status = 'terminated', terminated_at = NOW()
       WHERE id = $1`,
      [employeeId]
    );

    // 7. Schedule deletion job (72-hour delay)
    const scheduledDeletionAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await this.cleanupQueue.add(
      'delete_user_final',
      { keycloakUserId, employeeId },
      { delay: 72 * 60 * 60 * 1000 }
    );

    logger.info('User terminated', {
      employeeId,
      keycloakUserId,
      sessionsRevoked: sessions.length,
      scheduledDeletionAt,
    });

    return {
      success: true,
      keycloakUserId,
      sessionsRevoked: sessions.length,
      scheduledDeletionAt,
    };
  }

  /**
   * Permanently delete user from Keycloak (called by cleanup worker after 72 hours).
   */
  async deleteUserPermanently(keycloakUserId: string, employeeId: string): Promise<void> {
    await this.authenticate();

    // Safety check: verify user is disabled
    const kcUser = await this.kcAdmin.users.findOne({ id: keycloakUserId });

    if (!kcUser) {
      logger.warn('User already deleted', { keycloakUserId, employeeId });
      return;
    }

    if (kcUser.enabled) {
      throw new Error(`Cannot delete enabled user ${keycloakUserId}. Safety check failed.`);
    }

    // Delete from Keycloak
    await this.kcAdmin.users.del({ id: keycloakUserId });

    // Update employee record
    await this.db.query(
      `UPDATE hr.employees SET status = 'deleted' WHERE id = $1`,
      [employeeId]
    );

    // Log deletion
    await this.db.query(
      `INSERT INTO hr.audit_access_logs
       (employee_id, action, keycloak_user_id, details, created_by)
       VALUES ($1, 'USER_DELETED', $2, $3, $4)`,
      [
        employeeId,
        keycloakUserId,
        JSON.stringify({ deletedAt: new Date().toISOString() }),
        'system',
      ]
    );

    logger.info('User permanently deleted', { keycloakUserId, employeeId });
  }

  /**
   * Get department role by name.
   */
  private async getDepartmentRole(department: string) {
    const roleName = `${department.toLowerCase()}-read`;

    try {
      const roles = await this.kcAdmin.clients.listRoles({
        id: config.keycloak.mcpGatewayClientId,
      });
      return roles.find(r => r.name === roleName);
    } catch (error) {
      logger.warn('Department role not found', { department, roleName });
      return null;
    }
  }
}
```

### 3.3 Create Cleanup Worker

**File**: `services/mcp-hr/src/workers/identity-cleanup.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { IdentityService } from '../services/identity';
import { config } from '../config';
import { logger } from '../utils/logger';

interface DeleteUserJob {
  keycloakUserId: string;
  employeeId: string;
}

export function startIdentityCleanupWorker(db: Pool): Worker {
  const identityService = new IdentityService(db);

  const worker = new Worker<DeleteUserJob>(
    'identity-cleanup',
    async (job: Job<DeleteUserJob>) => {
      const { keycloakUserId, employeeId } = job.data;

      logger.info('Processing scheduled user deletion', {
        keycloakUserId,
        employeeId,
        scheduledAt: job.timestamp,
      });

      await identityService.deleteUserPermanently(keycloakUserId, employeeId);

      return { success: true };
    },
    {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info('User deletion completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('User deletion failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}
```

---

## Phase 4: Route Integration (2 hours)

### 4.1 Update Employee Routes

**File**: `services/mcp-hr/src/routes/employees.ts`

Add to existing routes:

```typescript
import { IdentityService } from '../services/identity';

const identityService = new IdentityService(db);

// POST /api/hr/employees - Create employee with Keycloak provisioning
router.post('/', async (req, res) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Create employee record
    const result = await client.query(
      `INSERT INTO hr.employees (name, email, department, role, manager_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.body.name, req.body.email, req.body.department, req.body.role, req.body.managerId]
    );

    const employee = result.rows[0];

    // 2. Provision Keycloak user (inside transaction)
    const [firstName, ...lastNameParts] = employee.name.split(' ');
    await identityService.createUserInKeycloak(
      {
        id: employee.id,
        email: employee.email,
        firstName,
        lastName: lastNameParts.join(' ') || firstName,
        department: employee.department,
      },
      client
    );

    // 3. Commit transaction (both HR record + Keycloak user created atomically)
    await client.query('COMMIT');

    res.status(201).json({
      status: 'success',
      data: employee,
      metadata: { keycloakProvisioned: true },
    });

  } catch (error) {
    await client.query('ROLLBACK');

    res.status(500).json({
      status: 'error',
      code: 'PROVISIONING_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
      suggestedAction: 'Retry the operation. If Keycloak is unavailable, wait and try again.',
    });

  } finally {
    client.release();
  }
});

// POST /api/hr/employees/:id/terminate - Terminate employee (Kill Switch)
router.post('/:id/terminate', async (req, res) => {
  try {
    const result = await identityService.terminateUser(req.params.id);

    res.json({
      status: 'success',
      data: {
        message: 'User terminated successfully',
        sessionsRevoked: result.sessionsRevoked,
        scheduledDeletionAt: result.scheduledDeletionAt,
      },
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      code: 'TERMINATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error',
      suggestedAction: 'Check Keycloak connectivity and retry.',
    });
  }
});
```

---

## Phase 5: Configuration Updates (1 hour)

### 5.1 Add Config Variables

**File**: `services/mcp-hr/src/config.ts`

```typescript
export const config = {
  // ... existing config
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8180',
    realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
    hrServiceAccountClientId: process.env.KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_ID || 'mcp-hr-service-account',
    hrServiceAccountClientSecret: process.env.KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_SECRET || '',
    mcpGatewayClientId: process.env.KEYCLOAK_MCP_GATEWAY_CLIENT_ID || 'mcp-gateway',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
};
```

### 5.2 Update Docker Compose

**File**: `docker-compose.vps.yml` (add to mcp-hr service):

```yaml
mcp-hr:
  environment:
    - KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_ID=mcp-hr-service-account
    - KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_SECRET=${KEYCLOAK_HR_SERVICE_ACCOUNT_SECRET}
```

---

## Implementation Checklist

### Phase 1: Infrastructure (2 hours)
- [ ] Add service account client to `main.tf`
- [ ] Add `atomic_mode` variable
- [ ] Update environment tfvars files
- [ ] Run `terraform plan` to verify
- [ ] Run `terraform apply` in dev environment

### Phase 2: Database (1 hour)
- [ ] Create migration file `003_audit_access_logs.sql`
- [ ] Run migration in dev environment
- [ ] Verify table and columns created

### Phase 3: IdentityService (8 hours)
- [ ] Install dependencies (`@keycloak/keycloak-admin-client`, `bullmq`)
- [ ] Create `src/services/identity.ts`
- [ ] Create `src/workers/identity-cleanup.ts`
- [ ] Write unit tests (see Keycloak-Atomic-QA.md)
- [ ] Verify tests FAIL (red phase)

### Phase 4: Route Integration (2 hours)
- [ ] Update POST `/api/hr/employees` route
- [ ] Add POST `/api/hr/employees/:id/terminate` route
- [ ] Integrate cleanup worker startup

### Phase 5: Configuration (1 hour)
- [ ] Update `src/config.ts`
- [ ] Update Docker Compose environment variables
- [ ] Update GitHub Secrets for staging/production

### Phase 6: Testing & Deployment (2 hours)
- [ ] Run integration tests (see Keycloak-Atomic-QA.md)
- [ ] Deploy to staging via incremental workflow
- [ ] Monitor for 24 hours
- [ ] Deploy to production

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate Rollback** (mcp-hr only):
   ```bash
   gh workflow run deploy-mcp-hr.yml --field rollback=true
   ```

2. **Terraform Rollback** (remove service account):
   ```bash
   cd infrastructure/terraform/keycloak
   git checkout HEAD~1 -- main.tf
   terraform apply -auto-approve
   ```

3. **Database Rollback**:
   ```sql
   -- audit_access_logs can remain (no data loss)
   -- Remove new columns if needed:
   ALTER TABLE hr.employees DROP COLUMN IF EXISTS keycloak_user_id;
   ALTER TABLE hr.employees DROP COLUMN IF EXISTS status;
   ALTER TABLE hr.employees DROP COLUMN IF EXISTS terminated_at;
   ```

---

## Estimated Total Time: 16 hours

| Phase | Hours |
|-------|-------|
| Infrastructure | 2 |
| Database | 1 |
| IdentityService | 8 |
| Route Integration | 2 |
| Configuration | 1 |
| Testing & Deployment | 2 |
| **Total** | **16** |

---

**Next**: See `Keycloak-Atomic-QA.md` for test strategy and integration test specifications.
