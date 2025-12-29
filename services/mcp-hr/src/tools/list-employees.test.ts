/**
 * Unit tests for list-employees tool (v1.4)
 *
 * Tests cursor-based pagination, filters, RLS enforcement, and error handling
 */

import { listEmployees, ListEmployeesInput } from './list-employees';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';

// Mock database module
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

describe('list-employees tool', () => {
  // Common test data
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'alice.chen',
    roles: ['hr-read'],
  };

  const mockEmployees = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@test.com',
      phone: '555-0001',
      hire_date: '2020-01-15',
      title: 'Engineer',
      department_name: 'Engineering',
      department_id: '823e4567-e89b-12d3-a456-426614174000',
      manager_id: '923e4567-e89b-12d3-a456-426614174000',
      manager_name: 'Bob Manager',
      salary: null,
      location: 'San Francisco',
      status: 'ACTIVE',
    },
    {
      id: '223e4567-e89b-12d3-a456-426614174000',
      first_name: 'Bob',
      last_name: 'Brown',
      email: 'bob@test.com',
      phone: '555-0002',
      hire_date: '2021-03-20',
      title: 'Senior Engineer',
      department_name: 'Engineering',
      department_id: '823e4567-e89b-12d3-a456-426614174000',
      manager_id: '923e4567-e89b-12d3-a456-426614174000',
      manager_name: 'Bob Manager',
      salary: null,
      location: 'New York',
      status: 'ACTIVE',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('returns employees with default limit (50)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: mockEmployees,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = {} as ListEmployeesInput; // Type assertion since zod will apply default
      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(result.metadata).toBeUndefined(); // No pagination metadata when not truncated
      }

      // Verify query was called with LIMIT + 1 (51)
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('LIMIT $1'),
        [51] // limit + 1
      );
    });

    it('applies custom limit', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListEmployeesInput = { limit: 10 };
      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('success');

      // Verify LIMIT + 1 = 11
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('LIMIT $1'),
        [11]
      );
    });

    it('enforces maximum limit of 100', async () => {
      const input: ListEmployeesInput = { limit: 150 };

      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
        expect(result.message).toContain('100');
      }
    });

    it('enforces minimum limit of 1', async () => {
      const input: ListEmployeesInput = { limit: 0 };

      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Cursor-based pagination (v1.4)', () => {
    it('returns nextCursor when more records exist', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Mock 51 rows (limit + 1) to indicate more data exists
      const paginatedEmployees = Array.from({ length: 51 }, (_, i) => ({
        ...mockEmployees[0],
        id: `${String(i).padStart(3, '0')}e4567-e89b-12d3-a456-426614174000`,
        first_name: `Employee${i}`,
      }));

      mockQueryWithRLS.mockResolvedValue({
        rows: paginatedEmployees,
        rowCount: 51,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListEmployeesInput = { limit: 50 };
      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(50); // Should trim to limit
        expect(result.metadata).toBeDefined();
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
        expect(result.metadata?.hint).toContain('show next page');
        expect(result.metadata?.totalEstimate).toBe('50+');
      }
    });

    it('does not return nextCursor when no more records', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockEmployees, // Only 2 rows
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListEmployeesInput = { limit: 50 };
      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        expect(result.metadata).toBeUndefined();
      }
    });

    it('accepts cursor and builds correct WHERE clause', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      // Create a valid cursor
      const cursor = Buffer.from(
        JSON.stringify({
          lastName: 'Anderson',
          firstName: 'Alice',
          id: '123e4567-e89b-12d3-a456-426614174000',
        })
      ).toString('base64');

      const input = { cursor } as ListEmployeesInput;
      await listEmployees(input, mockUserContext);

      // Verify cursor values are added to query
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.last_name >'),
        expect.arrayContaining(['Anderson', 'Alice', '123e4567-e89b-12d3-a456-426614174000', 51])
      );
    });

    it('handles invalid cursor gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockEmployees,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = { cursor: 'invalid-base64!!!' } as ListEmployeesInput;
      const result = await listEmployees(input, mockUserContext);

      // Should still succeed, just ignore invalid cursor
      expect(result.status).toBe('success');
    });
  });

  describe('Filters', () => {
    it('filters by department', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = { department: 'Engineering' } as ListEmployeesInput;
      await listEmployees(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('d.name ILIKE $1'),
        expect.arrayContaining(['%Engineering%'])
      );
    });

    it('filters by jobTitle', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = { jobTitle: 'Engineer' } as ListEmployeesInput;
      await listEmployees(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.title ILIKE'),
        expect.arrayContaining(['%Engineer%'])
      );
    });

    it('filters by managerId', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockEmployees,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const managerId = '923e4567-e89b-12d3-a456-426614174000';
      const input = { managerId } as ListEmployeesInput;
      await listEmployees(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.manager_id = $1'),
        expect.arrayContaining([managerId])
      );
    });

    it('rejects invalid managerId UUID', async () => {
      const input = { managerId: 'not-a-uuid' } as ListEmployeesInput;

      const result = await listEmployees(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
        expect(result.message).toContain('uuid');
      }
    });

    it('filters by location', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = { location: 'San Francisco' } as ListEmployeesInput;
      await listEmployees(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.location ILIKE'),
        expect.arrayContaining(['%San Francisco%'])
      );
    });

    it('combines multiple filters', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input = {
        department: 'Engineering',
        location: 'San Francisco',
        jobTitle: 'Engineer',
      } as ListEmployeesInput;

      await listEmployees(input, mockUserContext);

      // Should have all filter clauses
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringMatching(/d\.name ILIKE.*e\.title ILIKE.*e\.location ILIKE/s),
        expect.arrayContaining([
          '%Engineering%',
          '%Engineer%',
          '%San Francisco%',
          51,
        ])
      );
    });
  });

  describe('Row-Level Security (RLS)', () => {
    it('passes user context to queryWithRLS', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const customContext: UserContext = {
        userId: 'test-user',
        username: 'test.user',
        roles: ['manager'],
      };

      await listEmployees({} as ListEmployeesInput, customContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        customContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('includes salary field in query (RLS filters it)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockEmployees,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listEmployees({} as ListEmployeesInput, mockUserContext);

      // Query should request salary column (RLS determines if it's returned)
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('CASE'),
        expect.any(Array)
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('salary'),
        expect.any(Array)
      );
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const input = {} as ListEmployeesInput;
      const result = await listEmployees(input, mockUserContext);

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

      const result = await listEmployees({} as ListEmployeesInput, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });
  });

  describe('Data validation', () => {
    it('returns empty array when no employees found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await listEmployees({ department: 'NonExistent' } as ListEmployeesInput, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toEqual([]);
      }
    });

    it('preserves employee data structure', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockEmployees[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await listEmployees({} as ListEmployeesInput, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const employee = result.data[0];
        expect(employee).toHaveProperty('id');
        expect(employee).toHaveProperty('first_name');
        expect(employee).toHaveProperty('last_name');
        expect(employee).toHaveProperty('email');
        expect(employee).toHaveProperty('department_name');
        expect(employee).toHaveProperty('title');
      }
    });
  });

  describe('SQL injection protection', () => {
    it('uses parameterized queries for filters', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const maliciousInput = {
        department: "'; DROP TABLE employees; --",
      } as ListEmployeesInput;

      await listEmployees(maliciousInput, mockUserContext);

      // Should pass malicious input as parameter, not concatenate into SQL
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String), // SQL query string (not inspecting internals)
        expect.arrayContaining(["%'; DROP TABLE employees; --%"])
      );
    });
  });
});
