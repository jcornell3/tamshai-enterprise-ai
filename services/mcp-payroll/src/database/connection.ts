/**
 * PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * Thin wrapper around @tamshai/shared createPostgresClient.
 * Re-exports all database utilities for use by Payroll MCP tools.
 */

import { createPostgresClient } from '@tamshai/shared';
import { logger } from '../utils/logger';

const db = createPostgresClient(logger);

export const { pool, queryWithRLS, queryWithoutRLS, getClient, checkConnection, closePool } = db;

// Re-export UserContext from shared for backward compatibility
export type { UserContext } from '@tamshai/shared';
