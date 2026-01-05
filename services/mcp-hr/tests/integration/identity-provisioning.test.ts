/**
 * Integration Tests for IdentityService
 *
 * Tests the Keycloak Atomic Migration implementation against real services.
 *
 * Environment Requirements:
 * - Keycloak running on KEYCLOAK_URL (default: http://localhost:8180)
 * - PostgreSQL running on POSTGRES_HOST:POSTGRES_PORT
 * - Redis running on REDIS_HOST:REDIS_PORT
 *
 * Run locally: docker compose up -d && npm run test:integration
 * Run in CI: GitHub Actions services provide the containers
 *
 * @see .specify/Keycloak-Atomic-QA.md for test specifications
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import {
  IdentityService,
  EmployeeData,
  KcAdminClient,
  CleanupQueue,
  AuditAction,
} from '../../src/services/identity';

// Test configuration from environment
// Note: Local Docker uses KC_HTTP_RELATIVE_PATH=/auth, CI does not
const config = {
  keycloak: {
    baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8180',
    pathPrefix: process.env.KEYCLOAK_PATH_PREFIX ?? '/auth', // '/auth' for local, '' for CI
    realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
    adminUsername: process.env.KEYCLOAK_ADMIN || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    clientId: 'mcp-gateway',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'test-secret',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    database: process.env.POSTGRES_DB || 'tamshai_hr',
    user: process.env.POSTGRES_USER || 'tamshai',
    password: process.env.POSTGRES_PASSWORD || 'tamshai_password',
  },
};

/**
 * Simple Keycloak Admin Client implementation for tests
 * Uses direct HTTP calls to Keycloak Admin REST API
 */
class TestKcAdminClient implements KcAdminClient {
  private accessToken: string | null = null;
  private readonly baseUrl: string;
  private readonly pathPrefix: string;
  private readonly realm: string;

  constructor(baseUrl: string, realm: string, pathPrefix: string = '') {
    this.baseUrl = baseUrl;
    this.pathPrefix = pathPrefix;
    this.realm = realm;
  }

