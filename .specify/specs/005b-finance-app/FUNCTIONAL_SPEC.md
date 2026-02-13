# Finance Application Functional Specification

## 1. Overview

**Application**: Tamshai Finance App
**Port**: 4002
**Style Reference**: Xero / QuickBooks
**Primary Users**: Finance Team, Department Managers, Executives

The Finance App provides comprehensive financial management for a SaaS-focused LLC. Key differentiators include ARR (Annual Recurring Revenue) tracking, subscription-based revenue recognition, and multi-state tax reporting capabilities.

---

## 2. Business Context

### 2.1 Company Profile

Tamshai Corp is a SaaS company providing financial/LLC management services. Revenue model:
- **Subscription Revenue**: Monthly/annual SaaS plans (primary)
- **Professional Services**: Implementation, consulting (secondary)
- **One-time Fees**: Setup fees, integrations

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `finance-read` | Finance Viewer | View reports, budgets, invoices |
| `finance-write` | Finance Admin | All read + approve budgets, process invoices |
| `executive` | Executive | All read across departments |
| `manager` | Department Manager | View department budget status |

### 2.3 Fiscal Calendar

- **Fiscal Year**: January 1 - December 31
- **Quarters**: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- **Reporting Currency**: USD

---

## 2.4 PRIMARY FLOW: Invoice Batch Approval

**Hero Flow**: Bulk selection and batch approval of pending invoices

**Complexity**: Bulk action pattern with confirmation

**Pattern Reference**: `.specify/specs/005-sample-apps/BULK_ACTIONS_PATTERN.md`

**Flow**:
1. Navigate to Invoices page, filter by "Pending Approval"
2. Select multiple invoices via checkboxes
3. Click "Approve" in bulk action toolbar
4. Review confirmation dialog with invoice summary
5. Confirm to batch-approve all selected

**Acceptance Criteria**:
- [ ] Bulk action toolbar hidden when no rows selected
- [ ] Bulk action toolbar shows count when rows selected
- [ ] "Approve" button enabled only with 1+ rows selected
- [ ] Confirmation shows total amount and invoice list
- [ ] All selected invoices update status atomically
- [ ] Toast notification shows success/partial failure

**Test Scenarios**:
```typescript
test.describe('Invoice Bulk Approval', () => {
  test('bulk action menu enables only when rows selected', async ({ page }) => {
    await page.goto('/app/finance/invoices');
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeHidden();
    await page.click('[data-testid="row-checkbox-0"]');
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="bulk-approve"]')).toBeEnabled();
  });

  test('shows confirmation dialog before bulk approve', async ({ page }) => {
    await page.click('[data-testid="row-checkbox-0"]');
    await page.click('[data-testid="row-checkbox-1"]');
    await page.click('[data-testid="bulk-approve"]');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toContainText('Approve 2 invoices');
  });

  test('updates all selected invoices on confirmation', async ({ page }) => {
    // Select invoices, approve, verify all status changed
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/finance`
**Required Role**: `finance-read` or `executive`

**Key Metrics Cards**:

| Metric | Description | Data Source |
|--------|-------------|-------------|
| Monthly Revenue | Current month total | `mcp-finance/get-revenue-summary` |
| ARR | Annual Recurring Revenue | `mcp-finance/get-arr` |
| Outstanding AR | Accounts receivable balance | `mcp-finance/list-invoices?status=unpaid` |
| Monthly Burn Rate | Operating expenses | `mcp-finance/get-expenses-summary` |

**Charts**:
1. **Revenue Trend** - 12-month line chart (MRR, Services, Total)
2. **ARR Growth** - Quarterly bar chart with YoY comparison
3. **Expense Breakdown** - Pie chart by category
4. **Cash Flow** - 6-month projection

### 3.2 ARR Dashboard (SaaS-Specific)

**Route**: `/finance/arr`
**Required Role**: `finance-read`

**Metrics**:

| Metric | Formula | Description |
|--------|---------|-------------|
| ARR | Sum of all active annual subscription values | Total annual recurring revenue |
| MRR | ARR / 12 | Monthly recurring revenue |
| Net New ARR | New + Expansion - Churn | Monthly ARR change |
| Gross Revenue Retention | (Starting ARR - Churn) / Starting ARR | Customer retention |
| Net Revenue Retention | (Starting + Expansion - Churn) / Starting | Revenue retention with upsells |
| ARPU | ARR / Active Customers | Average revenue per user |

**ARR Movement Table**:

```
| Period   | Starting ARR | New ARR | Expansion | Churn    | Net New  | Ending ARR |
|----------|--------------|---------|-----------|----------|----------|------------|
| Jan 2024 | $1,200,000   | $50,000 | $15,000   | ($8,000) | $57,000  | $1,257,000 |
| Feb 2024 | $1,257,000   | $45,000 | $20,000   | ($5,000) | $60,000  | $1,317,000 |
```

**Cohort Analysis**:
- Customer cohort by signup month
- Revenue retention by cohort over 12 months
- Churn patterns visualization

### 3.3 Budget Management

**Route**: `/finance/budgets`
**Required Role**: `finance-read` (view), `finance-write` (approve)

