# Multi-Step Wizard Pattern Specification

**Version**: 1.0
**Date**: February 2, 2026
**Reference**: Gusto, Zoho Payroll, Salesforce Lead Conversion

---

## Overview

This document defines the standardized multi-step wizard UX pattern for all Tamshai Enterprise applications. Wizards guide users through complex, multi-stage workflows with validation, review, and confirmation.

---

## 1. Component Architecture

### 1.1 Component Hierarchy

```
Wizard
├── WizardHeader
│   ├── WizardTitle
│   ├── WizardBreadcrumbs
│   └── WizardCloseButton
├── WizardContent
│   └── WizardStep (active step)
│       ├── StepHeader
│       ├── StepContent
│       └── StepValidationErrors
└── WizardFooter
    ├── CancelButton
    ├── PreviousButton
    ├── NextButton
    └── SubmitButton (final step)
```

### 1.2 Core Props

```typescript
interface WizardProps {
  steps: WizardStep[];
  initialStep?: number;
  onComplete: (data: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;

  // Optional
  title?: string;
  showBreadcrumbs?: boolean;
  allowSkip?: boolean;
  persistProgress?: boolean; // Save draft to localStorage
}

interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType;

  // Validation
  validate?: (data: Record<string, unknown>) => ValidationResult;
  isOptional?: boolean;

  // Conditional rendering
  showIf?: (data: Record<string, unknown>) => boolean;

  // Content
  component: React.ComponentType<WizardStepProps>;
}

interface WizardStepProps {
  data: Record<string, unknown>;
  updateData: (updates: Record<string, unknown>) => void;
  errors: ValidationError[];
  isActive: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}
```

---

## 2. Breadcrumb Navigation

### 2.1 Visual Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  (1) Pay Period  ───►  (2) Earnings  ───►  (3) Deductions  ───►  (4) Review │
│       ✓ Done            ● Current           ○ Pending         ○ Pending │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Step States

| State | Visual | Icon | Clickable |
|-------|--------|------|-----------|
| Completed | Filled circle, checkmark | ✓ | Yes (navigate back) |
| Current | Filled circle, step number | ● | No |
| Pending | Empty circle, step number | ○ | No (by default) |
| Error | Red circle, exclamation | ⚠ | Yes |
| Skipped | Dashed circle | ○ (dashed) | Yes |

### 2.3 Breadcrumb Component

```typescript
interface WizardBreadcrumbsProps {
  steps: WizardStep[];
  currentStep: number;
  completedSteps: Set<number>;
  errorSteps: Set<number>;
  onStepClick?: (stepIndex: number) => void;
  allowFutureNavigation?: boolean;
}
```

### 2.4 Styling

```html
<!-- Completed step -->
<div class="flex items-center">
  <div class="w-8 h-8 rounded-full bg-success-500 text-white
              flex items-center justify-center">
    <CheckIcon class="w-4 h-4" />
  </div>
  <span class="ml-2 text-sm font-medium text-secondary-900">
    Pay Period
  </span>
</div>

<!-- Current step -->
<div class="flex items-center">
  <div class="w-8 h-8 rounded-full bg-primary-500 text-white
              flex items-center justify-center font-semibold">
    2
  </div>
  <span class="ml-2 text-sm font-semibold text-primary-600">
    Earnings
  </span>
</div>

<!-- Pending step -->
<div class="flex items-center">
  <div class="w-8 h-8 rounded-full border-2 border-secondary-300 text-secondary-400
              flex items-center justify-center">
    3
  </div>
  <span class="ml-2 text-sm font-medium text-secondary-400">
    Deductions
  </span>
</div>

<!-- Connector line -->
<div class="flex-1 h-0.5 bg-secondary-200 mx-4">
  <!-- Completed connector -->
  <div class="h-full bg-success-500 transition-all duration-300"
       style="width: 100%"></div>
</div>
```

---

## 3. Step Content

