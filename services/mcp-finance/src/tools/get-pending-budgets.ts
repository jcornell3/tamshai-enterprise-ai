/**
 * Get Pending Budgets Tool (for ApprovalsQueue)
 *
 * Returns budget amendments awaiting approval (PENDING_APPROVAL status).
 * Used by finance staff and executives to see budgets needing action.
 *
 * Features:
 * - Filters for status = 'PENDING_APPROVAL'
 * - Cursor-based pagination
 * - Department and fiscal year filtering
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
 * Pending budget record
 */
export interface PendingBudget {
  id: string;
  budgetId: string;
  departmentCode: string;
  department: string;
  fiscalYear: number;
  categoryName: string;
  budgetedAmount: number;
  currentBudget: number;
  submittedBy: string;
  submittedByName: string | null;
  submittedAt: string;
}

/**
 * Cursor for pagination
 */
interface PaginationCursor {
  submittedAt: string;
  id: string;
}

function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for get_pending_budgets tool
 */
export const GetPendingBudgetsInputSchema = z.object({
  departmentCode: z.string().optional(),
  fiscalYear: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type GetPendingBudgetsInput = z.input<typeof GetPendingBudgetsInputSchema>;

/**
 * Get pending budgets awaiting approval
 *
 * Returns budgets with status = 'PENDING_APPROVAL' that need
 * finance or executive approval.
 *
 * RLS automatically enforces:
 * - Managers can see budgets from their department
 * - Finance roles can see all budgets
 * - Executives can see all budgets
 */
export async function getPendingBudgets(
  input: GetPendingBudgetsInput,
  userContext: UserContext
): Promise<MCPToolResponse<PendingBudget[]>> {
  return withErrorHandling('get_pending_budgets', async () => {
    const validated = GetPendingBudgetsInputSchema.parse(input);
    const { departmentCode, fiscalYear, limit, cursor } = validated;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Always filter for PENDING_APPROVAL status
    const whereClauses: string[] = ["db.status = 'PENDING_APPROVAL'"];
    const values: any[] = [];
    let paramIndex = 1;

    if (departmentCode) {
      whereClauses.push(`db.department_code = $${paramIndex++}`);
      values.push(departmentCode);
    }

    if (fiscalYear) {
      whereClauses.push(`db.fiscal_year = $${paramIndex++}`);
      values.push(fiscalYear);
    }

    // Cursor-based pagination
    if (cursorData) {
      whereClauses.push(`(
        (db.submitted_at < $${paramIndex}) OR
        (db.submitted_at = $${paramIndex} AND db.id < $${paramIndex + 1})
      )`);
      values.push(cursorData.submittedAt, cursorData.id);
      paramIndex += 2;
    }

    const queryLimit = limit + 1;

    try {
      const result = await queryWithRLS<PendingBudget>(
        userContext,
        `
        SELECT
          db.id,
          db.id as "budgetId",
          db.department_code as "departmentCode",
          db.department,
          db.fiscal_year as "fiscalYear",
          bc.name as "categoryName",
          db.budgeted_amount::numeric as "budgetedAmount",
          0::numeric as "currentBudget",
          db.submitted_by as "submittedBy",
          NULL as "submittedByName",
          db.submitted_at::text as "submittedAt"
        FROM finance.department_budgets db
        LEFT JOIN finance.budget_categories bc ON db.category_id = bc.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY db.submitted_at DESC, db.id DESC
        LIMIT $${paramIndex}
        `,
        [...values, queryLimit]
      );

      const hasMore = result.rowCount! > limit;
      const budgets = hasMore ? result.rows.slice(0, limit) : result.rows;

      const lastBudget = budgets[budgets.length - 1];

      const metadata: PaginationMetadata = {
        hasMore,
        returnedCount: budgets.length,
        ...(hasMore && lastBudget && {
          nextCursor: encodeCursor({
            submittedAt: lastBudget.submittedAt,
            id: lastBudget.id,
          }),
          hint: `To see more pending budgets, say "show next page" or "get more pending budgets".`,
        }),
      };

      return createSuccessResponse(budgets, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_pending_budgets');
    }
  }) as Promise<MCPToolResponse<PendingBudget[]>>;
}
