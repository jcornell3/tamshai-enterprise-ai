/**
 * API Types
 *
 * Type definitions for MCP Gateway API responses.
 * Includes v1.4 patterns: truncation warnings, LLM-friendly errors, confirmations.
 */

// v1.4: Discriminated union response type
export type MCPToolResponse =
  | MCPSuccessResponse
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

export interface MCPSuccessResponse {
  status: 'success';
  data: unknown;
  metadata?: {
    truncated?: boolean;
    totalCount?: string;
    warning?: string;
  };
}

export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction: string;
}

export interface MCPPendingConfirmationResponse {
  status: 'pending_confirmation';
  confirmationId: string;
  message: string;
  confirmationData?: Record<string, unknown>;
}

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  citations?: Citation[];
  pendingConfirmation?: PendingConfirmation;
}

export interface Citation {
  source: string;
  reference: string;
}

export interface PendingConfirmation {
  confirmationId: string;
  message: string;
  action: string;
  approved?: boolean;
}

// SSE streaming types (v1.4)
// Gateway sends: { type: 'text', text: '...' } or { type: 'error', message: '...' }
export interface SSEEvent {
  type: 'text' | 'error' | 'pagination';
  text?: string;
  message?: string;
  // Pagination metadata
  hasMore?: boolean;
  cursors?: Array<{ server: string; cursor: string }>;
  hint?: string;
}

// Query request/response
export interface QueryRequest {
  query: string;
  conversationId?: string;
}

export interface QueryResponse {
  requestId: string;
  response: string;
  toolsUsed?: string[];
  citations?: Citation[];
}
