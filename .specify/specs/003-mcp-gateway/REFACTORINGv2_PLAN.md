# MCP Gateway Refactoring Plan v2
## Reducing index.ts to Enable Full Test Coverage

**Status**: DRAFT - Pending Review
**Created**: 2026-01-02
**Author**: Claude (Anthropic)
**Predecessor**: REFACTORING_PLAN.md (Phase 1-4 Complete)

---

## Executive Summary

Phase 1-4 of the original refactoring plan successfully:
- Extracted 8 modules with 95%+ test coverage
- Reduced index.ts from 1,533 to 1,323 lines (~210 lines removed)
- Achieved 64% overall coverage (415 tests)
- Achieved 97.19% type coverage

**Problem**: index.ts still contains 1,323 lines with 0% coverage, dragging down overall metrics.

**Goal**: Reduce index.ts to ~400 lines (pure wiring) by extracting remaining business logic into testable modules.

**Target Metrics**:
- index.ts: 1,323 lines → ~400 lines
- Overall coverage: 64% → 80%+
- All extracted modules: 90%+ coverage

---

## Current State Analysis

### index.ts Structure (1,323 lines)

| Section | Lines | Size | Extractable | Priority |
|---------|-------|------|-------------|----------|
| Imports & Config | 1-135 | 135 | No | - |
| MCP Server Configs | 136-201 | 65 | Partially | Low |
| **JWT Validation (DUPLICATE)** | 203-300 | **97** | **Yes - DELETE** | **Critical** |
| MCP Query Function | 302-480 | **178** | **Yes** | **High** |
| Claude Integration | 482-556 | **74** | **Yes** | Medium |
| Express App Setup | 559-670 | 111 | Partially | Low |
| AI Query Route | 691-782 | **91** | **Yes** | **High** |
| Audit Route | 782-787 | 5 | No | - |
| Streaming Routes | 789-815 | 26 | Already done | - |
| Confirmation Route | 823-930 | **107** | **Yes** | **High** |
| MCP Proxy Routes | 944-1195 | **251** | **Yes** | **High** |
| GDPR Placeholder | 1203-1220 | 17 | Delete (duplicate) | Low |
| Server Startup | 1231-1323 | 92 | Partially | Low |

**Total Extractable**: ~798 lines
**Remaining After Extraction**: ~525 lines (mostly wiring)

---

## Phase 5: Remove Duplicated Code

**Goal**: Delete code that was extracted in Phase 1-4 but left in place for backwards compatibility.
**Estimated Time**: 1-2 hours
**Risk**: Low (code already tested elsewhere)

### 5.1 Remove Duplicate JWT Validation (~97 lines)

**Problem**: Lines 203-300 duplicate `JWTValidator` class functionality.

**Current State**:
```typescript
// index.ts - DUPLICATE CODE
const jwksClient = jwksRsa({...});
function getSigningKey(header, callback) {...}
async function validateToken(token): Promise<UserContext> {...}

// Already exists in auth/jwt-validator.ts
export class JWTValidator {
  async validateToken(token: string): Promise<UserContext> {...}
}
```

**Action**:
1. Delete lines 203-300 (jwksClient, getSigningKey, validateToken)
2. Update export to use jwtValidator instance method
3. Update any tests that import `validateToken` directly

**Migration Path**:
```typescript
// Before
import { validateToken } from './index';
const user = await validateToken(token);

// After
import { jwtValidator } from './index';
const user = await jwtValidator.validateToken(token);
```

**Acceptance Criteria**:
- [ ] Duplicate code removed
- [ ] All tests pass
- [ ] Export compatibility maintained or migration documented

---

### 5.2 Remove GDPR Placeholder Routes (~17 lines)

**Problem**: Lines 1203-1220 are placeholder stubs; real implementation is in `routes/gdpr.ts`.

**Action**: Delete placeholder routes (already mounted via `gdprRoutes`).

---

## Phase 6: Extract MCP Query Service

**Goal**: Extract `queryMCPServer` function into testable service.
**Estimated Time**: 3-4 hours
**Risk**: Medium (critical path for AI queries)

### 6.1 Create MCP Query Service (~178 lines)

**File**: `src/mcp/mcp-query.ts`

**Current State** (index.ts lines 332-480):
```typescript
async function queryMCPServer(
  server: MCPServerConfig,
  query: string,
  userContext: UserContext,
  cursor?: string,
  autoPaginate: boolean = true,
  isWriteOperation: boolean = false
): Promise<MCPQueryResult> {
  // 148 lines of pagination, timeout, error handling
}
```

