/**
 * Unit tests for customer-helpers.ts
 * Tests authorization functions for customer-facing operations
 *
 * Coverage targets: 90%+ on all metrics
 */

import {
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
  CustomerContext,
} from '../customer-helpers';
import { DualRealmUserContext } from '../dual-realm-validator';

describe('customer-helpers', () => {
  // Test fixtures
  const leadCustomerContext: CustomerContext = {
    userId: 'lead-user-123',
    username: 'john.lead',
    email: 'john@acme.com',
    roles: ['lead-customer'],
    realm: 'customer',
    organizationId: 'org-acme',
    organizationName: 'Acme Corporation',
    isLeadContact: true,
  };

  const basicCustomerContext: CustomerContext = {
    userId: 'basic-user-456',
    username: 'jane.basic',
    email: 'jane@acme.com',
    roles: ['basic-customer'],
    realm: 'customer',
    organizationId: 'org-acme',
    organizationName: 'Acme Corporation',
    isLeadContact: false,
  };

  const internalSupportContext: DualRealmUserContext = {
    userId: 'internal-user-789',
    username: 'support.agent',
    email: 'support@tamshai.com',
    roles: ['support-read', 'support-write'],
    realm: 'internal',
  };

  const internalNonSupportContext: DualRealmUserContext = {
    userId: 'internal-user-999',
    username: 'finance.user',
    email: 'finance@tamshai.com',
    roles: ['finance-read'],
    realm: 'internal',
  };

  describe('isCustomerUser', () => {
    it('should return true for lead-customer role', () => {
      expect(isCustomerUser(['lead-customer'])).toBe(true);
    });

    it('should return true for basic-customer role', () => {
      expect(isCustomerUser(['basic-customer'])).toBe(true);
    });

    it('should return true for user with both roles', () => {
      expect(isCustomerUser(['lead-customer', 'basic-customer'])).toBe(true);
    });

    it('should return false for internal roles', () => {
      expect(isCustomerUser(['support-read', 'support-write'])).toBe(false);
    });

    it('should return false for empty roles', () => {
      expect(isCustomerUser([])).toBe(false);
    });

    it('should return false for unrelated roles', () => {
      expect(isCustomerUser(['viewer', 'editor'])).toBe(false);
    });
  });

  describe('isLeadCustomer', () => {
    it('should return true for lead-customer role', () => {
      expect(isLeadCustomer(['lead-customer'])).toBe(true);
    });

    it('should return false for basic-customer only', () => {
      expect(isLeadCustomer(['basic-customer'])).toBe(false);
    });

    it('should return true when lead-customer is one of many roles', () => {
      expect(isLeadCustomer(['basic-customer', 'lead-customer', 'other'])).toBe(true);
    });

    it('should return false for empty roles', () => {
      expect(isLeadCustomer([])).toBe(false);
    });
  });

  describe('isBasicCustomer', () => {
    it('should return true for basic-customer only', () => {
      expect(isBasicCustomer(['basic-customer'])).toBe(true);
    });

    it('should return false for lead-customer', () => {
      expect(isBasicCustomer(['lead-customer'])).toBe(false);
    });

    it('should return false when user has both lead and basic', () => {
      // Lead takes precedence over basic
      expect(isBasicCustomer(['basic-customer', 'lead-customer'])).toBe(false);
    });

    it('should return false for empty roles', () => {
      expect(isBasicCustomer([])).toBe(false);
    });
  });

  describe('toCustomerContext', () => {
    it('should convert valid customer realm user to CustomerContext', () => {
      const dualRealmContext: DualRealmUserContext = {
        userId: 'user-123',
        username: 'customer.user',
        email: 'customer@acme.com',
        roles: ['lead-customer'],
        realm: 'customer',
        organizationId: 'org-acme',
        organizationName: 'Acme Corp',
      };

      const result = toCustomerContext(dualRealmContext);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-123');
      expect(result!.organizationId).toBe('org-acme');
      expect(result!.isLeadContact).toBe(true);
    });

    it('should return null for internal realm user', () => {
      const result = toCustomerContext(internalSupportContext);
      expect(result).toBeNull();
    });

    it('should return null for customer without organizationId', () => {
      const noOrgContext: DualRealmUserContext = {
        userId: 'user-123',
        username: 'customer.user',
        roles: ['basic-customer'],
        realm: 'customer',
        organizationName: 'Acme Corp',
        // organizationId is missing
      };

      const result = toCustomerContext(noOrgContext);
      expect(result).toBeNull();
    });

    it('should return null for customer without organizationName', () => {
      const noOrgNameContext: DualRealmUserContext = {
        userId: 'user-123',
        username: 'customer.user',
        roles: ['basic-customer'],
        realm: 'customer',
        organizationId: 'org-123',
        // organizationName is missing
      };

      const result = toCustomerContext(noOrgNameContext);
      expect(result).toBeNull();
    });

    it('should set isLeadContact to false for basic customer', () => {
      const basicContext: DualRealmUserContext = {
        userId: 'user-456',
        username: 'basic.user',
        roles: ['basic-customer'],
        realm: 'customer',
        organizationId: 'org-acme',
        organizationName: 'Acme Corp',
      };

      const result = toCustomerContext(basicContext);

      expect(result).not.toBeNull();
      expect(result!.isLeadContact).toBe(false);
    });
  });

  describe('getTicketAccessLevel', () => {
    it('should return "full" for internal support-read user', () => {
      expect(getTicketAccessLevel(internalSupportContext)).toBe('full');
    });

    it('should return "full" for internal support-write user', () => {
      const supportWrite: DualRealmUserContext = {
        ...internalSupportContext,
        roles: ['support-write'],
      };
      expect(getTicketAccessLevel(supportWrite)).toBe('full');
    });

    it('should return "full" for internal executive user', () => {
      const executive: DualRealmUserContext = {
        ...internalSupportContext,
        roles: ['executive'],
      };
      expect(getTicketAccessLevel(executive)).toBe('full');
    });

    it('should return "none" for internal non-support user', () => {
      expect(getTicketAccessLevel(internalNonSupportContext)).toBe('none');
    });

    it('should return "organization" for lead customer', () => {
      expect(getTicketAccessLevel(leadCustomerContext)).toBe('organization');
    });

    it('should return "own" for basic customer', () => {
      expect(getTicketAccessLevel(basicCustomerContext)).toBe('own');
    });

    it('should return "none" for customer realm user without customer role', () => {
      const noCustomerRole: DualRealmUserContext = {
        userId: 'user-no-role',
        username: 'unknown.user',
        roles: [],
        realm: 'customer',
        organizationId: 'org-123',
        organizationName: 'Org',
      };
      expect(getTicketAccessLevel(noCustomerRole)).toBe('none');
    });
  });

  describe('canCustomerAccessTicket', () => {
    const ownTicket = {
      organization_id: 'org-acme',
      contact_id: 'basic-user-456',
      visibility: 'private' as const,
    };

    const orgTicket = {
      organization_id: 'org-acme',
      contact_id: 'other-user',
      visibility: 'organization' as const,
    };

    const otherUserPrivateTicket = {
      organization_id: 'org-acme',
      contact_id: 'other-user',
      visibility: 'private' as const,
    };

    const differentOrgTicket = {
      organization_id: 'org-globex',
      contact_id: 'basic-user-456',
      visibility: 'private' as const,
    };

    it('should allow lead customer to access any org ticket', () => {
      expect(canCustomerAccessTicket(leadCustomerContext, ownTicket)).toBe(true);
      expect(canCustomerAccessTicket(leadCustomerContext, orgTicket)).toBe(true);
      expect(canCustomerAccessTicket(leadCustomerContext, otherUserPrivateTicket)).toBe(true);
    });

    it('should deny lead customer access to different org ticket', () => {
      expect(canCustomerAccessTicket(leadCustomerContext, differentOrgTicket)).toBe(false);
    });

    it('should allow basic customer to access own ticket', () => {
      expect(canCustomerAccessTicket(basicCustomerContext, ownTicket)).toBe(true);
    });

    it('should allow basic customer to access organization-visible ticket', () => {
      expect(canCustomerAccessTicket(basicCustomerContext, orgTicket)).toBe(true);
    });

    it('should deny basic customer access to other user private ticket', () => {
      expect(canCustomerAccessTicket(basicCustomerContext, otherUserPrivateTicket)).toBe(false);
    });

    it('should deny basic customer access to different org ticket', () => {
      expect(canCustomerAccessTicket(basicCustomerContext, differentOrgTicket)).toBe(false);
    });

    it('should handle ticket without visibility field (defaults to private behavior)', () => {
      const ticketNoVisibility = {
        organization_id: 'org-acme',
        contact_id: 'other-user',
      };
      expect(canCustomerAccessTicket(basicCustomerContext, ticketNoVisibility)).toBe(false);
    });

    it('should handle ticket without contact_id', () => {
      const ticketNoContact = {
        organization_id: 'org-acme',
        visibility: 'organization' as const,
      };
      expect(canCustomerAccessTicket(basicCustomerContext, ticketNoContact)).toBe(true);
    });
  });

  describe('canManageContacts', () => {
    it('should return true for lead contact', () => {
      expect(canManageContacts(leadCustomerContext)).toBe(true);
    });

    it('should return false for basic contact', () => {
      expect(canManageContacts(basicCustomerContext)).toBe(false);
    });
  });

  describe('canTransferLead', () => {
    it('should return true for lead contact', () => {
      expect(canTransferLead(leadCustomerContext)).toBe(true);
    });

    it('should return false for basic contact', () => {
      expect(canTransferLead(basicCustomerContext)).toBe(false);
    });
  });

  describe('canCreateTicket', () => {
    it('should return true for lead customer with org', () => {
      expect(canCreateTicket(leadCustomerContext)).toBe(true);
    });

    it('should return true for basic customer with org', () => {
      expect(canCreateTicket(basicCustomerContext)).toBe(true);
    });

    it('should return false for customer without org', () => {
      const noOrgContext: CustomerContext = {
        ...basicCustomerContext,
        organizationId: '',
      };
      expect(canCreateTicket(noOrgContext)).toBe(false);
    });

    it('should return false for non-customer role', () => {
      const nonCustomerContext: CustomerContext = {
        ...basicCustomerContext,
        roles: ['viewer'],
      };
      expect(canCreateTicket(nonCustomerContext)).toBe(false);
    });
  });

  describe('canAddComment', () => {
    const accessibleTicket = {
      organization_id: 'org-acme',
      contact_id: 'basic-user-456',
      visibility: 'private' as const,
    };

    const inaccessibleTicket = {
      organization_id: 'org-acme',
      contact_id: 'other-user',
      visibility: 'private' as const,
    };

    it('should return true for ticket user can access', () => {
      expect(canAddComment(basicCustomerContext, accessibleTicket)).toBe(true);
    });

    it('should return false for ticket user cannot access', () => {
      expect(canAddComment(basicCustomerContext, inaccessibleTicket)).toBe(false);
    });

    it('should return true for lead customer on any org ticket', () => {
      expect(canAddComment(leadCustomerContext, inaccessibleTicket)).toBe(true);
    });
  });

  describe('buildCustomerTicketFilter', () => {
    it('should return org-only filter for lead customer', () => {
      const filter = buildCustomerTicketFilter(leadCustomerContext);

      expect(filter).toEqual({
        organization_id: 'org-acme',
      });
    });

    it('should return combined filter for basic customer', () => {
      const filter = buildCustomerTicketFilter(basicCustomerContext);

      expect(filter).toEqual({
        organization_id: 'org-acme',
        $or: [
          { contact_id: 'basic-user-456' },
          { visibility: 'organization' },
        ],
      });
    });
  });

  describe('getCustomerTicketProjection', () => {
    it('should exclude internal_notes', () => {
      const projection = getCustomerTicketProjection();

      expect(projection).toEqual({
        internal_notes: 0,
      });
    });
  });

  describe('sanitizeTicketForCustomer', () => {
    it('should remove internal_notes from ticket', () => {
      const ticket = {
        ticket_id: 'TKT-001',
        title: 'Test Ticket',
        description: 'Description',
        internal_notes: [
          { id: '1', content: 'Internal note - SHOULD NOT BE VISIBLE' },
        ],
        customer_visible_notes: [
          { id: '2', content: 'Customer visible note' },
        ],
        status: 'open',
      };

      const sanitized = sanitizeTicketForCustomer(ticket);

      expect(sanitized).not.toHaveProperty('internal_notes');
      expect(sanitized).toHaveProperty('customer_visible_notes');
      expect(sanitized.ticket_id).toBe('TKT-001');
      expect(sanitized.title).toBe('Test Ticket');
    });

    it('should handle ticket without internal_notes', () => {
      const ticket = {
        ticket_id: 'TKT-002',
        title: 'Another Ticket',
      };

      const sanitized = sanitizeTicketForCustomer(ticket);

      expect(sanitized).toEqual({
        ticket_id: 'TKT-002',
        title: 'Another Ticket',
      });
    });

    it('should preserve all other fields', () => {
      const ticket = {
        ticket_id: 'TKT-003',
        title: 'Full Ticket',
        description: 'Description',
        status: 'open',
        priority: 'high',
        category: 'technical',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        organization_id: 'org-123',
        contact_id: 'contact-456',
        internal_notes: [{ secret: 'data' }],
        customer_visible_notes: [{ visible: 'note' }],
      };

      const sanitized = sanitizeTicketForCustomer(ticket);

      expect(Object.keys(sanitized).sort()).toEqual([
        'category',
        'contact_id',
        'created_at',
        'customer_visible_notes',
        'description',
        'organization_id',
        'priority',
        'status',
        'ticket_id',
        'title',
        'updated_at',
      ]);
    });
  });
});
