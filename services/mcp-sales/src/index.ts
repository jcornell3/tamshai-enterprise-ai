/**
 * MCP Sales Server (Architecture v1.4)
 *
 * Provides CRM data access with:
 * - Role-based MongoDB filtering
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3103
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { UserContext, checkConnection, closeConnection, getCollection, buildRoleFilter } from './database/connection';
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, TruncationMetadata } from './types/response';
import { handleOpportunityNotFound, handleCustomerNotFound, handleInsufficientPermissions, handleCannotDeleteWonOpportunity, handleDatabaseError, withErrorHandling } from './utils/error-handler';
import { storePendingConfirmation } from './utils/redis';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

const app = express();
const PORT = parseInt(process.env.PORT || '3103');

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', { method: req.method, path: req.path, userId: req.headers['x-user-id'] });
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkConnection();
  if (!dbHealthy) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString() });
    return;
  }
  res.json({ status: 'healthy', service: 'mcp-sales', version: '1.4.0', database: 'connected', timestamp: new Date().toISOString() });
});

// =============================================================================
// TOOL: list_opportunities (v1.4 with truncation)
// =============================================================================

const ListOpportunitiesInputSchema = z.object({
  status: z.enum(['open', 'won', 'lost']).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

async function listOpportunities(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  return withErrorHandling('list_opportunities', async () => {
    const { status, minValue, maxValue, limit } = ListOpportunitiesInputSchema.parse(input);

    // Actual v1.3 collection name is 'deals' not 'opportunities'
    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    const filter: any = { ...roleFilter };
    if (status) filter.status = status;
    if (minValue !== undefined) filter.value = { ...filter.value, $gte: minValue };
    if (maxValue !== undefined) filter.value = { ...filter.value, $lte: maxValue };

    // v1.4: LIMIT+1 pattern
    const queryLimit = limit + 1;
    const opportunities = await collection.find(filter).limit(queryLimit).toArray();

    const isTruncated = opportunities.length > limit;
    const results = isTruncated ? opportunities.slice(0, limit) : opportunities;

    let metadata: TruncationMetadata | undefined;
    if (isTruncated) {
      const filters: string[] = [];
      if (status) filters.push(`status="${status}"`);
      if (minValue !== undefined) filters.push(`min value=${minValue}`);
      if (maxValue !== undefined) filters.push(`max value=${maxValue}`);
      const filterDesc = filters.length > 0 ? ` with filters: ${filters.join(', ')}` : '';
      metadata = {
        truncated: true,
        returnedCount: results.length,
        warning: `⚠️ Showing ${results.length} of 50+ opportunities${filterDesc}. Results are incomplete. Please refine your query with more specific filters.`,
      };
    }

    return createSuccessResponse(results, metadata);
  }) as Promise<MCPToolResponse<any[]>>;
}

// =============================================================================
// TOOL: get_customer
// =============================================================================

const GetCustomerInputSchema = z.object({
  customerId: z.string(),
});

async function getCustomer(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('get_customer', async () => {
    const { customerId } = GetCustomerInputSchema.parse(input);

    const collection = await getCollection('customers');
    const roleFilter = buildRoleFilter(userContext);

    const customer = await collection.findOne({ ...roleFilter, _id: new ObjectId(customerId) });

    if (!customer) {
      return handleCustomerNotFound(customerId);
    }

    return createSuccessResponse(customer);
  }) as Promise<MCPToolResponse<any>>;
}

// =============================================================================
// TOOL: delete_opportunity (v1.4 with confirmation)
// =============================================================================

const DeleteOpportunityInputSchema = z.object({
  opportunityId: z.string(),
  reason: z.string().optional(),
});

function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('sales-write') || roles.includes('executive');
}

async function deleteOpportunity(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('delete_opportunity', async () => {
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('sales-write or executive', userContext.roles);
    }

    const { opportunityId, reason } = DeleteOpportunityInputSchema.parse(input);

    // Actual v1.3 collection name is 'deals' not 'opportunities'
    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    // Use aggregation pipeline to lookup customer name from customers collection
    const opportunities = await collection.aggregate([
      { $match: { ...roleFilter, _id: new ObjectId(opportunityId) } },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: '_id',
          as: 'customer_info'
        }
      },
      {
        $addFields: {
          customer_name: { $arrayElemAt: ['$customer_info.company_name', 0] }
        }
      },
      { $project: { customer_info: 0 } } // Remove the customer_info array from output
    ]).toArray();

    if (opportunities.length === 0) {
      return handleOpportunityNotFound(opportunityId);
    }

    const opportunity = opportunities[0];

    // Check if opportunity is won (actual field is 'stage' not 'status')
    if (opportunity.stage === 'CLOSED_WON' || opportunity.stage === 'CLOSED_LOST') {
      return handleCannotDeleteWonOpportunity(opportunityId);
    }

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'delete_opportunity',
      mcpServer: 'sales',
      userId: userContext.userId,
      timestamp: Date.now(),
      opportunityId,
      customerName: opportunity.customer_name,
      value: opportunity.value,
      stage: opportunity.stage,  // Use 'stage' not 'status'
      reason: reason || 'No reason provided',
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Delete opportunity for ${opportunity.customer_name}?

Value: $${opportunity.value.toLocaleString()}
Stage: ${opportunity.stage}
${reason ? `Reason: ${reason}` : ''}

This action will permanently delete the opportunity and cannot be undone.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  }) as Promise<MCPToolResponse<any>>;
}

async function executeDeleteOpportunity(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_delete_opportunity', async () => {
    const opportunityId = confirmationData.opportunityId as string;

    // Actual v1.3 collection name is 'deals' not 'opportunities'
    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    const result = await collection.deleteOne({ ...roleFilter, _id: new ObjectId(opportunityId) });

    if (result.deletedCount === 0) {
      return handleOpportunityNotFound(opportunityId);
    }

    return createSuccessResponse({
      success: true,
      message: `Opportunity has been successfully deleted`,
      opportunityId,
    });
  }) as Promise<MCPToolResponse<any>>;
}

// =============================================================================
// ENDPOINTS
// =============================================================================

app.post('/query', async (req: Request, res: Response) => {
  const userContext: UserContext = req.body.userContext || {
    userId: req.headers['x-user-id'] as string,
    username: req.headers['x-user-username'] as string || 'unknown',
    email: req.headers['x-user-email'] as string,
    roles: (req.headers['x-user-roles'] as string || '').split(','),
  };

  if (!userContext.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  res.json({ status: 'success', message: 'MCP Sales Server ready', availableTools: ['list_opportunities', 'get_customer', 'delete_opportunity'], userRoles: userContext.roles });
});

app.post('/tools/list_opportunities', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await listOpportunities(input || {}, userContext);
  res.json(result);
});

app.post('/tools/get_customer', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await getCustomer(input, userContext);
  res.json(result);
});

app.post('/tools/delete_opportunity', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await deleteOpportunity(input, userContext);
  res.json(result);
});

app.post('/execute', async (req: Request, res: Response) => {
  const { action, data, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  let result: MCPToolResponse;
  switch (action) {
    case 'delete_opportunity':
      result = await executeDeleteOpportunity(data, userContext);
      break;
    default:
      result = createErrorResponse('UNKNOWN_ACTION', `Unknown action: ${action}`, 'Check the action name and try again');
  }
  res.json(result);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`MCP Sales Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4');
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    logger.info('Database connection: OK');
  } else {
    logger.error('Database connection: FAILED');
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await closeConnection();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await closeConnection();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
