# Keycloak Atomic Migration - QA Test Strategy

**Issue**: #62
**Author**: Claude-QA (claude-qa@tamshai.com)
**Created**: 2026-01-01
**Updated**: 2026-01-01 (QA Review Fixes)
**Status**: Ready for Implementation
**Related**: `Keycloak-Atomic-Dev.md`

---

## QA Review Notes (2026-01-01)

This document has been updated based on QA review to address:

1. **P1 - Typed Mocks**: Replaced `any` types with properly typed mock factories
2. **P1 - Dependency Injection**: Tests now use constructor injection for KcAdminClient
3. **P2 - Test Isolation**: Decoupling test uses isolated DB connection
4. **P2 - Role Failure Test**: Added compensating transaction test
5. **P3 - Re-enable Protection**: Added test for blocked deletion of re-enabled users
6. **P3 - Worker Execution Test**: Added BullMQ worker test
7. **P3 - Unique Emails**: All test emails now use UUIDs

---

## Overview

This document defines the TDD test strategy for the Keycloak Atomic Migration. Tests should be written BEFORE implementation (Red Phase) to ensure all acceptance criteria are met.

### Test Categories

| Category | Type | Purpose |
|----------|------|---------|
| Unit Tests | Jest | Test IdentityService methods in isolation |
| Integration Tests | Jest + Testcontainers | Test full flow with real Keycloak/PostgreSQL |
| E2E Tests | Playwright | Test API endpoints end-to-end |

---

## Test File Structure

```
services/mcp-hr/
├── src/
│   ├── services/
│   │   └── identity.ts
│   └── workers/
│       └── identity-cleanup.ts
└── tests/
    ├── unit/
    │   └── identity.test.ts
    ├── integration/
    │   └── identity-provisioning.test.ts
    └── test-utils/
        ├── index.ts
        ├── mock-keycloak-admin.ts    # Typed KcAdminClient mock factory
        ├── mock-db.ts                # Typed Pool/PoolClient mock factory
        └── mock-queue.ts             # Typed BullMQ mock factory
```

---

## Phase 1: Unit Tests (Red Phase)

### 1.1 Mock Factories (Required)

**File**: `services/mcp-hr/tests/test-utils/mock-keycloak-admin.ts`

Create typed mock factories to avoid `any` types and ensure type safety:

```typescript
import type KcAdminClient from '@keycloak/keycloak-admin-client';
import type { UserRepresentation, RoleRepresentation, ClientRepresentation } from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';

/**
 * Typed mock for KcAdminClient.users methods
 */
export interface MockKeycloakUsers {
  create: jest.Mock<Promise<{ id: string }>, [Partial<UserRepresentation>]>;
  update: jest.Mock<Promise<void>, [{ id: string }, Partial<UserRepresentation>]>;
  del: jest.Mock<Promise<void>, [{ id: string }]>;
  findOne: jest.Mock<Promise<UserRepresentation | null>, [{ id: string }]>;
  find: jest.Mock<Promise<UserRepresentation[]>, [{ email?: string; search?: string }]>;
  addClientRoleMappings: jest.Mock<Promise<void>, [{ id: string; clientUniqueId: string; roles: RoleRepresentation[] }]>;
  listClientRoleMappings: jest.Mock<Promise<RoleRepresentation[]>, [{ id: string; clientUniqueId: string }]>;
  listSessions: jest.Mock<Promise<{ id: string }[]>, [{ id: string }]>;
  logout: jest.Mock<Promise<void>, [{ id: string }]>;
}

/**
 * Typed mock for KcAdminClient.clients methods
 */
export interface MockKeycloakClients {
  listRoles: jest.Mock<Promise<RoleRepresentation[]>, [{ id: string }]>;
}

/**
 * Typed mock for KcAdminClient
 */
export interface MockKcAdminClient {
  users: MockKeycloakUsers;
  clients: MockKeycloakClients;
  auth: jest.Mock<Promise<void>, [{ grantType: string; clientId: string; clientSecret: string }]>;
  setConfig: jest.Mock<void, [{ realmName: string }]>;
}

/**
 * Factory function to create a typed KcAdminClient mock
 */
export function createMockKcAdmin(): MockKcAdminClient {
  return {
    users: {
      create: jest.fn().mockResolvedValue({ id: 'kc-user-default' }),
      update: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      addClientRoleMappings: jest.fn().mockResolvedValue(undefined),
      listClientRoleMappings: jest.fn().mockResolvedValue([]),
      listSessions: jest.fn().mockResolvedValue([]),
      logout: jest.fn().mockResolvedValue(undefined),
    },
    clients: {
      listRoles: jest.fn().mockResolvedValue([]),
    },
    auth: jest.fn().mockResolvedValue(undefined),
    setConfig: jest.fn(),
  };
}

/**
 * Reset all mocks in a MockKcAdminClient instance
 */
export function resetMockKcAdmin(mock: MockKcAdminClient): void {
  Object.values(mock.users).forEach(fn => fn.mockReset());
  Object.values(mock.clients).forEach(fn => fn.mockReset());
  mock.auth.mockReset();
  mock.setConfig.mockReset();
}
```

