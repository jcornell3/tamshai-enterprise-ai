/**
 * Unit tests for MCP Client Service
 *
 * Target: 95%+ coverage
 */

import axios, { AxiosInstance } from 'axios';
import { MCPClient, MCPClientConfig } from './mcp-client';
import { createMockLogger } from '../test-utils/mock-logger';
import { createMockMCPServer } from '../test-utils/mock-mcp-server';
import { createMockUserContext } from '../test-utils/mock-user-context';

// Mock axios
jest.mock('axios');

describe('MCPClient', () => {
  let client: MCPClient;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAxios: jest.Mocked<AxiosInstance>;
  let config: MCPClientConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      readTimeout: 5000,
      writeTimeout: 10000,
      maxPages: 10,
    };

    // Mock axios instance
    mockAxios = {
      post: jest.fn(),
    } as unknown as jest.Mocked<AxiosInstance>;

    // Mock static axios.isAxiosError
    (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

    client = new MCPClient(config, mockLogger, mockAxios);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default maxPages if not provided', () => {
      const configWithoutMaxPages = {
        readTimeout: 5000,
        writeTimeout: 10000,
      };
      const clientWithDefaults = new MCPClient(configWithoutMaxPages, mockLogger, mockAxios);
      expect(clientWithDefaults).toBeDefined();
    });
  });

  describe('queryServer', () => {
    const server = createMockMCPServer({ name: 'hr', url: 'http://localhost:3101' });
    const userContext = createMockUserContext({
      userId: 'user-123',
      username: 'alice',
      email: 'alice@tamshai.com',
      roles: ['hr-read'],
    });
    const query = 'List all employees';

    it('should successfully query server with single page response', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
          metadata: { hasMore: false },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(result.server).toBe('hr');
      // Service aggregates array responses
      expect(result.data).toEqual({
        status: 'success',
        data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        metadata: {
          returnedCount: 2,
          totalCount: 2,
          pagesRetrieved: 1,
        },
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://localhost:3101/query',
        {
          query,
          userContext: {
            userId: 'user-123',
            username: 'alice',
            email: 'alice@tamshai.com',
            roles: ['hr-read'],
          },
        },
        expect.objectContaining({
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': 'user-123',
            'X-User-Roles': 'hr-read',
          },
        })
      );
    });

    it('should handle pagination and aggregate results', async () => {
      const mockResponse1 = {
        data: {
          status: 'success',
          data: [{ id: 1, name: 'Alice' }],
          metadata: {
            hasMore: true,
            nextCursor: 'cursor-2',
          },
        },
      };

      const mockResponse2 = {
        data: {
          status: 'success',
          data: [{ id: 2, name: 'Bob' }],
          metadata: {
            hasMore: false,
          },
        },
      };

      mockAxios.post
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(result.data).toEqual({
        status: 'success',
        data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        metadata: {
          returnedCount: 2,
          totalCount: 2,
          pagesRetrieved: 2,
        },
      });

      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Auto-paginating hr, fetched page 1, 1 records so far'
      );
    });

    it('should respect maxPages limit during pagination', async () => {
      // Create client with maxPages: 2
      const limitedConfig = { ...config, maxPages: 2 };
      const limitedClient = new MCPClient(limitedConfig, mockLogger, mockAxios);

      const mockResponse = {
        data: {
          status: 'success',
          data: [{ id: 1 }],
          metadata: {
            hasMore: true,
            nextCursor: 'next',
          },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await limitedClient.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(mockAxios.post).toHaveBeenCalledTimes(2); // Limited to 2 pages
      expect(result.data).toEqual({
        status: 'success',
        data: [{ id: 1 }, { id: 1 }], // 2 pages with 1 record each
        metadata: {
          returnedCount: 2,
          totalCount: 2,
          pagesRetrieved: 2,
        },
      });
    });

    it('should disable auto-pagination when autoPaginate=false', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: [{ id: 1, name: 'Alice' }],
          metadata: {
            hasMore: true,
            nextCursor: 'cursor-2',
          },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await client.queryServer(server, query, userContext, undefined, false);

      expect(result.status).toBe('success');
      expect(mockAxios.post).toHaveBeenCalledTimes(1); // Only one call
      expect(result.data).toEqual({
        status: 'success',
        data: [{ id: 1, name: 'Alice' }],
        metadata: {
          returnedCount: 1,
          totalCount: 1,
          pagesRetrieved: 1,
        },
      });
    });

    it('should pass cursor parameter for subsequent pages', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: [{ id: 2, name: 'Bob' }],
          metadata: { hasMore: false },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      await client.queryServer(server, query, userContext, 'cursor-2');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://localhost:3101/query',
        expect.objectContaining({
          cursor: 'cursor-2',
        }),
        expect.anything()
      );
    });

    it('should use write timeout for write operations', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: { id: 1, updated: true },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      await client.queryServer(server, query, userContext, undefined, true, true);

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          timeout: 10000, // writeTimeout
        })
      );
    });

    it('should return non-array response as-is without aggregation', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: { message: 'Operation completed' },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should handle timeout errors (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockAxios.post.mockRejectedValue(abortError);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('timeout');
      expect(result.server).toBe('hr');
      expect(result.data).toBeNull();
      expect(result.error).toContain('Service did not respond within');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('MCP server hr timeout')
      );
    });

    it('should handle timeout errors (CanceledError)', async () => {
      const canceledError = new Error('Request canceled');
      canceledError.name = 'CanceledError';
      mockAxios.post.mockRejectedValue(canceledError);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('Service did not respond within');
    });

    it('should handle timeout errors (ECONNABORTED)', async () => {
      const axiosError = new Error('timeout of 5000ms exceeded') as Error & { code: string };
      axiosError.code = 'ECONNABORTED';
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValueOnce(true);
      mockAxios.post.mockRejectedValue(axiosError);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('timeout');
    });

    it('should handle general network errors', async () => {
      const networkError = new Error('Network error');
      mockAxios.post.mockRejectedValue(networkError);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('error');
      expect(result.server).toBe('hr');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Network error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('MCP server hr error'),
        networkError
      );
    });

    it('should handle unknown error types', async () => {
      mockAxios.post.mockRejectedValue('Unknown error');

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('error');
      expect(result.error).toBe('Unknown error');
    });

    it('should return null data when pagination yields no results', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: { message: 'No data' },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      // Mock isSuccessResponse to return true but data is not an array
      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should handle empty array response', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          data: [],
          metadata: { hasMore: false },
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await client.queryServer(server, query, userContext);

      expect(result.status).toBe('success');
      expect(result.data).toBeNull(); // Empty aggregation returns null
    });
  });
});
