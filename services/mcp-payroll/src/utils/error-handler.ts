/**
 * Error Handler Utility
 *
 * LLM-friendly error handling with structured responses.
 * All errors include suggestedAction for Claude to act on.
 */
import { ZodError } from 'zod';
import { createErrorResponse, MCPErrorResponse, MCPToolResponse } from '../types/response';
import { logger } from './logger';

// Error codes for payroll domain
export enum ErrorCode {
  // Not Found
  PAY_RUN_NOT_FOUND = 'PAY_RUN_NOT_FOUND',
  PAY_STUB_NOT_FOUND = 'PAY_STUB_NOT_FOUND',
  CONTRACTOR_NOT_FOUND = 'CONTRACTOR_NOT_FOUND',
  TAX_WITHHOLDING_NOT_FOUND = 'TAX_WITHHOLDING_NOT_FOUND',
  BENEFIT_NOT_FOUND = 'BENEFIT_NOT_FOUND',
  EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND',

  // Permission
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  WRITE_PERMISSION_REQUIRED = 'WRITE_PERMISSION_REQUIRED',

  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_PAY_PERIOD = 'INVALID_PAY_PERIOD',

  // Business Logic
  PAY_RUN_ALREADY_PROCESSED = 'PAY_RUN_ALREADY_PROCESSED',
  PAY_RUN_LOCKED = 'PAY_RUN_LOCKED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Database
  DATABASE_ERROR = 'DATABASE_ERROR',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Error handler functions
export function handlePayRunNotFound(payRunId: string): MCPErrorResponse {
  logger.warn('Pay run not found', { payRunId });
  return createErrorResponse(
    ErrorCode.PAY_RUN_NOT_FOUND,
    `Pay run with ID "${payRunId}" was not found`,
    'Use list_pay_runs tool to find valid pay run IDs, or verify the ID format is correct (UUID expected).'
  );
}

export function handlePayStubNotFound(payStubId: string): MCPErrorResponse {
  logger.warn('Pay stub not found', { payStubId });
  return createErrorResponse(
    ErrorCode.PAY_STUB_NOT_FOUND,
    `Pay stub with ID "${payStubId}" was not found`,
    'Use list_pay_stubs tool to find valid pay stub IDs for the employee.'
  );
}

export function handleContractorNotFound(contractorId: string): MCPErrorResponse {
  logger.warn('Contractor not found', { contractorId });
  return createErrorResponse(
    ErrorCode.CONTRACTOR_NOT_FOUND,
    `Contractor with ID "${contractorId}" was not found`,
    'Use list_contractors tool to find valid contractor IDs.'
  );
}

export function handleTaxWithholdingNotFound(employeeId: string): MCPErrorResponse {
  logger.warn('Tax withholding not found', { employeeId });
  return createErrorResponse(
    ErrorCode.TAX_WITHHOLDING_NOT_FOUND,
    `Tax withholding settings for employee "${employeeId}" were not found`,
    'Verify the employee ID is correct. The employee may not have tax withholding settings configured.'
  );
}

export function handleBenefitNotFound(benefitId: string): MCPErrorResponse {
  logger.warn('Benefit not found', { benefitId });
  return createErrorResponse(
    ErrorCode.BENEFIT_NOT_FOUND,
    `Benefit deduction with ID "${benefitId}" was not found`,
    'Use get_benefits tool to list available benefit deductions for the employee.'
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
    'You have read-only access to payroll data. Contact your administrator to request payroll-write permission.'
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
