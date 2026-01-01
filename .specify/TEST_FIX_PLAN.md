# Integration Test Fix Implementation Plan
**Status**: CI Run 20633829626 in progress
**Date**: 2026-01-01
**Target**: Fix 28 failing integration tests (46/74 currently passing)

---

## Infrastructure Fixes (COMPLETED ✅)

### Fix 1: Elasticsearch Healthcheck Timeout
- **Status**: ✅ Fixed (commit c66eb63)
- **Change**: Replaced `elasticsearch-node health` with TCP socket check
- **Result**: 180s timeout → 15s startup
- **Files**: `.github/workflows/ci.yml:399`

### Fix 2: Missing tamshai Database
- **Status**: ✅ Fixed (commit 88b1f42)
- **Change**: Added `CREATE DATABASE tamshai OWNER tamshai`
- **Result**: Resolved FATAL: database "tamshai" does not exist errors
- **Files**: `.github/workflows/ci.yml:407-409`

---

## Category 1: Write Tool Endpoints (12 failures)

### Problem
Write tools returning `{status: "error"}` instead of `{status: "pending_confirmation"}`

### Root Cause
Two possible issues:
1. **Missing Redis connection** - Confirmation storage failing
2. **Missing endpoint implementation** - Tools not yet implemented
3. **Incorrect error handling** - Catching errors that should return confirmations

### Affected Tools

#### HR Server (2 failures)
- `delete_employee` - Returns error, expected pending_confirmation
- `update_salary` - Returns error, expected pending_confirmation ✅ (implemented in ecf1181)

#### Finance Server (2 failures)
- `delete_invoice` - Returns error, expected pending_confirmation
- `approve_budget` - Returns error, expected pending_confirmation

#### Sales Server (2 failures)
- `close_opportunity` - Returns error, expected pending_confirmation ✅ (implemented in ecf1181)
- `delete_customer` - Returns error, expected pending_confirmation ✅ (implemented in ecf1181)

#### Support Server (1 failure)
- `close_ticket` - Returns error, expected pending_confirmation

### Implementation Plan

#### Step 1: Verify Redis Connectivity
```typescript
// tests/integration/jest.setup.js
// Add Redis health check before tests
async function checkRedisHealth() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  try {
    await redis.ping();
    console.log('✅ Redis is ready');
  } catch (error) {
    throw new Error(`❌ Redis health check failed: ${error.message}`);
  } finally {
    await redis.quit();
  }
}
```

**Files**: `tests/integration/jest.setup.js`

#### Step 2: Check Tool Implementation Status
For each failing tool, verify:
1. Tool file exists in `services/mcp-*/src/tools/`
2. Endpoint registered in `services/mcp-*/src/index.ts`
3. Execute handler in `/execute` endpoint switch statement

**Commands**:
```bash
# Check HR tools
ls services/mcp-hr/src/tools/delete-employee.ts
ls services/mcp-hr/src/tools/update-salary.ts  # Should exist (ecf1181)

# Check Finance tools
ls services/mcp-finance/src/tools/delete-invoice.ts
ls services/mcp-finance/src/tools/approve-budget.ts

# Check Sales tools
ls services/mcp-sales/src/tools/close-opportunity.ts  # Should exist (ecf1181)
ls services/mcp-sales/src/tools/delete-customer.ts   # Should exist (ecf1181)

# Check Support tools
ls services/mcp-support/src/tools/close-ticket.ts
```

#### Step 3: Implement Missing Tools

**Template** (follow services/mcp-hr/src/tools/update-salary.ts pattern):

