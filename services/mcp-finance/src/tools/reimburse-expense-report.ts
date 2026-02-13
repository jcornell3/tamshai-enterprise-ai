/**
 * Reimburse Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Marks an approved expense report as reimbursed, changing status from APPROVED to REIMBURSED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only APPROVED reports can be reimbursed)
 * - Payment reference tracking
 * - Audit trail (reimbursed_by, reimbursed_at, payment_reference)
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
 * Input schema for reimburse_expense_report tool
 */
export const ReimburseExpenseReportInputSchema = z.object({
  reportId: z.string().uuid('Report ID must be a valid UUID'),
  paymentReference: z.string().max(100).optional(),
  paymentNotes: z.string().max(500).optional(),
});

export type ReimburseExpenseReportInput = z.infer<typeof ReimburseExpenseReportInputSchema>;

/**
 * Check if user has permission to mark expense reports as reimbursed
 */
function hasReimbursePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Reimburse expense report tool - Returns pending_confirmation for user approval
 */
export async function reimburseExpenseReport(
  input: ReimburseExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('reimburse_expense_report', async () => {
    // 1. Check permissions
    if (!hasReimbursePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { reportId, paymentReference, paymentNotes } = ReimburseExpenseReportInputSchema.parse(input);

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
          er.approved_by,
          er.approved_at,
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

      // 3. Check if report is in APPROVED status
      if (report.status !== 'APPROVED') {
        const suggestedAction = report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW'
          ? 'This expense report must be approved first. Use approve_expense_report.'
          : report.status === 'REJECTED'
            ? 'This expense report was rejected and cannot be reimbursed.'
            : report.status === 'REIMBURSED'
              ? 'This expense report has already been reimbursed.'
              : report.status === 'DRAFT'
                ? 'This expense report is still in DRAFT status and cannot be reimbursed.'
                : 'Only APPROVED expense reports can be marked as reimbursed.';

        return createErrorResponse(
          'INVALID_EXPENSE_REPORT_STATUS',
          `Cannot reimburse expense report "${report.report_number}" because it is in "${report.status}" status`,
          suggestedAction,
          { reportId, reportNumber: report.report_number, currentStatus: report.status, requiredStatus: 'APPROVED' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'reimburse_expense_report',
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
        paymentReference: paymentReference || null,
        paymentNotes: paymentNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `💰 **Mark Expense Report as Reimbursed?**

**Report Number:** ${report.report_number}
**Title:** ${report.title}
**Department:** ${report.department_code}
**Total Amount:** $${Number(report.total_amount).toLocaleString()}
**Items:** ${report.item_count} expense(s)
**Approved At:** ${report.approved_at || 'N/A'}
${paymentReference ? `**Payment Reference:** ${paymentReference}` : ''}
${paymentNotes ? `**Notes:** ${paymentNotes}` : ''}

This will change the expense report status from APPROVED to REIMBURSED.
The employee will be notified of the payment.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'reimburse_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed reimbursement (called by Gateway after user approval)
 */
export async function executeReimburseExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_reimburse_expense_report', async () => {
    const reportId = confirmationData.reportId as string;
    const paymentReference = confirmationData.paymentReference as string | null;

    try {
      const reimburserId = userContext.userId;

      // Update expense report status to REIMBURSED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expense_reports
        SET status = 'REIMBURSED',
            reimbursed_by = $2,
            reimbursed_at = NOW(),
            payment_reference = $3,
            updated_at = NOW()
        WHERE id = $1
          AND status = 'APPROVED'
        RETURNING id, report_number, title, total_amount
        `,
        [reportId, reimburserId, paymentReference]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const reimbursed = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense report ${reimbursed.report_number} "${reimbursed.title}" ($${Number(reimbursed.total_amount).toLocaleString()}) has been marked as reimbursed`,
        reportId: reimbursed.id,
        reportNumber: reimbursed.report_number,
        newStatus: 'REIMBURSED',
        paymentReference,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_reimburse_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
