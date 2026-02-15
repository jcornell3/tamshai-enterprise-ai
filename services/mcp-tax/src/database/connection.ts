/**
 * PostgreSQL Database Connection with Row Level Security (RLS) Support
 *
 * Thin wrapper around @tamshai/shared createPostgresClient.
 * Re-exports all database utilities for use by Tax MCP tools.
 *
 * NOTE: Exports use explicit type annotations from the service's own @types/pg
 * to avoid TS2742 portability errors. Without these, TypeScript would infer types
 * from @tamshai/shared/node_modules/@types/pg (a different copy), which it can't
 * reference from this package.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { createPostgresClient } from '@tamshai/shared';
import type { PostgresClient, UserContext } from '@tamshai/shared';
import { logger } from '../utils/logger';

const db: PostgresClient = createPostgresClient(logger);

// Re-export with explicit types from this package's @types/pg to avoid TS2742
export const pool: Pool = db.pool as Pool;
export const queryWithRLS: <T extends QueryResultRow = QueryResultRow>(
  userContext: UserContext,
  queryText: string,
  values?: unknown[]
) => Promise<QueryResult<T>> = db.queryWithRLS;
export const queryWithoutRLS: <T extends QueryResultRow = QueryResultRow>(
  queryText: string,
  values?: unknown[]
) => Promise<QueryResult<T>> = db.queryWithoutRLS;
export const getClient: () => Promise<PoolClient> = db.getClient;
export const checkConnection = db.checkConnection;
export const closePool = db.closePool;

export type { UserContext } from '@tamshai/shared';
