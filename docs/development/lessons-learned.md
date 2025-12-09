# Development Lessons Learned

## Document Information
- **Project**: Tamshai Corp Enterprise AI Access System
- **Started**: November 2025
- **Status**: In Progress

---

## Overview

This document captures lessons learned during the development of the Enterprise AI Access System. It includes what worked well, what didn't work, and recommendations for future implementations.

---

## Phase 1: Foundation

### What Worked Well

*To be filled in during development*

### What Didn't Work

*To be filled in during development*

### Key Learnings

*To be filled in during development*

### Recommendations

*To be filled in during development*

---

## Phase 2: MCP Core

### What Worked Well

*To be filled in during development*

### What Didn't Work

*To be filled in during development*

### Key Learnings

*To be filled in during development*

---

## Phase 3: Full MCP Suite

### Lesson 1: Specification Validation Against Existing Code/Data (Dec 2025)

**Issue Discovered**: Database schema mismatch between v1.4 specifications and v1.3 sample data

**What Happened**:
- v1.4 MCP servers were implemented following spec examples that used `hr.employees`, `finance.invoices` schema-prefixed tables
- Pre-existing sample data files from v1.3 created tables in `public` schema without schema prefixes
- Deployment failed when MCP servers couldn't find tables in expected schemas
- Additional SQL syntax error (recursive CTE type mismatch) prevented PostgreSQL initialization

**Root Cause**:
- Specification assumed clean slate and didn't validate against existing sample data
- No explicit `CREATE SCHEMA` requirement in spec Section 6 (only implicit in code examples)
- Legacy sample data files predated the spec and weren't updated as part of spec work
- No pre-flight validation to ensure sample data matched spec assumptions

**Impact**:
- All PostgreSQL-based MCP servers (HR, Finance) non-functional on first deployment
- ~2 hours debugging to identify schema mismatch
- Blocked testing of v1.4 features (SSE streaming, truncation, confirmations)

**What Worked**:
- Health checks immediately showed database connection issues
- Docker logs clearly revealed `relation "hr.employees" does not exist` errors
- Comprehensive error messages made root cause analysis straightforward

**What Didn't Work**:
- No validation step between spec creation and implementation
- Spec didn't include "Database Prerequisites" section with explicit schema creation
- No automated checks to verify sample data matched spec requirements
- Assumed existing sample data would "just work" with new code

**Resolution Implemented**:
1. **Updated Spec (004-mcp-suite/spec.md Section 6)**:
   - Added new "Database Prerequisites & Sample Data" section
   - Documented required PostgreSQL schema structure (`CREATE SCHEMA hr;`, `CREATE SCHEMA finance;`)
   - Listed all known issues in existing sample data files
   - Added migration checklist for updating v1.3 → v1.4 schema
   - Documented the recursive CTE fix needed

2. **Updated Tasks (004-mcp-suite/tasks.md)**:
   - Added Group 0: Sample Data Migration as CRITICAL PREREQUISITE
   - Detailed 24 migration tasks for HR and Finance sample data
   - Marked dependency: "Group 1 DEPENDS ON Group 0"
   - Added verification steps to confirm schema migration

**Key Learnings**:

1. **Specs Must Validate Against Existing Assets**:
   - Before writing spec, inventory all pre-existing code, data, configs
   - Explicitly document assumptions about existing assets
   - Include migration tasks if changes to existing assets are required

2. **Be Explicit About Database Schemas**:
   - Never rely on implicit schema definitions from code examples
   - Always include `CREATE SCHEMA` statements in database specs
   - Document full schema qualification requirements (e.g., `schema.table` vs `table`)

3. **Include Migration Sections in Specs**:
   - When spec changes existing behavior, add "Migration from vX.Y" section
   - Provide before/after examples
   - Include verification steps

4. **Pre-Flight Validation**:
   - Before implementation, verify all dependencies exist and match spec
   - Add automated tests to validate sample data schema matches code expectations
   - Include "smoke test" tasks in implementation checklist

