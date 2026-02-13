# Support Application Functional Specification

## 1. Overview

**Application**: Tamshai Support App
**Port**: 4004
**Style Reference**: ServiceNow / Zoho Desk
**Primary Users**: Support Agents, Support Managers, Knowledge Base Authors

The Support App provides comprehensive helpdesk and knowledge management functionality for customer support operations. Key features include SLA tracking, ticket categorization, knowledge base management, and customer satisfaction scoring.

---

## 2. Business Context

### 2.1 Support Model

Tamshai Corp provides tiered support based on customer subscription:
- **Starter**: Email only, 48-hour response SLA
- **Professional**: Email + Chat, 24-hour response SLA
- **Enterprise**: Phone + Email + Chat, 4-hour response SLA

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `support-read` | Support Viewer | View tickets, KB articles, reports |
| `support-write` | Support Agent | All read + resolve tickets, create KB articles |
| `executive` | Executive | All read across departments |
| `manager` | Support Manager | Team metrics, SLA management, escalations |

### 2.3 Support Channels

| Channel | Response Time | Priority |
|---------|---------------|----------|
| Phone | Real-time | High |
| Chat | <5 minutes | High |
| Email | Per SLA | Normal |
| Portal | Per SLA | Normal |

---

## 2.4 PRIMARY FLOW: Ticket Escalation Flow

**Hero Flow**: SLA-driven escalation with manager notification and priority adjustment

**Complexity**: Conditional flow with real-time SLA tracking

**Pattern Reference**: `.specify/research/servicenow-filter-patterns.md`

**Flow**:
1. View ticket detail with SLA countdown indicator
2. Click "Escalate" button when SLA at risk or customer escalation
3. Select escalation type (Priority, Functional, Hierarchical)
4. Enter required escalation reason
5. Confirm escalation - manager notified immediately

**SLA Status Visual States**:
| Status | Color | Threshold | Visual |
|--------|-------|-----------|--------|
| On Track | Green | > 25% time remaining | Progress bar (green) |
| At Risk | Amber | 10-25% time remaining | Progress bar (amber) with pulse |
| Critical | Red | < 10% time remaining | Progress bar (red) with shake |
| Breached | Dark Red | Past due | Static bar, breach badge |

**Acceptance Criteria**:
- [ ] SLA countdown updates in real-time (every minute)
- [ ] "Escalate" button prominent when SLA at risk
- [ ] Escalation reason is required (cannot skip)
- [ ] Manager receives immediate notification (email + in-app)
- [ ] Ticket shows escalation badge in all list views
- [ ] Audit trail records escalation with timestamp and user

**Test Scenarios**:
```typescript
test.describe('Ticket Escalation Flow', () => {
  test('SLA indicator shows correct status based on time remaining', async ({ page }) => {
    // Mock ticket with 15% time remaining
    // Verify "At Risk" status displayed
    // Verify amber styling applied
  });

  test('escalation requires reason before submission', async ({ page }) => {
    await page.click('[data-testid="escalate-button"]');
    await page.click('[data-testid="confirm-escalation"]');
    // Verify validation error on reason field
    await expect(page.locator('[data-testid="reason-error"]')).toBeVisible();
  });

  test('escalation updates ticket status and notifies manager', async ({ page }) => {
    // Complete escalation flow
    // Verify ticket shows escalation badge
    // Verify audit trail entry created
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/support`
**Required Role**: `support-read` or `executive`

**Key Metrics Cards**:

| Metric | Description | Visual |
|--------|-------------|--------|
| Open Tickets | Unresolved ticket count | Number with trend |
| Avg Response Time | Time to first response | Duration with SLA % |
| CSAT Score | Customer satisfaction | Percentage with trend |
| Resolution Rate | % resolved within SLA | Percentage |

**Charts**:
1. **Ticket Volume** - 7-day trend (created vs resolved)
2. **SLA Performance** - Pie chart (within vs breached)
3. **By Category** - Bar chart of ticket categories
4. **Agent Workload** - Horizontal bar of tickets per agent

**Alerts Panel**:
- Tickets at risk of SLA breach
- Escalated tickets requiring attention
- Oldest unassigned tickets

### 3.2 Tickets Dashboard

