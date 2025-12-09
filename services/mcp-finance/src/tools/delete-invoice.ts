/**
 * Delete Invoice Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Implements Section 5.6: Write operations require user confirmation.
 * This tool generates a pending_confirmation response instead of
 * immediately executing the deletion.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
} from '../types/response';
import {
  handleInvoiceNotFound,
  handleInsufficientPermissions,
  handleCannotDeleteApprovedInvoice,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for delete_invoice tool
 */
export const DeleteInvoiceInputSchema = z.object({
  invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
  reason: z.string().optional(),
});

export type DeleteInvoiceInput = z.infer<typeof DeleteInvoiceInputSchema>;

/**
 * Check if user has permission to delete invoices
 */
function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Delete invoice tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Invoice must not be approved
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify invoice exists and get details
 * 3. Check business rules (not approved)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function deleteInvoice(
  input: DeleteInvoiceInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('delete_invoice', async () => {
    // 1. Check permissions
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { invoiceId, reason } = DeleteInvoiceInputSchema.parse(input);

    try {
      // 2. Verify invoice exists and get details
      const invoiceResult = await queryWithRLS(
        userContext,
        `
        SELECT
          i.invoice_id,
          i.vendor,
          i.invoice_number,
          i.amount,
          i.currency,
          i.invoice_date,
          i.department,
          i.status,
          i.description
        FROM finance.invoices i
        WHERE i.invoice_id = $1
        `,
        [invoiceId]
      );

      if (invoiceResult.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const invoice = invoiceResult.rows[0];

      // 3. Check if invoice is approved (cannot delete approved invoices)
      if (invoice.status === 'approved' || invoice.status === 'paid') {
        return handleCannotDeleteApprovedInvoice(invoiceId);
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'delete_invoice',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        invoiceId,
        vendor: invoice.vendor,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        department: invoice.department,
        status: invoice.status,
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `⚠️ Delete invoice ${invoice.invoice_number} from ${invoice.vendor}?

Amount: ${invoice.currency} ${invoice.amount}
Department: ${invoice.department}
Status: ${invoice.status}
${reason ? `Reason: ${reason}` : ''}

This action will permanently delete the invoice record and cannot be undone.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'delete_invoice');
    }
  }) as Promise<MCPToolResponse<any>>;
}

/**
 * Execute the confirmed deletion (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executeDeleteInvoice(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_delete_invoice', async () => {
    const invoiceId = confirmationData.invoiceId as string;

    try {
      // Hard delete invoice
      const result = await queryWithRLS(
        userContext,
        `
        DELETE FROM finance.invoices
        WHERE invoice_id = $1
          AND status IN ('pending', 'cancelled')
        RETURNING invoice_id, vendor, invoice_number
        `,
        [invoiceId]
      );

      if (result.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const deleted = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Invoice ${deleted.invoice_number} from ${deleted.vendor} has been successfully deleted`,
        invoiceId: deleted.invoice_id,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_delete_invoice');
    }
  }) as Promise<MCPToolResponse<any>>;
}
