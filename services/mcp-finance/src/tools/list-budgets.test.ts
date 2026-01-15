/**
 * List Budgets Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for budget listing functionality.
 * Tests pagination, filtering, and RLS enforcement.
 */

import { listBudgets, ListBudgetsInput, BudgetSummary } from './list-budgets';
import {
  createMockUserContext,
  createMockDbResult,
  TEST_BUDGETS,
} from '../test-utils';
import { MCPToolResponse, isSuccessResponse, isErrorResponse } from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('listBudgets', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful queries', () => {
    it('should return paginated budget list', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(TEST_BUDGETS));

      const result = await listBudgets({ limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.metadata?.hasMore).toBe(false);
        expect(result.metadata?.returnedCount).toBe(2);
      }
    });

    it('should detect truncation with LIMIT+1 pattern', async () => {
      // Return 51 rows to indicate more data exists
      const manyBudgets = Array(51).fill(TEST_BUDGETS[0]);
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(manyBudgets));

      const result = await listBudgets({ limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data).toHaveLength(50); // Returns limit, not limit+1
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.hint).toContain('TRUNCATION');
      }
    });

    it('should filter by fiscal year', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([TEST_BUDGETS[0]]));

      const result = await listBudgets({ fiscalYear: 2024, limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('fiscal_year'),
        expect.arrayContaining([2024])
      );
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should filter by department (case-insensitive)', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([TEST_BUDGETS[0]]));

      const result = await listBudgets({ department: 'HR', limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('LOWER'),
        expect.arrayContaining(['HR'])
      );
      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should combine multiple filters', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([TEST_BUDGETS[0]]));

      const result = await listBudgets(
        { fiscalYear: 2024, department: 'HR', limit: 50 },
        userContext
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.stringContaining('AND'),
        expect.arrayContaining([2024, 'HR'])
      );
    });

    it('should include budget summary in metadata', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(TEST_BUDGETS));

      const result = await listBudgets({ limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        const metadata = result.metadata as any;
        expect(metadata.summary).toBeDefined();
        expect(metadata.summary.totalBudgeted).toBeGreaterThan(0);
        expect(metadata.summary.totalActual).toBeGreaterThan(0);
        expect(metadata.summary.overallUtilization).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('error handling', () => {
    it('should return error response on database failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await listBudgets({ limit: 50 }, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.suggestedAction).toBeDefined();
      }
    });

    it('should handle validation errors for invalid input', async () => {
      const result = await listBudgets(
        { limit: -1 } as ListBudgetsInput, // Invalid: negative limit
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should handle validation errors for limit exceeding max', async () => {
      const result = await listBudgets(
        { limit: 500 } as ListBudgetsInput, // Invalid: exceeds max 100
        userContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('input validation', () => {
    it('should use default limit of 50 when not specified', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listBudgets({}, userContext);

      // Should query with limit + 1 for truncation detection
      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining([51]) // 50 + 1
      );
    });

    it('should accept valid fiscal year', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await listBudgets({ fiscalYear: 2024, limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should accept valid department code', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await listBudgets({ department: 'ENGINEERING', limit: 50 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });

  describe('RLS enforcement', () => {
    it('should pass user context to queryWithRLS', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await listBudgets({ limit: 50 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should work with finance-write role', async () => {
      const writeUser = createMockUserContext({ roles: ['finance-write'] });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(TEST_BUDGETS));

      const result = await listBudgets({ limit: 50 }, writeUser);

      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should work with executive role', async () => {
      const execUser = createMockUserContext({ roles: ['executive'] });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(TEST_BUDGETS));

      const result = await listBudgets({ limit: 50 }, execUser);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });
});
