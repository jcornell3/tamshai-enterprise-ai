/**
 * List Expense Reports Tool (v1.5 with Cursor-Based Pagination)
 *
 * Lists expense reports with optional filters, implementing cursor-based pagination
 * to allow complete data retrieval across multiple API calls while maintaining
 * token efficiency per request (Section 5.3, Article III.2).
 *
 * Pagination Strategy:
 * - Each request returns up to `limit` records (default 50)
 * - If more records exist, response includes `nextCursor`
 * - Client passes cursor to get next page
 * - Cursor encodes last record's sort key for efficient keyset pagination
 *
 * RLS automatically enforces:
 * - Employees can see their own reports
 * - Managers can see reports from their department
 * - Finance roles can see all reports
 * - Executives can see all reports
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
 * Cursor structure for keyset pagination
 * Encoded as base64 JSON for opaque transport
 */
interface PaginationCursor {
  submissionDate: string | null;
  createdAt: string;
  id: string;
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for list_expense_reports tool
 */
export const ListExpenseReportsInputSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REIMBURSED']).optional(),
  employeeId: z.string().uuid('Employee ID must be a valid UUID').optional(),
  department: z.string().optional(),
  startDate: z.string().optional(),  // ISO 8601 date string (YYYY-MM-DD)
  endDate: z.string().optional(),    // ISO 8601 date string (YYYY-MM-DD)
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export type ListExpenseReportsInput = z.input<typeof ListExpenseReportsInputSchema>;

/**
 * Expense report summary for list view
 */
export interface ExpenseReportSummary {
  id: string;
  report_number: string;
  employee_id: string;
  employee_name: string | null;
  department_code: string;
  title: string;
  total_amount: number;
  status: string;
  submission_date: string | null;
  created_at: string;
  item_count: number;
}

/**
 * List expense reports with filtering and pagination
 *
 * v1.5 Feature: Full expense report tracking
 * - Queries from finance.expense_reports table
 * - Joins with expense_items for item counts
 * - RLS policies filter based on user role
 *
 * RLS automatically enforces:
 * - Employees can see their own reports
 * - Managers can see reports from their team
 * - Finance roles can see all reports
 * - Executives can see all reports
 */
export async function listExpenseReports(
  input: ListExpenseReportsInput,
  userContext: UserContext
): Promise<MCPToolResponse<ExpenseReportSummary[]>> {
  return withErrorHandling('list_expense_reports', async () => {
    // Validate input
    const validated = ListExpenseReportsInputSchema.parse(input);
    const { status, employeeId, department, startDate, endDate, limit, cursor } = validated;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Build dynamic WHERE clauses
    const whereClauses: string[] = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClauses.push(`er.status = $${paramIndex++}`);
      values.push(status);
    }

    if (employeeId) {
      whereClauses.push(`er.employee_id = $${paramIndex++}`);
      values.push(employeeId);
    }

    if (department) {
      whereClauses.push(`er.department_code = $${paramIndex++}`);
      values.push(department);
    }

    if (startDate) {
      whereClauses.push(`er.submission_date >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`er.submission_date <= $${paramIndex++}`);
      values.push(endDate);
    }

    // Cursor-based pagination: add WHERE clause to start after cursor position
    if (cursorData) {
      whereClauses.push(`(
        (er.submission_date IS NOT NULL AND er.submission_date < $${paramIndex}) OR
        (er.submission_date IS NULL AND $${paramIndex} IS NOT NULL) OR
        (er.submission_date IS NOT DISTINCT FROM $${paramIndex} AND er.created_at < $${paramIndex + 1}) OR
        (er.submission_date IS NOT DISTINCT FROM $${paramIndex} AND er.created_at = $${paramIndex + 1} AND er.id < $${paramIndex + 2})
      )`);
      values.push(cursorData.submissionDate, cursorData.createdAt, cursorData.id);
      paramIndex += 3;
    }

    const whereClause = whereClauses.join(' AND ');

    try {
      // v1.5: Query with LIMIT + 1 to detect truncation
      const queryLimit = limit + 1;

      const result = await queryWithRLS<ExpenseReportSummary>(
        userContext,
        `
        SELECT
          er.id,
          er.report_number,
          er.employee_id,
          NULL as employee_name,  -- Would join with HR in production
          er.department_code,
          er.title,
          er.total_amount::numeric as total_amount,
          er.status::text as status,
          er.submission_date::text as submission_date,
          er.created_at::text as created_at,
          (SELECT COUNT(*) FROM finance.expense_items ei WHERE ei.expense_report_id = er.id) as item_count
        FROM finance.expense_reports er
        WHERE ${whereClause}
        ORDER BY COALESCE(er.submission_date, er.created_at::date) DESC, er.created_at DESC, er.id DESC
        LIMIT $${paramIndex}
        `,
        [...values, queryLimit]
      );

      // Check if more records exist
      const hasMore = result.rowCount! > limit;
      const reports = hasMore
        ? result.rows.slice(0, limit)
        : result.rows;

      // Build pagination metadata
      let metadata: PaginationMetadata | undefined;

      if (hasMore || cursorData) {
        const lastReport = reports[reports.length - 1];

        metadata = {
          hasMore,
          returnedCount: reports.length,
          ...(hasMore && lastReport && {
            nextCursor: encodeCursor({
              submissionDate: lastReport.submission_date,
              createdAt: lastReport.created_at,
              id: lastReport.id,
            }),
            totalEstimate: `${limit}+`,
            hint: `To see more expense reports, say "show next page" or "get more reports". You can filter by status (DRAFT, SUBMITTED, APPROVED, REJECTED, REIMBURSED), employee, or department.`,
          }),
        };
      }

      return createSuccessResponse(reports, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_expense_reports');
    }
  }) as Promise<MCPToolResponse<ExpenseReportSummary[]>>;
}
