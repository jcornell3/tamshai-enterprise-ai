/**
 * Get Expense Report Tool (v1.5)
 *
 * Retrieves a single expense report by ID, including all line items.
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
 * Expense item structure (line items within a report)
 */
export interface ExpenseItem {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  receipt_url: string | null;
  receipt_required: boolean;
  receipt_uploaded: boolean;
  notes: string | null;
}

/**
 * Expense report data structure (with line items)
 */
export interface ExpenseReport {
  id: string;
  report_number: string;
  employee_id: string;
  employee_name: string | null;
  department_code: string;
  title: string;
  total_amount: number;
  status: string;
  submission_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  reimbursed_at: string | null;
  reimbursed_by: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items: ExpenseItem[];
}

/**
 * Get a single expense report by ID with all line items
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
      // Fetch the expense report
      const reportResult = await queryWithRLS<Omit<ExpenseReport, 'items'>>(
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
          er.submitted_at::text as submitted_at,
          er.approved_at::text as approved_at,
          er.approved_by::text as approved_by,
          er.rejected_at::text as rejected_at,
          er.rejected_by::text as rejected_by,
          er.rejection_reason,
          er.reimbursed_at::text as reimbursed_at,
          er.reimbursed_by::text as reimbursed_by,
          er.payment_reference,
          er.notes,
          er.created_at::text as created_at,
          er.updated_at::text as updated_at
        FROM finance.expense_reports er
        WHERE er.id = $1
        `,
        [reportId]
      );

      if (reportResult.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const report = reportResult.rows[0];

      // Fetch the line items for this report
      const itemsResult = await queryWithRLS<ExpenseItem>(
        userContext,
        `
        SELECT
          ei.id,
          ei.expense_date::text as expense_date,
          ei.category::text as category,
          ei.description,
          ei.vendor,
          ei.amount::numeric as amount,
          ei.currency,
          ei.receipt_url,
          ei.receipt_required,
          ei.receipt_uploaded,
          ei.notes
        FROM finance.expense_items ei
        WHERE ei.expense_report_id = $1
        ORDER BY ei.expense_date DESC, ei.created_at DESC
        `,
        [reportId]
      );

      // Combine report with items
      const fullReport: ExpenseReport = {
        ...report,
        items: itemsResult.rows,
      };

      return createSuccessResponse(fullReport);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_expense_report');
    }
  }) as Promise<MCPToolResponse<ExpenseReport>>;
}
