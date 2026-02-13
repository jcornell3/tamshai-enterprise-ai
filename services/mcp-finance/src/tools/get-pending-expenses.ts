/**
 * Get Pending Expense Reports Tool (for ApprovalsQueue)
 *
 * Returns expense reports awaiting approval (SUBMITTED or UNDER_REVIEW status).
 * Used by managers and finance staff to see reports needing action.
 *
 * Features:
 * - Filters for status IN ('SUBMITTED', 'UNDER_REVIEW')
 * - Cursor-based pagination
 * - Department filtering
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
 * Pending expense report record
 */
export interface PendingExpenseReport {
  id: string;
  reportNumber: string;
  employeeId: string;
  employeeName: string | null;
  departmentCode: string;
  title: string;
  totalAmount: number;
  status: 'SUBMITTED' | 'UNDER_REVIEW';
  submissionDate: string | null;
  submittedAt: string;
  itemCount: number;
}

/**
 * Cursor for pagination
 */
interface PaginationCursor {
  submissionDate: string | null;
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
 * Input schema for get_pending_expenses tool
 */
export const GetPendingExpensesInputSchema = z.object({
  departmentCode: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type GetPendingExpensesInput = z.input<typeof GetPendingExpensesInputSchema>;

/**
 * Get pending expense reports awaiting approval
 *
 * Returns expense reports with status IN ('SUBMITTED', 'UNDER_REVIEW')
 * that need manager or finance approval.
 *
 * RLS automatically enforces:
 * - Employees can see their own reports
 * - Managers can see reports from their department
 * - Finance roles can see all reports
 * - Executives can see all reports
 */
export async function getPendingExpenses(
  input: GetPendingExpensesInput,
  userContext: UserContext
): Promise<MCPToolResponse<PendingExpenseReport[]>> {
  return withErrorHandling('get_pending_expenses', async () => {
    const validated = GetPendingExpensesInputSchema.parse(input);
    const { departmentCode, limit, cursor } = validated;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Always filter for pending statuses
    const whereClauses: string[] = ["er.status IN ('SUBMITTED', 'UNDER_REVIEW')"];
    const values: any[] = [];
    let paramIndex = 1;

    if (departmentCode) {
      whereClauses.push(`er.department_code = $${paramIndex++}`);
      values.push(departmentCode);
    }

    // Cursor-based pagination
    if (cursorData) {
      whereClauses.push(`(
        (er.submitted_at < $${paramIndex}) OR
        (er.submitted_at = $${paramIndex} AND er.id < $${paramIndex + 1})
      )`);
      values.push(cursorData.submittedAt, cursorData.id);
      paramIndex += 2;
    }

    const queryLimit = limit + 1;

    try {
      const result = await queryWithRLS<PendingExpenseReport>(
        userContext,
        `
        SELECT
          er.id,
          er.report_number as "reportNumber",
          er.employee_id as "employeeId",
          er.employee_id as "employeeName",
          er.department_code as "departmentCode",
          er.title,
          er.total_amount::numeric as "totalAmount",
          er.status::text as status,
          er.submission_date::text as "submissionDate",
          er.submitted_at::text as "submittedAt",
          COALESCE(item_counts.item_count, 0)::int as "itemCount"
        FROM finance.expense_reports er
        LEFT JOIN (
          SELECT expense_report_id, COUNT(*) as item_count
          FROM finance.expense_items
          GROUP BY expense_report_id
        ) item_counts ON item_counts.expense_report_id = er.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY er.submitted_at DESC, er.id DESC
        LIMIT $${paramIndex}
        `,
        [...values, queryLimit]
      );

      const hasMore = result.rowCount! > limit;
      const reports = hasMore ? result.rows.slice(0, limit) : result.rows;

      // DEBUG: Log itemCount values
      console.log('[DEBUG] Expense reports itemCount values:', reports.slice(0, 3).map(r => ({
        title: r.title,
        itemCount: r.itemCount,
        itemCountType: typeof r.itemCount,
      })));

      const lastReport = reports[reports.length - 1];

      const metadata: PaginationMetadata = {
        hasMore,
        returnedCount: reports.length,
        ...(hasMore && lastReport && {
          nextCursor: encodeCursor({
            submissionDate: lastReport.submissionDate,
            submittedAt: lastReport.submittedAt,
            id: lastReport.id,
          }),
          hint: `To see more pending expense reports, say "show next page" or "get more pending expenses".`,
        }),
      };

      return createSuccessResponse(reports, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_pending_expenses');
    }
  }) as Promise<MCPToolResponse<PendingExpenseReport[]>>;
}
