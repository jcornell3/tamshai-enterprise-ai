/**
 * Get Quarterly Report Tool
 *
 * Retrieves quarterly financial report with KPIs, ARR waterfall, and highlights.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import {
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * KPI unit types
 */
export type KPIUnit = 'currency' | 'percentage' | 'number';

/**
 * KPI data structure
 */
export interface KPI {
  name: string;
  value: number;
  change: number;
  target?: number;
  unit: KPIUnit;
}

/**
 * Waterfall item types
 */
export type WaterfallType = 'start' | 'increase' | 'decrease' | 'end';

/**
 * Waterfall chart item
 */
export interface WaterfallItem {
  label: string;
  value: number;
  type: WaterfallType;
}

/**
 * Quarterly report data structure
 */
export interface QuarterlyReport {
  quarter: string;
  year: number;
  revenue: number;
  expenses: number;
  profit: number;
  kpis: KPI[];
  arrWaterfall: WaterfallItem[];
  highlights: string[];
}

/**
 * Input schema for get_quarterly_report tool
 */
export const GetQuarterlyReportInputSchema = z.object({
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  year: z.number().int().min(2020).max(2030).optional(),
});

export type GetQuarterlyReportInput = z.input<typeof GetQuarterlyReportInputSchema>;

/**
 * Calculate percentage change between two values
 */
