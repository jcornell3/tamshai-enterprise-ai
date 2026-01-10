/**
 * Audit Logger Service
 *
 * Logs all admin portal actions to PostgreSQL admin.user_management_audit table
 *
 * Features:
 * - Immutable audit trail (append-only)
 * - SOC 2 / SOX compliance (7-year retention)
 * - Full context capture (who, what, when, where, why)
 *
 * Usage:
 *   await auditLogger.log({
 *     adminUserId: req.user.sub,
 *     adminUsername: req.user.preferred_username,
 *     actionType: 'create_user',
 *     targetUserId: newUser.id,
 *     targetUsername: newUser.username,
 *     details: { userType: 'contractor', roles: ['sales-read'] },
 *     ipAddress: req.ip,
 *     userAgent: req.headers['user-agent'],
 *   });
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * Audit log entry data
 */
export interface AuditLogEntry {
  // Who performed the action
  adminUserId: string;
  adminUsername: string;
  adminEmail?: string;

  // What action was taken
  actionType:
    | 'create_user'
    | 'update_user'
    | 'delete_user'
    | 'disable_user'
    | 'enable_user'
    | 'assign_role'
    | 'revoke_role'
    | 'reset_password'
    | 'create_service_account'
    | 'rotate_secret'
    | 'delete_service_account'
    | 'create_role'
    | 'delete_role';

  // Who/what was affected
  targetUserId?: string;
  targetUsername?: string;
  targetEmail?: string;
  roleName?: string;

  // Additional context
  details?: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  // Security metadata
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

class AuditLogger {
  private pool: Pool | null = null;
  private isInitialized = false;

  /**
   * Lazy initialization of database pool
   * Only connects when first needed, not at module load time
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.pool) {
      return;
    }

    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'tamshai_hr',
      user: process.env.POSTGRES_USER || 'tamshai',
      password: process.env.POSTGRES_PASSWORD,
    });

    // Test connection
    try {
      const result = await this.pool.query('SELECT NOW()');
      logger.info('Audit logger connected to PostgreSQL', {
        timestamp: result.rows[0].now,
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to connect audit logger to PostgreSQL', { error });
      throw error;
    }
  }

  /**
   * Log an admin action to the audit trail
   *
   * @param entry - Audit log entry data
   * @returns Audit log entry ID (UUID)
   */
  async log(entry: AuditLogEntry): Promise<string> {
    await this.ensureInitialized();

    const query = `
      INSERT INTO admin.user_management_audit (
        admin_user_id,
        admin_username,
        admin_email,
        action_type,
        target_user_id,
        target_username,
        target_email,
        role_name,
        details,
        changes,
        ip_address,
        user_agent,
        session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    const values = [
      entry.adminUserId,
      entry.adminUsername,
      entry.adminEmail || null,
      entry.actionType,
      entry.targetUserId || null,
      entry.targetUsername || null,
      entry.targetEmail || null,
      entry.roleName || null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.sessionId || null,
    ];

    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      const result = await this.pool.query(query, values);
      const auditId = result.rows[0].id;

      logger.info('Audit log entry created', {
        auditId,
        actionType: entry.actionType,
        adminUsername: entry.adminUsername,
        targetUsername: entry.targetUsername,
      });

      return auditId;
    } catch (error) {
      logger.error('Failed to create audit log entry', {
        error,
        entry: {
          ...entry,
          // Redact sensitive fields from logs
          details: entry.details ? '[REDACTED]' : undefined,
          changes: entry.changes ? '[REDACTED]' : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * Query audit log entries
   *
   * @param filters - Query filters
   * @returns Array of audit log entries
   */
  async query(filters: {
    adminUserId?: string;
    targetUserId?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    await this.ensureInitialized();

    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (filters.adminUserId) {
      paramCount++;
      conditions.push(`admin_user_id = $${paramCount}`);
      values.push(filters.adminUserId);
    }

    if (filters.targetUserId) {
      paramCount++;
      conditions.push(`target_user_id = $${paramCount}`);
      values.push(filters.targetUserId);
    }

    if (filters.actionType) {
      paramCount++;
      conditions.push(`action_type = $${paramCount}`);
      values.push(filters.actionType);
    }

    if (filters.startDate) {
      paramCount++;
      conditions.push(`timestamp >= $${paramCount}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      paramCount++;
      conditions.push(`timestamp <= $${paramCount}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const query = `
      SELECT
        id,
        timestamp,
        admin_user_id,
        admin_username,
        admin_email,
        action_type,
        target_user_id,
        target_username,
        target_email,
        role_name,
        details,
        changes,
        ip_address,
        user_agent,
        session_id
      FROM admin.user_management_audit
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to query audit log', { error, filters });
      throw error;
    }
  }

  /**
   * Cleanup (call on server shutdown)
   */
  async cleanup(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Audit logger connection pool closed');
      this.pool = null;
      this.isInitialized = false;
    }
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();
