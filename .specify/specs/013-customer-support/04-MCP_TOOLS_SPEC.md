# Customer Support Portal - MCP Tools Specification

## 1. Overview

The MCP Support server extends with customer-specific tools that enforce organization-level access control. All customer tools validate tokens from the `tamshai-customers` realm and filter data by `organization_id`.

## 2. Tool Categories

| Category | Audience | Tools |
|----------|----------|-------|
| Customer Ticket Tools | External customers | customer_list_tickets, customer_get_ticket, customer_submit_ticket, customer_add_comment |
| Customer KB Tools | External customers | customer_search_kb |
| Customer Admin Tools | Lead customers only | customer_list_contacts, customer_invite_contact, customer_transfer_lead |
| Internal Tools (existing) | Employees | search_tickets, get_ticket, close_ticket, etc. |
| Internal Enhanced Tools | Employees | internal_get_organization, internal_list_org_contacts, internal_view_customer_history |

## 3. Customer Ticket Tools

### 3.1 customer_list_tickets

Lists tickets visible to the current customer.

**Access**: `lead-customer`, `basic-customer`

**Input Schema**:
```typescript
interface CustomerListTicketsInput {
  status?: 'open' | 'pending' | 'resolved' | 'closed' | 'all';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  limit?: number;  // Default: 20, Max: 50
  offset?: number;
  sort?: 'created_at' | 'updated_at' | 'priority';
  sort_order?: 'asc' | 'desc';
}
```

**Output Schema**:
```typescript
interface CustomerListTicketsResponse {
  status: 'success';
  data: {
    tickets: CustomerTicket[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
  };
  metadata?: {
    truncated: boolean;
    warning?: string;
  };
}

interface CustomerTicket {
  ticket_id: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  created_by: {
    name: string;
    email: string;
  };
  assigned_to?: string;
  sla_status: 'on_track' | 'at_risk' | 'breached';
  comment_count: number;
}
```

**Authorization Logic**:
```typescript
async function customerListTickets(
  input: CustomerListTicketsInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  // Verify customer realm
  if (userContext.realm !== 'customer') {
    return errorResponse('INVALID_REALM', 'This tool is for customers only');
  }

  const isLead = userContext.roles.includes('lead-customer');
  const organizationId = userContext.organizationId;

  // Build query based on role
  const query: any = {
    organization_id: organizationId
  };

  if (!isLead) {
    // Basic customer: only own tickets
    query.contact_id = userContext.userId;
  } else {
    // Lead customer: org tickets + own private tickets
    query.$or = [
      { visibility: 'organization' },
      { contact_id: userContext.userId }
    ];
  }

  // Apply filters
  if (input.status && input.status !== 'all') {
    query.status = input.status;
  }

  // Execute query (never project internal_notes!)
  const tickets = await db.tickets.find(query)
    .project({ internal_notes: 0 })
    .sort({ [input.sort || 'created_at']: input.sort_order === 'asc' ? 1 : -1 })
    .skip(input.offset || 0)
    .limit(Math.min(input.limit || 20, 50) + 1)  // +1 for truncation detection
    .toArray();

  const truncated = tickets.length > (input.limit || 20);

  return {
    status: 'success',
    data: {
      tickets: tickets.slice(0, input.limit || 20).map(mapToCustomerTicket),
      pagination: {
        total: await db.tickets.countDocuments(query),
        limit: input.limit || 20,
        offset: input.offset || 0,
        has_more: truncated
      }
    },
    metadata: truncated ? {
      truncated: true,
      warning: 'Results truncated. Use pagination to see more.'
    } : undefined
  };
}
```

---

### 3.2 customer_get_ticket

Gets detailed ticket information for customers.

**Access**: `lead-customer`, `basic-customer`

**Input Schema**:
```typescript
interface CustomerGetTicketInput {
  ticket_id: string;
}
```

**Output Schema**:
```typescript
interface CustomerGetTicketResponse {
  status: 'success';
  data: {
    ticket_id: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    category: string;
    created_at: string;
    updated_at: string;
    created_by: {
      name: string;
      email: string;
    };
    assigned_to?: {
      name: string;
    };
    sla_status: {
      response: 'met' | 'pending' | 'breached';
      resolution: 'on_track' | 'at_risk' | 'breached';
      resolution_due?: string;
    };
    comments: CustomerComment[];
    attachments: Attachment[];
  };
}

interface CustomerComment {
  comment_id: string;
  author_type: 'agent' | 'customer';
  author_name: string;
  content: string;
  created_at: string;
}
```