### 3.1 Step Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2 of 4: Earnings                                                  │
│  ───────────────────────────────────────────────────────────────────── │
│  Review and adjust employee earnings for this pay period.               │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                                                                   │ │
│  │  [Step-specific form content]                                     │ │
│  │                                                                   │ │
│  │  Employee: Marcus Johnson                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │ Regular Hours    80.00   x  $45.67  =  $3,653.60           │ │ │
│  │  │ Overtime Hours    5.00   x  $68.51  =    $342.55           │ │ │
│  │  │ Bonus                                     $500.00           │ │ │
│  │  │ ─────────────────────────────────────────────────           │ │ │
│  │  │ Total Earnings                          $4,496.15           │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ⚠️ 2 employees have overtime exceeding 20 hours. [Review]             │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                        [Cancel]  [Previous]  [Next: Deductions →]       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Step Header

```html
<div class="mb-6">
  <div class="text-sm text-secondary-500 mb-1">
    Step 2 of 4
  </div>
  <h2 class="text-xl font-semibold text-secondary-900">
    Earnings
  </h2>
  <p class="mt-1 text-secondary-600">
    Review and adjust employee earnings for this pay period.
  </p>
</div>
```

### 3.3 Validation Error Display

```html
<!-- Inline field error -->
<div class="space-y-1">
  <label class="block text-sm font-medium text-secondary-700">
    Overtime Hours
  </label>
  <input type="number"
         class="w-full px-3 py-2 border border-danger-500 rounded-lg
                focus:ring-2 focus:ring-danger-500"
         value="45" />
  <p class="text-sm text-danger-600 flex items-center gap-1">
    <AlertCircleIcon class="w-4 h-4" />
    Overtime cannot exceed 40 hours per pay period
  </p>
</div>

<!-- Step-level warning banner -->
<div class="mt-4 p-3 bg-warning-50 border border-warning-200 rounded-lg
            flex items-start gap-3">
  <AlertTriangleIcon class="w-5 h-5 text-warning-500 flex-shrink-0 mt-0.5" />
  <div>
    <p class="text-sm font-medium text-warning-800">
      2 employees have overtime exceeding 20 hours
    </p>
    <button class="text-sm text-warning-600 hover:text-warning-700 underline">
      Review overtime details
    </button>
  </div>
</div>
```

---

## 4. Navigation Controls

### 4.1 Footer Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Cancel]                              [← Previous]  [Next: Step Name →] │
│    ↑                                        ↑              ↑            │
│ Left-aligned                          Right-aligned group              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Button States

| Step | Previous | Next/Submit |
|------|----------|-------------|
| First step | Hidden | "Next: [Step 2 Name] →" |
| Middle steps | "← Previous" | "Next: [Step N+1 Name] →" |
| Last step | "← Previous" | "Submit" / "Complete" |
| Validation errors | Enabled | Disabled |
| Processing | Disabled | Loading spinner |

### 4.3 Button Styling

```html
<!-- Cancel (always visible) -->
<button class="px-4 py-2 text-secondary-600 hover:text-secondary-800
               hover:bg-secondary-100 rounded-lg transition-colors">
  Cancel
</button>

<!-- Previous -->
<button class="px-4 py-2 border border-secondary-300 rounded-lg
               text-secondary-700 hover:bg-secondary-50 transition-colors
               inline-flex items-center gap-2">
  <ChevronLeftIcon class="w-4 h-4" />
  Previous
</button>

<!-- Next -->
<button class="px-4 py-2 bg-primary-500 text-white rounded-lg
               hover:bg-primary-600 transition-colors
               inline-flex items-center gap-2">
  Next: Deductions
  <ChevronRightIcon class="w-4 h-4" />
</button>

<!-- Submit (final step) -->
<button class="px-6 py-2 bg-success-500 text-white rounded-lg
               hover:bg-success-600 transition-colors font-medium
               inline-flex items-center gap-2">
  <CheckIcon class="w-4 h-4" />
  Submit Payroll
</button>

<!-- Loading state -->
<button class="px-6 py-2 bg-primary-500 text-white rounded-lg
               opacity-75 cursor-wait inline-flex items-center gap-2"
        disabled>
  <SpinnerIcon class="w-4 h-4 animate-spin" />
  Processing...
</button>
```

