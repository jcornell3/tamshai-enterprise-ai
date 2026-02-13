/**
 * List Contractors Tool
 *
 * Returns paginated list of 1099 contractors.
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
export const ListContractorsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).optional(),
  search: z.string().max(100).optional(), // Search by name or company
});

export type ListContractorsInput = z.infer<typeof ListContractorsInputSchema>;

// Contractor record type
export interface Contractor {
  contractor_id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  tax_id_last_four: string; // Only last 4 digits for security
  status: string;
  payment_method: string;
  hourly_rate: number | null;
  contract_start_date: string;
  contract_end_date: string | null;
  ytd_payments: number;
  created_at: string;
}

/**
 * List contractors with pagination and filters.
 */
export async function listContractors(
  input: ListContractorsInput,
  userContext: UserContext
): Promise<MCPToolResponse<Contractor[]>> {
  return withErrorHandling('list_contractors', async () => {
    const validatedInput = ListContractorsInputSchema.parse(input);
    const { limit, cursor, status, search } = validatedInput;

    logger.debug('Listing contractors', { limit, status, search, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`(
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex} OR
        company_name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex}
      )`);
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(last_name, first_name, contractor_id) > ($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, '', decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        contractor_id,
        first_name,
        last_name,
        company_name,
        email,
        phone,
        RIGHT(tax_id, 4) AS tax_id_last_four,
        status,
        payment_method,
        hourly_rate,
        contract_start_date,
        contract_end_date,
        ytd_payments,
        created_at
      FROM payroll.contractors
      ${whereClause}
      ORDER BY last_name, first_name, contractor_id
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<Contractor>(userContext, query, values);

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
          sortKey: lastRecord.last_name,
          id: lastRecord.contractor_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed contractors', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
