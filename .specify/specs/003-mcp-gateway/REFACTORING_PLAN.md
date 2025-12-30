# MCP Gateway Refactoring Plan
## Breaking Up index.ts for Improved Test Coverage

**Status**: Planning
**Current Coverage**: 31% overall (49.06% on services/mcp-gateway)
**Target Coverage**: 70% overall (90% diff coverage on new code)
**File Size**: index.ts - 1,533 lines (too large for effective testing)

---

## Objectives

1. **Increase Testability**: Break monolithic index.ts into small, focused modules
2. **Improve Coverage**: Achieve 70%+ coverage by making code easier to test
3. **Maintain Functionality**: Zero regression - all existing features work identically
4. **Follow Best Practices**: Single Responsibility Principle, dependency injection
5. **Enable TDD**: New features built test-first on extracted modules

---

## Current State Analysis

### index.ts Structure (1,533 lines)

| Section | Lines | Complexity | Test Priority |
|---------|-------|------------|---------------|
| Configuration | 62-89 | Low | Medium |
| Logger Setup | 95-109 | Low | Low |
| Type Definitions | 115-145 | Low | N/A |
| MCP Server Configs | 151-176 | Low | High |
| JWT Validation | 182-266 | **High** | **Critical** |
| MCP Server Interaction | 273-443 (170 lines!) | **Very High** | **Critical** |
| Claude API Integration | 449-499 | High | High |
| Express App Setup | 505-547 | Low | Low |
| Rate Limiting | 554-581 | Medium | Medium |
| OpenAPI Docs | 588-611 | Low | Low |
| Auth Middleware | 621-665 | High | **Critical** |
| AI Query Handler | 677-765 | High | High |
| SSE Streaming | 786-1039 (253 lines!) | **Very High** | **Critical** |
| Confirmation Handler | 1047-1155 | High | High |
| MCP Tool Proxy | 1168-1418 (250 lines!) | **Very High** | **Critical** |
| Server Startup | 1455-1520 | Medium | Medium |

### Problems with Current Structure

1. **Untestable**: 1,533-line file is too large to test comprehensively
2. **Mixed Concerns**: Configuration, business logic, routing all intertwined
3. **No Dependency Injection**: Hard-coded dependencies (Anthropic, Redis, Axios)
4. **Difficult to Mock**: Functions directly call external APIs
5. **Circular Dependencies**: Everything in one file creates implicit coupling

---

## Refactoring Strategy

### Phase 1: Extract Pure Functions (Week 1)

**Goal**: Extract logic with no side effects - easiest to test

#### 1.1 Configuration Module
**File**: `src/config/index.ts`
**Lines**: 62-89 (28 lines)
**Complexity**: Low
**Testing**: 95% coverage target

```typescript
// src/config/index.ts
export interface GatewayConfig {
  port: number;
  keycloak: {
    url: string;
    realm: string;
    clientId: string;
    jwksUri?: string;
    issuer?: string;
  };
  claude: {
    apiKey: string;
    model: string;
  };
  mcpServers: {
    hr: string;
    finance: string;
    sales: string;
    support: string;
  };
  timeouts: {
    mcpRead: number;
    mcpWrite: number;
    claude: number;
    total: number;
  };
  logLevel: string;
}

export function loadConfig(): GatewayConfig {
  return {
    port: parseInt(process.env.PORT || '3000'),
    keycloak: {
      url: process.env.KEYCLOAK_URL || 'http://localhost:8180',
      realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'mcp-gateway',
      jwksUri: process.env.JWKS_URI || undefined,
      issuer: process.env.KEYCLOAK_ISSUER || undefined,
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    },
    mcpServers: {
      hr: process.env.MCP_HR_URL || 'http://localhost:3001',
      finance: process.env.MCP_FINANCE_URL || 'http://localhost:3002',
      sales: process.env.MCP_SALES_URL || 'http://localhost:3003',
      support: process.env.MCP_SUPPORT_URL || 'http://localhost:3004',
    },
    timeouts: {
      mcpRead: parseInt(process.env.MCP_READ_TIMEOUT_MS || '5000'),
      mcpWrite: parseInt(process.env.MCP_WRITE_TIMEOUT_MS || '10000'),
      claude: parseInt(process.env.CLAUDE_TIMEOUT_MS || '60000'),
      total: parseInt(process.env.TOTAL_REQUEST_TIMEOUT_MS || '90000'),
    },
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
```

**Tests**: `src/config/index.test.ts`
```typescript
describe('loadConfig', () => {
  it('should load defaults when env vars not set', () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.keycloak.realm).toBe('tamshai-corp');
  });

  it('should override defaults with env vars', () => {
    process.env.PORT = '4000';
    process.env.KEYCLOAK_REALM = 'test-realm';
    const config = loadConfig();
    expect(config.port).toBe(4000);
    expect(config.keycloak.realm).toBe('test-realm');
  });

  it('should parse numeric env vars', () => {
    process.env.MCP_READ_TIMEOUT_MS = '8000';
    const config = loadConfig();
    expect(config.timeouts.mcpRead).toBe(8000);
  });
});
```

**Coverage Target**: 95%+ (pure function, easy to test)

---

#### 1.2 Role Mapping Module
**File**: `src/mcp/role-mapper.ts`
**Lines**: 151-176, 273-279 (32 lines)
**Complexity**: Low
**Testing**: 100% coverage target

```typescript
// src/mcp/role-mapper.ts
export interface MCPServerConfig {
  name: string;
  url: string;
  requiredRoles: string[];
  description: string;
}

export const DEFAULT_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'hr',
    url: 'http://localhost:3001',
    requiredRoles: ['hr-read', 'hr-write', 'executive'],
    description: 'HR data including employees, departments, org structure',
  },
  // ... other servers
];

/**
 * Get MCP servers accessible to a user based on their roles
 */
export function getAccessibleMCPServers(
  userRoles: string[],
  servers: MCPServerConfig[]
): MCPServerConfig[] {
  return servers.filter((server) =>
    server.requiredRoles.some((role) => userRoles.includes(role))
  );
}

/**
 * Get MCP servers denied to a user based on their roles
 */
export function getDeniedMCPServers(
  userRoles: string[],
  servers: MCPServerConfig[]
): MCPServerConfig[] {
  return servers.filter((server) =>
    !server.requiredRoles.some((role) => userRoles.includes(role))
  );
}
```

