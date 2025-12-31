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
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import winston from 'winston';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import {
  MCPToolResponse,
  isSuccessResponse,
  isPendingConfirmationResponse,
} from './types/mcp-response';
import {
  getPendingConfirmation,
  isTokenRevoked,
  stopTokenRevocationSync,
} from './utils/redis';
import { scrubPII } from './utils/pii-scrubber';
import {
  sanitizeForLog,
  isValidToolName,
  getAccessibleMCPServers,
  getDeniedMCPServers,
  MCPServerConfig,
} from './utils/gateway-utils';
import gdprRoutes from './routes/gdpr';
import healthRoutes from './routes/health.routes';
import userRoutes from './routes/user.routes';

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
  // v1.5 Performance: Service timeout configuration
  timeouts: {
    mcpRead: parseInt(process.env.MCP_READ_TIMEOUT_MS || '5000'),
    mcpWrite: parseInt(process.env.MCP_WRITE_TIMEOUT_MS || '10000'),
    claude: parseInt(process.env.CLAUDE_TIMEOUT_MS || '60000'),
    total: parseInt(process.env.TOTAL_REQUEST_TIMEOUT_MS || '90000'),
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

// Extended Request type with userContext property
interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
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
        audience: [config.keycloak.clientId, 'account'],
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }

        const payload = decoded as jwt.JwtPayload;

        // Extract roles from Keycloak token structure
        // Support both realm roles (legacy/global) and client roles (best practice)
        const realmRoles = payload.realm_access?.roles || [];
        const clientRoles = payload.resource_access?.[config.keycloak.clientId]?.roles || [];
        const groups = payload.groups || [];

        // Merge and deduplicate roles from both sources
        const allRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

        // Log available claims for debugging
        logger.debug('JWT claims:', {
          sub: payload.sub,
          preferred_username: payload.preferred_username,
          email: payload.email,
          name: payload.name,
          given_name: payload.given_name,
          family_name: payload.family_name,
          azp: payload.azp,
          realm_access: payload.realm_access,
          resource_access: payload.resource_access,
          realmRoles,
          clientRoles,
          mergedRoles: allRoles,
        });

        // Keycloak may not include preferred_username in access token
        // Try multiple claim sources for username
        const username = payload.preferred_username ||
                        payload.name ||
                        payload.given_name ||
                        (payload.sub ? `user-${payload.sub.substring(0, 8)}` : 'unknown');

        // GAP-005: Warn when critical claims are missing (Keycloak protocol mapper misconfiguration)
        if (!payload.preferred_username) {
          logger.warn('JWT missing preferred_username claim - Keycloak protocol mapper may be misconfigured', {
            hasSub: !!payload.sub,
            hasName: !!payload.name,
            hasGivenName: !!payload.given_name,
            usedFallback: username,
          });
        }
        if (!payload.email) {
          logger.warn('JWT missing email claim - user identity queries may fail', {
            userId: payload.sub,
            username,
          });
        }

        resolve({
          userId: payload.sub || '',
          username: username,
          email: payload.email || '',
          roles: allRoles, // Merged realm + client roles
          groups: groups,
        });
      }
    );
  });
}

// =============================================================================
// MCP SERVER INTERACTION
// =============================================================================

// Wrapper functions that use the utility functions with the configured MCP servers
function getAccessibleMCPServersForUser(userRoles: string[]): MCPServerConfig[] {
  return getAccessibleMCPServers(userRoles, mcpServerConfigs);
}

function getDeniedMCPServersForUser(userRoles: string[]): MCPServerConfig[] {
  return getDeniedMCPServers(userRoles, mcpServerConfigs);
}

/**
 * Query result with timeout status for partial response handling
 */
interface MCPQueryResult {
  server: string;
  data: unknown;
  status: 'success' | 'timeout' | 'error';
  error?: string;
  durationMs?: number;
}

/**
 * Query an MCP server with configurable timeout (v1.5 Performance)
 *
 * Implements per-service timeouts with graceful degradation.
 * See: docs/architecture/overview.md Section 9.2
 */
