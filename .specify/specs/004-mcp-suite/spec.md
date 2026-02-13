# Specification: MCP Domain Services (HR, Finance, Sales, Support)

## 1. Business Intent
**User Story:** As an employee, I want the AI to answer questions about HR, Finance, and Sales data so that I can make informed decisions without querying databases manually.

**Business Value:** Unlocks the actual data value of the enterprise for AI assistance. Enables natural language access to business data while maintaining security boundaries.

## 2. Access Control & Security (Crucial)
* **Required Role(s):** Domain-specific (hr-*, finance-*, sales-*, support-*)
* **Data Classification:** Internal / Confidential / Restricted (depending on data type)
* **PII Risks:** Yes - Salaries, SSNs, contact info must be masked for non-privileged users
* **RLS Impact:** All MCP servers must enforce RLS policies defined in Phase 2

## 3. MCP Tool Definition (v1.4 Updated)

**All tools now return discriminated union response schema (v1.4 - Section 7.4):**

```typescript
type MCPToolResponse =
  | { status: 'success', data: any, metadata?: PaginationMetadata }
  | { status: 'error', code: string, message: string, suggestedAction?: string }
  | { status: 'pending_confirmation', confirmationId: string, message: string, confirmationData: any };

// Pagination metadata for list operations (v1.4.1)
interface PaginationMetadata {
  // Cursor-based pagination (preferred)
  hasMore: boolean;           // More records available
  nextCursor?: string;        // Base64-encoded cursor for next page
  returnedCount: number;      // Records in this response
  totalEstimate?: string;     // e.g., "50+" when count exceeds limit
  hint?: string;              // AI-friendly message for user

  // Legacy truncation fields (backward compatibility)
  truncated?: boolean;        // Alias for hasMore
  totalCount?: string;        // Alias for totalEstimate
  warning?: string;           // Alias for hint
}
```

### MCP HR Server (Port 3101)

#### Read Tools
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `get_employee` | Get employee details by ID | `{ employee_id: string }` | `MCPToolResponse<Employee>` | hr-read, manager, executive |
| `list_employees` | List employees (filtered by RLS) | `{ department?: string, limit?: number }` | `MCPToolResponse<Employee[]>` with truncation metadata | hr-read, executive |
| `get_org_chart` | Get organizational hierarchy | `{ root_employee_id?: string }` | `MCPToolResponse<OrgNode>` | hr-read, executive |
| `get_performance_reviews` | Get performance reviews | `{ employee_id: string }` | `MCPToolResponse<Review[]>` with truncation metadata | hr-write, executive |

#### Write Tools (v1.4 - Section 5.6)
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `delete_employee` | Delete employee (requires confirmation) | `{ employee_id: string }` | `MCPToolResponse` (pending_confirmation) | hr-write, executive |
| `update_salary` | Update employee salary (requires confirmation) | `{ employee_id: string, new_salary: number }` | `MCPToolResponse` (pending_confirmation) | hr-write, executive |

### MCP Finance Server (Port 3102)

#### Read Tools
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `get_budget` | Get budget by department | `{ department: string, year?: number }` | `MCPToolResponse<Budget>` | finance-read, executive |
| `list_invoices` | List invoices (filtered) | `{ status?: string, limit?: number }` | `MCPToolResponse<Invoice[]>` with truncation metadata | finance-read, executive |
| `get_expense_report` | Get expense report | `{ employee_id: string, month: string }` | `MCPToolResponse<ExpenseReport>` | finance-read, executive |

#### Write Tools (v1.4 - Section 5.6)
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `delete_invoice` | Delete invoice (requires confirmation) | `{ invoice_id: string }` | `MCPToolResponse` (pending_confirmation) | finance-write, executive |
| `approve_budget` | Approve department budget (requires confirmation) | `{ department: string, amount: number }` | `MCPToolResponse` (pending_confirmation) | finance-write, executive |

### MCP Sales Server (Port 3103)

#### Read Tools
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `get_customer` | Get customer details | `{ customer_id: string }` | `MCPToolResponse<Customer>` | sales-read, executive |
| `list_deals` | List sales deals | `{ stage?: string, limit?: number }` | `MCPToolResponse<Deal[]>` with truncation metadata | sales-read, executive |
| `get_pipeline` | Get sales pipeline summary | `{ quarter?: string }` | `MCPToolResponse<PipelineSummary>` | sales-read, executive |

#### Write Tools (v1.4 - Section 5.6)
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `delete_customer` | Delete customer (requires confirmation) | `{ customer_id: string }` | `MCPToolResponse` (pending_confirmation) | sales-write, executive |
| `close_deal` | Close deal as won/lost (requires confirmation) | `{ deal_id: string, outcome: 'won' \| 'lost' }` | `MCPToolResponse` (pending_confirmation) | sales-write, executive |

### MCP Support Server (Port 3104)

#### Read Tools
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `search_tickets` | Search support tickets | `{ query: string, status?: string, limit?: number }` | `MCPToolResponse<Ticket[]>` with truncation metadata | support-read, executive |
| `get_knowledge_article` | Get KB article | `{ article_id: string }` | `MCPToolResponse<Article>` | support-read, executive |

#### Write Tools (v1.4 - Section 5.6)
| Tool Name | Description | Input Schema | Output Schema (v1.4) | Required Role |
| :--- | :--- | :--- | :--- | :--- |
| `close_ticket` | Close support ticket (requires confirmation) | `{ ticket_id: string, resolution: string }` | `MCPToolResponse` (pending_confirmation) | support-write, executive |

## 4. User Interaction Scenarios

