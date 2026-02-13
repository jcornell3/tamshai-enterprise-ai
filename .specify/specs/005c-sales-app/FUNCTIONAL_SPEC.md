# Sales Application Functional Specification

## 1. Overview

**Application**: Tamshai Sales App
**Port**: 4003
**Style Reference**: Salesforce / Zoho CRM
**Primary Users**: Sales Representatives, Sales Managers, Executives

The Sales App provides comprehensive CRM functionality for a SaaS-focused company, with emphasis on subscription sales, pipeline management, and deal forecasting.

---

## 2. Business Context

### 2.1 Sales Model

Tamshai Corp sells SaaS subscriptions with the following structure:
- **Sales Cycle**: 30-90 days for SMB, 90-180 days for Enterprise
- **Deal Types**: New Business, Expansion, Renewal
- **Territories**: West (CA, WA, OR, AZ), East (NY, MA, FL), Central (TX, IL, CO)

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `sales-read` | Sales Viewer | View pipeline, customers, opportunities |
| `sales-write` | Sales Rep | All read + create/edit opportunities, log activities |
| `executive` | Executive | All read across departments |
| `manager` | Sales Manager | Team pipeline, forecasting, quota management |

### 2.3 Pipeline Stages

| Stage | Probability | Description |
|-------|-------------|-------------|
| Prospecting | 10% | Initial contact, qualifying |
| Qualification | 20% | Budget, authority, need, timeline confirmed |
| Proposal | 40% | Pricing sent, demo completed |
| Negotiation | 60% | Contract terms discussion |
| Verbal Commit | 80% | Verbal agreement, awaiting signature |
| Closed Won | 100% | Deal signed |
| Closed Lost | 0% | Deal lost |

---

## 2.4 PRIMARY FLOW: Lead Conversion Wizard

**Hero Flow**: Multi-step lead conversion to Account + Contact + Opportunity (Salesforce-style)

**Complexity**: Multi-step wizard with data validation and entity creation

**Pattern Reference**: `.specify/specs/005-sample-apps/WIZARD_PATTERN.md`

**Steps**:
1. **Lead Review**: Verify lead data, company info, qualify status
2. **Account Creation**: Create new account or link to existing (with duplicate check)
3. **Contact Creation**: Create contact record from lead data with role assignment
4. **Opportunity Creation**: Set opportunity value, stage, close date, products
5. **Review & Convert**: Summary of all entities to be created with confirmation

**Acceptance Criteria**:
- [ ] Duplicate account check runs automatically in step 2
- [ ] Existing account selection auto-populates contact data
- [ ] Opportunity amount calculates from selected products
- [ ] Lead status changes to "Converted" upon completion
- [ ] All three entities (Account, Contact, Opportunity) created atomically

**Test Scenarios**:
```typescript
test.describe('Lead Conversion Wizard', () => {
  test('detects and warns about duplicate accounts', async ({ page }) => {
    // Enter company name matching existing account
    // Verify duplicate warning displayed
    // Verify option to link vs. create new
  });

  test('wizard breadcrumbs update on step navigation', async ({ page }) => {
    await page.goto('/app/sales/leads/123/convert');
    await expectWizardStepActive(page, 'Lead Review');
    await page.click('[data-testid="wizard-next"]');
    await expectWizardStepActive(page, 'Account');
  });

  test('opportunity value updates based on product selection', async ({ page }) => {
    // Navigate to opportunity step
    // Select products
    // Verify amount field updates
  });

  test('creates all entities on final confirmation', async ({ page }) => {
    // Complete all steps
    // Confirm conversion
    // Verify Account, Contact, Opportunity all created
    // Verify lead status is "Converted"
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/sales`
**Required Role**: `sales-read` or `executive`

**Key Metrics Cards**:

| Metric | Description | Visual |
|--------|-------------|--------|
| Pipeline Value | Total weighted pipeline | Currency with trend |
| Deals in Motion | Active opportunities count | Number with stage breakdown |
| Closed This Month | Won deals value | Currency with target % |
| Win Rate | Won / (Won + Lost) | Percentage with trend |