**File**: `services/mcp-hr/tests/test-utils/mock-db.ts`

```typescript
import type { Pool, PoolClient, QueryResult } from 'pg';

export interface MockPoolClient {
  query: jest.Mock<Promise<QueryResult>, [string, unknown[]?]>;
  release: jest.Mock<void, []>;
}

export interface MockPool {
  query: jest.Mock<Promise<QueryResult>, [string, unknown[]?]>;
  connect: jest.Mock<Promise<MockPoolClient>, []>;
  end: jest.Mock<Promise<void>, []>;
}

export function createMockPoolClient(): MockPoolClient {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
}

export function createMockPool(mockClient?: MockPoolClient): MockPool {
  const client = mockClient || createMockPoolClient();
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: jest.fn().mockResolvedValue(client),
    end: jest.fn().mockResolvedValue(undefined),
  };
}
```

**File**: `services/mcp-hr/tests/test-utils/mock-queue.ts`

```typescript
import type { Queue, Job } from 'bullmq';

export interface MockQueue {
  add: jest.Mock<Promise<Job>, [string, unknown, { delay?: number }]>;
  close: jest.Mock<Promise<void>, []>;
}

export function createMockQueue(): MockQueue {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-123' } as Job),
    close: jest.fn().mockResolvedValue(undefined),
  };
}
```

---

### 1.2 Unit Tests

**File**: `services/mcp-hr/tests/unit/identity.test.ts`

Write these tests FIRST. They should all FAIL until implementation is complete.

