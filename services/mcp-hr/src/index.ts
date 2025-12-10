/**
 * MCP HR Server (Architecture v1.4)
 *
 * Provides employee data access with:
 * - Row Level Security (RLS) enforcement
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3101
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { UserContext, checkConnection, closePool } from './database/connection';
import { getEmployee, GetEmployeeInputSchema } from './tools/get-employee';
import { listEmployees, ListEmployeesInputSchema } from './tools/list-employees';
import {
  deleteEmployee,
  executeDeleteEmployee,
  DeleteEmployeeInputSchema,
} from './tools/delete-employee';
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
const PORT = parseInt(process.env.PORT || '3101');

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
    service: 'mcp-hr',
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
 * Analyzes the natural language query and routes to appropriate tool.
 * Supports cursor-based pagination for complete data retrieval.
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
      query: query?.substring(0, 100),
      userId: userContext.userId,
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Analyze the query to determine which tool to invoke
    const queryLower = (query || '').toLowerCase();

    // Check for pagination requests (next page, more, continue)
    const isPaginationRequest = queryLower.includes('next page') ||
      queryLower.includes('more employees') ||
      queryLower.includes('show more') ||
      queryLower.includes('continue') ||
      queryLower.includes('next batch') ||
      !!cursor;  // If cursor is provided, it's a pagination request

    // Check for employee listing queries
    const isListQuery = queryLower.includes('list') ||
      queryLower.includes('all employees') ||
      queryLower.includes('show employees') ||
      queryLower.includes('employee list') ||
      queryLower.includes('employees') ||
      queryLower.includes('who works') ||
      queryLower.includes('staff');

    // Check for specific employee queries (ID or name)
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const hasEmployeeId = uuidPattern.test(query || '');

    // Extract filter keywords
    const departmentMatch = queryLower.match(/(?:in|from|department)\s+(\w+)/);
    const locationMatch = queryLower.match(/(?:in|at|location)\s+([^,]+)/);

    let result: MCPToolResponse;

    if (hasEmployeeId && !isPaginationRequest) {
      // Get specific employee by ID
      const employeeId = query.match(uuidPattern)?.[0];
      result = await getEmployee({ employeeId: employeeId! }, userContext);
    } else if (isListQuery || isPaginationRequest) {
      // List employees with optional filters and pagination
      const input: any = { limit: 50 };

      // Pass cursor for pagination
      if (cursor) {
        input.cursor = cursor;
      }

      if (departmentMatch) {
        input.department = departmentMatch[1];
      }
      if (locationMatch) {
        input.location = locationMatch[1].trim();
      }

      result = await listEmployees(input, userContext);
    } else {
      // Default: Return list of employees to provide context
      result = await listEmployees({ limit: 50 }, userContext);
    }

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
 * Get Employee Tool
 */
app.post('/tools/get_employee', async (req: Request, res: Response) => {
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

    const result = await getEmployee(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_employee error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get employee',
    });
  }
});

/**
 * List Employees Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_employees', async (req: Request, res: Response) => {
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

    const result = await listEmployees(input || {}, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_employees error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list employees',
    });
  }
});

/**
 * Delete Employee Tool (v1.4 with confirmation)
 */
app.post('/tools/delete_employee', async (req: Request, res: Response) => {
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

    const result = await deleteEmployee(input, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_employee error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete employee',
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
      case 'delete_employee':
        result = await executeDeleteEmployee(data, userContext);
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
  logger.info(`MCP HR Server listening on port ${PORT}`);
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
