# Tax Application Functional Specification

## 1. Overview

**Application**: Tamshai Tax App
**Port**: 4006 (NEW)
**Style Reference**: TurboTax Business / Quaderno
**Primary Users**: Tax/Finance Team, Executives

The Tax App provides comprehensive tax management for a SaaS LLC operating across multiple US states. It handles sales tax compliance, quarterly estimated tax payments, annual filing preparation, and multi-state nexus tracking.

---

## 2. Business Context

### 2.1 Company Profile

Tamshai Corp is a SaaS LLC providing financial management services:
- **Entity Type**: Limited Liability Company (LLC), taxed as S-Corp
- **Primary State**: California (headquarters)
- **Revenue Model**: SaaS subscriptions (taxable in some states)
- **Customer Base**: US businesses (B2B)
- **Employee Locations**: Remote workers in multiple states (creates nexus)

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `tax-read` | Tax Viewer | View tax rates, reports, compliance status |
| `tax-write` | Tax Admin | All read + file returns, manage exemptions |
| `executive` | Executive | All read across departments |
| `finance-read` | Finance Viewer | View tax liabilities (cross-app) |

### 2.3 Tax Types Managed

| Tax Type | Description | Frequency |
|----------|-------------|-----------|
| Sales Tax | State/local sales tax on SaaS | Monthly/Quarterly |
| Use Tax | For purchases without sales tax | Quarterly |
| Income Tax (State) | Pass-through to owners | Quarterly/Annual |
| Payroll Tax | Employer portion (cross-app) | Per payroll |
| 1099 Reporting | Contractor payments | Annual |
| Franchise Tax | State business taxes | Annual |

---

## 2.4 PRIMARY FLOW: Quarterly Filing Review

**Hero Flow**: Review and file quarterly tax returns with audit trail

**Complexity**: Review workflow with export and filing confirmation

**Pattern Reference**: `.specify/research/quaderno-tax-schema.md`

**Flow**:
1. Navigate to Quarterly Filings, select quarter
2. Review transaction summary by jurisdiction
3. Export detailed report (CSV/PDF) for records
4. Mark as "Reviewed" with reviewer name
5. File via state portal (external)
6. Enter confirmation number and mark as "Filed"

**Acceptance Criteria**:
- [ ] Quarterly summary shows all jurisdictions with activity
- [ ] Each jurisdiction shows gross sales, taxable sales, tax collected
- [ ] Export generates Quaderno-compatible schema
- [ ] "Reviewed" status requires reviewer acknowledgment
- [ ] "Filed" status requires confirmation number
- [ ] Audit trail immutable - no editing after filed

**Quaderno-Compatible Export Schema**:
```typescript
interface QuarterlyTaxReport {
  period: { year: number; quarter: number };
  jurisdictions: JurisdictionSummary[];
  totals: {
    grossSales: number;
    taxableSales: number;
    exemptSales: number;
    taxCollected: number;
  };
  exportFormats: ['csv', 'pdf', 'json'];
}
```

**Test Scenarios**:
```typescript
test.describe('Quarterly Filing Review', () => {
  test('shows all jurisdictions with transactions', async ({ page }) => {
    await page.goto('/app/tax/quarterly/2024-Q1');
    // Verify CA, NY, TX jurisdictions displayed
    // Verify totals match sum of jurisdictions
  });

  test('export generates valid CSV with correct schema', async ({ page }) => {
    // Click export CSV
    // Verify download initiated
    // Verify CSV contains required columns
  });

  test('filing requires confirmation number', async ({ page }) => {
    // Mark as reviewed
    // Attempt to mark as filed without confirmation
    // Verify validation error
    // Enter confirmation number
    // Verify status changes to "Filed"
  });

  test('filed returns cannot be edited', async ({ page }) => {
    // Navigate to filed return
    // Verify edit controls disabled
    // Verify "Filed" badge displayed
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/tax`
**Required Role**: `tax-read` or `executive`

**Key Metrics Cards**:

| Metric | Description | Visual |
|--------|-------------|--------|
| YTD Sales Tax Collected | Total collected this year | Currency |
| Next Filing Due | Nearest deadline | Date with countdown |
| States with Nexus | Count of registered states | Number |
| Compliance Score | Overall compliance status | Percentage |

**Charts**:
1. **Sales Tax by Month** - 12-month bar chart
2. **Tax by State** - Horizontal bar of top states
3. **Filing Calendar** - Upcoming deadlines
4. **Audit Risk Indicator** - Risk factors summary

