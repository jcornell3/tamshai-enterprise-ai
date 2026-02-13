/**
 * Component Definition Types
 *
 * Type definitions for UI component definitions and related entities.
 */

export interface MCPCall {
  server: string;
  tool: string;
  paramMap: Record<string, string>;
  /** Optional field name for merging response data (for multi-call components) */
  dataField?: string;
}

export interface ComponentDefinition {
  type: string;
  domain: string;
  component: string;
  description?: string;
  mcpCalls: MCPCall[];
  transform: (data: unknown) => Record<string, unknown>;
  generateNarration: (data: unknown, params: Record<string, string>) => { text: string };
}

export interface UserContext {
  userId: string;
  roles: string[];
  username?: string;
  email?: string;
}
