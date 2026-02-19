/**
 * Employee Ticket Tools for MCP Support
 *
 * Employee-facing tools for listing and managing support tickets.
 * Uses role-based access control for filtering tickets.
 *
 * NOTE: Uses backend factory (Elasticsearch/MongoDB) for data access.
 * Direct MongoDB access (getCollection) is NOT used here - that would
 * bypass the SUPPORT_DATA_BACKEND environment variable setting.
 */

import { z } from 'zod';
import { MCPToolResponse, createSuccessResponse, PaginationMetadata, createLogger } from '@tamshai/shared';
import { UserContext, ISupportBackend } from '../database/types';
import { createSupportBackend } from '../database/backend.factory';

const logger = createLogger('mcp-support');

// Lazy-initialized backend (singleton within this module)
let backend: ISupportBackend | null = null;

function getBackend(): ISupportBackend {
  if (!backend) {
    backend = createSupportBackend();
  }
  return backend;
}

// Employee ticket interface
export interface EmployeeTicket {
  ticket_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  tags: string[];
  resolution?: string;
}

// Input validation schema
const ListTicketsInputSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assignedTo: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListTicketsInput = z.infer<typeof ListTicketsInputSchema>;

/**
 * List support tickets with filtering and pagination
 *
 * Uses the backend factory (Elasticsearch/MongoDB) based on SUPPORT_DATA_BACKEND.
 * Role-based access control is handled by the backend's searchTickets method.
 *
 * @param input - Filter parameters (priority, status, assignedTo, limit, cursor)
 * @param userContext - User authentication context
 * @returns List of tickets matching filters
 */
export async function listTickets(
  input: ListTicketsInput,
  userContext: UserContext
): Promise<MCPToolResponse<EmployeeTicket[]>> {
  try {
    const validatedInput = ListTicketsInputSchema.parse(input);
    const { priority, status, limit, cursor } = validatedInput;

    logger.debug('Listing employee tickets', {
      userId: userContext.userId,
      filters: validatedInput,
    });

    // Use backend factory (Elasticsearch or MongoDB based on SUPPORT_DATA_BACKEND)
    const supportBackend = getBackend();

    // Backend's searchTickets handles role-based filtering via userContext
    const result = await supportBackend.searchTickets({
      status,
      priority,
      limit,
      cursor,
      userContext,
    });

    // Map to EmployeeTicket type
    const resultTickets: EmployeeTicket[] = result.data.map(ticket => ({
      ticket_id: ticket.ticket_id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      created_by: ticket.created_by,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      assigned_to: ticket.assigned_to || null,
      tags: ticket.tags || [],
      resolution: ticket.resolution,
    }));

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;
    if (result.hasMore || cursor) {
      metadata = {
        hasMore: result.hasMore,
        returnedCount: resultTickets.length,
        ...(result.hasMore && result.nextCursor && {
          nextCursor: result.nextCursor,
          hint: 'To see more tickets, provide the nextCursor parameter.',
        }),
      };
    }

    logger.info('list_tickets completed', {
      userId: userContext.userId,
      ticketCount: resultTickets.length,
      hasMore: result.hasMore,
    });

    return createSuccessResponse(resultTickets, metadata);
  } catch (error: any) {
    logger.error('Failed to list tickets', {
      userId: userContext.userId,
      error: error.message,
    });

    return {
      status: 'error',
      code: 'LIST_TICKETS_FAILED',
      message: `Failed to list tickets: ${error.message}`,
      suggestedAction: 'Verify filter parameters and try again. Contact support if the issue persists.',
    };
  }
}
