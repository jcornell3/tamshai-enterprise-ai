# Customer Support Portal - Authorization Matrix

## 1. Overview

This document defines the complete authorization matrix for the Customer Support Portal, covering both customer and internal employee access.

## 2. Role Definitions

### 2.1 Customer Roles (tamshai-customers realm)

| Role | Description | Scope |
|------|-------------|-------|
| `lead-customer` | Primary contact for organization | Organization-wide + admin |
| `basic-customer` | Standard customer user | Own data only |

### 2.2 Internal Roles (tamshai realm)

| Role | Description | Scope |
|------|-------------|-------|
| `support-read` | View support data | All tickets, read-only |
| `support-write` | Manage support data | Full ticket management |
| `executive` | Executive access | Cross-department read |

## 3. Resource Authorization Matrix

### 3.1 Ticket Access

| Resource | Operation | lead-customer | basic-customer | support-read | support-write |
|----------|-----------|---------------|----------------|--------------|---------------|
| **Own Tickets** | Read | Yes | Yes | Yes | Yes |
| | Create | Yes | Yes | No | Yes |
| | Update | Yes | Yes | No | Yes |
| | Close | No | No | No | Yes |
| **Org Tickets** | Read | Yes (if visibility=org) | No | Yes | Yes |
| | List | Yes | No | Yes | Yes |
| **All Tickets** | Read | No | No | Yes | Yes |
| | Search | No | No | Yes | Yes |
| **Internal Notes** | Read | Never | Never | Yes | Yes |
| | Write | Never | Never | No | Yes |
| **Customer Notes** | Read | Yes | Yes (own) | Yes | Yes |
| | Write | Yes | Yes (own) | No | Yes |

### 3.2 Knowledge Base Access

| Resource | Operation | lead-customer | basic-customer | support-read | support-write |
|----------|-----------|---------------|----------------|--------------|---------------|
| **Public KB** | Search | Yes | Yes | Yes | Yes |
| | Read | Yes | Yes | Yes | Yes |
| **Internal KB** | Search | No | No | Yes | Yes |
| | Read | No | No | Yes | Yes |
| **KB Articles** | Create | No | No | No | Yes |
| | Update | No | No | No | Yes |
| | Delete | No | No | No | Yes |

### 3.3 Organization & Contact Access

| Resource | Operation | lead-customer | basic-customer | support-read | support-write |
|----------|-----------|---------------|----------------|--------------|---------------|
| **Own Profile** | Read | Yes | Yes | Yes | Yes |
| | Update | Yes | Yes | No | No |
| **Org Contacts** | List | Yes | No | Yes | Yes |
| | View | Yes | No | Yes | Yes |
| | Invite | Yes | No | No | No |
| | Remove | No | No | No | No |
| **Lead Transfer** | Initiate | Yes | No | No | No |
| | Approve | Yes | No | No | No |
| **Organization** | View | Yes | No | Yes | Yes |
| | Update | No | No | No | No |

### 3.4 MCP Tool Access

| Tool | lead-customer | basic-customer | support-read | support-write |
|------|---------------|----------------|--------------|---------------|
| `customer_list_tickets` | Yes (org) | Yes (own) | No | No |
| `customer_get_ticket` | Yes (org) | Yes (own) | No | No |
| `customer_submit_ticket` | Yes | Yes | No | No |
| `customer_add_comment` | Yes | Yes (own) | No | No |
| `customer_search_kb` | Yes | Yes | No | No |
| `customer_list_contacts` | Yes | No | No | No |
| `customer_invite_contact` | Yes | No | No | No |
| `customer_transfer_lead` | Yes | No | No | No |
| `search_tickets` | No | No | Yes | Yes |
| `get_ticket` | No | No | Yes | Yes |
| `close_ticket` | No | No | No | Yes |
| `escalate_ticket` | No | No | No | Yes |
| `internal_get_organization` | No | No | Yes | Yes |
| `internal_list_org_contacts` | No | No | Yes | Yes |
| `internal_view_customer_history` | No | No | Yes | Yes |

## 4. Data Visibility Rules

### 4.1 Ticket Visibility Field

| Visibility | Owner | Lead (same org) | Basic (same org) | Internal Agent |
|------------|-------|-----------------|------------------|----------------|
| `organization` | Full (no internal) | Full (no internal) | No | Full |
| `private` | Full (no internal) | No | No | Full |
| `internal_only` | N/A | No | No | Full |

### 4.2 Field-Level Restrictions

| Field | lead-customer | basic-customer | support-read | support-write |
|-------|---------------|----------------|--------------|---------------|
| `ticket_id` | Yes | Yes | Yes | Yes |
| `subject` | Yes | Yes | Yes | Yes |
| `description` | Yes | Yes | Yes | Yes |
| `status` | Yes | Yes | Yes | Yes |
| `priority` | Yes | Yes | Yes | Yes |
| `internal_notes` | **NEVER** | **NEVER** | Yes | Yes |
| `customer_visible_notes` | Yes | Yes (own tickets) | Yes | Yes |
| `assigned_to` (name) | Yes | Yes | Yes | Yes |
| `assigned_to` (internal ID) | No | No | Yes | Yes |
| `escalation_history` | No | No | Yes | Yes |
| `sla_breach_details` | No | No | Yes | Yes |

