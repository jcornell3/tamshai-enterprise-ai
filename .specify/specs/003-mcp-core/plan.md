# Implementation Plan: MCP Core Gateway

## Phase 1: Project Setup & Dependencies
* [x] **Initialize TypeScript Project:**
    * Create `services/mcp-gateway` directory
    * Initialize npm project with `package.json`
    * Configure TypeScript with strict mode
    * Set up ESLint and Prettier
* [x] **Install Dependencies:**
    * `@anthropic-ai/sdk` - Claude AI integration
    * `@modelcontextprotocol/sdk` - MCP protocol
    * `express` - HTTP server
    * `helmet` - Security headers
    * `jsonwebtoken` + `jwks-rsa` - JWT validation
    * `ioredis` - Redis client for token revocation
    * `winston` - Structured logging
    * `zod` - Schema validation
* [x] **Dockerfile:**
    * Create multi-stage build
    * Base image: node:20-alpine
    * Production optimizations

## Phase 2: JWT Authentication
* [x] **JWKS Client:**
    * Initialize jwks-rsa client with Keycloak URL
    * Cache JWKS keys for performance
    * Auto-refresh on key rotation
* [x] **Token Validation Middleware:**
    * Extract Bearer token from Authorization header
    * Verify token signature using JWKS
    * Check token expiration (exp claim)
    * Validate issuer (iss claim)
    * Validate audience (aud claim)
* [ ] **Token Revocation Check:**
    * Connect to Redis on startup
    * Check `revoked:{jti}` key before accepting token
    * Handle Redis connection failures gracefully
    * Cache negative lookups for performance
* [x] **Role Extraction:**
    * Extract `resource_access.mcp-gateway.roles` from JWT
    * Handle missing or malformed role claims
    * Log extracted roles for audit

## Phase 3: Role-Based Routing
* [ ] **MCP Server Registry:**
    * Define ROLE_TO_MCP mapping
    * Support dynamic MCP server registration (future)
    * Health check for registered MCP servers
* [ ] **Routing Logic:**
    * Implement `getAccessibleMcpServers(roles: string[])` function
    * Handle composite roles (executive)
    * Return empty array if no roles match
* [ ] **MCP Server Discovery:**
    * Resolve MCP server hostnames from environment variables
    * Support both Docker network names and external URLs
    * Implement retry logic for unavailable servers

## Phase 4: Prompt Injection Defense
* [ ] **Input Validation:**
    * Check query length (max 10,000 chars)
    * Validate character set (block control characters)
    * Reject empty queries
* [ ] **Keyword Detection:**
    * Create blocklist: "ignore instructions", "system:", "jailbreak", etc.
    * Case-insensitive pattern matching
    * Allow legitimate use in context (e.g., "system requirements")
* [ ] **Delimiter Wrapping:**
    * Wrap user input in XML tags: `<user_query>...</user_query>`
    * Escape any existing XML in user input
    * Document delimiter strategy
* [ ] **System Prompt Reinforcement:**
    * Add security rules to Claude system prompt
    * Instruct Claude to refuse unauthorized data access
    * Specify output format requirements
* [ ] **Output Validation:**
    * Scan Claude response for system prompt leakage
    * Detect attempts to access restricted data
    * Log and block suspicious responses

## Phase 5: Claude API Integration (v1.4 Updated)
* [x] **Anthropic SDK Setup:**
    * Initialize Anthropic client with API key from env
    * Configure default model (claude-sonnet-4-20250514)
    * Set max_tokens and timeout
* [ ] **SSE Streaming Implementation (v1.4 - Section 6.1):**
    * **CRITICAL**: Use Server-Sent Events (SSE) over HTTP (NOT WebSockets)
    * Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    * Use `messages.stream()` for real-time responses from Claude
    * Stream chunks to client as `data: {json}\n\n` format
    * Send `data: [DONE]\n\n` on completion
    * Prevent timeouts during Claude's multi-step reasoning (30-60 seconds)
    * Implement automatic reconnection on client disconnect
* [ ] **MCP Tools Integration:**
    * Build tool definitions from available MCP servers
    * Map MCP server tools to Claude tools format
    * Handle tool execution via MCP protocol
    * Aggregate multi-tool responses
* [ ] **Truncation Warning Injection (v1.4 - Section 5.3):**
    * Check MCP tool responses for `metadata.truncated` flag
    * If truncated, inject system message: "TRUNCATION WARNING: Only X of Y+ records returned..."
    * Instruct AI to inform user results are incomplete and ask to refine query
    * Enforce Article III.2 (max 50 records) while giving AI context awareness
