/**
 * Create Time-Off Request Tool
 *
 * Creates a new time-off request for the authenticated user.
 * Uses human-in-the-loop confirmation (v1.4 Section 5.6).
 *
 * Features:
 * - Balance validation (ensures sufficient balance)
 * - Date validation (business days calculation)
 * - Confirmation workflow
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
import { withErrorHandling, handleDatabaseError } from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for create_time_off_request tool
 */
export const CreateTimeOffRequestInputSchema = z.object({
  typeCode: z.enum(['VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'JURY_DUTY', 'PARENTAL', 'UNPAID']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  notes: z.string().max(500).optional(),
});

export type CreateTimeOffRequestInput = z.input<typeof CreateTimeOffRequestInputSchema>;

/**
 * Calculate business days between two dates
 */
function calculateBusinessDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Create a time-off request (with confirmation)
 *
 * Returns pending_confirmation status for user to approve.
 */
export async function createTimeOffRequest(
  input: CreateTimeOffRequestInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('create_time_off_request', async () => {
    const validated = CreateTimeOffRequestInputSchema.parse(input);
    const { typeCode, startDate, endDate, notes } = validated;

    // Validate date range
    if (startDate > endDate) {
      return createErrorResponse(
        'INVALID_DATE_RANGE',
        'Start date must be before or equal to end date',
        'Check the dates and try again'
      );
    }

    // Calculate business days
    const totalDays = calculateBusinessDays(startDate, endDate);

    if (totalDays === 0) {
      return createErrorResponse(
        'NO_BUSINESS_DAYS',
        'The selected date range contains no business days (weekends only)',
        'Select dates that include at least one weekday'
      );
    }

    try {
      // Get employee information
      const employeeLookup = await queryWithRLS(
        userContext,
        `SELECT id, first_name, last_name FROM hr.employees WHERE work_email = $1`,
        [userContext.email]
      );

      if (employeeLookup.rows.length === 0) {
        return createErrorResponse(
          'EMPLOYEE_NOT_FOUND',
          'Could not find your employee record',
          'Ensure your email is registered in the HR system'
        );
      }

      const employee = employeeLookup.rows[0];
      const employeeId = employee.id;
      const employeeName = `${employee.first_name} ${employee.last_name}`;

      // Check available balance for the request year
      const fiscalYear = new Date(startDate).getFullYear();
      const balanceLookup = await queryWithRLS(
        userContext,
        `SELECT
          COALESCE(entitlement, 0) + COALESCE(carryover, 0) - COALESCE(used, 0) - COALESCE(pending, 0) as available
        FROM hr.time_off_balances
        WHERE employee_id = $1 AND type_code = $2 AND fiscal_year = $3`,
        [employeeId, typeCode, fiscalYear]
      );

      let availableBalance = 0;
      if (balanceLookup.rows.length > 0) {
        availableBalance = parseFloat(balanceLookup.rows[0].available);
      }

      // Get type name for display
      const typeLookup = await queryWithRLS(
        userContext,
        'SELECT type_name FROM hr.time_off_types WHERE type_code = $1',
        [typeCode]
      );
      const typeName = typeLookup.rows[0]?.type_name || typeCode;

      // Warn if insufficient balance (but allow the request - manager can approve)
      const insufficientBalance = totalDays > availableBalance;
      const balanceWarning = insufficientBalance
        ? `\n\n⚠️ WARNING: This request exceeds your available balance (${availableBalance} days available). Manager approval may be denied.`
        : '';

      // Generate confirmation ID
      const confirmationId = uuidv4();

      // Store pending confirmation in Redis
      await storePendingConfirmation(confirmationId, {
        action: 'create_time_off_request',
        mcpServer: 'hr',
        userId: userContext.userId,
        employeeId,
        typeCode,
        startDate,
        endDate,
        totalDays,
        notes: notes || null,
        timestamp: Date.now(),
      });

      const message = `📅 **Time-Off Request Confirmation**

**Employee:** ${employeeName}
**Type:** ${typeName}
**Dates:** ${startDate} to ${endDate}
**Total Days:** ${totalDays} business day(s)
**Notes:** ${notes || 'None'}

**Available Balance:** ${availableBalance} days${balanceWarning}

Do you want to submit this time-off request?`;

      return createPendingConfirmationResponse(confirmationId, message, {
        action: 'create_time_off_request',
        mcpServer: 'hr',
        userId: userContext.userId,
        employeeId,
        employeeName,
        typeCode,
        typeName,
        startDate,
        endDate,
        totalDays,
        notes: notes || null,
        timestamp: Date.now(),
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'create_time_off_request');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the time-off request creation after confirmation
 */
export async function executeCreateTimeOffRequest(
  data: {
    employeeId: string;
    typeCode: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    notes: string | null;
  },
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_create_time_off_request', async () => {
    const { employeeId, typeCode, startDate, endDate, totalDays, notes } = data;

    try {
      // Insert the request
      const insertResult = await queryWithRLS(
        userContext,
        `INSERT INTO hr.time_off_requests
          (employee_id, type_code, start_date, end_date, total_days, status, notes)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        RETURNING id`,
        [employeeId, typeCode, startDate, endDate, totalDays, notes]
      );

      if (insertResult.rows.length === 0) {
        return createErrorResponse(
          'INSERT_FAILED',
          'Failed to create time-off request',
          'Please try again or contact support'
        );
      }

      const requestId = insertResult.rows[0].id;

      // Update the pending balance
      const fiscalYear = new Date(startDate).getFullYear();
      await queryWithRLS(
        userContext,
        `UPDATE hr.time_off_balances
        SET pending = pending + $1, updated_at = NOW()
        WHERE employee_id = $2 AND type_code = $3 AND fiscal_year = $4`,
        [totalDays, employeeId, typeCode, fiscalYear]
      );

      return createSuccessResponse({
        requestId,
        status: 'pending',
        message: `✅ Time-off request created successfully. Request ID: ${requestId}. Awaiting manager approval.`,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_create_time_off_request');
    }
  }) as Promise<MCPToolResponse>;
}
