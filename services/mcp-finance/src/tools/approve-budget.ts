/**
 * Approve Budget Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Approves a pending budget, changing its status from PENDING_APPROVAL to APPROVED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING_APPROVAL budgets can be approved)
 * - Audit trail (approved_by, approved_at)
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
 * Input schema for approve_budget tool
 */
export const ApproveBudgetInputSchema = z.object({
  budgetId: z.string().min(1, 'Budget ID is required'),
  approvedAmount: z.number().optional(),
  approverNotes: z.string().max(500).optional(),
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
 * 3. Budget must be in PENDING_APPROVAL status
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify budget exists and get details
 * 3. Check business rules (must be PENDING_APPROVAL)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function approveBudget(
  input: ApproveBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('approve_budget', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { budgetId, approvedAmount, approverNotes } = ApproveBudgetInputSchema.parse(input);

    try {
      // 2. Verify budget exists and get details (including submitted_by for separation of duties)
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
          b.submitted_by,
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
          ? 'This budget must be submitted for approval first using submit_budget tool.'
          : budget.status === 'APPROVED'
            ? 'This budget has already been approved.'
            : 'Only budgets in PENDING_APPROVAL status can be approved.';

        return createErrorResponse(
          'INVALID_STATUS',
          `Cannot approve budget "${budget.budget_id || budgetId}" because it is in "${budget.status}" status. Only PENDING_APPROVAL budgets can be approved.`,
          suggestedAction,
          { budgetId, currentStatus: budget.status, requiredStatus: 'PENDING_APPROVAL' }
        );
      }

      // 3b. Separation of duties: submitter cannot approve their own budget
      if (budget.submitted_by && budget.submitted_by === userContext.userId) {
        return createErrorResponse(
          'SEPARATION_OF_DUTIES',
          `You cannot approve your own submitted budget. A different finance team member must approve this budget.`,
          'Request another finance-write user to approve this budget.',
          { budgetId, submittedBy: budget.submitted_by, approverId: userContext.userId }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      // Use approvedAmount if provided, otherwise use budgeted_amount
      const finalAmount = approvedAmount ?? Number(budget.budgeted_amount);

      const confirmationData = {
        action: 'approve_budget',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        // Internal UUID for database operations
        budgetUUID: budget.id,
        // Test-friendly fields that match expected format
        budgetId: budget.budget_id,
        department: budget.department,
        departmentCode: budget.department_code,
        fiscalYear: budget.fiscal_year,
        budgetedAmount: budget.budgeted_amount,
        amount: finalAmount, // Test expects 'amount' field - use approvedAmount if provided
        status: budget.status,
        approverNotes: approverNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const amountDisplay = approvedAmount
        ? `$${finalAmount.toLocaleString()} (${finalAmount})`
        : `$${Number(budget.budgeted_amount).toLocaleString()}`;

      const message = `✅ **Approve Budget for ${budget.department}?**

**Budget ID:** ${budget.budget_id || budgetId}
**Department:** ${budget.department} (${budget.department_code})
**Fiscal Year:** ${budget.fiscal_year}
**Category:** ${budget.category_name || 'General'}
**Budgeted Amount:** ${amountDisplay}
**Actual Spent:** $${Number(budget.actual_amount || 0).toLocaleString()}
${approverNotes ? `**Your Notes:** ${approverNotes}` : ''}

This will change the budget status from PENDING_APPROVAL to APPROVED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_budget');
    }
  }) as Promise<MCPToolResponse>;
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
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_approve_budget', async () => {
    // Use budgetUUID for database operations (internal ID)
    const budgetUUID = confirmationData.budgetUUID as string;
    const approverNotes = confirmationData.approverNotes as string | null;

    try {
      // Get approver's ID
      const approverId = userContext.userId;

      // Update budget status to APPROVED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.department_budgets
        SET status = 'APPROVED',
            approved_by = $2::uuid,
            approved_at = NOW(),
            notes = CASE WHEN $3::text IS NOT NULL THEN COALESCE(notes || E'\\n', '') || 'Approver: ' || $3::text ELSE notes END,
            updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'PENDING_APPROVAL'
        RETURNING id, budget_id, department, department_code, fiscal_year, budgeted_amount
        `,
        [budgetUUID, approverId, approverNotes]
      );

      if (result.rowCount === 0) {
        return handleBudgetNotFound(budgetUUID);
      }

      const approved = result.rows[0];

      // Create audit trail entry
      await queryWithRLS(
        userContext,
        `
        INSERT INTO finance.budget_approval_history
          (budget_id, action, actor_id, action_at, comments)
        VALUES ($1::uuid, 'APPROVED', $2::uuid, NOW(), $3::text)
        `,
        [budgetUUID, approverId, approverNotes || null]
      );

      return createSuccessResponse({
        success: true,
        message: `Budget for ${approved.department} (FY${approved.fiscal_year}) has been approved - $${Number(approved.budgeted_amount).toLocaleString()}`,
        budgetId: approved.budget_id,
        budgetUUID: approved.id,
        status: 'APPROVED',
        approvedBy: approverId,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_budget');
    }
  }) as Promise<MCPToolResponse>;
}
