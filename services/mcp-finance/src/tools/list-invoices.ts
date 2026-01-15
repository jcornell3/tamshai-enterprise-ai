/**
 * List Invoices Tool (v1.4 with Cursor-Based Pagination)
 *
 * Lists invoices with optional filters, implementing cursor-based pagination
 * to allow complete data retrieval across multiple API calls while maintaining
 * token efficiency per request (Section 5.3, Article III.2).
 *
 * Pagination Strategy:
 * - Each request returns up to `limit` records (default 50)
 * - If more records exist, response includes `nextCursor`
 * - Client passes cursor to get next page
 * - Cursor encodes last record's sort key for efficient keyset pagination
 */

import { z } from 'zod';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createSuccessResponse,
  PaginationMetadata,
} from '../types/response';
import {
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';

/**
 * Cursor structure for keyset pagination
 * Encoded as base64 JSON for opaque transport
 */
interface PaginationCursor {
  invoiceDate: string;
  createdAt: string;
  id: string;
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Input schema for list_invoices tool
 */
export const ListInvoicesInputSchema = z.object({
  vendor: z.string().optional(),
  status: z.enum(['pending', 'approved', 'paid', 'cancelled']).optional(),
  department: z.string().optional(),
  startDate: z.string().optional(),  // ISO 8601 date string (YYYY-MM-DD)
  endDate: z.string().optional(),    // ISO 8601 date string (YYYY-MM-DD)
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

// Use z.input to allow optional fields before parsing applies defaults
export type ListInvoicesInput = z.input<typeof ListInvoicesInputSchema>;

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
 * List invoices with filters and cursor-based pagination
 *
 * v1.4 Feature: Cursor-based pagination (Section 5.3)
 * - Queries for limit + 1 records to detect if more exist
 * - Returns nextCursor if more records are available
 * - Client can request subsequent pages using the cursor
 * - Enables complete data retrieval while maintaining token efficiency
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
    const { vendor, status, department, startDate, endDate, minAmount, maxAmount, limit, cursor } = validated;

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

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

    if (startDate) {
      whereClauses.push(`i.invoice_date >= $${paramIndex++}`);
      values.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`i.invoice_date <= $${paramIndex++}`);
      values.push(endDate);
    }

    if (minAmount !== undefined) {
      whereClauses.push(`i.amount >= $${paramIndex++}`);
      values.push(minAmount);
    }

    if (maxAmount !== undefined) {
      whereClauses.push(`i.amount <= $${paramIndex++}`);
      values.push(maxAmount);
    }

    // Cursor-based pagination: add WHERE clause to start after cursor position
    if (cursorData) {
      whereClauses.push(`(
        (i.invoice_date < $${paramIndex}) OR
        (i.invoice_date = $${paramIndex} AND i.created_at < $${paramIndex + 1}) OR
        (i.invoice_date = $${paramIndex} AND i.created_at = $${paramIndex + 1} AND i.id < $${paramIndex + 2})
      )`);
      values.push(cursorData.invoiceDate, cursorData.createdAt, cursorData.id);
      paramIndex += 3;
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

      // Check if more records exist
      const hasMore = result.rowCount! > limit;
      const invoices = hasMore
        ? result.rows.slice(0, limit)
        : result.rows;

      // Build pagination metadata
      let metadata: PaginationMetadata | undefined;

      if (hasMore || cursorData) {
        // Get the last record to build the next cursor
        const lastInvoice = invoices[invoices.length - 1];

        metadata = {
          hasMore,
          returnedCount: invoices.length,
          ...(hasMore && lastInvoice && {
            nextCursor: encodeCursor({
              invoiceDate: lastInvoice.invoice_date,
              createdAt: lastInvoice.created_at,
              id: lastInvoice.id,
            }),
            totalEstimate: `${limit}+`,
            hint: `To see more invoices, say "show next page" or "get more invoices". You can also use filters like vendor, status, department, or amount range to narrow results.`,
          }),
        };
      }

      return createSuccessResponse(invoices, metadata);
    } catch (error) {
      return handleDatabaseError(error as Error, 'list_invoices');
    }
  }) as Promise<MCPToolResponse<Invoice[]>>;
}
