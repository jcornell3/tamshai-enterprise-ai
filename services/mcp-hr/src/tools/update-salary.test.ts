/**
 * Unit tests for update-salary tool (v1.4 HITL)
 *
 * Tests human-in-the-loop confirmation flow, permissions, and salary validation
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
  updateSalary,
  executeUpdateSalary,
  UpdateSalaryInput,
} from './update-salary';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import * as redis from '../utils/redis';

// Mock database connection
jest.mock('../database/connection');

describe('update-salary tool', () => {
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
    title: 'Software Engineer',
    salary: 75000,
    department_name: 'Engineering',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Permission checks', () => {
    it('allows hr-write role to initiate salary update', async () => {
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };
      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
    });

    it('allows executive role to initiate salary update', async () => {
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };
      const result = await updateSalary(input, mockExecutiveUser);

      expect(result.status).toBe('pending_confirmation');
    });

    it('rejects user without hr-write or executive role', async () => {
      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };
      const result = await updateSalary(input, mockRegularUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('hr-write or executive');
        expect(result.suggestedAction).toContain('contact your administrator');
      }
    });
  });

  describe('HITL confirmation flow (v1.4)', () => {
    it('returns pending_confirmation instead of immediate update', async () => {
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
        reason: 'Annual performance review',
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.confirmationId).toBeDefined();
        expect(result.confirmationId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
        expect(result.message).toContain('Update salary for John Doe');
        expect(result.message).toContain('john.doe@test.com');
        expect(result.message).toContain('$75,000');
        expect(result.message).toContain('$85,000');
        expect(result.confirmationData.action).toBe('update_salary');
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      await updateSalary(input, mockHrWriteUser);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'update_salary',
          employeeId: '123e4567-e89b-12d3-a456-426614174000',
          newSalary: 85000,
        }),
        300 // 5-minute TTL
      );
    });

    it('includes salary change calculation in confirmation', async () => {
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      if (result.status === 'pending_confirmation') {
        expect(result.confirmationData.currentSalary).toBe(75000);
        expect(result.confirmationData.newSalary).toBe(85000);
        expect(result.confirmationData.salaryChange).toBe(10000);
        expect(result.confirmationData.percentChange).toBe('13.3');
      }
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
        reason: 'Promotion to Senior Engineer',
      };

      const result = await updateSalary(input, mockHrWriteUser);

      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('Promotion to Senior Engineer');
        expect(result.confirmationData.reason).toBe('Promotion to Senior Engineer');
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      if (result.status === 'pending_confirmation') {
        expect(result.confirmationData.reason).toBe('No reason provided');
      }
    });
  });

  describe('Employee validation', () => {
    it('returns error when employee not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
      }
    });

    it('handles employee with null salary', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      const mockStorePendingConfirmation = jest.spyOn(redis, 'storePendingConfirmation');

      const employeeWithNoSalary = { ...mockEmployee, salary: null };
      mockQueryWithRLS.mockResolvedValue({
        rows: [employeeWithNoSalary],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });
      mockStorePendingConfirmation.mockResolvedValue();

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.confirmationData.currentSalary).toBe(0);
        expect(result.confirmationData.percentChange).toBe('N/A');
      }
    });
  });

  describe('Execution after confirmation', () => {
    it('updates salary successfully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [{ id: '123e4567-e89b-12d3-a456-426614174000', first_name: 'John', last_name: 'Doe', salary: 85000 }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const confirmationData = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await executeUpdateSalary(confirmationData, mockHrWriteUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.success).toBe(true);
        expect(result.data.newSalary).toBe(85000);
        expect(result.data.message).toContain('John Doe');
        expect(result.data.message).toContain('$85,000');
      }
    });

    it('returns error if employee not found during execution', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const confirmationData = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await executeUpdateSalary(confirmationData, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
      }
    });
  });

  describe('Input validation', () => {
    it('rejects invalid UUID format', async () => {
      const input = {
        employeeId: 'not-a-valid-uuid',
        newSalary: 85000,
      } as UpdateSalaryInput;

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('pending_confirmation');
    });

    it('rejects negative salary', async () => {
      const input = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: -5000,
      } as UpdateSalaryInput;

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects zero salary', async () => {
      const input = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 0,
      } as UpdateSalaryInput;

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Error handling', () => {
    it('handles database connection errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockRejectedValue(new Error('Connection timeout'));

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
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

      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);

      if (result.status === 'pending_confirmation') {
        expect(result.confirmationData.userId).toBe(mockHrWriteUser.userId);
      }
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

      const beforeTime = Date.now();
      const input: UpdateSalaryInput = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        newSalary: 85000,
      };

      const result = await updateSalary(input, mockHrWriteUser);
      const afterTime = Date.now();

      if (result.status === 'pending_confirmation') {
        expect(result.confirmationData.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(result.confirmationData.timestamp).toBeLessThanOrEqual(afterTime);
      }
    });
  });
});
