/**
 * List Expense Reports Tool Tests - MCP-Finance (v1.5)
 *
 * Tests for the implemented list_expense_reports tool.
 */

import { listExpenseReports } from './list-expense-reports';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('listExpenseReports', () => {
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const employeeUserContext = createMockUserContext({ roles: ['employee'] });

  beforeEach(() => { jest.clearAllMocks(); });

  describe('permission checks', () => {
    it('should allow users with finance-read role', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
      const result = await listExpenseReports({ limit: 50 }, readUserContext);
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should allow users with finance-write role', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
      const result = await listExpenseReports({ limit: 50 }, writeUserContext);
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should allow users with employee role (RLS filters to own reports)', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
      const result = await listExpenseReports({ limit: 50 }, employeeUserContext);
      expect(isSuccessResponse(result)).toBe(true);
    });
  });

  describe('data retrieval', () => {
    it('should return expense reports list on success', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([
        {
          id: 'report-001',
          report_number: 'EXP-2024-001',
          employee_id: 'emp-123',
          department_code: 'ENG',
          title: 'Q1 Travel Expenses',
          total_amount: 1500,
          status: 'SUBMITTED',
          submission_date: '2024-01-15',
          item_count: 5,
        },
        {
          id: 'report-002',
          report_number: 'EXP-2024-002',
          employee_id: 'emp-456',
          department_code: 'MKT',
          title: 'Q1 Marketing Events',
          total_amount: 3200,
          status: 'APPROVED',
          submission_date: '2024-02-01',
          item_count: 8,
        },
      ]));

      const result = await listExpenseReports({ limit: 50 }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].report_number).toBe('EXP-2024-001');
        expect(result.data[1].report_number).toBe('EXP-2024-002');
      }
    });

    it('should return empty array when no reports found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await listExpenseReports({ limit: 50 }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe('filtering', () => {
    it('should accept status filter', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
        id: 'report-001',
        report_number: 'EXP-2024-001',
        employee_id: 'emp-123',
        department_code: 'ENG',
        title: 'Q1 Travel Expenses',
        total_amount: 1500,
        status: 'SUBMITTED',
        submission_date: '2024-01-15',
        item_count: 5,
      }]));

      const result = await listExpenseReports({ status: 'SUBMITTED', limit: 50 }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      expect(mockQueryWithRLS).toHaveBeenCalled();
    });

    it('should accept date range filters', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await listExpenseReports({
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        limit: 50,
      }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should accept department filter', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await listExpenseReports({
        department: 'ENG',
        limit: 50,
      }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });

  describe('pagination', () => {
    it('should indicate hasMore when more records exist', async () => {
      // Return limit+1 records to indicate more data available
      const reports = Array.from({ length: 51 }, (_, i) => ({
        id: `report-${i}`,
        report_number: `EXP-2024-${i.toString().padStart(3, '0')}`,
        employee_id: 'emp-123',
        department_code: 'ENG',
        title: `Expense Report ${i}`,
        total_amount: 100 * (i + 1),
        status: 'SUBMITTED',
        submission_date: '2024-01-15',
        item_count: 3,
      }));
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(reports));

      const result = await listExpenseReports({ limit: 50 }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(50); // Should trim to limit
        expect(result.metadata?.hasMore).toBe(true);
      }
    });

    it('should support cursor-based pagination', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
        id: 'report-051',
        report_number: 'EXP-2024-051',
        employee_id: 'emp-123',
        department_code: 'ENG',
        title: 'Expense Report 51',
        total_amount: 5100,
        status: 'SUBMITTED',
        submission_date: '2024-01-15',
        item_count: 3,
      }]));

      const result = await listExpenseReports({
        cursor: 'report-050',
        limit: 50,
      }, readUserContext);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });
});
