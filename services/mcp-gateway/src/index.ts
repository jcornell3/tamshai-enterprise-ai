/**
 * Tamshai Corp MCP Gateway
 * 
 * This service orchestrates AI queries by:
 * 1. Validating JWT tokens from Keycloak
 * 2. Extracting user roles from the token
 * 3. Routing queries to appropriate MCP servers based on roles
 * 4. Aggregating responses and sending to Claude API
 * 5. Logging all access for audit compliance
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import winston from 'winston';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  port: parseInt(process.env.PORT || '3000'),
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8180',
    realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-gateway',
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  },
  mcpServers: {
    hr: process.env.MCP_HR_URL || 'http://localhost:3001',
    finance: process.env.MCP_FINANCE_URL || 'http://localhost:3002',
    sales: process.env.MCP_SALES_URL || 'http://localhost:3003',
    support: process.env.MCP_SUPPORT_URL || 'http://localhost:3004',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

// =============================================================================
// LOGGER SETUP
// =============================================================================

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// =============================================================================
// TYPES
// =============================================================================

interface UserContext {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  groups: string[];
}

interface MCPServerConfig {
  name: string;
  url: string;
  requiredRoles: string[];
  description: string;
}

interface AIQueryRequest {
  query: string;
  conversationId?: string;
  context?: Record<string, unknown>;
}

interface AuditLog {
  timestamp: string;
  requestId: string;
  userId: string;
  username: string;
  roles: string[];
  query: string;
  mcpServersAccessed: string[];
  mcpServersDenied: string[];
  responseSuccess: boolean;
  durationMs: number;
}

// =============================================================================
// MCP SERVER ROLE MAPPING
// =============================================================================

const mcpServerConfigs: MCPServerConfig[] = [
  {
    name: 'hr',
    url: config.mcpServers.hr,
    requiredRoles: ['hr-read', 'hr-write', 'executive'],
    description: 'HR data including employees, departments, org structure',
  },
  {
    name: 'finance',
    url: config.mcpServers.finance,
    requiredRoles: ['finance-read', 'finance-write', 'executive'],
    description: 'Financial data including budgets, reports, invoices',
  },
  {
    name: 'sales',
    url: config.mcpServers.sales,
    requiredRoles: ['sales-read', 'sales-write', 'executive'],
    description: 'CRM data including customers, deals, pipeline',
  },
  {
    name: 'support',
    url: config.mcpServers.support,
    requiredRoles: ['support-read', 'support-write', 'executive'],
    description: 'Support data including tickets, knowledge base',
  },
];

// =============================================================================
// JWT VALIDATION
// =============================================================================

const jwksClient = jwksRsa({
  jwksUri: `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
});

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

async function validateToken(token: string): Promise<UserContext> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      {
        algorithms: ['RS256'],
        issuer: `${config.keycloak.url}/realms/${config.keycloak.realm}`,
        audience: config.keycloak.clientId,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }

        const payload = decoded as jwt.JwtPayload;
        
        // Extract roles from Keycloak token structure
        const realmRoles = payload.realm_access?.roles || [];
        const groups = payload.groups || [];

        resolve({
          userId: payload.sub || '',
          username: payload.preferred_username || '',
          email: payload.email || '',
          roles: realmRoles,
          groups: groups,
        });
      }
    );
  });
}

// =============================================================================
// MCP SERVER INTERACTION
// =============================================================================

function getAccessibleMCPServers(userRoles: string[]): MCPServerConfig[] {
  return mcpServerConfigs.filter((server) =>
    server.requiredRoles.some((role) => userRoles.includes(role))
  );
}

function getDeniedMCPServers(userRoles: string[]): MCPServerConfig[] {
  return mcpServerConfigs.filter((server) =>
    !server.requiredRoles.some((role) => userRoles.includes(role))
  );
}

async function queryMCPServer(
  server: MCPServerConfig,
  query: string,
  userContext: UserContext
): Promise<{ server: string; data: unknown; error?: string }> {
  try {
    const response = await axios.post(
      `${server.url}/query`,
      {
        query,
        userContext: {
          userId: userContext.userId,
          username: userContext.username,
          roles: userContext.roles,
        },
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userContext.userId,
          'X-User-Roles': userContext.roles.join(','),
        },
      }
    );

    return {
      server: server.name,
      data: response.data,
    };
  } catch (error) {
    logger.error(`MCP server ${server.name} error:`, error);
    return {
      server: server.name,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// CLAUDE API INTEGRATION
// =============================================================================

const anthropic = new Anthropic({
  apiKey: config.claude.apiKey,
});

async function sendToClaudeWithContext(
  query: string,
  mcpData: Array<{ server: string; data: unknown }>,
  userContext: UserContext
): Promise<string> {
  // Build context from MCP data
  const dataContext = mcpData
    .filter((d) => d.data !== null)
    .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
    .join('\n\n');

  const systemPrompt = `You are an AI assistant for Tamshai Corp, a family investment management organization. 
You have access to enterprise data based on the user's role permissions.
The user "${userContext.username}" has the following roles: ${userContext.roles.join(', ')}.

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission

Available data context:
${dataContext || 'No relevant data available for this query.'}`;

  const message = await anthropic.messages.create({
    model: config.claude.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: query,
      },
    ],
  });

  // Extract text from response
  const textContent = message.content.find((c) => c.type === 'text');
  return textContent?.text || 'No response generated.';
}

// =============================================================================
// EXPRESS APPLICATION
// =============================================================================

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3100', 'tamshai-ai://*'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check (no auth required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// Authentication middleware
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const userContext = await validateToken(token);
    (req as any).userContext = userContext;
    next();
  } catch (error) {
    logger.error('Token validation failed:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Get user info
app.get('/api/user', authMiddleware, (req: Request, res: Response) => {
  const userContext: UserContext = (req as any).userContext;
  res.json({
    userId: userContext.userId,
    username: userContext.username,
    email: userContext.email,
    roles: userContext.roles,
    groups: userContext.groups,
  });
});

// Get available MCP tools based on user's roles
app.get('/api/mcp/tools', authMiddleware, (req: Request, res: Response) => {
  const userContext: UserContext = (req as any).userContext;
  const accessibleServers = getAccessibleMCPServers(userContext.roles);
  
  res.json({
    user: userContext.username,
    roles: userContext.roles,
    accessibleDataSources: accessibleServers.map((s) => ({
      name: s.name,
      description: s.description,
    })),
  });
});

// Main AI query endpoint
app.post('/api/ai/query', authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as any).userContext;
  const { query, conversationId }: AIQueryRequest = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  logger.info(`AI Query from ${userContext.username}:`, {
    requestId,
    query: query.substring(0, 100),
    roles: userContext.roles,
  });

  try {
    // Determine accessible MCP servers
    const accessibleServers = getAccessibleMCPServers(userContext.roles);
    const deniedServers = getDeniedMCPServers(userContext.roles);

    // Query all accessible MCP servers in parallel
    const mcpPromises = accessibleServers.map((server) =>
      queryMCPServer(server, query, userContext)
    );
    const mcpResults = await Promise.all(mcpPromises);

    // Send to Claude with context
    const aiResponse = await sendToClaudeWithContext(query, mcpResults, userContext);

    const durationMs = Date.now() - startTime;

    // Audit log
    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      requestId,
      userId: userContext.userId,
      username: userContext.username,
      roles: userContext.roles,
      query,
      mcpServersAccessed: accessibleServers.map((s) => s.name),
      mcpServersDenied: deniedServers.map((s) => s.name),
      responseSuccess: true,
      durationMs,
    };
    logger.info('Audit log:', auditLog);

    res.json({
      requestId,
      conversationId: conversationId || uuidv4(),
      response: aiResponse,
      metadata: {
        dataSourcesQueried: accessibleServers.map((s) => s.name),
        processingTimeMs: durationMs,
      },
    });
  } catch (error) {
    logger.error('AI query error:', error);
    res.status(500).json({
      error: 'Failed to process AI query',
      requestId,
    });
  }
});

// Internal audit endpoint (for Kong HTTP log plugin)
app.post('/internal/audit', express.json(), (req: Request, res: Response) => {
  logger.info('Gateway audit:', req.body);
  res.status(200).send('OK');
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  logger.info(`MCP Gateway listening on port ${config.port}`);
  logger.info(`Keycloak URL: ${config.keycloak.url}`);
  logger.info(`Configured MCP servers: ${Object.keys(config.mcpServers).join(', ')}`);
});

export default app;