```typescript
// services/mcp-{domain}/src/tools/{action}.ts
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
} from '../types/response';
import { withErrorHandling } from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

export const ToolInputSchema = z.object({
  // Define input fields
});

export type ToolInput = z.infer<typeof ToolInputSchema>;

function hasPermission(roles: string[]): boolean {
  return roles.includes('domain-write') || roles.includes('executive');
}

export async function toolName(
  input: ToolInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('tool_name', async () => {
    // 1. Check permissions
    if (!hasPermission(userContext.roles)) {
      return handleInsufficientPermissions('domain-write or executive', userContext.roles);
    }

    // 2. Validate input
    const validatedInput = ToolInputSchema.parse(input);

    // 3. Fetch entity details
    const entity = await queryWithRLS(userContext, 'SELECT ...', [params]);
    if (entity.rowCount === 0) {
      return handleEntityNotFound(entityId);
    }

    // 4. Generate confirmation
    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'tool_name',
      mcpServer: 'domain',
      userId: userContext.userId,
      timestamp: Date.now(),
      // Add entity details
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);

    const message = `⚠️ Action confirmation required\n\nDetails...`;

    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  }) as Promise<MCPToolResponse<any>>;
}

export async function executeToolName(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('execute_tool_name', async () => {
    // Extract data
    const entityId = confirmationData.entityId as string;

    // Execute action
    const result = await queryWithRLS(userContext, 'UPDATE/DELETE ...', [params]);

    if (result.rowCount === 0) {
      return handleEntityNotFound(entityId);
    }

    return createSuccessResponse({
      success: true,
      message: 'Action completed successfully',
    });
  }) as Promise<MCPToolResponse<any>>;
}
```

#### Step 4: Register Endpoints

**In services/mcp-{domain}/src/index.ts**:

```typescript
// 1. Import
import { toolName, executeToolName, ToolInputSchema } from './tools/tool-name';

// 2. Add endpoint
app.post('/tools/tool_name', async (req: Request, res: Response) => {
  try {
    const { userContext, ...params } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    const result = await toolName(params, userContext);
    res.json(result);
  } catch (error) {
    logger.error('tool_name error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to process request',
    });
  }
});

// 3. Add execute case
case 'tool_name':
  result = await executeToolName(data, userContext);
  break;
```

#### Step 5: Fix Existing Tools (if implemented but broken)

For tools that exist (update_salary, close_opportunity, delete_customer):
1. Check Redis connection in tool file
2. Verify `storePendingConfirmation` is called correctly
3. Check error handling doesn't catch and return error status
4. Verify endpoint registration

**Diagnostic query**:
```bash
# Check if Redis utils exist
cat services/mcp-hr/src/utils/redis.ts | grep storePendingConfirmation
cat services/mcp-sales/src/utils/redis.ts | grep storePendingConfirmation
```

---

## Category 2: Read Tool Data Mismatches (4 failures)

### Problem
Tools returning `data` object but test expecting specific fields to be defined, receiving `undefined` instead.

### Affected Tools

#### Finance: get_budget
- **Expected**: `response.data.data.department === "Engineering"`
- **Received**: `response.data.data.department === undefined`
- **File**: `services/mcp-finance/src/tools/get-budget.ts`

#### Sales: get_customer
- **Expected**: Customer details defined
- **Received**: `response.data.data.{fields} === undefined`
- **File**: `services/mcp-sales/src/tools/get-customer.ts`

#### Support: get_knowledge_article
- **Expected**: Article details defined
- **Received**: `response.data.data.{fields} === undefined`
- **File**: `services/mcp-support/src/tools/get-knowledge-article.ts`

### Root Cause Analysis

Two possible issues:
1. **Database query selecting wrong fields** - Column names don't match expected output
2. **Response mapping incorrect** - Data structure not matching expected shape
3. **Sample data mismatch** - Database has different schema than expected

### Implementation Plan

#### Step 1: Verify Sample Data Schema

```bash
# Check Finance budget schema
PGPASSWORD=changeme psql -h localhost -p 5433 -U tamshai -d tamshai_finance \
  -c "\d finance.budgets"

# Check Sales customer schema
docker exec tamshai-mongodb mongosh tamshai_sales \
  --eval "db.customers.findOne()"

# Check Support knowledge_base schema
curl -X GET "http://localhost:9201/knowledge_base/_mapping"
```

#### Step 2: Fix get_budget Tool

**File**: `services/mcp-finance/src/tools/get-budget.ts`

**Current (suspected)**:
```typescript
const result = await queryWithRLS(
  userContext,
  'SELECT * FROM finance.budgets WHERE department_id = $1',
  [departmentId]
);

return createSuccessResponse(result.rows[0]);
```

