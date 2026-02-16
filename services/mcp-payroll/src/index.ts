/**
 * MCP Payroll Server
 *
 * Express server providing payroll domain tools via HTTP endpoints.
 * Port: 3106
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { requireGatewayAuth, createDomainAuthMiddleware, createHealthRoutes } from '@tamshai/shared';
import { UserContext, checkConnection } from './database/connection';
import { checkRedisConnection } from './utils/redis';
import { logger } from './utils/logger';
import {
  listPayRuns,
  ListPayRunsInput,
  listPayStubs,
  ListPayStubsInput,
  getPayStub,
  GetPayStubInput,
  listContractors,
  ListContractorsInput,
  getTaxWithholdings,
  GetTaxWithholdingsInput,
  getBenefits,
  GetBenefitsInput,
  getDirectDeposit,
  GetDirectDepositInput,
  getPayrollSummary,
  GetPayrollSummaryInput,
  calculateEarnings,
  CalculateEarningsInput,
  createPayRun,
  executeCreatePayRun,
  CreatePayRunInput,
} from './tools';
import { getPendingConfirmation } from './utils/redis';

const app = express();
const PORT = parseInt(process.env.PORT || '3106', 10);

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

// Domain authorization middleware - all /tools/* routes require payroll read access
app.use('/tools', createDomainAuthMiddleware('payroll'));

// Health check endpoint
app.use(createHealthRoutes('mcp-payroll', [
  { name: 'database', check: async () => { try { return await checkConnection(); } catch { return false; } } },
  { name: 'redis', check: async () => { try { return await checkRedisConnection(); } catch { return false; } } },
]));

// Tool endpoints

// List Pay Runs
app.post('/tools/list_pay_runs', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListPayRunsInput;
  const result = await listPayRuns(input, userContext);
  res.json(result);
});

// List Pay Stubs
app.post('/tools/list_pay_stubs', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListPayStubsInput;
  const result = await listPayStubs(input, userContext);
  res.json(result);
});

// Get Pay Stub
app.post('/tools/get_pay_stub', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetPayStubInput;
  const result = await getPayStub(input, userContext);
  res.json(result);
});

// List Contractors
app.post('/tools/list_contractors', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & ListContractorsInput;
  const result = await listContractors(input, userContext);
  res.json(result);
});

// Get Tax Withholdings
app.post('/tools/get_tax_withholdings', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetTaxWithholdingsInput;
  const result = await getTaxWithholdings(input, userContext);
  res.json(result);
});

// Get Benefits
app.post('/tools/get_benefits', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetBenefitsInput;
  const result = await getBenefits(input, userContext);
  res.json(result);
});

// Get Direct Deposit
app.post('/tools/get_direct_deposit', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetDirectDepositInput;
  const result = await getDirectDeposit(input, userContext);
  res.json(result);
});

// Get Payroll Summary
app.post('/tools/get_payroll_summary', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & GetPayrollSummaryInput;
  const result = await getPayrollSummary(input, userContext);
  res.json(result);
});

// Calculate Earnings
app.post('/tools/calculate_earnings', async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & CalculateEarningsInput;
  const result = await calculateEarnings(input, userContext);
  res.json(result);
});

// Create Pay Run (requires write access)
app.post('/tools/create_pay_run', createDomainAuthMiddleware('payroll', 'write'), async (req: Request, res: Response) => {
  const { userContext, ...input } = req.body as { userContext: UserContext } & CreatePayRunInput;
  const result = await createPayRun(input, userContext);
  res.json(result);
});

// Execute confirmed actions
app.post('/execute', async (req: Request, res: Response) => {
  const { confirmationId, userContext } = req.body;

  if (!userContext?.userId) {
    res.status(400).json({
      status: 'error',
      code: 'MISSING_USER_CONTEXT',
      message: 'User context is required',
      suggestedAction: 'Provide userContext with userId and roles.',
    });
    return;
  }

  const confirmationData = await getPendingConfirmation(confirmationId);
  if (!confirmationData) {
    res.status(404).json({
      status: 'error',
      code: 'CONFIRMATION_NOT_FOUND',
      message: 'Confirmation expired or not found',
      suggestedAction: 'The confirmation has expired (5-minute TTL). Please initiate the action again.',
    });
    return;
  }

  const action = confirmationData.action as string;
  let result;

  switch (action) {
    case 'create_pay_run':
      result = await executeCreatePayRun(confirmationData, userContext);
      break;
    default:
      result = {
        status: 'error' as const,
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${action}`,
        suggestedAction: 'Check the action name and try again.',
      };
  }

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
  logger.info(`MCP Payroll server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  });
});

export { app };
