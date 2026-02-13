# Zoho Payroll Features & Workflow Patterns

**Research Date**: February 2, 2026
**Sources**: Zoho Payroll Documentation, Reviews, Help Center

---

## Overview

Zoho Payroll (US Edition, launched September 2025) provides comprehensive payroll management with multi-stage approval workflows, employee self-service, and compliance automation. This document captures key features for implementation in the Tamshai Payroll module.

---

## Pay Run Workflow

### Workflow Stages

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  Create    │ →  │   Review   │ →  │  Approve   │ →  │   Pay      │
│  Pay Run   │    │  Details   │    │  Payroll   │    │  Employees │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
     │                  │                 │                 │
     ▼                  ▼                 ▼                 ▼
  Draft            Processing         Approved         Completed
```

### Pay Run Creation

**Steps to Create a Pay Run**:

1. Navigate to Pay Runs module
2. Click "Create Pay Run"
3. System auto-populates:
   - Pay period dates (from schedule)
   - Employee list (active employees)
   - Base compensation (from profiles)
   - Tax calculations (automatic)

### Pay Run Information Display

| Section | Content |
|---------|---------|
| Payroll Cost | Total employer cost (wages + taxes + benefits) |
| Net Pay | Total employee take-home pay |
| Payday | Scheduled payment date |
| Employee Summary | Count and status breakdown |

### Employee-Level Adjustments

For each employee in a pay run, administrators can adjust:

- **Loss of Pay (LOP) Days**: Unpaid leave deductions
- **One-time Earnings**: Bonuses, commissions, reimbursements
- **One-time Deductions**: Garnishments, loan repayments
- **Overtime Hours**: For hourly employees

```
┌─────────────────────────────────────────────────────────────┐
│ Employee: John Smith                      [Edit Details →]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Regular Hours      40.00    Gross Pay      $3,846.15       │
│ Overtime Hours      5.00    Federal Tax     -$577.00       │
│ LOP Days            0.00    State Tax       -$192.31       │
│                            Social Security  -$238.46       │
│ Bonus             $500.00   Medicare         -$55.77       │
│                            401(k)          -$192.31       │
│                            ─────────────────────────       │
│                            Net Pay         $3,090.30       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Approval Workflow

**Role-Based Approval**:

```typescript
type PayRunPermission =
  | 'create_pay_run'      // Can initiate pay runs
  | 'edit_pay_run'        // Can modify pending pay runs
  | 'submit_for_approval' // Can submit to approvers
  | 'approve_pay_run'     // Can approve and finalize
  | 'view_pay_run';       // Read-only access

interface ApprovalFlow {
  stages: ApprovalStage[];
}

interface ApprovalStage {
  name: string;
  approvers: string[];      // User IDs or role names
  requireAll: boolean;      // All must approve vs. any one
  escalationAfter?: number; // Hours before escalation
  escalateTo?: string;
}
```

**Approval Actions**:

| Role | Available Actions |
|------|-------------------|
| Preparer | Create, Edit, Submit for Approval |
| Approver | Review, Approve, Reject |
| Admin | All actions + Override |

**Critical Warning**: Once a regular payroll is approved, it cannot be edited or deleted.

---

## Pay Schedule Configuration

### Supported Frequencies

| Frequency | Pay Periods/Year | Typical Use Case |
|-----------|------------------|------------------|
| Weekly | 52 | Hourly workers |
| Bi-weekly | 26 | Most common |
| Semi-monthly | 24 | Salaried employees |
| Monthly | 12 | Executives, contractors |
| Quarterly | 4 | Board members |

### Schedule Configuration

```typescript
interface PaySchedule {
  id: string;
  name: string;
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly';

  // For weekly/biweekly
  dayOfWeek?: number;  // 0-6 (Sunday-Saturday)

  // For semi-monthly
  firstPayday?: number;   // Day of month (1-15)
  secondPayday?: number;  // Day of month (16-31)

  // For monthly
  payDayOfMonth?: number;

  // Processing
  processingLeadDays: number;  // Days before payday to process
  directDepositLeadDays: number; // ACH lead time

  // Defaults
  defaultPayPeriodStart: Date;
  activeEmployees: number;
}
```

---

## Off-Cycle Payroll

### Use Cases for Off-Cycle Pay Runs

| Scenario | Description |
|----------|-------------|
| New Hire | Prorated pay for partial first period |
| Salary Adjustment | Retroactive pay increases |
| Missed Payment | Correcting missed regular payroll |
| Termination | Final paycheck with all due compensation |
| Bonus | One-time bonus outside regular cycle |

### Off-Cycle Process

1. **Select Type**: New hire, adjustment, termination, bonus
2. **Select Employees**: Choose affected individuals
3. **Enter Amounts**: Earnings, deductions, taxes
4. **Review**: Verify calculations
5. **Submit**: Process immediately or schedule

---

## Employee Self-Service Portal

### Portal Features

| Feature | Description |
|---------|-------------|
| View Payslips | Access current and historical pay stubs |
| Download Tax Forms | W-2, 1099, state forms |
| Update Personal Info | Address, emergency contacts |
| Modify Tax Withholding | Update W-4 elections |
| Direct Deposit | Manage bank accounts |
| Time Off Requests | Submit and track PTO |
| View Benefits | See benefit deductions and contributions |

### Mobile App (Employee Portal)

**Available Actions**:
- View paystubs on mobile
- Access pay history
- Download documents
- Request time off
- Update personal details
- View benefits summary

