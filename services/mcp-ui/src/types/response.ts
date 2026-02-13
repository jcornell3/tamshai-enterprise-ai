/**
 * MCP Response Types
 *
 * Type definitions for MCP tool responses following the v1.4 architecture patterns.
 */

export interface MCPSuccessResponse<T = unknown> {
  status: 'success';
  data: T;
  metadata?: {
    dataFreshness?: string;
    truncated?: boolean;
  };
}

export interface MCPErrorResponse {
  status: 'error';
  code: string;
  message: string;
  suggestedAction: string;
}

export interface Narration {
  text: string;
  ssml?: string;
}

export interface ComponentResponse {
  type: string;
  props: Record<string, unknown>;
  actions?: ComponentAction[];
}

export interface ComponentAction {
  type: 'navigate' | 'drilldown' | 'approve' | 'reject';
  target?: string;
  params?: Record<string, string>;
}

export type MCPToolResponse<T = unknown> = MCPSuccessResponse<T> | MCPErrorResponse;
