# Tasks: MCP Core Gateway

## Group 1: Project Foundation (Completed)
- [x] Create `services/mcp-gateway` directory structure. [P]
- [x] Initialize npm project with TypeScript configuration. [P]
- [x] Install dependencies (@anthropic-ai/sdk, express, jsonwebtoken, etc.). [P]
- [x] Configure ESLint with TypeScript rules. [P]
- [x] Create Dockerfile with multi-stage build. [P]
- [x] Add mcp-gateway service to docker-compose.yml. [P]

## Group 2: JWT Authentication
- [x] Initialize jwks-rsa client pointing to Keycloak. [P]
- [x] Implement JWT validation middleware in src/middleware/auth.ts. [P]
- [x] Verify token signature using JWKS. [P]
- [x] Check token expiration and issuer claims. [P]
- [ ] Connect to Redis on application startup. [P]
- [ ] Implement token revocation check in src/security/token-revocation.ts. [P]
- [ ] Query Redis for `revoked:{jti}` before accepting token. [P]
- [ ] Cache negative lookups for 60 seconds. [P]
- [ ] Handle Redis connection failures gracefully. [P]
- [x] Extract roles from `resource_access.mcp-gateway.roles` claim. [P]
- [x] Handle missing or malformed role claims. [P]

## Group 3: Role-Based Routing
- [ ] Define `ROLE_TO_MCP` mapping in src/routing/mcp-registry.ts. [P]
- [ ] Implement `getAccessibleMcpServers(roles: string[])` function. [P]
- [ ] Handle composite roles (executive gets all servers). [P]
- [ ] Resolve MCP server URLs from environment variables. [P]
- [ ] Implement MCP server health check endpoint. [P]
- [ ] Add retry logic for unavailable MCP servers. [P]
- [ ] Log MCP server routing decisions. [P]

## Group 4: Prompt Injection Defense
- [ ] Create `src/security/prompt-defense.ts` module. [P]
- [ ] Implement input length validation (max 10,000 chars). [P]
- [ ] Implement character whitelist validation. [P]
- [ ] Create keyword blocklist (ignore, system, jailbreak, etc.). [P]
- [ ] Implement case-insensitive pattern matching. [P]
- [ ] Wrap user input in XML delimiter tags. [P]
- [ ] Escape existing XML in user input. [P]
- [ ] Add security rules to Claude system prompt. [P]
- [ ] Implement output validation to detect system prompt leakage. [P]
- [ ] Log all blocked prompt injection attempts. [P]

## Group 5: Claude API Integration (v1.4 Updated)
- [x] Initialize Anthropic SDK client with API key. [P]
- [ ] **[v1.4] Implement SSE streaming (Section 6.1):** Set headers (text/event-stream, no-cache, keep-alive). [P]
- [ ] **[v1.4] Stream Claude responses** as `data: {json}\n\n` format. [P]
- [ ] **[v1.4] Send completion marker** `data: [DONE]\n\n` when stream ends. [P]
- [ ] **[v1.4] Prevent timeouts** during 30-60 second AI reasoning pauses. [P]
- [ ] Build tool definitions from available MCP servers. [P]
- [ ] Map MCP server tools to Claude tools format. [P]
- [ ] Implement tool execution via MCP protocol. [P]
- [ ] **[v1.4] Check for truncation metadata** in MCP tool responses. [P]
- [ ] **[v1.4] Inject truncation warning** when metadata.truncated = true (Section 5.3). [P]
- [ ] Aggregate multi-tool responses. [P]
- [ ] Handle Claude API rate limits with exponential backoff. [P]
- [ ] Handle Claude API timeouts gracefully. [P]

## Group 6: Audit Logging
- [x] Configure Winston logger with JSON format. [P]
- [x] Set up console and file transports. [P]
- [ ] Implement PII scrubbing for logged queries. [P]
- [ ] Log every AI query with user context (userId, roles, query). [P]
- [ ] Log MCP servers accessed for each query. [P]
- [ ] Log prompt injection attempts with details. [P]
- [ ] Log token validation failures. [P]
- [ ] Log unauthorized access attempts. [P]
- [ ] Log request duration and latency metrics. [P]
- [ ] Add request ID to all log entries for tracing. [P]

