# Payroll Application Functional Specification

## 1. Overview

**Application**: Tamshai Payroll App
**Port**: 4005 (NEW)
**Style Reference**: Gusto / Zoho Payroll
**Primary Users**: Payroll Administrators, HR, Employees (Self-Service)

The Payroll App provides comprehensive payroll management for a US-based remote workforce. All employees are W-2 workers or 1099 contractors distributed across multiple states, with California being the primary location.

---

## 2. Business Context

### 2.1 Company Profile

- **Employee Count**: ~54 employees across multiple US states
- **Primary State**: California (50% of workforce)
- **Pay Frequency**: Bi-weekly (26 pay periods/year)
- **Pay Day**: Every other Friday
- **Contractor Support**: 1099 contractors for project work

### 2.2 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `payroll-read` | Payroll Viewer | View pay runs, own pay stubs |
| `payroll-write` | Payroll Admin | All read + process payroll, manage deductions |
| `executive` | Executive | All read across departments |
| `user` | Employee | Self-service: own pay stubs, W-4, direct deposit |

### 2.3 State Tax Considerations

All employees are US-based remote workers. Tax withholding varies by state:

| State | Employees | Income Tax | Notes |
|-------|-----------|------------|-------|
| California (CA) | 27 | Yes | Complex rules, SDI required |
| Texas (TX) | 10 | No | No state income tax |
| New York (NY) | 5 | Yes | NYC local tax possible |
| Florida (FL) | 3 | No | No state income tax |
| Colorado (CO) | 3 | Yes | Flat rate |
| Other | 6 | Varies | WA, AZ, OR, etc. |

---

## 2.4 PRIMARY FLOW: Run Payroll Wizard

**Hero Flow**: Multi-step payroll processing with preview and CFO approval

**Complexity**: Multi-step wizard with validation, preview, and confirmation

**Pattern Reference**: `.specify/specs/005-sample-apps/WIZARD_PATTERN.md`, `.specify/research/gusto-validation-patterns.md`

**Steps**:
1. **Pay Period Selection**: Select pay period, payroll type (Regular, Bonus, Off-cycle)
2. **Hours & Earnings**: Review salary employees, import timesheets, add bonuses/adjustments
3. **Deductions Review**: Review tax withholdings, benefits, 401(k), garnishments
4. **Preview & Approval**: Full payroll summary with totals, confirmation checkbox

**Pre-Flight Validation (Gusto Pattern)**:
- [ ] All employee profiles complete
- [ ] Bank accounts verified for direct deposit
- [ ] Tax registrations current
- [ ] No employees with missing W-4 data

**Acceptance Criteria**:
- [ ] Pre-flight blockers prevent proceeding until resolved
- [ ] Pre-flight warnings allow proceeding with acknowledgment
- [ ] Each employee row expandable to show detail breakdown
- [ ] Overtime hours auto-calculated from timesheets
- [ ] Tax calculations match W-4 elections and state rates
- [ ] Final confirmation requires checkbox acknowledgment
- [ ] Approved payroll cannot be edited

**Test Scenarios**:
```typescript
test.describe('Run Payroll Wizard', () => {
  test('pre-flight check blocks on missing employee data', async ({ page }) => {
    // Mock employee with missing SSN
    // Verify blocker displayed
    // Verify "Next" button disabled
    // Verify "Fix Issues" link works
  });

  test('wizard shows correct totals in preview step', async ({ page }) => {
    // Complete steps 1-3
    // Verify gross pay, deductions, net pay totals
    // Verify individual employee breakdown matches
  });

  test('requires confirmation checkbox before submit', async ({ page }) => {
    // Navigate to step 4
    // Verify "Submit" disabled without checkbox
    // Check checkbox
    // Verify "Submit" enabled
  });

  test('approved payroll triggers finance journal entry', async ({ page }) => {
    // Complete full wizard and submit
    // Verify confirmation dialog
    // Verify payroll status changes to "Approved"
  });
});
```