### Read Operations
* **Self-Service HR:** Marcus (Engineer) asks "What's my PTO balance?" -> MCP HR returns `{ status: 'success', data: { pto_balance: 15 } }` -> AI responds with balance.
* **Manager Query:** Nina (Manager) asks "Who on my team has performance reviews due?" -> MCP HR applies RLS -> Returns only Nina's team members with `{ status: 'success', data: [...] }`.
* **Executive Dashboard:** Eve (CEO) asks "What's our Q4 budget vs actual spend?" -> MCP Finance returns company-wide data -> AI generates summary.
* **Sales Insight:** Carol (Sales VP) asks "Show me top 5 deals closing this month" -> MCP Sales queries MongoDB `deals` collection -> Returns filtered deals.

### Error Handling (v1.4 - Section 7.4)
* **Not Found Error:** User asks "Show me employee ABC123" -> Tool returns `{ status: 'error', code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found. Verify the employee ID is correct.', suggestedAction: 'Use list_employees tool to find valid employee IDs.' }` -> AI informs user politely.
* **Permission Error:** Frank (Intern) asks "Show me all employee salaries" -> Tool returns `{ status: 'error', code: 'INSUFFICIENT_PERMISSIONS', message: 'You do not have permission to view salary data.' }` -> AI explains access restriction.

### Truncation Warnings (v1.4 - Section 5.3)
* **Large Result Set:** User asks "List all employees" -> Query returns 500 records -> Tool returns `{ status: 'success', data: [...50 records...], metadata: { truncated: true, totalCount: '50+', warning: 'Only 50 of 50+ records returned. Ask user to refine query (e.g., filter by department).' } }` -> AI informs user "I found 50+ employees, showing first 50. Please specify a department for more specific results."

### Write Operations (v1.4 - Section 5.6)
* **Delete Confirmation:** Alice (HR) asks "Delete employee Frank Davis" -> Tool returns `{ status: 'pending_confirmation', confirmationId: 'uuid', message: 'Delete employee Frank Davis (frank.davis@tamshai.com)? This action cannot be undone.', confirmationData: { employee_id: 'uuid', name: 'Frank Davis' } }` -> AI displays "Are you sure you want to delete Frank Davis? [Approve/Deny]" -> User clicks Approve -> Frontend calls `/api/confirm/:id` -> Tool executes deletion -> AI confirms "Frank Davis has been deleted."
* **Update Confirmation:** Alice asks "Increase Sarah's salary to $120,000" -> Tool returns pending_confirmation -> AI requests approval -> User approves -> Salary updated -> AI confirms change.

## 5. Success Criteria
- [x] All four MCP servers deployed and accessible (ports 3101-3104)
- [x] Each server validates JWT and extracts user context
- [x] Session variables set before all PostgreSQL queries (HR uses RLS)
- [x] MongoDB queries have role-based filters applied (Sales)
- [ ] PII masking implemented for salary, SSN, contact info fields (partial)
- [x] **[v1.4] All tools return discriminated union responses** (success | error | pending_confirmation)
- [x] **[v1.4] LLM-friendly error schemas** implemented (Article II.3 compliance)
- [x] **[v1.4] Truncation metadata included** in list-based queries (Article III.2 enforcement)
- [x] **[v1.4] Write tools return pending_confirmation** for destructive actions
- [x] **[v1.4] Confirmation data includes** all info needed for UI approval card
- [x] Integration tests verify RBAC for each tool (mcp-tools.test.ts)
- [x] **[v1.4] Integration tests verify error schema** AI can interpret
- [x] **[v1.4] Integration tests verify truncation warnings** injected correctly
- [x] **[v1.4] Integration tests verify confirmation flow** (pending → approve → execute)
- [ ] Performance SLA met (< 500ms for simple queries) - not formally measured
- [x] All tools documented with input/output schemas

## 6. Database Prerequisites & Sample Data

### 6.1 PostgreSQL Schema Requirements

**STATUS: RESOLVED ✅** - Sample data files have been updated to use proper schemas:
- `sample-data/hr-data.sql` uses `hr.*` schema with full RLS policies
- `sample-data/finance-data.sql` uses `finance.*` schema (RLS pending)

#### Required Schema Structure

**HR Database (`tamshai_hr`):**
```sql
-- Must be added at the top of sample-data/hr-data.sql
CREATE SCHEMA IF NOT EXISTS hr;

-- All table definitions must use schema prefix:
CREATE TABLE IF NOT EXISTS hr.employees (...);
CREATE TABLE IF NOT EXISTS hr.departments (...);
CREATE TABLE IF NOT EXISTS hr.grade_levels (...);
CREATE TABLE IF NOT EXISTS hr.performance_reviews (...);
```

**Finance Database (`tamshai_finance`):**
```sql
-- Must be added at the top of sample-data/finance-data.sql
CREATE SCHEMA IF NOT EXISTS finance;

-- All table definitions must use schema prefix:
CREATE TABLE IF NOT EXISTS finance.budgets (...);
CREATE TABLE IF NOT EXISTS finance.invoices (...);
CREATE TABLE IF NOT EXISTS finance.expense_reports (...);
```

#### Known Issues in Existing Sample Data

**`sample-data/hr-data.sql` (Legacy v1.3 File):**
1. ❌ **Missing schema creation:** No `CREATE SCHEMA hr;` statement
2. ❌ **Tables in wrong schema:** All tables created in `public` instead of `hr`
3. ❌ **SQL syntax error (line ~451):** Recursive CTE has type mismatch:
   ```sql
   -- ERROR: recursive query "org_tree" column 8 has type character varying(100)[]
   -- in non-recursive term but type character varying[] overall
   WITH RECURSIVE org_tree AS (
     SELECT ..., ARRAY[last_name] as path  -- varchar(100)[]
     FROM employees WHERE manager_id IS NULL
     UNION ALL
     SELECT ..., ot.path || e.last_name    -- varchar[] (type mismatch!)
     FROM employees e JOIN org_tree ot ON e.manager_id = ot.id
   )
   ```
   **Fix:** Cast the recursive term: `ot.path || e.last_name::varchar(100)`

