/**
 * Error Handler Unit Tests
 */

import { ZodError, ZodIssue } from 'zod';
import {
  ErrorCode,
  handlePayRunNotFound,
  handlePayStubNotFound,
  handleContractorNotFound,
  handleTaxWithholdingNotFound,
  handleBenefitNotFound,
  handleInsufficientPermissions,
  handleWritePermissionRequired,
  handleInvalidInput,
  handleDatabaseError,
  handleUnknownError,
  withErrorHandling,
} from './error-handler';

// Mock logger
jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Error Handler Module', () => {
  describe('ErrorCode enum', () => {
    it('should have all payroll-specific error codes', () => {
      expect(ErrorCode.PAY_RUN_NOT_FOUND).toBe('PAY_RUN_NOT_FOUND');
      expect(ErrorCode.PAY_STUB_NOT_FOUND).toBe('PAY_STUB_NOT_FOUND');
      expect(ErrorCode.CONTRACTOR_NOT_FOUND).toBe('CONTRACTOR_NOT_FOUND');
      expect(ErrorCode.TAX_WITHHOLDING_NOT_FOUND).toBe('TAX_WITHHOLDING_NOT_FOUND');
      expect(ErrorCode.BENEFIT_NOT_FOUND).toBe('BENEFIT_NOT_FOUND');
      expect(ErrorCode.EMPLOYEE_NOT_FOUND).toBe('EMPLOYEE_NOT_FOUND');
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
      expect(ErrorCode.WRITE_PERMISSION_REQUIRED).toBe('WRITE_PERMISSION_REQUIRED');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.INVALID_DATE_RANGE).toBe('INVALID_DATE_RANGE');
      expect(ErrorCode.INVALID_PAY_PERIOD).toBe('INVALID_PAY_PERIOD');
      expect(ErrorCode.PAY_RUN_ALREADY_PROCESSED).toBe('PAY_RUN_ALREADY_PROCESSED');
      expect(ErrorCode.PAY_RUN_LOCKED).toBe('PAY_RUN_LOCKED');
      expect(ErrorCode.DUPLICATE_ENTRY).toBe('DUPLICATE_ENTRY');
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });

  describe('handlePayRunNotFound', () => {
    it('should return error response with PAY_RUN_NOT_FOUND code', () => {
      const response = handlePayRunNotFound('pr-123');

      expect(response.status).toBe('error');
      expect(response.code).toBe('PAY_RUN_NOT_FOUND');
      expect(response.message).toContain('pr-123');
      expect(response.suggestedAction).toContain('list_pay_runs');
    });
  });

  describe('handlePayStubNotFound', () => {
    it('should return error response with PAY_STUB_NOT_FOUND code', () => {
      const response = handlePayStubNotFound('ps-456');

      expect(response.status).toBe('error');
      expect(response.code).toBe('PAY_STUB_NOT_FOUND');
      expect(response.message).toContain('ps-456');
      expect(response.suggestedAction).toContain('list_pay_stubs');
    });
  });

  describe('handleContractorNotFound', () => {
    it('should return error response with CONTRACTOR_NOT_FOUND code', () => {
      const response = handleContractorNotFound('contractor-789');

      expect(response.status).toBe('error');
      expect(response.code).toBe('CONTRACTOR_NOT_FOUND');
      expect(response.message).toContain('contractor-789');
      expect(response.suggestedAction).toContain('list_contractors');
    });
  });

  describe('handleTaxWithholdingNotFound', () => {
    it('should return error response with TAX_WITHHOLDING_NOT_FOUND code', () => {
      const response = handleTaxWithholdingNotFound('emp-123');

      expect(response.status).toBe('error');
      expect(response.code).toBe('TAX_WITHHOLDING_NOT_FOUND');
      expect(response.message).toContain('emp-123');
      expect(response.suggestedAction).toContain('employee ID');
    });
  });

  describe('handleBenefitNotFound', () => {
    it('should return error response with BENEFIT_NOT_FOUND code', () => {
      const response = handleBenefitNotFound('benefit-456');

      expect(response.status).toBe('error');
      expect(response.code).toBe('BENEFIT_NOT_FOUND');
      expect(response.message).toContain('benefit-456');
      expect(response.suggestedAction).toContain('get_benefits');
    });
  });

  describe('handleInsufficientPermissions', () => {
    it('should return error response with INSUFFICIENT_PERMISSIONS code', () => {
      const response = handleInsufficientPermissions('list_pay_runs', [
        'payroll-read',
        'payroll-write',
      ]);

      expect(response.status).toBe('error');
      expect(response.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.message).toContain('list_pay_runs');
      expect(response.suggestedAction).toContain('payroll-read');
      expect(response.suggestedAction).toContain('payroll-write');
    });
  });

  describe('handleWritePermissionRequired', () => {
    it('should return error response with WRITE_PERMISSION_REQUIRED code', () => {
      const response = handleWritePermissionRequired('approve_pay_run', ['payroll-read']);

      expect(response.status).toBe('error');
      expect(response.code).toBe('WRITE_PERMISSION_REQUIRED');
      expect(response.message).toContain('approve_pay_run');
      expect(response.suggestedAction).toContain('payroll-write');
    });
  });

  describe('handleInvalidInput', () => {
    it('should return error response with INVALID_INPUT code', () => {
      const response = handleInvalidInput('Invalid date format');

      expect(response.status).toBe('error');
      expect(response.code).toBe('INVALID_INPUT');
      expect(response.message).toBe('Invalid date format');
    });

    it('should include field name in suggested action when provided', () => {
      const response = handleInvalidInput('Invalid format', 'employeeId');

      expect(response.suggestedAction).toContain('employeeId');
    });

    it('should use generic suggestion when field not provided', () => {
      const response = handleInvalidInput('Invalid input');

      expect(response.suggestedAction).toContain('check your input');
    });
  });

  describe('handleDatabaseError', () => {
    it('should return error response with DATABASE_ERROR code', () => {
      const error = new Error('Connection timeout');
      const response = handleDatabaseError(error, 'list_pay_runs');

      expect(response.status).toBe('error');
      expect(response.code).toBe('DATABASE_ERROR');
      expect(response.message).toContain('database error');
      expect(response.suggestedAction).toContain('try again');
    });
  });

  describe('handleUnknownError', () => {
    it('should return error response with INTERNAL_ERROR code', () => {
      const error = new Error('Something went wrong');
      const response = handleUnknownError(error, 'process_payroll');

      expect(response.status).toBe('error');
      expect(response.code).toBe('INTERNAL_ERROR');
      expect(response.message).toContain('unexpected error');
    });
  });

  describe('withErrorHandling', () => {
    it('should return result from successful operation', async () => {
      const result = await withErrorHandling('test_operation', async () => {
        return { success: true, data: [1, 2, 3] };
      });

      expect(result).toEqual({ success: true, data: [1, 2, 3] });
    });

    it('should catch ZodError and return validation error', async () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['employeeId'],
          message: 'Expected string, received number',
        } as ZodIssue,
      ]);

      const result = await withErrorHandling('test_operation', async () => {
        throw zodError;
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('code', 'INVALID_INPUT');
    });

    it('should handle PostgreSQL duplicate entry error', async () => {
      const pgError = new Error('duplicate key value') as Error & { code: string };
      pgError.code = '23505';

      const result = await withErrorHandling('create_record', async () => {
        throw pgError;
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('code', 'DUPLICATE_ENTRY');
    });

    it('should handle PostgreSQL constraint error', async () => {
      const pgError = new Error('constraint violation') as Error & { code: string };
      pgError.code = '23503';

      const result = await withErrorHandling('delete_record', async () => {
        throw pgError;
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('code', 'DATABASE_ERROR');
    });

    it('should handle generic errors', async () => {
      const result = await withErrorHandling('test_operation', async () => {
        throw new Error('Something went wrong');
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
    });

    it('should handle non-Error exceptions', async () => {
      const result = await withErrorHandling('test_operation', async () => {
        throw 'string error';
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
    });
  });
});
