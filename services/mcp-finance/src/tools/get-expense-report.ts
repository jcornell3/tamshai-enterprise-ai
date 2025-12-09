/**
 * Get Expense Report Tool
 *
 * Retrieves a single expense report by ID with RLS enforcement.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleExpenseReportNotFound,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for get_expense_report tool
 */
export const GetExpenseReportInputSchema = z.object({
  reportId: z.string().uuid('Report ID must be a valid UUID'),
});

export type GetExpenseReportInput = z.infer<typeof GetExpenseReportInputSchema>;

/**
 * Expense report data structure
 */
export interface ExpenseReport {
  report_id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  report_date: string;
  total_amount: number;
  currency: string;
  status: string;
  purpose: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get a single expense report by ID
 *
 * RLS automatically enforces:
 * - Employees can see their own reports
 * - Managers can see reports from their team
 * - Finance roles can see all reports
 * - Executives can see all reports
 */
export async function getExpenseReport(
  input: GetExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse<ExpenseReport>> {
  return withErrorHandling('get_expense_report', async () => {
    // Validate input
    const { reportId } = GetExpenseReportInputSchema.parse(input);

    try {
      // Query with RLS enforcement
      const result = await queryWithRLS<ExpenseReport>(
        userContext,
        `
        SELECT
          er.report_id,
          er.employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          e.department,
          er.report_date::text as report_date,
          er.total_amount,
          er.currency,
          er.status,
          er.purpose,
          er.approved_by,
          er.approved_at::text as approved_at,
          er.created_at::text as created_at,
          er.updated_at::text as updated_at
        FROM finance.expense_reports er
        JOIN hr.employees e ON er.employee_id = e.employee_id
        WHERE er.report_id = $1
        `,
        [reportId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      return createSuccessResponse(result.rows[0]);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_expense_report');
    }
  }) as Promise<MCPToolResponse<ExpenseReport>>;
}
