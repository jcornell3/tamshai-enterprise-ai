/**
 * Test Utilities for MCP-Finance Service
 *
 * Provides mock factories and test data for unit testing.
 * Follows MCP-HR reference implementation pattern.
 */

import { UserContext } from '../database/connection';

/**
 * Create a mock database query function
 */
export function createMockQueryWithRLS() {
  return jest.fn();
}

/**
 * Create a mock user context for testing
 */
export function createMockUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'test-user-id',
    username: 'test.user',
    email: 'test@tamshai.com',
    roles: ['finance-read'],
    ...overrides,
  };
}

/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Test data: Sample budgets
 */
export const TEST_BUDGETS = [
  {
    department_code: 'HR',
    fiscal_year: 2024,
    category_name: 'Personnel',
    category_type: 'operational',
    budgeted_amount: 500000,
    actual_amount: 350000,
    forecast_amount: 480000,
    utilization_pct: 70,
    remaining_amount: 150000,
    status: 'approved',
  },
  {
    department_code: 'ENGINEERING',
    fiscal_year: 2024,
    category_name: 'Equipment',
    category_type: 'capital',
    budgeted_amount: 200000,
    actual_amount: 180000,
    forecast_amount: 195000,
    utilization_pct: 90,
    remaining_amount: 20000,
    status: 'approved',
  },
];

/**
 * Test data: Sample invoices
 */
export const TEST_INVOICES = [
  {
    id: 'inv-001',
    vendor_name: 'Acme Corp',
    amount: 15000,
    status: 'pending',
    due_date: '2024-03-15',
    created_at: '2024-02-15',
  },
  {
    id: 'inv-002',
    vendor_name: 'Tech Solutions',
    amount: 8500,
    status: 'approved',
    due_date: '2024-03-20',
    created_at: '2024-02-18',
  },
];

/**
 * Test data: Sample expense reports
 */
export const TEST_EXPENSE_REPORTS = [
  {
    id: 'exp-001',
    employee_name: 'Alice Chen',
    total_amount: 1250.75,
    status: 'submitted',
    submitted_date: '2024-02-20',
    category: 'Travel',
  },
  {
    id: 'exp-002',
    employee_name: 'Bob Martinez',
    total_amount: 450.00,
    status: 'approved',
    submitted_date: '2024-02-18',
    category: 'Office Supplies',
  },
];

/**
 * Create mock database result compatible with pg QueryResult<T>
 */
export function createMockDbResult<T>(rows: T[], rowCount?: number) {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}
