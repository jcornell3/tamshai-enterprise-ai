/**
 * Unit tests for IdentityService - Keycloak Atomic User Provisioning
 *
 * Tests bulk sync, individual provisioning, termination, and cleanup flows.
 */

import {
  IdentityService,
  EmployeeData,
  KcAdminClient,
  CleanupQueue,
  AuditAction,
  BulkSyncResult,
  DEPARTMENT_ROLE_MAP,
  KeycloakConfig,
  generateSecurePassword,
  transformEmailForDatabaseLookup,
  EMAIL_DOMAIN_CONFIG,
} from './identity';
import { Pool, PoolClient, QueryResult } from 'pg';

// Mock implementations
const createMockPool = () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}) as unknown as Pool;

const createMockPoolClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
}) as unknown as PoolClient;

const createMockKcAdmin = () => ({
  auth: jest.fn(),
  users: {
    create: jest.fn(),
    update: jest.fn(),
    del: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    resetPassword: jest.fn(),
    addClientRoleMappings: jest.fn(),
    addRealmRoleMappings: jest.fn(),
    listClientRoleMappings: jest.fn(),
    listSessions: jest.fn(),
    logout: jest.fn(),
  },
  clients: {
    find: jest.fn(),
    listRoles: jest.fn(),
  },
  roles: {
    find: jest.fn(),
    findOneByName: jest.fn(),
  },
}) as unknown as KcAdminClient;

const createMockCleanupQueue = () => ({
  add: jest.fn(),
  close: jest.fn(),
}) as unknown as CleanupQueue;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createQueryResult = <T extends Record<string, any> = Record<string, any>>(rows: T[]): QueryResult<T> => ({
  rows,
  rowCount: rows.length,
  command: '',
  oid: 0,
  fields: [],
});

