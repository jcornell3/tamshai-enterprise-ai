# Gusto Payroll Validation & Error Handling Patterns

**Research Date**: February 2, 2026
**Sources**: Gusto Embedded API Documentation, Gusto Help Center

---

## Overview

Gusto is recognized as one of the most intuitive payroll platforms (4.7/5 satisfaction rating). This document captures their validation and error handling patterns for implementation in the Tamshai Payroll module.

---

## Validation Framework

### Two-Tier Validation Architecture

Gusto distinguishes between:

1. **Payroll Blockers** - Hard stops that prevent payroll submission
2. **Payroll Warnings** - Issues that allow submission but require attention

### Validation Categories

| Category | Type | Description | Example |
|----------|------|-------------|---------|
| Data Validation | Blocker | Malformed data formats | Invalid SSN, bad date format |
| Business Logic | Blocker | Rule violations | Insufficient funds, locked period |
| Infrastructure | Warning | System issues | Rate limits, timeouts |
| Compliance | Blocker | Regulatory violations | Missing tax registration |

### Pre-Submission Requirements

Before payroll can be submitted, the system validates:

1. **Employee Data Completeness**
   - Personal details (name, SSN, address)
   - Compensation rates (salary/hourly, pay frequency)
   - Tax withholding preferences (W-4 info)
   - Direct deposit information

2. **Company Configuration**
   - Bank account verified and linked
   - Tax registrations complete
   - Pay schedule configured

3. **Timing Compliance**
   - ACH processing windows respected
   - **4 Business Day Rule**: Payroll must be submitted 4 business days before check date
   - Daily cutoff: 4 PM PST for same-day processing

---

## Error Presentation Patterns

### Pre-Flight Check UI

```
┌─────────────────────────────────────────────────────────────┐
│ 🚨 PAYROLL BLOCKERS (2 issues)                    [Fix All] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ❌ Missing bank account for direct deposit                  │
│    Employee: John Smith                                     │
│    [Add Bank Account →]                                     │
│                                                             │
│ ❌ Invalid SSN format                                       │
│    Employee: Jane Doe (SSN: 123-45-678X)                   │
│    [Edit Employee →]                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ WARNINGS (1 issue)                              [Dismiss] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ⚠️ Unusually high overtime hours                            │
│    Employee: Bob Wilson (45 OT hours)                       │
│    [Review →]                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Error Severity Visual Indicators

| Severity | Icon | Color | Action |
|----------|------|-------|--------|
| Blocker | ❌ | Red (#DC2626) | Must fix before submit |
| Warning | ⚠️ | Amber (#F59E0B) | Can proceed, recommend review |
| Info | ℹ️ | Blue (#3B82F6) | Informational only |

### Field-Level Error Highlighting

```
┌─────────────────────────────────────────────────────────────┐
│ Employee Information                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ First Name                    Last Name                     │
│ ┌─────────────────────┐      ┌─────────────────────┐       │
│ │ John                │      │ Smith               │       │
│ └─────────────────────┘      └─────────────────────┘       │
│                                                             │
│ Social Security Number                                      │
│ ┌─────────────────────┐  ← Red border on invalid field     │
│ │ 123-45-678X         │                                    │
│ └─────────────────────┘                                    │
│ ❌ SSN must be 9 digits in format XXX-XX-XXXX              │
│                                                             │
│ Email Address                                               │
│ ┌─────────────────────┐                                    │
│ │ john.smith@         │                                    │
│ └─────────────────────┘                                    │
│ ❌ Please enter a valid email address                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Summary Error Panel

```
┌─────────────────────────────────────────────────────────────┐
│ PAYROLL SUMMARY                           Pay Date: Feb 15  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│ │ 12          │  │ 2           │  │ 1           │          │
│ │ Employees   │  │ ❌ Blockers  │  │ ⚠️ Warnings │          │
│ └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                             │
│ Total Gross Pay:     $45,678.90                            │
│ Total Deductions:    -$12,345.67                           │
│ Total Employer Tax:  -$3,456.78                            │
│ ─────────────────────────────────                          │
│ Total Net Pay:       $29,876.45                            │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ ⚠️ Cannot submit payroll until all blockers resolved  │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [Review Issues]              [Submit Payroll] (disabled)   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Guided Resolution Flow

### "Fix Issues" Step-by-Step Pattern

```
Step 1 of 2: Fix Employee Data Issues
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────┐
│ Issue: Invalid SSN for Jane Doe                             │
│                                                             │
│ Current Value: 123-45-678X                                  │
│ Problem: SSN contains non-numeric characters                │
│                                                             │
│ Social Security Number                                      │
│ ┌─────────────────────────────────────┐                    │
│ │ 123-45-6789                         │                    │
│ └─────────────────────────────────────┘                    │
│ ✓ Valid SSN format                                          │
│                                                             │
│ [Skip for Now]    [Previous]    [Save & Continue →]        │
└─────────────────────────────────────────────────────────────┘
```

### Resolution Workflow States

```typescript
type ResolutionState =
  | 'pending'      // Not yet addressed
  | 'in_progress'  // User is fixing
  | 'resolved'     // Fixed successfully
  | 'skipped'      // User chose to skip (warnings only)
  | 'deferred';    // Will fix later (blockers cannot defer)