```typescript
import { IdentityService, EmployeeData } from '../../src/services/identity';
import {
  createMockKcAdmin,
  resetMockKcAdmin,
  MockKcAdminClient,
} from '../test-utils/mock-keycloak-admin';
import {
  createMockPool,
  createMockPoolClient,
  MockPool,
  MockPoolClient,
} from '../test-utils/mock-db';
import { createMockQueue, MockQueue } from '../test-utils/mock-queue';

// Mock dependencies
jest.mock('@keycloak/keycloak-admin-client');
jest.mock('bullmq');

describe('IdentityService', () => {
  let identityService: IdentityService;
  let mockDb: MockPool;
  let mockClient: MockPoolClient;
  let mockKcAdmin: MockKcAdminClient;
  let mockQueue: MockQueue;

  beforeEach(() => {
    // Create fresh mocks for each test (test isolation)
    mockClient = createMockPoolClient();
    mockDb = createMockPool(mockClient);
    mockKcAdmin = createMockKcAdmin();
    mockQueue = createMockQueue();

    // Inject mocks via constructor (dependency injection pattern)
    identityService = new IdentityService(
      mockDb as unknown as import('pg').Pool,
      mockKcAdmin as unknown as import('@keycloak/keycloak-admin-client').default,
      mockQueue as unknown as import('bullmq').Queue
    );
  });

  afterEach(() => {
    resetMockKcAdmin(mockKcAdmin);
    jest.clearAllMocks();
  });

  describe('createUserInKeycloak', () => {
    const employeeData: EmployeeData = {
      id: 'emp-123',
      email: 'alice@tamshai.com',
      firstName: 'Alice',
      lastName: 'Chen',
      department: 'HR',
    };

    it('should create user in Keycloak with correct attributes', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.clients.listRoles.mockResolvedValue([
        { id: 'role-1', name: 'hr-read' },
      ]);
      mockKcAdmin.users.addClientRoleMappings.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await identityService.createUserInKeycloak(employeeData, mockClient);

      expect(result).toBe('kc-user-123');
      expect(mockKcAdmin.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'alice@tamshai.com',
          email: 'alice@tamshai.com',
          firstName: 'Alice',
          lastName: 'Chen',
          enabled: true,
          attributes: {
            employeeId: ['emp-123'],
            department: ['HR'],
          },
        })
      );
    });

    it('should assign department role to user', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.clients.listRoles.mockResolvedValue([
        { id: 'role-hr-read', name: 'hr-read' },
      ]);
      mockKcAdmin.users.addClientRoleMappings.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({ rows: [] });

      await identityService.createUserInKeycloak(employeeData, mockClient);

      expect(mockKcAdmin.users.addClientRoleMappings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kc-user-123',
          roles: [{ id: 'role-hr-read', name: 'hr-read' }],
        })
      );
    });

    it('should update employee record with Keycloak user ID', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue({ rows: [] });

      await identityService.createUserInKeycloak(employeeData, mockClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE hr.employees SET keycloak_user_id'),
        ['kc-user-123', 'emp-123']
      );
    });

    it('should write audit log entry for USER_CREATED', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue({ rows: [] });

      await identityService.createUserInKeycloak(employeeData, mockClient);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.audit_access_logs'),
        expect.arrayContaining(['emp-123', 'kc-user-123'])
      );
    });

    it('should throw error if Keycloak creation fails', async () => {
      mockKcAdmin.users.create.mockRejectedValue(new Error('Keycloak unavailable'));

      await expect(
        identityService.createUserInKeycloak(employeeData, mockClient)
      ).rejects.toThrow('Failed to provision Keycloak user: Keycloak unavailable');
    });

    it('should NOT write audit log if Keycloak creation fails', async () => {
      mockKcAdmin.users.create.mockRejectedValue(new Error('Keycloak unavailable'));

      try {
        await identityService.createUserInKeycloak(employeeData, mockClient);
      } catch (e) {
        // Expected
      }

      // Audit log should NOT be written on failure
      const auditLogCalls = mockClient.query.mock.calls.filter(
        (call: [string, unknown[]?]) => call[0].includes('audit_access_logs')
      );
      expect(auditLogCalls).toHaveLength(0);
    });

    it('should rollback Keycloak user if role assignment fails (compensating transaction)', async () => {
      // User creation succeeds
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      // Role lookup succeeds
      mockKcAdmin.clients.listRoles.mockResolvedValue([
        { id: 'role-hr-read', name: 'hr-read' },
      ]);
      // Role assignment fails
      mockKcAdmin.users.addClientRoleMappings.mockRejectedValue(
        new Error('Role assignment failed')
      );

      await expect(
        identityService.createUserInKeycloak(employeeData, mockClient)
      ).rejects.toThrow('Failed to provision Keycloak user');

      // Critical: Keycloak user should be deleted as compensating transaction
      expect(mockKcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-user-123' });

      // Audit log should NOT be written on failure
      const auditLogCalls = mockClient.query.mock.calls.filter(
        (call: [string, unknown[]?]) => call[0].includes('audit_access_logs')
      );
      expect(auditLogCalls).toHaveLength(0);
    });

    it('should handle missing department role gracefully', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      // No roles found for department
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      // Should succeed but without role assignment
      const result = await identityService.createUserInKeycloak(employeeData, mockClient);

      expect(result).toBe('kc-user-123');
      // Role assignment should NOT be called
      expect(mockKcAdmin.users.addClientRoleMappings).not.toHaveBeenCalled();
    });
  });

  describe('terminateUser', () => {
    beforeEach(() => {
      mockDb.query.mockResolvedValue({
        rows: [{ keycloak_user_id: 'kc-user-456', email: 'bob@tamshai.com' }],
      });
      mockKcAdmin.users.listClientRoleMappings.mockResolvedValue([
        { name: 'finance-read' },
        { name: 'finance-write' },
      ]);
      mockKcAdmin.users.listSessions.mockResolvedValue([
        { id: 'session-1' },
        { id: 'session-2' },
      ]);
      mockKcAdmin.users.update.mockResolvedValue(undefined);
      mockKcAdmin.users.logout.mockResolvedValue(undefined);
    });

    it('should disable user in Keycloak immediately', async () => {
      await identityService.terminateUser('emp-456');

      expect(mockKcAdmin.users.update).toHaveBeenCalledWith(
        { id: 'kc-user-456' },
        { enabled: false }
      );
    });

    it('should revoke all active sessions', async () => {
      const result = await identityService.terminateUser('emp-456');

      expect(mockKcAdmin.users.logout).toHaveBeenCalledWith({ id: 'kc-user-456' });
      expect(result.sessionsRevoked).toBe(2);
    });

    it('should write permissions snapshot to audit log', async () => {
      await identityService.terminateUser('emp-456');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.audit_access_logs'),
        expect.arrayContaining([
          'emp-456',
          'USER_TERMINATED',
          'kc-user-456',
          expect.stringContaining('finance-read'),
        ])
      );
    });

    it('should update employee status to terminated', async () => {
      await identityService.terminateUser('emp-456');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'terminated'"),
        ['emp-456']
      );
    });

    it('should schedule deletion job for 72 hours later', async () => {
      const mockQueue = (identityService as any).cleanupQueue;

      const result = await identityService.terminateUser('emp-456');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'delete_user_final',
        { keycloakUserId: 'kc-user-456', employeeId: 'emp-456' },
        { delay: 72 * 60 * 60 * 1000 }
      );

      // Verify scheduled deletion is 72 hours from now
      const expectedTime = Date.now() + 72 * 60 * 60 * 1000;
      expect(result.scheduledDeletionAt.getTime()).toBeCloseTo(expectedTime, -4);
    });

    it('should throw error if employee not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        identityService.terminateUser('non-existent')
      ).rejects.toThrow('Employee non-existent not found');
    });

    it('should throw error if employee has no Keycloak user', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ keycloak_user_id: null, email: 'no-kc@tamshai.com' }],
      });

      await expect(
        identityService.terminateUser('emp-no-kc')
      ).rejects.toThrow('has no Keycloak user');
    });
  });

  describe('deleteUserPermanently', () => {
    it('should delete disabled user from Keycloak', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({ id: 'kc-user-789', enabled: false });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue({ rows: [] });

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      expect(mockKcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-user-789' });
    });

    it('should update employee status to deleted', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({ id: 'kc-user-789', enabled: false });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue({ rows: [] });

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'deleted'"),
        ['emp-789']
      );
    });

    it('should write USER_DELETED audit log', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({ id: 'kc-user-789', enabled: false });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue({ rows: [] });

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('USER_DELETED'),
        expect.arrayContaining(['emp-789', 'kc-user-789'])
      );
    });

    it('should NOT delete enabled user (safety check)', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({ id: 'kc-user-789', enabled: true });

      await expect(
        identityService.deleteUserPermanently('kc-user-789', 'emp-789')
      ).rejects.toThrow('Cannot delete enabled user');

      expect(mockKcAdmin.users.del).not.toHaveBeenCalled();
    });

    it('should handle already-deleted user gracefully', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue(null);

      // Should NOT throw
      await identityService.deleteUserPermanently('kc-user-gone', 'emp-gone');

      expect(mockKcAdmin.users.del).not.toHaveBeenCalled();
    });

    it('should log blocked deletion when user was re-enabled (termination reversal)', async () => {
      // User was re-enabled after termination (accidental termination reversal)
      mockKcAdmin.users.findOne.mockResolvedValue({
        id: 'kc-user-reversed',
        enabled: true,
        email: 'reversed@tamshai.com',
      });

      await expect(
        identityService.deleteUserPermanently('kc-user-reversed', 'emp-reversed')
      ).rejects.toThrow('Cannot delete enabled user');

      // Verify deletion was NOT attempted
      expect(mockKcAdmin.users.del).not.toHaveBeenCalled();

      // Verify audit log records the blocked deletion attempt
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETION_BLOCKED'),
        expect.arrayContaining(['emp-reversed', 'kc-user-reversed'])
      );
    });
  });
});
```