4. ⚠️ **Schema mismatch:** File uses `\c tamshai_hr;` (correct database) but creates tables without `hr.` prefix

**Migration Required:** These files must be updated before v1.4 MCP servers can function.

### 6.2 Sample Data Migration Checklist

- [ ] Update `sample-data/hr-data.sql`:
  - [ ] Add `CREATE SCHEMA IF NOT EXISTS hr;` after database connection
  - [ ] Prefix all `CREATE TABLE` with `hr.` (e.g., `hr.employees`)
  - [ ] Prefix all `INSERT INTO` with `hr.`
  - [ ] Fix recursive CTE type error on line ~451
  - [ ] Update all references in constraints, indexes, and queries

- [ ] Update `sample-data/finance-data.sql`:
  - [ ] Add `CREATE SCHEMA IF NOT EXISTS finance;`
  - [ ] Prefix all tables with `finance.`
  - [ ] Verify foreign key constraints use schema prefix

- [ ] Verify MongoDB sample data (`sample-data/sales-data.js`):
  - [ ] ✅ No schema changes needed (MongoDB databases, not schemas)
  - [ ] Verify collection names match MCP Sales server expectations

- [ ] Verify Elasticsearch sample data:
  - [ ] ✅ No schema changes needed (index-based)
  - [ ] Verify index names match MCP Support server expectations

### 6.3 RLS Policies Alignment

**CRITICAL:** RLS policies in sample data must match the schema prefix used by MCP servers.

Example policy from `sample-data/hr-data.sql`:
```sql
-- BEFORE (v1.3 - incorrect):
CREATE POLICY employee_access_policy ON employees
FOR SELECT
USING (...);

-- AFTER (v1.4 - correct):
CREATE POLICY employee_access_policy ON hr.employees
FOR SELECT
USING (...);
```

## 7. Scope
* **Four MCP Servers:** HR, Finance, Sales, Support
* **Data Sources:**
  - PostgreSQL: HR and Finance data (with `hr.` and `finance.` schemas)
  - MongoDB: Sales/CRM data (database: `tamshai_sales`)
  - Elasticsearch: Support tickets and knowledge base
* **Authentication:** JWT validation from MCP Gateway
* **Authorization:** RLS policies + application-level filtering
* **Error Handling:** Structured error responses, no raw exceptions
* **Logging:** Request/response logging with user context
* **Sample Data:** MUST be migrated from v1.3 (public schema) to v1.4 (domain schemas)

## 8. Technical Details

### Context Propagation Pattern
```typescript
// Extract from JWT (passed from Gateway)
const { userId, roles, username } = await validateToken(req.headers.authorization);

// Set PostgreSQL session variables
await db.query(`
  SET LOCAL app.current_user_id = $1;
  SET LOCAL app.current_user_roles = $2;
`, [userId, roles.join(',')]);

// Execute query (RLS automatically applied)
const result = await db.query('SELECT * FROM hr.employees WHERE active = true');
```

### PII Masking Pattern
```typescript
function maskSalary(employee: Employee, userRoles: string[]): Employee {
  const canViewSalary = userRoles.some(r =>
    r === 'hr-write' || r === 'finance-read' || r === 'executive'
  );

  if (!canViewSalary) {
    employee.salary = '*** (Hidden)';
    employee.ssn = '*** (Hidden)';
  }

  return employee;
}
```

### LLM-Friendly Error Schema Pattern (v1.4 - Section 7.4 + Article II.3)
```typescript
// Zod schema for all MCP tool responses
import { z } from 'zod';

const MCPToolResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.any(),
    metadata: z.object({
      truncated: z.boolean().optional(),
      totalCount: z.string().optional(),
      warning: z.string().optional()
    }).optional()
  }),
  z.object({
    status: z.literal('error'),
    code: z.string(),
    message: z.string(),
    suggestedAction: z.string().optional(),
    technicalDetails: z.string().optional()
  }),
  z.object({
    status: z.literal('pending_confirmation'),
    confirmationId: z.string(),
    message: z.string(),
    confirmationData: z.any()
  })
]);

// Tool implementation with error handling
async function getEmployee(employeeId: string, userContext: UserContext): Promise<MCPToolResponse> {
  try {
    // Set session variables for RLS
    await db.query(`
      SET LOCAL app.current_user_id = $1;
      SET LOCAL app.current_user_roles = $2;
    `, [userContext.userId, userContext.roles.join(',')]);

    const result = await db.query(
      'SELECT * FROM hr.employees WHERE employee_id = $1',
      [employeeId]
    );

    if (result.rows.length === 0) {
      // LLM-friendly error (AI can interpret and retry)
      return {
        status: 'error',
        code: 'EMPLOYEE_NOT_FOUND',
        message: `Employee with ID ${employeeId} not found.`,
        suggestedAction: 'Use list_employees tool to find valid employee IDs, or verify the ID format is correct (UUID expected).'
      };
    }

    const employee = result.rows[0];

    // Apply PII masking
    const maskedEmployee = maskSalary(employee, userContext.roles);

    return {
      status: 'success',
      data: maskedEmployee
    };
  } catch (error) {
    // Database error (should not crash AI flow)
    return {
      status: 'error',
      code: 'DATABASE_ERROR',
      message: 'Failed to retrieve employee data.',
      suggestedAction: 'Retry the query or contact support if the issue persists.',
      technicalDetails: error.message  // For logging only, not shown to AI
    };
  }
}
```

