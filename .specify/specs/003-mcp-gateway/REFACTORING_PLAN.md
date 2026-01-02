# MCP Gateway Refactoring Plan
## Breaking Up index.ts for Improved Test Coverage

**Status**: **IN PROGRESS** - Phase 1 & 2 Complete, Phase 3 & 4 Remaining
**Current Coverage**: 49.06% on services/mcp-gateway (374 tests passing)
**Target Coverage**: 70% overall (90% diff coverage on new code)
**File Size**: index.ts - 1,533 lines → target <200 lines

---

## Implementation Status (Updated 2026-01-02)

### Completed Modules ✅

| Module | File | Tests | Coverage | Notes |
|--------|------|-------|----------|-------|
| Config | `src/config/index.ts` | 19 tests | 95%+ | Includes `safeParseInt` (ADDENDUM #5) |
| Role Mapper | `src/mcp/role-mapper.ts` | ✅ | 100% | Pure functions |
| JWT Validator | `src/auth/jwt-validator.ts` | 19 tests | 95%+ | DI for jwksClient (ADDENDUM #5) |
| MCP Client | `src/mcp/mcp-client.ts` | ✅ | 85%+ | Pagination, timeouts |
| Claude Client | `src/ai/claude-client.ts` | ✅ | 90%+ | Streaming support |
| Mock Factories | `src/test-utils/*` | N/A | N/A | mock-logger, mock-user-context, mock-mcp-server |

### ADDENDUM #5 Fixes Applied ✅

| Issue | Status | Implementation |
|-------|--------|----------------|
| Client roles regression | ✅ Fixed | Merges `realm_access` + `resource_access[clientId]` |
| JWKS client DI | ✅ Fixed | Optional `jwksClient` param in constructor |
| Safe parseInt | ✅ Fixed | `safeParseInt()` returns default on NaN |

### Remaining Work

| Phase | Task | Status | Priority |
|-------|------|--------|----------|
| Phase 3 | Extract streaming routes | Pending | High |
| Phase 3 | Extract auth middleware | Pending | High |
| Phase 3 | SSE heartbeat (ADDENDUM #6) | Pending | **Critical** |
| Phase 4 | Graceful shutdown | Pending | High |
| Phase 4 | Wire up extracted modules in index.ts | Pending | High |
| Phase 4 | Type coverage CI enforcement | Pending | Medium |

### Test Results (Local)

```
Test Suites: 15 passed
Tests:       374 passed
Time:        8.394s
```

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

### Phase 1: Extract Pure Functions ✅ COMPLETE

**Goal**: Extract logic with no side effects - easiest to test
**Status**: ✅ Complete (2026-01-02)

#### 1.1 Configuration Module ✅
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

#### 1.2 Role Mapping Module ✅
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

### Phase 2: Extract Stateful Services ✅ COMPLETE

**Goal**: Extract services with external dependencies - use dependency injection for testability
**Status**: ✅ Complete (2026-01-02) - All ADDENDUM #5 fixes applied

#### 2.1 JWT Validator Service ✅
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

#### 2.2 MCP Client Service ✅
**File**: `src/mcp/mcp-client.ts` (actual implementation)
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

#### 2.3 Claude Client Service ✅
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

### Phase 3: Extract Middleware & Routes ⏳ NEXT

**Goal**: Separate routing logic from business logic
**Status**: ⏳ Pending - Blocked by Keycloak CI work
**Critical**: Must implement SSE heartbeat (ADDENDUM #6)

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

### Phase 4: Integration & Final Cleanup ⏳ PENDING

**Goal**: Achieve 70%+ overall coverage, wire up modules, graceful shutdown
**Status**: ⏳ Pending - After Phase 3

#### 4.1 Unit Test Coverage (Partially Done)
- ✅ Config module: 95%+ (19 tests)
- ✅ Role mapper: 100%
- ✅ JWT validator: 90%+ (19 tests)
- ✅ MCP client: 85%+
- ✅ Claude client: 90%+
- ⏳ Auth middleware: Pending (Phase 3)
- ⏳ Streaming routes: Pending (Phase 3)

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

---

## ADDENDUM #2: Review #2 Feedback (QA/Testing Enhancements)

**Reviewer**: Principal SDET (QA Lead)
**Date**: 2025-12-30
**Status**: ✅ **APPROVED WITH REVISIONS**

**Summary**: Plan is solid with excellent DI patterns and incremental migration strategy. Requires enhancements to integration test strategy, mock factory definitions, and coverage metrics alignment.

---

### Must-Have Change #1: 🟢 SSE Integration Test Scenarios

**Problem Identified**:
The plan mentions "SSE streaming tests" but doesn't specify which scenarios to test. SSE streaming is 253 lines of very high complexity code that requires comprehensive integration testing.

**Required Addition**: Specific SSE integration test cases

**File**: `tests/integration/sse-streaming.test.ts`

```typescript
// tests/integration/sse-streaming.test.ts
import request from 'supertest';
import app from '../../src/index';
import { getKeycloakToken } from '../helpers/keycloak-mock';
import { setupMCPMocks } from '../helpers/mcp-mock';

/**
 * SSE Streaming Integration Tests
 *
 * Covers 6 critical SSE flows from v1.4 architecture:
 * 1. Real-time streaming
 * 2. Client disconnect handling
 * 3. Pagination hints
 * 4. Truncation warnings
 * 5. Timeout handling
 * 6. Confirmation interrupts
 */
describe('SSE Streaming Integration', () => {
  let token: string;

  beforeAll(async () => {
    token = await getKeycloakToken('alice.chen', 'hr-read');
    setupMCPMocks();
  });

  /**
   * Test 1: Real-time streaming of AI responses
   * Verifies that SSE chunks arrive progressively, not all at once
   */
  it('should stream AI responses in real-time chunks', async () => {
    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List employees' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    // Parse SSE events
    const events = response.text.split('\n\n').filter(Boolean);

    // Should have multiple text chunks (not one big response)
    const textEvents = events.filter(e => e.includes('"type":"text"'));
    expect(textEvents.length).toBeGreaterThan(3); // Streaming, not batch

    // Should end with [DONE]
    expect(events[events.length - 1]).toContain('[DONE]');

    // Should contain employee data
    expect(response.text).toContain('employee');
  });

  /**
   * Test 2: Client disconnect mid-stream
   * Verifies graceful handling when client closes connection
   */
  it('should handle client disconnect mid-stream without errors', async () => {
    const controller = new AbortController();

    // Start streaming request
    const promise = request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List all employees' })
      .signal(controller.signal);

    // Abort after 100ms (simulates client disconnect)
    setTimeout(() => controller.abort(), 100);

    // Should not throw or crash server
    await expect(promise).rejects.toThrow(); // Request aborted, but no server error

    // Verify server is still healthy
    await request(app).get('/health').expect(200);
  });

  /**
   * Test 3: Pagination hints in streamed response
   * Verifies v1.4 pagination metadata is included
   */
  it('should include pagination hints in streamed response', async () => {
    // Mock MCP server returns hasMore=true
    setupMCPMocks({ hasMore: true, nextCursor: 'page2' });

    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List employees' })
      .expect(200);

    // Should include pagination event
    expect(response.text).toContain('"type":"pagination"');
    expect(response.text).toContain('"hasMore":true');
    expect(response.text).toContain('"nextCursor":"page2"');

    // AI should mention partial results (pagination instruction in system prompt)
    expect(response.text).toMatch(/partial|more data|additional/i);
  });

  /**
   * Test 4: Truncation warnings for partial data
   * Verifies v1.4 Article III.2 truncation warning injection
   */
  it('should inject truncation warnings for partial data', async () => {
    // Mock MCP server returns truncated=true
    setupMCPMocks({ truncated: true, returnedCount: 50 });

    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List all employees' })
      .expect(200);

    // AI must acknowledge truncation (warning in system prompt)
    expect(response.text).toMatch(/TRUNCATION WARNING|incomplete|only 50/i);
  });

  /**
   * Test 5: Timeout handling for slow MCP servers
   * Verifies v1.5 partial response degradation
   */
  it('should timeout slow MCP servers during streaming', async () => {
    // Mock MCP server with 10s delay (exceeds 5s read timeout)
    setupMCPMocks({ delay: 10000 });

    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List employees' })
      .expect(200);

    // Should include service_unavailable event
    expect(response.text).toContain('"type":"service_unavailable"');
    expect(response.text).toContain('"code":"TIMEOUT"');

    // Should still stream response with partial data
    expect(response.text).toContain('[DONE]');
  });

  /**
   * Test 6: Confirmation interrupts in streams
   * Verifies v1.4 HITL pending_confirmation handling
   */
  it('should handle confirmation interrupts in streams', async () => {
    const response = await request(app)
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'Delete employee 123' }) // Triggers confirmation
      .expect(200);

    // Should return pending_confirmation immediately (no Claude streaming)
    expect(response.text).toContain('"status":"pending_confirmation"');
    expect(response.text).toContain('"confirmationId"');
    expect(response.text).toContain('[DONE]');

    // Should NOT call Claude API
    expect(response.text).not.toContain('"type":"text"');
  });
});
```

**Coverage Target**: 6 critical SSE scenarios (100% of v1.4 streaming features)

---

### Must-Have Change #2: 🟢 Mock Factory Patterns

**Problem Identified**:
The plan mentions "Create mock factories" but doesn't show the pattern. This leads to test boilerplate duplication (10 lines per test instead of 1).

**Required Addition**: Test utility factories

**Directory**: `src/test-utils/`

**File 1**: `src/test-utils/mock-logger.ts`

```typescript
// src/test-utils/mock-logger.ts
import { Logger } from 'winston';

/**
 * Create a mock Winston logger for testing
 *
 * Usage:
 *   const logger = createMockLogger();
 *   const service = new MyService(logger);
 *   expect(logger.error).toHaveBeenCalledWith(...);
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    // Add other Logger methods as needed
  } as any as jest.Mocked<Logger>;
}
```

**File 2**: `src/test-utils/mock-mcp-server.ts`

```typescript
// src/test-utils/mock-mcp-server.ts
import { MCPServerConfig } from '../mcp/role-mapper';

/**
 * Create a mock MCP server configuration for testing
 *
 * Usage:
 *   const hrServer = createMockMCPServer({ name: 'hr', requiredRoles: ['hr-read'] });
 */
export function createMockMCPServer(
  overrides?: Partial<MCPServerConfig>
): MCPServerConfig {
  return {
    name: 'test-server',
    url: 'http://localhost:9999',
    requiredRoles: ['test-role'],
    description: 'Test MCP Server',
    ...overrides,
  };
}

/**
 * Create a set of standard test MCP servers
 */
export function createStandardMCPServers(): MCPServerConfig[] {
  return [
    createMockMCPServer({ name: 'hr', url: 'http://localhost:3101', requiredRoles: ['hr-read', 'executive'] }),
    createMockMCPServer({ name: 'finance', url: 'http://localhost:3102', requiredRoles: ['finance-read', 'executive'] }),
    createMockMCPServer({ name: 'sales', url: 'http://localhost:3103', requiredRoles: ['sales-read', 'executive'] }),
    createMockMCPServer({ name: 'support', url: 'http://localhost:3104', requiredRoles: ['support-read', 'executive'] }),
  ];
}
```

**File 3**: `src/test-utils/mock-user-context.ts`

```typescript
// src/test-utils/mock-user-context.ts
import { UserContext } from '../auth/jwt-validator';

/**
 * Create a mock user context for testing
 *
 * Usage:
 *   const alice = createMockUserContext({ username: 'alice', roles: ['hr-read', 'hr-write'] });
 *   const intern = createMockUserContext({ roles: ['intern'] });
 */
export function createMockUserContext(
  overrides?: Partial<UserContext>
): UserContext {
  return {
    userId: 'test-user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['hr-read'],
    groups: [],
    ...overrides,
  };
}

/**
 * Pre-defined user contexts for common test scenarios
 */
export const TEST_USERS = {
  hrManager: createMockUserContext({
    userId: 'alice-123',
    username: 'alice.chen',
    email: 'alice@tamshai.com',
    roles: ['hr-read', 'hr-write'],
    groups: ['/tamshai/hr'],
  }),
  executive: createMockUserContext({
    userId: 'eve-456',
    username: 'eve.thompson',
    email: 'eve@tamshai.com',
    roles: ['executive'],
    groups: ['/tamshai/executive'],
  }),
  intern: createMockUserContext({
    userId: 'frank-789',
    username: 'frank.davis',
    email: 'frank@tamshai.com',
    roles: ['intern'],
    groups: ['/tamshai/engineering'],
  }),
};
```

**File 4**: `src/test-utils/mock-mcp-client.ts`

```typescript
// src/test-utils/mock-mcp-client.ts
import { MCPClient, MCPQueryResult } from '../mcp/client';

/**
 * Create a mock MCP client for testing
 *
 * Usage:
 *   const mockClient = createMockMCPClient();
 *   mockClient.query.mockResolvedValue({ status: 'success', server: 'hr', data: {...} });
 */
export function createMockMCPClient(): jest.Mocked<MCPClient> {
  return {
    query: jest.fn().mockResolvedValue({
      status: 'success',
      server: 'test-server',
      data: { status: 'success', data: [] },
      durationMs: 100,
    } as MCPQueryResult),
  } as any as jest.Mocked<MCPClient>;
}
```

**File 5**: `src/test-utils/mock-claude-client.ts`

```typescript
// src/test-utils/mock-claude-client.ts
import { ClaudeClient } from '../ai/claude-client';

/**
 * Create a mock Claude client for testing
 */
export function createMockClaudeClient(): jest.Mocked<ClaudeClient> {
  return {
    query: jest.fn().mockResolvedValue('Test AI response'),
    queryStream: jest.fn().mockImplementation(async function* () {
      yield 'Test ';
      yield 'streaming ';
      yield 'response';
    }),
  } as any as jest.Mocked<ClaudeClient>;
}
```

**Usage Example** (Before vs After):

```typescript
// BEFORE: 15 lines of boilerplate per test
describe('MyService', () => {
  it('should do something', () => {
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;
    const userContext = {
      userId: 'test-123',
      username: 'test',
      email: 'test@test.com',
      roles: ['hr-read'],
      groups: [],
    };
    const service = new MyService(mockLogger);
    // ... test logic
  });
});

// AFTER: 3 lines total
describe('MyService', () => {
  it('should do something', () => {
    const service = new MyService(createMockLogger());
    const result = service.doSomething(createMockUserContext());
    // ... assertions
  });
});
```

**Benefits**:
- ✅ Reduces test boilerplate by 80%
- ✅ Consistent mock objects across all tests
- ✅ Easy to update when interfaces change (single source of truth)
- ✅ Pre-defined test users for common scenarios

---

### Must-Have Change #3: 🟢 Type Coverage Metric

**Problem Identified**:
The plan tracks code coverage but not type coverage (TypeScript `any` usage). Type safety is critical for refactoring confidence.

**Required Addition**: Add type coverage to success metrics

**Updated Success Metrics Table**:

| Metric | Before | After |
|--------|--------|-------|
| index.ts LOC | 1,533 | <200 |
| Overall Coverage | 31% | 70%+ |
| **Type Coverage** | **Unknown** | **85%+** |
| MCP Gateway Coverage | 49.06% | 85%+ |
| Avg Function Length | 50+ lines | <20 lines |
| Cyclomatic Complexity | High | Low |
| Test Execution Time | ~5s | <10s |

**Baseline Type Coverage**:

```bash
cd services/mcp-gateway
npx type-coverage --detail

# Expected output:
# 3205 / 3890 85.39%
# type-coverage success: true
```

**Enforce in CI**:

```yaml
# .github/workflows/ci.yml (add to MCP Gateway job)
- name: Check type coverage
  run: |
    cd services/mcp-gateway
    npx type-coverage --at-least 85
```

**Track During Refactoring**:
- Phase 1: Baseline type coverage (likely 75-80%)
- Phase 2: Increase to 82%+ (services with strong typing)
- Phase 3: Increase to 84%+ (typed routes)
- Phase 4: Target 85%+ (all extracted code fully typed)

**Why This Matters**:
- Prevents `any` from creeping into new code
- Catches type errors at compile time, not runtime
- Makes refactoring safer (TypeScript will catch breaking changes)

---

### Nice-to-Have Change #4: ⚠️ Confirmation Endpoint Test Cases

**Problem Identified**:
The plan mentions "Confirmation workflow" but doesn't specify test cases for the 109-line confirmation handler (lines 1047-1155).

**Recommended Addition**: Explicit confirmation test cases

**File**: `tests/integration/confirmation.test.ts`

```typescript
// tests/integration/confirmation.test.ts
import request from 'supertest';
import app from '../../src/index';
import { getKeycloakToken } from '../helpers/keycloak-mock';
import { setupMCPMocks, setupRedis } from '../helpers/mcp-mock';

/**
 * Human-in-the-Loop Confirmation Integration Tests
 *
 * Covers v1.4 Section 5.6 confirmation workflow:
 * 1. Write operations return pending_confirmation
 * 2. User can approve/reject via /api/confirm/:id
 * 3. Confirmations expire after TTL
 * 4. Replay attacks prevented
 */
describe('Human-in-the-Loop Confirmation', () => {
  let token: string;

  beforeAll(async () => {
    token = await getKeycloakToken('alice.chen', 'hr-write');
    setupMCPMocks();
    setupRedis();
  });

  /**
   * Test 1: Write operations return pending_confirmation
   */
  it('should return pending_confirmation for write operations', async () => {
    const response = await request(app)
      .post('/api/mcp/hr/delete_employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: '123' })
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'pending_confirmation',
      confirmationId: expect.any(String),
      message: expect.stringContaining('Delete employee'),
      confirmationData: {
        employeeId: '123',
        employeeName: expect.any(String),
      },
    });

    // Confirmation should be stored in Redis
    const confirmationId = response.body.confirmationId;
    expect(confirmationId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  /**
   * Test 2: User can approve confirmation and action executes
   */
  it('should execute confirmed action and delete Redis key', async () => {
    // Step 1: Initiate write operation
    const initResponse = await request(app)
      .post('/api/mcp/hr/delete_employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: '123' })
      .expect(200);

    const confirmationId = initResponse.body.confirmationId;

    // Step 2: Approve confirmation
    const confirmResponse = await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved: true })
      .expect(200);

    expect(confirmResponse.body).toMatchObject({
      status: 'success',
      message: expect.stringContaining('Action completed'),
      result: expect.objectContaining({
        status: 'success',
      }),
    });

    // Step 3: Confirmation should be consumed (deleted from Redis)
    const retryResponse = await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved: true })
      .expect(404);

    expect(retryResponse.body.error).toContain('not found or expired');
  });

  /**
   * Test 3: User can reject confirmation
   */
  it('should cancel on user rejection', async () => {
    const initResponse = await request(app)
      .post('/api/mcp/hr/delete_employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: '456' })
      .expect(200);

    const confirmationId = initResponse.body.confirmationId;

    const confirmResponse = await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved: false })
      .expect(200);

    expect(confirmResponse.body).toMatchObject({
      status: 'cancelled',
      message: expect.stringContaining('cancelled'),
    });

    // Confirmation should be deleted
    await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved: true })
      .expect(404);
  });

  /**
   * Test 4: Confirmations expire after TTL (300 seconds)
   */
  it('should return 404 for expired confirmations (TTL=300s)', async () => {
    const initResponse = await request(app)
      .post('/api/mcp/hr/delete_employee')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: '789' })
      .expect(200);

    const confirmationId = initResponse.body.confirmationId;

    // Simulate TTL expiration (mock Redis to return null)
    setupRedis({ simulateExpiration: true });

    const confirmResponse = await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved: true })
      .expect(404);

    expect(confirmResponse.body.error).toContain('not found or expired');
    expect(confirmResponse.body.message).toContain('expired');
  });

  /**
   * Test 5: Prevent replay attacks (different user)
   */
  it('should prevent replay attacks on confirmed actions', async () => {
    // Alice initiates delete
    const aliceToken = await getKeycloakToken('alice.chen', 'hr-write');
    const initResponse = await request(app)
      .post('/api/mcp/hr/delete_employee')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ employeeId: '999' })
      .expect(200);

    const confirmationId = initResponse.body.confirmationId;

    // Bob tries to confirm (different user)
    const bobToken = await getKeycloakToken('bob.martinez', 'hr-write');
    const bobResponse = await request(app)
      .post(`/api/confirm/${confirmationId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ approved: true })
      .expect(403);

    expect(bobResponse.body.error).toContain('initiating user');
  });
});
```

**Coverage**: 5 critical confirmation scenarios (100% of v1.4 HITL features)

---

### Nice-to-Have Change #5: ⚠️ Error Handling Service

**Problem Identified**:
The plan extracts business logic but doesn't extract error handling patterns (fail-secure, logging, audit trails).

**Recommended Addition**: Phase 2.4 - Error Handler Service

**File**: `src/middleware/error.middleware.ts`

```typescript
// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Logger } from 'winston';

