/**
 * Integration Test Setup
 *
 * Sets up database connections and test utilities for integration tests.
 * Requires running PostgreSQL and other services.
 *
 * Authentication:
 * - User tokens acquired via token exchange (getImpersonatedToken) - no ROPC
 * - Admin tokens use admin-cli client credentials (KEYCLOAK_ADMIN_CLIENT_SECRET)
 *   with ROPC fallback (KEYCLOAK_ADMIN_PASSWORD) for environments not yet configured
 *
 * TOTP Handling:
 * - Token exchange bypasses OTP requirement (service account impersonation)
 * - Does NOT delete any user credentials
 * - Temporarily removes CONFIGURE_TOTP required action (if present)
 * - Restores required actions after tests
 */

import { Client, Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';
import {
  getKeycloakAdminToken,
  getUserId as sharedGetUserId,
  getUser as sharedGetUser,
  getUserCredentials as sharedGetUserCredentials,
  updateUserRequiredActions as sharedUpdateUserRequiredActions,
  prepareTestUsers as sharedPrepareTestUsers,
  restoreTestUsers as sharedRestoreTestUsers,
  type KeycloakAdminConfig,
  type SavedUserState,
} from '../../../../../tests/shared/auth/keycloak-admin';

// Test environment configuration
process.env.NODE_ENV = 'test';

// Keycloak configuration for TOTP handling
// Note: KEYCLOAK_URL INCLUDES /auth prefix (set by jest.integration.config.js)
const KEYCLOAK_CONFIG = {
  url: process.env.KEYCLOAK_URL || `http://127.0.0.1:${process.env.DEV_KEYCLOAK}/auth`,
  realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,  // Required - no fallback
};

// Database connection settings from environment or defaults
// IMPORTANT: Use tamshai_app user (not tamshai) to enforce RLS policies
// The tamshai user has BYPASSRLS for sync operations, but tests need RLS enforced
// All configuration from environment variables - set via GitHub Variables/Secrets
//
// Password for tamshai_app user - REQUIRED, no fallback
// Note: POSTGRES_PASSWORD is the postgres superuser password, NOT tamshai_app
const DB_CONFIG_HR = {
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DEV_POSTGRES || ''),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.TAMSHAI_APP_PASSWORD,  // Required - no fallback
};

const DB_CONFIG_FINANCE = {
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DEV_POSTGRES || ''),
  database: 'tamshai_finance',
  user: process.env.POSTGRES_USER,
  password: process.env.TAMSHAI_APP_PASSWORD,  // Required - no fallback
};

// Admin config with tamshai superuser for fixture resets (bypasses RLS)
// Requires TAMSHAI_DB_PASSWORD environment variable
const DB_CONFIG_ADMIN_FINANCE = {
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DEV_POSTGRES || ''),
  database: 'tamshai_finance',
  user: 'tamshai',  // Superuser with BYPASSRLS for fixture resets
  password: process.env.TAMSHAI_DB_PASSWORD,
};

// Default config - HR database (used as default for legacy compatibility)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DB_CONFIG = DB_CONFIG_HR;

// Connection pools for different test users
let adminPool: Pool | null = null;
let adminPoolFinance: Pool | null = null;
let adminPoolFinanceReset: Pool | null = null;  // For fixture resets

// Keycloak admin token for TOTP management
let keycloakAdminToken: string | null = null;

// Storage for user state to restore after tests
const savedUserState: Record<string, SavedUserState> = {};

// Test usernames that need TOTP handling
const TEST_USERNAMES = [
  'eve.thompson',
  'alice.chen',
  'bob.martinez',
  'carol.johnson',
  'dan.williams',
  'frank.davis',
  'nina.patel',
  'marcus.johnson',
];

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

/**
 * Get admin database connection pool for Finance database with BYPASSRLS
 * Use this for fixture resets that need to update all records regardless of RLS
 */