**Fixed**:
```typescript
const result = await queryWithRLS(
  userContext,
  `SELECT
    b.id,
    b.department_id,
    d.name as department,  -- Ensure department name is included
    b.fiscal_year,
    b.allocated_amount,
    b.spent_amount,
    b.status
  FROM finance.budgets b
  JOIN finance.departments d ON b.department_id = d.id
  WHERE d.name = $1`,  -- Match by department name, not ID
  [department]
);

if (result.rowCount === 0) {
  return handleBudgetNotFound(department);
}

return createSuccessResponse({
  id: result.rows[0].id,
  department: result.rows[0].department,
  fiscalYear: result.rows[0].fiscal_year,
  allocatedAmount: result.rows[0].allocated_amount,
  spentAmount: result.rows[0].spent_amount,
  status: result.rows[0].status,
});
```

#### Step 3: Fix get_customer Tool

**File**: `services/mcp-sales/src/tools/get-customer.ts`

**Verify MongoDB structure**:
```typescript
// Expected structure from sample-data/sales-data.json
{
  _id: ObjectId,
  company_name: string,
  contact_name: string,
  email: string,
  phone: string,
  industry: string,
  size: string,
  status: string
}
```

**Fixed query**:
```typescript
const customer = await collection.findOne({
  _id: new ObjectId(customerId),
  ...buildRoleFilter(userContext)
});

if (!customer) {
  return handleCustomerNotFound(customerId);
}

return createSuccessResponse({
  id: customer._id.toString(),
  companyName: customer.company_name,
  contactName: customer.contact_name,
  email: customer.email,
  phone: customer.phone,
  industry: customer.industry,
  size: customer.size,
  status: customer.status,
});
```

#### Step 4: Fix get_knowledge_article Tool

**File**: `services/mcp-support/src/tools/get-knowledge-article.ts`

**Verify Elasticsearch structure** (from sample-data/support-data.ndjson):
```json
{
  "kb_id": "KB-001",
  "title": "How to set up TOTP",
  "content": "...",
  "category": "security",
  "tags": ["totp", "mfa"],
  "created_at": "2025-12-20T10:00:00Z",
  "updated_at": "2025-12-28T15:00:00Z",
  "views": 247,
  "helpful_count": 32
}
```

**Fixed query**:
```typescript
const result = await esClient.search({
  index: 'knowledge_base',
  body: {
    query: {
      term: { kb_id: kbId }
    }
  }
});

if (result.hits.hits.length === 0) {
  return handleArticleNotFound(kbId);
}

const article = result.hits.hits[0]._source;

return createSuccessResponse({
  kbId: article.kb_id,
  title: article.title,
  content: article.content,
  category: article.category,
  tags: article.tags,
  createdAt: article.created_at,
  updatedAt: article.updated_at,
  views: article.views,
  helpfulCount: article.helpful_count,
});
```

---

## Category 3: Filtering Not Implemented (3 failures)

### Problem
List tools not respecting filter parameters (department, status, stage).

### Affected Tools

#### Finance: list_invoices (status filter)
- **Test**: Filters by status="paid"
- **Expected**: Only paid invoices returned
- **Actual**: All invoices returned (filter ignored)
- **File**: `services/mcp-finance/src/tools/list-invoices.ts`

#### Sales: list_opportunities (stage filter)
- **Test**: Filters by stage="NEGOTIATION"
- **Expected**: Only NEGOTIATION stage opportunities
- **Actual**: All opportunities returned
- **File**: `services/mcp-sales/src/tools/list-opportunities.ts`

### Implementation Plan

#### Step 1: Fix list_invoices Filtering

**File**: `services/mcp-finance/src/tools/list-invoices.ts`

**Current (suspected)**:
```typescript
const result = await queryWithRLS(
  userContext,
  'SELECT * FROM finance.invoices LIMIT $1',
  [limit + 1]
);
```

**Fixed**:
```typescript
export const ListInvoicesInputSchema = z.object({
  limit: z.number().optional().default(50),
  status: z.enum(['pending', 'paid', 'overdue']).optional(),
});

export type ListInvoicesInput = z.infer<typeof ListInvoicesInputSchema>;

export async function listInvoices(
  input: ListInvoicesInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  const { limit = 50, status } = ListInvoicesInputSchema.parse(input);

  let query = 'SELECT * FROM finance.invoices WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  // Add status filter if provided
  if (status) {
    query += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await queryWithRLS(userContext, query, params);

  const truncated = result.rows.length > limit;
  const invoices = result.rows.slice(0, limit);

  return createSuccessResponse({
    invoices,
    metadata: {
      truncated,
      totalCount: truncated ? `${limit}+` : invoices.length.toString(),
      warning: truncated
        ? `TRUNCATION WARNING: Only ${limit} of ${limit}+ invoices returned.`
        : null,
    },
  });
}
```

