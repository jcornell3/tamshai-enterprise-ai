/**
 * MCP Tax Server
 *
 * Express server providing tax domain tools via HTTP endpoints.
 * Port: 3107
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { requireGatewayAuth } from '@tamshai/shared';
import { UserContext, checkConnection } from './database/connection';
import { checkRedisConnection } from './utils/redis';
import { logger } from './utils/logger';
import { handleInsufficientPermissions } from './utils/error-handler';
import {
  listSalesTaxRates,
  ListSalesTaxRatesInput,
  listQuarterlyEstimates,
  ListQuarterlyEstimatesInput,
  listAnnualFilings,
  ListAnnualFilingsInput,
  listStateRegistrations,
  ListStateRegistrationsInput,
  listAuditLogs,
  ListAuditLogsInput,
  getTaxSummary,
  GetTaxSummaryInput,
} from './tools';

const app = express();
const PORT = parseInt(process.env.PORT || '3107', 10);

// Middleware
app.use(express.json({ limit: '1mb' }));

// Gateway authentication middleware (prevents direct access bypass)
app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET, { logger }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
  });
  next();
});

// Authorization helpers
function hasTaxReadAccess(roles: string[]): boolean {
  return roles.some(
    (role) =>
      role === 'tax-read' ||
      role === 'tax-write' ||
      role === 'executive' ||
      role === 'finance-read' ||
      role === 'finance-write'
  );
}

function hasTaxWriteAccess(roles: string[]): boolean {
  return roles.some(
    (role) => role === 'tax-write' || role === 'executive' || role === 'finance-write'
  );
}

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const dbHealthy = await checkConnection();
  const redisHealthy = await checkRedisConnection();

  const status = dbHealthy && redisHealthy ? 'healthy' : 'unhealthy';
  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    service: 'mcp-tax',
    version: '1.0.0',
    checks: {
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

// Tool endpoints

// List Sales Tax Rates
app.post('/tools/list_sales_tax_rates', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListSalesTaxRatesInput;

  // Sales tax rates are public reference data, so we allow broader access
  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('list_sales_tax_rates', ['tax-read', 'tax-write', 'executive'])
    );
    return;
  }

  const result = await listSalesTaxRates(input, userContext);
  res.json(result);
});

// List Quarterly Estimates
app.post('/tools/list_quarterly_estimates', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListQuarterlyEstimatesInput;

  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('list_quarterly_estimates', [
        'tax-read',
        'tax-write',
        'executive',
      ])
    );
    return;
  }

  const result = await listQuarterlyEstimates(input, userContext);
  res.json(result);
});

// List Annual Filings
app.post('/tools/list_annual_filings', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListAnnualFilingsInput;

  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('list_annual_filings', ['tax-read', 'tax-write', 'executive'])
    );
    return;
  }

  const result = await listAnnualFilings(input, userContext);
  res.json(result);
});

// List State Registrations
app.post('/tools/list_state_registrations', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListStateRegistrationsInput;

  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('list_state_registrations', [
        'tax-read',
        'tax-write',
        'executive',
      ])
    );
    return;
  }

  const result = await listStateRegistrations(input, userContext);
  res.json(result);
});

// List Audit Logs
app.post('/tools/list_audit_logs', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListAuditLogsInput;

  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('list_audit_logs', ['tax-read', 'tax-write', 'executive'])
    );
    return;
  }

  const result = await listAuditLogs(input, userContext);
  res.json(result);
});

// Get Tax Summary
app.post('/tools/get_tax_summary', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetTaxSummaryInput;

  if (!hasTaxReadAccess(userContext.roles)) {
    res.json(
      handleInsufficientPermissions('get_tax_summary', ['tax-read', 'tax-write', 'executive'])
    );
    return;
  }

  const result = await getTaxSummary(input, userContext);
  res.json(result);
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
    suggestedAction: 'Check the endpoint path and try again.',
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    suggestedAction: 'Please try again. If the problem persists, contact support.',
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`MCP Tax server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  });
});

export { app };
