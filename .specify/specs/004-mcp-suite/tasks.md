# Tasks: MCP Domain Services

## Group 1: MCP HR Server (v1.4 Updated)
- [ ] Create `services/mcp-hr` directory with TypeScript setup. [P]
- [ ] Install dependencies: @modelcontextprotocol/sdk, pg, jsonwebtoken, zod, winston, ioredis. [P]
- [ ] **[v1.4] Define MCPToolResponse type** in `src/types/response.ts` (Section 7.4). [P]
- [ ] Create `src/database/connection.ts` with PostgreSQL pool. [P]
- [ ] Implement `src/database/session.ts` for RLS variable setting. [P]
- [ ] **[v1.4] Create `src/utils/error-handler.ts`** for LLM-friendly error responses (Article II.3). [P]
- [ ] Create `src/tools/get-employee.ts` with Zod input schema and error handling. [P]
- [ ] Create `src/tools/list-employees.ts` with **truncation detection** (v1.4 - Section 5.3):
  - [ ] Query `LIMIT + 1` records to detect truncation. [P]
  - [ ] Set `metadata.truncated`, `totalCount`, and `warning` fields. [P]
- [ ] Create `src/tools/get-org-chart.ts` with recursive query. [P]
- [ ] Create `src/tools/get-performance-reviews.ts` with truncation warnings. [P]
- [ ] **[v1.4] Create `src/tools/delete-employee.ts`** write tool (Section 5.6):
  - [ ] Check hr-write or executive role. [P]
  - [ ] Generate confirmationId and store in Redis with 5-minute TTL. [P]
  - [ ] Return `pending_confirmation` response. [P]
- [ ] **[v1.4] Create `src/tools/update-salary.ts`** write tool (Section 5.6):
  - [ ] Validate new salary value. [P]
  - [ ] Store confirmation data in Redis. [P]
  - [ ] Return pending_confirmation with salary comparison. [P]
- [ ] Implement PII masking in `src/utils/mask-pii.ts`. [P]
- [ ] Create `src/index.ts` MCP server entry point. [P]
- [ ] Write unit tests in `tests/unit/` for all tools. [P]
- [ ] **[v1.4] Write tests** for error schemas (verify no raw exceptions). [P]
- [ ] **[v1.4] Write tests** for truncation metadata in large result sets. [P]
- [ ] **[v1.4] Write tests** for confirmation flow with Redis. [P]
- [ ] Write integration tests in `tests/integration/hr-rbac.test.ts`. [P]
- [ ] Create Dockerfile for mcp-hr service. [P]
- [ ] Add mcp-hr to docker-compose.yml on port 3101. [P]

## Group 2: MCP Finance Server (v1.4 Updated)
- [ ] Create `services/mcp-finance` directory structure. [P]
- [ ] Install dependencies: @modelcontextprotocol/sdk, pg, jsonwebtoken, zod, winston, ioredis. [P]
- [ ] **[v1.4] Define MCPToolResponse type** in `src/types/response.ts` (Section 7.4). [P]
- [ ] Implement database connection to tamshai_finance. [P]
- [ ] **[v1.4] Create `src/utils/error-handler.ts`** for LLM-friendly error responses (Article II.3). [P]
- [ ] Create `src/tools/get-budget.ts` tool with error handling. [P]
- [ ] Create `src/tools/list-invoices.ts` with **truncation detection** (v1.4 - Section 5.3):
  - [ ] Query `LIMIT + 1` records (max 50 per Article III.2). [P]
  - [ ] Set truncation metadata if more results exist. [P]
- [ ] Create `src/tools/get-expense-report.ts` with aggregation. [P]
- [ ] Create `src/tools/list-budgets.ts` with truncation warnings. [P]
- [ ] **[v1.4] Create `src/tools/delete-invoice.ts`** write tool (Section 5.6):
  - [ ] Check finance-write or executive role. [P]
  - [ ] Store confirmation data in Redis. [P]
  - [ ] Return pending_confirmation with invoice details. [P]
- [ ] **[v1.4] Create `src/tools/approve-budget.ts`** write tool (Section 5.6):
  - [ ] Check executive role (critical financial decision). [P]
  - [ ] Show budget amount and department in confirmation. [P]
  - [ ] Store in Redis with 5-minute TTL. [P]
- [ ] Implement role verification (finance-read, finance-write, executive). [P]
- [ ] Apply RLS session variables before queries. [P]
- [ ] **[v1.4] Write tests** for error schemas (verify no raw exceptions). [P]
- [ ] **[v1.4] Write tests** for truncation metadata in invoice lists. [P]
- [ ] **[v1.4] Write tests** for confirmation flow. [P]
- [ ] Write integration tests for finance RBAC. [P]
- [ ] Create Dockerfile for mcp-finance service. [P]
- [ ] Add mcp-finance to docker-compose.yml on port 3102. [P]