## Group 7: API Endpoints
- [x] Implement `POST /api/query` endpoint. [P]
- [x] Accept JSON body with `query` field. [P]
- [ ] Apply JWT validation middleware. [P]
- [ ] Apply prompt injection defense. [P]
- [ ] Call Claude API with role-based MCP tools. [P]
- [ ] Stream response to client. [P]
- [x] Implement `GET /health` endpoint. [P]
- [x] Check Redis connection in health check. [P]
- [ ] Check Keycloak JWKS availability in health check. [P]
- [ ] Implement `POST /api/revoke` endpoint for admin token revocation. [P]
- [ ] Require executive or admin role for revocation endpoint. [P]
- [ ] **[v1.4] Implement `POST /api/confirm/:id`** endpoint (Section 5.6). [P]
- [ ] **[v1.4] Retrieve pending action** from Redis using confirmationId. [P]
- [ ] **[v1.4] Verify user ownership** of confirmation (userId match). [P]
- [ ] **[v1.4] Execute or cancel** action based on approval/denial. [P]
- [ ] **[v1.4] Set 5-minute TTL** on pending confirmations in Redis. [P]
- [ ] **[v1.4] Audit log** all confirmation outcomes (approved/denied). [P]

## Group 8: Error Handling
- [ ] Implement global error handler middleware. [P]
- [ ] Return 500 for unexpected errors (never expose internal details). [P]
- [ ] Log full error stack for debugging. [P]
- [ ] Implement circuit breaker for MCP servers. [P]
- [ ] Disable failing MCP servers temporarily. [P]
- [ ] Auto-recover after cooldown period. [P]
- [ ] Implement graceful shutdown on SIGTERM. [P]
- [ ] Close Redis connection on shutdown. [P]
- [ ] Wait for in-flight requests to complete. [P]

## Group 9: Integration Testing
- [ ] Install Jest and Supertest for testing. [P]
- [ ] Create test configuration in jest.config.js. [P]
- [ ] Create `tests/integration/auth.test.ts`. [P]
- [ ] Test valid JWT (expect 200). [P]
- [ ] Test expired JWT (expect 401). [P]
- [ ] Test invalid signature (expect 401). [P]
- [ ] Test missing Authorization header (expect 401). [P]
- [ ] Create `tests/integration/routing.test.ts`. [P]
- [ ] Test hr-read role routes to MCP HR only. [P]
- [ ] Test executive role routes to all MCP servers. [P]
- [ ] Test intern role has minimal access. [P]
- [ ] Create `tests/integration/prompt-defense.test.ts`. [P]
- [ ] Test injection attempts are blocked. [P]
- [ ] Test legitimate queries are allowed. [P]
- [ ] Create `tests/integration/e2e.test.ts`. [P]
- [ ] Test full query flow with real Keycloak and Redis. [P]
- [ ] **[v1.4] Create `tests/integration/sse.test.ts`** for SSE streaming tests. [P]
- [ ] **[v1.4] Test SSE stream** doesn't timeout during 60-second AI reasoning. [P]
- [ ] **[v1.4] Test truncation warning injection** when >50 records returned. [P]
- [ ] **[v1.4] Create `tests/integration/confirmation.test.ts`** for HITL tests. [P]
- [ ] **[v1.4] Test confirmation flow:** pending → approve → execute. [P]
- [ ] **[v1.4] Test confirmation flow:** pending → deny → cancel. [P]
- [ ] **[v1.4] Test confirmation expiration** (5-minute TTL). [P]

## Group 10: Documentation
- [ ] Add JSDoc comments to all public functions. [P]
- [ ] Document API endpoints in OpenAPI spec (future). [P]
- [ ] Update CLAUDE.md with MCP Gateway instructions. [P]
- [ ] Create troubleshooting guide for common issues. [P]
- [ ] Document environment variables in README. [P]

## Status
**CURRENT ⚡** - Core implementation at 473 lines; v1.4 updates in progress (SSE, truncation, confirmation endpoint).

## Architecture Version
**Updated for**: v1.4 (December 2024)
**v1.4 Tasks Added**: 15 new tasks across Groups 5, 7, and 9 for SSE streaming, truncation warnings, and human-in-the-loop confirmations.
