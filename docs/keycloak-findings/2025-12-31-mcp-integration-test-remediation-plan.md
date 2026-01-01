# MCP Integration Test Remediation Plan

**Date**: 2025-12-31
**Author**: Claude-Dev (claude-dev@tamshai.com)
**Status**: 🔴 ACTIVE - 21 Integration Tests Failing
**Prerequisites**: CI infrastructure health checks resolved (PostgreSQL, Keycloak)
**Source**: CI Run #20631600113 analysis

---

## Executive Summary

**Test Status**: 18 passing (46%), 21 failing (54%)
**Infrastructure**: ✅ All services healthy (PostgreSQL, Keycloak, 4 MCP servers)
**Root Cause**: MCP server implementation bugs, NOT CI/CD infrastructure issues
**Impact**: Integration tests blocking production readiness
**Estimated Effort**: 16-24 hours (depends on complexity)

**Priority Breakdown**:
- 🔴 **Critical** (10 tests): Core business logic failures (read/write tools)
- 🟡 **High** (5 tests): Authorization & RBAC failures
- 🟢 **Medium** (6 tests): Error handling & message consistency

**Timeline**: 3-5 days (assuming single developer, full-time)

---

## Current Test Results

### Passing Tests (18) ✅

**Health & Performance**:
- ✅ All 4 MCP servers healthy
- ✅ List operations complete within 2 seconds
- ✅ Truncation detection overhead <100ms
- ✅ Concurrent tool calls succeed

**Truncation Warnings**:
- ✅ HR: `list_employees` includes truncation metadata (>50 records)
- ✅ Finance: `list_invoices` includes truncation metadata
- ✅ Sales: `list_opportunities` includes truncation metadata
- ✅ Support: `search_tickets` includes truncation metadata

**Basic Access Control**:
- ✅ Executive can access HR data
- ✅ Executive can access Support data

**Error Handling (Partial)**:
- ✅ Finance: Returns error for non-existent department
- ✅ Sales: Returns LLM-friendly error for non-existent customer

### Failing Tests (21) ❌

**MCP HR Server** (6 failures):
1. ❌ `list_employees` - Department filtering not working
2. ❌ `get_employee` - Returns 'error' instead of 'success'
3. ❌ `get_employee` - Wrong error code (INVALID_INPUT vs EMPLOYEE_NOT_FOUND)
4. ❌ `delete_employee` - Returns 'error' instead of 'pending_confirmation'
5. ❌ `delete_employee` - Not storing confirmation in Redis
6. ❌ `update_salary` - Returns 'error' instead of 'pending_confirmation'

**MCP Finance Server** (4 failures):
1. ❌ `get_budget` - Returns error for existing department
2. ❌ `list_invoices` - Status filtering not working
3. ❌ `delete_invoice` - Returns 'error' instead of 'pending_confirmation'
4. ❌ `approve_budget` - Returns 'error' instead of 'pending_confirmation'

**MCP Sales Server** (5 failures):
1. ❌ `list_opportunities` - Returns error instead of success
2. ❌ `list_opportunities` - Stage filtering not working
3. ❌ `get_customer` - Returns error instead of success
4. ❌ `close_opportunity` - Returns 'error' instead of 'pending_confirmation'
5. ❌ `delete_customer` - Returns 'error' instead of 'pending_confirmation'

**MCP Support Server** (3 failures):
1. ❌ `search_tickets` - Status filtering not working
2. ❌ `get_knowledge_article` - Returns error for existing article
3. ❌ `close_ticket` - Returns 'error' instead of 'pending_confirmation'

**Multi-Role Access Control** (5 failures):
1. ❌ Executive cannot access Finance data (should be allowed)
2. ❌ Executive cannot access Sales data (should be allowed)
3. ❌ Intern authorization tests failing
4. ❌ Cross-department access: HR → Finance (should be blocked)
5. ❌ Cross-department access: Finance → HR (should be blocked)

---

## Issue Categories & Root Causes

### Category 1: Tool Response Status Errors (10 issues) 🔴

**Pattern**: Tools returning `status: 'error'` when they should return `'success'` or `'pending_confirmation'`

**Affected Tools**:
- HR: `get_employee`, `delete_employee`, `update_salary`
- Finance: `get_budget`, `delete_invoice`, `approve_budget`
- Sales: `list_opportunities`, `get_customer`, `close_opportunity`, `delete_customer`
- Support: `get_knowledge_article`, `close_ticket`

