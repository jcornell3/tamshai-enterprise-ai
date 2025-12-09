/**
 * MCP Tool Response Types (Architecture v1.4)
 *
 * Discriminated union type for LLM-friendly responses from MCP servers.
 * Implements Section 7.4 (LLM-Friendly Error Schemas) and Article II.3 (Structured Errors).
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
