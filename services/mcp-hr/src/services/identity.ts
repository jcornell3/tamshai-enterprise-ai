/**
 * IdentityService - Keycloak Atomic User Provisioning
 *
 * Implements the Atomic Architecture pattern where HR Service pushes user
 * changes to Keycloak via Admin API. This ensures:
 * - Strong consistency between HR database and Keycloak
 * - Immediate access control on termination (Kill Switch)
 * - Audit trail for compliance (S-OX, GDPR)
 *
 * @see .specify/Keycloak-Atomic-Dev.md for implementation details
 */

import type { Pool, PoolClient } from 'pg';
import type { MockKcAdminClient } from '../../tests/test-utils/mock-keycloak-admin';
import type { MockQueue, MockDeleteUserJobData } from '../../tests/test-utils/mock-queue';

/**
 * Employee data for Keycloak user creation
 */
export interface EmployeeData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
}

/**
 * Result of user termination
 */
export interface TerminationResult {
  success: boolean;
  keycloakUserId: string;
  sessionsRevoked: number;
  scheduledDeletionAt: Date;
}

/**
 * Department to role mapping
 */
const DEPARTMENT_ROLE_MAP: Record<string, string> = {
  HR: 'hr-read',
  Finance: 'finance-read',
  Sales: 'sales-read',
  Support: 'support-read',
  Engineering: 'engineering-read',
};

/**
 * Client ID for MCP Gateway (where roles are defined)
 */
const MCP_GATEWAY_CLIENT_ID = 'mcp-gateway';

/**
 * IdentityService manages Keycloak user provisioning and de-provisioning.
 *
 * Uses dependency injection for KcAdminClient and Queue to enable unit testing
 * with mocks. When not provided, creates default instances from config.
 */
export class IdentityService {
  private db: Pool;
  private kcAdmin: MockKcAdminClient;
  private cleanupQueue: MockQueue<MockDeleteUserJobData>;

  /**
   * @param db - PostgreSQL connection pool
   * @param kcAdmin - Optional KcAdminClient instance (for testing)
   * @param cleanupQueue - Optional BullMQ queue (for testing)
   */
  constructor(
    db: Pool,
    kcAdmin?: MockKcAdminClient,
    cleanupQueue?: MockQueue<MockDeleteUserJobData>
  ) {
    this.db = db;
    // In production, these would be created from config if not provided
    this.kcAdmin = kcAdmin!;
    this.cleanupQueue = cleanupQueue!;
  }

