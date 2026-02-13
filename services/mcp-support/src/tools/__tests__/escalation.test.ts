/**
 * Escalation Tools Tests
 *
 * Tests for get_escalation_targets and escalate_ticket endpoints.
 */
import request from 'supertest';

// Mock gateway auth middleware to pass through in tests
jest.mock('@tamshai/shared', () => ({
  requireGatewayAuth: () => (req: any, res: any, next: any) => next(),
}));

// Mock dependencies before importing app
jest.mock('../../database/connection', () => ({
  getCollection: jest.fn(),
  buildRoleFilter: jest.fn().mockReturnValue({}),
}));

jest.mock('../../database/backend.factory', () => ({
  createSupportBackend: jest.fn().mockReturnValue({
    checkConnection: jest.fn().mockResolvedValue(true),
    close: jest.fn(),
    searchTickets: jest.fn(),
    searchKnowledgeBase: jest.fn(),
    getArticleById: jest.fn(),
    getTicketById: jest.fn(),
    updateTicket: jest.fn(),
  }),
}));

jest.mock('../../utils/redis', () => ({
  storePendingConfirmation: jest.fn(),
}));

jest.mock('../../auth/dual-realm-validator', () => ({
  isCustomerRealm: jest.fn().mockReturnValue(false),
}));

jest.mock('../../auth/customer-helpers', () => ({
  isCustomerUser: jest.fn().mockReturnValue(false),
  toCustomerContext: jest.fn().mockReturnValue(null),
}));

jest.mock('../../tools/customer-tools', () => ({
  customerListTickets: jest.fn(),
  customerGetTicket: jest.fn(),
  customerSubmitTicket: jest.fn(),
  customerAddComment: jest.fn(),
  customerSearchKB: jest.fn(),
  customerListContacts: jest.fn(),
  customerInviteContact: jest.fn(),
  customerTransferLead: jest.fn(),
  executeInviteContact: jest.fn(),
  executeTransferLead: jest.fn(),
}));

import app from '../../index';
import { getCollection } from '../../database/connection';
import { createSupportBackend } from '../../database/backend.factory';
import { storePendingConfirmation } from '../../utils/redis';

const mockGetCollection = getCollection as jest.MockedFunction<typeof getCollection>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<typeof storePendingConfirmation>;
const mockBackend = (createSupportBackend as jest.Mock)();

