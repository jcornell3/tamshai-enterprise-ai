/**
 * Approve Invoice Tool (v1.4 with Human-in-the-Loop Confirmation)
 *
 * Approves a pending invoice, changing its status from PENDING to APPROVED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING invoices can be approved)
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
  handleInvoiceNotFound,
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for approve_invoice tool
 */
export const ApproveInvoiceInputSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID or number is required'),
  approverNotes: z.string().max(500).optional(),
});

export type ApproveInvoiceInput = z.infer<typeof ApproveInvoiceInputSchema>;

/**
 * Check if user has permission to approve invoices
 */
function hasApprovePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Approve invoice tool - Returns pending_confirmation for user approval
 *
 * This is a write operation that requires:
 * 1. finance-write or executive role
 * 2. User confirmation (v1.4 - Section 5.6)
 * 3. Invoice must be in PENDING status
 *
 * Flow:
 * 1. Check permissions
 * 2. Verify invoice exists and get details
 * 3. Check business rules (must be PENDING)
 * 4. Generate confirmation ID
 * 5. Store pending action in Redis (5-minute TTL)
 * 6. Return pending_confirmation response
 */
export async function approveInvoice(
  input: ApproveInvoiceInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('approve_invoice', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { invoiceId, approverNotes } = ApproveInvoiceInputSchema.parse(input);

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
          i.description
        FROM finance.invoices i
        WHERE ${isUUID ? 'i.id = $1' : 'i.invoice_number = $1'}
        `,
        [invoiceId]
      );

      if (invoiceResult.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const invoice = invoiceResult.rows[0];

      // 3. Check if invoice is in PENDING status
      if (invoice.status !== 'PENDING') {
        return createErrorResponse(
          'INVALID_INVOICE_STATUS',
          `Cannot approve invoice "${invoice.invoice_number}" because it is in "${invoice.status}" status`,
          'Only PENDING invoices can be approved. Use list_invoices to find pending invoices.',
          { invoiceId, currentStatus: invoice.status, requiredStatus: 'PENDING' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'approve_invoice',
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
        approverNotes: approverNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `✅ **Approve Invoice ${invoice.invoice_number}?**

**Vendor:** ${invoice.vendor_name}
**Amount:** ${invoice.currency} ${invoice.amount}
**Department:** ${invoice.department_code}
**Due Date:** ${invoice.due_date || 'Not specified'}
**Description:** ${invoice.description || 'None'}
${approverNotes ? `**Your Notes:** ${approverNotes}` : ''}

This will change the invoice status from PENDING to APPROVED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_invoice');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed approval (called by Gateway after user approval)
 *
 * This function is called by the Gateway's /api/confirm endpoint
 * after the user clicks "Approve" in the UI.
 */
export async function executeApproveInvoice(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_approve_invoice', async () => {
    const invoiceId = confirmationData.invoiceId as string;
    const approverNotes = confirmationData.approverNotes as string | null;

    try {
      // Get approver's employee ID from HR database (if available)
      // For now, we'll use the user ID directly
      const approverId = userContext.userId;

      // Update invoice status to APPROVED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.invoices
        SET status = 'APPROVED',
            approved_by = $2,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND status = 'PENDING'
        RETURNING id, invoice_number, vendor_name, amount, currency
        `,
        [invoiceId, approverId]
      );

      if (result.rowCount === 0) {
        return handleInvoiceNotFound(invoiceId);
      }

      const approved = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Invoice ${approved.invoice_number} from ${approved.vendor_name} has been approved for ${approved.currency} ${approved.amount}`,
        invoiceId: approved.id,
        invoiceNumber: approved.invoice_number,
        newStatus: 'APPROVED',
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_invoice');
    }
  }) as Promise<MCPToolResponse>;
}
