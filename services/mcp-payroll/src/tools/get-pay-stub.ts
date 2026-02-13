/**
 * Get Pay Stub Tool
 *
 * Returns detailed pay stub information including earnings, taxes, and deductions.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling, handlePayStubNotFound } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetPayStubInputSchema = z.object({
  payStubId: z.string().uuid(),
});

export type GetPayStubInput = z.infer<typeof GetPayStubInputSchema>;

// Detailed pay stub with line items
export interface PayStubDetail {
  pay_stub_id: string;
  employee_id: string;
  employee_name: string;
  pay_run_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  gross_pay: number;
  net_pay: number;
  total_taxes: number;
  total_deductions: number;
  hours_worked: number | null;
  overtime_hours: number | null;
  earnings: EarningsItem[];
  taxes: TaxItem[];
  deductions: DeductionItem[];
  ytd_gross: number;
  ytd_net: number;
  ytd_taxes: number;
}

export interface EarningsItem {
  type: string;
  description: string;
  hours: number | null;
  rate: number | null;
  amount: number;
}

export interface TaxItem {
  type: string;
  description: string;
  amount: number;
  ytd_amount: number;
}

export interface DeductionItem {
  type: string;
  description: string;
  amount: number;
  is_pretax: boolean;
  ytd_amount: number;
}

/**
 * Get detailed pay stub by ID.
 */
export async function getPayStub(
  input: GetPayStubInput,
  userContext: UserContext
): Promise<MCPToolResponse<PayStubDetail>> {
  return withErrorHandling('get_pay_stub', async () => {
    const validatedInput = GetPayStubInputSchema.parse(input);
    const { payStubId } = validatedInput;

    logger.debug('Getting pay stub', { payStubId, userId: userContext.userId });

    // Get pay stub header
    const headerQuery = `
      SELECT
        ps.pay_stub_id,
        ps.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        ps.pay_run_id,
        ps.pay_period_start,
        ps.pay_period_end,
        ps.pay_date,
        ps.gross_pay,
        ps.net_pay,
        ps.total_taxes,
        ps.total_deductions,
        ps.hours_worked,
        ps.overtime_hours,
        ps.ytd_gross,
        ps.ytd_net,
        ps.ytd_taxes
      FROM payroll.pay_stubs ps
      JOIN payroll.employees e ON ps.employee_id = e.employee_id
      WHERE ps.pay_stub_id = $1
    `;

    const headerResult = await queryWithRLS<PayStubDetail>(userContext, headerQuery, [payStubId]);

    if (headerResult.rowCount === 0) {
      return handlePayStubNotFound(payStubId);
    }

    const payStub = headerResult.rows[0];

    // Get earnings line items
    const earningsQuery = `
      SELECT
        earning_type AS type,
        description,
        hours,
        rate,
        amount
      FROM payroll.pay_stub_earnings
      WHERE pay_stub_id = $1
      ORDER BY earning_type
    `;

    const earningsResult = await queryWithRLS<EarningsItem>(userContext, earningsQuery, [payStubId]);

    // Get tax line items
    const taxesQuery = `
      SELECT
        tax_type AS type,
        description,
        amount,
        ytd_amount
      FROM payroll.pay_stub_taxes
      WHERE pay_stub_id = $1
      ORDER BY tax_type
    `;

    const taxesResult = await queryWithRLS<TaxItem>(userContext, taxesQuery, [payStubId]);

    // Get deduction line items
    const deductionsQuery = `
      SELECT
        deduction_type AS type,
        description,
        amount,
        is_pretax,
        ytd_amount
      FROM payroll.pay_stub_deductions
      WHERE pay_stub_id = $1
      ORDER BY is_pretax DESC, deduction_type
    `;

    const deductionsResult = await queryWithRLS<DeductionItem>(userContext, deductionsQuery, [
      payStubId,
    ]);

    // Combine into full detail
    const payStubDetail: PayStubDetail = {
      ...payStub,
      earnings: earningsResult.rows,
      taxes: taxesResult.rows,
      deductions: deductionsResult.rows,
    };

    logger.info('Retrieved pay stub', {
      payStubId,
      employeeId: payStub.employee_id,
      userId: userContext.userId,
    });

    return createSuccessResponse(payStubDetail);
  });
}
