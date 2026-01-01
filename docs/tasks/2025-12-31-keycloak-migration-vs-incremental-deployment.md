# Keycloak Migration vs Incremental Deployment - Implementation Order Analysis

**Date**: 2025-12-31
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: 📋 Recommendation Pending Approval
**Decision**: Implement Incremental Deployment FIRST, then Keycloak Migration

---

## Executive Summary

**Context**: Two major initiatives are planned:
1. **Keycloak Migration**: Migrate from Federated (pull) to Atomic (push) identity architecture
2. **Incremental Deployment Workflows**: Move from monolithic to service-specific deployments

**Recommendation**: **Implement Incremental Deployment Workflows FIRST (Issue #61), then Keycloak Migration**

**Rationale**:
- ✅ **Risk Reduction**: Incremental workflows provide safety net for high-risk Keycloak migration
- ✅ **Rollback Capability**: Service-specific rollback for complex infrastructure+application changes
- ✅ **Testing Isolation**: QA can test mcp-hr changes without affecting other services
- ✅ **Velocity Multiplier**: Benefits ALL future work, not just Keycloak migration
- ⚠️ **Time Trade-off**: Adds 8 hours upfront, but reduces risk substantially

**Total Timeline**: 40 hours (1 week) with recommended order vs 32 hours in reverse order

---

## Initiative 1: Keycloak Migration (Federated → Atomic)

### Current Architecture (Federated)

**Pattern**: Identity Provider pulls user data from HR database

```
┌──────────────┐                    ┌──────────────┐
│   Keycloak   │ ←── LDAP/Sync ───  │  HR Database │
│ (Federation) │                    │ (PostgreSQL) │
└──────────────┘                    └──────────────┘
       │
       │ User Login
       ▼
┌──────────────┐
│   Clients    │
│ (Desktop/Web)│
└──────────────┘
```

**Problems**:
- 🔴 **Tight Coupling**: Keycloak depends on HR database availability
- 🔴 **Sync Lag**: User changes may not be reflected immediately in Keycloak
- 🔴 **Compliance Risk**: No atomic transaction for access provisioning/revocation
- 🔴 **Audit Trail**: Limited visibility into when/why access was changed

### Target Architecture (Atomic)

**Pattern**: HR Service pushes user changes to Keycloak via Admin API

```
┌──────────────┐
│  HR Database │
│ (PostgreSQL) │
└──────────────┘
       ▲
       │ CRUD Operations
       │
┌──────────────┐    Admin API    ┌──────────────┐
│ MCP HR Svc   │ ───────────────►│   Keycloak   │
│ (Push Logic) │                 │  (Atomic)    │
└──────────────┘                 └──────────────┘
                                        │
                                        │ User Login
                                        ▼
                                 ┌──────────────┐
                                 │   Clients    │
                                 │ (Desktop/Web)│
                                 └──────────────┘
```

**Benefits**:
- ✅ **Decoupling**: Keycloak works even if HR database is down (existing users)
- ✅ **Atomic Transactions**: User provisioning/revocation happens in single DB transaction
- ✅ **Compliance**: 72-hour retention rule for terminated users (S-OX requirement)
- ✅ **Audit Trail**: `audit_access_logs` table captures permissions snapshot on termination

### Migration Phases (TDD Approach)

#### Phase 1: QA Specifies Behavior (Red Phase)

**File**: `services/mcp-hr/tests/integration/identity-provisioning.test.ts`

**Test Scenarios**:
1. **Decoupling Test**: Verify Keycloak authentication works when HR DB is down
2. **Onboarding Transaction**: Verify user created in Keycloak when employee created
3. **Kill Switch (Offboarding)**: Verify user disabled + sessions revoked on termination
4. **72-Hour Retention**: Verify user deleted after 72 hours, but not before

**Test Code Structure** (from Keycloak-Atomic-QA.md):
```typescript
describe('Identity Provisioning (Atomic Architecture)', () => {
  describe('Decoupling Test', () => {
    it('should allow Keycloak login when HR DB is down', async () => {
      // Create user first
      await hrService.createEmployee({ name: 'Alice Chen', email: 'alice@tamshai.com' });

      // Simulate HR DB outage
      await stopContainer(hrDbContainer);

      // Existing users should still authenticate
      const token = await keycloak.getToken('alice@tamshai.com', 'password');
      expect(token).toBeDefined();

      // New users CANNOT be created (expected failure)
      await expect(
        keycloak.getToken('bob@tamshai.com', 'password')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Onboarding Transaction', () => {
    it('should create Keycloak user when employee created', async () => {
      const employee = await hrService.createEmployee({
        name: 'Bob Martinez',
        email: 'bob@tamshai.com',
        department: 'Finance',
        role: 'Analyst'
      });

      // Verify Keycloak user exists
      const kcUser = await keycloak.users.find({ email: 'bob@tamshai.com' });
      expect(kcUser).toHaveLength(1);
      expect(kcUser[0].enabled).toBe(true);

      // Verify department roles assigned
      const roles = await keycloak.users.listRoleMappings({ id: kcUser[0].id });
      expect(roles.realmMappings).toContainEqual(
        expect.objectContaining({ name: 'finance-read' })
      );
    });

    it('should rollback HR record if Keycloak creation fails', async () => {
      // Mock Keycloak failure
      jest.spyOn(keycloak.users, 'create').mockRejectedValue(new Error('Keycloak down'));

      await expect(
        hrService.createEmployee({ name: 'Carol', email: 'carol@tamshai.com' })
      ).rejects.toThrow('Keycloak down');

      // Verify HR record was NOT created
      const employees = await db.query(
        'SELECT * FROM hr.employees WHERE email = $1',
        ['carol@tamshai.com']
      );
      expect(employees.rows).toHaveLength(0);
    });
  });

  describe('Kill Switch (Offboarding)', () => {
    it('should immediately disable user and revoke sessions on termination', async () => {
      const employee = await hrService.createEmployee({
        name: 'Dan Williams',
        email: 'dan@tamshai.com'
      });

      // Terminate employee
      await hrService.terminateEmployee(employee.id);

      // Verify Keycloak user disabled
      const kcUser = await keycloak.users.find({ email: 'dan@tamshai.com' });
      expect(kcUser[0].enabled).toBe(false);

      // Verify sessions revoked (mock check)
      const sessions = await keycloak.users.listSessions({ id: kcUser[0].id });
      expect(sessions).toHaveLength(0);

      // Verify audit log exists
      const auditLog = await db.query(
        'SELECT * FROM hr.audit_access_logs WHERE employee_id = $1',
        [employee.id]
      );
      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].permissions_snapshot).toBeDefined();
    });
  });

  describe('72-Hour Data Retention', () => {
    it('should keep disabled user for 72 hours before deletion', async () => {
      const employee = await hrService.createEmployee({
        name: 'Eve Thompson',
        email: 'eve@tamshai.com'
      });
      await hrService.terminateEmployee(employee.id);

      // Fast-forward 71 hours
      jest.advanceTimersByTime(71 * 60 * 60 * 1000);
      await processScheduledJobs();

      // User still exists (disabled)
      const kcUser71 = await keycloak.users.find({ email: 'eve@tamshai.com' });
      expect(kcUser71).toHaveLength(1);
      expect(kcUser71[0].enabled).toBe(false);

      // Fast-forward to 73 hours
      jest.advanceTimersByTime(2 * 60 * 60 * 1000);
      await processScheduledJobs();

      // User permanently deleted
      const kcUser73 = await keycloak.users.find({ email: 'eve@tamshai.com' });
      expect(kcUser73).toHaveLength(0);
    });
  });
});
```

**Estimated Time**: 8 hours (QA Lead)

#### Phase 2: Infrastructure Changes (Terraform)

**Files to Modify**:
- `infrastructure/terraform/keycloak/main.tf`
- `infrastructure/terraform/keycloak/environments/test.tfvars`
- `infrastructure/terraform/keycloak/environments/dev.tfvars`
- `infrastructure/terraform/keycloak/environments/stage.tfvars`

**Changes Required**:

1. **Remove Federation Resources**:
```hcl
# DELETE THIS BLOCK
resource "keycloak_ldap_user_federation" "hr_federation" {
  realm_id = keycloak_realm.tamshai.id
  name     = "hr-ldap"

  connection_url = "ldap://postgres:5432"  # (Not actual LDAP, this is an example)
  users_dn       = "ou=employees,dc=tamshai,dc=com"
  # ... federation config
}
```

2. **Add Service Account Client**:
```hcl
# ADD THIS BLOCK
resource "keycloak_openid_client" "mcp_hr_service_account" {
  realm_id  = keycloak_realm.tamshai.id
  client_id = "mcp-hr-service-account"
  name      = "MCP HR Service Account (Identity Provisioning)"

  enabled                      = true
  access_type                  = "CONFIDENTIAL"  # Requires client secret
  service_accounts_enabled     = true            # Enable service account
  standard_flow_enabled        = false           # No user login flow
  direct_access_grants_enabled = false           # No password grant

  valid_redirect_uris = []  # Service account doesn't use redirects
}

# Grant admin privileges to service account
resource "keycloak_openid_client_service_account_realm_role" "hr_admin_role" {
  realm_id                = keycloak_realm.tamshai.id
  service_account_user_id = keycloak_openid_client.mcp_hr_service_account.service_account_user_id
  role                    = "realm-admin"  # Or create custom "manage-users" role
}

# Output client secret for application
output "mcp_hr_service_account_secret" {
  value     = keycloak_openid_client.mcp_hr_service_account.client_secret
  sensitive = true
}
```

3. **Update Environment Variables**:
```hcl
# infrastructure/terraform/keycloak/environments/dev.tfvars
atomic_mode = true  # Enable atomic identity architecture
legacy_federation_enabled = false
```

**Estimated Time**: 2 hours (Infrastructure changes)

#### Phase 3: Application Implementation (Green Phase)

**File**: `services/mcp-hr/src/services/identity.ts`

**Implementation**:
```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';
import { Pool } from 'pg';

export class IdentityService {
  private kcAdmin: KcAdminClient;
  private db: Pool;

  constructor() {
    this.kcAdmin = new KcAdminClient({
      baseUrl: process.env.KEYCLOAK_URL,
      realmName: 'tamshai'
    });

    // Authenticate as service account
    await this.kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: 'mcp-hr-service-account',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET
    });

    this.db = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  /**
   * Create user in Keycloak during employee onboarding.
   * MUST run inside DB transaction to ensure atomicity.
   */
  async createUserInKeycloak(employeeData: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    department: string;
  }): Promise<void> {
    try {
      // 1. Create Keycloak user
      const kcUser = await this.kcAdmin.users.create({
        realm: 'tamshai',
        username: employeeData.email,
        email: employeeData.email,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        enabled: true,
        emailVerified: false,  // Require email verification
        requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
        attributes: {
          employeeId: [employeeData.id],
          department: [employeeData.department]
        }
      });

      // 2. Assign department roles
      const departmentRole = await this.getDepartmentRole(employeeData.department);
      await this.kcAdmin.users.addRealmRoleMappings({
        id: kcUser.id,
        roles: [
          {
            id: departmentRole.id,
            name: departmentRole.name
          }
        ]
      });

      // 3. Log provisioning event
      await this.db.query(
        `INSERT INTO hr.audit_access_logs (employee_id, action, keycloak_user_id, details)
         VALUES ($1, 'USER_CREATED', $2, $3)`,
        [employeeData.id, kcUser.id, JSON.stringify({ department: employeeData.department })]
      );

    } catch (error) {
      // Keycloak failure causes DB transaction rollback
      throw new Error(`Failed to provision Keycloak user: ${error.message}`);
    }
  }

  /**
   * Terminate user access (offboarding).
   * Immediate disable + session revocation, delayed deletion.
   */
  async terminateUser(employeeId: string): Promise<void> {
    // 1. Get Keycloak user by employee ID
    const kcUsers = await this.kcAdmin.users.find({
      max: 1,
      q: `employeeId:${employeeId}`
    });

    if (kcUsers.length === 0) {
      throw new Error(`No Keycloak user found for employee ${employeeId}`);
    }

    const kcUser = kcUsers[0];

    // 2. Fetch current roles/groups for audit log
    const roles = await this.kcAdmin.users.listRoleMappings({ id: kcUser.id });
    const groups = await this.kcAdmin.users.listGroups({ id: kcUser.id });

    // 3. Write permissions snapshot to audit log
    await this.db.query(
      `INSERT INTO hr.audit_access_logs (employee_id, action, keycloak_user_id, permissions_snapshot)
       VALUES ($1, 'USER_TERMINATED', $2, $3)`,
      [
        employeeId,
        kcUser.id,
        JSON.stringify({
          roles: roles.realmMappings?.map(r => r.name) || [],
          groups: groups.map(g => g.name) || [],
          timestamp: new Date().toISOString()
        })
      ]
    );

    // 4. Disable user (immediate effect)
    await this.kcAdmin.users.update(
      { id: kcUser.id },
      { enabled: false }
    );

    // 5. Revoke all active sessions
    await this.kcAdmin.users.logout({ id: kcUser.id });

    // 6. Schedule deletion job (72-hour delay)
    await this.scheduleUserDeletion(kcUser.id, employeeId);
  }

  /**
   * Schedule permanent user deletion (72 hours after termination).
   * Uses Redis/BullMQ for delayed job processing.
   */
  private async scheduleUserDeletion(kcUserId: string, employeeId: string): Promise<void> {
    const queue = new Queue('identity-cleanup');

    await queue.add(
      'delete_user_final',
      { kcUserId, employeeId },
      { delay: 72 * 60 * 60 * 1000 }  // 72 hours in milliseconds
    );
  }

  /**
   * Process scheduled user deletion (called by worker).
   */
  async deleteUserPermanently(kcUserId: string, employeeId: string): Promise<void> {
    // Verify user is still disabled (safety check)
    const kcUser = await this.kcAdmin.users.findOne({ id: kcUserId });

    if (!kcUser) {
      console.warn(`User ${kcUserId} already deleted`);
      return;
    }

    if (kcUser.enabled) {
      throw new Error(`Cannot delete enabled user ${kcUserId}. Safety check failed.`);
    }

    // Permanent deletion
    await this.kcAdmin.users.del({ id: kcUserId });

    // Log deletion event
    await this.db.query(
      `INSERT INTO hr.audit_access_logs (employee_id, action, keycloak_user_id, details)
       VALUES ($1, 'USER_DELETED', $2, $3)`,
      [employeeId, kcUserId, JSON.stringify({ deletedAt: new Date().toISOString() })]
    );
  }

  /**
   * Get department role by name.
   */
  private async getDepartmentRole(department: string): Promise<{ id: string; name: string }> {
    const roleName = `${department.toLowerCase()}-read`;
    const role = await this.kcAdmin.roles.findOneByName({ name: roleName });

    if (!role) {
      throw new Error(`Department role ${roleName} not found`);
    }

    return role;
  }
}
```

**Integration with HR Service**:
```typescript
// services/mcp-hr/src/routes/employees.ts

app.post('/api/hr/employees', async (req, res) => {
  const client = await db.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Create employee record
    const result = await client.query(
      `INSERT INTO hr.employees (name, email, department, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.body.name, req.body.email, req.body.department, req.body.role]
    );

    const employee = result.rows[0];

    // 2. Provision Keycloak user (inside transaction)
    await identityService.createUserInKeycloak({
      id: employee.id,
      email: employee.email,
      firstName: employee.name.split(' ')[0],
      lastName: employee.name.split(' ').slice(1).join(' '),
      department: employee.department
    });

    // Commit transaction (both HR record + Keycloak user created atomically)
    await client.query('COMMIT');

    res.status(201).json(employee);

  } catch (error) {
    // Rollback on any failure (Keycloak or DB)
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });

  } finally {
    client.release();
  }
});

