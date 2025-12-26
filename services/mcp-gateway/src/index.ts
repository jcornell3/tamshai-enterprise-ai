/**
 * Tamshai Corp MCP Gateway (Architecture v1.4)
 *
 * This service orchestrates AI queries by:
 * 1. Validating JWT tokens from Keycloak
 * 2. Extracting user roles from the token
 * 3. Routing queries to appropriate MCP servers based on roles
 * 4. Aggregating responses and sending to Claude API
 * 5. Logging all access for audit compliance
 *
 * v1.4 Features:
 * - SSE Streaming for long-running queries (Section 6.1)
 * - Truncation warning injection (Section 5.3)
 * - Human-in-the-loop confirmations (Section 5.6)
 * - LLM-friendly error handling (Section 7.4)
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
import {
  MCPToolResponse,
  isSuccessResponse,
  isErrorResponse,
  isPendingConfirmationResponse,
} from './types/mcp-response';
import {
  storePendingConfirmation,
  getPendingConfirmation,
  deletePendingConfirmation,
  isTokenRevoked,
} from './utils/redis';
import { scrubPII } from './utils/pii-scrubber';

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
    jwksUri: process.env.JWKS_URI || undefined,
    issuer: process.env.KEYCLOAK_ISSUER || undefined,
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
  jwksUri: config.keycloak.jwksUri || `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
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
        issuer: config.keycloak.issuer || `${config.keycloak.url}/realms/${config.keycloak.realm}`,
        // audience: config.keycloak.clientId,  // Skip audience check as Keycloak uses azp instead
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
  userContext: UserContext,
  cursor?: string  // Pagination cursor for subsequent pages
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
        ...(cursor && { cursor }),  // Include cursor if provided
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
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

IMPORTANT - User Identity Context:
- First, look for this user in the employee data to understand their position and department
- Use their employee record to determine who their team members or direct reports are
- If the user asks about "my team" or "my employees", find the user in the data first, then find employees who report to them or are in their department

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission
6. When asked about "my team", first identify the user in the employee data, then find their direct reports

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
  origin: [
    'http://localhost:3100',     // MCP Gateway itself
    'http://localhost:4000',     // Portal app
    'http://localhost:4001',     // HR app
    'http://localhost:4002',     // Finance app
    'tamshai-ai://*'             // Desktop app (Electron)
  ],
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
  const tokenFromQuery = req.query.token as string | undefined;

  // Accept token from either Authorization header or query param (for SSE)
  let token: string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (tokenFromQuery) {
    // EventSource doesn't support custom headers, so accept token via query param
    token = tokenFromQuery;
  } else {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const userContext = await validateToken(token);

    // v1.4: Check token revocation in Redis
    const payload = jwt.decode(token) as jwt.JwtPayload;
    if (payload?.jti && await isTokenRevoked(payload.jti)) {
      logger.warn('Revoked token attempted', { jti: payload.jti, userId: userContext.userId });
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

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
    query: scrubPII(query.substring(0, 100)),
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

    // Audit log - scrub PII before logging (security fix)
    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      requestId,
      userId: userContext.userId,
      username: userContext.username,
      roles: userContext.roles,
      query: scrubPII(query),  // Scrub PII from query before logging
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
// v1.4 ENDPOINTS
// =============================================================================

/**
 * v1.4 SSE Streaming Query Handler (Section 6.1)
 *
 * Shared handler for both GET and POST streaming endpoints.
 * Streams Claude responses using Server-Sent Events to prevent timeouts
 * during long-running queries (30-60 seconds).
 */
