/**
 * List Expense Reports Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for NOT_IMPLEMENTED response.
 * This tool is not available in v1.3 schema - tests verify proper error handling.
 */

import { listExpenseReports, ListExpenseReportsInput } from './list-expense-reports';
import { createMockUserContext } from '../test-utils';
import { isErrorResponse } from '../types/response';

describe('listExpenseReports', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  describe('NOT_IMPLEMENTED response', () => {
    it('should return NOT_IMPLEMENTED error', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should include descriptive message about schema limitation', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      if (isErrorResponse(result)) {
        expect(result.message).toContain('v1.3');
        expect(result.message).toContain('not available');
      }
    });

    it('should include suggested action for alternative tools', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      if (isErrorResponse(result)) {
        expect(result.suggestedAction).toContain('list_invoices');
        expect(result.suggestedAction).toContain('financial_reports');
      }
    });

    it('should include details about required tables', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      if (isErrorResponse(result)) {
        expect(result.details).toBeDefined();
        expect(result.details?.requiredTables).toContain('finance.expense_reports');
        expect(result.details?.requiredTables).toContain('finance.expense_line_items');
        expect(result.details?.operation).toBe('list_expense_reports');
      }
    });

    it('should explain semantic mismatch with existing tables', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      if (isErrorResponse(result)) {
        expect(result.details?.currentTable).toBe('finance.financial_reports');
        expect(result.details?.semanticMismatch).toContain('company summaries');
      }
    });

    it('should include documentation reference', async () => {
      const result = await listExpenseReports({ limit: 50 }, userContext);

      if (isErrorResponse(result)) {
        expect(result.details?.documentation).toContain('lessons-learned.md');
      }
    });

    it('should return consistent error regardless of filters provided', async () => {
      const resultWithFilters = await listExpenseReports(
        {
          status: 'SUBMITTED',
          employeeId: '550e8400-e29b-41d4-a716-446655440000',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          limit: 50,
        },
        userContext
      );

      expect(isErrorResponse(resultWithFilters)).toBe(true);
      if (isErrorResponse(resultWithFilters)) {
        expect(resultWithFilters.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should return consistent error for all users regardless of role', async () => {
      const writeUser = createMockUserContext({ roles: ['finance-write'] });
      const execUser = createMockUserContext({ roles: ['executive'] });

      const readResult = await listExpenseReports({ limit: 50 }, userContext);
      const writeResult = await listExpenseReports({ limit: 50 }, writeUser);
      const execResult = await listExpenseReports({ limit: 50 }, execUser);

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
