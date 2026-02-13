/**
 * List Sales Tax Rates Tool
 *
 * Returns sales tax rates by state with optional filters.
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
export const ListSalesTaxRatesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  stateCode: z.string().length(2).optional(),
  county: z.string().optional(),
  city: z.string().optional(),
});

export type ListSalesTaxRatesInput = z.infer<typeof ListSalesTaxRatesInputSchema>;

// Sales tax rate record type
export interface SalesTaxRate {
  rate_id: string;
  state: string;
  state_code: string;
  county: string | null;
  city: string | null;
  base_rate: number;
  local_rate: number;
  combined_rate: number;
  effective_date: string;
  end_date: string | null;
}

/**
 * List sales tax rates with pagination and filters.
 */
export async function listSalesTaxRates(
  input: ListSalesTaxRatesInput,
  userContext: UserContext
): Promise<MCPToolResponse<SalesTaxRate[]>> {
  return withErrorHandling('list_sales_tax_rates', async () => {
    const validatedInput = ListSalesTaxRatesInputSchema.parse(input);
    const { limit, cursor, stateCode, county, city } = validatedInput;

    logger.debug('Listing sales tax rates', { limit, stateCode, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (stateCode) {
      conditions.push(`state_code = $${paramIndex++}`);
      values.push(stateCode.toUpperCase());
    }

    if (county) {
      conditions.push(`county ILIKE $${paramIndex++}`);
      values.push(`%${county}%`);
    }

    if (city) {
      conditions.push(`city ILIKE $${paramIndex++}`);
      values.push(`%${city}%`);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(state_code, rate_id) > ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        rate_id,
        state,
        state_code,
        county,
        city,
        base_rate,
        local_rate,
        combined_rate,
        effective_date,
        end_date
      FROM tax.sales_tax_rates
      ${whereClause}
      ORDER BY state_code ASC, rate_id ASC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<SalesTaxRate>(userContext, query, values);

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
          sortKey: lastRecord!.state_code,
          id: lastRecord!.rate_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed sales tax rates', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
