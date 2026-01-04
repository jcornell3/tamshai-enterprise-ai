/**
 * Integration Test Setup
 *
 * Sets up database connections and test utilities for integration tests.
 * Requires running PostgreSQL and other services.
 */

import { Client, Pool } from 'pg';

// Test environment configuration
process.env.NODE_ENV = 'test';

// Database connection settings from environment or defaults
// IMPORTANT: Use tamshai_app user (not tamshai) to enforce RLS policies
// The tamshai user has BYPASSRLS for sync operations, but tests need RLS enforced
const DB_CONFIG_HR = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'tamshai_hr',
  user: process.env.POSTGRES_USER || 'tamshai_app',
  password: process.env.POSTGRES_PASSWORD || 'changeme',
};

const DB_CONFIG_FINANCE = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: 'tamshai_finance',
  user: process.env.POSTGRES_USER || 'tamshai_app',
  password: process.env.POSTGRES_PASSWORD || 'changeme',
};

// Default config - HR database (used as default for legacy compatibility)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DB_CONFIG = DB_CONFIG_HR;

// Connection pools for different test users
let adminPool: Pool | null = null;
let adminPoolFinance: Pool | null = null;

/**
 * Get admin database connection pool for HR database
 */
export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool(DB_CONFIG_HR);
  }
  return adminPool;
}

/**
 * Get admin database connection pool for Finance database
 */
export function getAdminPoolFinance(): Pool {
  if (!adminPoolFinance) {
    adminPoolFinance = new Pool(DB_CONFIG_FINANCE);
  }
  return adminPoolFinance;
}

// Map userId to email for RLS policy lookups
const USER_EMAIL_MAP: Record<string, string> = {
  'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e': 'frank@tamshai.local',
  'e1000000-0000-0000-0000-000000000052': 'marcus.j@tamshai.local',
  'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d': 'nina.p@tamshai.local',
  'f104eddc-21ab-457c-a254-78051ad7ad67': 'alice@tamshai.local',
  '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1': 'bob@tamshai.local',
  'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b': 'eve@tamshai.local',
  'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c': 'carol@tamshai.local',
};

/**
 * Create a database client with specific user context
 * Simulates RLS by setting session variables
 * @param database - 'hr' or 'finance' to select database (defaults to 'hr')
 */
export async function createUserClient(
  userId: string,
  roles: string[],
  department?: string,
  email?: string,
  database: 'hr' | 'finance' = 'hr'
): Promise<Client> {
  const config = database === 'finance' ? DB_CONFIG_FINANCE : DB_CONFIG_HR;
  const client = new Client(config);
  await client.connect();

  // Look up email from userId if not provided
  const userEmail = email || USER_EMAIL_MAP[userId] || '';

  // Set session variables that RLS policies will check
  await client.query(`SET app.current_user_id = $1`, [userId]);
  await client.query(`SET app.current_user_roles = $1`, [roles.join(',')]);
  if (department) {
    await client.query(`SET app.current_user_department = $1`, [department]);
  }
  if (userEmail) {
    await client.query(`SET app.current_user_email = $1`, [userEmail]);
  }

  return client;
}

/**
 * Create a database client for finance database with specific user context
 * Convenience wrapper for createUserClient with database='finance'
 */
export async function createFinanceUserClient(
  userId: string,
  roles: string[],
  department?: string,
  email?: string
): Promise<Client> {
  return createUserClient(userId, roles, department, email, 'finance');
}

/**
 * Test user configurations matching keycloak test users and actual database records
 * Employee IDs and emails must match hr-data.sql for RLS policies to work correctly
 */
export const TEST_USERS = {
  // Intern - lowest privilege (self-only access)
  // Frank Davis: IT Intern
  intern: {
    userId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e',
    username: 'frank.davis',
    email: 'frank@tamshai.local',
    roles: ['user'],
    department: 'IT',
    employeeId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e',
  },
  // Regular employee
  // Marcus Johnson: Software Engineer (reports to Nina Patel)
  employee: {
    userId: 'e1000000-0000-0000-0000-000000000052',
    username: 'marcus.johnson',
    email: 'marcus.j@tamshai.local',
    roles: ['user'],
    department: 'Engineering',
    employeeId: 'e1000000-0000-0000-0000-000000000052',
  },
  // Manager - can see direct reports
  // Nina Patel: Engineering Manager (has Marcus, Sophia, Tyler, etc. as reports)
  manager: {
    userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
    username: 'nina.patel',
    email: 'nina.p@tamshai.local',
    roles: ['manager'],
    department: 'Engineering',
    employeeId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
  },
  // HR Read - can see all employees
  // Alice Chen: VP of Human Resources
  hrRead: {
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    username: 'alice.chen',
    email: 'alice@tamshai.local',
    roles: ['hr-read'],
    department: 'HR',
    employeeId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
  },
  // HR Write - full HR access
  // Alice Chen: VP of Human Resources (same person, different role combo)
  hrWrite: {
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    username: 'alice.chen',
    email: 'alice@tamshai.local',
    roles: ['hr-read', 'hr-write'],
    department: 'HR',
    employeeId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
  },
  // Finance Read - can see finance data
  // Bob Martinez: Finance Director
  financeRead: {
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    username: 'bob.martinez',
    email: 'bob@tamshai.local',
    roles: ['finance-read'],
    department: 'FIN',  // Use department code as in finance RLS
    employeeId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
  },
  // Finance Write - full finance access
  // Bob Martinez: Finance Director (same person, different role combo)
  financeWrite: {
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    username: 'bob.martinez',
    email: 'bob@tamshai.local',
    roles: ['finance-read', 'finance-write'],
    department: 'FIN',
    employeeId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
  },
  // Executive - cross-department access
  // Eve Thompson: CEO
  executive: {
    userId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    username: 'eve.thompson',
    email: 'eve@tamshai.local',
    roles: ['executive'],
    department: 'Executive',
    employeeId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
  },
  // Sales - for cross-schema tests
  // Carol Johnson: VP of Sales
  sales: {
    userId: 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c',
    username: 'carol.johnson',
    email: 'carol@tamshai.local',
    roles: ['sales-read', 'sales-write'],
    department: 'Sales',
    employeeId: 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c',
  },
};

// Increase timeout for slow database operations
jest.setTimeout(30000);

// Global cleanup
afterAll(async () => {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
  if (adminPoolFinance) {
    await adminPoolFinance.end();
    adminPoolFinance = null;
  }
});
