/**
 * Reject Budget Tool Tests - MCP-Finance (v1.5)
 *
 * Tests for budget rejection with human-in-the-loop confirmation.
 * Tests permission checks, business rules, and confirmation flow.
 */

import { rejectBudget, executeRejectBudget, RejectBudgetInput } from './reject-budget';
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

describe('rejectBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('permission checks', () => {
    it('should reject users without finance-write role', async () => {
      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Insufficient justification provided' },
        readUserContext
      );

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
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds department allocation' },
        writeUserContext
      );

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
        status: 'PENDING_APPROVAL',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([budget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds department allocation' },
        execUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('business rules', () => {
    it('should reject rejection of DRAFT budgets', async () => {
      const draftBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'DRAFT',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([draftBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Not applicable' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_BUDGET_STATUS');
        expect(result.suggestedAction).toContain('not been submitted');
      }
    });

    it('should reject rejection of APPROVED budgets', async () => {
      const approvedBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'APPROVED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([approvedBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Not applicable' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_BUDGET_STATUS');
        expect(result.suggestedAction).toContain('already been approved');
      }
    });

    it('should reject rejection of already REJECTED budgets', async () => {
      const rejectedBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'REJECTED',
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([rejectedBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Not applicable' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_BUDGET_STATUS');
        expect(result.suggestedAction).toContain('already been rejected');
      }
    });

    it('should allow rejection of PENDING_APPROVAL budgets', async () => {
      const pendingBudget = {
        id: 'budget-001',
        budget_id: 'BUD-2025-ENG',
        department: 'Engineering',
        status: 'PENDING_APPROVAL',
        budgeted_amount: 500000,
      };
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds department allocation' },
        writeUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
    });
  });

  describe('input validation', () => {
    it('should require rejection reason', async () => {
      const result = await rejectBudget(
        { budgetId: 'budget-001' } as RejectBudgetInput,
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('should require rejection reason of at least 10 characters', async () => {
      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Too short' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('INVALID_INPUT');
      }
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
      status: 'PENDING_APPROVAL',
      category_name: 'Technology',
    };

    it('should return pending_confirmation response', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds allocated limits' },
        writeUserContext
      );

      expect(isPendingConfirmationResponse(result)).toBe(true);
      if (isPendingConfirmationResponse(result)) {
        expect(result.confirmationId).toBe('test-confirmation-id');
        expect(result.action).toBe('reject_budget');
      }
    });

    it('should include rejection reason in confirmation message', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([pendingBudget]));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds allocated limits' },
        writeUserContext
      );

      if (isPendingConfirmationResponse(result)) {
        expect(result.message).toContain('Budget exceeds allocated limits');
        expect(result.message).toContain('Engineering');
      }
    });
  });

  describe('error handling', () => {
    it('should return database error on query failure', async () => {
      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await rejectBudget(
        { budgetId: 'budget-001', rejectionReason: 'Budget exceeds limits' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should return error when budget not found', async () => {
      mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

      const result = await rejectBudget(
        { budgetId: 'nonexistent', rejectionReason: 'Budget exceeds limits' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('BUDGET_NOT_FOUND');
      }
    });
  });
});

describe('executeRejectBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject budget and return success', async () => {
    const rejectedBudget = {
      id: 'budget-001',
      budget_id: 'BUD-2025-ENG',
      department: 'Engineering',
      department_code: 'ENG',
      fiscal_year: 2025,
      budgeted_amount: 500000,
    };
    // First call for UPDATE, second call for INSERT (audit trail)
    mockQueryWithRLS
      .mockResolvedValueOnce(createMockDbResult([rejectedBudget]))
      .mockResolvedValueOnce(createMockDbResult([]));

    const confirmationData = {
      budgetUUID: 'budget-001',
      action: 'reject_budget',
      rejectionReason: 'Budget exceeds allocated limits',
    };
    const result = await executeRejectBudget(confirmationData, writeUserContext);

    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string; status: string; rejectionReason: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('rejected');
      expect(data.status).toBe('REJECTED');
      expect(data.rejectionReason).toBe('Budget exceeds allocated limits');
    }
  });

  it('should return error when budget no longer exists or status changed', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));

    const confirmationData = {
      budgetUUID: 'already-rejected',
      action: 'reject_budget',
      rejectionReason: 'N/A',
    };
    const result = await executeRejectBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('BUDGET_NOT_FOUND');
    }
  });

  it('should handle database errors', async () => {
    mockQueryWithRLS.mockRejectedValue(new Error('Database unavailable'));

    const confirmationData = {
      budgetUUID: 'budget-001',
      action: 'reject_budget',
      rejectionReason: 'Budget exceeds limits',
    };
    const result = await executeRejectBudget(confirmationData, writeUserContext);

    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) {
      expect(result.code).toBe('DATABASE_ERROR');
    }
  });
});