**Tests**: `src/mcp/role-mapper.test.ts`
```typescript
describe('Role Mapper', () => {
  const servers: MCPServerConfig[] = [
    { name: 'hr', url: 'http://hr', requiredRoles: ['hr-read', 'executive'], description: 'HR' },
    { name: 'finance', url: 'http://finance', requiredRoles: ['finance-read', 'executive'], description: 'Finance' },
  ];

  describe('getAccessibleMCPServers', () => {
    it('should return servers matching user roles', () => {
      const accessible = getAccessibleMCPServers(['hr-read'], servers);
      expect(accessible).toHaveLength(1);
      expect(accessible[0].name).toBe('hr');
    });

    it('should return multiple servers for executive role', () => {
      const accessible = getAccessibleMCPServers(['executive'], servers);
      expect(accessible).toHaveLength(2);
    });

    it('should return empty array for no matching roles', () => {
      const accessible = getAccessibleMCPServers(['intern'], servers);
      expect(accessible).toHaveLength(0);
    });
  });

  describe('getDeniedMCPServers', () => {
    it('should return servers NOT matching user roles', () => {
      const denied = getDeniedMCPServers(['hr-read'], servers);
      expect(denied).toHaveLength(1);
      expect(denied[0].name).toBe('finance');
    });
  });
});
```

**Coverage Target**: 100% (pure functions, no dependencies)

---

### Phase 2: Extract Stateful Services (Week 2)

**Goal**: Extract services with external dependencies - use dependency injection for testability

#### 2.1 JWT Validator Service
**File**: `src/auth/jwt-validator.ts`
**Lines**: 182-266 (85 lines)
**Complexity**: High
**Testing**: 90% coverage target

```typescript
// src/auth/jwt-validator.ts
import jwt from 'jsonwebtoken';
import jwksRsa, { JwksClient } from 'jwks-rsa';
import { Logger } from 'winston';

export interface UserContext {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  groups: string[];
}

export interface JWTValidatorConfig {
  jwksUri: string;
  issuer: string;
  audience: string[];
}

/**
 * JWT Validator Service
 * Validates JWT tokens against Keycloak JWKS endpoint
 */
export class JWTValidator {
  private jwksClient: JwksClient;

  constructor(
    private config: JWTValidatorConfig,
    private logger: Logger
  ) {
    this.jwksClient = jwksRsa({
      jwksUri: config.jwksUri,
      cache: true,
      rateLimit: true,
    });
  }

  private getSigningKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void => {
    this.jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };

  async validate(token: string): Promise<UserContext> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getSigningKey,
        {
          algorithms: ['RS256'],
          issuer: this.config.issuer,
          audience: this.config.audience,
        },
        (err, decoded) => {
          if (err) {
            reject(err);
            return;
          }

          const payload = decoded as jwt.JwtPayload;
          const realmRoles = payload.realm_access?.roles || [];
          const groups = payload.groups || [];

          // Fallback chain for username
          const username = payload.preferred_username ||
                          payload.name ||
                          payload.given_name ||
                          (payload.sub ? `user-${payload.sub.substring(0, 8)}` : 'unknown');

          // Warn on missing claims (GAP-005)
          if (!payload.preferred_username) {
            this.logger.warn('JWT missing preferred_username claim', {
              hasSub: !!payload.sub,
              hasName: !!payload.name,
              usedFallback: username,
            });
          }

          resolve({
            userId: payload.sub || '',
            username: username,
            email: payload.email || '',
            roles: realmRoles,
            groups: groups,
          });
        }
      );
    });
  }
}
```

**Tests**: `src/auth/jwt-validator.test.ts`
```typescript
import { JWTValidator } from './jwt-validator';
import { createMockLogger } from '../test-utils/mock-logger';
import jwt from 'jsonwebtoken';

describe('JWTValidator', () => {
  let validator: JWTValidator;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    validator = new JWTValidator(
      {
        jwksUri: 'http://localhost:8180/realms/test/certs',
        issuer: 'http://localhost:8180/realms/test',
        audience: ['mcp-gateway', 'account'],
      },
      mockLogger
    );
  });

  describe('validate', () => {
    it('should extract user context from valid token', async () => {
      const token = generateMockToken({
        sub: 'user-123',
        preferred_username: 'alice.chen',
        email: 'alice@tamshai.com',
        realm_access: { roles: ['hr-read', 'hr-write'] },
        groups: ['/tamshai/hr'],
      });

      const context = await validator.validate(token);

      expect(context.userId).toBe('user-123');
      expect(context.username).toBe('alice.chen');
      expect(context.email).toBe('alice@tamshai.com');
      expect(context.roles).toEqual(['hr-read', 'hr-write']);
      expect(context.groups).toEqual(['/tamshai/hr']);
    });

    it('should use fallback username when preferred_username missing', async () => {
      const token = generateMockToken({
        sub: 'user-456',
        name: 'Bob Martinez',
        // Missing preferred_username
      });

      const context = await validator.validate(token);

      expect(context.username).toBe('Bob Martinez');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'JWT missing preferred_username claim',
        expect.any(Object)
      );
    });

    it('should reject expired token', async () => {
      const expiredToken = generateMockToken({ exp: Date.now() / 1000 - 3600 });

      await expect(validator.validate(expiredToken)).rejects.toThrow('jwt expired');
    });

    it('should reject token with wrong issuer', async () => {
      const token = generateMockToken({ iss: 'http://evil.com' });

      await expect(validator.validate(token)).rejects.toThrow('jwt issuer invalid');
    });
  });
});
```

**Coverage Target**: 90% (mocking jwt.verify is tricky, may miss some edge cases)

---

#### 2.2 MCP Client Service
**File**: `src/mcp/client.ts`
**Lines**: 298-443 (146 lines)
**Complexity**: Very High
**Testing**: 85% coverage target

