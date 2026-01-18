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
import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure random password.
 * Uses only alphanumeric characters to avoid shell/docker-compose issues.
 *
 * @param length Password length (default 20)
 * @returns Random alphanumeric password
 */
export function generateSecurePassword(length = 20): string {
  // Alphanumeric characters only (no special chars to avoid shell issues)
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // Excluding I, O (confusable)
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';   // Excluding i, l, o (confusable)
  const numbers = '23456789';                     // Excluding 0, 1 (confusable)
  const charset = uppercase + lowercase + numbers;

  // Generate cryptographically secure random bytes
  const bytes = randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }

  // Ensure at least one of each character type for password policy compliance
  // Replace first 3 chars to guarantee mix (still random)
  const guaranteedChars = [
    uppercase[randomBytes(1)[0] % uppercase.length],
    lowercase[randomBytes(1)[0] % lowercase.length],
    numbers[randomBytes(1)[0] % numbers.length],
  ];

  return guaranteedChars.join('') + password.slice(3);
}

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
 *
 * Note: All departments in hr-data.sql must have a mapping here, otherwise
 * employees in unmapped departments will have no department-specific roles
 * and can only access their own data via RLS.
 */
export const DEPARTMENT_ROLE_MAP: Record<string, string> = {
  // Primary department mappings (from hr.departments.code)
  HR: 'hr-read',
  FIN: 'finance-read',
  SALES: 'sales-read',
  SUPPORT: 'support-read',
  ENG: 'engineering-read',
  EXEC: 'executive', // Executive composite role (CEO, C-Suite)
  IT: 'it-read',
  MKT: 'marketing-read',
  OPS: 'operations-read',
  LEGAL: 'legal-read',
  // Legacy mappings for backwards compatibility with tests
  Finance: 'finance-read',
  Sales: 'sales-read',
  Support: 'support-read',
  Engineering: 'engineering-read',
};

/**
 * Email Domain Transformation
 *
 * HR database uses @tamshai.com as the canonical email domain (source of truth).
 * In development, emails are transformed to @tamshai.local to match the dev realm.
 *
 * Environment detection:
 * - ENVIRONMENT=dev or unset: Transform @tamshai.com → @tamshai.local
 * - ENVIRONMENT=stage or prod: No transformation (uses @tamshai.com)
 *
 * This allows a single source of truth for employee data while supporting
 * local development without DNS/email conflicts.
 */
export const EMAIL_DOMAIN_CONFIG = {
  DEV_DOMAIN: 'tamshai.local',
  PROD_DOMAIN: 'tamshai.com',
} as const;

/**
 * Transform email domain based on environment.
 *
 * @param email - Original email from HR database (e.g., alice@tamshai.com)
 * @returns Transformed email for target environment (e.g., alice@tamshai.local in dev)
 */
export function transformEmailForEnvironment(email: string): string {
  const environment = process.env.ENVIRONMENT || 'dev';

  // In stage/prod, keep emails as-is (@tamshai.com)
  if (environment === 'stage' || environment === 'prod') {
    return email;
  }

  // In dev, transform @tamshai.com to @tamshai.local
  if (email.endsWith(`@${EMAIL_DOMAIN_CONFIG.PROD_DOMAIN}`)) {
    return email.replace(
      `@${EMAIL_DOMAIN_CONFIG.PROD_DOMAIN}`,
      `@${EMAIL_DOMAIN_CONFIG.DEV_DOMAIN}`
    );
  }

  // Email doesn't match prod domain - return as-is
  return email;
}

/**
 * Transform email domain from Keycloak format to HR database format for lookups.
 *
 * This is the reverse of transformEmailForEnvironment(). When Keycloak users
 * have @tamshai.local emails (dev environment), we need to transform them
 * to @tamshai.com to look up records in the HR database.
 *
 * @param email - Email from Keycloak/user context (e.g., alice@tamshai.local in dev)
 * @returns Email for HR database lookup (e.g., alice@tamshai.com)
 */
