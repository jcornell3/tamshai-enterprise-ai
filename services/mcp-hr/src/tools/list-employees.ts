/**
 * List Employees Tool (v1.4 with Cursor-Based Pagination)
 *
 * Lists employees with optional filters, implementing cursor-based pagination
 * to allow complete data retrieval across multiple API calls while maintaining
 * token efficiency per request (Section 5.3, Article III.2).
 *
 * Pagination Strategy:
 * - Each request returns up to `limit` records (default 50)
 * - If more records exist, response includes `nextCursor`
 * - Client passes cursor to get next page
 * - Cursor encodes last record's sort key for efficient keyset pagination
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  PaginationMetadata,
} from '../types/response';
import {
  handleDatabaseError,
  handleValidationError,
  withErrorHandling,
} from '../utils/error-handler';
import { Employee } from './get-employee';

/**
 * Cursor structure for keyset pagination
 * Encoded as base64 JSON for opaque transport
 */
interface PaginationCursor {
  lastName: string;
  firstName: string;
  id: string;
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for list_employees tool
 */
export const ListEmployeesInputSchema = z.object({
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  managerId: z.string().uuid().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

export type ListEmployeesInput = z.infer<typeof ListEmployeesInputSchema>;

/**
 * List employees with filters and cursor-based pagination
 *
 * v1.4 Feature: Cursor-based pagination (Section 5.3)
 * - Queries for limit + 1 records to detect if more exist
 * - Returns nextCursor if more records are available
 * - Client can request subsequent pages using the cursor
 * - Enables complete data retrieval while maintaining token efficiency
 *
 * RLS automatically enforces data access based on roles.
 */
export async function listEmployees(
  input: ListEmployeesInput,
  userContext: UserContext
): Promise<MCPToolResponse<Employee[]>> {
  return withErrorHandling('list_employees', async () => {
    // Validate input
    const validated = ListEmployeesInputSchema.parse(input);
    const { department, jobTitle, managerId, location, limit, cursor } = validated;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Build dynamic WHERE clauses (using actual schema columns)
    const whereClauses: string[] = ["e.status = 'ACTIVE'"];
    const values: any[] = [];
    let paramIndex = 1;

    if (department) {
      whereClauses.push(`d.name ILIKE $${paramIndex++}`);
      values.push(`%${department}%`);
    }

    if (jobTitle) {
      whereClauses.push(`e.title ILIKE $${paramIndex++}`);
      values.push(`%${jobTitle}%`);
    }

    if (managerId) {
      whereClauses.push(`e.manager_id = $${paramIndex++}`);
      values.push(managerId);
    }

    if (location) {
      whereClauses.push(`e.location ILIKE $${paramIndex++}`);
      values.push(`%${location}%`);
    }

    // Cursor-based pagination: add WHERE clause to start after cursor position
    if (cursorData) {
      whereClauses.push(`(
        (e.last_name > $${paramIndex}) OR
        (e.last_name = $${paramIndex} AND e.first_name > $${paramIndex + 1}) OR
        (e.last_name = $${paramIndex} AND e.first_name = $${paramIndex + 1} AND e.id > $${paramIndex + 2})
      )`);
      values.push(cursorData.lastName, cursorData.firstName, cursorData.id);
      paramIndex += 3;
    }

    const whereClause = whereClauses.join(' AND ');

    try {
      // Query with LIMIT + 1 to detect if more records exist
      const queryLimit = limit + 1;

      const sqlQuery = `SELECT
  e.id,
  e.first_name,
  e.last_name,
  e.email,
  e.phone,
  e.hire_date::text as hire_date,
  e.title,
  d.name as department_name,
  e.department_id,
  e.manager_id,
  m.first_name || ' ' || m.last_name as manager_name,
  CASE
    WHEN current_setting('app.current_user_roles', true) LIKE '%hr-write%'
      OR current_setting('app.current_user_roles', true) LIKE '%executive%'
    THEN e.salary
    ELSE NULL
  END as salary,
  e.location,
  e.status
FROM hr.employees e
LEFT JOIN hr.employees m ON e.manager_id = m.id
LEFT JOIN hr.departments d ON e.department_id = d.id
WHERE ${whereClause}
ORDER BY e.last_name, e.first_name, e.id
LIMIT $${paramIndex}`;

      const result = await queryWithRLS<Employee>(
        userContext,
        sqlQuery,
        [...values, queryLimit]
      );

      // Check if more records exist
      const hasMore = result.rowCount! > limit;
      const employees = hasMore
        ? result.rows.slice(0, limit)
        : result.rows;

      // Build pagination metadata
      let metadata: PaginationMetadata | undefined;

      if (hasMore || cursorData) {
        // Get the last record to build the next cursor
        const lastEmployee = employees[employees.length - 1];

        metadata = {
          hasMore,
          returnedCount: employees.length,
          ...(hasMore && lastEmployee && {
            nextCursor: encodeCursor({
              lastName: lastEmployee.last_name,
              firstName: lastEmployee.first_name,
              id: lastEmployee.id,
            }),
            totalEstimate: `${limit}+`,
            hint: `To see more employees, say "show next page" or "get more employees". You can also use filters like department, job title, or location to narrow results.`,
          }),
        };
      }

      return createSuccessResponse(employees, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_employees');
    }
  }) as Promise<MCPToolResponse<Employee[]>>;
}
