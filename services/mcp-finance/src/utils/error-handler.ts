/**
 * Finance Error Handler (Architecture v1.4)
 *
 * Domain-specific error handlers for the Finance MCP service.
 * Common error handling utilities are imported from @tamshai/shared.
 */

import {
  ErrorCode,
  createErrorResponse,
  MCPErrorResponse,
} from '@tamshai/shared';
import { MCPToolResponse } from '../types/response';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Re-export ErrorCode and types for consumers
export { ErrorCode, MCPErrorResponse };

/**
 * Handle validation errors from Zod
 */
export function handleValidationError(error: { errors: Array<{ path: string[]; message: string }> }): MCPErrorResponse {
  logger.warn('Input validation failed', { error: error.errors });

  const fieldErrors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');

  return createErrorResponse(
    ErrorCode.INVALID_INPUT,
    `Input validation failed: ${fieldErrors}`,
    'Please check your input parameters and ensure they match the expected format.',
    { validationErrors: error.errors }
  );
}

/**
 * Handle budget not found error
 */
export function handleBudgetNotFound(budgetId: string): MCPErrorResponse {
  logger.warn('Budget not found', { budgetId });
  return createErrorResponse(
    ErrorCode.BUDGET_NOT_FOUND,
    `Budget with ID "${budgetId}" was not found`,
    'Please verify the budget ID is correct. You can search for budgets using the list-budgets tool with filters.',
    { budgetId }
  );
}

/**
 * Handle invoice not found error
 */
export function handleInvoiceNotFound(invoiceId: string): MCPErrorResponse {
  logger.warn('Invoice not found', { invoiceId });
  return createErrorResponse(
    ErrorCode.INVOICE_NOT_FOUND,
    `Invoice with ID "${invoiceId}" was not found`,
    'Please verify the invoice ID is correct. You can search for invoices using the list_invoices tool with filters.',
    { invoiceId }
  );
}

/**
 * Handle expense report not found error
 */
export function handleExpenseReportNotFound(reportId: string): MCPErrorResponse {
  logger.warn('Expense report not found', { reportId });
  return createErrorResponse(
    ErrorCode.EXPENSE_REPORT_NOT_FOUND,
    `Expense report with ID "${reportId}" was not found`,
    'Please verify the expense report ID is correct.',
    { reportId }
  );
}

/**
 * Handle insufficient permissions error
 */
export function handleInsufficientPermissions(requiredRole: string, userRoles: string[]): MCPErrorResponse {
  logger.warn('Insufficient permissions', { requiredRole, userRoles });
  return createErrorResponse(
    ErrorCode.INSUFFICIENT_PERMISSIONS,
    `This operation requires "${requiredRole}" role. You have: ${userRoles.join(', ')}`,
    'Please contact your administrator if you need additional permissions.',
    { requiredRole, userRoles }
  );
}

/**
 * Handle cannot delete approved invoice error
 */
export function handleCannotDeleteApprovedInvoice(invoiceId: string): MCPErrorResponse {
  logger.warn('Attempted to delete approved invoice', { invoiceId });
  return createErrorResponse(
    ErrorCode.CANNOT_DELETE_APPROVED_INVOICE,
    `Cannot delete invoice "${invoiceId}" because it has already been approved`,
    'Only pending invoices can be deleted. Please contact finance administrator to void approved invoices.',
    { invoiceId }
  );
}

/**
 * Handle budget already approved error
 */
export function handleBudgetAlreadyApproved(budgetId: string): MCPErrorResponse {
  logger.warn('Budget already approved', { budgetId });
  return createErrorResponse(
    ErrorCode.BUDGET_ALREADY_APPROVED,
    `Budget "${budgetId}" has already been approved`,
    'This budget has already been approved and cannot be approved again.',
    { budgetId }
  );
}

/**
 * Handle database errors
 */
export function handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Database error', { error: error.message, stack: error.stack, operation });
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'Please try again. If the problem persists, contact support.',
    { operation, errorMessage: error.message }
  );
}

/**
 * Generic error handler wrapper
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<MCPToolResponse<T>>
): Promise<MCPToolResponse<T>> {
  try {
    return await fn();
  } catch (error: unknown) {
    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ZodError') {
      return handleValidationError(error as unknown as { errors: Array<{ path: string[]; message: string }> });
    }

    // Handle all other errors
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unexpected error in operation', {
      operation,
      error: err.message,
      stack: err.stack,
    });

    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      'Please try again. If the problem persists, contact support.',
      { operation }
    );
  }
}
