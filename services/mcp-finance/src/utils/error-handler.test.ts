/**
 * Error Handler Tests - MCP-Finance
 *
 * RED Phase: Tests for centralized error handling.
 * Validates LLM-friendly error schemas (Architecture v1.4).
 */

import {
  ErrorCode,
  handleValidationError,
  handleBudgetNotFound,
  handleInvoiceNotFound,
  handleExpenseReportNotFound,
  handleInsufficientPermissions,
  handleCannotDeleteApprovedInvoice,
  handleBudgetAlreadyApproved,
  handleDatabaseError,
  withErrorHandling,
} from './error-handler';
import { createSuccessResponse } from '../types/response';

describe('Error Handler - MCP Finance', () => {
  describe('ErrorCode enum', () => {
    it('should have INVALID_INPUT code', () => {
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('should have MISSING_REQUIRED_FIELD code', () => {
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should have BUDGET_NOT_FOUND code', () => {
      expect(ErrorCode.BUDGET_NOT_FOUND).toBe('BUDGET_NOT_FOUND');
    });

    it('should have INVOICE_NOT_FOUND code', () => {
      expect(ErrorCode.INVOICE_NOT_FOUND).toBe('INVOICE_NOT_FOUND');
    });

    it('should have EXPENSE_REPORT_NOT_FOUND code', () => {
      expect(ErrorCode.EXPENSE_REPORT_NOT_FOUND).toBe('EXPENSE_REPORT_NOT_FOUND');
    });

    it('should have INSUFFICIENT_PERMISSIONS code', () => {
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should have DATABASE_ERROR code', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    });

    it('should have INTERNAL_ERROR code', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });

  describe('handleValidationError', () => {
    it('should return MCPErrorResponse with correct structure', () => {
      const zodError = {
        name: 'ZodError',
        errors: [
          { path: ['limit'], message: 'Expected number, received string' },
        ],
      };

      const result = handleValidationError(zodError);

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.message).toContain('Input validation failed');
      expect(result.message).toContain('limit');
      expect(result.suggestedAction).toBeDefined();
      expect(result.details).toHaveProperty('validationErrors');
    });

    it('should include all validation errors in message', () => {
      const zodError = {
        name: 'ZodError',
        errors: [
          { path: ['fiscalYear'], message: 'Expected number' },
          { path: ['department'], message: 'String too short' },
        ],
      };

      const result = handleValidationError(zodError);

      expect(result.message).toContain('fiscalYear');
      expect(result.message).toContain('department');
    });
  });

  describe('handleBudgetNotFound', () => {
    it('should return MCPErrorResponse with budget ID', () => {
      const result = handleBudgetNotFound('budget-123');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.BUDGET_NOT_FOUND);
      expect(result.message).toContain('budget-123');
      expect(result.suggestedAction).toContain('list-budgets');
      expect(result.details).toEqual({ budgetId: 'budget-123' });
    });
  });

  describe('handleInvoiceNotFound', () => {
    it('should return MCPErrorResponse with invoice ID', () => {
      const result = handleInvoiceNotFound('inv-456');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.INVOICE_NOT_FOUND);
      expect(result.message).toContain('inv-456');
      expect(result.suggestedAction).toContain('list_invoices');
      expect(result.details).toEqual({ invoiceId: 'inv-456' });
    });
  });

  describe('handleExpenseReportNotFound', () => {
    it('should return MCPErrorResponse with report ID', () => {
      const result = handleExpenseReportNotFound('exp-789');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.EXPENSE_REPORT_NOT_FOUND);
      expect(result.message).toContain('exp-789');
      expect(result.details).toEqual({ reportId: 'exp-789' });
    });
  });

  describe('handleInsufficientPermissions', () => {
    it('should include required role and user roles', () => {
      const result = handleInsufficientPermissions('finance-write', ['finance-read']);

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
      expect(result.message).toContain('finance-write');
      expect(result.message).toContain('finance-read');
      expect(result.suggestedAction).toContain('administrator');
      expect(result.details).toEqual({
        requiredRole: 'finance-write',
        userRoles: ['finance-read'],
      });
    });
  });

  describe('handleCannotDeleteApprovedInvoice', () => {
    it('should return error with invoice ID and guidance', () => {
      const result = handleCannotDeleteApprovedInvoice('inv-approved');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.CANNOT_DELETE_APPROVED_INVOICE);
      expect(result.message).toContain('inv-approved');
      expect(result.message).toContain('approved');
      expect(result.suggestedAction).toContain('pending');
      expect(result.details).toEqual({ invoiceId: 'inv-approved' });
    });
  });

  describe('handleBudgetAlreadyApproved', () => {
    it('should return error with budget ID', () => {
      const result = handleBudgetAlreadyApproved('budget-approved');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.BUDGET_ALREADY_APPROVED);
      expect(result.message).toContain('budget-approved');
      expect(result.message).toContain('approved');
      expect(result.details).toEqual({ budgetId: 'budget-approved' });
    });
  });

  describe('handleDatabaseError', () => {
    it('should return MCPErrorResponse with operation context', () => {
      const error = new Error('Connection timeout');
      const result = handleDatabaseError(error, 'list_budgets');

      expect(result.status).toBe('error');
      expect(result.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(result.suggestedAction).toContain('try again');
      expect(result.details).toHaveProperty('operation', 'list_budgets');
      expect(result.details).toHaveProperty('errorMessage', 'Connection timeout');
    });
  });

  describe('withErrorHandling', () => {
    it('should return success response when no error occurs', async () => {
      const successFn = async () => createSuccessResponse({ test: 'data' });

      const result = await withErrorHandling('test_op', successFn);

      expect(result.status).toBe('success');
      expect((result as any).data).toEqual({ test: 'data' });
    });

    it('should catch ZodError and return validation error', async () => {
      const zodError = {
        name: 'ZodError',
        errors: [{ path: ['field'], message: 'Invalid' }],
      };
      const failFn = async () => {
        throw zodError;
      };

      const result = await withErrorHandling('test_op', failFn);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('should catch generic errors and return internal error', async () => {
      const failFn = async () => {
        throw new Error('Unexpected failure');
      };

      const result = await withErrorHandling('test_op', failFn);

      expect(result.status).toBe('error');
      expect((result as any).code).toBe(ErrorCode.INTERNAL_ERROR);
      expect((result as any).details).toHaveProperty('operation', 'test_op');
    });
  });
});
