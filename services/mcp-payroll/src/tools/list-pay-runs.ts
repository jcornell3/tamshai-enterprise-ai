/**
 * List Pay Runs Tool
 *
 * Returns paginated list of payroll runs with optional filters.
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
export const ListPayRunsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'PROCESSED', 'CANCELLED']).optional(),
  payPeriodStart: z.string().optional(), // ISO date
  payPeriodEnd: z.string().optional(), // ISO date
  payFrequency: z.enum(['WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY']).optional(),
});

export type ListPayRunsInput = z.infer<typeof ListPayRunsInputSchema>;

// Pay run record type
export interface PayRun {
  pay_run_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  pay_frequency: string;
  status: string;
  total_gross: number;
  total_net: number;
  total_taxes: number;
  total_deductions: number;
  employee_count: number;
  created_at: string;
  processed_at: string | null;
}

/**
 * List pay runs with pagination and filters.
 */
export async function listPayRuns(
  input: ListPayRunsInput,
  userContext: UserContext
): Promise<MCPToolResponse<PayRun[]>> {
  return withErrorHandling('list_pay_runs', async () => {
    const validatedInput = ListPayRunsInputSchema.parse(input);
    const { limit, cursor, status, payPeriodStart, payPeriodEnd, payFrequency } = validatedInput;

    logger.debug('Listing pay runs', { limit, status, payFrequency, userId: userContext.userId });

    // Build query with filters
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (payPeriodStart) {
      conditions.push(`pay_period_start >= $${paramIndex++}`);
      values.push(payPeriodStart);
    }

    if (payPeriodEnd) {
      conditions.push(`pay_period_end <= $${paramIndex++}`);
      values.push(payPeriodEnd);
    }

    if (payFrequency) {
      conditions.push(`pay_frequency = $${paramIndex++}`);
      values.push(payFrequency);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(pay_date, pay_run_id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        pay_run_id,
        pay_period_start,
        pay_period_end,
        pay_date,
        pay_frequency,
        status,
        total_gross,
        total_net,
        total_taxes,
        total_deductions,
        employee_count,
        created_at,
        processed_at
      FROM payroll.pay_runs
      ${whereClause}
      ORDER BY pay_date DESC, pay_run_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<PayRun>(userContext, query, values);

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
          sortKey: lastRecord.pay_date,
          id: lastRecord.pay_run_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed pay runs', {
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