**Target Implementation**:
```typescript
// src/mcp/mcp-query.ts
export interface MCPQueryServiceConfig {
  timeouts: { mcpRead: number; mcpWrite: number };
  logger: Logger;
}

export interface MCPQueryService {
  query(
    server: MCPServerConfig,
    query: string,
    userContext: UserContext,
    options?: { cursor?: string; autoPaginate?: boolean; isWrite?: boolean }
  ): Promise<MCPQueryResult>;
}

export function createMCPQueryService(
  config: MCPQueryServiceConfig,
  httpClient?: AxiosInstance  // DI for testing
): MCPQueryService {
  return {
    async query(server, query, userContext, options = {}) {
      // Extracted logic with full test coverage
    }
  };
}
```

**Test Cases**:
```typescript
describe('MCPQueryService', () => {
  describe('query', () => {
    it('should query MCP server successfully');
    it('should handle timeout with graceful degradation');
    it('should paginate automatically when autoPaginate=true');
    it('should stop pagination when autoPaginate=false');
    it('should use longer timeout for write operations');
    it('should handle network errors');
    it('should handle malformed responses');
    it('should include timing metrics in response');
    it('should propagate user context to MCP server');
    it('should handle 401/403 from MCP server');
  });
});
```

**Acceptance Criteria**:
- [ ] 95%+ test coverage on extracted module
- [ ] All existing integration tests pass
- [ ] Timeout behavior verified
- [ ] Pagination behavior verified

---

## Phase 7: Extract Route Handlers

**Goal**: Extract remaining inline route handlers into testable route modules.
**Estimated Time**: 6-8 hours
**Risk**: Medium (affects API contracts)

### 7.1 Extract AI Query Route (~91 lines)

**File**: `src/routes/ai-query.routes.ts`

**Current State** (index.ts lines 691-782):
```typescript
app.post('/api/ai/query', authMiddleware, aiQueryLimiter, async (req, res) => {
  // 91 lines: MCP orchestration, Claude call, response formatting
});
```

**Target Implementation**:
```typescript
// src/routes/ai-query.routes.ts
export interface AIQueryRoutesDependencies {
  logger: Logger;
  mcpQueryService: MCPQueryService;
  claudeClient: ClaudeClient;
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
}

export function createAIQueryRoutes(deps: AIQueryRoutesDependencies): Router {
  const router = Router();

  router.post('/ai/query', async (req, res) => {
    // Extracted logic
  });

  return router;
}
```

**Test Cases**:
- [ ] Should reject unauthenticated requests
- [ ] Should query accessible MCP servers only
- [ ] Should handle partial MCP failures gracefully
- [ ] Should format Claude response correctly
- [ ] Should include request timing in response
- [ ] Should handle Claude API errors
- [ ] Should validate request body

---

### 7.2 Extract Confirmation Route (~107 lines)

**File**: `src/routes/confirmation.routes.ts`

**Current State** (index.ts lines 823-930):
```typescript
app.post('/api/confirm/:confirmationId', authMiddleware, async (req, res) => {
  // 107 lines: Redis lookup, action execution, cleanup
});
```

**Target Implementation**:
```typescript
// src/routes/confirmation.routes.ts
export interface ConfirmationRoutesDependencies {
  logger: Logger;
  getPendingConfirmation: (id: string) => Promise<PendingAction | null>;
  deletePendingConfirmation: (id: string) => Promise<void>;
  executeAction: (action: PendingAction) => Promise<unknown>;
}

export function createConfirmationRoutes(deps: ConfirmationRoutesDependencies): Router {
  const router = Router();

  router.post('/confirm/:confirmationId', async (req, res) => {
    // Extracted logic
  });

  return router;
}
```

**Test Cases**:
- [ ] Should reject unauthenticated requests
- [ ] Should return 404 for expired/missing confirmations
- [ ] Should execute action when approved=true
- [ ] Should cancel action when approved=false
- [ ] Should clean up Redis after execution
- [ ] Should validate user owns the confirmation
- [ ] Should handle execution failures

---

### 7.3 Extract MCP Proxy Routes (~251 lines)

**File**: `src/routes/mcp-proxy.routes.ts`

**Current State** (index.ts lines 944-1195):
```typescript
app.get('/api/mcp/:serverName/:toolName', authMiddleware, async (req, res) => {
  // 140 lines: server lookup, tool invocation, response
});

app.post('/api/mcp/:serverName/:toolName', authMiddleware, async (req, res) => {
  // 111 lines: server lookup, tool invocation with body
});
```

