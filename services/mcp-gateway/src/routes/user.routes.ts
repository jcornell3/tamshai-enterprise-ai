/**
 * User Information and MCP Tools Routes
 *
 * Provides user profile information and accessible MCP tools/data sources.
 */

import { Router, Request, Response } from 'express';
import { getAccessibleMCPServers, MCPServerConfig } from '../utils/gateway-utils';

const router = Router();

// MCP Server configurations (should match index.ts)
// TODO: Move to shared config file
const mcpServerConfigs: MCPServerConfig[] = [
  {
    name: 'mcp-hr',
    url: 'http://localhost:3101',
    requiredRoles: ['hr-read', 'hr-write', 'executive'],
    description: 'HR data including employees, departments, org structure',
  },
  {
    name: 'mcp-finance',
    url: 'http://localhost:3102',
    requiredRoles: ['finance-read', 'finance-write', 'executive'],
    description: 'Financial data including budgets, reports, invoices',
  },
  {
    name: 'mcp-sales',
    url: 'http://localhost:3103',
    requiredRoles: ['sales-read', 'sales-write', 'executive'],
    description: 'CRM data including customers, deals, pipeline',
  },
  {
    name: 'mcp-support',
    url: 'http://localhost:3104',
    requiredRoles: ['support-read', 'support-write', 'executive'],
    description: 'Support data including tickets, knowledge base',
  },
];

/**
 * User context interface (should match index.ts)
 */
interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  groups?: string[];
}

interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

/**
 * GET /api/user
 * Returns current user's profile information
 * Requires authentication
 */
router.get('/api/user', (req: Request, res: Response) => {
  const userContext: UserContext | undefined = (req as AuthenticatedRequest).userContext;

  if (!userContext) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  res.json({
    userId: userContext.userId,
    username: userContext.username,
    email: userContext.email,
    roles: userContext.roles,
    groups: userContext.groups,
  });
});

/**
 * GET /api/mcp/tools
 * Returns available MCP tools and data sources based on user's roles
 * Requires authentication
 */
router.get('/api/mcp/tools', (req: Request, res: Response) => {
  const userContext: UserContext | undefined = (req as AuthenticatedRequest).userContext;

  if (!userContext) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const accessibleServers = getAccessibleMCPServers(userContext.roles, mcpServerConfigs);

  res.json({
    user: userContext.username,
    roles: userContext.roles,
    accessibleDataSources: accessibleServers.map((s: MCPServerConfig) => ({
      name: s.name,
      description: s.description,
    })),
  });
});

export default router;
