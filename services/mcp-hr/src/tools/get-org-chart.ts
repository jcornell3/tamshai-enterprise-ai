/**
 * Get Org Chart Tool
 *
 * Returns a hierarchical organization chart structure.
 * Can start from a specific employee (root) or return the entire org.
 *
 * Features:
 * - Recursive CTE for efficient hierarchy traversal
 * - Depth-limited to prevent infinite loops (max 10 levels)
 * - RLS-enforced access control
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import { withErrorHandling, handleDatabaseError } from '../utils/error-handler';

/**
 * Represents a single node in the org chart
 */
export interface OrgChartNode {
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  name: string; // Alias for full_name (UI compatibility)
  email: string;
  title: string;
  department: string;
  location: string;
  level: number;
  direct_reports_count: number;
  direct_reports: OrgChartNode[];
}

/**
 * Flat employee record from database query
 */
interface OrgChartRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  department: string;
  location: string;
  manager_id: string | null;
  level: number;
}

/**
 * Input schema for get_org_chart tool
 */
export const GetOrgChartInputSchema = z.object({
  rootEmployeeId: z.string().optional(),  // Relaxed: accept any string (UUID validation was too strict)
  maxDepth: z.number().int().min(1).max(10).optional().default(10),
});

export type GetOrgChartInput = z.input<typeof GetOrgChartInputSchema>;

/**
 * Build hierarchical tree from flat employee list
 */
function buildOrgTree(
  employees: OrgChartRow[],
  parentId: string | null
): OrgChartNode[] {
  return employees
    .filter((emp) => emp.manager_id === parentId)
    .map((emp) => {
      const directReports = buildOrgTree(employees, emp.employee_id);
      const fullName = `${emp.first_name} ${emp.last_name}`;
      return {
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        full_name: fullName,
        name: fullName, // Alias for UI compatibility
        email: emp.email,
        title: emp.title,
        department: emp.department,
        location: emp.location,
        level: emp.level,
        direct_reports_count: directReports.length,
        direct_reports: directReports,
      };
    });
}

/**
 * Get organizational chart starting from a root employee or entire org
 *
 * Uses recursive CTE to efficiently traverse the management hierarchy.
 * RLS policies are enforced - users only see employees they have access to.
 */