---

## 3. Feature Specifications

### 3.1 Dashboard

**Route**: `/payroll`
**Required Role**: `payroll-read` or `executive`

**Key Metrics Cards**:

| Metric | Description | Visual |
|--------|-------------|--------|
| Next Pay Date | Date of next payroll | Date with countdown |
| Total Payroll | Gross wages for period | Currency |
| Employees Paid | Active employees this run | Count |
| YTD Payroll | Year-to-date gross | Currency with trend |

**Charts**:
1. **Payroll by Month** - 12-month bar chart
2. **Tax Breakdown** - Pie chart (Federal, State, FICA)
3. **Department Distribution** - Bar chart of wages by dept
4. **State Distribution** - Map or bar chart by state

**Quick Actions**:
- Run Payroll
- View Pending Items
- Generate Reports

### 3.2 Pay Runs

**Route**: `/payroll/pay-runs`
**Required Role**: `payroll-read`

**Pay Run List**:
| Column | Description |
|--------|-------------|
| Pay Period | Date range (e.g., Jan 1-14, 2024) |
| Pay Date | Check date |
| Employees | Count paid |
| Gross Pay | Total gross wages |
| Net Pay | Total net (after deductions) |
| Status | Draft, Processing, Completed, Cancelled |
| Actions | View, Process, Export |

**Pay Run Statuses**:
| Status | Description |
|--------|-------------|
| Draft | Pay run created, not yet processed |
| Review | Pending admin review |
| Approved | Ready for processing |
| Processing | Being sent to bank |
| Completed | All payments issued |
| Cancelled | Pay run cancelled |

### 3.3 Process Payroll Wizard

**Route**: `/payroll/pay-runs/new`
**Required Role**: `payroll-write`

**Step 1: Pay Period Selection**
- Select pay period dates
- Choose payroll type (Regular, Bonus, Off-cycle)
- Review employee count

**Step 2: Hours & Earnings**
- Import timesheet data (if applicable)
- Review salary employees (automatic)
- Add bonuses, commissions, adjustments
- Handle overtime calculations

**Step 3: Deductions Review**
- Federal tax withholding (W-4 based)
- State tax withholding (by employee state)
- FICA (Social Security + Medicare)
- Benefits deductions (health, dental, vision)
- 401(k) contributions
- Garnishments

**Step 4: Preview & Approval**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Payroll Summary - Pay Period: Jan 1-14, 2024                                │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Employees: 54              Pay Date: January 19, 2024                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ GROSS PAY                                          $425,000.00         │ │
│  │ ────────────────────────────────────────────────────────────────────── │ │
│  │ Federal Tax                                         -$68,000.00        │ │
│  │ State Tax (CA, NY, etc.)                            -$25,500.00        │ │
│  │ Social Security (6.2%)                              -$26,350.00        │ │
│  │ Medicare (1.45%)                                     -$6,162.50        │ │
│  │ Benefits                                            -$21,600.00        │ │
│  │ 401(k) Employee                                     -$17,000.00        │ │
│  │ ────────────────────────────────────────────────────────────────────── │ │
│  │ NET PAY                                            $260,387.50         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [Cancel]                                          [Submit for Approval]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Approval Flow** (triggers `pending_confirmation`):
```typescript
{
  status: 'pending_confirmation',
  message: `Approve Payroll for Pay Period Jan 1-14, 2024?

Employees: 54
Gross Pay: $425,000.00
Net Pay: $260,387.50
Pay Date: January 19, 2024

This will initiate direct deposit transfers totaling $260,387.50.

This action cannot be undone.`,
  confirmationData: { payRunId, totalNet, employeeCount }
}
```

### 3.4 Pay Stubs

**Route**: `/payroll/pay-stubs`
**Required Role**: `payroll-read` (own), `payroll-write` (all)

