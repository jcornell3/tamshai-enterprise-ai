/**
 * Gateway Utility Functions
 *
 * Pure functions extracted from index.ts for unit testing.
 * These functions contain core business logic without Express dependencies.
 */

/**
 * Sanitize string for safe logging (prevent log injection)
 * Removes newlines and control characters that could forge log entries
 */
export function sanitizeForLog(input: string, maxLength = 100): string {
  return input
    .replace(/[\r\n\t]/g, ' ')  // Replace newlines/tabs with space
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable ASCII
    .substring(0, maxLength);
}

/**
 * Validate MCP tool name to prevent path traversal and injection attacks
 * Tool names must be alphanumeric with underscores/hyphens only
 */
export function isValidToolName(toolName: string): boolean {
  // Only allow alphanumeric characters, underscores, and hyphens
  // Prevents path traversal (../) and other injection attacks
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(toolName);
}

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string;
  url: string | undefined;
  requiredRoles: string[];
  description: string;
}

/**
 * Filter MCP servers that user has access to based on their roles
 */
export function getAccessibleMCPServers(
  userRoles: string[],
  allServers: MCPServerConfig[]
): MCPServerConfig[] {
  return allServers.filter((server) =>
    server.requiredRoles.some((role) => userRoles.includes(role))
  );
}

/**
 * Filter MCP servers that user does NOT have access to
 */
export function getDeniedMCPServers(
  userRoles: string[],
  allServers: MCPServerConfig[]
): MCPServerConfig[] {
  return allServers.filter((server) =>
    !server.requiredRoles.some((role) => userRoles.includes(role))
  );
}
