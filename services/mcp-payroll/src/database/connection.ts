/**
 * Database Connection
 *
 * PostgreSQL connection pool with Row-Level Security (RLS) support.
 * Uses session variables within transactions for RLS policy evaluation.
 */
import { Pool, QueryResult, QueryResultRow } from 'pg';
import format from 'pg-format';
import { logger } from '../utils/logger';

// User context passed from MCP Gateway
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  departmentId?: string;
  managerId?: string;
}

// Create connection pool - all values from environment variables (required)
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

// Log pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

/**
 * Execute query with Row-Level Security context.
 * Sets session variables that RLS policies can read.
 */
export async function queryWithRLS<T extends QueryResultRow>(
  userContext: UserContext,
  queryText: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  const startTime = Date.now();
  try {
    await client.query('BEGIN');

    // OPTIMIZED: Combine SET commands into single set_config query
    // This reduces database round trips from 3-5 to 1
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
        userContext.managerId || ''
      ]
    );

    const result = await client.query<T>(queryText, values);
    await client.query('COMMIT');

    // Log query execution with timing
    logger.debug('Query executed with RLS', {
      userId: userContext.userId,
      rowCount: result.rowCount,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute query without RLS context.
 * Use for system queries that don't need user filtering.
 */
export async function queryWithoutRLS<T extends QueryResultRow>(
  queryText: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(queryText, values);
}

/**
 * Check if the database connection is healthy.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

/**
 * Close the connection pool.
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
