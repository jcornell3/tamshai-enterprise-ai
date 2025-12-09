# Implementation Plan: [Feature Name]

## Phase 1: Database & Security Layer
* [ ] **Schema Changes:**
    * Define SQL migration for new tables in `sample-data/` or `infrastructure/`.
    * Define Row Level Security (RLS) policies using `current_setting('app.current_user_roles')`.
* [ ] **Sample Data:** Add mock data for testing hierarchy (Manager vs Employee).

## Phase 2: Core Logic (Service Layer)
* [ ] Create/Update Service file in `services/mcp-[domain]/src/`.
* [ ] Implement the Data Access Object (DAO) or query builder.
* [ ] Apply PII Masking logic if data is "Confidential".

## Phase 3: MCP Interface
* [ ] Define Zod schema for Tool Inputs.
* [ ] Register tool in `index.ts` of the specific MCP server.
* [ ] Map User Context (Roles) from request headers to the DB query.

## Phase 4: Integration Testing
* [ ] Create test file in `tests/integration/`.
* [ ] Test Case A: Authorized User (Expect Success).
* [ ] Test Case B: Unauthorized User (Expect `403` or empty set).
* [ ] Test Case C: Prompt Injection check (ensure tool inputs are sanitized).

## Verification Checklist
- [ ] Does this adhere to Article I (RLS)?
- [ ] Is the tool output strictly typed?
