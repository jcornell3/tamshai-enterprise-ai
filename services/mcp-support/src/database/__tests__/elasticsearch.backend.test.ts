/**
 * Tests for Elasticsearch Backend
 *
 * Tests Elasticsearch backend implementation including search, retrieval, and updates
 */

import { ElasticsearchBackend } from '../elasticsearch.backend';
import { UserContext } from '../types';
import { Client } from '@elastic/elasticsearch';

// Mock Elasticsearch client
jest.mock('@elastic/elasticsearch');

describe('ElasticsearchBackend', () => {
  let backend: ElasticsearchBackend;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    // Create mock Elasticsearch client
    mockClient = {
      ping: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      close: jest.fn(),
    } as any;

    // Mock Client constructor to return our mock
    (Client as jest.MockedClass<typeof Client>).mockImplementation(() => mockClient);

    backend = new ElasticsearchBackend('http://localhost:9201');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create Elasticsearch client with provided URL', () => {
      const backend = new ElasticsearchBackend('http://custom-es:9200');

      expect(Client).toHaveBeenCalledWith({ node: 'http://custom-es:9200' });
    });
  });

  describe('checkConnection', () => {
    it('should return true when Elasticsearch ping succeeds', async () => {
      mockClient.ping.mockResolvedValue({} as any);

      const result = await backend.checkConnection();

      expect(result).toBe(true);
      expect(mockClient.ping).toHaveBeenCalled();
    });

    it('should return false when Elasticsearch ping fails', async () => {
      mockClient.ping.mockRejectedValue(new Error('Connection failed'));

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
      const mockResponse = {
        hits: {
          hits: [
            { _id: 'doc1', _source: { ticket_id: 'SUPP-001', title: 'Test ticket' }, sort: [1234567890] },
            { _id: 'doc2', _source: { ticket_id: 'SUPP-002', title: 'Another ticket' }, sort: [1234567880] },
          ],
        },
      };

      mockClient.search.mockResolvedValue(mockResponse as any);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.data[0].id).toBe('doc1');
      expect(mockClient.search).toHaveBeenCalledWith({
        index: 'support_tickets',
        body: expect.objectContaining({
          query: expect.any(Object),
          size: 51, // LIMIT+1
          sort: [{ created_at: 'desc' }],
        }),
      });
    });

    it('should build multi_match query when query text provided', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test query',
        limit: 50,
        userContext,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const mustClause = searchCall.body.query.bool.must;

      expect(mustClause).toContainEqual({
        multi_match: {
          query: 'test query',
          fields: ['title', 'description', 'tags'],
        },
      });
    });

    it('should add status filter when provided', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        status: 'closed',
        limit: 50,
        userContext,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const mustClause = searchCall.body.query.bool.must;

      expect(mustClause).toContainEqual({ term: { status: 'closed' } });
    });

    it('should add priority filter when provided', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        priority: 'high',
        limit: 50,
        userContext,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const mustClause = searchCall.body.query.bool.must;

      expect(mustClause).toContainEqual({ term: { priority: 'high' } });
    });

    it('should apply role filter for non-privileged users', async () => {
      const regularUser: UserContext = {
        userId: 'user-456',
        username: 'regular.user',
        roles: ['user'],
      };

      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext: regularUser,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const filterClause = searchCall.body.query.bool.filter;

      expect(filterClause).toContainEqual({ term: { created_by: 'user-456' } });
    });

    it('should not apply role filter for executive users', async () => {
      const executive: UserContext = {
        userId: 'user-789',
        username: 'eve.thompson',
        roles: ['executive'],
      };

      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext: executive,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const filterClause = searchCall.body.query.bool.filter;

      expect(filterClause).toEqual([]);
    });

    it('should not apply role filter for support-read users', async () => {
      const supportUser: UserContext = {
        userId: 'user-101',
        username: 'support.agent',
        roles: ['support-read'],
      };

      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext: supportUser,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const filterClause = searchCall.body.query.bool.filter;

      expect(filterClause).toEqual([]);
    });

    it('should detect truncation using LIMIT+1 pattern', async () => {
      const hits = Array.from({ length: 51 }, (_, i) => ({
        _id: `doc${i}`,
        _source: { ticket_id: `SUPP-${i.toString().padStart(3, '0')}` },
        sort: [1234567890 - i],
      }));

      mockClient.search.mockResolvedValue({ hits: { hits } } as any);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 50,
        userContext,
      });

      expect(result.data).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.totalCount).toBe('50+');
    });

    it('should return exact count when not truncated', async () => {
      const hits = Array.from({ length: 30 }, (_, i) => ({
        _id: `doc${i}`,
        _source: { ticket_id: `SUPP-${i.toString().padStart(3, '0')}` },
        sort: [1234567890 - i],
      }));

      mockClient.search.mockResolvedValue({ hits: { hits } } as any);

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

    it('should apply search_after cursor for pagination', async () => {
      const cursorData = { sort: [1234567890] };
      const encodedCursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');

      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        query: 'test',
        limit: 50,
        cursor: encodedCursor,
        userContext,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      expect(searchCall.body.search_after).toEqual([1234567890]);
    });

    it('should generate nextCursor from last result sort values', async () => {
      const hits = [
        { _id: 'doc1', _source: { ticket_id: 'SUPP-001' }, sort: [1234567890] },
        { _id: 'doc2', _source: { ticket_id: 'SUPP-002' }, sort: [1234567880] },
      ];

      // Return 3 hits to trigger hasMore (limit=2 in request)
      mockClient.search.mockResolvedValue({ hits: { hits: [...hits, hits[1]] } } as any);

      const result = await backend.searchTickets({
        query: 'test',
        limit: 2,
        userContext,
      });

      expect(result.nextCursor).toBeDefined();
      const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64').toString('utf-8'));
      expect(decoded.sort).toEqual([1234567880]); // Last result's sort value
    });

    it('should use match_all query when no query text provided', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchTickets({
        limit: 50,
        userContext,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const mustClause = searchCall.body.query.bool.must;

      expect(mustClause).toEqual([{ match_all: {} }]);
    });
  });

  describe('getTicketById', () => {
    it('should retrieve ticket by ticket_id using keyword field', async () => {
      const mockResponse = {
        hits: {
          hits: [
            {
              _id: 'doc1',
              _source: { ticket_id: 'SUPP-001', title: 'Test ticket', status: 'open' },
            },
          ],
        },
      };

      mockClient.search.mockResolvedValue(mockResponse as any);

      const result = await backend.getTicketById('SUPP-001');

      expect(result).toBeDefined();
      expect(result!.ticket_id).toBe('SUPP-001');
      expect(mockClient.search).toHaveBeenCalledWith({
        index: 'support_tickets',
        body: {
          query: {
            term: { 'ticket_id.keyword': 'SUPP-001' },
          },
        },
      });
    });

    it('should return null when ticket not found', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      const result = await backend.getTicketById('SUPP-999');

      expect(result).toBeNull();
    });

    it('should include Elasticsearch document ID in result', async () => {
      const mockResponse = {
        hits: {
          hits: [{ _id: 'es-doc-123', _source: { ticket_id: 'SUPP-001', title: 'Test' } }],
        },
      };

      mockClient.search.mockResolvedValue(mockResponse as any);

      const result = await backend.getTicketById('SUPP-001');

      expect(result!._esDocId).toBe('es-doc-123');
    });
  });

  describe('updateTicket', () => {
    it('should update ticket by first finding ES document ID', async () => {
      mockClient.search.mockResolvedValue({
        hits: { hits: [{ _id: 'es-doc-123', _source: { ticket_id: 'SUPP-001' } }] },
      } as any);

      mockClient.update.mockResolvedValue({} as any);

      const result = await backend.updateTicket('SUPP-001', {
        status: 'closed',
        resolution: 'Fixed',
      });

      expect(result).toBe(true);
      expect(mockClient.search).toHaveBeenCalledWith({
        index: 'support_tickets',
        body: {
          query: {
            term: { 'ticket_id.keyword': 'SUPP-001' },
          },
        },
      });
      expect(mockClient.update).toHaveBeenCalledWith({
        index: 'support_tickets',
        id: 'es-doc-123',
        body: {
          doc: {
            status: 'closed',
            resolution: 'Fixed',
          },
        },
      });
    });

    it('should return false when ticket not found', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      const result = await backend.updateTicket('SUPP-999', { status: 'closed' });

      expect(result).toBe(false);
      expect(mockClient.update).not.toHaveBeenCalled();
    });
  });

  describe('searchKnowledgeBase', () => {
    it('should search knowledge base with query', async () => {
      const mockResponse = {
        hits: {
          hits: [
            {
              _id: 'kb1',
              _score: 5.2,
              _source: { kb_id: 'KB-001', title: 'How to reset password', category: 'Account' },
              sort: [5.2, 'kb1'],
            },
          ],
        },
      };

      mockClient.search.mockResolvedValue(mockResponse as any);

      const result = await backend.searchKnowledgeBase({
        query: 'password reset',
        limit: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].score).toBe(5.2);
      expect(mockClient.search).toHaveBeenCalledWith({
        index: 'knowledge_base',
        body: expect.objectContaining({
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: 'password reset',
                    fields: ['title^2', 'content', 'tags'],
                  },
                },
              ],
            },
          },
          size: 51,
          sort: [{ _score: 'desc' }, { _id: 'desc' }],
        }),
      });
    });

    it('should add category filter when provided', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchKnowledgeBase({
        query: 'test',
        category: 'Billing',
        limit: 50,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      const mustClause = searchCall.body.query.bool.must;

      expect(mustClause).toContainEqual({ term: { category: 'Billing' } });
    });

    it('should sort by relevance (_score) then _id', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await backend.searchKnowledgeBase({
        query: 'test',
        limit: 50,
      });

      const searchCall = mockClient.search.mock.calls[0][0] as any;
      expect(searchCall.body.sort).toEqual([{ _score: 'desc' }, { _id: 'desc' }]);
    });

    it('should detect truncation using LIMIT+1 pattern', async () => {
      const hits = Array.from({ length: 51 }, (_, i) => ({
        _id: `kb${i}`,
        _score: 5.0 - i * 0.1,
        _source: { kb_id: `KB-${i.toString().padStart(3, '0')}` },
        sort: [5.0 - i * 0.1, `kb${i}`],
      }));

      mockClient.search.mockResolvedValue({ hits: { hits } } as any);

      const result = await backend.searchKnowledgeBase({
        query: 'test',
        limit: 50,
      });

      expect(result.data).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe('50+');
    });
  });

  describe('getArticleById', () => {
    it('should retrieve article by kb_id using keyword field', async () => {
      const mockResponse = {
        hits: {
          hits: [
            {
              _id: 'kb-doc-1',
              _source: { kb_id: 'KB-001', title: 'Password Reset Guide', content: '...' },
            },
          ],
        },
      };

      mockClient.search.mockResolvedValue(mockResponse as any);

      const result = await backend.getArticleById('KB-001');

      expect(result).toBeDefined();
      expect(result!.id).toBe('kb-doc-1');
      expect(result!.kb_id).toBe('KB-001');
      expect(mockClient.search).toHaveBeenCalledWith({
        index: 'knowledge_base',
        body: {
          query: {
            term: { 'kb_id.keyword': 'KB-001' },
          },
        },
      });
    });

    it('should return null when article not found', async () => {
      mockClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      const result = await backend.getArticleById('KB-999');

      expect(result).toBeNull();
    });
  });

  describe('close', () => {
    it('should close Elasticsearch client', async () => {
      mockClient.close.mockResolvedValue({} as any);

      await backend.close();

      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
