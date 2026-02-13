/**
 * Approve/Reject Time-Off Request Tool
 *
 * Allows managers to approve or reject time-off requests from their team.
 * Uses human-in-the-loop confirmation (v1.4 Section 5.6).
 *
 * Features:
 * - Manager validation (must be the employee's manager)
 * - Balance adjustment on approval
 * - Audit trail with approver notes
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
 * Input schema for approve_time_off_request tool
 */
export const ApproveTimeOffRequestInputSchema = z.object({
  requestId: z.string().uuid(),
  approved: z.boolean(),
  approverNotes: z.string().max(500).optional(),
});

export type ApproveTimeOffRequestInput = z.input<typeof ApproveTimeOffRequestInputSchema>;

/**
 * Approve or reject a time-off request (with confirmation)
 *
 * Requires manager role and the request must be from a direct report.
 */
export async function approveTimeOffRequest(
  input: ApproveTimeOffRequestInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('approve_time_off_request', async () => {
    // Check for manager role
    const isManager = userContext.roles.some(role =>
      role === 'manager' || role === 'hr-write' || role === 'executive'
    );

    if (!isManager) {
      return createErrorResponse(
        'INSUFFICIENT_PERMISSIONS',
        'This operation requires manager access',
        'Contact your administrator if you believe you should have manager access'
      );
    }

    const validated = ApproveTimeOffRequestInputSchema.parse(input);
    const { requestId, approved, approverNotes } = validated;

    try {
      // Get the request details
      const requestLookup = await queryWithRLS(
        userContext,
        `SELECT
          r.id,
          r.employee_id,
          e.first_name || ' ' || e.last_name as employee_name,
          e.manager_id,
          r.type_code,
          t.type_name,
          r.start_date::text,
          r.end_date::text,
          r.total_days,
          r.status,
          r.notes
        FROM hr.time_off_requests r
        JOIN hr.employees e ON r.employee_id = e.id
        JOIN hr.time_off_types t ON r.type_code = t.type_code
        WHERE r.id = $1`,
        [requestId]
      );

      if (requestLookup.rows.length === 0) {
        return createErrorResponse(
          'REQUEST_NOT_FOUND',
          `Time-off request ${requestId} not found`,
          'Verify the request ID is correct'
        );
      }

      const request = requestLookup.rows[0];

      // Check if already processed
      if (request.status !== 'pending') {
        return createErrorResponse(
          'REQUEST_ALREADY_PROCESSED',
          `This request has already been ${request.status}`,
          'Only pending requests can be approved or rejected'
        );
      }

      // Get the manager's employee ID
      const managerLookup = await queryWithRLS(
        userContext,
        'SELECT id FROM hr.employees WHERE work_email = $1',
        [userContext.email]
      );

      if (managerLookup.rows.length === 0) {
        return createErrorResponse(
          'MANAGER_NOT_FOUND',
          'Could not find your employee record',
          'Ensure your email is registered in the HR system'
        );
      }

      const managerId = managerLookup.rows[0].id;

      // Verify the request is from a direct report (or HR has override)
      const isDirectReport = request.manager_id === managerId;
      const isHR = userContext.roles.some(role => role === 'hr-write');

      if (!isDirectReport && !isHR) {
        return createErrorResponse(
          'NOT_YOUR_REPORT',
          'You can only approve/reject requests from your direct reports',
          'Contact HR if you need to process requests for employees outside your team'
        );
      }

      // Generate confirmation ID
      const confirmationId = uuidv4();
      const action = approved ? 'approve' : 'reject';

      // Store pending confirmation
      await storePendingConfirmation(confirmationId, {
        action: 'approve_time_off_request',
        mcpServer: 'hr',
        userId: userContext.userId,
        requestId,
        employeeId: request.employee_id,
        approved,
        approverNotes: approverNotes || null,
        totalDays: request.total_days,
        typeCode: request.type_code,
        startDate: request.start_date,
        timestamp: Date.now(),
      });

      const actionEmoji = approved ? '✅' : '❌';
      const actionText = approved ? 'APPROVE' : 'REJECT';

      const message = `${actionEmoji} **${actionText} Time-Off Request**

**Employee:** ${request.employee_name}
**Type:** ${request.type_name}
**Dates:** ${request.start_date} to ${request.end_date}
**Total Days:** ${request.total_days} business day(s)
**Employee Notes:** ${request.notes || 'None'}
**Your Notes:** ${approverNotes || 'None'}

Do you want to ${action.toLowerCase()} this request?`;

      return createPendingConfirmationResponse(confirmationId, message, {
        action: 'approve_time_off_request',
        mcpServer: 'hr',
        userId: userContext.userId,
        requestId,
        employeeName: request.employee_name,
        approved,
        timestamp: Date.now(),
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_time_off_request');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the approval/rejection after confirmation
 */
export async function executeApproveTimeOffRequest(
  data: {
    requestId: string;
    employeeId: string;
    approved: boolean;
    approverNotes: string | null;
    totalDays: number;
    typeCode: string;
    startDate: string;
  },
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_approve_time_off_request', async () => {
    const { requestId, employeeId, approved, approverNotes, totalDays, typeCode, startDate } = data;

    try {
      // Get approver's employee ID
      const approverLookup = await queryWithRLS(
        userContext,
        'SELECT id FROM hr.employees WHERE work_email = $1',
        [userContext.email]
      );

      if (approverLookup.rows.length === 0) {
        return createErrorResponse(
          'APPROVER_NOT_FOUND',
          'Could not find your employee record',
          'Please try again or contact support'
        );
      }

      const approverId = approverLookup.rows[0].id;
      const newStatus = approved ? 'approved' : 'rejected';

      // Update the request
      await queryWithRLS(
        userContext,
        `UPDATE hr.time_off_requests
        SET status = $1, approver_id = $2, approved_at = NOW(), approver_notes = $3, updated_at = NOW()
        WHERE id = $4`,
        [newStatus, approverId, approverNotes, requestId]
      );

      // Update balances
      const fiscalYear = new Date(startDate).getFullYear();

      if (approved) {
        // Move from pending to used
        await queryWithRLS(
          userContext,
          `UPDATE hr.time_off_balances
          SET pending = pending - $1, used = used + $1, updated_at = NOW()
          WHERE employee_id = $2 AND type_code = $3 AND fiscal_year = $4`,
          [totalDays, employeeId, typeCode, fiscalYear]
        );
      } else {
        // Remove from pending only
        await queryWithRLS(
          userContext,
          `UPDATE hr.time_off_balances
          SET pending = pending - $1, updated_at = NOW()
          WHERE employee_id = $2 AND type_code = $3 AND fiscal_year = $4`,
          [totalDays, employeeId, typeCode, fiscalYear]
        );
      }

      const actionText = approved ? 'approved' : 'rejected';
      const emoji = approved ? '✅' : '❌';

      return createSuccessResponse({
        requestId,
        status: newStatus,
        message: `${emoji} Time-off request ${actionText} successfully.`,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_time_off_request');
    }
  }) as Promise<MCPToolResponse>;
}