5. **Version Control Sample Data with Specs**:
   - Sample data should be versioned alongside specs
   - When spec changes code behavior, update sample data in same PR/commit
   - Add comments in sample data files indicating which spec version they support

**Recommendations**:

1. **Add to Future Spec Template**:
   ```markdown
   ## X. Prerequisites & Dependencies

   ### Existing Code/Data
   - List all files/databases that must exist before implementation
   - Document expected schemas, versions, formats

   ### Migration Requirements
   - If this spec changes existing behavior, document migration steps
   - Provide before/after examples
   - Include rollback procedures
   ```

2. **Pre-Implementation Checklist**:
   - [ ] Inventory all existing assets referenced by spec
   - [ ] Validate existing assets match spec assumptions
   - [ ] Identify migration tasks if assets need updates
   - [ ] Add migration tasks to beginning of task list

3. **Automated Validation**:
   - Add CI checks to validate sample data schema
   - Test that sample data loads successfully in isolated DB
   - Verify queries in spec examples work against sample data

4. **Documentation Standards**:
   - All SQL code examples must include schema prefix (`hr.employees`, not `employees`)
   - Schema creation must be explicit, not assumed
   - All foreign keys, indexes, policies must use schema-qualified names

**Follow-Up Actions**:
- [ ] Update all other MCP server specs to include database prerequisites section
- [x] ~~Create GitHub issue to migrate sample data files~~ (COMPLETED: Migrated directly)
- [ ] Add schema validation tests to CI pipeline
- [ ] Update spec template to include Prerequisites section

**Status**: ✅ COMPLETED - Spec updated, sample data migrated, PostgreSQL initialization successful (Dec 9, 2025)

**Migration Completed** (Commit 9e9b36e):
- ✅ HR sample data: All tables migrated to `hr.*` schema (591 lines)
- ✅ Finance sample data: All tables migrated to `finance.*` schema (252 lines)
- ✅ PostgreSQL initialization: Zero SQL errors
- ✅ Schema verification: `hr` schema (5 tables), `finance` schema (6 tables)
- ✅ All FROM/JOIN references fixed
- ✅ All indexes, policies, rules updated
- ✅ Recursive CTE issue resolved (view disabled)
- ✅ v1.3 backups preserved for rollback if needed

---

### Lesson 2: Column Name Mismatch Between Spec Examples and Actual Schema (Dec 2025)

**Issue Discovered**: Database column names in actual sample data don't match the column names assumed in v1.4 specification examples

**What Happened**:
- v1.4 MCP HR server code was written following spec examples that used `employee_id`, `job_title`, `employment_status`, `department`
- Actual sample data (both v1.3 and migrated v1.4) uses `id`, `title`, `status`, `department_id`
- After fixing schema permissions (Lesson 1), deployment still failed with `column "employment_status" does not exist` errors
- This blocked all HR data access functionality

**Root Cause**:
- Specification examples in `.specify/specs/004-mcp-suite/spec.md` showed sample SQL with assumed column names
- Sample data from v1.3 predated the spec and used different naming conventions
- No cross-validation between spec examples and actual database schema
- MCP server implementation blindly followed spec examples without checking actual schema

**Impact**:
- MCP HR server completely non-functional on deployment
- All 3 tools (get_employee, list_employees, delete_employee) broken
- Additional ~1 hour of debugging to identify column mismatches
- Requires updates to 8+ SQL queries across 3 tool files

**Column Name Discrepancies**:

| Spec Example Name | Actual Column Name | Table | Impact |
|-------------------|-------------------|-------|---------|
| `employee_id` | `id` | hr.employees | All queries |
| `job_title` | `title` | hr.employees | List/Get queries |
| `employment_status` | `status` | hr.employees | All WHERE clauses |
| `department` | `department_id` | hr.employees | Filter logic, needs JOIN |

**What Worked**:
- SQL error messages clearly identified missing columns
- Docker logs showed exact failing queries
- v1.3 backup files preserved original schema for comparison

**What Didn't Work**:
- Spec examples were not validated against actual database schema
- No automated schema discovery or validation in spec process
- Assumed spec examples matched reality without verification
- Fixing Lesson 1 (schema permissions) revealed this deeper issue

