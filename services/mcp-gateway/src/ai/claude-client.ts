/**
 * Claude Client Service
 *
 * Handles communication with Claude AI API
 * Extracted from index.ts for testability and separation of concerns
 *
 * v1.5 Prompt Caching:
 * System prompts now use TextBlockParam[] format with cache_control
 * on the data block to enable Anthropic's prompt caching feature.
 * See: .specify/specs/012-prompt-caching/spec.md
 */

import Anthropic from '@anthropic-ai/sdk';
import { Logger } from 'winston';
import { UserContext } from '../test-utils/mock-user-context';

/** Anthropic SDK text block parameter type for structured system prompts */
type TextBlockParam = Anthropic.Messages.TextBlockParam;

export interface ClaudeClientConfig {
  model: string;
  maxTokens?: number;
  apiKey: string; // Used to detect mock mode (sk-ant-test-*)
}

export interface MCPDataContext {
  server: string;
  data: unknown;
}

/**
 * Claude Client Service
 *
 * Handles AI queries using Claude API with:
 * - Role-based system prompt generation
 * - MCP data context formatting
 * - User identity context
 * - Text extraction from responses
 */
export class ClaudeClient {
  private anthropic: Anthropic;
  private config: Required<ClaudeClientConfig>;
  private logger: Logger;

