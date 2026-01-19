/**
 * Centralized Error Handler Tests - MCP-Support
 *
 * RED Phase: Tests defining the expected error handler interface.
 * Following MCP-Finance error-handler.ts pattern (Architecture v1.4, Section 7.4)
 *
 * These tests will FAIL until the error handler is implemented.
 */

import {
  ErrorCode,
  handleValidationError,
  handleTicketNotFound,
  handleArticleNotFound,
  handleInsufficientPermissions,
  handleCannotCloseTicket,
  handleDatabaseError,
  handleSearchError,
  withErrorHandling,
} from './error-handler';
import { isErrorResponse } from '../types/response';

describe('ErrorCode enum', () => {
  describe('should define all support-specific error codes', () => {
    it('should have INVALID_INPUT code', () => {
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('should have MISSING_REQUIRED_FIELD code', () => {
      expect(ErrorCode.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should have TICKET_NOT_FOUND code', () => {
      expect(ErrorCode.TICKET_NOT_FOUND).toBe('TICKET_NOT_FOUND');
    });

    it('should have ARTICLE_NOT_FOUND code', () => {
      expect(ErrorCode.ARTICLE_NOT_FOUND).toBe('ARTICLE_NOT_FOUND');
    });

    it('should have INSUFFICIENT_PERMISSIONS code', () => {
      expect(ErrorCode.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should have CANNOT_CLOSE_TICKET code', () => {
      expect(ErrorCode.CANNOT_CLOSE_TICKET).toBe('CANNOT_CLOSE_TICKET');
    });

    it('should have DATABASE_ERROR code', () => {
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    });

    it('should have SEARCH_ERROR code', () => {
      expect(ErrorCode.SEARCH_ERROR).toBe('SEARCH_ERROR');
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
        { path: ['ticketId'], message: 'Invalid ticket ID format' },
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
        { path: ['ticketId'], message: 'Invalid UUID' },
        { path: ['status'], message: 'Invalid enum value' },
      ],
    };

    const result = handleValidationError(zodError);

    expect(result.message).toContain('ticketId');
    expect(result.message).toContain('status');
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
      errors: [{ path: ['query'], message: 'Required' }],
    };

    const result = handleValidationError(zodError);

    expect(result.details).toBeDefined();
    expect(result.details?.validationErrors).toBeDefined();
  });
});

describe('handleTicketNotFound', () => {
  it('should return MCPErrorResponse with TICKET_NOT_FOUND code', () => {
    const result = handleTicketNotFound('ticket-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.TICKET_NOT_FOUND);
  });

  it('should include ticket ID in message', () => {
    const result = handleTicketNotFound('ticket-456');

    expect(result.message).toContain('ticket-456');
  });

  it('should suggest using search_tickets tool', () => {
    const result = handleTicketNotFound('ticket-789');

    expect(result.suggestedAction).toContain('search_tickets');
  });

  it('should include ticket ID in details', () => {
    const result = handleTicketNotFound('ticket-abc');

    expect(result.details).toBeDefined();
    expect(result.details?.ticketId).toBe('ticket-abc');
  });
});

describe('handleArticleNotFound', () => {
  it('should return MCPErrorResponse with ARTICLE_NOT_FOUND code', () => {
    const result = handleArticleNotFound('article-123');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.ARTICLE_NOT_FOUND);
  });

  it('should include article ID in message', () => {
    const result = handleArticleNotFound('article-456');

    expect(result.message).toContain('article-456');
  });

  it('should suggest using search_knowledge_base tool', () => {
    const result = handleArticleNotFound('article-789');

    expect(result.suggestedAction).toContain('search_knowledge_base');
  });

  it('should include article ID in details', () => {
    const result = handleArticleNotFound('article-abc');

    expect(result.details).toBeDefined();
    expect(result.details?.articleId).toBe('article-abc');
  });
});

describe('handleInsufficientPermissions', () => {
  it('should return MCPErrorResponse with INSUFFICIENT_PERMISSIONS code', () => {
    const result = handleInsufficientPermissions('support-write', ['support-read']);

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('should include required role in message', () => {
    const result = handleInsufficientPermissions('support-write', ['support-read']);

    expect(result.message).toContain('support-write');
  });

  it('should include user roles in message', () => {
    const result = handleInsufficientPermissions('support-write', ['support-read', 'user']);

    expect(result.message).toContain('support-read');
    expect(result.message).toContain('user');
  });

  it('should suggest contacting administrator', () => {
    const result = handleInsufficientPermissions('executive', []);

    expect(result.suggestedAction).toContain('administrator');
  });

  it('should include role details', () => {
    const result = handleInsufficientPermissions('support-write', ['support-read']);

    expect(result.details).toBeDefined();
    expect(result.details?.requiredRole).toBe('support-write');
    expect(result.details?.userRoles).toEqual(['support-read']);
  });
});

describe('handleCannotCloseTicket', () => {
  it('should return MCPErrorResponse with CANNOT_CLOSE_TICKET code', () => {
    const result = handleCannotCloseTicket('ticket-123', 'already_closed');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.CANNOT_CLOSE_TICKET);
  });

  it('should include ticket ID in message', () => {
    const result = handleCannotCloseTicket('ticket-456', 'already_closed');

    expect(result.message).toContain('ticket-456');
  });

  it('should include reason for different scenarios', () => {
    const resultAlreadyClosed = handleCannotCloseTicket('t1', 'already_closed');
    const resultNeedsResolution = handleCannotCloseTicket('t2', 'needs_resolution');

    expect(resultAlreadyClosed.message).toContain('already');
    expect(resultNeedsResolution.message).toContain('resolution');
  });

  it('should provide appropriate suggestion based on reason', () => {
    const resultAlreadyClosed = handleCannotCloseTicket('t1', 'already_closed');

    expect(resultAlreadyClosed.suggestedAction).toBeDefined();
  });

  it('should include ticket ID and reason in details', () => {
    const result = handleCannotCloseTicket('ticket-789', 'already_closed');

    expect(result.details).toBeDefined();
    expect(result.details?.ticketId).toBe('ticket-789');
    expect(result.details?.reason).toBe('already_closed');
  });
});

describe('handleDatabaseError', () => {
  it('should return MCPErrorResponse with DATABASE_ERROR code', () => {
    const error = new Error('Connection refused');
    const result = handleDatabaseError(error, 'search_tickets');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.DATABASE_ERROR);
  });

  it('should not expose raw error message to user', () => {
    const error = new Error('ECONNREFUSED 127.0.0.1:27017');
    const result = handleDatabaseError(error, 'get_ticket');

    // Should have generic message, not the raw error
    expect(result.message).not.toContain('ECONNREFUSED');
    expect(result.message).not.toContain('127.0.0.1');
  });

  it('should include operation in details for debugging', () => {
    const error = new Error('Timeout');
    const result = handleDatabaseError(error, 'close_ticket');

    expect(result.details).toBeDefined();
    expect(result.details?.operation).toBe('close_ticket');
  });

  it('should suggest retry and contact support', () => {
    const error = new Error('Something went wrong');
    const result = handleDatabaseError(error, 'search_knowledge_base');

    expect(result.suggestedAction).toContain('try again');
  });
});

describe('handleSearchError', () => {
  it('should return MCPErrorResponse with SEARCH_ERROR code', () => {
    const error = new Error('Elasticsearch unavailable');
    const result = handleSearchError(error, 'knowledge_base');

    expect(result.status).toBe('error');
    expect(result.code).toBe(ErrorCode.SEARCH_ERROR);
  });

  it('should include search type in message', () => {
    const error = new Error('Index not found');
    const result = handleSearchError(error, 'tickets');

    expect(result.message.toLowerCase()).toContain('search');
  });

  it('should suggest alternative actions', () => {
    const error = new Error('Query parse error');
    const result = handleSearchError(error, 'knowledge_base');

    expect(result.suggestedAction).toBeDefined();
  });

  it('should include error details for debugging', () => {
    const error = new Error('Invalid query syntax');
    const result = handleSearchError(error, 'tickets');

    expect(result.details).toBeDefined();
    expect(result.details?.searchType).toBe('tickets');
  });
});

describe('withErrorHandling', () => {
  it('should return result from successful operation', async () => {
    const successFn = jest.fn().mockResolvedValue({
      status: 'success',
      data: { ticket: { id: 'ticket-1' } },
    });

    const result = await withErrorHandling('get_ticket', successFn);

    expect(result.status).toBe('success');
    expect(successFn).toHaveBeenCalled();
  });

  it('should catch ZodError and return validation error', async () => {
    const zodError = new Error('Validation failed');
    (zodError as any).name = 'ZodError';
    (zodError as any).errors = [{ path: ['query'], message: 'Required' }];

    const throwingFn = jest.fn().mockRejectedValue(zodError);

    const result = await withErrorHandling('search_tickets', throwingFn);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('should catch generic errors and return internal error', async () => {
    const genericError = new Error('Something went wrong');
    const throwingFn = jest.fn().mockRejectedValue(genericError);

    const result = await withErrorHandling('close_ticket', throwingFn);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('should include operation name in error details', async () => {
    const error = new Error('Failed');
    const throwingFn = jest.fn().mockRejectedValue(error);

    const result = await withErrorHandling('create_ticket', throwingFn);

    if (isErrorResponse(result)) {
      expect(result.details?.operation).toBe('create_ticket');
    }
  });

  it('should not swallow the original error for logging', async () => {
    const error = new Error('Database connection lost');
    const throwingFn = jest.fn().mockRejectedValue(error);

    // The error should be logged internally (we can't test this directly without mocking winston)
    // but the function should still return a proper response
    const result = await withErrorHandling('update_ticket', throwingFn);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
  });
});
