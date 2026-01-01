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
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, PaginationMetadata } from './types/response';
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
// TOOL: search_tickets (v1.4 with cursor-based pagination)
// =============================================================================

/**
 * Cursor structure for Elasticsearch search_after pagination
 */
interface SearchCursor {
  sort: any[]; // Elasticsearch sort values
}

/**
 * Encode cursor for client transport
 */
function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

/**
 * Decode cursor from client request
 */
function decodeCursor(encoded: string): SearchCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as SearchCursor;
  } catch {
    return null;
  }
}

const SearchTicketsInputSchema = z.object({
  query: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

async function searchTickets(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, status, priority, limit, cursor } = SearchTicketsInputSchema.parse(input);

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

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

    // v1.4: LIMIT+1 pattern to detect if more records exist
    const queryLimit = limit + 1;

    const searchBody: any = {
      query: {
        bool: {
          must: must.length > 0 ? must : { match_all: {} },
          filter: roleFilter,
        },
      },
      size: queryLimit,
      sort: [{ created_at: 'desc' }], // Sort by created_at (date field) - no secondary sort needed to avoid fielddata issues
    };

    // Add search_after if cursor provided
    if (cursorData) {
      searchBody.search_after = cursorData.sort;
    }

    const result = await esClient.search({
      index: 'support_tickets',
      body: searchBody,
    });

    const hits = result.hits.hits;
    const hasMore = hits.length > limit;
    const results = hasMore ? hits.slice(0, limit) : hits;

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      // Get the last record's sort values for next cursor
      const lastHit = results[results.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastHit && lastHit.sort && {
          nextCursor: encodeCursor({
            sort: lastHit.sort as any[],
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more tickets, say "show next page" or "get more tickets". You can also refine your search with filters like status or priority.`,
        }),
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
// TOOL: search_knowledge_base (v1.4 with cursor-based pagination)
// =============================================================================

const SearchKnowledgeBaseInputSchema = z.object({
  query: z.string(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // Base64-encoded pagination cursor
});

async function searchKnowledgeBase(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, category, limit, cursor } = SearchKnowledgeBaseInputSchema.parse(input);

    // Decode cursor if provided
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const must: any[] = [
      { multi_match: { query, fields: ['title^2', 'content', 'tags'] } },
    ];

    if (category) {
      must.push({ term: { category } });
    }

    // v1.4: LIMIT+1 pattern to detect if more records exist
    const queryLimit = limit + 1;

    const searchBody: any = {
      query: {
        bool: {
          must,
        },
      },
      size: queryLimit,
      sort: [{ _score: 'desc' }, { _id: 'desc' }], // Sort by relevance, then _id for stable pagination
    };

    // Add search_after if cursor provided
    if (cursorData) {
      searchBody.search_after = cursorData.sort;
    }

    const result = await esClient.search({
      index: 'knowledge_base',
      body: searchBody,
    });

    const hits = result.hits.hits;
    const hasMore = hits.length > limit;
    const results = hasMore ? hits.slice(0, limit) : hits;

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (hasMore || cursorData) {
      // Get the last record's sort values for next cursor
      const lastHit = results[results.length - 1];

      metadata = {
        hasMore,
        returnedCount: results.length,
        ...(hasMore && lastHit && lastHit.sort && {
          nextCursor: encodeCursor({
            sort: lastHit.sort as any[],
          }),
          totalEstimate: `${limit}+`,
          hint: `To see more knowledge base articles, say "show next page" or "get more articles". You can also refine your search query for better results.`,
        }),
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
// TOOL: get_knowledge_article
// =============================================================================

const GetKnowledgeArticleInputSchema = z.object({
  articleId: z.string(),
});

async function getKnowledgeArticle(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    const { articleId } = GetKnowledgeArticleInputSchema.parse(input);

    const result = await esClient.get({
      index: 'knowledge_base',
      id: articleId,
    });

    if (!result.found) {
      return createErrorResponse(
        'ARTICLE_NOT_FOUND',
        `Knowledge base article with ID ${articleId} not found.`,
        'Use search_knowledge_base tool to find relevant articles, or verify the article ID is correct.'
      );
    }

    const article = { id: result._id, ...result._source };
    return createSuccessResponse(article);
  } catch (error: any) {
    if (error.meta?.body?.found === false) {
      return createErrorResponse(
        'ARTICLE_NOT_FOUND',
        `Knowledge base article with ID ${input.articleId} not found.`,
        'Use search_knowledge_base tool to find relevant articles, or verify the article ID is correct.'
      );
    }
    logger.error('get_knowledge_article error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to get knowledge article', 'Please try again or contact support', { errorMessage: error.message });
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
    queryLower.includes('more tickets') ||
    queryLower.includes('more articles') ||
    queryLower.includes('show more') ||
    queryLower.includes('continue') ||
    !!cursor;

  // Check if this is a search tickets query
  const isSearchTicketsQuery = queryLower.includes('search') ||
    queryLower.includes('find') ||
    queryLower.includes('tickets') ||
    (isPaginationRequest && queryLower.includes('ticket'));

  // Check if this is a knowledge base query
  const isKnowledgeBaseQuery = queryLower.includes('knowledge') ||
    queryLower.includes('article') ||
    queryLower.includes('documentation') ||
    (isPaginationRequest && queryLower.includes('article'));

  if (isSearchTicketsQuery) {
    const input: any = { limit: 50 };
    if (cursor) {
      input.cursor = cursor;
    }

    const result = await searchTickets(input, userContext);
    res.json(result);
    return;
  }

  if (isKnowledgeBaseQuery) {
    // Need a search query for KB
    const input: any = { query: query || 'help', limit: 50 };
    if (cursor) {
      input.cursor = cursor;
    }

    const result = await searchKnowledgeBase(input, userContext);
    res.json(result);
    return;
  }

  res.json({ status: 'success', message: 'MCP Support Server ready', availableTools: ['search_tickets', 'search_knowledge_base', 'close_ticket'], userRoles: userContext.roles });
});

app.post('/tools/search_tickets', async (req: Request, res: Response) => {
  const { userContext, query, status, priority, assignedTo, limit, cursor } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await searchTickets({ query, status, priority, assignedTo, limit, cursor }, userContext);
  res.json(result);
});

app.post('/tools/search_knowledge_base', async (req: Request, res: Response) => {
  const { userContext, query, category, limit, cursor } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await searchKnowledgeBase({ query, category, limit, cursor }, userContext);
  res.json(result);
});

app.post('/tools/get_knowledge_article', async (req: Request, res: Response) => {
  const { userContext, articleId } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await getKnowledgeArticle({ articleId }, userContext);
  res.json(result);
});

app.post('/tools/close_ticket', async (req: Request, res: Response) => {
  const { userContext, ticketId, resolution } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }
  const result = await closeTicket({ ticketId, resolution }, userContext);
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
