/**
 * List Expense Reports Tool
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
import { UserContext } from '../database/connection';
import { MCPToolResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';

/**
 * Input schema for list_expense_reports tool
 */
export const ListExpenseReportsInputSchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']).optional(),
  employeeId: z.string().uuid('Employee ID must be a valid UUID').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export type ListExpenseReportsInput = z.infer<typeof ListExpenseReportsInputSchema>;

/**
 * Expense report summary for list view
 */
export interface ExpenseReportSummary {
  report_id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  report_date: string;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
}

/**
 * List expense reports with filtering and pagination
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
    // Return NOT_IMPLEMENTED error
    return {
      status: 'error',
      code: 'NOT_IMPLEMENTED',
      message: 'Expense report tracking is not available in v1.3 schema',
      suggestedAction: 'The finance.expense_reports table does not exist in v1.3. This feature requires new tables and RLS policies in v1.5+. Use list_invoices to view vendor payments or check financial_reports for company-wide financial data.',
      details: {
        operation: 'list_expense_reports',
        reason: 'Schema mismatch - v1.3 has no expense tracking functionality',
        documentation: 'See Lesson 4 in docs/development/lessons-learned.md',
        requiredTables: ['finance.expense_reports', 'finance.expense_line_items'],
        currentTable: 'finance.financial_reports',
        semanticMismatch: 'financial_reports contains company summaries, not employee expenses',
      },
    } as MCPToolResponse<ExpenseReportSummary[]>;
  }) as Promise<MCPToolResponse<ExpenseReportSummary[]>>;
}
