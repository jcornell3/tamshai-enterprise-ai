/**
 * Delete Budget Tool Tests - MCP-Finance (v1.5)
 *
 * Tests for budget deletion with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { deleteBudget, executeDeleteBudget, DeleteBudgetInput } from './delete-budget';
import {
  createMockUserContext,
  createMockDbResult,
} from '../test-utils';
import {
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
} from '../types/response';

// Mock the database connection
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

// Mock Redis for confirmation storage
jest.mock('../utils/redis', () => ({
  storePendingConfirmation: jest.fn().mockResolvedValue(undefined),
}));

// Mock UUID for deterministic testing
jest.mock('uuid', () => ({
  v4: () => 'test-confirmation-id',
}));

import { queryWithRLS } from '../database/connection';
import { storePendingConfirmation } from '../utils/redis';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<
  typeof storePendingConfirmation
>;

describe('deleteBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await deleteBudget({ budgetId: 'budget-001' }, readUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
      }
    });

    it('should allow users with finance-write role', async () => {
      const budget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'DRAFT',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });

    it('should allow users with executive role', async () => {
      const budget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'DRAFT',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, execUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('business rules', () => {
    it('should reject deletion of PENDING_APPROVAL budgets', async () => {
      const pendingBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('CANNOT_DELETE_NON_DRAFT_BUDGET');
        expect(result.suggestedAction).toContain('Reject it first');
      }
    });

    it('should reject deletion of APPROVED budgets', async () => {
      const approvedBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('CANNOT_DELETE_NON_DRAFT_BUDGET');
        expect(result.suggestedAction).toContain('cannot be deleted');
      }
    });

    it('should reject deletion of REJECTED budgets', async () => {
      const rejectedBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'REJECTED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([rejectedBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('CANNOT_DELETE_NON_DRAFT_BUDGET');
        expect(result.suggestedAction).toContain('audit purposes');
      }
    });

    it('should allow deletion of DRAFT budgets', async () => {
      const draftBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'DRAFT',
        budgeted_amount: 500000,
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('confirmation flow', () => {
    const draftBudget = {
      id: 'budget-001',
      budget_id: 'BUD-2025-ENG',
      department: 'Engineering',
      department_code: 'ENG',
      fiscal_year: 2025,
      budgeted_amount: 500000,
      status: 'DRAFT',
      category_name: 'Technology',
    };

    it('should return pending_confirmation response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-confirmation-id');
        expect(result.action).toBe('delete_budget');
      }
    });

    it('should include budget details in confirmation message', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Engineering');
        expect(result.message).toContain('2025');
        expect(result.message).toContain('500,000');
        expect(result.message).toContain('cannot be undone');
      }
    });

    it('should include reason in confirmation when provided', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await deleteBudget(
        { budgetId: 'budget-001', reason: 'Created in error' },
        writeUserContext
      );

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Created in error');
      }
    });

    it('should store confirmation data in Redis with 5-minute TTL', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          action: 'delete_budget',
          mcpServer: 'finance',
          budgetId: 'budget-001',
        }),
        300
      );
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await deleteBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should return error when budget not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await deleteBudget({ budgetId: 'nonexistent' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('BUDGET_NOT_FOUND');
      }
    });

    it('should validate input - empty budgetId', async () => {
      const result = await deleteBudget({ budgetId: '' } as DeleteBudgetInput, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});

describe('executeDeleteBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete budget and return success', async () => {
    const deletedBudget = {
      id: 'budget-001',
      budget_id: 'BUD-2025-ENG',
      department: 'Engineering',
      department_code: 'ENG',
      fiscal_year: 2025,
      budgeted_amount: 500000,
    };
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([deletedBudget]));

    const confirmationData = { budgetId: 'budget-001', action: 'delete_budget' };
    const result = await executeDeleteBudget(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
      expect(data.message).toContain('Engineering');
    }
  });

  it('should return error when budget no longer exists or status changed', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = { budgetId: 'already-deleted', action: 'delete_budget' };
    const result = await executeDeleteBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('BUDGET_NOT_FOUND');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = { budgetId: 'budget-001', action: 'delete_budget' };
    const result = await executeDeleteBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});
