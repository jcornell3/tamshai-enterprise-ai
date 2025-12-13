/**
 * Type definitions for Tamshai AI Desktop
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface UserInfo {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  groups?: string[];
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface BaseMessage {
  id: string;
  role: MessageRole;
  timestamp: number;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

export interface StreamingMessage extends BaseMessage {
  type: 'streaming';
  query: string;
  content: string;
  isComplete: boolean;
  error?: string;
}

export interface ApprovalMessage extends BaseMessage {
  type: 'approval';
  confirmationId: string;
  message: string;
  confirmationData?: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface TruncationMessage extends BaseMessage {
  type: 'truncation';
  message: string;
  returnedCount?: number;
  totalEstimate?: string;
  cursors?: Array<{ server: string; cursor: string }>;
}

export type Message = TextMessage | StreamingMessage | ApprovalMessage | TruncationMessage;

// API Response Types (from MCP Gateway)
export interface MCPSuccessResponse<T = any> {
  status: 'success';
  data: T;
  metadata?: {
    truncated?: boolean;
    returnedCount?: number;
    totalCount?: string;
    warning?: string;
  };
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
  confirmationData?: Record<string, unknown>;
}

export type MCPToolResponse<T = any> =
  | MCPSuccessResponse<T>
  | MCPErrorResponse
  | MCPPendingConfirmationResponse;

// SSE Chunk Types
export interface SSETextChunk {
  type: 'text';
  text: string;
}

export interface SSEPaginationChunk {
  type: 'pagination';
  hasMore: boolean;
  cursors?: Array<{ server: string; cursor: string }>;
  hint?: string;
}

export interface SSEErrorChunk {
  type: 'error';
  error: string;
}

export type SSEChunk = SSETextChunk | SSEPaginationChunk | SSEErrorChunk;
