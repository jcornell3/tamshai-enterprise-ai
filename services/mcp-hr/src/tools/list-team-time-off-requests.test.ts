/**
 * Unit tests for list-team-time-off-requests tool
 *
 * Tests listing time-off requests for manager's direct reports
 */

import { listTeamTimeOffRequests, ListTeamTimeOffRequestsInput } from './list-team-time-off-requests';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import { TimeOffRequest } from './list-time-off-requests';

// Mock database module
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

describe('list-team-time-off-requests tool', () => {
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

  const mockHrWriteContext: UserContext = {
    userId: 'hr-write-123',
    username: 'bob.hradmin',
    email: 'bob.hradmin@test.com',
    roles: ['hr-write'],
  };

  const mockExecutiveContext: UserContext = {
    userId: 'exec-123',
    username: 'ceo',
    email: 'ceo@test.com',
    roles: ['executive'],
  };

  const mockRegularUser: UserContext = {
    userId: 'user-123',
    username: 'john.doe',
    email: 'john.doe@test.com',
    roles: ['user'],
  };

  const mockManagerRecord = {
    id: 'manager-emp-123',
  };

  const mockTeamRequests: TimeOffRequest[] = [
    {
      request_id: '123e4567-e89b-12d3-a456-426614174001',
      employee_id: '223e4567-e89b-12d3-a456-426614174000',
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
      request_id: '323e4567-e89b-12d3-a456-426614174002',
      employee_id: '423e4567-e89b-12d3-a456-426614174000',
      employee_name: 'Jane Smith',
      type_code: 'SICK',
      type_name: 'Sick Leave',
      start_date: '2026-02-15',
      end_date: '2026-02-15',
      total_days: 1,
      status: 'pending',
      approver_name: null,
      approved_at: null,
      notes: 'Feeling unwell',
      approver_notes: null,
      created_at: '2026-02-14T09:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Permission checks', () => {
    it('allows manager role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('success');
    });

    it('allows hr-read role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockHrContext);

      expect(result.status).toBe('success');
    });

    it('allows hr-write role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockHrWriteContext);

      expect(result.status).toBe('success');
    });

    it('allows executive role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockExecutiveContext);

      expect(result.status).toBe('success');
    });

    it('denies regular user role', async () => {
      const result = await listTeamTimeOffRequests({}, mockRegularUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('manager access');
        expect(result.suggestedAction).toBeDefined();
      }
    });
  });

  describe('Manager lookup', () => {
    it('looks up manager employee ID by email', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      await listTeamTimeOffRequests({}, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        1,
        mockManagerContext,
        expect.stringContaining('work_email = $1'),
        ['jane.manager@test.com']
      );
    });

    it('returns error when manager not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('MANAGER_NOT_FOUND');
        expect(result.message).toContain('employee record');
      }
    });
  });

  describe('Basic functionality', () => {
    it('returns team time-off requests', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].employee_name).toBe('John Doe');
        expect(result.data[1].employee_name).toBe('Jane Smith');
      }
    });

    it('filters by direct reports (manager_id)', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      await listTeamTimeOffRequests({}, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('e.manager_id = $1'),
        expect.arrayContaining(['manager-emp-123'])
      );
    });

    it('applies custom limit', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [mockTeamRequests[0]],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const input: ListTeamTimeOffRequestsInput = { limit: 10 };
      await listTeamTimeOffRequests(input, mockManagerContext);

      // Should query with limit + 1 = 11
      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([11])
      );
    });

    it('enforces maximum limit of 100', async () => {
      const input: ListTeamTimeOffRequestsInput = { limit: 150 };
      const result = await listTeamTimeOffRequests(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Status filtering', () => {
    it('filters by pending status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const input: ListTeamTimeOffRequestsInput = { status: 'pending' };
      await listTeamTimeOffRequests(input, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['pending'])
      );
    });

    it('filters by approved status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          command: '',
          oid: 0,
          fields: [],
        });

      const input: ListTeamTimeOffRequestsInput = { status: 'approved' };
      await listTeamTimeOffRequests(input, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('r.status = $'),
        expect.arrayContaining(['approved'])
      );
    });

    it('rejects invalid status', async () => {
      const input = { status: 'invalid' as any };
      const result = await listTeamTimeOffRequests(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Cursor-based pagination', () => {
    it('returns nextCursor when more records exist', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      const paginatedRequests = Array.from({ length: 51 }, (_, i) => ({
        ...mockTeamRequests[0],
        request_id: `${String(i).padStart(3, '0')}e4567-e89b-12d3-a456-426614174001`,
        created_at: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }));

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: paginatedRequests,
          rowCount: 51,
          command: '',
          oid: 0,
          fields: [],
        });

      const input: ListTeamTimeOffRequestsInput = { limit: 50 };
      const result = await listTeamTimeOffRequests(input, mockManagerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(50);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('accepts valid cursor', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
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

      const input: ListTeamTimeOffRequestsInput = { cursor };
      await listTeamTimeOffRequests(input, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('r.created_at'),
        expect.arrayContaining(['2026-02-01T10:00:00Z', '123e4567-e89b-12d3-a456-426614174001'])
      );
    });

    it('handles invalid cursor gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const input: ListTeamTimeOffRequestsInput = { cursor: 'invalid-cursor!!!' };
      const result = await listTeamTimeOffRequests(input, mockManagerContext);

      expect(result.status).toBe('success');
    });
  });

  describe('Metadata hints', () => {
    it('includes pending count hint when pending requests exist', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success' && result.metadata) {
        expect(result.metadata.hint).toContain('pending');
        expect(result.metadata.hint).toContain('approve_time_off_request');
      }
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('handles permission denied errors', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('permission denied'));

      const result = await listTeamTimeOffRequests({}, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });

  describe('Query structure', () => {
    it('joins with employees table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      await listTeamTimeOffRequests({}, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('JOIN hr.employees e ON r.employee_id = e.id'),
        expect.any(Array)
      );
    });

    it('joins with time_off_types table', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      await listTeamTimeOffRequests({}, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('JOIN hr.time_off_types t ON r.type_code = t.type_code'),
        expect.any(Array)
      );
    });

    it('orders by created_at descending', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({
          rows: [mockManagerRecord],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: mockTeamRequests,
          rowCount: 2,
          command: '',
          oid: 0,
          fields: [],
        });

      await listTeamTimeOffRequests({}, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('ORDER BY r.created_at DESC'),
        expect.any(Array)
      );
    });
  });
});
