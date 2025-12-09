/**
 * List Invoices Tool (v1.4 with Truncation Detection)
 *
 * Lists invoices with optional filters, implementing LIMIT+1 pattern
 * to detect when results are truncated (Section 5.3, Article III.2).
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  TruncationMetadata,
} from '../types/response';
import {
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Input schema for list_invoices tool
 */
export const ListInvoicesInputSchema = z.object({
  vendor: z.string().optional(),
  status: z.enum(['pending', 'approved', 'paid', 'cancelled']).optional(),
  department: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

export type ListInvoicesInput = z.infer<typeof ListInvoicesInputSchema>;

/**
 * Invoice data structure (matches actual schema)
 */
export interface Invoice {
  id: string;  // Actual column: id (not invoice_id)
  vendor_name: string;  // Actual column: vendor_name (not vendor)
  invoice_number: string;
  amount: number;
  currency: string;
  invoice_date: string;
  due_date: string;
  paid_date: string | null;
  status: string;
  department_code: string | null;  // Actual column: department_code (not department)
  description: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/**
 * List invoices with filters and truncation detection
 *
 * v1.4 Feature: LIMIT+1 query pattern (Section 5.3)
 * - Queries for limit + 1 records
 * - If we get more than limit, results are truncated
 * - Returns metadata.truncated = true with warning message
 * - Enforces Article III.2: 50-record maximum
 *
 * RLS automatically enforces data access based on roles.
 */
export async function listInvoices(
  input: ListInvoicesInput,
  userContext: UserContext
): Promise<MCPToolResponse<Invoice[]>> {
  return withErrorHandling('list_invoices', async () => {
    // Validate input
    const validated = ListInvoicesInputSchema.parse(input);
    const { vendor, status, department, minAmount, maxAmount, limit } = validated;

    // Build dynamic WHERE clauses (using actual schema columns)
    const whereClauses: string[] = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;

    if (vendor) {
      // Actual column: vendor_name (not vendor)
      whereClauses.push(`i.vendor_name ILIKE $${paramIndex++}`);
      values.push(`%${vendor}%`);
    }

    if (status) {
      whereClauses.push(`i.status = $${paramIndex++}`);
      values.push(status.toUpperCase());  // Schema uses uppercase (PENDING, APPROVED, etc.)
    }

    if (department) {
      // Actual column: department_code (not department)
      whereClauses.push(`i.department_code = $${paramIndex++}`);
      values.push(department);
    }

    if (minAmount !== undefined) {
      whereClauses.push(`i.amount >= $${paramIndex++}`);
      values.push(minAmount);
    }

    if (maxAmount !== undefined) {
      whereClauses.push(`i.amount <= $${paramIndex++}`);
      values.push(maxAmount);
    }

    const whereClause = whereClauses.join(' AND ');

    try {
      // v1.4: Query with LIMIT + 1 to detect truncation
      const queryLimit = limit + 1;

      const result = await queryWithRLS<Invoice>(
        userContext,
        `
        SELECT
          i.id,
          i.vendor_name,
          i.invoice_number,
          i.amount,
          i.currency,
          i.invoice_date::text as invoice_date,
          i.due_date::text as due_date,
          i.paid_date::text as paid_date,
          i.status,
          i.department_code,
          i.description,
          i.approved_by,
          i.approved_at::text as approved_at,
          i.created_at::text as created_at
        FROM finance.invoices i
        WHERE ${whereClause}
        ORDER BY i.invoice_date DESC, i.created_at DESC
        LIMIT $${paramIndex}
        `,
        [...values, queryLimit]
      );

      // v1.4: Check if results are truncated
      const isTruncated = result.rowCount! > limit;
      const invoices = isTruncated
        ? result.rows.slice(0, limit)  // Return only requested limit
        : result.rows;

      // v1.4: Build truncation metadata if needed
      let metadata: TruncationMetadata | undefined;

      if (isTruncated) {
        // Build filter description for warning message
        const filters: string[] = [];
        if (vendor) filters.push(`vendor containing "${vendor}"`);
        if (status) filters.push(`status="${status}"`);
        if (department) filters.push(`department="${department}"`);
        if (minAmount !== undefined) filters.push(`min amount=${minAmount}`);
        if (maxAmount !== undefined) filters.push(`max amount=${maxAmount}`);

        const filterDesc = filters.length > 0
          ? ` with filters: ${filters.join(', ')}`
          : '';

        metadata = {
          truncated: true,
          returnedCount: invoices.length,
          warning: `⚠️ Showing ${invoices.length} of 50+ invoices${filterDesc}. Results are incomplete. Please refine your query with more specific filters (e.g., vendor, status, department, or amount range).`,
        };
      }

      return createSuccessResponse(invoices, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_invoices');
    }
  }) as Promise<MCPToolResponse<Invoice[]>>;
}
