/**
 * MCP Tool Response Types (Architecture v1.4)
 *
 * Shared response types used across all MCP services.
 * Implements Section 7.4 (LLM-Friendly Error Schemas) and Article II.3.
 */

/**
 * Pagination metadata for cursor-based navigation
 * Enables complete data retrieval across multiple API calls
 */
export interface PaginationMetadata {
  /** Whether more records exist beyond this page */
  hasMore: boolean;
  /** Cursor to fetch next page (base64-encoded) */
  nextCursor?: string;
  /** Number of records in this response */
  returnedCount: number;
  /** Estimated total records (e.g., "100+" if unknown exact count) */
  totalEstimate?: string;
  /** AI-friendly hint for requesting more data */
  hint?: string;
}

/**
 * Success response with optional pagination metadata
 */
export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: PaginationMetadata;
}

/**
 * Error response with LLM-friendly structure (Article II.3)
 */
export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction: string;
  details?: Record<string, unknown>;
}

/**
 * Pending confirmation response for write operations (Section 5.6)
 */
export interface MCPPendingConfirmationResponse {
  status: 'pending_confirmation';
  confirmationId: string;
  message: string;
  confirmationData: {
    action: string;
    mcpServer: string;
    userId: string;
    timestamp: number;
    [key: string]: unknown;
  };
}

/**
 * Discriminated union of all possible MCP tool responses
 */
export type MCPToolResponse<T = unknown> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

/**
 * Helper to create a success response with pagination
 */
export function createSuccessResponse<T>(
  data: T,
  metadata?: PaginationMetadata
): MCPSuccessResponse<T> {
  return {
    status: 'success',
    data,
    ...(metadata && { metadata }),
  };
}

/**
 * Helper to create an error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  suggestedAction: string,
  details?: Record<string, unknown>
): MCPErrorResponse {
  return {
    status: 'error',
    code,
    message,
    suggestedAction,
    ...(details && { details }),
  };
}

/**
 * Helper to create a pending confirmation response
 */
export function createPendingConfirmationResponse(
  confirmationId: string,
  message: string,
  confirmationData: MCPPendingConfirmationResponse['confirmationData']
): MCPPendingConfirmationResponse {
  return {
    status: 'pending_confirmation',
    confirmationId,
    message,
    confirmationData,
  };
}

/**
 * Cursor pagination utilities
 */
export interface PaginationCursor {
  sortKey: string | number | Date;
  id: string;
}

export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

/**
 * Build pagination metadata from query results
 *
 * @param items Array of items returned (should be limit + 1 to detect hasMore)
 * @param limit The requested limit
 * @param getSortKey Function to extract sort key from an item
 * @param getId Function to extract ID from an item
 */
export function buildPaginationMetadata<T>(
  items: T[],
  limit: number,
  getSortKey: (item: T) => string | number | Date,
  getId: (item: T) => string
): { data: T[]; metadata?: PaginationMetadata } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  if (data.length === 0) {
    return { data };
  }

  const lastItem = data[data.length - 1]!;
  const metadata: PaginationMetadata = {
    hasMore,
    returnedCount: data.length,
    ...(hasMore && {
      nextCursor: encodeCursor({
        sortKey: getSortKey(lastItem),
        id: getId(lastItem),
      }),
      hint: `More records available. Call again with cursor parameter to retrieve the next ${limit} records.`,
    }),
  };

  return { data, metadata };
}