**Charts**:
1. **Pipeline by Stage** - Horizontal bar showing value at each stage
2. **Monthly Trend** - Line chart of closed deals (won vs lost)
3. **Forecast vs Quota** - Progress toward quota
4. **Activity Timeline** - Recent activities feed

### 3.2 Pipeline View

**Route**: `/sales/pipeline`
**Required Role**: `sales-read`

**Kanban Board**:

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ Prospecting │ Qualif.     │ Proposal    │ Negotiation │ Verbal      │ Closed      │
│ $120,000    │ $280,000    │ $450,000    │ $320,000    │ $150,000    │ $890,000    │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │ Deal A  │ │ │ Deal C  │ │ │ Deal E  │ │ │ Deal G  │ │ │ Deal I  │ │ │ Deal K  │ │
│ │ $50K    │ │ │ $150K   │ │ │ $200K   │ │ │ $180K   │ │ │ $75K    │ │ │ $350K ✓ │ │
│ │ Acme    │ │ │ Widget  │ │ │ Tech    │ │ │ Global  │ │ │ Small   │ │ │ Big Co  │ │
│ └─────────┘ │ └─────────┘ │ └─────────┘ │ └─────────┘ │ └─────────┘ │ └─────────┘ │
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │             │
│ │ Deal B  │ │ │ Deal D  │ │ │ Deal F  │ │ │ Deal H  │ │ │ Deal J  │ │             │
│ │ $70K    │ │ │ $130K   │ │ │ $250K   │ │ │ $140K   │ │ │ $75K    │ │             │
│ └─────────┘ │ └─────────┘ │ └─────────┘ │ └─────────┘ │ └─────────┘ │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

**Features**:
- Drag-and-drop to change stage
- Click card to open opportunity detail
- Filter by owner, date range, deal size
- Sort by amount, close date, activity

### 3.3 Opportunities List

**Route**: `/sales/opportunities`
**Required Role**: `sales-read`

**Table Columns**:
| Column | Sortable | Filterable |
|--------|----------|------------|
| Opportunity Name | Yes | Search |
| Customer | Yes | Dropdown |
| Amount | Yes | Range |
| Stage | Yes | Multi-select |
| Close Date | Yes | Date range |
| Owner | Yes | Dropdown |
| Next Action | No | - |
| Last Activity | Yes | - |

**Bulk Actions** (sales-write):
- Assign Owner
- Update Stage
- Update Close Date
- Export to CSV

### 3.4 Opportunity Detail

**Route**: `/sales/opportunities/:id`
**Required Role**: `sales-read`

**Header Section**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Acme Corp - Enterprise License                               [Edit] [Close]│
│  Stage: Negotiation (60%)    Amount: $180,000    Close: Feb 15, 2024        │
│  Owner: John Smith           Customer: Acme Corporation                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Tabs**:

| Tab | Content |
|-----|---------|
| Details | Deal info, products, competitors, notes |
| Activities | Timeline of calls, emails, meetings |
| Contacts | Key stakeholders, roles, influence |
| Documents | Proposals, contracts, presentations |
| Finance | Related invoices (link to Finance app) |

**Close Opportunity Modal** (sales-write):
```typescript
interface CloseOpportunityData {
  outcome: 'won' | 'lost';
  close_date: string;
  // If won:
  contract_value?: number;
  contract_start?: string;
  contract_term_months?: number;
  // If lost:
  lost_reason?: string;  // competitor, budget, timing, no_decision
  competitor?: string;
  notes?: string;
}

// Triggers pending_confirmation
{
  status: 'pending_confirmation',
  message: `Close opportunity as WON?

Opportunity: Acme Corp - Enterprise License
Amount: $180,000
Contract Term: 12 months
Start Date: March 1, 2024

This will:
1. Mark opportunity as Closed Won
2. Create invoice in Finance (link)
3. Create subscription record`,
  confirmationData: { ... }
}
```

### 3.5 Customer Management

**Route**: `/sales/customers`
**Required Role**: `sales-read`

**Customer List**:
| Column | Description |
|--------|-------------|
| Name | Company name with logo |
| Type | Prospect, Customer, Former |
| ARR | Annual recurring revenue |
| Industry | Business category |
| Territory | Sales region |
| Owner | Account owner |
| Health | Red/Yellow/Green |