describe('IdentityService', () => {
  let pool: Pool;
  let poolClient: PoolClient;
  let kcAdmin: KcAdminClient;
  let cleanupQueue: CleanupQueue;
  let service: IdentityService;

  beforeEach(() => {
    pool = createMockPool();
    poolClient = createMockPoolClient();
    kcAdmin = createMockKcAdmin();
    cleanupQueue = createMockCleanupQueue();
    service = new IdentityService(pool, kcAdmin, cleanupQueue);

    // Default mock for pool.connect()
    (pool.connect as jest.Mock).mockResolvedValue(poolClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('authenticates with Keycloak using service account', async () => {
      process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';

      await service.authenticate();

      expect(kcAdmin.auth).toHaveBeenCalledWith({
        grantType: 'client_credentials',
        clientId: KeycloakConfig.HR_SERVICE_CLIENT_ID,
        clientSecret: 'test-secret',
      });
    });
  });

  describe('syncAllEmployees', () => {
    const mockEmployees: EmployeeData[] = [
      { id: 'emp-1', email: 'alice@test.com', firstName: 'Alice', lastName: 'Chen', department: 'HR' },
      { id: 'emp-2', email: 'bob@test.com', firstName: 'Bob', lastName: 'Martinez', department: 'Finance' },
      { id: 'emp-3', email: 'carol@test.com', firstName: 'Carol', lastName: 'Johnson', department: 'Sales' },
    ];

    it('syncs all active employees without Keycloak IDs', async () => {
      // Mock: Get active employees
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Audit log start
        .mockResolvedValueOnce(createQueryResult(mockEmployees)) // SELECT employees
        .mockResolvedValueOnce(createQueryResult([])); // Audit log complete

      // Mock: Keycloak user not found (needs to be created)
      (kcAdmin.users.find as jest.Mock).mockResolvedValue([]);
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-new' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue(undefined);

      // Mock: Pool client for transactions
      (poolClient.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      const result = await service.syncAllEmployees();

      expect(result.success).toBe(true);
      expect(result.totalEmployees).toBe(3);
      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('skips employees that already exist in Keycloak', async () => {
      const employees = [mockEmployees[0]]; // Just Alice

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Audit log start
        .mockResolvedValueOnce(createQueryResult(employees)) // SELECT employees
        .mockResolvedValueOnce(createQueryResult([])); // Audit log complete

      // Mock: User already exists in Keycloak
      (kcAdmin.users.find as jest.Mock).mockResolvedValue([{ id: 'existing-kc-id' }]);

      const result = await service.syncAllEmployees();

      expect(result.success).toBe(true);
      expect(result.totalEmployees).toBe(1);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(kcAdmin.users.create).not.toHaveBeenCalled();
    });

    it('captures errors for individual employees', async () => {
      const employees = [mockEmployees[0], mockEmployees[1]];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Audit log start
        .mockResolvedValueOnce(createQueryResult(employees)) // SELECT employees
        .mockResolvedValueOnce(createQueryResult([])); // Audit log complete

      // First employee: Keycloak error
      (kcAdmin.users.find as jest.Mock)
        .mockResolvedValueOnce([]) // Alice not found
        .mockResolvedValueOnce([{ id: 'bob-kc-id' }]); // Bob exists

      (kcAdmin.users.create as jest.Mock).mockRejectedValueOnce(new Error('Keycloak connection failed'));

      const result = await service.syncAllEmployees();

      expect(result.success).toBe(false);
      expect(result.totalEmployees).toBe(2);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].employeeId).toBe('emp-1');
      expect(result.errors[0].email).toBe('alice@test.com');
      expect(result.errors[0].error).toContain('Keycloak connection failed');
    });

    it('logs sync start and completion to audit log', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Audit log start
        .mockResolvedValueOnce(createQueryResult([])) // No employees
        .mockResolvedValueOnce(createQueryResult([])); // Audit log complete

      await service.syncAllEmployees();

      const calls = (pool.query as jest.Mock).mock.calls;

      // First call: BULK_SYNC_STARTED
      expect(calls[0][0]).toContain('access_audit_log');
      expect(calls[0][1]).toContain(AuditAction.BULK_SYNC_STARTED);

      // Last call: BULK_SYNC_COMPLETED
      expect(calls[2][0]).toContain('access_audit_log');
      expect(calls[2][1]).toContain(AuditAction.BULK_SYNC_COMPLETED);
    });

    it('returns duration in milliseconds', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([])) // Audit log start
        .mockResolvedValueOnce(createQueryResult([])) // No employees
        .mockResolvedValueOnce(createQueryResult([])); // Audit log complete

      const result = await service.syncAllEmployees();

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createUserInKeycloak', () => {
    const employee: EmployeeData = {
      id: 'emp-123',
      email: 'test@test.com',
      firstName: 'Test',
      lastName: 'User',
      department: 'HR',
    };

    it('creates user in Keycloak with correct attributes', async () => {
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-123' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue({ id: 'role-1', name: 'hr-read' });
      (poolClient.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      const result = await service.createUserInKeycloak(employee, poolClient);

      expect(kcAdmin.users.create).toHaveBeenCalledWith({
        username: 'test.user',  // firstname.lastname format (consistent with dev realm)
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
        enabled: true,
        emailVerified: false,
        attributes: {
          employeeId: ['emp-123'],
          department: ['HR'],
        },
        requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
      });
      expect(result).toBe('kc-user-123');
    });

    it('assigns department role to new user', async () => {
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-123' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue({ id: 'role-hr', name: 'hr-read' });
      (poolClient.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      await service.createUserInKeycloak(employee, poolClient);

      expect(kcAdmin.users.addRealmRoleMappings).toHaveBeenCalledWith({
        id: 'kc-user-123',
        roles: [{ id: 'role-hr', name: 'hr-read' }],
      });
    });

    it('updates employee record with Keycloak user ID', async () => {
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-123' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue(undefined);
      (poolClient.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      await service.createUserInKeycloak(employee, poolClient);

      expect(poolClient.query).toHaveBeenCalledWith(
        expect.stringContaining('keycloak_user_id'),
        ['kc-user-123', 'emp-123']
      );
    });

    it('writes audit log for user creation', async () => {
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-123' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue(undefined);
      (poolClient.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      await service.createUserInKeycloak(employee, poolClient);

      const auditCalls = (poolClient.query as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0].includes('access_audit_log')
      );
      expect(auditCalls.length).toBeGreaterThan(0);
      expect(auditCalls[0][1]).toContain(AuditAction.USER_CREATED);
    });

    it('throws error if Keycloak user creation fails', async () => {
      (kcAdmin.users.create as jest.Mock).mockRejectedValue(new Error('Email already exists'));

      await expect(service.createUserInKeycloak(employee, poolClient)).rejects.toThrow(
        'Failed to provision Keycloak user: Email already exists'
      );
    });

    it('performs compensating transaction if role assignment fails', async () => {
      (kcAdmin.users.create as jest.Mock).mockResolvedValue({ id: 'kc-user-123' });
      (kcAdmin.roles.findOneByName as jest.Mock).mockResolvedValue({ id: 'role-1', name: 'hr-read' });
      (kcAdmin.users.addRealmRoleMappings as jest.Mock).mockRejectedValue(new Error('Role assignment failed'));

      await expect(service.createUserInKeycloak(employee, poolClient)).rejects.toThrow();

      // Should delete the user as compensating transaction
      expect(kcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-user-123' });
    });
  });

  describe('terminateUser', () => {
    it('disables user in Keycloak immediately', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 'emp-1', email: 'test@test.com', keycloak_user_id: 'kc-123' }]))
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      (kcAdmin.users.listClientRoleMappings as jest.Mock).mockResolvedValue([{ name: 'hr-read' }]);
      (kcAdmin.users.listSessions as jest.Mock).mockResolvedValue([]);

      await service.terminateUser('emp-1');

      expect(kcAdmin.users.update).toHaveBeenCalledWith(
        { id: 'kc-123' },
        { enabled: false }
      );
    });

    it('revokes all active sessions', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 'emp-1', email: 'test@test.com', keycloak_user_id: 'kc-123' }]))
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      (kcAdmin.users.listClientRoleMappings as jest.Mock).mockResolvedValue([]);
      (kcAdmin.users.listSessions as jest.Mock).mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);

      const result = await service.terminateUser('emp-1');

      expect(kcAdmin.users.logout).toHaveBeenCalledWith({ id: 'kc-123' });
      expect(result.sessionsRevoked).toBe(2);
    });

    it('schedules deletion job for 72 hours later', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce(createQueryResult([{ id: 'emp-1', email: 'test@test.com', keycloak_user_id: 'kc-123' }]))
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      (kcAdmin.users.listClientRoleMappings as jest.Mock).mockResolvedValue([]);
      (kcAdmin.users.listSessions as jest.Mock).mockResolvedValue([]);

      const result = await service.terminateUser('emp-1');

      expect(cleanupQueue.add).toHaveBeenCalledWith(
        'delete_user_final',
        { keycloakUserId: 'kc-123', employeeId: 'emp-1' },
        { delay: 72 * 60 * 60 * 1000 }
      );

      // Scheduled deletion should be ~72 hours from now
      const expected72HoursLater = new Date(Date.now() + 72 * 60 * 60 * 1000);
      expect(result.scheduledDeletionAt.getTime()).toBeCloseTo(expected72HoursLater.getTime(), -3);
    });

    it('throws error if employee has no Keycloak user', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(
        createQueryResult([{ id: 'emp-1', email: 'test@test.com', keycloak_user_id: null }])
      );

      await expect(service.terminateUser('emp-1')).rejects.toThrow('Employee emp-1 has no Keycloak user');
    });

    it('throws error if employee not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce(createQueryResult([]));

      await expect(service.terminateUser('emp-999')).rejects.toThrow('Employee emp-999 not found');
    });
  });

  describe('deleteUserPermanently', () => {
    it('deletes user from Keycloak', async () => {
      (kcAdmin.users.findOne as jest.Mock).mockResolvedValue({ id: 'kc-123', enabled: false });
      (pool.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      await service.deleteUserPermanently('kc-123', 'emp-1');

      expect(kcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-123' });
    });

    it('does nothing if user already deleted (idempotent)', async () => {
      (kcAdmin.users.findOne as jest.Mock).mockResolvedValue(null);

      await service.deleteUserPermanently('kc-123', 'emp-1');

      expect(kcAdmin.users.del).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('throws error if user was re-enabled', async () => {
      (kcAdmin.users.findOne as jest.Mock).mockResolvedValue({ id: 'kc-123', email: 'test@test.com', enabled: true });
      (pool.query as jest.Mock).mockResolvedValue(createQueryResult([])); // Audit log

      await expect(service.deleteUserPermanently('kc-123', 'emp-1')).rejects.toThrow('Cannot delete enabled user');

      // Should log the blocked deletion
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('access_audit_log'),
        expect.arrayContaining([AuditAction.DELETION_BLOCKED])
      );
    });

    it('updates employee status to deleted', async () => {
      (kcAdmin.users.findOne as jest.Mock).mockResolvedValue({ id: 'kc-123', enabled: false });
      (pool.query as jest.Mock).mockResolvedValue(createQueryResult([]));

      await service.deleteUserPermanently('kc-123', 'emp-1');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'deleted'"),
        ['emp-1']
      );
    });
  });

  describe('getPendingSyncCount', () => {
    it('returns count of employees pending sync', async () => {
      (pool.query as jest.Mock).mockResolvedValue(createQueryResult([{ count: '5' }]));

      const count = await service.getPendingSyncCount();

      expect(count).toBe(5);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPPER(status) = 'ACTIVE'")
      );
    });
  });

  describe('DEPARTMENT_ROLE_MAP', () => {
    it('maps known departments to roles', () => {
      expect(DEPARTMENT_ROLE_MAP['HR']).toBe('hr-read');
      expect(DEPARTMENT_ROLE_MAP['Finance']).toBe('finance-read');
      expect(DEPARTMENT_ROLE_MAP['Sales']).toBe('sales-read');
      expect(DEPARTMENT_ROLE_MAP['Support']).toBe('support-read');
      expect(DEPARTMENT_ROLE_MAP['Engineering']).toBe('engineering-read');
    });

    it('maps EXEC to executive composite role for C-Suite', () => {
      expect(DEPARTMENT_ROLE_MAP['EXEC']).toBe('executive');
    });

    it('returns undefined for unknown departments', () => {
      expect(DEPARTMENT_ROLE_MAP['Unknown']).toBeUndefined();
    });
  });
});