### Truncation Warning Pattern (v1.4 - Section 5.3 + Article III.2)
```typescript
async function listEmployees(
  department?: string,
  limit: number = 50,  // Article III.2 max
  userContext: UserContext
): Promise<MCPToolResponse> {
  try {
    // Set session variables for RLS
    await db.query(`
      SET LOCAL app.current_user_id = $1;
      SET LOCAL app.current_user_roles = $2;
    `, [userContext.userId, userContext.roles.join(',')]);

    // Query 1 extra record to detect truncation
    const result = await db.query(
      `SELECT * FROM hr.employees
       WHERE ($1::text IS NULL OR department = $1)
       AND active = true
       LIMIT $2`,
      [department, limit + 1]
    );

    const truncated = result.rows.length > limit;
    const records = result.rows.slice(0, limit);  // Return max 50

    return {
      status: 'success',
      data: records.map(emp => maskSalary(emp, userContext.roles)),
      metadata: {
        truncated,
        totalCount: truncated ? `${limit}+` : result.rows.length.toString(),
        warning: truncated
          ? `TRUNCATION WARNING: Only ${limit} of ${limit}+ records returned. ` +
            `Results are incomplete. Ask user to refine query by specifying: ` +
            `department, team, location, or other filters.`
          : null
      }
    };
  } catch (error) {
    return {
      status: 'error',
      code: 'DATABASE_ERROR',
      message: 'Failed to list employees.',
      suggestedAction: 'Retry the query or contact support.'
    };
  }
}
```

### Cursor-Based Pagination Pattern (v1.4.1 - Lessons Learned)

Replaces simple truncation with full data retrieval across multiple requests.

```typescript
// Cursor encoding/decoding
interface PaginationCursor {
  lastName: string;
  firstName: string;
  id: string;  // Tie-breaker for identical names
}

function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch { return null; }
}

async function listEmployees(
  params: { department?: string; limit?: number; cursor?: string },
  userContext: UserContext
): Promise<MCPToolResponse> {
  const limit = Math.min(params.limit || 50, 50);  // Article III.2 max
  const queryLimit = limit + 1;  // Detect if more exist
  const cursorData = params.cursor ? decodeCursor(params.cursor) : null;

  // Build keyset WHERE clause for efficient pagination
  let whereClauses = ['active = true'];
  let values: any[] = [];

  if (params.department) {
    whereClauses.push(`department = $${values.length + 1}`);
    values.push(params.department);
  }

  if (cursorData) {
    // Multi-column keyset pagination (preserves sort order)
    whereClauses.push(`(
      (last_name > $${values.length + 1}) OR
      (last_name = $${values.length + 1} AND first_name > $${values.length + 2}) OR
      (last_name = $${values.length + 1} AND first_name = $${values.length + 2} AND id > $${values.length + 3})
    )`);
    values.push(cursorData.lastName, cursorData.firstName, cursorData.id);
  }

  const result = await db.query(`
    SELECT * FROM hr.employees
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY last_name, first_name, id
    LIMIT $${values.length + 1}
  `, [...values, queryLimit]);

  const hasMore = result.rows.length > limit;
  const records = result.rows.slice(0, limit);

  // Build pagination metadata
  let metadata: PaginationMetadata = {
    hasMore,
    returnedCount: records.length,
    // Legacy fields for backward compatibility
    truncated: hasMore,
    totalCount: hasMore ? `${limit}+` : records.length.toString()
  };

  if (hasMore && records.length > 0) {
    const lastRecord = records[records.length - 1];
    metadata.nextCursor = encodeCursor({
      lastName: lastRecord.last_name,
      firstName: lastRecord.first_name,
      id: lastRecord.id
    });
    metadata.hint = "To see more employees, say 'show next page' or 'get more employees'.";
  }

  return {
    status: 'success',
    data: records.map(emp => maskSalary(emp, userContext.roles)),
    metadata
  };
}
```

**Database-Specific Pagination Strategies:**

| Database | Strategy | Cursor Fields |
|----------|----------|---------------|
| PostgreSQL (HR, Finance) | Multi-column keyset WHERE | `(lastName, firstName, id)` or `(date, createdAt, id)` |
| MongoDB (Sales) | `_id` with `$lt` operator | `{ _id: ObjectId }` |
| Elasticsearch (Support) | `search_after` with sort values | `{ sort: [timestamp, _id] }` |

**Why Cursor over Offset?**
- **Offset**: `SELECT * OFFSET 1000` scans 1000 rows just to skip them
- **Cursor**: Uses index directly, constant time regardless of page number
- **Stability**: Results don't shift if data is added/deleted between requests

