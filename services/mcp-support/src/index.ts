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
import { requireGatewayAuth } from '@tamshai/shared';
import { MCPToolResponse, createSuccessResponse, createPendingConfirmationResponse, createErrorResponse, PaginationMetadata } from './types/response';
import { storePendingConfirmation } from './utils/redis';
import { ISupportBackend, UserContext } from './database/types';
import { createSupportBackend } from './database/backend.factory';
import { getCollection, buildRoleFilter } from './database/connection';
// Customer support extensions (v1.4)
import {
  DualRealmUserContext,
  isCustomerRealm,
} from './auth/dual-realm-validator';
import {
  isCustomerUser,
  toCustomerContext,
  CustomerContext,
} from './auth/customer-helpers';
import {
  customerListTickets,
  customerGetTicket,
  customerSubmitTicket,
  customerAddComment,
  customerSearchKB,
  customerListContacts,
  customerInviteContact,
  customerTransferLead,
  executeInviteContact,
  executeTransferLead,
} from './tools/customer-tools';
import { listTickets } from './tools/employee-ticket-tools';

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

// Gateway authentication middleware (prevents direct access bypass)
app.use(requireGatewayAuth(process.env.MCP_INTERNAL_SECRET, { logger }));

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
  query: z.string().optional(),
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
// TOOL: get_sla_summary (SLA compliance metrics)
// =============================================================================

interface SLASummary {
  overall_compliance: number;
  tickets_total: number;
  tickets_within_sla: number;
  tickets_breached: number;
  tickets_at_risk: number;
  by_tier: Array<{ tier: string; compliance: number; count: number }>;
  by_priority: Array<{ priority: string; compliance: number; count: number }>;
}

