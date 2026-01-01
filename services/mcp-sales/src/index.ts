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
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, PaginationMetadata } from './types/response';
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
// TOOL: list_opportunities (v1.4 with cursor-based pagination)
// =============================================================================

/**
 * Cursor structure for MongoDB keyset pagination
 * Encoded as base64 JSON for opaque transport
 */
interface PaginationCursor {
  _id: string; // MongoDB ObjectId as string
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as PaginationCursor;
  } catch {
    return null;
  }
}

const ListOpportunitiesInputSchema = z.object({
  status: z.enum(['open', 'won', 'lost']).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

async function listOpportunities(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  return withErrorHandling('list_opportunities', async () => {
    const { status, minValue, maxValue, limit, cursor } = ListOpportunitiesInputSchema.parse(input);

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Actual v1.3 collection name is 'deals' not 'opportunities'
    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    const filter: any = { ...roleFilter };
    if (status) filter.status = status;
    if (minValue !== undefined) filter.value = { ...filter.value, $gte: minValue };
    if (maxValue !== undefined) filter.value = { ...filter.value, $lte: maxValue };

    // Cursor-based pagination: add filter to start after cursor position
    if (cursorData) {
      filter._id = { $lt: new ObjectId(cursorData._id) };
    }

    // v1.4: LIMIT+1 pattern to detect if more records exist
    const queryLimit = limit + 1;
    const opportunities = await collection
      .find(filter)
      .sort({ _id: -1 }) // Sort by _id descending for consistent pagination
      .limit(queryLimit)
      .toArray();

    const hasMore = opportunities.length > limit;
    const results = hasMore ? opportunities.slice(0, limit) : opportunities;

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      // Get the last record to build the next cursor
      const lastOpportunity = results[results.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastOpportunity && {
          nextCursor: encodeCursor({
            _id: lastOpportunity._id.toString(),
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more opportunities, say "show next page" or "get more opportunities". You can also use filters like status or value range to narrow results.`,
        }),
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
  const { query, cursor } = req.body;
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

  logger.info('Processing query', {
    query: query?.substring(0, 100),
    userId: userContext.userId,
    roles: userContext.roles,
    hasCursor: !!cursor,
  });

  // Simple query routing based on keywords
  const queryLower = query?.toLowerCase() || '';

  // Check for pagination requests
  const isPaginationRequest = queryLower.includes('next page') ||
    queryLower.includes('more opportunities') ||
    queryLower.includes('show more') ||
    queryLower.includes('continue') ||
    !!cursor;

  // Check if this is a list opportunities query
  const isListQuery = queryLower.includes('list') ||
    queryLower.includes('show') ||
    queryLower.includes('opportunities') ||
    queryLower.includes('deals') ||
    isPaginationRequest;

  if (isListQuery || isPaginationRequest) {
    const input: any = { limit: 50 };
    if (cursor) {
      input.cursor = cursor;
    }

    const result = await listOpportunities(input, userContext);
    res.json(result);
    return;
  }

  res.json({ status: 'success', message: 'MCP Sales Server ready', availableTools: ['list_opportunities', 'get_customer', 'delete_opportunity'], userRoles: userContext.roles });
});

app.post('/tools/list_opportunities', async (req: Request, res: Response) => {
  const { userContext, stage, status, limit, cursor } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await listOpportunities({ stage, status, limit, cursor }, userContext);
  res.json(result);
});

app.post('/tools/get_customer', async (req: Request, res: Response) => {
  const { userContext, customerId } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await getCustomer({ customerId }, userContext);
  res.json(result);
});

app.post('/tools/delete_opportunity', async (req: Request, res: Response) => {
  const { userContext, opportunityId } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await deleteOpportunity({ opportunityId }, userContext);
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
