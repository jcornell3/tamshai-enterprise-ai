/**
 * PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * This module provides connection pooling and RLS session variable management
 * to enforce data access policies at the database level.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import format from 'pg-format';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT!, 10),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  min: 2,                           // Keep 2 warm connections
  max: 10,                          // Optimized: Reduced from 20
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,    // Fail faster
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', err);
});

pool.on('connect', () => {
  logger.info('New database connection established');
});

/**
 * User context for RLS enforcement
 */
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}

/**
 * Execute a query with RLS session variables set
 *
 * This function:
 * 1. Gets a client from the pool
 * 2. Sets RLS session variables (user_id, user_email, user_roles)
 * 3. Executes the query
 * 4. Releases the client back to the pool
 *
 * @param userContext - User context for RLS enforcement
 * @param queryText - SQL query to execute
 * @param values - Query parameters
 * @returns Query result
 */
export async function queryWithRLS<T extends Record<string, any> = any>(
  userContext: UserContext,
  queryText: string,
  values?: any[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Prepare RLS context values
    const rolesString = userContext.roles.join(',');
    const emailString = userContext.email || '';

    await client.query('BEGIN');

    // OPTIMIZED: Combine 3 SET commands into single set_config query
    // This reduces database round trips from 3 to 1
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_user_email', $2, true),
              set_config('app.current_user_roles', $3, true)`,
      [userContext.userId, emailString, rolesString]
    );

    // Execute the actual query
    const result = await client.query<T>(queryText, values);

    await client.query('COMMIT');

    // OPTIMIZED: Single INFO log per query (reduced from 6)
    logger.info('Query executed with RLS', {
      userId: userContext.userId,
      rowCount: result.rowCount,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Query with RLS failed', {
      error,
      userId: userContext.userId,
      query: queryText,  // Show full query for debugging
      values,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a query without RLS (for system operations only)
 *
 * WARNING: Use this only for operations that don't involve user-specific data.
 * Most queries should use queryWithRLS instead.
 */
export async function queryWithoutRLS<T extends Record<string, any> = any>(
  queryText: string,
  values?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(queryText, values);
}

/**
 * Get a raw client from the pool (for transactions)
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Check database connection health
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

/**
 * Close all database connections (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database connection pool closed');
}

export default pool;