### Self-Service UI Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ 🏠 Employee Portal                      Welcome, John Smith │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  💰 PAY      │  │  📄 TAX      │  │  🎯 BENEFITS │      │
│  │  View Stubs  │  │  Forms       │  │  Summary     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  🏖️ TIME OFF │  │  👤 PROFILE  │  │  🏦 DIRECT   │      │
│  │  Requests    │  │  Settings    │  │  Deposit     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ RECENT PAYSTUBS                                             │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Jan 31, 2026    $3,090.30 Net Pay    [View] [Download] │ │
│ │ Jan 15, 2026    $3,090.30 Net Pay    [View] [Download] │ │
│ │ Dec 31, 2025    $3,590.30 Net Pay    [View] [Download] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Tax Filing & Compliance

### Automated Tax Handling

| Tax Type | Automation Level |
|----------|------------------|
| Federal Income Tax | Fully automated calculation, withholding |
| State Income Tax | Automated for supported states (21 as of 2026) |
| Social Security | Automatic 6.2% employee, 6.2% employer |
| Medicare | Automatic 1.45% employee, 1.45% employer |
| FUTA | Automatic employer calculation |
| State Unemployment | State-dependent, many automated |

### Tax Forms Generated

| Form | Purpose | Frequency |
|------|---------|-----------|
| W-2 | Employee wage statement | Annual |
| 1099-NEC | Contractor payments | Annual |
| 940 | FUTA annual summary | Annual |
| 941 | Quarterly tax return | Quarterly |
| 944 | Annual tax return (small employers) | Annual |
| State forms | Various state requirements | Varies |

### Tax Filing Status Tracking

```typescript
interface TaxFilingStatus {
  formType: string;
  jurisdiction: 'federal' | 'state' | 'local';
  period: {
    type: 'monthly' | 'quarterly' | 'annual';
    year: number;
    quarter?: number;
    month?: number;
  };

  status: 'not_due' | 'due' | 'pending' | 'filed' | 'accepted' | 'rejected';

  amounts: {
    taxLiability: number;
    taxDeposited: number;
    balance: number;
  };

  deadlines: {
    filingDeadline: Date;
    paymentDeadline: Date;
  };

  filing?: {
    filedAt: Date;
    confirmationNumber: string;
    filedBy: string;
  };
}
```

### Compliance Checklist UI

```
┌─────────────────────────────────────────────────────────────┐
│ ✓ COMPLIANCE CHECKLIST                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Federal Setup                                               │
│ ✅ EIN registered                                           │
│ ✅ Federal tax account linked                               │
│ ✅ 941 deposit schedule configured                          │
│                                                             │
│ State Setup (California)                                    │
│ ✅ State EIN registered                                     │
│ ✅ State tax account linked                                 │
│ ✅ SDI configured                                           │
│ ⚠️ SUI rate needs verification (using default 3.4%)        │
│                                                             │
│ Bank & Payment                                              │
│ ✅ Company bank account verified                            │
│ ✅ Direct deposit authorization signed                      │
│ ✅ Tax payment authorization signed                         │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 🎉 Ready to run payroll!                    [Start Pay Run] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Integrations

### Zoho Ecosystem

| Integration | Data Flow |
|-------------|-----------|
| Zoho People | Employee data sync (bidirectional) |
| Zoho Expense | Expense reimbursements → Payroll |
| Zoho Books | Journal entries auto-posted |

### Current Limitations

- No integrations outside Zoho ecosystem (as of 2026)
- Manual filing required for some state/local taxes
- State compliance limited to 21 states

---

## Implementation Recommendations for Tamshai

### Pay Run State Machine

```typescript
type PayRunStatus =
  | 'draft'           // Initial creation, editable
  | 'calculating'     // System processing
  | 'pending_review'  // Ready for review
  | 'pending_approval'// Submitted, awaiting approval
  | 'approved'        // Approved, queued for payment
  | 'processing'      // Payment processing
  | 'payment_due'     // Awaiting manual payment confirmation
  | 'completed'       // Fully paid
  | 'cancelled';      // Cancelled before approval

// Valid transitions
const validTransitions: Record<PayRunStatus, PayRunStatus[]> = {
  draft: ['calculating', 'cancelled'],
  calculating: ['pending_review', 'draft'],
  pending_review: ['pending_approval', 'draft'],
  pending_approval: ['approved', 'pending_review'],
  approved: ['processing', 'pending_approval'],
  processing: ['completed', 'payment_due'],
  payment_due: ['completed'],
  completed: [],
  cancelled: []
};
```

### UI Components to Build

1. **PayRunWizard** - Multi-step pay run creation
2. **PayRunSummaryCard** - Overview with key metrics
3. **EmployeePayDetail** - Individual employee breakdown
4. **ApprovalWorkflow** - Submit/approve/reject flow
5. **ComplianceChecklist** - Setup verification
6. **TaxFilingTracker** - Filing status dashboard
7. **EmployeePortal** - Self-service dashboard

### Test Scenarios

1. **Create Weekly Pay Run**: 10 hourly employees
2. **Create Semi-Monthly Pay Run**: 5 salaried employees
3. **Off-Cycle Bonus**: Single employee bonus
4. **Termination Pay Run**: Final paycheck with PTO payout
5. **Multi-State Payroll**: Employees in CA, TX, NY
6. **Approval Flow**: Preparer → Approver → Admin escalation
7. **Self-Service**: Employee views paystub, updates W-4

---

## References

- [Zoho Payroll Pay Runs Documentation](https://www.zoho.com/us/payroll/help/employer/pay-runs/)
- [Zoho Payroll Getting Started Guide](https://www.zoho.com/us/payroll/help/employer/getting-started/)
- [Zoho Payroll Review 2026](https://peoplemanagingpeople.com/tools/zoho-payroll-review/)
- [Zoho Payroll Features](https://www.zoho.com/us/payroll/features/)
- [SelectSoftware Zoho Payroll Review](https://www.selectsoftwarereviews.com/reviews/zoho-payroll)
