/**
 * PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * Thin wrapper around @tamshai/shared createPostgresClient.
 * Re-exports all database utilities for use by HR MCP tools.
 *
 * NOTE: Exports use explicit `any` type annotations on pg-dependent members
 * to avoid TS2742 portability errors. The underlying runtime types are fully
 * correct; this is a TypeScript limitation when @types/pg is installed in both
 * this package and @tamshai/shared (two separate copies in node_modules).
 */

import { createPostgresClient } from '@tamshai/shared';
import type { PostgresClient } from '@tamshai/shared';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const db: PostgresClient = createPostgresClient(logger);

/* eslint-disable @typescript-eslint/no-explicit-any */
export const pool: any = db.pool;
export const queryWithRLS: any = db.queryWithRLS;
export const queryWithoutRLS: any = db.queryWithoutRLS;
export const getClient: any = db.getClient;
/* eslint-enable @typescript-eslint/no-explicit-any */
export const checkConnection = db.checkConnection;
export const closePool = db.closePool;

// Re-export UserContext from shared for backward compatibility
export type { UserContext } from '@tamshai/shared';

export default pool;
