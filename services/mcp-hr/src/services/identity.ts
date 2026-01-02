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

// ============================================================================
// Constants
// ============================================================================

/**
 * S-OX Compliance: Terminated users remain disabled for 72 hours before
 * permanent deletion. This allows for termination reversal if needed.
 */
export const RETENTION_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours
export const RETENTION_PERIOD_HOURS = 72;

/**
 * Audit action types for access logs
 */
export const AuditAction = {
  USER_CREATED: 'USER_CREATED',
  USER_TERMINATED: 'USER_TERMINATED',
  USER_DELETED: 'USER_DELETED',
  DELETION_BLOCKED: 'DELETION_BLOCKED',
  BULK_SYNC_STARTED: 'BULK_SYNC_STARTED',
  BULK_SYNC_COMPLETED: 'BULK_SYNC_COMPLETED',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * BullMQ job names
 */
export const JobName = {
  DELETE_USER_FINAL: 'delete_user_final',
} as const;

/**
 * Department code to Keycloak role mapping
 * Maps department codes (from hr.departments.code) to Keycloak client roles
 */
export const DEPARTMENT_ROLE_MAP: Record<string, string> = {
  HR: 'hr-read',
  FIN: 'finance-read',
  SALES: 'sales-read',
  SUPPORT: 'support-read',
  ENG: 'engineering-read',
  // Legacy mappings for backwards compatibility with tests
  Finance: 'finance-read',
  Sales: 'sales-read',
  Support: 'support-read',
  Engineering: 'engineering-read',
};

/**
 * Keycloak client configuration
 */
export const KeycloakConfig = {
  MCP_GATEWAY_CLIENT_ID: 'mcp-gateway',
  HR_SERVICE_CLIENT_ID: 'mcp-hr-service',
} as const;

// ============================================================================
// Types
// ============================================================================

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
 * Result of bulk sync operation
 */
export interface BulkSyncResult {
  success: boolean;
  totalEmployees: number;
  created: number;
  skipped: number;
  errors: SyncError[];
  duration: number;
}

/**
 * Individual sync error
 */
export interface SyncError {
  employeeId: string;
  email: string;
  error: string;
}

/**
 * Keycloak user representation (subset used by IdentityService)
 */
export interface KcUserRepresentation {
  id?: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}

/**
 * Keycloak role representation
 */
export interface KcRoleRepresentation {
  id?: string;
  name?: string;
}

/**
 * Keycloak session representation
 */
export interface KcSessionRepresentation {
  id: string;
}

/**
 * Keycloak Admin Client interface
 * Abstracts the @keycloak/keycloak-admin-client for testability
 */
export interface KcAdminClient {
  users: {
    create(user: Partial<KcUserRepresentation>): Promise<{ id: string }>;
    update(query: { id: string }, user: Partial<KcUserRepresentation>): Promise<void>;
    del(query: { id: string }): Promise<void>;
    find(query: { email?: string; username?: string }): Promise<KcUserRepresentation[]>;
    findOne(query: { id: string }): Promise<KcUserRepresentation | null>;
    addClientRoleMappings(params: {
      id: string;
      clientUniqueId: string;
      roles: KcRoleRepresentation[];
    }): Promise<void>;
    listClientRoleMappings(params: {
      id: string;
      clientUniqueId: string;
    }): Promise<KcRoleRepresentation[]>;
    listSessions(query: { id: string }): Promise<KcSessionRepresentation[]>;
    logout(query: { id: string }): Promise<void>;
  };
  clients: {
    listRoles(query: { id: string }): Promise<KcRoleRepresentation[]>;
  };
  auth(credentials: {
    grantType: string;
    clientId: string;
    clientSecret: string;
  }): Promise<void>;
}

/**
 * Job data for user deletion
 */
export interface DeleteUserJobData {
  keycloakUserId: string;
  employeeId: string;
}

/**
 * BullMQ Queue interface (subset used by IdentityService)
 */
export interface CleanupQueue {
  add(
    name: string,
    data: DeleteUserJobData,
    opts?: { delay?: number }
  ): Promise<unknown>;
}

// ============================================================================
// SQL Queries
// ============================================================================

const SQL = {
  UPDATE_EMPLOYEE_KEYCLOAK_ID:
    'UPDATE hr.employees SET keycloak_user_id = $1 WHERE id = $2',

  // Audit log columns: user_email, action, resource, target_id, access_decision, access_justification
  INSERT_AUDIT_LOG:
    'INSERT INTO hr.access_audit_log (user_email, action, resource, target_id, access_decision, access_justification) VALUES ($1, $2, $3, $4, $5, $6)',

  INSERT_AUDIT_LOG_WITH_SNAPSHOT:
    'INSERT INTO hr.access_audit_log (user_email, action, resource, target_id, access_decision, access_justification) VALUES ($1, $2, $3, $4, $5, $6)',

  INSERT_AUDIT_LOG_SIMPLE:
    'INSERT INTO hr.access_audit_log (user_email, action, resource, target_id, access_decision) VALUES ($1, $2, $3, $4, $5)',

  SELECT_EMPLOYEE_BY_ID:
    'SELECT id, email, keycloak_user_id FROM hr.employees WHERE id = $1',

  SELECT_ALL_ACTIVE_EMPLOYEES:
    `SELECT e.id, e.email, e.first_name AS "firstName", e.last_name AS "lastName",
            COALESCE(d.code, 'Unknown') AS department
     FROM hr.employees e
     LEFT JOIN hr.departments d ON e.department_id = d.id
     WHERE UPPER(e.status) = 'ACTIVE' AND e.keycloak_user_id IS NULL
     ORDER BY e.id`,

  UPDATE_EMPLOYEE_TERMINATED:
    "UPDATE hr.employees SET status = 'terminated', terminated_at = NOW() WHERE id = $1",

  UPDATE_EMPLOYEE_DELETED:
    "UPDATE hr.employees SET status = 'deleted', deleted_at = NOW() WHERE id = $1",
} as const;

// ============================================================================
// IdentityService
// ============================================================================

/**
 * IdentityService manages Keycloak user provisioning and de-provisioning.
 *
 * Uses dependency injection for KcAdminClient and Queue to enable unit testing
 * with mocks. When not provided, creates default instances from config.
 */
export class IdentityService {
  private readonly db: Pool;
  private readonly kcAdmin: KcAdminClient;
  private readonly cleanupQueue: CleanupQueue;

  /**
   * @param db - PostgreSQL connection pool
   * @param kcAdmin - KcAdminClient instance (required)
   * @param cleanupQueue - BullMQ queue for scheduled deletions (required)
   */
  constructor(db: Pool, kcAdmin: KcAdminClient, cleanupQueue: CleanupQueue) {
    this.db = db;
    this.kcAdmin = kcAdmin;
    this.cleanupQueue = cleanupQueue;
  }

  /**
   * Authenticate with Keycloak using service account credentials.
   * Must be called before any user management operations.
   */
  async authenticate(): Promise<void> {
    await this.kcAdmin.auth({
      grantType: 'client_credentials',
      clientId: KeycloakConfig.HR_SERVICE_CLIENT_ID,
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
      // Step 1: Create user in Keycloak
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

      // Step 2: Assign department role (if applicable)
      await this.assignDepartmentRole(keycloakUserId, employeeData.department);

      // Step 3: Update employee record with Keycloak user ID
      await client.query(SQL.UPDATE_EMPLOYEE_KEYCLOAK_ID, [
        keycloakUserId,
        employeeData.id,
      ]);

      // Step 4: Write audit log
      // Params: user_email, action, resource, target_id, access_decision, access_justification
      await client.query(SQL.INSERT_AUDIT_LOG, [
        employeeData.email,
        AuditAction.USER_CREATED,
        'employee',
        employeeData.id,
        'GRANTED',
        JSON.stringify({
          keycloakUserId,
          department: employeeData.department,
        }),
      ]);

      return keycloakUserId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to provision Keycloak user: ${message}`);
    }
  }

  /**
   * Assign department-specific role to user.
   * Implements compensating transaction: deletes user if role assignment fails.
   */
  private async assignDepartmentRole(
    keycloakUserId: string,
    department: string
  ): Promise<void> {
    const roleName = DEPARTMENT_ROLE_MAP[department];
    if (!roleName) return;

    const roles = await this.kcAdmin.clients.listRoles({
      id: KeycloakConfig.MCP_GATEWAY_CLIENT_ID,
    });
    const departmentRole = roles.find((r) => r.name === roleName);
    if (!departmentRole) return;

    try {
      await this.kcAdmin.users.addClientRoleMappings({
        id: keycloakUserId,
        clientUniqueId: KeycloakConfig.MCP_GATEWAY_CLIENT_ID,
        roles: [{ id: departmentRole.id!, name: departmentRole.name! }],
      });
    } catch (roleError) {
      // COMPENSATING TRANSACTION: Delete Keycloak user if role assignment fails
      await this.kcAdmin.users.del({ id: keycloakUserId });
      throw roleError;
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
    // Step 1: Get and validate employee record
    const employee = await this.getEmployeeOrThrow(employeeId);
    const keycloakUserId = employee.keycloak_user_id;

    if (!keycloakUserId) {
      throw new Error(`Employee ${employeeId} has no Keycloak user`);
    }

    // Step 2: Capture permissions snapshot before disabling
    const roles = await this.kcAdmin.users.listClientRoleMappings({
      id: keycloakUserId,
      clientUniqueId: KeycloakConfig.MCP_GATEWAY_CLIENT_ID,
    });

    // Step 3: Get active sessions count
    const sessions = await this.kcAdmin.users.listSessions({ id: keycloakUserId });
    const sessionsRevoked = sessions.length;

    // Step 4: KILL SWITCH - Disable user immediately
    await this.kcAdmin.users.update({ id: keycloakUserId }, { enabled: false });

    // Step 5: Revoke all active sessions
    await this.kcAdmin.users.logout({ id: keycloakUserId });

    // Step 6: Write audit log with permissions snapshot
    const permissionsSnapshot = JSON.stringify({
      timestamp: new Date().toISOString(),
      roles: roles.map((r) => r.name),
      sessionsRevoked,
    });

    // Params: user_email, action, resource, target_id, access_decision, access_justification
    await this.db.query(SQL.INSERT_AUDIT_LOG_WITH_SNAPSHOT, [
      employee.email,
      AuditAction.USER_TERMINATED,
      'employee',
      employeeId,
      'GRANTED',
      permissionsSnapshot,
    ]);

    // Step 7: Update employee status
    await this.db.query(SQL.UPDATE_EMPLOYEE_TERMINATED, [employeeId]);

    // Step 8: Schedule deletion job for 72 hours later
    const scheduledDeletionAt = new Date(Date.now() + RETENTION_PERIOD_MS);

    await this.cleanupQueue.add(
      JobName.DELETE_USER_FINAL,
      { keycloakUserId, employeeId },
      { delay: RETENTION_PERIOD_MS }
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
    // Step 1: Check if user still exists in Keycloak
    const kcUser = await this.kcAdmin.users.findOne({ id: keycloakUserId });

    if (!kcUser) {
      // User already deleted (idempotent operation)
      return;
    }

    // Step 2: Safety check - Don't delete if user was re-enabled
    if (kcUser.enabled) {
      await this.logBlockedDeletion(employeeId, keycloakUserId, kcUser.email);
      throw new Error('Cannot delete enabled user');
    }

    // Step 3: Delete user from Keycloak
    await this.kcAdmin.users.del({ id: keycloakUserId });

    // Step 4: Update employee status
    await this.db.query(SQL.UPDATE_EMPLOYEE_DELETED, [employeeId]);

    // Step 5: Write audit log
    // Params: user_email, action, resource, target_id, access_decision
    await this.db.query(SQL.INSERT_AUDIT_LOG_SIMPLE, [
      kcUser.email || 'unknown',
      AuditAction.USER_DELETED,
      'employee',
      employeeId,
      'GRANTED',
    ]);
  }

  /**
   * Get employee by ID or throw if not found
   */
  private async getEmployeeOrThrow(
    employeeId: string
  ): Promise<{ id: string; email: string; keycloak_user_id: string | null }> {
    const result = await this.db.query(SQL.SELECT_EMPLOYEE_BY_ID, [employeeId]);

    if (result.rows.length === 0) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Log when deletion is blocked due to user re-enablement
   */
  private async logBlockedDeletion(
    employeeId: string,
    keycloakUserId: string,
    email?: string
  ): Promise<void> {
    // Params: user_email, action, resource, target_id, access_decision, access_justification
    await this.db.query(SQL.INSERT_AUDIT_LOG, [
      email || 'unknown',
      AuditAction.DELETION_BLOCKED,
      'employee',
      employeeId,
      'DENIED',
      JSON.stringify({
        reason: 'User was re-enabled after termination',
        keycloakUserId,
      }),
    ]);
  }

  // ============================================================================
  // Bulk Sync Operations
  // ============================================================================

  /**
   * Synchronize all active HR employees to Keycloak.
   *
   * This method provisions users who:
   * - Have status = 'active' in HR database
   * - Do NOT have a keycloak_user_id set (not yet provisioned)
   *
   * For each employee, it:
   * 1. Checks if user already exists in Keycloak by email
   * 2. Creates new Keycloak user if not found
   * 3. Assigns department role
   * 4. Updates employee record with keycloak_user_id
   *
   * This is idempotent - safe to run multiple times.
   *
   * @returns BulkSyncResult with counts of created, skipped, and errors
   */
  async syncAllEmployees(): Promise<BulkSyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let created = 0;
    let skipped = 0;

    // Log sync start
    // Params: user_email, action, resource, target_id, access_decision, access_justification
    await this.db.query(SQL.INSERT_AUDIT_LOG, [
      'system@identity-sync',
      AuditAction.BULK_SYNC_STARTED,
      'bulk_sync',
      null,
      'GRANTED',
      JSON.stringify({ timestamp: new Date().toISOString() }),
    ]);

    // Fetch all active employees without Keycloak ID
    const result = await this.db.query(SQL.SELECT_ALL_ACTIVE_EMPLOYEES);
    const employees: EmployeeData[] = result.rows;

    // Process each employee
    for (const employee of employees) {
      try {
        const wasCreated = await this.syncEmployee(employee);
        if (wasCreated) {
          created++;
        } else {
          skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          employeeId: employee.id,
          email: employee.email,
          error: message,
        });
      }
    }

    const duration = Date.now() - startTime;

    // Log sync completion
    // Params: user_email, action, resource, target_id, access_decision, access_justification
    await this.db.query(SQL.INSERT_AUDIT_LOG, [
      'system@identity-sync',
      AuditAction.BULK_SYNC_COMPLETED,
      'bulk_sync',
      null,
      errors.length === 0 ? 'GRANTED' : 'PARTIAL',
      JSON.stringify({
        totalEmployees: employees.length,
        created,
        skipped,
        errorCount: errors.length,
        duration,
      }),
    ]);

    return {
      success: errors.length === 0,
      totalEmployees: employees.length,
      created,
      skipped,
      errors,
      duration,
    };
  }

  /**
   * Sync a single employee to Keycloak.
   *
   * @param employee - Employee data to sync
   * @returns true if user was created, false if skipped (already exists)
   */
  private async syncEmployee(employee: EmployeeData): Promise<boolean> {
    // Check if user already exists in Keycloak by email
    const existingUsers = await this.kcAdmin.users.find({ email: employee.email });

    if (existingUsers.length > 0) {
      // User exists in Keycloak - update employee record with keycloak_user_id
      const keycloakUserId = existingUsers[0].id!;
      await this.db.query(SQL.UPDATE_EMPLOYEE_KEYCLOAK_ID, [
        keycloakUserId,
        employee.id,
      ]);
      return false; // Skipped, already exists
    }

    // User doesn't exist - create in transaction
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.createUserInKeycloak(employee, client);
      await client.query('COMMIT');
      return true; // Created
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get count of employees pending sync (active without keycloak_user_id)
   */
  async getPendingSyncCount(): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) FROM hr.employees WHERE UPPER(status) = 'ACTIVE' AND keycloak_user_id IS NULL`
    );
    return parseInt(result.rows[0].count, 10);
  }
}
