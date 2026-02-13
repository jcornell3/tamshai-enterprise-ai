/**
 * Approve Budget Tool Tests - MCP-Finance (v1.5)
 *
 * Tests for budget approval with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { approveBudget, executeApproveBudget, ApproveBudgetInput } from './approve-budget';
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

describe('approveBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await approveBudget({ budgetId: 'budget-001' }, readUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('finance-write');
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
        actual_amount: 0,
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

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
        actual_amount: 0,
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, execUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('budget lookup', () => {
    it('should return error when budget not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await approveBudget({ budgetId: 'nonexistent' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('BUDGET_NOT_FOUND');
      }
    });

    it('should lookup by UUID', async () => {
      const budget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        writeUserContext,
        expect.stringContaining('b.id = $1'),
        expect.any(Array)
      );
    });

    it('should lookup by budget_id', async () => {
      const budget = {
        id: 'uuid-123',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      await approveBudget({ budgetId: 'BUD-2025-ENG' }, writeUserContext);

      expect(mockQueryWithRLS).toHaveBeenCalledWith(
        writeUserContext,
        expect.stringContaining('b.budget_id = $1'),
        expect.any(Array)
      );
    });
  });

  describe('business rules', () => {
    it('should reject approval of DRAFT budgets', async () => {
      const draftBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'DRAFT',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_STATUS');
        expect(result.suggestedAction).toContain('submitted for approval');
      }
    });

    it('should reject approval of already approved budgets', async () => {
      const approvedBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedBudget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_STATUS');
        expect(result.suggestedAction).toContain('already been approved');
      }
    });

    it('should allow approval of PENDING_APPROVAL budgets', async () => {
      const pendingBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        department_code: 'ENG',
        fiscal_year: 2025,
        budgeted_amount: 500000,
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('confirmation flow', () => {
    const pendingBudget = {
      id: 'budget-001',
      budget_id: 'BUD-2025-ENG',
      department: 'Engineering',
      department_code: 'ENG',
      fiscal_year: 2025,
      budgeted_amount: 500000,
      actual_amount: 50000,
      status: 'PENDING_APPROVAL',
      category_name: 'Technology',
    };

    it('should return pending_confirmation response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-confirmation-id');
        expect(result.action).toBe('approve_budget');
      }
    });

    it('should store confirmation data in Redis with 5-minute TTL', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(mockStorePendingConfirmation).toHaveBeenCalledWith(
        'test-confirmation-id',
        expect.objectContaining({
          action: 'approve_budget',
          mcpServer: 'finance',
          budgetId: 'BUD-2025-ENG', // Uses budget_id from DB, not input
        }),
        300
      );
    });

    it('should include budget details in confirmation message', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Engineering');
        expect(result.message).toContain('2025');
        expect(result.message).toContain('500,000');
      }
    });

    it('should include approver notes in confirmation when provided', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await approveBudget(
        { budgetId: 'budget-001', approverNotes: 'Looks good, approved' },
        writeUserContext
      );

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Looks good, approved');
      }
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await approveBudget({ budgetId: 'budget-001' }, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should validate input', async () => {
      const result = await approveBudget(
        { budgetId: '' } as ApproveBudgetInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });
});

describe('executeApproveBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should approve budget and return success', async () => {
    const approvedBudget = {
      id: 'budget-001',
      budget_id: 'BUD-2025-ENG',
      department: 'Engineering',
      department_code: 'ENG',
      fiscal_year: 2025,
      budgeted_amount: 500000,
    };
    // First call for UPDATE, second call for INSERT (audit trail)
    mockQueryWithRLS
      .mockResolvedValueOnce(createMockDbResult([approvedBudget]))
      .mockResolvedValueOnce(createMockDbResult([]));

    const confirmationData = { budgetUUID: 'budget-001', action: 'approve_budget', approverNotes: null };
    const result = await executeApproveBudget(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string; status: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('Engineering');
      expect(data.status).toBe('APPROVED');
    }
  });

  it('should return error when budget no longer exists or status changed', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = { budgetUUID: 'already-approved', action: 'approve_budget' };
    const result = await executeApproveBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('BUDGET_NOT_FOUND');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = { budgetUUID: 'budget-001', action: 'approve_budget' };
    const result = await executeApproveBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});
