/**
 * Reject Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Rejects a submitted expense report, changing its status from SUBMITTED/UNDER_REVIEW to REJECTED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only SUBMITTED/UNDER_REVIEW reports can be rejected)
 * - Rejection reason required
 * - Audit trail (rejected_by, rejected_at, rejection_reason)
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import {
  handleExpenseReportNotFound,
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for reject_expense_report tool
 */
export const RejectExpenseReportInputSchema = z.object({
  reportId: z.string().uuid('Report ID must be a valid UUID'),
  rejectionReason: z.string().min(10, 'Rejection reason must be at least 10 characters').max(500),
});

export type RejectExpenseReportInput = z.infer<typeof RejectExpenseReportInputSchema>;

/**
 * Check if user has permission to reject expense reports
 */
function hasRejectPermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Reject expense report tool - Returns pending_confirmation for user approval
 */
export async function rejectExpenseReport(
  input: RejectExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('reject_expense_report', async () => {
    // 1. Check permissions
    if (!hasRejectPermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { reportId, rejectionReason } = RejectExpenseReportInputSchema.parse(input);

    try {
      // 2. Verify expense report exists and get details
      const reportResult = await queryWithRLS(
        userContext,
        `
        SELECT
          er.id,
          er.report_number,
          er.employee_id,
          er.department_code,
          er.title,
          er.total_amount,
          er.status,
          er.submission_date,
          (SELECT COUNT(*) FROM finance.expense_items ei WHERE ei.expense_report_id = er.id) as item_count
        FROM finance.expense_reports er
        WHERE er.id = $1
        `,
        [reportId]
      );

      if (reportResult.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const report = reportResult.rows[0];

      // 3. Check if report is in a rejectable status (SUBMITTED or UNDER_REVIEW)
      if (report.status !== 'SUBMITTED' && report.status !== 'UNDER_REVIEW') {
        const suggestedAction = report.status === 'APPROVED'
          ? 'This expense report has already been approved and cannot be rejected.'
          : report.status === 'REIMBURSED'
            ? 'This expense report has been reimbursed and cannot be rejected.'
            : report.status === 'DRAFT'
              ? 'This expense report is still in DRAFT status. The employee must submit it first.'
              : report.status === 'REJECTED'
                ? 'This expense report has already been rejected.'
                : 'Only SUBMITTED or UNDER_REVIEW expense reports can be rejected.';

        return createErrorResponse(
          'INVALID_EXPENSE_REPORT_STATUS',
          `Cannot reject expense report "${report.report_number}" because it is in "${report.status}" status`,
          suggestedAction,
          { reportId, reportNumber: report.report_number, currentStatus: report.status, requiredStatus: 'SUBMITTED or UNDER_REVIEW' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'reject_expense_report',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        reportId: report.id,
        reportNumber: report.report_number,
        employeeId: report.employee_id,
        departmentCode: report.department_code,
        title: report.title,
        totalAmount: report.total_amount,
        itemCount: report.item_count,
        status: report.status,
        rejectionReason,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `❌ **Reject Expense Report?**

**Report Number:** ${report.report_number}
**Title:** ${report.title}
**Department:** ${report.department_code}
**Total Amount:** $${Number(report.total_amount).toLocaleString()}
**Items:** ${report.item_count} expense(s)
**Submitted:** ${report.submission_date || 'N/A'}

**Rejection Reason:**
${rejectionReason}

This will change the expense report status from ${report.status} to REJECTED.
The employee will be notified and may resubmit with corrections.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'reject_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed rejection (called by Gateway after user approval)
 */
export async function executeRejectExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_reject_expense_report', async () => {
    const reportId = confirmationData.reportId as string;
    const rejectionReason = confirmationData.rejectionReason as string;

    try {
      const rejecterId = userContext.userId;

      // Update expense report status to REJECTED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expense_reports
        SET status = 'REJECTED',
            rejected_by = $2,
            rejected_at = NOW(),
            rejection_reason = $3,
            updated_at = NOW()
        WHERE id = $1
          AND (status = 'SUBMITTED' OR status = 'UNDER_REVIEW')
        RETURNING id, report_number, title, total_amount
        `,
        [reportId, rejecterId, rejectionReason]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const rejected = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense report ${rejected.report_number} "${rejected.title}" ($${Number(rejected.total_amount).toLocaleString()}) has been rejected`,
        reportId: rejected.id,
        reportNumber: rejected.report_number,
        newStatus: 'REJECTED',
        rejectionReason,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_reject_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
