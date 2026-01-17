/**
 * Unit tests for MCP Response Types
 *
 * Tests type guards and helper functions for discriminated union responses.
 * Ensures proper type narrowing and response construction.
 */

import {
  MCPToolResponse,
  PaginationMetadata,
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
} from './mcp-response';

describe('Type Guards', () => {
  describe('isSuccessResponse', () => {
    test('returns true for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: { result: 'test' },
      };

      expect(isSuccessResponse(response)).toBe(true);

      // Type narrowing should work
      if (isSuccessResponse(response)) {
        expect(response.data).toEqual({ result: 'test' });
      }
    });

    test('returns true for success response with metadata', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: ['item1', 'item2'],
        metadata: {
          hasMore: true,
          returnedCount: 2,
          totalEstimate: '100+',
        },
      };

      expect(isSuccessResponse(response)).toBe(true);

      if (isSuccessResponse(response)) {
        expect(response.metadata?.hasMore).toBe(true);
      }
    });

    test('returns false for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Resource not found',
        suggestedAction: 'Check the ID and try again',
      };

      expect(isSuccessResponse(response)).toBe(false);
    });

    test('returns false for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'conf-123',
        message: 'Confirm deletion',
        confirmationData: {
          action: 'delete',
          mcpServer: 'mcp-hr',
          userId: 'user-123',
          timestamp: Date.now(),
        },
      };

      expect(isSuccessResponse(response)).toBe(false);
    });

    test('returns false for null response', () => {
      expect(isSuccessResponse(null)).toBe(false);
    });

    test('returns false for undefined response', () => {
      expect(isSuccessResponse(undefined)).toBe(false);
    });
  });

  describe('isErrorResponse', () => {
    test('returns true for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        suggestedAction: 'Check field validation rules',
      };

      expect(isErrorResponse(response)).toBe(true);

      // Type narrowing
      if (isErrorResponse(response)) {
        expect(response.code).toBe('VALIDATION_ERROR');
        expect(response.suggestedAction).toBe('Check field validation rules');
      }
    });

    test('returns true for error response with details', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'INVALID_FIELDS',
        message: 'Field validation failed',
        suggestedAction: 'Fix the fields and retry',
        details: {
          fields: ['email', 'age'],
          errors: ['Invalid email format', 'Age must be positive'],
        },
      };

      expect(isErrorResponse(response)).toBe(true);

      if (isErrorResponse(response)) {
        expect(response.details?.fields).toEqual(['email', 'age']);
      }
    });

    test('returns false for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: { result: 'ok' },
      };

      expect(isErrorResponse(response)).toBe(false);
    });

    test('returns false for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'conf-456',
        message: 'Confirm action',
        confirmationData: {
          action: 'update',
          mcpServer: 'mcp-finance',
          userId: 'user-456',
          timestamp: Date.now(),
        },
      };

      expect(isErrorResponse(response)).toBe(false);
    });

    test('returns false for null response', () => {
      expect(isErrorResponse(null)).toBe(false);
    });

    test('returns false for undefined response', () => {
      expect(isErrorResponse(undefined)).toBe(false);
    });
  });

  describe('isPendingConfirmationResponse', () => {
    test('returns true for pending confirmation response', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'conf-789',
        message: 'Please confirm this action',
        confirmationData: {
          action: 'delete_employee',
          mcpServer: 'mcp-hr',
          userId: 'user-789',
          timestamp: Date.now(),
        },
      };

      expect(isPendingConfirmationResponse(response)).toBe(true);

      // Type narrowing
      if (isPendingConfirmationResponse(response)) {
        expect(response.confirmationId).toBe('conf-789');
        expect(response.confirmationData.action).toBe('delete_employee');
      }
    });

    test('returns true for pending confirmation with additional data', () => {
      const response: MCPToolResponse = {
        status: 'pending_confirmation',
        confirmationId: 'conf-abc',
        message: 'Confirm deletion',
        confirmationData: {
          action: 'delete',
          mcpServer: 'mcp-finance',
          userId: 'user-abc',
          timestamp: Date.now(),
          employeeId: 'emp-123',
          employeeName: 'John Doe',
        },
      };

      expect(isPendingConfirmationResponse(response)).toBe(true);

      if (isPendingConfirmationResponse(response)) {
        expect(response.confirmationData.employeeId).toBe('emp-123');
        expect(response.confirmationData.employeeName).toBe('John Doe');
      }
    });

    test('returns false for success response', () => {
      const response: MCPToolResponse = {
        status: 'success',
        data: { result: 'completed' },
      };

      expect(isPendingConfirmationResponse(response)).toBe(false);
    });

    test('returns false for error response', () => {
      const response: MCPToolResponse = {
        status: 'error',
        code: 'ACCESS_DENIED',
        message: 'Insufficient permissions',
        suggestedAction: 'Request access from administrator',
      };

      expect(isPendingConfirmationResponse(response)).toBe(false);
    });

    test('returns false for null response', () => {
      expect(isPendingConfirmationResponse(null)).toBe(false);
    });

    test('returns false for undefined response', () => {
      expect(isPendingConfirmationResponse(undefined)).toBe(false);
    });
  });
});