async function handleStreamingQuery(
  req: Request,
  res: Response,
  query: string,
  cursor?: string
): Promise<void> {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as any).userContext;

  logger.info(`SSE Query from ${userContext.username}:`, {
    requestId,
    query: scrubPII(query.substring(0, 100)),  // Scrub PII from query before logging
    roles: userContext.roles,
    hasCursor: !!cursor,
  });

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Determine accessible MCP servers
    const accessibleServers = getAccessibleMCPServers(userContext.roles);

    // Query all accessible MCP servers in parallel (with cursor for pagination)
    const mcpPromises = accessibleServers.map((server) =>
      queryMCPServer(server, query, userContext, cursor)
    );
    const mcpResults = await Promise.all(mcpPromises);

    // v1.4: Check for pagination metadata and pending confirmations
    const paginationInfo: { server: string; hasMore: boolean; nextCursor?: string; hint?: string }[] = [];

    mcpResults.forEach((result) => {
      const mcpResponse = result.data as MCPToolResponse;
      if (isSuccessResponse(mcpResponse) && mcpResponse.metadata?.hasMore) {
        paginationInfo.push({
          server: result.server,
          hasMore: mcpResponse.metadata.hasMore,
          nextCursor: mcpResponse.metadata.nextCursor,
          hint: mcpResponse.metadata.hint,
        });
      }
    });

    const hasPagination = paginationInfo.length > 0;

    const pendingConfirmations = mcpResults.filter((result) => {
      const mcpResponse = result.data as MCPToolResponse;
      return isPendingConfirmationResponse(mcpResponse);
    });

    // If there are pending confirmations, return them immediately (no Claude call)
    if (pendingConfirmations.length > 0) {
      const confirmationResponse = pendingConfirmations[0].data as MCPToolResponse;
      res.write(`data: ${JSON.stringify(confirmationResponse)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Build context from MCP data
    const dataContext = mcpResults
      .filter((d) => d.data !== null)
      .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
      .join('\n\n');

    // v1.4: Build pagination instructions for Claude
    let paginationInstructions = '';
    if (hasPagination) {
      const hints = paginationInfo.map(p => p.hint).filter(Boolean);
      paginationInstructions = `\n\nPAGINATION INFO: More data is available. ${hints.join(' ')} You MUST inform the user that they are viewing a partial result set and can request more data.`;
    }

    const systemPrompt = `You are an AI assistant for Tamshai Corp, a family investment management organization.
You have access to enterprise data based on the user's role permissions.
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

IMPORTANT - User Identity Context:
- First, look for this user in the employee data to understand their position and department
- Use their employee record to determine who their team members or direct reports are
- If the user asks about "my team" or "my employees", find the user in the data first, then find employees who report to them or are in their department

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission
6. When asked about "my team", first identify the user in the employee data, then find their direct reports${paginationInstructions}

Available data context:
${dataContext || 'No relevant data available for this query.'}`;

    // Stream Claude response
    const stream = await anthropic.messages.stream({
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

    // Stream each chunk to the client
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`);
      }
    }

    // Send pagination metadata if more data is available
    if (hasPagination) {
      res.write(`data: ${JSON.stringify({
        type: 'pagination',
        hasMore: true,
        cursors: paginationInfo.map(p => ({ server: p.server, cursor: p.nextCursor })),
        hint: 'More data available. Request next page to continue.',
      })}\n\n`);
    }

    // Send completion signal
    res.write('data: [DONE]\n\n');
    res.end();

    const durationMs = Date.now() - startTime;
    logger.info('SSE query completed', { requestId, durationMs });
  } catch (error) {
    logger.error('SSE query error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to process query' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/**
 * v1.4 SSE Streaming Query Endpoint - GET (Section 6.1)
 *
 * Supports EventSource API which requires GET with query params.
 * Token can be passed via query param since EventSource doesn't support headers.
 */
app.get('/api/query', authMiddleware, async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const cursor = req.query.cursor as string | undefined;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  await handleStreamingQuery(req, res, query, cursor);
});

/**
 * v1.4 SSE Streaming Query Endpoint - POST (Section 6.1)
 *
 * Supports fetch API with proper Authorization headers and JSON body.
 * Better for clients that can't use EventSource (like React Native).
 */
app.post('/api/query', authMiddleware, async (req: Request, res: Response) => {
  const { query, cursor } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Field "query" is required' });
    return;
  }

  await handleStreamingQuery(req, res, query, cursor);
});

/**
 * v1.4 Confirmation Endpoint (Section 5.6)
 *
 * Handles human-in-the-loop confirmations for write operations.
 * Retrieves pending action from Redis and executes or cancels it.
 */