describe('generateSecurePassword', () => {
  it('generates password of default length (20)', () => {
    const password = generateSecurePassword();
    expect(password).toHaveLength(20);
  });

  it('generates password of specified length', () => {
    const password = generateSecurePassword(32);
    expect(password).toHaveLength(32);
  });

  it('contains only allowed alphanumeric characters', () => {
    const password = generateSecurePassword(100);
    // Allowed chars: ABCDEFGHJKLMNPQRSTUVWXYZ + abcdefghjkmnpqrstuvwxyz + 23456789
    const allowedChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/;
    expect(password).toMatch(allowedChars);
  });

  it('excludes confusable characters (0, 1, I, O, i, l, o)', () => {
    // Generate many passwords to ensure confusable chars never appear
    for (let i = 0; i < 50; i++) {
      const password = generateSecurePassword(50);
      expect(password).not.toMatch(/[01IOilo]/);
    }
  });

  it('contains at least one uppercase letter', () => {
    const password = generateSecurePassword();
    expect(password).toMatch(/[A-Z]/);
  });

  it('contains at least one lowercase letter', () => {
    const password = generateSecurePassword();
    expect(password).toMatch(/[a-z]/);
  });

  it('contains at least one number', () => {
    const password = generateSecurePassword();
    expect(password).toMatch(/[0-9]/);
  });

  it('generates different passwords each call', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateSecurePassword());
    }
    // All 100 passwords should be unique
    expect(passwords.size).toBe(100);
  });

  it('does not contain shell-problematic characters', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateSecurePassword(50);
      // No special chars that could cause shell/docker-compose issues
      expect(password).not.toMatch(/[$`'"\\!@#%^&*(){}\[\]|;:<>?,./~]/);
    }
  });
});

describe('transformEmailForDatabaseLookup', () => {
  const originalEnv = process.env.ENVIRONMENT;

  afterEach(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('in dev environment', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'dev';
    });

    it('transforms @tamshai.local to @tamshai.com', () => {
      const result = transformEmailForDatabaseLookup('alice@tamshai.local');
      expect(result).toBe('alice@tamshai.com');
    });

    it('transforms email with subdomain correctly', () => {
      const result = transformEmailForDatabaseLookup('bob.smith@tamshai.local');
      expect(result).toBe('bob.smith@tamshai.com');
    });

    it('leaves non-tamshai.local emails unchanged', () => {
      const result = transformEmailForDatabaseLookup('user@example.com');
      expect(result).toBe('user@example.com');
    });

    it('leaves @tamshai.com emails unchanged (already in DB format)', () => {
      const result = transformEmailForDatabaseLookup('alice@tamshai.com');
      expect(result).toBe('alice@tamshai.com');
    });
  });

  describe('in stage environment', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'stage';
    });

    it('leaves emails unchanged', () => {
      const result = transformEmailForDatabaseLookup('alice@tamshai.local');
      expect(result).toBe('alice@tamshai.local');
    });

    it('leaves @tamshai.com emails unchanged', () => {
      const result = transformEmailForDatabaseLookup('alice@tamshai.com');
      expect(result).toBe('alice@tamshai.com');
    });
  });

  describe('in prod environment', () => {
    beforeEach(() => {
      process.env.ENVIRONMENT = 'prod';
    });

    it('leaves emails unchanged', () => {
      const result = transformEmailForDatabaseLookup('alice@tamshai.com');
      expect(result).toBe('alice@tamshai.com');
    });
  });

  describe('when ENVIRONMENT is unset (defaults to dev)', () => {
    beforeEach(() => {
      delete process.env.ENVIRONMENT;
    });

    it('transforms @tamshai.local to @tamshai.com', () => {
      const result = transformEmailForDatabaseLookup('eve@tamshai.local');
      expect(result).toBe('eve@tamshai.com');
    });
  });
});
