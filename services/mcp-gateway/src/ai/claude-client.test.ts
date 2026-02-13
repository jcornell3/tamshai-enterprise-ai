/**
 * Unit tests for Claude Client Service
 *
 * Target: 95%+ coverage
 */

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeClient, ClaudeClientConfig, MCPDataContext } from './claude-client';
import { createMockLogger } from '../test-utils/mock-logger';
import { createMockUserContext } from '../test-utils/mock-user-context';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');

describe('ClaudeClient', () => {
  let client: ClaudeClient;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAnthropic: jest.Mocked<Anthropic>;
  let config: ClaudeClientConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      apiKey: 'sk-ant-api03-test-DUMMY-KEY-NOT-REAL', // pragma: allowlist secret - Test dummy value
    };

    // Mock Anthropic instance
    mockAnthropic = {
      messages: {
        create: jest.fn(),
        stream: jest.fn(),
      },
    } as unknown as jest.Mocked<Anthropic>;

    client = new ClaudeClient(mockAnthropic, config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default maxTokens if not provided', () => {
      const configWithoutMaxTokens = {
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-api03-test-DUMMY-KEY-NOT-REAL', // pragma: allowlist secret
      };
      const clientWithDefaults = new ClaudeClient(mockAnthropic, configWithoutMaxTokens, mockLogger);
      expect(clientWithDefaults).toBeDefined();
    });
  });

  describe('isMockMode', () => {
    it('should return false for real API key (even in test NODE_ENV)', () => {
      // Mock mode is now ONLY triggered by API key prefix, not NODE_ENV
      // This allows unit tests to use mocked Anthropic SDK directly
      expect(client.isMockMode()).toBe(false);
    });

    it('should return true when apiKey starts with sk-ant-test-', () => {
      const testConfig = {
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-test-mock-key',
      };
      const testClient = new ClaudeClient(mockAnthropic, testConfig, mockLogger);
      expect(testClient.isMockMode()).toBe(true);
    });

    it('should return false for real API key in production', () => {
      // Save and modify NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodConfig = {
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-api03-real-production-key',
      };
      const prodClient = new ClaudeClient(mockAnthropic, prodConfig, mockLogger);
      expect(prodClient.isMockMode()).toBe(false);

      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('query - mock mode', () => {
    // Create a client with test API key to trigger mock mode
    let mockModeClient: ClaudeClient;
    const mockModeConfig: ClaudeClientConfig = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      apiKey: 'sk-ant-test-mock-key-for-ci', // Test key triggers mock mode
    };

    beforeEach(() => {
      mockModeClient = new ClaudeClient(mockAnthropic, mockModeConfig, mockLogger);
    });

    const userContext = createMockUserContext({
      userId: 'user-123',
      username: 'alice.chen',
      email: 'alice@tamshai.com',
      roles: ['hr-read', 'hr-write'],
    });
    const query = 'Who are the employees in the Engineering department?';
    const mcpData: MCPDataContext[] = [
      {
        server: 'hr',
        data: {
          employees: [
            { id: 1, name: 'Alice', department: 'Engineering' },
            { id: 2, name: 'Bob', department: 'Engineering' },
          ],
        },
      },
    ];

    it('should return mock response in test mode', async () => {
      const result = await mockModeClient.query(query, mcpData, userContext);

      expect(result).toContain('[Mock Response]');
      expect(result).toContain('alice.chen');
      expect(result).toContain('hr-read, hr-write');
      expect(result).toContain('hr');
      expect(mockLogger.info).toHaveBeenCalledWith('Mock mode: Returning simulated Claude response', {
        username: 'alice.chen',
        roles: ['hr-read', 'hr-write'],
        dataSourceCount: 1,
      });
    });

    it('should include all data sources in mock response', async () => {
      const multiSourceData: MCPDataContext[] = [
        { server: 'hr', data: { employees: [] } },
        { server: 'finance', data: { budgets: [] } },
        { server: 'sales', data: { deals: [] } },
      ];

      const result = await mockModeClient.query(query, multiSourceData, userContext);

      expect(result).toContain('hr, finance, sales');
    });

    it('should show "none" when no data sources', async () => {
      const result = await mockModeClient.query(query, [], userContext);

      expect(result).toContain('Data sources consulted: none');
    });

    it('should truncate long queries in mock response', async () => {
      const longQuery = 'A'.repeat(100);
      const result = await mockModeClient.query(longQuery, mcpData, userContext);

      expect(result).toContain('A'.repeat(50));
      expect(result).toContain('...');
      expect(result).not.toContain('A'.repeat(51));
    });

    it('should not call Anthropic API in mock mode', async () => {
      await mockModeClient.query(query, mcpData, userContext);

      expect(mockAnthropic.messages.create).not.toHaveBeenCalled();
    });
  });

  describe('query - real mode', () => {
    const userContext = createMockUserContext({
      userId: 'user-123',
      username: 'alice.chen',
      email: 'alice@tamshai.com',
      roles: ['hr-read', 'hr-write'],
    });
    const query = 'Who are the employees in the Engineering department?';
    const mcpData: MCPDataContext[] = [
      {
        server: 'hr',
        data: {
          employees: [
            { id: 1, name: 'Alice', department: 'Engineering' },
            { id: 2, name: 'Bob', department: 'Engineering' },
          ],
        },
      },
    ];

    beforeEach(() => {
      // Spy on isMockMode to force real mode for these tests
      jest.spyOn(client, 'isMockMode').mockReturnValue(false);
    });

    it('should successfully query Claude with MCP data context', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'There are 2 employees in the Engineering department: Alice and Bob.',
          },
        ],
        model: 'claude-sonnet-4-20250514',
        usage: {
          input_tokens: 150,
          output_tokens: 20,
        },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.query(query, mcpData, userContext);

      expect(result).toBe('There are 2 employees in the Engineering department: Alice and Bob.');
      expect(mockLogger.debug).toHaveBeenCalledWith('Sending query to Claude', {
        model: 'claude-sonnet-4-20250514',
        queryLength: query.length,
        dataContextLength: expect.any(Number),
        userRoles: ['hr-read', 'hr-write'],
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Claude query completed', {
        responseLength: expect.any(Number),
        usage: mockResponse.usage,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });

    it('should call Anthropic API with TextBlockParam[] system prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      const callArgs = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(4096);
      expect(callArgs.messages).toEqual([{ role: 'user', content: query }]);

      // System prompt should be TextBlockParam[]
      expect(Array.isArray(callArgs.system)).toBe(true);
      expect(callArgs.system).toHaveLength(2);
      expect(callArgs.system[0].type).toBe('text');
      expect(callArgs.system[0].text).toContain('You are an AI assistant for Tamshai Corp');
      expect(callArgs.system[1].type).toBe('text');
      expect(callArgs.system[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should include user context in system prompt instructions block', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      const systemBlocks = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      const instructionsText = systemBlocks[0].text;
      expect(instructionsText).toContain('alice.chen');
      expect(instructionsText).toContain('alice@tamshai.com');
      expect(instructionsText).toContain('hr-read, hr-write');
    });

    it('should include MCP data context in cached data block', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      const systemBlocks = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      const dataBlockText = systemBlocks[1].text;
      expect(dataBlockText).toContain('[Data from hr]');
      expect(dataBlockText).toContain('Alice');
      expect(dataBlockText).toContain('Engineering');
    });

    it('should filter out null MCP data', async () => {
      const mcpDataWithNull: MCPDataContext[] = [
        { server: 'hr', data: { employees: [] } },
        { server: 'finance', data: null },
        { server: 'sales', data: { deals: [] } },
      ];

      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpDataWithNull, userContext);

      const systemBlocks = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      const dataBlockText = systemBlocks[1].text;
      expect(dataBlockText).toContain('[Data from hr]');
      expect(dataBlockText).toContain('[Data from sales]');
      expect(dataBlockText).not.toContain('[Data from finance]');
    });

    it('should handle empty MCP data array', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, [], userContext);

      const systemBlocks = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      const dataBlockText = systemBlocks[1].text;
      expect(dataBlockText).toContain('No relevant data available for this query.');
    });

    it('should handle user with no email', async () => {
      const userContextNoEmail = createMockUserContext({
        username: 'testuser',
        email: '',
        roles: ['user'],
      });

      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContextNoEmail);

      const systemBlocks = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      const instructionsText = systemBlocks[0].text;
      expect(instructionsText).toContain('unknown');
    });

    it('should return default message when no text content in response', async () => {
      const mockResponse = {
        content: [{ type: 'image', source: 'data:image/png;base64,...' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.query(query, mcpData, userContext);

      expect(result).toBe('No response generated.');
    });

    it('should return default message when content array is empty', async () => {
      const mockResponse = {
        content: [],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.query(query, mcpData, userContext);

      expect(result).toBe('No response generated.');
    });

    it('should use configured model and maxTokens', async () => {
      const customConfig = {
        model: 'claude-opus-4',
        maxTokens: 8192,
        apiKey: 'sk-ant-api03-test-DUMMY-KEY-NOT-REAL', // pragma: allowlist secret
      };
      const customClient = new ClaudeClient(mockAnthropic, customConfig, mockLogger);
      jest.spyOn(customClient, 'isMockMode').mockReturnValue(false);

      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await customClient.query(query, mcpData, userContext);

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4',
          max_tokens: 8192,
        })
      );
    });
  });

  describe('streamQuery', () => {
    const userContext = createMockUserContext({
      userId: 'user-456',
      username: 'bob.martinez',
      email: 'bob@tamshai.com',
      roles: ['finance-read'],
    });
    const query = 'What is the total budget?';
    const mcpData: MCPDataContext[] = [
      {
        server: 'finance',
        data: {
          budgets: [
            { department: 'Engineering', amount: 500000 },
            { department: 'Sales', amount: 300000 },
          ],
        },
      },
    ];

    it('should successfully create Claude stream', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      const result = await client.streamQuery(query, mcpData, userContext);

      expect(result).toBe(mockStream);
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting Claude stream', {
        model: 'claude-sonnet-4-20250514',
        queryLength: query.length,
        dataContextLength: expect.any(Number),
        userRoles: ['finance-read'],
      });
    });

    it('should call Anthropic stream with TextBlockParam[] system prompt', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      const callArgs = (mockAnthropic.messages.stream as jest.Mock).mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(4096);
      expect(callArgs.messages).toEqual([{ role: 'user', content: query }]);

      // System prompt should be TextBlockParam[]
      expect(Array.isArray(callArgs.system)).toBe(true);
      expect(callArgs.system).toHaveLength(2);
      expect(callArgs.system[0].type).toBe('text');
      expect(callArgs.system[0].text).toContain('You are an AI assistant for Tamshai Corp');
      expect(callArgs.system[1].type).toBe('text');
      expect(callArgs.system[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should include user context in stream system prompt', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      const systemBlocks = (mockAnthropic.messages.stream as jest.Mock).mock.calls[0][0].system;
      const instructionsText = systemBlocks[0].text;
      expect(instructionsText).toContain('bob.martinez');
      expect(instructionsText).toContain('bob@tamshai.com');
      expect(instructionsText).toContain('finance-read');
    });

    it('should include MCP data context in stream data block', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      const systemBlocks = (mockAnthropic.messages.stream as jest.Mock).mock.calls[0][0].system;
      const dataBlockText = systemBlocks[1].text;
      expect(dataBlockText).toContain('[Data from finance]');
      expect(dataBlockText).toContain('Engineering');
      expect(dataBlockText).toContain('500000');
    });
  });

  describe('queryWithContext', () => {
    const userContext = createMockUserContext({
      userId: 'user-123',
      username: 'alice.chen',
      email: 'alice@tamshai.com',
      roles: ['hr-read', 'hr-write'],
    });

    it('should return mock response in test mode', async () => {
      // Create client with test API key to trigger mock mode
      const mockModeConfig: ClaudeClientConfig = {
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-test-mock-key-for-ci',
      };
      const mockModeClient = new ClaudeClient(mockAnthropic, mockModeConfig, mockLogger);

      const result = await mockModeClient.queryWithContext(
        'Who are my team members?',
        '[Data from mcp-hr]:\n{"employees": []}',
        userContext
      );

      expect(result).toContain('[Mock Response]');
      expect(result).toContain('alice.chen');
    });

    it('should send pre-formatted data context to Claude', async () => {
      jest.spyOn(client, 'isMockMode').mockReturnValue(false);

      const mockResponse = {
        content: [{ type: 'text', text: 'Response from cached context' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      const dataContext = '[Data from mcp-hr]:\n{"employees": [{"name": "Alice"}]}';
      const result = await client.queryWithContext('Show employees', dataContext, userContext);

      expect(result).toBe('Response from cached context');

      const callArgs = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(callArgs.system)).toBe(true);
      expect(callArgs.system[1].text).toContain(dataContext);
      expect(callArgs.system[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should log cache metrics', async () => {
      jest.spyOn(client, 'isMockMode').mockReturnValue(false);

      const mockResponse = {
        content: [{ type: 'text', text: 'Test' }],
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 0,
        },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.queryWithContext('test', 'context', userContext);

      expect(mockLogger.info).toHaveBeenCalledWith('Claude query completed', {
        responseLength: expect.any(Number),
        usage: mockResponse.usage,
        cacheCreationTokens: 50,
        cacheReadTokens: 0,
      });
    });
  });
});
