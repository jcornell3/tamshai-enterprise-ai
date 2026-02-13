/**
 * Delete Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Deletes an expense report. Only DRAFT or REJECTED reports can be deleted.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only DRAFT or REJECTED reports can be deleted)
 * - Permanent deletion with confirmation
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
 * Input schema for delete_expense_report tool
 */
export const DeleteExpenseReportInputSchema = z.object({
  reportId: z.string().uuid('Report ID must be a valid UUID'),
  reason: z.string().max(500).optional(),
});

export type DeleteExpenseReportInput = z.infer<typeof DeleteExpenseReportInputSchema>;

/**
 * Check if user has permission to delete expense reports
 */
function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Delete expense report tool - Returns pending_confirmation for user approval
 */
export async function deleteExpenseReport(
  input: DeleteExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('delete_expense_report', async () => {
    // 1. Check permissions
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { reportId, reason } = DeleteExpenseReportInputSchema.parse(input);

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

      // 3. Check if expense report can be deleted (only DRAFT or REJECTED)
      if (report.status !== 'DRAFT' && report.status !== 'REJECTED') {
        const suggestedAction = report.status === 'APPROVED'
          ? 'Approved expense reports cannot be deleted. They must be reimbursed first.'
          : report.status === 'REIMBURSED'
            ? 'Reimbursed expense reports cannot be deleted. They are kept for audit purposes.'
            : report.status === 'SUBMITTED' || report.status === 'UNDER_REVIEW'
              ? 'Submitted expense reports cannot be deleted. They must be rejected first.'
              : 'Only DRAFT or REJECTED expense reports can be deleted.';

        return createErrorResponse(
          'CANNOT_DELETE_EXPENSE_REPORT',
          `Cannot delete expense report "${report.report_number}" because it is in "${report.status}" status`,
          suggestedAction,
          { reportId, reportNumber: report.report_number, currentStatus: report.status, allowedStatuses: ['DRAFT', 'REJECTED'] }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'delete_expense_report',
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
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `🗑️ **Delete Expense Report?**

**Report Number:** ${report.report_number}
**Title:** ${report.title}
**Department:** ${report.department_code}
**Total Amount:** $${Number(report.total_amount).toLocaleString()}
**Items:** ${report.item_count} expense(s)
**Current Status:** ${report.status}
${reason ? `**Reason:** ${reason}` : ''}

⚠️ This action will permanently delete this expense report and all its line items. This cannot be undone.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'delete_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed deletion (called by Gateway after user approval)
 */
export async function executeDeleteExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_delete_expense_report', async () => {
    const reportId = confirmationData.reportId as string;

    try {
      // Delete the expense items first (cascade)
      await queryWithRLS(
        userContext,
        `DELETE FROM finance.expense_items WHERE expense_report_id = $1`,
        [reportId]
      );

      // Delete the expense report (only if DRAFT or REJECTED)
      const result = await queryWithRLS(
        userContext,
        `
        DELETE FROM finance.expense_reports
        WHERE id = $1
          AND status IN ('DRAFT', 'REJECTED')
        RETURNING id, report_number, title, total_amount
        `,
        [reportId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(reportId);
      }

      const deleted = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense report ${deleted.report_number} "${deleted.title}" ($${Number(deleted.total_amount).toLocaleString()}) has been deleted`,
        reportId: deleted.id,
        reportNumber: deleted.report_number,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_delete_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