**Authorization Logic**:
```typescript
async function customerGetTicket(
  input: CustomerGetTicketInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  const ticket = await db.tickets.findOne(
    { ticket_id: input.ticket_id },
    { projection: { internal_notes: 0 } }  // NEVER expose internal notes
  );

  if (!ticket) {
    return errorResponse('TICKET_NOT_FOUND', 'Ticket not found',
      'Verify the ticket ID is correct.');
  }

  // Verify access
  if (ticket.organization_id !== userContext.organizationId) {
    return errorResponse('ACCESS_DENIED', 'You do not have access to this ticket');
  }

  const isLead = userContext.roles.includes('lead-customer');
  const isOwner = ticket.contact_id.toString() === userContext.userId;

  // Basic customer can only see own tickets
  if (!isLead && !isOwner) {
    return errorResponse('ACCESS_DENIED', 'You can only view your own tickets');
  }

  // Lead can see org tickets, but check visibility for non-owned
  if (isLead && !isOwner && ticket.visibility === 'private') {
    return errorResponse('ACCESS_DENIED', 'This ticket is marked as private');
  }

  return {
    status: 'success',
    data: mapToCustomerTicketDetail(ticket)
  };
}
```

---

### 3.3 customer_submit_ticket

Creates a new support ticket.

**Access**: `lead-customer`, `basic-customer`

**Input Schema**:
```typescript
interface CustomerSubmitTicketInput {
  subject: string;
  description: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';  // Customers can't set 'critical'
  visibility?: 'organization' | 'private';  // Lead only
  attachments?: string[];  // Pre-uploaded attachment IDs
}
```

**Output Schema**:
```typescript
interface CustomerSubmitTicketResponse {
  status: 'success';
  data: {
    ticket_id: string;
    message: string;
    sla: {
      response_due: string;
      resolution_due: string;
    };
  };
}
```

**Implementation**:
```typescript
async function customerSubmitTicket(
  input: CustomerSubmitTicketInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  // Get organization for SLA settings
  const org = await db.organizations.findOne({
    organization_id: userContext.organizationId
  });

  if (!org || org.status !== 'active') {
    return errorResponse('ORG_NOT_ACTIVE', 'Your organization subscription is not active');
  }

  // Check monthly ticket limit
  const monthlyCount = await db.tickets.countDocuments({
    organization_id: userContext.organizationId,
    created_at: { $gte: startOfMonth() }
  });

  if (monthlyCount >= org.settings.max_tickets_per_month) {
    return errorResponse('TICKET_LIMIT_REACHED',
      `Monthly ticket limit (${org.settings.max_tickets_per_month}) reached`,
      'Contact your account manager to increase your limit.');
  }

  // Get contact info
  const contact = await db.contacts.findOne({
    keycloak_user_id: userContext.userId
  });

  // Build ticket
  const ticket = {
    ticket_id: generateTicketId(),
    subject: input.subject,
    description: input.description,
    category: input.category || 'General',
    priority: input.priority || 'medium',
    status: 'open',
    source: 'customer_portal',
    organization_id: userContext.organizationId,
    contact_id: contact._id,
    customer_email: contact.email,
    visibility: input.visibility || 'organization',
    internal_notes: [],
    customer_visible_notes: [],
    created_at: new Date(),
    updated_at: new Date(),
    sla_response_due: calculateSLA(org.settings.response_time_hours),
    sla_resolution_due: calculateSLA(org.settings.resolution_time_hours)
  };

  // Only lead can set visibility
  if (input.visibility === 'private' && !userContext.roles.includes('lead-customer')) {
    ticket.visibility = 'organization';
  }

  await db.tickets.insertOne(ticket);

  // Log audit
  await logAudit({
    event_type: 'ticket_create',
    actor_type: 'customer',
    actor_id: userContext.userId,
    target_type: 'ticket',
    target_id: ticket.ticket_id,
    organization_id: userContext.organizationId
  });

  return {
    status: 'success',
    data: {
      ticket_id: ticket.ticket_id,
      message: 'Ticket created successfully',
      sla: {
        response_due: ticket.sla_response_due.toISOString(),
        resolution_due: ticket.sla_resolution_due.toISOString()
      }
    }
  };
}
```

---

### 3.4 customer_add_comment

Adds a comment to an existing ticket.

**Access**: `lead-customer`, `basic-customer`

**Input Schema**:
```typescript
interface CustomerAddCommentInput {
  ticket_id: string;
  content: string;
}
```

**Output Schema**:
```typescript
interface CustomerAddCommentResponse {
  status: 'success';
  data: {
    comment_id: string;
    message: string;
  };
}
```

---

## 4. Customer KB Tools

### 4.1 customer_search_kb

Searches public knowledge base articles.

**Access**: `lead-customer`, `basic-customer`

**Input Schema**:
```typescript
interface CustomerSearchKBInput {
  query: string;
  category?: string;
  limit?: number;  // Default: 10
}
```

**Output Schema**:
```typescript
interface CustomerSearchKBResponse {
  status: 'success';
  data: {
    articles: KBArticle[];
    total: number;
  };
}

interface KBArticle {
  article_id: string;
  title: string;
  category: string;
  summary: string;
  relevance_score: number;
  views: number;
  helpful_percentage: number;
  updated_at: string;
}
```

---

## 5. Customer Admin Tools (Lead Only)

### 5.1 customer_list_contacts

Lists all contacts in the organization.

**Access**: `lead-customer` **only**

**Input Schema**:
```typescript
interface CustomerListContactsInput {
  status?: 'active' | 'pending' | 'disabled';
}
```

