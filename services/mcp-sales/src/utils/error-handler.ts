/**
 * Sales Error Handler (Architecture v1.4)
 *
 * Domain-specific error handlers for the Sales MCP service.
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
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
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
 * Handle opportunity not found error
 */
export function handleOpportunityNotFound(opportunityId: string): MCPErrorResponse {
  logger.warn('Opportunity not found', { opportunityId });
  return createErrorResponse(
    ErrorCode.OPPORTUNITY_NOT_FOUND,
    `Opportunity with ID "${opportunityId}" was not found`,
    'Please verify the opportunity ID. You can search for opportunities using the list_opportunities tool.',
    { opportunityId }
  );
}

/**
 * Handle customer not found error
 */
export function handleCustomerNotFound(customerId: string): MCPErrorResponse {
  logger.warn('Customer not found', { customerId });
  return createErrorResponse(
    ErrorCode.CUSTOMER_NOT_FOUND,
    `Customer with ID "${customerId}" was not found`,
    'Please verify the customer ID. You can search for customers using the list_customers tool.',
    { customerId }
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
 * Handle cannot delete won opportunity error
 */
export function handleCannotDeleteWonOpportunity(opportunityId: string): MCPErrorResponse {
  logger.warn('Attempted to delete won opportunity', { opportunityId });
  return createErrorResponse(
    ErrorCode.CANNOT_DELETE_WON_OPPORTUNITY,
    `Cannot delete opportunity "${opportunityId}" because it has status "won"`,
    'Only open or lost opportunities can be deleted. Contact your sales administrator for won opportunities.',
    { opportunityId }
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
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ZodError') {
      return handleValidationError(error as unknown as { errors: Array<{ path: string[]; message: string }> });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unexpected error in operation', { operation, error: err.message, stack: err.stack });
    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      'Please try again. If the problem persists, contact support.',
      { operation }
    );
  }
}
