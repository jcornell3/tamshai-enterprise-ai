/**
 * MCP Response Types Unit Tests
 */

import {
  MCPToolResponse,
  MCPSuccessResponse,
  MCPErrorResponse,
  MCPPendingConfirmationResponse,
  PaginationMetadata,
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
  encodeCursor,
  decodeCursor,
  PaginationCursor,
} from './response';

describe('MCP Response Types', () => {
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
    it('should create error response with required fields', () => {
      const response = createErrorResponse(
        'NOT_FOUND',
        'Pay run not found',
        'Use list_pay_runs to find valid IDs'
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('NOT_FOUND');
      expect(response.message).toBe('Pay run not found');
      expect(response.suggestedAction).toBe('Use list_pay_runs to find valid IDs');
      expect(response.details).toBeUndefined();
    });

    it('should create error response with details', () => {
      const response = createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid input',
        'Check the input parameters',
        { field: 'employeeId', reason: 'Invalid format' }
      );

      expect(response.details).toEqual({
        field: 'employeeId',
        reason: 'Invalid format',
      });
    });

    it('should create error response with all fields', () => {
      const response = createErrorResponse(
        'DATABASE_ERROR',
        'Failed to connect to database',
        'Please try again later',
        { operation: 'list_pay_runs', retryable: true }
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('DATABASE_ERROR');
      expect(response.message).toBe('Failed to connect to database');
      expect(response.suggestedAction).toBe('Please try again later');
      expect(response.details).toEqual({
        operation: 'list_pay_runs',
        retryable: true,
      });
    });
  });

  describe('createPendingConfirmationResponse', () => {
    it('should create pending confirmation response', () => {
      const confirmationId = 'uuid-123-456';
      const message = 'Approve pay run for January 2026?';
      const confirmationData = {
        action: 'approve_pay_run',
        mcpServer: 'payroll',
        userId: 'user-123',
        timestamp: 1234567890,
        payRunId: 'pr-123',
      };

      const response = createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );

      expect(response.status).toBe('pending_confirmation');
      expect(response.confirmationId).toBe('uuid-123-456');
      expect(response.message).toBe('Approve pay run for January 2026?');
      expect(response.confirmationData).toEqual(confirmationData);
    });

    it('should handle complex confirmation data', () => {
      const confirmationData = {
        action: 'process_payroll',
        mcpServer: 'payroll',
        userId: 'admin-123',
        timestamp: Date.now(),
        payRunId: 'pr-456',
        employeeCount: 50,
        totalAmount: 125000.00,
        payPeriod: {
          start: '2026-01-01',
          end: '2026-01-15',
        },
      };

      const response = createPendingConfirmationResponse(
        'complex-id',
        'Process payroll?',
        confirmationData
      );

      expect(response.confirmationData).toEqual(confirmationData);
      expect(response.confirmationData.payRunId).toBe('pr-456');
    });
  });

  describe('Cursor Encoding/Decoding', () => {
    it('should encode cursor to base64', () => {
      const cursor: PaginationCursor = {
        sortKey: '2026-01-15',
        id: 'pay-stub-123',
      };

      const encoded = encodeCursor(cursor);

      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should decode valid cursor', () => {
      const cursor: PaginationCursor = {
        sortKey: '2026-01-15',
        id: 'pay-stub-123',
      };

      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('should return null for invalid base64', () => {
      const decoded = decodeCursor('not-valid-base64!!!');

      expect(decoded).toBeNull();
    });

    it('should return null for invalid JSON in base64', () => {
      const invalidJson = Buffer.from('not-json').toString('base64');
      const decoded = decodeCursor(invalidJson);

      expect(decoded).toBeNull();
    });

    it('should handle numeric sortKey', () => {
      const cursor: PaginationCursor = {
        sortKey: 1234567890,
        id: 'record-456',
      };

      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded?.sortKey).toBe(1234567890);
    });

    it('should handle Date sortKey as string', () => {
      const cursor: PaginationCursor = {
        sortKey: new Date('2026-01-15').toISOString(),
        id: 'record-789',
      };

      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded?.sortKey).toBe('2026-01-15T00:00:00.000Z');
    });
  });

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
        suggestedAction: 'Try again',
      };

      const response: MCPToolResponse = error;

      expect(response.status).toBe('error');
    });

    it('should allow MCPPendingConfirmationResponse to be assigned to MCPToolResponse', () => {
      const pending: MCPPendingConfirmationResponse = {
        status: 'pending_confirmation',
        confirmationId: 'test',
        message: 'Test',
        confirmationData: {
          action: 'test',
          mcpServer: 'payroll',
          userId: 'user-1',
          timestamp: 123,
        },
      };

      const response: MCPToolResponse = pending;

      expect(response.status).toBe('pending_confirmation');
    });
  });
});
