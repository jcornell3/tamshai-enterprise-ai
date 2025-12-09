/**
 * MCP Tool Response Types (Architecture v1.4)
 */

export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: TruncationMetadata;
}

export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction?: string;
  details?: Record<string, unknown>;
}

export interface MCPPendingConfirmationResponse {
  status: 'pending_confirmation';
  confirmationId: string;
  message: string;
  action: string;
  data: Record<string, unknown>;
}

export type MCPToolResponse<T = unknown> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

export interface TruncationMetadata {
  truncated: boolean;
  totalCount?: number;
  returnedCount: number;
  warning?: string;
}

export function createSuccessResponse<T>(data: T, metadata?: TruncationMetadata): MCPSuccessResponse<T> {
  return { status: 'success', data, metadata };
}

export function createErrorResponse(code: string, message: string, suggestedAction?: string, details?: Record<string, unknown>): MCPErrorResponse {
  return { status: 'error', code, message, suggestedAction, details };
}

export function createPendingConfirmationResponse(confirmationId: string, message: string, data: Record<string, unknown>): MCPPendingConfirmationResponse {
  return {
    status: 'pending_confirmation',
    confirmationId,
    message,
    action: data.action as string,
    data,
  };
}
