# Implementation Plan: MCP Domain Services

## Phase 1: MCP HR Server
* [ ] **Project Setup:**
    * Create `services/mcp-hr` directory with TypeScript configuration
    * Install dependencies: @modelcontextprotocol/sdk, pg, jsonwebtoken, zod, ioredis
    * Create Dockerfile
* [ ] **Database Layer:**
    * Implement PostgreSQL connection pool
    * Create DAO for employees, performance_reviews, time_off_requests
    * Implement session variable setter for RLS
* [ ] **Core Logic (v1.4 Updated):**
    * **[v1.4] Define MCPToolResponse discriminated union type** (Section 7.4):
        * `status: 'success'` with data and optional metadata (truncated, totalCount, warning)
        * `status: 'error'` with code, message, suggestedAction
        * `status: 'pending_confirmation'` with confirmationId, message, confirmationData
    * **[v1.4] Implement LLM-friendly error handling** (Article II.3 compliance):
        * Return structured error objects (NOT throwing raw exceptions)
        * Include `suggestedAction` field for AI to self-correct
        * Use semantic error codes: EMPLOYEE_NOT_FOUND, INSUFFICIENT_PERMISSIONS, etc.
* [ ] **Read Tools (v1.4 Updated):**
    * Implement `get_employee` tool with Zod schema
    * Implement `list_employees` tool with **truncation detection** (v1.4 - Section 5.3):
        * Query `LIMIT + 1` records to detect truncation
        * Set `metadata.truncated = true` if more results exist
        * Set `metadata.totalCount = "${limit}+"` format
        * Include warning message for AI to inform user
    * Implement `get_org_chart` tool (recursive query)
    * Implement `get_performance_reviews` tool with truncation warnings
* [ ] **Write Tools (v1.4 New - Section 5.6):**
    * **[v1.4] Implement `delete_employee` tool** (requires confirmation):
        * Check hr-write or executive role
        * Generate confirmationId (UUID)
        * Store pending action in Redis with 5-minute TTL
        * Return `pending_confirmation` response with employee details
    * **[v1.4] Implement `update_salary` tool** (requires confirmation):
        * Validate new salary value
        * Store old/new salary in confirmationData
        * Return confirmation request with salary comparison
* [ ] **PII Masking:**
    * Implement salary masking for non-hr-write users
    * Implement SSN masking for all users except hr-write
    * Implement email/phone masking based on roles
* [ ] **Testing (v1.4 Updated):**
    * Unit tests for each tool
    * Integration tests for RBAC enforcement
    * **[v1.4] Test error response schemas** (verify no raw exceptions)
    * **[v1.4] Test truncation metadata** for large result sets
    * **[v1.4] Test confirmation flow** for write operations

## Phase 2: MCP Finance Server
* [ ] **Project Setup:**
    * Create `services/mcp-finance` directory
    * Install dependencies: @modelcontextprotocol/sdk, pg, jsonwebtoken, zod, ioredis
    * Create Dockerfile
* [ ] **Database Layer:**
    * Implement connection to tamshai_finance database
    * Create DAO for budgets, invoices, expenses
* [ ] **Core Logic (v1.4 Updated):**
    * **[v1.4] Define MCPToolResponse discriminated union type** (Section 7.4)
    * **[v1.4] Implement LLM-friendly error handling** (Article II.3 compliance):
        * Error codes: BUDGET_NOT_FOUND, INVOICE_NOT_FOUND, INSUFFICIENT_PERMISSIONS, etc.
        * Include suggestedAction for all errors
* [ ] **Read Tools (v1.4 Updated):**
    * Implement `get_budget` tool
    * Implement `list_invoices` tool with **truncation detection** (v1.4 - Section 5.3):
        * Query `LIMIT + 1` records (max 50 per Article III.2)
        * Set truncation metadata if more results exist
        * Include warning for incomplete results
    * Implement `get_expense_report` tool with aggregation
    * Implement `list_budgets` tool with truncation warnings
* [ ] **Write Tools (v1.4 New - Section 5.6):**
    * **[v1.4] Implement `delete_invoice` tool** (requires confirmation):
        * Check finance-write or executive role
        * Generate confirmationId and store in Redis
        * Return pending_confirmation with invoice details
    * **[v1.4] Implement `approve_budget` tool** (requires confirmation):
        * Check executive role (critical financial decision)
        * Show budget amount and department in confirmation
        * Store approval action in Redis with 5-minute TTL