  async auth(credentials: {
    grantType: string;
    clientId: string;
    clientSecret: string;
  }): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}${this.pathPrefix}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: config.keycloak.adminUsername,
          password: config.keycloak.adminPassword,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Keycloak auth failed: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string };
    this.accessToken = data.access_token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.baseUrl}${this.pathPrefix}/admin/realms/${this.realm}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Keycloak request failed: ${response.status} - ${text}`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  users = {
    create: async (user: Record<string, unknown>): Promise<{ id: string }> => {
      const response = await fetch(
        `${this.baseUrl}${this.pathPrefix}/admin/realms/${this.realm}/users`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(user),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`User creation failed: ${response.status} - ${text}`);
      }

      // Get user ID from Location header
      const location = response.headers.get('Location');
      const id = location?.split('/').pop() || '';
      return { id };
    },

    update: async (
      query: { id: string },
      user: Record<string, unknown>
    ): Promise<void> => {
      await this.request('PUT', `/users/${query.id}`, user);
    },

    del: async (query: { id: string }): Promise<void> => {
      await this.request('DELETE', `/users/${query.id}`);
    },

    findOne: async (query: { id: string }): Promise<Record<string, unknown> | null> => {
      try {
        return await this.request('GET', `/users/${query.id}`);
      } catch {
        return null;
      }
    },

    find: async (params: { email?: string }): Promise<Record<string, unknown>[]> => {
      const query = params.email ? `?email=${encodeURIComponent(params.email)}` : '';
      return this.request('GET', `/users${query}`);
    },

    addClientRoleMappings: async (params: {
      id: string;
      clientUniqueId: string;
      roles: Array<{ id?: string; name?: string }>;
    }): Promise<void> => {
      // Get client internal ID first
      const clients = await this.request<Array<{ id: string; clientId: string }>>(
        'GET',
        `/clients?clientId=${params.clientUniqueId}`
      );
      if (clients.length === 0) return;

      await this.request(
        'POST',
        `/users/${params.id}/role-mappings/clients/${clients[0].id}`,
        params.roles
      );
    },

    listClientRoleMappings: async (params: {
      id: string;
      clientUniqueId: string;
    }): Promise<Array<{ id?: string; name?: string }>> => {
      const clients = await this.request<Array<{ id: string; clientId: string }>>(
        'GET',
        `/clients?clientId=${params.clientUniqueId}`
      );
      if (clients.length === 0) return [];

      return this.request(
        'GET',
        `/users/${params.id}/role-mappings/clients/${clients[0].id}`
      );
    },

    listSessions: async (query: { id: string }): Promise<Array<{ id: string }>> => {
      return this.request('GET', `/users/${query.id}/sessions`);
    },

    logout: async (query: { id: string }): Promise<void> => {
      await this.request('POST', `/users/${query.id}/logout`);
    },

    resetPassword: async (params: {
      id: string;
      credential: { type: string; value: string; temporary: boolean };
    }): Promise<void> => {
      await this.request('PUT', `/users/${params.id}/reset-password`, params.credential);
    },

    addRealmRoleMappings: async (params: {
      id: string;
      roles: Array<{ id?: string; name?: string }>;
    }): Promise<void> => {
      await this.request('POST', `/users/${params.id}/role-mappings/realm`, params.roles);
    },
  };

  clients = {
    find: async (query: { clientId: string }): Promise<Array<{ id: string; clientId: string }>> => {
      return this.request('GET', `/clients?clientId=${encodeURIComponent(query.clientId)}`);
    },

    listRoles: async (query: { id: string }): Promise<Array<{ id?: string; name?: string }>> => {
      const clients = await this.request<Array<{ id: string; clientId: string }>>(
        'GET',
        `/clients?clientId=${query.id}`
      );
      if (clients.length === 0) return [];

      return this.request('GET', `/clients/${clients[0].id}/roles`);
    },
  };

  roles = {
    find: async (): Promise<Array<{ id?: string; name?: string }>> => {
      return this.request('GET', '/roles');
    },

    findOneByName: async (query: { name: string }): Promise<{ id?: string; name?: string } | undefined> => {
      try {
        return await this.request('GET', `/roles/${encodeURIComponent(query.name)}`);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Mock cleanup queue that captures scheduled jobs
 */
class TestCleanupQueue implements CleanupQueue {
  public jobs: Array<{ name: string; data: unknown; opts?: { delay?: number } }> = [];

  async add(
    name: string,
    data: unknown,
    opts?: { delay?: number }
  ): Promise<unknown> {
    this.jobs.push({ name, data, opts });
    return { id: `job-${randomUUID()}` };
  }

  clear(): void {
    this.jobs = [];
  }
}

describe('IdentityService Integration Tests', () => {
  let db: Pool;
  let kcAdmin: TestKcAdminClient;
  let cleanupQueue: TestCleanupQueue;
  let identityService: IdentityService;
  let createdUserIds: string[] = [];

  // Increase timeout for integration tests
  jest.setTimeout(60000);

  beforeAll(async () => {
    // Initialize PostgreSQL connection
    db = new Pool(config.postgres);

    // Verify database connection
    try {
      await db.query('SELECT 1');
    } catch (error) {
      throw new Error(
        `PostgreSQL connection failed: ${error}. ` +
          `Ensure docker compose is running or CI services are configured.`
      );
    }

    // Initialize Keycloak admin client
    kcAdmin = new TestKcAdminClient(config.keycloak.baseUrl, config.keycloak.realm, config.keycloak.pathPrefix);

    try {
      await kcAdmin.auth({
        grantType: 'client_credentials',
        clientId: 'admin-cli',
        clientSecret: '',
      });
    } catch (error) {
      throw new Error(
        `Keycloak auth failed: ${error}. ` +
          `Ensure Keycloak is running on ${config.keycloak.baseUrl}`
      );
    }

    // Initialize test queue
    cleanupQueue = new TestCleanupQueue();

    // Create IdentityService with test dependencies
    identityService = new IdentityService(db, kcAdmin, cleanupQueue);

    // Ensure test schema exists (matches production schema with normalized departments)
    await db.query(`
      CREATE SCHEMA IF NOT EXISTS hr;

      -- Departments table (normalized schema)
      CREATE TABLE IF NOT EXISTS hr.departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(10) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Insert standard departments for tests
      INSERT INTO hr.departments (id, name, code) VALUES
        ('d1000000-0000-0000-0000-000000000001', 'Human Resources', 'HR'),
        ('d1000000-0000-0000-0000-000000000002', 'Finance', 'FIN'),
        ('d1000000-0000-0000-0000-000000000003', 'Sales', 'SALES'),
        ('d1000000-0000-0000-0000-000000000004', 'Support', 'SUPPORT'),
        ('d1000000-0000-0000-0000-000000000005', 'Engineering', 'ENG')
      ON CONFLICT (code) DO NOTHING;

      -- Employees table with department_id FK (matches production schema)
      CREATE TABLE IF NOT EXISTS hr.employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_number VARCHAR(20) UNIQUE NOT NULL,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department_id UUID REFERENCES hr.departments(id),
        hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'active',
        terminated_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        keycloak_user_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Production audit log schema (matches hr-data.sql)
      CREATE TABLE IF NOT EXISTS hr.access_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_email VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        resource VARCHAR(100),
        target_id UUID,
        access_decision VARCHAR(20),
        access_justification TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  });

  afterAll(async () => {
    // Cleanup created users from Keycloak
    for (const userId of createdUserIds) {
      try {
        await kcAdmin.users.del({ id: userId });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Cleanup test data from database
    await db.query(`
      DELETE FROM hr.access_audit_log WHERE target_id IN (
        SELECT id FROM hr.employees WHERE email LIKE '%@integration-test.tamshai.com'
      );
      DELETE FROM hr.employees WHERE email LIKE '%@integration-test.tamshai.com';
    `);

    await db.end();
  });

  afterEach(() => {
    cleanupQueue.clear();
  });

  /**
   * Helper to create unique test email
   */
  function testEmail(prefix: string): string {
    return `${prefix}-${randomUUID()}@integration-test.tamshai.com`;
  }

  /**
   * Helper to generate unique employee number for tests
   */
  function testEmployeeNumber(): string {
    return `TEST-${randomUUID().substring(0, 8).toUpperCase()}`;
  }

  /**
   * Helper to generate unique first/last names for tests.
   * Keycloak username is derived from firstName.lastName, so these must be unique
   * across test runs to avoid "User exists with same username" conflicts.
   */
  function testName(baseName: string): { firstName: string; lastName: string } {
    const suffix = randomUUID().substring(0, 6);
    return {
      firstName: `${baseName}${suffix}`,
      lastName: `Test${suffix}`,
    };
  }

  describe('Onboarding Transaction (createUserInKeycloak)', () => {
    it('should create Keycloak user when employee is created', async () => {
      const email = testEmail('alice');
      const names = testName('Alice');
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        // Create employee record
        const result = await client.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names.firstName, names.lastName, email, 'Human Resources']
        );
        const employee = result.rows[0];

        // Provision Keycloak user
        const employeeData: EmployeeData = {
          id: employee.id,
          email,
          firstName: names.firstName,
          lastName: names.lastName,
          department: 'HR',
        };

        const keycloakUserId = await identityService.createUserInKeycloak(
          employeeData,
          client
        );

        await client.query('COMMIT');

        // Track for cleanup
        createdUserIds.push(keycloakUserId);

        // Verify Keycloak user exists
        const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });
        expect(kcUser).not.toBeNull();
        expect(kcUser?.enabled).toBe(true);
        expect(kcUser?.email).toBe(email);
        expect(kcUser?.firstName).toBe(names.firstName);
        expect(kcUser?.lastName).toBe(names.lastName);

        // Verify employee record has Keycloak ID
        const updatedEmployee = await db.query(
          'SELECT keycloak_user_id FROM hr.employees WHERE id = $1',
          [employee.id]
        );
        expect(updatedEmployee.rows[0].keycloak_user_id).toBe(keycloakUserId);

        // Verify audit log
        const auditLog = await db.query(
          `SELECT * FROM hr.access_audit_log
           WHERE target_id = $1 AND action = $2`,
          [employee.id, AuditAction.USER_CREATED]
        );
        expect(auditLog.rows).toHaveLength(1);
      } finally {
        client.release();
      }
    });

    it('should rollback HR record if Keycloak creation fails (duplicate email)', async () => {
      const email = testEmail('duplicate');
      const names1 = testName('First');
      const names2 = testName('Second');
      const client1 = await db.connect();
      const client2 = await db.connect();

      try {
        // First user - should succeed
        await client1.query('BEGIN');
        const result1 = await client1.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names1.firstName, names1.lastName, email, 'Human Resources']
        );

        const keycloakUserId = await identityService.createUserInKeycloak(
          {
            id: result1.rows[0].id,
            email,
            firstName: names1.firstName,
            lastName: names1.lastName,
            department: 'HR',
          },
          client1
        );
        await client1.query('COMMIT');
        createdUserIds.push(keycloakUserId);

        // Second user with same email - should fail
        await client2.query('BEGIN');
        const result2 = await client2.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names2.firstName, names2.lastName, `duplicate-${randomUUID()}@integration-test.tamshai.com`, 'Human Resources']
        );

        // Try to create with duplicate email in Keycloak
        await expect(
          identityService.createUserInKeycloak(
            {
              id: result2.rows[0].id,
              email, // Same email as first user
              firstName: names2.firstName,
              lastName: names2.lastName,
              department: 'HR',
            },
            client2
          )
        ).rejects.toThrow('Failed to provision Keycloak user');

        await client2.query('ROLLBACK');
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  describe('Kill Switch (terminateUser)', () => {
    let employeeId: string;
    let keycloakUserId: string;

    beforeEach(async () => {
      const email = testEmail('terminate');
      const names = testName('Dan');
      const client = await db.connect();

      try {
        await client.query('BEGIN');

        const result = await client.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names.firstName, names.lastName, email, 'Finance']
        );
        employeeId = result.rows[0].id;

        keycloakUserId = await identityService.createUserInKeycloak(
          {
            id: employeeId,
            email,
            firstName: names.firstName,
            lastName: names.lastName,
            department: 'Finance',
          },
          client
        );

        await client.query('COMMIT');
        createdUserIds.push(keycloakUserId);
      } finally {
        client.release();
      }
    });

    it('should immediately disable user and revoke sessions', async () => {
      const result = await identityService.terminateUser(employeeId);

      expect(result.success).toBe(true);
      expect(result.keycloakUserId).toBe(keycloakUserId);

      // Verify Keycloak user is disabled
      const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });
      expect(kcUser?.enabled).toBe(false);
    });

    it('should write permissions snapshot to audit log', async () => {
      await identityService.terminateUser(employeeId);

      const auditLog = await db.query(
        `SELECT * FROM hr.access_audit_log
         WHERE target_id = $1 AND action = $2`,
        [employeeId, AuditAction.USER_TERMINATED]
      );

      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].access_justification).toBeDefined();

      // access_justification contains the JSON snapshot
      const snapshot = JSON.parse(auditLog.rows[0].access_justification);
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.sessionsRevoked).toBeDefined();
    });

    it('should update employee status to terminated', async () => {
      await identityService.terminateUser(employeeId);

      const employee = await db.query(
        'SELECT status, terminated_at FROM hr.employees WHERE id = $1',
        [employeeId]
      );

      expect(employee.rows[0].status).toBe('terminated');
      expect(employee.rows[0].terminated_at).not.toBeNull();
    });

    it('should schedule deletion job for 72 hours later', async () => {
      const result = await identityService.terminateUser(employeeId);

      // Verify job was queued
      expect(cleanupQueue.jobs).toHaveLength(1);
      expect(cleanupQueue.jobs[0].name).toBe('delete_user_final');
      expect(cleanupQueue.jobs[0].data).toEqual({
        keycloakUserId,
        employeeId,
      });

      // Verify delay is ~72 hours
      const delayMs = cleanupQueue.jobs[0].opts?.delay || 0;
      expect(delayMs).toBe(72 * 60 * 60 * 1000);

      // Verify scheduled time
      const now = Date.now();
      const scheduledTime = result.scheduledDeletionAt.getTime();
      expect(scheduledTime - now).toBeGreaterThan(71 * 60 * 60 * 1000);
      expect(scheduledTime - now).toBeLessThan(73 * 60 * 60 * 1000);
    });
  });

  describe('72-Hour Data Retention (deleteUserPermanently)', () => {
    it('should permanently delete disabled user after 72 hours', async () => {
      const email = testEmail('delete-perm');
      const names = testName('Eve');
      const client = await db.connect();
      let employeeId: string;
      let keycloakUserId: string;

      try {
        await client.query('BEGIN');

        const result = await client.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names.firstName, names.lastName, email, 'Human Resources']
        );
        employeeId = result.rows[0].id;

        keycloakUserId = await identityService.createUserInKeycloak(
          {
            id: employeeId,
            email,
            firstName: names.firstName,
            lastName: names.lastName,
            department: 'HR',
          },
          client
        );

        await client.query('COMMIT');
        createdUserIds.push(keycloakUserId);
      } finally {
        client.release();
      }

      // Terminate user
      await identityService.terminateUser(employeeId);

      // Simulate 72-hour delay by calling deleteUserPermanently directly
      await identityService.deleteUserPermanently(keycloakUserId, employeeId);

      // Verify user is gone from Keycloak
      const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });
      expect(kcUser).toBeNull();

      // Verify employee status is 'deleted'
      const employee = await db.query(
        'SELECT status, deleted_at FROM hr.employees WHERE id = $1',
        [employeeId]
      );
      expect(employee.rows[0].status).toBe('deleted');
      expect(employee.rows[0].deleted_at).not.toBeNull();

      // Verify deletion logged
      const auditLog = await db.query(
        `SELECT * FROM hr.access_audit_log
         WHERE target_id = $1 AND action = $2`,
        [employeeId, AuditAction.USER_DELETED]
      );
      expect(auditLog.rows).toHaveLength(1);

      // Remove from cleanup list since already deleted
      createdUserIds = createdUserIds.filter((id) => id !== keycloakUserId);
    });

    it('should block deletion if user was re-enabled (termination reversal)', async () => {
      const email = testEmail('re-enabled');
      const names = testName('Frank');
      const client = await db.connect();
      let employeeId: string;
      let keycloakUserId: string;

      try {
        await client.query('BEGIN');

        const result = await client.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names.firstName, names.lastName, email, 'Support']
        );
        employeeId = result.rows[0].id;

        keycloakUserId = await identityService.createUserInKeycloak(
          {
            id: employeeId,
            email,
            firstName: names.firstName,
            lastName: names.lastName,
            department: 'Support',
          },
          client
        );

        await client.query('COMMIT');
        createdUserIds.push(keycloakUserId);
      } finally {
        client.release();
      }

      // Terminate user
      await identityService.terminateUser(employeeId);

      // Simulate admin re-enabling the user (termination reversal)
      await kcAdmin.users.update({ id: keycloakUserId }, { enabled: true });

      // Attempt to delete - should fail
      await expect(
        identityService.deleteUserPermanently(keycloakUserId, employeeId)
      ).rejects.toThrow('Cannot delete enabled user');

      // Verify user still exists in Keycloak
      const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });
      expect(kcUser).not.toBeNull();
      expect(kcUser?.enabled).toBe(true);

      // Verify DELETION_BLOCKED audit log
      const auditLog = await db.query(
        `SELECT * FROM hr.access_audit_log
         WHERE target_id = $1 AND action = $2`,
        [employeeId, AuditAction.DELETION_BLOCKED]
      );
      expect(auditLog.rows).toHaveLength(1);
    });
  });

  describe('Decoupling Test', () => {
    it('should allow Keycloak user to exist even when HR DB connection is separate', async () => {
      const email = testEmail('decoupling');
      const names = testName('Grace');

      // Use a separate pool for this test
      const isolatedPool = new Pool(config.postgres);
      const isolatedService = new IdentityService(isolatedPool, kcAdmin, cleanupQueue);

      const client = await isolatedPool.connect();
      let keycloakUserId: string;

      try {
        await client.query('BEGIN');

        const result = await client.query(
          `INSERT INTO hr.employees (employee_number, first_name, last_name, email, department_id, hire_date)
           VALUES ($1, $2, $3, $4, (SELECT id FROM hr.departments WHERE name = $5), CURRENT_DATE) RETURNING *`,
          [testEmployeeNumber(), names.firstName, names.lastName, email, 'Engineering']
        );

        keycloakUserId = await isolatedService.createUserInKeycloak(
          {
            id: result.rows[0].id,
            email,
            firstName: names.firstName,
            lastName: names.lastName,
            department: 'Engineering',
          },
          client
        );

        await client.query('COMMIT');
        createdUserIds.push(keycloakUserId);
      } finally {
        client.release();
      }

      // Close the isolated pool (simulating DB outage)
      await isolatedPool.end();

      // Verify Keycloak user still exists and is enabled
      // (authentication should still work even if HR DB is down)
      const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });
      expect(kcUser).not.toBeNull();
      expect(kcUser?.enabled).toBe(true);
      expect(kcUser?.email).toBe(email);
    });
  });
});