---

### 1.3 Worker Unit Tests

**File**: `services/mcp-hr/tests/unit/identity-cleanup-worker.test.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { IdentityService } from '../../src/services/identity';
import { startIdentityCleanupWorker } from '../../src/workers/identity-cleanup';
import { createMockPool, MockPool } from '../test-utils/mock-db';
import { createMockKcAdmin, MockKcAdminClient } from '../test-utils/mock-keycloak-admin';

jest.mock('bullmq');
jest.mock('../../src/services/identity');

describe('Identity Cleanup Worker', () => {
  let mockDb: MockPool;
  let mockIdentityService: jest.Mocked<IdentityService>;

  beforeEach(() => {
    mockDb = createMockPool();
    mockIdentityService = {
      deleteUserPermanently: jest.fn().mockResolvedValue(undefined),
      authenticate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IdentityService>;

    (IdentityService as jest.Mock).mockImplementation(() => mockIdentityService);
  });

  it('should process delete_user_final job after 72 hours', async () => {
    const worker = startIdentityCleanupWorker(mockDb as unknown as import('pg').Pool);

    // Simulate job execution
    const mockJob: Partial<Job> = {
      id: 'job-456',
      data: {
        keycloakUserId: 'kc-user-to-delete',
        employeeId: 'emp-to-delete',
      },
      timestamp: Date.now() - 72 * 60 * 60 * 1000, // 72 hours ago
    };

    // Get the processor function and call it directly
    const processor = (Worker as jest.Mock).mock.calls[0][1];
    await processor(mockJob as Job);

    expect(mockIdentityService.deleteUserPermanently).toHaveBeenCalledWith(
      'kc-user-to-delete',
      'emp-to-delete'
    );
  });

  it('should handle deletion failure gracefully', async () => {
    mockIdentityService.deleteUserPermanently.mockRejectedValue(
      new Error('Keycloak unavailable')
    );

    const worker = startIdentityCleanupWorker(mockDb as unknown as import('pg').Pool);

    const mockJob: Partial<Job> = {
      id: 'job-fail',
      data: {
        keycloakUserId: 'kc-user-fail',
        employeeId: 'emp-fail',
      },
    };

    const processor = (Worker as jest.Mock).mock.calls[0][1];

    // Should throw so BullMQ can retry
    await expect(processor(mockJob as Job)).rejects.toThrow('Keycloak unavailable');
  });
});
```

---

## Phase 2: Integration Tests

**File**: `services/mcp-hr/tests/integration/identity-provisioning.test.ts`

These tests require running Keycloak and PostgreSQL containers.

