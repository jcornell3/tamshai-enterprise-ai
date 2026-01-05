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
// jwt import removed - now handled by JWTValidator class
import winston from 'winston';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import {
  isTokenRevoked,
  stopTokenRevocationSync,
} from './utils/redis';
import {
  getAccessibleMCPServers,
  getDeniedMCPServers,
  MCPServerConfig,
} from './utils/gateway-utils';
import gdprRoutes from './routes/gdpr';
import healthRoutes from './routes/health.routes';
import userRoutes from './routes/user.routes';
import { JWTValidator } from './auth/jwt-validator';
import { createAuthMiddleware } from './middleware/auth.middleware';
import { createStreamingRoutes, drainConnections, getActiveConnectionCount } from './routes/streaming.routes';
import { MCPClient, MCPQueryResult } from './mcp/mcp-client';
import { createAIQueryRoutes } from './routes/ai-query.routes';
import { createConfirmationRoutes } from './routes/confirmation.routes';
import { createMCPProxyRoutes } from './routes/mcp-proxy.routes';
import { ClaudeClient } from './ai/claude-client';

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
// JWT VALIDATOR (Extracted for testability - Phase 3 Refactoring)
// =============================================================================

const jwtValidator = new JWTValidator(
  {
    jwksUri: config.keycloak.jwksUri || `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
    issuer: config.keycloak.issuer || `${config.keycloak.url}/realms/${config.keycloak.realm}`,
    clientId: config.keycloak.clientId,
  },
  logger
);

// =============================================================================
// AUTH MIDDLEWARE (Extracted for testability - Phase 3 Refactoring)
// =============================================================================

const authMiddleware = createAuthMiddleware({
  jwtValidator,
  logger,
  isTokenRevoked,
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
// JWT VALIDATION (Phase 5 Refactoring)
// =============================================================================
// Note: JWT validation is now handled by jwtValidator instance (JWTValidator class)
// The validateToken export below is a legacy wrapper for backwards compatibility

/**
 * Legacy validateToken wrapper for backwards compatibility
 * @deprecated Use jwtValidator.validateToken() directly
 */
async function validateToken(token: string): Promise<UserContext> {
  return jwtValidator.validateToken(token);
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

// =============================================================================
// MCP CLIENT (Phase 6 Refactoring)
// =============================================================================
// MCP query functionality extracted to MCPClient class for testability
// See: src/mcp/mcp-client.ts for implementation with 95%+ test coverage

const mcpClient = new MCPClient(
  {
    readTimeout: config.timeouts.mcpRead,
    writeTimeout: config.timeouts.mcpWrite,
    maxPages: 10,
  },
  logger
);

/**
 * Query an MCP server with configurable timeout (v1.5 Performance)
 *
 * Legacy wrapper that delegates to MCPClient.queryServer()
 * @deprecated Use mcpClient.queryServer() directly for new code
 */
async function queryMCPServer(
  server: MCPServerConfig,
  query: string,
  userContext: UserContext,
  cursor?: string,
  autoPaginate: boolean = true,
  isWriteOperation: boolean = false
): Promise<MCPQueryResult> {
  return mcpClient.queryServer(server, query, userContext, cursor, autoPaginate, isWriteOperation);
}

// =============================================================================
// CLAUDE API INTEGRATION (Phase 8 Refactoring - Extracted to ClaudeClient)
// =============================================================================

const anthropic = new Anthropic({
  apiKey: config.claude.apiKey,
});

// Create ClaudeClient instance with configuration
const claudeClient = new ClaudeClient(anthropic, {
  model: config.claude.model,
  maxTokens: 4096,
  apiKey: config.claude.apiKey,
}, logger);

/**
 * Send query to Claude with MCP data context
 * Delegates to ClaudeClient.query() for testability and separation of concerns
 */
async function sendToClaudeWithContext(
  query: string,
  mcpData: Array<{ server: string; data: unknown }>,
  userContext: UserContext
): Promise<string> {
  return claudeClient.query(query, mcpData, userContext);
}

// =============================================================================
// EXPRESS APPLICATION
// =============================================================================

const app = express();

// Trust proxy headers from Kong/Caddy for correct client IP detection
// Required for rate limiting by user IP in Docker environment
app.set('trust proxy', 1);

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

// General API rate limiter - 500 requests per minute
// Increased from 100 to handle parallel requests from web apps
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
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

// Note: authMiddleware is now created via factory at the top of the file
// using createAuthMiddleware() for testability (Phase 3 Refactoring)

// =============================================================================
// GDPR COMPLIANCE ROUTES (v1.5)
// =============================================================================
// HR-only endpoints for GDPR data subject rights
app.use('/api/admin/gdpr', authMiddleware, gdprRoutes);

// User info and MCP tools routes - extracted to routes/user.routes.ts
app.use(authMiddleware, userRoutes);

// =============================================================================
// AI QUERY ROUTES (Extracted for testability - Phase 7 Refactoring)
// =============================================================================

const aiQueryRouter = createAIQueryRoutes({
  logger,
  getAccessibleServers: getAccessibleMCPServersForUser,
  getDeniedServers: getDeniedMCPServersForUser,
  queryMCPServer,
  sendToClaudeWithContext,
});

// Mount AI query routes at /api with auth and rate limiting
app.use('/api', authMiddleware, aiQueryLimiter, aiQueryRouter);

// Internal audit endpoint (for Kong HTTP log plugin)
app.post('/internal/audit', express.json(), (req: Request, res: Response) => {
  // Sanitize audit data to prevent log injection
  const sanitizedBody = JSON.stringify(req.body).replace(/[\r\n]/g, ' ');
  logger.info('Gateway audit:', { data: sanitizedBody });
  res.status(200).send('OK');
});

// =============================================================================
// v1.4 STREAMING ROUTES (Extracted for testability - Phase 3 Refactoring)
// =============================================================================

/**
 * SSE Streaming Query Routes with dependency injection
 *
 * Features:
 * - 15-second heartbeat to prevent proxy timeouts (ADDENDUM #6)
 * - Client disconnect detection with AbortController
 * - Truncation warning injection (Section 5.3)
 * - Pagination metadata (Section 5.2)
 * - Human-in-the-loop confirmations (Section 5.6)
 */
const streamingRouter = createStreamingRoutes({
  logger,
  anthropic,
  config: {
    claudeModel: config.claude.model,
    heartbeatIntervalMs: 15000,
  },
  getAccessibleServers: getAccessibleMCPServersForUser,
  queryMCPServer,
});

// Mount streaming routes at /api with auth and rate limiting
app.use('/api', authMiddleware, aiQueryLimiter, streamingRouter);

// =============================================================================
// CONFIRMATION ROUTES (Extracted for testability - Phase 7 Refactoring)
// =============================================================================

const confirmationRouter = createConfirmationRoutes({
  logger,
  mcpServerUrls: config.mcpServers,
});

// Mount confirmation routes at /api with auth
app.use('/api', authMiddleware, confirmationRouter);

// =============================================================================
// MCP PROXY ROUTES (Extracted for testability - Phase 7 Refactoring)
// =============================================================================

const mcpProxyRouter = createMCPProxyRoutes({
  logger,
  mcpServers: mcpServerConfigs,
  getAccessibleServers: getAccessibleMCPServersForUser,
});

// Mount MCP proxy routes at /api with auth
app.use('/api', authMiddleware, mcpProxyRouter);

// =============================================================================
// SERVER STARTUP
// =============================================================================
// Note: GDPR endpoints are now handled by gdprRoutes module (/api/admin/gdpr/*)

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

  // Graceful shutdown handling (Phase 4 - Connection Draining)
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);

    // Set up force exit timeout (30 seconds for graceful drain)
    const forceExitTimeout = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server stopped accepting new connections');
    });

    // Stop token revocation background sync
    stopTokenRevocationSync();
    logger.info('Token revocation sync stopped');

    // Drain active SSE connections
    const activeCount = getActiveConnectionCount();
    if (activeCount > 0) {
      logger.info(`Draining ${activeCount} active SSE connections...`);
      const drained = drainConnections();
      logger.info(`Drained ${drained} SSE connections`);
    }

    // Wait briefly for connections to close cleanly
    await new Promise(resolve => setTimeout(resolve, 1000));

    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
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