* [ ] **Access Control:**
    * Verify finance-read/finance-write roles
    * Apply RLS policies for department-level access
* [ ] **Testing (v1.4 Updated):**
    * Test non-finance users are denied
    * Test executives can access all finance data
    * **[v1.4] Test error response schemas** (verify no raw exceptions)
    * **[v1.4] Test truncation metadata** for invoice lists
    * **[v1.4] Test confirmation flow** for write operations

## Phase 3: MCP Sales Server
* [ ] **Project Setup:**
    * Create `services/mcp-sales` directory
    * Install dependencies: @modelcontextprotocol/sdk, mongodb, jsonwebtoken, zod, ioredis
    * Create Dockerfile
* [ ] **MongoDB Layer:**
    * Implement MongoDB connection
    * Create query builders with role-based filters
* [ ] **Core Logic (v1.4 Updated):**
    * **[v1.4] Define MCPToolResponse discriminated union type** (Section 7.4)
    * **[v1.4] Implement LLM-friendly error handling** (Article II.3 compliance):
        * Error codes: CUSTOMER_NOT_FOUND, OPPORTUNITY_NOT_FOUND, INVALID_STAGE, etc.
        * Include suggestedAction (e.g., "Use list_opportunities to find valid IDs")
* [ ] **Read Tools (v1.4 Updated):**
    * Implement `get_customer` tool
    * Implement `list_opportunities` tool with **truncation detection** (v1.4 - Section 5.3):
        * Use `.limit(51)` to detect truncation (max 50 per Article III.2)
        * Set truncation metadata if collection has more documents
        * Include warning for incomplete results
    * Implement `get_pipeline` tool with aggregation pipeline
    * Implement `list_customers` tool with truncation warnings
* [ ] **Write Tools (v1.4 New - Section 5.6):**
    * **[v1.4] Implement `delete_customer` tool** (requires confirmation):
        * Check sales-write or executive role
        * Generate confirmationId and store in Redis
        * Return pending_confirmation with customer name and associated opportunities count
    * **[v1.4] Implement `close_opportunity` tool** (requires confirmation):
        * Check sales-write role
        * Show opportunity value and stage in confirmation
        * Store closure action in Redis with 5-minute TTL
* [ ] **Query Filtering:**
    * Apply ownership filters for non-sales users
    * Allow sales users to see all opportunities
    * Allow executives to see all CRM data
* [ ] **Testing (v1.4 Updated):**
    * Test sales user sees all opportunities
    * Test non-sales user sees only assigned opportunities
    * **[v1.4] Test error response schemas** (verify no raw exceptions)
    * **[v1.4] Test truncation metadata** for large customer/opportunity lists
    * **[v1.4] Test confirmation flow** for write operations

## Phase 4: MCP Support Server
* [ ] **Project Setup:**
    * Create `services/mcp-support` directory
    * Install dependencies: @modelcontextprotocol/sdk, @elastic/elasticsearch, jsonwebtoken, zod, ioredis
    * Create Dockerfile
* [ ] **Elasticsearch Layer:**
    * Implement connection to Elasticsearch
    * Create search query builders
* [ ] **Core Logic (v1.4 Updated):**
    * **[v1.4] Define MCPToolResponse discriminated union type** (Section 7.4)
    * **[v1.4] Implement LLM-friendly error handling** (Article II.3 compliance):
        * Error codes: TICKET_NOT_FOUND, ARTICLE_NOT_FOUND, SEARCH_FAILED, etc.
        * Include suggestedAction (e.g., "Try broader search terms" for zero results)
* [ ] **Read Tools (v1.4 Updated):**
    * Implement `search_tickets` tool with **truncation detection** (v1.4 - Section 5.3):
        * Use `size: 51` in Elasticsearch query to detect truncation (max 50 per Article III.2)
        * Set truncation metadata if more hits exist
        * Include warning for incomplete search results
    * Implement `get_knowledge_article` tool
    * Implement `get_ticket` tool (individual ticket lookup)
* [ ] **Write Tools (v1.4 New - Section 5.6):**
    * **[v1.4] Implement `close_ticket` tool** (requires confirmation):
        * Check support-write or executive role
        * Generate confirmationId and store in Redis
        * Return pending_confirmation with ticket summary and resolution details
* [ ] **Access Control:**
    * Filter tickets by assigned agent for non-support roles
    * Allow support users to see all tickets
