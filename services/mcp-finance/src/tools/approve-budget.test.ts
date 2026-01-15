/**
 * Approve Budget Tool Tests - MCP-Finance
 *
 * RED Phase: Tests for NOT_IMPLEMENTED response.
 * This tool is not available in v1.3 schema - tests verify proper error handling.
 */

import { approveBudget, executeApproveBudget, ApproveBudgetInput } from './approve-budget';
import { createMockUserContext } from '../test-utils';
import { isErrorResponse } from '../types/response';

describe('approveBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });
  const execUserContext = createMockUserContext({ roles: ['executive'] });

  describe('NOT_IMPLEMENTED response', () => {
    it('should return NOT_IMPLEMENTED error', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should include descriptive message about schema limitation', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      if (isErrorResponse(result)) {
        expect(result.message).toContain('v1.3');
        expect(result.message).toContain('not available');
        expect(result.message).toContain('approval workflow');
      }
    });

    it('should include suggested action for alternative tools', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      if (isErrorResponse(result)) {
        expect(result.suggestedAction).toContain('get_budget');
      }
    });

    it('should include details about required columns', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      if (isErrorResponse(result)) {
        expect(result.details).toBeDefined();
        expect(result.details?.requiredColumns).toContain('status');
        expect(result.details?.requiredColumns).toContain('approved_by');
        expect(result.details?.requiredColumns).toContain('approved_at');
        expect(result.details?.operation).toBe('approve_budget');
      }
    });

    it('should include documentation reference', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        writeUserContext
      );

      if (isErrorResponse(result)) {
        expect(result.details?.documentation).toContain('lessons-learned.md');
      }
    });

    it('should return consistent error for read-only users', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        readUserContext
      );

      // Even read-only users get NOT_IMPLEMENTED, not permission error
      // This is because the schema doesn't support the operation at all
      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should return consistent error for executive users', async () => {
      const result = await approveBudget(
        { budgetId: '550e8400-e29b-41d4-a716-446655440000' },
        execUserContext
      );

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });

    it('should handle optional parameters gracefully', async () => {
      const result = await approveBudget(
        {
          budgetId: '550e8400-e29b-41d4-a716-446655440000',
          approvedAmount: 100000,
          comments: 'Approved for Q1',
        },
        writeUserContext
      );

      // Still returns NOT_IMPLEMENTED regardless of parameters
      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
      }
    });
  });
});

describe('executeApproveBudget', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  describe('NOT_IMPLEMENTED response', () => {
    it('should return NOT_IMPLEMENTED error', async () => {
      const confirmationData = {
        budgetId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve_budget',
      };

      const result = await executeApproveBudget(confirmationData, writeUserContext);

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        expect(result.code).toBe('NOT_IMPLEMENTED');
        expect(result.details?.operation).toBe('execute_approve_budget');
      }
    });

    it('should include suggested action for schema updates', async () => {
      const confirmationData = {
        budgetId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve_budget',
      };

      const result = await executeApproveBudget(confirmationData, writeUserContext);

      if (isErrorResponse(result)) {
        expect(result.suggestedAction).toContain('v1.5');
      }
    });
  });
});
