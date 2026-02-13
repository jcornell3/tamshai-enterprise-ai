import { getPendingTimeOff, GetPendingTimeOffInput, PendingTimeOffRequest } from './get-pending-time-off';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import { isSuccessResponse, isErrorResponse } from '../types/response';

jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

const mockQueryWithRLS = dbConnection.queryWithRLS as jest.MockedFunction<typeof dbConnection.queryWithRLS>;

describe('get_pending_time_off', () => {
  const mockUserContext: UserContext = {
    userId: 'manager-123',
    username: 'nina.patel',
    email: 'nina.patel@tamshai.com',
    roles: ['manager'],
  };

  const mockPendingRequests: PendingTimeOffRequest[] = [
    {
      requestId: 'req-001',
      employeeId: 'emp-001',
      employeeName: 'Marcus Johnson',
      typeCode: 'VACATION',
      typeName: 'Vacation',
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      totalDays: 5,
      notes: 'Spring break trip',
      createdAt: '2026-02-01T10:00:00Z',
    },
    {
      requestId: 'req-002',
      employeeId: 'emp-002',
      employeeName: 'Sarah Wilson',
      typeCode: 'SICK',
      typeName: 'Sick Leave',
      startDate: '2026-02-15',
      endDate: '2026-02-16',
      totalDays: 2,
      notes: null,
      createdAt: '2026-02-10T09:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('returns pending requests for approver', () => {
    it('returns pending time-off requests successfully', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingRequests,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingTimeOffInput = {};
      const result = await getPendingTimeOff(input, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].employeeName).toBe('Marcus Johnson');
        expect(result.data[0].typeCode).toBe('VACATION');
        expect(result.data[1].typeCode).toBe('SICK');
      }
    });

    it('verifies SQL query filters for pending status', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingRequests,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingTimeOff({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining("status = 'pending'"),
        expect.any(Array)
      );
    });
  });

  describe('empty result handling', () => {
    it('returns empty array when no pending requests', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getPendingTimeOff({}, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(0);
        expect(result.metadata?.hasMore).toBe(false);
      }
    });
  });

  describe('type filtering', () => {
    it('filters by typeCode when specified', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockPendingRequests[0]],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingTimeOffInput = { typeCode: 'VACATION' };
      await getPendingTimeOff(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('type_code'),
        expect.arrayContaining(['VACATION'])
      );
    });
  });

  describe('pagination', () => {
    it('supports cursor-based pagination with hasMore=true', async () => {
      // Return limit+1 rows to indicate more data exists
      const manyRequests = [...mockPendingRequests, {
        ...mockPendingRequests[0],
        requestId: 'req-003',
      }];

      mockQueryWithRLS.mockResolvedValue({
        rows: manyRequests,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingTimeOffInput = { limit: 2 };
      const result = await getPendingTimeOff(input, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('returns hasMore=false when all data returned', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingRequests,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingTimeOffInput = { limit: 50 };
      const result = await getPendingTimeOff(input, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.metadata?.hasMore).toBe(false);
        expect(result.metadata?.nextCursor).toBeUndefined();
      }
    });
  });

  describe('RLS enforcement', () => {
    it('calls queryWithRLS with userContext for access control', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingRequests,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingTimeOff({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  describe('input validation', () => {
    it('rejects invalid typeCode', async () => {
      const input = { typeCode: 'INVALID_TYPE' } as unknown as GetPendingTimeOffInput;
      const result = await getPendingTimeOff(input, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('rejects invalid limit (too high)', async () => {
      const input = { limit: 500 } as GetPendingTimeOffInput;
      const result = await getPendingTimeOff(input, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await getPendingTimeOff({}, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });
  });
});