```typescript
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import { IdentityService } from '../../src/services/identity';

describe('Identity Provisioning (Atomic Architecture)', () => {
  let postgresContainer: StartedTestContainer;
  let keycloakContainer: StartedTestContainer;
  let db: Pool;
  let kcAdmin: KcAdminClient;
  let identityService: IdentityService;

  // Increase timeout for container startup
  jest.setTimeout(120000);

  beforeAll(async () => {
    // Start PostgreSQL
    postgresContainer = await new GenericContainer('postgres:15')
      .withEnvironment({
        POSTGRES_DB: 'tamshai_hr',
        POSTGRES_USER: 'tamshai',
        POSTGRES_PASSWORD: 'testpass',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready'))
      .start();

    // Start Keycloak
    keycloakContainer = await new GenericContainer('quay.io/keycloak/keycloak:24.0')
      .withEnvironment({
        KEYCLOAK_ADMIN: 'admin',
        KEYCLOAK_ADMIN_PASSWORD: 'admin',
        KC_HEALTH_ENABLED: 'true',
      })
      .withCommand(['start-dev'])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp('/health/ready', 8080).forStatusCode(200))
      .start();

    // Initialize PostgreSQL connection
    db = new Pool({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      database: 'tamshai_hr',
      user: 'tamshai',
      password: 'testpass',
    });

    // Run migrations
    await db.query(`
      CREATE SCHEMA IF NOT EXISTS hr;

      CREATE TABLE hr.employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(100),
        role VARCHAR(100),
        manager_id UUID,
        status VARCHAR(20) DEFAULT 'active',
        terminated_at TIMESTAMP WITH TIME ZONE,
        keycloak_user_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE hr.audit_access_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        keycloak_user_id VARCHAR(255),
        permissions_snapshot JSONB,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by VARCHAR(255)
      );
    `);

    // Initialize Keycloak admin client
    kcAdmin = new KcAdminClient({
      baseUrl: `http://${keycloakContainer.getHost()}:${keycloakContainer.getMappedPort(8080)}`,
      realmName: 'master',
    });

    await kcAdmin.auth({
      grantType: 'password',
      clientId: 'admin-cli',
      username: 'admin',
      password: 'admin',
    });

    // Create test realm
    await kcAdmin.realms.create({
      realm: 'tamshai-corp',
      enabled: true,
    });

    // Create mcp-gateway client with roles
    const client = await kcAdmin.clients.create({
      realm: 'tamshai-corp',
      clientId: 'mcp-gateway',
      enabled: true,
      serviceAccountsEnabled: true,
    });

    // Create department roles
    for (const role of ['hr-read', 'hr-write', 'finance-read', 'finance-write']) {
      await kcAdmin.clients.createRole({
        id: client.id!,
        name: role,
      });
    }

    // Create service account client for mcp-hr
    await kcAdmin.clients.create({
      realm: 'tamshai-corp',
      clientId: 'mcp-hr-service-account',
      enabled: true,
      serviceAccountsEnabled: true,
      clientAuthenticatorType: 'client-secret',
    });

    // Initialize IdentityService with test config
    process.env.KEYCLOAK_URL = `http://${keycloakContainer.getHost()}:${keycloakContainer.getMappedPort(8080)}`;
    process.env.KEYCLOAK_REALM = 'tamshai-corp';
    process.env.KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_ID = 'mcp-hr-service-account';
    process.env.KEYCLOAK_HR_SERVICE_ACCOUNT_CLIENT_SECRET = 'test-secret';

    identityService = new IdentityService(db);
  });

  afterAll(async () => {
    await db.end();
    await postgresContainer.stop();
    await keycloakContainer.stop();
  });

  describe('Decoupling Test', () => {
    // Use isolated DB connection for this test to avoid polluting shared state
    let isolatedDb: Pool;
    let isolatedIdentityService: IdentityService;

    beforeEach(async () => {
      isolatedDb = new Pool({
        host: postgresContainer.getHost(),
        port: postgresContainer.getMappedPort(5432),
        database: 'tamshai_hr',
        user: 'tamshai',
        password: 'testpass',
      });
      isolatedIdentityService = new IdentityService(isolatedDb);
    });

    afterEach(async () => {
      // Clean up isolated connection (not shared db)
      try {
        await isolatedDb.end();
      } catch (e) {
        // Already closed in test
      }
    });

    it('should allow Keycloak login when HR DB is down', async () => {
      // Use UUID for unique test email
      const testEmail = `decoupling-${crypto.randomUUID()}@tamshai.com`;

      // 1. Create user while DB is up
      const client = await isolatedDb.connect();
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
        ['Decoupling Test User', testEmail, 'HR']
      );

      await isolatedIdentityService.createUserInKeycloak(
        {
          id: result.rows[0].id,
          email: testEmail,
          firstName: 'Decoupling',
          lastName: 'Test User',
          department: 'HR',
        },
        client
      );

      await client.query('COMMIT');
      client.release();

      // 2. Simulate HR DB outage by closing ISOLATED connection (not shared db)
      await isolatedDb.end();

      // 3. Verify Keycloak user still exists and can be found
      kcAdmin.setConfig({ realmName: 'tamshai-corp' });
      const users = await kcAdmin.users.find({ email: testEmail });

      expect(users).toHaveLength(1);
      expect(users[0].enabled).toBe(true);

      // Note: Shared db connection remains intact for other tests
    });
  });

  describe('Onboarding Transaction', () => {
    it('should create Keycloak user when employee created', async () => {
      // Use UUID for unique test email
      const testEmail = `alice-${crypto.randomUUID()}@tamshai.com`;

      const client = await db.connect();
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO hr.employees (name, email, department, role) VALUES ($1, $2, $3, $4) RETURNING *`,
        ['Alice Chen', testEmail, 'HR', 'Manager']
      );

      const employee = result.rows[0];

      await identityService.createUserInKeycloak(
        {
          id: employee.id,
          email: testEmail,
          firstName: 'Alice',
          lastName: 'Chen',
          department: 'HR',
        },
        client
      );

      await client.query('COMMIT');
      client.release();

      // Verify Keycloak user exists
      kcAdmin.setConfig({ realmName: 'tamshai-corp' });
      const users = await kcAdmin.users.find({ email: testEmail });

      expect(users).toHaveLength(1);
      expect(users[0].enabled).toBe(true);
      expect(users[0].firstName).toBe('Alice');
      expect(users[0].lastName).toBe('Chen');
    });

    it('should rollback HR record if Keycloak creation fails', async () => {
      // Use UUID for unique test email
      const duplicateEmail = `duplicate-${crypto.randomUUID()}@tamshai.com`;

      const client = await db.connect();

      try {
        await client.query('BEGIN');

        const result = await client.query(
          `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
          ['Will Fail', duplicateEmail, 'HR']
        );

        // Create user first time (will succeed)
        await identityService.createUserInKeycloak(
          {
            id: result.rows[0].id,
            email: duplicateEmail,
            firstName: 'Will',
            lastName: 'Fail',
            department: 'HR',
          },
          client
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
      }
      client.release();

      // Now try to create duplicate - should fail
      const client2 = await db.connect();

      try {
        await client2.query('BEGIN');

        const result2 = await client2.query(
          `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
          ['Duplicate User', duplicateEmail, 'HR']
        );

        // This should fail because email already exists in Keycloak
        await identityService.createUserInKeycloak(
          {
            id: result2.rows[0].id,
            email: duplicateEmail,
            firstName: 'Duplicate',
            lastName: 'User',
            department: 'HR',
          },
          client2
        );

        await client2.query('COMMIT');
        fail('Should have thrown error');
      } catch (e) {
        await client2.query('ROLLBACK');

        // Verify HR record was NOT created (check by unique email, not name)
        const employees = await db.query(
          `SELECT * FROM hr.employees WHERE email = $1 AND name = 'Duplicate User'`,
          [duplicateEmail]
        );
        expect(employees.rows).toHaveLength(0);
      } finally {
        client2.release();
      }
    });
  });

  describe('Kill Switch (Offboarding)', () => {
    let employeeId: string;

    beforeEach(async () => {
      // Create test employee
      const client = await db.connect();
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
        ['Dan Williams', `dan-${crypto.randomUUID()}@tamshai.com`, 'Finance']
      );

      employeeId = result.rows[0].id;

      await identityService.createUserInKeycloak(
        {
          id: employeeId,
          email: result.rows[0].email,
          firstName: 'Dan',
          lastName: 'Williams',
          department: 'Finance',
        },
        client
      );

      await client.query('COMMIT');
      client.release();
    });

    it('should immediately disable user and revoke sessions on termination', async () => {
      const result = await identityService.terminateUser(employeeId);

      expect(result.success).toBe(true);

      // Verify Keycloak user is disabled
      const employee = await db.query(
        `SELECT keycloak_user_id FROM hr.employees WHERE id = $1`,
        [employeeId]
      );

      kcAdmin.setConfig({ realmName: 'tamshai-corp' });
      const kcUser = await kcAdmin.users.findOne({
        id: employee.rows[0].keycloak_user_id,
      });

      expect(kcUser?.enabled).toBe(false);
    });

    it('should write permissions snapshot to audit log', async () => {
      await identityService.terminateUser(employeeId);

      const auditLog = await db.query(
        `SELECT * FROM hr.audit_access_logs WHERE employee_id = $1 AND action = 'USER_TERMINATED'`,
        [employeeId]
      );

      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].permissions_snapshot).toBeDefined();
      expect(auditLog.rows[0].permissions_snapshot.timestamp).toBeDefined();
    });

    it('should update employee status to terminated', async () => {
      await identityService.terminateUser(employeeId);

      const employee = await db.query(
        `SELECT status, terminated_at FROM hr.employees WHERE id = $1`,
        [employeeId]
      );

      expect(employee.rows[0].status).toBe('terminated');
      expect(employee.rows[0].terminated_at).toBeDefined();
    });
  });

  describe('72-Hour Data Retention', () => {
    it('should keep disabled user for 72 hours before deletion', async () => {
      // Create and terminate user
      const client = await db.connect();
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
        ['Eve Thompson', `eve-${crypto.randomUUID()}@tamshai.com`, 'HR']
      );

      const employeeId = result.rows[0].id;

      await identityService.createUserInKeycloak(
        {
          id: employeeId,
          email: result.rows[0].email,
          firstName: 'Eve',
          lastName: 'Thompson',
          department: 'HR',
        },
        client
      );

      await client.query('COMMIT');
      client.release();

      // Terminate user
      const terminationResult = await identityService.terminateUser(employeeId);

      // Verify scheduled deletion is ~72 hours in future
      const now = Date.now();
      const scheduledTime = terminationResult.scheduledDeletionAt.getTime();
      const delayMs = scheduledTime - now;

      // Should be approximately 72 hours (with 1 minute tolerance)
      expect(delayMs).toBeGreaterThan(72 * 60 * 60 * 1000 - 60000);
      expect(delayMs).toBeLessThan(72 * 60 * 60 * 1000 + 60000);

      // User should still exist (disabled) in Keycloak
      const employee = await db.query(
        `SELECT keycloak_user_id FROM hr.employees WHERE id = $1`,
        [employeeId]
      );

      kcAdmin.setConfig({ realmName: 'tamshai-corp' });
      const kcUser = await kcAdmin.users.findOne({
        id: employee.rows[0].keycloak_user_id,
      });

      expect(kcUser).toBeDefined();
      expect(kcUser?.enabled).toBe(false);
    });

    it('should permanently delete user after 72 hours', async () => {
      // Create and terminate user
      const client = await db.connect();
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO hr.employees (name, email, department) VALUES ($1, $2, $3) RETURNING *`,
        ['Frank Davis', `frank-${crypto.randomUUID()}@tamshai.com`, 'Support']
      );

      const employeeId = result.rows[0].id;

      await identityService.createUserInKeycloak(
        {
          id: employeeId,
          email: result.rows[0].email,
          firstName: 'Frank',
          lastName: 'Davis',
          department: 'Support',
        },
        client
      );

      await client.query('COMMIT');
      client.release();

      // Terminate user
      await identityService.terminateUser(employeeId);

      // Get Keycloak user ID
      const employee = await db.query(
        `SELECT keycloak_user_id FROM hr.employees WHERE id = $1`,
        [employeeId]
      );

      const keycloakUserId = employee.rows[0].keycloak_user_id;

      // Simulate 72-hour delay by calling deleteUserPermanently directly
      await identityService.deleteUserPermanently(keycloakUserId, employeeId);

      // Verify user is gone from Keycloak
      kcAdmin.setConfig({ realmName: 'tamshai-corp' });
      const kcUser = await kcAdmin.users.findOne({ id: keycloakUserId });

      expect(kcUser).toBeNull();

      // Verify employee status is 'deleted'
      const updatedEmployee = await db.query(
        `SELECT status FROM hr.employees WHERE id = $1`,
        [employeeId]
      );

      expect(updatedEmployee.rows[0].status).toBe('deleted');

      // Verify deletion logged
      const auditLog = await db.query(
        `SELECT * FROM hr.audit_access_logs WHERE employee_id = $1 AND action = 'USER_DELETED'`,
        [employeeId]
      );

      expect(auditLog.rows).toHaveLength(1);
    });
  });
});
```

---

## Phase 3: API E2E Tests

> **⚠️ TODO: Complete E2E Setup**
>
> E2E tests require a running mcp-hr service with real Keycloak integration.
> Consider deferring E2E tests to Phase 2 after unit and integration tests pass.
>
> Prerequisites:
> - Running mcp-hr service (via `docker compose up mcp-hr`)
> - Admin token from Keycloak
> - Test employee fixtures
> - Unique email generation for parallel test execution

**File**: `services/mcp-hr/tests/e2e/employees-api.test.ts`

```typescript
import request from 'supertest';
import { getAdminToken } from '../test-utils/keycloak-auth';

