/**
 * Delete Budget Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Deletes a draft budget. Only DRAFT budgets can be deleted.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only DRAFT budgets can be deleted)
 * - Permanent deletion with confirmation
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import {
  handleBudgetNotFound,
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for delete_budget tool
 */
export const DeleteBudgetInputSchema = z.object({
  budgetId: z.string().min(1, 'Budget ID is required'),
  reason: z.string().max(500).optional(),
});

export type DeleteBudgetInput = z.infer<typeof DeleteBudgetInputSchema>;

/**
 * Check if user has permission to delete budgets
 */
function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Delete budget tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Budget must be in DRAFT status
 */
export async function deleteBudget(
  input: DeleteBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('delete_budget', async () => {
    // 1. Check permissions
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { budgetId, reason } = DeleteBudgetInputSchema.parse(input);

    try {
      // 2. Verify budget exists and get details
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(budgetId);
      const budgetResult = await queryWithRLS(
        userContext,
        `
        SELECT
          b.id,
          b.budget_id,
          b.department_code,
          b.department,
          b.fiscal_year,
          b.budgeted_amount,
          b.actual_amount,
          b.status,
          b.notes,
          c.name as category_name
        FROM finance.department_budgets b
        LEFT JOIN finance.budget_categories c ON b.category_id = c.id
        WHERE ${isUUID ? 'b.id = $1' : 'b.budget_id = $1'}
        `,
        [budgetId]
      );

      if (budgetResult.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      const budget = budgetResult.rows[0];

      // 3. Check if budget is in DRAFT status (only drafts can be deleted)
      if (budget.status !== 'DRAFT') {
        const suggestedAction = budget.status === 'PENDING_APPROVAL'
          ? 'This budget is pending approval. Reject it first if you want to remove it.'
          : budget.status === 'APPROVED'
            ? 'Approved budgets cannot be deleted. Contact finance administration for archival options.'
            : budget.status === 'REJECTED'
              ? 'Rejected budgets cannot be deleted. They are kept for audit purposes.'
              : 'Only DRAFT budgets can be deleted.';

        return createErrorResponse(
          'CANNOT_DELETE_NON_DRAFT_BUDGET',
          `Cannot delete budget "${budget.budget_id || budgetId}" because it is in "${budget.status}" status`,
          suggestedAction,
          { budgetId, currentStatus: budget.status, requiredStatus: 'DRAFT' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'delete_budget',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        budgetId: budget.id,
        budgetDisplayId: budget.budget_id,
        department: budget.department,
        departmentCode: budget.department_code,
        fiscalYear: budget.fiscal_year,
        budgetedAmount: budget.budgeted_amount,
        status: budget.status,
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `🗑️ **Delete Draft Budget for ${budget.department}?**

**Budget ID:** ${budget.budget_id || budgetId}
**Department:** ${budget.department} (${budget.department_code})
**Fiscal Year:** ${budget.fiscal_year}
**Category:** ${budget.category_name || 'General'}
**Budgeted Amount:** $${Number(budget.budgeted_amount).toLocaleString()}
${reason ? `**Reason:** ${reason}` : ''}

⚠️ This action will permanently delete this draft budget and cannot be undone.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'delete_budget');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed deletion (called by Gateway after user approval)
 */
export async function executeDeleteBudget(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_delete_budget', async () => {
    const budgetId = confirmationData.budgetId as string;

    try {
      // Delete the draft budget
      const result = await queryWithRLS(
        userContext,
        `
        DELETE FROM finance.department_budgets
        WHERE id = $1
          AND status = 'DRAFT'
        RETURNING id, budget_id, department, department_code, fiscal_year, budgeted_amount
        `,
        [budgetId]
      );

      if (result.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      const deleted = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Draft budget for ${deleted.department} (FY${deleted.fiscal_year}) has been deleted - $${Number(deleted.budgeted_amount).toLocaleString()}`,
        budgetId: deleted.id,
        budgetDisplayId: deleted.budget_id,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_delete_budget');
    }
  }) as Promise<MCPToolResponse>;
}