export function transformEmailForDatabaseLookup(email: string): string {
  const environment = process.env.ENVIRONMENT || 'dev';

  // In stage/prod, emails are already @tamshai.com
  if (environment === 'stage' || environment === 'prod') {
    return email;
  }

  // In dev, transform @tamshai.local back to @tamshai.com for DB lookup
  if (email.endsWith(`@${EMAIL_DOMAIN_CONFIG.DEV_DOMAIN}`)) {
    return email.replace(
      `@${EMAIL_DOMAIN_CONFIG.DEV_DOMAIN}`,
      `@${EMAIL_DOMAIN_CONFIG.PROD_DOMAIN}`
    );
  }

  // Email doesn't match dev domain - return as-is
  return email;
}

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
  requiredActions?: string[];
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
/**
 * Keycloak client representation
 */
export interface KcClientRepresentation {
  id?: string;
  clientId?: string;
}

/**
 * Keycloak group representation
 */
export interface KcGroupRepresentation {
  id?: string;
  name?: string;
}

export interface KcAdminClient {
  users: {
    create(user: Partial<KcUserRepresentation>): Promise<{ id: string }>;
    update(query: { id: string }, user: Partial<KcUserRepresentation>): Promise<void>;
    del(query: { id: string }): Promise<void>;
    find(query: { email?: string; username?: string }): Promise<KcUserRepresentation[]>;
    findOne(query: { id: string }): Promise<KcUserRepresentation | null>;
    resetPassword(params: {
      id: string;
      credential: {
        type: string;
        value: string;
        temporary: boolean;
      };
    }): Promise<void>;
    addClientRoleMappings(params: {
      id: string;
      clientUniqueId: string;
      roles: KcRoleRepresentation[];
    }): Promise<void>;
    listClientRoleMappings(params: {
      id: string;
      clientUniqueId: string;
    }): Promise<KcRoleRepresentation[]>;
    addRealmRoleMappings(params: {
      id: string;
      roles: KcRoleRepresentation[];
    }): Promise<void>;
    listSessions(query: { id: string }): Promise<KcSessionRepresentation[]>;
    logout(query: { id: string }): Promise<void>;
    addToGroup(params: { id: string; groupId: string }): Promise<void>;
  };
  groups: {
    find(params?: { search?: string }): Promise<KcGroupRepresentation[]>;
  };
  clients: {
    find(query: { clientId: string }): Promise<KcClientRepresentation[]>;
    listRoles(query: { id: string }): Promise<KcRoleRepresentation[]>;
  };
  roles: {
    find(): Promise<KcRoleRepresentation[]>;
    findOneByName(query: { name: string }): Promise<KcRoleRepresentation | undefined>;
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
      // Generate username in firstname.lastname format (consistent with dev realm)
      // This allows users to log in with familiar usernames across environments
      const username = `${employeeData.firstName.toLowerCase()}.${employeeData.lastName.toLowerCase()}`;

      // Transform email domain based on environment
      // Dev: @tamshai.local (from HR data as-is)
      // Stage/Prod: @tamshai.com (transformed)
      const email = transformEmailForEnvironment(employeeData.email);

      // Step 1: Create user in Keycloak with required first-login actions
      const createResult = await this.kcAdmin.users.create({
        username: username,
        email: email,
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        enabled: true,
        emailVerified: false,
        attributes: {
          employeeId: [employeeData.id],
          department: [employeeData.department],
        },
        // Required actions for first login:
        // - UPDATE_PASSWORD: Change the temporary password
        // - CONFIGURE_TOTP: Set up authenticator app for MFA
        requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
      });

      keycloakUserId = createResult.id;

      // Step 2: Set temporary password (must be changed on first login)
      // Each environment uses its own password secret:
      //   - DEV_USER_PASSWORD (dev/CI)
      //   - STAGE_USER_PASSWORD (stage/VPS)
      //   - PROD_USER_PASSWORD (prod/GCP)
      // If not set, generate cryptographically secure random password
      const environment = (process.env.ENVIRONMENT || 'dev').toUpperCase();
      const envPasswordVar = `${environment}_USER_PASSWORD`;
      const tempPassword = process.env[envPasswordVar] || generateSecurePassword(20);
      await this.kcAdmin.users.resetPassword({
        id: keycloakUserId,
        credential: {
          type: 'password',
          value: tempPassword,
          temporary: true, // User must change on first login
        },
      });
      // Note: In production, password is not logged or stored. User receives
      // password via secure channel (email/IT onboarding) configured separately.

      // Step 3: Assign department role (if applicable)
      await this.assignDepartmentRole(keycloakUserId, employeeData.department);

      // Step 4: Add to All-Employees group (for self-access via RLS)
      await this.addToAllEmployeesGroup(keycloakUserId);

      // Step 5: Update employee record with Keycloak user ID
      await client.query(SQL.UPDATE_EMPLOYEE_KEYCLOAK_ID, [
        keycloakUserId,
        employeeData.id,
      ]);

      // Step 6: Write audit log
      // Params: user_email, action, resource, target_id, access_decision, access_justification
      await client.query(SQL.INSERT_AUDIT_LOG, [
        email, // Use transformed email for audit consistency
        AuditAction.USER_CREATED,
        'employee',
        employeeData.id,
        'GRANTED',
        JSON.stringify({
          keycloakUserId,
          department: employeeData.department,
          originalEmail: employeeData.email, // Keep original for reference
        }),
      ]);

      return keycloakUserId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to provision Keycloak user: ${message}`);
    }
  }

  /**
   * Add user to All-Employees group.
   * All employees should be in this group for self-access via RLS policies.
   * The group has the 'employee' realm role which grants base access.
   *
   * @param keycloakUserId - Keycloak user ID
   * @returns true if added, false if group not found
   */
  private async addToAllEmployeesGroup(keycloakUserId: string): Promise<boolean> {
    try {
      // Find the All-Employees group
      const groups = await this.kcAdmin.groups.find({ search: 'All-Employees' });
      const allEmployeesGroup = groups.find((g) => g.name === 'All-Employees');

      if (!allEmployeesGroup || !allEmployeesGroup.id) {
        console.log('[WARN] All-Employees group not found in Keycloak');
        return false;
      }

      // Add user to group
      await this.kcAdmin.users.addToGroup({
        id: keycloakUserId,
        groupId: allEmployeesGroup.id,
      });

      return true;
    } catch (error) {
      // 409 Conflict means user is already in the group - that's fine
      if (error instanceof Error && error.message.includes('409')) {
        return true;
      }
      console.log(`[WARN] Failed to add user to All-Employees group: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Assign department-specific role to user.
   * Uses realm roles (not client roles) as defined in realm-export.json.
   *
   * @param keycloakUserId - Keycloak user ID
   * @param department - Department code from HR database
   * @param deleteOnFailure - If true, delete user if role assignment fails (compensating transaction for new users)
   * @returns Role name that was assigned, or null if no role mapping exists for department
   */
  private async assignDepartmentRole(
    keycloakUserId: string,
    department: string,
    deleteOnFailure = true
  ): Promise<string | null> {
    const roleName = DEPARTMENT_ROLE_MAP[department];
    if (!roleName) return null;

    // Find the realm role by name
    const realmRole = await this.kcAdmin.roles.findOneByName({ name: roleName });
    if (!realmRole || !realmRole.id) {
      // Role not found - skip assignment (non-fatal for sync)
      console.log(`[WARN] Role '${roleName}' not found in Keycloak - skipping assignment`);
      return null;
    }

    try {
      await this.kcAdmin.users.addRealmRoleMappings({
        id: keycloakUserId,
        roles: [{ id: realmRole.id, name: realmRole.name! }],
      });
      return roleName;
    } catch (roleError) {
      if (deleteOnFailure) {
        // COMPENSATING TRANSACTION: Delete Keycloak user if role assignment fails (for new user creation only)
        await this.kcAdmin.users.del({ id: keycloakUserId });
      }
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
        // Extract detailed error information from Keycloak/Axios errors
        let message = 'Unknown error';
        if (error instanceof Error) {
          message = error.message;
          // Check for Axios error with response data (Keycloak errors)
          const axiosError = error as any;
          if (axiosError.response?.data) {
            const data = axiosError.response.data;
            message = data.errorMessage || data.error_description || data.error || data.message || message;
            // Log full error details for debugging
            console.error('Keycloak API error:', {
              status: axiosError.response.status,
              statusText: axiosError.response.statusText,
              data: axiosError.response.data,
              employeeEmail: employee.email,
            });
          }
        }
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
   * Handles both new users and existing users (from realm-export):
   * - New users: Creates in Keycloak with temporary password
   * - Existing users: Updates password to USER_PASSWORD (from GitHub secret)
   *
   * This ensures password rotation works for pre-existing users after
   * secrets are updated (e.g., after password exposure incidents).
   *
   * @param employee - Employee data to sync
   * @returns true if user was created, false if skipped (already exists)
   */
  private async syncEmployee(employee: EmployeeData): Promise<boolean> {
    // Transform email domain based on environment before checking Keycloak
    const email = transformEmailForEnvironment(employee.email);
    const username = `${employee.firstName.toLowerCase()}.${employee.lastName.toLowerCase()}`;

    // Check if user already exists in Keycloak by email
    console.log(`[DEBUG] Checking if user exists: ${email}`);
    let existingUsers: KcUserRepresentation[];
    try {
      existingUsers = (await this.kcAdmin.users.find({ email })) || [];
      console.log(`[DEBUG] Found ${existingUsers.length} existing users for ${email}`);
    } catch (findError) {
      console.error(`[DEBUG] users.find() failed for ${employee.email}:`, {
        error: findError,
        errorType: typeof findError,
        errorName: (findError as any)?.name,
        errorMessage: (findError as any)?.message,
        errorResponse: (findError as any)?.response?.data,
      });
      throw findError;
    }

    // If not found by email, also check by username (handles realm-export users
    // where email format may differ, e.g., bob.martinez@tamshai.com vs bob@tamshai.com)
    if (existingUsers.length === 0) {
      console.log(`[DEBUG] Not found by email, checking by username: ${username}`);
      try {
        existingUsers = (await this.kcAdmin.users.find({ username })) || [];
        console.log(`[DEBUG] Found ${existingUsers.length} existing users for username ${username}`);
      } catch (findError) {
        console.error(`[DEBUG] users.find(username) failed for ${username}:`, findError);
        throw findError;
      }
    }

    if (existingUsers.length > 0) {
      // User exists in Keycloak - update employee record with keycloak_user_id
      const keycloakUserId = existingUsers[0].id!;
      await this.db.query(SQL.UPDATE_EMPLOYEE_KEYCLOAK_ID, [
        keycloakUserId,
        employee.id,
      ]);

      // Reset password to environment-specific secret
      // This ensures password rotation works for pre-existing realm-export users
      // Each environment uses its own GitHub secret:
      //   - DEV_USER_PASSWORD (dev/CI)
      //   - STAGE_USER_PASSWORD (stage/VPS)
      //   - PROD_USER_PASSWORD (prod/GCP)
      const environment = (process.env.ENVIRONMENT || 'dev').toUpperCase();
      const envPasswordVar = `${environment}_USER_PASSWORD`;
      const password = process.env[envPasswordVar];

      if (password) {
        console.log(`[DEBUG] Resetting password for existing user: ${username} (using ${envPasswordVar})`);
        await this.kcAdmin.users.resetPassword({
          id: keycloakUserId,
          credential: {
            type: 'password',
            value: password,
            temporary: false, // Not temporary - user already exists and knows the password
          },
        });
        console.log(`[OK] Password updated for ${username}`);
      } else {
        // In prod, identity-sync is typically disabled (no MCP_HR_SERVICE_CLIENT_SECRET)
        // In dev/stage, password should be set - warn if missing
        if (environment === 'PROD') {
          console.log(`[INFO] Skipping password reset for ${username} (prod environment)`);
        } else {
          console.log(`[WARN] ${envPasswordVar} not set - skipping password reset for ${username}`);
        }
      }

      // Assign department role for existing users (may have been imported from realm-export without roles)
      // Pass deleteOnFailure=false - don't delete existing users if role assignment fails
      const assignedRole = await this.assignDepartmentRole(keycloakUserId, employee.department, false);
      if (assignedRole) {
        console.log(`[OK] Role '${assignedRole}' assigned to ${username}`);
      }

      // Add to All-Employees group (for self-access via RLS)
      const addedToGroup = await this.addToAllEmployeesGroup(keycloakUserId);
      if (addedToGroup) {
        console.log(`[OK] Added ${username} to All-Employees group`);
      }

      return false; // Skipped creation, but password and role were updated
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

  /**
   * Force reset passwords for ALL active employees with keycloak_user_id.
   *
   * Use this when:
   * - Password secrets have been rotated
   * - Users were synced with wrong password
   * - Emergency password reset is needed
   *
   * @returns Object with counts of reset, skipped, and errors
   */
  async forcePasswordReset(): Promise<{
    total: number;
    reset: number;
    skipped: number;
    errors: { employeeId: string; email: string; error: string }[];
  }> {
    const environment = (process.env.ENVIRONMENT || 'dev').toUpperCase();
    const envPasswordVar = `${environment}_USER_PASSWORD`;
    const password = process.env[envPasswordVar];

    if (!password) {
      throw new Error(`${envPasswordVar} not set - cannot reset passwords`);
    }

    console.log(`[INFO] Force password reset using ${envPasswordVar}`);

    // Get ALL active employees with keycloak_user_id (already synced)
    const result = await this.db.query(`
      SELECT e.id, e.email, e.first_name AS "firstName", e.last_name AS "lastName",
             e.keycloak_user_id AS "keycloakUserId",
             COALESCE(d.code, 'Unknown') AS department
      FROM hr.employees e
      LEFT JOIN hr.departments d ON e.department_id = d.id
      WHERE UPPER(e.status) = 'ACTIVE' AND e.keycloak_user_id IS NOT NULL
      ORDER BY e.id
    `);

    const employees = result.rows;
    const total = employees.length;
    let reset = 0;
    let skipped = 0;
    const errors: { employeeId: string; email: string; error: string }[] = [];

    console.log(`[INFO] Found ${total} active employees with Keycloak accounts`);

    for (const emp of employees) {
      const username = `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}`;
      try {
        // Reset password
        await this.kcAdmin.users.resetPassword({
          id: emp.keycloakUserId,
          credential: {
            type: 'password',
            value: password,
            temporary: false,
          },
        });
        console.log(`[OK] Password reset for ${username}`);

        // Assign department role (may have been missing from initial sync)
        // Pass deleteOnFailure=false - don't delete existing users if role assignment fails
        const assignedRole = await this.assignDepartmentRole(emp.keycloakUserId, emp.department, false);
        if (assignedRole) {
          console.log(`[OK] Role '${assignedRole}' assigned to ${username} (dept: ${emp.department})`);
        } else {
          console.log(`[INFO] No role mapping for ${username} (dept: ${emp.department})`);
        }

        // Add to All-Employees group (for self-access via RLS)
        const addedToGroup = await this.addToAllEmployeesGroup(emp.keycloakUserId);
        if (addedToGroup) {
          console.log(`[OK] Added ${username} to All-Employees group`);
        }

        reset++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[ERROR] Failed to reset password/role for ${username}: ${message}`);
        errors.push({
          employeeId: emp.id,
          email: emp.email,
          error: message,
        });
      }
    }

    console.log(`[INFO] Force password reset complete: ${reset} reset, ${skipped} skipped, ${errors.length} errors`);

    return { total, reset, skipped, errors };
  }
}