**Target Implementation**:
```typescript
// src/routes/mcp-proxy.routes.ts
export interface MCPProxyRoutesDependencies {
  logger: Logger;
  mcpServers: MCPServerConfig[];
  getAccessibleServers: (roles: string[]) => MCPServerConfig[];
  invokeTool: (server: MCPServerConfig, tool: string, params: unknown) => Promise<unknown>;
}

export function createMCPProxyRoutes(deps: MCPProxyRoutesDependencies): Router {
  const router = Router();

  router.get('/mcp/:serverName/:toolName', async (req, res) => {...});
  router.post('/mcp/:serverName/:toolName', async (req, res) => {...});

  return router;
}
```

**Test Cases**:
- [ ] Should reject unauthenticated requests
- [ ] Should return 404 for unknown server
- [ ] Should return 403 for unauthorized server access
- [ ] Should invoke tool with query params (GET)
- [ ] Should invoke tool with body params (POST)
- [ ] Should handle tool execution errors
- [ ] Should validate tool name format
- [ ] Should propagate user context

---

## Phase 8: Extract Claude Integration

**Goal**: Extract `sendToClaudeWithContext` into claude-query service.
**Estimated Time**: 2-3 hours
**Risk**: Low (already have claude-client.ts foundation)

### 8.1 Extend Claude Client (~74 lines)

**File**: `src/ai/claude-client.ts` (extend existing)

**Current State** (index.ts lines 490-556):
```typescript
async function sendToClaudeWithContext(
  dataContext: string,
  query: string,
  userContext: UserContext,
  paginationInfo?: PaginationInfo[],
  truncationWarnings?: string[]
): Promise<string> {
  // System prompt building, Claude API call
}
```

**Action**: Move system prompt building logic into ClaudeClient class.

```typescript
// src/ai/claude-client.ts (extended)
export class ClaudeClient {
  // Existing methods...

  async queryWithContext(
    dataContext: string,
    query: string,
    userContext: UserContext,
    options?: {
      paginationInfo?: PaginationInfo[];
      truncationWarnings?: string[];
    }
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(userContext, dataContext, options);
    return this.query(systemPrompt, query);
  }

  private buildSystemPrompt(
    userContext: UserContext,
    dataContext: string,
    options?: {...}
  ): string {
    // Extracted prompt building logic
  }
}
```

**Test Cases**:
- [ ] Should build correct system prompt with user context
- [ ] Should include pagination instructions when provided
- [ ] Should include truncation warnings when provided
- [ ] Should handle empty data context
- [ ] Should format roles correctly in prompt

---

## Phase 9: Extract App Setup (Optional)

**Goal**: Extract Express middleware setup for cleaner architecture.
**Estimated Time**: 2 hours
**Risk**: Low
**Priority**: Nice-to-have

### 9.1 Create App Factory

**File**: `src/app.ts`

```typescript
// src/app.ts
export interface AppConfig {
  corsOrigins: string[];
  rateLimits: { general: number; aiQuery: number };
  enableOpenAPI: boolean;
}

export function createApp(config: AppConfig, logger: Logger): Express {
  const app = express();

  // Helmet security headers
  app.use(helmet({...}));

  // CORS
  app.use(cors({...}));

  // Rate limiting
  app.use('/api/', createRateLimiter(config.rateLimits.general));

  // OpenAPI docs
  if (config.enableOpenAPI) {
    setupOpenAPI(app);
  }

  return app;
}
```

---

## Implementation Schedule

| Phase | Description | Lines Removed | Cumulative | Priority |
|-------|-------------|---------------|------------|----------|
| 5.1 | Remove duplicate JWT validation | 97 | 97 | **Critical** |
| 5.2 | Remove GDPR placeholder | 17 | 114 | Low |
| 6.1 | Extract MCP Query Service | 178 | 292 | **High** |
| 7.1 | Extract AI Query Route | 91 | 383 | **High** |
| 7.2 | Extract Confirmation Route | 107 | 490 | **High** |
| 7.3 | Extract MCP Proxy Routes | 251 | 741 | **High** |
| 8.1 | Extend Claude Client | 74 | 815 | Medium |
| 9.1 | Extract App Setup | ~80 | 895 | Low |

**Projected index.ts after Phase 7**: ~430 lines (wiring + server startup)
**Projected index.ts after Phase 9**: ~350 lines

---

## Success Metrics

| Metric | Current | After Phase 7 | After Phase 9 |
|--------|---------|---------------|---------------|
| index.ts lines | 1,323 | ~430 | ~350 |
| index.ts coverage | 0% | 0% (but smaller) | 0% (minimal) |
| Overall coverage | 64% | 78%+ | 82%+ |
| Extracted modules | 8 | 12 | 13 |
| Tests | 415 | 500+ | 520+ |

