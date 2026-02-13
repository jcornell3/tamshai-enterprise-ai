/**
 * Get Tax Summary Tool
 *
 * Returns aggregated tax summary for the current year.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetTaxSummaryInputSchema = z.object({
  year: z.number().min(2020).max(2100).optional(),
});

export type GetTaxSummaryInput = z.infer<typeof GetTaxSummaryInputSchema>;

// Tax summary response type
export interface TaxSummary {
  currentYear: number;
  currentQuarter: number;
  totalTaxLiability: number;
  paidToDate: number;
  remainingBalance: number;
  upcomingDeadlines: Array<{
    description: string;
    dueDate: string;
    amount: number;
  }>;
  stateBreakdown: Array<{
    state: string;
    liability: number;
    paid: number;
  }>;
  recentFilings: Array<{
    id: string;
    year: number;
    filingType: string;
    entityName: string;
    entityId: string;
    totalAmount: number;
    filingDate: string;
    dueDate: string;
    status: string;
    confirmationNumber: string | null;
  }>;
  complianceStatus: 'compliant' | 'at_risk' | 'non_compliant';
}

/**
 * Get aggregated tax summary.
 */
export async function getTaxSummary(
  input: GetTaxSummaryInput,
  userContext: UserContext
): Promise<MCPToolResponse<TaxSummary>> {
  return withErrorHandling('get_tax_summary', async () => {
    const validatedInput = GetTaxSummaryInputSchema.parse(input);
    const year = validatedInput.year || new Date().getFullYear();
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

    logger.debug('Getting tax summary', { year, userId: userContext.userId });

    // Get quarterly estimates summary
    const estimatesQuery = `
      SELECT
        COALESCE(SUM(total_estimate), 0) as total_liability,
        COALESCE(SUM(paid_amount), 0) as paid_to_date
      FROM tax.quarterly_estimates
      WHERE year = $1
    `;
    const estimatesResult = await queryWithRLS<{ total_liability: number; paid_to_date: number }>(
      userContext,
      estimatesQuery,
      [year]
    );

    const totalLiability = Number(estimatesResult.rows[0]?.total_liability || 0);
    const paidToDate = Number(estimatesResult.rows[0]?.paid_to_date || 0);

    // Get upcoming deadlines
    const deadlinesQuery = `
      SELECT
        title as description,
        due_date,
        0 as amount
      FROM tax.calendar_events
      WHERE due_date >= CURRENT_DATE
        AND status = 'pending'
      ORDER BY due_date ASC
      LIMIT 5
    `;
    const deadlinesResult = await queryWithRLS<{ description: string; due_date: string; amount: number }>(
      userContext,
      deadlinesQuery,
      []
    );

    // Get state breakdown from registrations
    const stateQuery = `
      SELECT
        state,
        COUNT(*) as registration_count
      FROM tax.state_registrations
      WHERE status = 'active'
      GROUP BY state
      ORDER BY state
    `;
    const stateResult = await queryWithRLS<{ state: string; registration_count: number }>(
      userContext,
      stateQuery,
      []
    );

    // Get recent filings
    const filingsQuery = `
      SELECT
        filing_id as id,
        year,
        filing_type,
        entity_name,
        entity_id,
        total_amount,
        filing_date,
        due_date,
        status,
        confirmation_number
      FROM tax.annual_filings
      WHERE year >= $1 - 1
      ORDER BY filing_date DESC NULLS LAST, due_date DESC
      LIMIT 5
    `;
    const filingsResult = await queryWithRLS<{
      id: string;
      year: number;
      filing_type: string;
      entity_name: string;
      entity_id: string;
      total_amount: number;
      filing_date: string | null;
      due_date: string;
      status: string;
      confirmation_number: string | null;
    }>(userContext, filingsQuery, [year]);

    // Determine compliance status
    const overdueQuery = `
      SELECT COUNT(*) as overdue_count
      FROM tax.quarterly_estimates
      WHERE year = $1
        AND status = 'overdue'
    `;
    const overdueResult = await queryWithRLS<{ overdue_count: string }>(
      userContext,
      overdueQuery,
      [year]
    );

    const overdueCount = parseInt(overdueResult.rows[0]?.overdue_count || '0', 10);
    let complianceStatus: 'compliant' | 'at_risk' | 'non_compliant' = 'compliant';
    if (overdueCount > 0) {
      complianceStatus = 'non_compliant';
    } else if (paidToDate < totalLiability * 0.8) {
      complianceStatus = 'at_risk';
    }

    const summary: TaxSummary = {
      currentYear: year,
      currentQuarter,
      totalTaxLiability: totalLiability,
      paidToDate,
      remainingBalance: totalLiability - paidToDate,
      upcomingDeadlines: deadlinesResult.rows.map((row) => ({
        description: row.description,
        dueDate: row.due_date,
        amount: Number(row.amount),
      })),
      stateBreakdown: stateResult.rows.map((row) => ({
        state: row.state,
        liability: 0, // Would need more complex calculation
        paid: 0,
      })),
      recentFilings: filingsResult.rows.map((row) => ({
        id: row.id,
        year: row.year,
        filingType: row.filing_type,
        entityName: row.entity_name,
        entityId: row.entity_id || '',
        totalAmount: Number(row.total_amount),
        filingDate: row.filing_date || '',
        dueDate: row.due_date,
        status: row.status,
        confirmationNumber: row.confirmation_number,
      })),
      complianceStatus,
    };

    logger.info('Got tax summary', {
      year,
      totalLiability,
      paidToDate,
      complianceStatus,
      userId: userContext.userId,
    });

    return createSuccessResponse(summary);
  });
}