---

## 5. Review/Summary Step

### 5.1 Purpose

The final step before submission should always be a **Review** step that:
- Shows all collected data in read-only format
- Highlights any warnings or issues
- Requires explicit confirmation before submission

### 5.2 Review Step Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 4 of 4: Review & Submit                                           │
│  ───────────────────────────────────────────────────────────────────── │
│  Review all details before submitting the payroll.                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ PAY PERIOD                                           [Edit ✏️]    │ │
│  │ ─────────────────────────────────────────────────────────────────  │ │
│  │ Period:     January 1 - January 14, 2024                          │ │
│  │ Pay Date:   January 19, 2024                                      │ │
│  │ Type:       Regular Payroll                                       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ EARNINGS SUMMARY                                     [Edit ✏️]    │ │
│  │ ─────────────────────────────────────────────────────────────────  │ │
│  │ Employees:       54                                               │ │
│  │ Gross Pay:       $425,000.00                                      │ │
│  │ Overtime:        $12,500.00                                       │ │
│  │ Bonuses:         $8,500.00                                        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ DEDUCTIONS SUMMARY                                   [Edit ✏️]    │ │
│  │ ─────────────────────────────────────────────────────────────────  │ │
│  │ Federal Tax:     $68,000.00                                       │ │
│  │ State Tax:       $25,500.00                                       │ │
│  │ FICA:            $32,512.50                                       │ │
│  │ Benefits:        $21,600.00                                       │ │
│  │ 401(k):          $17,000.00                                       │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 💰 TOTAL NET PAY                              $260,387.50          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ⚠️ This action will initiate direct deposit transfers totaling         │
│     $260,387.50. This cannot be undone.                                 │
│                                                                         │
│  ☐ I have reviewed all payroll details and confirm they are accurate   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ [Cancel]                              [← Previous]  [Submit Payroll]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Review Section Component

```typescript
interface ReviewSectionProps {
  title: string;
  editStepIndex?: number;
  onEdit?: () => void;
  children: React.ReactNode;
}

function ReviewSection({ title, onEdit, children }: ReviewSectionProps) {
  return (
    <div class="bg-white border border-secondary-200 rounded-lg p-4 mb-4">
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-semibold text-secondary-900">{title}</h3>
        {onEdit && (
          <button
            onClick={onEdit}
            class="text-sm text-primary-500 hover:text-primary-600
                   inline-flex items-center gap-1"
          >
            Edit <PencilIcon class="w-3 h-3" />
          </button>
        )}
      </div>
      <div class="text-sm text-secondary-700">
        {children}
      </div>
    </div>
  );
}
```

### 5.4 Confirmation Checkbox

```html
<label class="flex items-start gap-3 mt-6 p-4 bg-secondary-50 rounded-lg
              border border-secondary-200 cursor-pointer
              hover:bg-secondary-100 transition-colors">
  <input type="checkbox"
         class="mt-1 w-4 h-4 text-primary-500 rounded
                focus:ring-2 focus:ring-primary-500" />
  <span class="text-sm text-secondary-700">
    I have reviewed all payroll details and confirm they are accurate.
    I understand this action cannot be undone.
  </span>
</label>
```

---

## 6. Validation

### 6.1 Validation Timing

| Trigger | Validation Level |
|---------|------------------|
| Field blur | Single field |
| Next button click | Entire step |
| Step navigation (back) | None (allow incomplete) |
| Submit button click | All steps |

### 6.2 Validation Severities

| Severity | Behavior | Visual |
|----------|----------|--------|
| Error | Blocks navigation | Red styling, required fix |
| Warning | Allows navigation | Amber styling, shows banner |
| Info | Informational only | Blue styling, dismissable |

### 6.3 Validation Response Schema