**Employee Self-Service** (`/payroll/me/pay-stubs`):
- View own pay stubs
- Download PDF
- YTD summary

**Pay Stub Detail**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  TAMSHAI CORP                                    PAY STUB                    │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Employee: Marcus Johnson                   Pay Period: Jan 1-14, 2024       │
│  Employee ID: EMP-0042                      Pay Date: January 19, 2024       │
│  Department: Engineering                    Check #: Direct Deposit          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ EARNINGS                        Hours       Rate         Amount      │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ Regular Salary                    80     $45.67       $3,653.85     │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ GROSS PAY                                             $3,653.85     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ DEDUCTIONS                      Current      YTD                     │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ Federal Tax                     $584.62    $584.62                   │   │
│  │ CA State Tax                    $319.47    $319.47                   │   │
│  │ Social Security                 $226.54    $226.54                   │   │
│  │ Medicare                         $52.98     $52.98                   │   │
│  │ CA SDI                           $36.54     $36.54                   │   │
│  │ Health Insurance                $150.00    $150.00                   │   │
│  │ 401(k)                          $182.69    $182.69                   │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ TOTAL DEDUCTIONS              $1,552.84  $1,552.84                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ NET PAY                                   $2,101.01                  │   │
│  │ ───────────────────────────────────────────────────────────────────── │   │
│  │ YTD GROSS:    $3,653.85     YTD NET:    $2,101.01                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Tax Withholdings

**Route**: `/payroll/tax`
**Required Role**: `payroll-write`

**Employee Tax Settings**:
- Federal W-4 elections
- State withholding forms
- Local tax settings (where applicable)
- Additional withholding amounts

**W-4 Configuration**:
| Field | Description |
|-------|-------------|
| Filing Status | Single, Married Filing Jointly, Head of Household |
| Multiple Jobs | Step 2 checkbox |
| Dependents | Number and credit amount |
| Other Income | Step 4(a) |
| Deductions | Step 4(b) |
| Extra Withholding | Step 4(c) |

**State Tax Forms**:
| State | Form | Key Fields |
|-------|------|------------|
| California | DE 4 | Filing status, allowances, additional |
| New York | IT-2104 | Filing status, allowances |
| Other | Varies | State-specific |

### 3.6 Benefits Deductions

**Route**: `/payroll/benefits`
**Required Role**: `payroll-read` (own), `payroll-write` (all)

**Benefit Types**:
| Benefit | Type | Pre-Tax | Employer Match |
|---------|------|---------|----------------|
| Health Insurance | Medical | Yes | Yes |
| Dental Insurance | Medical | Yes | Yes |
| Vision Insurance | Medical | Yes | Yes |
| 401(k) | Retirement | Yes | Up to 4% |
| HSA | Medical | Yes | Optional |
| FSA | Medical | Yes | No |
| Life Insurance | Insurance | No | Employer-paid |
| Disability | Insurance | No | Employer-paid |

**Employee Self-Service**:
- View current elections
- View employer contributions
- Annual enrollment updates (links to HR)

### 3.7 Direct Deposit

**Route**: `/payroll/direct-deposit`
**Required Role**: `user` (own), `payroll-write` (all)

**Bank Account Setup**:
- Bank name
- Routing number (validated)
- Account number (masked after entry)
- Account type (Checking/Savings)
- Allocation (% or fixed amount)

**Multiple Accounts**:
- Primary account (remainder)
- Secondary accounts (fixed amounts)

**Update Flow** (triggers `pending_confirmation`):
```typescript
{
  status: 'pending_confirmation',
  message: `Update direct deposit for Marcus Johnson?

Action: Replace primary bank account
New Bank: Chase Bank (****4567)
Account Type: Checking
Allocation: 100%

Changes take effect for the next pay period.`,
  confirmationData: { employeeId, bankAccountId }
}
```

### 3.8 1099 Contractor Management

**Route**: `/payroll/1099`
**Required Role**: `payroll-write`

