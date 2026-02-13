# MCP Server Functions Reference

**Last Updated**: February 7, 2026
**Architecture Version**: 1.5

This document provides a comprehensive reference of all tools available across the Tamshai MCP (Model Context Protocol) server suite.

---

## Overview

The Tamshai AI Playground has **8 MCP servers** providing domain-specific tools accessible through JWT-authenticated HTTP endpoints. All servers follow the v1.4 architecture with:

- LLM-friendly error responses with `suggestedAction` fields
- Truncation warnings (LIMIT+1 pattern)
- Human-in-the-loop confirmations for write operations
- Cursor-based pagination
- Row Level Security (RLS) enforcement

| Server | Port | Database | Purpose |
|--------|------|----------|---------|
| MCP Gateway | 3100 | Redis | AI orchestration, routing, confirmations |
| MCP HR | 3101 | PostgreSQL | Employee data, org chart, time-off |
| MCP Finance | 3102 | PostgreSQL | Budgets, invoices, expenses, ARR |
| MCP Sales | 3103 | MongoDB | CRM, opportunities, customers, leads |
| MCP Support | 3104 | Elasticsearch/MongoDB | Tickets, KB, SLA, customer portal |
| MCP Journey | 3105 | SQLite | Project history, decisions, failures |
| MCP Payroll | 3106 | PostgreSQL | Pay runs, stubs, contractors, benefits |
| MCP Tax | 3107 | PostgreSQL | Tax rates, estimates, filings |

---

## 1. MCP Gateway (Port 3100)

**Type**: Central orchestration service (not a domain server)

