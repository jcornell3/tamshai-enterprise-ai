/**
 * List State Registrations Tool
 *
 * Returns state tax registrations with optional filters.
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
export const ListStateRegistrationsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  stateCode: z.string().length(2).optional(),
  registrationType: z.enum(['sales_tax', 'income_tax', 'franchise_tax', 'unemployment']).optional(),
  status: z.enum(['active', 'pending', 'expired', 'suspended', 'revoked']).optional(),
});

export type ListStateRegistrationsInput = z.infer<typeof ListStateRegistrationsInputSchema>;

// State registration record type
export interface StateRegistration {
  registration_id: string;
  state: string;
  state_code: string;
  registration_type: string;
  registration_number: string;
  registration_date: string;
  expiration_date: string | null;
  status: string;
  filing_frequency: string;
  next_filing_due: string | null;
  account_representative: string | null;
  notes: string | null;
}

/**
 * List state registrations with pagination and filters.
 */
export async function listStateRegistrations(
  input: ListStateRegistrationsInput,
  userContext: UserContext
): Promise<MCPToolResponse<StateRegistration[]>> {
  return withErrorHandling('list_state_registrations', async () => {
    const validatedInput = ListStateRegistrationsInputSchema.parse(input);
    const { limit, cursor, stateCode, registrationType, status } = validatedInput;

    logger.debug('Listing state registrations', { limit, stateCode, registrationType, status, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (stateCode) {
      conditions.push(`state_code = $${paramIndex++}`);
      values.push(stateCode.toUpperCase());
    }

    if (registrationType) {
      conditions.push(`registration_type = $${paramIndex++}`);
      values.push(registrationType);
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
      conditions.push(`(state_code, registration_id) > ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        registration_id,
        state,
        state_code,
        registration_type,
        registration_number,
        registration_date,
        expiration_date,
        status,
        filing_frequency,
        next_filing_due,
        account_representative,
        notes
      FROM tax.state_registrations
      ${whereClause}
      ORDER BY state_code ASC, registration_id ASC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<StateRegistration>(userContext, query, values);

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
          id: lastRecord!.registration_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed state registrations', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