**Route**: `/support/tickets`
**Required Role**: `support-read`

**Views**:
| View | Filter | Sort |
|------|--------|------|
| All Open | status != closed | Created date desc |
| My Assigned | assigned_to = me | Priority desc |
| Unassigned | assigned_to = null | Created date asc |
| Critical | priority = critical | SLA time remaining |
| Escalated | is_escalated = true | Escalated date desc |

**Table Columns**:
| Column | Description | Sortable |
|--------|-------------|----------|
| Ticket # | Unique ID (TKT-XXXX) | Yes |
| Subject | Ticket title | No |
| Customer | Company name | Yes |
| Priority | Critical/High/Medium/Low | Yes |
| Status | Open/Pending/Resolved/Closed | Yes |
| SLA Status | Time remaining / breached | Yes |
| Assigned | Agent name | Yes |
| Created | Date created | Yes |

**Quick Actions**:
- Assign to me
- Change priority
- Add internal note
- Escalate

### 3.3 Ticket Detail

**Route**: `/support/tickets/:id`
**Required Role**: `support-read`

**Header**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  TKT-2024-0123: Unable to login to dashboard                                 │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Customer: Acme Corp (Enterprise)    Contact: John Smith <john@acme.com>     │
│  Priority: [HIGH]    Status: [OPEN]    SLA: 2h 15m remaining                 │
│  Assigned: Jane Agent    Category: Authentication > Login Issues             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Tabs**:

| Tab | Content |
|-----|---------|
| Conversation | Thread of customer + agent messages |
| Details | Full ticket info, custom fields |
| Activity | Timeline of status changes, assignments |
| Related | Linked tickets, KB articles |

**Conversation Panel**:
- Customer messages (left-aligned, blue)
- Agent replies (right-aligned, white)
- Internal notes (yellow background, agent-only)
- Rich text editor for replies
- Canned response insertion
- File attachments

**SLA Indicator**:
```
Response SLA: ✓ Met (responded in 45 min)
Resolution SLA: ⏱ 2h 15m remaining [===============     ]
```

**Action Buttons** (support-write):
- Reply
- Add Internal Note
- Resolve Ticket (triggers `pending_confirmation`)
- Escalate
- Merge Tickets

### 3.4 Close Ticket Modal

**Trigger**: Click "Resolve Ticket"
**Required Role**: `support-write`

```typescript
interface CloseTicketData {
  resolution_type: 'solved' | 'wont_fix' | 'duplicate' | 'customer_no_response';
  resolution_summary: string;
  root_cause?: string;
  kb_article_id?: string;    // Link to relevant KB article
  satisfaction_requested: boolean;
}

// Triggers pending_confirmation
{
  status: 'pending_confirmation',
  message: `Resolve ticket TKT-2024-0123?

Customer: Acme Corp
Subject: Unable to login to dashboard
Resolution Type: Solved
Summary: Reset user's MFA device and confirmed access restored.

A satisfaction survey will be sent to the customer.

This action cannot be undone.`,
  confirmationData: { ticketId, resolution }
}
```

### 3.5 SLA Management

**Route**: `/support/sla`
**Required Role**: `support-read`

**SLA Policies**:
| Tier | First Response | Resolution | Business Hours |
|------|---------------|------------|----------------|
| Starter | 48 hours | 7 days | M-F 9am-5pm PT |
| Professional | 24 hours | 3 days | M-F 6am-8pm PT |
| Enterprise | 4 hours | 1 day | 24/7 |

**SLA Dashboard**:
- Overall SLA compliance rate
- Compliance by tier
- Compliance by agent
- SLA breach reasons analysis

**At-Risk Tickets**:
- Tickets within 25% of SLA deadline
- Sorted by time remaining
- Quick assign/escalate actions

### 3.6 Knowledge Base

**Route**: `/support/kb`
**Required Role**: `support-read`

**Article Search**:
- Full-text search across title, content, tags
- Filter by category, status, author
- Relevance scoring with highlighting
- Truncation warning for >50 results

