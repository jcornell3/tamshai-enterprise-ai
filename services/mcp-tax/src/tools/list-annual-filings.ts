/**
 * List Annual Filings Tool
 *
 * Returns annual tax filings (1099s, W-2s, etc.) with optional filters.
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
export const ListAnnualFilingsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  year: z.number().min(2020).max(2100).optional(),
  filingType: z.string().optional(), // 1099, W-2, 941, etc.
  status: z.enum(['draft', 'filed', 'accepted', 'rejected', 'amended']).optional(),
  entityName: z.string().optional(),
});

export type ListAnnualFilingsInput = z.infer<typeof ListAnnualFilingsInputSchema>;

// Annual filing record type
export interface AnnualFiling {
  filing_id: string;
  year: number;
  filing_type: string;
  entity_name: string;
  entity_id: string | null;
  total_amount: number;
  filing_date: string | null;
  due_date: string;
  status: string;
  confirmation_number: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

/**
 * List annual filings with pagination and filters.
 */
export async function listAnnualFilings(
  input: ListAnnualFilingsInput,
  userContext: UserContext
): Promise<MCPToolResponse<AnnualFiling[]>> {
  return withErrorHandling('list_annual_filings', async () => {
    const validatedInput = ListAnnualFilingsInputSchema.parse(input);
    const { limit, cursor, year, filingType, status, entityName } = validatedInput;

    logger.debug('Listing annual filings', { limit, year, filingType, status, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (year) {
      conditions.push(`year = $${paramIndex++}`);
      values.push(year);
    }

    if (filingType) {
      conditions.push(`filing_type = $${paramIndex++}`);
      values.push(filingType.toUpperCase());
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (entityName) {
      conditions.push(`entity_name ILIKE $${paramIndex++}`);
      values.push(`%${entityName}%`);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(due_date, filing_id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        filing_id,
        year,
        filing_type,
        entity_name,
        entity_id,
        total_amount,
        filing_date,
        due_date,
        status,
        confirmation_number,
        rejection_reason,
        notes
      FROM tax.annual_filings
      ${whereClause}
      ORDER BY due_date DESC, filing_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<AnnualFiling>(userContext, query, values);

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
          sortKey: lastRecord!.due_date,
          id: lastRecord!.filing_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed annual filings', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