**Likely Root Causes**:
1. Missing error handling (throwing exceptions instead of returning error responses)
2. Database queries failing (incorrect SQL, missing WHERE clauses)
3. Incomplete implementation (stub code returning errors)
4. Missing Redis connection (write tools can't create confirmations)

**Example Expected vs Actual**:
```typescript
// Expected:
{ status: 'success', data: { employee_id: '...', name: '...' } }

// Actual:
{ status: 'error', code: 'INTERNAL_ERROR', message: '...' }
```

### Category 2: Missing Filtering Logic (4 issues) 🔴

**Pattern**: List tools ignoring filter parameters (department, status, stage)

**Affected Tools**:
- HR: `list_employees` (department filter)
- Finance: `list_invoices` (status filter)
- Sales: `list_opportunities` (stage filter)
- Support: `search_tickets` (status filter)

**Likely Root Causes**:
1. SQL WHERE clause not using filter parameters
2. Parameters not passed to database query
3. Filter validation rejecting valid inputs

**Example Issue**:
```typescript
// Test: list_employees({ department: 'engineering' })
// Expected: Only engineering employees
// Actual: All employees returned (filter ignored)
```

### Category 3: Incomplete Human-in-the-Loop (6 issues) 🔴

**Pattern**: Write tools not creating pending confirmations in Redis

**Affected Tools**:
- HR: `delete_employee`, `update_salary`
- Finance: `delete_invoice`, `approve_budget`
- Sales: `close_opportunity`, `delete_customer`
- Support: `close_ticket`

**Likely Root Causes**:
1. Redis client not initialized
2. Confirmation creation code commented out or incomplete
3. Missing `confirmationId` generation
4. Wrong response status (returning 'error' before confirmation creation)

**Expected Flow**:
```typescript
async function deleteEmployee(employeeId: string): Promise<MCPToolResponse> {
  // 1. Validate employee exists
  // 2. Generate confirmationId
  const confirmationId = crypto.randomUUID();

  // 3. Store in Redis (5-minute TTL)
  await redis.setex(`pending:${confirmationId}`, 300, JSON.stringify({
    action: 'delete_employee',
    employeeId,
    userId: userContext.userId
  }));

  // 4. Return pending_confirmation
  return {
    status: 'pending_confirmation',
    confirmationId,
    message: '⚠️ Delete employee John Doe?',
    confirmationData: { employeeId, employeeName: 'John Doe' }
  };
}
```

### Category 4: Authorization Failures (5 issues) 🟡

**Pattern**: RBAC not properly enforcing role-based access

**Affected Scenarios**:
- Executive should access Finance/Sales (composite role includes finance-read, sales-read)
- Intern should have minimal access (only self-read)
- HR users should NOT access Finance data (cross-department restriction)
- Finance users should NOT access HR data (cross-department restriction)

**Likely Root Causes**:
1. Role hierarchy not implemented (executive composite role not expanding)
2. Token validation not extracting nested roles from `resource_access['mcp-gateway'].roles`
3. MCP server authorization checking wrong role names
4. Gateway not propagating role information to MCP servers

**Expected JWT Structure**:
```json
{
  "resource_access": {
    "mcp-gateway": {
      "roles": ["hr-read", "finance-read", "sales-read", "executive"]
    }
  }
}
```

### Category 5: Error Code Inconsistencies (6 issues) 🟢

**Pattern**: Wrong error codes or missing `suggestedAction` fields

**Examples**:
- HR: Returns `INVALID_INPUT` instead of `EMPLOYEE_NOT_FOUND`
- Support: Wrong error code for non-existent knowledge article

**Expected Error Response**:
```typescript
{
  status: 'error',
  code: 'EMPLOYEE_NOT_FOUND',
  message: 'Employee with ID abc-123 not found.',
  suggestedAction: 'Use list_employees tool to find valid employee IDs, or verify the ID format is correct (UUID expected).'
}
```

---

## Remediation Plan by Priority

### Phase 1: Critical Business Logic Fixes (Priority 🔴, 10 tests, 8-12 hours)

Fix core read/write tool functionality to unblock basic operations.

#### 1.1 Fix Read Tools Returning Errors (4 tests, 2-3 hours)

**Affected Tools**: `get_employee`, `get_budget`, `get_customer`, `get_knowledge_article`

**Files**:
- `services/mcp-hr/src/tools/get_employee.ts`
- `services/mcp-finance/src/tools/get_budget.ts`
- `services/mcp-sales/src/tools/get_customer.ts`
- `services/mcp-support/src/tools/get_knowledge_article.ts`

**Steps**:
1. **Debug SQL queries**:
   - Add console.log to see what queries are executed
   - Verify WHERE clauses are correct
   - Check if database connections are working

2. **Add error handling**:
   ```typescript
   try {
     const result = await db.query('SELECT * FROM hr.employees WHERE employee_id = $1', [employeeId]);

     if (result.rows.length === 0) {
       return {
         status: 'error',
         code: 'EMPLOYEE_NOT_FOUND',
         message: `Employee with ID ${employeeId} not found.`,
         suggestedAction: 'Use list_employees tool to find valid employee IDs.'
       };
     }

     return { status: 'success', data: result.rows[0] };
   } catch (error) {
     return {
       status: 'error',
       code: 'DATABASE_ERROR',
       message: error.message,
       suggestedAction: 'Check database connectivity and try again.'
     };
   }
   ```

3. **Test locally**:
   ```bash
   cd services/mcp-hr
   npm test -- get_employee.test.ts
   ```

**Acceptance Criteria**:
- ✅ `get_employee` returns `status: 'success'` for existing employees
- ✅ `get_budget` returns `status: 'success'` for existing departments
- ✅ `get_customer` returns `status: 'success'` for existing customers
- ✅ `get_knowledge_article` returns `status: 'success'` for existing articles

---

#### 1.2 Implement Filtering in List Tools (4 tests, 3-4 hours)

**Affected Tools**: `list_employees`, `list_invoices`, `list_opportunities`, `search_tickets`

**Files**:
- `services/mcp-hr/src/tools/list_employees.ts`
- `services/mcp-finance/src/tools/list_invoices.ts`
- `services/mcp-sales/src/tools/list_opportunities.ts`
- `services/mcp-support/src/tools/search_tickets.ts`

**Steps**:
1. **Update SQL queries to use filter parameters**:
   ```typescript
   async function listEmployees({ department, limit = 50 }: ListEmployeesParams) {
     let query = 'SELECT * FROM hr.employees WHERE 1=1';
     const params: any[] = [];

     // Add department filter if provided
     if (department) {
       params.push(department);
       query += ` AND department = $${params.length}`;
     }

     // Add LIMIT+1 for truncation detection
     params.push(limit + 1);
     query += ` LIMIT $${params.length}`;

     const result = await db.query(query, params);

     const truncated = result.rows.length > limit;
     return {
       status: 'success',
       data: result.rows.slice(0, limit),
       metadata: {
         truncated,
         totalCount: truncated ? `${limit}+` : result.rows.length.toString()
       }
     };
   }
   ```

2. **Validate filter parameters**:
   ```typescript
   // Validate department exists
   if (department) {
     const validDepartments = ['engineering', 'sales', 'hr', 'finance', 'support'];
     if (!validDepartments.includes(department)) {
       return {
         status: 'error',
         code: 'INVALID_DEPARTMENT',
         message: `Invalid department: ${department}`,
         suggestedAction: `Valid departments: ${validDepartments.join(', ')}`
       };
     }
   }
   ```

3. **Test with sample data**:
   ```bash
   npm test -- list_employees.test.ts
   ```

**Acceptance Criteria**:
- ✅ `list_employees({ department: 'engineering' })` returns only engineering employees
- ✅ `list_invoices({ status: 'pending' })` returns only pending invoices
- ✅ `list_opportunities({ stage: 'negotiation' })` returns only negotiation-stage opportunities
- ✅ `search_tickets({ status: 'open' })` returns only open tickets

---

#### 1.3 Implement Redis Confirmations for Write Tools (6 tests, 3-5 hours)

**Affected Tools**: `delete_employee`, `update_salary`, `delete_invoice`, `approve_budget`, `close_opportunity`, `delete_customer`, `close_ticket`

**Files**:
- `services/mcp-hr/src/tools/delete_employee.ts`
- `services/mcp-hr/src/tools/update_salary.ts`
- `services/mcp-finance/src/tools/delete_invoice.ts`
- `services/mcp-finance/src/tools/approve_budget.ts`
- `services/mcp-sales/src/tools/close_opportunity.ts`
- `services/mcp-sales/src/tools/delete_customer.ts`
- `services/mcp-support/src/tools/close_ticket.ts`

**Steps**:
1. **Verify Redis connection**:
   ```typescript
   // services/mcp-hr/src/index.ts
   import Redis from 'ioredis';

   const redis = new Redis({
     host: process.env.REDIS_HOST || 'localhost',
     port: parseInt(process.env.REDIS_PORT || '6379'),
     retryStrategy: (times) => Math.min(times * 50, 2000)
   });

   redis.on('connect', () => console.log('Redis connected'));
   redis.on('error', (err) => console.error('Redis error:', err));
   ```

2. **Implement confirmation creation**:
   ```typescript
   async function deleteEmployee(employeeId: string, userContext: UserContext): Promise<MCPToolResponse> {
     // 1. Verify employee exists
     const employee = await db.query(
       'SELECT * FROM hr.employees WHERE employee_id = $1',
       [employeeId]
     );

     if (employee.rows.length === 0) {
       return {
         status: 'error',
         code: 'EMPLOYEE_NOT_FOUND',
         message: `Employee with ID ${employeeId} not found.`,
         suggestedAction: 'Use list_employees to find valid employee IDs.'
       };
     }

     // 2. Generate confirmationId
     const confirmationId = crypto.randomUUID();

     // 3. Store pending action in Redis (5-minute TTL)
     await redis.setex(
       `pending:${confirmationId}`,
       300,
       JSON.stringify({
         action: 'delete_employee',
         employeeId,
         employeeName: employee.rows[0].name,
         userId: userContext.userId,
         timestamp: new Date().toISOString()
       })
     );

     // 4. Return pending_confirmation response
     return {
       status: 'pending_confirmation',
       confirmationId,
       message: `⚠️ Delete employee ${employee.rows[0].name} (${employee.rows[0].email})?\n\nThis action will permanently delete the employee record and cannot be undone.`,
       confirmationData: {
         employeeId,
         employeeName: employee.rows[0].name,
         department: employee.rows[0].department
       }
     };
   }
   ```

3. **Test Redis storage**:
   ```bash
   # Start Redis
   docker-compose up -d redis

   # Run tests
   npm test -- delete_employee.test.ts

   # Verify Redis key created
   docker-compose exec redis redis-cli KEYS "pending:*"
   docker-compose exec redis redis-cli GET "pending:<confirmationId>"
   ```

**Acceptance Criteria**:
- ✅ All write tools return `status: 'pending_confirmation'`
- ✅ Redis keys created with 5-minute TTL
- ✅ Confirmation data includes all required fields (action, resourceId, userId, timestamp)
- ✅ Gateway can retrieve and execute confirmations

---

### Phase 2: Authorization & RBAC Fixes (Priority 🟡, 5 tests, 4-6 hours)

Fix role-based access control to enforce proper security boundaries.

#### 2.1 Fix Executive Cross-Department Access (2 tests, 2-3 hours)

**Issue**: Executive users cannot access Finance or Sales data (they should via composite role)

**Files**:
- `services/mcp-gateway/src/index.ts` (role extraction)
- `services/mcp-gateway/src/auth/rbac.ts` (role-to-MCP mapping)

**Steps**:
1. **Verify JWT token structure**:
   ```bash
   # Decode test token
   echo $TOKEN | cut -d. -f2 | base64 -d | jq '.resource_access["mcp-gateway"].roles'
   # Expected: ["executive", "hr-read", "finance-read", "sales-read", "support-read"]
   ```

2. **Fix role extraction in gateway**:
   ```typescript
   // services/mcp-gateway/src/auth/jwt-validator.ts
   function extractRoles(token: any): string[] {
     // Extract roles from resource_access
     const roles = token.resource_access?.['mcp-gateway']?.roles || [];

     // Expand composite roles
     const expandedRoles = new Set<string>(roles);

     if (roles.includes('executive')) {
       // Executive has all read roles
       expandedRoles.add('hr-read');
       expandedRoles.add('finance-read');
       expandedRoles.add('sales-read');
       expandedRoles.add('support-read');
     }

     return Array.from(expandedRoles);
   }
   ```

3. **Update role-to-MCP mapping**:
   ```typescript
   // services/mcp-gateway/src/auth/rbac.ts
   const ROLE_TO_MCP: Record<string, string[]> = {
     'hr-read': ['mcp-hr'],
     'hr-write': ['mcp-hr'],
     'finance-read': ['mcp-finance'],
     'finance-write': ['mcp-finance'],
     'sales-read': ['mcp-sales'],
     'sales-write': ['mcp-sales'],
     'support-read': ['mcp-support'],
     'support-write': ['mcp-support'],
     'executive': ['mcp-hr', 'mcp-finance', 'mcp-sales', 'mcp-support']
   };
   ```

4. **Test with executive user**:
   ```bash
   # Get token for eve.thompson (executive)
   TOKEN=$(curl -X POST http://localhost:8180/realms/tamshai/protocol/openid-connect/token \
     -d "client_id=mcp-gateway" \
     -d "username=eve.thompson" \
     -d "password=<password>" \
     -d "grant_type=password" | jq -r '.access_token')

   # Test Finance access
   curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/query \
     -d '{"query": "What is the engineering budget?", "server": "mcp-finance"}'
   ```

**Acceptance Criteria**:
- ✅ Executive user can access HR data
- ✅ Executive user can access Finance data
- ✅ Executive user can access Sales data
- ✅ Executive user can access Support data

---

#### 2.2 Fix Cross-Department Access Restrictions (3 tests, 2-3 hours)

**Issue**: HR users can access Finance data (should be blocked), Finance users can access HR data (should be blocked), Intern has excessive permissions

**Files**:
- `services/mcp-gateway/src/auth/rbac.ts`
- Integration tests: `services/mcp-gateway/src/__tests__/rbac.test.ts`

**Steps**:
1. **Enforce strict role-to-server mapping**:
   ```typescript
   function getAccessibleMcpServers(roles: string[]): string[] {
     const mcpServers = new Set<string>();

     roles.forEach(role => {
       const servers = ROLE_TO_MCP[role] || [];
       servers.forEach(server => mcpServers.add(server));
     });

     // If no roles matched, deny all access
     if (mcpServers.size === 0) {
       throw new Error('User has no authorized MCP servers');
     }

     return Array.from(mcpServers);
   }

   // Example: HR user (alice.chen)
   // Roles: ['hr-read', 'hr-write']
   // Accessible servers: ['mcp-hr']
   // Blocked: mcp-finance, mcp-sales, mcp-support
   ```

2. **Add gateway route guard**:
   ```typescript
   app.post('/api/query', async (req, res) => {
     const { server, query } = req.body;

     // Extract user roles from JWT
     const token = await validateToken(req.headers.authorization);
     const accessibleServers = getAccessibleMcpServers(token.roles);

     // Check if user can access requested server
     if (!accessibleServers.includes(server)) {
       return res.status(403).json({
         status: 'error',
         code: 'FORBIDDEN',
         message: `User does not have access to ${server}`,
         suggestedAction: `You can access: ${accessibleServers.join(', ')}`
       });
     }

     // Route to MCP server
     const response = await fetch(`http://${server}:${port}/query`, { ... });
     res.json(response);
   });
   ```

3. **Test cross-department blocking**:
   ```bash
   # Test HR user trying to access Finance
   TOKEN_HR=$(get_token alice.chen)  # hr-read, hr-write
   curl -H "Authorization: Bearer $TOKEN_HR" \
     http://localhost:3100/api/query \
     -d '{"query": "What is the budget?", "server": "mcp-finance"}'
   # Expected: 403 Forbidden

   # Test Finance user trying to access HR
   TOKEN_FINANCE=$(get_token bob.martinez)  # finance-read, finance-write
   curl -H "Authorization: Bearer $TOKEN_FINANCE" \
     http://localhost:3100/api/query \
     -d '{"query": "List all employees", "server": "mcp-hr"}'
   # Expected: 403 Forbidden
   ```

**Acceptance Criteria**:
- ✅ HR user (alice.chen) can access mcp-hr only
- ✅ HR user CANNOT access mcp-finance (403 Forbidden)
- ✅ Finance user (bob.martinez) can access mcp-finance only
- ✅ Finance user CANNOT access mcp-hr (403 Forbidden)
- ✅ Intern (frank.davis) has minimal permissions (self-read only)

---

### Phase 3: Error Code & Message Fixes (Priority 🟢, 6 tests, 4-6 hours)

Fix error code inconsistencies and add LLM-friendly error messages.

#### 3.1 Standardize Error Codes (6 tests, 2-3 hours)

**Issues**: Wrong error codes (INVALID_INPUT vs EMPLOYEE_NOT_FOUND)

**Files**:
- `services/mcp-hr/src/tools/get_employee.ts`
- `services/mcp-support/src/tools/get_knowledge_article.ts`
- All MCP server tools

**Steps**:
1. **Define standard error codes**:
   ```typescript
   // services/mcp-common/src/types/errors.ts
   export enum ErrorCode {
     // Resource not found (404-equivalent)
     EMPLOYEE_NOT_FOUND = 'EMPLOYEE_NOT_FOUND',
     CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
     INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
     TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
     ARTICLE_NOT_FOUND = 'ARTICLE_NOT_FOUND',

     // Invalid input (400-equivalent)
     INVALID_EMPLOYEE_ID = 'INVALID_EMPLOYEE_ID',
     INVALID_DEPARTMENT = 'INVALID_DEPARTMENT',
     INVALID_STATUS = 'INVALID_STATUS',
     INVALID_INPUT = 'INVALID_INPUT',

     // Authorization (403-equivalent)
     FORBIDDEN = 'FORBIDDEN',
     INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

     // Server errors (500-equivalent)
     DATABASE_ERROR = 'DATABASE_ERROR',
     REDIS_ERROR = 'REDIS_ERROR',
     INTERNAL_ERROR = 'INTERNAL_ERROR'
   }
   ```

2. **Update error responses**:
   ```typescript
   // Use specific error codes
   if (!employeeId || !isValidUUID(employeeId)) {
     return {
       status: 'error',
       code: 'INVALID_EMPLOYEE_ID',  // NOT INVALID_INPUT
       message: `Invalid employee ID format: ${employeeId}`,
       suggestedAction: 'Employee IDs must be valid UUIDs. Use list_employees to find valid IDs.'
     };
   }

   const result = await db.query('SELECT * FROM hr.employees WHERE employee_id = $1', [employeeId]);

   if (result.rows.length === 0) {
     return {
       status: 'error',
       code: 'EMPLOYEE_NOT_FOUND',  // Specific to resource type
       message: `Employee with ID ${employeeId} not found.`,
       suggestedAction: 'Use list_employees to find valid employee IDs, or verify the ID is correct.'
     };
   }
   ```

3. **Add LLM-friendly `suggestedAction` fields**:
   ```typescript
   // Every error response must have suggestedAction
   return {
     status: 'error',
     code: 'ARTICLE_NOT_FOUND',
     message: `Knowledge base article with ID ${articleId} not found.`,
     suggestedAction: 'Use search_knowledge_base tool to find relevant articles, or verify the article ID is correct.'
   };
   ```

**Acceptance Criteria**:
- ✅ All "not found" errors use resource-specific error codes (EMPLOYEE_NOT_FOUND, not INVALID_INPUT)
- ✅ All error responses include `suggestedAction` field
- ✅ Error messages are descriptive and actionable
- ✅ Tests verify exact error codes (not just "error" status)

---

## Implementation Order & Dependencies

```
Phase 1: Critical Business Logic (Prerequisite for all)
├─ 1.1: Fix Read Tools (2-3 hours) → Enables basic data retrieval
├─ 1.2: Implement Filtering (3-4 hours) → Requires 1.1 to be complete
└─ 1.3: Redis Confirmations (3-5 hours) → Requires Redis connection, independent of 1.1/1.2