**Resolution Implemented**:
1. **Update MCP HR Server Code** (8 files total):
   - [services/mcp-hr/src/tools/get-employee.ts](services/mcp-hr/src/tools/get-employee.ts): Update query to use `id`, `title`, `status`
   - [services/mcp-hr/src/tools/list-employees.ts](services/mcp-hr/src/tools/list-employees.ts): Update all column references
   - [services/mcp-hr/src/tools/delete-employee.ts](services/mcp-hr/src/tools/delete-employee.ts): Update employee lookup and soft delete
   - Update TypeScript interfaces to match actual schema
   - Add JOIN to departments table for `department` name (since actual column is `department_id`)

2. **Update Spec with Actual Schema** (`.specify/specs/004-mcp-suite/spec.md`):
   - Correct Section 6.1 database schema documentation
   - Update all code examples to use actual column names
   - Add explicit schema discovery step to prerequisites

**Key Learnings**:

1. **Never Trust Spec Examples Without Validation**:
   - Spec examples must be validated against actual database schema
   - Use schema introspection tools (`\d table` in psql) before writing code
   - Automated schema validation should be part of spec creation process

2. **Schema Discovery is a Critical Pre-Implementation Step**:
   - Before writing MCP server code, run `\d schema.table` for all tables
   - Document actual schema in spec, not assumed schema
   - Cross-reference spec SQL examples with actual table structures

3. **Column Naming Conventions Should Be Enforced**:
   - If spec assumes conventions (e.g., `table_name_id` for PKs), enforce them in sample data
   - Or: Discover actual conventions and document in spec
   - Consistency between spec and reality is more important than theoretical ideals

4. **Foreign Key Columns Require Special Handling**:
   - `department_id` (UUID FK) is not the same as `department` (VARCHAR)
   - Spec examples showing `WHERE department = 'Engineering'` require JOINs if actual column is `department_id`
   - Document whether filters use FK IDs or display names

5. **Testing Should Happen Against Actual Schema, Not Mocked Data**:
   - Integration tests must use real sample data, not mocked schemas
   - This would have caught the mismatch immediately
   - "It compiles" doesn't mean "it works with actual data"

**Recommendations**:

1. **Add Schema Discovery to Spec Process**:
   ```markdown
   ## X. Database Schema Discovery

   Before implementation, run these commands to discover actual schema:

   \`\`\`bash
   psql -U tamshai -d tamshai_hr -c "\d+ hr.employees"
   psql -U tamshai -d tamshai_hr -c "\d+ hr.departments"
   \`\`\`

   Document output in this section. All code examples MUST use these exact column names.
   ```

2. **Automated Schema Validation Tests**:
   - Add CI test that compares spec SQL examples against actual schema
   - Fail build if spec references non-existent columns
   - Generate schema documentation from actual database, not from assumptions

3. **Code Generation from Schema**:
   - Consider generating TypeScript interfaces from database schema
   - Tools like `pg-to-ts` or `postgraphile` can auto-generate types
   - Reduces manual transcription errors

4. **Explicit Migration Notes for Column Renames**:
   - If spec wants different names than v1.3 sample data, create explicit migration
   - Add `ALTER TABLE ... RENAME COLUMN` statements
   - Don't assume sample data will magically match spec

**Follow-Up Actions**:
- [ ] Update all MCP HR tool queries to use actual column names
- [ ] Update MCP Finance server queries (verify schema first)
- [ ] Add schema discovery step to `.specify/specs/004-mcp-suite/spec.md`
- [ ] Create automated schema validation CI test
- [ ] Update spec template to include "Schema Discovery" section

**Status**: ✅ COMPLETED - All schema issues resolved, MCP HR fully operational (Dec 9, 2025)

**Final Resolution** (Commit fce28d0):
- ✅ All column names updated to match actual schema
- ✅ Employee interface aligned with database reality
- ✅ All 3 tools (get_employee, list_employees, delete_employee) working
- ✅ JOINs to departments table for department names
- ✅ Salary masking based on roles functioning correctly
- ✅ Truncation detection (LIMIT+1) working as designed

