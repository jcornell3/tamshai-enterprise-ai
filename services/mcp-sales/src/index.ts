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
import { requireGatewayAuth } from '@tamshai/shared';
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

// Gateway authentication middleware (prevents direct access bypass)
app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET, { logger }));

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
// TOOL: list_customers (v1.4 with cursor-based pagination)
// =============================================================================

const ListCustomersInputSchema = z.object({
  industry: z.string().optional(),
  status: z.string().optional(),  // ACTIVE, PROSPECT, INACTIVE
  minRevenue: z.number().optional(),
  maxRevenue: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

async function listCustomers(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  return withErrorHandling('list_customers', async () => {
    const { industry, status, minRevenue, maxRevenue, limit, cursor } = ListCustomersInputSchema.parse(input);

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const collection = await getCollection('customers');
    const roleFilter = buildRoleFilter(userContext);

    const filter: any = { ...roleFilter };
    if (industry) filter.industry = industry;
    if (status) filter.status = status.toUpperCase();
    if (minRevenue !== undefined) filter.annual_revenue = { ...filter.annual_revenue, $gte: minRevenue };
    if (maxRevenue !== undefined) filter.annual_revenue = { ...filter.annual_revenue, $lte: maxRevenue };

    // Cursor-based pagination
    if (cursorData) {
      filter._id = { $lt: new ObjectId(cursorData._id) };
    }

    // v1.4: LIMIT+1 pattern
    const queryLimit = limit + 1;
    const customers = await collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(queryLimit)
      .toArray();

    const hasMore = customers.length > limit;
    const rawResults = hasMore ? customers.slice(0, limit) : customers;

    // Normalize results
    const results = rawResults.map((customer: any) => ({
      ...customer,
      _id: customer._id.toString(),
      id: customer._id.toString(),
      contacts: customer.contacts?.map((contact: any) => ({
        ...contact,
        _id: contact._id?.toString(),
      })) || [],
    }));

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      const lastCustomer = rawResults[rawResults.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastCustomer && {
          nextCursor: encodeCursor({
            _id: lastCustomer._id.toString(),
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more customers, say "show next page" or "load more customers". You can also filter by industry or status.`,
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
// TOOL: list_leads (with cursor-based pagination)
// =============================================================================

const ListLeadsInputSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED']).optional(),
  source: z.string().optional(),
  minScore: z.number().optional(),
  owner: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

async function listLeads(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  return withErrorHandling('list_leads', async () => {
    const { status, source, minScore, owner, limit, cursor } = ListLeadsInputSchema.parse(input);

    const cursorData = cursor ? decodeCursor(cursor) : null;
    const collection = await getCollection('leads');
    const roleFilter = buildRoleFilter(userContext);

    const filter: any = { ...roleFilter };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (minScore !== undefined) filter['score.total'] = { $gte: minScore };
    if (owner) filter.owner_id = owner;

    // Cursor-based pagination
    if (cursorData) {
      filter._id = { $lt: new ObjectId(cursorData._id) };
    }

    const queryLimit = limit + 1;
    const leads = await collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(queryLimit)
      .toArray();

    const hasMore = leads.length > limit;
    const rawResults = hasMore ? leads.slice(0, limit) : leads;

    // Normalize results
    const results = rawResults.map((lead: any) => ({
      ...lead,
      _id: lead._id.toString(),
      id: lead._id.toString(),
      converted_deal_id: lead.converted_deal_id?.toString(),
    }));

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      const lastLead = rawResults[rawResults.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastLead && {
          nextCursor: encodeCursor({
            _id: lastLead._id.toString(),
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more leads, say "show next page" or "get more leads". You can also filter by status, source, or minimum score.`,
        }),
      };
    }

    return createSuccessResponse(results, metadata);
  }) as Promise<MCPToolResponse<any[]>>;
}

// =============================================================================
// TOOL: get_lead
// =============================================================================

const GetLeadInputSchema = z.object({
  leadId: z.string(),
});

async function getLead(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('get_lead', async () => {
    const { leadId } = GetLeadInputSchema.parse(input);

    const collection = await getCollection('leads');
    const roleFilter = buildRoleFilter(userContext);

    const lead = await collection.findOne({ ...roleFilter, _id: new ObjectId(leadId) });

    if (!lead) {
      return createErrorResponse(
        'LEAD_NOT_FOUND',
        `Lead with ID ${leadId} not found.`,
        'Use list_leads tool to find valid lead IDs, or verify the ID format is correct (ObjectId expected).'
      );
    }

    const leadData = {
      ...lead,
      _id: lead._id.toString(),
      id: lead._id.toString(),
      converted_deal_id: lead.converted_deal_id?.toString(),
    };

    return createSuccessResponse(leadData);
  }) as Promise<MCPToolResponse<any>>;
}

// =============================================================================
// TOOL: convert_lead (v1.5 with confirmation)
// =============================================================================

const ConvertLeadInputSchema = z.object({
  leadId: z.string(),
  opportunity: z.object({
    title: z.string(),
    value: z.number(),
    stage: z.string().default('QUALIFICATION'),
    expectedCloseDate: z.string(),
    probability: z.number().min(0).max(100).default(50),
  }),
  customer: z.object({
    action: z.enum(['create', 'link']),
    companyName: z.string().optional(),
    industry: z.string().optional(),
    customerId: z.string().optional(),
  }),
});

function hasWritePermission(roles: string[]): boolean {
  return roles.includes('sales-write') || roles.includes('executive');
}

async function convertLead(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('convert_lead', async () => {
    if (!hasWritePermission(userContext.roles)) {
      return handleInsufficientPermissions('sales-write or executive', userContext.roles);
    }

    const { leadId, opportunity, customer } = ConvertLeadInputSchema.parse(input);

    const collection = await getCollection('leads');
    const roleFilter = buildRoleFilter(userContext);

    const lead = await collection.findOne({ ...roleFilter, _id: new ObjectId(leadId) });

    if (!lead) {
      return createErrorResponse(
        'LEAD_NOT_FOUND',
        `Lead with ID ${leadId} not found.`,
        'Use list_leads tool to find valid lead IDs.'
      );
    }

    if (lead.status !== 'QUALIFIED') {
      return createErrorResponse(
        'INVALID_LEAD_STATUS',
        `Lead status is "${lead.status}" but must be "QUALIFIED" to convert.`,
        'Only leads with status QUALIFIED can be converted. Use list_leads with status=QUALIFIED to find convertible leads.'
      );
    }

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'convert_lead',
      mcpServer: 'sales',
      userId: userContext.userId,
      timestamp: Date.now(),
      leadId,
      leadCompany: lead.company,
      leadContact: lead.contact?.name,
      opportunity,
      customer,
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Convert lead "${lead.company}" to opportunity?

Lead: ${lead.company} (${lead.contact?.name || 'Unknown contact'})
Score: ${lead.score?.total || 'N/A'}

New Opportunity: ${opportunity.title}
Value: $${opportunity.value.toLocaleString()}
Stage: ${opportunity.stage}

Customer: ${customer.action === 'create' ? `Create new (${customer.companyName || lead.company})` : `Link to existing (${customer.customerId})`}

This will update the lead status to CONVERTED and create the associated records.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  }) as Promise<MCPToolResponse<any>>;
}

async function executeConvertLead(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_convert_lead', async () => {
    const leadId = confirmationData.leadId as string;
    const opportunityInput = confirmationData.opportunity as any;
    const customerInput = confirmationData.customer as any;

    const leadsCollection = await getCollection('leads');
    const dealsCollection = await getCollection('deals');
    const customersCollection = await getCollection('customers');
    const roleFilter = buildRoleFilter(userContext);

    // Verify lead still exists and is QUALIFIED
    const lead = await leadsCollection.findOne({ ...roleFilter, _id: new ObjectId(leadId) });
    if (!lead || lead.status !== 'QUALIFIED') {
      return createErrorResponse(
        'LEAD_NOT_FOUND',
        'Lead no longer available or status changed.',
        'The lead may have been modified since confirmation was requested.'
      );
    }

    // Handle customer (create or link)
    let customerId: ObjectId;
    if (customerInput.action === 'create') {
      const newCustomer = {
        company_name: customerInput.companyName || lead.company,
        industry: customerInput.industry || lead.industry || 'Unknown',
        status: 'ACTIVE',
        contacts: lead.contact ? [{
          _id: new ObjectId(),
          name: lead.contact.name,
          email: lead.contact.email,
          phone: lead.contact.phone,
          title: lead.contact.title,
        }] : [],
        created_at: new Date(),
        updated_at: new Date(),
      };
      const insertResult = await customersCollection.insertOne(newCustomer);
      customerId = insertResult.insertedId;
    } else {
      customerId = new ObjectId(customerInput.customerId);
    }

    // Create opportunity
    const newDeal = {
      deal_name: opportunityInput.title,
      customer_id: customerId,
      stage: opportunityInput.stage,
      value: opportunityInput.value,
      currency: 'USD',
      probability: opportunityInput.probability,
      expected_close_date: new Date(opportunityInput.expectedCloseDate),
      deal_type: 'new_business',
      owner: userContext.username,
      created_at: new Date(),
      updated_at: new Date(),
      source_lead_id: new ObjectId(leadId),
    };
    const dealResult = await dealsCollection.insertOne(newDeal);

    // Update lead status to CONVERTED
    await leadsCollection.updateOne(
      { _id: new ObjectId(leadId) },
      {
        $set: {
          status: 'CONVERTED',
          converted_deal_id: dealResult.insertedId,
          converted_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    return createSuccessResponse({
      success: true,
      message: 'Lead converted successfully',
      leadId,
      opportunityId: dealResult.insertedId.toString(),
      customerId: customerId.toString(),
    });
  }) as Promise<MCPToolResponse<any>>;
}

// =============================================================================
// TOOL: get_forecast (sales forecasting by period)
// =============================================================================

const GetForecastInputSchema = z.object({
  period: z.string().optional(), // e.g., "Q1 2026" or "2026-Q1"
  owner: z.string().optional(), // Filter by sales rep
});

interface ForecastSummary {
  period: string;
  team_quota: number;
  team_commit: number;
  team_best_case: number;
  team_pipeline: number;
  team_closed: number;
  attainment_percent: number;
  reps: Array<{
    owner_id: string;
    name: string;
    quota: number;
    commit: number;
    best_case: number;
    pipeline: number;
    closed: number;
    attainment_percent: number;
  }>;
}

async function getForecast(input: any, userContext: UserContext): Promise<MCPToolResponse<ForecastSummary>> {
  return withErrorHandling('get_forecast', async () => {
    const { period, owner } = GetForecastInputSchema.parse(input);

    // Default to current quarter if no period specified
    const now = new Date();
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
    const currentYear = now.getFullYear();
    const defaultPeriod = `${currentYear}-${currentQuarter}`;

    const targetPeriod = period || defaultPeriod;

    // Normalize period format (accept "Q1 2026" or "2026-Q1")
    let periodId: string;
    if (targetPeriod.includes(' ')) {
      const parts = targetPeriod.split(' ');
      periodId = `${parts[1]}-${parts[0]}`;
    } else {
      periodId = targetPeriod;
    }

    // Get quota data
    const quotaCollection = await getCollection('forecast_quotas');
    const quotaDoc = await quotaCollection.findOne({ _id: periodId } as any);

    if (!quotaDoc) {
      return createErrorResponse(
        'FORECAST_NOT_FOUND',
        `No forecast quota found for period ${targetPeriod}`,
        `Available periods can be found in the forecast_quotas collection. Try "Q1 2026" or "2025-Q4".`
      );
    }

    // Get deals for the period
    const dealsCollection = await getCollection('deals');
    const roleFilter = buildRoleFilter(userContext);

    // Determine date range for the quarter
    const [year, quarter] = periodId.split('-');
    const quarterNum = parseInt(quarter.replace('Q', ''));
    const startMonth = (quarterNum - 1) * 3;
    const startDate = new Date(parseInt(year), startMonth, 1);
    const endDate = new Date(parseInt(year), startMonth + 3, 0, 23, 59, 59);

    const dealFilter: any = {
      ...roleFilter,
      expected_close_date: { $gte: startDate, $lte: endDate },
    };

    if (owner) {
      dealFilter.owner = owner;
    }

    const deals = await dealsCollection.find(dealFilter).toArray();

    // Aggregate deals by owner and forecast_category
    const repMetrics: Map<string, any> = new Map();

    // Initialize from quota data
    for (const rep of quotaDoc.reps) {
      if (owner && rep.owner_id !== owner) continue;

      repMetrics.set(rep.owner_id, {
        owner_id: rep.owner_id,
        name: rep.name,
        quota: rep.quota,
        commit: 0,
        best_case: 0,
        pipeline: 0,
        closed: 0,
      });
    }

    // Aggregate deal values
    for (const deal of deals) {
      const ownerMetrics = repMetrics.get(deal.owner);
      if (!ownerMetrics) {
        // Rep not in quota, create entry
        repMetrics.set(deal.owner, {
          owner_id: deal.owner,
          name: deal.owner,
          quota: 0,
          commit: 0,
          best_case: 0,
          pipeline: 0,
          closed: 0,
        });
      }

      const metrics = repMetrics.get(deal.owner)!;
      const value = deal.value || 0;
      const category = deal.forecast_category || 'PIPELINE';

      switch (category) {
        case 'CLOSED':
          metrics.closed += value;
          break;
        case 'COMMIT':
          metrics.commit += value;
          break;
        case 'BEST_CASE':
          metrics.best_case += value;
          break;
        case 'PIPELINE':
          metrics.pipeline += value;
          break;
        // OMITTED deals are not counted
      }
    }

    // Calculate attainment and build rep array
    const reps = Array.from(repMetrics.values()).map(rep => ({
      ...rep,
      attainment_percent: rep.quota > 0
        ? Math.round((rep.closed / rep.quota) * 100)
        : 0,
    }));

    // Calculate team totals
    const teamQuota = quotaDoc.team_quota;
    const teamCommit = reps.reduce((sum, r) => sum + r.commit, 0);
    const teamBestCase = reps.reduce((sum, r) => sum + r.best_case, 0);
    const teamPipeline = reps.reduce((sum, r) => sum + r.pipeline, 0);
    const teamClosed = reps.reduce((sum, r) => sum + r.closed, 0);

    const result: ForecastSummary = {
      period: quotaDoc.period,
      team_quota: teamQuota,
      team_commit: teamCommit,
      team_best_case: teamBestCase,
      team_pipeline: teamPipeline,
      team_closed: teamClosed,
      attainment_percent: teamQuota > 0 ? Math.round((teamClosed / teamQuota) * 100) : 0,
      reps,
    };

    return createSuccessResponse(result);
  }) as Promise<MCPToolResponse<ForecastSummary>>;
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

  res.json({ status: 'success', message: 'MCP Sales Server ready', availableTools: ['list_opportunities', 'list_customers', 'get_customer', 'delete_opportunity', 'list_leads', 'get_lead', 'convert_lead', 'get_forecast'], userRoles: userContext.roles });
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

app.post('/tools/list_customers', async (req: Request, res: Response) => {
  const { userContext, industry, status, minRevenue, maxRevenue, limit, cursor } = req.body;
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

  const result = await listCustomers({ industry, status, minRevenue, maxRevenue, limit, cursor }, userContext);
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

app.post('/tools/list_leads', async (req: Request, res: Response) => {
  const { userContext, status, source, minScore, owner, limit, cursor } = req.body;
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

  const result = await listLeads({ status, source, minScore, owner, limit, cursor }, userContext);
  res.json(result);
});

app.post('/tools/get_lead', async (req: Request, res: Response) => {
  const { userContext, leadId } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
    return;
  }

  const result = await getLead({ leadId }, userContext);
  res.json(result);
});

app.post('/tools/convert_lead', async (req: Request, res: Response) => {
  const { userContext, leadId, opportunity, customer } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  if (!hasSalesAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Sales access (sales-read, sales-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Sales access permissions.',
    });
    return;
  }

  const result = await convertLead({ leadId, opportunity, customer }, userContext);
  res.json(result);
});

app.post('/tools/get_forecast', async (req: Request, res: Response) => {
  const { userContext, period, owner } = req.body;
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

  const result = await getForecast({ period, owner }, userContext);
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
    case 'convert_lead':
      result = await executeConvertLead(data, userContext);
      break;
    default:
      result = createErrorResponse('UNKNOWN_ACTION', `Unknown action: ${action}`, 'Check the action name and try again');
  }
  res.json(result);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

// Only start server when run directly, not when imported for testing
if (require.main === module) {
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
}

export default app;