Phase 2: Authorization & RBAC (Requires Phase 1.1)
├─ 2.1: Executive Access (2-3 hours) → Requires working read tools
└─ 2.2: Cross-Department Blocking (2-3 hours) → Can run in parallel with 2.1

Phase 3: Error Codes (Can run in parallel with Phase 2)
└─ 3.1: Standardize Error Codes (2-3 hours) → Refactoring existing code
```

**Recommended Execution**:
1. **Day 1** (8 hours): Phase 1.1 + 1.2 (Fix read tools and filtering)
2. **Day 2** (8 hours): Phase 1.3 + Phase 3.1 (Redis confirmations + error codes)
3. **Day 3** (8 hours): Phase 2.1 + 2.2 (Authorization fixes)

**Total**: 24 hours (3 full days)

---

## Testing Strategy

### Local Testing (Before CI)

**Per-Tool Unit Tests**:
```bash
cd services/mcp-hr
npm test -- get_employee.test.ts
npm test -- list_employees.test.ts
npm test -- delete_employee.test.ts
```

**Integration Tests (Local Docker Compose)**:
```bash
cd infrastructure/docker
docker-compose up -d

cd ../../services/mcp-gateway
npm run test:integration
```

**Manual Testing**:
```bash
# Get auth token
TOKEN=$(curl -X POST http://localhost:8180/realms/tamshai/protocol/openid-connect/token \
  -d "client_id=mcp-gateway" \
  -d "username=alice.chen" \
  -d "password=<password>" \
  -d "grant_type=password" | jq -r '.access_token')

