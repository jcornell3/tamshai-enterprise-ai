/**
 * MCP Finance Server (Architecture v1.4)
 *
 * Provides financial data access with:
 * - Row Level Security (RLS) enforcement
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3102
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { UserContext, checkConnection, closePool } from './database/connection';
import { getBudget, GetBudgetInputSchema } from './tools/get-budget';
import { listBudgets, ListBudgetsInputSchema } from './tools/list-budgets';
import { listInvoices, ListInvoicesInputSchema } from './tools/list-invoices';
import { getExpenseReport, GetExpenseReportInputSchema } from './tools/get-expense-report';
import {
  deleteInvoice,
  executeDeleteInvoice,
  DeleteInvoiceInputSchema,
} from './tools/delete-invoice';
import {
  approveBudget,
  executeApproveBudget,
  ApproveBudgetInputSchema,
} from './tools/approve-budget';
import { MCPToolResponse } from './types/response';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const app = express();
const PORT = parseInt(process.env.PORT || '3102');

// Middleware
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    userId: req.headers['x-user-id'],
  });
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkConnection();

  if (!dbHealthy) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    status: 'healthy',
    service: 'mcp-finance',
    version: '1.4.0',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// MCP QUERY ENDPOINT
// =============================================================================

/**
 * Main query endpoint called by MCP Gateway
 *
 * Extracts user context from headers and routes to appropriate tool.
 * Supports cursor-based pagination for list operations.
 */
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, userContext: bodyUserContext, cursor } = req.body;

    // Build user context from request
    const userContext: UserContext = bodyUserContext || {
      userId: req.headers['x-user-id'] as string,
      username: req.headers['x-user-username'] as string || 'unknown',
      email: req.headers['x-user-email'] as string,
      roles: (req.headers['x-user-roles'] as string || '').split(','),
    };

    if (!userContext.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
        suggestedAction: 'Ensure authentication headers are set',
      });
      return;
    }

    logger.info('Processing query', {
      query: query.substring(0, 100),
      userId: userContext.userId,
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Simple query routing based on keywords
    const queryLower = query.toLowerCase();

    // Check for pagination requests
    const isPaginationRequest = queryLower.includes('next page') ||
      queryLower.includes('more') ||
      queryLower.includes('show more') ||
      queryLower.includes('continue') ||
      !!cursor;

    // Check if this is a budget query
    const isBudgetQuery = queryLower.includes('budget') ||
      queryLower.includes('spending') ||
      queryLower.includes('allocation');

    // Check if this is a list invoices query
    const isListInvoicesQuery = queryLower.includes('invoice');

    // Route to appropriate handler
    if (isBudgetQuery) {
      // Extract department filter if mentioned
      const deptMatch = queryLower.match(/(?:for|in)\s+(\w+)\s+(?:department|dept)?/);
      const yearMatch = queryLower.match(/(\d{4})/);

      const input: any = { limit: 50 };
      if (deptMatch) {
        input.department = deptMatch[1].toUpperCase();
      }
      if (yearMatch) {
        input.fiscalYear = parseInt(yearMatch[1]);
      }

      const result = await listBudgets(input, userContext);
      res.json(result);
      return;
    }

    if (isListInvoicesQuery || isPaginationRequest) {
      const input: any = { limit: 50 };
      if (cursor) {
        input.cursor = cursor;
      }

      const result = await listInvoices(input, userContext);
      res.json(result);
      return;
    }

    // Default: Return budget summary as it's the most commonly requested
    const result = await listBudgets({ limit: 50 }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('Query error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to process query',
      suggestedAction: 'Please try again or contact support',
    });
  }
});

// =============================================================================
// TOOL ENDPOINTS (v1.4)
// =============================================================================

/**
 * Get Budget Tool
 */
app.post('/tools/get_budget', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getBudget(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get budget',
    });
  }
});

/**
 * List Invoices Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_invoices', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await listInvoices(input || {}, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_invoices error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list invoices',
    });
  }
});

/**
 * List Budgets Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_budgets', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await listBudgets(input || {}, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_budgets error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list budgets',
    });
  }
});

/**
 * Get Expense Report Tool
 */
app.post('/tools/get_expense_report', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await getExpenseReport(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get expense report',
    });
  }
});

/**
 * Delete Invoice Tool (v1.4 with confirmation)
 */
app.post('/tools/delete_invoice', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await deleteInvoice(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete invoice',
    });
  }
});

/**
 * Approve Budget Tool (v1.4 with confirmation)
 */
app.post('/tools/approve_budget', async (req: Request, res: Response) => {
  try {
    const { input, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await approveBudget(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve budget',
    });
  }
});

// =============================================================================
// EXECUTE ENDPOINT (v1.4 - Called by Gateway after confirmation)
// =============================================================================

/**
 * Execute a confirmed action
 *
 * This endpoint is called by the Gateway after the user approves a
 * pending confirmation. It executes the actual write operation.
 */
app.post('/execute', async (req: Request, res: Response) => {
  try {
    const { action, data, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    logger.info('Executing confirmed action', {
      action,
      userId: userContext.userId,
    });

    let result: MCPToolResponse;

    switch (action) {
      case 'delete_invoice':
        result = await executeDeleteInvoice(data, userContext);
        break;

      case 'approve_budget':
        result = await executeApproveBudget(data, userContext);
        break;

      default:
        result = {
          status: 'error',
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`,
          suggestedAction: 'Check the action name and try again',
        };
    }

    res.json(result);
  } catch (error) {
    logger.error('Execute error:', error);
    res.status(500).json({
      status: 'error',
      code: 'EXECUTION_FAILED',
      message: 'Failed to execute confirmed action',
      suggestedAction: 'Please try the operation again',
    });
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`MCP Finance Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4');

  // Check database connection
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    logger.info('Database connection: OK');
  } else {
    logger.error('Database connection: FAILED');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
