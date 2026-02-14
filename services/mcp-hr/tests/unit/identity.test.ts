/**
 * Unit tests for IdentityService
 *
 * TDD Red Phase: These tests should FAIL until implementation is complete.
 *
 * @see .specify/Keycloak-Atomic-QA.md for test specifications
 */

import { IdentityService, EmployeeData } from '../../src/services/identity';
import {
  createMockKcAdmin,
  resetMockKcAdmin,
  createMockRole,
  MockKcAdminClient,
} from '../test-utils/mock-keycloak-admin';
import {
  createMockPool,
  createMockPoolClient,
  createMockQueryResult,
  createMockEmployee,
  MockPool,
  MockPoolClient,
} from '../test-utils/mock-db';
import {
  createMockQueue,
  MockQueue,
  MockDeleteUserJobData,
} from '../test-utils/mock-queue';
import type { Pool } from 'pg';

describe('IdentityService', () => {
  let identityService: IdentityService;
  let mockDb: MockPool;
  let mockClient: MockPoolClient;
  let mockKcAdmin: MockKcAdminClient;
  let mockQueue: MockQueue<MockDeleteUserJobData>;

  beforeEach(() => {
    // Create fresh mocks for each test (test isolation)
    mockClient = createMockPoolClient();
    mockDb = createMockPool(mockClient);
    mockKcAdmin = createMockKcAdmin();
    mockQueue = createMockQueue<MockDeleteUserJobData>();

    // Inject mocks via constructor (dependency injection pattern)
    identityService = new IdentityService(
      mockDb as unknown as Pool,
      mockKcAdmin,
      mockQueue
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
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      mockKcAdmin.clients.listRoles.mockResolvedValue([
        createMockRole('hr-read', 'role-1'),
      ]);
      mockKcAdmin.users.addClientRoleMappings.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      const result = await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      expect(result).toBe('kc-user-123');
      expect(mockKcAdmin.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'alice.chen', // firstName.lastName format
          // In dev environment (default), email is transformed from @tamshai.com to @tamshai.local
          email: 'alice@tamshai.local',
          firstName: 'Alice',
          lastName: 'Chen',
          enabled: true,
          attributes: {
            employeeId: ['emp-123'],
            department: ['HR'],
          },
          requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
        })
      );
    });

    it('should assign department role to user', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      // Mock realm role lookup
      mockKcAdmin.roles.findOneByName.mockResolvedValue(
        createMockRole('hr-read', 'role-hr-read')
      );
      mockKcAdmin.users.addRealmRoleMappings.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      expect(mockKcAdmin.users.addRealmRoleMappings).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kc-user-123',
          roles: [{ id: 'role-hr-read', name: 'hr-read' }],
        })
      );
    });

    it('should update employee record with Keycloak user ID', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('keycloak_user_id = $1'),
        ['kc-user-123', 'emp-123']
      );
    });

    it('should write audit log entry for USER_CREATED', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      // Production uses hr.access_audit_log with columns: user_email, action, resource, target_id, access_decision, access_justification
      // In dev environment (default), email is transformed from @tamshai.com to @tamshai.local
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.access_audit_log'),
        expect.arrayContaining(['alice@tamshai.local', 'USER_CREATED', 'employee', 'emp-123'])
      );
    });

    it('should set temporary password for new user', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      mockKcAdmin.clients.listRoles.mockResolvedValue([]);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      expect(mockKcAdmin.users.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kc-user-123',
          credential: expect.objectContaining({
            type: 'password',
            temporary: true,
          }),
        })
      );
    });

    it('should throw error if Keycloak creation fails', async () => {
      mockKcAdmin.users.create.mockRejectedValue(
        new Error('Keycloak unavailable')
      );

      await expect(
        identityService.createUserInKeycloak(
          employeeData,
          mockClient as unknown as import('pg').PoolClient
        )
      ).rejects.toThrow('Failed to provision Keycloak user: Keycloak unavailable');
    });

    it('should NOT write audit log if Keycloak creation fails', async () => {
      mockKcAdmin.users.create.mockRejectedValue(
        new Error('Keycloak unavailable')
      );

      try {
        await identityService.createUserInKeycloak(
          employeeData,
          mockClient as unknown as import('pg').PoolClient
        );
      } catch {
        // Expected
      }

      // Audit log should NOT be written on failure
      const auditLogCalls = mockClient.query.mock.calls.filter(
        (call: [string, unknown[]?]) => call[0].includes('access_audit_log')
      );
      expect(auditLogCalls).toHaveLength(0);
    });

    it('should rollback Keycloak user if role assignment fails (compensating transaction)', async () => {
      // User creation succeeds
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      // Realm role lookup succeeds
      mockKcAdmin.roles.findOneByName.mockResolvedValue(
        createMockRole('hr-read', 'role-hr-read')
      );
      // Role assignment fails
      mockKcAdmin.users.addRealmRoleMappings.mockRejectedValue(
        new Error('Role assignment failed')
      );

      await expect(
        identityService.createUserInKeycloak(
          employeeData,
          mockClient as unknown as import('pg').PoolClient
        )
      ).rejects.toThrow('Role assignment failed');

      // Critical: Keycloak user should be deleted as compensating transaction
      expect(mockKcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-user-123' });

      // Audit log should NOT be written on failure
      const auditLogCalls = mockClient.query.mock.calls.filter(
        (call: [string, unknown[]?]) => call[0].includes('access_audit_log')
      );
      expect(auditLogCalls).toHaveLength(0);
    });

    it('should handle missing department role gracefully', async () => {
      mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-user-123' });
      mockKcAdmin.users.resetPassword.mockResolvedValue(undefined);
      // Realm role not found for department
      mockKcAdmin.roles.findOneByName.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue(createMockQueryResult());

      // Should succeed but without role assignment
      const result = await identityService.createUserInKeycloak(
        employeeData,
        mockClient as unknown as import('pg').PoolClient
      );

      expect(result).toBe('kc-user-123');
      // Role assignment should NOT be called
      expect(mockKcAdmin.users.addRealmRoleMappings).not.toHaveBeenCalled();
    });
  });

  describe('terminateUser', () => {
    const employeeId = 'emp-456';

    beforeEach(() => {
      mockDb.query.mockResolvedValue(
        createMockQueryResult([
          createMockEmployee({
            id: employeeId,
            keycloak_user_id: 'kc-user-456',
            email: 'bob@tamshai.com',
          }),
        ])
      );
      mockKcAdmin.users.listClientRoleMappings.mockResolvedValue([
        createMockRole('finance-read'),
        createMockRole('finance-write'),
      ]);
      mockKcAdmin.users.listSessions.mockResolvedValue([
        { id: 'session-1' },
        { id: 'session-2' },
      ]);
      mockKcAdmin.users.update.mockResolvedValue(undefined);
      mockKcAdmin.users.logout.mockResolvedValue(undefined);
    });

    it('should disable user in Keycloak immediately', async () => {
      await identityService.terminateUser(employeeId);

      expect(mockKcAdmin.users.update).toHaveBeenCalledWith(
        { id: 'kc-user-456' },
        { enabled: false }
      );
    });

    it('should revoke all active sessions', async () => {
      const result = await identityService.terminateUser(employeeId);

      expect(mockKcAdmin.users.logout).toHaveBeenCalledWith({
        id: 'kc-user-456',
      });
      expect(result.sessionsRevoked).toBe(2);
    });

    it('should write permissions snapshot to audit log', async () => {
      await identityService.terminateUser(employeeId);

      // Production uses hr.access_audit_log with columns: user_email, action, resource, target_id, access_decision, access_justification
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.access_audit_log'),
        expect.arrayContaining([
          'bob@tamshai.com',  // user_email
          'USER_TERMINATED',  // action
          'employee',         // resource
          employeeId,         // target_id
        ])
      );
    });

    it('should update employee status to terminated', async () => {
      await identityService.terminateUser(employeeId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'terminated'"),
        [employeeId]
      );
    });

    it('should schedule deletion job for 72 hours later', async () => {
      const result = await identityService.terminateUser(employeeId);

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
      mockDb.query.mockResolvedValue(createMockQueryResult([]));

      await expect(identityService.terminateUser('non-existent')).rejects.toThrow(
        'Employee non-existent not found'
      );
    });

    it('should throw error if employee has no Keycloak user', async () => {
      mockDb.query.mockResolvedValue(
        createMockQueryResult([
          createMockEmployee({
            keycloak_user_id: null,
            email: 'no-kc@tamshai.com',
          }),
        ])
      );

      await expect(identityService.terminateUser('emp-no-kc')).rejects.toThrow(
        'has no Keycloak user'
      );
    });
  });

  describe('deleteUserPermanently', () => {
    it('should delete disabled user from Keycloak', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({
        id: 'kc-user-789',
        enabled: false,
      });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue(createMockQueryResult());

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      expect(mockKcAdmin.users.del).toHaveBeenCalledWith({ id: 'kc-user-789' });
    });

    it('should update employee status to deleted', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({
        id: 'kc-user-789',
        enabled: false,
      });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue(createMockQueryResult());

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'deleted'"),
        ['emp-789']
      );
    });

    it('should write USER_DELETED audit log', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({
        id: 'kc-user-789',
        email: 'deleted@tamshai.com',
        enabled: false,
      });
      mockKcAdmin.users.del.mockResolvedValue(undefined);
      mockDb.query.mockResolvedValue(createMockQueryResult());

      await identityService.deleteUserPermanently('kc-user-789', 'emp-789');

      // Production uses hr.access_audit_log with columns: user_email, action, resource, target_id, access_decision
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.access_audit_log'),
        expect.arrayContaining(['deleted@tamshai.com', 'USER_DELETED', 'employee', 'emp-789'])
      );
    });

    it('should NOT delete enabled user (safety check)', async () => {
      mockKcAdmin.users.findOne.mockResolvedValue({
        id: 'kc-user-789',
        enabled: true,
      });

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
      // Production uses hr.access_audit_log with columns: user_email, action, resource, target_id, access_decision, access_justification
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO hr.access_audit_log'),
        expect.arrayContaining(['reversed@tamshai.com', 'DELETION_BLOCKED', 'employee', 'emp-reversed'])
      );
    });
  });
});
