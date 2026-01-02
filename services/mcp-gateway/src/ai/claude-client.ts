/**
 * Claude Client Service
 *
 * Handles communication with Claude AI API
 * Extracted from index.ts for testability and separation of concerns
 */

import Anthropic from '@anthropic-ai/sdk';
import { Logger } from 'winston';
import { UserContext } from '../test-utils/mock-user-context';

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
   * Check if client is in mock mode (for testing/CI)
   * Mock mode is enabled when:
   * - NODE_ENV is 'test'
   * - API key starts with 'sk-ant-test-'
   */
  isMockMode(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      this.config.apiKey.startsWith('sk-ant-test-')
    );
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
   * Build system prompt with user context and role permissions
   */
  private buildSystemPrompt(userContext: UserContext, dataContext: string): string {
    return `You are an AI assistant for Tamshai Corp, a family investment management organization.
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
6. When asked about "my team", first identify the user in the employee data, then find their direct reports

Available data context:
${dataContext || 'No relevant data available for this query.'}`;
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

    this.logger.info('Claude query completed', {
      responseLength: response.length,
      usage: message.usage,
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
