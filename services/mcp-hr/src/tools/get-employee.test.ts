/**
 * Unit tests for get-employee tool
 *
 * Tests single employee retrieval, RLS enforcement, and data masking
 */

import { getEmployee, GetEmployeeInput, Employee } from './get-employee';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';

// Mock database module
jest.mock('../database/connection');

describe('get-employee tool', () => {
  const mockHrReadUser: UserContext = {
    userId: 'hr-user-123',
    username: 'alice.chen',
    roles: ['hr-read'],
  };

  const mockHrWriteUser: UserContext = {
    userId: 'hr-write-user-456',
    username: 'carol.admin',
    roles: ['hr-write'],
  };

  const mockRegularUser: UserContext = {
    userId: 'emp-001',
    username: 'john.doe',
    roles: ['user'],
  };

  const mockManagerUser: UserContext = {
    userId: 'mgr-001',
    username: 'bob.manager',
    roles: ['manager'],
  };

  const mockEmployee: Employee = {
    id: 'emp-001',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@test.com',
    phone: '555-0001',
    hire_date: '2020-01-15',
    title: 'Software Engineer',
    department_name: 'Engineering',
    department_id: 'dept-001',
    manager_id: 'mgr-001',
    manager_name: 'Bob Manager',
    salary: null, // Masked for non-privileged users
    location: 'San Francisco',
    status: 'ACTIVE',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('returns employee data when found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toEqual(mockEmployee);
        expect(result.data.id).toBe('emp-001');
        expect(result.data.first_name).toBe('John');
        expect(result.data.last_name).toBe('Doe');
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

      const input: GetEmployeeInput = { employeeId: 'non-existent-emp' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
        expect(result.message).toContain('Employee non-existent-emp not found');
        expect(result.suggestedAction).toContain('list_employees');
      }
    });

    it('passes employee ID as parameter to query', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = 'emp-123';
      const input: GetEmployeeInput = { employeeId };
      await getEmployee(input, mockHrReadUser);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrReadUser,
        expect.stringContaining('WHERE e.id = $1'),
        [employeeId]
      );
    });
  });

  describe('Row-Level Security (RLS)', () => {
    it('passes user context to queryWithRLS', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const customContext: UserContext = {
        userId: 'test-user',
        username: 'test.user',
        roles: ['manager'],
      };

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, customContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        customContext,
        expect.any(String),
        ['emp-001']
      );
    });

    it('queries only ACTIVE employees', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, mockHrReadUser);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrReadUser,
        expect.stringContaining("e.status = 'ACTIVE'"),
        ['emp-001']
      );
    });
  });

  describe('Salary field masking', () => {
    it('includes salary field in query for all users (RLS masks it)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, mockRegularUser);

      // Query should request salary with CASE statement for masking
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockRegularUser,
        expect.stringContaining('CASE'),
        ['emp-001']
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockRegularUser,
        expect.stringMatching(/current_setting.*hr-write.*salary/s),
        ['emp-001']
      );
    });

    it('returns null salary for regular users', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [{ ...mockEmployee, salary: null }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockRegularUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.salary).toBeNull();
      }
    });

    it('can return salary for hr-write users (simulated)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      const employeeWithSalary = {
        ...mockEmployee,
        salary: 120000,
      };

      mockQueryWithRLS.mockResolvedValue({
        rows: [employeeWithSalary],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrWriteUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.salary).toBe(120000);
      }
    });
  });

  describe('Data structure validation', () => {
    it('returns all expected employee fields', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveProperty('id');
        expect(result.data).toHaveProperty('first_name');
        expect(result.data).toHaveProperty('last_name');
        expect(result.data).toHaveProperty('email');
        expect(result.data).toHaveProperty('phone');
        expect(result.data).toHaveProperty('hire_date');
        expect(result.data).toHaveProperty('title');
        expect(result.data).toHaveProperty('department_name');
        expect(result.data).toHaveProperty('department_id');
        expect(result.data).toHaveProperty('manager_id');
        expect(result.data).toHaveProperty('manager_name');
        expect(result.data).toHaveProperty('salary');
        expect(result.data).toHaveProperty('location');
        expect(result.data).toHaveProperty('status');
      }
    });

    it('includes JOIN with departments table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, mockHrReadUser);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrReadUser,
        expect.stringContaining('LEFT JOIN hr.departments d'),
        ['emp-001']
      );
    });

    it('includes JOIN with manager table for manager_name', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, mockHrReadUser);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrReadUser,
        expect.stringContaining('LEFT JOIN hr.employees m ON e.manager_id = m.id'),
        ['emp-001']
      );
    });
  });

  describe('Input validation', () => {
    it('rejects invalid UUID format', async () => {
      const input: GetEmployeeInput = { employeeId: 'not-a-uuid' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.message).toContain('UUID');
      }
    });

    it('accepts valid UUID format', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const input: GetEmployeeInput = { employeeId: validUuid };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).not.toBe('error');
    });
  });

  describe('Error handling', () => {
    it('handles database connection errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection timeout'));

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.message).toContain('database error');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('handles permission denied errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      const permissionError = new Error('permission denied for table employees');
      mockQueryWithRLS.mockRejectedValue(permissionError);

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('handles SQL syntax errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('syntax error at or near "FROM"'));

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('error');
    });
  });

  describe('SQL injection protection', () => {
    it('uses parameterized query for employee ID', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      // Attempt SQL injection (should be caught by UUID validation)
      const maliciousInput: GetEmployeeInput = {
        employeeId: "'; DROP TABLE employees; --" as any,
      };

      const result = await getEmployee(maliciousInput, mockHrReadUser);

      // Should fail validation before reaching database
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('Performance considerations', () => {
    it('queries only one employee (no N+1 queries)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      await getEmployee(input, mockHrReadUser);

      // Should only make one database call
      expect(mockQueryWithRLS).toHaveBeenCalledTimes(1);
    });

    it('uses LEFT JOIN to avoid missing department/manager', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Employee without department or manager
      const soloEmployee = {
        ...mockEmployee,
        department_name: null,
        department_id: null,
        manager_id: null,
        manager_name: null,
      };

      mockQueryWithRLS.mockResolvedValue({
        rows: [soloEmployee],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetEmployeeInput = { employeeId: 'emp-001' };
      const result = await getEmployee(input, mockHrReadUser);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.department_name).toBeNull();
        expect(result.data.manager_name).toBeNull();
      }
    });
  });
});
