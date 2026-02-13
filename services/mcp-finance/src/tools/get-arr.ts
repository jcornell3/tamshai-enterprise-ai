/**
 * Get ARR Tool
 *
 * Retrieves current ARR (Annual Recurring Revenue) metrics snapshot.
 * Returns key SaaS metrics: ARR, MRR, NRR, GRR, ARPU, and subscription count.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for get_arr tool (no required inputs)
 */
export const GetArrInputSchema = z.object({
  asOfDate: z.string().optional(), // Optional: specific date snapshot (YYYY-MM-DD)
});

export type GetArrInput = z.input<typeof GetArrInputSchema>;

/**
 * ARR metrics structure
 */
export interface ARRMetrics {
  arr: number;
  mrr: number;
  net_new_arr: number;
  gross_revenue_retention: number;
  net_revenue_retention: number;
  arpu: number;
  active_subscriptions: number;
  as_of_date: string;
}

/**
 * Get current ARR metrics
 *
 * RLS automatically enforces:
 * - Finance roles can see ARR metrics
 * - Executives can see ARR metrics
 */
export async function getArr(
  input: GetArrInput,
  userContext: UserContext
): Promise<MCPToolResponse<ARRMetrics>> {
  return withErrorHandling('get_arr', async () => {
    const { asOfDate } = GetArrInputSchema.parse(input);

    try {
      let query: string;
      let values: any[];

      if (asOfDate) {
        // Get metrics for specific date
        query = `
          SELECT
            arr,
            mrr,
            net_new_arr,
            gross_revenue_retention,
            net_revenue_retention,
            arpu,
            active_subscriptions,
            as_of_date::text
          FROM finance.arr_metrics
          WHERE as_of_date = $1
          ORDER BY as_of_date DESC
          LIMIT 1
        `;
        values = [asOfDate];
      } else {
        // Get most recent metrics
        query = `
          SELECT
            arr,
            mrr,
            net_new_arr,
            gross_revenue_retention,
            net_revenue_retention,
            arpu,
            active_subscriptions,
            as_of_date::text
          FROM finance.arr_metrics
          ORDER BY as_of_date DESC
          LIMIT 1
        `;
        values = [];
      }

      const result = await queryWithRLS<ARRMetrics>(userContext, query, values);

      if (result.rows.length === 0) {
        return {
          status: 'error',
          code: 'NO_ARR_DATA',
          message: asOfDate
            ? `No ARR metrics found for date ${asOfDate}`
            : 'No ARR metrics found in the system',
          suggestedAction: 'Verify that ARR metrics have been loaded into the finance database.',
        };
      }

      const metrics = result.rows[0];

      // Convert numeric strings to numbers for proper formatting
      const formattedMetrics: ARRMetrics = {
        arr: Number(metrics.arr),
        mrr: Number(metrics.mrr),
        net_new_arr: Number(metrics.net_new_arr),
        gross_revenue_retention: Number(metrics.gross_revenue_retention),
        net_revenue_retention: Number(metrics.net_revenue_retention),
        arpu: Number(metrics.arpu),
        active_subscriptions: Number(metrics.active_subscriptions),
        as_of_date: metrics.as_of_date,
      };

      return createSuccessResponse(formattedMetrics);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_arr');
    }
  }) as Promise<MCPToolResponse<ARRMetrics>>;
}