The Gateway validates JWT tokens, routes queries to domain servers based on user roles, and handles human-in-the-loop confirmations.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/query` | POST | Main AI query endpoint (SSE streaming) |
| `/api/tools/<server>/<tool>` | POST | Direct tool invocation |
| `/api/confirm/<confirmationId>` | POST | Execute pending confirmations |
| `/api/user/info` | GET | Get authenticated user context |
| `/api/user/mcp-tools` | GET | List available tools for user |
| `/health` | GET | Health check |

### Server Routing

| Role | Accessible Servers |
|------|-------------------|
| `hr-read`, `hr-write` | mcp-hr |
| `finance-read`, `finance-write` | mcp-finance |
| `sales-read`, `sales-write` | mcp-sales |
| `support-read`, `support-write` | mcp-support |
| `payroll-read`, `payroll-write` | mcp-payroll |
| `tax-read`, `tax-write` | mcp-tax |
| `executive` | All servers |
| `employee` | Self-service on all servers (RLS filtered) |

---

## 2. MCP HR (Port 3101)

**Database**: PostgreSQL (`tamshai_hr`) with Row Level Security
**Authorization**: `hr-read`, `hr-write`, `executive`, `manager`, `user`

### Read Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `get_employee` | Retrieve single employee by ID | `employeeId` (UUID) |
| `list_employees` | Paginated employee listing | `department`, `location`, `managerId`, `limit`, `cursor` |
| `get_org_chart` | Build organizational hierarchy | `rootEmployeeId`, `maxDepth` |
| `get_time_off_balances` | Employee vacation/leave balances | `employeeId`, `fiscalYear` |
| `list_time_off_requests` | User's time-off requests | `status`, `startDateFrom`, `startDateTo`, `limit`, `cursor` |
| `list_team_time_off_requests` | Manager view of team requests | `status`, `limit`, `cursor` |

### Write Tools (Confirmation Required)

| Tool | Description | Inputs | Confirmation |
|------|-------------|--------|--------------|
| `delete_employee` | Remove employee record | `employeeId` | Required |
| `update_salary` | Modify employee compensation | `employeeId`, `newSalary`, `reason` | Required |
| `create_time_off_request` | Submit time-off request | `typeCode`, `startDate`, `endDate`, `notes` | Required |
| `approve_time_off_request` | Manager approval/rejection | `requestId`, `approved`, `approverNotes` | Required |

---

## 3. MCP Finance (Port 3102)

**Database**: PostgreSQL (`tamshai_finance`) with Row Level Security
**Authorization Tiers**:
- **Tier 1 (Expenses)**: `employee`, `manager`, `finance-read`, `finance-write`, `executive`
- **Tier 2 (Budgets)**: `manager`, `finance-read`, `finance-write`, `executive`
- **Tier 3 (Dashboard/ARR/Invoices)**: `finance-read`, `finance-write`, `executive`

### Read Tools

| Tool | Description | Inputs | Tier |
|------|-------------|--------|------|
| `get_budget` | Single budget details | `department`, `year` | 2 |
| `list_budgets` | Paginated budget listing | `fiscalYear`, `department`, `limit`, `cursor` | 2 |
| `list_invoices` | All company invoices | `status`, `department`, `startDate`, `endDate`, `limit`, `cursor` | 3 |
| `get_expense_report` | Single expense report | `reportId` | 1 |
| `list_expense_reports` | Employee/manager expense reports | `status`, `employeeId`, `startDate`, `endDate`, `limit`, `cursor` | 1 |
| `get_arr` | Annual Recurring Revenue metrics | `asOfDate` | 3 |
| `get_arr_movement` | ARR waterfall analysis | `year`, `months` | 3 |

### Write Tools (Confirmation Required)

| Tool | Description | Inputs | Confirmation |
|------|-------------|--------|--------------|
| `submit_budget` | Submit budget for approval | `budgetId`, `comments` | Required |
| `approve_budget` | Finance approval of budget | `budgetId`, `approvedAmount`, `approverNotes` | Required |
| `reject_budget` | Reject submitted budget | `budgetId`, `rejectionReason` | Required |
| `delete_budget` | Remove budget record | `budgetId`, `reason` | Required |
| `approve_invoice` | Set invoice to approved | `invoiceId`, `approverNotes` | Required |
| `pay_invoice` | Mark invoice as paid | `invoiceId`, `paymentDate`, `paymentReference`, `paymentNotes` | Required |
| `delete_invoice` | Remove invoice record | `invoiceId` | Required |
| `approve_expense_report` | Finance approval of expenses | `reportId`, `approverNotes` | Required |
| `reject_expense_report` | Reject expense report | `reportId`, `rejectionReason` | Required |
| `reimburse_expense_report` | Process reimbursement | `reportId`, `paymentReference`, `paymentNotes` | Required |
| `delete_expense_report` | Remove expense report | `reportId`, `reason` | Required |

---

## 4. MCP Sales (Port 3103)

**Database**: MongoDB (`tamshai_sales`) with role-based filtering
**Authorization**: `sales-read`, `sales-write`, `executive`

### Read Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `list_opportunities` | CRM deals listing | `stage`, `minValue`, `maxValue`, `limit`, `cursor` |
| `list_customers` | Company/prospect listing | `industry`, `status`, `minRevenue`, `maxRevenue`, `limit`, `cursor` |
| `get_customer` | Single customer details | `customerId` |
| `list_leads` | Sales leads listing | `status`, `source`, `minScore`, `owner`, `limit`, `cursor` |
| `get_forecast` | Sales forecast for period | `period`, `owner` |

### Write Tools (Confirmation Required)

| Tool | Description | Inputs | Confirmation |
|------|-------------|--------|--------------|
| `close_opportunity` | Mark deal as won/lost | `opportunityId`, `outcome`, `reason` | Required |
| `delete_opportunity` | Remove deal from pipeline | `opportunityId`, `reason` | Required |
| `delete_customer` | Remove customer record | `customerId`, `reason` | Required |

### Opportunity Stages

`QUALIFICATION` → `DISCOVERY` → `PROPOSAL` → `NEGOTIATION` → `CLOSED_WON` / `CLOSED_LOST`

---

## 5. MCP Support (Port 3104)

**Database**: Elasticsearch (dev/stage) or MongoDB (GCP prod)
**Authorization**: `support-read`, `support-write`, `executive`

### Internal/Employee Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `search_tickets` | Full-text ticket search | `query`, `status`, `priority`, `limit`, `cursor` |
| `search_knowledge_base` | Elasticsearch KB search | `query`, `category`, `limit`, `cursor` |
| `get_knowledge_article` | Fetch KB article by ID | `articleId` |
| `get_sla_summary` | SLA compliance metrics | (none) |
| `get_sla_tickets` | List at-risk/breached tickets | `status`, `limit` |
| `get_agent_metrics` | Support team performance | `period` |

### Write Tools (Confirmation Required)

| Tool | Description | Inputs | Confirmation |
|------|-------------|--------|--------------|
| `close_ticket` | Mark ticket as resolved | `ticketId`, `resolution` | Required |

### Customer Portal Tools

*Require `tamshai-customers` realm + `lead-customer` or `basic-customer` roles*

| Tool | Description | Access |
|------|-------------|--------|
| `customer_list_tickets` | List tickets | Lead: org-wide, Basic: own only |
| `customer_get_ticket` | Get ticket details | Own/org tickets |
| `customer_submit_ticket` | Create new support ticket | All customers |
| `customer_add_comment` | Add comment to a ticket | Own/org tickets |
| `customer_search_kb` | Search public knowledge base | All customers |
| `customer_list_contacts` | List organization contacts | Lead only |
| `customer_invite_contact` | Invite new contact *(confirmation)* | Lead only |
| `customer_transfer_lead` | Transfer lead role *(confirmation)* | Lead only |

### Ticket Statuses

`open` → `in_progress` → `resolved` → `closed`

### Ticket Priorities

`low`, `medium`, `high`, `critical`

---

## 6. MCP Payroll (Port 3106)

**Database**: PostgreSQL (`tamshai_payroll`)
**Authorization**: `payroll-read`, `payroll-write`, `executive`, `hr-read`, `hr-write`

### Read Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `list_pay_runs` | All payroll runs | `limit`, `cursor` |
| `list_pay_stubs` | Employee pay stubs | `employeeId`, `limit`, `cursor` |
| `get_pay_stub` | Single pay stub details | `payStubId` |
| `list_contractors` | 1099 contractors list | `limit`, `cursor` |
| `get_tax_withholdings` | Employee tax details | `employeeId` |
| `get_benefits` | Employee benefits/deductions | `employeeId` |
| `get_direct_deposit` | Employee direct deposit setup | `employeeId` |
| `get_payroll_summary` | Payroll dashboard metrics | `period` |

*Note: No write tools currently implemented*

---

## 7. MCP Tax (Port 3107)

**Database**: PostgreSQL (`tamshai_tax`)
**Authorization**: `tax-read`, `tax-write`, `executive`, `finance-read`, `finance-write`

### Read Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `list_sales_tax_rates` | Sales tax by state/jurisdiction | `state`, `jurisdiction` |
| `list_quarterly_estimates` | Quarterly tax estimates | `year`, `quarter` |
| `list_annual_filings` | Annual tax returns | `year` |
| `list_state_registrations` | State business registrations | `state` |
| `list_audit_logs` | Tax compliance audit trail | `dateRange`, `eventType` |
| `get_tax_summary` | Consolidated tax position | `period` |

*Note: No write tools currently implemented*

---

## 8. MCP Journey (Port 3105)

**Type**: Project knowledge/decision history server
**Database**: SQLite (`journey.db`) - Local file-based
**Authorization**: No explicit role requirement (internal development tool)

### Read Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `query_failures` | Search failure/issue history | `topic` |
| `lookup_adr` | Architecture Decision Record lookup | `adr_id` |
| `search_journey` | Full-text search over project history | `query` |
| `get_context` | Current project context snapshot | (none) |
| `list_pivots` | Strategic direction changes | (none) |

### Resources (Markdown URIs)

| URI Pattern | Description |
|-------------|-------------|
| `journey://failures/{topic}` | Failure documentation |
| `journey://decisions/{adr-id}` | Architecture decisions |
| `journey://evolution/{component}` | Component evolution |
| `journey://lessons` | Lessons learned index |
| `journey://phoenix/{version}` | Recovery/resilience docs |

