/**
 * Employee Ticket Tools for MCP Support
 *
 * Employee-facing tools for listing and managing support tickets.
 * Uses role-based access control for filtering tickets.
 */

import { z } from 'zod';
import winston from 'winston';
import { MCPToolResponse, createSuccessResponse, PaginationMetadata } from '../types/response';
import { getCollection } from '../database/connection';
import { UserContext } from '../database/types';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

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
 * Build role-based filter for employee ticket access
 *
 * Access levels:
 * - support-read/support-write/executive: All tickets
 * - manager: Tickets created by or assigned to team members
 * - user: Only tickets they created
 */
function buildEmployeeTicketFilter(
  userContext: UserContext,
  filters: Partial<ListTicketsInput>
): Record<string, any> {
  const { roles, username } = userContext;
  const baseFilter: Record<string, any> = {};

  // Add priority filter
  if (filters.priority) {
    baseFilter.priority = filters.priority;
  }

  // Add status filter
  if (filters.status) {
    baseFilter.status = filters.status;
  }

  // Add assigned_to filter
  if (filters.assignedTo) {
    baseFilter.assigned_to = filters.assignedTo;
  }

  // Role-based access control
  const hasFullAccess = roles.includes('support-read') || roles.includes('support-write') || roles.includes('executive');

  if (hasFullAccess) {
    // Full access to all tickets
    return baseFilter;
  } else if (roles.includes('manager')) {
    // Managers see tickets created by or assigned to them
    // TODO: Enhance to include team members' tickets
    return {
      ...baseFilter,
      $or: [
        { created_by: username },
        { assigned_to: username },
      ],
    };
  } else {
    // Regular users see only their own tickets
    return {
      ...baseFilter,
      created_by: username,
    };
  }
}

/**
 * List support tickets with filtering and pagination
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
    const { limit, cursor } = validatedInput;

    logger.debug('Listing employee tickets', {
      userId: userContext.userId,
      filters: validatedInput,
    });

    const collection = await getCollection('tickets');

    // Build filter with role-based access
    let filter = buildEmployeeTicketFilter(userContext, validatedInput);

    // Handle cursor-based pagination
    if (cursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        filter = {
          ...filter,
          created_at: { $lt: new Date(decodedCursor.lastCreatedAt) },
        };
      } catch (error) {
        logger.warn('Invalid cursor', { cursor, error });
        // Continue without cursor if invalid
      }
    }

    // Query with limit+1 for pagination detection
    const tickets = await collection
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = tickets.length > limit;
    const resultTickets = tickets.slice(0, limit) as unknown as EmployeeTicket[];

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;
    if (hasMore || cursor) {
      const lastTicket = resultTickets[resultTickets.length - 1];
      const nextCursor = hasMore
        ? Buffer.from(JSON.stringify({ lastCreatedAt: lastTicket.created_at })).toString('base64')
        : undefined;

      metadata = {
        hasMore,
        returnedCount: resultTickets.length,
        ...(hasMore && nextCursor && {
          nextCursor,
          hint: 'To see more tickets, provide the nextCursor parameter.',
        }),
      };
    }

    logger.info('list_tickets completed', {
      userId: userContext.userId,
      ticketCount: resultTickets.length,
      hasMore,
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
