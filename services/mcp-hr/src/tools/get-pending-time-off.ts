/**
 * Get Pending Time-Off Requests Tool
 *
 * Returns pending time-off requests awaiting approval.
 * Used by managers and HR staff to see requests needing action.
 *
 * Features:
 * - Filters for status = 'pending' only
 * - Cursor-based pagination
 * - Type filtering (VACATION, SICK, etc.)
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
 * Pending time-off request record
 */
export interface PendingTimeOffRequest {
  requestId: string;
  employeeId: string;
  employeeName: string;
  typeCode: string;
  typeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  notes: string | null;
  createdAt: string;
}

/**
 * Cursor for pagination
 */
interface RequestCursor {
  startDate: string;
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
 * Input schema for get_pending_time_off tool
 */
export const GetPendingTimeOffInputSchema = z.object({
  typeCode: z.enum(['VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'JURY_DUTY', 'PARENTAL', 'UNPAID']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type GetPendingTimeOffInput = z.input<typeof GetPendingTimeOffInputSchema>;

/**
 * Get pending time-off requests awaiting approval
 *
 * Returns requests with status = 'pending' that need manager action.
 * RLS policies ensure users only see requests they can approve.
 */
export async function getPendingTimeOff(
  input: GetPendingTimeOffInput,
  userContext: UserContext
): Promise<MCPToolResponse<PendingTimeOffRequest[]>> {
  return withErrorHandling('get_pending_time_off', async () => {
    const validated = GetPendingTimeOffInputSchema.parse(input);
    const { typeCode, limit, cursor } = validated;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    try {
      // Always filter for pending status
      const whereClauses: string[] = ["r.status = 'pending'"];
      const values: any[] = [];
      let paramIndex = 1;

      if (typeCode) {
        whereClauses.push(`r.type_code = $${paramIndex++}`);
        values.push(typeCode);
      }

      if (cursorData) {
        whereClauses.push(`(
          (r.start_date > $${paramIndex}) OR
          (r.start_date = $${paramIndex} AND r.created_at > $${paramIndex + 1}) OR
          (r.start_date = $${paramIndex} AND r.created_at = $${paramIndex + 1} AND r.id > $${paramIndex + 2})
        )`);
        values.push(cursorData.startDate, cursorData.createdAt, cursorData.id);
        paramIndex += 3;
      }

      const queryLimit = limit + 1;

      const query = `
        SELECT
          r.id as "requestId",
          r.employee_id as "employeeId",
          e.first_name || ' ' || e.last_name as "employeeName",
          r.type_code as "typeCode",
          t.type_name as "typeName",
          r.start_date::text as "startDate",
          r.end_date::text as "endDate",
          r.total_days::DECIMAL(4,2) as "totalDays",
          r.notes,
          r.created_at::text as "createdAt"
        FROM hr.time_off_requests r
        JOIN hr.employees e ON r.employee_id = e.id
        JOIN hr.time_off_types t ON r.type_code = t.type_code
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY r.start_date ASC, r.created_at ASC, r.id ASC
        LIMIT $${paramIndex}
      `;

      const result = await queryWithRLS<PendingTimeOffRequest>(
        userContext,
        query,
        [...values, queryLimit]
      );

      const hasMore = result.rowCount! > limit;
      const requests = hasMore ? result.rows.slice(0, limit) : result.rows;

      const lastRequest = requests[requests.length - 1];

      const metadata: PaginationMetadata = {
        hasMore,
        returnedCount: requests.length,
        ...(hasMore && lastRequest && {
          nextCursor: encodeCursor({
            startDate: lastRequest.startDate,
            createdAt: lastRequest.createdAt,
            id: lastRequest.requestId,
          }),
          hint: `To see more pending requests, say "show next page" or "get more pending requests".`,
        }),
      };

      return createSuccessResponse(requests, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_pending_time_off');
    }
  }) as Promise<MCPToolResponse<PendingTimeOffRequest[]>>;
}