## Group 3: MCP Sales Server (v1.4 Updated)
- [ ] Create `services/mcp-sales` directory structure. [P]
- [ ] Install dependencies: @modelcontextprotocol/sdk, mongodb, jsonwebtoken, zod, winston, ioredis. [P]
- [ ] **[v1.4] Define MCPToolResponse type** in `src/types/response.ts` (Section 7.4). [P]
- [ ] Implement MongoDB connection in `src/database/mongo.ts`. [P]
- [ ] Create query filter builder in `src/filters/role-filters.ts`. [P]
- [ ] **[v1.4] Create `src/utils/error-handler.ts`** for LLM-friendly error responses (Article II.3). [P]
- [ ] Create `src/tools/get-customer.ts` tool with error handling. [P]
- [ ] Create `src/tools/list-opportunities.ts` with **truncation detection** (v1.4 - Section 5.3):
  - [ ] Use `.limit(51)` to detect truncation (max 50 per Article III.2). [P]
  - [ ] Set truncation metadata if collection has more documents. [P]
- [ ] Create `src/tools/get-pipeline.ts` with aggregation pipeline. [P]
- [ ] Create `src/tools/list-customers.ts` with truncation warnings. [P]
- [ ] **[v1.4] Create `src/tools/delete-customer.ts`** write tool (Section 5.6):
  - [ ] Check sales-write or executive role. [P]
  - [ ] Show customer name and associated opportunities count. [P]
  - [ ] Store confirmation data in Redis. [P]
- [ ] **[v1.4] Create `src/tools/close-opportunity.ts`** write tool (Section 5.6):
  - [ ] Check sales-write role. [P]
  - [ ] Show opportunity value and stage in confirmation. [P]
  - [ ] Store in Redis with 5-minute TTL. [P]
- [ ] Apply role-based filters: sales-read sees all, others see assigned only. [P]
- [ ] **[v1.4] Write tests** for error schemas (verify no raw exceptions). [P]
- [ ] **[v1.4] Write tests** for truncation metadata in large lists. [P]
- [ ] **[v1.4] Write tests** for confirmation flow. [P]
- [ ] Write integration tests for CRM access control. [P]
- [ ] Create Dockerfile for mcp-sales service. [P]
- [ ] Add mcp-sales to docker-compose.yml on port 3103. [P]

## Group 4: MCP Support Server (v1.4 Updated)
- [ ] Create `services/mcp-support` directory structure. [P]
- [ ] Install dependencies: @modelcontextprotocol/sdk, @elastic/elasticsearch, jsonwebtoken, zod, winston, ioredis. [P]
- [ ] **[v1.4] Define MCPToolResponse type** in `src/types/response.ts` (Section 7.4). [P]
- [ ] Implement Elasticsearch connection in `src/database/elasticsearch.ts`. [P]
- [ ] **[v1.4] Create `src/utils/error-handler.ts`** for LLM-friendly error responses (Article II.3). [P]
- [ ] Create `src/tools/search-tickets.ts` with **truncation detection** (v1.4 - Section 5.3):
  - [ ] Use `size: 51` in Elasticsearch query (max 50 per Article III.2). [P]
  - [ ] Set truncation metadata if more hits exist. [P]
  - [ ] Include warning for incomplete search results. [P]
- [ ] Create `src/tools/get-knowledge-article.ts` tool with error handling. [P]
- [ ] Create `src/tools/get-ticket.ts` tool (individual ticket lookup). [P]
- [ ] **[v1.4] Create `src/tools/close-ticket.ts`** write tool (Section 5.6):
  - [ ] Check support-write or executive role. [P]
  - [ ] Show ticket summary and resolution details. [P]
  - [ ] Store confirmation data in Redis. [P]
- [ ] Apply ticket filtering: support-read sees all, others see assigned tickets. [P]
- [ ] **[v1.4] Write tests** for error schemas (verify no raw exceptions). [P]
- [ ] **[v1.4] Write tests** for truncation metadata in search results. [P]
- [ ] **[v1.4] Write tests** for confirmation flow. [P]
- [ ] Write integration tests for support RBAC. [P]
- [ ] Create Dockerfile for mcp-support service. [P]
- [ ] Add mcp-support to docker-compose.yml on port 3104. [P]

## Group 5: MCP Gateway Integration (v1.4 Updated)
- [ ] Update MCP Gateway ROLE_TO_MCP mapping with all four servers. [P]
- [ ] Implement tool discovery endpoint in each MCP server. [P]
- [ ] Configure Gateway to aggregate tools based on user roles. [P]
- [ ] Add health check endpoints to all MCP servers. [P]
- [ ] Configure Gateway health checks for all MCP servers. [P]
- [ ] **[v1.4] Implement truncation warning injection** in Gateway (Section 5.3):
  - [ ] Check MCP tool responses for `metadata.truncated` flag. [P]
  - [ ] Inject system message to Claude when truncation detected. [P]
  - [ ] Ensure AI informs user of incomplete results. [P]
- [ ] **[v1.4] Implement error response validation** in Gateway (Section 7.4):
  - [ ] Validate all MCP responses match MCPToolResponse schema. [P]
  - [ ] Forward LLM-friendly errors to Claude with suggestedAction. [P]
  - [ ] Log error patterns for monitoring. [P]