export enum ErrorType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  INTERNAL = 'internal',
}

/**
 * Centralized Error Handler Service
 *
 * Benefits:
 * - Consistent error responses across all endpoints
 * - Fail-secure: Never leak internal details
 * - Structured audit logging
 * - Easy to test error scenarios
 */
export class ErrorHandler {
  constructor(private logger: Logger) {}

  /**
   * Handle authentication errors (401)
   */
  handleAuthError(error: unknown, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;

    this.logger.warn('Authentication failed', {
      requestId,
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired credentials',
      requestId,
    });
  }

  /**
   * Handle authorization errors (403)
   */
  handleAuthzError(error: unknown, req: Request, res: Response, details?: { requiredRoles?: string[] }): void {
    const requestId = req.headers['x-request-id'] as string;

    this.logger.warn('Authorization failed', {
      requestId,
      path: req.path,
      userId: (req as any).userContext?.userId,
      userRoles: (req as any).userContext?.roles,
      requiredRoles: details?.requiredRoles,
    });

    res.status(403).json({
      error: 'Access denied',
      message: 'You do not have permission to access this resource',
      requestId,
    });
  }

  /**
   * Handle validation errors (400)
   */
  handleValidationError(error: unknown, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;

    // Fail-secure: Never leak internal validation logic
    res.status(400).json({
      error: 'Invalid request',
      message: error instanceof Error ? error.message : 'Request validation failed',
      requestId,
    });
  }

