/**
 * Shared API Response type for all Tamshai web applications.
 *
 * This is the superset definition consolidating APIResponse<T> from:
 * - HR, Sales, Support apps (types.ts)
 * - Finance app pages (inline definitions)
 * - Tax app (TaxApiResponse<T>)
 *
 * All fields except `status` are optional to accommodate both full MCP
 * responses (with confirmations, errors, pagination) and simpler
 * read-only dashboard responses.
 */
export interface APIResponse<T> {
  status: 'success' | 'error' | 'pending_confirmation';
  data?: T;
  confirmationId?: string;
  message?: string;
  metadata?: {
    truncated?: boolean;
    hasMore?: boolean;
    nextCursor?: string;
    returnedCount?: number;
    totalCount?: string;
    totalEstimate?: string;
    hint?: string;
    warning?: string;
  };
  error?: string;
  code?: string;
  suggestedAction?: string;
}
