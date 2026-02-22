/**
 * Update Salary Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Implements Section 5.6: Write operations require user confirmation.
 * This tool generates a pending_confirmation response instead of
 * immediately executing the salary update.
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
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for update_salary tool
 */
export const UpdateSalaryInputSchema = z.object({
  employeeId: z.string().uuid('Employee ID must be a valid UUID'),
  newSalary: z.number().positive('Salary must be positive'),
  reason: z.string().optional(),
});

export type UpdateSalaryInput = z.infer<typeof UpdateSalaryInputSchema>;

/**
 * Check if user has permission to update salaries
 */
function hasUpdateSalaryPermission(roles: string[]): boolean {
  return roles.includes('hr-write') || roles.includes('executive');
}

/**
 * Update salary tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. hr-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Employee must exist and be active
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify employee exists and get details
 * 3. Generate confirmation ID
 * 4. Store pending action in Redis (5-minute TTL)
 * 5. Return pending_confirmation response
 */
export async function updateSalary(
  input: UpdateSalaryInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('update_salary', async () => {
    // 1. Check permissions
    if (!hasUpdateSalaryPermission(userContext.roles)) {
      return handleInsufficientPermissions('hr-write or executive', userContext.roles);
    }

    // Validate input
    const { employeeId, newSalary, reason } = UpdateSalaryInputSchema.parse(input);

    try {
      // 2. Verify employee exists and get current details
      const employeeResult = await queryWithRLS(
        userContext,
        `
        SELECT
          e.id,
          e.first_name,
          e.last_name,
          e.email,
          e.title,
          e.salary,
          d.name as department_name
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
      const currentSalary = employee.salary || 0;
      const salaryChange = newSalary - currentSalary;
      const percentChange = currentSalary > 0
        ? ((salaryChange / currentSalary) * 100).toFixed(1)
        : 'N/A';

      // 3. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'update_salary',
        mcpServer: 'hr',
        userEmail: userContext.email || 'unknown@tamshai.com',
        timestamp: Date.now(),
        employeeId,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        employeeEmail: employee.email,
        department: employee.department_name,
        jobTitle: employee.title,
        currentSalary,
        newSalary,
        salaryChange,
        percentChange,
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 4. Return pending_confirmation response
      const message = `⚠️ Update salary for ${employee.first_name} ${employee.last_name} (${employee.email})?

Current Salary: $${currentSalary.toLocaleString()}
New Salary: $${newSalary.toLocaleString()}
Change: ${salaryChange >= 0 ? '+' : ''}$${salaryChange.toLocaleString()} (${percentChange}%)
Department: ${employee.department_name}
Position: ${employee.title}
${reason ? `Reason: ${reason}` : ''}

This action will update the employee's salary in the system.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'update_salary');
    }
  }) as Promise<MCPToolResponse<any>>;
}

/**
 * Execute the confirmed salary update (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executeUpdateSalary(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_update_salary', async () => {
    const employeeId = confirmationData.employeeId as string;
    const newSalary = confirmationData.newSalary as number;

    try {
      // Update the employee's salary
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE hr.employees
        SET
          salary = $2,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'ACTIVE'
        RETURNING id, first_name, last_name, salary
        `,
        [employeeId, newSalary]
      );

      if (result.rowCount === 0) {
        return handleEmployeeNotFound(employeeId);
      }

      const updated = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Salary for ${updated.first_name} ${updated.last_name} has been updated to $${updated.salary.toLocaleString()}`,
        employeeId: updated.id,
        newSalary: updated.salary,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_update_salary');
    }
  }) as Promise<MCPToolResponse<any>>;
}
