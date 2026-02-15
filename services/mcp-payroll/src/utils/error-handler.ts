/**
 * Payroll Error Handler
 *
 * Domain-specific error handlers for the Payroll MCP service.
 * Common error handling utilities are imported from @tamshai/shared.
 */

import {
  ErrorCode,
  createErrorHandlers,
  createErrorResponse,
  MCPErrorResponse,
} from '@tamshai/shared';
import { ZodError } from 'zod';
import { logger } from './logger';

// Create shared error handlers with our logger
const handlers = createErrorHandlers(logger);

// Re-export ErrorCode and types for consumers
export { ErrorCode, MCPErrorResponse };

/**
 * Handle pay run not found error
 */
export function handlePayRunNotFound(payRunId: string): MCPErrorResponse {
  logger.warn('Pay run not found', { payRunId });
  return createErrorResponse(
    ErrorCode.PAY_RUN_NOT_FOUND,
    `Pay run with ID "${payRunId}" was not found`,
    'Use list_pay_runs tool to find valid pay run IDs, or verify the ID format is correct (UUID expected).'
  );
}

/**
 * Handle pay stub not found error
 */
export function handlePayStubNotFound(payStubId: string): MCPErrorResponse {
  logger.warn('Pay stub not found', { payStubId });
  return createErrorResponse(
    ErrorCode.PAY_STUB_NOT_FOUND,
    `Pay stub with ID "${payStubId}" was not found`,
    'Use list_pay_stubs tool to find valid pay stub IDs for the employee.'
  );
}

/**
 * Handle contractor not found error
 */
export function handleContractorNotFound(contractorId: string): MCPErrorResponse {
  logger.warn('Contractor not found', { contractorId });
  return createErrorResponse(
    ErrorCode.CONTRACTOR_NOT_FOUND,
    `Contractor with ID "${contractorId}" was not found`,
    'Use list_contractors tool to find valid contractor IDs.'
  );
}

/**
 * Handle tax withholding not found error
 */
export function handleTaxWithholdingNotFound(employeeId: string): MCPErrorResponse {
  logger.warn('Tax withholding not found', { employeeId });
  return createErrorResponse(
    ErrorCode.TAX_WITHHOLDING_NOT_FOUND,
    `Tax withholding settings for employee "${employeeId}" were not found`,
    'Verify the employee ID is correct. The employee may not have tax withholding settings configured.'
  );
}

/**
 * Handle benefit not found error
 */
export function handleBenefitNotFound(benefitId: string): MCPErrorResponse {
  logger.warn('Benefit not found', { benefitId });
  return createErrorResponse(
    ErrorCode.BENEFIT_NOT_FOUND,
    `Benefit deduction with ID "${benefitId}" was not found`,
    'Use get_benefits tool to list available benefit deductions for the employee.'
  );
}

/**
 * Handle insufficient permissions error
 */
export function handleInsufficientPermissions(
  operation: string,
  requiredRoles: string[]
): MCPErrorResponse {
  logger.warn('Insufficient permissions', { operation, requiredRoles });
  return createErrorResponse(
    ErrorCode.INSUFFICIENT_PERMISSIONS,
    `You do not have permission to perform "${operation}"`,
    `This operation requires one of the following roles: ${requiredRoles.join(', ')}. Contact your administrator for access.`
  );
}

/**
 * Handle write permission required error
 */
export function handleWritePermissionRequired(
  operation: string,
  currentRoles: string[]
): MCPErrorResponse {
  logger.warn('Write permission required', { operation, currentRoles });
  return createErrorResponse(
    ErrorCode.WRITE_PERMISSION_REQUIRED,
    `Write permission required for "${operation}"`,
    'You have read-only access to payroll data. Contact your administrator to request payroll-write permission.'
  );
}

/**
 * Handle invalid input error
 */
export function handleInvalidInput(message: string, field?: string): MCPErrorResponse {
  logger.warn('Invalid input', { message, field });
  return createErrorResponse(
    ErrorCode.INVALID_INPUT,
    message,
    field
      ? `Please provide a valid value for "${field}" and try again.`
      : 'Please check your input and try again.'
  );
}

/**
 * Handle database errors
 */
export function handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Database error', { operation, error: error.message });
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'This is likely a temporary issue. Please try again in a few moments. If the problem persists, contact support.'
  );
}

/**
 * Handle unexpected/unknown errors
 */
export function handleUnknownError(error: Error, operation: string): MCPErrorResponse {
  return handlers.handleUnknownError(error, operation);
}

/**
 * Wrapper for tool functions that catches exceptions and converts to MCPErrorResponse.
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T | MCPErrorResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      return createErrorResponse(
        ErrorCode.INVALID_INPUT,
        firstIssue?.message || 'Validation failed',
        `Please fix the validation error${firstIssue?.path ? ` for field "${firstIssue.path.join('.')}"` : ''} and try again.`
      );
    }

    if (error instanceof Error) {
      // Check for specific PostgreSQL error codes
      const pgError = error as Error & { code?: string };
      if (pgError.code === '23505') {
        return createErrorResponse(
          ErrorCode.DUPLICATE_ENTRY,
          'A record with this identifier already exists',
          'Use a different identifier or update the existing record.'
        );
      }
      if (pgError.code?.startsWith('23')) {
        return handleDatabaseError(error, operation);
      }

      return handleUnknownError(error, operation);
    }

    return handleUnknownError(new Error(String(error)), operation);
  }
}