# Test get_employee
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/tools/hr/get_employee \
  -d '{"employee_id": "550e8400-e29b-41d4-a716-446655440000"}'

# Test list_employees with filter
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/tools/hr/list_employees \
  -d '{"department": "engineering", "limit": 10}'

# Test delete_employee confirmation
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/tools/hr/delete_employee \
  -d '{"employee_id": "550e8400-e29b-41d4-a716-446655440000"}'
# Expected: pending_confirmation response with confirmationId
```

### CI Testing

**After each fix, push to trigger CI**:
```bash
git add .
git commit -m "fix(mcp-hr): Implement department filtering in list_employees"
git push
gh run watch
```

**Monitor test results**:
```bash
# Check specific test suite
gh run view --log | grep "MCP HR Server"
gh run view --log | grep "✓\|✗"
```

---

## Success Criteria

### Phase 1 Complete (10 tests passing)
- ✅ All read tools return `status: 'success'` for existing resources
- ✅ All list tools respect filter parameters (department, status, stage)
- ✅ All write tools return `status: 'pending_confirmation'`
- ✅ Redis confirmations created with correct TTL and data

### Phase 2 Complete (5 tests passing)
- ✅ Executive users can access all departments (Finance, Sales)
- ✅ Cross-department access blocked (HR ↔ Finance)
- ✅ Intern has minimal permissions (self-read only)

### Phase 3 Complete (6 tests passing)
- ✅ All error responses use correct error codes (not INVALID_INPUT for everything)
- ✅ All error responses include `suggestedAction` fields
- ✅ Error messages are descriptive and actionable

### Overall Success
- ✅ **39/39 integration tests passing (100%)**
- ✅ CI pipeline green on all jobs
- ✅ No flaky tests (3 consecutive successful runs)
- ✅ Code coverage maintains 90%+ on new/modified code

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Database schema mismatch | Medium | High | Verify sample data SQL scripts match test expectations |
| Redis connection issues | Medium | Medium | Add connection retry logic, health checks |
| JWT token extraction bugs | Low | High | Add comprehensive logging, decode tokens manually to verify |
| Test timeouts (>300ms) | Medium | Low | Optimize database queries, add indexes if needed |
| Cascading failures | Low | High | Fix and test one phase at a time, don't merge broken code |

---

## Rollback Plan

If a fix causes regressions:

1. **Identify broken commit**:
   ```bash
   git log --oneline -10
   gh run list --limit 10
   ```

2. **Revert commit**:
   ```bash
   git revert <commit-hash>
   git push
   ```

3. **Verify tests pass again**:
   ```bash
   gh run watch
   ```

4. **Re-implement fix with proper testing**

---

## Documentation Updates

After all fixes complete:

1. **Update CI resolution doc**:
   - Change status from "21 failing" to "39 passing"
   - Document which commits fixed which issues

2. **Update CLAUDE.md**:
   - Add Phase 11: MCP Integration Test Fixes

3. **Create runbook**:
   - Document common MCP server debugging procedures
   - Add troubleshooting guide for Redis confirmations

---

## References

- **CI Analysis**: `docs/keycloak-findings/2025-12-31-ci-health-check-resolution.md`
- **CI Run**: https://github.com/jcornell3/tamshai-enterprise-ai/actions/runs/20631600113
- **Integration Tests**: `services/mcp-gateway/src/__tests__/integration/`
- **MCP Server Code**: `services/mcp-{hr,finance,sales,support}/src/tools/`
- **Sample Data**: `sample-data/sql/*.sql`, `sample-data/*.ndjson`

---

**Document Owner**: QA Team
**Next Review**: After Phase 1 completion (10 tests passing)
**Estimated Completion**: 2026-01-03 (3 business days)
