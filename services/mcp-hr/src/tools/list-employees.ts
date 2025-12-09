/**
 * List Employees Tool (v1.4 with Truncation Detection)
 *
 * Lists employees with optional filters, implementing LIMIT+1 pattern
 * to detect when results are truncated (Section 5.3, Article III.2).
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  TruncationMetadata,
} from '../types/response';
import {
  handleDatabaseError,
  handleValidationError,
  withErrorHandling,
} from '../utils/error-handler';
import { Employee } from './get-employee';

/**
 * Input schema for list_employees tool
 */
export const ListEmployeesInputSchema = z.object({
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  managerId: z.string().uuid().optional(),
  location: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

export type ListEmployeesInput = z.infer<typeof ListEmployeesInputSchema>;

/**
 * List employees with filters and truncation detection
 *
 * v1.4 Feature: LIMIT+1 query pattern (Section 5.3)
 * - Queries for limit + 1 records
 * - If we get more than limit, results are truncated
 * - Returns metadata.truncated = true with warning message
 * - Enforces Article III.2: 50-record maximum
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
    const { department, jobTitle, managerId, location, limit } = validated;

    // Build dynamic WHERE clauses (using actual schema columns)
    const whereClauses: string[] = ["e.status = 'ACTIVE'"];  // Actual column: status (not employment_status)
    const values: any[] = [];
    let paramIndex = 1;

    if (department) {
      // department filter accepts department name, so JOIN with departments table
      whereClauses.push(`d.name ILIKE $${paramIndex++}`);
      values.push(`%${department}%`);
    }

    if (jobTitle) {
      // Actual column: title (not job_title)
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

    const whereClause = whereClauses.join(' AND ');

    try {
      // v1.4: Query with LIMIT + 1 to detect truncation
      const queryLimit = limit + 1;

      // Build the full SQL query string
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
ORDER BY e.last_name, e.first_name
LIMIT $${paramIndex}`;

      const result = await queryWithRLS<Employee>(
        userContext,
        sqlQuery,
        [...values, queryLimit]
      );

      // v1.4: Check if results are truncated
      const isTruncated = result.rowCount! > limit;
      const employees = isTruncated
        ? result.rows.slice(0, limit)  // Return only requested limit
        : result.rows;

      // v1.4: Build truncation metadata if needed
      let metadata: TruncationMetadata | undefined;

      if (isTruncated) {
        // Build filter description for warning message
        const filters: string[] = [];
        if (department) filters.push(`department="${department}"`);
        if (jobTitle) filters.push(`job title containing "${jobTitle}"`);
        if (managerId) filters.push(`manager ID "${managerId}"`);
        if (location) filters.push(`location containing "${location}"`);

        const filterDesc = filters.length > 0
          ? ` with filters: ${filters.join(', ')}`
          : '';

        metadata = {
          truncated: true,
          returnedCount: employees.length,
          warning: `⚠️ Showing ${employees.length} of 50+ employees${filterDesc}. Results are incomplete. Please refine your query with more specific filters (e.g., department, job title, location, or manager ID).`,
        };
      }

      return createSuccessResponse(employees, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_employees');
    }
  }) as Promise<MCPToolResponse<Employee[]>>;
}
