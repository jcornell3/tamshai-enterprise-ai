/**
 * Approve Budget Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * ⚠️ NOT IMPLEMENTED IN v1.3 SCHEMA ⚠️
 *
 * The v1.3 finance.department_budgets table does not have approval workflow
 * (no status, approved_by, or approved_at columns). The spec assumed a
 * finance.budgets table with approval workflow that doesn't exist.
 *
 * This tool returns a NOT_IMPLEMENTED error explaining the limitation.
 *
 * See: Lesson 4 in docs/development/lessons-learned.md
 *
 * To implement this feature in v1.5+:
 * - Add status column to department_budgets (enum: draft, pending, approved)
 * - Add approved_by column (uuid FK to hr.employees)
 * - Add approved_at column (timestamp)
 * - Add CHECK constraint (status = 'approved' requires approved_by/at)
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
  approvedAmount: z.number().optional(),
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
    // Return NOT_IMPLEMENTED error
    return {
      status: 'error',
      code: 'NOT_IMPLEMENTED',
      message: 'Budget approval workflow is not available in v1.3 schema',
      suggestedAction: 'The finance.department_budgets table does not have approval columns (status, approved_by, approved_at). This feature requires schema updates in v1.5+. Use get_budget to view current budget allocations.',
      details: {
        operation: 'approve_budget',
        reason: 'Schema mismatch - v1.3 has simplified budget tracking without approval workflow',
        documentation: 'See Lesson 4 in docs/development/lessons-learned.md',
        requiredColumns: ['status', 'approved_by', 'approved_at'],
        currentTable: 'finance.department_budgets',
        assumedTable: 'finance.budgets',
      },
    };
  }) as Promise<MCPToolResponse<any>>;
}

/**
 * Execute the confirmed approval (called by Gateway after user approval)
 *
 * ⚠️ NOT IMPLEMENTED - Returns same error as approveBudget
 */
export async function executeApproveBudget(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_approve_budget', async () => {
    return {
      status: 'error',
      code: 'NOT_IMPLEMENTED',
      message: 'Budget approval workflow is not available in v1.3 schema',
      suggestedAction: 'This feature requires schema updates in v1.5+.',
      details: {
        operation: 'execute_approve_budget',
        reason: 'Schema mismatch - approval workflow not supported',
      },
    };
  }) as Promise<MCPToolResponse<any>>;
}
