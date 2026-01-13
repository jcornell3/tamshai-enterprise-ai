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
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, PaginationMetadata } from './types/response';
import { storePendingConfirmation } from './utils/redis';
import { ISupportBackend, UserContext } from './database/types';
import { createSupportBackend } from './database/backend.factory';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Initialize backend based on SUPPORT_DATA_BACKEND environment variable
// - elasticsearch (default): Dev/Stage with Elasticsearch
// - mongodb: GCP Prod Phase 1
const backend: ISupportBackend = createSupportBackend();
const backendType = process.env.SUPPORT_DATA_BACKEND || 'elasticsearch';

logger.info(`MCP Support initialized with backend: ${backendType}`);

const app = express();
const PORT = parseInt(process.env.PORT || '3104');

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', { method: req.method, path: req.path, userId: req.headers['x-user-id'] });
  next();
});

// Authorization helper - checks if user has Support access
function hasSupportAccess(roles: string[]): boolean {
  return roles.some(role =>
    role === 'support-read' ||
    role === 'support-write' ||
    role === 'executive'
  );
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const isHealthy = await backend.checkConnection();
  if (!isHealthy) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'mcp-support',
      version: '1.4.0',
      backend: backendType,
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    status: 'healthy',
    service: 'mcp-support',
    version: '1.4.0',
    backend: backendType,
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// TOOL: search_tickets (v1.4 with cursor-based pagination)
// =============================================================================

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

    // Call backend (Elasticsearch or MongoDB)
    const result = await backend.searchTickets({
      query,
      status,
      priority,
      limit,
      cursor,
      userContext,
    });

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (result.hasMore || cursor) {
      metadata = {
        hasMore: result.hasMore,
        returnedCount: result.data.length,
        ...(result.hasMore &&
          result.nextCursor && {
            nextCursor: result.nextCursor,
            totalEstimate: result.totalCount,
            hint: `To see more tickets, say "show next page" or "get more tickets". You can also refine your search with filters like status or priority.`,
          }),
      };
    }

    return createSuccessResponse(result.data, metadata);
  } catch (error: any) {
    logger.error('search_tickets error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to search tickets',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
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

    // Call backend (Elasticsearch only - MongoDB throws NOT_IMPLEMENTED)
    const result = await backend.searchKnowledgeBase({
      query,
      category,
      limit,
      cursor,
    });

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;

    if (result.hasMore || cursor) {
      metadata = {
        hasMore: result.hasMore,
        returnedCount: result.data.length,
        ...(result.hasMore &&
          result.nextCursor && {
            nextCursor: result.nextCursor,
            totalEstimate: result.totalCount,
            hint: `To see more knowledge base articles, say "show next page" or "get more articles". You can also refine your search query for better results.`,
          }),
      };
    }

    return createSuccessResponse(result.data, metadata);
  } catch (error: any) {
    logger.error('search_knowledge_base error:', error);

    // Special handling for NOT_IMPLEMENTED (MongoDB backend)
    if (error.message && error.message.includes('NOT_IMPLEMENTED')) {
      return createErrorResponse(
        'NOT_IMPLEMENTED',
        'Knowledge Base not available',
        'Knowledge Base requires Elasticsearch which is not deployed in this environment. Only ticket search is available.',
        { backend: backendType }
      );
    }

    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to search knowledge base',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
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

    // Call backend (Elasticsearch only - MongoDB throws NOT_IMPLEMENTED)
    const article = await backend.getArticleById(articleId);

    if (!article) {
      return createErrorResponse(
        'ARTICLE_NOT_FOUND',
        `Knowledge base article with ID ${articleId} not found.`,
        'Use search_knowledge_base tool to find relevant articles, or verify the article ID is correct.'
      );
    }

    return createSuccessResponse(article);
  } catch (error: any) {
    logger.error('get_knowledge_article error:', error);

    // Special handling for NOT_IMPLEMENTED (MongoDB backend)
    if (error.message && error.message.includes('NOT_IMPLEMENTED')) {
      return createErrorResponse(
        'NOT_IMPLEMENTED',
        'Knowledge Base not available',
        'Knowledge Base requires Elasticsearch which is not deployed in this environment. Only ticket operations are available.',
        { backend: backendType }
      );
    }

    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to get knowledge article',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
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
      return createErrorResponse(
        'INSUFFICIENT_PERMISSIONS',
        `This operation requires "support-write or executive" role. You have: ${userContext.roles.join(', ')}`,
        'Please contact your administrator if you need additional permissions.',
        { requiredRole: 'support-write or executive', userRoles: userContext.roles }
      );
    }

    const { ticketId, resolution } = CloseTicketInputSchema.parse(input);

    // Fetch ticket from backend
    const ticket = await backend.getTicketById(ticketId);

    if (!ticket) {
      return createErrorResponse(
        'TICKET_NOT_FOUND',
        `Ticket with ID "${ticketId}" was not found`,
        'Please verify the ticket ID using search_tickets tool to find valid ticket IDs.',
        { ticketId }
      );
    }

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'close_ticket',
      mcpServer: 'support',
      userId: userContext.userId,
      timestamp: Date.now(),
      ticketId,
      ticketTitle: ticket.title,
      currentStatus: ticket.status,
      resolution,
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Close support ticket "${ticket.title}"?

Current Status: ${ticket.status}
Resolution: ${resolution}

This action will close the ticket and mark it as resolved.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  } catch (error: any) {
    logger.error('close_ticket error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to close ticket',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

async function executeCloseTicket(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  try {
    const ticketId = confirmationData.ticketId as string;
    const resolution = confirmationData.resolution as string;

    // Update ticket via backend
    const updated = await backend.updateTicket(ticketId, {
      status: 'closed',
      resolution,
      closed_at: new Date().toISOString(),
      closed_by: userContext.userId,
    });

    if (!updated) {
      return createErrorResponse(
        'TICKET_NOT_FOUND',
        `Ticket with ID "${ticketId}" was not found`,
        'The ticket may have been deleted.',
        { ticketId }
      );
    }

    return createSuccessResponse({
      success: true,
      message: `Ticket has been successfully closed`,
      ticketId,
    });
  } catch (error: any) {
    logger.error('execute_close_ticket error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to execute close ticket',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
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

  // Authorization check - must have Support access
  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
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

  // Authorization check - must have Support access
  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
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

  // Authorization check - must have Support access
  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
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

  // Authorization check - must have Support access
  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
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
  logger.info(`Backend: ${backendType}`);

  // Check backend connection
  const isHealthy = await backend.checkConnection();
  if (isHealthy) {
    logger.info(`${backendType} connection: OK`);
  } else {
    logger.error(`${backendType} connection: FAILED`);
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await backend.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await backend.close();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
