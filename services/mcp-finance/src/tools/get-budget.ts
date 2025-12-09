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
 * Budget data structure (matches actual schema)
 */
export interface Budget {
  id: string;  // Actual column: id (not budget_id)
  department_code: string;  // Actual column: department_code (not department)
  fiscal_year: number;
  category_id: string | null;
  budgeted_amount: number;  // Actual column: budgeted_amount (not total_allocated)
  actual_amount: number;  // Actual column: actual_amount (not total_spent)
  forecast_amount: number | null;  // Actual column: forecast_amount (not total_remaining)
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get a single department budget by ID
 *
 * Uses actual v1.3 table: finance.department_budgets (not finance.budgets)
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
          b.id,
          b.department_code,
          b.fiscal_year,
          b.category_id,
          b.budgeted_amount,
          b.actual_amount,
          b.forecast_amount,
          b.notes,
          b.created_at::text as created_at,
          b.updated_at::text as updated_at
        FROM finance.department_budgets b
        WHERE b.id = $1
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
