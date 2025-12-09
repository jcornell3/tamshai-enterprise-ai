/**
 * MCP Tool Response Types for HR Server (Architecture v1.4)
 *
 * These types match the Gateway's MCPToolResponse discriminated union.
 * Implements Section 7.4 (LLM-Friendly Error Schemas) and Article II.3.
 */

/**
 * Metadata for truncated result sets (Section 5.3)
 */
export interface TruncationMetadata {
  truncated: boolean;
  totalCount?: number;
  returnedCount: number;
  warning?: string;
}

/**
 * Success response with optional truncation metadata
 */
export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: TruncationMetadata;
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
 * Helper to create a success response
 */
export function createSuccessResponse<T>(
  data: T,
  metadata?: TruncationMetadata
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
