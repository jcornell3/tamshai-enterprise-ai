/**
 * Pay Invoice Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Marks an approved invoice as paid, changing its status from APPROVED to PAID.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only APPROVED invoices can be paid)
 * - Payment date tracking
 * - Payment reference support
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
  handleInvoiceNotFound,
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for pay_invoice tool
 */
export const PayInvoiceInputSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID or number is required'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format').optional(),
  paymentReference: z.string().max(100).optional(),
  paymentNotes: z.string().max(500).optional(),
});

export type PayInvoiceInput = z.infer<typeof PayInvoiceInputSchema>;

/**
 * Check if user has permission to mark invoices as paid
 */
function hasPayPermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Pay invoice tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Invoice must be in APPROVED status
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify invoice exists and get details
 * 3. Check business rules (must be APPROVED)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function payInvoice(
  input: PayInvoiceInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('pay_invoice', async () => {
    // 1. Check permissions
    if (!hasPayPermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { invoiceId, paymentDate, paymentReference, paymentNotes } = PayInvoiceInputSchema.parse(input);

    // Default payment date to today if not specified
    const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];

    try {
      // 2. Verify invoice exists and get details
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId);
      const invoiceResult = await queryWithRLS(
        userContext,
        `
        SELECT
          i.id,
          i.vendor_name,
          i.invoice_number,
          i.amount,
          i.currency,
          i.invoice_date,
          i.due_date,
          i.department_code,
          i.status,
          i.description,
          i.approved_by,
          i.approved_at
        FROM finance.invoices i
        WHERE ${isUUID ? 'i.id = $1' : 'i.invoice_number = $1'}
        `,
        [invoiceId]
      );

      if (invoiceResult.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const invoice = invoiceResult.rows[0];

      // 3. Check if invoice is in APPROVED status
      if (invoice.status !== 'APPROVED') {
        const suggestedAction = invoice.status === 'PENDING'
          ? 'This invoice needs to be approved first. Use approve_invoice tool.'
          : invoice.status === 'PAID'
            ? 'This invoice has already been paid.'
            : 'Only APPROVED invoices can be marked as paid.';

        return createErrorResponse(
          'INVALID_INVOICE_STATUS',
          `Cannot pay invoice "${invoice.invoice_number}" because it is in "${invoice.status}" status`,
          suggestedAction,
          { invoiceId, currentStatus: invoice.status, requiredStatus: 'APPROVED' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'pay_invoice',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        invoiceId: invoice.id,
        vendor: invoice.vendor_name,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        department: invoice.department_code,
        status: invoice.status,
        paymentDate: effectivePaymentDate,
        paymentReference: paymentReference || null,
        paymentNotes: paymentNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `💰 **Mark Invoice ${invoice.invoice_number} as Paid?**

**Vendor:** ${invoice.vendor_name}
**Amount:** ${invoice.currency} ${invoice.amount}
**Department:** ${invoice.department_code}
**Due Date:** ${invoice.due_date || 'Not specified'}
**Payment Date:** ${effectivePaymentDate}
${paymentReference ? `**Payment Reference:** ${paymentReference}` : ''}
${paymentNotes ? `**Notes:** ${paymentNotes}` : ''}

This will change the invoice status from APPROVED to PAID.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'pay_invoice');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed payment (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executePayInvoice(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_pay_invoice', async () => {
    const invoiceId = confirmationData.invoiceId as string;
    const paymentDate = confirmationData.paymentDate as string;

    try {
      // Update invoice status to PAID
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.invoices
        SET status = 'PAID',
            paid_date = $2,
            updated_at = NOW()
        WHERE id = $1
          AND status = 'APPROVED'
        RETURNING id, invoice_number, vendor_name, amount, currency
        `,
        [invoiceId, paymentDate]
      );

      if (result.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const paid = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Invoice ${paid.invoice_number} from ${paid.vendor_name} has been marked as paid (${paid.currency} ${paid.amount})`,
        invoiceId: paid.id,
        invoiceNumber: paid.invoice_number,
        newStatus: 'PAID',
        paymentDate,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_pay_invoice');
    }
  }) as Promise<MCPToolResponse>;
}