```typescript
// src/mcp/client.ts
import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';
import { MCPServerConfig } from './role-mapper';
import { UserContext } from '../auth/jwt-validator';
import { MCPToolResponse, isSuccessResponse } from '../types/mcp-response';

export interface MCPQueryResult {
  server: string;
  data: unknown;
  status: 'success' | 'timeout' | 'error';
  error?: string;
  durationMs?: number;
}

export interface MCPClientConfig {
  readTimeout: number;
  writeTimeout: number;
}

/**
 * MCP Client Service
 * Handles communication with MCP servers including pagination, timeouts, and error handling
 */
export class MCPClient {
  private httpClient: AxiosInstance;

  constructor(
    private config: MCPClientConfig,
    private logger: Logger,
    httpClient?: AxiosInstance  // Dependency injection for testing
  ) {
    this.httpClient = httpClient || axios.create();
  }

  /**
   * Query an MCP server with automatic pagination and timeout handling
   */
  async query(
    server: MCPServerConfig,
    query: string,
    userContext: UserContext,
    options: {
      cursor?: string;
      autoPaginate?: boolean;
      isWriteOperation?: boolean;
    } = {}
  ): Promise<MCPQueryResult> {
    const { cursor, autoPaginate = true, isWriteOperation = false } = options;
    const startTime = Date.now();
    const timeout = isWriteOperation ? this.config.writeTimeout : this.config.readTimeout;

    try {
      const allData: unknown[] = [];
      let currentCursor = cursor;
      let pageCount = 0;
      const maxPages = 10;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        do {
          const response = await this.httpClient.post(
            `${server.url}/query`,
            {
              query,
              userContext: {
                userId: userContext.userId,
                username: userContext.username,
                email: userContext.email,
                roles: userContext.roles,
              },
              ...(currentCursor && { cursor: currentCursor }),
            },
            {
              timeout: timeout,
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userContext.userId,
                'X-User-Roles': userContext.roles.join(','),
              },
            }
          );

          const mcpResponse = response.data as MCPToolResponse;

          // Accumulate paginated data
          if (isSuccessResponse(mcpResponse) && Array.isArray(mcpResponse.data)) {
            allData.push(...mcpResponse.data);
            pageCount++;

            if (autoPaginate && mcpResponse.metadata?.hasMore && mcpResponse.metadata?.nextCursor && pageCount < maxPages) {
              currentCursor = mcpResponse.metadata.nextCursor;
              this.logger.info(`Auto-paginating ${server.name}, page ${pageCount}, ${allData.length} records`);
            } else {
              // Return aggregated result
              if (allData.length > 0) {
                return {
                  server: server.name,
                  status: 'success',
                  data: {
                    status: 'success',
                    data: allData,
                    metadata: {
                      returnedCount: allData.length,
                      totalCount: allData.length,
                      pagesRetrieved: pageCount,
                    },
                  },
                  durationMs: Date.now() - startTime,
                };
              }
              break;
            }
          } else {
            // Non-array response, return as-is
            return {
              server: server.name,
              status: 'success',
              data: response.data,
              durationMs: Date.now() - startTime,
            };
          }
        } while (autoPaginate && pageCount < maxPages);

        return {
          server: server.name,
          status: 'success',
          data: allData.length > 0 ? { status: 'success', data: allData } : null,
          durationMs: Date.now() - startTime,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return this.handleError(server, error, Date.now() - startTime, timeout);
    }
  }

  private handleError(
    server: MCPServerConfig,
    error: unknown,
    durationMs: number,
    timeout: number
  ): MCPQueryResult {
    // Check if timeout
    if (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        (axios.isAxiosError(error) && error.code === 'ECONNABORTED'))
    ) {
      this.logger.warn(`MCP server ${server.name} timeout after ${durationMs}ms (limit: ${timeout}ms)`);
      return {
        server: server.name,
        status: 'timeout',
        data: null,
        error: `Service did not respond within ${timeout}ms`,
        durationMs,
      };
    }

    this.logger.error(`MCP server ${server.name} error:`, error);
    return {
      server: server.name,
      status: 'error',
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
    };
  }
}
```

**Tests**: `src/mcp/client.test.ts`
```typescript
import { MCPClient } from './client';
import { createMockLogger } from '../test-utils/mock-logger';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

describe('MCPClient', () => {
  let client: MCPClient;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAxios = new MockAdapter(axios);
    client = new MCPClient(
      { readTimeout: 5000, writeTimeout: 10000 },
      mockLogger
    );
  });

  afterEach(() => {
    mockAxios.restore();
  });

  describe('query', () => {
    const server = { name: 'hr', url: 'http://hr', requiredRoles: ['hr-read'], description: 'HR' };
    const userContext = { userId: 'user-1', username: 'alice', email: 'alice@test.com', roles: ['hr-read'], groups: [] };

    it('should return successful result for non-paginated response', async () => {
      mockAxios.onPost('http://hr/query').reply(200, {
        status: 'success',
        data: { employee_id: '123', name: 'Alice' },
      });

      const result = await client.query(server, 'get employee', userContext);

      expect(result.status).toBe('success');
      expect(result.server).toBe('hr');
      expect(result.data).toHaveProperty('status', 'success');
    });

    it('should auto-paginate when hasMore is true', async () => {
      mockAxios
        .onPost('http://hr/query', { query: 'list employees', userContext: expect.any(Object) })
        .replyOnce(200, {
          status: 'success',
          data: [{ id: 1 }, { id: 2 }],
          metadata: { hasMore: true, nextCursor: 'page2' },
        })
        .onPost('http://hr/query', { query: 'list employees', userContext: expect.any(Object), cursor: 'page2' })
        .replyOnce(200, {
          status: 'success',
          data: [{ id: 3 }, { id: 4 }],
          metadata: { hasMore: false },
        });

      const result = await client.query(server, 'list employees', userContext);

      expect(result.status).toBe('success');
      const data = result.data as any;
      expect(data.data).toHaveLength(4);
      expect(data.metadata.pagesRetrieved).toBe(2);
    });

    it('should return timeout status on slow response', async () => {
      mockAxios.onPost('http://hr/query').timeout();

      const result = await client.query(server, 'slow query', userContext);

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('did not respond within');
    });

    it('should return error status on network failure', async () => {
      mockAxios.onPost('http://hr/query').networkError();

      const result = await client.query(server, 'bad query', userContext);

      expect(result.status).toBe('error');
      expect(result.error).toBeTruthy();
    });
  });
});
```

**Coverage Target**: 85% (complex pagination logic, timeout edge cases may be hard to cover)

---

#### 2.3 Claude Client Service
**File**: `src/ai/claude-client.ts`
**Lines**: 449-499 (51 lines)
**Complexity**: High
**Testing**: 90% coverage target