**Alerts Panel**:
- Upcoming filing deadlines
- Expiring exemption certificates
- Nexus threshold warnings
- Failed payments

### 3.2 Sales Tax Management

**Route**: `/tax/rates`
**Required Role**: `tax-read`

**Tax Rate Lookup**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Sales Tax Rate Lookup                                                       │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Enter Address:                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ City: San Francisco      State: CA      ZIP: 94105                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Combined Rate: 8.625%                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ State Tax (CA)                                      6.000%             │ │
│  │ County Tax (San Francisco)                          1.250%             │ │
│  │ City Tax (San Francisco)                            0.000%             │ │
│  │ Special District (BART)                             1.000%             │ │
│  │ Special District (SF County Transport)              0.375%             │ │
│  │ ──────────────────────────────────────────────────────────────────────│ │
│  │ TOTAL                                               8.625%             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  SaaS Taxability: TAXABLE (California taxes SaaS)                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Rate Table** (by state):
| Column | Description |
|--------|-------------|
| State | State code |
| State Rate | Base state rate |
| Avg Local | Average local rate |
| Combined | Total typical rate |
| SaaS Taxable | Yes/No/Varies |
| Sourcing | Origin/Destination |

### 3.3 Nexus Map

**Route**: `/tax/nexus`
**Required Role**: `tax-read`

**Nexus Types**:
| Type | Trigger | Example |
|------|---------|---------|
| Physical | Office, warehouse, employee | CA (HQ), employee states |
| Economic | Revenue/transaction thresholds | $100K/200 transactions |
| Click-through | Affiliate agreements | Referral programs |
| Marketplace | Sales through marketplace | (Not applicable - direct sales) |

**Nexus Dashboard**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nexus Status by State                                                       │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [Map of US with states colored by nexus status]                         ││
│  │                                                                          ││
│  │ Legend:                                                                  ││
│  │ ■ Registered (12)  ■ Approaching Threshold (3)  □ No Nexus (35)         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  States Requiring Action:                                                    │
│  • Texas: $95,000 / $100,000 threshold (95%) - Register soon!               │
│  • Georgia: $90,000 / $100,000 threshold (90%) - Monitor                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**State Detail Modal**:
- Nexus type (Physical, Economic, Both)
- Registration status
- Filing frequency
- Revenue this year
- Threshold status

### 3.4 Tax Exemptions

**Route**: `/tax/exemptions`
**Required Role**: `tax-read` (view), `tax-write` (manage)

**Exemption Certificate Management**:
| Field | Description |
|-------|-------------|
| Customer | Customer name |
| State | Exempt state |
| Certificate # | Exemption certificate ID |
| Type | Resale, Government, Non-profit |
| Valid From | Start date |
| Expires | Expiration date |
| Status | Valid, Expired, Pending |
| Document | Uploaded certificate |

**Certificate Actions**:
- Upload new certificate
- Request from customer
- Renew expiring certificates
- Archive expired certificates

### 3.5 Quarterly Estimated Taxes

**Route**: `/tax/quarterly`
**Required Role**: `tax-read`

**Quarterly Estimates View**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Estimated Tax Payments - 2024                                               │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Federal (Form 1120-S estimated)                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Quarter │ Due Date   │ Estimated  │ Paid       │ Status              │ │
│  │ ────────│────────────│────────────│────────────│───────────────────── │ │
│  │ Q1      │ Apr 15     │ $45,000    │ $45,000    │ ✓ Paid              │ │
│  │ Q2      │ Jun 15     │ $52,000    │ $52,000    │ ✓ Paid              │ │
│  │ Q3      │ Sep 15     │ $58,000    │ $0         │ ⏳ Due in 14 days    │ │
│  │ Q4      │ Jan 15     │ $55,000    │ -          │ ○ Upcoming          │ │
│  │ ────────│────────────│────────────│────────────│───────────────────── │ │
│  │ TOTAL   │            │ $210,000   │ $97,000    │                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  California (Form 100-ES)                                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ [Similar table for CA estimated tax]                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Estimate Calculation Factors**:
- Prior year tax liability
- Current year projected income
- Safe harbor (110% prior year)
- Cash flow optimization

### 3.6 Annual Filings

**Route**: `/tax/annual`
**Required Role**: `tax-read`

