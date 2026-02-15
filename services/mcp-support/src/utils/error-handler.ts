/**
 * Support Error Handler (Architecture v1.4)
 *
 * Domain-specific error handlers for the Support MCP service.
 * Common error handling utilities are imported from @tamshai/shared.
 */

import {
  ErrorCode,
  createErrorResponse,
  MCPErrorResponse,
} from '@tamshai/shared';
import { MCPToolResponse } from '../types/response';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Re-export ErrorCode and types for consumers
export { ErrorCode, MCPErrorResponse };

/**
 * Handle validation errors from Zod
 */
export function handleValidationError(error: { errors: Array<{ path: string[]; message: string }> }): MCPErrorResponse {
  logger.warn('Input validation failed', { error: error.errors });

  const fieldErrors = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');

  return createErrorResponse(
    ErrorCode.INVALID_INPUT,
    `Input validation failed: ${fieldErrors}`,
    'Please check your input parameters and ensure they match the expected format.',
    { validationErrors: error.errors }
  );
}

/**
 * Handle ticket not found error
 */
export function handleTicketNotFound(ticketId: string): MCPErrorResponse {
  logger.warn('Ticket not found', { ticketId });
  return createErrorResponse(
    ErrorCode.TICKET_NOT_FOUND,
    `Ticket with ID "${ticketId}" was not found`,
    'Please verify the ticket ID is correct. You can search for tickets using the search_tickets tool with filters.',
    { ticketId }
  );
}

/**
 * Handle article not found error
 */
export function handleArticleNotFound(articleId: string): MCPErrorResponse {
  logger.warn('Article not found', { articleId });
  return createErrorResponse(
    ErrorCode.ARTICLE_NOT_FOUND,
    `Knowledge base article with ID "${articleId}" was not found`,
    'Please verify the article ID is correct. You can search for articles using the search_knowledge_base tool.',
    { articleId }
  );
}

/**
 * Handle insufficient permissions error
 */
export function handleInsufficientPermissions(requiredRole: string, userRoles: string[]): MCPErrorResponse {
  logger.warn('Insufficient permissions', { requiredRole, userRoles });
  return createErrorResponse(
    ErrorCode.INSUFFICIENT_PERMISSIONS,
    `This operation requires "${requiredRole}" role. You have: ${userRoles.join(', ') || 'none'}`,
    'Please contact your administrator if you need additional permissions.',
    { requiredRole, userRoles }
  );
}

/**
 * Handle cannot close ticket error
 */
export function handleCannotCloseTicket(ticketId: string, reason: string): MCPErrorResponse {
  logger.warn('Cannot close ticket', { ticketId, reason });

  let message: string;
  let suggestedAction: string;

  switch (reason) {
    case 'already_closed':
      message = `Ticket "${ticketId}" is already closed`;
      suggestedAction = 'This ticket has already been closed. No further action is needed.';
      break;
    case 'needs_resolution':
      message = `Ticket "${ticketId}" cannot be closed because it needs a resolution`;
      suggestedAction = 'Please provide a resolution before closing the ticket.';
      break;
    default:
      message = `Cannot close ticket "${ticketId}": ${reason}`;
      suggestedAction = 'Please check the ticket status and try again.';
  }

  return createErrorResponse(
    ErrorCode.CANNOT_CLOSE_TICKET,
    message,
    suggestedAction,
    { ticketId, reason }
  );
}

/**
 * Handle database errors
 */
export function handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Database error', { error: error.message, stack: error.stack, operation });
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'Please try again. If the problem persists, contact support.',
    { operation }
  );
}

/**
 * Handle search errors (Elasticsearch/MongoDB)
 */
export function handleSearchError(error: Error, searchType: string): MCPErrorResponse {
  logger.error('Search error', { error: error.message, stack: error.stack, searchType });
  return createErrorResponse(
    ErrorCode.SEARCH_ERROR,
    `Search operation failed for ${searchType}`,
    'Please try again with different search terms or contact support.',
    { searchType }
  );
}

/**
 * Generic error handler wrapper
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<MCPToolResponse<T>>
): Promise<MCPToolResponse<T>> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'ZodError') {
      return handleValidationError(error as unknown as { errors: Array<{ path: string[]; message: string }> });
    }

    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unexpected error in operation', {
      operation,
      error: err.message,
      stack: err.stack,
    });

    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      'Please try again. If the problem persists, contact support.',
      { operation }
    );
  }
}