async function queryMCPServer(
  server: MCPServerConfig,
  query: string,
  userContext: UserContext,
  cursor?: string,  // Pagination cursor for subsequent pages
  autoPaginate: boolean = true,  // Automatically fetch all pages
  isWriteOperation: boolean = false  // Use longer timeout for writes
): Promise<MCPQueryResult> {
  const startTime = Date.now();
  const timeout = isWriteOperation ? config.timeouts.mcpWrite : config.timeouts.mcpRead;

  try {
    const allData: unknown[] = [];
    let currentCursor = cursor;
    let pageCount = 0;
    const maxPages = 10;  // Safety limit to prevent infinite loops

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      do {
        const response = await axios.post(
          `${server.url}/query`,
          {
            query,
            userContext: {
              userId: userContext.userId,
              username: userContext.username,
              email: userContext.email,  // Include email for user lookup
              roles: userContext.roles,
            },
            ...(currentCursor && { cursor: currentCursor }),
          },
          {
            timeout: timeout,
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-User-ID': userContext.userId,
              'X-User-Roles': userContext.roles.join(','),
            },
          }
        );

        const mcpResponse = response.data as MCPToolResponse;

        // Accumulate data
        if (isSuccessResponse(mcpResponse) && Array.isArray(mcpResponse.data)) {
          allData.push(...mcpResponse.data);
          pageCount++;

          // Check for more pages
          if (autoPaginate && mcpResponse.metadata?.hasMore && mcpResponse.metadata?.nextCursor && pageCount < maxPages) {
            currentCursor = mcpResponse.metadata.nextCursor;
            logger.info(`Auto-paginating ${server.name}, fetched page ${pageCount}, ${allData.length} records so far`);
          } else {
            // No more pages or auto-pagination disabled
            if (allData.length > 0) {
              // Return aggregated data
              return {
                server: server.name,
                status: 'success',
                data: {
                  status: 'success',
                  data: allData,
                  metadata: {
                    returnedCount: allData.length,
                    totalCount: allData.length,
                    pagesRetrieved: pageCount,
                  },
                },
                durationMs: Date.now() - startTime,
              };
            }
            break;
          }
        } else {
          // Non-array response or error, return as-is
          return {
            server: server.name,
            status: 'success',
            data: response.data,
            durationMs: Date.now() - startTime,
          };
        }
      } while (autoPaginate && pageCount < maxPages);

      // Return aggregated data if we exited the loop normally
      if (allData.length > 0) {
        return {
          server: server.name,
          status: 'success',
          data: {
            status: 'success',
            data: allData,
            metadata: {
              returnedCount: allData.length,
              totalCount: allData.length,
              pagesRetrieved: pageCount,
            },
          },
          durationMs: Date.now() - startTime,
        };
      }

      return {
        server: server.name,
        status: 'success',
        data: null,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Check if this was a timeout (AbortError or ECONNABORTED)
    if (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        (axios.isAxiosError(error) && error.code === 'ECONNABORTED'))
    ) {
      logger.warn(`MCP server ${server.name} timeout after ${durationMs}ms (limit: ${timeout}ms)`);
      return {
        server: server.name,
        status: 'timeout',
        data: null,
        error: `Service did not respond within ${timeout}ms`,
        durationMs,
      };
    }

    logger.error(`MCP server ${server.name} error after ${durationMs}ms:`, error);
    return {
      server: server.name,
      status: 'error',
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
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
  // TEST/CI MODE: Return mock responses to avoid Claude API calls with invalid key
  // This allows integration tests to verify Gateway routing and auth without requiring real API key
  const isMockMode =
    process.env.NODE_ENV === 'test' ||
    config.claude.apiKey.startsWith('sk-ant-test-');

  if (isMockMode) {
    logger.info('Mock mode: Returning simulated Claude response', {
      username: userContext.username,
      roles: userContext.roles,
      dataSourceCount: mcpData.length,
    });

    // Return a realistic mock response that tests can verify
    const dataSources = mcpData.map((d) => d.server).join(', ') || 'none';
    return `[Mock Response] Query processed successfully for user ${userContext.username} ` +
           `with roles: ${userContext.roles.join(', ')}. ` +
           `Data sources consulted: ${dataSources}. ` +
           `Query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`;
  }

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

// Middleware - Strict Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],  // Required for Swagger UI
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,           // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Required for Swagger UI
}));
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
// RATE LIMITING
// =============================================================================

// General API rate limiter - 100 requests per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    const userContext = (req as AuthenticatedRequest).userContext;
    return userContext?.userId || req.ip || 'unknown';
  },
});

// Stricter rate limiter for AI query endpoints - 10 requests per minute
const aiQueryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI queries, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userContext = (req as AuthenticatedRequest).userContext;
    return userContext?.userId || req.ip || 'unknown';
  },
});

// Apply general limiter to all /api/ routes
app.use('/api/', generalLimiter);