```typescript
// src/ai/claude-client.ts
import Anthropic from '@anthropic-ai/sdk';
import { Logger } from 'winston';
import { UserContext } from '../auth/jwt-validator';

export interface ClaudeClientConfig {
  apiKey: string;
  model: string;
}

/**
 * Claude AI Client Service
 * Handles communication with Anthropic Claude API
 */
export class ClaudeClient {
  private anthropic: Anthropic;

  constructor(
    private config: ClaudeClientConfig,
    private logger: Logger
  ) {
    this.anthropic = new Anthropic({ apiKey: config.apiKey });
  }

  /**
   * Send query to Claude with MCP data context
   */
  async query(
    userQuery: string,
    mcpData: Array<{ server: string; data: unknown }>,
    userContext: UserContext,
    options: {
      paginationHints?: string[];
      truncationWarnings?: string[];
    } = {}
  ): Promise<string> {
    const { paginationHints = [], truncationWarnings = [] } = options;

    // Build context from MCP data
    const dataContext = mcpData
      .filter((d) => d.data !== null)
      .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
      .join('\n\n');

    // Build pagination instructions
    let paginationInstructions = '';
    if (paginationHints.length > 0) {
      paginationInstructions = `\n\nPAGINATION INFO: More data is available. ${paginationHints.join(' ')} You MUST inform the user that they are viewing a partial result set.`;
    }

    const systemPrompt = this.buildSystemPrompt(
      userContext,
      dataContext,
      paginationInstructions,
      truncationWarnings
    );

    const message = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userQuery,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === 'text');
    return textContent?.text || 'No response generated.';
  }

  /**
   * Stream query to Claude with SSE (for long-running queries)
   */
  async *queryStream(
    userQuery: string,
    mcpData: Array<{ server: string; data: unknown }>,
    userContext: UserContext,
    options: {
      paginationHints?: string[];
      truncationWarnings?: string[];
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const { paginationHints = [], truncationWarnings = [] } = options;

    const dataContext = mcpData
      .filter((d) => d.data !== null)
      .map((d) => `[Data from ${d.server}]:\n${JSON.stringify(d.data, null, 2)}`)
      .join('\n\n');

    let paginationInstructions = '';
    if (paginationHints.length > 0) {
      paginationInstructions = `\n\nPAGINATION INFO: More data is available. ${paginationHints.join(' ')}`;
    }

    const systemPrompt = this.buildSystemPrompt(
      userContext,
      dataContext,
      paginationInstructions,
      truncationWarnings
    );

    const stream = await this.anthropic.messages.stream({
      model: this.config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userQuery,
        },
      ],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  private buildSystemPrompt(
    userContext: UserContext,
    dataContext: string,
    paginationInstructions: string,
    truncationWarnings: string[]
  ): string {
    return `You are an AI assistant for Tamshai Corp, a family investment management organization.
You have access to enterprise data based on the user's role permissions.
The current user is "${userContext.username}" (email: ${userContext.email || 'unknown'}) with system roles: ${userContext.roles.join(', ')}.

IMPORTANT - User Identity Context:
- First, look for this user in the employee data to understand their position and department
- Use their employee record to determine who their team members or direct reports are
- If the user asks about "my team" or "my employees", find the user in the data first, then find employees who report to them

When answering questions:
1. Only use the data provided in the context below
2. If the data doesn't contain information to answer the question, say so
3. Never make up or infer sensitive information not in the data
4. Be concise and professional
5. If asked about data you don't have access to, explain that the user's role doesn't have permission
6. When asked about "my team", first identify the user in the employee data, then find their direct reports${paginationInstructions}${truncationWarnings.length > 0 ? '\n\n' + truncationWarnings.join('\n') : ''}

Available data context:
${dataContext || 'No relevant data available for this query.'}`;
  }
}
```

**Tests**: `src/ai/claude-client.test.ts`
```typescript
import { ClaudeClient } from './claude-client';
import { createMockLogger } from '../test-utils/mock-logger';
import Anthropic from '@anthropic-ai/sdk';

jest.mock('@anthropic-ai/sdk');

describe('ClaudeClient', () => {
  let client: ClaudeClient;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAnthropicCreate: jest.Mock;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAnthropicCreate = jest.fn();

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate,
        stream: jest.fn(),
      },
    } as any));

    client = new ClaudeClient(
      { apiKey: 'test-key', model: 'claude-sonnet-4' },
      mockLogger
    );
  });

  describe('query', () => {
    it('should send query with MCP data context', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Alice is VP of HR' }],
      });

      const result = await client.query(
        'Who is Alice?',
        [{ server: 'hr', data: { employee_id: '123', name: 'Alice', title: 'VP of HR' } }],
        { userId: 'u1', username: 'bob', email: 'bob@test.com', roles: ['hr-read'], groups: [] }
      );

      expect(result).toBe('Alice is VP of HR');
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4',
          max_tokens: 4096,
          messages: [{ role: 'user', content: 'Who is Alice?' }],
          system: expect.stringContaining('Alice'),
        })
      );
    });

    it('should include pagination warnings in system prompt', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Showing first 50 employees' }],
      });

      await client.query(
        'List all employees',
        [{ server: 'hr', data: [] }],
        { userId: 'u1', username: 'bob', email: 'bob@test.com', roles: ['hr-read'], groups: [] },
        { paginationHints: ['More data available via cursor'] }
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('PAGINATION INFO'),
        })
      );
    });

    it('should include truncation warnings in system prompt', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Limited results' }],
      });

      await client.query(
        'List all employees',
        [{ server: 'hr', data: [] }],
        { userId: 'u1', username: 'bob', email: 'bob@test.com', roles: ['hr-read'], groups: [] },
        { truncationWarnings: ['TRUNCATION WARNING: Only 50 of 100+ records returned'] }
      );

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('TRUNCATION WARNING'),
        })
      );
    });

    it('should return default message when no text content', async () => {
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'tool_use', name: 'calculator' }],
      });

      const result = await client.query(
        'Calculate',
        [],
        { userId: 'u1', username: 'bob', email: 'bob@test.com', roles: [], groups: [] }
      );

      expect(result).toBe('No response generated.');
    });
  });
});
```

**Coverage Target**: 90% (mocking Anthropic SDK is straightforward)

---

### Phase 3: Extract Middleware & Routes (Week 3)

**Goal**: Separate routing logic from business logic

#### 3.1 Authentication Middleware
**File**: `src/middleware/auth.middleware.ts`
**Lines**: 621-665 (45 lines)
**Complexity**: High
**Testing**: 90% coverage target

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Logger } from 'winston';
import { JWTValidator, UserContext } from '../auth/jwt-validator';
import { isTokenRevoked } from '../utils/redis';

// Extend Express Request with userContext
export interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}

/**
 * Authentication middleware factory
 * Returns Express middleware that validates JWT tokens
 */
