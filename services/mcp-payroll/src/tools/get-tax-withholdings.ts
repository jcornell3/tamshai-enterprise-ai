/**
 * Get Tax Withholdings Tool
 *
 * Returns tax withholding settings for an employee (W-4, state tax elections).
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling, handleTaxWithholdingNotFound } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetTaxWithholdingsInputSchema = z.object({
  employeeId: z.string().uuid().optional(), // If not provided, returns current user's withholdings
});

export type GetTaxWithholdingsInput = z.infer<typeof GetTaxWithholdingsInputSchema>;

// Tax withholding record type
export interface TaxWithholding {
  withholding_id: string;
  employee_id: string;
  employee_name: string;
  federal_filing_status: string;
  federal_allowances: number;
  federal_additional: number;
  federal_exempt: boolean;
  state: string;
  state_filing_status: string | null;
  state_allowances: number;
  state_additional: number;
  state_exempt: boolean;
  local_tax_enabled: boolean;
  local_jurisdiction: string | null;
  effective_date: string;
  updated_at: string;
}

/**
 * Get tax withholding settings for an employee.
 */
export async function getTaxWithholdings(
  input: GetTaxWithholdingsInput,
  userContext: UserContext
): Promise<MCPToolResponse<TaxWithholding | null>> {
  return withErrorHandling('get_tax_withholdings', async () => {
    const validatedInput = GetTaxWithholdingsInputSchema.parse(input);
    const targetEmployeeId = validatedInput.employeeId || userContext.userId;

    logger.debug('Getting tax withholdings', {
      employeeId: targetEmployeeId,
      userId: userContext.userId,
    });

    const query = `
      SELECT
        tw.withholding_id,
        tw.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        tw.federal_filing_status,
        tw.federal_allowances,
        tw.federal_additional,
        tw.federal_exempt,
        tw.state,
        tw.state_filing_status,
        tw.state_allowances,
        tw.state_additional,
        tw.state_exempt,
        tw.local_tax_enabled,
        tw.local_jurisdiction,
        tw.effective_date,
        tw.updated_at
      FROM payroll.tax_withholdings tw
      JOIN payroll.employees e ON tw.employee_id = e.employee_id
      WHERE tw.employee_id = $1
      ORDER BY tw.effective_date DESC
      LIMIT 1
    `;

    const result = await queryWithRLS<TaxWithholding>(userContext, query, [targetEmployeeId]);

    if (result.rowCount === 0) {
      logger.info('No tax withholdings configured', {
        employeeId: targetEmployeeId,
        userId: userContext.userId,
      });

      // Return success with null data - frontend shows "No withholding configured"
      return createSuccessResponse(null, {
        hasMore: false,
        returnedCount: 0,
        hint: 'No withholding configured',
      });
    }

    logger.info('Retrieved tax withholdings', {
      employeeId: targetEmployeeId,
      userId: userContext.userId,
    });

    return createSuccessResponse(result.rows[0]);
  });
}
