/**
 * Get Expense Report Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for NOT_IMPLEMENTED response.
 * This tool is not available in v1.3 schema - tests verify proper error handling.
 */

import { getExpenseReport, GetExpenseReportInput } from './get-expense-report';
import { createMockUserContext } from '../test-utils';
import { isErrorResponse } from '../types/response';

describe('getExpenseReport', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  describe('NOT_IMPLEMENTED response', () => {
    it('should return NOT_IMPLEMENTED error', async () => {
      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should include descriptive message about schema limitation', async () => {
      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );

      if (isErrorResponse(result)) {
        expect(result.message).toContain('v1.3');
        expect(result.message).toContain('not available');
      }
    });

    it('should include suggested action for alternative tools', async () => {
      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );

      if (isErrorResponse(result)) {
        expect(result.suggestedAction).toContain('list_invoices');
        expect(result.suggestedAction).toContain('financial_reports');
      }
    });

    it('should include details about required tables', async () => {
      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );

      if (isErrorResponse(result)) {
        expect(result.details).toBeDefined();
        expect(result.details?.requiredTables).toContain('finance.expense_reports');
        expect(result.details?.operation).toBe('get_expense_report');
      }
    });

    it('should include documentation reference', async () => {
      const result = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );

      if (isErrorResponse(result)) {
        expect(result.details?.documentation).toContain('lessons-learned.md');
      }
    });

    it('should return consistent error for all users regardless of role', async () => {
      const writeUser = createMockUserContext({ roles: ['finance-write'] });
      const execUser = createMockUserContext({ roles: ['executive'] });

      const readResult = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        userContext
      );
      const writeResult = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUser
      );
      const execResult = await getExpenseReport(
        { reportId: '550e8400-e29b-41d4-a716-446655440000' },
        execUser
      );

      // All should get the same NOT_IMPLEMENTED error
      expect(isErrorResponse(readResult)).toBe(true);
      expect(isErrorResponse(writeResult)).toBe(true);
      expect(isErrorResponse(execResult)).toBe(true);

      if (isErrorResponse(readResult) && isErrorResponse(writeResult) && isErrorResponse(execResult)) {
        expect(readResult.code).toBe('NOT_IMPLEMENTED');
        expect(writeResult.code).toBe('NOT_IMPLEMENTED');
        expect(execResult.code).toBe('NOT_IMPLEMENTED');
      }
    });
  });
});
