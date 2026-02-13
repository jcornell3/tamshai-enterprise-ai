/**
 * Get Expense Report Tool Tests - MCP-Finance (v1.5)
 *
 * Tests for the implemented get_expense_report tool.
 */

import { getExpenseReport } from './get-expense-report';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('getExpenseReport', () => {
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const employeeUserContext = createMockUserContext({ roles: ['employee'] });

  beforeEach(() => { jest.clearAllMocks(); });

  describe('permission checks', () => {
    it('should allow users with finance-read role', async () => {
      mockQueryWithRLS
        .mockResolvedValueOnce(createMockDbResult([{
          id: '550e8400-e29b-41d4-a716-446655440000',
          report_number: 'EXP-2024-001',
          employee_id: 'emp-123',
          department_code: 'ENG',
          title: 'Q1 Travel Expenses',
          total_amount: 1500,
          status: 'SUBMITTED',
          submission_date: '2024-01-15',
        }]))
        .mockResolvedValueOnce(createMockDbResult([])); // Items query

      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        readUserContext
      );
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should allow users with finance-write role', async () => {
      mockQueryWithRLS
        .mockResolvedValueOnce(createMockDbResult([{
          id: '550e8400-e29b-41d4-a716-446655440000',
          report_number: 'EXP-2024-001',
          employee_id: 'emp-123',
          department_code: 'ENG',
          title: 'Q1 Travel Expenses',
          total_amount: 1500,
          status: 'SUBMITTED',
        }]))
        .mockResolvedValueOnce(createMockDbResult([]));

      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should allow users with employee role (RLS filters to own reports)', async () => {
      mockQueryWithRLS
        .mockResolvedValueOnce(createMockDbResult([{
          id: '550e8400-e29b-41d4-a716-446655440000',
          report_number: 'EXP-2024-001',
          employee_id: 'emp-123',
          department_code: 'ENG',
          title: 'Q1 Travel Expenses',
          total_amount: 1500,
          status: 'SUBMITTED',
        }]))
        .mockResolvedValueOnce(createMockDbResult([]));

      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        employeeUserContext
      );
      expect(isSuccessResponse(result)).toBe(true);
    });
  });

  describe('data retrieval', () => {
    it('should return expense report with items on success', async () => {
      mockQueryWithRLS
        .mockResolvedValueOnce(createMockDbResult([{
          id: '550e8400-e29b-41d4-a716-446655440000',
          report_number: 'EXP-2024-001',
          employee_id: 'emp-123',
          department_code: 'ENG',
          title: 'Q1 Travel Expenses',
          total_amount: 1500,
          status: 'SUBMITTED',
          submission_date: '2024-01-15',
          submitted_at: '2024-01-15T10:00:00Z',
          approved_at: null,
          approved_by: null,
          rejected_at: null,
          rejected_by: null,
          rejection_reason: null,
          reimbursed_at: null,
          reimbursed_by: null,
          payment_reference: null,
          notes: 'Conference travel',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        }]))
        .mockResolvedValueOnce(createMockDbResult([
          {
            id: 'item-001',
            expense_date: '2024-01-10',
            category: 'TRAVEL',
            description: 'Flight to NYC',
            vendor: 'Delta Airlines',
            amount: 500,
            currency: 'USD',
            receipt_url: 'https://storage.example.com/receipt-001.pdf',
            receipt_required: true,
            receipt_uploaded: true,
            notes: null,
          },
          {
            id: 'item-002',
            expense_date: '2024-01-10',
            category: 'LODGING',
            description: 'Hotel - 3 nights',
            vendor: 'Marriott',
            amount: 750,
            currency: 'USD',
            receipt_url: 'https://storage.example.com/receipt-002.pdf',
            receipt_required: true,
            receipt_uploaded: true,
            notes: null,
          },
          {
            id: 'item-003',
            expense_date: '2024-01-11',
            category: 'MEALS',
            description: 'Client dinner',
            vendor: 'Restaurant XYZ',
            amount: 250,
            currency: 'USD',
            receipt_url: null,
            receipt_required: true,
            receipt_uploaded: false,
            notes: 'Team dinner with client',
          },
        ]));

      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        readUserContext
      );

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        const report = result.data;
        expect(report.report_number).toBe('EXP-2024-001');
        expect(report.title).toBe('Q1 Travel Expenses');
        expect(report.total_amount).toBe(1500);
        expect(report.items).toHaveLength(3);
        expect(report.items[0].description).toBe('Flight to NYC');
        expect(report.items[1].description).toBe('Hotel - 3 nights');
        expect(report.items[2].description).toBe('Client dinner');
      }
    });

    it('should return error when report not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        readUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('EXPENSE_REPORT_NOT_FOUND');
      }
    });
  });

  describe('input validation', () => {
    it('should reject invalid UUID format', async () => {
      const result = await getExpenseReport(
        { reportId: 'invalid-uuid' },
        readUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});