export function getAdminPoolFinanceReset(): Pool {
  if (!adminPoolFinanceReset) {
    adminPoolFinanceReset = new Pool(DB_CONFIG_ADMIN_FINANCE);
  }
  return adminPoolFinanceReset;
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
 * Escape a string value for use in SET commands
 * PostgreSQL SET doesn't support parameterized queries, so we escape manually
 */
function escapeSetValue(value: string): string {
  // Escape single quotes by doubling them
  return value.replace(/'/g, "''");
}

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
  // NOTE: SET commands don't support parameterized queries in PostgreSQL,
  // so we escape values manually. Values are internal test data (UUIDs, role names).
  await client.query(`SET app.current_user_id = '${escapeSetValue(userId)}'`);
  await client.query(`SET app.current_user_roles = '${escapeSetValue(roles.join(','))}'`);
  if (department) {
    await client.query(`SET app.current_user_department = '${escapeSetValue(department)}'`);
  }
  if (userEmail) {
    await client.query(`SET app.current_user_email = '${escapeSetValue(userEmail)}'`);
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

// ============================================================================
// Keycloak TOTP Management Functions (delegated to shared/auth/keycloak-admin)
// ============================================================================

const keycloakAdminConfig: KeycloakAdminConfig = {
  url: KEYCLOAK_CONFIG.url,
  realm: KEYCLOAK_CONFIG.realm,
};

// Local wrappers for backward compatibility with module-level keycloakAdminToken
async function getUserId(username: string): Promise<string | null> {
  return sharedGetUserId(keycloakAdminToken!, keycloakAdminConfig, username);
}

async function getUser(userId: string) {
  return sharedGetUser(keycloakAdminToken!, keycloakAdminConfig, userId);
}

async function getUserCredentials(userId: string) {
  return sharedGetUserCredentials(keycloakAdminToken!, keycloakAdminConfig, userId);
}

/**
 * Gets a token for the integration test service account using client credentials.
 */
async function getServiceAccountToken(): Promise<string> {
    const clientSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
    if (!clientSecret) {
        throw new Error('MCP_INTEGRATION_RUNNER_SECRET environment variable is required for integration tests');
    }

    const response = await axios.post(
        `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
            client_id: 'mcp-integration-runner',
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}

/**
 * Gets an impersonated token for a specific user using the Token Exchange grant.
 */
export async function getImpersonatedToken(username: string): Promise<string> {
    const serviceToken = await getServiceAccountToken();

    // Validate client secret is available
    const clientSecret = process.env.MCP_INTEGRATION_RUNNER_SECRET;
    if (!clientSecret) {
        throw new Error('MCP_INTEGRATION_RUNNER_SECRET environment variable is required for integration tests');
    }

    // Don't specify audience - mcp-integration-runner has an audience mapper
    // that automatically adds mcp-gateway to the token's aud claim
    const response = await axios.post(
        `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            client_id: 'mcp-integration-runner',
            client_secret: clientSecret,
            subject_token: serviceToken,
            requested_subject: username,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}


/**
 * Prepare test users — delegates to shared keycloak-admin module
 */
async function prepareTestUsers(): Promise<void> {
  console.log('\n🔐 Preparing test users for automated testing (parallelized)...');
  console.log('   (OTP credentials are preserved - only required actions are modified)\n');

  const result = await sharedPrepareTestUsers(keycloakAdminToken!, keycloakAdminConfig, TEST_USERNAMES);
  Object.assign(savedUserState, result);
}

/**
 * Restore test users — delegates to shared keycloak-admin module
 */
async function restoreTestUsers(): Promise<void> {
  console.log('\n🔐 Re-enabling TOTP requirement for all test users (parallelized)...');

  // Refresh admin token in case it expired during long tests
  try {
    keycloakAdminToken = await getKeycloakAdminToken(keycloakAdminConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('   ❌ Failed to refresh admin token:', message);
    return;
  }

  await sharedRestoreTestUsers(keycloakAdminToken!, keycloakAdminConfig, TEST_USERNAMES, savedUserState);
}

// ============================================================================
// T2: Ephemeral Test Users for Integration Tests
// ============================================================================
// Creates temporary users via Keycloak Admin API at test start, removes them
// at test end. Each test run gets its own password — no shared credentials.
// RLS tests are unaffected (they set session variables directly).

/** Random password for this test run */
const EPHEMERAL_TEST_PASSWORD = crypto.randomBytes(16).toString('hex');

/** Track ephemeral user IDs for cleanup */
const ephemeralUserIds: string[] = [];

/**
 * Ephemeral user definitions matching the roles needed by integration tests.
 * These mirror the pre-seeded users but use test-run-scoped credentials.
 * All users are added to /All-Employees for the base 'employee' role (needed for cross-domain self-service).
 */
const EPHEMERAL_USERS = [
  { username: 'test-exec', firstName: 'Test', lastName: 'Executive', email: 'test-exec@test.local', groups: ['/All-Employees', '/C-Suite'] },
  { username: 'test-hr', firstName: 'Test', lastName: 'HR', email: 'test-hr@test.local', groups: ['/All-Employees', '/HR-Department'] },
  { username: 'test-finance', firstName: 'Test', lastName: 'Finance', email: 'test-finance@test.local', groups: ['/All-Employees', '/Finance-Team'] },
  { username: 'test-sales', firstName: 'Test', lastName: 'Sales', email: 'test-sales@test.local', groups: ['/All-Employees', '/Sales-Team'] },
  { username: 'test-support', firstName: 'Test', lastName: 'Support', email: 'test-support@test.local', groups: ['/All-Employees', '/Support-Team'] },
];

/**
 * Get group ID by path
 */
async function getGroupId(groupPath: string): Promise<string | null> {
  try {
    const response = await axios.get(
      `${KEYCLOAK_CONFIG.url}/admin/realms/${KEYCLOAK_CONFIG.realm}/groups`,
      { headers: { Authorization: `Bearer ${keycloakAdminToken}` } }
    );
    const group = response.data.find((g: { path: string }) => g.path === groupPath);
    return group?.id || null;
  } catch {
    return null;
  }
}

/**
 * Create a single ephemeral user in Keycloak
 */
async function createEphemeralUser(user: typeof EPHEMERAL_USERS[0]): Promise<string | null> {
  try {
    // Create user (without groups - they must be added separately)
    const response = await axios.post(
      `${KEYCLOAK_CONFIG.url}/admin/realms/${KEYCLOAK_CONFIG.realm}/users`,
      {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        enabled: true,
        emailVerified: true,
        credentials: [{
          type: 'password',
          value: EPHEMERAL_TEST_PASSWORD,
          temporary: false,
        }],
      },
      {
        headers: {
          Authorization: `Bearer ${keycloakAdminToken}`,
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status === 201 || status === 409,
      }
    );

    let userId: string | null = null;

    if (response.status === 409) {
      // User already exists (from a previous failed cleanup) — look up and reuse
      const existingId = await getUserId(user.username);
      if (existingId) {
        // Reset password for the existing user
        await axios.put(
          `${KEYCLOAK_CONFIG.url}/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${existingId}/reset-password`,
          { type: 'password', value: EPHEMERAL_TEST_PASSWORD, temporary: false },
          { headers: { Authorization: `Bearer ${keycloakAdminToken}`, 'Content-Type': 'application/json' } }
        );
        userId = existingId;
      } else {
        return null;
      }
    } else {
      // Extract user ID from Location header
      const location = response.headers.location || '';
      userId = location.split('/').pop() || null;
    }

    // Add user to groups (must be done after user creation)
    if (userId) {
      for (const groupPath of user.groups) {
        const groupId = await getGroupId(groupPath);
        if (groupId) {
          try {
            await axios.put(
              `${KEYCLOAK_CONFIG.url}/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${userId}/groups/${groupId}`,
              {},
              { headers: { Authorization: `Bearer ${keycloakAdminToken}` } }
            );
          } catch {
            // Ignore group join failures (user may already be in group)
          }
        }
      }
    }

    return userId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ⚠️  Failed to create ephemeral user ${user.username}: ${message}`);
    return null;
  }
}

/**
 * Delete a single ephemeral user from Keycloak
 */
async function deleteEphemeralUser(userId: string): Promise<void> {
  try {
    await axios.delete(
      `${KEYCLOAK_CONFIG.url}/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${userId}`,
      { headers: { Authorization: `Bearer ${keycloakAdminToken}` } }
    );
  } catch {
    // Ignore delete failures (user may already be gone)
  }
}

/**
 * Create all ephemeral test users
 */
async function createEphemeralTestUsers(): Promise<void> {
  console.log('\n🔑 Creating ephemeral test users...');

  const results = await Promise.all(
    EPHEMERAL_USERS.map(async (user) => {
      const userId = await createEphemeralUser(user);
      if (userId) {
        ephemeralUserIds.push(userId);
        return `  ✅ ${user.username} (${user.groups.join(', ')})`;
      }
      return `  ⚠️  ${user.username} — failed to create`;
    })
  );

  results.forEach((r) => console.log(r));
  console.log('  Password for this run: [REDACTED]');

  // Wait for group memberships to propagate in Keycloak
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Delete all ephemeral test users
 */
async function deleteEphemeralTestUsers(): Promise<void> {
  console.log('\n🗑️  Deleting ephemeral test users...');

  // Refresh admin token in case it expired
  try {
    keycloakAdminToken = await getKeycloakAdminToken(keycloakAdminConfig);
  } catch {
    console.warn('  ⚠️  Could not refresh admin token for cleanup');
    return;
  }

  await Promise.all(ephemeralUserIds.map(deleteEphemeralUser));

  // Also clean up by username in case IDs were lost
  for (const user of EPHEMERAL_USERS) {
    const userId = await getUserId(user.username);
    if (userId) {
      await deleteEphemeralUser(userId);
    }
  }

  console.log(`  ✅ Cleaned up ${ephemeralUserIds.length} ephemeral users`);
}

/**
 * Get the ephemeral test password for this run.
 * Used by integration tests that need to obtain tokens.
 */
export function getEphemeralTestPassword(): string {
  return EPHEMERAL_TEST_PASSWORD;
}

/**
 * Get ephemeral test user credentials by role.
 * Returns { username, password } for use in token acquisition.
 */
export function getEphemeralUser(role: 'executive' | 'hr' | 'finance' | 'sales' | 'support'): { username: string; password: string } {
  const mapping: Record<string, string> = {
    executive: 'test-exec',
    hr: 'test-hr',
    finance: 'test-finance',
    sales: 'test-sales',
    support: 'test-support',
  };
  return {
    username: mapping[role],
    password: EPHEMERAL_TEST_PASSWORD,
  };
}

// Increase timeout for slow database operations
jest.setTimeout(30000);

/**
 * Reset budget test fixtures to their initial states
 *
 * This function resets all test fixture budgets to their original states
 * before each test run, ensuring tests are isolated and repeatable.
 *
 * Test Fixtures Reset:
 * - BUD-TEST-PENDING-* : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-REJECT-1  : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-AUDIT-*   : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-RULES-1   : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-SOD       : Reset to PENDING_APPROVAL, submitted by bob.martinez
 * - BUD-ENG-2024-SAL   : Reset to DRAFT, no submitter
 * - BUD-MKT-2024-MKT   : Reset to DRAFT, no submitter
 *
 * Also cleans up budget_approval_history for test fixtures to avoid
 * duplicate audit entries.
 */
export async function resetBudgetTestFixtures(): Promise<void> {
  // Use admin pool with BYPASSRLS to reset fixtures
  const pool = getAdminPoolFinanceReset();

  // User IDs (from TEST_USERS)
  const ninaPatelId = 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'; // manager
  const bobMartinezId = '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1'; // financeWrite

  // Reset PENDING_APPROVAL fixtures (submitted by nina.patel)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'PENDING_APPROVAL',
        submitted_by = $1::uuid,
        submitted_at = NOW() - interval '1 day',
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id IN (
      'BUD-TEST-PENDING-1', 'BUD-TEST-PENDING-2', 'BUD-TEST-PENDING-3',
      'BUD-TEST-REJECT-1', 'BUD-TEST-AUDIT-1', 'BUD-TEST-AUDIT-2',
      'BUD-TEST-AUDIT-3', 'BUD-TEST-RULES-1'
    )
  `, [ninaPatelId]);

  // Reset SOD fixture (submitted by bob.martinez for separation of duties test)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'PENDING_APPROVAL',
        submitted_by = $1::uuid,
        submitted_at = NOW() - interval '2 days',
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id = 'BUD-TEST-SOD'
  `, [bobMartinezId]);

  // Reset DRAFT fixtures (2024 budgets used in submit_budget tests)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'DRAFT',
        submitted_by = NULL,
        submitted_at = NULL,
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id IN (
      'BUD-ENG-2024-SAL', 'BUD-MKT-2024-MKT', 'BUD-HR-2024-SAL',
      'BUD-FIN-2024-SAL', 'BUD-IT-2024-TECH', 'BUD-SALES-2024-SAL',
      'BUD-EXEC-2024-SAL'
    )
  `);

  // Clean up approval history for test fixtures to avoid duplicate audit entries
  await pool.query(`
    DELETE FROM finance.budget_approval_history
    WHERE budget_id IN (
      SELECT id FROM finance.department_budgets
      WHERE budget_id LIKE 'BUD-TEST-%'
        OR budget_id IN (
          'BUD-ENG-2024-SAL', 'BUD-MKT-2024-MKT', 'BUD-HR-2024-SAL',
          'BUD-FIN-2024-SAL', 'BUD-IT-2024-TECH', 'BUD-SALES-2024-SAL',
          'BUD-EXEC-2024-SAL'
        )
    )
  `);

  console.log('   ✅ Budget test fixtures reset to initial states');
}

// Global setup - prepare test users (remove CONFIGURE_TOTP) + create ephemeral users
beforeAll(async () => {
  const isCI = process.env.CI === 'true';

  // In CI, skip TOTP handling (Keycloak is ephemeral)
  if (isCI) {
    console.log('\n✅ CI mode - skipping TOTP preparation');
    return;
  }

  try {
    keycloakAdminToken = await getKeycloakAdminToken(keycloakAdminConfig);
    await prepareTestUsers();
    // T2: Create ephemeral users for token-based integration tests
    await createEphemeralTestUsers();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`\n⚠️  Could not prepare test users (Keycloak may not be available): ${message}`);
    console.warn('   Tests requiring Keycloak authentication may fail.\n');
  }
}, 60000);

// Global cleanup - restore test users, delete ephemeral users, close database connections
afterAll(async () => {
  const isCI = process.env.CI === 'true';

  if (!isCI && keycloakAdminToken) {
    // Restore TOTP for pre-seeded test users (local dev only)
    await restoreTestUsers();
    // T2: Clean up ephemeral users
    await deleteEphemeralTestUsers();
  }

  // Close database pools
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
  if (adminPoolFinance) {
    await adminPoolFinance.end();
    adminPoolFinance = null;
  }
  if (adminPoolFinanceReset) {
    await adminPoolFinanceReset.end();
    adminPoolFinanceReset = null;
  }
}, 30000);
