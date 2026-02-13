/**
 * Get Time-Off Balances Tool
 *
 * Returns time-off balances for an employee (or self if no ID provided).
 * Shows vacation, sick, and personal day balances for the current year.
 *
 * Features:
 * - Self-service: employees can view their own balances
 * - Manager access: managers can view team members' balances
 * - HR access: HR can view any employee's balances
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
 * Time-off balance record
 */
export interface TimeOffBalance {
  type_code: string;
  type_name: string;
  fiscal_year: number;
  entitlement: number;
  used: number;
  pending: number;
  carryover: number;
  available: number;  // Calculated: entitlement + carryover - used - pending
}

/**
 * Input schema for get_time_off_balances tool
 */
export const GetTimeOffBalancesInputSchema = z.object({
  employeeId: z.string().uuid().optional(),
  fiscalYear: z.number().int().min(2020).max(2030).optional(),
});

export type GetTimeOffBalancesInput = z.input<typeof GetTimeOffBalancesInputSchema>;

/**
 * Get time-off balances for an employee
 *
 * If no employeeId is provided, returns balances for the authenticated user.
 * RLS policies enforce access control.
 */
export async function getTimeOffBalances(
  input: GetTimeOffBalancesInput,
  userContext: UserContext
): Promise<MCPToolResponse<TimeOffBalance[]>> {
  return withErrorHandling('get_time_off_balances', async () => {
    const validated = GetTimeOffBalancesInputSchema.parse(input);
    const { employeeId, fiscalYear } = validated;

    const currentYear = fiscalYear || new Date().getFullYear();

    try {
      let query: string;
      let params: any[];

      if (employeeId) {
        // Get balances for specific employee
        query = `
          SELECT
            b.type_code,
            t.type_name,
            b.fiscal_year,
            COALESCE(b.entitlement, 0)::DECIMAL(5,2) as entitlement,
            COALESCE(b.used, 0)::DECIMAL(5,2) as used,
            COALESCE(b.pending, 0)::DECIMAL(5,2) as pending,
            COALESCE(b.carryover, 0)::DECIMAL(5,2) as carryover,
            (COALESCE(b.entitlement, 0) + COALESCE(b.carryover, 0) - COALESCE(b.used, 0) - COALESCE(b.pending, 0))::DECIMAL(5,2) as available
          FROM hr.time_off_balances b
          JOIN hr.time_off_types t ON b.type_code = t.type_code
          WHERE b.employee_id = $1
            AND b.fiscal_year = $2
          ORDER BY t.type_name
        `;
        params = [employeeId, currentYear];
      } else {
        // Get balances for authenticated user (self-service)
        query = `
          SELECT
            b.type_code,
            t.type_name,
            b.fiscal_year,
            COALESCE(b.entitlement, 0)::DECIMAL(5,2) as entitlement,
            COALESCE(b.used, 0)::DECIMAL(5,2) as used,
            COALESCE(b.pending, 0)::DECIMAL(5,2) as pending,
            COALESCE(b.carryover, 0)::DECIMAL(5,2) as carryover,
            (COALESCE(b.entitlement, 0) + COALESCE(b.carryover, 0) - COALESCE(b.used, 0) - COALESCE(b.pending, 0))::DECIMAL(5,2) as available
          FROM hr.time_off_balances b
          JOIN hr.time_off_types t ON b.type_code = t.type_code
          JOIN hr.employees e ON b.employee_id = e.id
          WHERE e.work_email = $1
            AND b.fiscal_year = $2
          ORDER BY t.type_name
        `;
        params = [userContext.email, currentYear];
      }

      const result = await queryWithRLS<TimeOffBalance>(
        userContext,
        query,
        params
      );

      if (result.rows.length === 0) {
        if (employeeId) {
          return createErrorResponse(
            'NO_BALANCES_FOUND',
            `No time-off balances found for employee ${employeeId} in ${currentYear}`,
            'Verify the employee ID is correct, or check if balances have been set up for this year'
          );
        }
        return createSuccessResponse<TimeOffBalance[]>([], {
          hasMore: false,
          returnedCount: 0,
          hint: `No time-off balances found for ${currentYear}. Contact HR to set up your balances.`,
        });
      }

      return createSuccessResponse(result.rows, {
        hasMore: false,
        returnedCount: result.rows.length,
        hint: `Showing ${result.rows.length} time-off balance types for ${currentYear}`,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'get_time_off_balances');
    }
  }) as Promise<MCPToolResponse<TimeOffBalance[]>>;
}
