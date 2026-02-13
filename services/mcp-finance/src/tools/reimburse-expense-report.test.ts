/**
 * Reimburse Expense Report Tool Tests - MCP-Finance (v1.5)
 */

import { reimburseExpenseReport, executeReimburseExpenseReport } from './reimburse-expense-report';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse, isPendingConfirmationResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));
jest.mock('../utils/redis', () => ({ storePendingConfirmation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('uuid', () => ({ v4: () => 'test-confirmation-id' }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('reimburseExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reject users without finance-write role', async () => {
    const result = await reimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      readUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should return error when expense report not found', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await reimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('EXPENSE_REPORT_NOT_FOUND');
  });

  it('should reject reimbursement of SUBMITTED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'SUBMITTED',
      approved_at: null,
      item_count: 3,
    }]));
    const result = await reimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('INVALID_EXPENSE_REPORT_STATUS');
      expect(result.suggestedAction).toContain('approved first');
    }
  });

  it('should reject reimbursement of already REIMBURSED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'REIMBURSED',
      approved_at: '2024-01-20',
      item_count: 3,
    }]));
    const result = await reimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.suggestedAction).toContain('already been reimbursed');
  });

  it('should return pending_confirmation for APPROVED reports', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      employee_id: 'emp-123',
      department_code: 'ENG',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
      status: 'APPROVED',
      approved_at: '2024-01-20',
      item_count: 3,
    }]));
    const result = await reimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
    if (isPendingConfirmationResponse(result)) {
      expect(result.action).toBe('reimburse_expense_report');
      expect(result.message).toContain('APPROVED to REIMBURSED');
    }
  });
});

describe('executeReimburseExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reimburse expense report and return success', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      report_number: 'EXP-2024-001',
      title: 'Q1 Travel Expenses',
      total_amount: 500,
    }]));
    const result = await executeReimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; newStatus: string };
      expect(data.success).toBe(true);
      expect(data.newStatus).toBe('REIMBURSED');
    }
  });

  it('should return error when expense report no longer approved', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await executeReimburseExpenseReport(
      { reportId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
  });
});
