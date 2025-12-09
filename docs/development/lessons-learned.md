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