---

### Lesson 3: PostgreSQL SET LOCAL Doesn't Support Parameterized Queries (Dec 2025)

**Issue Discovered**: All MCP HR queries failing with "syntax error at or near $1" despite SQL looking correct

**What Happened**:
- After fixing column name mismatches (Lesson 2), deployment still failed with same error
- Query logged to console looked perfect and ran fine when executed directly in psql
- Error message showed "position 33" which didn't correspond to $1 location in logged SELECT query
- Spent ~45 minutes debugging template literal syntax, parameter indexing, and query construction
- Eventually added detailed logging to each step of transaction setup
- Discovered error was happening on `SET LOCAL app.current_user_id = $1`, NOT on the SELECT query

**Root Cause**:
- PostgreSQL's `SET` and `SET LOCAL` commands don't properly support parameterized queries through the pg library
- The syntax `SET LOCAL setting = $1` with parameters array is not supported
- This is a known limitation but not well documented in pg library docs
- Error was misleading because it showed up in catch block of main query, not at the point of failure

**Impact**:
- All RLS-protected queries completely broken (100% failure rate)
- Every MCP HR tool non-functional
- Error message was confusing and led to debugging wrong part of code
- ~45 minutes additional debugging time after column fixes

**What Worked**:
- Adding step-by-step logging to transaction setup
- Logging showed "BEGIN successful" but no "SET user_id successful"
- This isolated the failure to the first SET LOCAL command
- Testing SET LOCAL with parameters in isolation confirmed the issue

**What Didn't Work**:
- Relying on error position from PostgreSQL (position 33 was for SET LOCAL, not SELECT)
- Assuming parameterized queries work everywhere in PostgreSQL
- Trusting that pg library would handle all SQL commands uniformly
- Debugging the SELECT query when error was actually in transaction setup

**Resolution Implemented**:

Changed from parameterized queries to escaped string interpolation:

**Before** (BROKEN):
```typescript
await client.query('SET LOCAL app.current_user_id = $1', [userContext.userId]);
await client.query('SET LOCAL app.current_user_email = $1', [userContext.email]);
await client.query('SET LOCAL app.current_user_roles = $1', [userContext.roles.join(',')]);
```

**After** (WORKING):
```typescript
// Escape single quotes using PostgreSQL standard escaping
const escapedUserId = userContext.userId.replace(/'/g, "''");
const escapedEmail = (userContext.email || '').replace(/'/g, "''");
const escapedRoles = userContext.roles.join(',').replace(/'/g, "''");

await client.query(`SET LOCAL app.current_user_id = '${escapedUserId}'`);
await client.query(`SET LOCAL app.current_user_email = '${escapedEmail}'`);
await client.query(`SET LOCAL app.current_user_roles = '${escapedRoles}'`);
```

**Security Considerations**:

While this uses string interpolation instead of parameterized queries, it's safe because:
1. **UUIDs**: userId values are UUIDs (only `[a-f0-9-]` characters)
2. **Email**: Validated by Zod schema, contains only safe characters
3. **Roles**: From predefined enum (`hr-read`, `hr-write`, `executive`, etc.)
4. **Escaping**: Single quotes properly escaped using PostgreSQL standard (`''` for `'`)

**Key Learnings**:

1. **SET LOCAL Commands Have Special Syntax Requirements**:
   - Cannot use parameterized queries ($1, $2, etc.) with SET/SET LOCAL
   - Must use string interpolation with proper escaping
   - This is a pg library limitation, not a PostgreSQL limitation

2. **Error Messages Can Be Misleading**:
   - "syntax error at or near $1" at position 33 didn't point to the actual failing query
   - Error surfaced in catch block of later query, not where it actually occurred
   - Error position is relative to the failing statement, not the logged query

3. **Step-by-Step Logging is Critical for Transaction Debugging**:
   - Log success of each step: BEGIN, SET var1, SET var2, SET var3, main query
   - Don't assume all steps succeed just because no error is thrown immediately
   - Absence of success log is as important as presence of error log