**Categories**:
```
Knowledge Base
├── Getting Started
│   ├── Account Setup
│   ├── First Login
│   └── User Management
├── Product Features
│   ├── Dashboard
│   ├── Reports
│   └── Integrations
├── Troubleshooting
│   ├── Login Issues
│   ├── Performance
│   └── Error Messages
├── API Documentation
│   ├── Authentication
│   ├── Endpoints
│   └── Webhooks
└── FAQ
    ├── Billing
    ├── Security
    └── General
```

**Article List**:
| Column | Description |
|--------|-------------|
| Title | Article title with category |
| Views | View count |
| Helpful | % found helpful |
| Updated | Last modified date |
| Status | Published/Draft/Archived |

### 3.7 Article Detail

**Route**: `/support/kb/:id`
**Required Role**: `support-read`

**Article View**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Category: Troubleshooting > Login Issues                                    │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  How to Reset Your Password                                                  │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  If you've forgotten your password, follow these steps to reset it:          │
│                                                                              │
│  1. Click "Forgot Password" on the login page                                │
│  2. Enter your email address                                                 │
│  3. Check your email for the reset link                                      │
│  4. Click the link and create a new password                                 │
│                                                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Related Articles:                                                           │
│  • Two-Factor Authentication Setup                                           │
│  • Troubleshooting Login Errors                                              │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Was this article helpful?  [👍 Yes]  [👎 No]                                │
│  Views: 1,234    Last Updated: Jan 15, 2024                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Edit Mode** (support-write):
- Markdown editor with preview
- Category assignment
- Tag management
- Related articles linking
- Revision history

### 3.8 Agent Performance

**Route**: `/support/performance`
**Required Role**: `manager`

**Agent Metrics**:
| Metric | Description |
|--------|-------------|
| Tickets Resolved | Count in period |
| Avg Resolution Time | Time from open to close |
| First Response Time | Time to first reply |
| SLA Compliance | % within SLA |
| CSAT Score | Customer satisfaction |
| Reopen Rate | % of tickets reopened |

**Leaderboard**:
```
| Rank | Agent        | Resolved | Avg Time | SLA %  | CSAT  |
|------|--------------|----------|----------|--------|-------|
| 1    | Jane Agent   | 145      | 2.5h     | 98%    | 4.8   |
| 2    | Bob Support  | 132      | 3.1h     | 95%    | 4.6   |
| 3    | Alice Help   | 128      | 2.8h     | 96%    | 4.7   |
```

### 3.9 Customer Satisfaction (CSAT)

**Survey Flow**:
1. Ticket resolved
2. Survey email sent (if enabled)
3. Customer rates 1-5 stars
4. Optional comment
5. Results linked to ticket

**CSAT Dashboard**:
- Overall score (rolling 30 days)
- Trend chart
- Score distribution
- Recent comments (positive/negative)
- Score by category

---

## 4. AI Query Integration

