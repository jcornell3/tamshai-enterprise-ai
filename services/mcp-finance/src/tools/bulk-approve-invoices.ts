/**
 * Bulk Approve Invoices Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Approves multiple pending invoices in a single operation.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING invoices can be approved)
 * - Single confirmation for all invoices
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
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for bulk_approve_invoices tool
 */
export const BulkApproveInvoicesInputSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1, 'At least one invoice ID is required'),
  approverNotes: z.string().max(500).optional(),
});

export type BulkApproveInvoicesInput = z.infer<typeof BulkApproveInvoicesInputSchema>;

/**
 * Check if user has permission to approve invoices
 */
function hasApprovePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Bulk approve invoices tool - Returns pending_confirmation for user approval
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify all invoices exist and are in PENDING status
 * 3. Generate single confirmation ID
 * 4. Store pending action in Redis (5-minute TTL)
 * 5. Return pending_confirmation response
 */
export async function bulkApproveInvoices(
  input: BulkApproveInvoicesInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('bulk_approve_invoices', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { invoiceIds, approverNotes } = BulkApproveInvoicesInputSchema.parse(input);

    try {
      // 2. Verify invoices exist and get details
      // Use separate placeholder sets for UUID id and varchar invoice_number
      // to avoid PostgreSQL type inference conflict
      const idPlaceholders = invoiceIds.map((_, i) => `$${i + 1}::uuid`).join(', ');
      const numPlaceholders = invoiceIds.map((_, i) => `$${invoiceIds.length + i + 1}`).join(', ');
      const invoiceResult = await queryWithRLS(
        userContext,
        `
        SELECT
          i.id,
          i.vendor_name,
          i.invoice_number,
          i.amount,
          i.currency,
          i.department_code,
          i.status
        FROM finance.invoices i
        WHERE i.id IN (${idPlaceholders}) OR i.invoice_number IN (${numPlaceholders})
        `,
        [...invoiceIds, ...invoiceIds]
      );

      if (invoiceResult.rowCount === 0) {
        return createErrorResponse(
          'INVOICES_NOT_FOUND',
          'None of the specified invoices were found',
          'Use list_invoices tool to find valid invoice IDs.',
          { invoiceIds }
        );
      }

      // Check for non-PENDING invoices
      const nonPending = invoiceResult.rows.filter((inv: any) => inv.status !== 'PENDING');
      if (nonPending.length > 0) {
        const skippedList = nonPending
          .map((inv: any) => `${inv.invoice_number} (${inv.status})`)
          .join(', ');
        return createErrorResponse(
          'INVALID_INVOICE_STATUS',
          `Cannot approve invoices that are not in PENDING status: ${skippedList}`,
          'Only PENDING invoices can be approved. Remove the non-PENDING invoices from your selection.',
          { nonPendingInvoices: nonPending.map((inv: any) => ({ id: inv.id, status: inv.status })) }
        );
      }

      const pendingInvoices = invoiceResult.rows;

      // 3. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();
      const totalAmount = pendingInvoices.reduce(
        (sum: number, inv: any) => sum + parseFloat(inv.amount),
        0
      );

      const confirmationData = {
        action: 'bulk_approve_invoices',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        invoiceIds: pendingInvoices.map((inv: any) => inv.id),
        invoiceCount: pendingInvoices.length,
        totalAmount,
        currency: pendingInvoices[0]?.currency || 'USD',
        approverNotes: approverNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 4. Build confirmation message
      const invoiceList = pendingInvoices
        .map((inv: any) => `  - ${inv.invoice_number}: ${inv.vendor_name} (${inv.currency} ${inv.amount})`)
        .join('\n');

      const message = `✅ **Bulk Approve ${pendingInvoices.length} Invoice(s)?**

**Total Amount:** ${pendingInvoices[0]?.currency || 'USD'} ${totalAmount.toFixed(2)}

**Invoices:**
${invoiceList}
${approverNotes ? `\n**Your Notes:** ${approverNotes}` : ''}

This will change all listed invoices from PENDING to APPROVED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'bulk_approve_invoices');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed bulk approval (called by Gateway after user approval)
 */
export async function executeBulkApproveInvoices(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_bulk_approve_invoices', async () => {
    const invoiceIds = confirmationData.invoiceIds as string[];
    const approverId = userContext.userId;

    try {
      const placeholders = invoiceIds.map((_, i) => `$${i + 2}`).join(', ');
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.invoices
        SET status = 'APPROVED',
            approved_by = $1,
            approved_at = NOW()
        WHERE id IN (${placeholders})
          AND status = 'PENDING'
        RETURNING id, invoice_number, vendor_name, amount, currency
        `,
        [approverId, ...invoiceIds]
      );

      if (result.rowCount === 0) {
        return createErrorResponse(
          'NO_INVOICES_APPROVED',
          'No invoices were approved. They may have been modified since the confirmation was created.',
          'Use list_invoices to check current invoice statuses.',
          { invoiceIds }
        );
      }

      const approved = result.rows;
      const totalAmount = approved.reduce(
        (sum: number, inv: any) => sum + parseFloat(inv.amount),
        0
      );

      return createSuccessResponse({
        success: true,
        message: `${approved.length} invoice(s) approved successfully`,
        approvedCount: approved.length,
        totalAmount,
        invoices: approved.map((inv: any) => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          vendor: inv.vendor_name,
          amount: inv.amount,
          currency: inv.currency,
        })),
        newStatus: 'APPROVED',
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_bulk_approve_invoices');
    }
  }) as Promise<MCPToolResponse>;
}
