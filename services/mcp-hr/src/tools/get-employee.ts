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
 */
export const GetEmployeeInputSchema = z.object({
  employeeId: z.string().uuid('Employee ID must be a valid UUID'),
});

export type GetEmployeeInput = z.infer<typeof GetEmployeeInputSchema>;

/**
 * Employee data structure
 */
export interface Employee {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  hire_date: string;
  job_title: string;
  department: string;
  manager_id: string | null;
  manager_name: string | null;
  salary: number | null;  // May be masked based on permissions
  location: string;
  employment_status: string;
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
      // Query with RLS enforcement
      const result = await queryWithRLS<Employee>(
        userContext,
        `
        SELECT
          e.employee_id,
          e.first_name,
          e.last_name,
          e.email,
          e.phone,
          e.hire_date::text as hire_date,
          e.job_title,
          e.department,
          e.manager_id,
          m.first_name || ' ' || m.last_name as manager_name,
          CASE
            WHEN current_setting('app.current_user_roles') LIKE '%hr-write%'
              OR current_setting('app.current_user_roles') LIKE '%executive%'
            THEN e.salary
            ELSE NULL
          END as salary,
          e.location,
          e.employment_status
        FROM hr.employees e
        LEFT JOIN hr.employees m ON e.manager_id = m.employee_id
        WHERE e.employee_id = $1
          AND e.employment_status = 'active'
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