**Customer Detail** (`/sales/customers/:id`):

**Overview Tab**:
- Company info (name, industry, size, website)
- Key contacts with roles
- Account health score
- Recent activity summary

**Opportunities Tab**:
- All related opportunities (open and closed)
- Historical win rate
- Total lifetime value

**Contacts Tab**:
- All contacts at company
- Role (decision maker, influencer, user)
- Contact info, last interaction

**Activity Tab**:
- Full activity history
- Logged calls, emails, meetings

### 3.6 Lead Management

**Route**: `/sales/leads`
**Required Role**: `sales-read`

**Lead Statuses**:
| Status | Description |
|--------|-------------|
| New | Uncontacted |
| Contacted | Initial outreach made |
| Qualified | Meets BANT criteria |
| Converted | Converted to opportunity |
| Disqualified | Not a fit |

**Lead Scoring**:
```typescript
interface LeadScore {
  total: number;        // 0-100
  factors: {
    company_size: number;    // 0-25
    industry_fit: number;    // 0-25
    engagement: number;      // 0-25
    timing: number;          // 0-25
  };
}
```

**Convert Lead to Opportunity** (sales-write):
- Creates Customer (if new)
- Creates Opportunity
- Archives Lead

### 3.7 Deal Forecasting

**Route**: `/sales/forecast`
**Required Role**: `sales-read`

**Forecast Categories**:
| Category | Definition |
|----------|------------|
| Commit | High confidence, expected to close |
| Best Case | Could close if everything goes well |
| Pipeline | All open opportunities |
| Omitted | Excluded from forecast |

**Forecast Grid**:
```
| Rep          | Quota    | Commit   | Best Case | Pipeline | Closed   | Gap      |
|--------------|----------|----------|-----------|----------|----------|----------|
| John Smith   | $300,000 | $180,000 | $250,000  | $450,000 | $120,000 | $180,000 |
| Jane Doe     | $250,000 | $200,000 | $280,000  | $350,000 | $150,000 | $100,000 |
| Team Total   | $550,000 | $380,000 | $530,000  | $800,000 | $270,000 | $280,000 |
```

**Forecast Actions**:
- Override forecast category (with notes)
- Submit forecast (locks for period)
- Historical comparison

### 3.8 Quotes & Proposals

**Route**: `/sales/quotes`
**Required Role**: `sales-write`

**Quote Builder**:
1. Select opportunity
2. Add products/services
3. Apply discounts
4. Generate PDF
5. Send to customer
6. Track opens/views

**Quote Status**:
- Draft, Sent, Viewed, Accepted, Expired, Rejected

---

## 4. AI Query Integration

**Route**: `/sales/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "Show my open opportunities" | `list-opportunities` | Table with filters |
| "What deals are closing this month?" | `list-opportunities` | Filtered by close date |
| "Update Acme deal to Negotiation" | `update-opportunity` | `pending_confirmation` |
| "Close the Widget deal as won for $150K" | `close-opportunity` | `pending_confirmation` |
| "Show Acme's contact history" | `get-customer`, `list-activities` | Timeline view |

### 4.2 Sales Intelligence Queries

```typescript
// Query: "Why did we lose deals last quarter?"
{
  status: 'success',
  data: {
    totalLost: 12,
    totalValue: 450000,
    reasons: [
      { reason: 'budget', count: 5, value: 200000 },
      { reason: 'competitor', count: 4, value: 180000 },
      { reason: 'timing', count: 2, value: 50000 },
      { reason: 'no_decision', count: 1, value: 20000 }
    ],
    topCompetitors: ['Competitor A', 'Competitor B']
  },
  analysis: "Budget constraints were the top loss reason (42% of losses). Consider flexible pricing or payment terms."
}
```

### 4.3 Write Operations

```typescript
// Query: "Move Acme opportunity to Proposal stage"
{
  status: 'pending_confirmation',
  confirmationId: 'conf-123',
  message: `Update opportunity stage?

Opportunity: Acme Corp - Enterprise License
Current Stage: Qualification (20%)
New Stage: Proposal (40%)

This will update the weighted pipeline value from $36,000 to $72,000.`,
  confirmationData: {
    opportunityId: 'opp-456',
    field: 'stage',
    oldValue: 'qualification',
    newValue: 'proposal'
  }
}
```

---

## 5. MCP Tool Requirements

### 5.1 Existing Tools (mcp-sales)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-opportunities` | Get opportunities | `stage?`, `owner_id?`, `customer_id?`, `from?`, `to?` |
| `get-opportunity` | Get single opportunity | `opportunity_id` |
| `update-opportunity` | Update opportunity | `opportunity_id`, `fields` |
| `close-opportunity` | Close won/lost | `opportunity_id`, `outcome`, `close_data` |

