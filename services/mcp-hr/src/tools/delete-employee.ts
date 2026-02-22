/**
 * Delete Employee Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Implements Section 5.6: Write operations require user confirmation.
 * This tool generates a pending_confirmation response instead of
 * immediately executing the deletion.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
} from '@tamshai/shared';
import {
  handleEmployeeNotFound,
  handleInsufficientPermissions,
  handleCannotDeleteSelf,
  handleEmployeeHasReports,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for delete_employee tool
 */
export const DeleteEmployeeInputSchema = z.object({
  employeeId: z.string().uuid('Employee ID must be a valid UUID'),
  reason: z.string().optional(),
});

export type DeleteEmployeeInput = z.infer<typeof DeleteEmployeeInputSchema>;

/**
 * Check if user has permission to delete employees
 */
function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('hr-write') || roles.includes('executive');
}

/**
 * Delete employee tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. hr-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Cannot delete self
 * 4. Cannot delete employee with direct reports
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify employee exists and get details
 * 3. Check business rules (no direct reports, not self)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function deleteEmployee(
  input: DeleteEmployeeInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('delete_employee', async () => {
    // 1. Check permissions
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('hr-write or executive', userContext.roles);
    }

    // Validate input
    const { employeeId, reason } = DeleteEmployeeInputSchema.parse(input);

    // 2. Check if user is trying to delete themselves
    if (employeeId === userContext.userId) {
      return handleCannotDeleteSelf(userContext.userId);
    }

    try {
      // 3. Verify employee exists and get details (using actual schema columns)
      const employeeResult = await queryWithRLS(
        userContext,
        `
        SELECT
          e.id,
          e.first_name,
          e.last_name,
          e.email,
          d.name as department_name,
          e.title,
          (SELECT COUNT(*) FROM hr.employees WHERE manager_id = e.id AND status = 'ACTIVE') as report_count
        FROM hr.employees e
        LEFT JOIN hr.departments d ON e.department_id = d.id
        WHERE e.id = $1
          AND e.status = 'ACTIVE'
        `,
        [employeeId]
      );

      if (employeeResult.rowCount === 0) {
        return handleEmployeeNotFound(employeeId);
      }

      const employee = employeeResult.rows[0];

      // 4. Check if employee has direct reports
      if (employee.report_count > 0) {
        return handleEmployeeHasReports(employeeId, employee.report_count);
      }

      // 5. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'delete_employee',
        mcpServer: 'hr',
        userEmail: userContext.email || 'unknown@tamshai.com',
        timestamp: Date.now(),
        employeeId,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        employeeEmail: employee.email,
        department: employee.department_name,  // Updated column name
        jobTitle: employee.title,               // Updated column name
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 6. Return pending_confirmation response
      const message = `⚠️ Delete employee ${employee.first_name} ${employee.last_name} (${employee.email})?

Department: ${employee.department_name}
Position: ${employee.title}
${reason ? `Reason: ${reason}` : ''}

This action will permanently mark the employee record as inactive and cannot be undone.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'delete_employee');
    }
  }) as Promise<MCPToolResponse<any>>;
}

/**
 * Execute the confirmed deletion (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executeDeleteEmployee(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_delete_employee', async () => {
    const employeeId = confirmationData.employeeId as string;

    try {
      // Mark employee as inactive instead of hard delete (using actual schema columns)
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE hr.employees
        SET
          status = 'TERMINATED',
          updated_at = NOW()
        WHERE id = $1
          AND status = 'ACTIVE'
        RETURNING id, first_name, last_name
        `,
        [employeeId]
      );

      if (result.rowCount === 0) {
        return handleEmployeeNotFound(employeeId);
      }

      const deleted = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Employee ${deleted.first_name} ${deleted.last_name} has been successfully deleted`,
        employeeId: deleted.id,  // Updated column name
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_delete_employee');
    }
  }) as Promise<MCPToolResponse<any>>;
}