---

## Risk Assessment

### High Risk Items
1. **MCP Query Service extraction**: Critical path for all AI queries
   - Mitigation: Extensive integration testing before/after

2. **Route extraction**: Changes request handling
   - Mitigation: Keep existing integration tests, add route-specific unit tests

### Medium Risk Items
1. **Breaking backwards compatibility**: `validateToken` export removal
   - Mitigation: Document migration path, update all callers

### Low Risk Items
1. **Claude client extension**: Additive change
2. **App setup extraction**: Internal refactoring only

---

## Dependencies

1. **Phase 5 depends on**: Nothing (can start immediately)
2. **Phase 6 depends on**: Nothing (can run parallel with Phase 5)
3. **Phase 7 depends on**: Phase 6 (routes use MCPQueryService)
4. **Phase 8 depends on**: Nothing (can run parallel)
5. **Phase 9 depends on**: Nothing (optional, can defer)

---

## Review Checklist

Before implementation, reviewers should verify:

- [ ] **Architecture**: Does extraction pattern match existing modules?
- [ ] **Testing**: Are test cases comprehensive?
- [ ] **Dependencies**: Are dependency injection patterns consistent?
- [ ] **Backwards Compatibility**: Are breaking changes documented?
- [ ] **Performance**: Any concerns with added abstraction layers?
- [ ] **Security**: Does extraction maintain security boundaries?

---

## Appendix A: File Structure After Refactoring

```
src/
├── index.ts                    # ~350 lines (wiring only)
├── app.ts                      # NEW: Express app factory
├── server.ts                   # NEW: Server startup (optional)
├── ai/
│   ├── claude-client.ts        # EXTENDED: queryWithContext
│   └── claude-client.test.ts
├── auth/
│   ├── jwt-validator.ts        # Existing
│   └── jwt-validator.test.ts
├── config/
│   └── index.ts                # Existing
├── mcp/
│   ├── mcp-client.ts           # Existing
│   ├── mcp-query.ts            # NEW: Query orchestration
│   ├── mcp-query.test.ts       # NEW
│   └── role-mapper.ts          # Existing
├── middleware/
│   ├── auth.middleware.ts      # Existing
│   └── auth.middleware.test.ts
├── routes/
│   ├── ai-query.routes.ts      # NEW
│   ├── ai-query.routes.test.ts # NEW
│   ├── confirmation.routes.ts  # NEW
│   ├── confirmation.routes.test.ts # NEW
│   ├── gdpr.ts                 # Existing
│   ├── health.routes.ts        # Existing
│   ├── mcp-proxy.routes.ts     # NEW
│   ├── mcp-proxy.routes.test.ts # NEW
│   ├── streaming.routes.ts     # Existing
│   └── user.routes.ts          # Existing
├── security/
│   ├── prompt-defense.ts       # Existing
│   └── token-revocation.ts     # Existing
├── types/
│   └── mcp-response.ts         # Existing
└── utils/
    ├── gateway-utils.ts        # Existing
    ├── pii-scrubber.ts         # Existing
    └── redis.ts                # Existing
```

---

## Appendix B: Test Coverage Projection

| Module | Current | After Extraction |
|--------|---------|------------------|
| ai/claude-client.ts | 100% | 100% |
| **ai/claude-query.ts** | N/A | 95%+ |
| auth/jwt-validator.ts | 94% | 94% |
| config/index.ts | 100% | 100% |
| mcp/mcp-client.ts | 95% | 95% |
| **mcp/mcp-query.ts** | N/A | 95%+ |
| mcp/role-mapper.ts | 100% | 100% |
| middleware/auth.middleware.ts | 100% | 100% |
| **routes/ai-query.routes.ts** | N/A | 90%+ |
| **routes/confirmation.routes.ts** | N/A | 90%+ |
| routes/gdpr.ts | 90% | 90% |
| routes/health.routes.ts | 100% | 100% |
| **routes/mcp-proxy.routes.ts** | N/A | 90%+ |
| routes/streaming.routes.ts | 87% | 87% |
| routes/user.routes.ts | 100% | 100% |
| security/prompt-defense.ts | 92% | 92% |
| security/token-revocation.ts | 82% | 82% |
| **index.ts** | 0% | 0% (but minimal) |

**Projected Overall**: 78-82% (up from 64%)

---

*Last Updated: 2026-01-02*
*Document Version: 2.0*
