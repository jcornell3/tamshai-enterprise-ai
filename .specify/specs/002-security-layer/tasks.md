# Tasks: Security Layer (mTLS & RLS)

## Group 1: Certificate Infrastructure
- [ ] Create `scripts/generate-ca.sh` for local CA generation. [P]
- [ ] Generate root CA certificate with 365-day validity. [P]
- [ ] Generate service certificate for Kong Gateway. [P]
- [ ] Generate service certificate for MCP Gateway. [P]
- [ ] Create `infrastructure/certs/.gitignore` to exclude certificates from git. [P]
- [ ] Set file permissions to 600 for all private keys. [P]
- [ ] Document certificate locations in `docs/architecture/security-model.md`. [P]

## Group 2: Kong mTLS Configuration
- [ ] Update `infrastructure/docker/kong/kong.yml` to enable mTLS for upstreams. [P]
- [ ] Configure `client_certificate` parameter pointing to Kong cert. [P]
- [ ] Configure `ca_certificates` parameter pointing to CA bundle. [P]
- [ ] Set `verify_client` to `required` for production. [P]
- [ ] Add certificate volume mount in `docker-compose.yml`. [P]
- [ ] Test connection with valid cert (expect 200 OK). [P]
- [ ] Test connection without cert (expect 401 Unauthorized). [P]

## Group 3: PostgreSQL RLS - HR Tables
- [ ] Execute `ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;` in sample-data/hr-data.sql. [P]
- [ ] Create helper function `current_user_has_role(role_name TEXT)`. [P]
- [ ] Create policy `employee_self_access` for self-record access. [P]
- [ ] Create policy `manager_team_access` for manager access to team. [P]
- [ ] Create policy `hr_full_access` for hr-read/hr-write roles. [P]
- [ ] Create policy `executive_full_access` for executive role. [P]
- [ ] Enable RLS on `hr.performance_reviews` table. [P]
- [ ] Enable RLS on `hr.time_off_requests` table. [P]

## Group 4: PostgreSQL RLS - Finance Tables
- [ ] Execute `ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;` in sample-data/finance-data.sql. [P]
- [ ] Create policy `department_budget_access` for department-level access. [P]
- [ ] Create policy `finance_full_access` for finance-read/finance-write roles. [P]
- [ ] Create policy `executive_financial_access` for executive role. [P]
- [ ] Enable RLS on `finance.invoices` table. [P]
- [ ] Enable RLS on `finance.expenses` table. [P]

## Group 5: MongoDB Query Filtering
- [ ] Create `services/mcp-sales/src/filters/role-filters.ts` for query filters. [P]
- [ ] Implement `applyCustomerFilters(userId, roles)` function. [P]
- [ ] Implement `applyOpportunityFilters(userId, roles)` function. [P]
- [ ] Add filter injection to all customer queries. [P]
- [ ] Add filter injection to all opportunity queries. [P]
- [ ] Document filter pattern in code comments. [P]

## Group 6: MCP Services - Context Propagation
- [ ] Update MCP Gateway to extract userId and roles from JWT claims. [P]
- [ ] Add `SET LOCAL app.current_user_id = $1` before PostgreSQL queries. [P]
- [ ] Add `SET LOCAL app.current_user_roles = $2` before PostgreSQL queries. [P]
- [ ] Implement session variable reset in connection pooling. [P]
- [ ] Add user context to MCP protocol request headers. [P]
- [ ] Update all MCP servers to read context from headers. [P]
- [ ] Test context propagation with integration tests. [P]

## Group 7: Error Handling & Logging
- [ ] Implement graceful RLS violation handling (return empty set). [P]
- [ ] Add audit logging for access denied attempts. [P]
- [ ] Log mTLS certificate validation failures. [P]
- [ ] Create structured log format for security events. [P]
- [ ] Add log entries to Winston logger in MCP Gateway. [P]

## Group 8: Integration Testing
- [ ] Create `tests/integration/rls-postgres.test.ts`. [P]
- [ ] Test Case: Marcus (Engineer) queries employees -> sees only self. [P]
- [ ] Test Case: Nina (Manager) queries employees -> sees team members. [P]
- [ ] Test Case: Alice (HR) queries employees -> sees all employees. [P]
- [ ] Test Case: Eve (Executive) queries employees -> sees all employees. [P]
- [ ] Test Case: Frank (Intern) queries salaries -> denied or masked. [P]
- [ ] Create `tests/integration/rls-mongodb.test.ts`. [P]
- [ ] Test Case: Sales user queries opportunities -> sees all. [P]
- [ ] Test Case: Non-sales user queries opportunities -> sees assigned only. [P]
- [ ] Create `tests/integration/mtls.test.ts`. [P]
- [ ] Test Case: Request without cert -> 401 Unauthorized. [P]
- [ ] Test Case: Request with valid cert -> 200 OK. [P]

## Group 9: Documentation
- [ ] Update `docs/architecture/security-model.md` with RLS patterns. [P]
- [ ] Document session variable pattern with code examples. [P]
- [ ] Create certificate rotation runbook. [P]
- [ ] Add mTLS troubleshooting guide. [P]
- [ ] Update CLAUDE.md with RLS implementation instructions. [P]

## Status
**IN PROGRESS ⚡** - RLS policies defined in sample data; implementation tasks pending.