// =============================================================================
// OPENAPI DOCUMENTATION
// =============================================================================

// Load and serve OpenAPI documentation
try {
  const openApiPath = path.join(__dirname, 'openapi.yaml');
  const openApiContent = fs.readFileSync(openApiPath, 'utf8');
  const openApiDocument = YAML.parse(openApiContent);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Tamshai MCP Gateway API',
  }));

  // Serve raw OpenAPI spec
  app.get('/api-docs.yaml', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/yaml');
    res.send(openApiContent);
  });

  app.get('/api-docs.json', (req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  logger.info('OpenAPI documentation available at /api-docs');
} catch (error) {
  logger.warn('OpenAPI documentation not loaded:', error);
}

// =============================================================================
// ROUTES
// =============================================================================

// Health check routes (no auth required) - extracted to routes/health.routes.ts
app.use(healthRoutes);

// Authentication middleware
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token as string | undefined;

  // Accept token from either Authorization header or query param
  // SECURITY NOTE: Query param tokens are DEPRECATED due to URL logging risks
  // Prefer POST /api/query with Authorization header for SSE streaming
  let token: string;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (tokenFromQuery) {
    // DEPRECATED: Token in URL is logged and visible in browser history
    // This is kept for backwards compatibility with EventSource clients
    // New clients should use POST /api/query with fetch() streaming
    token = tokenFromQuery;
    logger.warn('Token passed via query parameter (deprecated)', {
      path: req.path,
      method: req.method,
      // Don't log the actual token for security
      warning: 'Query param tokens are visible in logs and browser history',
    });
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

    (req as AuthenticatedRequest).userContext = userContext;
    next();
  } catch (error) {
    logger.error('Token validation failed:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// =============================================================================
// GDPR COMPLIANCE ROUTES (v1.5)
// =============================================================================
// HR-only endpoints for GDPR data subject rights
app.use('/api/admin/gdpr', authMiddleware, gdprRoutes);

// User info and MCP tools routes - extracted to routes/user.routes.ts
app.use(authMiddleware, userRoutes);

// Main AI query endpoint
app.post('/api/ai/query', authMiddleware, aiQueryLimiter, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
  const { query, conversationId }: AIQueryRequest = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  logger.info('AI Query received', {
    requestId,
    username: sanitizeForLog(userContext.username),
    query: scrubPII(query.substring(0, 100)),
    roles: userContext.roles,
  });

  try {
    // Determine accessible MCP servers
    const accessibleServers = getAccessibleMCPServersForUser(userContext.roles);
    const deniedServers = getDeniedMCPServersForUser(userContext.roles);

    // Query all accessible MCP servers in parallel
    const mcpPromises = accessibleServers.map((server) =>
      queryMCPServer(server, query, userContext)
    );
    const mcpResults = await Promise.all(mcpPromises);

    // v1.5: Separate successful from failed results
    const successfulResults = mcpResults.filter((r) => r.status === 'success');
    const failedResults = mcpResults.filter((r) => r.status !== 'success');

    // Log any partial response issues
    if (failedResults.length > 0) {
      logger.warn('Partial response in non-streaming query', {
        requestId,
        failed: failedResults.map((r) => ({ server: r.server, status: r.status, error: r.error })),
        successful: successfulResults.map((r) => r.server),
      });
    }

    // Send to Claude with context (only successful results)
    const aiResponse = await sendToClaudeWithContext(query, successfulResults, userContext);

    const durationMs = Date.now() - startTime;

    // Audit log - scrub PII before logging (security fix)
    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      requestId,
      userId: userContext.userId,
      username: userContext.username,
      roles: userContext.roles,
      query: scrubPII(query),  // Scrub PII from query before logging
      mcpServersAccessed: successfulResults.map((r) => r.server),
      mcpServersDenied: deniedServers.map((s) => s.name),
      responseSuccess: true,
      durationMs,
    };
    logger.info('Audit log:', auditLog);

    // v1.5: Include partial response warnings in metadata
    const responseWarnings = failedResults.map((r) => ({
      server: r.server,
      status: r.status,
      message: r.error,
    }));

    res.json({
      requestId,
      conversationId: conversationId || uuidv4(),
      response: aiResponse,
      status: failedResults.length > 0 ? 'partial' : 'success',
      metadata: {
        dataSourcesQueried: successfulResults.map((r) => r.server),
        dataSourcesFailed: failedResults.map((r) => r.server),
        processingTimeMs: durationMs,
      },
      ...(responseWarnings.length > 0 && { warnings: responseWarnings }),
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
  // Sanitize audit data to prevent log injection
  const sanitizedBody = JSON.stringify(req.body).replace(/[\r\n]/g, ' ');
  logger.info('Gateway audit:', { data: sanitizedBody });
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
  const userContext: UserContext = (req as AuthenticatedRequest).userContext!;

  logger.info('SSE Query received', {
    requestId,
    username: sanitizeForLog(userContext.username),
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
    const accessibleServers = getAccessibleMCPServersForUser(userContext.roles);

    // Query all accessible MCP servers in parallel (with cursor for pagination)
    const mcpPromises = accessibleServers.map((server) =>
      queryMCPServer(server, query, userContext, cursor)
    );
    const mcpResults = await Promise.all(mcpPromises);

    // v1.5: Detect timeouts and send service unavailability warnings
    const successfulResults = mcpResults.filter((r) => r.status === 'success');
    const timedOutResults = mcpResults.filter((r) => r.status === 'timeout');
    const errorResults = mcpResults.filter((r) => r.status === 'error');

    // Send SSE events for service unavailability (v1.5 partial response)
    if (timedOutResults.length > 0 || errorResults.length > 0) {
      const warnings = [
        ...timedOutResults.map((r) => ({
          server: r.server,
          code: 'TIMEOUT',
          message: r.error || 'Service did not respond in time',
        })),
        ...errorResults.map((r) => ({
          server: r.server,
          code: 'ERROR',
          message: r.error || 'Service error',
        })),
      ];

      res.write(`data: ${JSON.stringify({
        type: 'service_unavailable',
        warnings,
        successfulServers: successfulResults.map((r) => r.server),
        failedServers: [...timedOutResults, ...errorResults].map((r) => r.server),
      })}\n\n`);

      logger.warn('Partial response due to service failures', {
        requestId,
        timedOut: timedOutResults.map((r) => r.server),
        errors: errorResults.map((r) => r.server),
        successful: successfulResults.map((r) => r.server),
      });
    }

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

    // v1.4: Extract truncation warnings (Article III.2, Section 5.3)
    const truncationWarnings: string[] = [];
    mcpResults.forEach((result) => {
      const mcpResponse = result.data as MCPToolResponse;
      if (isSuccessResponse(mcpResponse) && mcpResponse.metadata?.truncated) {
        const returnedCount = mcpResponse.metadata.returnedCount || 50;
        truncationWarnings.push(
          `TRUNCATION WARNING: Data from ${result.server} returned only ${returnedCount} of ${returnedCount}+ records. ` +
          `You MUST inform the user that results are incomplete and may not represent the full dataset.`
        );
        logger.info('Truncation detected in MCP response', {
          requestId,
          server: result.server,
          returnedCount,
        });
      }
    });

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
6. When asked about "my team", first identify the user in the employee data, then find their direct reports${paginationInstructions}${truncationWarnings.length > 0 ? '\n\n' + truncationWarnings.join('\n') : ''}

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
 * @deprecated Use POST /api/query instead for better security.
 *
 * SECURITY WARNING: This endpoint accepts tokens via query parameter
 * which causes tokens to appear in:
 * - Server access logs
 * - Browser history
 * - Proxy logs
 * - Network monitoring tools
 *
 * Kept for backwards compatibility with EventSource clients.
 * New clients should use POST /api/query with fetch() streaming.
 */
app.get('/api/query', authMiddleware, aiQueryLimiter, async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const cursor = req.query.cursor as string | undefined;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  await handleStreamingQuery(req, res, query, cursor);
});

/**
 * v1.4 SSE Streaming Query Endpoint - POST (Section 6.1) - RECOMMENDED
 *
 * This is the preferred endpoint for AI queries. Supports:
 * - fetch() API with streaming response
 * - Proper Authorization header (not exposed in logs)
 * - JSON body for complex queries
 *
 * Example usage with fetch():
 * ```javascript
 * const response = await fetch('/api/query', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': `Bearer ${token}`,
 *     'Content-Type': 'application/json',
 *   },
 *   body: JSON.stringify({ query: 'Your question here' }),
 * });
 * const reader = response.body.getReader();
 * // Read SSE chunks...
 * ```
 */
app.post('/api/query', authMiddleware, aiQueryLimiter, async (req: Request, res: Response) => {
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
  const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
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
    // SECURITY: Validate mcpServer is a known server name to prevent property injection
    const validServerNames = Object.keys(config.mcpServers);
    const mcpServerName = typeof pendingAction.mcpServer === 'string' ? pendingAction.mcpServer : '';
    if (!mcpServerName || !validServerNames.includes(mcpServerName)) {
      logger.warn('Invalid MCP server in pending action', {
        requestId,
        confirmationId,
        attemptedServer: String(pendingAction.mcpServer).substring(0, 50),
        validServers: validServerNames,
      });
      res.status(500).json({ error: 'Invalid MCP server in pending action' });
      return;
    }
    const mcpServerUrl = config.mcpServers[mcpServerName as keyof typeof config.mcpServers];

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
 * Generic MCP tool proxy endpoint
 * Routes: /api/mcp/:serverName/:toolName
 *
 * Allows web applications to directly call MCP tools with proper authorization.
 * The gateway validates the user's access to the MCP server and forwards the request.
 */
app.get('/api/mcp/:serverName/:toolName', authMiddleware, async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
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
  const queryParams: Record<string, string | number | string[]> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined) continue;
    // Try to parse as number if it looks numeric
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      queryParams[key] = parseInt(value, 10);
    } else if (typeof value === 'string') {
      queryParams[key] = value;
    } else if (Array.isArray(value)) {
      queryParams[key] = value.filter((v): v is string => typeof v === 'string');
    }
    // Skip ParsedQs objects (nested query params)
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
    const accessibleServers = getAccessibleMCPServersForUser(userContext.roles);
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
  const userContext: UserContext = (req as AuthenticatedRequest).userContext!;
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
    const accessibleServers = getAccessibleMCPServersForUser(userContext.roles);
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
// LEGACY GDPR ENDPOINTS (DEPRECATED - Use /api/admin/gdpr/* instead)
// =============================================================================
// Note: Self-service GDPR endpoints are deprecated. GDPR requests are now
// processed by HR on behalf of data subjects (employees).
// See: /api/admin/gdpr/export, /api/admin/gdpr/erase, /api/admin/gdpr/breach

app.get('/api/gdpr/export', authMiddleware, (req: Request, res: Response) => {
  res.status(410).json({
    status: 'deprecated',
    message: 'Self-service GDPR export is no longer available.',
    info: 'GDPR data export requests are now processed by HR on behalf of employees.',
    contact: 'Please contact HR to request a data export.',
    adminEndpoint: 'POST /api/admin/gdpr/export (HR representatives only)',
  });
});

app.post('/api/gdpr/delete', authMiddleware, (req: Request, res: Response) => {
  res.status(410).json({
    status: 'deprecated',
    message: 'Self-service GDPR deletion is no longer available.',
    info: 'GDPR data erasure requests are now processed by HR on behalf of offboarded employees.',
    contact: 'Please contact HR to request data erasure.',
    adminEndpoint: 'POST /api/admin/gdpr/erase (HR representatives only)',
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

/**
 * Validates Keycloak connectivity by fetching the JWKS endpoint.
 * Fails fast in production if Keycloak is not reachable.
 */
async function validateKeycloakConnectivity(): Promise<void> {
  const jwksUri = config.keycloak.jwksUri ||
    `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`;

  try {
    const response = await axios.get(jwksUri, { timeout: 5000 });
    if (!response.data.keys?.length) {
      throw new Error('No signing keys found in JWKS');
    }
    logger.info('Keycloak JWKS endpoint validated', {
      keyCount: response.data.keys.length,
      jwksUri,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to validate Keycloak connectivity', {
      error: errorMessage,
      jwksUri,
    });
    if (process.env.NODE_ENV === 'production') {
      logger.error('Exiting: Keycloak validation failed in production mode');
      process.exit(1); // Fail-fast in production
    } else {
      logger.warn('Continuing without Keycloak validation (non-production mode)');
    }
  }
}

// Start server with Keycloak validation
async function startServer(): Promise<void> {
  await validateKeycloakConnectivity();

  const server = app.listen(config.port, () => {
    logger.info(`MCP Gateway listening on port ${config.port}`);
    logger.info(`Keycloak URL: ${config.keycloak.url}`);
    logger.info(`Configured MCP servers: ${Object.keys(config.mcpServers).join(', ')}`);
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    // Stop token revocation background sync
    stopTokenRevocationSync();
    logger.info('Token revocation sync stopped');

    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Export internal functions and configurations for unit testing
// Only used in test environment
export {
  validateToken,
  queryMCPServer,
  mcpServerConfigs,
  getAccessibleMCPServersForUser,
  getDeniedMCPServersForUser,
};

export default app;
