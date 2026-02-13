/**
 * List Time-Off Requests Tool
 *
 * Returns time-off requests for the authenticated user with pagination.
 * Supports filtering by status.
 *
 * Features:
 * - Cursor-based pagination
 * - Status filtering (pending, approved, rejected, cancelled)
 * - Date range support
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  PaginationMetadata,
} from '../types/response';
import { withErrorHandling, handleDatabaseError } from '../utils/error-handler';

/**
 * Time-off request record
 */
export interface TimeOffRequest {
  request_id: string;
  employee_id: string;
  employee_name: string;
  type_code: string;
  type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approver_name: string | null;
  approved_at: string | null;
  notes: string | null;
  approver_notes: string | null;
  created_at: string;
}

/**
 * Cursor for pagination
 */
interface RequestCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(cursor: RequestCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeCursor(encoded: string): RequestCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as RequestCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for list_time_off_requests tool
 */
export const ListTimeOffRequestsInputSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  startDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type ListTimeOffRequestsInput = z.input<typeof ListTimeOffRequestsInputSchema>;

/**
 * List time-off requests for the authenticated user
 *
 * Returns own requests with optional status filter and pagination.
 */
export async function listTimeOffRequests(
  input: ListTimeOffRequestsInput,
  userContext: UserContext
): Promise<MCPToolResponse<TimeOffRequest[]>> {
  return withErrorHandling('list_time_off_requests', async () => {
    const validated = ListTimeOffRequestsInputSchema.parse(input);
    const { status, startDateFrom, startDateTo, limit, cursor } = validated;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    try {
      const whereClauses: string[] = ['e.work_email = $1'];
      const values: any[] = [userContext.email];
      let paramIndex = 2;

      if (status) {
        whereClauses.push(`r.status = $${paramIndex++}`);
        values.push(status);
      }

      if (startDateFrom) {
        whereClauses.push(`r.start_date >= $${paramIndex++}`);
        values.push(startDateFrom);
      }

      if (startDateTo) {
        whereClauses.push(`r.start_date <= $${paramIndex++}`);
        values.push(startDateTo);
      }

      if (cursorData) {
        whereClauses.push(`(
          (r.created_at < $${paramIndex}) OR
          (r.created_at = $${paramIndex} AND r.id < $${paramIndex + 1})
        )`);
        values.push(cursorData.createdAt, cursorData.id);
        paramIndex += 2;
      }

      const queryLimit = limit + 1;

      const query = `
        SELECT
          r.id as request_id,
          r.employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          r.type_code,
          t.type_name,
          r.start_date::text,
          r.end_date::text,
          r.total_days::DECIMAL(4,2),
          r.status,
          a.first_name || ' ' || a.last_name as approver_name,
          r.approved_at::text,
          r.notes,
          r.approver_notes,
          r.created_at::text
        FROM hr.time_off_requests r
        JOIN hr.employees e ON r.employee_id = e.id
        JOIN hr.time_off_types t ON r.type_code = t.type_code
        LEFT JOIN hr.employees a ON r.approver_id = a.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $${paramIndex}
      `;

      const result = await queryWithRLS<TimeOffRequest>(
        userContext,
        query,
        [...values, queryLimit]
      );

      const hasMore = result.rowCount! > limit;
      const requests = hasMore ? result.rows.slice(0, limit) : result.rows;

      let metadata: PaginationMetadata | undefined;

      if (hasMore || cursorData) {
        const lastRequest = requests[requests.length - 1];

        metadata = {
          hasMore,
          returnedCount: requests.length,
          ...(hasMore && lastRequest && {
            nextCursor: encodeCursor({
              createdAt: lastRequest.created_at,
              id: lastRequest.request_id,
            }),
            hint: `To see more requests, say "show next page" or "get more requests".`,
          }),
        };
      }

      return createSuccessResponse(requests, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_time_off_requests');
    }
  }) as Promise<MCPToolResponse<TimeOffRequest[]>>;
}