**Output Schema**:
```typescript
interface CustomerListContactsResponse {
  status: 'success';
  data: {
    contacts: Contact[];
    organization: {
      name: string;
      max_contacts: number;
      current_contacts: number;
    };
  };
}

interface Contact {
  contact_id: string;
  email: string;
  name: string;
  role: 'lead' | 'basic';
  status: string;
  last_login?: string;
  ticket_count: number;
}
```

**Authorization**:
```typescript
async function customerListContacts(
  input: CustomerListContactsInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  // STRICT: Lead only
  if (!userContext.roles.includes('lead-customer')) {
    return errorResponse('LEAD_REQUIRED',
      'Only lead contacts can manage organization contacts',
      'Contact your lead customer to manage contacts.');
  }

  // ... implementation
}
```

---

### 5.2 customer_invite_contact

Invites a new contact to the organization.

**Access**: `lead-customer` **only**

**Input Schema**:
```typescript
interface CustomerInviteContactInput {
  email: string;
  first_name: string;
  last_name: string;
  role?: 'basic';  // Can only invite basic users
}
```

**Output Schema** (pending_confirmation):
```typescript
{
  status: 'pending_confirmation',
  confirmationId: 'conf-xyz789',
  message: `Invite new contact to Acme Corporation?

Email: new.contact@acme.com
Name: New Contact
Role: Basic Customer

This will send an invitation email.
Current contacts: 3 of 20 allowed.`,
  confirmationData: {
    action: 'invite_contact',
    email: 'new.contact@acme.com'
  }
}
```

---

### 5.3 customer_transfer_lead

Transfers lead role to another contact.

**Access**: `lead-customer` **only**

**Input Schema**:
```typescript
interface CustomerTransferLeadInput {
  new_lead_contact_id: string;
  reason?: string;
}
```

**Output Schema** (pending_confirmation):
```typescript
{
  status: 'pending_confirmation',
  confirmationId: 'conf-abc123',
  message: `Transfer Lead Customer role?

From: Jane Smith (jane.smith@acme.com)
To: Bob Developer (bob.developer@acme.com)
Organization: Acme Corporation

This action will:
- Remove your lead privileges
- Grant lead privileges to Bob Developer
- You will become a basic customer

This action is logged for compliance.`,
  confirmationData: {
    action: 'transfer_lead',
    from_contact_id: 'current-lead-id',
    to_contact_id: 'new-lead-id'
  }
}
```

See [06-LEAD_TRANSFER_WORKFLOW.md](06-LEAD_TRANSFER_WORKFLOW.md) for the complete workflow.

---

## 6. Internal Enhanced Tools

### 6.1 internal_get_organization

Gets organization details for internal support agents.

**Access**: `support-read`, `support-write`

**Input Schema**:
```typescript
interface InternalGetOrganizationInput {
  organization_id: string;
}
```

**Output Schema**:
```typescript
interface InternalGetOrganizationResponse {
  status: 'success';
  data: {
    organization_id: string;
    name: string;
    domain: string;
    subscription_tier: string;
    sla_tier: string;
    status: string;
    contacts: {
      total: number;
      lead: string;
    };
    tickets: {
      open: number;
      total: number;
      avg_resolution_time: number;
    };
  };
}
```

---

### 6.2 internal_list_org_contacts

Lists contacts for an organization (internal view).

**Access**: `support-read`, `support-write`

---

### 6.3 internal_view_customer_history

Gets full history for a customer contact.

**Access**: `support-read`, `support-write`

---

## 7. Error Codes

| Code | Description | Suggested Action |
|------|-------------|------------------|
| `INVALID_REALM` | Token is from wrong realm | Use correct portal |
| `ACCESS_DENIED` | User lacks permission | Check role requirements |
| `TICKET_NOT_FOUND` | Ticket doesn't exist | Verify ticket ID |
| `ORG_NOT_ACTIVE` | Organization suspended | Contact account manager |
| `TICKET_LIMIT_REACHED` | Monthly limit exceeded | Upgrade plan |
| `LEAD_REQUIRED` | Action requires lead role | Contact lead customer |
| `CONTACT_LIMIT_REACHED` | Max contacts reached | Remove inactive contacts |

---

## 8. Security Considerations

### 8.1 Internal Notes Protection

```typescript
// CRITICAL: Never expose internal_notes to customers
const CUSTOMER_TICKET_PROJECTION = {
  internal_notes: 0,
  // Also hide internal-only fields
  assigned_to_internal_id: 0,
  escalation_history: 0
};

// All customer queries MUST use this projection
db.tickets.find(query, { projection: CUSTOMER_TICKET_PROJECTION });
```

### 8.2 Organization Boundary

```typescript
// CRITICAL: Always filter by organization_id for customer queries
function buildCustomerQuery(userContext: UserContext): object {
  if (userContext.realm !== 'customer') {
    throw new Error('Invalid realm for customer query');
  }

  return {
    organization_id: userContext.organizationId,
    // ... additional filters
  };
}
```

### 8.3 Audit Logging

All customer write operations must be logged:

```typescript
async function logAudit(event: AuditEvent): Promise<void> {
  await db.audit_log.insertOne({
    ...event,
    timestamp: new Date(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)  // 90 days
  });
}
```
