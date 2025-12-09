/**
 * Approve Budget Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Implements Section 5.6: Write operations require user confirmation.
 * This tool generates a pending_confirmation response instead of
 * immediately executing the approval.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleBudgetNotFound,
  handleInsufficientPermissions,
  handleBudgetAlreadyApproved,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for approve_budget tool
 */
export const ApproveBudgetInputSchema = z.object({
  budgetId: z.string().uuid('Budget ID must be a valid UUID'),
  comments: z.string().optional(),
});

export type ApproveBudgetInput = z.infer<typeof ApproveBudgetInputSchema>;

/**
 * Check if user has permission to approve budgets
 */
function hasApprovePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Approve budget tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Budget must not be already approved
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify budget exists and get details
 * 3. Check business rules (not already approved)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function approveBudget(
  input: ApproveBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('approve_budget', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { budgetId, comments } = ApproveBudgetInputSchema.parse(input);

    try {
      // 2. Verify budget exists and get details
      const budgetResult = await queryWithRLS(
        userContext,
        `
        SELECT
          b.budget_id,
          b.department,
          b.fiscal_year,
          b.quarter,
          b.total_allocated,
          b.total_spent,
          b.total_remaining,
          b.status
        FROM finance.budgets b
        WHERE b.budget_id = $1
        `,
        [budgetId]
      );

      if (budgetResult.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      const budget = budgetResult.rows[0];

      // 3. Check if budget is already approved
      if (budget.status === 'approved') {
        return handleBudgetAlreadyApproved(budgetId);
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'approve_budget',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        budgetId,
        department: budget.department,
        fiscalYear: budget.fiscal_year,
        quarter: budget.quarter,
        totalAllocated: budget.total_allocated,
        totalSpent: budget.total_spent,
        totalRemaining: budget.total_remaining,
        comments: comments || '',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `⚠️ Approve budget for ${budget.department} (FY${budget.fiscal_year} Q${budget.quarter})?

Total Allocated: $${budget.total_allocated.toLocaleString()}
Total Spent: $${budget.total_spent.toLocaleString()}
Remaining: $${budget.total_remaining.toLocaleString()}
${comments ? `Comments: ${comments}` : ''}

This action will mark the budget as approved and lock it from further changes.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_budget');
    }
  }) as Promise<MCPToolResponse<any>>;
}

/**
 * Execute the confirmed approval (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executeApproveBudget(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_approve_budget', async () => {
    const budgetId = confirmationData.budgetId as string;

    try {
      // Update budget to approved status
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.budgets
        SET
          status = 'approved',
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
        WHERE budget_id = $1
          AND status = 'pending'
        RETURNING budget_id, department, fiscal_year, quarter
        `,
        [budgetId, userContext.userId]
      );

      if (result.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      const approved = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Budget for ${approved.department} (FY${approved.fiscal_year} Q${approved.quarter}) has been successfully approved`,
        budgetId: approved.budget_id,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_budget');
    }
  }) as Promise<MCPToolResponse<any>>;
}