```typescript
interface StepValidation {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  code: string;
  message: string;
}

interface ValidationWarning {
  field?: string;
  code: string;
  message: string;
  dismissible: boolean;
}
```

### 6.4 Pre-Flight Checks (Gusto Pattern)

For critical wizards (payroll, financial), include pre-flight checks:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔍 Pre-Flight Check                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ✅ All employee profiles complete                                       │
│ ✅ Bank accounts verified                                               │
│ ✅ Tax registrations current                                            │
│ ⚠️ 2 employees missing state W-4 forms (non-blocking)                   │
│ ❌ Company bank account pending verification (blocking)                 │
│                                                                         │
│ ────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ 1 blocking issue must be resolved before proceeding.                    │
│                                                                         │
│                                   [View Issues]  [Resolve & Continue →] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Progress Persistence

### 7.1 Auto-Save

For complex wizards, persist progress to prevent data loss:

```typescript
interface WizardPersistence {
  enabled: boolean;
  storageKey: string;
  debounceMs: number;      // Default: 1000ms
  expireAfterMs?: number;  // Optional TTL
}

// Usage
function useWizardProgress(options: WizardPersistence) {
  const [data, setData] = useState(() => {
    if (options.enabled) {
      const saved = localStorage.getItem(options.storageKey);
      if (saved) {
        const { data, timestamp } = JSON.parse(saved);
        if (!options.expireAfterMs ||
            Date.now() - timestamp < options.expireAfterMs) {
          return data;
        }
      }
    }
    return {};
  });

  useEffect(() => {
    if (options.enabled) {
      const handler = debounce(() => {
        localStorage.setItem(options.storageKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      }, options.debounceMs);

      handler();
      return handler.cancel;
    }
  }, [data]);

  return [data, setData];
}
```

### 7.2 Resume Prompt

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 Resume Previous Work?                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ You have an unfinished payroll from 2 hours ago.                        │
│                                                                         │
│ Pay Period: January 1-14, 2024                                          │
│ Last Step: Earnings (Step 2 of 4)                                       │
│                                                                         │
│                         [Start Fresh]  [Resume →]                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. App-Specific Implementations

### 8.1 Payroll - Run Payroll Wizard

```typescript
const runPayrollSteps: WizardStep[] = [
  {
    id: 'pay-period',
    title: 'Pay Period',
    description: 'Select the pay period and payroll type',
    icon: CalendarIcon,
    component: PayPeriodStep,
    validate: validatePayPeriod
  },
  {
    id: 'earnings',
    title: 'Earnings',
    description: 'Review hours, salaries, and bonuses',
    icon: DollarSignIcon,
    component: EarningsStep,
    validate: validateEarnings
  },
  {
    id: 'deductions',
    title: 'Deductions',
    description: 'Review taxes and benefit deductions',
    icon: MinusCircleIcon,
    component: DeductionsStep,
    validate: validateDeductions
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review and submit payroll',
    icon: CheckCircleIcon,
    component: PayrollReviewStep,
    validate: validatePayrollReview
  }
];
```

### 8.2 Sales - Lead Conversion Wizard

```typescript
const leadConversionSteps: WizardStep[] = [
  {
    id: 'lead-review',
    title: 'Lead Review',
    description: 'Verify lead information',
    component: LeadReviewStep
  },
  {
    id: 'account',
    title: 'Account',
    description: 'Create or link account',
    component: AccountStep,
    validate: validateAccount
  },
  {
    id: 'contact',
    title: 'Contact',
    description: 'Create contact record',
    component: ContactStep,
    validate: validateContact
  },
  {
    id: 'opportunity',
    title: 'Opportunity',
    description: 'Create opportunity',
    component: OpportunityStep,
    validate: validateOpportunity
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review and convert',
    component: ConversionReviewStep
  }
];
```

### 8.3 HR - Time-Off Request Wizard

