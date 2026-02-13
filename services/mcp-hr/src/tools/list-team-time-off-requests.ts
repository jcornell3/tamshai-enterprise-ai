/**
 * List Team Time-Off Requests Tool
 *
 * Returns time-off requests for the manager's direct reports.
 * Only available to users with manager role.
 *
 * Features:
 * - Shows pending requests requiring approval
 * - Cursor-based pagination
 * - Status filtering
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  createErrorResponse,
  PaginationMetadata,
} from '../types/response';
import { withErrorHandling, handleDatabaseError } from '../utils/error-handler';
import { TimeOffRequest } from './list-time-off-requests';

/**
 * Cursor for pagination
 */
interface TeamRequestCursor {
  createdAt: string;
  id: string;
}

function encodeCursor(cursor: TeamRequestCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeCursor(encoded: string): TeamRequestCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as TeamRequestCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for list_team_time_off_requests tool
 */
export const ListTeamTimeOffRequestsInputSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

export type ListTeamTimeOffRequestsInput = z.input<typeof ListTeamTimeOffRequestsInputSchema>;

/**
 * List time-off requests for manager's direct reports
 *
 * Requires manager role. Returns requests from employees who report
 * to the authenticated user.
 */
export async function listTeamTimeOffRequests(
  input: ListTeamTimeOffRequestsInput,
  userContext: UserContext
): Promise<MCPToolResponse<TimeOffRequest[]>> {
  return withErrorHandling('list_team_time_off_requests', async () => {
    // Check for manager role
    const isManager = userContext.roles.some(role =>
      role === 'manager' || role === 'hr-read' || role === 'hr-write' || role === 'executive'
    );

    if (!isManager) {
      return createErrorResponse(
        'INSUFFICIENT_PERMISSIONS',
        'This operation requires manager access',
        'Contact your administrator if you believe you should have manager access'
      );
    }

    const validated = ListTeamTimeOffRequestsInputSchema.parse(input);
    const { status, limit, cursor } = validated;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    try {
      // First, get the manager's employee ID
      const managerLookup = await queryWithRLS(
        userContext,
        'SELECT id FROM hr.employees WHERE work_email = $1',
        [userContext.email]
      );

      if (managerLookup.rows.length === 0) {
        return createErrorResponse(
          'MANAGER_NOT_FOUND',
          'Could not find your employee record',
          'Ensure your email is registered in the HR system'
        );
      }

      const managerId = managerLookup.rows[0].id;

      const whereClauses: string[] = ['e.manager_id = $1'];
      const values: any[] = [managerId];
      let paramIndex = 2;

      if (status) {
        whereClauses.push(`r.status = $${paramIndex++}`);
        values.push(status);
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

      // Count pending requests for the hint
      const pendingCount = requests.filter(r => r.status === 'pending').length;

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
          }),
          hint: pendingCount > 0
            ? `${pendingCount} request(s) pending your approval. Use approve_time_off_request to approve or reject.`
            : `Showing ${requests.length} team time-off requests.`,
        };
      }

      return createSuccessResponse(requests, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_team_time_off_requests');
    }
  }) as Promise<MCPToolResponse<TimeOffRequest[]>>;
}