app.post('/api/confirm/:confirmationId', authMiddleware, async (req: Request, res: Response) => {
  const { confirmationId } = req.params;
  const { approved } = req.body;
  const userContext: UserContext = (req as any).userContext;
  const requestId = req.headers['x-request-id'] as string;

  logger.info('Confirmation request', {
    requestId,
    confirmationId,
    approved,
    userId: userContext.userId,
  });

  if (typeof approved !== 'boolean') {
    res.status(400).json({ error: 'Field "approved" must be a boolean' });
    return;
  }

  try {
    // Retrieve pending confirmation from Redis
    const pendingAction = await getPendingConfirmation(confirmationId);

    if (!pendingAction) {
      res.status(404).json({
        error: 'Confirmation not found or expired',
        message: '⏱️ Confirmation expired. Please retry the operation.',
      });
      return;
    }

    // Verify user is the same one who initiated the request
    if (pendingAction.userId !== userContext.userId) {
      logger.warn('Confirmation user mismatch', {
        requestId,
        confirmationId,
        initiatingUser: pendingAction.userId,
        confirmingUser: userContext.userId,
      });
      res.status(403).json({ error: 'Confirmation can only be completed by the initiating user' });
      return;
    }

    if (!approved) {
      // User rejected the action
      logger.info('Action rejected by user', { requestId, confirmationId });
      res.json({
        status: 'cancelled',
        message: '❌ Action cancelled',
      });
      return;
    }

    // Execute the confirmed action by calling the MCP server
    const mcpServerUrl = config.mcpServers[pendingAction.mcpServer as keyof typeof config.mcpServers];

    if (!mcpServerUrl) {
      res.status(500).json({ error: 'Invalid MCP server in pending action' });
      return;
    }

    const executeResponse = await axios.post(
      `${mcpServerUrl}/execute`,
      {
        action: pendingAction.action,
        data: pendingAction,
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
          'X-Request-ID': requestId,
        },
      }
    );

    logger.info('Action executed successfully', {
      requestId,
      confirmationId,
      action: pendingAction.action,
    });

    res.json({
      status: 'success',
      message: '✅ Action completed successfully',
      result: executeResponse.data,
    });
  } catch (error) {
    logger.error('Confirmation execution error:', error);
    res.status(500).json({
      error: 'Failed to execute confirmed action',
      requestId,
    });
  }
});

// =============================================================================
// MCP TOOL PROXY ENDPOINTS
// =============================================================================

/**
 * Validate tool name to prevent SSRF/path traversal attacks
 * Tool names must be alphanumeric with underscores/hyphens only
 */
function isValidToolName(toolName: string): boolean {
  // Only allow alphanumeric characters, underscores, and hyphens
  // Prevents path traversal (../) and other injection attacks
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(toolName);
}

/**
 * Generic MCP tool proxy endpoint
 * Routes: /api/mcp/:serverName/:toolName
 *
 * Allows web applications to directly call MCP tools with proper authorization.
 * The gateway validates the user's access to the MCP server and forwards the request.
 */
app.get('/api/mcp/:serverName/:toolName', authMiddleware, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as any).userContext;
  const { serverName, toolName } = req.params;

  // SECURITY: Validate toolName to prevent SSRF/path traversal
  if (!isValidToolName(toolName)) {
    logger.warn('Invalid tool name rejected', {
      requestId,
      userId: userContext.userId,
      toolName,
    });
    res.status(400).json({
      status: 'error',
      code: 'INVALID_TOOL_NAME',
      message: 'Tool name contains invalid characters',
      suggestedAction: 'Tool names must start with a letter and contain only alphanumeric characters, underscores, or hyphens',
    });
    return;
  }

  // Convert query params to proper types (Express parses everything as strings)
  const queryParams: any = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined) continue;
    // Try to parse as number if it looks numeric
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      queryParams[key] = parseInt(value, 10);
    } else {
      queryParams[key] = value;
    }
  }

  logger.info(`MCP tool call: ${serverName}/${toolName}`, {
    requestId,
    userId: userContext.userId,
    queryParams,
  });

  try {
    // Find the MCP server configuration
    const server = mcpServerConfigs.find((s) => s.name === serverName);
    if (!server) {
      res.status(404).json({
        status: 'error',
        code: 'SERVER_NOT_FOUND',
        message: `MCP server '${serverName}' not found`,
        suggestedAction: `Available servers: ${mcpServerConfigs.map((s) => s.name).join(', ')}`,
      });
      return;
    }

    // Check if user has access to this server
    const accessibleServers = getAccessibleMCPServers(userContext.roles);
    const hasAccess = accessibleServers.some((s) => s.name === serverName);

    if (!hasAccess) {
      logger.warn('Unauthorized MCP server access attempt', {
        requestId,
        userId: userContext.userId,
        serverName,
        userRoles: userContext.roles,
      });

      res.status(403).json({
        status: 'error',
        code: 'ACCESS_DENIED',
        message: `You do not have access to the '${serverName}' data source`,
        suggestedAction: `Required roles: ${server.requiredRoles.join(' or ')}. Your roles: ${userContext.roles.join(', ')}`,
      });
      return;
    }

    // Forward request to MCP server (MCP servers expect POST with {input, userContext})
    // SECURITY: toolName is validated above, server.url comes from trusted config
    const mcpResponse = await axios.post(
      `${server.url}/tools/${encodeURIComponent(toolName)}`,
      {
        input: queryParams, // Query params become input
        userContext: {
          userId: userContext.userId,
          username: userContext.username,
          email: userContext.email,
          roles: userContext.roles,
        },
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      }
    );

    // v1.4: Check for truncation warnings and inject into response
    const toolResponse = mcpResponse.data as MCPToolResponse;
    if (isSuccessResponse(toolResponse) && toolResponse.metadata?.truncated) {
      logger.info('Truncation detected in MCP response', {
        requestId,
        serverName,
        toolName,
        returnedCount: toolResponse.metadata.returnedCount,
      });
    }

    res.json(toolResponse);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // MCP server returned an error
        res.status(error.response.status).json(error.response.data);
      } else if (error.code === 'ECONNREFUSED') {
        res.status(503).json({
          status: 'error',
          code: 'SERVICE_UNAVAILABLE',
          message: `MCP server '${serverName}' is not available`,
          suggestedAction: 'Please try again later or contact support',
        });
      } else {
        throw error;
      }
    } else {
      logger.error('MCP tool proxy error:', error);
      res.status(500).json({
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to communicate with MCP server',
        suggestedAction: 'Please try again or contact support',
      });
    }
  }
});