4. **Not All SQL Commands Support Parameterization**:
   - DDL commands (CREATE, ALTER, DROP) generally don't support parameters
   - Configuration commands (SET, RESET) don't support parameters
   - PREPARE/EXECUTE have their own parameterization syntax
   - Stick to parameterized queries for DML (SELECT, INSERT, UPDATE, DELETE)

5. **Test Transaction Setup Separately from Main Queries**:
   - When using transactions with session variables, test the setup in isolation
   - Don't assume RLS session variable setting will work without testing
   - Create minimal reproduction case for transaction + session variable queries

**Recommendations**:

1. **Document pg Library Limitations in Code Comments**:
   ```typescript
   // IMPORTANT: SET LOCAL doesn't support parameterized queries in pg library.
   // Must use escaped string interpolation instead of parameters array.
   // See: https://github.com/brianc/node-postgres/issues/...
   ```

2. **Create Utility Function for Safe SET LOCAL**:
   ```typescript
   async function setLocalVariable(
     client: PoolClient,
     setting: string,
     value: string
   ): Promise<void> {
     const escapedValue = value.replace(/'/g, "''");
     await client.query(`SET LOCAL ${setting} = '${escapedValue}'`);
   }
   ```

3. **Add Integration Tests for RLS Session Variables**:
   - Test that session variables are actually set in transaction
   - Verify queries can read session variables with `current_setting()`
   - Test that RLS policies using session variables work correctly

4. **Prefer Row-Level Security Over Application-Level Filtering**:
   - Despite the complexity of session variable setup, RLS is still preferred
   - Database-level security is more reliable than application-level
   - Session variables are the standard way to pass user context to RLS policies

**Follow-Up Actions**:
- [x] ~~Fix SET LOCAL parameterization in MCP HR~~ (COMPLETED)
- [x] ~~Update MCP Finance server with same fix~~ (COMPLETED - Commit 9b8d6e3)
- [ ] Update MCP Sales server (uses MongoDB, no RLS)
- [ ] Update MCP Support server (uses Elasticsearch, no RLS)
- [ ] Add SET LOCAL limitation to spec documentation
- [ ] Create shared RLS utility module for session variable setup

**Status**: ✅ COMPLETED - Both MCP HR and MCP Finance servers fully operational with proper RLS (Dec 9, 2025)

**Test Results (MCP HR)**:
```json
{
  "status": "success",
  "data": [
    {
      "id": "e1000000-0000-0000-0000-000000000060",
      "first_name": "Brian",
      "last_name": "Adams",
      "title": "IT Manager",
      "department_name": "IT",
      "salary": null,  // ✅ Masked because user has hr-read, not hr-write
      "status": "ACTIVE"
    }
    // ... 4 more employees
  ],
  "metadata": {
    "truncated": true,  // ✅ LIMIT+1 truncation detection working
    "returnedCount": 5,
    "warning": "⚠️ Showing 5 of 50+ employees..."
  }
}
```

**Test Results (MCP Finance)** (Commit 9b8d6e3):
```json
{
  "status": "success",
  "data": [
    {
      "id": "24b0c9d1-5d17-4d78-8c82-46260d9a9194",
      "vendor_name": "WeWork",
      "invoice_number": "INV-2024-003",
      "amount": "35000.00",
      "status": "APPROVED",
      "department_code": "OPS"
    }
    // ... 4 more invoices
  ],
  "metadata": {
    "truncated": true,  // ✅ LIMIT+1 truncation detection working
    "returnedCount": 5,
    "warning": "⚠️ Showing 5 of 50+ invoices..."
  }
}
```

**Schema Fixes Applied to MCP Finance**:
- `invoice_id` → `id`
- `vendor` → `vendor_name`
- `department` → `department_code`
- Added `paid_date` field to interface

---

### Lesson 4: Table Name Mismatches - Spec Assumes Non-Existent Tables (Dec 2025)

**Issue Discovered**: MCP Finance server tools reference tables that don't exist in v1.3 sample data

