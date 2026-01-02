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
      apiKey: 'sk-ant-api03-real-key', // Real key format (not test key)
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
        apiKey: 'sk-ant-api03-real-key',
      };
      const clientWithDefaults = new ClaudeClient(mockAnthropic, configWithoutMaxTokens, mockLogger);
      expect(clientWithDefaults).toBeDefined();
    });
  });

  describe('isMockMode', () => {
    it('should return true when NODE_ENV is test', () => {
      // NODE_ENV is 'test' during Jest execution
      expect(client.isMockMode()).toBe(true);
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
      const result = await client.query(query, mcpData, userContext);

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

      const result = await client.query(query, multiSourceData, userContext);

      expect(result).toContain('hr, finance, sales');
    });

    it('should show "none" when no data sources', async () => {
      const result = await client.query(query, [], userContext);

      expect(result).toContain('Data sources consulted: none');
    });

    it('should truncate long queries in mock response', async () => {
      const longQuery = 'A'.repeat(100);
      const result = await client.query(longQuery, mcpData, userContext);

      expect(result).toContain('A'.repeat(50));
      expect(result).toContain('...');
      expect(result).not.toContain('A'.repeat(51));
    });

    it('should not call Anthropic API in mock mode', async () => {
      await client.query(query, mcpData, userContext);

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
      });
    });

    it('should call Anthropic API with correct parameters', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: expect.stringContaining('You are an AI assistant for Tamshai Corp'),
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });
    });

    it('should include user context in system prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      const systemPromptCall = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('alice.chen');
      expect(systemPromptCall).toContain('alice@tamshai.com');
      expect(systemPromptCall).toContain('hr-read, hr-write');
    });

    it('should include MCP data context in system prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, mcpData, userContext);

      const systemPromptCall = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('[Data from hr]');
      expect(systemPromptCall).toContain('Alice');
      expect(systemPromptCall).toContain('Engineering');
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

      const systemPromptCall = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('[Data from hr]');
      expect(systemPromptCall).toContain('[Data from sales]');
      expect(systemPromptCall).not.toContain('[Data from finance]');
    });

    it('should handle empty MCP data array', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };

      (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

      await client.query(query, [], userContext);

      const systemPromptCall = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('No relevant data available for this query.');
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

      const systemPromptCall = (mockAnthropic.messages.create as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('unknown');
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
        apiKey: 'sk-ant-api03-real-key',
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

    it('should call Anthropic stream with correct parameters', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      expect(mockAnthropic.messages.stream).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: expect.stringContaining('You are an AI assistant for Tamshai Corp'),
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
      });
    });

    it('should include user context in stream system prompt', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      const systemPromptCall = (mockAnthropic.messages.stream as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('bob.martinez');
      expect(systemPromptCall).toContain('bob@tamshai.com');
      expect(systemPromptCall).toContain('finance-read');
    });

    it('should include MCP data context in stream system prompt', async () => {
      const mockStream = {
        on: jest.fn(),
        finalMessage: jest.fn(),
      };

      (mockAnthropic.messages.stream as jest.Mock).mockResolvedValue(mockStream);

      await client.streamQuery(query, mcpData, userContext);

      const systemPromptCall = (mockAnthropic.messages.stream as jest.Mock).mock.calls[0][0].system;
      expect(systemPromptCall).toContain('[Data from finance]');
      expect(systemPromptCall).toContain('Engineering');
      expect(systemPromptCall).toContain('500000');
    });
  });
});