```

---

## API Error Response Schema

### LLM-Friendly Error Format

```typescript
interface PayrollValidationResponse {
  status: 'valid' | 'invalid' | 'warnings';
  canSubmit: boolean;

  blockers: ValidationError[];
  warnings: ValidationError[];

  summary: {
    totalEmployees: number;
    affectedEmployees: number;
    blockerCount: number;
    warningCount: number;
  };
}

interface ValidationError {
  code: string;
  severity: 'blocker' | 'warning';
  message: string;
  suggestedAction: string;

  // Context
  employeeId?: string;
  employeeName?: string;
  field?: string;
  currentValue?: unknown;

  // Resolution
  resolutionUrl?: string;
  quickFixAvailable?: boolean;
}
```

### Example Error Response

```json
{
  "status": "invalid",
  "canSubmit": false,
  "blockers": [
    {
      "code": "INVALID_SSN",
      "severity": "blocker",
      "message": "SSN must be 9 digits in format XXX-XX-XXXX",
      "suggestedAction": "Update employee SSN in Employee Profile > Personal Information",
      "employeeId": "emp_123",
      "employeeName": "Jane Doe",
      "field": "ssn",
      "currentValue": "123-45-678X",
      "resolutionUrl": "/employees/emp_123/edit",
      "quickFixAvailable": true
    }
  ],
  "warnings": [
    {
      "code": "HIGH_OVERTIME",
      "severity": "warning",
      "message": "Employee has unusually high overtime (45 hours)",
      "suggestedAction": "Verify overtime hours are correct before submission",
      "employeeId": "emp_456",
      "employeeName": "Bob Wilson",
      "field": "overtime_hours",
      "currentValue": 45
    }
  ],
  "summary": {
    "totalEmployees": 12,
    "affectedEmployees": 2,
    "blockerCount": 1,
    "warningCount": 1
  }
}
```

---

## Timing & Deadline UI

### Payroll Deadline Indicator

```
┌─────────────────────────────────────────────────────────────┐
│ ⏰ PAYROLL DEADLINE                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Pay Date: Friday, Feb 15                                    │
│ Deadline: Monday, Feb 11 @ 4:00 PM PST                      │
│                                                             │
│ Time Remaining: 2 days, 6 hours, 30 minutes                 │
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  45%            │
│                                                             │
│ ⚠️ Submit by deadline to ensure on-time payment             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Late Submission Warning

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ LATE PAYROLL WARNING                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Original Pay Date: Friday, Feb 15                           │
│ Revised Pay Date: Tuesday, Feb 19                           │
│                                                             │
│ Submitting now will delay employee payments by 2 business   │
│ days due to ACH processing requirements.                    │
│                                                             │
│ [Cancel]                        [Proceed with Late Payment] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Recommendations for Tamshai

### Validation Service Interface

```typescript
interface PayrollValidationService {
  // Pre-flight validation
  validatePayRun(payRunId: string): Promise<PayrollValidationResponse>;

  // Individual employee validation
  validateEmployee(employeeId: string): Promise<EmployeeValidationResult>;

  // Timing validation
  validateDeadline(payDate: Date): DeadlineValidation;

  // Quick fixes
  applyQuickFix(errorCode: string, params: Record<string, unknown>): Promise<void>;
}
```

### UI Component Hierarchy

```
PayRunWizard
├── PayRunSummaryCard
│   ├── EmployeeCount
│   ├── BlockerCount (red badge)
│   └── WarningCount (amber badge)
├── ValidationPanel
│   ├── BlockerSection
│   │   └── ValidationErrorCard (for each blocker)
│   └── WarningSection
│       └── ValidationErrorCard (for each warning)
├── DeadlineIndicator
│   ├── PayDateDisplay
│   ├── DeadlineCountdown
│   └── ProgressBar
└── ActionBar
    ├── ReviewIssuesButton
    └── SubmitButton (disabled if blockers)
```

### Test Scenarios

1. **Happy Path**: All validations pass → Submit enabled
2. **Blockers Present**: Submit disabled, "Fix Issues" prominent
3. **Warnings Only**: Submit enabled with confirmation prompt
4. **Late Submission**: Additional warning modal before submit
5. **Quick Fix Flow**: Single-click resolution for common issues

---

## References

- [Gusto Embedded Payroll Documentation](https://docs.gusto.com/embedded-payroll/docs/payroll-fundamentals)
- [Gusto Payroll Processing Overview](https://support.gusto.com/article/186733245100000/Processing-payroll-overview)
- [Gusto Core Concepts](https://embedded.gusto.com/blog/core-concepts-payroll-apis/)
- [Gusto HR and Payroll Software Review 2026](https://thecfoclub.com/tools/gusto-review/)
