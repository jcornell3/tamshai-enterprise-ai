/**
 * Get Expense Report Tool
 *
 * ⚠️ NOT IMPLEMENTED IN v1.3 SCHEMA ⚠️
 *
 * The v1.3 finance schema does not have expense tracking functionality.
 * The spec assumed a finance.expense_reports table that doesn't exist.
 * The actual finance.financial_reports table serves a different purpose
 * (company-wide financial summaries, not employee expense claims).
 *
 * This tool returns a NOT_IMPLEMENTED error explaining the limitation.
 *
 * See: Lesson 4 in docs/development/lessons-learned.md
 *
 * To implement this feature in v1.5+:
 * - Create finance.expense_reports table with columns:
 *   - report_id (uuid PK)
 *   - employee_id (uuid FK to hr.employees.id)
 *   - report_date (date)
 *   - total_amount (numeric)
 *   - currency (varchar)
 *   - status (enum: draft, submitted, approved, rejected, paid)
 *   - purpose (text)
 *   - approved_by (uuid FK to hr.employees.id)
 *   - approved_at (timestamp)
 * - Create finance.expense_line_items table for individual expenses
 * - Implement RLS policies for employee/manager/finance access
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
    // Return NOT_IMPLEMENTED error
    return {
      status: 'error',
      code: 'NOT_IMPLEMENTED',
      message: 'Expense report tracking is not available in v1.3 schema',
      suggestedAction: 'The finance.expense_reports table does not exist in v1.3. This feature requires new tables and RLS policies in v1.5+. Use list_invoices to view vendor payments or check financial_reports for company-wide financial data.',
      details: {
        operation: 'get_expense_report',
        reason: 'Schema mismatch - v1.3 has no expense tracking functionality',
        documentation: 'See Lesson 4 in docs/development/lessons-learned.md',
        requiredTables: ['finance.expense_reports', 'finance.expense_line_items'],
        currentTable: 'finance.financial_reports',
        semanticMismatch: 'financial_reports contains company summaries, not employee expenses',
      },
    } as MCPToolResponse<ExpenseReport>;
  }) as Promise<MCPToolResponse<ExpenseReport>>;
}
