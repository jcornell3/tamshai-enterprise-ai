/**
 * Error Handler Utility
 *
 * LLM-friendly error handling with structured responses.
 * All errors include suggestedAction for Claude to act on.
 */
import { ZodError } from 'zod';
import { createErrorResponse, MCPErrorResponse, MCPToolResponse } from '../types/response';
import { logger } from './logger';

// Error codes for tax domain
export enum ErrorCode {
  // Not Found
  TAX_RATE_NOT_FOUND = 'TAX_RATE_NOT_FOUND',
  ESTIMATE_NOT_FOUND = 'ESTIMATE_NOT_FOUND',
  FILING_NOT_FOUND = 'FILING_NOT_FOUND',
  REGISTRATION_NOT_FOUND = 'REGISTRATION_NOT_FOUND',
  AUDIT_LOG_NOT_FOUND = 'AUDIT_LOG_NOT_FOUND',

  // Permission
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  WRITE_PERMISSION_REQUIRED = 'WRITE_PERMISSION_REQUIRED',

  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_STATE_CODE = 'INVALID_STATE_CODE',
  INVALID_QUARTER = 'INVALID_QUARTER',

  // Business Logic
  FILING_ALREADY_SUBMITTED = 'FILING_ALREADY_SUBMITTED',
  ESTIMATE_ALREADY_PAID = 'ESTIMATE_ALREADY_PAID',
  REGISTRATION_EXPIRED = 'REGISTRATION_EXPIRED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Database
  DATABASE_ERROR = 'DATABASE_ERROR',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Error handler functions
export function handleTaxRateNotFound(stateCode: string): MCPErrorResponse {
  logger.warn('Tax rate not found', { stateCode });
  return createErrorResponse(
    ErrorCode.TAX_RATE_NOT_FOUND,
    `Tax rate for state "${stateCode}" was not found`,
    'Use list_sales_tax_rates tool to find valid state codes and rates.'
  );
}

export function handleEstimateNotFound(estimateId: string): MCPErrorResponse {
  logger.warn('Quarterly estimate not found', { estimateId });
  return createErrorResponse(
    ErrorCode.ESTIMATE_NOT_FOUND,
    `Quarterly estimate with ID "${estimateId}" was not found`,
    'Use list_quarterly_estimates tool to find valid estimate IDs.'
  );
}

export function handleFilingNotFound(filingId: string): MCPErrorResponse {
  logger.warn('Filing not found', { filingId });
  return createErrorResponse(
    ErrorCode.FILING_NOT_FOUND,
    `Annual filing with ID "${filingId}" was not found`,
    'Use list_annual_filings tool to find valid filing IDs.'
  );
}

export function handleRegistrationNotFound(registrationId: string): MCPErrorResponse {
  logger.warn('State registration not found', { registrationId });
  return createErrorResponse(
    ErrorCode.REGISTRATION_NOT_FOUND,
    `State registration with ID "${registrationId}" was not found`,
    'Use list_state_registrations tool to find valid registration IDs.'
  );
}

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

export function handleInvalidStateCode(stateCode: string): MCPErrorResponse {
  logger.warn('Invalid state code', { stateCode });
  return createErrorResponse(
    ErrorCode.INVALID_STATE_CODE,
    `"${stateCode}" is not a valid US state code`,
    'Please use a valid 2-letter US state code (e.g., CA, NY, TX).'
  );
}

export function handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Database error', { operation, error: error.message });
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'This is likely a temporary issue. Please try again in a few moments. If the problem persists, contact support.'
  );
}

export function handleUnknownError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Unknown error', { operation, error: error.message, stack: error.stack });
  return createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    'An unexpected error occurred',
    'Please try again. If the problem persists, contact support with the operation you were attempting.'
  );
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