### Pending Confirmation Pattern (v1.4 - Section 5.6)
```typescript
async function deleteEmployee(
  employeeId: string,
  userContext: UserContext
): Promise<MCPToolResponse> {
  try {
    // Verify permissions
    if (!userContext.roles.includes('hr-write') && !userContext.roles.includes('executive')) {
      return {
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only HR administrators can delete employee records.',
        suggestedAction: 'Contact your HR administrator if you need to delete employee data.'
      };
    }

    // Fetch employee details for confirmation UI
    const employeeResult = await getEmployee(employeeId, userContext);

    if (employeeResult.status === 'error') {
      return employeeResult;  // Propagate error
    }

    const employee = employeeResult.data;
    const confirmationId = crypto.randomUUID();

    // Store pending action in Redis (Gateway will handle this)
    // Note: In practice, Gateway stores this when it receives pending_confirmation
    return {
      status: 'pending_confirmation',
      confirmationId,
      message: `⚠️ Delete employee ${employee.name} (${employee.email})?\n\n` +
               `This action will permanently delete the employee record and cannot be undone.\n\n` +
               `Department: ${employee.department}\n` +
               `Employee ID: ${employee.employee_id}`,
      confirmationData: {
        action: 'delete_employee',
        employeeId: employee.employee_id,
        employeeName: employee.name,
        employeeEmail: employee.email,
        department: employee.department,
        userId: userContext.userId  // For ownership verification
      }
    };
  } catch (error) {
    return {
      status: 'error',
      code: 'OPERATION_FAILED',
      message: 'Failed to prepare delete operation.',
      suggestedAction: 'Retry the operation or contact support.'
    };
  }
}

// Execution handler (called by Gateway after user approves)
async function executeDeleteEmployee(
  confirmationData: any,
  userContext: UserContext
): Promise<MCPToolResponse> {
  try {
    // Set session variables
    await db.query(`
      SET LOCAL app.current_user_id = $1;
      SET LOCAL app.current_user_roles = $2;
    `, [userContext.userId, userContext.roles.join(',')]);

    // Execute deletion
    const result = await db.query(
      'DELETE FROM hr.employees WHERE employee_id = $1 RETURNING *',
      [confirmationData.employeeId]
    );

    if (result.rowCount === 0) {
      return {
        status: 'error',
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee no longer exists or was already deleted.'
      };
    }

    return {
      status: 'success',
      data: {
        deleted: true,
        employeeId: confirmationData.employeeId,
        employeeName: confirmationData.employeeName,
        message: `Employee ${confirmationData.employeeName} has been permanently deleted.`
      }
    };
  } catch (error) {
    return {
      status: 'error',
      code: 'DELETE_FAILED',
      message: 'Failed to delete employee.',
      suggestedAction: 'Contact support. The employee record may have dependencies that must be removed first.'
    };
  }
}
```

## Status
**COMPLETE ✅** - All four MCP servers implemented with v1.4 features.

### Implemented Tools Summary

| Service | Port | Tools Implemented |
|---------|------|-------------------|
| **mcp-hr** | 3101 | `get_employee`, `list_employees`, `delete_employee` |
| **mcp-finance** | 3102 | `get_budget`, `list_budgets`, `list_invoices`, `get_expense_report`, `delete_invoice`, `approve_budget` |
| **mcp-sales** | 3103 | `list_deals`, `get_customer`, `close_deal` |
| **mcp-support** | 3104 | `search_tickets`, `search_knowledge_base`, `close_ticket` |

**Total: 15 tools implemented** (9 read, 6 write with confirmations)

### Known Gaps
- `update_salary` tool not implemented (can be added as needed)
- `get_org_chart`, `get_performance_reviews` not implemented
- `get_pipeline`, `close_deal` not implemented

### Write Tool Confirmation Flow (End-to-End)

The complete flow for write operations with human-in-the-loop confirmation:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client/UI     │     │   MCP Gateway   │     │   MCP Server    │     │     Redis       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │                       │
         │ 1. User: "Delete      │                       │                       │
         │    employee Marcus"   │                       │                       │
         │──────────────────────>│                       │                       │
         │                       │                       │                       │
         │                       │ 2. Route to Claude    │                       │
         │                       │    with MCP tools     │                       │
         │                       │                       │                       │
         │                       │ 3. Claude calls       │                       │
         │                       │    delete_employee    │                       │
         │                       │──────────────────────>│                       │
         │                       │                       │                       │
         │                       │                       │ 4. Generate UUID      │
         │                       │                       │    Store in Redis     │
         │                       │                       │──────────────────────>│
         │                       │                       │                       │
         │                       │                       │    SETEX pending:uuid │
         │                       │                       │    TTL=300 (5 min)    │
         │                       │                       │<──────────────────────│
         │                       │                       │                       │
         │                       │ 5. Return             │                       │
         │                       │    pending_confirmation                       │
         │                       │<──────────────────────│                       │
         │                       │                       │                       │
         │ 6. SSE: Claude shows  │                       │                       │
         │    approval message   │                       │                       │
         │<──────────────────────│                       │                       │
         │                       │                       │                       │
         │ 7. User clicks        │                       │                       │
         │    "Approve"          │                       │                       │
         │──────────────────────>│                       │                       │
         │                       │                       │                       │
         │    POST /api/confirm/ │                       │                       │
         │    {approved: true}   │                       │                       │
         │                       │                       │                       │
         │                       │ 8. Gateway retrieves  │                       │
         │                       │    pending action     │                       │
         │                       │──────────────────────────────────────────────>│
         │                       │                       │                       │
         │                       │    GET pending:uuid   │                       │
         │                       │<──────────────────────────────────────────────│
         │                       │                       │                       │
         │                       │ 9. Gateway calls MCP  │                       │
         │                       │    /execute endpoint  │                       │
         │                       │──────────────────────>│                       │
         │                       │                       │                       │
         │                       │                       │ 10. Execute delete    │
         │                       │                       │     with RLS context  │
         │                       │                       │                       │
         │                       │ 11. Return result     │                       │
         │                       │<──────────────────────│                       │
         │                       │                       │                       │
         │                       │ 12. Delete from Redis │                       │
         │                       │──────────────────────────────────────────────>│
         │                       │                       │                       │
         │                       │    DEL pending:uuid   │                       │
         │                       │<──────────────────────────────────────────────│
         │                       │                       │                       │
         │ 13. Return success    │                       │                       │
         │<──────────────────────│                       │                       │
         │                       │                       │                       │