**Update endpoint**:
```typescript
app.post('/tools/list_invoices', async (req: Request, res: Response) => {
  const { userContext, limit, status } = req.body;
  // ... validation ...
  const result = await listInvoices({ limit, status }, userContext);
  res.json(result);
});
```

#### Step 2: Fix list_opportunities Filtering

**File**: `services/mcp-sales/src/tools/list-opportunities.ts`

**MongoDB aggregation with stage filter**:
```typescript
export const ListOpportunitiesInputSchema = z.object({
  limit: z.number().optional().default(50),
  stage: z.enum(['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
});

export type ListOpportunitiesInput = z.infer<typeof ListOpportunitiesInputSchema>;

export async function listOpportunities(
  input: ListOpportunitiesInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  const { limit = 50, stage } = ListOpportunitiesInputSchema.parse(input);

  const collection = await getCollection('deals');
  const roleFilter = buildRoleFilter(userContext);

  // Build match filter
  const matchFilter: any = { ...roleFilter };
  if (stage) {
    matchFilter.stage = stage;
  }

  const opportunities = await collection.aggregate([
    { $match: matchFilter },
    { $limit: limit + 1 },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer_id',
        foreignField: '_id',
        as: 'customer_info'
      }
    },
    {
      $addFields: {
        customer_name: { $arrayElemAt: ['$customer_info.company_name', 0] }
      }
    },
    { $project: { customer_info: 0 } }
  ]).toArray();

  const truncated = opportunities.length > limit;

  return createSuccessResponse({
    opportunities: opportunities.slice(0, limit),
    metadata: {
      truncated,
      totalCount: truncated ? `${limit}+` : opportunities.length.toString(),
      warning: truncated
        ? `TRUNCATION WARNING: Only ${limit} of ${limit}+ opportunities returned.`
        : null,
    },
  });
}
```

---

## Category 4: RBAC Authorization (5 failures)

### Problem
Authorization checks not enforcing role-based access controls correctly.

### Affected Tests

1. **Executive can access Sales data** - Expected success, got error
2. **Intern cannot access HR data** - Expected authorization error, got success
3. **Intern cannot access Finance data** - Expected authorization error, got success
4. **HR user cannot access Finance data** - Expected authorization error, got success
5. **Finance user cannot access HR data** - Expected authorization error, got success

### Root Cause Analysis

Three possible issues:
1. **MCP Gateway routing** - Incorrect role-to-MCP mapping
2. **MCP Server authorization** - Tools not checking roles properly
3. **Test user roles** - Sample data has incorrect role assignments

### Implementation Plan

#### Step 1: Verify Test User Roles

**File**: `keycloak/realm-export-dev.json`

**Check executive role has all department roles**:
```json
{
  "username": "eve.thompson",
  "clientRoles": {
    "mcp-gateway": [
      "executive",
      "hr-read",
      "finance-read",
      "sales-read",
      "support-read"
    ]
  }
}
```

**Check intern role is minimal**:
```json
{
  "username": "frank.davis",
  "clientRoles": {
    "mcp-gateway": [
      "user"  // NO hr-read, finance-read, sales-read
    ]
  }
}
```

#### Step 2: Fix MCP Gateway Role Mapping

**File**: `services/mcp-gateway/src/index.ts`

