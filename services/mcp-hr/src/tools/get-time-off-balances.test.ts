/**
 * Unit tests for get-time-off-balances tool
 *
 * Tests retrieving time-off balances for self or other employees
 */

import { getTimeOffBalances, GetTimeOffBalancesInput, TimeOffBalance } from './get-time-off-balances';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';

// Mock database module
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

describe('get-time-off-balances tool', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'john.doe',
    email: 'john.doe@test.com',
    roles: ['user'],
  };

  const mockManagerContext: UserContext = {
    userId: 'manager-123',
    username: 'jane.manager',
    email: 'jane.manager@test.com',
    roles: ['manager'],
  };

  const mockHrContext: UserContext = {
    userId: 'hr-123',
    username: 'alice.hr',
    email: 'alice.hr@test.com',
    roles: ['hr-read'],
  };

  const mockTimeOffBalances: TimeOffBalance[] = [
    {
      type_code: 'VACATION',
      type_name: 'Vacation',
      fiscal_year: 2026,
      entitlement: 15,
      used: 5,
      pending: 2,
      carryover: 3,
      available: 11,
    },
    {
      type_code: 'SICK',
      type_name: 'Sick Leave',
      fiscal_year: 2026,
      entitlement: 10,
      used: 1,
      pending: 0,
      carryover: 0,
      available: 9,
    },
    {
      type_code: 'PERSONAL',
      type_name: 'Personal Days',
      fiscal_year: 2026,
      entitlement: 3,
      used: 0,
      pending: 1,
      carryover: 0,
      available: 2,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Self-service (no employeeId)', () => {
    it('returns balances for authenticated user', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetTimeOffBalancesInput = {};
      const result = await getTimeOffBalances(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].type_code).toBe('VACATION');
        expect(result.data[0].available).toBe(11);
      }
    });

    it('queries by user email for self-service', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.work_email = $1'),
        expect.arrayContaining(['john.doe@test.com'])
      );
    });

    it('uses current year by default', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      const currentYear = new Date().getFullYear();
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('b.fiscal_year = $2'),
        expect.arrayContaining([currentYear])
      );
    });

    it('returns empty success with hint when no balances found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toEqual([]);
        expect(result.metadata?.hint).toContain('Contact HR');
      }
    });
  });

  describe('Specific employee lookup', () => {
    it('returns balances for specific employee', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '223e4567-e89b-12d3-a456-426614174000';
      const input: GetTimeOffBalancesInput = { employeeId };
      const result = await getTimeOffBalances(input, mockHrContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(3);
      }
    });

    it('queries by employee ID when provided', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '223e4567-e89b-12d3-a456-426614174000';
      await getTimeOffBalances({ employeeId }, mockHrContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrContext,
        expect.stringContaining('b.employee_id = $1'),
        expect.arrayContaining([employeeId])
      );
    });

    it('returns error when employee balances not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '999e4567-e89b-12d3-a456-426614174000';
      const result = await getTimeOffBalances({ employeeId }, mockHrContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('NO_BALANCES_FOUND');
        expect(result.message).toContain(employeeId);
      }
    });

    it('rejects invalid UUID format', async () => {
      const input: GetTimeOffBalancesInput = { employeeId: 'not-a-uuid' };
      const result = await getTimeOffBalances(input, mockHrContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Fiscal year parameter', () => {
    it('accepts custom fiscal year', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: GetTimeOffBalancesInput = { fiscalYear: 2025 };
      await getTimeOffBalances(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.arrayContaining([2025])
      );
    });

    it('rejects year below 2020', async () => {
      const input: GetTimeOffBalancesInput = { fiscalYear: 2019 };
      const result = await getTimeOffBalances(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects year above 2030', async () => {
      const input: GetTimeOffBalancesInput = { fiscalYear: 2031 };
      const result = await getTimeOffBalances(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects non-integer year', async () => {
      const input = { fiscalYear: 2025.5 } as GetTimeOffBalancesInput;
      const result = await getTimeOffBalances(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Combined parameters', () => {
    it('accepts both employeeId and fiscalYear', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '223e4567-e89b-12d3-a456-426614174000';
      const input: GetTimeOffBalancesInput = { employeeId, fiscalYear: 2025 };
      const result = await getTimeOffBalances(input, mockHrContext);

      expect(result.status).toBe('success');
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockHrContext,
        expect.any(String),
        [employeeId, 2025]
      );
    });
  });

  describe('Data structure', () => {
    it('returns correct balance fields', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffBalances[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const balance = result.data[0];
        expect(balance).toHaveProperty('type_code');
        expect(balance).toHaveProperty('type_name');
        expect(balance).toHaveProperty('fiscal_year');
        expect(balance).toHaveProperty('entitlement');
        expect(balance).toHaveProperty('used');
        expect(balance).toHaveProperty('pending');
        expect(balance).toHaveProperty('carryover');
        expect(balance).toHaveProperty('available');
      }
    });

    it('orders by type_name', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('ORDER BY t.type_name'),
        expect.any(Array)
      );
    });
  });

  describe('Metadata', () => {
    it('includes returned count in metadata', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.metadata?.returnedCount).toBe(3);
        expect(result.metadata?.hasMore).toBe(false);
      }
    });

    it('includes helpful hint in metadata', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.metadata?.hint).toContain('time-off balance types');
      }
    });
  });

  describe('Query structure', () => {
    it('joins with time_off_types table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('JOIN hr.time_off_types t ON b.type_code = t.type_code'),
        expect.any(Array)
      );
    });

    it('calculates available balance correctly', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      // Query should contain the available calculation
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringMatching(/entitlement.*carryover.*used.*pending.*as available/si),
        expect.any(Array)
      );
    });

    it('uses COALESCE for null-safe calculations', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('COALESCE'),
        expect.any(Array)
      );
    });
  });

  describe('RLS enforcement', () => {
    it('passes user context to queryWithRLS', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      await getTimeOffBalances({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('allows manager to query team member balances', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '223e4567-e89b-12d3-a456-426614174000';
      const result = await getTimeOffBalances({ employeeId }, mockManagerContext);

      expect(result.status).toBe('success');
    });

    it('allows HR to query any employee balances', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffBalances,
        rowCount: 3,
        command: '',
        oid: 0,
        fields: [],
      });

      const employeeId = '223e4567-e89b-12d3-a456-426614174000';
      const result = await getTimeOffBalances({ employeeId }, mockHrContext);

      expect(result.status).toBe('success');
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('handles permission denied errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('permission denied'));

      const result = await getTimeOffBalances({}, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});