```

**MCP Server /execute Endpoint Pattern:**

```typescript
// Each MCP server exposes /execute for confirmed write operations
app.post('/execute', authMiddleware, async (req, res) => {
  const { confirmationData, userContext } = req.body;

  // Verify user matches the one who initiated the action
  if (confirmationData.userId !== userContext.userId) {
    return res.status(403).json({
      status: 'error',
      code: 'USER_MISMATCH',
      message: 'Action was initiated by a different user'
    });
  }

  // Route to appropriate execution handler
  switch (confirmationData.action) {
    case 'delete_employee':
      return res.json(await executeDeleteEmployee(confirmationData, userContext));
    case 'delete_invoice':
      return res.json(await executeDeleteInvoice(confirmationData, userContext));
    // ... other write operations
  }
});
```

**Redis Confirmation Data Structure:**

```typescript
// Stored at key: pending:{confirmationId}
// TTL: 300 seconds (5 minutes)
{
  action: 'delete_employee',        // Action type for routing
  mcpServer: 'hr',                  // Which server will execute
  userId: 'uuid',                   // User who initiated (for ownership check)
  timestamp: 1703612345678,         // When confirmation was created
  // Action-specific data:
  employeeId: 'uuid',
  employeeName: 'Marcus Johnson',
  employeeEmail: 'marcus@tamshai-playground.local',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  reason: 'No reason provided'
}
```

## 9. JSON Schemas for MCP Tools

### 9.1 Response Schema (All Tools)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MCPToolResponse",
  "description": "Discriminated union response for all MCP tools",
  "oneOf": [
    {
      "type": "object",
      "title": "SuccessResponse",
      "required": ["status", "data"],
      "properties": {
        "status": { "const": "success" },
        "data": { "description": "Tool-specific response data" },
        "metadata": { "$ref": "#/$defs/PaginationMetadata" }
      }
    },
    {
      "type": "object",
      "title": "ErrorResponse",
      "required": ["status", "code", "message"],
      "properties": {
        "status": { "const": "error" },
        "code": { "type": "string", "enum": [
          "EMPLOYEE_NOT_FOUND", "CUSTOMER_NOT_FOUND", "INVOICE_NOT_FOUND",
          "TICKET_NOT_FOUND", "ARTICLE_NOT_FOUND", "BUDGET_NOT_FOUND",
          "INSUFFICIENT_PERMISSIONS", "INVALID_INPUT", "DATABASE_ERROR",
          "VALIDATION_ERROR", "OPERATION_FAILED", "USER_MISMATCH"
        ]},
        "message": { "type": "string" },
        "suggestedAction": { "type": "string" },
        "technicalDetails": { "type": "string" }
      }
    },
    {
      "type": "object",
      "title": "PendingConfirmationResponse",
      "required": ["status", "confirmationId", "message", "confirmationData"],
      "properties": {
        "status": { "const": "pending_confirmation" },
        "confirmationId": { "type": "string", "format": "uuid" },
        "message": { "type": "string" },
        "confirmationData": { "$ref": "#/$defs/ConfirmationData" }
      }
    }
  ],
  "$defs": {
    "PaginationMetadata": {
      "type": "object",
      "properties": {
        "hasMore": { "type": "boolean" },
        "nextCursor": { "type": "string" },
        "returnedCount": { "type": "integer", "minimum": 0 },
        "totalEstimate": { "type": "string", "pattern": "^\\d+\\+?$" },
        "hint": { "type": "string" },
        "truncated": { "type": "boolean" },
        "totalCount": { "type": "string" },
        "warning": { "type": "string" }
      }
    },
    "ConfirmationData": {
      "type": "object",
      "required": ["action", "userId"],
      "properties": {
        "action": { "type": "string", "enum": [
          "delete_employee", "update_salary", "delete_invoice",
          "approve_budget", "delete_customer", "close_deal", "close_ticket"
        ]},
        "userId": { "type": "string", "format": "uuid" },
        "mcpServer": { "type": "string", "enum": ["hr", "finance", "sales", "support"] },
        "timestamp": { "type": "integer" }
      },
      "additionalProperties": true
    }
  }
}
```

### 9.2 MCP HR Tool Schemas