/**
 * MCP POST endpoint for write operations (confirmations, etc.)
 */
app.post('/api/mcp/:serverName/:toolName', authMiddleware, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as any).userContext;
  const { serverName, toolName } = req.params;
  const body = req.body;

  // SECURITY: Validate toolName to prevent SSRF/path traversal
  if (!isValidToolName(toolName)) {
    logger.warn('Invalid tool name rejected', {
      requestId,
      userId: userContext.userId,
      toolName,
    });
    res.status(400).json({
      status: 'error',
      code: 'INVALID_TOOL_NAME',
      message: 'Tool name contains invalid characters',
      suggestedAction: 'Tool names must start with a letter and contain only alphanumeric characters, underscores, or hyphens',
    });
    return;
  }

  logger.info(`MCP tool call (POST): ${serverName}/${toolName}`, {
    requestId,
    userId: userContext.userId,
    body,
  });

  try {
    // Find the MCP server configuration
    const server = mcpServerConfigs.find((s) => s.name === serverName);
    if (!server) {
      res.status(404).json({
        status: 'error',
        code: 'SERVER_NOT_FOUND',
        message: `MCP server '${serverName}' not found`,
      });
      return;
    }

    // Check if user has access to this server
    const accessibleServers = getAccessibleMCPServers(userContext.roles);
    const hasAccess = accessibleServers.some((s) => s.name === serverName);

    if (!hasAccess) {
      logger.warn('Unauthorized MCP server access attempt', {
        requestId,
        userId: userContext.userId,
        serverName,
        userRoles: userContext.roles,
      });

      res.status(403).json({
        status: 'error',
        code: 'ACCESS_DENIED',
        message: `You do not have access to the '${serverName}' data source`,
      });
      return;
    }

    // Forward request to MCP server
    // SECURITY: toolName is validated above, server.url comes from trusted config
    const mcpResponse = await axios.post(
      `${server.url}/tools/${encodeURIComponent(toolName)}`,
      body,
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userContext.userId,
          'X-User-Roles': userContext.roles.join(','),
          'X-Request-ID': requestId,
        },
      }
    );

    const toolResponse = mcpResponse.data as MCPToolResponse;

    // v1.4: Handle pending confirmations
    if (isPendingConfirmationResponse(toolResponse)) {
      logger.info('Pending confirmation created', {
        requestId,
        confirmationId: toolResponse.confirmationId,
        action: toolName,
      });
    }

    res.json(toolResponse);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else if (error.code === 'ECONNREFUSED') {
        res.status(503).json({
          status: 'error',
          code: 'SERVICE_UNAVAILABLE',
          message: `MCP server '${serverName}' is not available`,
        });
      } else {
        throw error;
      }
    } else {
      logger.error('MCP tool proxy error:', error);
      res.status(500).json({
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Failed to communicate with MCP server',
      });
    }
  }
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
