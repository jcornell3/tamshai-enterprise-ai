/**
 * Response Types Tests - MCP-Support
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
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
} from './response';

// Type guards - these need to be added to response.ts
// Importing them here will fail until they're implemented
import {
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
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
          action: 'close_ticket',
          data: {},
        };
        expect(isSuccessResponse(response)).toBe(false);
      });

      it('should narrow type correctly', () => {
        const response: MCPToolResponse = { status: 'success', data: { tickets: [] } };
        if (isSuccessResponse(response)) {
          // TypeScript should know response.data exists
          expect(response.data).toBeDefined();
        }
      });
    });

    describe('isErrorResponse', () => {
      it('should return true for error response', () => {
        const response: MCPToolResponse = {
          status: 'error',
          code: 'TICKET_NOT_FOUND',
          message: 'Ticket not found',
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
          action: 'close_ticket',
          data: {},
        };
        expect(isErrorResponse(response)).toBe(false);
      });

      it('should narrow type correctly for error with suggestedAction', () => {
        const response: MCPToolResponse = {
          status: 'error',
          code: 'DATABASE_ERROR',
          message: 'Database unavailable',
          suggestedAction: 'Try again later',
        };
        if (isErrorResponse(response)) {
          expect(response.suggestedAction).toBe('Try again later');
        }
      });
    });

    describe('isPendingConfirmationResponse', () => {
      it('should return true for pending confirmation response', () => {
        const response: MCPToolResponse = {
          status: 'pending_confirmation',
          confirmationId: 'conf-123',
          message: 'Confirm ticket closure',
          action: 'close_ticket',
          data: { ticketId: 'ticket-1' },
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
        const data = { tickets: [{ id: '1', subject: 'Test ticket' }] };
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
        const result = createErrorResponse('TICKET_NOT_FOUND', 'Ticket not found');

        expect(result.status).toBe('error');
        expect(result.code).toBe('TICKET_NOT_FOUND');
        expect(result.message).toBe('Ticket not found');
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
        const details = { ticketId: '123', operation: 'close' };
        const result = createErrorResponse(
          'CANNOT_CLOSE_TICKET',
          'Cannot close ticket',
          'Contact support',
          details
        );

        expect(result.details).toEqual(details);
      });
    });

    describe('createPendingConfirmationResponse', () => {
      it('should create pending confirmation response', () => {
        const data = { ticketId: 'ticket-123', action: 'close_ticket' };
        const result = createPendingConfirmationResponse(
          'conf-456',
          'Are you sure you want to close this ticket?',
          data
        );

        expect(result.status).toBe('pending_confirmation');
        expect(result.confirmationId).toBe('conf-456');
        expect(result.message).toBe('Are you sure you want to close this ticket?');
        expect(result.action).toBe('close_ticket');
        expect(result.data).toEqual(data);
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
