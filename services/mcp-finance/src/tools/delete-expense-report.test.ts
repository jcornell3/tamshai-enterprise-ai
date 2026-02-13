/**
 * Delete Expense Report Tool Tests - MCP-Finance (v1.5)
 */

import { deleteExpenseReport, executeDeleteExpenseReport } from './delete-expense-report';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse, isPendingConfirmationResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));
jest.mock('../utils/redis', () => ({ storePendingConfirmation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('uuid', () => ({ v4: () => 'test-confirmation-id' }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('deleteExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reject users without finance-write role', async () => {
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      readUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should return error when expense report not found', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('EXPENSE_REPORT_NOT_FOUND');
  });

  it('should reject deletion of APPROVED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'APPROVED',
      item_count: 3,
    }]));
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('CANNOT_DELETE_EXPENSE_REPORT');
  });

  it('should reject deletion of REIMBURSED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'REIMBURSED',
      item_count: 3,
    }]));
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.suggestedAction).toContain('audit purposes');
  });

  it('should return pending_confirmation for DRAFT reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'DRAFT',
      item_count: 3,
    }]));
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
    if (isPendingConfirmationResponse(result)) {
      expect(result.action).toBe('delete_expense_report');
      expect(result.message).toContain('cannot be undone');
    }
  });

  it('should return pending_confirmation for REJECTED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'REJECTED',
      item_count: 3,
    }]));
    const result = await deleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
  });
});

describe('executeDeleteExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should delete expense report and return success', async () => {
    // First call deletes items, second call deletes report
    mockQueryWithRLS
      .mockResolvedValueOnce(createMockDbResult([])) // Delete items
      .mockResolvedValueOnce(createMockDbResult([{
        id: '550e8400-e29b-41d4-a716-446655440000',
        report_number: 'EXP-2024-001',
        title: 'Q1 Travel Expenses',
        total_amount: 500,
      }]));
    const result = await executeDeleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
    }
  });

  it('should return error when expense report no longer deletable', async () => {
    mockQueryWithRLS
      .mockResolvedValueOnce(createMockDbResult([])) // Delete items
      .mockResolvedValueOnce(createMockDbResult([])); // Report not found or status changed
    const result = await executeDeleteExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
  });
});