async function getSLASummary(userContext: UserContext): Promise<MCPToolResponse<SLASummary>> {
  try {
    const collection = await getCollection('tickets');
    const roleFilter = buildRoleFilter(userContext);
    const now = new Date();

    // Get all open/in_progress tickets
    const pipeline = [
      { $match: { ...roleFilter, status: { $in: ['open', 'in_progress'] } } },
      {
        $addFields: {
          is_breached: {
            $cond: [
              { $and: [{ $ne: ['$resolution_deadline', null] }, { $lt: ['$resolution_deadline', now] }] },
              true,
              false
            ]
          },
          is_at_risk: {
            $cond: [
              {
                $and: [
                  { $ne: ['$resolution_deadline', null] },
                  { $gt: ['$resolution_deadline', now] },
                  { $lt: ['$resolution_deadline', new Date(now.getTime() + 2 * 60 * 60 * 1000)] } // 2 hours
                ]
              },
              true,
              false
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          breached: { $sum: { $cond: ['$is_breached', 1, 0] } },
          at_risk: { $sum: { $cond: ['$is_at_risk', 1, 0] } }
        }
      }
    ];

    const summary = await collection.aggregate(pipeline).toArray();

    // Get tier breakdown
    const tierPipeline = [
      { $match: { ...roleFilter, status: { $in: ['open', 'in_progress', 'resolved', 'closed'] } } },
      {
        $addFields: {
          sla_met: {
            $cond: [
              {
                $or: [
                  { $eq: ['$resolution_deadline', null] },
                  { $and: [{ $ne: ['$closed_at', null] }, { $lte: ['$closed_at', '$resolution_deadline'] }] },
                  { $and: [{ $eq: ['$closed_at', null] }, { $in: ['$status', ['open', 'in_progress']] }, { $gte: ['$resolution_deadline', now] }] }
                ]
              },
              true,
              false
            ]
          }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$customer_tier', 'unknown'] },
          total: { $sum: 1 },
          met: { $sum: { $cond: ['$sla_met', 1, 0] } }
        }
      }
    ];

    const tierBreakdown = await collection.aggregate(tierPipeline).toArray();

    // Get priority breakdown
    const priorityPipeline = [
      { $match: { ...roleFilter, status: { $in: ['open', 'in_progress', 'resolved', 'closed'] } } },
      {
        $addFields: {
          sla_met: {
            $cond: [
              {
                $or: [
                  { $eq: ['$resolution_deadline', null] },
                  { $and: [{ $ne: ['$closed_at', null] }, { $lte: ['$closed_at', '$resolution_deadline'] }] },
                  { $and: [{ $eq: ['$closed_at', null] }, { $in: ['$status', ['open', 'in_progress']] }, { $gte: ['$resolution_deadline', now] }] }
                ]
              },
              true,
              false
            ]
          }
        }
      },
      {
        $group: {
          _id: '$priority',
          total: { $sum: 1 },
          met: { $sum: { $cond: ['$sla_met', 1, 0] } }
        }
      }
    ];

    const priorityBreakdown = await collection.aggregate(priorityPipeline).toArray();

    const summaryData = summary[0] || { total: 0, breached: 0, at_risk: 0 };
    const ticketsWithinSLA = summaryData.total - summaryData.breached;

    const result: SLASummary = {
      overall_compliance: summaryData.total > 0
        ? Math.round((ticketsWithinSLA / summaryData.total) * 100)
        : 100,
      tickets_total: summaryData.total,
      tickets_within_sla: ticketsWithinSLA,
      tickets_breached: summaryData.breached,
      tickets_at_risk: summaryData.at_risk,
      by_tier: tierBreakdown.map((t: any) => ({
        tier: t._id,
        compliance: t.total > 0 ? Math.round((t.met / t.total) * 100) : 100,
        count: t.total
      })),
      by_priority: priorityBreakdown.map((p: any) => ({
        priority: p._id,
        compliance: p.total > 0 ? Math.round((p.met / p.total) * 100) : 100,
        count: p.total
      }))
    };

    return createSuccessResponse(result);
  } catch (error: any) {
    logger.error('get_sla_summary error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to get SLA summary',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

// =============================================================================
// TOOL: get_sla_tickets (tickets at risk or breached)
// =============================================================================

const GetSLATicketsInputSchema = z.object({
  status: z.enum(['at_risk', 'breached']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

interface SLATicket {
  ticket_id: string;
  title: string;
  priority: string;
  status: string;
  customer_tier: string;
  assigned_to: string | null;
  resolution_deadline: string;
  time_remaining_minutes: number | null;
  sla_status: 'at_risk' | 'breached';
}

async function getSLATickets(input: any, userContext: UserContext): Promise<MCPToolResponse<SLATicket[]>> {
  try {
    const { status, limit } = GetSLATicketsInputSchema.parse(input);

    const collection = await getCollection('tickets');
    const roleFilter = buildRoleFilter(userContext);
    const now = new Date();

    let filter: any = {
      ...roleFilter,
      status: { $in: ['open', 'in_progress'] },
      resolution_deadline: { $ne: null }
    };

    if (status === 'breached') {
      filter.resolution_deadline = { $lt: now };
    } else if (status === 'at_risk') {
      // at_risk: deadline is within next 2 hours but not breached
      filter.resolution_deadline = {
        $gt: now,
        $lt: new Date(now.getTime() + 2 * 60 * 60 * 1000)
      };
    } else {
      // "all" — return both at_risk and breached tickets
      filter.$or = [
        { resolution_deadline: { $ne: null, $lt: now } },
        { resolution_deadline: { $gt: now, $lt: new Date(now.getTime() + 2 * 60 * 60 * 1000) } }
      ];
      delete filter.resolution_deadline;
    }

    const tickets = await collection
      .find(filter)
      .sort({ resolution_deadline: 1 })
      .limit(limit)
      .toArray();

    const results: SLATicket[] = tickets.map((t: any) => {
      const deadline = new Date(t.resolution_deadline);
      const timeRemaining = Math.round((deadline.getTime() - now.getTime()) / 60000);

      return {
        ticket_id: t.ticket_id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        customer_tier: t.customer_tier || 'unknown',
        assigned_to: t.assigned_to,
        resolution_deadline: t.resolution_deadline.toISOString(),
        time_remaining_minutes: timeRemaining,
        sla_status: timeRemaining < 0 ? 'breached' : 'at_risk'
      };
    });

    return createSuccessResponse(results, {
      returnedCount: results.length,
      hasMore: tickets.length >= limit,
      totalEstimate: tickets.length >= limit ? `${limit}+` : results.length.toString()
    });
  } catch (error: any) {
    logger.error('get_sla_tickets error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to get SLA tickets',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

// =============================================================================
// TOOL: get_agent_metrics (agent performance metrics)
// =============================================================================

const GetAgentMetricsInputSchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

interface AgentMetrics {
  agent_id: string;
  tickets_resolved: number;
  avg_resolution_minutes: number;
  sla_compliance_percent: number;
}

interface AgentPerformanceSummary {
  period: string;
  period_start: string;
  period_end: string;
  team_resolved: number;
  team_avg_resolution_minutes: number;
  team_sla_compliance: number;
  agents: AgentMetrics[];
}

async function getAgentMetrics(input: any, userContext: UserContext): Promise<MCPToolResponse<AgentPerformanceSummary>> {
  try {
    const { period } = GetAgentMetricsInputSchema.parse(input);

    const collection = await getCollection('tickets');
    const roleFilter = buildRoleFilter(userContext);
    const now = new Date();

    // Calculate period start date
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          ...roleFilter,
          status: { $in: ['resolved', 'closed'] },
          closed_at: { $gte: periodStart },
          assigned_to: { $ne: null }
        }
      },
      {
        $addFields: {
          resolution_minutes: {
            $divide: [
              { $subtract: ['$closed_at', '$created_at'] },
              60000
            ]
          },
          sla_met: {
            $cond: [
              {
                $or: [
                  { $eq: ['$resolution_deadline', null] },
                  { $lte: ['$closed_at', '$resolution_deadline'] }
                ]
              },
              1,
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: '$assigned_to',
          tickets_resolved: { $sum: 1 },
          total_resolution_minutes: { $sum: '$resolution_minutes' },
          sla_met_count: { $sum: '$sla_met' }
        }
      },
      { $sort: { tickets_resolved: -1 } }
    ];

    const agentData = await collection.aggregate(pipeline).toArray();

    const agents: AgentMetrics[] = agentData.map((a: any) => ({
      agent_id: a._id,
      tickets_resolved: a.tickets_resolved,
      avg_resolution_minutes: Math.round(a.total_resolution_minutes / a.tickets_resolved),
      sla_compliance_percent: Math.round((a.sla_met_count / a.tickets_resolved) * 100)
    }));

    // Calculate team totals
    const teamResolved = agents.reduce((sum, a) => sum + a.tickets_resolved, 0);
    const teamTotalMinutes = agents.reduce((sum, a) => sum + a.avg_resolution_minutes * a.tickets_resolved, 0);
    const teamSlaMet = agents.reduce((sum, a) => sum + Math.round(a.tickets_resolved * a.sla_compliance_percent / 100), 0);

    const result: AgentPerformanceSummary = {
      period,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      team_resolved: teamResolved,
      team_avg_resolution_minutes: teamResolved > 0 ? Math.round(teamTotalMinutes / teamResolved) : 0,
      team_sla_compliance: teamResolved > 0 ? Math.round((teamSlaMet / teamResolved) * 100) : 100,
      agents
    };

    return createSuccessResponse(result);
  } catch (error: any) {
    logger.error('get_agent_metrics error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to get agent metrics',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

// =============================================================================
// TOOL: get_escalation_targets (available agents for ticket escalation)
// =============================================================================

interface EscalationTarget {
  id: string;
  name: string;
  role: string;
  current_workload: number;
  availability: 'available' | 'busy' | 'offline';
}

async function getEscalationTargets(userContext: UserContext): Promise<MCPToolResponse<EscalationTarget[]>> {
  try {
    const collection = await getCollection('escalation_targets');

    const targets = await collection
      .find({})
      .sort({ current_workload: 1 })
      .toArray();

    const results: EscalationTarget[] = targets.map((t: any) => ({
      id: t.agent_id || t._id.toString(),
      name: t.name,
      role: t.role,
      current_workload: t.current_workload,
      availability: t.availability,
    }));

    return createSuccessResponse(results);
  } catch (error: any) {
    logger.error('get_escalation_targets error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to get escalation targets',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

// =============================================================================
// TOOL: escalate_ticket (v1.5 with confirmation)
// =============================================================================

const EscalateTicketInputSchema = z.object({
  ticketId: z.string(),
  escalation_level: z.enum(['tier2', 'management']),
  target_id: z.string().optional(),
  reason: z.string(),
  notes: z.string().optional(),
});

function hasEscalatePermission(roles: string[]): boolean {
  return roles.includes('support-write') || roles.includes('executive');
}

async function escalateTicket(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    if (!hasEscalatePermission(userContext.roles)) {
      return createErrorResponse(
        'INSUFFICIENT_PERMISSIONS',
        `This operation requires "support-write or executive" role. You have: ${userContext.roles.join(', ')}`,
        'Please contact your administrator if you need additional permissions.',
        { requiredRole: 'support-write or executive', userRoles: userContext.roles }
      );
    }

    const { ticketId, escalation_level, target_id, reason, notes } = EscalateTicketInputSchema.parse(input);

    if (escalation_level === 'tier2' && !target_id) {
      return createErrorResponse(
        'MISSING_TARGET',
        'target_id is required for tier2 escalation.',
        'Use get_escalation_targets to find available agents, then provide the target agent ID.'
      );
    }

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

    // Build escalation summary
    let targetName = 'Management Team';
    if (escalation_level === 'tier2' && target_id) {
      const targetsCollection = await getCollection('escalation_targets');
      const target = await targetsCollection.findOne({ agent_id: target_id });
      targetName = target?.name || target_id;
    }

    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'escalate_ticket',
      mcpServer: 'support',
      userId: userContext.userId,
      timestamp: Date.now(),
      ticketId,
      ticketTitle: ticket.title,
      currentPriority: ticket.priority,
      currentAssignee: ticket.assigned_to,
      escalation_level,
      target_id: target_id || null,
      targetName,
      reason,
      notes: notes || null,
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const newPriority = escalation_level === 'management' ? 'critical' : 'high';
    const message = `⚠️ Escalate ticket "${ticket.title}"?

Ticket: ${ticketId}
Current Priority: ${ticket.priority} → ${newPriority}
Current Assignee: ${ticket.assigned_to || 'Unassigned'}
Escalation Level: ${escalation_level}
Reassign To: ${targetName}
Reason: ${reason}
${notes ? `Notes: ${notes}` : ''}

This will update the ticket priority and reassign it to the escalation target.`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  } catch (error: any) {
    logger.error('escalate_ticket error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to escalate ticket',
      'Please try again or contact support',
      { errorMessage: error.message }
    );
  }
}

async function executeEscalateTicket(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  try {
    const ticketId = confirmationData.ticketId as string;
    const escalation_level = confirmationData.escalation_level as string;
    const target_id = confirmationData.target_id as string | null;
    const targetName = confirmationData.targetName as string;
    const reason = confirmationData.reason as string;
    const notes = confirmationData.notes as string | null;

    const newPriority = escalation_level === 'management' ? 'critical' : 'high';

    const updateData: Record<string, any> = {
      priority: newPriority,
      escalated_at: new Date().toISOString(),
      escalated_by: userContext.userId,
      escalation_level,
      escalation_reason: reason,
    };

    if (target_id) {
      updateData.assigned_to = targetName;
    }

    if (notes) {
      updateData.escalation_notes = notes;
    }

    const updated = await backend.updateTicket(ticketId, updateData);

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
      message: `Ticket has been escalated to ${escalation_level}`,
      ticketId,
      escalation_level,
      new_priority: newPriority,
      assigned_to: targetName,
      escalated_at: updateData.escalated_at,
    });
  } catch (error: any) {
    logger.error('execute_escalate_ticket error:', error);
    return createErrorResponse(
      'DATABASE_ERROR',
      'Failed to execute escalate ticket',
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

  res.json({ status: 'success', message: 'MCP Support Server ready', availableTools: ['search_tickets', 'list_tickets', 'search_knowledge_base', 'close_ticket', 'get_escalation_targets', 'escalate_ticket', 'get_sla_summary', 'get_sla_tickets', 'get_agent_metrics'], userRoles: userContext.roles });
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

app.post('/tools/list_tickets', async (req: Request, res: Response) => {
  const { userContext, priority, status, assignedTo, limit, cursor } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  // Note: listTickets handles role-based filtering internally (support, manager, user)
  // No explicit hasSupportAccess check - all authenticated users can list their tickets

  const result = await listTickets({ priority, status, assignedTo, limit, cursor }, userContext);
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

app.post('/tools/get_sla_summary', async (req: Request, res: Response) => {
  const { userContext } = req.body;
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

  const result = await getSLASummary(userContext);
  res.json(result);
});

app.post('/tools/get_sla_tickets', async (req: Request, res: Response) => {
  const { userContext, status, limit } = req.body;
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

  const result = await getSLATickets({ status, limit }, userContext);
  res.json(result);
});

app.post('/tools/get_agent_metrics', async (req: Request, res: Response) => {
  const { userContext, period } = req.body;
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

  const result = await getAgentMetrics({ period }, userContext);
  res.json(result);
});

app.post('/tools/get_escalation_targets', async (req: Request, res: Response) => {
  const { userContext } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
    return;
  }

  const result = await getEscalationTargets(userContext);
  res.json(result);
});

app.post('/tools/escalate_ticket', async (req: Request, res: Response) => {
  const { userContext, ticketId, escalation_level, target_id, reason, notes } = req.body;
  if (!userContext?.userId) {
    res.status(400).json({ status: 'error', code: 'MISSING_USER_CONTEXT', message: 'User context is required' });
    return;
  }

  if (!hasSupportAccess(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `Access denied. This operation requires Support access (support-read, support-write, or executive role). You have: ${userContext.roles.join(', ')}`,
      suggestedAction: 'Contact your administrator to request Support access permissions.',
    });
    return;
  }

  const result = await escalateTicket({ ticketId, escalation_level, target_id, reason, notes }, userContext);
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
    case 'escalate_ticket':
      result = await executeEscalateTicket(data, userContext);
      break;
    // Customer actions (require customer context)
    case 'invite_contact': {
      const customerCtx = toCustomerContext(userContext as DualRealmUserContext);
      if (!customerCtx) {
        result = createErrorResponse('INVALID_CONTEXT', 'Customer context required', 'This action requires a customer account');
        break;
      }
      result = await executeInviteContact(data, customerCtx);
      break;
    }
    case 'transfer_lead': {
      const customerCtx = toCustomerContext(userContext as DualRealmUserContext);
      if (!customerCtx) {
        result = createErrorResponse('INVALID_CONTEXT', 'Customer context required', 'This action requires a customer account');
        break;
      }
      result = await executeTransferLead(data, customerCtx);
      break;
    }
    default:
      result = createErrorResponse('UNKNOWN_ACTION', `Unknown action: ${action}`, 'Check the action name and try again');
  }
  res.json(result);
});

// =============================================================================
// CUSTOMER TOOL ENDPOINTS (v1.4 - Customer Support Extension)
// =============================================================================

// Helper to validate and convert customer context
function getCustomerContextFromRequest(req: Request, res: Response): CustomerContext | null {
  const userContext = req.body.userContext as DualRealmUserContext;

  if (!userContext?.userId) {
    res.status(400).json({
      status: 'error',
      code: 'MISSING_USER_CONTEXT',
      message: 'User context is required',
    });
    return null;
  }

  // Check if this is a customer realm user
  if (!isCustomerRealm(userContext)) {
    res.status(403).json({
      status: 'error',
      code: 'INVALID_REALM',
      message: 'This endpoint is for customer portal users only. Internal users should use the standard support tools.',
      suggestedAction: 'Use search_tickets, close_ticket, etc. for internal support operations.',
    });
    return null;
  }

  // Check if user has customer roles
  if (!isCustomerUser(userContext.roles)) {
    res.status(403).json({
      status: 'error',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'Access denied. This operation requires a customer role (lead-customer or basic-customer).',
      suggestedAction: 'Contact your organization administrator for access.',
    });
    return null;
  }

  // Convert to CustomerContext
  const customerContext = toCustomerContext(userContext);

  if (!customerContext) {
    res.status(400).json({
      status: 'error',
      code: 'MISSING_ORGANIZATION',
      message: 'Customer user is missing organization information in their token.',
      suggestedAction: 'Contact support to verify your organization is properly configured.',
    });
    return null;
  }

  return customerContext;
}

// TOOL: customer_list_tickets
app.post('/tools/customer_list_tickets', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { status, limit, cursor } = req.body;
  const result = await customerListTickets({ status, limit, cursor }, customerContext);
  res.json(result);
});

// TOOL: customer_get_ticket
app.post('/tools/customer_get_ticket', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { ticketId } = req.body;
  const result = await customerGetTicket({ ticketId }, customerContext);
  res.json(result);
});

// TOOL: customer_submit_ticket
app.post('/tools/customer_submit_ticket', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { title, description, category, priority, visibility } = req.body;
  const result = await customerSubmitTicket(
    { title, description, category, priority, visibility },
    customerContext
  );
  res.json(result);
});

// TOOL: customer_add_comment
app.post('/tools/customer_add_comment', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { ticketId, content } = req.body;
  const result = await customerAddComment({ ticketId, content }, customerContext);
  res.json(result);
});

// TOOL: customer_search_kb
app.post('/tools/customer_search_kb', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { query, category, limit } = req.body;
  const result = await customerSearchKB({ query, category, limit }, customerContext);
  res.json(result);
});

// TOOL: customer_list_contacts (Lead only)
app.post('/tools/customer_list_contacts', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const result = await customerListContacts({}, customerContext);
  res.json(result);
});

// TOOL: customer_invite_contact (Lead only, pending confirmation)
app.post('/tools/customer_invite_contact', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { email, firstName, lastName, title, role } = req.body;
  const result = await customerInviteContact(
    { email, firstName, lastName, title, role },
    customerContext
  );
  res.json(result);
});

// TOOL: customer_transfer_lead (Lead only, pending confirmation)
app.post('/tools/customer_transfer_lead', async (req: Request, res: Response) => {
  const customerContext = getCustomerContextFromRequest(req, res);
  if (!customerContext) return;

  const { newLeadUserId } = req.body;
  const result = await customerTransferLead({ newLeadUserId }, customerContext);
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
