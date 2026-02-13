/**
 * MCP Server Role Mapping Module
 *
 * Pure functions for mapping user roles to accessible MCP servers.
 * Extracted from index.ts for improved testability.
 */

export interface MCPServerConfig {
  name: string;
  url: string | undefined;
  requiredRoles: string[];
  description: string;
}

/**
 * Default MCP server configurations
 * These will be populated with URLs from the config at runtime
 */
export function createDefaultMCPServers(mcpServerUrls: {
  hr: string | undefined;
  finance: string | undefined;
  sales: string | undefined;
  support: string | undefined;
}): MCPServerConfig[] {
  return [
    {
      name: 'hr',
      url: mcpServerUrls.hr,
      // 'employee' grants self-access via RLS, department roles grant full access
      requiredRoles: ['employee', 'hr-read', 'hr-write', 'executive'],
      description: 'HR data including employees, departments, org structure',
    },
    {
      name: 'finance',
      url: mcpServerUrls.finance,
      // 'employee' grants self-access via RLS, department roles grant full access
      requiredRoles: ['employee', 'finance-read', 'finance-write', 'executive'],
      description: 'Financial data including budgets, reports, invoices',
    },
    {
      name: 'sales',
      url: mcpServerUrls.sales,
      // Sales data requires explicit sales roles (no employee self-access)
      requiredRoles: ['sales-read', 'sales-write', 'executive'],
      description: 'CRM data including customers, deals, pipeline',
    },
    {
      name: 'support',
      url: mcpServerUrls.support,
      // 'employee' grants self-access via RLS, department roles grant full access
      requiredRoles: ['employee', 'support-read', 'support-write', 'executive'],
      description: 'Support data including tickets, knowledge base',
    },
  ];
}

/**
 * Get MCP servers accessible to a user based on their roles
 *
 * A server is accessible if the user has ANY of the server's required roles.
 * Executive role grants access to all servers.
 *
 * @param userRoles - Array of role names the user has
 * @param servers - Array of MCP server configurations
 * @returns Array of accessible MCP servers
 */
export function getAccessibleMCPServers(
  userRoles: string[],
  servers: MCPServerConfig[]
): MCPServerConfig[] {
  return servers.filter((server) =>
    server.requiredRoles.some((role) => userRoles.includes(role))
  );
}

/**
 * Get MCP servers denied to a user based on their roles
 *
 * A server is denied if the user has NONE of the server's required roles.
 *
 * @param userRoles - Array of role names the user has
 * @param servers - Array of MCP server configurations
 * @returns Array of denied MCP servers
 */
export function getDeniedMCPServers(
  userRoles: string[],
  servers: MCPServerConfig[]
): MCPServerConfig[] {
  return servers.filter((server) =>
    !server.requiredRoles.some((role) => userRoles.includes(role))
  );
}
