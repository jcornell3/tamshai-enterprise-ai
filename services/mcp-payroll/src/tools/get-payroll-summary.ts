/**
 * Get Payroll Summary Tool
 *
 * Returns aggregated payroll statistics for dashboard display.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetPayrollSummaryInputSchema = z.object({
  year: z.number().min(2000).max(2100).optional(), // Defaults to current year
  month: z.number().min(1).max(12).optional(), // If not provided, returns full year
});

export type GetPayrollSummaryInput = z.infer<typeof GetPayrollSummaryInputSchema>;

// Payroll summary type
export interface PayrollSummary {
  period: string;
  total_gross_pay: number;
  total_net_pay: number;
  total_taxes: number;
  total_deductions: number;
  total_employer_taxes: number;
  total_employer_benefits: number;
  employee_count: number;
  contractor_count: number;
  pay_run_count: number;
  pending_pay_runs: number;
  next_pay_date: string | null;
  ytd_totals: {
    gross_pay: number;
    net_pay: number;
    taxes: number;
    deductions: number;
  };
}

/**
 * Get payroll summary statistics.
 */
export async function getPayrollSummary(
  input: GetPayrollSummaryInput,
  userContext: UserContext
): Promise<MCPToolResponse<PayrollSummary>> {
  return withErrorHandling('get_payroll_summary', async () => {
    const validatedInput = GetPayrollSummaryInputSchema.parse(input);
    const year = validatedInput.year || new Date().getFullYear();
    const month = validatedInput.month;

    logger.debug('Getting payroll summary', { year, month, userId: userContext.userId });

    // Build date range filter
    let dateFilter: string;
    let periodLabel: string;
    const values: unknown[] = [];

    if (month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      dateFilter = 'pay_date >= $1 AND pay_date <= $2';
      values.push(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
      periodLabel = `${year}-${month.toString().padStart(2, '0')}`;
    } else {
      dateFilter = "EXTRACT(YEAR FROM pay_date) = $1";
      values.push(year);
      periodLabel = `${year}`;
    }

    // Get period summary
    const summaryQuery = `
      SELECT
        COALESCE(SUM(total_gross), 0) AS total_gross_pay,
        COALESCE(SUM(total_net), 0) AS total_net_pay,
        COALESCE(SUM(total_taxes), 0) AS total_taxes,
        COALESCE(SUM(total_deductions), 0) AS total_deductions,
        COALESCE(SUM(employer_taxes), 0) AS total_employer_taxes,
        COALESCE(SUM(employer_benefits), 0) AS total_employer_benefits,
        COUNT(*) AS pay_run_count
      FROM payroll.pay_runs
      WHERE ${dateFilter}
        AND status = 'PROCESSED'
    `;

    const summaryResult = await queryWithRLS<{
      total_gross_pay: string;
      total_net_pay: string;
      total_taxes: string;
      total_deductions: string;
      total_employer_taxes: string;
      total_employer_benefits: string;
      pay_run_count: string;
    }>(userContext, summaryQuery, values);

    // Get employee count
    const employeeCountQuery = `
      SELECT COUNT(*) AS count
      FROM payroll.employees
      WHERE status = 'ACTIVE'
    `;
    const employeeResult = await queryWithRLS<{ count: string }>(
      userContext,
      employeeCountQuery,
      []
    );

    // Get contractor count
    const contractorCountQuery = `
      SELECT COUNT(*) AS count
      FROM payroll.contractors
      WHERE status = 'ACTIVE'
    `;
    const contractorResult = await queryWithRLS<{ count: string }>(
      userContext,
      contractorCountQuery,
      []
    );

    // Get pending pay runs
    const pendingQuery = `
      SELECT COUNT(*) AS count
      FROM payroll.pay_runs
      WHERE status IN ('DRAFT', 'PENDING', 'APPROVED')
    `;
    const pendingResult = await queryWithRLS<{ count: string }>(userContext, pendingQuery, []);

    // Get next pay date
    const nextPayDateQuery = `
      SELECT pay_date
      FROM payroll.pay_runs
      WHERE status IN ('DRAFT', 'PENDING', 'APPROVED')
        AND pay_date >= CURRENT_DATE
      ORDER BY pay_date
      LIMIT 1
    `;
    const nextPayDateResult = await queryWithRLS<{ pay_date: string }>(
      userContext,
      nextPayDateQuery,
      []
    );

    // Get YTD totals
    const ytdQuery = `
      SELECT
        COALESCE(SUM(total_gross), 0) AS gross_pay,
        COALESCE(SUM(total_net), 0) AS net_pay,
        COALESCE(SUM(total_taxes), 0) AS taxes,
        COALESCE(SUM(total_deductions), 0) AS deductions
      FROM payroll.pay_runs
      WHERE EXTRACT(YEAR FROM pay_date) = $1
        AND status = 'PROCESSED'
    `;
    const ytdResult = await queryWithRLS<{
      gross_pay: string;
      net_pay: string;
      taxes: string;
      deductions: string;
    }>(userContext, ytdQuery, [year]);

    const summary = summaryResult.rows[0];
    const ytd = ytdResult.rows[0];

    const payrollSummary: PayrollSummary = {
      period: periodLabel,
      total_gross_pay: parseFloat(summary.total_gross_pay),
      total_net_pay: parseFloat(summary.total_net_pay),
      total_taxes: parseFloat(summary.total_taxes),
      total_deductions: parseFloat(summary.total_deductions),
      total_employer_taxes: parseFloat(summary.total_employer_taxes),
      total_employer_benefits: parseFloat(summary.total_employer_benefits),
      employee_count: parseInt(employeeResult.rows[0].count, 10),
      contractor_count: parseInt(contractorResult.rows[0].count, 10),
      pay_run_count: parseInt(summary.pay_run_count, 10),
      pending_pay_runs: parseInt(pendingResult.rows[0].count, 10),
      next_pay_date: nextPayDateResult.rows[0]?.pay_date || null,
      ytd_totals: {
        gross_pay: parseFloat(ytd.gross_pay),
        net_pay: parseFloat(ytd.net_pay),
        taxes: parseFloat(ytd.taxes),
        deductions: parseFloat(ytd.deductions),
      },
    };

    logger.info('Retrieved payroll summary', {
      period: periodLabel,
      userId: userContext.userId,
    });

    return createSuccessResponse(payrollSummary);
  });
}