**Contractor List**:
| Column | Description |
|--------|-------------|
| Name | Contractor name |
| Company | Business name (if applicable) |
| Tax ID | EIN or SSN (masked) |
| YTD Payments | Total paid this year |
| Status | Active, Inactive |
| 1099 Status | Pending, Generated, Filed |

**Contractor Payments**:
- Record individual payments
- Link to invoices (if applicable)
- No tax withholding (contractor responsibility)

**1099-NEC Generation**:
- Threshold: $600+ in calendar year
- Generate 1099-NEC forms
- E-file or print for mailing
- Send copies to contractors

### 3.9 Pay Schedules

**Route**: `/payroll/schedules`
**Required Role**: `payroll-write`

**Schedule Configuration**:
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Pay Schedule: Bi-Weekly                                                     │
│  ════════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Frequency: Every 2 weeks                                                    │
│  Pay Day: Friday                                                             │
│  First Pay Date: January 5, 2024                                             │
│                                                                              │
│  2024 Pay Dates:                                                             │
│  Jan 5, Jan 19, Feb 2, Feb 16, Mar 1, Mar 15, Mar 29, ...                   │
│                                                                              │
│  Holiday Adjustments:                                                        │
│  - If pay date falls on holiday, pay day before                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. AI Query Integration

**Route**: `/payroll/query`
**Component**: `<SSEQueryClient />`

### 4.1 Sample Queries

| Query | MCP Tools Used | Response |
|-------|----------------|----------|
| "Show my last pay stub" | `get-pay-stub` | Pay stub detail |
| "What's our total payroll this month?" | `get-payroll-summary` | Summary with breakdown |
| "List employees in California" | `list-employees-by-state` | Employee table |
| "Process the January 15th payroll" | `process-pay-run` | `pending_confirmation` |
| "Update Marcus's 401k to 10%" | `update-deduction` | `pending_confirmation` |

### 4.2 Tax Queries

```typescript
// Query: "What are the state taxes for California employees?"
{
  status: 'success',
  data: {
    state: 'CA',
    employeeCount: 27,
    components: [
      { name: 'State Income Tax', rate: 'Progressive (1-13.3%)' },
      { name: 'SDI', rate: '1.0%', maxWage: 153164 },
      { name: 'SUI', rate: 'Employer only' }
    ],
    ytdWithholding: {
      incomeTax: 245000,
      sdi: 12500
    }
  }
}
```

### 4.3 Write Operations

```typescript
// Query: "Give Marcus Johnson a $5,000 bonus"
{
  status: 'pending_confirmation',
  confirmationId: 'conf-789',
  message: `Add bonus for Marcus Johnson?

Employee: Marcus Johnson (EMP-0042)
Bonus Type: Discretionary
Amount: $5,000.00

Tax Treatment:
- Federal withholding: 22% flat rate ($1,100)
- CA state withholding: 10.23% ($511.50)
- FICA: 7.65% ($382.50)
- Estimated net: $3,006.00

This will be included in the next pay run.`,
  confirmationData: { employeeId, bonusAmount, bonusType }
}
```

---

## 5. MCP Tool Requirements

### 5.1 New MCP Server: mcp-payroll (Port 3106)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list-pay-runs` | Get pay run list | `year?`, `status?`, `cursor?` |
| `get-pay-run` | Get pay run detail | `pay_run_id` |
| `create-pay-run` | Create new pay run | `period_start`, `period_end`, `pay_date` |
| `process-pay-run` | Process/approve | `pay_run_id` |
| `list-pay-stubs` | Get pay stubs | `employee_id?`, `pay_run_id?`, `year?` |
| `get-pay-stub` | Get single pay stub | `pay_stub_id` |
| `get-employee-ytd` | YTD earnings/taxes | `employee_id`, `year?` |
| `list-deductions` | Get deduction types | - |
| `get-employee-deductions` | Get employee deductions | `employee_id` |
| `update-deduction` | Update deduction | `employee_id`, `deduction_type`, `amount` |
| `list-direct-deposits` | Get bank accounts | `employee_id` |
| `update-direct-deposit` | Update bank info | `employee_id`, `bank_data` |
| `list-contractors` | Get 1099 contractors | `status?`, `year?` |
| `add-contractor-payment` | Record payment | `contractor_id`, `amount`, `date` |
| `generate-1099` | Generate 1099-NEC | `contractor_id`, `year` |
| `get-tax-summary` | Tax withholding summary | `period`, `state?` |