* [ ] **Testing (v1.4 Updated):**
    * Test full-text search accuracy
    * Test RBAC filtering
    * **[v1.4] Test error response schemas** (verify no raw exceptions)
    * **[v1.4] Test truncation metadata** for large search results
    * **[v1.4] Test confirmation flow** for close_ticket operations

## Phase 5: Integration with MCP Gateway (v1.4 Updated)
* [ ] **Service Registration:**
    * Register all four MCP servers in Gateway's ROLE_TO_MCP mapping
    * Configure health checks for each service
* [ ] **Tool Discovery:**
    * Implement tool listing endpoint for each MCP server
    * Gateway aggregates available tools based on user roles
* [ ] **v1.4 Gateway Integration:**
    * **[v1.4] Truncation Warning Injection** (Section 5.3):
        * Gateway checks MCP tool responses for `metadata.truncated` flag
        * Inject system message to Claude when truncation detected
        * Ensure AI informs user of incomplete results
    * **[v1.4] Error Response Handling** (Section 7.4):
        * Gateway validates all MCP responses match MCPToolResponse schema
        * Forward LLM-friendly errors to Claude with suggestedAction
        * Log error patterns for monitoring
    * **[v1.4] Confirmation Flow Coordination** (Section 5.6):
        * Gateway stores pending actions from MCP servers in Redis
        * Implement `POST /api/confirm/:confirmationId` endpoint
        * Route confirmed actions back to originating MCP server
        * Handle confirmation timeouts (5-minute TTL)
* [ ] **End-to-End Testing (v1.4 Updated):**
    * Test queries routed to correct MCP servers
    * Test multi-server queries (e.g., HR + Finance)
    * Test error handling for unavailable servers
    * **[v1.4] Test truncation warning flow** end-to-end
    * **[v1.4] Test error response propagation** to Claude API
    * **[v1.4] Test confirmation flow** across Gateway and MCP servers

## Phase 6: Docker Deployment
* [ ] Add all MCP services to docker-compose.yml
* [ ] Configure ports 3101-3104
* [ ] Set up network connectivity
* [ ] Configure health checks

## Verification Checklist (v1.4 Updated)
### Foundation (v1.3)
- [ ] Do all MCP servers start without errors?
- [ ] Does JWT validation work in each server?
- [ ] Are session variables set correctly?
- [ ] Do RLS policies filter data appropriately?
- [ ] Is PII masked for non-privileged users?
- [ ] Do integration tests pass for all tools?
- [ ] Can Gateway route to all MCP servers?

### v1.4 Compliance
- [ ] **[v1.4] Error Schema Compliance:**
    - [ ] All tools return MCPToolResponse discriminated union
    - [ ] No raw exceptions thrown to Claude API
    - [ ] All errors include `code`, `message`, and `suggestedAction`
- [ ] **[v1.4] Truncation Warnings:**
    - [ ] All list-based tools query `LIMIT + 1` to detect truncation
    - [ ] Truncation metadata set correctly (`truncated`, `totalCount`, `warning`)
    - [ ] Gateway injects truncation warnings into Claude context
- [ ] **[v1.4] Confirmation Flow:**
    - [ ] All write tools return `pending_confirmation` status
    - [ ] confirmationId stored in Redis with 5-minute TTL
    - [ ] Gateway `/api/confirm/:id` endpoint routes to correct MCP server
    - [ ] Confirmation timeouts handled gracefully
- [ ] **[v1.4] Constitutional Compliance:**
    - [ ] Article II.3: LLM-friendly errors implemented (no raw exceptions)
    - [ ] Article III.2: 50-record limit enforced with truncation warnings

## Status
**PLANNED 🔲**

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Changes Applied**:
- ✅ Section 7.4: MCPToolResponse discriminated union type defined for all 4 MCP servers
- ✅ Section 7.4: LLM-friendly error schemas implemented (Article II.3 compliance)
- ✅ Section 5.3: Truncation warning pattern specified for all list-based tools (Article III.2 enforcement)
- ✅ Section 5.6: Human-in-the-loop confirmation pattern added for 8 write tools
- ✅ Gateway integration updated for truncation injection, error handling, and confirmation routing

**Constitutional Impact**:
- Fulfills Article II.3: Structured error responses with suggestedAction
- Enforces Article III.2: Max 50 records with AI-visible truncation warnings
- No constitutional amendments required
