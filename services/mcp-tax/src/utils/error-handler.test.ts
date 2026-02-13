/**
 * Error Handler Tests
 *
 * Tests for LLM-friendly error handling functions.
 */
import { ZodError, ZodIssue } from 'zod';
import {
  ErrorCode,
  handleTaxRateNotFound,
  handleEstimateNotFound,
  handleFilingNotFound,
  handleRegistrationNotFound,
  handleInsufficientPermissions,
  handleWritePermissionRequired,
  handleInvalidInput,
  handleInvalidStateCode,
  handleDatabaseError,
  handleUnknownError,
  withErrorHandling,
} from './error-handler';

jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('handleTaxRateNotFound', () => {
  it('returns error response with correct code', () => {
    const result = handleTaxRateNotFound('XX');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.TAX_RATE_NOT_FOUND);
  });

  it('includes state code in message', () => {
    const result = handleTaxRateNotFound('CA');

    expect(result.message).toContain('CA');
  });

  it('provides actionable suggestion', () => {
    const result = handleTaxRateNotFound('NY');

    expect(result.suggestedAction).toContain('list_sales_tax_rates');
  });
});

describe('handleEstimateNotFound', () => {
  it('returns error response with correct code', () => {
    const result = handleEstimateNotFound('est-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.ESTIMATE_NOT_FOUND);
  });

  it('includes estimate ID in message', () => {
    const result = handleEstimateNotFound('est-abc');

    expect(result.message).toContain('est-abc');
  });

  it('provides actionable suggestion', () => {
    const result = handleEstimateNotFound('est-123');

    expect(result.suggestedAction).toContain('list_quarterly_estimates');
  });
});

describe('handleFilingNotFound', () => {
  it('returns error response with correct code', () => {
    const result = handleFilingNotFound('filing-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.FILING_NOT_FOUND);
  });

  it('includes filing ID in message', () => {
    const result = handleFilingNotFound('filing-abc');

    expect(result.message).toContain('filing-abc');
  });

  it('provides actionable suggestion', () => {
    const result = handleFilingNotFound('filing-123');

    expect(result.suggestedAction).toContain('list_annual_filings');
  });
});

describe('handleRegistrationNotFound', () => {
  it('returns error response with correct code', () => {
    const result = handleRegistrationNotFound('reg-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.REGISTRATION_NOT_FOUND);
  });

  it('includes registration ID in message', () => {
    const result = handleRegistrationNotFound('reg-abc');

    expect(result.message).toContain('reg-abc');
  });

  it('provides actionable suggestion', () => {
    const result = handleRegistrationNotFound('reg-123');

    expect(result.suggestedAction).toContain('list_state_registrations');
  });
});

describe('handleInsufficientPermissions', () => {
  it('returns error response with correct code', () => {
    const result = handleInsufficientPermissions('update_rate', ['tax-write']);

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('includes operation name in message', () => {
    const result = handleInsufficientPermissions('delete_filing', ['tax-admin']);

    expect(result.message).toContain('delete_filing');
  });

  it('lists required roles in suggestion', () => {
    const result = handleInsufficientPermissions('update', ['tax-write', 'tax-admin']);

    expect(result.suggestedAction).toContain('tax-write');
    expect(result.suggestedAction).toContain('tax-admin');
  });
});

describe('handleWritePermissionRequired', () => {
  it('returns error response with correct code', () => {
    const result = handleWritePermissionRequired('update_estimate', ['tax-read']);

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.WRITE_PERMISSION_REQUIRED);
  });

  it('includes operation name in message', () => {
    const result = handleWritePermissionRequired('create_filing', ['tax-read']);

    expect(result.message).toContain('create_filing');
  });

  it('provides suggestion to contact administrator', () => {
    const result = handleWritePermissionRequired('update', ['tax-read']);

    expect(result.suggestedAction).toContain('administrator');
    expect(result.suggestedAction).toContain('tax-write');
  });
});

describe('handleInvalidInput', () => {
  it('returns error response with correct code', () => {
    const result = handleInvalidInput('Invalid date format');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INVALID_INPUT);
  });

  it('includes error message', () => {
    const result = handleInvalidInput('State code must be 2 characters');

    expect(result.message).toBe('State code must be 2 characters');
  });

  it('includes field name in suggestion when provided', () => {
    const result = handleInvalidInput('Invalid format', 'stateCode');

    expect(result.suggestedAction).toContain('stateCode');
  });

  it('provides generic suggestion without field name', () => {
    const result = handleInvalidInput('Invalid format');

    expect(result.suggestedAction).toContain('check your input');
  });
});

describe('handleInvalidStateCode', () => {
  it('returns error response with correct code', () => {
    const result = handleInvalidStateCode('XX');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INVALID_STATE_CODE);
  });

  it('includes invalid state code in message', () => {
    const result = handleInvalidStateCode('ZZ');

    expect(result.message).toContain('ZZ');
  });

  it('provides examples of valid state codes', () => {
    const result = handleInvalidStateCode('XX');

    expect(result.suggestedAction).toMatch(/CA|NY|TX/);
  });
});

describe('handleDatabaseError', () => {
  it('returns error response with correct code', () => {
    const error = new Error('Connection timeout');
    const result = handleDatabaseError(error, 'list_rates');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.DATABASE_ERROR);
  });

  it('provides user-friendly message', () => {
    const error = new Error('ECONNREFUSED');
    const result = handleDatabaseError(error, 'get_rate');

    expect(result.message).toContain('database error');
  });

  it('suggests retry', () => {
    const error = new Error('Timeout');
    const result = handleDatabaseError(error, 'query');

    expect(result.suggestedAction).toContain('try again');
  });
});

describe('handleUnknownError', () => {
  it('returns error response with correct code', () => {
    const error = new Error('Something unexpected');
    const result = handleUnknownError(error, 'unknown_op');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('provides generic user-friendly message', () => {
    const error = new Error('Stack trace here');
    const result = handleUnknownError(error, 'op');

    expect(result.message).toContain('unexpected error');
  });

  it('suggests retry and contact support', () => {
    const error = new Error('Unknown');
    const result = handleUnknownError(error, 'op');

    expect(result.suggestedAction).toContain('try again');
    expect(result.suggestedAction).toContain('support');
  });
});

describe('withErrorHandling', () => {
  it('returns result on success', async () => {
    const expected = { data: 'test' };
    const result = await withErrorHandling('test_op', async () => expected);

    expect(result).toEqual(expected);
  });

  it('handles ZodError with validation message', async () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['stateCode'],
        message: 'Expected string, received number',
      } as ZodIssue,
    ]);

    const result = await withErrorHandling('test_op', async () => {
      throw zodError;
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.suggestedAction).toContain('stateCode');
    }
  });

  it('handles ZodError without path', async () => {
    const zodError = new ZodError([
      {
        code: 'custom',
        path: [],
        message: 'Custom validation failed',
      } as ZodIssue,
    ]);

    const result = await withErrorHandling('test_op', async () => {
      throw zodError;
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('handles PostgreSQL duplicate key error (23505)', async () => {
    const pgError = new Error('duplicate key value') as Error & { code: string };
    pgError.code = '23505';

    const result = await withErrorHandling('test_op', async () => {
      throw pgError;
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.DUPLICATE_ENTRY);
      expect(result.suggestedAction).toContain('different identifier');
    }
  });

  it('handles PostgreSQL constraint errors (23xxx)', async () => {
    const pgError = new Error('foreign key violation') as Error & { code: string };
    pgError.code = '23503';

    const result = await withErrorHandling('test_op', async () => {
      throw pgError;
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.DATABASE_ERROR);
    }
  });

  it('handles generic Error', async () => {
    const error = new Error('Something went wrong');

    const result = await withErrorHandling('test_op', async () => {
      throw error;
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('handles non-Error throws', async () => {
    const result = await withErrorHandling('test_op', async () => {
      throw 'string error';
    });

    expect(result).toHaveProperty('status', 'error');
    if ('code' in result) {
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('handles null throws', async () => {
    const result = await withErrorHandling('test_op', async () => {
      throw null;
    });

    expect(result).toHaveProperty('status', 'error');
  });

  it('preserves async function return type', async () => {
    interface TaxRate {
      id: string;
      rate: number;
    }
    const expected: TaxRate = { id: 'rate-1', rate: 9.5 };

    const result = await withErrorHandling<TaxRate>('get_rate', async () => expected);

    // Result should be the expected object (not an error response)
    expect(result).toEqual(expected);
  });
});