  /**
   * Handle not found errors (404)
   */
  handleNotFoundError(req: Request, res: Response, resource?: string): void {
    const requestId = req.headers['x-request-id'] as string;

    res.status(404).json({
      error: 'Not found',
      message: resource ? `${resource} not found` : 'The requested resource was not found',
      requestId,
    });
  }

  /**
   * Handle rate limit errors (429)
   */
  handleRateLimitError(req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;

    this.logger.warn('Rate limit exceeded', {
      requestId,
      path: req.path,
      userId: (req as any).userContext?.userId,
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
      requestId,
    });
  }

  /**
   * Handle internal server errors (500)
   * CRITICAL: Never leak internal details to client
   */
  handleInternalError(error: unknown, req: Request, res: Response): void {
    const requestId = req.headers['x-request-id'] as string;

    // Log full error details internally
    this.logger.error('Internal server error', {
      requestId,
      path: req.path,
      method: req.method,
      userId: (req as any).userContext?.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return minimal error to client (fail-secure)
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
      requestId,
    });
  }

  /**
   * Express error middleware factory
   * Use this to create the global error handler
   */
  createMiddleware() {
    return (error: any, req: Request, res: Response, next: NextFunction): void => {
      // Determine error type and delegate
      if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
        this.handleAuthError(error, req, res);
      } else if (error.name === 'ForbiddenError') {
        this.handleAuthzError(error, req, res);
      } else if (error.name === 'ValidationError') {
        this.handleValidationError(error, req, res);
      } else if (error.statusCode === 429) {
        this.handleRateLimitError(req, res);
      } else {
        this.handleInternalError(error, req, res);
      }
    };
  }
}
```

**Usage in index.ts**:

```typescript
// src/index.ts
import { ErrorHandler } from './middleware/error.middleware';

const errorHandler = new ErrorHandler(logger);

// ... all routes ...

