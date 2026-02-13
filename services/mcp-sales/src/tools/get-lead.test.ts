/**
 * get_lead and convert_lead Tool Tests
 *
 * Tests for lead retrieval and conversion with confirmation flow.
 */
import request from 'supertest';
import { ObjectId } from 'mongodb';

// Mock dependencies before importing app
jest.mock('../database/connection', () => ({
  checkConnection: jest.fn(),
  closeConnection: jest.fn(),
  getCollection: jest.fn(),
  buildRoleFilter: jest.fn(),
}));

jest.mock('../utils/redis', () => ({
  storePendingConfirmation: jest.fn(),
  confirmationExists: jest.fn(),
  closeRedis: jest.fn(),
  default: {
    on: jest.fn(),
  },
}));

import app from '../index';
import { getCollection, buildRoleFilter } from '../database/connection';
import { storePendingConfirmation } from '../utils/redis';

const mockGetCollection = getCollection as jest.MockedFunction<typeof getCollection>;
const mockBuildRoleFilter = buildRoleFilter as jest.MockedFunction<typeof buildRoleFilter>;
const mockStorePendingConfirmation = storePendingConfirmation as jest.MockedFunction<typeof storePendingConfirmation>;

describe('get_lead tool', () => {
  const validUserContext = {
    userId: 'user-123',
    username: 'carol.johnson',
    email: 'carol@tamshai.local',
    roles: ['sales-read', 'sales-write'],
  };

  const noAccessUserContext = {
    userId: 'user-456',
    username: 'frank.davis',
    email: 'frank@tamshai.local',
    roles: ['employee'],
  };

  const leadId = '690000000000000000000001';

  const mockLead = {
    _id: new ObjectId(leadId),
    company: 'DataSync Technologies',
    contact: { name: 'James Wilson', email: 'jwilson@datasync.example.com' },
    status: 'QUALIFIED',
    score: { total: 85 },
    source: 'Website',
    owner_id: 'carol.johnson',
    created_at: new Date('2026-01-15'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildRoleFilter.mockReturnValue({});
  });

  it('should return lead by valid ID', async () => {
    const mockFindOne = jest.fn().mockResolvedValue(mockLead);
    mockGetCollection.mockResolvedValue({ findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/get_lead')
      .send({ userContext: validUserContext, leadId });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.id).toBe(leadId);
    expect(response.body.data.company).toBe('DataSync Technologies');
  });

  it('should return error for non-existent lead', async () => {
    const mockFindOne = jest.fn().mockResolvedValue(null);
    mockGetCollection.mockResolvedValue({ findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/get_lead')
      .send({ userContext: validUserContext, leadId: '690000000000000000000099' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('LEAD_NOT_FOUND');
  });

  it('should reject users without sales access', async () => {
    const response = await request(app)
      .post('/tools/get_lead')
      .send({ userContext: noAccessUserContext, leadId });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should require user context', async () => {
    const response = await request(app)
      .post('/tools/get_lead')
      .send({ leadId });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('MISSING_USER_CONTEXT');
  });
});

describe('convert_lead tool', () => {
  const writeUserContext = {
    userId: 'user-123',
    username: 'carol.johnson',
    email: 'carol@tamshai.local',
    roles: ['sales-read', 'sales-write'],
  };

  const readOnlyUserContext = {
    userId: 'user-789',
    username: 'bob.martinez',
    email: 'bob@tamshai.local',
    roles: ['sales-read'],
  };

  const leadId = '690000000000000000000001';

  const qualifiedLead = {
    _id: new ObjectId(leadId),
    company: 'DataSync Technologies',
    contact: { name: 'James Wilson', email: 'jwilson@datasync.example.com' },
    status: 'QUALIFIED',
    score: { total: 85 },
    industry: 'Technology',
  };

  const newLead = {
    ...qualifiedLead,
    status: 'NEW',
  };

  const convertInput = {
    leadId,
    opportunity: {
      title: 'DataSync Annual Contract',
      value: 50000,
      stage: 'QUALIFICATION',
      expectedCloseDate: '2026-06-30',
      probability: 60,
    },
    customer: {
      action: 'create' as const,
      companyName: 'DataSync Technologies',
      industry: 'Technology',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildRoleFilter.mockReturnValue({});
    mockStorePendingConfirmation.mockResolvedValue(undefined);
  });

  it('should return pending_confirmation for valid conversion', async () => {
    const mockFindOne = jest.fn().mockResolvedValue(qualifiedLead);
    mockGetCollection.mockResolvedValue({ findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/convert_lead')
      .send({ userContext: writeUserContext, ...convertInput });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending_confirmation');
    expect(response.body.confirmationId).toBeDefined();
    expect(response.body.message).toContain('DataSync Technologies');
    expect(mockStorePendingConfirmation).toHaveBeenCalledTimes(1);
  });

  it('should reject conversion of non-QUALIFIED lead', async () => {
    const mockFindOne = jest.fn().mockResolvedValue(newLead);
    mockGetCollection.mockResolvedValue({ findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/convert_lead')
      .send({ userContext: writeUserContext, ...convertInput });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('INVALID_LEAD_STATUS');
  });

  it('should reject users without write permission', async () => {
    const response = await request(app)
      .post('/tools/convert_lead')
      .send({ userContext: readOnlyUserContext, ...convertInput });

    // Read-only users have sales access (sales-read) but not write permission
    // The route-level auth passes (hasSalesAccess), but the tool-level check fails
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should return error for non-existent lead', async () => {
    const mockFindOne = jest.fn().mockResolvedValue(null);
    mockGetCollection.mockResolvedValue({ findOne: mockFindOne } as any);

    const response = await request(app)
      .post('/tools/convert_lead')
      .send({ userContext: writeUserContext, ...convertInput });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('LEAD_NOT_FOUND');
  });
});