## 5. Action Authorization

### 5.1 Ticket Actions

| Action | lead-customer | basic-customer | support-read | support-write |
|--------|---------------|----------------|--------------|---------------|
| Create ticket | Yes | Yes | No | Yes |
| View ticket | Org tickets | Own tickets | All | All |
| Add comment | Org tickets | Own tickets | No | All |
| Change priority | No | No | No | Yes |
| Change status | No | No | No | Yes |
| Assign ticket | No | No | No | Yes |
| Escalate ticket | No | No | No | Yes |
| Close ticket | No | No | No | Yes |
| Merge tickets | No | No | No | Yes |

### 5.2 Pending Confirmation Actions

| Action | Requires Confirmation | Approver |
|--------|----------------------|----------|
| `customer_invite_contact` | Yes | Lead customer |
| `customer_transfer_lead` | Yes | Lead customer (self) |
| `close_ticket` | Yes | Support agent |
| `escalate_ticket` | Yes | Support agent |

## 6. API Endpoint Authorization

### 6.1 Customer Portal Endpoints

| Endpoint | Method | Required Role | Notes |
|----------|--------|---------------|-------|
| `/api/customer/tickets` | GET | Any customer | Filtered by role |
| `/api/customer/tickets` | POST | Any customer | Create ticket |
| `/api/customer/tickets/:id` | GET | Any customer | Access check |
| `/api/customer/tickets/:id/comments` | POST | Any customer | Access check |
| `/api/customer/kb/search` | GET | Any customer | Public KB only |
| `/api/customer/kb/:id` | GET | Any customer | Public KB only |
| `/api/customer/contacts` | GET | Lead only | 403 for basic |
| `/api/customer/contacts/invite` | POST | Lead only | 403 for basic |
| `/api/customer/contacts/transfer-lead` | POST | Lead only | 403 for basic |

### 6.2 Internal Support Endpoints

| Endpoint | Method | Required Role | Notes |
|----------|--------|---------------|-------|
| `/api/support/tickets` | GET | support-read | Full access |
| `/api/support/tickets/:id` | GET | support-read | Full access |
| `/api/support/tickets/:id` | PATCH | support-write | Status, priority, etc. |
| `/api/support/tickets/:id/close` | POST | support-write | Confirmation required |
| `/api/support/organizations/:id` | GET | support-read | Customer org details |
| `/api/support/organizations/:id/contacts` | GET | support-read | Org contacts |

## 7. Implementation Patterns

### 7.1 Authorization Middleware

```typescript
// Customer authorization
function requireCustomerAccess(requiredRole?: 'lead-customer') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userContext = req.userContext;

    // Must be customer realm
    if (userContext.realm !== 'customer') {
      return res.status(403).json({
        error: 'CUSTOMER_ONLY',
        message: 'This endpoint is for customers only'
      });
    }

    // Check specific role if required
    if (requiredRole && !userContext.roles.includes(requiredRole)) {
      return res.status(403).json({
        error: 'LEAD_REQUIRED',
        message: 'This action requires lead customer privileges'
      });
    }

    next();
  };
}
```

### 7.2 Ticket Access Check

```typescript
function canAccessTicket(ticket: Ticket, userContext: UserContext): boolean {
  // Internal users can access all tickets
  if (userContext.realm === 'internal') {
    return userContext.roles.some(r => ['support-read', 'support-write'].includes(r));
  }

  // Customer realm checks
  if (ticket.organization_id !== userContext.organizationId) {
    return false;
  }

  // Owner always has access
  if (ticket.contact_id === userContext.userId) {
    return true;
  }

  // Lead can access org-visible tickets
  if (userContext.roles.includes('lead-customer')) {
    return ticket.visibility === 'organization';
  }

  // Basic customer: own tickets only
  return false;
}
```

### 7.3 Query Builder with Authorization

```typescript
function buildTicketQuery(userContext: UserContext, filters: any): object {
  const baseQuery: any = {};

  if (userContext.realm === 'customer') {
    // Always filter by organization
    baseQuery.organization_id = userContext.organizationId;

    if (userContext.roles.includes('lead-customer')) {
      // Lead: org tickets or own tickets
      baseQuery.$or = [
        { visibility: 'organization' },
        { contact_id: userContext.userId }
      ];
    } else {
      // Basic: own tickets only
      baseQuery.contact_id = userContext.userId;
    }
  }

  // Apply additional filters
  if (filters.status) baseQuery.status = filters.status;
  if (filters.priority) baseQuery.priority = filters.priority;

  return baseQuery;
}
```

## 8. Audit Requirements

### 8.1 Logged Events

| Event | Actor Type | Data Captured |
|-------|------------|---------------|
| Ticket created | Customer | ticket_id, org_id, contact_id |
| Comment added | Customer/Agent | ticket_id, comment_id |
| Contact invited | Lead customer | org_id, email |
| Lead transferred | Lead customer | org_id, from, to |
| Ticket escalated | Agent | ticket_id, reason |
| Ticket closed | Agent | ticket_id, resolution |

### 8.2 Retention Policy

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 30 days | MongoDB TTL |
| Staging | 90 days | MongoDB TTL |
| Production | 7 years | Archive to cold storage |
