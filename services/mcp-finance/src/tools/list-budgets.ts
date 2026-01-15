/**
 * List Budgets Tool
 *
 * Retrieves all department budgets with summary information.
 * Uses the vw_budget_summary view for formatted data.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  PaginationMetadata,
} from '../types/response';
import {
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for list_budgets tool
 */
export const ListBudgetsInputSchema = z.object({
  fiscalYear: z.number().optional(),
  department: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

// Use z.input to allow optional fields before parsing applies defaults
export type ListBudgetsInput = z.input<typeof ListBudgetsInputSchema>;

/**
 * Budget summary structure (matches vw_budget_summary view)
 */
export interface BudgetSummary {
  department_code: string;
  fiscal_year: number;
  category_name: string;
  category_type: string;
  budgeted_amount: number;
  actual_amount: number;
  forecast_amount: number | null;
  utilization_pct: number;
  remaining_amount: number;
  status: string;
}

/**
 * List all department budgets with summary
 *
 * RLS automatically enforces:
 * - Finance roles can see all budgets
 * - Executives can see all budgets
 * - Managers can see their department budgets
 */
export async function listBudgets(
  input: ListBudgetsInput,
  userContext: UserContext
): Promise<MCPToolResponse<BudgetSummary[]>> {
  return withErrorHandling('list_budgets', async () => {
    const { fiscalYear, department, limit } = ListBudgetsInputSchema.parse(input);

    try {
      const whereClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (fiscalYear) {
        whereClauses.push(`db.fiscal_year = $${paramIndex++}`);
        values.push(fiscalYear);
      }

      if (department) {
        whereClauses.push(`LOWER(db.department_code) = LOWER($${paramIndex++})`);
        values.push(department);
      }

      const whereClause = whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')}`
        : '';

      // Query with RLS enforcement - calculate remaining and return approval status
      const result = await queryWithRLS<BudgetSummary>(
        userContext,
        `
        SELECT
          db.department_code,
          db.fiscal_year,
          bc.name as category_name,
          bc.type as category_type,
          db.budgeted_amount,
          db.actual_amount,
          db.forecast_amount,
          ROUND((db.actual_amount / NULLIF(db.budgeted_amount, 0)) * 100, 1) as utilization_pct,
          (db.budgeted_amount - db.actual_amount) as remaining_amount,
          db.status::text as status
        FROM finance.department_budgets db
        JOIN finance.budget_categories bc ON db.category_id = bc.id
        ${whereClause}
        ORDER BY db.department_code, bc.type, bc.name
        LIMIT $${paramIndex}
        `,
        [...values, limit + 1]
      );

      const hasMore = result.rows.length > limit;
      const budgets = hasMore ? result.rows.slice(0, limit) : result.rows;

      // Calculate totals for summary
      const totals = budgets.reduce(
        (acc, b) => ({
          budgeted: acc.budgeted + Number(b.budgeted_amount),
          actual: acc.actual + Number(b.actual_amount),
        }),
        { budgeted: 0, actual: 0 }
      );

      const metadata: PaginationMetadata = {
        returnedCount: budgets.length,
        totalEstimate: hasMore ? `${limit}+` : budgets.length.toString(),
        hasMore,
      };

      if (hasMore) {
        metadata.hint = `TRUNCATION WARNING: Only ${limit} of ${limit}+ budget entries returned. Use department or fiscalYear filters to narrow results.`;
      }

      // Add summary to metadata
      (metadata as any).summary = {
        totalBudgeted: totals.budgeted,
        totalActual: totals.actual,
        totalRemaining: totals.budgeted - totals.actual,
        overallUtilization: totals.budgeted > 0
          ? Math.round((totals.actual / totals.budgeted) * 1000) / 10
          : 0,
      };

      return createSuccessResponse(budgets, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_budgets');
    }
  }) as Promise<MCPToolResponse<BudgetSummary[]>>;
}
