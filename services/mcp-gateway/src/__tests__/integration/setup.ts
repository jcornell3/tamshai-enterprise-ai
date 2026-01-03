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
const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'tamshai_hr',
  user: process.env.POSTGRES_USER || 'tamshai',
  password: process.env.POSTGRES_PASSWORD || 'changeme',
};

// Connection pools for different test users
let adminPool: Pool | null = null;

/**
 * Get admin database connection pool
 */
export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool(DB_CONFIG);
  }
  return adminPool;
}

/**
 * Create a database client with specific user context
 * Simulates RLS by setting session variables
 */
export async function createUserClient(
  userId: string,
  roles: string[],
  department?: string
): Promise<Client> {
  const client = new Client(DB_CONFIG);
  await client.connect();

  // Set session variables that RLS policies will check
  await client.query(`SET app.current_user_id = $1`, [userId]);
  await client.query(`SET app.current_user_roles = $1`, [roles.join(',')]);
  if (department) {
    await client.query(`SET app.current_user_department = $1`, [department]);
  }

  return client;
}

/**
 * Test user configurations matching keycloak test users
 */
export const TEST_USERS = {
  // Intern - lowest privilege (self-only access)
  intern: {
    userId: 'intern-001',
    username: 'frank.davis',
    roles: ['user'],
    department: 'IT',
    employeeId: 'emp-intern-001',
  },
  // Regular employee
  employee: {
    userId: 'emp-001',
    username: 'marcus.johnson',
    roles: ['user'],
    department: 'Engineering',
    employeeId: 'emp-001',
  },
  // Manager - can see direct reports
  manager: {
    userId: 'mgr-001',
    username: 'nina.patel',
    roles: ['manager'],
    department: 'Engineering',
    employeeId: 'mgr-001',
  },
  // HR Read - can see all employees
  hrRead: {
    userId: 'hr-read-001',
    username: 'alice.chen',
    roles: ['hr-read'],
    department: 'HR',
    employeeId: 'hr-001',
  },
  // HR Write - full HR access
  hrWrite: {
    userId: 'hr-write-001',
    username: 'alice.chen',
    roles: ['hr-read', 'hr-write'],
    department: 'HR',
    employeeId: 'hr-001',
  },
  // Finance Read - can see finance data
  financeRead: {
    userId: 'fin-read-001',
    username: 'bob.martinez',
    roles: ['finance-read'],
    department: 'Finance',
    employeeId: 'fin-001',
  },
  // Finance Write - full finance access
  financeWrite: {
    userId: 'fin-write-001',
    username: 'bob.martinez',
    roles: ['finance-read', 'finance-write'],
    department: 'Finance',
    employeeId: 'fin-001',
  },
  // Executive - cross-department access
  executive: {
    userId: 'exec-001',
    username: 'eve.thompson',
    roles: ['executive'],
    department: 'Executive',
    employeeId: 'exec-001',
  },
  // Sales - for cross-schema tests
  sales: {
    userId: 'sales-001',
    username: 'carol.johnson',
    roles: ['sales-read', 'sales-write'],
    department: 'Sales',
    employeeId: 'sales-001',
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
});