**Budget Structure**:

```
FY 2024 Budget
├── Revenue Budget
│   ├── Subscription Revenue
│   ├── Professional Services
│   └── One-time Fees
├── Operating Expenses
│   ├── Personnel
│   │   ├── Engineering
│   │   ├── Sales
│   │   ├── Support
│   │   └── G&A
│   ├── Software & Infrastructure
│   ├── Marketing
│   ├── Office & Facilities
│   └── Professional Services
└── Capital Expenditures
```

**Budget Views**:
1. **Annual Overview** - Full year by department
2. **Monthly Detail** - Actual vs Budget vs Variance
3. **Department Drill-down** - Category breakdown

**Budget Approval Workflow** (write operations):
1. Department submits budget request
2. Finance reviews and adjusts
3. CFO approves (triggers `pending_confirmation`)
4. Budget locked for period

### 3.4 Invoice Management

**Route**: `/finance/invoices`
**Required Role**: `finance-read`

**Invoice List Features**:
- Filter by status (Draft, Sent, Paid, Overdue, Void)
- Filter by customer, date range
- Sort by amount, due date, age
- Cursor-based pagination (50 per page)

**Invoice Statuses**:

| Status | Description | Actions |
|--------|-------------|---------|
| Draft | Not yet sent | Edit, Send, Delete |
| Sent | Awaiting payment | Record Payment, Send Reminder, Void |
| Paid | Fully paid | View Only |
| Partial | Partially paid | Record Payment |
| Overdue | Past due date | Send Reminder, Add Late Fee |
| Void | Cancelled | View Only |

**Invoice Detail Page** (`/finance/invoices/:id`):
- Header: Customer, dates, totals
- Line items with description, quantity, rate
- Payment history
- Related opportunities (link to Sales)
- Audit trail

**Invoice Actions**:
```typescript
// Record payment (triggers confirmation)
{
  status: 'pending_confirmation',
  message: `Record payment of $5,000.00 for Invoice #INV-2024-0123?

Customer: Acme Corp
Invoice Total: $10,000.00
Previous Payments: $5,000.00
Payment Amount: $5,000.00
Remaining: $0.00

This invoice will be marked as PAID.`,
  confirmationData: { invoiceId, amount, paymentMethod }
}
```

### 3.5 Expense Reports

**Route**: `/finance/expenses`
**Required Role**: `finance-read` (view), `finance-write` (approve)

**Expense Report Workflow**:
1. Employee submits via HR App (links to Finance)
2. Manager approves
3. Finance reviews (categorization, receipts)
4. Finance approves for reimbursement
5. Payment processed via Payroll

**Expense Categories**:
- Travel (flights, hotels, ground transport)
- Meals & Entertainment
- Office Supplies
- Software Subscriptions (individual)
- Professional Development
- Client Gifts

**Expense Report View**:
| Column | Description |
|--------|-------------|
| Report # | Unique identifier |
| Employee | Submitter name |
| Department | Cost center |
| Submit Date | When submitted |
| Amount | Total expense amount |
| Status | Submitted, Approved, Rejected, Paid |
| Actions | Approve, Reject, View |

### 3.6 Bank Reconciliation

**Route**: `/finance/reconciliation`
**Required Role**: `finance-write`

**Reconciliation Status**:
- Last reconciled date
- Unreconciled transactions count
- Account balance vs Book balance
- Discrepancy alerts

**Features**:
- Match bank transactions to invoices/payments
- Flag duplicate entries
- Categorize unknown transactions
- Export reconciliation report

### 3.7 Quarterly Reports

**Route**: `/finance/quarterly`
**Required Role**: `finance-read`

**Report Contents**:

1. **Income Statement**
   - Revenue by category
   - Operating expenses
   - Net income

2. **Balance Sheet**
   - Assets (Cash, AR, Prepaid)
   - Liabilities (AP, Deferred Revenue)
   - Equity

3. **Cash Flow Statement**
   - Operating activities
   - Investing activities
   - Financing activities

4. **SaaS Metrics Summary**
   - ARR, MRR trends
   - Customer metrics (new, churn, NRR)
   - ARPU, LTV, CAC

**Export Options**:
- PDF report
- Excel workbook with all sheets
- CSV data export

---

## 4. AI Query Integration