**Filing Checklist**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Annual Tax Filing Checklist - 2024                                          │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Federal Returns                                                             │
│  ☑ Form 1120-S (S-Corp Return)           Due: Mar 15 │ Status: Filed       │
│  ☑ Schedule K-1 (Shareholder)            Due: Mar 15 │ Status: Issued      │
│                                                                              │
│  State Returns                                                               │
│  ☑ CA Form 100S                          Due: Mar 15 │ Status: Filed       │
│  ☑ CA Form 568 (LLC)                     Due: Mar 15 │ Status: Filed       │
│  ☐ TX Franchise Tax                      Due: May 15 │ Status: In Progress │
│  ☐ NY Form CT-3-S                        Due: Mar 15 │ Status: Not Started │
│                                                                              │
│  Information Returns                                                         │
│  ☑ Form 1099-NEC (Contractors)           Due: Jan 31 │ Status: Filed       │
│  ☑ Form W-2 (Employees)                  Due: Jan 31 │ Status: Filed       │
│                                                                              │
│  Sales Tax Annual                                                            │
│  ☐ CA Annual Reconciliation              Due: Apr 15 │ Status: Pending     │
│                                                                              │
│  Overall Progress: 6 of 10 complete (60%)                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Filing Detail Modal**:
- Filing type and form
- Due date (original and extended)
- Required documents
- Preparer notes
- Submission confirmation
- Amendment history

### 3.7 State Registrations

**Route**: `/tax/registrations`
**Required Role**: `tax-read`

**Registration Tracker**:
| State | Sales Tax ID | Filing Freq | Last Filed | Next Due | Status |
|-------|--------------|-------------|------------|----------|--------|
| CA | 123-456-789 | Quarterly | Dec 31 | Mar 31 | Current |
| NY | 98-7654321 | Monthly | Jan 31 | Feb 28 | Due Soon |
| TX | 32-123456-7 | Quarterly | Dec 31 | Apr 30 | Current |

**Registration Actions** (tax-write):
- Add new state registration
- Update registration details
- Close registration (no longer nexus)
- Request extension

### 3.8 Tax Liability Dashboard

**Route**: `/tax/liability`
**Required Role**: `tax-read`

**Current Liabilities**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Tax Liabilities Summary                                                     │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Accrued Tax Liabilities (Balance Sheet)                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Sales Tax Payable                                    $42,500.00        │ │
│  │ Payroll Tax Payable                                  $28,750.00        │ │
│  │ Income Tax Payable (Estimated)                       $58,000.00        │ │
│  │ ────────────────────────────────────────────────────────────────────── │ │
│  │ TOTAL TAX LIABILITY                                 $129,250.00        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Upcoming Payments (30 days)                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Feb 28  │ NY Sales Tax (January)                     │ $8,500.00       │ │
│  │ Mar 15  │ CA Sales Tax (Q4)                          │ $18,250.00      │ │
│  │ Mar 15  │ Federal Estimated (Q1)                     │ $55,000.00      │ │
│  │ ────────────────────────────────────────────────────────────────────── │ │
│  │ TOTAL DUE                                           │ $81,750.00       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.9 Audit Trail

**Route**: `/tax/audit`
**Required Role**: `tax-read`

**Audit Log Features**:
- All tax calculations logged
- Filing submissions tracked
- Rate changes recorded
- Exemption certificate usage
- User actions logged

**Report Types**:
- Transaction detail by period
- Exemption usage report
- Rate history
- Filing history
- Amendment history

---

## 4. AI Query Integration

