/**
 * Typed mock factory for pg (PostgreSQL client)
 *
 * Provides type-safe mocks for Pool and PoolClient.
 */

import type { QueryResult, QueryResultRow } from 'pg';

/**
 * Mock query result
 */
export interface MockQueryResult<T extends QueryResultRow = QueryResultRow>
  extends QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * Typed mock for PoolClient
 */
export interface MockPoolClient {
  query: jest.Mock<Promise<MockQueryResult>, [string, unknown[]?]>;
  release: jest.Mock<void, []>;
}

/**
 * Typed mock for Pool
 */
export interface MockPool {
  query: jest.Mock<Promise<MockQueryResult>, [string, unknown[]?]>;
  connect: jest.Mock<Promise<MockPoolClient>, []>;
  end: jest.Mock<Promise<void>, []>;
}

/**
 * Create a default mock query result
 *
 * @param rows - Rows to return
 * @returns Mock query result
 */
export function createMockQueryResult<T extends QueryResultRow = QueryResultRow>(
  rows: T[] = []
): MockQueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

/**
 * Factory function to create a typed PoolClient mock
 *
 * @returns Fresh mock PoolClient instance
 */
export function createMockPoolClient(): MockPoolClient {
  return {
    query: jest.fn().mockResolvedValue(createMockQueryResult()),
    release: jest.fn(),
  };
}

/**
 * Factory function to create a typed Pool mock
 *
 * @param mockClient - Optional pre-configured mock client
 * @returns Fresh mock Pool instance
 */
export function createMockPool(mockClient?: MockPoolClient): MockPool {
  const client = mockClient || createMockPoolClient();
  return {
    query: jest.fn().mockResolvedValue(createMockQueryResult()),
    connect: jest.fn().mockResolvedValue(client),
    end: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Reset all mocks in a MockPool instance
 *
 * @param pool - The mock pool to reset
 * @param client - Optional mock client to also reset
 */
export function resetMockPool(pool: MockPool, client?: MockPoolClient): void {
  pool.query.mockReset();
  pool.connect.mockReset();
  pool.end.mockReset();

  if (client) {
    client.query.mockReset();
    client.release.mockReset();
  }
}

/**
 * Create a mock employee record
 *
 * @param overrides - Properties to override defaults
 * @returns Mock employee row
 */
export function createMockEmployee(
  overrides: Partial<{
    id: string;
    name: string;
    email: string;
    department: string;
    role: string;
    manager_id: string | null;
    status: 'active' | 'terminated' | 'deleted';
    terminated_at: Date | null;
    keycloak_user_id: string | null;
    created_at: Date;
  }> = {}
): Record<string, unknown> {
  return {
    id: `emp-${Date.now()}`,
    name: 'Test Employee',
    email: 'test@tamshai.com',
    department: 'HR',
    role: 'Analyst',
    manager_id: null,
    status: 'active',
    terminated_at: null,
    keycloak_user_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock audit log record
 *
 * @param action - The action type
 * @param overrides - Properties to override defaults
 * @returns Mock audit log row
 */
export function createMockAuditLog(
  action: 'USER_CREATED' | 'USER_TERMINATED' | 'USER_DELETED' | 'DELETION_BLOCKED' | 'ROLE_CHANGED',
  overrides: Partial<{
    id: string;
    employee_id: string;
    keycloak_user_id: string | null;
    permissions_snapshot: Record<string, unknown> | null;
    details: Record<string, unknown> | null;
    created_at: Date;
    created_by: string;
  }> = {}
): Record<string, unknown> {
  return {
    id: `audit-${Date.now()}`,
    employee_id: 'emp-123',
    action,
    keycloak_user_id: 'kc-user-123',
    permissions_snapshot: null,
    details: null,
    created_at: new Date(),
    created_by: 'system',
    ...overrides,
  };
}
