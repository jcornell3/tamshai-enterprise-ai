/**
 * MCP Tool Response Types for HR Server (Architecture v1.4)
 *
 * These types match the Gateway's MCPToolResponse discriminated union.
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
 * Metadata for truncated result sets (Section 5.3)
 * @deprecated Use PaginationMetadata instead - retained for backwards compatibility
 */
export interface TruncationMetadata {
  truncated: boolean;
  totalCount?: number;
  returnedCount: number;
  warning?: string;
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
 * Type guard to check if response is a success response
 */
export function isSuccessResponse<T>(
  response: MCPToolResponse<T>
): response is MCPSuccessResponse<T> {
  return response.status === 'success';
}

/**
 * Type guard to check if response is an error response
 */
export function isErrorResponse<T>(
  response: MCPToolResponse<T>
): response is MCPErrorResponse {
  return response.status === 'error';
}

/**
 * Type guard to check if response is a pending confirmation response
 */
export function isPendingConfirmationResponse<T>(
  response: MCPToolResponse<T>
): response is MCPPendingConfirmationResponse {
  return response.status === 'pending_confirmation';
}
