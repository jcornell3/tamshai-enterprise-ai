/**
 * Response Types Tests - MCP-Finance
 *
 * RED Phase: Tests for MCPToolResponse discriminated union.
 * Validates type guards and helper functions.
 */

import {
  MCPSuccessResponse,
  MCPErrorResponse,
  MCPPendingConfirmationResponse,
  MCPToolResponse,
  PaginationMetadata,
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
} from './response';

describe('Response Types', () => {
  describe('Type Guards', () => {
    describe('isSuccessResponse', () => {
      it('should return true for success response', () => {
        const response: MCPToolResponse = { status: 'success', data: { test: 'data' } };
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
          confirmationId: 'conf-123',
          message: 'Confirm action',
          action: 'delete',
          data: {},
          confirmationData: {},
        };
        expect(isSuccessResponse(response)).toBe(false);
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
        const response: MCPToolResponse = { status: 'success', data: {} };
        expect(isErrorResponse(response)).toBe(false);
      });

      it('should return false for pending confirmation response', () => {
        const response: MCPToolResponse = {
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Confirm action',
          action: 'delete',
          data: {},
          confirmationData: {},
        };
        expect(isErrorResponse(response)).toBe(false);
      });
    });

    describe('isPendingConfirmationResponse', () => {
      it('should return true for pending confirmation response', () => {
        const response: MCPToolResponse = {
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Confirm action',
          action: 'delete',
          data: {},
          confirmationData: {},
        };
        expect(isPendingConfirmationResponse(response)).toBe(true);
      });

      it('should return false for success response', () => {
        const response: MCPToolResponse = { status: 'success', data: {} };
        expect(isPendingConfirmationResponse(response)).toBe(false);
      });

      it('should return false for error response', () => {
        const response: MCPToolResponse = {
          status: 'error',
          code: 'TEST_ERROR',
          message: 'Test error',
        };
        expect(isPendingConfirmationResponse(response)).toBe(false);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('createSuccessResponse', () => {
      it('should create success response with data', () => {
        const data = { budgets: [{ id: '1', amount: 1000 }] };
        const result = createSuccessResponse(data);

        expect(result.status).toBe('success');
        expect(result.data).toEqual(data);
        expect(result.metadata).toBeUndefined();
      });

      it('should create success response with pagination metadata', () => {
        const data = [{ id: '1' }, { id: '2' }];
        const metadata: PaginationMetadata = {
          hasMore: true,
          nextCursor: 'cursor-123',
          returnedCount: 2,
          totalEstimate: '100+',
        };

        const result = createSuccessResponse(data, metadata);

        expect(result.status).toBe('success');
        expect(result.data).toEqual(data);
        expect(result.metadata).toEqual(metadata);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBe('cursor-123');
      });

      it('should not include metadata key when metadata is undefined', () => {
        const result = createSuccessResponse({ test: 'data' });

        expect('metadata' in result).toBe(false);
      });
    });

    describe('createErrorResponse', () => {
      it('should create error response with required fields', () => {
        const result = createErrorResponse('TEST_ERROR', 'Test error message');

        expect(result.status).toBe('error');
        expect(result.code).toBe('TEST_ERROR');
        expect(result.message).toBe('Test error message');
      });

      it('should create error response with suggested action', () => {
        const result = createErrorResponse(
          'NOT_FOUND',
          'Resource not found',
          'Try searching with different parameters'
        );

        expect(result.suggestedAction).toBe('Try searching with different parameters');
      });

      it('should create error response with details', () => {
        const details = { resourceId: '123', resourceType: 'budget' };
        const result = createErrorResponse(
          'NOT_FOUND',
          'Resource not found',
          'Try searching',
          details
        );

        expect(result.details).toEqual(details);
      });
    });

    describe('createPendingConfirmationResponse', () => {
      it('should create pending confirmation response', () => {
        const data = { invoiceId: 'inv-123', action: 'delete' };
        const result = createPendingConfirmationResponse(
          'conf-456',
          'Are you sure you want to delete this invoice?',
          data
        );

        expect(result.status).toBe('pending_confirmation');
        expect(result.confirmationId).toBe('conf-456');
        expect(result.message).toBe('Are you sure you want to delete this invoice?');
        expect(result.action).toBe('delete');
        expect(result.data).toEqual(data);
        expect(result.confirmationData).toEqual(data); // Alias for data
      });
    });
  });

  describe('PaginationMetadata', () => {
    it('should support all pagination fields', () => {
      const metadata: PaginationMetadata = {
        hasMore: true,
        nextCursor: 'eyJvZmZzZXQiOjUwfQ==',
        returnedCount: 50,
        totalEstimate: '150+',
        hint: 'Use filters to narrow results',
      };

      expect(metadata.hasMore).toBe(true);
      expect(metadata.nextCursor).toBeDefined();
      expect(metadata.returnedCount).toBe(50);
      expect(metadata.totalEstimate).toBe('150+');
      expect(metadata.hint).toContain('filters');
    });

    it('should allow optional fields to be omitted', () => {
      const minimalMetadata: PaginationMetadata = {
        hasMore: false,
        returnedCount: 10,
      };

      expect(minimalMetadata.nextCursor).toBeUndefined();
      expect(minimalMetadata.totalEstimate).toBeUndefined();
      expect(minimalMetadata.hint).toBeUndefined();
    });
  });
});
