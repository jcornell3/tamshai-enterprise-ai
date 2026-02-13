/**
 * Tests for MongoDB Backend
 *
 * Tests MongoDB backend implementation including search, retrieval, and updates
 */

import { MongoDBBackend } from '../mongodb.backend';
import { UserContext } from '../types';
import { ObjectId } from 'mongodb';

// Mock the connection module
jest.mock('../connection', () => ({
  getCollection: jest.fn(),
  buildRoleFilter: jest.fn(),
  checkConnection: jest.fn(),
}));

import { getCollection, buildRoleFilter, checkConnection } from '../connection';

describe('MongoDBBackend', () => {
  let backend: MongoDBBackend;
  let mockCollection: any;

  beforeEach(() => {
    backend = new MongoDBBackend();

    // Mock collection with standard MongoDB methods
    mockCollection = {
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn(),
    };

    (getCollection as jest.Mock).mockResolvedValue(mockCollection);
    (buildRoleFilter as jest.Mock).mockReturnValue({});
    (checkConnection as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConnection', () => {
    it('should return true when MongoDB connection is healthy', async () => {
      (checkConnection as jest.Mock).mockResolvedValue(true);

      const result = await backend.checkConnection();

      expect(result).toBe(true);
      expect(checkConnection).toHaveBeenCalled();
    });

    it('should return false when MongoDB connection fails', async () => {
      (checkConnection as jest.Mock).mockResolvedValue(false);

      const result = await backend.checkConnection();

      expect(result).toBe(false);
    });
  });

  describe('searchTickets', () => {
    const userContext: UserContext = {
      userId: 'user-123',
      username: 'test.user',
      roles: ['support-read'],
    };

    it('should search tickets with basic query', async () => {
      const tickets = [
        { _id: new ObjectId(), ticket_id: 'SUPP-001', title: 'Test ticket', status: 'open' },
        { _id: new ObjectId(), ticket_id: 'SUPP-002', title: 'Another ticket', status: 'open' },
      ];

      mockCollection.toArray.mockResolvedValue(tickets);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.data[0].ticket_id).toBe('SUPP-001');
      expect(getCollection).toHaveBeenCalledWith('tickets');
    });

    it('should apply status filter when provided', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        status: 'closed',
        limit: 50,
        userContext,
      });

      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall.status).toBe('closed');
    });

    it('should apply priority filter when provided', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        priority: 'high',
        limit: 50,
        userContext,
      });

      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall.priority).toBe('high');
    });

    it('should apply role-based filter', async () => {
      (buildRoleFilter as jest.Mock).mockReturnValue({ created_by: 'test.user' });
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(buildRoleFilter).toHaveBeenCalledWith(userContext);
      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall.created_by).toBe('test.user');
    });

    it('should add text search filter with $or query', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test query',
        limit: 50,
        userContext,
      });

      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall.$or).toBeDefined();
      expect(findCall.$or).toHaveLength(3);
      expect(findCall.$or[0]).toEqual({ title: { $regex: 'test query', $options: 'i' } });
      expect(findCall.$or[1]).toEqual({ description: { $regex: 'test query', $options: 'i' } });
      expect(findCall.$or[2]).toEqual({ tags: { $regex: 'test query', $options: 'i' } });
    });

    it('should detect truncation using LIMIT+1 pattern', async () => {
      const tickets = Array.from({ length: 51 }, (_, i) => ({
        _id: new ObjectId(),
        ticket_id: `SUPP-${i.toString().padStart(3, '0')}`,
        title: `Ticket ${i}`,
      }));

      mockCollection.toArray.mockResolvedValue(tickets);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data).toHaveLength(50); // Truncated to limit
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.totalCount).toBe('50+');
    });

    it('should return exact count when not truncated', async () => {
      const tickets = Array.from({ length: 30 }, (_, i) => ({
        _id: new ObjectId(),
        ticket_id: `SUPP-${i.toString().padStart(3, '0')}`,
        title: `Ticket ${i}`,
      }));

      mockCollection.toArray.mockResolvedValue(tickets);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data).toHaveLength(30);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
      expect(result.totalCount).toBe('30');
    });

    it('should apply cursor pagination with $lt filter', async () => {
      const cursorId = new ObjectId().toString();
      const encodedCursor = Buffer.from(JSON.stringify({ _id: cursorId })).toString('base64');

      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        cursor: encodedCursor,
        userContext,
      });

      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall._id).toBeDefined();
      expect(findCall._id.$lt).toBeDefined();
    });

    it('should sort by _id descending (newest first)', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(mockCollection.sort).toHaveBeenCalledWith({ _id: -1 });
    });

    it('should query LIMIT+1 records to detect truncation', async () => {
      mockCollection.toArray.mockResolvedValue([]);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(mockCollection.limit).toHaveBeenCalledWith(51); // LIMIT+1
    });

    it('should convert MongoDB _id to string in results', async () => {
      const objectId = new ObjectId();
      const tickets = [{ _id: objectId, ticket_id: 'SUPP-001', title: 'Test' }];

      mockCollection.toArray.mockResolvedValue(tickets);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data[0]._id).toBe(objectId.toString());
    });
  });

  describe('getTicketById', () => {
    it('should retrieve ticket by ticket_id', async () => {
      const ticket = {
        _id: new ObjectId(),
        ticket_id: 'SUPP-001',
        title: 'Test ticket',
        status: 'open',
      };

      mockCollection.findOne.mockResolvedValue(ticket);

      const result = await backend.getTicketById('SUPP-001');

      expect(result).toBeDefined();
      expect(result!.ticket_id).toBe('SUPP-001');
      expect(mockCollection.findOne).toHaveBeenCalledWith({ ticket_id: 'SUPP-001' });
    });

    it('should return null when ticket not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await backend.getTicketById('SUPP-999');

      expect(result).toBeNull();
    });

    it('should convert MongoDB _id to string', async () => {
      const objectId = new ObjectId();
      const ticket = { _id: objectId, ticket_id: 'SUPP-001', title: 'Test' };

      mockCollection.findOne.mockResolvedValue(ticket);

      const result = await backend.getTicketById('SUPP-001');

      expect(result!._id).toBe(objectId.toString());
    });
  });

  describe('updateTicket', () => {
    it('should update ticket by ticket_id', async () => {
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await backend.updateTicket('SUPP-001', {
        status: 'closed',
        resolution: 'Fixed the issue',
      });

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { ticket_id: 'SUPP-001' },
        {
          $set: expect.objectContaining({
            status: 'closed',
            resolution: 'Fixed the issue',
          }),
        }
      );
      // Verify updated_at is also set
      const updateCall = mockCollection.updateOne.mock.calls[0][1];
      expect(updateCall.$set.updated_at).toBeDefined();
    });

    it('should return false when ticket not found', async () => {
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      const result = await backend.updateTicket('SUPP-999', { status: 'closed' });

      expect(result).toBe(false);
    });

    it('should remove _id from updates if present', async () => {
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await backend.updateTicket('SUPP-001', {
        _id: 'should-be-removed',
        status: 'closed',
      } as any);

      const updateCall = mockCollection.updateOne.mock.calls[0][1];
      expect(updateCall.$set._id).toBeUndefined();
      expect(updateCall.$set.status).toBe('closed');
    });
  });

  describe('searchKnowledgeBase', () => {
    it('should throw NOT_IMPLEMENTED error', async () => {
      await expect(
        backend.searchKnowledgeBase({
          query: 'test',
          limit: 50,
        })
      ).rejects.toThrow('NOT_IMPLEMENTED');
    });

    it('should include helpful error message about Elasticsearch requirement', async () => {
      await expect(
        backend.searchKnowledgeBase({
          query: 'test',
          limit: 50,
        })
      ).rejects.toThrow('Knowledge Base requires Elasticsearch');
    });
  });

  describe('getArticleById', () => {
    it('should throw NOT_IMPLEMENTED error', async () => {
      await expect(backend.getArticleById('KB-001')).rejects.toThrow('NOT_IMPLEMENTED');
    });

    it('should include helpful error message about Elasticsearch requirement', async () => {
      await expect(backend.getArticleById('KB-001')).rejects.toThrow(
        'Knowledge Base requires Elasticsearch'
      );
    });
  });

  describe('close', () => {
    it('should close without error', async () => {
      await expect(backend.close()).resolves.toBeUndefined();
    });
  });
});