**Route**: `/finance/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "What's our current ARR?" | `get-arr` | Single metric with trend |
| "Show unpaid invoices over 30 days" | `list-invoices` | Invoice table with truncation |
| "What's Engineering's budget status?" | `get-budget` | Budget comparison |
| "Approve the Q1 marketing budget" | `approve-budget` | `pending_confirmation` |
| "List expense reports pending approval" | `list-expense-reports` | Expense table |

### 4.2 Complex Analysis Queries

```typescript
// Query: "Compare Q4 expenses to Q3"
{
  status: 'success',
  data: {
    q3: { total: 450000, byCategory: {...} },
    q4: { total: 520000, byCategory: {...} },
    variance: { total: 70000, percentChange: 15.6 }
  },
  analysis: "Q4 expenses increased 15.6% vs Q3, primarily due to:\n- Personnel: +$40K (new hires)\n- Marketing: +$25K (holiday campaigns)\n- Office: +$5K (year-end supplies)"
}
```

### 4.3 Write Operations

```typescript
// Query: "Approve invoice #INV-2024-0456"
{
  status: 'pending_confirmation',
  confirmationId: 'conf-789',
  message: `Approve Invoice #INV-2024-0456?

Customer: Widget Industries
Amount: $25,000.00
Due Date: February 15, 2024
Terms: Net 30

This will mark the invoice as approved and ready for sending.`,
  confirmationData: {
    invoiceId: 'inv-456',
    action: 'approve',
    amount: 25000
  }
}
```

---

## 5. MCP Tool Requirements

### 5.1 Existing Tools (mcp-finance)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-invoices` | Get invoice list | `status?`, `customer_id?`, `from?`, `to?`, `cursor?` |
| `get-invoice` | Get single invoice | `invoice_id` |
| `delete-invoice` | Void invoice | `invoice_id`, `reason` |
| `list-budgets` | Get budget list | `fiscal_year?`, `department?` |
| `get-budget` | Get single budget | `budget_id` |
| `approve-budget` | Approve budget | `budget_id`, `comments?` |
| `list-expense-reports` | Get expenses | `status?`, `employee_id?`, `from?`, `to?` |
| `get-expense-report` | Get single report | `expense_report_id` |

### 5.2 New Tools Required

| Tool | Purpose | Parameters |
|------|---------|------------|
| `get-arr` | Get ARR metrics | `as_of_date?` |
| `get-arr-movement` | Get ARR changes | `period_start`, `period_end` |
| `get-revenue-summary` | Revenue breakdown | `period` |
| `get-expenses-summary` | Expense breakdown | `period`, `department?` |
| `record-payment` | Record invoice payment | `invoice_id`, `amount`, `method`, `date` |
| `send-invoice` | Send invoice to customer | `invoice_id` |
| `approve-expense` | Approve expense report | `expense_report_id`, `approved`, `comments?` |
| `get-quarterly-report` | Generate quarterly report | `year`, `quarter` |
| `list-transactions` | Bank transactions | `account_id?`, `from?`, `to?`, `reconciled?` |
| `reconcile-transaction` | Match transaction | `transaction_id`, `invoice_id?`, `expense_id?` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From Finance | To App | Use Case |
|--------------|--------|----------|
| Invoice | Sales | View related opportunity |
| Expense Report | HR | View employee profile |
| Budget | HR | View department headcount |
| Revenue | Tax | Calculate tax liability |

### 6.2 Inbound Links

| From App | To Finance | Use Case |
|----------|------------|----------|
| Sales (won deal) | Create Invoice | Auto-invoice from closed opportunity |
| HR (expense submit) | Expense Report | Employee expense reimbursement |
| Payroll (run) | Expense | Payroll expense recording |

---

## 7. User Scenarios

### Scenario 1: Monthly Close Process

1. Finance Admin logs into Finance App
2. Navigates to Bank Reconciliation
3. Reviews unreconciled transactions
4. Matches transactions to invoices/payments
5. Generates reconciliation report
6. Navigates to Quarterly Reports (if quarter-end)
7. Reviews financial statements
8. Exports reports for leadership

### Scenario 2: Invoice Payment Recording

1. Finance Admin receives payment notification
2. Opens Finance App, navigates to Invoices
3. Filters by customer name
4. Opens invoice detail
5. Clicks "Record Payment"
6. Enters payment amount and method
7. Confirms via Approval Card
8. Invoice status updates to Paid

### Scenario 3: Budget Approval

1. CFO reviews pending budget requests
2. Opens Budget Management
3. Filters by "Pending Approval"
4. Opens department budget detail
5. Reviews line items and justifications
6. Uses AI Query: "Approve Engineering Q2 budget with adjustment to software line"
7. Confirms via Approval Card
8. Budget locked for period

### Scenario 4: ARR Analysis

1. Executive opens Finance App
2. Navigates to ARR Dashboard
3. Reviews current ARR and MRR
4. Analyzes cohort retention chart
5. Drills into churn details
6. Uses AI Query: "Which customers churned in January?"
7. Reviews customer list with churn reasons
8. Exports for customer success follow-up

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Dashboard with key metrics and charts
- [ ] ARR dashboard with SaaS metrics
- [ ] Budget management with approval workflow
- [ ] Invoice CRUD with status management
- [ ] Expense report viewing and approval
- [ ] Quarterly report generation

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Truncation warnings for large datasets
- [ ] Write operations trigger Approval Card
- [ ] Complex analysis queries return structured data

### 8.3 RBAC Compliance
- [ ] finance-read can only view
- [ ] finance-write required for approvals
- [ ] Department managers limited to their budgets
- [ ] No client-side authorization logic

### 8.4 Performance
- [ ] Dashboard loads in <1s
- [ ] Invoice list with 1000+ records paginates smoothly
- [ ] Quarterly reports generate in <5s

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial Finance app specification |
| 1.1 | Feb 2026 | Added ARR dashboard, bank reconciliation |
