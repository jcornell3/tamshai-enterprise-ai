/**
 * Get Budget Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for department budget retrieval.
 * Tests department code mapping, RLS enforcement, and error handling.
 */

import { getBudget, GetBudgetInput, Budget } from './get-budget';
import {
  createMockUserContext,
  createMockDbResult,
  TEST_BUDGETS,
} from '../test-utils';
import { isSuccessResponse, isErrorResponse } from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

// Sample budget data matching actual schema
const sampleBudgets: Budget[] = [
  {
    id: 'budget-001',
    department_code: 'ENG',
    fiscal_year: 2024,
    category_id: 'cat-001',
    budgeted_amount: 500000,
    actual_amount: 350000,
    forecast_amount: 480000,
    notes: 'Engineering department budget',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'budget-002',
    department_code: 'ENG',
    fiscal_year: 2024,
    category_id: 'cat-002',
    budgeted_amount: 150000,
    actual_amount: 80000,
    forecast_amount: 140000,
    notes: 'Training budget',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
];

describe('getBudget', () => {
  const userContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful queries', () => {
    it('should return budget data for valid department', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      const result = await getBudget({ department: 'Engineering', year: 2024 }, userContext);

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        expect(result.data.department).toBe('Engineering');
        expect(result.data.fiscal_year).toBe(2024);
        expect(result.data.budgets).toHaveLength(2);
      }
    });

    it('should include aggregated totals in response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      const result = await getBudget({ department: 'Engineering', year: 2024 }, userContext);

      if (isSuccessResponse(result)) {
        expect(result.data.total_budgeted).toBe(650000); // 500000 + 150000
        expect(result.data.total_actual).toBe(430000); // 350000 + 80000
      }
    });

    it('should use default year of 2024 when not specified', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      await getBudget({ department: 'Engineering' }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining([2024])
      );
    });
  });

  describe('department code mapping', () => {
    it('should map "engineering" to "ENG"', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      await getBudget({ department: 'engineering', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['ENG', 2024])
      );
    });

    it('should map "hr" to "HR"', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await getBudget({ department: 'hr', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['HR', 2024])
      );
    });

    it('should map "human resources" to "HR"', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await getBudget({ department: 'human resources', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['HR', 2024])
      );
    });

    it('should map "finance" to "FIN"', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await getBudget({ department: 'finance', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['FIN', 2024])
      );
    });

    it('should map "customer support" to "SUPPORT"', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await getBudget({ department: 'customer support', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['SUPPORT', 2024])
      );
    });

    it('should use uppercase for unmapped department codes', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      await getBudget({ department: 'research', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['RESEARCH', 2024])
      );
    });

    it('should handle case-insensitive department names', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      await getBudget({ department: 'ENGINEERING', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.arrayContaining(['ENG', 2024])
      );
    });
  });

  describe('error handling', () => {
    it('should return BUDGET_NOT_FOUND when no budget exists', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await getBudget({ department: 'Unknown', year: 2024 }, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('BUDGET_NOT_FOUND');
        expect(result.message).toContain('Unknown');
        expect(result.message).toContain('2024');
        expect(result.suggestedAction).toContain('list_budgets');
      }
    });

    it('should return error response on database failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection refused'));

      const result = await getBudget({ department: 'Engineering', year: 2024 }, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle invalid input (missing department)', async () => {
      const result = await getBudget({ year: 2024 } as GetBudgetInput, userContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('RLS enforcement', () => {
    it('should pass user context to queryWithRLS', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      await getBudget({ department: 'Engineering', year: 2024 }, userContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        userContext,
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should work with finance-write role', async () => {
      const writeUser = createMockUserContext({ roles: ['finance-write'] });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      const result = await getBudget({ department: 'Engineering', year: 2024 }, writeUser);

      expect(isSuccessResponse(result)).toBe(true);
    });

    it('should work with executive role', async () => {
      const execUser = createMockUserContext({ roles: ['executive'] });
      mockQueryWithRLS.mockResolvedValue(createMockDbResult(sampleBudgets));

      const result = await getBudget({ department: 'Engineering', year: 2024 }, execUser);

      expect(isSuccessResponse(result)).toBe(true);
    });
  });
});
