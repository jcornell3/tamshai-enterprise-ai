/**
 * Unit tests for list-time-off-requests tool
 *
 * Tests listing own time-off requests with pagination and filtering
 */

import { listTimeOffRequests, ListTimeOffRequestsInput, TimeOffRequest } from './list-time-off-requests';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';

// Mock database module
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

describe('list-time-off-requests tool', () => {
  const mockUserContext: UserContext = {
    userId: 'user-123',
    username: 'john.doe',
    email: 'john.doe@test.com',
    roles: ['user'],
  };

  const mockTimeOffRequests: TimeOffRequest[] = [
    {
      request_id: '123e4567-e89b-12d3-a456-426614174001',
      employee_id: '123e4567-e89b-12d3-a456-426614174000',
      employee_name: 'John Doe',
      type_code: 'VACATION',
      type_name: 'Vacation',
      start_date: '2026-03-01',
      end_date: '2026-03-05',
      total_days: 5,
      status: 'pending',
      approver_name: null,
      approved_at: null,
      notes: 'Spring break trip',
      approver_notes: null,
      created_at: '2026-02-01T10:00:00Z',
    },
    {
      request_id: '223e4567-e89b-12d3-a456-426614174002',
      employee_id: '123e4567-e89b-12d3-a456-426614174000',
      employee_name: 'John Doe',
      type_code: 'SICK',
      type_name: 'Sick Leave',
      start_date: '2026-01-15',
      end_date: '2026-01-15',
      total_days: 1,
      status: 'approved',
      approver_name: 'Jane Manager',
      approved_at: '2026-01-14T15:00:00Z',
      notes: 'Doctor appointment',
      approver_notes: 'Approved',
      created_at: '2026-01-14T09:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('returns time-off requests with default limit', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = {};
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].request_id).toBe('123e4567-e89b-12d3-a456-426614174001');
      }
    });

    it('applies custom limit', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { limit: 10 };
      await listTimeOffRequests(input, mockUserContext);

      // Should query with limit + 1 = 11
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([11])
      );
    });

    it('enforces maximum limit of 100', async () => {
      const input: ListTimeOffRequestsInput = { limit: 150 };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('enforces minimum limit of 1', async () => {
      const input: ListTimeOffRequestsInput = { limit: 0 };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Status filtering', () => {
    it('filters by pending status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { status: 'pending' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['pending'])
      );
    });

    it('filters by approved status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[1]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { status: 'approved' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['approved'])
      );
    });

    it('filters by rejected status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { status: 'rejected' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['rejected'])
      );
    });

    it('filters by cancelled status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { status: 'cancelled' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['cancelled'])
      );
    });

    it('rejects invalid status', async () => {
      const input = { status: 'invalid' as any };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Date range filtering', () => {
    it('filters by startDateFrom', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { startDateFrom: '2026-02-01' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.start_date >= $'),
        expect.arrayContaining(['2026-02-01'])
      );
    });

    it('filters by startDateTo', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[1]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { startDateTo: '2026-02-01' };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.start_date <= $'),
        expect.arrayContaining(['2026-02-01'])
      );
    });

    it('filters by both date range parameters', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');
      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = {
        startDateFrom: '2026-01-01',
        startDateTo: '2026-03-31',
      };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringMatching(/r\.start_date >= \$.*r\.start_date <= \$/s),
        expect.arrayContaining(['2026-01-01', '2026-03-31'])
      );
    });

    it('rejects invalid date format for startDateFrom', async () => {
      const input: ListTimeOffRequestsInput = { startDateFrom: '01-01-2026' };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects invalid date format for startDateTo', async () => {
      const input: ListTimeOffRequestsInput = { startDateTo: 'March 1, 2026' };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Cursor-based pagination', () => {
    it('returns nextCursor when more records exist', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Mock 51 rows (limit + 1) to indicate more data exists
      const paginatedRequests = Array.from({ length: 51 }, (_, i) => ({
        ...mockTimeOffRequests[0],
        request_id: `${String(i).padStart(3, '0')}e4567-e89b-12d3-a456-426614174001`,
        created_at: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }));

      mockQueryWithRLS.mockResolvedValue({
        rows: paginatedRequests,
        rowCount: 51,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { limit: 50 };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(50);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('does not return nextCursor when no more records', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { limit: 50 };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        expect(result.metadata).toBeUndefined();
      }
    });

    it('accepts valid cursor and builds WHERE clause', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const cursor = Buffer.from(
        JSON.stringify({
          createdAt: '2026-02-01T10:00:00Z',
          id: '123e4567-e89b-12d3-a456-426614174001',
        })
      ).toString('base64');

      const input: ListTimeOffRequestsInput = { cursor };
      await listTimeOffRequests(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('r.created_at'),
        expect.arrayContaining(['2026-02-01T10:00:00Z', '123e4567-e89b-12d3-a456-426614174001'])
      );
    });

    it('handles invalid cursor gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ListTimeOffRequestsInput = { cursor: 'invalid-base64!!!' };
      const result = await listTimeOffRequests(input, mockUserContext);

      expect(result.status).toBe('success');
    });
  });

  describe('User context and RLS', () => {
    it('passes user context to queryWithRLS', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('filters by user email for self-service', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('e.work_email = $1'),
        expect.arrayContaining(['john.doe@test.com'])
      );
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await listTimeOffRequests({}, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('handles permission denied errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('permission denied for table time_off_requests'));

      const result = await listTimeOffRequests({}, mockUserContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('Data validation', () => {
    it('returns empty array when no requests found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await listTimeOffRequests({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toEqual([]);
      }
    });

    it('preserves request data structure', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: [mockTimeOffRequests[0]],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await listTimeOffRequests({}, mockUserContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const request = result.data[0];
        expect(request).toHaveProperty('request_id');
        expect(request).toHaveProperty('employee_id');
        expect(request).toHaveProperty('employee_name');
        expect(request).toHaveProperty('type_code');
        expect(request).toHaveProperty('type_name');
        expect(request).toHaveProperty('start_date');
        expect(request).toHaveProperty('end_date');
        expect(request).toHaveProperty('total_days');
        expect(request).toHaveProperty('status');
        expect(request).toHaveProperty('notes');
      }
    });
  });

  describe('Query structure', () => {
    it('joins with employees table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('JOIN hr.employees e ON r.employee_id = e.id'),
        expect.any(Array)
      );
    });

    it('joins with time_off_types table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('JOIN hr.time_off_types t ON r.type_code = t.type_code'),
        expect.any(Array)
      );
    });

    it('includes approver join for approver_name', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('LEFT JOIN hr.employees a ON r.approver_id = a.id'),
        expect.any(Array)
      );
    });

    it('orders by created_at descending', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValue({
        rows: mockTimeOffRequests,
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      });

      await listTimeOffRequests({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('ORDER BY r.created_at DESC'),
        expect.any(Array)
      );
    });
  });
});
