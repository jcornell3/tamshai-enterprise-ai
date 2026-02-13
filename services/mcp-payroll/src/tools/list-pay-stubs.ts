/**
 * List Pay Stubs Tool
 *
 * Returns paginated list of pay stubs for an employee.
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
export const ListPayStubsInputSchema = z.object({
  employeeId: z.string().uuid().optional(), // If not provided, returns current user's stubs
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
  year: z.number().min(2000).max(2100).optional(),
});

export type ListPayStubsInput = z.infer<typeof ListPayStubsInputSchema>;

// Pay stub record type
export interface PayStub {
  pay_stub_id: string;
  employee_id: string;
  employee_name: string;
  pay_run_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  gross_pay: number;
  net_pay: number;
  total_taxes: number;
  total_deductions: number;
  hours_worked: number | null;
  overtime_hours: number | null;
  created_at: string;
}

/**
 * List pay stubs with pagination and filters.
 */
export async function listPayStubs(
  input: ListPayStubsInput,
  userContext: UserContext
): Promise<MCPToolResponse<PayStub[]>> {
  return withErrorHandling('list_pay_stubs', async () => {
    const validatedInput = ListPayStubsInputSchema.parse(input);
    const { employeeId, limit, cursor, year } = validatedInput;

    // Use current user's employee ID if not specified
    const targetEmployeeId = employeeId || userContext.userId;

    logger.debug('Listing pay stubs', {
      employeeId: targetEmployeeId,
      limit,
      year,
      userId: userContext.userId,
    });

    // Build query with filters
    const conditions: string[] = ['ps.employee_id = $1'];
    const values: unknown[] = [targetEmployeeId];
    let paramIndex = 2;

    if (year) {
      conditions.push(`EXTRACT(YEAR FROM ps.pay_date) = $${paramIndex++}`);
      values.push(year);
    }

    // Handle cursor-based pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (!decodedCursor) {
        return handleInvalidInput('Invalid pagination cursor', 'cursor');
      }
      conditions.push(`(ps.pay_date, ps.pay_stub_id) < ($${paramIndex++}, $${paramIndex++})`);
      values.push(decodedCursor.sortKey, decodedCursor.id);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Query with LIMIT + 1 to detect if more records exist
    const queryLimit = limit + 1;
    values.push(queryLimit);

    const query = `
      SELECT
        ps.pay_stub_id,
        ps.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        ps.pay_run_id,
        ps.pay_period_start,
        ps.pay_period_end,
        ps.pay_date,
        ps.gross_pay,
        ps.net_pay,
        ps.total_taxes,
        ps.total_deductions,
        ps.hours_worked,
        ps.overtime_hours,
        ps.created_at
      FROM payroll.pay_stubs ps
      JOIN payroll.employees e ON ps.employee_id = e.employee_id
      ${whereClause}
      ORDER BY ps.pay_date DESC, ps.pay_stub_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await queryWithRLS<PayStub>(userContext, query, values);

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
          id: lastRecord.pay_stub_id,
        }),
        returnedCount: records.length,
        totalEstimate: `${limit}+`,
        hint: 'Use the nextCursor value to retrieve the next page of results.',
      };
    }

    logger.info('Listed pay stubs', {
      employeeId: targetEmployeeId,
      count: records.length,
      hasMore,
      userId: userContext.userId,
    });

    return createSuccessResponse(records, metadata);
  });
}
