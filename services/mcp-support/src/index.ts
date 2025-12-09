/**
 * MCP Support Server (Architecture v1.4)
 *
 * Provides support ticket and knowledge base access with:
 * - Elasticsearch-based search
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3104
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Client } from '@elastic/elasticsearch';
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, TruncationMetadata } from './types/response';
import { storePendingConfirmation } from './utils/redis';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9201',
});

interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}

const app = express();
const PORT = parseInt(process.env.PORT || '3104');

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', { method: req.method, path: req.path, userId: req.headers['x-user-id'] });
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req: Request, res: Response) => {
  try {
    await esClient.ping();
    res.json({ status: 'healthy', service: 'mcp-support', version: '1.4.0', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// =============================================================================
// TOOL: search_tickets (v1.4 with truncation)
// =============================================================================

const SearchTicketsInputSchema = z.object({
  query: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

async function searchTickets(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, status, priority, limit } = SearchTicketsInputSchema.parse(input);

    const must: any[] = [];
    if (query) {
      must.push({ multi_match: { query, fields: ['title', 'description', 'tags'] } });
    }
    if (status) {
      must.push({ term: { status } });
    }
    if (priority) {
      must.push({ term: { priority } });
    }

    // Role-based filtering
    const roleFilter: any[] = [];
    if (!userContext.roles.includes('executive') && !userContext.roles.includes('support-read') && !userContext.roles.includes('support-write')) {
      roleFilter.push({ term: { created_by: userContext.userId } });
    }

    // v1.4: LIMIT+1 pattern
    const queryLimit = limit + 1;

    const result = await esClient.search({
      index: 'support_tickets',
      body: {
        query: {
          bool: {
            must: must.length > 0 ? must : { match_all: {} },
            filter: roleFilter,
          },
        },
        size: queryLimit,
        sort: [{ created_at: 'desc' }],
      },
    });

    const hits = result.hits.hits;
    const isTruncated = hits.length > limit;
    const results = isTruncated ? hits.slice(0, limit) : hits;

    let metadata: TruncationMetadata | undefined;
    if (isTruncated) {
      const filters: string[] = [];
      if (query) filters.push(`query="${query}"`);
      if (status) filters.push(`status="${status}"`);
      if (priority) filters.push(`priority="${priority}"`);
      const filterDesc = filters.length > 0 ? ` with filters: ${filters.join(', ')}` : '';
      metadata = {
        truncated: true,
        returnedCount: results.length,
        warning: `⚠️ Showing ${results.length} of 50+ tickets${filterDesc}. Results are incomplete. Please refine your search query.`,
      };
    }

    const tickets = results.map((hit: any) => ({ id: hit._id, ...hit._source }));
    return createSuccessResponse(tickets, metadata);
  } catch (error: any) {
    logger.error('search_tickets error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to search tickets', 'Please try again or contact support', { errorMessage: error.message });
  }
}

// =============================================================================
// TOOL: search_knowledge_base (v1.4 with truncation)
// =============================================================================

const SearchKnowledgeBaseInputSchema = z.object({
  query: z.string(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});

async function searchKnowledgeBase(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, category, limit } = SearchKnowledgeBaseInputSchema.parse(input);

    const must: any[] = [
      { multi_match: { query, fields: ['title^2', 'content', 'tags'] } },
    ];

    if (category) {
      must.push({ term: { category } });
    }

    // v1.4: LIMIT+1 pattern
    const queryLimit = limit + 1;

    const result = await esClient.search({
      index: 'knowledge_base',
      body: {
        query: {
          bool: {
            must,
          },
        },
        size: queryLimit,
      },
    });

    const hits = result.hits.hits;
    const isTruncated = hits.length > limit;
    const results = isTruncated ? hits.slice(0, limit) : hits;

    let metadata: TruncationMetadata | undefined;
    if (isTruncated) {
      metadata = {
        truncated: true,
        returnedCount: results.length,
        warning: `⚠️ Showing ${results.length} of 50+ knowledge base articles. Results are incomplete. Please refine your search query.`,
      };
    }

    const articles = results.map((hit: any) => ({ id: hit._id, score: hit._score, ...hit._source }));
    return createSuccessResponse(articles, metadata);
  } catch (error: any) {
    logger.error('search_knowledge_base error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to search knowledge base', 'Please try again or contact support', { errorMessage: error.message });
  }
}

// =============================================================================
// TOOL: close_ticket (v1.4 with confirmation)
// =============================================================================

const CloseTicketInputSchema = z.object({
  ticketId: z.string(),
  resolution: z.string(),
});

function hasClosePermission(roles: string[]): boolean {
  return roles.includes('support-write') || roles.includes('executive');
}

async function closeTicket(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    if (!hasClosePermission(userContext.roles)) {
      return createErrorResponse('INSUFFICIENT_PERMISSIONS', `This operation requires "support-write or executive" role. You have: ${userContext.roles.join(', ')}`, 'Please contact your administrator if you need additional permissions.', { requiredRole: 'support-write or executive', userRoles: userContext.roles });
    }

    const { ticketId, resolution } = CloseTicketInputSchema.parse(input);

    // Fetch ticket
    const ticket = await esClient.get({ index: 'support_tickets', id: ticketId });

    if (!ticket.found) {
      return createErrorResponse('TICKET_NOT_FOUND', `Ticket with ID "${ticketId}" was not found`, 'Please verify the ticket ID.', { ticketId });
    }

    const ticketData: any = ticket._source;

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'close_ticket',
      mcpServer: 'support',
      userId: userContext.userId,
      timestamp: Date.now(),
      ticketId,
      ticketTitle: ticketData.title,
      currentStatus: ticketData.status,
      resolution,
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Close support ticket "${ticketData.title}"?

Current Status: ${ticketData.status}
Resolution: ${resolution}

This action will close the ticket and mark it as resolved.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  } catch (error: any) {
    logger.error('close_ticket error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to close ticket', 'Please try again or contact support', { errorMessage: error.message });
  }
}

async function executeCloseTicket(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    const ticketId = confirmationData.ticketId as string;
    const resolution = confirmationData.resolution as string;

    await esClient.update({
      index: 'support_tickets',
      id: ticketId,
      body: {
        doc: {
          status: 'closed',
          resolution,
          closed_at: new Date().toISOString(),
          closed_by: userContext.userId,
        },
      },
    });

    return createSuccessResponse({
      success: true,
      message: `Ticket has been successfully closed`,
      ticketId,
    });
  } catch (error: any) {
    logger.error('execute_close_ticket error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to execute close ticket', 'Please try again or contact support', { errorMessage: error.message });
  }
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

  res.json({ status: 'success', message: 'MCP Support Server ready', availableTools: ['search_tickets', 'search_knowledge_base', 'close_ticket'], userRoles: userContext.roles });
});

app.post('/tools/search_tickets', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await searchTickets(input || {}, userContext);
  res.json(result);
});

app.post('/tools/search_knowledge_base', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await searchKnowledgeBase(input, userContext);
  res.json(result);
});

app.post('/tools/close_ticket', async (req: Request, res: Response) => {
  const { input, userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await closeTicket(input, userContext);
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
    case 'close_ticket':
      result = await executeCloseTicket(data, userContext);
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
  logger.info(`MCP Support Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4');
  try {
    await esClient.ping();
    logger.info('Elasticsearch connection: OK');
  } catch (error) {
    logger.error('Elasticsearch connection: FAILED');
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await esClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await esClient.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