```typescript
const timeOffSteps: WizardStep[] = [
  {
    id: 'type',
    title: 'Type',
    description: 'Select time-off type',
    component: TimeOffTypeStep
  },
  {
    id: 'dates',
    title: 'Dates',
    description: 'Select dates and view balance',
    component: DateSelectionStep,
    validate: validateDates
  },
  {
    id: 'conflicts',
    title: 'Conflicts',
    description: 'Review scheduling conflicts',
    component: ConflictCheckStep,
    showIf: (data) => data.hasConflicts
  },
  {
    id: 'review',
    title: 'Submit',
    description: 'Review and submit request',
    component: TimeOffReviewStep
  }
];
```

---

## 9. Accessibility

### 9.1 ARIA Attributes

```html
<div role="dialog"
     aria-labelledby="wizard-title"
     aria-describedby="wizard-step-description">

  <!-- Breadcrumbs -->
  <nav aria-label="Wizard progress">
    <ol role="list">
      <li aria-current="step">Step 2: Earnings</li>
    </ol>
  </nav>

  <!-- Step content -->
  <main role="main" aria-live="polite">
    <h2 id="wizard-title">Earnings</h2>
    <p id="wizard-step-description">
      Review and adjust employee earnings for this pay period.
    </p>
    <!-- form content -->
  </main>

  <!-- Navigation -->
  <footer role="navigation" aria-label="Wizard navigation">
    <button>Previous</button>
    <button>Next</button>
  </footer>
</div>
```

### 9.2 Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Navigate between form fields |
| `Enter` | Submit current step (if valid) |
| `Escape` | Cancel wizard (with confirmation) |
| `Alt + Left` | Previous step |
| `Alt + Right` | Next step (if valid) |

### 9.3 Focus Management

- On step change: Focus moves to step heading
- On validation error: Focus moves to first error field
- On wizard close: Focus returns to triggering element

---

## 10. Testing Requirements

### 10.1 Unit Tests

```typescript
describe('Wizard', () => {
  it('renders first step by default', () => { /* ... */ });
  it('navigates to next step on valid submission', () => { /* ... */ });
  it('prevents navigation when validation fails', () => { /* ... */ });
  it('shows validation errors inline', () => { /* ... */ });
  it('allows navigation back without validation', () => { /* ... */ });
  it('calls onComplete with all data on final submit', () => { /* ... */ });
});

describe('WizardBreadcrumbs', () => {
  it('marks completed steps with checkmark', () => { /* ... */ });
  it('highlights current step', () => { /* ... */ });
  it('allows clicking completed steps', () => { /* ... */ });
  it('prevents clicking future steps', () => { /* ... */ });
});
```

### 10.2 E2E Tests

```typescript
test.describe('Payroll Wizard', () => {
  test('completes full payroll wizard flow', async ({ page }) => {
    await page.goto('/app/payroll/pay-runs/new');

    // Step 1: Pay Period
    await expect(page.locator('[data-testid="wizard-step-title"]'))
      .toContainText('Pay Period');
    await page.selectOption('[name="payrollType"]', 'regular');
    await page.click('[data-testid="wizard-next"]');

    // Step 2: Earnings
    await expect(page.locator('[data-testid="wizard-step-title"]'))
      .toContainText('Earnings');
    // ... verify data loaded
    await page.click('[data-testid="wizard-next"]');

    // Step 3: Deductions
    await expect(page.locator('[data-testid="wizard-step-title"]'))
      .toContainText('Deductions');
    await page.click('[data-testid="wizard-next"]');

    // Step 4: Review
    await expect(page.locator('[data-testid="wizard-step-title"]'))
      .toContainText('Review');
    await page.check('[data-testid="confirmation-checkbox"]');
    await page.click('[data-testid="wizard-submit"]');

    // Confirmation dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test('breadcrumb navigation works correctly', async ({ page }) => {
    // ... navigate to step 3
    await page.click('[data-testid="breadcrumb-step-1"]');
    await expect(page.locator('[data-testid="wizard-step-title"]'))
      .toContainText('Pay Period');
  });
});
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial wizard pattern specification |