**Route**: `/tax/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "What's the sales tax rate in Austin, TX?" | `get-tax-rate` | Rate breakdown |
| "Which states do we have nexus in?" | `list-nexus-states` | State list |
| "Show upcoming tax deadlines" | `list-deadlines` | Deadline table |
| "How much sales tax did we collect in January?" | `get-tax-summary` | Summary with breakdown |
| "File the Q1 California sales tax return" | `file-return` | `pending_confirmation` |

### 4.2 Tax Research Queries

```typescript
// Query: "Is SaaS taxable in Texas?"
{
  status: 'success',
  data: {
    state: 'TX',
    productType: 'SaaS',
    taxable: false,
    details: 'Texas does not tax SaaS (software as a service) or cloud computing services. Only tangible personal property and certain services are taxable.',
    source: 'Texas Tax Code Section 151.0101',
    lastUpdated: '2024-01-01'
  }
}
```

### 4.3 Write Operations

```typescript
// Query: "Mark Q4 California sales tax as filed"
{
  status: 'pending_confirmation',
  confirmationId: 'conf-123',
  message: `Record California Q4 Sales Tax Filing?

State: California
Period: Q4 2024 (Oct 1 - Dec 31)
Tax Due: $18,250.00
Payment Method: ACH

This will:
1. Mark the return as filed
2. Record the payment
3. Update the liability account
4. Set next due date to Q1 2025

Confirmation number required after approval.`,
  confirmationData: { state: 'CA', period: 'Q4-2024', amount: 18250 }
}
```

---

## 5. MCP Tool Requirements

### 5.1 New MCP Server: mcp-tax (Port 3107)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `get-tax-rate` | Look up tax rate | `address` or `city`, `state`, `zip` |
| `get-saas-taxability` | Check if SaaS taxable | `state` |
| `list-nexus-states` | Get nexus status | `year?` |
| `get-nexus-detail` | State nexus detail | `state` |
| `update-nexus-status` | Update registration | `state`, `status`, `registration_id?` |
| `list-exemptions` | Get exemption certs | `customer_id?`, `state?`, `status?` |
| `add-exemption` | Add certificate | `customer_id`, `state`, `certificate_data` |
| `list-deadlines` | Get upcoming deadlines | `days?`, `type?` |
| `get-quarterly-estimates` | Get estimate data | `year`, `type?` |
| `record-estimated-payment` | Record payment | `year`, `quarter`, `type`, `amount` |
| `list-annual-filings` | Get filing checklist | `year` |
| `update-filing-status` | Update filing status | `filing_id`, `status`, `confirmation?` |
| `get-tax-summary` | Tax collected/paid | `period_start`, `period_end`, `type?` |
| `get-liability-summary` | Current liabilities | - |
| `list-registrations` | State registrations | `status?` |
| `get-audit-log` | Audit trail | `from?`, `to?`, `type?` |
| `file-return` | File tax return | `state`, `period`, `return_data` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From Tax | To App | Use Case |
|----------|--------|----------|
| Sales Tax Collected | Finance | Revenue reconciliation |
| Tax Liability | Finance | Balance sheet |
| 1099 Data | Payroll | Contractor payments |
| Nexus States | HR | Employee locations |

### 6.2 Inbound Links

| From App | To Tax | Use Case |
|----------|--------|----------|
| Finance (invoice) | Calculate tax | Tax on each sale |
| Payroll (run) | Employer taxes | Payroll tax liabilities |
| Sales (customer) | Exemption lookup | Tax-exempt sales |

---

## 7. User Scenarios

### Scenario 1: Monthly Sales Tax Filing

1. Tax Admin opens Tax App
2. Sees "NY Sales Tax due in 5 days" alert
3. Navigates to State Registrations
4. Opens NY detail, reviews transactions
5. Clicks "Prepare Return"
6. Reviews calculated tax
7. Submits via state portal
8. Records confirmation in app
9. Updates filing status

### Scenario 2: New State Nexus

1. Executive asks about Texas nexus
2. Tax Admin uses AI Query: "Do we have nexus in Texas?"
3. Response: "Approaching threshold - $95K of $100K"
4. Admin opens Nexus Map
5. Reviews TX revenue detail
6. Begins state registration process
7. Updates nexus status to "Pending Registration"

### Scenario 3: Exemption Certificate Request

1. Sales notifies Tax of new tax-exempt customer
2. Tax Admin opens Exemptions
3. Creates new exemption record
4. System sends certificate request to customer
5. Customer uploads certificate
6. Admin reviews and approves
7. Future invoices auto-apply exemption

### Scenario 4: Quarterly Estimate Payment

1. Tax Admin opens Quarterly Estimates
2. Reviews Q3 estimate ($58,000)
3. Verifies cash available (links to Finance)
4. Initiates payment via EFTPS
5. Records payment in app via AI Query
6. Confirms via Approval Card
7. Liability reduced, next quarter scheduled

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Dashboard with metrics and alerts
- [ ] Tax rate lookup with address validation
- [ ] Nexus tracking with threshold warnings
- [ ] Exemption certificate management
- [ ] Quarterly estimate tracking
- [ ] Annual filing checklist
- [ ] State registration management
- [ ] Audit trail reporting

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Tax research queries return accurate data
- [ ] Filing actions trigger Approval Card
- [ ] Multi-state queries handled correctly

### 8.3 RBAC Compliance
- [ ] tax-read can only view
- [ ] tax-write required for filings
- [ ] Finance users see liability data
- [ ] No client-side authorization logic

### 8.4 Performance
- [ ] Tax rate lookup <500ms
- [ ] Dashboard loads <2s
- [ ] Audit reports generate <10s

### 8.5 Compliance
- [ ] Tax rates current for all states
- [ ] Nexus thresholds match state laws
- [ ] Filing deadlines accurate
- [ ] Audit trail complete and immutable

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial Tax app specification |
