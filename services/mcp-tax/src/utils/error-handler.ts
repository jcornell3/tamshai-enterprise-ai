/**
 * Tax Error Handler
 *
 * Domain-specific error handlers for the Tax MCP service.
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
 * Handle tax rate not found error
 */
export function handleTaxRateNotFound(stateCode: string): MCPErrorResponse {
  logger.warn('Tax rate not found', { stateCode });
  return createErrorResponse(
    ErrorCode.TAX_RATE_NOT_FOUND,
    `Tax rate for state "${stateCode}" was not found`,
    'Use list_sales_tax_rates tool to find valid state codes and rates.'
  );
}

/**
 * Handle quarterly estimate not found error
 */
export function handleEstimateNotFound(estimateId: string): MCPErrorResponse {
  logger.warn('Quarterly estimate not found', { estimateId });
  return createErrorResponse(
    ErrorCode.ESTIMATE_NOT_FOUND,
    `Quarterly estimate with ID "${estimateId}" was not found`,
    'Use list_quarterly_estimates tool to find valid estimate IDs.'
  );
}

/**
 * Handle filing not found error
 */
export function handleFilingNotFound(filingId: string): MCPErrorResponse {
  logger.warn('Filing not found', { filingId });
  return createErrorResponse(
    ErrorCode.FILING_NOT_FOUND,
    `Annual filing with ID "${filingId}" was not found`,
    'Use list_annual_filings tool to find valid filing IDs.'
  );
}

/**
 * Handle registration not found error
 */
export function handleRegistrationNotFound(registrationId: string): MCPErrorResponse {
  logger.warn('State registration not found', { registrationId });
  return createErrorResponse(
    ErrorCode.REGISTRATION_NOT_FOUND,
    `State registration with ID "${registrationId}" was not found`,
    'Use list_state_registrations tool to find valid registration IDs.'
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
    'You have read-only access to tax data. Contact your administrator to request tax-write permission.'
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
 * Handle invalid state code error
 */
export function handleInvalidStateCode(stateCode: string): MCPErrorResponse {
  logger.warn('Invalid state code', { stateCode });
  return createErrorResponse(
    ErrorCode.INVALID_STATE_CODE,
    `"${stateCode}" is not a valid US state code`,
    'Please use a valid 2-letter US state code (e.g., CA, NY, TX).'
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