describe('Employees API - Identity Provisioning', () => {
  let adminToken: string;
  let app: Express.Application;
  let employeeId: string;

  beforeAll(async () => {
    // TODO: Initialize app and get admin token
    // This requires running Keycloak and mcp-hr services
    adminToken = await getAdminToken();
    app = (await import('../../src/app')).default;
  });

  describe('POST /api/hr/employees', () => {
    it('should create employee and provision Keycloak user atomically', async () => {
      // Use UUID for unique test email
      const testEmail = `e2e-new-${crypto.randomUUID()}@tamshai.com`;

      const response = await request(app)
        .post('/api/hr/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E New Employee',
          email: testEmail,
          department: 'Sales',
          role: 'Associate',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.metadata.keycloakProvisioned).toBe(true);

      // Store for terminate test
      employeeId = response.body.data.id;
    });

    it('should return error and not create employee if Keycloak fails', async () => {
      // This test requires mocking Keycloak unavailability
      // Consider using a feature flag or dedicated test endpoint
      const testEmail = `e2e-fail-${crypto.randomUUID()}@tamshai.com`;

      const response = await request(app)
        .post('/api/hr/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Test-Keycloak-Fail', 'true') // Test header to simulate failure
        .send({
          name: 'Should Fail',
          email: testEmail,
          department: 'HR',
        });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('PROVISIONING_FAILED');
    });
  });

  describe('POST /api/hr/employees/:id/terminate', () => {
    it('should terminate employee and return session revocation count', async () => {
      // Requires employeeId from previous test
      expect(employeeId).toBeDefined();

      const response = await request(app)
        .post(`/api/hr/employees/${employeeId}/terminate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.sessionsRevoked).toBeGreaterThanOrEqual(0);
      expect(response.body.data.scheduledDeletionAt).toBeDefined();

      // Verify scheduled deletion is ~72 hours in future
      const scheduledTime = new Date(response.body.data.scheduledDeletionAt).getTime();
      const now = Date.now();
      const delayMs = scheduledTime - now;
      expect(delayMs).toBeGreaterThan(71 * 60 * 60 * 1000); // > 71 hours
      expect(delayMs).toBeLessThan(73 * 60 * 60 * 1000); // < 73 hours
    });
  });
});
```

---

## Test Execution Commands

```bash
cd services/mcp-hr

# Unit tests (fast, no containers)
npm test -- tests/unit/identity.test.ts

# Integration tests (requires Docker)
npm run test:integration -- tests/integration/identity-provisioning.test.ts

# All tests with coverage
npm test -- --coverage --collectCoverageFrom='src/services/identity.ts'

# Watch mode for TDD
npm test -- --watch tests/unit/identity.test.ts
```

---

## Coverage Requirements

| File | Target | Notes |
|------|--------|-------|
| `src/services/identity.ts` | 90%+ | All public methods tested |
| `src/workers/identity-cleanup.ts` | 85%+ | Job processing logic |
| `src/routes/employees.ts` | 80%+ | API endpoint coverage |

---

## Test Data Management

### Test Email Generation

All test emails MUST use UUIDs to prevent conflicts during parallel test execution:

```typescript
// ✅ CORRECT: Unique email per test run
const testEmail = `alice-${crypto.randomUUID()}@tamshai.com`;

// ❌ WRONG: Static email causes conflicts
const testEmail = 'alice@tamshai.com';
```

### Test Users for Integration Tests

| Name Pattern | Email Pattern | Department | Purpose |
|--------------|---------------|------------|---------|
| Decoupling Test User | `decoupling-{uuid}@tamshai.com` | HR | Decoupling test |
| Alice Chen | `alice-{uuid}@tamshai.com` | HR | Onboarding test |
| Dan Williams | `dan-{uuid}@tamshai.com` | Finance | Kill switch test |
| Eve Thompson | `eve-{uuid}@tamshai.com` | HR | Retention test |
| Frank Davis | `frank-{uuid}@tamshai.com` | Support | Deletion test |

### Cleanup

Integration tests should clean up after themselves using pattern matching:

```typescript
afterEach(async () => {
  // Clean up test users from Keycloak (match UUID pattern)
  kcAdmin.setConfig({ realmName: 'tamshai-corp' });
  const users = await kcAdmin.users.find({ search: '@tamshai.com' });
  await Promise.all(
    users
      .filter(u => u.email?.includes('-') && u.email?.endsWith('@tamshai.com'))
      .map(u => kcAdmin.users.del({ id: u.id! }))
  );

  // Clean up test employees from DB (match UUID pattern)
  await db.query(`
    DELETE FROM hr.employees
    WHERE email ~ '^[a-z]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@tamshai.com$'
  `);
  await db.query(`DELETE FROM hr.audit_access_logs`);
});
```

---

## Success Criteria

All tests must pass before implementation is considered complete:

- [ ] **Unit Tests**: 100% of unit tests pass
- [ ] **Integration Tests**: 100% of integration tests pass
- [ ] **Coverage**: 90%+ on `identity.ts`
- [ ] **CI Pipeline**: All tests pass in GitHub Actions
- [ ] **No Flaky Tests**: Tests must be deterministic (no timing issues)

---

**Next**: Implementation in `Keycloak-Atomic-Dev.md`
