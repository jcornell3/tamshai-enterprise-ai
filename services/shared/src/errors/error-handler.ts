/**
 * LLM-Friendly Error Handler (Architecture v1.4 - Section 7.4)
 *
 * Shared error handling utilities for all MCP services.
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

/**
 * Standard error codes shared across all MCP services
 */
export enum ErrorCode {
  // === Common Errors ===
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',

  // === Permission Errors ===
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  WRITE_PERMISSION_REQUIRED = 'WRITE_PERMISSION_REQUIRED',

  // === Validation Errors ===
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_CURSOR = 'INVALID_CURSOR',

  // === Not Found Errors ===
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND',
  DEPARTMENT_NOT_FOUND = 'DEPARTMENT_NOT_FOUND',

  // === HR-Specific Errors ===
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  INVALID_SALARY_RANGE = 'INVALID_SALARY_RANGE',
  EMPLOYEE_HAS_REPORTS = 'EMPLOYEE_HAS_REPORTS',
  CANNOT_DELETE_SELF = 'CANNOT_DELETE_SELF',

  // === Finance-Specific Errors ===
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  BUDGET_NOT_FOUND = 'BUDGET_NOT_FOUND',
  EXPENSE_NOT_FOUND = 'EXPENSE_NOT_FOUND',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',

  // === Sales-Specific Errors ===
  OPPORTUNITY_NOT_FOUND = 'OPPORTUNITY_NOT_FOUND',
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  INVALID_STAGE = 'INVALID_STAGE',

  // === Support-Specific Errors ===
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  KB_ARTICLE_NOT_FOUND = 'KB_ARTICLE_NOT_FOUND',

  // === Payroll-Specific Errors ===
  PAY_RUN_NOT_FOUND = 'PAY_RUN_NOT_FOUND',
  PAY_STUB_NOT_FOUND = 'PAY_STUB_NOT_FOUND',

  // === Tax-Specific Errors ===
  TAX_RATE_NOT_FOUND = 'TAX_RATE_NOT_FOUND',
  ESTIMATE_NOT_FOUND = 'ESTIMATE_NOT_FOUND',
  FILING_NOT_FOUND = 'FILING_NOT_FOUND',
  REGISTRATION_NOT_FOUND = 'REGISTRATION_NOT_FOUND',
  INVALID_STATE_CODE = 'INVALID_STATE_CODE',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
}

/**
 * Logger interface for dependency injection
 */
export interface ErrorLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Default no-op logger (services should provide their own)
 */
const defaultLogger: ErrorLogger = {
  warn: () => {},
  error: () => {},
};

/**
 * Error handler factory - creates error handlers with a specific logger
 */