  constructor(anthropic: Anthropic, config: ClaudeClientConfig, logger: Logger) {
    this.anthropic = anthropic;
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? 4096,
    };
    this.logger = logger;
  }

  /**
   * Check if client is in mock mode (for CI integration tests)
   * Mock mode is enabled when API key starts with 'sk-ant-test-'
   *
   * Note: We intentionally do NOT check NODE_ENV === 'test' because:
   * - Unit tests mock the Anthropic SDK directly and expect those mocks to be called
   * - Integration tests use CLAUDE_API_KEY=sk-ant-test-* to trigger mock mode
   */
  isMockMode(): boolean {
    return this.config.apiKey.startsWith('sk-ant-test-');
  }

  /**
   * Generate mock response for testing
   */
  private generateMockResponse(
    query: string,
    mcpData: MCPDataContext[],
    userContext: UserContext
  ): string {
    const dataSources = mcpData.map((d) => d.server).join(', ') || 'none';
    return (
      `[Mock Response] Query processed successfully for user ${userContext.username} ` +
      `with roles: ${userContext.roles.join(', ')}. ` +
      `Data sources consulted: ${dataSources}. ` +
      `Query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`
    );
  }

  /**
   * Build system prompt with user context and role permissions.
   *
   * Returns TextBlockParam[] with cache_control on the data block
   * to enable Anthropic's prompt caching (10% cost for cache reads).
   */
  private buildSystemPrompt(userContext: UserContext, dataContext: string): TextBlockParam[] {
    const instructions = `You are an AI assistant for Tamshai Corp, a family investment management organization.

Normal Q&A Mode (Directives are handled automatically):

You have access to enterprise data based on the user's role permissions.
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

IMPORTANT - User Identity Context:
- First, look for this user in the employee data to understand their position and department
- Use their employee record to determine who their team members or direct reports are
- If the user asks about "my team" or "my employees", find the user in the data first, then find employees who report to them or are in their department

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission
6. When asked about "my team", first identify the user in the employee data, then find their direct reports`;

    const dataBlock = `Available data context:\n${dataContext || 'No relevant data available for this query.'}`;

    return [
      {
        type: "text" as const,
        text: instructions,
      },
      {
        type: "text" as const,
        text: dataBlock,
        cache_control: { type: "ephemeral" as const },
      },
    ];
  }

  /**
   * Format MCP data into context string
   */
  private formatMCPDataContext(mcpData: MCPDataContext[]): string {
    return mcpData
      .filter((d) => d.data !== null)
      .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
      .join('\n\n');
  }

  /**
   * Send query to Claude with MCP data context
   *
   * @param query - User's natural language query
   * @param mcpData - Array of MCP server responses
   * @param userContext - User context (userId, username, email, roles, groups)
   * @returns Claude's text response
   */
  async query(
    query: string,
    mcpData: MCPDataContext[],
    userContext: UserContext
  ): Promise<string> {
    // TEST/CI MODE: Return mock responses to avoid Claude API calls with invalid key
    if (this.isMockMode()) {
      this.logger.info('Mock mode: Returning simulated Claude response', {
        username: userContext.username,
        roles: userContext.roles,
        dataSourceCount: mcpData.length,
      });
      return this.generateMockResponse(query, mcpData, userContext);
    }

    const dataContext = this.formatMCPDataContext(mcpData);
    const systemPrompt = this.buildSystemPrompt(userContext, dataContext);

    this.logger.debug('Sending query to Claude', {
      model: this.config.model,
      queryLength: query.length,
      dataContextLength: dataContext.length,
      userRoles: userContext.roles,
    });

    const message = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    // Extract text from response
    const textContent = message.content.find((c) => c.type === 'text');
    const response = textContent && 'text' in textContent ? textContent.text : 'No response generated.';

    // Log cache metrics for prompt caching monitoring
    const usage = message.usage as unknown as Record<string, unknown>;
    this.logger.info('Claude query completed', {
      responseLength: response.length,
      usage: message.usage,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    });

    return response;
  }

  /**
   * Send query to Claude with a pre-formatted data context string.
   *
   * Used by the AI query route when MCP context is retrieved from Redis cache.
   * The pre-serialized string ensures byte-identical prompts for Anthropic cache hits.
   *
   * @param query - User's natural language query
   * @param dataContext - Pre-formatted MCP data context string
   * @param userContext - User context (userId, username, email, roles, groups)
   * @returns Claude's text response
   */
  async queryWithContext(
    query: string,
    dataContext: string,
    userContext: UserContext
  ): Promise<string> {
    // TEST/CI MODE: Return mock responses
    if (this.isMockMode()) {
      this.logger.info('Mock mode: Returning simulated Claude response', {
        username: userContext.username,
        roles: userContext.roles,
        dataContextLength: dataContext.length,
      });
      return (
        `[Mock Response] Query processed successfully for user ${userContext.username} ` +
        `with roles: ${userContext.roles.join(', ')}. ` +
        `Data context length: ${dataContext.length}. ` +
        `Query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`
      );
    }

    const systemPrompt = this.buildSystemPrompt(userContext, dataContext);

    this.logger.debug('Sending query to Claude (with cached context)', {
      model: this.config.model,
      queryLength: query.length,
      dataContextLength: dataContext.length,
      userRoles: userContext.roles,
    });

    const message = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    // Extract text from response
    const textContent = message.content.find((c) => c.type === 'text');
    const response = textContent && 'text' in textContent ? textContent.text : 'No response generated.';

    // Log cache metrics for prompt caching monitoring
    const usage = message.usage as unknown as Record<string, unknown>;
    this.logger.info('Claude query completed', {
      responseLength: response.length,
      usage: message.usage,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    });

    return response;
  }

  /**
   * Create streaming query to Claude with MCP data context
   *
   * @param query - User's natural language query
   * @param mcpData - Array of MCP server responses
   * @param userContext - User context (userId, username, email, roles, groups)
   * @returns Anthropic message stream
   */
  async streamQuery(
    query: string,
    mcpData: MCPDataContext[],
    userContext: UserContext
  ): Promise<ReturnType<typeof this.anthropic.messages.stream>> {
    const dataContext = this.formatMCPDataContext(mcpData);
    const systemPrompt = this.buildSystemPrompt(userContext, dataContext);

    this.logger.debug('Starting Claude stream', {
      model: this.config.model,
      queryLength: query.length,
      dataContextLength: dataContext.length,
      userRoles: userContext.roles,
    });

    const stream = await this.anthropic.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    return stream;
  }
}
