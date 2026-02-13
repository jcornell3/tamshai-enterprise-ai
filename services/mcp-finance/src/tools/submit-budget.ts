/**
 * Submit Budget Tool (v1.5 Budget Approval Workflow)
 *
 * Submits a budget for approval, changing its status from DRAFT to PENDING_APPROVAL.
 * Only department heads (managers) can submit budgets for their department.
 *
 * Features:
 * - Permission check (manager role required)
 * - Status validation (only DRAFT budgets can be submitted)
 * - Sets submitted_by and submitted_at fields
 * - Creates audit trail entry
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import {
  handleBudgetNotFound,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for submit_budget tool
 */
export const SubmitBudgetInputSchema = z.object({
  budgetId: z.string().min(1, 'Budget ID is required'),
  comments: z.string().max(500).optional(),
});

export type SubmitBudgetInput = z.infer<typeof SubmitBudgetInputSchema>;

/**
 * Check if user has permission to submit budgets (department head)
 */
function canSubmitBudget(roles: string[]): boolean {
  return roles.some(role =>
    role === 'manager' ||
    role === 'executive' ||
    role === 'finance-write'
  );
}

/**
 * Submit budget tool - Changes status from DRAFT to PENDING_APPROVAL
 *
 * This is a write operation that requires:
 * 1. manager, executive, or finance-write role (department head)
 * 2. Budget must be in DRAFT or REJECTED status
 *
 * Flow:
 * 1. Check permissions (must be department head)
 * 2. Verify budget exists and get details
 * 3. Check business rules (must be DRAFT or REJECTED)
 * 4. Update status to PENDING_APPROVAL
 * 5. Set submitted_by and submitted_at
 * 6. Create audit trail entry
 * 7. Return success response
 */
export async function submitBudget(
  input: SubmitBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('submit_budget', async () => {
    // 1. Check permissions - must be department head
    if (!canSubmitBudget(userContext.roles)) {
      return createErrorResponse(
        'UNAUTHORIZED',
        'Only department heads can submit budgets for approval.',
        'Request manager or executive role to submit budgets.',
        { requiredRoles: ['manager', 'executive', 'finance-write'], currentRoles: userContext.roles }
      );
    }

    // Validate input
    const { budgetId, comments } = SubmitBudgetInputSchema.parse(input);

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
          b.status
        FROM finance.department_budgets b
        WHERE ${isUUID ? 'b.id = $1' : 'b.budget_id = $1'}
        `,
        [budgetId]
      );

      if (budgetResult.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      const budget = budgetResult.rows[0];

      // 3. Check if budget is in submittable status (DRAFT or REJECTED)
      if (budget.status !== 'DRAFT' && budget.status !== 'REJECTED') {
        if (budget.status === 'PENDING_APPROVAL') {
          return createErrorResponse(
            'ALREADY_SUBMITTED',
            `Budget "${budget.budget_id || budgetId}" has already been submitted and is awaiting approval.`,
            'Budget is already in PENDING_APPROVAL status. Wait for the current approval workflow to complete, or check the budget status with list_budgets.',
            { budgetId, currentStatus: budget.status }
          );
        }

        if (budget.status === 'APPROVED') {
          return createErrorResponse(
            'INVALID_STATUS',
            `Budget "${budget.budget_id || budgetId}" has already been approved and cannot be resubmitted.`,
            'Create a new budget revision if changes are needed.',
            { budgetId, currentStatus: budget.status }
          );
        }

        return createErrorResponse(
          'INVALID_STATUS',
          `Cannot submit budget "${budget.budget_id || budgetId}" because it is in "${budget.status}" status.`,
          'Only DRAFT or REJECTED budgets can be submitted for approval.',
          { budgetId, currentStatus: budget.status, allowedStatuses: ['DRAFT', 'REJECTED'] }
        );
      }

      const previousStatus = budget.status;

      // 4. Update status to PENDING_APPROVAL and set submitted_by/submitted_at
      const updateResult = await queryWithRLS(
        userContext,
        `
        UPDATE finance.department_budgets
        SET status = 'PENDING_APPROVAL',
            submitted_by = $2,
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND (status = 'DRAFT' OR status = 'REJECTED')
        RETURNING id, budget_id, department, department_code, fiscal_year, budgeted_amount, status, submitted_by, submitted_at
        `,
        [budget.id, userContext.userId]
      );

      if (updateResult.rowCount === 0) {
        return createErrorResponse(
          'UPDATE_FAILED',
          'Failed to submit budget. The status may have changed.',
          'Refresh the budget status and try again.',
          { budgetId }
        );
      }

      const submitted = updateResult.rows[0];

      // 5. Create audit trail entry
      await queryWithRLS(
        userContext,
        `
        INSERT INTO finance.budget_approval_history
          (budget_id, action, actor_id, action_at, comments)
        VALUES ($1, 'SUBMITTED', $2, NOW(), $3)
        `,
        [budget.id, userContext.userId, comments || null]
      );

      // 6. Return success response
      return createSuccessResponse({
        success: true,
        message: `Budget for ${submitted.department} (FY${submitted.fiscal_year}) has been submitted for approval.`,
        budgetId: submitted.budget_id || submitted.id,
        previousStatus: previousStatus,
        newStatus: 'PENDING_APPROVAL',
        submittedBy: submitted.submitted_by,
        submittedAt: submitted.submitted_at,
        department: submitted.department,
        departmentCode: submitted.department_code,
        fiscalYear: submitted.fiscal_year,
        budgetedAmount: Number(submitted.budgeted_amount),
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'submit_budget');
    }
  }) as Promise<MCPToolResponse>;
}