---

## Common Patterns

### Authentication Flow

The user's JWT token is **validated at the Gateway**, not forwarded to MCP servers. The Gateway:

1. Validates the JWT signature against Keycloak JWKS
2. Checks token expiration and audience claims
3. Extracts user context (userId, username, email, roles)
4. Passes extracted claims to MCP servers

### Headers Passed to MCP Servers

**POST requests** receive these headers:

| Header | Description |
|--------|-------------|
| `X-User-ID` | User UUID |
| `X-User-Roles` | Comma-separated roles |
| `X-Request-ID` | Request correlation ID |
| `Authorization` | GCP identity token (production only, service-to-service) |

**GET requests** receive `userContext` in the request body:
```json
{
  "userContext": {
    "userId": "uuid",
    "username": "alice.chen",
    "email": "alice.chen@tamshai.com",
    "roles": ["hr-read", "hr-write"]
  }
}
```

**Note**: The `Authorization` header in production contains a GCP Cloud Run identity token for service-to-service authentication, not the user's original JWT.

### Response Types

**Success Response**:
```json
{
  "status": "success",
  "data": [...],
  "metadata": {
    "hasMore": true,
    "nextCursor": "base64string",
    "returnedCount": 50,
    "truncated": true,
    "warning": "TRUNCATION WARNING: Only 50 of 50+ records returned."
  }
}
```

**Pending Confirmation**:
```json
{
  "status": "pending_confirmation",
  "confirmationId": "uuid",
  "message": "User-friendly confirmation prompt",
  "confirmationData": {...}
}
```

**Error Response**:
```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "User-friendly message",
  "suggestedAction": "AI-friendly remediation hint"
}
```

### Pagination (LIMIT+1 Pattern)

All list tools use cursor-based pagination with truncation detection:

1. Query requests `limit + 1` records
2. If `limit + 1` records returned, `truncated: true`
3. Return only `limit` records to client
4. Encode last record ID as `nextCursor`

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| MCP Servers | 8 |
| Total Tools | 70+ |
| Read Tools | 45+ |
| Write Tools (confirmation) | 25+ |
| Customer Portal Tools | 8 |
| Authorization Roles | 15+ |
| Port Range | 3100-3107 |

---

## Tool Access Matrix

| Server | Min Read Role | Write Role | Confirmation | Database |
|--------|---------------|------------|--------------|----------|
| HR | `user` (self) | `hr-write` | Yes | PostgreSQL |
| Finance | `employee` | `finance-write` | Yes | PostgreSQL |
| Sales | `sales-read` | `sales-write` | Yes | MongoDB |
| Support | `support-read` | `support-write` | Yes | Elasticsearch |
| Payroll | `payroll-read` | `payroll-write` | No | PostgreSQL |
| Tax | `tax-read` | `tax-write` | No | PostgreSQL |
| Journey | (internal) | N/A | N/A | SQLite |
| Gateway | (any) | (aggregates) | Yes | Redis |

---

## Related Documentation

- [Architecture Overview](../docs/architecture/overview.md)
- [Security Model](../docs/architecture/security-model.md)
- [Port Allocation](../docs/development/PORT_ALLOCATION.md)
- [MCP Gateway Refactoring Plan](../.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md)
- [Data Model Specification](../.specify/specs/004-mcp-suite/DATA_MODEL.md)
