/**
 * Create Pay Run Tool
 *
 * Creates a new pay run with employee pay stubs.
 * Uses human-in-the-loop confirmation pattern.
 */
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
} from '../types/response';
import { withErrorHandling, handleWritePermissionRequired } from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';
import { logger } from '../utils/logger';

export const CreatePayRunInputSchema = z.object({
  period_start: z.string(), // ISO date YYYY-MM-DD
  period_end: z.string(), // ISO date YYYY-MM-DD
  pay_date: z.string(), // ISO date YYYY-MM-DD
  employees: z.array(
    z.object({
      employee_id: z.string(),
      gross_pay: z.number().min(0),
      hours_worked: z.number().min(0).default(0),
      overtime_hours: z.number().min(0).default(0),
    })
  ),
});

export type CreatePayRunInput = z.infer<typeof CreatePayRunInputSchema>;

export interface CreatePayRunResult {
  pay_run_id: string;
  status: string;
  employee_count: number;
  total_gross: number;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
}

function hasPayrollWriteAccess(roles: string[]): boolean {
  return roles.some(
    (role) => role === 'payroll-write' || role === 'executive' || role === 'hr-write'
  );
}

/**
 * Initiate a pay run creation with human-in-the-loop confirmation.
 */
export async function createPayRun(
  input: CreatePayRunInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('create_pay_run', async () => {
    if (!hasPayrollWriteAccess(userContext.roles)) {
      return handleWritePermissionRequired('create_pay_run', userContext.roles);
    }

    const validatedInput = CreatePayRunInputSchema.parse(input);
    const { period_start, period_end, pay_date, employees } = validatedInput;

    // Validate date ordering
    if (new Date(period_start) >= new Date(period_end)) {
      return createErrorResponse(
        'INVALID_DATE_RANGE',
        'period_start must be before period_end',
        'Verify the pay period dates are correct. period_start should be the first day and period_end the last day of the pay period.'
      );
    }

    if (employees.length === 0) {
      return createErrorResponse(
        'INVALID_INPUT',
        'At least one employee is required to create a pay run',
        'Use calculate_earnings to compute employee earnings for the period, then provide the results here.'
      );
    }

    const totalGross = Math.round(employees.reduce((sum, e) => sum + e.gross_pay, 0) * 100) / 100;

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'create_pay_run',
      mcpServer: 'payroll',
      userId: userContext.userId,
      timestamp: Date.now(),
      period_start,
      period_end,
      pay_date,
      employees,
      totalGross,
      employeeCount: employees.length,
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Create new pay run?

Pay Period: ${period_start} to ${period_end}
Pay Date: ${pay_date}
Employees: ${employees.length}
Total Gross Pay: $${totalGross.toLocaleString()}

Status will be set to DRAFT. This action creates the pay run and individual pay stubs.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  });
}

/**
 * Execute the confirmed pay run creation.
 */
export async function executeCreatePayRun(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<CreatePayRunResult>> {
  return withErrorHandling('execute_create_pay_run', async () => {
    const period_start = confirmationData.period_start as string;
    const period_end = confirmationData.period_end as string;
    const pay_date = confirmationData.pay_date as string;
    const employees = confirmationData.employees as Array<{
      employee_id: string;
      gross_pay: number;
      hours_worked: number;
      overtime_hours: number;
    }>;
    const totalGross = confirmationData.totalGross as number;

    logger.info('Creating pay run', {
      period_start,
      period_end,
      pay_date,
      employeeCount: employees.length,
      userId: userContext.userId,
    });

    const payRunId = uuidv4();

    // Insert pay run
    const insertPayRunQuery = `
      INSERT INTO payroll.pay_runs (
        pay_run_id, pay_period_start, pay_period_end, pay_date,
        pay_frequency, status, total_gross, total_net,
        total_taxes, total_deductions, employee_count, created_by
      ) VALUES (
        $1, $2, $3, $4,
        'BI_WEEKLY', 'DRAFT', $5, 0,
        0, 0, $6, $7
      )
    `;

    await queryWithRLS(userContext, insertPayRunQuery, [
      payRunId,
      period_start,
      period_end,
      pay_date,
      totalGross,
      employees.length,
      userContext.userId,
    ]);

    // Insert pay stubs for each employee
    for (const emp of employees) {
      const payStubId = uuidv4();
      const insertPayStubQuery = `
        INSERT INTO payroll.pay_stubs (
          pay_stub_id, pay_run_id, employee_id,
          gross_pay, net_pay, total_taxes, total_deductions,
          hours_worked, overtime_hours
        ) VALUES (
          $1, $2, $3,
          $4, $4, 0, 0,
          $5, $6
        )
      `;

      await queryWithRLS(userContext, insertPayStubQuery, [
        payStubId,
        payRunId,
        emp.employee_id,
        emp.gross_pay,
        emp.hours_worked,
        emp.overtime_hours,
      ]);
    }

    logger.info('Pay run created', { payRunId, employeeCount: employees.length });

    return createSuccessResponse({
      pay_run_id: payRunId,
      status: 'DRAFT',
      employee_count: employees.length,
      total_gross: totalGross,
      pay_period_start: period_start,
      pay_period_end: period_end,
      pay_date,
    });
  });
}