// Global error handler (MUST be last middleware)
app.use(errorHandler.createMiddleware());
```

**Tests**: `src/middleware/error.middleware.test.ts`

```typescript
describe('ErrorHandler', () => {
  let handler: ErrorHandler;
  let mockLogger: jest.Mocked<Logger>;
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    handler = new ErrorHandler(mockLogger);
    req = { headers: { 'x-request-id': 'test-123' }, path: '/api/test', method: 'GET' };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('should return 401 for auth errors', () => {
    handler.handleAuthError(new Error('Invalid token'), req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication failed',
      message: 'Invalid or expired credentials',
      requestId: 'test-123',
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should never leak internal error details', () => {
    const internalError = new Error('Database connection failed at line 42 with password abc123');

    handler.handleInternalError(internalError, req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    const response = (res.json as jest.Mock).mock.calls[0][0];
    expect(response.message).toBe('An unexpected error occurred'); // Generic message
    expect(response.message).not.toContain('Database'); // No internal details
    expect(response.message).not.toContain('password'); // No secrets
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Internal server error',
      expect.objectContaining({
        error: 'Database connection failed at line 42 with password abc123', // Full error logged
      })
    );
  });
});
```

**Coverage Target**: 95%+ (pure service, easy to test)

---

### Nice-to-Have Change #6: ⚠️ Revise Phase 4 Coverage Target

**Problem Identified**:
The plan targets 85%+ MCP Gateway coverage, but index.ts currently has 1,532 uncovered lines. Even after extraction, legacy code will drag down the average.

**Recommended Change**: Align with "Diff Coverage" strategy

**Updated Success Metrics**:

| Metric | Before | After (Revised) |
|--------|--------|-----------------|
| index.ts LOC | 1,533 | <200 |
| Overall Coverage | 31% | 70%+ |
| Type Coverage | Unknown | 85%+ |
| **MCP Gateway Coverage** | **49.06%** | **60%+ (diff: 90%+)** |
| Avg Function Length | 50+ lines | <20 lines |

**Rationale**:
- **60% overall** = realistic given legacy code remains
- **90% diff coverage** = all NEW extracted code is well-tested
- **Aligns with strategy**: "49.06% gradually improving, 90% on new code"

**Coverage Projection** (from QA review):

| Phase | New Covered Lines | Cumulative Coverage |
|-------|-------------------|---------------------|
| **Baseline** | 0 | 49.06% |
| **Phase 1** | +58.6 | 53% |
| **Phase 2** | +246.5 | 62% |
| **Phase 3** | +440.5 | 72% |
| **Phase 4** | +560 | **78%** |

**Adjusted Target**: 60%+ overall (more conservative), but Phase 4 projection shows 78% is achievable if all tests written.

**Updated Recommendation**:
- **Minimum Success**: 60% overall, 90% diff coverage
- **Stretch Goal**: 70%+ overall (original target)
- **Likely Outcome**: 65-70% based on QA projections

---

## Updated Implementation Checklist

Before starting the refactoring, ensure:

**Must-Have Items**:
- [ ] **Singleton Pattern**: All services instantiated ONCE at server startup
- [ ] **AsyncGenerator Pattern**: Streaming logic extracted to `StreamingService.executeQuery()`
- [ ] **Integration Tests**: Happy path + 6 SSE scenarios + 5 confirmation scenarios
- [ ] **Mock Factories**: Create `test-utils/` with mock-logger, mock-user-context, etc.
- [ ] **Type Coverage Baseline**: Run `npx type-coverage --detail` and document starting percentage
- [ ] **Performance Baseline**: Measure current JWKS cache hit rate (should be >95%)
- [ ] **Coverage Baseline**: Confirm starting at 31% overall, 49.06% on mcp-gateway

**Nice-to-Have Items**:
- [ ] **Error Handler Service**: Centralized error handling (Phase 2.4)
- [ ] **Revised Coverage Target**: Update metrics table to 60%+ (diff: 90%+)
- [ ] **Pre-defined Test Users**: Add TEST_USERS to mock-user-context.ts

---

## Updated Migration Timeline (5 Weeks)

| Week | Phase | Tasks | Tests |
|------|-------|-------|-------|
| **1** | Phase 1 | Extract config, role-mapper | **+ Setup mock factories** |
| **2** | Phase 2 | Extract JWT, MCP, Claude services | Write unit tests (85-95% coverage) |
| **2.5** | Phase 2.5 | Extract StreamingService | Unit tests with AsyncGenerator |
| **3** | Phase 3 | Extract middleware, routes | **+ SSE integration tests (6 scenarios)** |
| **3.5** | Phase 3.5 | _(Optional)_ Error handler service | **+ Confirmation tests (5 scenarios)** |
| **4** | Phase 4 | Clean up, coverage report | Integration happy path, deploy |

**Total**: 5 weeks with optional error handler service

---

---

## ADDENDUM #3: Final Execution Recommendations (Critical Implementation Details)

**Received**: 2025-12-30
**Source**: Final Technical Review
**Status**: ⚠️ **CRITICAL - Must implement before production**

### Overview

Two critical implementation details that, if missed, will cause **production incidents**:

1. **🔴 CRITICAL**: Zombie Anthropic API usage from disconnected clients (unbounded cost)
2. **🔴 CRITICAL**: Flaky integration tests dependent on live MCP microservices

---

### 🚨 Critical Issue #1: Client Disconnect Handling in Phase 3

**Problem**: The AsyncGenerator pattern in Phase 2.5 creates a **cost and resource leak risk** if the HTTP client disconnects mid-stream.

**Scenario**:
```typescript
// Client opens SSE connection
const eventSource = new EventSource('/api/query');

// Server starts streaming from Anthropic
for await (const event of streamingService.executeQuery(...)) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ❌ PROBLEM: Client closes browser/tab
// ❌ AsyncGenerator CONTINUES running
// ❌ Anthropic API CONTINUES billing for tokens
// ❌ Server resources tied up for 60+ seconds
```

**Root Cause**: Express does NOT automatically abort async operations when `res` closes. The `for await` loop continues until the generator naturally completes.

#### ✅ Required Implementation (Phase 3 - streaming.routes.ts)

```typescript
// src/routes/streaming.routes.ts
import { Router, Request, Response } from 'express';
import { StreamingService } from '../ai/streaming.service';

export function createStreamingRoutes(
  streamingService: StreamingService,
  logger: Logger
): Router {
  const router = Router();

  router.post('/api/query', async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const userContext = (req as any).userContext; // From auth middleware

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create AbortController for cleanup
    const abortController = new AbortController();
    let streamClosed = false;

    // 🔴 CRITICAL: Handle client disconnect
    req.on('close', () => {
      if (!streamClosed) {
        logger.warn('Client disconnected mid-stream', { requestId });
        streamClosed = true;
        abortController.abort(); // Signal generator to stop
      }
    });

    try {
      const generator = streamingService.executeQuery(
        req.body.query,
        userContext,
        accessibleServers,
        abortController.signal // Pass abort signal
      );

      for await (const event of generator) {
        // 🔴 CRITICAL: Check if client disconnected
        if (streamClosed || abortController.signal.aborted) {
          logger.info('Aborting stream due to client disconnect', { requestId });
          break; // Exit loop immediately
        }

        // Write event to client
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        // 🔴 CRITICAL: Flush immediately (don't buffer)
        if (res.flush) res.flush();
      }

      // Clean end
      if (!streamClosed) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (error) {
      logger.error('Streaming error', { requestId, error });
      if (!streamClosed && !res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    } finally {
      streamClosed = true;
    }
  });

  return router;
}
```

#### ✅ Required Implementation (Phase 2.5 - StreamingService)

**Update StreamingService to accept AbortSignal**:

```typescript
// src/ai/streaming.service.ts
export class StreamingService {
  async *executeQuery(
    query: string,
    userContext: UserContext,
    accessibleServers: any[],
    signal?: AbortSignal, // ← NEW: Accept abort signal
    cursor?: string
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // 🔴 CRITICAL: Check abort before expensive operations
    if (signal?.aborted) {
      this.logger.warn('Stream aborted before start');
      return;
    }

    try {
      // Call Anthropic API with streaming
      const stream = await this.anthropic.messages.stream(
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: safeQuery }],
          tools: this.buildMcpTools(accessibleServers),
        },
        { signal } // ← Pass abort signal to Anthropic SDK
      );

      for await (const chunk of stream) {
        // 🔴 CRITICAL: Check abort between chunks
        if (signal?.aborted) {
          this.logger.info('Stream aborted mid-processing');
          await stream.abort(); // Clean up Anthropic stream
          return;
        }

        // Process chunk
        if (chunk.type === 'content_block_delta') {
          yield {
            type: 'text',
            text: chunk.delta.text,
            requestId: userContext.requestId,
          };
        }

        // ... other chunk handling
      }

      yield { type: 'done', requestId: userContext.requestId };
    } catch (error) {
      // AbortError is expected on client disconnect
      if (error.name === 'AbortError') {
        this.logger.info('Stream cleanly aborted', { requestId: userContext.requestId });
        return;
      }
      throw error;
    }
  }
}
```

#### 📊 Cost Impact Analysis

**Without Disconnect Handling**:
- Average query duration: 30 seconds
- Average tokens: 2,000 input + 4,000 output
- Cost per query: ~$0.08 (Claude Sonnet 4.5)
- **10 disconnected clients/hour = $0.80/hour = $19/day = $576/month in WASTE**

**With Disconnect Handling**:
- Aborted within 100ms of disconnect
- Wasted tokens: ~50 (minimal)
- Cost per abandoned query: ~$0.001
- **10 disconnected clients/hour = $0.01/hour = $0.24/day = $7/month**

**Savings**: **$569/month** (98% reduction in waste)

#### ✅ Required Unit Test (Phase 3)

```typescript
// tests/unit/routes/streaming.routes.test.ts
describe('Client Disconnect Handling', () => {
  it('should abort AsyncGenerator when client disconnects', async () => {
    const mockStreamingService = {
      executeQuery: jest.fn().mockImplementation(async function* (query, ctx, servers, signal) {
        yield { type: 'text', text: 'Chunk 1' };
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay

        // 🔴 Should be aborted by now
        if (signal?.aborted) {
          return; // Generator stops
        }

        yield { type: 'text', text: 'Chunk 2' }; // Should NOT reach here
      }),
    };

    const router = createStreamingRoutes(mockStreamingService as any, mockLogger);
    const app = express();
    app.use(router);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    // Simulate client that disconnects after first chunk
    const response = await fetch(`http://localhost:${port}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
      signal: AbortSignal.timeout(150), // Abort after 150ms
    }).catch(err => err); // Expect abort error

    // Verify generator was called with abort signal
    expect(mockStreamingService.executeQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ aborted: false }) // Signal passed
    );

    // Verify only 1 chunk was yielded (not 2)
    const generator = mockStreamingService.executeQuery.mock.results[0].value;
    const chunks = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1); // Only first chunk before abort

    server.close();
  });
});
```

#### 📋 Phase 3 Implementation Checklist

- [ ] **streaming.routes.ts**: Add `req.on('close')` handler with AbortController
- [ ] **streaming.routes.ts**: Check `streamClosed` flag in loop
- [ ] **streaming.routes.ts**: Call `res.flush()` after each write
- [ ] **StreamingService**: Accept `signal?: AbortSignal` parameter
- [ ] **StreamingService**: Pass signal to Anthropic SDK
- [ ] **StreamingService**: Check `signal?.aborted` in loop
- [ ] **StreamingService**: Call `stream.abort()` on early exit
- [ ] **Unit Test**: Verify generator stops on disconnect
- [ ] **Integration Test**: Test with real SSE client disconnect (EventSource.close())
- [ ] **Monitoring**: Add metric for aborted streams vs completed streams

---

### 🚨 Critical Issue #2: HTTP Mocking Strategy for Phase 4.2

**Problem**: Integration tests currently assume live MCP microservices (mcp-hr, mcp-finance, etc.) are running. This creates:

1. **Flaky tests**: If service is down, tests fail
2. **Slow tests**: Network round-trips add 100-500ms per test
3. **CI dependency**: Requires Docker Compose in CI (complex setup)
4. **Concurrent test issues**: Shared database state causes race conditions

**Current Approach** (from REFACTORING_PLAN.md Phase 4.2):
```typescript
// ❌ PROBLEM: Assumes live services
it('should process AI query with all services wired correctly', async () => {
  const response = await request(app)
    .post('/api/ai/query')
    .set('Authorization', `Bearer ${token}`)
    .send({ query: 'List all employees in Engineering' })
    .expect(200);

  // This REQUIRES mcp-hr:3101 to be running
  expect(response.body.results).toBeDefined();
});
```

#### ✅ Required Implementation: HTTP Interception with Nock

**Install Dependency**:
```bash
cd services/mcp-gateway
npm install --save-dev nock
```

**Create Mock MCP Response Helper**:

```typescript
// src/test-utils/nock-mcp-mocks.ts
import nock from 'nock';

export interface MockMCPServerConfig {
  name: string;
  baseUrl: string;
  tools: Array<{
    name: string;
    response: any;
  }>;
}

export function setupMCPMocks(servers: MockMCPServerConfig[]): void {
  servers.forEach(server => {
    const scope = nock(server.baseUrl)
      .persist() // Keep mock active for multiple requests
      .defaultReplyHeaders({
        'Content-Type': 'application/json',
      });

    // Mock tool discovery endpoint
    scope
      .get('/mcp/tools')
      .reply(200, {
        tools: server.tools.map(t => ({
          name: t.name,
          description: `Mock ${t.name}`,
          inputSchema: { type: 'object' },
        })),
      });

    // Mock tool execution endpoints
    server.tools.forEach(tool => {
      scope
        .post(`/mcp/tools/${tool.name}`)
        .reply(200, tool.response);
    });
  });
}

export function cleanupMCPMocks(): void {
  nock.cleanAll();
}

// Pre-defined mock responses for common scenarios
export const MOCK_MCP_RESPONSES = {
  hr: {
    list_employees: {
      status: 'success',
      data: [
        {
          employee_id: '550e8400-e29b-41d4-a716-446655440001',
          first_name: 'Alice',
          last_name: 'Chen',
          department: 'Engineering',
          job_title: 'VP of HR',
          email: 'alice.chen@tamshai.com',
        },
        {
          employee_id: '550e8400-e29b-41d4-a716-446655440002',
          first_name: 'Marcus',
          last_name: 'Johnson',
          department: 'Engineering',
          job_title: 'Software Engineer',
          email: 'marcus.johnson@tamshai.com',
        },
      ],
      metadata: {
        truncated: false,
        totalCount: '2',
      },
    },
    get_employee: {
      status: 'success',
      data: {
        employee_id: '550e8400-e29b-41d4-a716-446655440001',
        first_name: 'Alice',
        last_name: 'Chen',
        department: 'Engineering',
        job_title: 'VP of HR',
        salary: 185000,
        manager_id: null,
      },
    },
  },
  finance: {
    get_department_budget: {
      status: 'success',
      data: {
        department: 'Engineering',
        budget: 5000000,
        spent: 3200000,
        remaining: 1800000,
        fiscal_year: 2025,
      },
    },
  },
  sales: {
    list_opportunities: {
      status: 'success',
      data: [
        {
          opportunity_id: 'OPP-001',
          customer_name: 'Acme Corp',
          value: 250000,
          stage: 'Negotiation',
          close_date: '2025-03-15',
        },
      ],
      metadata: {
        truncated: false,
        totalCount: '1',
      },
    },
  },
};
```

#### ✅ Updated Integration Test (Phase 4.2)

```typescript
// tests/integration/happy-path.test.ts
import request from 'supertest';
import nock from 'nock';
import { app } from '../../src/app';
import { setupMCPMocks, cleanupMCPMocks, MOCK_MCP_RESPONSES } from '../../src/test-utils/nock-mcp-mocks';
import { getKeycloakToken } from './test-helpers';

describe('Integration: Happy Path (with HTTP mocks)', () => {
  let token: string;

  beforeAll(async () => {
    // Setup HTTP interception for MCP servers
    setupMCPMocks([
      {
        name: 'mcp-hr',
        baseUrl: 'http://mcp-hr:3101',
        tools: [
          { name: 'list_employees', response: MOCK_MCP_RESPONSES.hr.list_employees },
          { name: 'get_employee', response: MOCK_MCP_RESPONSES.hr.get_employee },
        ],
      },
      {
        name: 'mcp-finance',
        baseUrl: 'http://mcp-finance:3102',
        tools: [
          { name: 'get_department_budget', response: MOCK_MCP_RESPONSES.finance.get_department_budget },
        ],
      },
    ]);

    // Get real Keycloak token (Keycloak still runs in Docker)
    token = await getKeycloakToken('alice.chen', process.env.TEST_PASSWORD);
  });

  afterAll(() => {
    cleanupMCPMocks();
  });

  it('should process AI query with all services wired correctly', async () => {
    const response = await request(app)
      .post('/api/ai/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'List all employees in Engineering' })
      .expect(200);

    // Verify response structure
    expect(response.body).toMatchObject({
      requestId: expect.any(String),
      response: expect.stringContaining('Alice Chen'),
      status: 'success',
    });

    // ✅ NO LIVE MCP SERVICES REQUIRED - nock intercepted HTTP calls
  });

  it('should verify HTTP interception worked', () => {
    // Verify nock intercepted the requests
    const pendingMocks = nock.pendingMocks();
    expect(pendingMocks).toHaveLength(0); // All expected calls were made
  });
});
```

#### 📊 Test Performance Impact

**Before (Live Services)**:
- Test duration: 2.5 seconds
- Flaky rate: 5% (network/service issues)
- CI setup: Requires `docker-compose up` (adds 30s to CI)

**After (Nock Mocks)**:
- Test duration: 0.3 seconds (**8x faster**)
- Flaky rate: 0% (deterministic)
- CI setup: None (just `npm test`)

**Savings**: **~2 seconds per test × 50 integration tests = 100 seconds saved per CI run**

#### 📋 Phase 4.2 Implementation Checklist

- [ ] **Install nock**: `npm install --save-dev nock`
- [ ] **Create nock-mcp-mocks.ts**: HTTP interception helper
- [ ] **Define MOCK_MCP_RESPONSES**: Standard test data for all MCP servers
- [ ] **Update happy-path.test.ts**: Use setupMCPMocks() in beforeAll
- [ ] **Update rbac.test.ts**: Mock MCP servers per test case
- [ ] **Update sse-streaming.test.ts**: Mock MCP servers with pagination
- [ ] **Update confirmation.test.ts**: Mock write tool responses
- [ ] **Document in TESTING.md**: Explain why nock over live services
- [ ] **CI Update**: Remove Docker Compose requirement for integration tests
- [ ] **Add verification**: Check `nock.pendingMocks()` to catch missed mocks

---

### 🎯 Summary: Critical Actions Required

| Phase | Critical Action | Risk if Skipped | Estimated Effort |
|-------|----------------|------------------|------------------|
| **2.5** | Add `signal?: AbortSignal` to StreamingService | **Unbounded API costs** | 30 minutes |
| **3** | Add `req.on('close')` handler in streaming routes | **$570/month waste** | 1 hour |
| **3** | Write disconnect unit test | Regression risk | 30 minutes |
| **4.2** | Install nock and create mock helpers | **Flaky CI, slow tests** | 1 hour |
| **4.2** | Update all integration tests to use nock | **CI dependency on Docker** | 2 hours |

**Total Critical Work**: **5 hours** to prevent production incidents and improve CI reliability

---

### ✅ Acceptance Criteria

**Phase 3 Complete When**:
- [ ] `streaming.routes.ts` handles client disconnect with AbortController
- [ ] StreamingService accepts and respects AbortSignal
- [ ] Unit test verifies generator stops on disconnect
- [ ] Integration test confirms no zombie Anthropic streams
- [ ] Monitoring dashboard shows `aborted_streams` metric

**Phase 4.2 Complete When**:
- [ ] All integration tests use nock for MCP HTTP calls
- [ ] CI runs integration tests without Docker Compose
- [ ] Test suite runs in <10 seconds (was 2+ minutes)
- [ ] Flaky test rate = 0% (was 5%)
- [ ] `nock.pendingMocks()` verification passes

---

**Last Updated**: 2026-01-01 (Status Update + Lessons Learned)
**Author**: Claude (Anthropic)
**Reviewers**:
- Technical Lead (Review #1 - Critical fixes applied)
- Principal SDET/QA Lead (Review #2 - Testing enhancements applied)
- Final Technical Review (ADDENDUM #3 - Production-critical safeguards)
- QA Lead (ADDENDUM #4 - Lessons Learned from CI Remediation)

---

## ADDENDUM #4: Status Update & Lessons Learned (January 2026)

**Author**: Claude-QA (claude-qa@tamshai.com)
**Date**: 2026-01-01
**Context**: Following 2-day CI remediation effort that uncovered critical testing patterns

---

### Current Implementation Status

#### Modules Already Extracted ✅

| Module | File | Lines | Coverage | Notes |
|--------|------|-------|----------|-------|
| Configuration | `src/config/index.ts` | 69 | ~95% | ✅ Complete with tests |
| JWT Validator | `src/auth/jwt-validator.ts` | 153 | ~85% | ✅ Complete with tests |
| MCP Client | `src/mcp/mcp-client.ts` | 220 | ~80% | ✅ Complete with tests |
| Role Mapper | `src/mcp/role-mapper.ts` | 88 | ~100% | ✅ Complete with tests |
| Claude Client | `src/ai/claude-client.ts` | 164 | ~90% | ✅ Complete with tests |
| Prompt Defense | `src/security/prompt-defense.ts` | 603 | ~85% | ✅ Complete with tests |
| Token Revocation | `src/security/token-revocation.ts` | 249 | ~80% | ✅ Complete with tests |
| PII Scrubber | `src/utils/pii-scrubber.ts` | 182 | ~90% | ✅ Complete with tests |
| Redis Utils | `src/utils/redis.ts` | 321 | ~75% | ✅ Complete with tests |
| Gateway Utils | `src/utils/gateway-utils.ts` | 61 | ~90% | ✅ Complete with tests |
| MCP Response Types | `src/types/mcp-response.ts` | 159 | ~95% | ✅ Complete with tests |
| Health Routes | `src/routes/health.routes.ts` | 67 | ~90% | ✅ Complete with tests |
| User Routes | `src/routes/user.routes.ts` | 103 | ~85% | ✅ Complete with tests |
| GDPR Routes | `src/routes/gdpr.ts` | 587 | ~70% | ✅ Complete with tests |
| Test Utilities | `src/test-utils/*` | ~200 | N/A | ✅ Mock factories created |

**Total Extracted**: ~3,226 lines across 15 modules

#### Remaining in index.ts ⚠️

| Section | Lines | Complexity | Priority |
|---------|-------|------------|----------|
| Logger Setup | 94-108 | Low | Low |
| Type Definitions | 114-145 | Low | Medium |
| MCP Server Configs | 150-175 | Low | High |
| validateToken function | 198-279 | High | **CRITICAL** |
| authMiddleware | 653-697 | High | **CRITICAL** |
| AI Query Handler | 708-797 | Very High | **CRITICAL** |
| SSE Streaming Logic | 800-1011 | **Very High** | **CRITICAL** |
| Confirmation Handler | 1079-1187 | High | High |
| MCP Tool Proxy | 1200-1459 | Very High | High |
| Server Startup | 1500-1564 | Medium | Low |

**Remaining**: ~1,564 lines with **0% coverage**

#### Current Coverage Metrics (2026-01-01)

```
=============================== Coverage summary ===============================
Statements   : 53.38% ( 583/1092 )
Branches     : 52.85% ( 315/596 )
Functions    : 53.80% ( 106/197 )
Lines        : 54.30% ( 574/1057 )
================================================================================

File-specific (from coverage report):
- index.ts: 0% coverage (lines 18-1564)
- All extracted modules: 75-100% coverage
```

---

### Lessons Learned from CI Remediation (December 31 - January 1)

During 2 days of intensive CI debugging, we identified critical patterns that MUST be followed in the remaining refactoring work.

#### Issue #1: 🔴 Mock Data Structure Mismatches (CRITICAL)

**What Happened**: Integration tests failed with cryptic errors because mock data didn't match actual MCP response schemas.

**Root Cause**: Tests used simplified mock objects that were missing required fields or had wrong types.

**Example of the Problem**:
```typescript
// ❌ BAD: Missing required fields, causes downstream failures
const mockEmployee = {
  name: 'Alice',
  role: 'hr'
};

// ✅ GOOD: Complete schema matching actual MCP response
const mockEmployee = {
  employee_id: '550e8400-e29b-41d4-a716-446655440001',  // UUID format
  first_name: 'Alice',
  last_name: 'Chen',
  email: 'alice.chen@tamshai.local',
  department: 'Human Resources',
  job_title: 'VP of Human Resources',
  hire_date: '2020-01-15',
  manager_id: null,
  status: 'active'
};
```

**REQUIRED PATTERN**: Always use complete mock objects matching production schemas.

**Implementation**:
```typescript
// src/test-utils/mock-data.ts
export const MOCK_EMPLOYEES = {
  aliceChen: {
    employee_id: '550e8400-e29b-41d4-a716-446655440001',
    first_name: 'Alice',
    last_name: 'Chen',
    email: 'alice.chen@tamshai.local',
    department: 'Human Resources',
    job_title: 'VP of Human Resources',
    hire_date: '2020-01-15',
    manager_id: null,
    status: 'active',
  } as const,
  // ... other employees
};

// Type-safe mock factory
export function createMockEmployee(
  overrides: Partial<typeof MOCK_EMPLOYEES.aliceChen> = {}
): typeof MOCK_EMPLOYEES.aliceChen {
  return { ...MOCK_EMPLOYEES.aliceChen, ...overrides };
}
```

---

#### Issue #2: 🔴 Typing Mismatches in Test Assertions

**What Happened**: Tests passed locally but failed in CI due to type coercion differences.

**Root Cause**: Using `any` types in tests masked type mismatches that surfaced at runtime.

**Example of the Problem**:
```typescript
// ❌ BAD: any type hides mismatches
const result = await someFunction() as any;
expect(result.data).toBeDefined();  // Passes even if structure is wrong

// ✅ GOOD: Strict typing catches issues at compile time
interface ExpectedResult {
  status: 'success' | 'error';
  data: Employee[];
  metadata: { count: number };
}
const result: ExpectedResult = await someFunction();
expect(result.data).toHaveLength(2);
```

**REQUIRED PATTERN**:
1. Define explicit interfaces for all test inputs/outputs
2. Never use `as any` in tests
3. Use `satisfies` operator for type checking without casting

---

#### Issue #3: 🟡 Inconsistent Naming Conventions

**What Happened**: Confusion between similar function names caused wrong functions to be called.

**Examples of Confusion**:
- `getAccessibleMCPServers` vs `getAccessibleMCPServersForUser`
- `validateToken` (in index.ts) vs `JWTValidator.validate` (in jwt-validator.ts)
- `queryMCPServer` vs `MCPClient.query`

**REQUIRED NAMING CONVENTIONS**:

| Pattern | Convention | Example |
|---------|------------|---------|
| Classes | PascalCase + descriptive | `JWTValidator`, `MCPClient`, `StreamingService` |
| Factory functions | `create` + noun | `createAuthMiddleware`, `createMockEmployee` |
| Getter functions | `get` + noun | `getAccessibleServers`, `getSigningKey` |
| Boolean getters | `is/has/can` + adjective | `isTokenRevoked`, `hasAccess`, `canExecute` |
| Async functions | Verb + noun (no `async` suffix) | `validateToken`, `queryServer` |
| Test files | Same name + `.test.ts` | `jwt-validator.test.ts` |
| Mock files | `mock-` prefix | `mock-logger.ts`, `mock-mcp-server.ts` |

**When Renaming During Refactor**:
1. Add deprecation comment to old function
2. Export both old and new names
3. Update all callers in same PR
4. Remove old name in subsequent PR

---

#### Issue #4: 🟡 Test Isolation Failures

**What Happened**: Tests passed individually but failed when run together due to shared state.

**Root Cause**: Jest's test isolation doesn't clear module-level singletons between tests.

**Example of the Problem**:
```typescript
// ❌ BAD: Module-level state persists across tests
let cache: Map<string, any> = new Map();

// ✅ GOOD: Inject dependencies, reset in beforeEach
class TokenCache {
  private cache = new Map<string, any>();

  reset(): void {
    this.cache.clear();
  }
}

// In tests:
beforeEach(() => {
  tokenCache.reset();
});
```

**REQUIRED PATTERN**:
1. All stateful modules must have a `reset()` method for testing
2. Use `beforeEach(() => jest.resetModules())` when testing singletons
3. Never rely on test execution order

---

#### Issue #5: 🟡 Redis Mock Timing Issues

**What Happened**: Token revocation tests were flaky due to async Redis operations.

**Root Cause**: `ioredis-mock` doesn't perfectly replicate Redis async behavior.

**REQUIRED PATTERN**: Use explicit waits and verification:
```typescript
// ❌ BAD: Race condition possible
await redis.set('key', 'value');
const result = await redis.get('key');

// ✅ GOOD: Explicit verification
await redis.set('key', 'value');
await new Promise(resolve => setImmediate(resolve)); // Allow event loop tick
const result = await redis.get('key');
expect(result).toBe('value');
```

---

### Revised Testing Strategy

Based on the lessons learned, here is the revised testing approach for remaining refactoring:

#### Test File Structure

```
src/
├── module-name/
│   ├── module-name.ts           # Implementation
│   ├── module-name.test.ts      # Unit tests (mocked dependencies)
│   ├── module-name.types.ts     # TypeScript interfaces (if complex)
│   └── index.ts                 # Re-exports
└── test-utils/
    ├── index.ts                 # Central export
    ├── mock-data.ts             # Strongly-typed mock objects
    ├── mock-logger.ts           # Winston logger mock
    ├── mock-user-context.ts     # UserContext factory
    ├── mock-mcp-server.ts       # MCP response factories
    └── nock-helpers.ts          # HTTP interception (for integration)
```

#### Test Quality Checklist (Per Module)

Before marking any module as "refactor complete", verify:

- [ ] **Types**: All test inputs/outputs have explicit TypeScript types (no `any`)
- [ ] **Mock Data**: Uses factories from `test-utils/mock-data.ts`
- [ ] **Isolation**: Each test can run independently (`--runInBand` passes)
- [ ] **Coverage**: >85% line coverage on the module
- [ ] **Edge Cases**: Tests for null, undefined, empty arrays, error paths
- [ ] **Naming**: Follows naming conventions in table above
- [ ] **Documentation**: JSDoc on public functions with usage examples

#### Integration Test Requirements

For each route module extracted, create integration test covering:

1. **Happy Path**: Valid token, valid request, expected response
2. **Auth Failure**: Missing token, invalid token, expired token, revoked token
3. **Validation Failure**: Missing required fields, wrong types, invalid values
4. **RBAC**: User without role gets 403, user with role gets 200
5. **Error Handling**: MCP server timeout, MCP server error, Claude API error
6. **SSE Streaming** (if applicable): Event format, completion signal, client disconnect

---

### Updated Priority Order

Based on coverage impact and risk, here is the revised extraction order:

| Priority | Module | From index.ts Lines | Impact | Risk |
|----------|--------|---------------------|--------|------|
| **P1** | Auth Middleware | 653-697 | High | Medium |
| **P2** | SSE Streaming Service | 800-1011 | **Very High** | High |
| **P3** | AI Query Handler | 708-797 | High | Medium |
| **P4** | MCP Tool Proxy | 1200-1459 | High | Medium |
| **P5** | Confirmation Handler | 1079-1187 | Medium | Low |
| **P6** | Logger Factory | 94-108 | Low | Low |
| **P7** | Server Bootstrap | 1500-1564 | Low | Low |

**Rationale**:
- P1 (Auth Middleware): Already has a template in jwt-validator, low risk
- P2 (SSE Streaming): Highest complexity, most coverage gain, but requires careful abort handling
- P3-P5: Straightforward route extractions
- P6-P7: Low impact, can be done last

---

### Success Metrics (Updated)

| Metric | Current (Jan 2026) | Target | Verification |
|--------|-------------------|--------|--------------|
| index.ts LOC | 1,564 | <300 | `wc -l src/index.ts` |
| index.ts Coverage | 0% | 80%+ | Jest coverage report |
| Overall Coverage | 54.30% | 70%+ | Jest coverage report |
| Diff Coverage | N/A | 90%+ | Codecov PR checks |
| Test Flakiness | ~5% | 0% | 10 consecutive CI runs pass |
| Test Duration | ~14s | <10s | Jest execution time |

---

### Pre-Implementation Checklist

Before starting any refactoring work, verify:

- [ ] Read this entire REFACTORING_PLAN.md (all 4 addendums)
- [ ] Run `npm test` locally - all 366 tests pass
- [ ] Run `npm run typecheck` - no errors
- [ ] Run `npm run lint` - no errors
- [ ] Understand the singleton pattern for JWTValidator (Issue #1, Addendum #1)
- [ ] Understand the AsyncGenerator pattern for streaming (Issue #2, Addendum #1)
- [ ] Understand nock HTTP mocking (Addendum #3)
- [ ] Have access to CI logs to verify changes don't break pipeline

---

### Open Questions for Review

1. **Streaming Abort Signal**: Should we add OpenTelemetry tracing to measure aborted stream frequency?
2. **Nock vs MSW**: Should we migrate to Mock Service Worker for more realistic HTTP mocking?
3. **Type Coverage**: Should we add `typescript-coverage-report` to CI to enforce 85%+ type coverage?
4. **E2E Tests**: Should Phase 5 include Playwright tests against a staging environment?

---

**Next Steps**:
1. Project Sponsor reviews this updated plan
2. Dev team confirms understanding of all 5 addendums
3. Start with P1 (Auth Middleware extraction) as proof-of-concept
4. Iterate based on learnings from P1

---

## ADDENDUM #5: Architecture Review Corrections (2026-01-01)

Architecture review identified **1 critical regression**, **1 testability flaw**, and **1 safety gap** in the proposed refactoring code. These MUST be addressed before implementation.

---

### Issue #1: 🔴 CRITICAL - Client Roles Regression

**Severity**: CRITICAL - Will cause immediate 401 failures in integration tests

**What's Wrong**: The proposed `JWTValidator` class (Phase 2.1) reverts a recent bug fix. It only checks `realm_access` for roles, ignoring `resource_access` (client-specific roles).

**Context**: Previous troubleshooting revealed that Keycloak roles assigned to the `mcp-gateway` client are stored in `resource_access['mcp-gateway'].roles`, NOT in `realm_access.roles`. The current working code merges both.

**Proposed Code (INCORRECT)**:
```typescript
// ❌ WRONG: Only checks realm_access
const payload = decoded as jwt.JwtPayload;
resolve({
  roles: payload.realm_access?.roles || [],  // Missing client roles!
});
```

**REQUIRED FIX**:
```typescript
// ✅ CORRECT: Merge Realm Roles AND Client Roles (Architecture v1.4 Requirement)
const payload = decoded as jwt.JwtPayload;

const realmRoles = payload.realm_access?.roles || [];
const clientRoles = payload.resource_access?.[this.config.clientId]?.roles || [];
const combinedRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

resolve({
  userId: payload.sub || '',
  username: payload.preferred_username || '',
  roles: combinedRoles,  // Use merged array
  email: payload.email,
  jti: payload.jti,
});
```

**Config Addition Required**:
```typescript
// In JWTValidatorConfig interface
export interface JWTValidatorConfig {
  issuer: string;
  audience: string[];
  jwksUri: string;
  clientId: string;  // ADD THIS - needed for resource_access lookup
}
```

---

### Issue #2: 🟡 Testability Flaw - Hardcoded JWKS Client

**Severity**: HIGH - Makes unit testing difficult, violates DI principle

**What's Wrong**: The proposed `JWTValidator` constructor creates `jwksClient` internally:

```typescript
// ❌ WRONG: Hardcoded dependency
constructor(private config: JWTValidatorConfig, private logger: Logger) {
  this.jwksClient = jwksRsa({
    cache: true,
    cacheMaxAge: 86400000,
    jwksUri: config.jwksUri,
  });
}
```

**Impact**:
- Cannot mock `jwksClient` without global `jest.mock('jwks-rsa')` calls
- Tests may make real network calls to JWKS endpoint
- Violates the Dependency Injection principle established in the project

**REQUIRED FIX**: Inject `JwksClient` (or factory) into constructor:

```typescript
import { JwksClient } from 'jwks-rsa';

export class JWTValidator {
  private jwksClient: JwksClient;

  /**
   * @param config - JWT validation configuration
   * @param logger - Winston logger instance
   * @param jwksClient - JWKS client for fetching signing keys (injectable for testing)
   */
  constructor(
    private config: JWTValidatorConfig,
    private logger: Logger,
    jwksClient?: JwksClient  // ✅ Optional injection
  ) {
    // Use provided client or create default
    this.jwksClient = jwksClient || jwksRsa({
      cache: true,
      cacheMaxAge: 86400000,
      jwksUri: config.jwksUri,
    });
  }
}
```

**Test Update Required**:
```typescript
// ✅ CORRECT: Inject mock JWKS client
const mockJwksClient = {
  getSigningKey: jest.fn().mockImplementation((kid, callback) => {
    callback(null, { getPublicKey: () => 'mock-public-key' });
  }),
} as unknown as JwksClient;

const validator = new JWTValidator(config, mockLogger, mockJwksClient);
```

---

### Issue #3: 🟡 Config Safety - NaN Risk

**Severity**: MEDIUM - Can cause unpredictable behavior in production

**What's Wrong**: Direct `parseInt` on environment variables without NaN handling:

```typescript
// ❌ RISKY: NaN if env var is invalid string
mcpRead: parseInt(process.env.MCP_READ_TIMEOUT_MS || '5000'),
```

**Impact**: If `MCP_READ_TIMEOUT_MS` is set to `"five-seconds"` (invalid), `parseInt` returns `NaN`, causing:
- Axios timeouts to fail immediately or behave unpredictably
- Silent failures that are hard to debug

**REQUIRED FIX**: Add safe parsing helper:

```typescript
/**
 * Safely parse integer from string with fallback to default.
 * Returns defaultVal if parsing fails or results in NaN.
 */
const safeParseInt = (val: string | undefined, defaultVal: number): number => {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

// Usage
export const config = {
  timeouts: {
    mcpRead: safeParseInt(process.env.MCP_READ_TIMEOUT_MS, 5000),
    mcpWrite: safeParseInt(process.env.MCP_WRITE_TIMEOUT_MS, 30000),
    claudeApi: safeParseInt(process.env.CLAUDE_API_TIMEOUT_MS, 120000),
  },
};
```

---

### Updated JWTValidator Implementation

With all fixes applied, here is the corrected `src/auth/jwt-validator.ts`:

```typescript
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwksRsa, { JwksClient } from 'jwks-rsa';
import { Logger } from 'winston';

export interface JWTValidatorConfig {
  issuer: string;
  audience: string[];
  jwksUri: string;
  clientId: string;  // For resource_access lookup
}

export interface ValidatedToken {
  userId: string;
  username: string;
  roles: string[];
  email?: string;
  jti?: string;
}

export class JWTValidator {
  private jwksClient: JwksClient;

  constructor(
    private config: JWTValidatorConfig,
    private logger: Logger,
    jwksClient?: JwksClient  // Injectable for testing
  ) {
    this.jwksClient = jwksClient || jwksRsa({
      cache: true,
      cacheMaxAge: 86400000,
      jwksUri: config.jwksUri,
    });
  }

  async validate(token: string): Promise<ValidatedToken> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.jwksClient.getSigningKey(header.kid, (err, key) => {
            if (err) {
              this.logger.error('Failed to get signing key', { error: err.message });
              return callback(err);
            }
            callback(null, key?.getPublicKey());
          });
        },
        {
          issuer: this.config.issuer,
          audience: this.config.audience,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) {
            this.logger.warn('JWT validation failed', { error: err.message });
            return reject(err);
          }

          const payload = decoded as JwtPayload;

          // CRITICAL: Merge realm roles AND client roles
          const realmRoles = payload.realm_access?.roles || [];
          const clientRoles = payload.resource_access?.[this.config.clientId]?.roles || [];
          const combinedRoles = Array.from(new Set([...realmRoles, ...clientRoles]));

          resolve({
            userId: payload.sub || '',
            username: payload.preferred_username || '',
            roles: combinedRoles,
            email: payload.email,
            jti: payload.jti,
          });
        }
      );
    });
  }
}
```

---

### Updated Test for JWTValidator

```typescript
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { JWTValidator, JWTValidatorConfig } from '../../src/auth/jwt-validator';
import { createMockLogger } from '../test-utils/mock-logger';

describe('JWTValidator', () => {
  let validator: JWTValidator;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockJwksClient: jest.Mocked<JwksClient>;

  const config: JWTValidatorConfig = {
    issuer: 'https://keycloak.example.com/realms/test',
    audience: ['mcp-gateway'],
    jwksUri: 'https://keycloak.example.com/realms/test/protocol/openid-connect/certs',
    clientId: 'mcp-gateway',  // For resource_access lookup
  };

  beforeEach(() => {
    mockLogger = createMockLogger();

    // ✅ CORRECT: Inject mock JWKS client
    mockJwksClient = {
      getSigningKey: jest.fn(),
    } as unknown as jest.Mocked<JwksClient>;

    validator = new JWTValidator(config, mockLogger, mockJwksClient);
  });

  describe('validate', () => {
    it('should merge realm and client roles', async () => {
      // Setup mock signing key
      const mockKey = { getPublicKey: () => 'test-public-key' };
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, mockKey as any);
      });

      // Create token with both realm and client roles
      const payload = {
        sub: 'user-123',
        preferred_username: 'alice',
        realm_access: { roles: ['realm-role'] },
        resource_access: {
          'mcp-gateway': { roles: ['hr-read', 'hr-write'] },
        },
        iss: config.issuer,
        aud: config.audience,
      };

      // Mock jwt.verify to return our payload
      jest.spyOn(jwt, 'verify').mockImplementation((token, getKey, options, callback) => {
        (callback as Function)(null, payload);
      });

      const result = await validator.validate('test-token');

      // Should have BOTH realm and client roles
      expect(result.roles).toContain('realm-role');
      expect(result.roles).toContain('hr-read');
      expect(result.roles).toContain('hr-write');
      expect(result.roles).toHaveLength(3);
    });

    it('should handle missing resource_access gracefully', async () => {
      const mockKey = { getPublicKey: () => 'test-public-key' };
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, mockKey as any);
      });

      const payload = {
        sub: 'user-123',
        preferred_username: 'bob',
        realm_access: { roles: ['user'] },
        // No resource_access
        iss: config.issuer,
        aud: config.audience,
      };

      jest.spyOn(jwt, 'verify').mockImplementation((token, getKey, options, callback) => {
        (callback as Function)(null, payload);
      });

      const result = await validator.validate('test-token');

      expect(result.roles).toEqual(['user']);
    });
  });
});
```

---

### Pre-Implementation Checklist (Updated)

Before starting any refactoring work, verify:

- [ ] Read this entire REFACTORING_PLAN.md (all **6** addendums)
- [ ] Understand the client roles fix (Issue #1, **Addendum #5**)
- [ ] Understand the JWKS client injection pattern (Issue #2, **Addendum #5**)
- [ ] Add `safeParseInt` helper before using config values (Issue #3, **Addendum #5**)
- [ ] Implement SSE heartbeat in Phase 3 (**Addendum #6** - Critical)
- [ ] Run `npm test` locally - all tests pass
- [ ] Run `npm run typecheck` - no errors
- [ ] Run `npm run lint` - no errors

---

## ADDENDUM #6: QA Review Findings (2026-01-02)

**Source**: QA Lead Review (`REFACTORING_REVIEW.md`)
**Status**: Approved with conditions

### Overview

QA review identified 1 critical gap, 3 high-priority gaps, 2 medium gaps, and 5 improvement opportunities. Two initially identified gaps (Redis failure, rate limiting) were found to already be addressed by existing architecture.

| Category | Count | Action |
|----------|-------|--------|
| Critical | 1 | Must fix in Phase 3 |
| High-Priority | 3 | Should fix during implementation |
| Medium | 2 | Nice-to-have |
| Improvements | 5 | Optimization opportunities |
| Already Resolved | 2 | No action needed |

---

### Critical: SSE Heartbeat/Keep-Alive (Phase 3)

**Problem**: Long-running Claude queries (30-60s) send no heartbeats. Proxies/load balancers may timeout.

**Impact**:
- Nginx default timeout: 60s → Connection dropped mid-query
- Kong proxy timeout: 60s → 504 Gateway Timeout
- Client cannot distinguish "thinking" from "dead connection"

**Required Implementation** (add to `streaming.routes.ts`):

```typescript
router.post('/api/query', async (req: Request, res: Response) => {
  // ... existing setup ...

  // Add heartbeat every 15 seconds during stream
  let heartbeatInterval: NodeJS.Timeout;

  try {
    heartbeatInterval = setInterval(() => {
      if (!streamClosed) {
        res.write(': heartbeat\n\n');  // SSE comment (client ignores)
        if (res.flush) res.flush();
      }
    }, 15000);

    for await (const event of generator) {
      // ... existing streaming logic ...
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
});
```

**Test Required**:
```typescript
it('should send heartbeat every 15 seconds during long queries', async () => {
  // Mock slow Claude response (20+ seconds)
  // Verify heartbeat comments received
  // Verify connection stays alive
});
```

---

### High-Priority: Graceful Shutdown (Phase 4)

**Problem**: No connection draining during deploys. Active SSE streams may be dropped abruptly.

**Required Implementation**:

```typescript
// Track active SSE connections
const activeConnections = new Set<Response>();

// In streaming route
router.post('/api/query', (req, res) => {
  activeConnections.add(res);
  res.on('close', () => activeConnections.delete(res));
  // ...
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down, draining connections...');

  // Stop accepting new connections
  server.close();

  // Send close to all SSE clients
  for (const res of activeConnections) {
    res.write('data: {"type":"shutdown"}\n\n');
    res.end();
  }

  // Wait for active requests (max 30s)
  await new Promise(r => setTimeout(r, 30000));
  process.exit(0);
});
```

---

### High-Priority: MCP Retry Logic (Phase 2.2 or Post-Refactor)

**Problem**: Single attempt to MCP servers. Network glitches cause immediate failure.

**Recommendation**: Add exponential backoff for transient errors:

```typescript
async queryWithRetry(
  server: MCPServerConfig,
  query: string,
  userContext: UserContext,
  options: { maxRetries?: number } = {}
): Promise<MCPQueryResult> {
  const { maxRetries = 3 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.query(server, query, userContext, options);
    } catch (error) {
      if (!this.isRetryable(error) || attempt === maxRetries) throw error;
      await this.delay(Math.pow(2, attempt) * 100); // 200ms, 400ms, 800ms
    }
  }
}

private isRetryable(error: Error): boolean {
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
  return retryableCodes.includes(error.code) ||
         [502, 503, 504].includes(error.response?.status);
}
```

---

### High-Priority: Type Coverage CI Enforcement (Phase 4)

**Problem**: 85% type coverage target has no CI enforcement.

**Required**: Add to `.github/workflows/ci.yml`:

```yaml
- name: Check type coverage
  run: |
    cd services/mcp-gateway
    npx type-coverage --at-least 85 --detail
```

---

### Medium: Memory Leak Testing (Post-Refactor)

**Problem**: AsyncGenerator + AbortController patterns can leak memory if not properly cleaned up.

**Recommendation**: Add stress test:

```typescript
it('should not leak memory on 1000 aborted streams', async () => {
  const initialMemory = process.memoryUsage().heapUsed;

  for (let i = 0; i < 1000; i++) {
    const controller = new AbortController();
    const generator = streamingService.executeQuery('test', userContext, [], controller.signal);
    await generator.next();
    controller.abort();
  }

  global.gc(); // Requires --expose-gc flag
  const finalMemory = process.memoryUsage().heapUsed;
  expect(finalMemory - initialMemory).toBeLessThan(10 * 1024 * 1024); // <10MB growth
});
```

---

### Medium: Health Check Dependency Matrix (Post-Refactor)

**Problem**: `/health` endpoint behavior unclear when dependencies are down.

**Recommendation**: Define and test health check matrix:

| Scenario | Expected Status |
|----------|-----------------|
| All healthy | `healthy` |
| Redis down | `degraded` (fail-open) |
| Keycloak JWKS down | `degraded` |
| One MCP server down | `healthy` (non-critical) |
| All down | `unhealthy` |

---

### Improvement: Mock Factory Structure (Phase 1)

Create `tests/test-utils/` structure BEFORE writing tests:

```
tests/test-utils/
├── mock-logger.ts       # Winston mock
├── mock-user-context.ts # With TEST_USERS constant
├── mock-jwt-validator.ts
├── mock-mcp-client.ts
├── mock-redis.ts
└── index.ts             # Re-exports all
```

---

### Improvement: Integration Test Matrix (Phase 4)

Define explicit test scenarios:

| Scenario | User | Query | Expected |
|----------|------|-------|----------|
| HR read success | alice.chen | "List employees" | 200 + data |
| Cross-domain denied | alice.chen | "Show invoices" | 403 |
| SSE stream complete | bob.martinez | "Analyze revenue" | SSE events |
| SSE client disconnect | any | Long query | Clean abort |
| Confirmation approve | alice.chen | "Delete employee X" | pending → success |
| Confirmation reject | alice.chen | "Delete employee X" | pending → cancelled |
| Token expired | expired_token | Any | 401 |
| Token revoked | revoked_jti | Any | 401 |

---

### Improvement: Performance Baseline (Phase 4)

Capture before/after metrics:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Cold start time | TBD | TBD | <2s |
| Auth middleware latency | TBD | TBD | <10ms |
| MCP query P50 | TBD | TBD | <500ms |
| SSE first byte | TBD | TBD | <200ms |

---

### Improvement: Error Code Taxonomy

Create centralized error codes:

```typescript
// src/errors/error-codes.ts
export const ERROR_CODES = {
  AUTH_MISSING_TOKEN: { code: 'AUTH_1001', http: 401 },
  AUTH_INVALID_TOKEN: { code: 'AUTH_1002', http: 401 },
  AUTH_TOKEN_REVOKED: { code: 'AUTH_1003', http: 401 },
  AUTH_INSUFFICIENT_ROLES: { code: 'AUTH_1004', http: 403 },
  MCP_SERVER_TIMEOUT: { code: 'MCP_2001', http: 504 },
  MCP_SERVER_ERROR: { code: 'MCP_2002', http: 502 },
  CLAUDE_API_ERROR: { code: 'CLAUDE_3001', http: 500 },
} as const;
```

---

### Improvement: Observability Hooks (Post-Refactor)

Add OpenTelemetry-ready instrumentation points:

```typescript
const metrics = {
  'gateway.requests.total': Counter,
  'gateway.requests.duration_ms': Histogram,
  'gateway.sse.connections.active': Gauge,
  'gateway.sse.connections.aborted': Counter,
  'gateway.mcp.queries.total': Counter,
  'gateway.auth.revocations.total': Counter,
};
```

---

### Already Resolved (No Action Needed)

1. **Redis Connection Failure**: Addressed by v1.5 `CachedTokenRevocation` with local cache and fail-open strategy (`src/utils/redis.ts:57-178`)

2. **Rate Limiting**: Handled at Kong Gateway layer (`infrastructure/docker/kong/kong.yml:126-135`) - correct architectural placement

---

### Updated Phase Checklist

**Phase 1** (add):
- [ ] Create `tests/test-utils/` mock factory structure

**Phase 3** (add):
- [ ] Implement SSE heartbeat every 15 seconds (CRITICAL)
- [ ] Add heartbeat test

**Phase 4** (add):
- [ ] Implement graceful shutdown with connection draining
- [ ] Add type coverage check to CI (`npx type-coverage --at-least 85`)
- [ ] Document integration test matrix
- [ ] Capture performance baseline

**Post-Refactor** (optional):
- [ ] Add MCP retry logic with exponential backoff
- [ ] Add memory leak stress tests
- [ ] Implement health check dependency matrix
- [ ] Add error code taxonomy
- [ ] Add observability instrumentation

---

**Last Updated**: 2026-01-02 (QA Review Integration)
