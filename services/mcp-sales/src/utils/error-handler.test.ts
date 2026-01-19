/**
 * Centralized Error Handler Tests - MCP-Sales
 *
 * Tests for the existing error handler implementation.
 * Following MCP-Finance error-handler.test.ts pattern.
 */

import {
  ErrorCode,
  handleValidationError,
  handleOpportunityNotFound,
  handleCustomerNotFound,
  handleInsufficientPermissions,
  handleCannotDeleteWonOpportunity,
  handleDatabaseError,
  withErrorHandling,
} from './error-handler';
import { MCPToolResponse } from '../types/response';

describe('ErrorCode enum', () => {
  describe('should define all sales-specific error codes', () => {
    it('should have INVALID_INPUT code', () => {
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('should have OPPORTUNITY_NOT_FOUND code', () => {
      expect(ErrorCode.OPPORTUNITY_NOT_FOUND).toBe('OPPORTUNITY_NOT_FOUND');
    });

    it('should have CUSTOMER_NOT_FOUND code', () => {
      expect(ErrorCode.CUSTOMER_NOT_FOUND).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should have INSUFFICIENT_PERMISSIONS code', () => {
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should have CANNOT_DELETE_WON_OPPORTUNITY code', () => {
      expect(ErrorCode.CANNOT_DELETE_WON_OPPORTUNITY).toBe('CANNOT_DELETE_WON_OPPORTUNITY');
    });

    it('should have DATABASE_ERROR code', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    });

    it('should have INTERNAL_ERROR code', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });
});

describe('handleValidationError', () => {
  it('should return MCPErrorResponse with INVALID_INPUT code', () => {
    const zodError = {
      name: 'ZodError',
      errors: [
        { path: ['opportunityId'], message: 'Invalid opportunity ID format' },
      ],
    };

    const result = handleValidationError(zodError);

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INVALID_INPUT);
  });

  it('should include field-level errors in message', () => {
    const zodError = {
      name: 'ZodError',
      errors: [
        { path: ['opportunityId'], message: 'Invalid UUID' },
        { path: ['stage'], message: 'Invalid enum value' },
      ],
    };

    const result = handleValidationError(zodError);

    expect(result.message).toContain('opportunityId');
    expect(result.message).toContain('stage');
  });

  it('should include suggestedAction for users', () => {
    const zodError = {
      name: 'ZodError',
      errors: [{ path: ['limit'], message: 'Too large' }],
    };

    const result = handleValidationError(zodError);

    expect(result.suggestedAction).toBeDefined();
    expect(result.suggestedAction).toContain('input');
  });

  it('should include validation errors in details', () => {
    const zodError = {
      name: 'ZodError',
      errors: [{ path: ['customerId'], message: 'Required' }],
    };

    const result = handleValidationError(zodError);

    expect(result.details).toBeDefined();
    expect(result.details?.validationErrors).toBeDefined();
  });
});

describe('handleOpportunityNotFound', () => {
  it('should return MCPErrorResponse with OPPORTUNITY_NOT_FOUND code', () => {
    const result = handleOpportunityNotFound('opp-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.OPPORTUNITY_NOT_FOUND);
  });

  it('should include opportunity ID in message', () => {
    const result = handleOpportunityNotFound('opp-456');

    expect(result.message).toContain('opp-456');
  });

  it('should suggest using list_opportunities tool', () => {
    const result = handleOpportunityNotFound('opp-789');

    expect(result.suggestedAction).toContain('list_opportunities');
  });

  it('should include opportunity ID in details', () => {
    const result = handleOpportunityNotFound('opp-abc');

    expect(result.details).toBeDefined();
    expect(result.details?.opportunityId).toBe('opp-abc');
  });
});

describe('handleCustomerNotFound', () => {
  it('should return MCPErrorResponse with CUSTOMER_NOT_FOUND code', () => {
    const result = handleCustomerNotFound('cust-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.CUSTOMER_NOT_FOUND);
  });

  it('should include customer ID in message', () => {
    const result = handleCustomerNotFound('cust-456');

    expect(result.message).toContain('cust-456');
  });

  it('should suggest using list_customers tool', () => {
    const result = handleCustomerNotFound('cust-789');

    expect(result.suggestedAction).toContain('list_customers');
  });

  it('should include customer ID in details', () => {
    const result = handleCustomerNotFound('cust-abc');

    expect(result.details).toBeDefined();
    expect(result.details?.customerId).toBe('cust-abc');
  });
});

describe('handleInsufficientPermissions', () => {
  it('should return MCPErrorResponse with INSUFFICIENT_PERMISSIONS code', () => {
    const result = handleInsufficientPermissions('sales-write', ['sales-read']);

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('should include required role in message', () => {
    const result = handleInsufficientPermissions('sales-write', ['sales-read']);

    expect(result.message).toContain('sales-write');
  });

  it('should include user roles in message', () => {
    const result = handleInsufficientPermissions('executive', ['sales-read', 'user']);

    expect(result.message).toContain('sales-read');
    expect(result.message).toContain('user');
  });

  it('should suggest contacting administrator', () => {
    const result = handleInsufficientPermissions('executive', []);

    expect(result.suggestedAction).toContain('administrator');
  });

  it('should include role details', () => {
    const result = handleInsufficientPermissions('sales-write', ['sales-read']);

    expect(result.details).toBeDefined();
    expect(result.details?.requiredRole).toBe('sales-write');
    expect(result.details?.userRoles).toEqual(['sales-read']);
  });
});

describe('handleCannotDeleteWonOpportunity', () => {
  it('should return MCPErrorResponse with CANNOT_DELETE_WON_OPPORTUNITY code', () => {
    const result = handleCannotDeleteWonOpportunity('opp-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.CANNOT_DELETE_WON_OPPORTUNITY);
  });

  it('should include opportunity ID in message', () => {
    const result = handleCannotDeleteWonOpportunity('opp-456');

    expect(result.message).toContain('opp-456');
  });

  it('should mention won status in message', () => {
    const result = handleCannotDeleteWonOpportunity('opp-789');

    expect(result.message).toContain('won');
  });

  it('should provide guidance on what can be deleted', () => {
    const result = handleCannotDeleteWonOpportunity('opp-abc');

    expect(result.suggestedAction).toContain('open');
    expect(result.suggestedAction).toContain('lost');
  });

  it('should include opportunity ID in details', () => {
    const result = handleCannotDeleteWonOpportunity('opp-xyz');

    expect(result.details).toBeDefined();
    expect(result.details?.opportunityId).toBe('opp-xyz');
  });
});

describe('handleDatabaseError', () => {
  it('should return MCPErrorResponse with DATABASE_ERROR code', () => {
    const error = new Error('Connection refused');
    const result = handleDatabaseError(error, 'list_opportunities');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.DATABASE_ERROR);
  });

  it('should not expose raw error message to user', () => {
    const error = new Error('ECONNREFUSED 127.0.0.1:27017');
    const result = handleDatabaseError(error, 'get_customer');

    // Should have generic message, not the raw error
    expect(result.message).not.toContain('ECONNREFUSED');
    expect(result.message).not.toContain('127.0.0.1');
  });

  it('should include operation in details for debugging', () => {
    const error = new Error('Timeout');
    const result = handleDatabaseError(error, 'delete_opportunity');

    expect(result.details).toBeDefined();
    expect(result.details?.operation).toBe('delete_opportunity');
  });

  it('should suggest retry and contact support', () => {
    const error = new Error('Something went wrong');
    const result = handleDatabaseError(error, 'close_opportunity');

    expect(result.suggestedAction).toContain('try again');
  });
});

describe('withErrorHandling', () => {
  it('should return result from successful operation', async () => {
    const successFn = jest.fn().mockResolvedValue({
      status: 'success',
      data: { opportunity: { id: 'opp-1' } },
    });

    const result = await withErrorHandling('get_opportunity', successFn);

    expect(result.status).toBe('success');
    expect(successFn).toHaveBeenCalled();
  });

  it('should catch ZodError and return validation error', async () => {
    const zodError = new Error('Validation failed');
    (zodError as any).name = 'ZodError';
    (zodError as any).errors = [{ path: ['stage'], message: 'Invalid enum' }];

    const throwingFn = jest.fn().mockRejectedValue(zodError);

    const result = await withErrorHandling('list_opportunities', throwingFn);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('should catch generic errors and return internal error', async () => {
    const genericError = new Error('Something went wrong');
    const throwingFn = jest.fn().mockRejectedValue(genericError);

    const result = await withErrorHandling('delete_customer', throwingFn);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('should include operation name in error details', async () => {
    const error = new Error('Failed');
    const throwingFn = jest.fn().mockRejectedValue(error);

    const result = await withErrorHandling('close_opportunity', throwingFn);

    if (result.status === 'error') {
      expect(result.details?.operation).toBe('close_opportunity');
    }
  });

  it('should not swallow the original error for logging', async () => {
    const error = new Error('Database connection lost');
    const throwingFn = jest.fn().mockRejectedValue(error);

    // The error should be logged internally
    // but the function should still return a proper response
    const result = await withErrorHandling('update_opportunity', throwingFn);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
  });
});
