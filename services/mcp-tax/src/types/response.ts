/**
 * MCP Response Types
 *
 * Discriminated union types for all MCP tool responses.
 * Follows Architecture v1.4 patterns for LLM-friendly error handling.
 */

// Pagination metadata for list operations
export interface PaginationMetadata {
  hasMore: boolean;
  nextCursor?: string;
  returnedCount: number;
  totalEstimate?: string;
  hint?: string;
}

// Success response
export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: PaginationMetadata;
}

// Error response (must include suggestedAction for Claude)
export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction: string;
  details?: Record<string, unknown>;
}

// Pending confirmation for write operations
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

// Discriminated union of all response types
export type MCPToolResponse<T = unknown> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

// Helper constructors
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

// Cursor encoding/decoding for pagination
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