export function createErrorHandlers(logger: ErrorLogger = defaultLogger) {
  return {
    /**
     * Handle resource not found errors (generic)
     */
    handleNotFound(
      resourceType: string,
      resourceId: string,
      listTool: string
    ): MCPErrorResponse {
      logger.warn(`${resourceType} not found`, { resourceId });
      return createErrorResponse(
        ErrorCode.RESOURCE_NOT_FOUND,
        `${resourceType} with ID "${resourceId}" was not found`,
        `Please verify the ID is correct. Use the ${listTool} tool to find valid IDs.`,
        { resourceType, resourceId }
      );
    },

    /**
     * Handle insufficient permissions errors
     */
    handleInsufficientPermissions(
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
    },

    /**
     * Handle write permission required errors
     */
    handleWritePermissionRequired(
      operation: string,
      userRoles: string[],
      writeRole: string = 'write'
    ): MCPErrorResponse {
      logger.warn('Write permission required', { operation, userRoles });
      return createErrorResponse(
        ErrorCode.WRITE_PERMISSION_REQUIRED,
        `The "${operation}" operation requires write permissions (${writeRole} role)`,
        'This is a protected operation that modifies data. Please contact your administrator if you need write access.',
        { operation, userRoles }
      );
    },

    /**
     * Handle validation errors with specific field information
     */
    handleValidationError(
      field: string,
      message: string,
      value?: unknown
    ): MCPErrorResponse {
      logger.warn('Validation error', { field, message, value });
      return createErrorResponse(
        ErrorCode.INVALID_INPUT,
        `Validation failed for field "${field}": ${message}`,
        `Please correct the "${field}" field and try again. ${message}`,
        { field, value }
      );
    },

    /**
     * Handle invalid cursor errors
     */
    handleInvalidCursor(): MCPErrorResponse {
      logger.warn('Invalid cursor provided');
      return createErrorResponse(
        ErrorCode.INVALID_CURSOR,
        'The provided cursor is invalid or expired',
        'Please start a new query without a cursor, or ensure you are using a cursor from a recent response.',
        {}
      );
    },

    /**
     * Handle database errors with connection retry suggestions
     */
    handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
      logger.error('Database error', { error: error.message, operation });

      // Check if it's a connection error
      if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
        return createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          'Unable to connect to the database',
          'The database is temporarily unavailable. Please try again in a few moments. If the issue persists, contact support.',
          { operation, errorType: 'connection' }
        );
      }

      // Check if it's a constraint violation
      if (error.message.includes('violates') || error.message.includes('constraint')) {
        return createErrorResponse(
          ErrorCode.CONSTRAINT_VIOLATION,
          'The operation violated a database constraint',
          'This operation cannot be completed due to data integrity rules.',
          { operation, errorType: 'constraint' }
        );
      }

      // Generic database error
      return createErrorResponse(
        ErrorCode.DATABASE_ERROR,
        'A database error occurred while processing your request',
        'Please try again. If the issue persists, contact support.',
        { operation, errorType: 'unknown' }
      );
    },

    /**
     * Handle Redis/cache errors
     */
    handleRedisError(error: Error, operation: string): MCPErrorResponse {
      logger.error('Redis error', { error: error.message, operation });
      return createErrorResponse(
        ErrorCode.REDIS_ERROR,
        'The cache/confirmation storage system is temporarily unavailable',
        'Please try your operation again. If the issue persists, contact support.',
        { operation, errorMessage: error.message }
      );
    },

    /**
     * Handle unexpected/unknown errors (last resort)
     */
    handleUnknownError(error: Error, operation: string): MCPErrorResponse {
      logger.error('Unknown error', {
        error: error.message,
        stack: error.stack,
        operation,
      });

      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'An unexpected error occurred',
        'Please try again. If the issue persists, contact support with the timestamp.',
        {
          operation,
          errorType: error.name,
          timestamp: new Date().toISOString(),
        }
      );
    },
  };
}

/**
 * Wrap a tool function with error handling
 *
 * This ensures that any thrown exceptions are converted to MCPErrorResponse
 * instead of being thrown up to Claude, fulfilling Article II.3.
 */
export function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  logger: ErrorLogger = defaultLogger
): Promise<T | MCPErrorResponse> {
  const handlers = createErrorHandlers(logger);

  return fn().catch((error) => {
    // Already an MCPErrorResponse, return as-is
    if ((error as MCPErrorResponse).status === 'error') {
      return error as MCPErrorResponse;
    }

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const zodError = error as { issues?: Array<{ message?: string; path?: string[] }> };
      const firstIssue = zodError.issues?.[0];

      logger.warn('Validation error', {
        operation,
        issues: zodError.issues,
      });

      return createErrorResponse(
        ErrorCode.INVALID_INPUT,
        firstIssue?.message || 'Input validation failed',
        `Please check your input and try again. ${firstIssue?.message || ''}`,
        {
          field: firstIssue?.path?.join('.'),
          issues: zodError.issues,
        }
      );
    }

    // Handle PostgreSQL duplicate key errors
    const pgError = error as Error & { code?: string };
    if (pgError.code === '23505') {
      return createErrorResponse(
        ErrorCode.DUPLICATE_ENTRY,
        'A record with this identifier already exists',
        'Use a different identifier or update the existing record.',
        { operation }
      );
    }

    // Handle other PostgreSQL constraint errors
    if (pgError.code?.startsWith('23')) {
      return handlers.handleDatabaseError(error, operation);
    }

    // Convert unknown errors to MCPErrorResponse
    return handlers.handleUnknownError(error, operation);
  });
}

// Re-export for convenience
export { createErrorResponse, MCPErrorResponse };