export function createAuthMiddleware(
  validator: JWTValidator,
  logger: Logger
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token as string | undefined;

    let token: string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (tokenFromQuery) {
      // DEPRECATED: Query param tokens logged in URLs
      token = tokenFromQuery;
      logger.warn('Token passed via query parameter (deprecated)', {
        path: req.path,
        method: req.method,
      });
    } else {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    try {
      const userContext = await validator.validate(token);

      // Check token revocation
      const payload = jwt.decode(token) as jwt.JwtPayload;
      if (payload?.jti && await isTokenRevoked(payload.jti)) {
        logger.warn('Revoked token attempted', { jti: payload.jti, userId: userContext.userId });
        res.status(401).json({ error: 'Token has been revoked' });
        return;
      }

      (req as AuthenticatedRequest).userContext = userContext;
      next();
    } catch (error) {
      logger.error('Token validation failed:', error);
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}
```

**Tests**: `src/middleware/auth.middleware.test.ts`
```typescript
import { createAuthMiddleware } from './auth.middleware';
import { JWTValidator } from '../auth/jwt-validator';
import { createMockLogger } from '../test-utils/mock-logger';
import { Request, Response } from 'express';

describe('Auth Middleware', () => {
  let middleware: ReturnType<typeof createAuthMiddleware>;
  let mockValidator: jest.Mocked<JWTValidator>;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    mockValidator = {
      validate: jest.fn(),
    } as any;
    mockLogger = createMockLogger();
    middleware = createAuthMiddleware(mockValidator, mockLogger);

    req = {
      headers: {},
      query: {},
      path: '/api/test',
      method: 'GET',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('should extract token from Authorization header', async () => {
    req.headers = { authorization: 'Bearer valid-token' };
    mockValidator.validate.mockResolvedValue({
      userId: 'u1',
      username: 'alice',
      email: 'alice@test.com',
      roles: ['hr-read'],
      groups: [],
    });

    await middleware(req as Request, res as Response, next);

    expect(mockValidator.validate).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalled();
  });

  it('should extract token from query param with warning', async () => {
    req.query = { token: 'query-token' };
    mockValidator.validate.mockResolvedValue({
      userId: 'u1',
      username: 'alice',
      email: 'alice@test.com',
      roles: [],
      groups: [],
    });

    await middleware(req as Request, res as Response, next);

    expect(mockValidator.validate).toHaveBeenCalledWith('query-token');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Token passed via query parameter (deprecated)',
      expect.any(Object)
    );
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when no token provided', async () => {
    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token validation fails', async () => {
    req.headers = { authorization: 'Bearer invalid-token' };
    mockValidator.validate.mockRejectedValue(new Error('Invalid signature'));

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });
});
```

**Coverage Target**: 90%

---

#### 3.2 Route Modules
**Files**:
- `src/routes/ai-query.routes.ts` (lines 677-765)
- `src/routes/streaming.routes.ts` (lines 786-1039)
- `src/routes/confirmation.routes.ts` (lines 1047-1155)
- `src/routes/mcp-proxy.routes.ts` (lines 1168-1418)

**Complexity**: Very High
**Testing**: 80% coverage target (integration tests cover routes better than unit tests)

**Example**: `src/routes/ai-query.routes.ts`
```typescript
// src/routes/ai-query.routes.ts
import { Router, Request, Response } from 'express';
import { Logger } from 'winston';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { MCPClient } from '../mcp/client';
import { ClaudeClient } from '../ai/claude-client';
import { getAccessibleMCPServers, getDeniedMCPServers } from '../mcp/role-mapper';
import { scrubPII } from '../utils/pii-scrubber';
import { sanitizeForLog } from '../utils/gateway-utils';

/**
 * AI Query Routes
 * Handles non-streaming AI queries (deprecated in favor of /api/query)
 */
export function createAIQueryRoutes(
  mcpClient: MCPClient,
  claudeClient: ClaudeClient,
  logger: Logger
): Router {
  const router = Router();

  router.post('/ai/query', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const userContext = (req as AuthenticatedRequest).userContext!;
    const { query, conversationId } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    logger.info('AI Query received', {
      requestId,
      username: sanitizeForLog(userContext.username),
      query: scrubPII(query.substring(0, 100)),
      roles: userContext.roles,
    });

    try {
      const accessibleServers = getAccessibleMCPServers(userContext.roles);
      const deniedServers = getDeniedMCPServers(userContext.roles);

      // Query all accessible MCP servers in parallel
      const mcpPromises = accessibleServers.map((server) =>
        mcpClient.query(server, query, userContext)
      );
      const mcpResults = await Promise.all(mcpPromises);

      const successfulResults = mcpResults.filter((r) => r.status === 'success');
      const failedResults = mcpResults.filter((r) => r.status !== 'success');

      if (failedResults.length > 0) {
        logger.warn('Partial response', {
          requestId,
          failed: failedResults.map((r) => r.server),
          successful: successfulResults.map((r) => r.server),
        });
      }

      // Send to Claude
      const aiResponse = await claudeClient.query(
        query,
        successfulResults.map(r => ({ server: r.server, data: r.data })),
        userContext
      );

      const durationMs = Date.now() - startTime;

      logger.info('AI query completed', {
        requestId,
        userId: userContext.userId,
        durationMs,
      });

      res.json({
        requestId,
        conversationId: conversationId || crypto.randomUUID(),
        response: aiResponse,
        status: failedResults.length > 0 ? 'partial' : 'success',
        metadata: {
          dataSourcesQueried: successfulResults.map((r) => r.server),
          dataSourcesFailed: failedResults.map((r) => r.server),
          processingTimeMs: durationMs,
        },
      });
    } catch (error) {
      logger.error('AI query error:', error);
      res.status(500).json({
        error: 'Failed to process AI query',
        requestId,
      });
    }
  });

  return router;
}
```

**Tests**: Integration tests are more appropriate for routes (see Phase 4)

---

### Phase 4: Write Comprehensive Tests (Week 4)

**Goal**: Achieve 70%+ overall coverage

#### 4.1 Unit Test Coverage
- Config module: 95%+
- Role mapper: 100%
- JWT validator: 90%+
- MCP client: 85%+
- Claude client: 90%+
- Auth middleware: 90%+

#### 4.2 Integration Test Coverage
- Full authentication flow (Keycloak → Gateway → MCP)
- AI query with multiple MCP servers
- SSE streaming with pagination
- Confirmation workflow
- Token revocation
- GDPR endpoints

**Example**: `tests/integration/ai-query.test.ts`
```typescript
import request from 'supertest';
import app from '../../src/index';
import { getKeycloakToken } from '../helpers/keycloak';
import { setupMCPMocks } from '../helpers/mcp-mocks';

describe('AI Query Integration', () => {
  let token: string;

  beforeAll(async () => {
    token = await getKeycloakToken('alice.chen', 'password');
  });

  beforeEach(() => {
    setupMCPMocks();
  });

  it('should query accessible MCP servers and return AI response', async () => {
    const response = await request(app)
      .post('/api/ai/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List all employees in Engineering' })
      .expect(200);

    expect(response.body).toHaveProperty('response');
    expect(response.body).toHaveProperty('requestId');
    expect(response.body.metadata.dataSourcesQueried).toContain('hr');
  });

  it('should deny access to MCP servers user lacks permissions for', async () => {
    const internToken = await getKeycloakToken('frank.davis', 'password');

    const response = await request(app)
      .post('/api/ai/query')
      .set('Authorization', `Bearer ${internToken}`)
      .send({ query: 'Show me all salaries' })
      .expect(200);

    expect(response.body.metadata.dataSourcesFailed).toContain('finance');
  });
});
```

---

## Migration Strategy

### Step 1: Extract Without Breaking (Week 1)
1. Create new module files (config, role-mapper)
2. Export functions from index.ts to new modules
3. Import new modules back into index.ts
4. **Run all tests** - must pass
5. **Deploy to staging** - verify no regressions

### Step 2: Inject Dependencies (Week 2)
1. Convert services to classes (JWTValidator, MCPClient, ClaudeClient)
2. Use dependency injection pattern
3. Update index.ts to instantiate services
4. **Run all tests** - must pass
5. **Deploy to staging**

### Step 3: Extract Routes (Week 3)
1. Create route modules
2. Move handlers from index.ts to route files
3. Mount routes in index.ts
4. **Run all tests** - must pass
5. **Deploy to staging**

### Step 4: Remove Dead Code (Week 4)
1. Delete extracted code from index.ts
2. Verify index.ts only contains:
   - Imports
   - Service instantiation
   - Route mounting
   - Server startup
3. **Final coverage report** - should be 70%+
4. **Deploy to production**

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| index.ts LOC | 1,533 | <200 |
| Overall Coverage | 31% | 70%+ |
| MCP Gateway Coverage | 49.06% | 85%+ |
| Avg Function Length | 50+ lines | <20 lines |
| Cyclomatic Complexity | High | Low |
| Test Execution Time | ~5s | <10s |

---

## Risks & Mitigation

### Risk 1: Breaking Changes
**Mitigation**:
- Incremental refactoring with tests after each step
- Feature flags for new code paths
- Staging deployment before production

### Risk 2: Test Coverage Drop During Refactor
**Mitigation**:
- Write tests BEFORE extracting code
- Use Codecov diff coverage (90% on new code)
- Block PRs that decrease coverage

### Risk 3: Time Overrun
**Mitigation**:
- Prioritize high-impact modules (JWT, MCP client)
- Can ship Phase 1 & 2 alone for 50%+ coverage gain
- Phase 3 & 4 are bonus improvements

---

## Next Steps

1. **Review Plan**: Team review this document (1 day)
2. **Setup Test Helpers**: Create mock factories for Keycloak, MCP, Claude (2 days)
3. **Start Phase 1**: Extract config and role-mapper modules (3 days)
4. **Iterate**: Deploy to staging, measure coverage, continue to Phase 2

---

## ADDENDUM: Review #1 Feedback (Critical Issues)

**Reviewer**: Technical Lead
**Date**: 2025-12-30
**Status**: 🚨 **CRITICAL FIXES REQUIRED BEFORE STARTING**

### Issue #1: 🔴 JWKS Client Performance Trap (CRITICAL)

**Problem Identified**:
The proposed `JWTValidator` class initializes `jwks-rsa` client in the constructor:

```typescript
export class JWTValidator {
  private jwksClient: JwksClient;