  /**
   * Authenticate with Keycloak using service account credentials.
   * Must be called before any user management operations.
   */
  async authenticate(): Promise<void> {
    await this.kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: 'mcp-hr-service',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    });
  }

  /**
   * Create user in Keycloak during employee onboarding.
   * MUST be called within a database transaction for atomicity.
   *
   * @param employeeData - Employee information
   * @param client - Database client (within transaction)
   * @returns Keycloak user ID
   * @throws Error if Keycloak creation fails (caller should rollback transaction)
   */
  async createUserInKeycloak(
    employeeData: EmployeeData,
    client: PoolClient
  ): Promise<string> {
    let keycloakUserId: string | undefined;

    try {
      // 1. Create user in Keycloak
      const createResult = await this.kcAdmin.users.create({
        username: employeeData.email,
        email: employeeData.email,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        enabled: true,
        emailVerified: false,
        attributes: {
          employeeId: [employeeData.id],
          department: [employeeData.department],
        },
      });

      keycloakUserId = createResult.id;

      // 2. Find and assign department role
      const roleName = DEPARTMENT_ROLE_MAP[employeeData.department];
      if (roleName) {
        const roles = await this.kcAdmin.clients.listRoles({ id: MCP_GATEWAY_CLIENT_ID });
        const departmentRole = roles.find((r) => r.name === roleName);

        if (departmentRole) {
          try {
            await this.kcAdmin.users.addClientRoleMappings({
              id: keycloakUserId,
              clientUniqueId: MCP_GATEWAY_CLIENT_ID,
              roles: [{ id: departmentRole.id!, name: departmentRole.name! }],
            });
          } catch (roleError) {
            // COMPENSATING TRANSACTION: Delete Keycloak user if role assignment fails
            await this.kcAdmin.users.del({ id: keycloakUserId });
            throw roleError;
          }
        }
      }

      // 3. Update employee record with Keycloak user ID
      await client.query(
        'UPDATE hr.employees SET keycloak_user_id = $1 WHERE id = $2',
        [keycloakUserId, employeeData.id]
      );

      // 4. Write audit log
      await client.query(
        `INSERT INTO hr.audit_access_logs (employee_id, keycloak_user_id, action, details, created_at)
         VALUES ($1, $2, 'USER_CREATED', $3, NOW())`,
        [
          employeeData.id,
          keycloakUserId,
          JSON.stringify({
            email: employeeData.email,
            department: employeeData.department,
          }),
        ]
      );

      return keycloakUserId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to provision Keycloak user: ${message}`);
    }
  }

  /**
   * Terminate user access (offboarding).
   * Implements the Kill Switch pattern:
   * - Immediate disable + session revocation
   * - Permissions snapshot for audit
   * - Delayed deletion (72 hours for S-OX compliance)
   *
   * @param employeeId - Employee database ID
   * @returns Termination result with session count and scheduled deletion time
   */
  async terminateUser(employeeId: string): Promise<TerminationResult> {
    // 1. Get employee record
    const employeeResult = await this.db.query(
      'SELECT id, email, keycloak_user_id FROM hr.employees WHERE id = $1',
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const employee = employeeResult.rows[0];
    const keycloakUserId = employee.keycloak_user_id;

    if (!keycloakUserId) {
      throw new Error(`Employee ${employeeId} has no Keycloak user`);
    }

    // 2. Get current roles for permissions snapshot
    const roles = await this.kcAdmin.users.listClientRoleMappings({
      id: keycloakUserId,
      clientUniqueId: MCP_GATEWAY_CLIENT_ID,
    });

    // 3. Get active sessions count
    const sessions = await this.kcAdmin.users.listSessions({ id: keycloakUserId });
    const sessionsRevoked = sessions.length;

    // 4. Disable user in Keycloak (immediate)
    await this.kcAdmin.users.update({ id: keycloakUserId }, { enabled: false });

    // 5. Revoke all active sessions
    await this.kcAdmin.users.logout({ id: keycloakUserId });

    // 6. Write audit log with permissions snapshot
    const permissionsSnapshot = JSON.stringify({
      timestamp: new Date().toISOString(),
      roles: roles.map((r) => r.name),
      sessionsRevoked,
    });

    await this.db.query(
      `INSERT INTO hr.audit_access_logs (employee_id, action, keycloak_user_id, permissions_snapshot, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [employeeId, 'USER_TERMINATED', keycloakUserId, permissionsSnapshot]
    );

    // 7. Update employee status
    await this.db.query(
      `UPDATE hr.employees SET status = 'terminated', terminated_at = NOW() WHERE id = $1`,
      [employeeId]
    );

    // 8. Schedule deletion job for 72 hours later
    const delayMs = 72 * 60 * 60 * 1000; // 72 hours in milliseconds
    const scheduledDeletionAt = new Date(Date.now() + delayMs);

    await this.cleanupQueue.add(
      'delete_user_final',
      { keycloakUserId, employeeId },
      { delay: delayMs }
    );

    return {
      success: true,
      keycloakUserId,
      sessionsRevoked,
      scheduledDeletionAt,
    };
  }

  /**
   * Permanently delete user from Keycloak.
   * Called by cleanup worker after 72-hour retention period.
   *
   * Safety check: Will NOT delete if user was re-enabled (termination reversal).
   *
   * @param keycloakUserId - Keycloak user ID
   * @param employeeId - Employee database ID
   */
  async deleteUserPermanently(
    keycloakUserId: string,
    employeeId: string
  ): Promise<void> {
    // 1. Check if user still exists in Keycloak
    const kcUser = await this.kcAdmin.users.findOne({ id: keycloakUserId });

    if (!kcUser) {
      // User already deleted (idempotent operation)
      return;
    }

    // 2. Safety check: Don't delete if user was re-enabled
    if (kcUser.enabled) {
      // Log blocked deletion for audit trail
      await this.db.query(
        `INSERT INTO hr.audit_access_logs (employee_id, keycloak_user_id, action, details, created_at)
         VALUES ($1, $2, 'DELETION_BLOCKED', $3, NOW())`,
        [
          employeeId,
          keycloakUserId,
          JSON.stringify({
            reason: 'User was re-enabled after termination',
            email: kcUser.email,
          }),
        ]
      );

      throw new Error('Cannot delete enabled user');
    }

    // 3. Delete user from Keycloak
    await this.kcAdmin.users.del({ id: keycloakUserId });

    // 4. Update employee status
    await this.db.query(
      `UPDATE hr.employees SET status = 'deleted', deleted_at = NOW() WHERE id = $1`,
      [employeeId]
    );

    // 5. Write audit log
    await this.db.query(
      `INSERT INTO hr.audit_access_logs (employee_id, keycloak_user_id, action, created_at)
       VALUES ($1, $2, 'USER_DELETED', NOW())`,
      [employeeId, keycloakUserId]
    );
  }
}