describe('get_escalation_targets', () => {
  const validUserContext = {
    userId: 'user-123',
    username: 'dan.williams',
    email: 'dan@tamshai.local',
    roles: ['support-read', 'support-write'],
  };

  const noAccessUserContext = {
    userId: 'user-456',
    username: 'frank.davis',
    email: 'frank@tamshai.local',
    roles: ['employee'],
  };

  const mockTargets = [
    { _id: '1', agent_id: 'agent-001', name: 'Sarah Mitchell', role: 'Senior Support Engineer', current_workload: 4, availability: 'available' },
    { _id: '2', agent_id: 'agent-002', name: 'James Rodriguez', role: 'Support Team Lead', current_workload: 6, availability: 'available' },
    { _id: '3', agent_id: 'agent-003', name: 'Emily Watson', role: 'Technical Specialist', current_workload: 8, availability: 'busy' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return list of escalation targets', async () => {
    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockTargets),
      }),
    });
    mockGetCollection.mockResolvedValue({ find: mockFind } as any);

    const response = await request(app)
      .post('/tools/get_escalation_targets')
      .send({ userContext: validUserContext });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0].name).toBe('Sarah Mitchell');
    expect(response.body.data[0].availability).toBe('available');
  });

  it('should reject users without support access', async () => {
    const response = await request(app)
      .post('/tools/get_escalation_targets')
      .send({ userContext: noAccessUserContext });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

describe('escalate_ticket', () => {
  const writeUserContext = {
    userId: 'user-123',
    username: 'dan.williams',
    email: 'dan@tamshai.local',
    roles: ['support-read', 'support-write'],
  };

  const readOnlyUserContext = {
    userId: 'user-789',
    username: 'marcus.johnson',
    email: 'marcus@tamshai.local',
    roles: ['support-read'],
  };

  const mockTicket = {
    ticket_id: 'TICK-001',
    title: 'Cannot login to TamshaiAI app',
    status: 'open',
    priority: 'high',
    assigned_to: 'dan.williams',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorePendingConfirmation.mockResolvedValue(undefined);
  });

  it('should return pending_confirmation for tier2 escalation', async () => {
    mockBackend.getTicketById.mockResolvedValue(mockTicket);

    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    });
    const mockFindOne = jest.fn().mockResolvedValue({
      agent_id: 'agent-001',
      name: 'Sarah Mitchell',
    });
    mockGetCollection.mockResolvedValue({ find: mockFind, findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/escalate_ticket')
      .send({
        userContext: writeUserContext,
        ticketId: 'TICK-001',
        escalation_level: 'tier2',
        target_id: 'agent-001',
        reason: 'Requires specialized expertise',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending_confirmation');
    expect(response.body.message).toContain('Cannot login to TamshaiAI app');
    expect(mockStorePendingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('should require target_id for tier2 escalation', async () => {
    mockBackend.getTicketById.mockResolvedValue(mockTicket);

    const response = await request(app)
      .post('/tools/escalate_ticket')
      .send({
        userContext: writeUserContext,
        ticketId: 'TICK-001',
        escalation_level: 'tier2',
        reason: 'Requires specialized expertise',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('MISSING_TARGET');
  });

  it('should allow management escalation without target_id', async () => {
    mockBackend.getTicketById.mockResolvedValue(mockTicket);

    const response = await request(app)
      .post('/tools/escalate_ticket')
      .send({
        userContext: writeUserContext,
        ticketId: 'TICK-001',
        escalation_level: 'management',
        reason: 'Customer VIP, needs urgent attention',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending_confirmation');
  });

  it('should reject users without write permission', async () => {
    const response = await request(app)
      .post('/tools/escalate_ticket')
      .send({
        userContext: readOnlyUserContext,
        ticketId: 'TICK-001',
        escalation_level: 'tier2',
        target_id: 'agent-001',
        reason: 'Test reason',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should return error for non-existent ticket', async () => {
    mockBackend.getTicketById.mockResolvedValue(null);

    const response = await request(app)
      .post('/tools/escalate_ticket')
      .send({
        userContext: writeUserContext,
        ticketId: 'TICK-999',
        escalation_level: 'management',
        reason: 'Test reason',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('TICKET_NOT_FOUND');
  });
});

describe('get_sla_tickets', () => {
  const validUserContext = {
    userId: 'user-123',
    username: 'dan.williams',
    email: 'dan@tamshai.local',
    roles: ['support-read', 'support-write'],
  };

  const now = new Date();
  const pastDeadline = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
  const soonDeadline = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

  const mockBreachedTicket = {
    ticket_id: 'TICK-010',
    title: 'Breached SLA ticket',
    priority: 'critical',
    status: 'open',
    customer_tier: 'enterprise',
    assigned_to: 'dan.williams',
    resolution_deadline: pastDeadline,
  };

  const mockAtRiskTicket = {
    ticket_id: 'TICK-011',
    title: 'At risk SLA ticket',
    priority: 'high',
    status: 'in_progress',
    customer_tier: 'professional',
    assigned_to: 'dan.williams',
    resolution_deadline: soonDeadline,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return both at_risk and breached tickets when status is omitted', async () => {
    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockBreachedTicket, mockAtRiskTicket]),
        }),
      }),
    });
    mockGetCollection.mockResolvedValue({ find: mockFind } as any);

    const response = await request(app)
      .post('/tools/get_sla_tickets')
      .send({ userContext: validUserContext });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data).toHaveLength(2);
  });

  it('should return only breached tickets when status is breached', async () => {
    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockBreachedTicket]),
        }),
      }),
    });
    mockGetCollection.mockResolvedValue({ find: mockFind } as any);

    const response = await request(app)
      .post('/tools/get_sla_tickets')
      .send({ userContext: validUserContext, status: 'breached' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data).toHaveLength(1);
  });

  it('should return only at_risk tickets when status is at_risk', async () => {
    const mockFind = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockAtRiskTicket]),
        }),
      }),
    });
    mockGetCollection.mockResolvedValue({ find: mockFind } as any);

    const response = await request(app)
      .post('/tools/get_sla_tickets')
      .send({ userContext: validUserContext, status: 'at_risk' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data).toHaveLength(1);
  });
});
