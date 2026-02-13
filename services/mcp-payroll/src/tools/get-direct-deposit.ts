/**
 * Get Direct Deposit Tool
 *
 * Returns direct deposit settings for an employee.
 */
import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import { MCPToolResponse, createSuccessResponse } from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { logger } from '../utils/logger';

// Input validation schema
export const GetDirectDepositInputSchema = z.object({
  employeeId: z.string().uuid().optional(), // If not provided, returns current user's settings
});

export type GetDirectDepositInput = z.infer<typeof GetDirectDepositInputSchema>;

// Direct deposit account type
export interface DirectDepositAccount {
  account_id: string;
  employee_id: string;
  account_type: string;
  bank_name: string;
  routing_number_last_four: string; // Only last 4 digits for security
  account_number_last_four: string; // Only last 4 digits for security
  allocation_type: string; // 'PERCENTAGE' or 'FIXED_AMOUNT' or 'REMAINDER'
  allocation_value: number | null;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get direct deposit settings for an employee.
 */
export async function getDirectDeposit(
  input: GetDirectDepositInput,
  userContext: UserContext
): Promise<MCPToolResponse<DirectDepositAccount[]>> {
  return withErrorHandling('get_direct_deposit', async () => {
    const validatedInput = GetDirectDepositInputSchema.parse(input);
    const targetEmployeeId = validatedInput.employeeId || userContext.userId;

    logger.debug('Getting direct deposit', {
      employeeId: targetEmployeeId,
      userId: userContext.userId,
    });

    const query = `
      SELECT
        account_id,
        employee_id,
        account_type,
        bank_name,
        RIGHT(routing_number, 4) AS routing_number_last_four,
        RIGHT(account_number, 4) AS account_number_last_four,
        allocation_type,
        allocation_value,
        priority,
        status,
        created_at,
        updated_at
      FROM payroll.direct_deposit_accounts
      WHERE employee_id = $1
        AND status = 'ACTIVE'
      ORDER BY priority
    `;

    const result = await queryWithRLS<DirectDepositAccount>(userContext, query, [targetEmployeeId]);

    logger.info('Retrieved direct deposit', {
      employeeId: targetEmployeeId,
      count: result.rowCount,
      userId: userContext.userId,
    });

    return createSuccessResponse(result.rows);
  });
}
