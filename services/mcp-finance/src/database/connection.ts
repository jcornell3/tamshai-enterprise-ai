/**
 * PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * Thin wrapper around @tamshai/shared createPostgresClient.
 * Re-exports all database utilities for use by Finance MCP tools.
 */

import { createPostgresClient } from '@tamshai/shared';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const db = createPostgresClient(logger);

export const { pool, queryWithRLS, queryWithoutRLS, getClient, checkConnection, closePool } = db;

// Re-export UserContext from shared for backward compatibility
export type { UserContext } from '@tamshai/shared';

export default pool;
