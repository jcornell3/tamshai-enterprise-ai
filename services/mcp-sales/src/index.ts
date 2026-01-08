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

// Authorization helper - checks if user has Sales access
function hasSalesAccess(roles: string[]): boolean {
  return roles.some(role =>
    role === 'sales-read' ||
    role === 'sales-write' ||
    role === 'executive'
  );
}

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
  stage: z.string().optional(),  // CLOSED_WON, PROPOSAL, NEGOTIATION, DISCOVERY, QUALIFICATION
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

async function listOpportunities(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  return withErrorHandling('list_opportunities', async () => {
    const { stage, minValue, maxValue, limit, cursor } = ListOpportunitiesInputSchema.parse(input);

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Actual v1.3 collection name is 'deals' not 'opportunities'
    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    const filter: any = { ...roleFilter };
    // MongoDB stores stage in uppercase (CLOSED_WON, PROPOSAL, NEGOTIATION, etc.)
    if (stage) filter.stage = stage.toUpperCase();
    if (minValue !== undefined) filter.value = { ...filter.value, $gte: minValue };
    if (maxValue !== undefined) filter.value = { ...filter.value, $lte: maxValue };

    // Cursor-based pagination: add filter to start after cursor position
    if (cursorData) {
      filter._id = { $lt: new ObjectId(cursorData._id) };
    }

    // v1.4: LIMIT+1 pattern to detect if more records exist
    // Use aggregation pipeline to join customer data
    const queryLimit = limit + 1;
    const pipeline = [
      { $match: filter },
      { $sort: { _id: -1 } },
      { $limit: queryLimit },
      // Lookup customer data to get company_name
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      // Unwind customer array (will be single doc or empty)
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      // Project final structure
      {
        $project: {
          _id: 1,
          deal_name: 1,
          customer_id: 1,
          customer_name: '$customer.company_name',  // Add customer name from lookup
          stage: 1,
          value: 1,
          currency: 1,
          probability: 1,
          expected_close_date: 1,
          actual_close_date: 1,
          deal_type: 1,
          products: 1,
          notes: 1,
          owner: 1,
          created_at: 1,
          updated_at: 1,
          activities: 1
        }
      }
    ];

    const opportunities = await collection.aggregate(pipeline).toArray();

    const hasMore = opportunities.length > limit;
    const rawResults = hasMore ? opportunities.slice(0, limit) : opportunities;

    // Normalize results: convert ObjectId to string, map deal_name to title, keep stage in uppercase
    const results = rawResults.map((opp: any) => ({
      ...opp,
      _id: opp._id.toString(),
      id: opp._id.toString(),
      title: opp.deal_name,  // Map deal_name to title for frontend compatibility
      stage: opp.stage,  // Keep original case (UPPERCASE from database)
      customer_id: opp.customer_id?.toString(),
      customer_name: opp.customer_name || null,  // Add customer name from lookup
    }));

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      // Get the last record to build the next cursor
      const lastOpportunity = rawResults[rawResults.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastOpportunity && {
          nextCursor: encodeCursor({
            _id: lastOpportunity._id.toString(),
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more opportunities, say "show next page" or "get more opportunities". You can also use filters like stage or value range to narrow results.`,
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

    // Convert ObjectId to string and ensure contacts array ObjectIds are also converted
    const customerData = {
      ...customer,
      _id: customer._id.toString(),
      id: customer._id.toString(), // Add id field for consistency
      contacts: customer.contacts?.map((contact: any) => ({
        ...contact,
        _id: contact._id?.toString(),
      })) || [],
    };

    return createSuccessResponse(customerData);
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
// TOOL: close_opportunity (v1.4 with confirmation)
// =============================================================================

const CloseOpportunityInputSchema = z.object({
  opportunityId: z.string(),
  outcome: z.enum(['won', 'lost']),
  reason: z.string().optional(),
});

async function closeOpportunity(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('close_opportunity', async () => {
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('sales-write or executive', userContext.roles);
    }

    const { opportunityId, outcome, reason } = CloseOpportunityInputSchema.parse(input);

    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

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
      { $project: { customer_info: 0 } }
    ]).toArray();

    if (opportunities.length === 0) {
      return handleOpportunityNotFound(opportunityId);
    }

    const opportunity = opportunities[0];

    const confirmationId = uuidv4();
    const newStage = outcome === 'won' ? 'CLOSED_WON' : 'CLOSED_LOST';
    const confirmationData = {
      action: 'close_opportunity',
      mcpServer: 'sales',
      userId: userContext.userId,
      timestamp: Date.now(),
      opportunityId,
      customerName: opportunity.customer_name,
      value: opportunity.value,
      currentStage: opportunity.stage,
      newStage,
      outcome,
      reason: reason || 'No reason provided',
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Close opportunity for ${opportunity.customer_name} as ${outcome.toUpperCase()}?

Value: $${opportunity.value.toLocaleString()}
Current Stage: ${opportunity.stage}
New Stage: ${newStage}
${reason ? `Reason: ${reason}` : ''}

This action will mark the opportunity as ${outcome === 'won' ? 'won' : 'lost'}.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  }) as Promise<MCPToolResponse<any>>;
}

async function executeCloseOpportunity(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_close_opportunity', async () => {
    const opportunityId = confirmationData.opportunityId as string;
    const newStage = confirmationData.newStage as string;

    const collection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    const result = await collection.updateOne(
      { ...roleFilter, _id: new ObjectId(opportunityId) },
      { $set: { stage: newStage, updated_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      return handleOpportunityNotFound(opportunityId);
    }

    return createSuccessResponse({
      success: true,
      message: `Opportunity has been closed as ${newStage}`,
      opportunityId,
      stage: newStage,
    });
  }) as Promise<MCPToolResponse<any>>;
}

// =============================================================================
// TOOL: delete_customer (v1.4 with confirmation)
// =============================================================================

const DeleteCustomerInputSchema = z.object({
  customerId: z.string(),
  reason: z.string().optional(),
});

async function deleteCustomer(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('delete_customer', async () => {
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('sales-write or executive', userContext.roles);
    }

    const { customerId, reason } = DeleteCustomerInputSchema.parse(input);

    const collection = await getCollection('customers');
    const roleFilter = buildRoleFilter(userContext);

    const customer = await collection.findOne({ ...roleFilter, _id: new ObjectId(customerId) });

    if (!customer) {
      return handleCustomerNotFound(customerId);
    }

    // Check if customer has active opportunities
    const dealsCollection = await getCollection('deals');
    const activeDeals = await dealsCollection.countDocuments({
      ...roleFilter,
      customer_id: customer._id,
      stage: { $nin: ['CLOSED_WON', 'CLOSED_LOST'] }
    });

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'delete_customer',
      mcpServer: 'sales',
      userId: userContext.userId,
      timestamp: Date.now(),
      customerId,
      customerName: customer.company_name,
      activeDeals,
      reason: reason || 'No reason provided',
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Delete customer ${customer.company_name}?

Customer ID: ${customerId}
${activeDeals > 0 ? `⚠️ WARNING: Customer has ${activeDeals} active opportunity(s)` : 'No active opportunities'}
${reason ? `Reason: ${reason}` : ''}

This action will permanently delete the customer record and cannot be undone.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  }) as Promise<MCPToolResponse<any>>;
}

async function executeDeleteCustomer(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_delete_customer', async () => {
    const customerId = confirmationData.customerId as string;

    const collection = await getCollection('customers');
    const roleFilter = buildRoleFilter(userContext);

    const result = await collection.deleteOne({ ...roleFilter, _id: new ObjectId(customerId) });

    if (result.deletedCount === 0) {
      return handleCustomerNotFound(customerId);
    }

    return createSuccessResponse({
      success: true,
      message: `Customer has been successfully deleted`,
      customerId,
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

  // Authorization check - must have Sales access
  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
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

  // Authorization check - must have Sales access
  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
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

  // Authorization check - must have Sales access
  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
    return;
  }

  const result = await deleteOpportunity({ opportunityId }, userContext);
  res.json(result);
});

app.post('/tools/close_opportunity', async (req: Request, res: Response) => {
  const { userContext, opportunityId, outcome, reason } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  // Authorization check - must have Sales access
  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
    return;
  }

  const result = await closeOpportunity({ opportunityId, outcome, reason }, userContext);
  res.json(result);
});

app.post('/tools/delete_customer', async (req: Request, res: Response) => {
  const { userContext, customerId, reason } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  // Authorization check - must have Sales access
  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
    return;
  }

  const result = await deleteCustomer({ customerId, reason }, userContext);
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
    case 'close_opportunity':
      result = await executeCloseOpportunity(data, userContext);
      break;
    case 'delete_customer':
      result = await executeDeleteCustomer(data, userContext);
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
