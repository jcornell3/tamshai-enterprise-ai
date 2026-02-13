/**
 * MCP Tool Response Types Unit Tests
 *
 * Tests for type guards and response factory functions.
 */

import {
  MCPToolResponse,
  MCPSuccessResponse,
  MCPErrorResponse,
  MCPPendingConfirmationResponse,
  PaginationMetadata,
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
} from './response';

describe('MCP Response Types', () => {
  // ===========================================================================
  // Type Guards
  // ===========================================================================

  describe('isSuccessResponse', () => {
    it('should return true for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: { id: 1, name: 'Test' },
      };

      expect(isSuccessResponse(response)).toBe(true);
    });

    it('should return false for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'TEST_ERROR',
        message: 'Test error',
      };

      expect(isSuccessResponse(response)).toBe(false);
    });

    it('should return false for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'test-123',
        message: 'Please confirm',
        action: 'delete',
        data: {},
      };

      expect(isSuccessResponse(response)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const response: MCPToolResponse<{ name: string }> = {
        status: 'success',
        data: { name: 'Test' },
      };

      if (isSuccessResponse(response)) {
        // TypeScript should allow accessing data.name
        expect(response.data.name).toBe('Test');
      }
    });
  });

  describe('isErrorResponse', () => {
    it('should return true for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'TEST_ERROR',
        message: 'Test error',
      };

      expect(isErrorResponse(response)).toBe(true);
    });

    it('should return false for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: [],
      };

      expect(isErrorResponse(response)).toBe(false);
    });

    it('should return false for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'test-123',
        message: 'Please confirm',
        action: 'delete',
        data: {},
      };

      expect(isErrorResponse(response)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Resource not found',
        suggestedAction: 'Check the ID',
      };

      if (isErrorResponse(response)) {
        expect(response.code).toBe('NOT_FOUND');
        expect(response.suggestedAction).toBe('Check the ID');
      }
    });
  });

  describe('isPendingConfirmationResponse', () => {
    it('should return true for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'test-123',
        message: 'Please confirm deletion',
        action: 'delete_opportunity',
        data: { opportunityId: 'opp-123' },
      };

      expect(isPendingConfirmationResponse(response)).toBe(true);
    });

    it('should return false for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: {},
      };

      expect(isPendingConfirmationResponse(response)).toBe(false);
    });

    it('should return false for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'ERROR',
        message: 'Error',
      };

      expect(isPendingConfirmationResponse(response)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'confirm-456',
        message: 'Confirm action',
        action: 'close_opportunity',
        data: { outcome: 'won' },
      };

      if (isPendingConfirmationResponse(response)) {
        expect(response.confirmationId).toBe('confirm-456');
        expect(response.action).toBe('close_opportunity');
      }
    });
  });

  // ===========================================================================
  // Factory Functions
  // ===========================================================================

  describe('createSuccessResponse', () => {
    it('should create success response with data only', () => {
      const data = { id: 1, name: 'Test' };
      const response = createSuccessResponse(data);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(data);
      expect(response.metadata).toBeUndefined();
    });

    it('should create success response with data and metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const metadata: PaginationMetadata = {
        hasMore: true,
        returnedCount: 2,
        nextCursor: 'abc123',
        totalEstimate: '100+',
        hint: 'Say "show more" to continue',
      };

      const response = createSuccessResponse(data, metadata);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(data);
      expect(response.metadata).toEqual(metadata);
    });

    it('should create success response with empty array', () => {
      const response = createSuccessResponse([]);

      expect(response.status).toBe('success');
      expect(response.data).toEqual([]);
    });

    it('should create success response with null data', () => {
      const response = createSuccessResponse(null);

      expect(response.status).toBe('success');
      expect(response.data).toBeNull();
    });

    it('should create success response with partial metadata', () => {
      const metadata: PaginationMetadata = {
        hasMore: false,
        returnedCount: 5,
      };

      const response = createSuccessResponse({ count: 5 }, metadata);

      expect(response.metadata?.hasMore).toBe(false);
      expect(response.metadata?.returnedCount).toBe(5);
      expect(response.metadata?.nextCursor).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with required fields only', () => {
      const response = createErrorResponse(
        'NOT_FOUND',
        'Customer not found'
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('NOT_FOUND');
      expect(response.message).toBe('Customer not found');
      expect(response.suggestedAction).toBeUndefined();
      expect(response.details).toBeUndefined();
    });

    it('should create error response with suggested action', () => {
      const response = createErrorResponse(
        'INVALID_INPUT',
        'Invalid customer ID format',
        'Provide a valid MongoDB ObjectId (24 hex characters)'
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('INVALID_INPUT');
      expect(response.message).toBe('Invalid customer ID format');
      expect(response.suggestedAction).toBe('Provide a valid MongoDB ObjectId (24 hex characters)');
    });

    it('should create error response with details', () => {
      const response = createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid input',
        'Check the input parameters',
        { field: 'email', reason: 'Invalid format' }
      );

      expect(response.details).toEqual({
        field: 'email',
        reason: 'Invalid format',
      });
    });

    it('should create error response with all fields', () => {
      const response = createErrorResponse(
        'DATABASE_ERROR',
        'Failed to connect to database',
        'Please try again later',
        { operation: 'list_opportunities', retryable: true }
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('DATABASE_ERROR');
      expect(response.message).toBe('Failed to connect to database');
      expect(response.suggestedAction).toBe('Please try again later');
      expect(response.details).toEqual({
        operation: 'list_opportunities',
        retryable: true,
      });
    });
  });

  describe('createPendingConfirmationResponse', () => {
    it('should create pending confirmation response', () => {
      const confirmationId = 'uuid-123-456';
      const message = 'Delete opportunity for Acme Corp?';
      const data = {
        action: 'delete_opportunity',
        opportunityId: 'opp-123',
        customerName: 'Acme Corp',
        value: 50000,
      };

      const response = createPendingConfirmationResponse(
        confirmationId,
        message,
        data
      );

      expect(response.status).toBe('pending_confirmation');
      expect(response.confirmationId).toBe('uuid-123-456');
      expect(response.message).toBe('Delete opportunity for Acme Corp?');
      expect(response.action).toBe('delete_opportunity');
      expect(response.data).toEqual(data);
    });

    it('should extract action from data', () => {
      const response = createPendingConfirmationResponse(
        'test-id',
        'Confirm?',
        { action: 'close_opportunity', outcome: 'won' }
      );

      expect(response.action).toBe('close_opportunity');
    });

    it('should handle complex data objects', () => {
      const data = {
        action: 'delete_customer',
        customerId: 'cust-123',
        customerName: 'Test Corp',
        activeDeals: 3,
        reason: 'Duplicate record',
        metadata: {
          requestedBy: 'admin',
          timestamp: 1234567890,
        },
      };

      const response = createPendingConfirmationResponse(
        'complex-id',
        'Delete customer with active deals?',
        data
      );

      expect(response.data).toEqual(data);
      expect(response.data.metadata).toEqual({
        requestedBy: 'admin',
        timestamp: 1234567890,
      });
    });
  });

  // ===========================================================================
  // Type Compatibility Tests
  // ===========================================================================

  describe('Type Compatibility', () => {
    it('should allow MCPSuccessResponse to be assigned to MCPToolResponse', () => {
      const success: MCPSuccessResponse<string[]> = {
        status: 'success',
        data: ['a', 'b', 'c'],
      };

      const response: MCPToolResponse<string[]> = success;

      expect(response.status).toBe('success');
    });

    it('should allow MCPErrorResponse to be assigned to MCPToolResponse', () => {
      const error: MCPErrorResponse = {
        status: 'error',
        code: 'TEST',
        message: 'Test',
      };

      const response: MCPToolResponse = error;

      expect(response.status).toBe('error');
    });

    it('should allow MCPPendingConfirmationResponse to be assigned to MCPToolResponse', () => {
      const pending: MCPPendingConfirmationResponse = {
        status: 'pending_confirmation',
        confirmationId: 'test',
        message: 'Test',
        action: 'test',
        data: {},
      };

      const response: MCPToolResponse = pending;

      expect(response.status).toBe('pending_confirmation');
    });
  });
});
