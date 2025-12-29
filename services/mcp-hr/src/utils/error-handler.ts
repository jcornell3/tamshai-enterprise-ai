/**
 * LLM-Friendly Error Handler (Architecture v1.4 - Section 7.4)
 *
 * Implements Article II.3: All MCP tools must return structured JSON error objects
 * that the LLM can interpret, never raw exceptions.
 *
 * Each error includes:
 * - code: Machine-readable error code
 * - message: Human-readable description
 * - suggestedAction: What the user or AI should do next
 * - details: Optional context for debugging
 */

import { createErrorResponse, MCPErrorResponse } from '../types/response';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Standard error codes for HR operations
 */
export enum ErrorCode {
  // Not Found Errors
  EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND',
  DEPARTMENT_NOT_FOUND = 'DEPARTMENT_NOT_FOUND',

  // Permission Errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  WRITE_PERMISSION_REQUIRED = 'WRITE_PERMISSION_REQUIRED',

  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  INVALID_SALARY_RANGE = 'INVALID_SALARY_RANGE',

  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',

  // Business Logic Errors
  EMPLOYEE_HAS_REPORTS = 'EMPLOYEE_HAS_REPORTS',
  CANNOT_DELETE_SELF = 'CANNOT_DELETE_SELF',

  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
}

/**
 * Handle employee not found errors
 */
export function handleEmployeeNotFound(employeeId: string): MCPErrorResponse {
  logger.warn('Employee not found', { employeeId });
  return createErrorResponse(
    ErrorCode.EMPLOYEE_NOT_FOUND,
    `Employee with ID "${employeeId}" was not found`,
    'Please verify the employee ID is correct. You can search for employees using the list_employees tool with filters.',
    { employeeId }
  );
}

/**
 * Handle insufficient permissions errors
 */
export function handleInsufficientPermissions(
  requiredRole: string,
  userRoles: string[]
): MCPErrorResponse {
  logger.warn('Insufficient permissions', { requiredRole, userRoles });
  return createErrorResponse(
    ErrorCode.INSUFFICIENT_PERMISSIONS,
    `This operation requires the "${requiredRole}" role`,
    `You currently have roles: ${userRoles.join(', ')}. Please contact your administrator to request the necessary permissions.`,
    { requiredRole, userRoles }
  );
}

/**
 * Handle write permission required errors
 */
export function handleWritePermissionRequired(
  operation: string,
  userRoles: string[]
): MCPErrorResponse {
  logger.warn('Write permission required', { operation, userRoles });
  return createErrorResponse(
    ErrorCode.WRITE_PERMISSION_REQUIRED,
    `The "${operation}" operation requires write permissions (hr-write or executive role)`,
    'This is a protected operation that modifies employee data. Please contact your HR administrator if you need write access.',
    { operation, userRoles }
  );
}

/**
 * Handle validation errors with specific field information
 */
export function handleValidationError(
  field: string,
  message: string,
  value?: any
): MCPErrorResponse {
  logger.warn('Validation error', { field, message, value });
  return createErrorResponse(
    ErrorCode.INVALID_INPUT,
    `Validation failed for field "${field}": ${message}`,
    `Please correct the "${field}" field and try again. ${message}`,
    { field, value }
  );
}

/**
 * Handle invalid salary range errors
 */
export function handleInvalidSalary(salary: number): MCPErrorResponse {
  logger.warn('Invalid salary', { salary });
  return createErrorResponse(
    ErrorCode.INVALID_SALARY_RANGE,
    `Salary ${salary} is outside the valid range ($30,000 - $500,000)`,
    'Please provide a salary between $30,000 and $500,000. If this is a valid executive salary, contact your administrator.',
    { salary, minSalary: 30000, maxSalary: 500000 }
  );
}

/**
 * Handle database errors with connection retry suggestions
 */
export function handleDatabaseError(
  error: Error,
  operation: string
): MCPErrorResponse {
  logger.error('Database error', { error: error.message, operation });

  // Check if it's a connection error
  if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
    return createErrorResponse(
      ErrorCode.DATABASE_ERROR,
      'Unable to connect to the HR database',
      'The database is temporarily unavailable. Please try again in a few moments. If the issue persists, contact support.',
      { operation, errorType: 'connection' }
    );
  }

  // Check if it's a constraint violation
  if (error.message.includes('violates') || error.message.includes('constraint')) {
    return createErrorResponse(
      ErrorCode.CONSTRAINT_VIOLATION,
      'The operation violated a database constraint',
      'This operation cannot be completed due to data integrity rules. For example, you cannot delete an employee who has direct reports.',
      { operation, errorType: 'constraint' }
    );
  }

  // Generic database error
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'Please try again. If the issue persists, contact support with the request ID.',
    { operation, errorType: 'unknown' }
  );
}

/**
 * Handle business logic errors - employee has direct reports
 */
export function handleEmployeeHasReports(
  employeeId: string,
  reportCount: number
): MCPErrorResponse {
  logger.warn('Cannot delete employee with reports', { employeeId, reportCount });
  return createErrorResponse(
    ErrorCode.EMPLOYEE_HAS_REPORTS,
    `Employee "${employeeId}" has ${reportCount} direct report(s) and cannot be deleted`,
    `Before deleting this employee, you must first reassign their ${reportCount} direct report(s) to another manager. Use the update_employee tool to change the manager_id for each report.`,
    { employeeId, reportCount }
  );
}

/**
 * Handle self-deletion attempts
 */
export function handleCannotDeleteSelf(userId: string): MCPErrorResponse {
  logger.warn('User attempted to delete themselves', { userId });
  return createErrorResponse(
    ErrorCode.CANNOT_DELETE_SELF,
    'You cannot delete your own employee record',
    'For security reasons, users cannot delete themselves. Please contact your HR administrator if you need to remove your account.',
    { userId }
  );
}

/**
 * Handle Redis/cache errors
 */
export function handleRedisError(
  error: Error,
  operation: string
): MCPErrorResponse {
  logger.error('Redis error', { error: error.message, operation });
  return createErrorResponse(
    ErrorCode.REDIS_ERROR,
    'The confirmation storage system is temporarily unavailable',
    'Please try your operation again. If the issue persists, contact support.',
    { operation, errorMessage: error.message }
  );
}

/**
 * Handle unexpected/unknown errors (last resort)
 */
export function handleUnknownError(
  error: Error,
  operation: string
): MCPErrorResponse {
  logger.error('Unknown error', {
    error: error.message,
    stack: error.stack,
    operation,
  });

  return createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    'An unexpected error occurred',
    'Please try again. If the issue persists, contact support with the request ID and timestamp.',
    {
      operation,
      errorType: error.name,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Wrap a tool function with error handling
 *
 * This ensures that any thrown exceptions are converted to MCPErrorResponse
 * instead of being thrown up to Claude, fulfilling Article II.3.
 */
export function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T | MCPErrorResponse> {
  return fn().catch((error) => {
    if ((error as any).status === 'error') {
      // Already an MCPErrorResponse, return as-is
      return error as MCPErrorResponse;
    }

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const zodError = error as any;
      const firstIssue = zodError.issues?.[0];

      logger.warn('Validation error', {
        operation,
        issues: zodError.issues
      });

      return createErrorResponse(
        ErrorCode.INVALID_INPUT,
        firstIssue?.message || 'Input validation failed',
        `Please check your input and try again. ${firstIssue?.message || ''}`,
        {
          field: firstIssue?.path?.join('.'),
          issues: zodError.issues
        }
      );
    }

    // Convert unknown errors to MCPErrorResponse
    return handleUnknownError(error, operation);
  });
}
