/**
 * Calculate Earnings Tool
 *
 * Computes gross pay for active employees over a given date range.
 * SALARY employees: annual_salary / 26 (biweekly) prorated to the date range.
 * HOURLY employees: hourly_rate * standard_hours (default 80 for biweekly).
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { logger } from '../utils/logger';

export const CalculateEarningsInputSchema = z.object({
  period_start: z.string(), // ISO date YYYY-MM-DD
  period_end: z.string(), // ISO date YYYY-MM-DD
  standard_hours: z.number().min(1).max(200).default(80), // Default biweekly hours
});

export type CalculateEarningsInput = z.infer<typeof CalculateEarningsInputSchema>;

export interface EmployeeEarnings {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string;
  pay_type: string;
  salary: number | null;
  hourly_rate: number | null;
  hours_worked: number;
  overtime_hours: number;
  gross_pay: number;
}

/**
 * Calculate earnings for all active employees in the given period.
 */
export async function calculateEarnings(
  input: CalculateEarningsInput,
  userContext: UserContext
): Promise<MCPToolResponse<EmployeeEarnings[]>> {
  return withErrorHandling('calculate_earnings', async () => {
    const { period_start, period_end, standard_hours } = CalculateEarningsInputSchema.parse(input);

    logger.debug('Calculating earnings', { period_start, period_end, standard_hours, userId: userContext.userId });

    // Calculate the number of days in the period for salary proration
    const startDate = new Date(period_start);
    const endDate = new Date(period_end);
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    // Standard biweekly period is 14 days
    const biweeklyDays = 14;

    const query = `
      SELECT
        employee_id,
        first_name,
        last_name,
        department,
        pay_type,
        salary,
        hourly_rate
      FROM payroll.employees
      WHERE status = 'ACTIVE'
      ORDER BY last_name, first_name
    `;

    const result = await queryWithRLS<{
      employee_id: string;
      first_name: string;
      last_name: string;
      department: string;
      pay_type: string;
      salary: number | null;
      hourly_rate: number | null;
    }>(userContext, query, []);

    const earnings: EmployeeEarnings[] = result.rows.map((emp) => {
      let grossPay = 0;

      if (emp.pay_type === 'SALARY' && emp.salary) {
        // Biweekly salary = annual / 26, prorated for period length
        const biweeklyPay = emp.salary / 26;
        grossPay = Math.round((biweeklyPay * (periodDays / biweeklyDays)) * 100) / 100;
      } else if (emp.pay_type === 'HOURLY' && emp.hourly_rate) {
        grossPay = Math.round((emp.hourly_rate * standard_hours) * 100) / 100;
      }

      return {
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        department: emp.department,
        pay_type: emp.pay_type,
        salary: emp.salary,
        hourly_rate: emp.hourly_rate,
        hours_worked: emp.pay_type === 'HOURLY' ? standard_hours : 0,
        overtime_hours: 0,
        gross_pay: grossPay,
      };
    });

    logger.info('Calculated earnings', {
      employeeCount: earnings.length,
      totalGross: earnings.reduce((sum, e) => sum + e.gross_pay, 0),
      userId: userContext.userId,
    });

    return createSuccessResponse(earnings);
  });
}