### 5.2 New Tools Required

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-customers` | Get customers | `type?`, `territory?`, `owner_id?` |
| `get-customer` | Get customer detail | `customer_id` |
| `create-customer` | Create customer | `customer_data` |
| `list-leads` | Get leads | `status?`, `owner_id?`, `score_min?` |
| `get-lead` | Get lead detail | `lead_id` |
| `convert-lead` | Convert to opportunity | `lead_id`, `opportunity_data` |
| `list-activities` | Get activities | `entity_type`, `entity_id`, `type?` |
| `create-activity` | Log activity | `entity_type`, `entity_id`, `activity_data` |
| `get-forecast` | Get forecast data | `period`, `owner_id?` |
| `update-forecast` | Update forecast | `opportunity_id`, `forecast_category` |
| `list-quotes` | Get quotes | `opportunity_id?`, `status?` |
| `create-quote` | Generate quote | `opportunity_id`, `line_items` |
| `send-quote` | Send to customer | `quote_id`, `recipient_email` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From Sales | To App | Use Case |
|------------|--------|----------|
| Won Opportunity | Finance | Create invoice |
| Customer | Finance | View invoices, payment history |
| Deal Contact | HR | If employee (internal sales) |

### 6.2 Inbound Links

| From App | To Sales | Use Case |
|----------|----------|----------|
| Finance (invoice) | Opportunity | View related deal |
| Support (ticket) | Customer | View customer details |

---

## 7. User Scenarios

### Scenario 1: Daily Pipeline Review

1. Sales Rep logs into Sales App
2. Opens Dashboard, reviews key metrics
3. Navigates to Pipeline view
4. Filters by "My Opportunities"
5. Drags deal from Proposal to Negotiation
6. Confirms stage change via Approval Card
7. Opens deal detail, logs activity

### Scenario 2: Closing a Won Deal

1. Sales Rep receives signed contract
2. Opens opportunity detail
3. Clicks "Close Opportunity"
4. Selects "Won" outcome
5. Enters contract value, term, start date
6. Confirms via Approval Card
7. Invoice auto-created in Finance (notification)

### Scenario 3: Lead Qualification

1. Marketing generates new lead
2. Sales Rep opens Leads list
3. Reviews lead score and details
4. Contacts lead, updates status to "Contacted"
5. After qualification call, converts to Opportunity
6. Creates new Customer record
7. Opportunity appears in Pipeline

### Scenario 4: Forecast Submission

1. Sales Manager opens Forecast view
2. Reviews team's pipeline
3. Adjusts forecast categories for key deals
4. Uses AI Query: "What's our commit for February?"
5. Reviews rollup numbers
6. Submits forecast for period
7. CFO receives notification

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Dashboard with metrics and charts
- [ ] Kanban pipeline with drag-and-drop
- [ ] Opportunity CRUD with stage management
- [ ] Customer management with health tracking
- [ ] Lead management with scoring
- [ ] Forecast view with category management

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Write operations trigger Approval Card
- [ ] Sales intelligence queries return insights
- [ ] Pipeline updates reflect in real-time

### 8.3 RBAC Compliance
- [ ] sales-read can only view
- [ ] sales-write required for modifications
- [ ] Managers can see team data
- [ ] No client-side authorization logic

### 8.4 Performance
- [ ] Pipeline loads 100+ deals smoothly
- [ ] Drag-and-drop stage change <500ms
- [ ] Forecast calculations <2s

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Sales app specification |
| 1.1 | Feb 2026 | Added forecasting, lead scoring |
