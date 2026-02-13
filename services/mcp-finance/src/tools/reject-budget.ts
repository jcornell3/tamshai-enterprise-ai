/**
 * Reject Budget Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Rejects a pending budget, changing its status from PENDING_APPROVAL to REJECTED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING_APPROVAL budgets can be rejected)
 * - Rejection reason required
 * - Audit trail
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
 * Input schema for reject_budget tool
 */
export const RejectBudgetInputSchema = z.object({
  budgetId: z.string().min(1, 'Budget ID is required'),
  rejectionReason: z.string().min(10, 'Rejection reason must be at least 10 characters').max(500),
});

export type RejectBudgetInput = z.infer<typeof RejectBudgetInputSchema>;

/**
 * Check if user has permission to reject budgets
 */
function hasRejectPermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Reject budget tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Budget must be in PENDING_APPROVAL status
 * 4. Rejection reason must be provided
 */
export async function rejectBudget(
  input: RejectBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('reject_budget', async () => {
    // 1. Check permissions
    if (!hasRejectPermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { budgetId, rejectionReason } = RejectBudgetInputSchema.parse(input);

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

      // 3. Check if budget is in PENDING_APPROVAL status
      if (budget.status !== 'PENDING_APPROVAL') {
        const suggestedAction = budget.status === 'DRAFT'
          ? 'This budget has not been submitted for approval yet.'
          : budget.status === 'APPROVED'
            ? 'This budget has already been approved and cannot be rejected.'
            : budget.status === 'REJECTED'
              ? 'This budget has already been rejected.'
              : 'Only PENDING_APPROVAL budgets can be rejected.';

        return createErrorResponse(
          'INVALID_BUDGET_STATUS',
          `Cannot reject budget "${budget.budget_id || budgetId}" because it is in "${budget.status}" status`,
          suggestedAction,
          { budgetId, currentStatus: budget.status, requiredStatus: 'PENDING_APPROVAL' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'reject_budget',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        // Internal UUID for database operations
        budgetUUID: budget.id,
        // Test-friendly fields
        budgetId: budget.budget_id,
        department: budget.department,
        departmentCode: budget.department_code,
        fiscalYear: budget.fiscal_year,
        budgetedAmount: budget.budgeted_amount,
        status: budget.status,
        rejectionReason,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `❌ **Reject Budget for ${budget.department}?**

**Budget ID:** ${budget.budget_id || budgetId}
**Department:** ${budget.department} (${budget.department_code})
**Fiscal Year:** ${budget.fiscal_year}
**Category:** ${budget.category_name || 'General'}
**Budgeted Amount:** $${Number(budget.budgeted_amount).toLocaleString()}
**Rejection Reason:** ${rejectionReason}

This will change the budget status from PENDING_APPROVAL to REJECTED.
The submitter will be able to revise and resubmit the budget.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'reject_budget');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed rejection (called by Gateway after user approval)
 */
export async function executeRejectBudget(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_reject_budget', async () => {
    // Use budgetUUID for database operations (internal ID)
    const budgetUUID = confirmationData.budgetUUID as string;
    const rejectionReason = confirmationData.rejectionReason as string;

    try {
      // Update budget status to REJECTED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.department_budgets
        SET status = 'REJECTED',
            rejection_reason = $2::text,
            updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'PENDING_APPROVAL'
        RETURNING id, budget_id, department, department_code, fiscal_year, budgeted_amount
        `,
        [budgetUUID, rejectionReason]
      );

      if (result.rowCount === 0) {
        return handleBudgetNotFound(budgetUUID);
      }

      const rejected = result.rows[0];

      // Create audit trail entry
      await queryWithRLS(
        userContext,
        `
        INSERT INTO finance.budget_approval_history
          (budget_id, action, actor_id, action_at, comments)
        VALUES ($1::uuid, 'REJECTED', $2::uuid, NOW(), $3::text)
        `,
        [budgetUUID, userContext.userId, rejectionReason]
      );

      return createSuccessResponse({
        success: true,
        message: `Budget for ${rejected.department} (FY${rejected.fiscal_year}) has been rejected - $${Number(rejected.budgeted_amount).toLocaleString()}`,
        budgetId: rejected.budget_id,
        budgetUUID: rejected.id,
        status: 'REJECTED',
        rejectionReason,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_reject_budget');
    }
  }) as Promise<MCPToolResponse>;
}