export async function getOrgChart(
  input: GetOrgChartInput,
  userContext: UserContext
): Promise<MCPToolResponse<OrgChartNode[]>> {
  return withErrorHandling('get_org_chart', async () => {
    // Validate input
    const validated = GetOrgChartInputSchema.parse(input);
    const { rootEmployeeId, maxDepth } = validated;

    try {
      let sqlQuery: string;
      let queryParams: any[];

      if (rootEmployeeId) {
        // Start from a specific employee (supports both employee_id and keycloak_user_id)
        sqlQuery = `
          WITH RECURSIVE org_hierarchy AS (
            -- Base case: the root employee
            SELECT
              e.id as employee_id,
              e.first_name,
              e.last_name,
              e.email,
              e.title,
              COALESCE(d.name, 'Unknown') as department,
              COALESCE(e.location, 'Unknown') as location,
              e.manager_id,
              0 as level
            FROM hr.employees e
            LEFT JOIN hr.departments d ON e.department_id = d.id
            WHERE (e.id::text = $1 OR e.keycloak_user_id = $1)
              AND e.status = 'ACTIVE'

            UNION ALL

            -- Recursive case: direct reports
            SELECT
              e.id as employee_id,
              e.first_name,
              e.last_name,
              e.email,
              e.title,
              COALESCE(d.name, 'Unknown') as department,
              COALESCE(e.location, 'Unknown') as location,
              e.manager_id,
              oh.level + 1
            FROM hr.employees e
            LEFT JOIN hr.departments d ON e.department_id = d.id
            JOIN org_hierarchy oh ON e.manager_id = oh.employee_id
            WHERE e.status = 'ACTIVE'
              AND oh.level < $2
          )
          SELECT * FROM org_hierarchy
          ORDER BY level, last_name, first_name
        `;
        queryParams = [rootEmployeeId, maxDepth];
      } else {
        // Get entire org starting from employees with no manager (top of org)
        sqlQuery = `
          WITH RECURSIVE org_hierarchy AS (
            -- Base case: employees at the top (no manager)
            SELECT
              e.id as employee_id,
              e.first_name,
              e.last_name,
              e.email,
              e.title,
              COALESCE(d.name, 'Unknown') as department,
              COALESCE(e.location, 'Unknown') as location,
              e.manager_id,
              0 as level
            FROM hr.employees e
            LEFT JOIN hr.departments d ON e.department_id = d.id
            WHERE e.manager_id IS NULL
              AND e.status = 'ACTIVE'

            UNION ALL

            -- Recursive case: direct reports
            SELECT
              e.id as employee_id,
              e.first_name,
              e.last_name,
              e.email,
              e.title,
              COALESCE(d.name, 'Unknown') as department,
              COALESCE(e.location, 'Unknown') as location,
              e.manager_id,
              oh.level + 1
            FROM hr.employees e
            LEFT JOIN hr.departments d ON e.department_id = d.id
            JOIN org_hierarchy oh ON e.manager_id = oh.employee_id
            WHERE e.status = 'ACTIVE'
              AND oh.level < $1
          )
          SELECT * FROM org_hierarchy
          ORDER BY level, last_name, first_name
        `;
        queryParams = [maxDepth];
      }

      const result = await queryWithRLS<OrgChartRow>(
        userContext,
        sqlQuery,
        queryParams
      );

      if (result.rows.length === 0) {
        if (rootEmployeeId) {
          return createErrorResponse(
            'EMPLOYEE_NOT_FOUND',
            `Employee with ID ${rootEmployeeId} not found or you don't have access`,
            'Verify the employee ID is correct, or try without specifying a root to see the full org chart'
          );
        }
        return createSuccessResponse<OrgChartNode[]>([], {
          hasMore: false,
          returnedCount: 0,
        });
      }

      // Build hierarchical tree
      // If rootEmployeeId was provided, use the root employee's MANAGER as the parent filter
      // This ensures buildOrgTree includes the root employee (at their level) plus their reports
      const rootEmployee = result.rows.find(r => r.level === 0);
      const rootManagerId = rootEmployeeId
        ? (rootEmployee?.manager_id || null)  // Use manager_id, not employee_id!
        : null;
      const orgTree = buildOrgTree(result.rows, rootManagerId);

      // Log diagnostics for debugging
      console.log('[get_org_chart] Diagnostics:', {
        inputRootEmployeeId: rootEmployeeId,
        foundRootEmployee: rootEmployee ? {
          employee_id: rootEmployee.employee_id,
          name: `${rootEmployee.first_name} ${rootEmployee.last_name}`,
          email: rootEmployee.email,
          manager_id: rootEmployee.manager_id,
        } : null,
        resolvedRootManagerId: rootManagerId,
        totalRowsFromQuery: result.rows.length,
        allEmployeeIds: result.rows.map(r => ({ id: r.employee_id, level: r.level, manager_id: r.manager_id })),
        builtTreeSize: orgTree.length,
        builtTreeStructure: orgTree.map(n => ({
          id: n.employee_id,
          name: n.full_name,
          level: n.level,
          directReportsCount: n.direct_reports_count,
        })),
      });

      const response = createSuccessResponse(orgTree, {
        hasMore: false,
        returnedCount: result.rows.length,
        hint: `Showing ${result.rows.length} employees in the org chart hierarchy (tree nodes: ${orgTree.length})`,
      });

      console.log('[get_org_chart] Final response:', JSON.stringify(response, null, 2));

      return response;
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_org_chart');
    }
  }) as Promise<MCPToolResponse<OrgChartNode[]>>;
}
