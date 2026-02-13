/**
 * List Quarterly Estimates Tool
 *
 * Returns quarterly tax estimates with optional filters.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  encodeCursor,
  decodeCursor,
  PaginationMetadata,
} from '../types/response';
import { withErrorHandling, handleInvalidInput } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const ListQuarterlyEstimatesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  year: z.number().min(2020).max(2100).optional(),
  quarter: z.number().min(1).max(4).optional(),
  status: z.enum(['pending', 'paid', 'overdue', 'partial']).optional(),
});

export type ListQuarterlyEstimatesInput = z.infer<typeof ListQuarterlyEstimatesInputSchema>;

// Quarterly estimate record type
export interface QuarterlyEstimate {
  estimate_id: string;
  year: number;
  quarter: number;
  federal_estimate: number;
  state_estimate: number;
  local_estimate: number;
  total_estimate: number;
  due_date: string;
  status: string;
  paid_amount: number;
  paid_date: string | null;
  payment_reference: string | null;
  notes: string | null;
}

/**
 * List quarterly estimates with pagination and filters.
 */
export async function listQuarterlyEstimates(
  input: ListQuarterlyEstimatesInput,
  userContext: UserContext
): Promise<MCPToolResponse<QuarterlyEstimate[]>> {
  return withErrorHandling('list_quarterly_estimates', async () => {
    const validatedInput = ListQuarterlyEstimatesInputSchema.parse(input);
    const { limit, cursor, year, quarter, status } = validatedInput;

    logger.debug('Listing quarterly estimates', { limit, year, quarter, status, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (year) {
      conditions.push(`year = $${paramIndex++}`);
      values.push(year);
    }

    if (quarter) {
      conditions.push(`quarter = $${paramIndex++}`);
      values.push(quarter);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(year, quarter, estimate_id) < ($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      const sortParts = String(decodedCursor.sortKey).split('-');
      values.push(sortParts[0], sortParts[1], decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        estimate_id,
        year,
        quarter,
        federal_estimate,
        state_estimate,
        local_estimate,
        total_estimate,
        due_date,
        status,
        paid_amount,
        paid_date,
        payment_reference,
        notes
      FROM tax.quarterly_estimates
      ${whereClause}
      ORDER BY year DESC, quarter DESC, estimate_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<QuarterlyEstimate>(userContext, query, values);

    // Determine if there are more records
    const hasMore = result.rowCount! > limit;
    const records = hasMore ? result.rows.slice(0, limit) : result.rows;

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;
    if (hasMore && records.length > 0) {
      const lastRecord = records[records.length - 1];
      metadata = {
        hasMore: true,
        nextCursor: encodeCursor({
          sortKey: `${lastRecord!.year}-${lastRecord!.quarter}`,
          id: lastRecord!.estimate_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed quarterly estimates', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