  constructor(private config: JWTValidatorConfig, private logger: Logger) {
    this.jwksClient = jwksRsa({
      jwksUri: config.jwksUri,
      cache: true,
      rateLimit: true,
    });
  }
}
```

**If** this class is instantiated per-request (e.g., `new JWTValidator(...)` inside middleware), it will:
- ❌ Bypass the JWKS signing key cache
- ❌ Make a network request to Keycloak **on every API call**
- ❌ Cause rate-limiting or 10x+ latency increase

**Current Implementation** (index.ts lines 182-186):
```typescript
// CORRECT: Global singleton
const jwksClient = jwksRsa({
  jwksUri: config.keycloak.jwksUri || `...`,
  cache: true,
  rateLimit: true,
});
```

**Root Cause**: The current code uses a **module-level singleton** that persists across requests. The proposed refactor moves this into a class, but if not instantiated correctly, creates a new JWKS client per request.

**REQUIRED FIX**:

**1. Ensure Singleton Instantiation at Server Startup**

```typescript
// src/index.ts or src/app.ts
import { JWTValidator } from './auth/jwt-validator';
import { createAuthMiddleware } from './middleware/auth.middleware';

// ✅ CORRECT: Create validator ONCE at startup
const jwtValidator = new JWTValidator(
  {
    jwksUri: config.keycloak.jwksUri || `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
    issuer: config.keycloak.issuer || `${config.keycloak.url}/realms/${config.keycloak.realm}`,
    audience: [config.keycloak.clientId, 'account'],
  },
  logger
);

// ✅ CORRECT: Pass singleton instance to middleware factory
const authMiddleware = createAuthMiddleware(jwtValidator, logger);

// ✅ CORRECT: Use the middleware
app.use('/api/*', authMiddleware);
```

**2. Update Middleware to Accept Validator Instance**

```typescript
// src/middleware/auth.middleware.ts
export function createAuthMiddleware(
  validator: JWTValidator,  // Accept pre-instantiated validator
  logger: Logger
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ... extract token ...

    const userContext = await validator.validate(token);  // Use singleton

    // ... rest of middleware ...
  };
}
```

**3. Add Warning Comment in JWTValidator**

```typescript
// src/auth/jwt-validator.ts
/**
 * JWT Validator Service
 *
 * ⚠️ CRITICAL: This class MUST be instantiated as a singleton at server startup.
 * Do NOT create new instances per-request or you will bypass JWKS caching.
 *
 * Correct usage:
 *   const validator = new JWTValidator(config, logger); // Once at startup
 *   app.use(createAuthMiddleware(validator, logger));
 *
 * Incorrect usage:
 *   app.use((req, res, next) => {
 *     const validator = new JWTValidator(...); // ❌ Creates new client per request!
 *   });
 */
export class JWTValidator {
  private jwksClient: JwksClient;
  // ...
}
```

**Testing the Fix**:
```typescript
// src/auth/jwt-validator.test.ts
describe('JWTValidator Singleton Behavior', () => {
  it('should reuse same jwksClient instance across multiple validations', async () => {
    const validator = new JWTValidator(config, logger);

    // Spy on jwksClient.getSigningKey to verify caching
    const getSigningKeySpy = jest.spyOn(validator['jwksClient'], 'getSigningKey');

    // First validation - should fetch key
    await validator.validate(token1);
    expect(getSigningKeySpy).toHaveBeenCalledTimes(1);

    // Second validation with same kid - should use cache
    await validator.validate(token2);
    expect(getSigningKeySpy).toHaveBeenCalledTimes(1); // Still 1, not 2
  });
});
```

---

### Issue #2: 🟡 Streaming Logic Gap (Missing Phase)

**Problem Identified**:
The plan ends at `ClaudeClient` but doesn't address the most complex code: `handleStreamingQuery` (lines 786-1039, 253 lines).

This function mixes:
- Business logic (calling Claude, checking pagination)
- Transport logic (writing `res.write('data: ...')`)
- Error handling (timeouts, abort signals)

**Current Code Structure** (index.ts:786-979):
```typescript
async function handleStreamingQuery(req, res, query, cursor) {
  // Business logic
  const mcpResults = await Promise.all(mcpPromises);

  // Transport logic mixed in
  res.setHeader('Content-Type', 'text/event-stream');
  res.write(`data: ${JSON.stringify(...)}\n\n`);

  // Claude streaming
  const stream = await anthropic.messages.stream(...);
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
```

**Problem**: Hard to unit test because it requires mocking Express `Response` object with `res.write()`.

**REQUIRED FIX**: Extract to AsyncGenerator Pattern

**New Phase 2.5: Streaming Service**

**File**: `src/ai/streaming.service.ts`

```typescript
// src/ai/streaming.service.ts
import { Logger } from 'winston';
import { ClaudeClient } from './claude-client';
import { MCPClient } from '../mcp/client';
import { UserContext } from '../auth/jwt-validator';

export type StreamEvent =
  | { type: 'service_unavailable'; warnings: any[]; successfulServers: string[]; failedServers: string[] }
  | { type: 'text'; text: string }
  | { type: 'pagination'; hasMore: boolean; cursors: any[]; hint: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * Streaming Service
 *
 * Yields SSE events as an AsyncGenerator for easy unit testing.
 * The transport layer (Express controller) loops over this and writes to res.
 */
export class StreamingService {
  constructor(
    private mcpClient: MCPClient,
    private claudeClient: ClaudeClient,
    private logger: Logger
  ) {}

  /**
   * Execute streaming query and yield SSE events
   *
   * ✅ TESTABLE: No Express Response object needed!
   */
  async *executeQuery(
    query: string,
    userContext: UserContext,
    accessibleServers: any[],
    cursor?: string
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const requestId = crypto.randomUUID();

    try {
      // Query MCP servers
      const mcpPromises = accessibleServers.map((server) =>
        this.mcpClient.query(server, query, userContext, { cursor })
      );
      const mcpResults = await Promise.all(mcpPromises);

      // Separate successful/failed results
      const successfulResults = mcpResults.filter((r) => r.status === 'success');
      const failedResults = mcpResults.filter((r) => r.status !== 'success');

      // Yield service unavailability warnings
      if (failedResults.length > 0) {
        yield {
          type: 'service_unavailable',
          warnings: failedResults.map((r) => ({
            server: r.server,
            code: r.status === 'timeout' ? 'TIMEOUT' : 'ERROR',
            message: r.error || 'Service error',
          })),
          successfulServers: successfulResults.map((r) => r.server),
          failedServers: failedResults.map((r) => r.server),
        };
      }

      // Extract pagination/truncation metadata
      const paginationInfo = this.extractPaginationInfo(mcpResults);
      const truncationWarnings = this.extractTruncationWarnings(mcpResults, requestId);

      // Stream Claude response
      const dataContext = successfulResults.map((r) => ({ server: r.server, data: r.data }));

      for await (const text of this.claudeClient.queryStream(
        query,
        dataContext,
        userContext,
        {
          paginationHints: paginationInfo.map((p) => p.hint).filter(Boolean),
          truncationWarnings,
        }
      )) {
        yield { type: 'text', text };
      }

      // Yield pagination metadata
      if (paginationInfo.length > 0) {
        yield {
          type: 'pagination',
          hasMore: true,
          cursors: paginationInfo.map((p) => ({ server: p.server, cursor: p.nextCursor })),
          hint: 'More data available. Request next page to continue.',
        };
      }

      // Yield completion
      yield { type: 'done' };
    } catch (error) {
      this.logger.error('Streaming query error:', error);
      yield { type: 'error', message: 'Failed to process query' };
      yield { type: 'done' };
    }
  }

  private extractPaginationInfo(mcpResults: any[]): any[] {
    return mcpResults
      .filter((r) => {
        const mcpResponse = r.data;
        return mcpResponse?.status === 'success' && mcpResponse.metadata?.hasMore;
      })
      .map((r) => ({
        server: r.server,
        hasMore: r.data.metadata.hasMore,
        nextCursor: r.data.metadata.nextCursor,
        hint: r.data.metadata.hint,
      }));
  }

  private extractTruncationWarnings(mcpResults: any[], requestId: string): string[] {
    const warnings: string[] = [];
    mcpResults.forEach((result) => {
      const mcpResponse = result.data;
      if (mcpResponse?.status === 'success' && mcpResponse.metadata?.truncated) {
        const returnedCount = mcpResponse.metadata.returnedCount || 50;
        warnings.push(
          `TRUNCATION WARNING: Data from ${result.server} returned only ${returnedCount} of ${returnedCount}+ records. ` +
          `You MUST inform the user that results are incomplete.`
        );
        this.logger.info('Truncation detected', {
          requestId,
          server: result.server,
          returnedCount,
        });
      }
    });
    return warnings;
  }
}
```

**New Transport Layer** (Express Controller):

```typescript
// src/routes/streaming.routes.ts
import { Router, Request, Response } from 'express';
import { StreamingService } from '../ai/streaming.service';
import { getAccessibleMCPServers } from '../mcp/role-mapper';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export function createStreamingRoutes(streamingService: StreamingService): Router {
  const router = Router();

  router.post('/query', async (req: Request, res: Response) => {
    const userContext = (req as AuthenticatedRequest).userContext!;
    const { query, cursor } = req.body;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const accessibleServers = getAccessibleMCPServers(userContext.roles);

    // Loop over generator and write to response
    for await (const event of streamingService.executeQuery(query, userContext, accessibleServers, cursor)) {
      if (event.type === 'done') {
        res.write('data: [DONE]\n\n');
        break;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.end();
  });

  return router;
}
```

**Unit Tests** (Easy to Test!):

```typescript
// src/ai/streaming.service.test.ts
import { StreamingService } from './streaming.service';

describe('StreamingService', () => {
  let service: StreamingService;
  let mockMCPClient: jest.Mocked<MCPClient>;
  let mockClaudeClient: jest.Mocked<ClaudeClient>;

  beforeEach(() => {
    mockMCPClient = createMockMCPClient();
    mockClaudeClient = createMockClaudeClient();
    service = new StreamingService(mockMCPClient, mockClaudeClient, mockLogger);
  });

  it('should yield text events from Claude stream', async () => {
    mockMCPClient.query.mockResolvedValue({
      status: 'success',
      server: 'hr',
      data: { employees: [] },
    });

    // Mock Claude streaming response
    mockClaudeClient.queryStream = jest.fn(async function* () {
      yield 'Hello ';
      yield 'World';
    });

    const events: any[] = [];
    for await (const event of service.executeQuery('test query', userContext, [hrServer])) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'World' },
      { type: 'done' },
    ]);
  });

  it('should yield service_unavailable for failed MCP servers', async () => {
    mockMCPClient.query.mockResolvedValueOnce({
      status: 'timeout',
      server: 'hr',
      data: null,
      error: 'Service did not respond',
    });

    const events: any[] = [];
    for await (const event of service.executeQuery('test query', userContext, [hrServer])) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: 'service_unavailable',
      warnings: [{ server: 'hr', code: 'TIMEOUT', message: 'Service did not respond' }],
      successfulServers: [],
      failedServers: ['hr'],
    });
  });

  it('should yield pagination event when hasMore is true', async () => {
    mockMCPClient.query.mockResolvedValue({
      status: 'success',
      server: 'hr',
      data: {
        status: 'success',
        data: [],
        metadata: { hasMore: true, nextCursor: 'page2', hint: 'Use cursor for next page' },
      },
    });

    const events: any[] = [];
    for await (const event of service.executeQuery('test query', userContext, [hrServer])) {
      events.push(event);
    }

    const paginationEvent = events.find((e) => e.type === 'pagination');
    expect(paginationEvent).toEqual({
      type: 'pagination',
      hasMore: true,
      cursors: [{ server: 'hr', cursor: 'page2' }],
      hint: 'More data available. Request next page to continue.',
    });
  });
});
```

**Coverage**: 95%+ (no Express mocking needed!)

---

### Issue #3: 🟡 Integration Test Gap

**Problem Identified**:
The plan focuses heavily on unit tests (mocking everything) but lacks integration tests to catch "wiring issues":
- Did I forget to export a module?
- Did I pass the wrong config?
- Are all services connected correctly?

**REQUIRED FIX**: Add Integration Test Suite

**File**: `tests/integration/happy-path.test.ts`

```typescript
// tests/integration/happy-path.test.ts
import request from 'supertest';
import app from '../../src/index';  // Actual Express app
import { setupKeycloakMock, getKeycloakToken } from '../helpers/keycloak-mock';
import { setupMCPMocks } from '../helpers/mcp-mock';

/**
 * Happy Path Integration Test
 *
 * Purpose: Verify the entire stack works end-to-end
 * - Boots the real Express app
 * - Mocks external services (Keycloak, MCP servers)
 * - Sends real HTTP requests
 * - Verifies correct responses
 */
describe('Happy Path Integration', () => {
  beforeAll(() => {
    setupKeycloakMock();  // Mock Keycloak JWKS endpoint
    setupMCPMocks();      // Mock MCP server responses
  });

  it('should process AI query with all services wired correctly', async () => {
    const token = await getKeycloakToken('alice.chen', 'hr-read');

    const response = await request(app)
      .post('/api/ai/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List all employees in Engineering' })
      .expect(200);

    expect(response.body).toMatchObject({
      requestId: expect.any(String),
      conversationId: expect.any(String),
      response: expect.stringContaining('Engineering'),
      status: 'success',
      metadata: {
        dataSourcesQueried: expect.arrayContaining(['hr']),
        processingTimeMs: expect.any(Number),
      },
    });
  });

  it('should handle missing token with 401', async () => {
    await request(app)
      .post('/api/ai/query')
      .send({ query: 'test' })
      .expect(401);
  });

  it('should handle invalid token with 401', async () => {
    await request(app)
      .post('/api/ai/query')
      .set('Authorization', 'Bearer invalid-token')
      .send({ query: 'test' })
      .expect(401);
  });

  it('should stream SSE response correctly', async () => {
    const token = await getKeycloakToken('alice.chen', 'hr-read');

    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Who is Alice?' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    // Verify SSE format
    const events = response.text.split('\n\n');
    expect(events[events.length - 1]).toContain('[DONE]');
  });
});
```

**Why This Matters**:
- Unit tests can pass even if the app doesn't boot
- Integration tests catch DI misconfigurations
- Verifies routes are mounted correctly
- Ensures middleware order is correct

---

## Updated Migration Timeline

| Phase | Original Plan | Updated Plan |
|-------|---------------|--------------|
| **1** | Extract config, role-mapper | ✅ No changes |
| **2** | Extract JWT, MCP, Claude services | ✅ **+ Add singleton warnings** |
| **2.5** | _(Not in original)_ | 🆕 **Extract StreamingService with AsyncGenerator** |
| **3** | Extract middleware & routes | ✅ **+ Update to use StreamingService** |
| **4** | Write comprehensive tests | ✅ **+ Add integration test suite** |

**New Timeline**: 5 weeks (was 4 weeks)
- Week 1: Phase 1 (Pure functions)
- Week 2: Phase 2 (Services with singleton pattern)
- Week 3: Phase 2.5 (Streaming service refactor)
- Week 4: Phase 3 (Routes & middleware)
- Week 5: Phase 4 (Comprehensive tests + integration tests)

---

## Critical Checklist Before Starting

Before starting the refactoring, ensure:

- [ ] **Singleton Pattern**: All services (JWTValidator, MCPClient, ClaudeClient, StreamingService) instantiated ONCE at server startup
- [ ] **AsyncGenerator Pattern**: Streaming logic extracted to `StreamingService.executeQuery()` that yields events
- [ ] **Integration Tests**: At least one "happy path" test that boots the full app
- [ ] **Performance Baseline**: Measure current JWKS cache hit rate (should be >95% in production)
- [ ] **Coverage Baseline**: Confirm starting coverage is 31% overall, 49.06% on mcp-gateway

---

**Last Updated**: 2025-12-30 (Revised)
**Author**: Claude (Anthropic)
**Reviewers**: Technical Lead (Review #1 - Critical fixes applied)