**Check ROLE_TO_MCP mapping**:
```typescript
const ROLE_TO_MCP: Record<string, string[]> = {
  'hr-read': ['mcp-hr'],
  'hr-write': ['mcp-hr'],
  'finance-read': ['mcp-finance'],
  'finance-write': ['mcp-finance'],
  'sales-read': ['mcp-sales'],
  'sales-write': ['mcp-sales'],
  'support-read': ['mcp-support'],
  'support-write': ['mcp-support'],
  'executive': ['mcp-hr', 'mcp-finance', 'mcp-sales', 'mcp-support'],
  // 'user' and 'intern' should NOT have access to any MCP servers
};

function getAccessibleMcpServers(roles: string[]): string[] {
  const mcpServers = new Set<string>();
  roles.forEach(role => {
    const servers = ROLE_TO_MCP[role] || [];
    servers.forEach(server => mcpServers.add(server));
  });
  return Array.from(mcpServers);
}
```

#### Step 3: Fix MCP Server Authorization

**Each MCP server must check roles in tools**:

```typescript
// services/mcp-hr/src/tools/list-employees.ts
function hasReadPermission(roles: string[]): boolean {
  return roles.includes('hr-read')
    || roles.includes('hr-write')
    || roles.includes('executive');
}

export async function listEmployees(
  input: ListEmployeesInput,
  userContext: UserContext
): Promise<MCPToolResponse<any>> {
  return withErrorHandling('list_employees', async () => {
    // Authorization check
    if (!hasReadPermission(userContext.roles)) {
      return {
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Insufficient permissions. Required: hr-read, hr-write, or executive. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Request HR access from your administrator.',
      };
    }

    // ... rest of implementation
  });
}
```

#### Step 4: Add Integration Test Debugging

**File**: `tests/integration/rbac.test.ts`

Add logging to failed tests:
```typescript
test('Executive can access Sales data', async () => {
  const token = await getToken(TEST_USERS.executive);

  console.log('Executive user:', TEST_USERS.executive);
  console.log('Token roles:', JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).resource_access);

  const response = await salesClient.post('/tools/list_opportunities', {
    userContext: {
      userId: TEST_USERS.executive.userId,
      roles: TEST_USERS.executive.roles,
    },
    limit: 10,
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log('Response:', response.data);

  expect(response.status).toBe(200);
  expect(response.data.status).toBe('success');
});
```

---

## Implementation Order

### Phase 1: Infrastructure Verification (COMPLETED ✅)
1. ✅ Fix Elasticsearch healthcheck
2. ✅ Create tamshai database

### Phase 2: Read Tool Fixes (Quick Wins)
**Estimated Time**: 1-2 hours
**Files**: 4 tool files

1. Fix `get_budget` tool - Add department JOIN
2. Fix `get_customer` tool - Verify MongoDB field mapping
3. Fix `get_knowledge_article` tool - Fix Elasticsearch response mapping
4. Fix `list_invoices` filtering - Add status parameter
5. Fix `list_opportunities` filtering - Add stage parameter

### Phase 3: RBAC Fixes (Medium Complexity)
**Estimated Time**: 2-3 hours
**Files**: Test users, gateway routing, server authorization

1. Verify test user role assignments in Keycloak
2. Check MCP Gateway ROLE_TO_MCP mapping
3. Add authorization checks to all read tools
4. Test with different user roles

### Phase 4: Write Tool Implementation (High Complexity)
**Estimated Time**: 4-6 hours
**Files**: 7 tool files + endpoints

1. Verify Redis connectivity
2. Implement missing write tools:
   - `delete_employee` (HR)
   - `delete_invoice` (Finance)
   - `approve_budget` (Finance)
   - `close_ticket` (Support)
3. Fix existing write tools:
   - Verify `update_salary` (HR) works
   - Verify `close_opportunity` (Sales) works
   - Verify `delete_customer` (Sales) works

---

## Testing Strategy

### After Each Phase
1. Build affected MCP server: `npm run build`
2. Run specific test suite: `npm test -- {test-file}.test.ts`
3. Verify fix with full integration test: `npm test`

### Final Validation
1. Run full CI pipeline
2. Verify all 74 tests pass
3. Check for no database connection errors
4. Verify no Redis connection errors

---

## Success Criteria

- ✅ All 74 integration tests pass
- ✅ No "database does not exist" errors
- ✅ No Redis connection failures
- ✅ All write tools return `pending_confirmation`
- ✅ All read tools return complete data structures
- ✅ Filtering works for list tools
- ✅ RBAC correctly enforces permissions

---

**Next Action**: Wait for CI run 20633829626 to complete, then begin Phase 2 implementation.