function calculateChange(current: number, previous: number | null): number {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Format currency for highlights
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Get quarterly financial report
 *
 * Returns comprehensive quarterly report with:
 * - Core financials (revenue, expenses, profit)
 * - KPI metrics with period-over-period changes
 * - ARR waterfall showing growth components
 * - Highlights summarizing key metrics
 *
 * RLS automatically enforces:
 * - Finance roles can see all data
 * - Executives can see all data
 * - Other roles are denied access
 */
export async function getQuarterlyReport(
  input: GetQuarterlyReportInput,
  userContext: UserContext
): Promise<MCPToolResponse<QuarterlyReport>> {
  return withErrorHandling('get_quarterly_report', async () => {
    // Validate input
    const validated = GetQuarterlyReportInputSchema.parse(input);

    // Default to current quarter if not specified
    const now = new Date();
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
    const currentYear = now.getFullYear();

    const quarter = validated.quarter || currentQuarter;
    const year = validated.year || currentYear;

    try {
      // Query quarterly metrics
      // Note: This assumes a quarterly_reports table exists
      // In a real implementation, this would aggregate from transactions/revenue tables
      const result = await queryWithRLS<any>(
        userContext,
        `
        SELECT
          $1::text as quarter,
          $2::int as year,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(SUM(expenses), 0) as expenses,
          COALESCE(SUM(revenue) - SUM(expenses), 0) as profit,
          COALESCE(AVG(mrr), 0) as mrr,
          COALESCE(MAX(arr), 0) as arr,
          COALESCE(AVG(churn_rate), 0) as churn_rate,
          COALESCE(AVG(nps), 0) as nps,
          -- Previous quarter metrics for comparison
          (SELECT COALESCE(SUM(revenue), 0) FROM finance.quarterly_metrics
           WHERE quarter_name = $3 AND fiscal_year = $4) as previous_quarter_revenue,
          (SELECT COALESCE(AVG(mrr), 0) FROM finance.quarterly_metrics
           WHERE quarter_name = $3 AND fiscal_year = $4) as previous_quarter_mrr,
          (SELECT COALESCE(AVG(churn_rate), 0) FROM finance.quarterly_metrics
           WHERE quarter_name = $3 AND fiscal_year = $4) as previous_quarter_churn,
          (SELECT COALESCE(AVG(nps), 0) FROM finance.quarterly_metrics
           WHERE quarter_name = $3 AND fiscal_year = $4) as previous_quarter_nps,
          -- ARR waterfall components
          COALESCE(MAX(arr_beginning), 0) as arr_beginning,
          COALESCE(SUM(arr_new_business), 0) as arr_new_business,
          COALESCE(SUM(arr_expansion), 0) as arr_expansion,
          COALESCE(SUM(arr_contraction), 0) as arr_contraction,
          COALESCE(SUM(arr_churn), 0) as arr_churn,
          COALESCE(MAX(arr_ending), 0) as arr_ending
        FROM finance.quarterly_metrics
        WHERE quarter_name = $1 AND fiscal_year = $2
        `,
        [
          quarter,
          year,
          // Previous quarter calculation
          quarter === 'Q1' ? 'Q4' : `Q${parseInt(quarter[1]) - 1}`,
          quarter === 'Q1' ? year - 1 : year,
        ]
      );

      if (result.rowCount === 0 || !result.rows[0] || result.rows[0].revenue === 0) {
        return createErrorResponse(
          'REPORT_NOT_FOUND',
          `No financial data found for ${quarter} ${year}`,
          'Check that the quarter and year are correct. Available quarters may vary by fiscal year.'
        );
      }

      const data = result.rows[0];

      // Build KPI metrics
      const kpis: KPI[] = [
        {
          name: 'Revenue',
          value: Number(data.revenue),
          change: calculateChange(Number(data.revenue), Number(data.previous_quarter_revenue)),
          unit: 'currency',
        },
        {
          name: 'MRR',
          value: Number(data.mrr),
          change: calculateChange(Number(data.mrr), Number(data.previous_quarter_mrr)),
          unit: 'currency',
        },
        {
          name: 'Churn',
          value: Number(data.churn_rate),
          change: calculateChange(Number(data.churn_rate), Number(data.previous_quarter_churn)),
          unit: 'percentage',
        },
        {
          name: 'NPS',
          value: Number(data.nps),
          change: calculateChange(Number(data.nps), Number(data.previous_quarter_nps)),
          unit: 'number',
        },
        {
          name: 'ARR',
          value: Number(data.arr),
          change: 0, // ARR change is shown in waterfall
          unit: 'currency',
        },
      ];

      // Build ARR waterfall
      const arrWaterfall: WaterfallItem[] = [
        { label: 'Beginning ARR', value: Number(data.arr_beginning), type: 'start' },
        { label: 'New Business', value: Number(data.arr_new_business), type: 'increase' },
        { label: 'Expansion', value: Number(data.arr_expansion), type: 'increase' },
        { label: 'Contraction', value: -Number(data.arr_contraction), type: 'decrease' },
        { label: 'Churn', value: -Number(data.arr_churn), type: 'decrease' },
        { label: 'Ending ARR', value: Number(data.arr_ending), type: 'end' },
      ];

      // Generate highlights
      const highlights: string[] = [];

      // Revenue highlight
      const revenueChange = calculateChange(Number(data.revenue), Number(data.previous_quarter_revenue));
      if (revenueChange > 0) {
        highlights.push(
          `Revenue grew ${revenueChange.toFixed(1)}% to ${formatCurrency(Number(data.revenue))}`
        );
      } else if (revenueChange < 0) {
        highlights.push(
          `Revenue declined ${Math.abs(revenueChange).toFixed(1)}% to ${formatCurrency(Number(data.revenue))}`
        );
      } else {
        highlights.push(`Revenue remained flat at ${formatCurrency(Number(data.revenue))}`);
      }

      // Profitability highlight
      const profitMargin = (Number(data.profit) / Number(data.revenue)) * 100;
      highlights.push(`Profit margin of ${profitMargin.toFixed(1)}% (${formatCurrency(Number(data.profit))})`);

      // ARR growth highlight
      const arrGrowth = Number(data.arr_ending) - Number(data.arr_beginning);
      if (arrGrowth > 0) {
        highlights.push(`ARR increased by ${formatCurrency(arrGrowth)} to ${formatCurrency(Number(data.arr_ending))}`);
      }

      // Churn highlight
      const churnChange = calculateChange(Number(data.churn_rate), Number(data.previous_quarter_churn));
      if (churnChange < 0) {
        highlights.push(`Churn improved by ${Math.abs(churnChange).toFixed(1)}% to ${Number(data.churn_rate).toFixed(1)}%`);
      } else if (Number(data.churn_rate) < 3) {
        highlights.push(`Churn rate maintained at healthy ${Number(data.churn_rate).toFixed(1)}%`);
      }

      // NPS highlight
      if (Number(data.nps) >= 50) {
        highlights.push(`Strong customer satisfaction with NPS of ${Number(data.nps)}`);
      }

      return createSuccessResponse({
        quarter,
        year,
        revenue: Number(data.revenue),
        expenses: Number(data.expenses),
        profit: Number(data.profit),
        kpis,
        arrWaterfall,
        highlights,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_quarterly_report');
    }
  }) as Promise<MCPToolResponse<QuarterlyReport>>;
}
