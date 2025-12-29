/**
 * Unit tests for MCP response helper functions
 *
 * Tests the factory functions that create typed MCP responses
 */

import {
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
  MCPSuccessResponse,
  MCPErrorResponse,
  MCPPendingConfirmationResponse,
  PaginationMetadata,
} from './response';

describe('MCP Response Helpers', () => {
  describe('createSuccessResponse', () => {
    it('creates success response with data only', () => {
      const data = { id: '123', name: 'Test' };
      const result = createSuccessResponse(data);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(data);
      expect(result.metadata).toBeUndefined();
    });

    it('creates success response with pagination metadata', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const metadata: PaginationMetadata = {
        hasMore: true,
        nextCursor: 'abc123',
        returnedCount: 2,
        totalEstimate: '50+',
        hint: 'Use nextCursor to fetch more records',
      };

      const result = createSuccessResponse(data, metadata);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(data);
      expect(result.metadata).toEqual(metadata);
    });

    it('creates success response with empty array', () => {
      const result = createSuccessResponse([]);

      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
    });

    it('creates success response with null data', () => {
      const result = createSuccessResponse(null);

      expect(result.status).toBe('success');
      expect(result.data).toBeNull();
    });

    it('has correct TypeScript type (success response)', () => {
      const result = createSuccessResponse({ count: 42 });

      // TypeScript compile-time check
      const _typeCheck: MCPSuccessResponse<{ count: number }> = result;
      expect(result.data.count).toBe(42);
    });
  });

  describe('createErrorResponse', () => {
    it('creates error response with all fields', () => {
      const result = createErrorResponse(
        'EMPLOYEE_NOT_FOUND',
        'Employee with ID 123 not found',
        'Use list_employees to find valid employee IDs',
        { employeeId: '123' }
      );

      expect(result.status).toBe('error');
      expect(result.code).toBe('EMPLOYEE_NOT_FOUND');
      expect(result.message).toBe('Employee with ID 123 not found');
      expect(result.suggestedAction).toBe('Use list_employees to find valid employee IDs');
      expect(result.details).toEqual({ employeeId: '123' });
    });

    it('creates error response without details', () => {
      const result = createErrorResponse(
        'DATABASE_ERROR',
        'Connection failed',
        'Retry the operation'
      );

      expect(result.status).toBe('error');
      expect(result.code).toBe('DATABASE_ERROR');
      expect(result.message).toBe('Connection failed');
      expect(result.suggestedAction).toBe('Retry the operation');
      expect(result.details).toBeUndefined();
    });

    it('creates error response with empty details object', () => {
      const result = createErrorResponse(
        'INVALID_INPUT',
        'Validation failed',
        'Check your input',
        {}
      );

      expect(result.status).toBe('error');
      expect(result.details).toEqual({});
    });

    it('has correct TypeScript type (error response)', () => {
      const result = createErrorResponse(
        'TEST_ERROR',
        'Test message',
        'Test action'
      );

      // TypeScript compile-time check
      const _typeCheck: MCPErrorResponse = result;
      expect(result.code).toBe('TEST_ERROR');
    });
  });

  describe('createPendingConfirmationResponse', () => {
    it('creates pending confirmation response with required fields', () => {
      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: Date.now(),
        employeeId: '223e4567-e89b-12d3-a456-426614174000',
        employeeName: 'John Doe',
      };

      const result = createPendingConfirmationResponse(
        'confirm-uuid-123',
        '⚠️ Delete employee John Doe?',
        confirmationData
      );

      expect(result.status).toBe('pending_confirmation');
      expect(result.confirmationId).toBe('confirm-uuid-123');
      expect(result.message).toContain('Delete employee John Doe');
      expect(result.confirmationData).toEqual(confirmationData);
    });

    it('creates pending confirmation with minimal data', () => {
      const confirmationData = {
        action: 'update_employee',
        mcpServer: 'hr',
        userId: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: 1234567890,
      };

      const result = createPendingConfirmationResponse(
        'uuid-abc',
        'Confirm update?',
        confirmationData
      );

      expect(result.status).toBe('pending_confirmation');
      expect(result.confirmationId).toBe('uuid-abc');
      expect(result.confirmationData.action).toBe('update_employee');
      expect(result.confirmationData.timestamp).toBe(1234567890);
    });

    it('preserves additional confirmation data fields', () => {
      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userId: 'user-123',
        timestamp: Date.now(),
        customField1: 'value1',
        customField2: { nested: 'data' },
        customField3: [1, 2, 3],
      };

      const result = createPendingConfirmationResponse(
        'confirm-id',
        'Confirm action',
        confirmationData
      );

      expect(result.confirmationData).toHaveProperty('customField1', 'value1');
      expect(result.confirmationData).toHaveProperty('customField2', { nested: 'data' });
      expect(result.confirmationData).toHaveProperty('customField3', [1, 2, 3]);
    });

    it('has correct TypeScript type (pending confirmation response)', () => {
      const confirmationData = {
        action: 'test_action',
        mcpServer: 'hr',
        userId: 'user-id',
        timestamp: 123,
      };

      const result = createPendingConfirmationResponse(
        'id',
        'message',
        confirmationData
      );

      // TypeScript compile-time check
      const _typeCheck: MCPPendingConfirmationResponse = result;
      expect(result.status).toBe('pending_confirmation');
    });
  });

  describe('Response type discrimination', () => {
    it('distinguishes success from error by status', () => {
      const successResponse = createSuccessResponse({ data: 'test' });
      const errorResponse = createErrorResponse('ERR', 'msg', 'action');

      expect(successResponse.status).toBe('success');
      expect(errorResponse.status).toBe('error');
    });

    it('distinguishes pending confirmation from others by status', () => {
      const pendingResponse = createPendingConfirmationResponse(
        'id',
        'msg',
        { action: 'test', mcpServer: 'hr', userId: 'user', timestamp: 123 }
      );

      expect(pendingResponse.status).toBe('pending_confirmation');
    });

    it('allows type narrowing with TypeScript discriminated unions', () => {
      const successResponse = createSuccessResponse({ test: true });
      const errorResponse = createErrorResponse('ERR', 'msg', 'action');

      // Test success response narrowing
      if (successResponse.status === 'success') {
        // TypeScript knows this is MCPSuccessResponse
        expect(successResponse.data).toBeDefined();
      }

      // Test error response narrowing
      if (errorResponse.status === 'error') {
        // TypeScript knows this is MCPErrorResponse
        expect(errorResponse.code).toBeDefined();
      }
    });
  });

  describe('Pagination metadata structure', () => {
    it('validates pagination metadata fields', () => {
      const metadata: PaginationMetadata = {
        hasMore: true,
        nextCursor: 'cursor-123',
        returnedCount: 50,
        totalEstimate: '100+',
        hint: 'Call list_employees with cursor parameter',
      };

      const result = createSuccessResponse([], metadata);

      expect(result.metadata?.hasMore).toBe(true);
      expect(result.metadata?.nextCursor).toBe('cursor-123');
      expect(result.metadata?.returnedCount).toBe(50);
      expect(result.metadata?.totalEstimate).toBe('100+');
      expect(result.metadata?.hint).toContain('cursor parameter');
    });

    it('allows minimal pagination metadata', () => {
      const metadata: PaginationMetadata = {
        hasMore: false,
        returnedCount: 10,
      };

      const result = createSuccessResponse([], metadata);

      expect(result.metadata?.hasMore).toBe(false);
      expect(result.metadata?.returnedCount).toBe(10);
      expect(result.metadata?.nextCursor).toBeUndefined();
      expect(result.metadata?.totalEstimate).toBeUndefined();
      expect(result.metadata?.hint).toBeUndefined();
    });
  });
});
