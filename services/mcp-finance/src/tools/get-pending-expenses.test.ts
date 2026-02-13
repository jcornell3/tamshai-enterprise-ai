import { getPendingExpenses, GetPendingExpensesInput, PendingExpenseReport } from './get-pending-expenses';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import { isSuccessResponse, isErrorResponse } from '../types/response';

jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

const mockQueryWithRLS = dbConnection.queryWithRLS as jest.MockedFunction<typeof dbConnection.queryWithRLS>;

describe('get_pending_expenses', () => {
  const mockUserContext: UserContext = {
    userId: 'finance-user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['finance-read'],
  };

  const mockPendingExpenses: PendingExpenseReport[] = [
    {
      id: 'exp-001',
      reportNumber: 'EXP-2026-0001',
      employeeId: 'emp-001',
      employeeName: 'Marcus Johnson',
      departmentCode: 'ENGINEERING',
      title: 'Conference Travel',
      totalAmount: 1250.50,
      status: 'SUBMITTED',
      submissionDate: '2026-02-01',
      submittedAt: '2026-02-01T10:00:00Z',
      itemCount: 5,
    },
    {
      id: 'exp-002',
      reportNumber: 'EXP-2026-0002',
      employeeId: 'emp-002',
      employeeName: 'Sarah Wilson',
      departmentCode: 'SALES',
      title: 'Client Dinner',
      totalAmount: 450.00,
      status: 'UNDER_REVIEW',
      submissionDate: '2026-02-05',
      submittedAt: '2026-02-05T14:00:00Z',
      itemCount: 3,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('returns pending expense reports', () => {
    it('returns SUBMITTED and UNDER_REVIEW expense reports', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingExpenses,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getPendingExpenses({}, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].status).toBe('SUBMITTED');
        expect(result.data[1].status).toBe('UNDER_REVIEW');
      }
    });

    it('verifies SQL query filters for pending statuses', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingExpenses,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingExpenses({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining("status IN ('SUBMITTED', 'UNDER_REVIEW')"),
        expect.any(Array)
      );
    });
  });

  describe('empty result handling', () => {
    it('returns empty array when no pending expenses', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getPendingExpenses({}, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(0);
        expect(result.metadata?.hasMore).toBe(false);
      }
    });
  });

  describe('department filtering', () => {
    it('filters by departmentCode when specified', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: [mockPendingExpenses[0]],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingExpensesInput = { departmentCode: 'ENGINEERING' };
      await getPendingExpenses(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('department_code'),
        expect.arrayContaining(['ENGINEERING'])
      );
    });
  });

  describe('pagination', () => {
    it('supports cursor-based pagination with hasMore=true', async () => {
      const manyExpenses = [...mockPendingExpenses, {
        ...mockPendingExpenses[0],
        id: 'exp-003',
      }];

      mockQueryWithRLS.mockResolvedValue({
        rows: manyExpenses,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingExpensesInput = { limit: 2 };
      const result = await getPendingExpenses(input, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('returns hasMore=false when all data returned', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingExpenses,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingExpensesInput = { limit: 50 };
      const result = await getPendingExpenses(input, mockUserContext);

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
        rows: mockPendingExpenses,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingExpenses({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  describe('input validation', () => {
    it('rejects invalid limit (too high)', async () => {
      const input = { limit: 500 } as GetPendingExpensesInput;
      const result = await getPendingExpenses(input, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await getPendingExpenses({}, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});
