# Specification: Security Layer (mTLS & RLS)

## 1. Business Intent
**User Story:** As the CISO, I require that all internal traffic be encrypted and all data access be enforced at the database level, so that a compromised service cannot leak unauthorized data.

**Business Value:** Implements "Defense in Depth" to meet enterprise compliance requirements. Ensures that even if a service is compromised, data access is still controlled by the database layer.

## 2. Access Control & Security (Crucial)
* **Required Role(s):** Platform Administrator (for setup)
* **Data Classification:** System Security / Confidential
* **PII Risks:** Indirectly protects PII through RLS policies
* **RLS Impact:** Core feature - Implements Row Level Security on all data tables

## 3. MCP Tool Definition
No MCP tools are directly exposed in this phase. This phase enhances security infrastructure that all MCP tools will leverage.

## 4. User Interaction Scenarios
* **RLS Enforcement:** User (Marcus - Engineer) queries employee data -> MCP Tool executes query -> PostgreSQL RLS policy filters results -> Only Marcus's own record returned.
* **Manager Access:** User (Nina - Manager) queries employee data -> RLS policy checks roles -> Returns Nina's team members' records only.
* **Executive Access:** User (Eve - CEO) queries employee data -> RLS policy checks executive role -> Returns all employee records.
* **Unauthorized Access Attempt:** User (Frank - Intern) attempts direct SQL injection -> RLS policies enforce access rules -> Query returns empty set or error.
* **mTLS Verification:** Service attempts to connect without valid certificate -> Kong rejects connection -> Request denied at gateway level.

## 5. Success Criteria

### mTLS (Production Only - Not Implemented in Dev)
- [ ] Kong Gateway rejects connections from clients without valid mTLS certificates

### HR Schema RLS (COMPLETE)
- [x] PostgreSQL RLS policies are active on all employee tables (`hr.employees`, `hr.performance_reviews`)
- [x] Direct SQL query as "Alice" (HR) shows all records
- [x] Direct SQL query as "Marcus" (Engineer) shows only his own record
- [x] Session variables `app.current_user_id` and `app.current_user_roles` are properly set before queries
- [x] RLS policies correctly handle composite roles (executive sees all data)
- [x] Manager hierarchy access via `is_manager_of()` function with SECURITY DEFINER

### Finance Schema RLS (COMPLETE)
- [x] Finance tables have appropriate RLS policies for budget/invoice data
- [x] `finance.department_budgets` - 4 policies (finance-read, executive, department manager, finance-write)
- [x] `finance.invoices` - 4 policies (finance-read, executive, department manager, finance-write)
- [x] `finance.financial_reports` - 5 policies (public, finance-read, executive, creator, finance-write)
- [x] `finance.revenue_summary` - 3 policies (finance-read, executive, sales-read)
- [x] `finance.set_user_context()` helper function for session variables
- [x] `finance.access_audit_log` table for audit trail

### MongoDB/Elasticsearch (Application-Level)
- [x] MongoDB query filters are implemented for sales data access control (MCP Sales)
- [x] Elasticsearch role-based filtering in MCP Support

### Testing
- [x] Integration tests verify RBAC at database level (tests/integration/rbac.test.ts)

## 6. Scope
* **Certificate Authority (CA):**
  - Local CA generation script for development environment
  - Certificate generation for Kong Gateway and MCP services
  - Certificate rotation strategy documented
* **Kong mTLS Configuration:**
  - Enable mutual TLS verification for upstream services
  - Configure certificate validation
  - Set up certificate-based authentication
* **PostgreSQL Row Level Security:**
  - Apply RLS policies to `hr.employees` table
  - Apply RLS policies to `finance.budgets` and `finance.invoices` tables
  - Use `current_setting('app.current_user_id')` for user context
  - Use `current_setting('app.current_user_roles')` for role-based filtering
  - Create helper functions for role checking
* **MongoDB Query Filtering:**
  - Implement application-level query filters for `customers` collection
  - Implement filters for `opportunities` collection
  - Document query filter patterns

## 7. Technical Details
* **RLS Policy Pattern:**
  ```sql
  CREATE POLICY employee_access_policy ON hr.employees
  FOR SELECT
  USING (
    employee_id = current_setting('app.current_user_id')::uuid  -- Self
    OR manager_id = current_setting('app.current_user_id')::uuid  -- Manager
    OR current_setting('app.current_user_roles') LIKE '%hr-read%'  -- HR
    OR current_setting('app.current_user_roles') LIKE '%executive%'  -- Executive
  );
  ```

* **Session Variable Setting:**
  ```typescript
  await db.query(`
    SET LOCAL app.current_user_id = $1;
    SET LOCAL app.current_user_roles = $2;
  `, [userId, roles.join(',')]);
  ```

* **Certificate Management:**
  - Development: Self-signed CA with 365-day validity
  - Production: Let's Encrypt or enterprise CA
  - Rotation: Automated with 30-day warning alerts

## Status
**COMPLETE ✅** - HR and Finance RLS complete, mTLS deferred to production.

### Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **HR RLS** | ✅ Complete | 7 policies on `hr.employees` and `hr.performance_reviews` |
| **Finance RLS** | ✅ Complete | 16 policies across 4 tables with audit logging |
| **MongoDB Filters** | ✅ Complete | Application-level in MCP Sales |
| **Elasticsearch Filters** | ✅ Complete | Role-based in MCP Support |
| **mTLS** | ⏳ Deferred | Production only; dev uses HTTP |
| **Session Variables** | ✅ Complete | `set_user_context()` in both HR and Finance |
| **Audit Logging** | ✅ Complete | `access_audit_log` in both HR and Finance schemas |

### HR RLS Implementation Details
- File: `sample-data/hr-data.sql`
- Tables protected: `hr.employees`, `hr.performance_reviews`
- Policies: Self-access, HR staff, Executive, Manager hierarchy
- Special: `is_manager_of()` with SECURITY DEFINER to avoid RLS recursion bug

### Finance RLS Implementation Details
- File: `sample-data/finance-data.sql`
- Tables protected: `finance.department_budgets`, `finance.invoices`, `finance.financial_reports`, `finance.revenue_summary`
- Policies: Finance role, Executive, Department manager, Self-created reports
- Special: Department-based filtering via `app.current_user_department` session variable

### Known Gaps
1. **mTLS**: Not implemented in development (uses HTTP)

### Architecture Version
**Updated for**: v1.4 (December 2025)
