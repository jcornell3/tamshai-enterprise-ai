/**
 * Get Benefits Tool
 *
 * Returns benefit deductions for an employee (health, dental, 401k, etc.).
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetBenefitsInputSchema = z.object({
  employeeId: z.string().uuid().optional(), // If not provided, returns current user's benefits
});

export type GetBenefitsInput = z.infer<typeof GetBenefitsInputSchema>;

// Benefit deduction record type
export interface BenefitDeduction {
  deduction_id: string;
  employee_id: string;
  type: string;
  name: string;
  amount: number;
  employer_contribution: number;
  frequency: string;
  is_pretax: boolean;
  effective_date: string;
  end_date: string | null;
  status: string;
}

/**
 * Get benefit deductions for an employee.
 */
export async function getBenefits(
  input: GetBenefitsInput,
  userContext: UserContext
): Promise<MCPToolResponse<BenefitDeduction[]>> {
  return withErrorHandling('get_benefits', async () => {
    const validatedInput = GetBenefitsInputSchema.parse(input);
    const targetEmployeeId = validatedInput.employeeId || userContext.userId;

    logger.debug('Getting benefits', {
      employeeId: targetEmployeeId,
      userId: userContext.userId,
    });

    const query = `
      SELECT
        deduction_id,
        employee_id,
        benefit_type AS type,
        benefit_name AS name,
        employee_amount AS amount,
        employer_contribution,
        frequency,
        is_pretax,
        effective_date,
        end_date,
        status
      FROM payroll.benefit_deductions
      WHERE employee_id = $1
        AND status = 'ACTIVE'
        AND (end_date IS NULL OR end_date > CURRENT_DATE)
      ORDER BY is_pretax DESC, benefit_type
    `;

    const result = await queryWithRLS<BenefitDeduction>(userContext, query, [targetEmployeeId]);

    logger.info('Retrieved benefits', {
      employeeId: targetEmployeeId,
      count: result.rowCount,
      userId: userContext.userId,
    });

    return createSuccessResponse(result.rows);
  });
}
