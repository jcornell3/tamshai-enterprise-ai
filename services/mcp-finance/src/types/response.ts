/**
 * MCP Tool Response Types (Architecture v1.4)
 *
 * Implements Section 7.4: LLM-Friendly Error Schemas
 * Fulfills Article II.3: No raw exceptions to AI
 *
 * Discriminated union type ensures Claude can properly parse responses.
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
 * Legacy truncation metadata (for backwards compatibility)
 * @deprecated Use PaginationMetadata instead
 */
export interface TruncationMetadata {
  truncated: boolean;
  totalCount?: number;
  returnedCount: number;
  warning?: string;
}

/**
 * Base success response with optional pagination metadata
 */
export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: PaginationMetadata;
}

/**
 * Error response with suggested action for AI self-correction
 */
export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction?: string;
  details?: Record<string, unknown>;
}

/**
 * Pending confirmation response for human-in-the-loop write operations
 */
export interface MCPPendingConfirmationResponse {
  status: 'pending_confirmation';
  confirmationId: string;
  message: string;
  action: string;
  data: Record<string, unknown>;
  confirmationData: Record<string, unknown>; // Alias for data (test compatibility)
}

/**
 * Discriminated union of all possible MCP tool responses
 */
export type MCPToolResponse<T = unknown> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

/**
 * Type guards for narrowing MCPToolResponse
 */
export function isSuccessResponse<T>(
  response: MCPToolResponse<T>
): response is MCPSuccessResponse<T> {
  return response.status === 'success';
}

export function isErrorResponse(
  response: MCPToolResponse
): response is MCPErrorResponse {
  return response.status === 'error';
}

export function isPendingConfirmationResponse(
  response: MCPToolResponse
): response is MCPPendingConfirmationResponse {
  return response.status === 'pending_confirmation';
}

/**
 * Helper functions for creating responses
 */
export function createSuccessResponse<T>(
  data: T,
  metadata?: PaginationMetadata
): MCPSuccessResponse<T> {
  return { status: 'success', data, ...(metadata && { metadata }) };
}

export function createErrorResponse(
  code: string,
  message: string,
  suggestedAction?: string,
  details?: Record<string, unknown>
): MCPErrorResponse {
  return { status: 'error', code, message, suggestedAction, details };
}

export function createPendingConfirmationResponse(
  confirmationId: string,
  message: string,
  data: Record<string, unknown>
): MCPPendingConfirmationResponse {
  return {
    status: 'pending_confirmation',
    confirmationId,
    message,
    action: data.action as string,
    data,
    confirmationData: data, // Alias for test compatibility
  };
}