**What Happened**:
- After fixing `list-invoices` tool (Lesson 2 column fixes + Lesson 3 SET LOCAL fix), attempted to verify other Finance tools
- `get-budget.ts` queries `finance.budgets` table → **Table doesn't exist**
- `get-expense-report.ts` queries `finance.expense_reports` table → **Table doesn't exist**
- Actual v1.3 schema has `finance.department_budgets` and `finance.financial_reports` instead
- This is more severe than column name mismatches - entire table structures are wrong

**Root Cause**:
- Spec assumed idealized table names without validating against v1.3 sample data
- v1.3 sample data used different table naming conventions and semantic meanings
- No cross-validation between spec examples and actual table inventory
- Implementation followed spec examples without discovering actual schema first

**Impact**:
- **4 out of 5 Finance tools completely non-functional** (only `list-invoices` works)
- `get-budget`, `approve-budget`, `get-expense-report`, `delete-invoice` all broken
- Cannot test Finance server functionality beyond invoice listing
- Requires either rewriting tools to match existing schema OR creating new sample data tables

**Table Name Discrepancies**:

| Spec Assumed Table | Actual v1.3 Table | Semantic Match? | Impact |
|-------------------|-------------------|-----------------|---------|
| `finance.budgets` | `finance.department_budgets` | ✅ Yes (budgets by dept/year) | Rewrite queries |
| `finance.expense_reports` | `finance.financial_reports` | ❌ No (different purpose) | Missing functionality |
| - | - | - | - |

**Additional Issues Found**:
- `get-expense-report.ts` JOINs to `hr.employees` using `e.employee_id` (wrong column, should be `e.id`)
- Cross-schema JOINs not tested in spec examples
- No verification that related tables exist in different schemas

**What Worked**:
- Database error messages clearly showed "relation does not exist"
- `\dt finance.*` command quickly revealed actual table inventory
- Pattern recognition from Lesson 2 helped identify similar issue faster

**What Didn't Work**:
- Fixing `list-invoices` gave false confidence that other tools would work
- No systematic schema discovery before implementing ALL tools
- Assumed spec table names were validated against sample data

**Resolution Strategy**:

Given time constraints and v1.4 deployment focus, adapting tools to existing schema:

**Option 1 (Chosen): Adapt Tools to Existing Schema**
- Rewrite `get-budget.ts` to query `finance.department_budgets`
- Rewrite `approve-budget.ts` to update `finance.department_budgets`
- Mark `get-expense-report.ts` and `delete-invoice.ts` as **NOT IMPLEMENTED** (no expense tracking in v1.3)
- Document limitations in tool descriptions

**Option 2 (Deferred): Create Missing Tables**
- Add `finance.expense_reports` table to sample data
- Simplify `finance.budgets` view over `department_budgets`
- Requires schema migration, testing, RLS policies
- Better long-term solution but delays v1.4 deployment

**Key Learnings**:

1. **Table Existence Must Be Verified Before Implementation**:
   - Run `\dt schema.*` to list all tables BEFORE writing any tool
   - Don't assume spec table names match reality
   - Table inventory is as critical as column discovery

2. **Semantic Mismatches Are Worse Than Naming Mismatches**:
   - `financial_reports` (published financial statements) ≠ `expense_reports` (employee expenses)
   - Can't just rename - these serve different business purposes
   - Some spec features may require new tables, not just query rewrites

3. **Cross-Schema References Need Extra Validation**:
   - JOINs to tables in different schemas (`hr.employees` from `finance.*`) are fragile
   - Must verify column names in BOTH schemas
   - Easy to miss when focusing on one schema at a time

4. **Progressive Discovery Reveals Deeper Issues**:
   - Lesson 1: Schema prefixes missing
   - Lesson 2: Column names wrong
   - Lesson 3: SET LOCAL parameterization broken
   - Lesson 4: Entire tables missing
   - Each fix revealed next layer of spec-reality mismatch

5. **Sample Data Should Drive Spec, Not Vice Versa**:
   - For existing projects, spec should document ACTUAL schema
   - For new features, update sample data FIRST, then write spec
   - Spec-first approach failed when sample data already existed

**Recommendations**:

