/**
 * Centralized Error Handler (Architecture v1.4) - Sales Server
 *
 * Implements Section 7.4: LLM-Friendly Error Schemas
 * Fulfills Article II.3: No raw exceptions to AI
 */

import winston from 'winston';
import { MCPErrorResponse, MCPToolResponse, createErrorResponse } from '../types/response';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  OPPORTUNITY_NOT_FOUND = 'OPPORTUNITY_NOT_FOUND',
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  CANNOT_DELETE_WON_OPPORTUNITY = 'CANNOT_DELETE_WON_OPPORTUNITY',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export function handleValidationError(error: any): MCPErrorResponse {
  logger.warn('Input validation failed', { error: error.errors });
  const fieldErrors = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ');
  return createErrorResponse(
    ErrorCode.INVALID_INPUT,
    `Input validation failed: ${fieldErrors}`,
    'Please check your input parameters and ensure they match the expected format.',
    { validationErrors: error.errors }
  );
}

export function handleOpportunityNotFound(opportunityId: string): MCPErrorResponse {
  logger.warn('Opportunity not found', { opportunityId });
  return createErrorResponse(
    ErrorCode.OPPORTUNITY_NOT_FOUND,
    `Opportunity with ID "${opportunityId}" was not found`,
    'Please verify the opportunity ID. You can search for opportunities using the list_opportunities tool.',
    { opportunityId }
  );
}

export function handleCustomerNotFound(customerId: string): MCPErrorResponse {
  logger.warn('Customer not found', { customerId });
  return createErrorResponse(
    ErrorCode.CUSTOMER_NOT_FOUND,
    `Customer with ID "${customerId}" was not found`,
    'Please verify the customer ID. You can search for customers using the list_customers tool.',
    { customerId }
  );
}

export function handleInsufficientPermissions(requiredRole: string, userRoles: string[]): MCPErrorResponse {
  logger.warn('Insufficient permissions', { requiredRole, userRoles });
  return createErrorResponse(
    ErrorCode.INSUFFICIENT_PERMISSIONS,
    `This operation requires "${requiredRole}" role. You have: ${userRoles.join(', ')}`,
    'Please contact your administrator if you need additional permissions.',
    { requiredRole, userRoles }
  );
}

export function handleCannotDeleteWonOpportunity(opportunityId: string): MCPErrorResponse {
  logger.warn('Attempted to delete won opportunity', { opportunityId });
  return createErrorResponse(
    ErrorCode.CANNOT_DELETE_WON_OPPORTUNITY,
    `Cannot delete opportunity "${opportunityId}" because it has status "won"`,
    'Only open or lost opportunities can be deleted. Contact your sales administrator for won opportunities.',
    { opportunityId }
  );
}

export function handleDatabaseError(error: Error, operation: string): MCPErrorResponse {
  logger.error('Database error', { error: error.message, stack: error.stack, operation });
  return createErrorResponse(
    ErrorCode.DATABASE_ERROR,
    'A database error occurred while processing your request',
    'Please try again. If the problem persists, contact support.',
    { operation, errorMessage: error.message }
  );
}

export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<MCPToolResponse<T>>
): Promise<MCPToolResponse<T>> {
  try {
    return await fn();
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return handleValidationError(error);
    }
    logger.error('Unexpected error in operation', { operation, error: error.message, stack: error.stack });
    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      'Please try again. If the problem persists, contact support.',
      { operation }
    );
  }
}
