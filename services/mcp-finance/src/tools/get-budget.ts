/**
 * Get Budget Tool
 *
 * Retrieves a single budget record by ID with RLS enforcement.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleBudgetNotFound,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for get_budget tool
 */
export const GetBudgetInputSchema = z.object({
  budgetId: z.string().uuid('Budget ID must be a valid UUID'),
});

export type GetBudgetInput = z.infer<typeof GetBudgetInputSchema>;

/**
 * Budget data structure
 */
export interface Budget {
  budget_id: string;
  department: string;
  fiscal_year: number;
  quarter: number;
  total_allocated: number;
  total_spent: number;
  total_remaining: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get a single budget by ID
 *
 * RLS automatically enforces:
 * - Finance roles can see all budgets
 * - Executives can see all budgets
 * - Managers can see their department budgets
 */
export async function getBudget(
  input: GetBudgetInput,
  userContext: UserContext
): Promise<MCPToolResponse<Budget>> {
  return withErrorHandling('get_budget', async () => {
    // Validate input
    const { budgetId } = GetBudgetInputSchema.parse(input);

    try {
      // Query with RLS enforcement
      const result = await queryWithRLS<Budget>(
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
          b.status,
          b.approved_by,
          b.approved_at::text as approved_at,
          b.created_at::text as created_at,
          b.updated_at::text as updated_at
        FROM finance.budgets b
        WHERE b.budget_id = $1
        `,
        [budgetId]
      );

      if (result.rowCount === 0) {
        return handleBudgetNotFound(budgetId);
      }

      return createSuccessResponse(result.rows[0]);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_budget');
    }
  }) as Promise<MCPToolResponse<Budget>>;
}
