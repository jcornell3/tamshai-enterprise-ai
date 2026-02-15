/**
 * HR Error Handler (Architecture v1.4 - Section 7.4)
 *
 * Domain-specific error handlers for the HR MCP service.
 * Common error handling utilities are imported from @tamshai/shared.
 */

import {
  ErrorCode,
  createErrorHandlers,
  withErrorHandling as sharedWithErrorHandling,
  createErrorResponse,
  MCPErrorResponse,
} from '@tamshai/shared';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Create shared error handlers with our logger
const handlers = createErrorHandlers(logger);

// Re-export ErrorCode and types for consumers
export { ErrorCode, MCPErrorResponse };

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
  return handlers.handleInsufficientPermissions(requiredRole, userRoles);
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
  value?: unknown
): MCPErrorResponse {
  return handlers.handleValidationError(field, message, value);
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
  return handlers.handleDatabaseError(error, operation);
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
  return handlers.handleRedisError(error, operation);
}

/**
 * Handle unexpected/unknown errors (last resort)
 */
export function handleUnknownError(
  error: Error,
  operation: string
): MCPErrorResponse {
  return handlers.handleUnknownError(error, operation);
}

/**
 * Wrap a tool function with error handling
 */
export function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T | MCPErrorResponse> {
  return sharedWithErrorHandling(operation, fn, logger);
}
