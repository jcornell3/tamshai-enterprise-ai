/**
 * Mock MCP Server Factory
 *
 * Create mock MCP server configurations for testing
 */

import { MCPServerConfig } from '../mcp/role-mapper';

/**
 * Create a mock MCP server configuration for testing
 *
 * Usage:
 *   const hrServer = createMockMCPServer({ name: 'hr', requiredRoles: ['hr-read'] });
 */
export function createMockMCPServer(
  overrides?: Partial<MCPServerConfig>
): MCPServerConfig {
  return {
    name: 'test-server',
    url: 'http://localhost:9999',
    requiredRoles: ['test-role'],
    description: 'Test MCP Server',
    ...overrides,
  };
}

/**
 * Create a set of standard test MCP servers
 *
 * Usage:
 *   const servers = createStandardMCPServers();
 */
export function createStandardMCPServers(): MCPServerConfig[] {
  return [
    createMockMCPServer({
      name: 'hr',
      url: 'http://localhost:3101',
      requiredRoles: ['hr-read', 'hr-write', 'executive'],
      description: 'HR data including employees, departments, org structure',
    }),
    createMockMCPServer({
      name: 'finance',
      url: 'http://localhost:3102',
      requiredRoles: ['finance-read', 'finance-write', 'executive'],
      description: 'Financial data including budgets, reports, invoices',
    }),
    createMockMCPServer({
      name: 'sales',
      url: 'http://localhost:3103',
      requiredRoles: ['sales-read', 'sales-write', 'executive'],
      description: 'CRM data including customers, deals, pipeline',
    }),
    createMockMCPServer({
      name: 'support',
      url: 'http://localhost:3104',
      requiredRoles: ['support-read', 'support-write', 'executive'],
      description: 'Support data including tickets, knowledge base',
    }),
  ];
}