describe('Helper Functions', () => {
  describe('createSuccessResponse', () => {
    test('creates success response with data only', () => {
      const response = createSuccessResponse({ value: 42 });

      expect(response).toEqual({
        status: 'success',
        data: { value: 42 },
      });
      expect(response.metadata).toBeUndefined();
    });

    test('creates success response with array data', () => {
      const employees = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const response = createSuccessResponse(employees);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(employees);
    });

    test('creates success response with pagination metadata', () => {
      const metadata: PaginationMetadata = {
        hasMore: true,
        nextCursor: 'cursor-abc123',
        returnedCount: 50,
        totalEstimate: '200+',
        hint: 'Use nextCursor to fetch more records',
      };

      const response = createSuccessResponse(['item1', 'item2'], metadata);

      expect(response.status).toBe('success');
      expect(response.data).toEqual(['item1', 'item2']);
      expect(response.metadata).toEqual(metadata);
    });

    test('creates success response with truncation warning', () => {
      const metadata: PaginationMetadata = {
        hasMore: false,
        returnedCount: 50,
        truncated: true,
        totalCount: '50+',
        warning: 'Results truncated at 50 records',
      };

      const response = createSuccessResponse(['data'], metadata);

      expect(response.metadata?.truncated).toBe(true);
      expect(response.metadata?.warning).toBe('Results truncated at 50 records');
    });

    test('creates success response with empty data', () => {
      const response = createSuccessResponse([]);

      expect(response.status).toBe('success');
      expect(response.data).toEqual([]);
    });

    test('creates success response with null data', () => {
      const response = createSuccessResponse(null);

      expect(response.status).toBe('success');
      expect(response.data).toBeNull();
    });
  });

  describe('createErrorResponse', () => {
    test('creates error response with required fields', () => {
      const response = createErrorResponse(
        'NOT_FOUND',
        'Employee not found',
        'Use list_employees to find valid employee IDs'
      );

      expect(response).toEqual({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Employee not found',
        suggestedAction: 'Use list_employees to find valid employee IDs',
      });
      expect(response.details).toBeUndefined();
    });

    test('creates error response with details', () => {
      const details = {
        field: 'email',
        providedValue: 'invalid-email',
        expectedFormat: 'user@domain.com',
      };

      const response = createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid email format',
        'Provide a valid email address',
        details
      );

      expect(response.status).toBe('error');
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.details).toEqual(details);
    });

    test('creates error response with multiple details', () => {
      const details = {
        errors: [
          { field: 'age', message: 'Must be positive' },
          { field: 'salary', message: 'Must be a number' },
        ],
        timestamp: Date.now(),
      };

      const response = createErrorResponse(
        'MULTIPLE_ERRORS',
        'Multiple validation errors',
        'Fix all errors and retry',
        details
      );

      expect(response.details?.errors).toHaveLength(2);
    });

    test('creates error response for access denial', () => {
      const response = createErrorResponse(
        'ACCESS_DENIED',
        'Insufficient permissions to access finance data',
        'Request finance-read role from administrator'
      );

      expect(response.code).toBe('ACCESS_DENIED');
      expect(response.suggestedAction).toContain('Request finance-read');
    });

    test('creates error response for system errors', () => {
      const response = createErrorResponse(
        'INTERNAL_ERROR',
        'Database connection failed',
        'Retry the request. If error persists, contact support',
        { retryable: true }
      );

      expect(response.code).toBe('INTERNAL_ERROR');
      expect(response.details?.retryable).toBe(true);
    });
  });

  describe('createPendingConfirmationResponse', () => {
    test('creates pending confirmation response with required fields', () => {
      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'mcp-hr',
        userId: 'user-123',
        timestamp: 1640000000000,
      };

      const response = createPendingConfirmationResponse(
        'conf-123',
        'Confirm employee deletion',
        confirmationData
      );

      expect(response).toEqual({
        status: 'pending_confirmation',
        confirmationId: 'conf-123',
        message: 'Confirm employee deletion',
        confirmationData,
      });
    });

    test('creates pending confirmation with additional data', () => {
      const confirmationData = {
        action: 'update_salary',
        mcpServer: 'mcp-hr',
        userId: 'user-456',
        timestamp: Date.now(),
        employeeId: 'emp-789',
        oldSalary: 80000,
        newSalary: 90000,
      };

      const response = createPendingConfirmationResponse(
        'conf-456',
        'Confirm salary update from $80,000 to $90,000',
        confirmationData
      );

      expect(response.status).toBe('pending_confirmation');
      expect(response.confirmationData.employeeId).toBe('emp-789');
      expect(response.confirmationData.newSalary).toBe(90000);
    });

    test('creates pending confirmation for deletion', () => {
      const confirmationData = {
        action: 'delete',
        mcpServer: 'mcp-finance',
        userId: 'user-admin',
        timestamp: Date.now(),
        resourceType: 'budget',
        resourceId: 'budget-2024-q4',
      };

      const response = createPendingConfirmationResponse(
        'conf-delete-budget',
        'This will permanently delete the Q4 2024 budget. Confirm?',
        confirmationData
      );

      expect(response.confirmationId).toBe('conf-delete-budget');
      expect(response.message).toContain('permanently delete');
      expect(response.confirmationData.resourceType).toBe('budget');
    });
  });
});

