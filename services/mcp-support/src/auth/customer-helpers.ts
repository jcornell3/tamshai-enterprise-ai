/**
 * Customer Authorization Helpers for MCP Support
 *
 * Provides authorization functions for customer-facing operations.
 * Implements role-based access control for:
 * - lead-customer: Can view all organization tickets and manage contacts
 * - basic-customer: Can only view/create their own tickets
 *
 * Architecture: v1.4 - Customer Support Extension
 */

import { DualRealmUserContext, isCustomerRealm } from './dual-realm-validator';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

/**
 * Customer-specific user context (extends DualRealmUserContext with org info)
 */
export interface CustomerContext extends DualRealmUserContext {
  organizationId: string;
  organizationName: string;
  isLeadContact: boolean;
}

/**
 * Check if user has any customer role
 */
export function isCustomerUser(roles: string[]): boolean {
  return roles.some(role =>
    role === 'lead-customer' ||
    role === 'basic-customer'
  );
}

/**
 * Check if user is a Lead Customer Contact
 * Lead contacts can:
 * - View all organization tickets
 * - Manage organization contacts
 * - Transfer lead role to another contact
 */
export function isLeadCustomer(roles: string[]): boolean {
  return roles.includes('lead-customer');
}

/**
 * Check if user is a Basic Customer
 * Basic customers can:
 * - View/create only their own tickets
 * - Search public knowledge base
 */
export function isBasicCustomer(roles: string[]): boolean {
  return roles.includes('basic-customer') && !roles.includes('lead-customer');
}

/**
 * Convert DualRealmUserContext to CustomerContext
 * Validates required customer fields are present
 */
export function toCustomerContext(userContext: DualRealmUserContext): CustomerContext | null {
  if (!isCustomerRealm(userContext)) {
    logger.warn('Attempted to convert non-customer user to CustomerContext', {
      userId: userContext.userId,
      realm: userContext.realm,
    });
    return null;
  }

  if (!userContext.organizationId || !userContext.organizationName) {
    logger.warn('Customer user missing organization claims', {
      userId: userContext.userId,
      organizationId: userContext.organizationId,
      organizationName: userContext.organizationName,
    });
    return null;
  }

  return {
    ...userContext,
    organizationId: userContext.organizationId,
    organizationName: userContext.organizationName,
    isLeadContact: isLeadCustomer(userContext.roles),
  };
}

/**
 * Ticket access level for customers
 */
export type TicketAccessLevel =
  | 'none'           // No access
  | 'own'            // Can only access own tickets
  | 'organization'   // Can access all organization tickets
  | 'full';          // Internal users - full access

/**
 * Determine ticket access level for a user
 */
export function getTicketAccessLevel(userContext: DualRealmUserContext): TicketAccessLevel {
  // Internal realm users
  if (userContext.realm === 'internal') {
    // Support and executive roles have full access
    if (userContext.roles.some(r => ['support-read', 'support-write', 'executive'].includes(r))) {
      return 'full';
    }
    // Other internal users have no support ticket access
    return 'none';
  }

  // Customer realm users
  if (!isCustomerUser(userContext.roles)) {
    return 'none';
  }

  if (isLeadCustomer(userContext.roles)) {
    return 'organization';
  }

  return 'own';
}

/**
 * Check if customer can access a specific ticket
 *
 * @param userContext - Customer's user context
 * @param ticket - Ticket document from MongoDB
 * @returns boolean - true if access is allowed
 */
export function canCustomerAccessTicket(
  userContext: CustomerContext,
  ticket: {
    organization_id: string;
    contact_id?: string;
    visibility?: 'organization' | 'private';
  }
): boolean {
  // Must be same organization
  if (ticket.organization_id !== userContext.organizationId) {
    logger.warn('Organization mismatch on ticket access', {
      userId: userContext.userId,
      userOrg: userContext.organizationId,
      ticketOrg: ticket.organization_id,
    });
    return false;
  }

  // Lead customers can see all organization tickets
  if (userContext.isLeadContact) {
    return true;
  }

  // Basic customers can only see their own tickets or organization-visible tickets
  if (ticket.visibility === 'organization') {
    return true;
  }

  // Check if ticket belongs to this contact
  return ticket.contact_id === userContext.userId;
}

/**
 * Check if customer can manage contacts (Lead only)
 */
export function canManageContacts(userContext: CustomerContext): boolean {
  return userContext.isLeadContact;
}

/**
 * Check if customer can initiate lead transfer (Lead only)
 */
export function canTransferLead(userContext: CustomerContext): boolean {
  return userContext.isLeadContact;
}

/**
 * Check if customer can create tickets
 * All customers with valid organization can create tickets
 */
export function canCreateTicket(userContext: CustomerContext): boolean {
  return isCustomerUser(userContext.roles) && !!userContext.organizationId;
}

/**
 * Check if customer can add comment to ticket
 * Must have access to the ticket
 */
export function canAddComment(
  userContext: CustomerContext,
  ticket: {
    organization_id: string;
    contact_id?: string;
    visibility?: 'organization' | 'private';
  }
): boolean {
  return canCustomerAccessTicket(userContext, ticket);
}

/**
 * Build MongoDB filter for customer ticket queries
 *
 * - Lead: All tickets in organization
 * - Basic: Own tickets only
 */
export function buildCustomerTicketFilter(userContext: CustomerContext): Record<string, unknown> {
  const baseFilter = { organization_id: userContext.organizationId };

  if (userContext.isLeadContact) {
    // Lead sees all organization tickets
    return baseFilter;
  }

  // Basic sees only own tickets OR organization-visible tickets
  return {
    ...baseFilter,
    $or: [
      { contact_id: userContext.userId },
      { visibility: 'organization' },
    ],
  };
}

/**
 * Project fields to exclude internal notes from customer view
 * CRITICAL: internal_notes must NEVER be exposed to customers
 */
export function getCustomerTicketProjection(): Record<string, 0 | 1> {
  return {
    // Exclude internal-only fields
    internal_notes: 0,
    // Include all other fields by not specifying them (MongoDB default behavior)
  };
}

/**
 * Sanitize ticket for customer view
 * Removes internal_notes and any other sensitive fields
 */
export function sanitizeTicketForCustomer<T extends Record<string, unknown>>(ticket: T): Omit<T, 'internal_notes'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { internal_notes, ...sanitized } = ticket;
  return sanitized as Omit<T, 'internal_notes'>;
}

export default {
  isCustomerUser,
  isLeadCustomer,
  isBasicCustomer,
  toCustomerContext,
  getTicketAccessLevel,
  canCustomerAccessTicket,
  canManageContacts,
  canTransferLead,
  canCreateTicket,
  canAddComment,
  buildCustomerTicketFilter,
  getCustomerTicketProjection,
  sanitizeTicketForCustomer,
};
