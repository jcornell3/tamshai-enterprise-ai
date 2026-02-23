/**
 * Shared PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * Factory function that creates a connection pool and provides RLS-aware query helpers.
 * Used by all PostgreSQL MCP services (HR, Finance, Payroll, Tax).
 *
 * Environment variables:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 *
 * SSL Configuration (H3 Phase 1):
 *   POSTGRES_SSL=true|require     - Enable SSL (true/require enables, false/prefer disables)
 *   POSTGRES_SSL_CA               - CA certificate content or path (optional)
 *   POSTGRES_SSL_REJECT_UNAUTHORIZED - Reject untrusted certs (default: true in prod)
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { readFileSync } from 'fs';
import { UserContext } from '../middleware/authorize';

/**
 * Minimal logger interface accepted by createPostgresClient.
 * Compatible with winston, pino, console, or any logger with these methods.
 */
export interface PostgresLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Return type of createPostgresClient factory.
 */
export interface PostgresClient {
  /** The underlying connection pool */
  pool: Pool;
  /** Execute a query with RLS session variables set within a transaction */
  queryWithRLS: <T extends QueryResultRow = QueryResultRow>(
    userContext: UserContext,
    queryText: string,
    values?: unknown[]
  ) => Promise<QueryResult<T>>;
  /** Execute a query without RLS context (system operations only) */
  queryWithoutRLS: <T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[]
  ) => Promise<QueryResult<T>>;
  /** Get a raw PoolClient for manual transaction management */
  getClient: () => Promise<PoolClient>;
  /** Health check - returns true if database is reachable */
  checkConnection: () => Promise<boolean>;
  /** Gracefully close all connections in the pool */
  closePool: () => Promise<void>;
}

/** Default no-op logger used when no logger is provided */
const noopLogger: PostgresLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * SSL Configuration for PostgreSQL connections (H3 Phase 1)
 *
 * @returns SSL config object for pg.Pool, or false if SSL disabled
 */
function getSSLConfig(): false | { rejectUnauthorized: boolean; ca?: string } {
  const sslMode = process.env.POSTGRES_SSL?.toLowerCase();

  // Check if SSL is explicitly enabled
  // - 'true' or 'require' enables SSL
  // - 'false', 'prefer', empty, or undefined disables SSL
  const sslEnabled = sslMode === 'true' || sslMode === 'require';

  if (!sslEnabled) {
    return false;
  }

  // In production, reject unauthorized certificates by default
  const rejectUnauthorized =
    process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED?.toLowerCase() !== 'false' &&
    process.env.NODE_ENV === 'production';

  const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized,
  };

  // Load CA certificate if provided
  const caCert = process.env.POSTGRES_SSL_CA;
  if (caCert) {
    // Check if it's a file path or raw certificate content
    if (caCert.startsWith('/') || caCert.includes(':\\')) {
      // It's a file path
      try {
        sslConfig.ca = readFileSync(caCert, 'utf-8');
      } catch {
        // If file read fails, assume it's the certificate content
        sslConfig.ca = caCert;
      }
    } else if (caCert.includes('-----BEGIN')) {
      // It's raw certificate content
      sslConfig.ca = caCert;
    }
  }

  return sslConfig;
}

/**
 * Create a PostgreSQL client with RLS support.
 *
 * @param logger - Optional logger instance (defaults to no-op)
 * @returns PostgresClient with pool, query helpers, and lifecycle methods
 *
 * @example
 * ```typescript
 * import { createPostgresClient } from '@tamshai/shared';
 * import { logger } from '../utils/logger';
 *
 * const db = createPostgresClient(logger);
 * export const { pool, queryWithRLS, queryWithoutRLS, getClient, checkConnection, closePool } = db;
 * ```
 */
export function createPostgresClient(logger?: PostgresLogger): PostgresClient {
  const log = logger || noopLogger;

  // Get SSL configuration (H3 Phase 1)
  const sslConfig = getSSLConfig();
  if (sslConfig) {
    log.info('PostgreSQL SSL enabled', {
      rejectUnauthorized: String(sslConfig.rejectUnauthorized),
      hasCACert: String(!!sslConfig.ca),
    });
  }

  const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT!, 10),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: sslConfig,
  });

  pool.on('error', (err) => {
    log.error('Unexpected database pool error', { error: err.message });
  });

  pool.on('connect', () => {
    log.info('New database connection established');
  });

  /**
   * Execute a query with Row-Level Security context.
   * Sets 5 session variables (userId, email, roles, departmentId, managerId)
   * within a transaction so RLS policies can read them.
   */
  async function queryWithRLS<T extends QueryResultRow = QueryResultRow>(
    userContext: UserContext,
    queryText: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    const client = await pool.connect();
    const startTime = Date.now();
    try {
      await client.query('BEGIN');

      // Set all 5 RLS session variables in a single round trip
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_user_email', $2, true),
                set_config('app.current_user_roles', $3, true),
                set_config('app.current_department_id', $4, true),
                set_config('app.current_manager_id', $5, true)`,
        [
          userContext.userId,
          userContext.email || '',
          userContext.roles.join(','),
          userContext.departmentId || '',
          userContext.managerId || '',
        ]
      );

      const result = await client.query<T>(queryText, values);
      await client.query('COMMIT');

      log.debug('Query executed with RLS', {
        userId: userContext.userId,
        rowCount: result.rowCount as unknown as string,
        durationMs: String(Date.now() - startTime),
      });

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Query with RLS failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: userContext.userId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a query without RLS context.
   * Use only for system operations that don't involve user-specific data.
   */
  async function queryWithoutRLS<T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return pool.query<T>(queryText, values);
  }

  /**
   * Get a raw client from the pool for manual transaction management.
   */
  async function getClient(): Promise<PoolClient> {
    return pool.connect();
  }

  /**
   * Check database connection health.
   */
  async function checkConnection(): Promise<boolean> {
    try {
      const result = await pool.query('SELECT 1 as ok');
      return result.rows[0]?.ok === 1;
    } catch (error) {
      log.error('Database connection check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Close all connections in the pool (for graceful shutdown).
   */
  async function closePool(): Promise<void> {
    await pool.end();
    log.info('Database connection pool closed');
  }

  return {
    pool,
    queryWithRLS,
    queryWithoutRLS,
    getClient,
    checkConnection,
    closePool,
  };
}
