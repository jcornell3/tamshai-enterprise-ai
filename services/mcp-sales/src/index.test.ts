/**
 * MCP Sales Server Unit Tests
 *
 * Tests for cursor pagination, authorization helpers, and HTTP endpoints.
 */

import request from 'supertest';
import { ObjectId } from 'mongodb';

// Mock dependencies before importing app
jest.mock('./database/connection', () => ({
  checkConnection: jest.fn(),
  closeConnection: jest.fn(),
  getCollection: jest.fn(),
  buildRoleFilter: jest.fn(),
}));

jest.mock('./utils/redis', () => ({
  storePendingConfirmation: jest.fn(),
  confirmationExists: jest.fn(),
  closeRedis: jest.fn(),
  default: {
    on: jest.fn(),
  },
}));

import app from './index';
import { checkConnection, getCollection, buildRoleFilter } from './database/connection';
import { storePendingConfirmation } from './utils/redis';

const mockCheckConnection = checkConnection as jest.MockedFunction<typeof checkConnection>;
const mockGetCollection = getCollection as jest.MockedFunction<typeof getCollection>;
const mockBuildRoleFilter = buildRoleFilter as jest.MockedFunction<typeof buildRoleFilter>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<typeof storePendingConfirmation>;

describe('MCP Sales Server', () => {
  const validUserContext = {
    userId: 'user-123',
    username: 'carol.johnson',
    email: 'carol@tamshai.local',
    roles: ['sales-read', 'sales-write'],
  };

  const executiveUserContext = {
    userId: 'exec-123',
    username: 'eve.thompson',
    email: 'eve@tamshai.local',
    roles: ['executive'],
  };

  const noAccessUserContext = {
    userId: 'user-456',
    username: 'frank.davis',
    email: 'frank@tamshai.local',
    roles: ['employee'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildRoleFilter.mockReturnValue({});
  });

  // ===========================================================================
  // Health Check Tests
  // ===========================================================================

  describe('GET /health', () => {
    it('should return healthy status when database is connected', async () => {
      mockCheckConnection.mockResolvedValue(true);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('mcp-sales');
      expect(response.body.database).toBe('connected');
    });

    it('should return unhealthy status when database is disconnected', async () => {
      mockCheckConnection.mockResolvedValue(false);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.database).toBe('disconnected');
    });
  });

  // ===========================================================================
  // Authorization Tests
  // ===========================================================================

  describe('Authorization', () => {
    describe('hasSalesAccess', () => {
      it('should allow access with sales-read role', async () => {
        mockGetCollection.mockResolvedValue({
          aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        } as any);

        const response = await request(app)
          .post('/tools/list_opportunities')
          .send({ userContext: { ...validUserContext, roles: ['sales-read'] } });

        expect(response.status).toBe(200);
      });

      it('should allow access with sales-write role', async () => {
        mockGetCollection.mockResolvedValue({
          aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        } as any);

        const response = await request(app)
          .post('/tools/list_opportunities')
          .send({ userContext: { ...validUserContext, roles: ['sales-write'] } });

        expect(response.status).toBe(200);
      });

      it('should allow access with executive role', async () => {
        mockGetCollection.mockResolvedValue({
          aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        } as any);

        const response = await request(app)
          .post('/tools/list_opportunities')
          .send({ userContext: executiveUserContext });

        expect(response.status).toBe(200);
      });

      it('should deny access without sales roles', async () => {
        const response = await request(app)
          .post('/tools/list_opportunities')
          .send({ userContext: noAccessUserContext });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
      });
    });
  });

  // ===========================================================================
  // list_opportunities Endpoint Tests
  // ===========================================================================

  describe('POST /tools/list_opportunities', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/tools/list_opportunities')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_USER_CONTEXT');
    });

    it('should return opportunities list', async () => {
      const mockOpportunities = [
        {
          _id: new ObjectId(),
          deal_name: 'Enterprise Deal',
          customer_name: 'Acme Corp',
          stage: 'PROPOSAL',
          value: 50000,
        },
      ];

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockOpportunities),
        }),
      } as any);

      const response = await request(app)
        .post('/tools/list_opportunities')
        .send({ userContext: validUserContext });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by stage when provided', async () => {
      const mockAggregate = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      mockGetCollection.mockResolvedValue({
        aggregate: mockAggregate,
      } as any);

      await request(app)
        .post('/tools/list_opportunities')
        .send({ userContext: validUserContext, stage: 'PROPOSAL' });

      expect(mockAggregate).toHaveBeenCalled();
      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match.stage).toBe('PROPOSAL');
    });

    it('should include pagination metadata when hasMore is true', async () => {
      // Return 51 items to trigger hasMore (limit + 1)
      const mockOpportunities = Array.from({ length: 51 }, (_, i) => ({
        _id: new ObjectId(),
        deal_name: `Deal ${i}`,
        stage: 'PROPOSAL',
        value: 10000,
      }));

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockOpportunities),
        }),
      } as any);

      const response = await request(app)
        .post('/tools/list_opportunities')
        .send({ userContext: validUserContext, limit: 50 });

      expect(response.status).toBe(200);
      expect(response.body.metadata.hasMore).toBe(true);
      expect(response.body.metadata.nextCursor).toBeDefined();
      expect(response.body.data.length).toBe(50);
    });

    it('should decode and apply cursor for pagination', async () => {
      const cursorId = new ObjectId().toString();
      const cursor = Buffer.from(JSON.stringify({ _id: cursorId })).toString('base64');

      const mockAggregate = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      mockGetCollection.mockResolvedValue({
        aggregate: mockAggregate,
      } as any);

      await request(app)
        .post('/tools/list_opportunities')
        .send({ userContext: validUserContext, cursor });

      expect(mockAggregate).toHaveBeenCalled();
      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match._id).toBeDefined();
    });
  });

  // ===========================================================================
  // list_customers Endpoint Tests
  // ===========================================================================

  describe('POST /tools/list_customers', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/tools/list_customers')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_USER_CONTEXT');
    });

    it('should return 403 without sales access', async () => {
      const response = await request(app)
        .post('/tools/list_customers')
        .send({ userContext: noAccessUserContext });

      expect(response.status).toBe(403);
    });

    it('should return customers list', async () => {
      const mockCustomers = [
        {
          _id: new ObjectId(),
          company_name: 'Acme Corp',
          industry: 'Technology',
          status: 'ACTIVE',
          contacts: [],
        },
      ];

      mockGetCollection.mockResolvedValue({
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockCustomers),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .post('/tools/list_customers')
        .send({ userContext: validUserContext });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by industry when provided', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      mockGetCollection.mockResolvedValue({
        find: mockFind,
      } as any);

      await request(app)
        .post('/tools/list_customers')
        .send({ userContext: validUserContext, industry: 'Technology' });

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ industry: 'Technology' }));
    });
  });

  // ===========================================================================
  // get_customer Endpoint Tests
  // ===========================================================================

  describe('POST /tools/get_customer', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/tools/get_customer')
        .send({ customerId: new ObjectId().toString() });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('MISSING_USER_CONTEXT');
    });

    it('should return customer details', async () => {
      const customerId = new ObjectId();
      const mockCustomer = {
        _id: customerId,
        company_name: 'Acme Corp',
        industry: 'Technology',
        contacts: [{ _id: new ObjectId(), name: 'John Doe' }],
      };

      mockGetCollection.mockResolvedValue({
        findOne: jest.fn().mockResolvedValue(mockCustomer),
      } as any);

      const response = await request(app)
        .post('/tools/get_customer')
        .send({ userContext: validUserContext, customerId: customerId.toString() });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.company_name).toBe('Acme Corp');
    });

    it('should return error when customer not found', async () => {
      mockGetCollection.mockResolvedValue({
        findOne: jest.fn().mockResolvedValue(null),
      } as any);

      const response = await request(app)
        .post('/tools/get_customer')
        .send({ userContext: validUserContext, customerId: new ObjectId().toString() });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  // ===========================================================================
  // delete_opportunity Endpoint Tests
  // ===========================================================================

  describe('POST /tools/delete_opportunity', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/tools/delete_opportunity')
        .send({ opportunityId: new ObjectId().toString() });

      expect(response.status).toBe(400);
    });

    it('should return 403 without write permission', async () => {
      const response = await request(app)
        .post('/tools/delete_opportunity')
        .send({
          userContext: { ...validUserContext, roles: ['sales-read'] },
          opportunityId: new ObjectId().toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should return pending confirmation for valid delete request', async () => {
      const opportunityId = new ObjectId();
      const mockOpportunity = {
        _id: opportunityId,
        deal_name: 'Test Deal',
        customer_name: 'Acme Corp',
        stage: 'PROPOSAL',
        value: 50000,
      };

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockOpportunity]),
        }),
      } as any);

      mockStorePendingConfirmation.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/tools/delete_opportunity')
        .send({
          userContext: validUserContext,
          opportunityId: opportunityId.toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending_confirmation');
      expect(response.body.confirmationId).toBeDefined();
    });

    it('should not allow deleting CLOSED_WON opportunities', async () => {
      const opportunityId = new ObjectId();
      const mockOpportunity = {
        _id: opportunityId,
        deal_name: 'Won Deal',
        stage: 'CLOSED_WON',
        value: 100000,
      };

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockOpportunity]),
        }),
      } as any);

      const response = await request(app)
        .post('/tools/delete_opportunity')
        .send({
          userContext: validUserContext,
          opportunityId: opportunityId.toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('CANNOT_DELETE_WON_OPPORTUNITY');
    });
  });

  // ===========================================================================
  // close_opportunity Endpoint Tests
  // ===========================================================================

  describe('POST /tools/close_opportunity', () => {
    it('should return pending confirmation for closing opportunity', async () => {
      const opportunityId = new ObjectId();
      const mockOpportunity = {
        _id: opportunityId,
        deal_name: 'Test Deal',
        customer_name: 'Acme Corp',
        stage: 'NEGOTIATION',
        value: 75000,
      };

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([mockOpportunity]),
        }),
      } as any);

      mockStorePendingConfirmation.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/tools/close_opportunity')
        .send({
          userContext: validUserContext,
          opportunityId: opportunityId.toString(),
          outcome: 'won',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending_confirmation');
      expect(response.body.message).toContain('Close opportunity');
    });

    it('should require outcome parameter', async () => {
      const response = await request(app)
        .post('/tools/close_opportunity')
        .send({
          userContext: validUserContext,
          opportunityId: new ObjectId().toString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
    });
  });

  // ===========================================================================
  // list_leads Endpoint Tests
  // ===========================================================================

  describe('POST /tools/list_leads', () => {
    it('should return leads list', async () => {
      const mockLeads = [
        {
          _id: new ObjectId(),
          company_name: 'New Corp',
          status: 'NEW',
          source: 'Website',
        },
      ];

      mockGetCollection.mockResolvedValue({
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockLeads),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .post('/tools/list_leads')
        .send({ userContext: validUserContext });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should filter by status when provided', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      mockGetCollection.mockResolvedValue({
        find: mockFind,
      } as any);

      await request(app)
        .post('/tools/list_leads')
        .send({ userContext: validUserContext, status: 'QUALIFIED' });

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({ status: 'QUALIFIED' }));
    });
  });

  // ===========================================================================
  // get_forecast Endpoint Tests
  // ===========================================================================

  describe('POST /tools/get_forecast', () => {
    it('should return forecast data', async () => {
      const mockQuota = {
        _id: '2026-Q1',
        period: 'Q1 2026',
        team_quota: 1000000,
        reps: [
          { owner_id: 'rep1', name: 'Rep One', quota: 500000 },
          { owner_id: 'rep2', name: 'Rep Two', quota: 500000 },
        ],
      };

      const mockDeals = [
        { owner: 'rep1', value: 100000, forecast_category: 'CLOSED' },
        { owner: 'rep1', value: 200000, forecast_category: 'COMMIT' },
      ];

      mockGetCollection
        .mockResolvedValueOnce({
          findOne: jest.fn().mockResolvedValue(mockQuota),
        } as any)
        .mockResolvedValueOnce({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(mockDeals),
          }),
        } as any);

      const response = await request(app)
        .post('/tools/get_forecast')
        .send({ userContext: validUserContext, period: '2026-Q1' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.period).toBe('Q1 2026');
    });

    it('should return error when forecast period not found', async () => {
      mockGetCollection.mockResolvedValue({
        findOne: jest.fn().mockResolvedValue(null),
      } as any);

      const response = await request(app)
        .post('/tools/get_forecast')
        .send({ userContext: validUserContext, period: '2099-Q1' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('FORECAST_NOT_FOUND');
    });
  });

  // ===========================================================================
  // execute Endpoint Tests
  // ===========================================================================

  describe('POST /execute', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/execute')
        .send({ action: 'delete_opportunity', data: {} });

      expect(response.status).toBe(400);
    });

    it('should return error for unknown action', async () => {
      const response = await request(app)
        .post('/execute')
        .send({
          userContext: validUserContext,
          action: 'unknown_action',
          data: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('UNKNOWN_ACTION');
    });

    it('should execute delete_opportunity action', async () => {
      const opportunityId = new ObjectId().toString();

      mockGetCollection.mockResolvedValue({
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      } as any);

      const response = await request(app)
        .post('/execute')
        .send({
          userContext: validUserContext,
          action: 'delete_opportunity',
          data: { opportunityId },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should execute close_opportunity action', async () => {
      const opportunityId = new ObjectId().toString();

      mockGetCollection.mockResolvedValue({
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      } as any);

      const response = await request(app)
        .post('/execute')
        .send({
          userContext: validUserContext,
          action: 'close_opportunity',
          data: { opportunityId, newStage: 'CLOSED_WON' },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should execute delete_customer action', async () => {
      const customerId = new ObjectId().toString();

      mockGetCollection.mockResolvedValue({
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      } as any);

      const response = await request(app)
        .post('/execute')
        .send({
          userContext: validUserContext,
          action: 'delete_customer',
          data: { customerId },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  // ===========================================================================
  // Query Endpoint Tests
  // ===========================================================================

  describe('POST /query', () => {
    it('should return 400 when userContext is missing', async () => {
      const response = await request(app)
        .post('/query')
        .send({ query: 'list opportunities' });

      expect(response.status).toBe(400);
    });

    it('should route list queries to list_opportunities', async () => {
      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      const response = await request(app)
        .post('/query')
        .send({
          userContext: validUserContext,
          query: 'list all opportunities',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should handle pagination requests', async () => {
      const cursor = Buffer.from(JSON.stringify({ _id: new ObjectId().toString() })).toString('base64');

      mockGetCollection.mockResolvedValue({
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      } as any);

      const response = await request(app)
        .post('/query')
        .send({
          userContext: validUserContext,
          query: 'show next page',
          cursor,
        });

      expect(response.status).toBe(200);
    });

    it('should return available tools for non-list queries', async () => {
      const response = await request(app)
        .post('/query')
        .send({
          userContext: validUserContext,
          query: 'hello',
        });

      expect(response.status).toBe(200);
      expect(response.body.availableTools).toBeDefined();
    });
  });
});
