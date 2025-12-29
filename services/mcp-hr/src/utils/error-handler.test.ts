/**
 * Unit tests for error handler utility functions
 *
 * Tests all error handler functions that create LLM-friendly error responses
 */

import {
  ErrorCode,
  handleEmployeeNotFound,
  handleInsufficientPermissions,
  handleWritePermissionRequired,
  handleValidationError,
  handleInvalidSalary,
  handleDatabaseError,
  handleEmployeeHasReports,
  handleCannotDeleteSelf,
  handleRedisError,
  handleUnknownError,
  withErrorHandling,
} from './error-handler';
import { createErrorResponse, MCPErrorResponse } from '../types/response';

describe('Error Handler Utility', () => {
  describe('ErrorCode enum', () => {
    it('defines all expected error codes', () => {
      expect(ErrorCode.EMPLOYEE_NOT_FOUND).toBe('EMPLOYEE_NOT_FOUND');
      expect(ErrorCode.DEPARTMENT_NOT_FOUND).toBe('DEPARTMENT_NOT_FOUND');
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
      expect(ErrorCode.WRITE_PERMISSION_REQUIRED).toBe('WRITE_PERMISSION_REQUIRED');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
      expect(ErrorCode.INVALID_EMAIL_FORMAT).toBe('INVALID_EMAIL_FORMAT');
      expect(ErrorCode.INVALID_SALARY_RANGE).toBe('INVALID_SALARY_RANGE');
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.CONSTRAINT_VIOLATION).toBe('CONSTRAINT_VIOLATION');
      expect(ErrorCode.EMPLOYEE_HAS_REPORTS).toBe('EMPLOYEE_HAS_REPORTS');
      expect(ErrorCode.CANNOT_DELETE_SELF).toBe('CANNOT_DELETE_SELF');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.REDIS_ERROR).toBe('REDIS_ERROR');
    });
  });

  describe('handleEmployeeNotFound', () => {
    it('returns employee not found error with ID', () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const result = handleEmployeeNotFound(employeeId);

      expect(result.status).toBe('error');
      expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
      expect(result.message).toContain(employeeId);
      expect(result.suggestedAction).toContain('list_employees');
      expect(result.details).toHaveProperty('employeeId', employeeId);
    });

    it('includes actionable suggestion', () => {
      const result = handleEmployeeNotFound('test-id');

      expect(result.suggestedAction).toMatch(/list_employees/i);
      expect(result.suggestedAction).toMatch(/filter/i);
    });
  });

  describe('handleInsufficientPermissions', () => {
    it('returns insufficient permissions error with role info', () => {
      const result = handleInsufficientPermissions('hr-write', ['user', 'hr-read']);

      expect(result.status).toBe('error');
      expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(result.message).toContain('hr-write');
      expect(result.suggestedAction).toContain('user, hr-read');
      expect(result.details).toHaveProperty('requiredRole', 'hr-write');
      expect(result.details).toHaveProperty('userRoles', ['user', 'hr-read']);
    });

    it('suggests contacting administrator', () => {
      const result = handleInsufficientPermissions('executive', ['user']);

      expect(result.suggestedAction).toMatch(/administrator/i);
      expect(result.suggestedAction).toMatch(/request.*permissions/i);
    });
  });

  describe('handleWritePermissionRequired', () => {
    it('returns write permission required error', () => {
      const result = handleWritePermissionRequired('delete_employee', ['hr-read']);

      expect(result.status).toBe('error');
      expect(result.code).toBe('WRITE_PERMISSION_REQUIRED');
      expect(result.message).toContain('delete_employee');
      expect(result.message).toContain('write permissions');
      expect(result.details).toHaveProperty('operation', 'delete_employee');
      expect(result.details).toHaveProperty('userRoles', ['hr-read']);
    });

    it('mentions hr-write or executive roles', () => {
      const result = handleWritePermissionRequired('update', ['user']);

      expect(result.message).toMatch(/hr-write|executive/i);
    });
  });

  describe('handleValidationError', () => {
    it('returns validation error with field info', () => {
      const result = handleValidationError('email', 'Invalid email format', 'test@');

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.message).toContain('email');
      expect(result.message).toContain('Invalid email format');
      expect(result.suggestedAction).toContain('email');
      expect(result.details).toHaveProperty('field', 'email');
      expect(result.details).toHaveProperty('value', 'test@');
    });

    it('handles validation error without value', () => {
      const result = handleValidationError('salary', 'Required field');

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.message).toContain('salary');
      expect(result.message).toContain('Required field');
      expect(result.details).toHaveProperty('field', 'salary');
    });
  });

  describe('handleInvalidSalary', () => {
    it('returns invalid salary error with range', () => {
      const result = handleInvalidSalary(1000);

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_SALARY_RANGE');
      expect(result.message).toContain('1000');
      expect(result.message).toContain('$30,000');
      expect(result.message).toContain('$500,000');
      expect(result.details).toHaveProperty('salary', 1000);
      expect(result.details).toHaveProperty('minSalary', 30000);
      expect(result.details).toHaveProperty('maxSalary', 500000);
    });

    it('suggests contacting admin for executive salaries', () => {
      const result = handleInvalidSalary(600000);

      expect(result.suggestedAction).toMatch(/executive/i);
      expect(result.suggestedAction).toMatch(/administrator/i);
    });
  });

  describe('handleDatabaseError', () => {
    it('detects connection errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const result = handleDatabaseError(error, 'listEmployees');

      expect(result.status).toBe('error');
      expect(result.code).toBe('DATABASE_ERROR');
      expect(result.message).toMatch(/connect.*database/i);
      expect(result.details).toHaveProperty('errorType', 'connection');
    });

    it('detects constraint violations', () => {
      const error = new Error('violates foreign key constraint');
      const result = handleDatabaseError(error, 'deleteEmployee');

      expect(result.status).toBe('error');
      expect(result.code).toBe('CONSTRAINT_VIOLATION');
      expect(result.message).toMatch(/constraint/i);
      expect(result.details).toHaveProperty('errorType', 'constraint');
    });

    it('handles generic database errors', () => {
      const error = new Error('Syntax error in query');
      const result = handleDatabaseError(error, 'getEmployee');

      expect(result.status).toBe('error');
      expect(result.code).toBe('DATABASE_ERROR');
      expect(result.message).toMatch(/database error/i);
      expect(result.details).toHaveProperty('operation', 'getEmployee');
      expect(result.details).toHaveProperty('errorType', 'unknown');
    });

    it('suggests retry for connection errors', () => {
      const error = new Error('connect ETIMEDOUT');
      const result = handleDatabaseError(error, 'listEmployees');

      expect(result.suggestedAction).toMatch(/try again/i);
    });
  });

  describe('handleEmployeeHasReports', () => {
    it('returns error for employee with direct reports', () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const result = handleEmployeeHasReports(employeeId, 3);

      expect(result.status).toBe('error');
      expect(result.code).toBe('EMPLOYEE_HAS_REPORTS');
      expect(result.message).toContain(employeeId);
      expect(result.message).toContain('3 direct report(s)');
      expect(result.details).toHaveProperty('employeeId', employeeId);
      expect(result.details).toHaveProperty('reportCount', 3);
    });

    it('suggests reassigning reports', () => {
      const result = handleEmployeeHasReports('emp-id', 5);

      expect(result.suggestedAction).toMatch(/reassign/i);
      expect(result.suggestedAction).toMatch(/5 direct report/i);
      expect(result.suggestedAction).toContain('update_employee');
    });

    it('handles singular report count', () => {
      const result = handleEmployeeHasReports('emp-id', 1);

      expect(result.message).toContain('1 direct report(s)');
    });
  });

  describe('handleCannotDeleteSelf', () => {
    it('returns error for self-deletion attempt', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const result = handleCannotDeleteSelf(userId);

      expect(result.status).toBe('error');
      expect(result.code).toBe('CANNOT_DELETE_SELF');
      expect(result.message).toMatch(/cannot delete.*own/i);
      expect(result.details).toHaveProperty('userId', userId);
    });

    it('suggests contacting HR administrator', () => {
      const result = handleCannotDeleteSelf('user-id');

      expect(result.suggestedAction).toMatch(/HR administrator/i);
    });

    it('explains security reason', () => {
      const result = handleCannotDeleteSelf('user-id');

      expect(result.suggestedAction).toMatch(/security/i);
    });
  });

  describe('handleRedisError', () => {
    it('returns Redis error with operation context', () => {
      const error = new Error('Redis connection timeout');
      const result = handleRedisError(error, 'storePendingConfirmation');

      expect(result.status).toBe('error');
      expect(result.code).toBe('REDIS_ERROR');
      expect(result.message).toMatch(/confirmation storage/i);
      expect(result.details).toHaveProperty('operation', 'storePendingConfirmation');
      expect(result.details).toHaveProperty('errorMessage', 'Redis connection timeout');
    });

    it('suggests retry', () => {
      const error = new Error('Redis unavailable');
      const result = handleRedisError(error, 'checkConfirmation');

      expect(result.suggestedAction).toMatch(/try.*again/i);
    });
  });

  describe('handleUnknownError', () => {
    it('returns internal error for unexpected errors', () => {
      const error = new Error('Unexpected error occurred');
      const result = handleUnknownError(error, 'processRequest');

      expect(result.status).toBe('error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).toBe('An unexpected error occurred');
      expect(result.details).toHaveProperty('operation', 'processRequest');
      expect(result.details).toHaveProperty('errorType', 'Error');
      expect(result.details).toHaveProperty('timestamp');
    });

    it('includes timestamp in details', () => {
      const error = new Error('Test error');
      const before = new Date().toISOString();
      const result = handleUnknownError(error, 'test');
      const after = new Date().toISOString();

      expect(result.details?.timestamp).toBeDefined();
      const timestamp = result.details?.timestamp as string;
      expect(timestamp >= before && timestamp <= after).toBe(true);
    });
  });

  describe('withErrorHandling wrapper', () => {
    it('passes through successful results', async () => {
      const successFn = jest.fn().mockResolvedValue({ status: 'success', data: 'test' });

      const result = await withErrorHandling('test', successFn);

      expect(result).toEqual({ status: 'success', data: 'test' });
      expect(successFn).toHaveBeenCalled();
    });

    it('returns MCPErrorResponse as-is', async () => {
      const errorResponse: MCPErrorResponse = {
        status: 'error',
        code: 'TEST_ERROR',
        message: 'Test message',
        suggestedAction: 'Test action',
      };
      const errorFn = jest.fn().mockRejectedValue(errorResponse);

      const result = await withErrorHandling('test', errorFn);

      expect(result).toEqual(errorResponse);
    });

    it('converts Zod errors to INVALID_INPUT', async () => {
      const zodError = {
        name: 'ZodError',
        issues: [
          {
            code: 'invalid_type',
            path: ['email'],
            message: 'Invalid email format',
          },
        ],
      };
      const fn = jest.fn().mockRejectedValue(zodError);

      const result = await withErrorHandling('validateInput', fn) as MCPErrorResponse;

      expect(result).toHaveProperty('status', 'error');
      expect(result.code).toBe('INVALID_INPUT');
      expect(result.message).toContain('Invalid email format');
      expect(result.details).toHaveProperty('field', 'email');
    });

    it('handles Zod errors with nested paths', async () => {
      const zodError = {
        name: 'ZodError',
        issues: [
          {
            code: 'invalid_type',
            path: ['address', 'zipCode'],
            message: 'Invalid zip code',
          },
        ],
      };
      const fn = jest.fn().mockRejectedValue(zodError);

      const result = await withErrorHandling('validateAddress', fn) as MCPErrorResponse;

      expect(result).toHaveProperty('status', 'error');
      expect(result.details).toHaveProperty('field', 'address.zipCode');
    });

    it('converts unknown errors to INTERNAL_ERROR', async () => {
      const unknownError = new Error('Something went wrong');
      const fn = jest.fn().mockRejectedValue(unknownError);

      const result = await withErrorHandling('test', fn) as MCPErrorResponse;

      expect(result).toHaveProperty('status', 'error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).toBe('An unexpected error occurred');
    });

    it('preserves operation context in errors', async () => {
      const error = new Error('Test error');
      const fn = jest.fn().mockRejectedValue(error);

      const result = await withErrorHandling('importantOperation', fn) as MCPErrorResponse;

      expect(result).toHaveProperty('status', 'error');
      expect(result.details).toHaveProperty('operation', 'importantOperation');
    });
  });
});
