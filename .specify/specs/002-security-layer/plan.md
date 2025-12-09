# Implementation Plan: Security Layer (mTLS & RLS)

## Phase 1: Certificate Infrastructure
* [ ] **Certificate Authority Setup:**
    * Create `scripts/generate-ca.sh` for local CA generation
    * Generate root CA certificate and private key
    * Document CA storage location and security
* [ ] **Service Certificates:**
    * Generate certificates for Kong Gateway
    * Generate certificates for MCP Gateway service
    * Generate certificates for domain MCP servers (HR, Finance, Sales, Support)
    * Store certificates in `infrastructure/certs/` (gitignored)
* [ ] **Certificate Configuration:**
    * Create certificate bundle with CA cert + service cert + private key
    * Set appropriate file permissions (600 for private keys)
    * Document certificate renewal process

## Phase 2: Kong mTLS Configuration
* [ ] **Kong Service mTLS:**
    * Update `infrastructure/docker/kong/kong.yml` to enable mTLS
    * Configure `client_certificate` and `ca_certificates` for upstream
    * Set `verify_client` to `required` for production
* [ ] **Certificate Validation:**
    * Configure certificate verification depth
    * Set up certificate revocation checking (CRL or OCSP)
    * Add certificate expiry monitoring
* [ ] **Testing:**
    * Test connection with valid certificate (expect success)
    * Test connection without certificate (expect rejection)
    * Test connection with expired certificate (expect rejection)

## Phase 3: PostgreSQL Row Level Security (HR)
* [ ] **Enable RLS on HR Tables:**
    * Execute `ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;`
    * Execute `ALTER TABLE hr.performance_reviews ENABLE ROW LEVEL SECURITY;`
    * Execute `ALTER TABLE hr.time_off_requests ENABLE ROW LEVEL SECURITY;`
* [ ] **Create RLS Policies for Employees:**
    * Policy: `employee_self_access` - Users can see their own record
    * Policy: `manager_team_access` - Managers can see their team
    * Policy: `hr_full_access` - HR roles can see all employees
    * Policy: `executive_full_access` - Executive role can see all employees
* [ ] **Create Helper Functions:**
    * Function: `current_user_has_role(role_name TEXT)` to check if current user has specific role
    * Function: `current_user_is_executive()` for executive checks
    * Function: `current_user_is_manager()` for manager checks
* [ ] **Test RLS Policies:**
    * Test query as Marcus (Engineer) - should see only self
    * Test query as Nina (Manager) - should see team members
    * Test query as Alice (HR) - should see all employees
    * Test query as Eve (Executive) - should see all employees

## Phase 4: PostgreSQL Row Level Security (Finance)
* [ ] **Enable RLS on Finance Tables:**
    * Execute `ALTER TABLE finance.budgets ENABLE ROW LEVEL SECURITY;`
    * Execute `ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;`
    * Execute `ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;`
* [ ] **Create RLS Policies for Finance:**
    * Policy: `department_budget_access` - Users can see their department budget
    * Policy: `finance_full_access` - Finance roles can see all financial data
    * Policy: `executive_financial_access` - Executives can see all financial data
* [ ] **PII Protection:**
    * Add RLS policies to mask sensitive financial details for non-finance users
    * Test that non-finance users cannot query financial tables

## Phase 5: MongoDB Query Filtering
* [ ] **Sales/CRM Access Control:**
    * Implement query filter injection for `customers` collection
    * Add role-based filtering: sales-read can see all, others see assigned only
    * Implement filter for `opportunities` collection based on assigned sales rep
* [ ] **Query Filter Middleware:**
    * Create `applyRoleFilters(collection, userId, roles)` function
    * Inject filters into all MongoDB queries from MCP servers
    * Document filter patterns for future collections
* [ ] **Testing:**
    * Test sales user can see all opportunities
    * Test non-sales user can only see opportunities assigned to them
    * Test executive can see all CRM data

## Phase 6: MCP Service Integration
* [ ] **Session Variable Management:**
    * Update MCP servers to extract user ID and roles from JWT
    * Implement `SET LOCAL app.current_user_id` before all PostgreSQL queries
    * Implement `SET LOCAL app.current_user_roles` before all PostgreSQL queries
    * Use connection pooling with session variable reset between queries
* [ ] **Error Handling:**
    * Handle RLS policy violations gracefully (return empty set, not error)
    * Log access denied attempts for security monitoring
    * Return user-friendly messages for unauthorized access
* [ ] **Context Propagation:**
    * Document pattern for passing user context through MCP protocol
    * Ensure all MCP tools follow the context propagation pattern

## Phase 7: Integration Testing
* [ ] **RBAC Test Suite:**
    * Create `tests/integration/rls-postgres.test.ts` for PostgreSQL RLS tests
    * Create `tests/integration/rls-mongodb.test.ts` for MongoDB filter tests
    * Create `tests/integration/mtls.test.ts` for mTLS verification tests
* [ ] **Test Scenarios:**
    * Test each user role accessing each data domain (HR, Finance, Sales)
    * Test cross-domain access (should be denied)
    * Test role hierarchy (executive should have full access)
    * Test PII masking for non-privileged users
* [ ] **Performance Testing:**
    * Measure query performance with RLS enabled
    * Verify indexes are being used with RLS policies
    * Optimize slow queries if needed

## Phase 8: Documentation & Monitoring
* [ ] **Security Documentation:**
    * Document RLS policy patterns in `docs/architecture/security-model.md`
    * Create runbook for certificate rotation
    * Document troubleshooting steps for RLS issues
* [ ] **Audit Logging:**
    * Log all RLS policy violations
    * Log mTLS certificate validation failures
    * Set up alerts for repeated access denied attempts
* [ ] **Monitoring Dashboards:**
    * Create Grafana dashboard for security metrics (planned)
    * Monitor certificate expiration dates
    * Track unauthorized access attempts

## Verification Checklist
- [ ] Does Kong reject connections without valid certificates?
- [ ] Do RLS policies correctly filter data based on user roles?
- [ ] Can engineers only see their own HR records?
- [ ] Can managers see their team's HR records?
- [ ] Can HR see all employee records?
- [ ] Can executives see all data across all domains?
- [ ] Are session variables properly set before each query?
- [ ] Do MongoDB queries respect role-based filters?
- [ ] Are access denied attempts logged?
- [ ] Do integration tests pass for all role combinations?

## Status
**IN PROGRESS ⚡** - RLS policies defined; implementation and testing pending.