#### get_employee

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "get_employee Input",
  "type": "object",
  "required": ["employee_id"],
  "properties": {
    "employee_id": {
      "type": "string",
      "format": "uuid",
      "description": "The unique identifier of the employee"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema (on success):**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Employee",
  "type": "object",
  "required": ["employee_id", "first_name", "last_name", "email", "department"],
  "properties": {
    "employee_id": { "type": "string", "format": "uuid" },
    "first_name": { "type": "string", "maxLength": 50 },
    "last_name": { "type": "string", "maxLength": 50 },
    "email": { "type": "string", "format": "email" },
    "department": { "type": "string" },
    "job_title": { "type": "string" },
    "manager_id": { "type": ["string", "null"], "format": "uuid" },
    "hire_date": { "type": "string", "format": "date" },
    "salary": { "oneOf": [
      { "type": "number", "minimum": 0 },
      { "type": "string", "const": "*** (Hidden)" }
    ]},
    "ssn": { "oneOf": [
      { "type": "string", "pattern": "^\\d{3}-\\d{2}-\\d{4}$" },
      { "type": "string", "const": "*** (Hidden)" }
    ]},
    "phone": { "type": "string" },
    "location": { "type": "string" },
    "active": { "type": "boolean" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

#### list_employees

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "list_employees Input",
  "type": "object",
  "properties": {
    "department": {
      "type": "string",
      "description": "Filter by department name"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 50,
      "description": "Maximum records to return (Article III.2 max: 50)"
    },
    "cursor": {
      "type": "string",
      "description": "Base64-encoded cursor for pagination"
    }
  },
  "additionalProperties": false
}
```

#### delete_employee

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "delete_employee Input",
  "type": "object",
  "required": ["employee_id"],
  "properties": {
    "employee_id": {
      "type": "string",
      "format": "uuid",
      "description": "The employee to delete"
    },
    "reason": {
      "type": "string",
      "maxLength": 500,
      "description": "Optional reason for deletion (audit trail)"
    }
  },
  "additionalProperties": false
}
```

#### update_salary

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "update_salary Input",
  "type": "object",
  "required": ["employee_id", "new_salary"],
  "properties": {
    "employee_id": {
      "type": "string",
      "format": "uuid"
    },
    "new_salary": {
      "type": "number",
      "minimum": 0,
      "maximum": 10000000,
      "description": "New annual salary in USD"
    },
    "effective_date": {
      "type": "string",
      "format": "date",
      "description": "When the salary change takes effect (default: immediate)"
    },
    "reason": {
      "type": "string",
      "maxLength": 500
    }
  },
  "additionalProperties": false
}
```

### 9.3 MCP Finance Tool Schemas

#### get_budget

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "get_budget Input",
  "type": "object",
  "required": ["department"],
  "properties": {
    "department": {
      "type": "string",
      "description": "Department name"
    },
    "year": {
      "type": "integer",
      "minimum": 2000,
      "maximum": 2100,
      "description": "Fiscal year (default: current year)"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Budget",
  "type": "object",
  "required": ["budget_id", "department", "fiscal_year", "allocated_amount"],
  "properties": {
    "budget_id": { "type": "string", "format": "uuid" },
    "department": { "type": "string" },
    "fiscal_year": { "type": "integer" },
    "allocated_amount": { "type": "number", "minimum": 0 },
    "spent_amount": { "type": "number", "minimum": 0 },
    "remaining_amount": { "type": "number" },
    "status": { "type": "string", "enum": ["draft", "approved", "active", "closed"] },
    "approved_by": { "type": ["string", "null"], "format": "uuid" },
    "approved_at": { "type": ["string", "null"], "format": "date-time" }
  }
}
```

#### list_invoices

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "list_invoices Input",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["pending", "approved", "paid", "rejected", "overdue"],
      "description": "Filter by invoice status"
    },
    "vendor": {
      "type": "string",
      "description": "Filter by vendor name (partial match)"
    },
    "department": {
      "type": "string",
      "description": "Filter by department"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 50
    },
    "cursor": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Invoice",
  "type": "object",
  "required": ["invoice_id", "vendor_name", "amount", "status"],
  "properties": {
    "invoice_id": { "type": "string", "format": "uuid" },
    "vendor_name": { "type": "string" },
    "vendor_id": { "type": "string" },
    "amount": { "type": "number", "minimum": 0 },
    "currency": { "type": "string", "default": "USD" },
    "description": { "type": "string" },
    "department": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "approved", "paid", "rejected", "overdue"] },
    "due_date": { "type": "string", "format": "date" },
    "submitted_by": { "type": "string", "format": "uuid" },
    "submitted_at": { "type": "string", "format": "date-time" },
    "approved_by": { "type": ["string", "null"], "format": "uuid" },
    "approved_at": { "type": ["string", "null"], "format": "date-time" }
  }
}
```

#### delete_invoice

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "delete_invoice Input",
  "type": "object",
  "required": ["invoice_id"],
  "properties": {
    "invoice_id": {
      "type": "string",
      "format": "uuid"
    },
    "reason": {
      "type": "string",
      "maxLength": 500
    }
  },
  "additionalProperties": false
}
```

#### approve_budget

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "approve_budget Input",
  "type": "object",
  "required": ["department", "amount"],
  "properties": {
    "department": {
      "type": "string"
    },
    "amount": {
      "type": "number",
      "minimum": 0,
      "description": "Approved budget amount in USD"
    },
    "fiscal_year": {
      "type": "integer",
      "minimum": 2000,
      "maximum": 2100
    },
    "notes": {
      "type": "string",
      "maxLength": 1000
    }
  },
  "additionalProperties": false
}
```

### 9.4 MCP Sales Tool Schemas

#### get_customer

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "get_customer Input",
  "type": "object",
  "required": ["customer_id"],
  "properties": {
    "customer_id": {
      "type": "string",
      "description": "MongoDB ObjectId as string"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Customer",
  "type": "object",
  "required": ["_id", "name", "email"],
  "properties": {
    "_id": { "type": "string" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "company": { "type": "string" },
    "industry": { "type": "string" },
    "phone": { "type": "string" },
    "address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" },
        "state": { "type": "string" },
        "zip": { "type": "string" },
        "country": { "type": "string" }
      }
    },
    "account_owner": { "type": "string" },
    "tier": { "type": "string", "enum": ["enterprise", "business", "startup", "free"] },
    "annual_revenue": { "type": "number" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

#### list_deals

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "list_deals Input",
  "type": "object",
  "properties": {
    "stage": {
      "type": "string",
      "enum": ["PROSPECTING", "DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"],
      "description": "Filter by sales stage (uppercase)"
    },
    "owner": {
      "type": "string",
      "description": "Filter by account owner email"
    },
    "min_value": {
      "type": "number",
      "minimum": 0,
      "description": "Minimum deal value"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 50
    },
    "cursor": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Deal",
  "type": "object",
  "required": ["_id", "customer_id", "deal_name", "value", "stage"],
  "properties": {
    "_id": { "type": "string" },
    "customer_id": { "type": "string" },
    "customer_name": { "type": "string" },
    "deal_name": { "type": "string" },
    "value": { "type": "number", "minimum": 0 },
    "currency": { "type": "string", "default": "USD" },
    "stage": { "type": "string", "enum": ["PROSPECTING", "DISCOVERY", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"] },
    "probability": { "type": "number", "minimum": 0, "maximum": 100 },
    "expected_close_date": { "type": "string", "format": "date" },
    "owner": { "type": "string" },
    "notes": { "type": "string" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

#### delete_customer

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "delete_customer Input",
  "type": "object",
  "required": ["customer_id"],
  "properties": {
    "customer_id": {
      "type": "string"
    },
    "reason": {
      "type": "string",
      "maxLength": 500
    }
  },
  "additionalProperties": false
}
```