---

## 6. Data Integrations

### 6.1 Cross-App Links

| From Payroll | To App | Use Case |
|--------------|--------|----------|
| Employee | HR | View employee profile |
| Pay Run | Finance | Record payroll expense |
| 401(k) Deductions | Finance | Liability tracking |
| Contractor Payment | Finance | Record expense |

### 6.2 Inbound Links

| From App | To Payroll | Use Case |
|----------|------------|----------|
| HR (new hire) | Employee Setup | New employee payroll setup |
| HR (termination) | Final Pay | Process final paycheck |
| Finance (expense) | Reimbursement | Add to next pay run |

---

## 7. User Scenarios

### Scenario 1: Processing Bi-Weekly Payroll

1. Payroll Admin opens Payroll App
2. Navigates to Pay Runs
3. Clicks "New Pay Run"
4. Selects pay period (Jan 1-14)
5. Reviews hours/earnings (auto-populated for salary)
6. Adds any bonuses or adjustments
7. Reviews deduction calculations
8. Clicks "Submit for Approval"
9. CFO approves via Approval Card
10. Pay run processes, deposits initiated

### Scenario 2: Employee Views Pay Stub

1. Employee logs into Payroll App
2. Navigates to "My Pay Stubs"
3. Views list of recent pay stubs
4. Clicks latest pay stub
5. Reviews earnings, deductions, YTD totals
6. Downloads PDF for records

### Scenario 3: Updating Direct Deposit

1. Employee logs into Payroll App
2. Navigates to "My Direct Deposit"
3. Clicks "Update Bank Account"
4. Enters new bank routing/account numbers
5. Selects account type and allocation
6. Confirms via Approval Card
7. Change effective next pay period

### Scenario 4: 1099 Year-End Processing

1. Payroll Admin opens 1099 Management
2. Reviews list of contractors with YTD payments
3. Filters for payments >= $600
4. Clicks "Generate 1099s"
5. System generates 1099-NEC forms
6. Admin reviews and approves
7. Downloads PDFs for mailing
8. E-files with IRS (TIN matching)

---

## 8. Success Criteria

### 8.1 Core Functionality
- [ ] Dashboard with payroll metrics
- [ ] Pay run creation and processing workflow
- [ ] Pay stub viewing with PDF export
- [ ] Tax withholding configuration (Federal + multi-state)
- [ ] Benefits deduction management
- [ ] Direct deposit configuration
- [ ] 1099 contractor management

### 8.2 AI Integration
- [ ] SSE streaming for all queries
- [ ] Payroll processing triggers Approval Card
- [ ] Bank account changes trigger Approval Card
- [ ] Tax calculation queries return accurate data

### 8.3 RBAC Compliance
- [ ] Employees can only see own pay stubs
- [ ] payroll-write required for processing
- [ ] No client-side authorization logic
- [ ] Salary data properly protected

### 8.4 Performance
- [ ] Pay run preview generates <5s for 100 employees
- [ ] Pay stub PDF generates <2s
- [ ] YTD calculations accurate in real-time

### 8.5 Compliance
- [ ] W-4 calculations match IRS guidelines
- [ ] State tax rates current for all states
- [ ] 1099-NEC generation meets IRS requirements
- [ ] Audit trail for all payroll changes

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial Payroll app specification |
