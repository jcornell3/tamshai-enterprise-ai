import { getPendingBudgets, GetPendingBudgetsInput, PendingBudget } from './get-pending-budgets';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import { isSuccessResponse, isErrorResponse } from '../types/response';

jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

const mockQueryWithRLS = dbConnection.queryWithRLS as jest.MockedFunction<typeof dbConnection.queryWithRLS>;

describe('get_pending_budgets', () => {
  const mockUserContext: UserContext = {
    userId: 'finance-user-123',
    username: 'bob.martinez',
    email: 'bob.martinez@tamshai.com',
    roles: ['finance-read'],
  };

  const mockPendingBudgets: PendingBudget[] = [
    {
      id: 'budget-001',
      budgetId: 'BUD-2026-001',
      departmentCode: 'ENGINEERING',
      department: 'Engineering',
      fiscalYear: 2026,
      categoryName: 'Software Licenses',
      budgetedAmount: 50000.00,
      currentBudget: 40000.00,
      submittedBy: 'emp-001',
      submittedByName: 'Nina Patel',
      submittedAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'budget-002',
      budgetId: 'BUD-2026-002',
      departmentCode: 'SALES',
      department: 'Sales',
      fiscalYear: 2026,
      categoryName: 'Marketing',
      budgetedAmount: 75000.00,
      currentBudget: 60000.00,
      submittedBy: 'emp-002',
      submittedByName: 'Carol Johnson',
      submittedAt: '2026-01-20T14:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('returns pending budgets', () => {
    it('returns PENDING_APPROVAL budgets', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingBudgets,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getPendingBudgets({}, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].departmentCode).toBe('ENGINEERING');
        expect(result.data[1].departmentCode).toBe('SALES');
      }
    });

    it('verifies SQL query filters for PENDING_APPROVAL status', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingBudgets,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingBudgets({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining("status = 'PENDING_APPROVAL'"),
        expect.any(Array)
      );
    });
  });

  describe('empty result handling', () => {
    it('returns empty array when no pending budgets', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await getPendingBudgets({}, mockUserContext);

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
        rows: [mockPendingBudgets[0]],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingBudgetsInput = { departmentCode: 'ENGINEERING' };
      await getPendingBudgets(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('department_code'),
        expect.arrayContaining(['ENGINEERING'])
      );
    });
  });

  describe('fiscal year filtering', () => {
    it('filters by fiscalYear when specified', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingBudgets,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingBudgetsInput = { fiscalYear: 2026 };
      await getPendingBudgets(input, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.stringContaining('fiscal_year'),
        expect.arrayContaining([2026])
      );
    });
  });

  describe('pagination', () => {
    it('supports cursor-based pagination with hasMore=true', async () => {
      const manyBudgets = [...mockPendingBudgets, {
        ...mockPendingBudgets[0],
        id: 'budget-003',
      }];

      mockQueryWithRLS.mockResolvedValue({
        rows: manyBudgets,
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingBudgetsInput = { limit: 2 };
      const result = await getPendingBudgets(input, mockUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('returns hasMore=false when all data returned', async () => {
      mockQueryWithRLS.mockResolvedValue({
        rows: mockPendingBudgets,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const input: GetPendingBudgetsInput = { limit: 50 };
      const result = await getPendingBudgets(input, mockUserContext);

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
        rows: mockPendingBudgets,
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await getPendingBudgets({}, mockUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        mockUserContext,
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  describe('input validation', () => {
    it('rejects invalid limit (too high)', async () => {
      const input = { limit: 500 } as GetPendingBudgetsInput;
      const result = await getPendingBudgets(input, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('error handling', () => {
    it('handles database errors gracefully', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await getPendingBudgets({}, mockUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});
