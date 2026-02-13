/**
 * MCP UI Service - Express Application
 *
 * Provides the Generative UI service for rendering AI-driven components.
 */
import express, { Request, Response, NextFunction } from 'express';
import { requireGatewayAuth } from '@tamshai/shared';
import { displayRouter } from './routes/display';
import { createAuthServiceFromEnv } from './auth';
import { setAuthService } from './mcp/mcp-client';
import { logger } from './utils/logger';

const app = express();

// Initialize Keycloak auth service for service-to-service communication
const authService = createAuthServiceFromEnv();
setAuthService(authService);
logger.info('MCP-UI initialized with Keycloak service authentication');

// CORS middleware - allow requests from web apps running on different ports
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  // Allow localhost origins on any port (for local development)
  if (origin && origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|www\.tamshai-playground\.local)(:\d+)?$/)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Internal-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// JSON body parser middleware
app.use(express.json());

// NOTE: Gateway authentication is NOT required for MCP UI because:
// - The /api/display endpoint is called directly from the browser with user JWT tokens
// - JWT validation is handled in the display router

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'mcp-ui',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Display API routes
app.use('/api/display', displayRouter);

// 404 handler for unknown routes - must be after all other routes
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: 'Route not found',
    suggestedAction:
      'Check the API documentation for available endpoints. Valid endpoints include: GET /health, POST /api/display',
  });
});

export { app };