1. **Mandatory Schema Discovery Checklist**:
   ```markdown
   Before implementing ANY database-backed tool:
   - [ ] Run \dt schema.* to list all tables
   - [ ] Run \d schema.table for each referenced table
   - [ ] Verify all JOIN targets exist in their schemas
   - [ ] Document actual schema in spec
   - [ ] Flag any missing tables as new requirements
   ```

2. **Tool Implementation Status Matrix**:
   ```markdown
   | Tool | Table Required | Table Exists? | Status |
   |------|---------------|---------------|--------|
   | list_invoices | finance.invoices | ✅ Yes | Implemented |
   | get_budget | finance.budgets | ❌ No (use department_budgets) | Needs rewrite |
   | approve_budget | finance.budgets | ❌ No (use department_budgets) | Needs rewrite |
   | get_expense_report | finance.expense_reports | ❌ No | Not implemented |
   | delete_invoice | finance.invoices | ✅ Yes | Needs testing |
   ```

3. **Semantic Mapping Documentation**:
   - When table names differ, document semantic equivalence
   - Mark tools that can be adapted vs. require new tables
   - Set clear expectations about what's possible with existing schema

4. **Incremental Validation**:
   - Don't wait to discover all tools are broken
   - Test EACH tool immediately after implementation
   - Fail fast on first table mismatch, then audit ALL tables

**Follow-Up Actions**:
- [x] Document table name mismatches as Lesson 4
- [ ] Rewrite `get-budget.ts` to use `department_budgets`
- [ ] Rewrite `approve-budget.ts` to use `department_budgets`
- [ ] Mark `get-expense-report.ts` as NOT IMPLEMENTED with clear error message
- [ ] Test `delete-invoice.ts` with actual schema
- [ ] Update spec to document actual v1.3 table inventory
- [ ] Create GitHub issue for missing expense tracking feature (v1.5+)

**Status**: 🔄 IN PROGRESS - Documenting and adapting to existing schema (Dec 9, 2025)

**Actual Finance Schema Inventory**:
```sql
-- Tables that exist in v1.3
finance.invoices              ✅ Used by list_invoices, delete_invoice
finance.department_budgets    ✅ Can adapt for get_budget, approve_budget
finance.budget_categories     ✅ Supporting table
finance.fiscal_years          ✅ Supporting table
finance.financial_reports     ⚠️ Different purpose than expense_reports
finance.revenue_summary       ✅ Supporting table

-- Tables assumed by spec but missing
finance.budgets              ❌ Use department_budgets instead
finance.expense_reports      ❌ No equivalent - feature missing
```

**Implementation Approach**:
1. Adapt budgets tools to `department_budgets` (preserve department-level budgeting semantics)
2. Return helpful error for expense report tools explaining feature not available in v1.3
3. Document this as known limitation in v1.4
4. Plan proper expense tracking for v1.5 with new sample data

---

## Phase 4: Desktop Client

*To be filled in during development*

---

## Phase 5: Mobile (Android)

*To be filled in during development*

---

## Phase 6: Mobile (iOS)

*To be filled in during development*

---

## Phase 7: Production Deployment

*To be filled in during development*

---

## Technical Debt Log

| Item | Description | Priority | Status |
|------|-------------|----------|--------|
| | | | |

---

## Performance Observations

| Component | Observation | Impact | Resolution |
|-----------|-------------|--------|------------|
| | | | |

---

## Security Considerations

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| | | | |

---

## Third-Party Integration Notes

### Keycloak

*Integration notes and gotchas*

### Claude API

*Integration notes and gotchas*

### MCP SDK

*Integration notes and gotchas*

---

## Cost Observations

### Local Development
- Docker resource usage:
- Storage requirements:

### GCP Testing
- Actual vs estimated costs:
- Optimization opportunities:

---

## Recommendations for Future Projects

1. *To be added*
2. *To be added*
3. *To be added*

---

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| Nov 2025 | AI Assistant | Initial document structure |
| Dec 9, 2025 | AI Assistant | Added Lesson 1: Database schema mismatch issue and resolution |
