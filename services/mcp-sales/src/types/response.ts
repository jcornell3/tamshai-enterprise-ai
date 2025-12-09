/**
 * MCP Tool Response Types (Architecture v1.4)
 *
 * Implements Section 7.4: LLM-Friendly Error Schemas
 * Fulfills Article II.3: No raw exceptions to AI
 *
 * Discriminated union type ensures Claude can properly parse responses.
 */

/**
 * Base success response with optional truncation metadata
 */
export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: TruncationMetadata;
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
}

/**
 * Discriminated union of all possible MCP tool responses
 */
export type MCPToolResponse<T = unknown> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

/**
 * Truncation metadata for Section 5.3 compliance
 */
export interface TruncationMetadata {
  truncated: boolean;
  totalCount?: number;
  returnedCount: number;
  warning?: string;
}

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
  metadata?: TruncationMetadata
): MCPSuccessResponse<T> {
  return { status: 'success', data, metadata };
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
  };
}