- [ ] **[v1.4] Implement confirmation flow coordination** in Gateway (Section 5.6):
  - [ ] Store pending actions from MCP servers in Redis. [P]
  - [ ] Implement `POST /api/confirm/:confirmationId` endpoint. [P]
  - [ ] Route confirmed actions back to originating MCP server. [P]
  - [ ] Handle confirmation timeouts (5-minute TTL). [P]
  - [ ] Return error if confirmation expired or not found. [P]

## Group 6: End-to-End Testing (v1.4 Updated)
### v1.3 RBAC Tests
- [ ] Create `tests/integration/e2e-hr.test.ts` testing full flow. [P]
- [ ] Test Marcus (Engineer) can only see own HR data. [P]
- [ ] Test Nina (Manager) can see team HR data. [P]
- [ ] Test Alice (HR) can see all HR data. [P]
- [ ] Test Eve (Executive) can see all data across domains. [P]
- [ ] Create `tests/integration/e2e-finance.test.ts`. [P]
- [ ] Test non-finance user denied access to budgets. [P]
- [ ] Test finance user can access all financial data. [P]
- [ ] Create `tests/integration/e2e-sales.test.ts`. [P]
- [ ] Test sales user sees all opportunities. [P]
- [ ] Test non-sales user sees only assigned opportunities. [P]
- [ ] Create `tests/integration/e2e-support.test.ts`. [P]

### v1.4 Feature Tests
- [ ] **[v1.4] Create `tests/integration/e2e-truncation.test.ts`** (Section 5.3):
  - [ ] Test list_employees with 100 records returns truncation warning. [P]
  - [ ] Test Gateway injects truncation message to Claude. [P]
  - [ ] Test AI response informs user of incomplete results. [P]
- [ ] **[v1.4] Create `tests/integration/e2e-errors.test.ts`** (Section 7.4):
  - [ ] Test EMPLOYEE_NOT_FOUND error returns LLM-friendly response. [P]
  - [ ] Test suggestedAction field is present and actionable. [P]
  - [ ] Test no raw exceptions thrown to Claude API. [P]
- [ ] **[v1.4] Create `tests/integration/e2e-confirmation.test.ts`** (Section 5.6):
  - [ ] Test delete_employee returns pending_confirmation. [P]
  - [ ] Test Gateway stores confirmation in Redis. [P]
  - [ ] Test POST /api/confirm/:id with approval executes action. [P]
  - [ ] Test POST /api/confirm/:id with rejection cancels action. [P]
  - [ ] Test confirmation timeout (6 minutes) returns error. [P]

## Group 7: Documentation (v1.4 Updated)
- [ ] Document each tool's input/output schema. [P]
- [ ] Create API documentation for each MCP server. [P]
- [ ] Update CLAUDE.md with MCP suite development guide. [P]
- [ ] Document PII masking patterns. [P]
- [ ] Document RLS session variable pattern. [P]
- [ ] **[v1.4] Document MCPToolResponse type** and discriminated union pattern. [P]
- [ ] **[v1.4] Document LLM-friendly error handling** with code examples (Article II.3). [P]
- [ ] **[v1.4] Document truncation detection pattern** with query examples (Article III.2). [P]
- [ ] **[v1.4] Document confirmation flow** with Redis storage pattern (Section 5.6). [P]
- [ ] **[v1.4] Update architecture diagrams** to show confirmation flow. [P]

## Status
**PLANNED 🔲** - Implementation after MCP Gateway completion.

## Architecture Version
**Updated for**: v1.4 (December 2024)

**v1.4 Tasks Added**:
- ✅ Error schema implementation tasks (Section 7.4) for all 4 MCP servers
- ✅ Truncation detection tasks (Section 5.3) for all list-based tools
- ✅ Write tool implementation tasks (Section 5.6) - 8 new tools with confirmation flow
- ✅ Gateway integration tasks for truncation, errors, and confirmations
- ✅ v1.4-specific E2E tests for new features
- ✅ v1.4 documentation tasks

**Task Count**:
- Group 1 (HR): 32 tasks (was 14) - +18 v1.4 tasks
- Group 2 (Finance): 27 tasks (was 11) - +16 v1.4 tasks
- Group 3 (Sales): 28 tasks (was 11) - +17 v1.4 tasks
- Group 4 (Support): 24 tasks (was 9) - +15 v1.4 tasks
- Group 5 (Gateway Integration): 17 tasks (was 5) - +12 v1.4 tasks
- Group 6 (E2E Testing): 27 tasks (was 12) - +15 v1.4 tests
- Group 7 (Documentation): 10 tasks (was 5) - +5 v1.4 docs
- **Total**: 165 tasks (was 67) - **+98 v1.4 tasks**

**Constitutional Compliance**:
- Article II.3: LLM-friendly error tasks in all 4 servers
- Article III.2: Truncation detection tasks in all list-based tools
- No constitutional amendments required
