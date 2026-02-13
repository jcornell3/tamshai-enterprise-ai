/**
 * Approve Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Approves a submitted expense report, changing its status from SUBMITTED/UNDER_REVIEW to APPROVED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only SUBMITTED/UNDER_REVIEW reports can be approved)
 * - Audit trail (approved_by, approved_at)
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
 * Input schema for approve_expense_report tool
 */
export const ApproveExpenseReportInputSchema = z.object({
  reportId: z.string().uuid('Report ID must be a valid UUID'),
  approverNotes: z.string().max(500).optional(),
});

export type ApproveExpenseReportInput = z.infer<typeof ApproveExpenseReportInputSchema>;

/**
 * Check if user has permission to approve expense reports
 */
function hasApprovePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Approve expense report tool - Returns pending_confirmation for user approval
 */
export async function approveExpenseReport(
  input: ApproveExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('approve_expense_report', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { reportId, approverNotes } = ApproveExpenseReportInputSchema.parse(input);

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

      // 3. Check if report is in an approvable status (SUBMITTED or UNDER_REVIEW)
      if (report.status !== 'SUBMITTED' && report.status !== 'UNDER_REVIEW') {
        const suggestedAction = report.status === 'APPROVED'
          ? 'This expense report has already been approved. Use reimburse_expense_report to mark it as reimbursed.'
          : report.status === 'REIMBURSED'
            ? 'This expense report has already been reimbursed.'
            : report.status === 'DRAFT'
              ? 'This expense report is still in DRAFT status. The employee must submit it first.'
              : report.status === 'REJECTED'
                ? 'This expense report has been rejected. The employee may resubmit with corrections.'
                : 'Only SUBMITTED or UNDER_REVIEW expense reports can be approved.';

        return createErrorResponse(
          'INVALID_EXPENSE_REPORT_STATUS',
          `Cannot approve expense report "${report.report_number}" because it is in "${report.status}" status`,
          suggestedAction,
          { reportId, reportNumber: report.report_number, currentStatus: report.status, requiredStatus: 'SUBMITTED or UNDER_REVIEW' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'approve_expense_report',
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
        approverNotes: approverNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `✅ **Approve Expense Report?**

**Report Number:** ${report.report_number}
**Title:** ${report.title}
**Department:** ${report.department_code}
**Total Amount:** $${Number(report.total_amount).toLocaleString()}
**Items:** ${report.item_count} expense(s)
**Submitted:** ${report.submission_date || 'N/A'}
${approverNotes ? `**Your Notes:** ${approverNotes}` : ''}

This will change the expense report status from ${report.status} to APPROVED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed approval (called by Gateway after user approval)
 */
export async function executeApproveExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_approve_expense_report', async () => {
    const reportId = confirmationData.reportId as string;

    try {
      const approverId = userContext.userId;

      // Update expense report status to APPROVED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expense_reports
        SET status = 'APPROVED',
            approved_by = $2,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND (status = 'SUBMITTED' OR status = 'UNDER_REVIEW')
        RETURNING id, report_number, title, total_amount
        `,
        [reportId, approverId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const approved = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense report ${approved.report_number} "${approved.title}" ($${Number(approved.total_amount).toLocaleString()}) has been approved`,
        reportId: approved.id,
        reportNumber: approved.report_number,
        newStatus: 'APPROVED',
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