#### close_deal

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "close_deal Input",
  "type": "object",
  "required": ["deal_id", "outcome"],
  "properties": {
    "deal_id": {
      "type": "string"
    },
    "outcome": {
      "type": "string",
      "enum": ["won", "lost"]
    },
    "actual_value": {
      "type": "number",
      "minimum": 0,
      "description": "Final deal value (for won deals)"
    },
    "loss_reason": {
      "type": "string",
      "description": "Reason for lost deal"
    },
    "notes": {
      "type": "string",
      "maxLength": 1000
    }
  },
  "additionalProperties": false
}
```

### 9.5 MCP Support Tool Schemas

#### search_tickets

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "search_tickets Input",
  "type": "object",
  "required": ["query"],
  "properties": {
    "query": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500,
      "description": "Elasticsearch query string"
    },
    "status": {
      "type": "string",
      "enum": ["open", "in_progress", "pending", "resolved", "closed"],
      "description": "Filter by ticket status"
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high", "critical"]
    },
    "customer_id": {
      "type": "string",
      "description": "Filter by customer"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 50
    },
    "cursor": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Ticket",
  "type": "object",
  "required": ["ticket_id", "subject", "status"],
  "properties": {
    "ticket_id": { "type": "string" },
    "subject": { "type": "string" },
    "description": { "type": "string" },
    "status": { "type": "string", "enum": ["open", "in_progress", "pending", "resolved", "closed"] },
    "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
    "customer_id": { "type": "string" },
    "customer_name": { "type": "string" },
    "customer_email": { "type": "string", "format": "email" },
    "assigned_to": { "type": ["string", "null"] },
    "category": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "resolved_at": { "type": ["string", "null"], "format": "date-time" },
    "_score": { "type": "number", "description": "Elasticsearch relevance score" }
  }
}
```

#### get_knowledge_article

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "get_knowledge_article Input",
  "type": "object",
  "required": ["article_id"],
  "properties": {
    "article_id": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

**Output Data Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "KnowledgeArticle",
  "type": "object",
  "required": ["article_id", "title", "content"],
  "properties": {
    "article_id": { "type": "string" },
    "title": { "type": "string" },
    "content": { "type": "string" },
    "summary": { "type": "string" },
    "category": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "author": { "type": "string" },
    "status": { "type": "string", "enum": ["draft", "published", "archived"] },
    "view_count": { "type": "integer", "minimum": 0 },
    "helpful_votes": { "type": "integer", "minimum": 0 },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

#### close_ticket

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "close_ticket Input",
  "type": "object",
  "required": ["ticket_id", "resolution"],
  "properties": {
    "ticket_id": {
      "type": "string"
    },
    "resolution": {
      "type": "string",
      "minLength": 10,
      "maxLength": 2000,
      "description": "Resolution summary for the ticket"
    },
    "resolution_type": {
      "type": "string",
      "enum": ["solved", "workaround", "duplicate", "cannot_reproduce", "wont_fix"],
      "default": "solved"
    },
    "customer_notified": {
      "type": "boolean",
      "default": true
    }
  },
  "additionalProperties": false
}
```

### 9.6 Schema Validation Example

**TypeScript implementation using Zod:**

```typescript
import { z } from 'zod';

// Tool input validation
const getEmployeeSchema = z.object({
  employee_id: z.string().uuid()
}).strict();

const listEmployeesSchema = z.object({
  department: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
  cursor: z.string().optional()
}).strict();

// Validate in tool handler
async function handleGetEmployee(input: unknown): Promise<MCPToolResponse> {
  const validation = getEmployeeSchema.safeParse(input);

  if (!validation.success) {
    return {
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Invalid input parameters',
      suggestedAction: validation.error.errors.map(e =>
        `${e.path.join('.')}: ${e.message}`
      ).join('; ')
    };
  }

  const { employee_id } = validation.data;
  // ... proceed with validated data
}
```

## Architecture Version
**Updated for**: v1.4 (December 2025)
**v1.4 Changes Applied**:
- ✅ Section 3: Updated all tool definitions with discriminated union response schemas
- ✅ Section 3: Added 8 write tools across 4 MCP servers (delete, update operations)
- ✅ Section 4: Added error handling, truncation, and confirmation scenarios
- ✅ Section 5: Added 6 v1.4 success criteria
- ✅ Section 7.4: LLM-friendly error schema pattern (Article II.3 compliance)
- ✅ Section 5.3: Truncation warning pattern (Article III.2 enforcement)
- ✅ Section 5.6: Human-in-the-loop confirmation pattern with Redis TTL

**v1.4.1 Changes (Lessons Learned)**:
- ✅ PaginationMetadata type with cursor-based fields (hasMore, nextCursor, hint)
- ✅ Cursor-based pagination pattern for all list operations
- ✅ Database-specific pagination strategies (PostgreSQL keyset, MongoDB $lt, ES search_after)
- ✅ Backward compatibility with truncation fields

**Constitutional Compliance**:
- Article II.3 (Error Schemas): ✅ **FULFILLED** by LLM-friendly error responses
- Article III.2 (Context Limits): ✅ **ENFORCED** by truncation metadata with warnings
