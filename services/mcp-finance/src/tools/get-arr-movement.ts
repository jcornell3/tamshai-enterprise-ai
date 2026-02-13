/**
 * Get ARR Movement Tool
 *
 * Retrieves ARR movement (waterfall) data showing monthly changes in ARR.
 * Shows new ARR, expansion, churn, and contraction for trending analysis.
 * Read-only operation accessible to finance-read, finance-write, and executive roles.
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
 * Input schema for get_arr_movement tool
 */
export const GetArrMovementInputSchema = z.object({
  year: z.number().optional(), // Filter by year (e.g., 2026)
  months: z.number().min(1).max(24).optional().default(12), // Number of months to return
});

export type GetArrMovementInput = z.input<typeof GetArrMovementInputSchema>;

/**
 * ARR movement structure (monthly waterfall)
 */
export interface ARRMovement {
  period: string;
  period_label: string;
  starting_arr: number;
  new_arr: number;
  expansion_arr: number;
  churn_arr: number;
  contraction_arr: number;
  net_new_arr: number;
  ending_arr: number;
}

/**
 * Get ARR movement (waterfall) data
 *
 * RLS automatically enforces:
 * - Finance roles can see ARR movement
 * - Executives can see ARR movement
 */
export async function getArrMovement(
  input: GetArrMovementInput,
  userContext: UserContext
): Promise<MCPToolResponse<ARRMovement[]>> {
  return withErrorHandling('get_arr_movement', async () => {
    const { year, months } = GetArrMovementInputSchema.parse(input);

    try {
      const whereClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (year) {
        whereClauses.push(`period LIKE $${paramIndex++} || '-%'`);
        values.push(year.toString());
      }

      const whereClause = whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')}`
        : '';

      const query = `
        SELECT
          period,
          period_label,
          starting_arr,
          new_arr,
          expansion_arr,
          churn_arr,
          contraction_arr,
          net_new_arr,
          ending_arr
        FROM finance.arr_movement
        ${whereClause}
        ORDER BY period DESC
        LIMIT $${paramIndex}
      `;

      const result = await queryWithRLS<ARRMovement>(
        userContext,
        query,
        [...values, months + 1]
      );

      const hasMore = result.rows.length > months;
      const movements = hasMore ? result.rows.slice(0, months) : result.rows;

      // Convert numeric strings to numbers
      const formattedMovements: ARRMovement[] = movements.map(m => ({
        period: m.period,
        period_label: m.period_label,
        starting_arr: Number(m.starting_arr),
        new_arr: Number(m.new_arr),
        expansion_arr: Number(m.expansion_arr),
        churn_arr: Number(m.churn_arr),
        contraction_arr: Number(m.contraction_arr),
        net_new_arr: Number(m.net_new_arr),
        ending_arr: Number(m.ending_arr),
      }));

      // Calculate summary statistics
      const totals = formattedMovements.reduce(
        (acc, m) => ({
          totalNewArr: acc.totalNewArr + m.new_arr,
          totalExpansion: acc.totalExpansion + m.expansion_arr,
          totalChurn: acc.totalChurn + m.churn_arr,
          totalContraction: acc.totalContraction + m.contraction_arr,
          totalNetNew: acc.totalNetNew + m.net_new_arr,
        }),
        { totalNewArr: 0, totalExpansion: 0, totalChurn: 0, totalContraction: 0, totalNetNew: 0 }
      );

      const metadata: PaginationMetadata = {
        returnedCount: formattedMovements.length,
        totalEstimate: hasMore ? `${months}+` : formattedMovements.length.toString(),
        hasMore,
      };

      if (hasMore) {
        metadata.hint = `Only showing ${months} months of data. Increase 'months' parameter to see more.`;
      }

      // Add summary to metadata
      (metadata as any).summary = {
        periodsCovered: formattedMovements.length,
        totalNewArr: totals.totalNewArr,
        totalExpansion: totals.totalExpansion,
        totalChurn: totals.totalChurn,
        totalContraction: totals.totalContraction,
        totalNetNewArr: totals.totalNetNew,
        avgMonthlyNetNewArr: formattedMovements.length > 0
          ? Math.round(totals.totalNetNew / formattedMovements.length)
          : 0,
      };

      return createSuccessResponse(formattedMovements, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_arr_movement');
    }
  }) as Promise<MCPToolResponse<ARRMovement[]>>;
}