* [ ] **Error Handling (v1.4 - Section 7.4):**
    * Handle Claude API rate limits (exponential backoff)
    * Handle Claude API timeouts
    * Handle tool execution failures gracefully (don't crash stream)
    * Return structured errors in SSE stream
    * Support LLM-friendly error schemas from MCP servers

## Phase 6: Audit Logging
* [x] **Winston Logger Setup:**
    * Configure structured JSON logging
    * Log to console and file
    * Set log level from environment (default: info)
* [ ] **Query Logging:**
    * Log every AI query with user context
    * Scrub PII from query text before logging
    * Include request ID for tracing
    * Log MCP servers accessed
* [ ] **Security Event Logging:**
    * Log prompt injection attempts
    * Log token validation failures
    * Log unauthorized access attempts
    * Log tool execution errors
* [ ] **Performance Metrics:**
    * Log request duration
    * Log Claude API latency
    * Log MCP server response times
    * Track error rates

## Phase 7: API Endpoints
* [x] **POST /api/query:**
    * Accept JSON body with `query` field
    * Validate JWT token
    * Apply prompt defense
    * Call Claude API with MCP tools
    * Stream response to client
    * Return 200 OK with streaming response
* [x] **GET /health:**
    * Check service status
    * Check Redis connection
    * Check Keycloak JWKS availability
    * Return 200 OK if healthy, 503 if degraded
* [ ] **POST /api/revoke (Admin Only):**
    * Accept token JTI to revoke
    * Store in Redis with TTL
    * Require admin role
    * Log revocation event
* [ ] **POST /api/confirm/:id (v1.4 - Section 5.6):**
    * Accept confirmationId as URL parameter
    * Validate JWT token
    * Retrieve pending action from Redis (`pending:{confirmationId}`)
    * Verify user owns the confirmation (userId match)
    * If approved: execute pending action, delete from Redis, return success
    * If denied: delete from Redis, return cancelled status
    * Set 5-minute TTL on pending actions
    * Audit log all confirmations (approved and denied)

## Phase 8: Error Handling & Resilience
* [ ] **Fail-Secure Defaults:**
    * Return 500 for unexpected errors
    * Never expose internal error details to client
    * Log full error stack for debugging
* [ ] **Circuit Breaker:**
    * Implement circuit breaker for MCP servers
    * Temporarily disable failing MCP servers
    * Auto-recover after cooldown period
* [ ] **Rate Limiting:**
    * Implement per-user rate limiting (handled by Kong)
    * Implement per-IP rate limiting fallback
    * Return 429 Too Many Requests
* [ ] **Graceful Shutdown:**
    * Handle SIGTERM signal
    * Close Redis connection
    * Finish in-flight requests
    * Exit cleanly

## Phase 9: Integration Testing
* [ ] **Test Suite Setup:**
    * Install Jest and Supertest
    * Configure test environment
    * Mock Keycloak JWKS endpoint
    * Mock Redis for tests
* [ ] **JWT Validation Tests:**
    * Test valid JWT (expect 200)
    * Test expired JWT (expect 401)
    * Test invalid signature (expect 401)
    * Test missing Authorization header (expect 401)
* [ ] **Role-Based Routing Tests:**
    * Test hr-read role routes to MCP HR
    * Test executive role routes to all MCP servers
    * Test intern role routes to minimal servers
* [ ] **Prompt Injection Tests:**
    * Test injection attempts are blocked
    * Test legitimate queries are allowed
    * Test edge cases (unicode, long queries)
* [ ] **End-to-End Tests:**
    * Test full query flow with real Keycloak and Redis
    * Test streaming responses
    * Test tool execution
* [ ] **v1.4 Integration Tests:**
    * Test SSE streaming doesn't timeout during long AI reasoning
    * Test truncation warnings are injected when >50 records returned
    * Test confirmation flow: pending → approve → execute
    * Test confirmation flow: pending → deny → cancel
    * Test confirmation expiration (5-minute TTL)

## Phase 10: Docker & Deployment
* [x] **Dockerfile:**
    * Multi-stage build (build + production)
    * Minimize image size (< 200MB)
    * Run as non-root user
* [x] **Docker Compose Integration:**
    * Add mcp-gateway service to docker-compose.yml
    * Configure port 3100
    * Set environment variables
    * Link to Redis and Keycloak
* [ ] **Health Checks:**
    * Configure Docker health check
    * Set health check interval and timeout
    * Integrate with Kong health monitoring

## Verification Checklist
- [x] Does the gateway start without errors?
- [ ] Does JWT validation work with Keycloak?
- [ ] Does token revocation work with Redis?
- [ ] Are roles correctly extracted from JWT?
- [ ] Does role-based routing work correctly?
- [ ] Does prompt injection defense block malicious queries?
- [ ] Does Claude API integration work?
- [ ] Are queries logged with full audit trail?
- [ ] Do integration tests pass?
- [ ] Does the gateway handle errors gracefully?

## Status
**CURRENT ⚡** - Core implementation exists; needs completion of token revocation, prompt defense, and comprehensive testing.