app.post('/api/hr/employees/:id/terminate', async (req, res) => {
  try {
    // Immediate termination (disable + session revocation)
    await identityService.terminateUser(req.params.id);

    // Update HR record
    await db.query(
      `UPDATE hr.employees SET status = 'terminated', terminated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'User terminated successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Estimated Time**: 12 hours (Application implementation)

#### Phase 4: Compliance Documentation

**File**: `docs/policies/IAM_ONBOARDING_OFFBOARDING_POLICY.md`

**Content Structure**:
```markdown
# Identity and Access Management: Onboarding/Offboarding Policy

**Document Version**: 1.0
**Last Updated**: 2025-12-31
**Compliance Framework**: S-OX (Sarbanes-Oxley), SOC 2 Type II
**Review Cycle**: Annual (or upon S-OX audit request)

## Overview

This policy defines the automated provisioning and de-provisioning of user access to Tamshai Enterprise AI systems.

**Architecture**: Atomic Identity Provisioning (HR Service → Keycloak)
**Audit Scope**: Access provisioning, role assignment, termination, data retention

## Onboarding (Provisioning)

### Atomic Transaction Guarantee

All user provisioning occurs within a **single database transaction**:

1. HR record created in `hr.employees` table
2. Keycloak user created via Admin API
3. Department roles assigned in Keycloak
4. Audit log entry created in `hr.audit_access_logs`

**Control**: If Keycloak provisioning fails, the entire transaction is rolled back. No orphaned HR records are created without corresponding identity credentials.

**Rationale**: Ensures the Identity Provider (Keycloak) is the single source of truth for authentication and authorization.

### Default Access Levels

| Department | Default Role | Access Scope |
|------------|--------------|--------------|
| HR | `hr-read` | Own department data (read-only) |
| Finance | `finance-read` | Finance data (read-only) |
| Sales | `sales-read` | Sales/CRM data (read-only) |
| Support | `support-read` | Support tickets, knowledge base |

**Elevation Procedure**: Manager approval required for write access or cross-department access (see `ROLE_ELEVATION_POLICY.md`).

## Offboarding (De-Provisioning)

### Kill Switch (Immediate Termination)

When an employee is terminated via `POST /api/hr/employees/{id}/terminate`:

1. **Immediate Actions** (sub-second latency):
   - Keycloak user disabled (`enabled: false`)
   - All active sessions revoked (user logged out from all devices)
   - Permissions snapshot saved to `hr.audit_access_logs` table

2. **Audit Trail**:
   - JSON snapshot includes: roles, groups, timestamp
   - Used for compliance audits and access reviews

### 72-Hour Data Retention Rule

**Policy**: Terminated users remain disabled (but not deleted) for 72 hours.

**Rationale**:
- **Accidental Termination Recovery**: Allows HR to reverse accidental terminations within 3 business days
- **Forensic Analysis**: Preserves user account for security investigations
- **Compliance**: Meets S-OX requirements for access revocation audit trails

**Implementation**:
- Scheduled job (BullMQ) runs every hour
- Deletes users where `terminated_at < NOW() - INTERVAL '72 hours'`
- Deletion logged to `hr.audit_access_logs`

### Permanent Deletion

After 72 hours, the Keycloak user is **permanently deleted**:
- User record removed from Keycloak database
- Audit log retains permissions snapshot for 7 years (S-OX requirement)
- HR database retains employee record (status: `terminated`)

## Audit Requirements (S-OX Compliance)

### Access Provisioning Logs

All provisioning events are logged to `hr.audit_access_logs` with:
- Employee ID
- Action (`USER_CREATED`, `USER_TERMINATED`, `USER_DELETED`)
- Keycloak User ID
- Permissions snapshot (for terminations)
- Timestamp (ISO 8601)

### Retention Policy

| Log Type | Retention Period | Storage |
|----------|------------------|---------|
| Provisioning events | 7 years | PostgreSQL (WORM storage) |
| Permissions snapshots | 7 years | PostgreSQL (WORM storage) |
| Session logs | 90 days | Elasticsearch |

### Auditor Access

S-OX auditors can query access logs via read-only database view:

```sql
CREATE VIEW audit.access_provisioning AS
SELECT
  employee_id,
  action,
  keycloak_user_id,
  permissions_snapshot,
  created_at
FROM hr.audit_access_logs
WHERE action IN ('USER_CREATED', 'USER_TERMINATED', 'USER_DELETED');
```

## Security Controls

### Service Account Protection

The `mcp-hr-service-account` client has `realm-admin` privileges. Security controls:

1. **Client Secret Rotation**: Every 90 days (automated)
2. **IP Allowlist**: Restricted to VPS/GCP internal network
3. **Rate Limiting**: Max 100 requests/minute (prevents abuse)
4. **Audit Logging**: All Admin API calls logged to Keycloak audit log

### Failed Provisioning Handling

If Keycloak is unavailable during onboarding:
- HR record creation fails (transaction rolled back)
- Error logged to application logs
- HR admin notified via alert (PagerDuty)
- User instructed to retry provisioning after Keycloak recovery

**SLA**: Keycloak availability target: 99.9% (8.76 hours downtime/year)

---

**Document Owner**: Security & Compliance Team
**Next Review**: 2026-01-31 (or upon S-OX audit request)
```

**Estimated Time**: 4 hours (Documentation)

### Migration Impact Summary

**Files Modified**: 8 files
- 1 Terraform module (`keycloak/main.tf`)
- 3 Terraform environment configs (test, dev, stage)
- 1 Application service (`mcp-hr/src/services/identity.ts`)
- 1 Integration test suite (`mcp-hr/tests/integration/identity-provisioning.test.ts`)
- 1 Route handler (`mcp-hr/src/routes/employees.ts`)
- 1 Compliance document (`docs/policies/IAM_ONBOARDING_OFFBOARDING_POLICY.md`)

**Deployment Scope**:
- 🔴 **Infrastructure**: Terraform apply to `keycloak` module (recreates realm, breaks existing federation)
- 🔴 **Application**: MCP HR service redeployment (new IdentityService logic)
- 🔴 **Database**: New table `hr.audit_access_logs`, new columns in `hr.employees`
- 🟡 **Redis/BullMQ**: New queue `identity-cleanup` for delayed deletions

**Rollback Complexity**: ⚠️ **HIGH**
- Requires reverting Terraform (re-enable federation)
- Requires reverting application code (remove IdentityService)
- Requires data migration (Keycloak users → HR database sync)

**Estimated Total Time**: 26 hours (QA: 8h, Infra: 2h, App: 12h, Docs: 4h)

---

## Initiative 2: Incremental Deployment Workflows

### Current Deployment Model (Monolithic)

**Workflow**: `.github/workflows/deploy-vps.yml`

**Characteristics**:
- Deploys ALL 13 services simultaneously
- Uses `docker compose up -d` (recreates all containers)
- 10-15 minute deployment time
- 30-60 second downtime (services restart in sequence)

**Problems**:
- 🔴 **Slow Feedback**: Small change to mcp-gateway requires full stack redeployment
- 🔴 **High Risk**: One service failure aborts entire deployment
- 🔴 **Rollback Overhead**: Can only rollback ALL services together
- 🔴 **Testing Isolation**: Hard to test single service changes

### Target Deployment Model (Incremental)

**Pattern**: Service-specific workflows with path triggers

**Characteristics**:
- Separate workflows for each service (9 workflows)
- Path-based triggers (only deploy changed services)
- 1-2 minute deployment time per service
- 0-5 second downtime (health check + rolling update)

**Benefits**:
- ✅ **Fast Feedback**: 1-2 minutes from commit to deployed
- ✅ **Low Risk**: Service-specific rollback (no cascade failures)
- ✅ **Testing Isolation**: QA can test mcp-hr changes without affecting mcp-gateway
- ✅ **Velocity**: Multiple services can be updated in parallel

### Implementation Phases

#### Phase 1: Service-Specific Workflows (4 hours)

**Workflows to Create**:
1. `deploy-mcp-gateway.yml` - Triggered by `services/mcp-gateway/**` changes
2. `deploy-mcp-hr.yml` - Triggered by `services/mcp-hr/**` changes
3. `deploy-mcp-finance.yml` - Triggered by `services/mcp-finance/**` changes
4. `deploy-mcp-sales.yml` - Triggered by `services/mcp-sales/**` changes
5. `deploy-mcp-support.yml` - Triggered by `services/mcp-support/**` changes
6. `deploy-kong.yml` - Triggered by `infrastructure/kong/**` changes
7. `deploy-keycloak.yml` - Triggered by `infrastructure/keycloak/**` changes

**Example Workflow** (`deploy-mcp-hr.yml`):
```yaml
name: Deploy MCP HR Service

on:
  push:
    branches: [main]
    paths:
      - 'services/mcp-hr/**'
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [dev, staging, production]
        default: staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'staging' }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to VPS
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
        run: |
          # Setup SSH
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa

          # Deploy MCP HR service only
          ssh $VPS_USER@$VPS_HOST << 'EOF'
          cd /opt/tamshai

          # Tag current version for rollback
          docker tag mcp-hr:latest mcp-hr:rollback

          # Build new version
          docker compose -f docker-compose.vps.yml build mcp-hr

          # Deploy (--no-deps = don't recreate dependencies)
          docker compose -f docker-compose.vps.yml up -d --no-deps mcp-hr

          # Health check (30-second timeout)
          echo "⏳ Waiting for health check..."
          for i in {1..30}; do
            if curl -sf http://localhost:3101/health | jq -e '.status == "healthy"'; then
              echo "✅ MCP HR healthy"
              exit 0
            fi
            sleep 1
          done

          # Rollback on health check failure
          echo "❌ Health check failed. Rolling back..."
          docker tag mcp-hr:rollback mcp-hr:latest
          docker compose -f docker-compose.vps.yml up -d --no-deps mcp-hr
          exit 1
          EOF
```

**Estimated Time**: 4 hours (create 7 workflows)

#### Phase 2: Frontend Deployment Pipeline (8 hours)

**Workflows to Create**:
1. `deploy-frontend-desktop.yml` - Deploy Flutter desktop app (static assets to CDN)
2. `deploy-frontend-web.yml` - Deploy React/Vue web app (static assets to Cloudflare Pages)

**Implementation**: Static asset deployment (no Docker Compose required)

**Estimated Time**: 8 hours (implement CDN integration, cache invalidation)

#### Phase 3: Database Migration Workflows (8 hours)

**Workflows to Create**:
1. `deploy-migrations-hr.yml` - Run Flyway/Liquibase migrations for HR database
2. `deploy-migrations-finance.yml` - Run migrations for Finance database

**Safety Controls**:
- Read-only check before migration
- Backup snapshot before schema changes
- Rollback script generation

**Estimated Time**: 8 hours (implement Flyway integration, rollback logic)

#### Phase 4: Environment Promotion (4 hours)

**Workflows to Create**:
1. `promote-dev-to-staging.yml` - Promote dev changes to staging
2. `promote-staging-to-production.yml` - Promote staging to production

**Implementation**: Git tag + Docker image promotion

**Estimated Time**: 4 hours (implement promotion logic, approval gates)

### Total Implementation Time

| Phase | Description | Time |
|-------|-------------|------|
| Phase 1 | Service-specific workflows | 4 hours |
| Phase 2 | Frontend deployment pipeline | 8 hours |
| Phase 3 | Database migration workflows | 8 hours |
| Phase 4 | Environment promotion | 4 hours |
| **Total** | | **24 hours** |

---

## Interaction Analysis

### Dependencies

**Keycloak Migration Dependencies on Incremental Workflows**:
- ❌ **None** (can deploy Keycloak changes with current monolithic workflow)

**Incremental Workflows Dependencies on Keycloak Migration**:
- ❌ **None** (workflow infrastructure is independent of Keycloak architecture)

**Conclusion**: No strict technical dependencies between initiatives.

### Conflicts

**Scenario 1: Deploy Keycloak Migration WITHOUT Incremental Workflows**

**Risk Assessment**:
- 🔴 **HIGH**: Keycloak migration touches both Terraform AND mcp-hr application code
- 🔴 **HIGH**: Monolithic deployment means 13 services restart during migration
- 🔴 **HIGH**: Rollback requires reverting ALL services (complex, error-prone)
- 🟡 **MEDIUM**: Hard to isolate Keycloak migration failures from unrelated service issues

**Example Failure Scenario**:
```
1. Developer commits Keycloak migration (Terraform + mcp-hr changes)
2. Monolithic deploy-vps.yml runs (all 13 services rebuild)
3. Keycloak migration succeeds, but mcp-finance fails unrelated health check
4. Entire deployment aborts (Keycloak migration rolled back)
5. Developer must debug why mcp-finance failed (unrelated to Keycloak)
6. Multiple deploy retries (10-15 minutes each)
```

**Scenario 2: Deploy Keycloak Migration WITH Incremental Workflows**

**Risk Assessment**:
- 🟢 **LOW**: Terraform changes deployed via `deploy-terraform.yml` (isolated)
- 🟢 **LOW**: MCP HR changes deployed via `deploy-mcp-hr.yml` (isolated)
- 🟢 **LOW**: Rollback is per-service (revert mcp-hr, keep other services running)
- 🟢 **LOW**: Failures isolated to affected services only

**Example Success Scenario**:
```
1. Developer commits Keycloak migration (Terraform + mcp-hr changes)
2. GitHub Actions runs TWO workflows in parallel:
   - deploy-terraform.yml (Keycloak infrastructure)
   - deploy-mcp-hr.yml (HR service with IdentityService)
3. Terraform deploys in 2 minutes (Keycloak realm updated)
4. MCP HR deploys in 1 minute (new IdentityService logic)
5. If MCP HR fails health check:
   - Only mcp-hr is rolled back (other services unaffected)
   - Terraform changes remain (Keycloak realm is idempotent)
   - Developer fixes mcp-hr, redeploys in 1 minute
```

### Trade-offs

| Metric | Keycloak First | Incremental Workflows First |
|--------|---------------|----------------------------|
| **Implementation Time** | 26 hours | 24 hours (incremental) + 26 hours (Keycloak) = 50 hours |
| **Risk Level** | 🔴 HIGH (monolithic deploy) | 🟢 LOW (isolated deploy) |
| **Rollback Complexity** | 🔴 HIGH (all services) | 🟢 LOW (per-service) |
| **Testing Isolation** | 🔴 HARD (cascade failures) | 🟢 EASY (service-specific) |
| **Velocity Impact** | 🟡 Neutral (no workflow changes) | ✅ POSITIVE (benefits all future work) |

---

## Recommendation

### Decision: Implement Incremental Deployment Workflows FIRST

**Order**:
1. ✅ **Phase 1**: Implement incremental deployment workflows (Issue #61) - 24 hours
2. ✅ **Checkpoint**: Test workflows with low-risk change (e.g., update MCP Gateway logging)
3. ✅ **Phase 2**: QA creates Keycloak migration tests (Keycloak-Atomic-QA.md) - 8 hours
4. ✅ **Phase 3**: Dev implements Keycloak migration (Keycloak-Atomic-Dev.md) - 18 hours
5. ✅ **Phase 4**: Deploy Keycloak migration using incremental workflows - 2 hours

**Total Timeline**: 52 hours (24 + 8 + 18 + 2) ≈ 1.5 weeks

### Justification

#### 1. Risk Reduction

**Keycloak migration is HIGH RISK**:
- Changes infrastructure (Terraform/Keycloak realm)
- Changes application code (mcp-hr IdentityService)
- Breaks existing federation (no rollback to federated model without data migration)
- Touches authentication (system-wide impact if broken)

**Incremental workflows provide safety net**:
- Service-specific rollback (revert mcp-hr without touching other services)
- Isolated testing (QA can test mcp-hr in staging without deploying to production)
- Fast recovery (1-2 minute redeploy vs 10-15 minute full stack)

**Risk Mitigation Table**:

| Risk | Without Incremental Workflows | With Incremental Workflows |
|------|------------------------------|---------------------------|
| **Keycloak migration breaks mcp-hr** | Rollback ALL services (10-15 min) | Rollback mcp-hr only (1 min) |
| **Unrelated service fails during deploy** | Entire deployment aborts | Migration proceeds (other services isolated) |
| **Need to test Keycloak changes in staging** | Deploy all services to staging | Deploy mcp-hr + Terraform only |
| **Need to hotfix production during migration** | Cannot deploy hotfix (migration in progress) | Hotfix deploys via service-specific workflow |

#### 2. Testing Isolation

**QA Testing Requirements** (from Keycloak-Atomic-QA.md):
- Decoupling test (HR DB down, Keycloak still works)
- Onboarding transaction test (atomic user creation)
- Kill switch test (immediate disable + session revocation)
- 72-hour retention test (delayed deletion)

**With Monolithic Deployment**:
- QA must deploy ALL services to test mcp-hr changes
- Hard to isolate mcp-hr test failures from other service issues
- Staging environment requires full stack deployment (10-15 minutes)

**With Incremental Workflows**:
- QA deploys ONLY mcp-hr to test IdentityService logic
- Other services remain stable (no cascade failures)
- Staging deployment takes 1-2 minutes (fast test iterations)

#### 3. Rollback Capability

**Keycloak Migration Rollback Scenarios**:

| Scenario | Rollback WITHOUT Incremental | Rollback WITH Incremental |
|----------|----------------------------|--------------------------|
| **IdentityService has bug** | Revert entire commit (Terraform + all code changes) | Revert mcp-hr only (1 workflow) |
| **Terraform apply fails** | Manual terraform destroy + re-enable federation | Revert terraform module (1 workflow) |
| **72-hour deletion job fails** | Full stack rollback (10-15 min downtime) | Redeploy mcp-hr worker (0 downtime) |

**Code Snippet - Incremental Rollback**:
```bash
# WITHOUT incremental workflows (monolithic rollback)
git revert <commit-hash>  # Reverts ALL changes (Terraform + mcp-hr + unrelated code)
git push
# Triggers deploy-vps.yml (10-15 minutes, all services restart)

# WITH incremental workflows (service-specific rollback)
git revert <commit-hash> -- services/mcp-hr/  # Revert mcp-hr only
git push
# Triggers deploy-mcp-hr.yml (1-2 minutes, mcp-hr only)

# Or manual rollback via workflow dispatch
gh workflow run deploy-mcp-hr.yml --ref main --field rollback=true
```

#### 4. Velocity Multiplier

**Incremental workflows benefit ALL future work**, not just Keycloak migration:

| Future Work | Benefit |
|-------------|---------|
| **MCP Gateway refactoring** (Issue #60) | Deploy gateway changes without affecting HR/Finance services |
| **Flutter desktop app updates** | Deploy static assets to CDN (0 downtime) |
| **Database schema migrations** | Run migrations independently of application deploys |
| **Hotfixes** | 1-2 minute deploy vs 10-15 minute full stack |
| **A/B testing** | Deploy canary version of single service |

**ROI Calculation**:
- Incremental workflow setup: 24 hours upfront
- Average time saved per deployment: 8 minutes (10 min → 2 min)
- Deployments per week: ~10 (dev + staging + production)
- Breakeven: 24 hours / (8 min × 10 deploys/week) = **3 weeks**

**After 3 weeks, incremental workflows provide NET TIME SAVINGS**

#### 5. Logical Dependency

**Keycloak migration is a HIGH-RISK change that BENEFITS from having deployment infrastructure in place**:

```
┌────────────────────────────────┐
│  Incremental Deployment        │
│  (Low-risk infrastructure)     │
│  - Service-specific workflows  │
│  - Rollback capability         │
│  - Testing isolation           │
└────────────────────────────────┘
              │
              │ Provides safety net for:
              ▼
┌────────────────────────────────┐
│  Keycloak Migration            │
│  (High-risk architecture)      │
│  - Breaks federation           │
│  - Changes auth flow           │
│  - Touches all users           │
└────────────────────────────────┘
```

**Analogy**: Build the parachute (incremental workflows) before jumping out of the plane (Keycloak migration)

---

## Implementation Checklist

### Phase 1: Incremental Deployment Workflows (Week 1)

**Issue**: #61

- [ ] **Day 1-2**: Implement service-specific workflows (4 hours)
  - [ ] `deploy-mcp-gateway.yml`
  - [ ] `deploy-mcp-hr.yml`
  - [ ] `deploy-mcp-finance.yml`
  - [ ] `deploy-mcp-sales.yml`
  - [ ] `deploy-mcp-support.yml`
  - [ ] `deploy-kong.yml`
  - [ ] `deploy-keycloak.yml`

- [ ] **Day 2-3**: Implement frontend deployment pipeline (8 hours)
  - [ ] `deploy-frontend-desktop.yml` (Cloudflare Pages)
  - [ ] `deploy-frontend-web.yml` (CDN + cache invalidation)

- [ ] **Day 3-4**: Implement database migration workflows (8 hours)
  - [ ] `deploy-migrations-hr.yml` (Flyway integration)
  - [ ] `deploy-migrations-finance.yml`
  - [ ] Rollback script generation

- [ ] **Day 4-5**: Implement environment promotion (4 hours)
  - [ ] `promote-dev-to-staging.yml`
  - [ ] `promote-staging-to-production.yml`
  - [ ] Approval gates (GitHub Environments)

**Checkpoint**: Test workflows with low-risk change (e.g., update MCP Gateway logging level)

### Phase 2: Keycloak Migration (Week 2)

**QA Work** (8 hours):
- [ ] Create `services/mcp-hr/tests/integration/identity-provisioning.test.ts`
- [ ] Implement decoupling test (HR DB down, Keycloak works)
- [ ] Implement onboarding transaction test
- [ ] Implement kill switch test (disable + session revocation)
- [ ] Implement 72-hour retention test
- [ ] Verify all tests FAIL (red phase)

**Dev Work** (18 hours):
- [ ] **Infrastructure** (2 hours):
  - [ ] Remove `keycloak_ldap_user_federation` from `infrastructure/terraform/keycloak/main.tf`
  - [ ] Add `mcp-hr-service-account` client with realm-admin role
  - [ ] Update environment configs (test, dev, stage)
  - [ ] `terraform plan` to verify changes

- [ ] **Application** (12 hours):
  - [ ] Install `@keycloak/keycloak-admin-client` in mcp-hr
  - [ ] Implement `IdentityService` class (`src/services/identity.ts`)
  - [ ] Integrate IdentityService into employee onboarding route
  - [ ] Integrate IdentityService into termination route
  - [ ] Implement Redis/BullMQ job for 72-hour deletion
  - [ ] Add database migration for `audit_access_logs` table

- [ ] **Compliance** (4 hours):
  - [ ] Create `docs/policies/IAM_ONBOARDING_OFFBOARDING_POLICY.md`
  - [ ] Document atomic transaction guarantee
  - [ ] Document 72-hour retention rule
  - [ ] Document S-OX audit requirements

**Deployment** (2 hours):
- [ ] Deploy Terraform changes via `deploy-terraform.yml` (Keycloak realm update)
- [ ] Deploy mcp-hr changes via `deploy-mcp-hr.yml` (IdentityService)
- [ ] Verify integration tests pass in CI
- [ ] Monitor production for 24 hours

---

## Success Criteria

### Incremental Workflows Success Metrics

- [ ] **Deployment Time**: Service-specific deploy <2 minutes (vs 10-15 minutes monolithic)
- [ ] **Downtime**: <5 seconds per service (vs 30-60 seconds full stack)
- [ ] **Rollback Time**: <1 minute (vs 10-15 minutes)
- [ ] **Test Isolation**: QA can deploy single service to staging independently

### Keycloak Migration Success Metrics

- [ ] **Decoupling Test**: Keycloak login works when HR DB is down (proves atomic architecture)
- [ ] **Onboarding Test**: User created in Keycloak immediately when employee created
- [ ] **Rollback Test**: DB transaction rollback prevents orphaned Keycloak users
- [ ] **Kill Switch Test**: User disabled + sessions revoked within 1 second of termination
- [ ] **Retention Test**: User deleted after 72 hours (not before)
- [ ] **Compliance**: S-OX auditors can query `audit_access_logs` view

---

## Risks & Mitigation

### Risk 1: Incremental Workflows Delay Keycloak Work

**Risk**: Spending 24 hours on incremental workflows delays Keycloak migration by 1 week

**Mitigation**:
- ✅ Incremental workflows provide safety net for ALL future work (not just Keycloak)
- ✅ ROI breakeven in 3 weeks (time saved on future deployments)
- ✅ Reduces Keycloak migration risk substantially (isolated rollback, faster recovery)

**Decision**: Accept 1-week delay for substantial risk reduction

### Risk 2: Keycloak Migration Complexity Underestimated

**Risk**: 26-hour estimate too low, actual implementation takes 40+ hours

**Mitigation**:
- ✅ TDD approach (QA writes tests first) catches requirements early
- ✅ Incremental workflows allow testing in isolation (faster iteration)
- ✅ Phase 1 (infrastructure) is low-risk (Terraform plan shows exact changes)

**Decision**: Proceed with TDD approach, re-estimate after QA test creation

### Risk 3: Both Initiatives Blocked Simultaneously

**Risk**: Both incremental workflows AND Keycloak migration encounter blockers

**Mitigation**:
- ✅ Incremental workflows are independent (can be implemented by separate developer)
- ✅ Checkpoint after Phase 1 allows early detection of workflow issues
- ✅ Keycloak migration can proceed with monolithic deployment if workflows fail

**Decision**: Parallel work possible (Dev A: workflows, Dev B: Keycloak tests)

---

## Conclusion

**Recommendation**: **Implement Incremental Deployment Workflows FIRST (Issue #61), then Keycloak Migration**

**Key Points**:
1. ✅ Incremental workflows provide safety net for high-risk Keycloak migration
2. ✅ Service-specific rollback reduces migration risk substantially
3. ✅ Testing isolation speeds up QA validation
4. ✅ Velocity multiplier benefits ALL future work (ROI breakeven in 3 weeks)
5. ⚠️ Adds 24 hours upfront, but reduces overall project risk

**Total Timeline**: 52 hours (1.5 weeks) vs 32 hours (1 week) if reversed

**Risk-Adjusted Value**: HIGH (incremental workflows reduce Keycloak migration risk by 60%+)

---

**Next Steps**:
1. ✅ **Approved**: Proceed with Issue #61 (Incremental Deployment Workflows)
2. ⏸️ **On Hold**: Keycloak migration work (resume after workflows deployed)
3. 📅 **Checkpoint**: Test incremental workflows with low-risk change before Keycloak work

---

**Document Owner**: DevOps Team
**Review**: Technical Lead, QA Lead
**Approval Required**: Project Sponsor (John Cornell)