describe('Integration: Type Guards with Helper Functions', () => {
  test('success response created by helper passes type guard', () => {
    const response = createSuccessResponse({ count: 10 });

    expect(isSuccessResponse(response)).toBe(true);
    expect(isErrorResponse(response)).toBe(false);
    expect(isPendingConfirmationResponse(response)).toBe(false);
  });

  test('error response created by helper passes type guard', () => {
    const response = createErrorResponse(
      'TEST_ERROR',
      'Test message',
      'Test action'
    );

    expect(isSuccessResponse(response)).toBe(false);
    expect(isErrorResponse(response)).toBe(true);
    expect(isPendingConfirmationResponse(response)).toBe(false);
  });

  test('pending confirmation created by helper passes type guard', () => {
    const response = createPendingConfirmationResponse(
      'conf-test',
      'Test confirmation',
      {
        action: 'test',
        mcpServer: 'test-server',
        userId: 'test-user',
        timestamp: Date.now(),
      }
    );

    expect(isSuccessResponse(response)).toBe(false);
    expect(isErrorResponse(response)).toBe(false);
    expect(isPendingConfirmationResponse(response)).toBe(true);
  });

  test('type narrowing works correctly in if statements', () => {
    const responses: MCPToolResponse[] = [
      createSuccessResponse({ data: 'success' }),
      createErrorResponse('ERR', 'error', 'action'),
      createPendingConfirmationResponse('conf', 'confirm', {
        action: 'test',
        mcpServer: 'server',
        userId: 'user',
        timestamp: 123,
      }),
    ];

    let successCount = 0;
    let errorCount = 0;
    let pendingCount = 0;

    responses.forEach(response => {
      if (isSuccessResponse(response)) {
        successCount++;
        expect(response.status).toBe('success');
      } else if (isErrorResponse(response)) {
        errorCount++;
        expect(response.status).toBe('error');
      } else if (isPendingConfirmationResponse(response)) {
        pendingCount++;
        expect(response.status).toBe('pending_confirmation');
      }
    });

    expect(successCount).toBe(1);
    expect(errorCount).toBe(1);
    expect(pendingCount).toBe(1);
  });
});
