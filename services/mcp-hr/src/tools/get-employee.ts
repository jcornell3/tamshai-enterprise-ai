/**
 * Get Employee Tool
 *
 * Retrieves a single employee record by ID with RLS enforcement.
 * Read-only operation accessible to hr-read, hr-write, manager, and executive roles.
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleEmployeeNotFound,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for get_employee tool
 * Accepts any string to support both UUID (e.id) and VARCHAR (e.keycloak_user_id) lookups
 */
export const GetEmployeeInputSchema = z.object({
  employeeId: z.string(),
});

export type GetEmployeeInput = z.infer<typeof GetEmployeeInputSchema>;

/**
 * Employee data structure (matched to actual schema)
 *
 * Note: Actual database uses 'id', 'title', 'status', 'department_id'
 * but we expose user-friendly names in the interface.
 */
export interface Employee {
  id: string;                    // UUID primary key
  employee_id: string;           // String employee number (may be empty)
  first_name: string;
  last_name: string;
  work_email: string;            // Frontend expects work_email
  phone: string | null;
  hire_date: string;
  job_title: string;             // Frontend expects job_title
  department: string | null;      // Computed from JOIN with departments (d.name)
  department_id: string | null;  // Actual column: department_id (UUID FK)
  manager_id: string | null;
  manager_name: string | null;
  salary: number | null;          // May be masked based on permissions
  location: string | null;
  employment_status: string;     // Frontend expects employment_status
}

/**
 * Get a single employee by ID
 *
 * RLS automatically enforces:
 * - Users can see their own record
 * - Managers can see their direct reports
 * - HR roles can see all employees
 * - Executives can see all employees
 * - Salary is masked unless user has hr-write or executive role
 */
export async function getEmployee(
  input: GetEmployeeInput,
  userContext: UserContext
): Promise<MCPToolResponse<Employee>> {
  return withErrorHandling('get_employee', async () => {
    // Validate input
    const { employeeId } = GetEmployeeInputSchema.parse(input);

    try {
      // Query with RLS enforcement (using actual schema columns)
      // Support lookup by both UUID (e.id) and VARCHAR (e.keycloak_user_id)
      const result = await queryWithRLS<Employee>(
        userContext,
        `
        SELECT
          e.id,
          e.employee_id,
          e.first_name,
          e.last_name,
          COALESCE(e.work_email, e.email) as work_email,
          e.phone,
          e.hire_date::text as hire_date,
          e.title as job_title,
          d.name as department,
          e.department_id,
          e.manager_id,
          m.first_name || ' ' || m.last_name as manager_name,
          CASE
            WHEN current_setting('app.current_user_roles') LIKE '%hr-write%'
              OR current_setting('app.current_user_roles') LIKE '%executive%'
            THEN e.salary
            ELSE NULL
          END as salary,
          e.location,
          e.status as employment_status
        FROM hr.employees e
        LEFT JOIN hr.employees m ON e.manager_id = m.id
        LEFT JOIN hr.departments d ON e.department_id = d.id
        WHERE (e.id::text = $1 OR e.employee_id = $1 OR e.keycloak_user_id = $1)
          AND e.status = 'ACTIVE'
        `,
        [employeeId]
      );

      if (result.rowCount === 0) {
        return handleEmployeeNotFound(employeeId);
      }

      return createSuccessResponse(result.rows[0]);
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_employee');
    }
  }) as Promise<MCPToolResponse<Employee>>;
}
