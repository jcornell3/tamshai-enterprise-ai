/**
 * Unit tests for delete-employee tool (v1.4 HITL)
 *
 * Tests human-in-the-loop confirmation flow, permissions, and business rules
 */

// Mock ioredis to prevent actual Redis connection
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  }));
});

import {
  deleteEmployee,
  executeDeleteEmployee,
  DeleteEmployeeInput,
} from './delete-employee';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import * as redis from '../utils/redis';

// Mock database connection
jest.mock('../database/connection');

describe('delete-employee tool', () => {
  const mockHrWriteUser: UserContext = {
    userId: '423e4567-e89b-12d3-a456-426614174000',
    username: 'alice.chen',
    roles: ['hr-write'],
  };

  const mockExecutiveUser: UserContext = {
    userId: 'exec-user-456',
    username: 'eve.thompson',
    roles: ['executive'],
  };

  const mockRegularUser: UserContext = {
    userId: 'regular-user-789',
    username: 'marcus.johnson',
    roles: ['user'],
  };

  const mockEmployee = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@test.com',
    department_name: 'Engineering',
    title: 'Software Engineer',
    report_count: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Permission checks', () => {
    it('allows hr-write role to initiate deletion', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
    });

    it('allows executive role to initiate deletion', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockExecutiveUser);

      expect(result.status).toBe('pending_confirmation');
    });

    it('rejects user without hr-write or executive role', async () => {
      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockRegularUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('hr-write or executive');
        expect(result.suggestedAction).toContain('contact your administrator');
      }
    });
  });

  describe('HITL confirmation flow (v1.4)', () => {
    it('returns pending_confirmation instead of immediate deletion', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Termination due to restructuring',
      };

      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.confirmationId).toBeDefined();
        expect(result.confirmationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ); // UUID format
        expect(result.message).toContain('Delete employee John Doe');
        expect(result.message).toContain('john.doe@test.com');
        expect(result.message).toContain('Termination due to restructuring');
        expect(result.confirmationData.action).toBe('delete_employee');
        expect(result.confirmationData.mcpServer).toBe('hr');
        expect(result.confirmationData.userId).toBe('423e4567-e89b-12d3-a456-426614174000');
      }
    });

    it('stores confirmation in Redis with 5-minute TTL', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      await deleteEmployee(input, mockHrWriteUser);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f-]{36}$/i), // UUID
        expect.objectContaining({
          action: 'delete_employee',
          mcpServer: 'hr',
          userId: '423e4567-e89b-12d3-a456-426614174000',
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          employeeName: 'John Doe',
          employeeEmail: 'john.doe@test.com',
          department: 'Engineering',
          jobTitle: 'Software Engineer',
        }),
        300 // 5 minutes
      );
    });

    it('includes reason in confirmation message when provided', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Performance issues',
      };

      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('Performance issues');
      }
    });

    it('defaults to "No reason provided" when reason omitted', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      await deleteEmployee(input, mockHrWriteUser);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reason: 'No reason provided',
        }),
        300
      );
    });
  });

  describe('Business rules validation', () => {
    it('prevents user from deleting themselves', async () => {
      const selfContext: UserContext = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        username: 'john.doe',
        roles: ['hr-write'],
      };

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, selfContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('CANNOT_DELETE_SELF');
        expect(result.message).toContain('cannot delete your own employee record');
        expect(result.suggestedAction).toContain('contact your HR administrator');
      }
    });

    it('prevents deletion of employee with direct reports', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      const managerEmployee = {
        ...mockEmployee,
        report_count: 3,
      };

      mockQueryWithRLS.mockResolvedValue({
        rows: [managerEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_HAS_REPORTS');
        expect(result.message).toContain('has 3 direct report(s)');
        expect(result.suggestedAction).toContain('reassign');
      }
    });

    it('returns error when employee not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const nonExistentId = '999e4567-e89b-12d3-a456-426614174000';
      const input: DeleteEmployeeInput = { employeeId: nonExistentId };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
        expect(result.message).toContain(nonExistentId);
        expect(result.suggestedAction).toContain('list_employees');
      }
    });
  });

  describe('Execution after confirmation', () => {
    it('marks employee as TERMINATED (soft delete)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [{ id: '123e4567-e89b-12d3-a456-426614174000', first_name: 'John', last_name: 'Doe' }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: '423e4567-e89b-12d3-a456-426614174000',
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await executeDeleteEmployee(confirmationData, mockHrWriteUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.success).toBe(true);
        expect(result.data.message).toContain('John Doe has been successfully deleted');
        expect(result.data.employeeId).toBe('123e4567-e89b-12d3-a456-426614174000');
      }

      // Verify UPDATE query was executed (soft delete)
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrWriteUser,
        expect.stringContaining("status = 'TERMINATED'"),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
    });

    it('returns error if employee already deleted', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Simulate employee not found (already deleted or not found)
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: '423e4567-e89b-12d3-a456-426614174000',
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await executeDeleteEmployee(confirmationData, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
      }
    });

    it('updates updated_at timestamp', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [{ id: '123e4567-e89b-12d3-a456-426614174000', first_name: 'John', last_name: 'Doe' }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: '423e4567-e89b-12d3-a456-426614174000',
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
      };

      await executeDeleteEmployee(confirmationData, mockHrWriteUser);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrWriteUser,
        expect.stringContaining('updated_at = NOW()'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
    });
  });

  describe('Input validation', () => {
    it('rejects invalid UUID format', async () => {
      const input: DeleteEmployeeInput = { employeeId: 'not-a-uuid' };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
        expect(result.message).toContain('UUID');
      }
    });

    it('accepts valid UUID format', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const input: DeleteEmployeeInput = { employeeId: validUuid };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).not.toBe('error');
    });

    it('accepts optional reason field', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Test reason',
      };

      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
    });
  });

  describe('Error handling', () => {
    it('handles database connection errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection timeout'));

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('handles Redis storage failures gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockRejectedValue(new Error('Redis connection failed'));

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      const result = await deleteEmployee(input, mockHrWriteUser);

      // Should still fail gracefully
      expect(result.status).toBe('error');
    });
  });

  describe('Audit trail', () => {
    it('includes userId in confirmation data for audit', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      await deleteEmployee(input, mockHrWriteUser);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: '423e4567-e89b-12d3-a456-426614174000',
          timestamp: expect.any(Number),
        }),
        300
      );
    });

    it('includes timestamp in confirmation data', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const beforeTimestamp = Date.now();
      const input: DeleteEmployeeInput = { employeeId: '123e4567-e89b-12d3-a456-426614174000' };
      await deleteEmployee(input, mockHrWriteUser);
      const afterTimestamp = Date.now();

      const callArgs = mockStorePendingConfirmation.mock.calls[0];
      const confirmationData = callArgs[1] as any;

      expect(confirmationData.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(confirmationData.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });
});
