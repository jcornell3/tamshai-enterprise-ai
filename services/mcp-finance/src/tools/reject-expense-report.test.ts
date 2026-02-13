/**
 * Reject Expense Report Tool Tests - MCP-Finance (v1.5)
 */

import { rejectExpenseReport, executeRejectExpenseReport } from './reject-expense-report';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse, isPendingConfirmationResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));
jest.mock('../utils/redis', () => ({ storePendingConfirmation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('uuid', () => ({ v4: () => 'test-confirmation-id' }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('rejectExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reject users without finance-write role', async () => {
    const result = await rejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'Missing receipt documentation' },
      readUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should require rejection reason of at least 10 characters', async () => {
    const result = await rejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'short' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INVALID_INPUT');
  });

  it('should return error when expense report not found', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await rejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'Missing receipt documentation' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('EXPENSE_REPORT_NOT_FOUND');
  });

  it('should reject rejection of non-SUBMITTED/UNDER_REVIEW reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'APPROVED',
      submission_date: '2024-01-15',
      item_count: 3,
    }]));
    const result = await rejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'Missing receipt documentation' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INVALID_EXPENSE_REPORT_STATUS');
  });

  it('should return pending_confirmation for SUBMITTED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'SUBMITTED',
      submission_date: '2024-01-15',
      item_count: 3,
    }]));
    const result = await rejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'Missing receipt documentation' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
    if (isPendingConfirmationResponse(result)) {
      expect(result.action).toBe('reject_expense_report');
      expect(result.message).toContain('Missing receipt');
    }
  });
});

describe('executeRejectExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reject expense report and return success', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
    }]));
    const result = await executeRejectExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000', rejectionReason: 'Missing receipt documentation' },
      writeUserContext
    );
    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; newStatus: string; rejectionReason: string };
      expect(data.success).toBe(true);
      expect(data.newStatus).toBe('REJECTED');
      expect(data.rejectionReason).toBe('Missing receipt documentation');
    }
  });
});
