/**
 * Unit tests for customer-tools.ts
 * Tests customer-facing MCP tools
 *
 * Coverage targets: 90%+ on all metrics
 */

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
} from '../customer-tools';
import { CustomerContext } from '../../auth/customer-helpers';

// Mock dependencies
jest.mock('../../database/connection', () => ({
  getCollection: jest.fn(),
}));

jest.mock('../../utils/redis', () => ({
  storePendingConfirmation: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { getCollection } from '../../database/connection';
import { storePendingConfirmation } from '../../utils/redis';

const mockGetCollection = getCollection as jest.Mock;
const mockStorePendingConfirmation = storePendingConfirmation as jest.Mock;

describe('customer-tools', () => {
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

  // Mock collection methods
  let mockFind: jest.Mock;
  let mockFindOne: jest.Mock;
  let mockInsertOne: jest.Mock;
  let mockUpdateOne: jest.Mock;
  let mockSort: jest.Mock;
  let mockLimit: jest.Mock;
  let mockProject: jest.Mock;
  let mockToArray: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock chain
    // The chain needs to support multiple patterns:
    // 1. find().sort().limit().toArray() - list tickets
    // 2. find().sort().toArray() - list contacts
    // 3. find().project().sort().limit().toArray() - search KB
    mockToArray = jest.fn();
    mockLimit = jest.fn().mockReturnValue({ toArray: mockToArray });
    mockSort = jest.fn().mockReturnValue({ limit: mockLimit, toArray: mockToArray });
    mockProject = jest.fn().mockReturnValue({ sort: mockSort, limit: mockLimit, toArray: mockToArray });
    mockFind = jest.fn().mockReturnValue({
      sort: mockSort,
      limit: mockLimit,
      project: mockProject,
      toArray: mockToArray,
    });
    mockFindOne = jest.fn();
    mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'mock-id' });
    mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    mockGetCollection.mockResolvedValue({
      find: mockFind,
      findOne: mockFindOne,
      insertOne: mockInsertOne,
      updateOne: mockUpdateOne,
    });
  });

  describe('customerListTickets', () => {
    const sampleTickets = [
      {
        ticket_id: 'TKT-001',
        title: 'Test Ticket 1',
        status: 'open',
        organization_id: 'org-acme',
        contact_id: 'lead-user-123',
        created_at: new Date('2024-01-01'),
      },
      {
        ticket_id: 'TKT-002',
        title: 'Test Ticket 2',
        status: 'closed',
        organization_id: 'org-acme',
        contact_id: 'basic-user-456',
        created_at: new Date('2024-01-02'),
        internal_notes: [{ secret: 'should be removed' }],
      },
    ];

    it('should list tickets for lead customer', async () => {
      mockToArray.mockResolvedValue(sampleTickets);

      const result = await customerListTickets({}, leadCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
        // Verify internal_notes are sanitized
        expect(result.data[1]).not.toHaveProperty('internal_notes');
      }
    });

    it('should apply status filter', async () => {
      mockToArray.mockResolvedValue([sampleTickets[0]]);

      const result = await customerListTickets({ status: 'open' }, leadCustomerContext);

      expect(mockFind).toHaveBeenCalled();
      const findArg = mockFind.mock.calls[0][0];
      expect(findArg.status).toBe('open');
    });

    it('should apply cursor-based pagination', async () => {
      const cursor = Buffer.from(JSON.stringify({ lastCreatedAt: '2024-01-02' })).toString('base64');
      mockToArray.mockResolvedValue([sampleTickets[0]]);

      const result = await customerListTickets({ cursor }, leadCustomerContext);

      expect(result.status).toBe('success');
    });

    it('should return hasMore when more tickets exist', async () => {
      // Return limit + 1 tickets to indicate more exist
      const manyTickets = [...Array(51)].map((_, i) => ({
        ticket_id: `TKT-${i}`,
        title: `Ticket ${i}`,
        status: 'open',
        organization_id: 'org-acme',
        created_at: new Date(),
      }));
      mockToArray.mockResolvedValue(manyTickets);

      const result = await customerListTickets({ limit: 50 }, leadCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(50);
        expect(result.metadata?.hasMore).toBe(true);
        expect(result.metadata?.nextCursor).toBeDefined();
      }
    });

    it('should handle database error with Error object', async () => {
      mockGetCollection.mockRejectedValue(new Error('Database connection failed'));

      const result = await customerListTickets({}, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Database connection failed');
      }
    });

    it('should handle database error with non-Error object', async () => {
      mockGetCollection.mockRejectedValue('String error');

      const result = await customerListTickets({}, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });

    it('should return metadata when cursor is provided but hasMore is false', async () => {
      const cursor = Buffer.from(JSON.stringify({ lastCreatedAt: '2024-01-02' })).toString('base64');
      mockToArray.mockResolvedValue([sampleTickets[0]]);  // Only 1 ticket, no more

      const result = await customerListTickets({ cursor }, leadCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.metadata?.hasMore).toBe(false);
        expect(result.metadata?.nextCursor).toBeUndefined();
      }
    });

    it('should use default values for undefined inputs', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await customerListTickets({}, leadCustomerContext);

      expect(result.status).toBe('success');
    });
  });

  describe('customerGetTicket', () => {
    const sampleTicket = {
      ticket_id: 'TKT-001',
      title: 'Test Ticket',
      description: 'Description',
      status: 'open',
      organization_id: 'org-acme',
      contact_id: 'basic-user-456',
      internal_notes: [{ secret: 'internal' }],
    };

    it('should get ticket for authorized user', async () => {
      mockFindOne.mockResolvedValue(sampleTicket);

      const result = await customerGetTicket({ ticketId: 'TKT-001' }, basicCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.ticket_id).toBe('TKT-001');
        expect(result.data).not.toHaveProperty('internal_notes');
      }
    });

    it('should return error for non-existent ticket', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await customerGetTicket({ ticketId: 'TKT-999' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('TICKET_NOT_FOUND');
      }
    });

    it('should deny access to ticket from different organization', async () => {
      const otherOrgTicket = {
        ...sampleTicket,
        organization_id: 'org-other',
      };
      mockFindOne.mockResolvedValue(otherOrgTicket);

      const result = await customerGetTicket({ ticketId: 'TKT-001' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('ACCESS_DENIED');
      }
    });

    it('should deny basic user access to other users private ticket', async () => {
      const otherUserTicket = {
        ...sampleTicket,
        contact_id: 'other-user',
        visibility: 'private',
      };
      mockFindOne.mockResolvedValue(otherUserTicket);

      const result = await customerGetTicket({ ticketId: 'TKT-001' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('ACCESS_DENIED');
      }
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('Database error'));

      const result = await customerGetTicket({ ticketId: 'TKT-001' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue('Connection refused');

      const result = await customerGetTicket({ ticketId: 'TKT-001' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('customerSubmitTicket', () => {
    it('should create ticket successfully', async () => {
      const input = {
        title: 'New Support Request',
        description: 'I need help with my account. This is a detailed description of the issue.',
        category: 'technical',
        priority: 'high',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.ticketId).toMatch(/^TKT-/);
        expect(result.data.message).toContain('created successfully');
      }

      // Verify ticket insertion
      expect(mockInsertOne).toHaveBeenCalled();
      const insertedTicket = mockInsertOne.mock.calls[0][0];
      expect(insertedTicket.organization_id).toBe('org-acme');
      expect(insertedTicket.contact_id).toBe('basic-user-456');

      // Verify audit log
      expect(mockGetCollection).toHaveBeenCalledWith('audit_log');
    });

    it('should reject ticket with title too short', async () => {
      const input = {
        title: 'Hi', // Too short (< 5 chars)
        description: 'A sufficiently long description for the ticket.',
        category: 'technical',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject ticket with description too short', async () => {
      const input = {
        title: 'Valid Title Here',
        description: 'Too short', // < 20 chars
        category: 'technical',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject invalid category', async () => {
      const input = {
        title: 'Valid Title Here',
        description: 'A sufficiently long description for the ticket.',
        category: 'invalid-category',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle database error on insert', async () => {
      mockInsertOne.mockRejectedValue(new Error('Insert failed'));

      const input = {
        title: 'Valid Title Here',
        description: 'A sufficiently long description for the ticket.',
        category: 'technical',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error on insert', async () => {
      mockInsertOne.mockRejectedValue({ code: 'DUPLICATE_KEY' });

      const input = {
        title: 'Valid Title Here',
        description: 'A sufficiently long description for the ticket.',
        category: 'technical',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });

    it('should use default priority and visibility', async () => {
      const input = {
        title: 'Ticket Without Priority',
        description: 'A sufficiently long description for the ticket.',
        category: 'general',
      };

      const result = await customerSubmitTicket(input, basicCustomerContext);

      expect(result.status).toBe('success');
      const insertedTicket = mockInsertOne.mock.calls[0][0];
      expect(insertedTicket.priority).toBe('medium');
      expect(insertedTicket.visibility).toBe('private');
    });
  });

  describe('customerAddComment', () => {
    const existingTicket = {
      ticket_id: 'TKT-001',
      organization_id: 'org-acme',
      contact_id: 'basic-user-456',
    };

    it('should add comment successfully', async () => {
      mockFindOne.mockResolvedValue(existingTicket);

      const input = { ticketId: 'TKT-001', content: 'This is my comment' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('success');
      expect(mockUpdateOne).toHaveBeenCalled();
    });

    it('should return error for non-existent ticket', async () => {
      mockFindOne.mockResolvedValue(null);

      const input = { ticketId: 'TKT-999', content: 'Comment' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('TICKET_NOT_FOUND');
      }
    });

    it('should deny comment on inaccessible ticket', async () => {
      const otherOrgTicket = {
        ...existingTicket,
        organization_id: 'org-other',
      };
      mockFindOne.mockResolvedValue(otherOrgTicket);

      const input = { ticketId: 'TKT-001', content: 'Comment' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('ACCESS_DENIED');
      }
    });

    it('should reject empty comment', async () => {
      mockFindOne.mockResolvedValue(existingTicket);

      const input = { ticketId: 'TKT-001', content: '' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('error');
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('DB error'));

      const input = { ticketId: 'TKT-001', content: 'Comment' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue(42);

      const input = { ticketId: 'TKT-001', content: 'Comment' };
      const result = await customerAddComment(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('customerSearchKB', () => {
    const kbArticles = [
      { kb_id: 'KB-001', title: 'How to reset password', category: 'account' },
      { kb_id: 'KB-002', title: 'Billing FAQ', category: 'billing' },
    ];

    it('should search knowledge base successfully', async () => {
      mockToArray.mockResolvedValue(kbArticles);

      const result = await customerSearchKB({ query: 'password' }, basicCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should filter by category', async () => {
      mockToArray.mockResolvedValue([kbArticles[1]]);

      const result = await customerSearchKB(
        { query: 'billing', category: 'billing' },
        basicCustomerContext
      );

      expect(mockFind).toHaveBeenCalled();
    });

    it('should return empty array for no matches', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await customerSearchKB({ query: 'nonexistent' }, basicCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(0);
        expect(result.metadata?.hint).toContain('No articles found');
      }
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('DB error'));

      const result = await customerSearchKB({ query: 'test' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should reject query too short', async () => {
      const result = await customerSearchKB({ query: 'a' }, basicCustomerContext);

      expect(result.status).toBe('error');
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue(null);

      const result = await customerSearchKB({ query: 'test' }, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('customerListContacts', () => {
    const contacts = [
      { contact_id: 'c1', email: 'john@acme.com', role: 'lead' },
      { contact_id: 'c2', email: 'jane@acme.com', role: 'basic' },
    ];

    it('should list contacts for lead customer', async () => {
      mockToArray.mockResolvedValue(contacts);

      const result = await customerListContacts({}, leadCustomerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should deny access for basic customer', async () => {
      const result = await customerListContacts({}, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
      }
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('DB error'));

      const result = await customerListContacts({}, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue('Connection timeout');

      const result = await customerListContacts({}, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('customerInviteContact', () => {
    it('should create pending confirmation for lead customer', async () => {
      mockFindOne.mockResolvedValue(null); // No existing contact

      const input = {
        email: 'newuser@acme.com',
        firstName: 'New',
        lastName: 'User',
      };

      const result = await customerInviteContact(input, leadCustomerContext);

      expect(result.status).toBe('pending_confirmation');
      expect(mockStorePendingConfirmation).toHaveBeenCalled();
    });

    it('should deny access for basic customer', async () => {
      const input = {
        email: 'newuser@acme.com',
        firstName: 'New',
        lastName: 'User',
      };

      const result = await customerInviteContact(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
      }
    });

    it('should reject if contact already exists', async () => {
      mockFindOne.mockResolvedValue({ email: 'existing@acme.com' });

      const input = {
        email: 'existing@acme.com',
        firstName: 'Existing',
        lastName: 'User',
      };

      const result = await customerInviteContact(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('CONTACT_EXISTS');
      }
    });

    it('should reject invalid email', async () => {
      const input = {
        email: 'not-an-email',
        firstName: 'Invalid',
        lastName: 'Email',
      };

      const result = await customerInviteContact(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('DB error'));

      const input = {
        email: 'newuser@acme.com',
        firstName: 'New',
        lastName: 'User',
      };

      const result = await customerInviteContact(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue(undefined);

      const input = {
        email: 'newuser@acme.com',
        firstName: 'New',
        lastName: 'User',
      };

      const result = await customerInviteContact(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('customerTransferLead', () => {
    const existingBasicContact = {
      keycloak_user_id: 'target-user-id',
      organization_id: 'org-acme',
      email: 'target@acme.com',
      first_name: 'Target',
      last_name: 'User',
      role: 'basic',
    };

    it('should create pending confirmation for valid transfer', async () => {
      mockFindOne.mockResolvedValue(existingBasicContact);

      const input = { newLeadUserId: 'target-user-id' };
      const result = await customerTransferLead(input, leadCustomerContext);

      expect(result.status).toBe('pending_confirmation');
      expect(mockStorePendingConfirmation).toHaveBeenCalled();
    });

    it('should deny access for basic customer', async () => {
      const input = { newLeadUserId: 'target-user-id' };
      const result = await customerTransferLead(input, basicCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
      }
    });

    it('should reject transfer to non-existent contact', async () => {
      mockFindOne.mockResolvedValue(null);

      const input = { newLeadUserId: 'nonexistent-id' };
      const result = await customerTransferLead(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('CONTACT_NOT_FOUND');
      }
    });

    it('should reject transfer to existing lead', async () => {
      const existingLead = { ...existingBasicContact, role: 'lead' };
      mockFindOne.mockResolvedValue(existingLead);

      const input = { newLeadUserId: 'target-user-id' };
      const result = await customerTransferLead(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('ALREADY_LEAD');
      }
    });

    it('should handle database error', async () => {
      mockGetCollection.mockRejectedValue(new Error('DB error'));

      const input = { newLeadUserId: 'target-user-id' };
      const result = await customerTransferLead(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockGetCollection.mockRejectedValue({ code: 500 });

      const input = { newLeadUserId: 'target-user-id' };
      const result = await customerTransferLead(input, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('executeInviteContact', () => {
    it('should create new contact from confirmation data', async () => {
      const confirmationData = {
        action: 'invite_contact',
        userId: 'lead-user-123',
        organizationId: 'org-acme',
        contactData: {
          email: 'new@acme.com',
          firstName: 'New',
          lastName: 'Contact',
          title: 'Developer',
        },
      };

      const result = await executeInviteContact(confirmationData, leadCustomerContext);

      expect(result.status).toBe('success');
      expect(mockInsertOne).toHaveBeenCalled();

      const insertedContact = mockInsertOne.mock.calls[0][0];
      expect(insertedContact.email).toBe('new@acme.com');
      expect(insertedContact.status).toBe('invited');
    });

    it('should handle database error', async () => {
      mockInsertOne.mockRejectedValue(new Error('Insert failed'));

      const confirmationData = {
        action: 'invite_contact',
        userId: 'lead-user-123',
        organizationId: 'org-acme',
        contactData: { email: 'new@acme.com', firstName: 'New', lastName: 'Contact' },
      };

      const result = await executeInviteContact(confirmationData, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockInsertOne.mockRejectedValue('Connection lost');

      const confirmationData = {
        action: 'invite_contact',
        userId: 'lead-user-123',
        organizationId: 'org-acme',
        contactData: { email: 'new@acme.com', firstName: 'New', lastName: 'Contact' },
      };

      const result = await executeInviteContact(confirmationData, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });

  describe('executeTransferLead', () => {
    it('should transfer lead role successfully', async () => {
      const confirmationData = {
        action: 'transfer_lead',
        currentLeadId: 'lead-user-123',
        newLeadId: 'target-user-id',
        organizationId: 'org-acme',
        newLeadEmail: 'target@acme.com',
        newLeadName: 'Target User',
      };

      const result = await executeTransferLead(confirmationData, leadCustomerContext);

      expect(result.status).toBe('success');
      // Verify both updates were called
      expect(mockUpdateOne).toHaveBeenCalledTimes(2);

      // Verify audit log
      expect(mockGetCollection).toHaveBeenCalledWith('audit_log');
    });

    it('should handle database error', async () => {
      mockUpdateOne.mockRejectedValue(new Error('Update failed'));

      const confirmationData = {
        action: 'transfer_lead',
        currentLeadId: 'lead-user-123',
        newLeadId: 'target-user-id',
        organizationId: 'org-acme',
        newLeadEmail: 'target@acme.com',
        newLeadName: 'Target User',
      };

      const result = await executeTransferLead(confirmationData, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });

    it('should handle non-Error database error', async () => {
      mockUpdateOne.mockRejectedValue(null);

      const confirmationData = {
        action: 'transfer_lead',
        currentLeadId: 'lead-user-123',
        newLeadId: 'target-user-id',
        organizationId: 'org-acme',
        newLeadEmail: 'target@acme.com',
        newLeadName: 'Target User',
      };

      const result = await executeTransferLead(confirmationData, leadCustomerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
        expect(result.details?.errorMessage).toBe('Unknown error');
      }
    });
  });
});