**Route**: `/support/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "Show open tickets for Acme" | `search-tickets` | Filtered ticket list |
| "What's the article about password reset?" | `search-knowledge-base` | Article preview |
| "Assign ticket 123 to me" | `update-ticket` | `pending_confirmation` |
| "Close ticket 456 as solved" | `close-ticket` | `pending_confirmation` |
| "What are the most common issues this week?" | `get-ticket-analytics` | Category breakdown |

### 4.2 Intelligent Article Suggestions

```typescript
// Query: "Customer can't login"
{
  status: 'success',
  data: {
    suggestedArticles: [
      { id: 'kb-001', title: 'How to Reset Your Password', relevance: 0.95 },
      { id: 'kb-002', title: 'Troubleshooting Login Errors', relevance: 0.88 },
      { id: 'kb-003', title: 'Two-Factor Authentication Setup', relevance: 0.72 }
    ],
    recentSimilarTickets: [
      { id: 'TKT-2024-0100', subject: 'Login not working', resolution: 'Password reset' }
    ]
  },
  suggestion: "Based on similar tickets, this is likely a password or MFA issue. Consider sharing KB article 'How to Reset Your Password'."
}
```

### 4.3 Write Operations

```typescript
// Query: "Escalate ticket TKT-2024-0123 to manager"
{
  status: 'pending_confirmation',
  confirmationId: 'conf-456',
  message: `Escalate ticket to support management?

Ticket: TKT-2024-0123
Subject: Unable to login to dashboard
Customer: Acme Corp (Enterprise)
Current Agent: Jane Agent
SLA Status: 1h 45m remaining

Escalation Reason: Customer requesting manager callback

This will notify the support manager and prioritize the ticket.`,
  confirmationData: {
    ticketId: 'TKT-2024-0123',
    action: 'escalate'
  }
}
```

---

## 5. MCP Tool Requirements

### 5.1 Existing Tools (mcp-support)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `search-tickets` | Search tickets | `query?`, `status?`, `priority?`, `customer_id?` |
| `get-ticket` | Get single ticket | `ticket_id` |
| `update-ticket` | Update ticket | `ticket_id`, `fields` |
| `search-knowledge-base` | Search KB | `query`, `category?`, `limit?` |
| `get-knowledge-article` | Get article | `article_id` |

### 5.2 New Tools Required

| Tool | Purpose | Parameters |
|------|---------|------------|
| `create-ticket` | Create ticket | `ticket_data` |
| `close-ticket` | Resolve ticket | `ticket_id`, `resolution` |
| `escalate-ticket` | Escalate ticket | `ticket_id`, `reason` |
| `assign-ticket` | Assign to agent | `ticket_id`, `agent_id` |
| `add-ticket-comment` | Add reply/note | `ticket_id`, `comment`, `is_internal` |
| `merge-tickets` | Merge duplicates | `primary_ticket_id`, `duplicate_ids[]` |
| `create-article` | Create KB article | `article_data` |
| `update-article` | Update KB article | `article_id`, `fields` |
| `get-sla-status` | Get SLA info | `ticket_id` |
| `get-agent-metrics` | Performance data | `agent_id?`, `period` |
| `get-csat-data` | CSAT scores | `period`, `agent_id?` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From Support | To App | Use Case |
|--------------|--------|----------|
| Customer | Sales | View account details, ARR |
| Contact | HR | If internal employee |
| Ticket (billing) | Finance | View invoices, payment status |

### 6.2 Inbound Links

| From App | To Support | Use Case |
|----------|------------|----------|
| Sales (customer) | Tickets | View support history |
| Finance (invoice) | Ticket | Payment support issue |

---

## 7. User Scenarios

### Scenario 1: Handling a New Ticket

1. Agent opens Support Dashboard
2. Sees new unassigned ticket
3. Clicks "Assign to Me"
4. Opens ticket detail
5. Reviews customer info and issue
6. Uses AI Query: "Suggest articles for login issue"
7. Sends reply with KB article link
8. Sets status to "Pending Customer"

### Scenario 2: Resolving a Ticket

1. Customer confirms issue resolved
2. Agent opens ticket
3. Clicks "Resolve Ticket"
4. Selects resolution type: Solved
5. Enters resolution summary
6. Links relevant KB article
7. Enables satisfaction survey
8. Confirms via Approval Card
9. Ticket closed, survey sent

### Scenario 3: Escalating a Critical Issue

1. Agent receives critical ticket
2. Issue requires manager attention
3. Agent adds internal note with details
4. Uses AI Query: "Escalate this ticket"
5. Confirms escalation via Approval Card
6. Manager notified immediately
7. Ticket flagged as escalated

### Scenario 4: Creating Knowledge Article

1. Agent notices common question
2. Opens Knowledge Base editor
3. Creates new article
4. Selects category and tags
5. Writes content with markdown
6. Adds related articles
7. Saves as draft
8. Manager reviews and publishes

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Dashboard with metrics and alerts
- [ ] Ticket list with filters and views
- [ ] Ticket detail with conversation thread
- [ ] SLA tracking and indicators
- [ ] Knowledge base with search
- [ ] Article CRUD functionality

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Article suggestions based on ticket content
- [ ] Write operations trigger Approval Card
- [ ] Analytics queries return insights

### 8.3 RBAC Compliance
- [ ] support-read can only view
- [ ] support-write required for modifications
- [ ] Managers can see all agent data
- [ ] No client-side authorization logic

### 8.4 Performance
- [ ] Ticket search returns in <500ms
- [ ] KB search with relevance ranking <1s
- [ ] Dashboard loads with 1000+ tickets <2s

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Support app specification |
| 1.1 | Feb 2026 | Added SLA management, CSAT tracking |
