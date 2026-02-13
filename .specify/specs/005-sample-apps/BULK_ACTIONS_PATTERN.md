# Bulk Actions Pattern Specification

**Version**: 1.0
**Date**: February 2, 2026
**Reference**: Salesforce Lightning Design System, Xero, ServiceNow

---

## Overview

This document defines the standardized bulk action UX pattern for all Tamshai Enterprise applications. Bulk actions enable users to perform operations on multiple records simultaneously, improving efficiency for high-volume workflows.

---

## 1. Component Architecture

### 1.1 Component Hierarchy

```
DataTable
├── BulkActionToolbar (conditionally visible)
│   ├── SelectionIndicator ("3 items selected")
│   ├── BulkActionButton (for each action)
│   └── ClearSelectionButton
├── TableHeader
│   ├── SelectAllCheckbox
│   └── ColumnHeaders (sortable)
├── TableBody
│   └── TableRow (for each item)
│       ├── SelectionCheckbox
│       └── DataCells
└── TableFooter
    └── Pagination
```

### 1.2 Required Props

```typescript
interface DataTableProps<T> {
  // Data
  data: T[];
  columns: ColumnDef<T>[];
  keyField: keyof T;

  // Selection
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  maxSelection?: number; // Optional limit

  // Bulk Actions
  bulkActions?: BulkAction[];
  onBulkAction?: (action: string, selectedItems: T[]) => Promise<void>;

  // ... other props
}

interface BulkAction {
  id: string;
  label: string;
  icon?: React.ComponentType;
  variant?: 'primary' | 'destructive' | 'neutral';
  requiresConfirmation?: boolean;
  confirmationMessage?: string | ((count: number) => string);
  minSelection?: number; // Default: 1
  maxSelection?: number; // Optional max
  permissions?: string[]; // Required roles
}
```

---

## 2. Selection Behavior

### 2.1 Selection States

| State | Header Checkbox | Description |
|-------|-----------------|-------------|
| None selected | Empty | No rows checked |
| Some selected | Indeterminate (─) | 1 to n-1 rows checked |
| All selected | Checked (✓) | All visible rows checked |

### 2.2 Selection Actions

| User Action | Result |
|-------------|--------|
| Click row checkbox | Toggle single row selection |
| Click header checkbox (empty) | Select all visible rows |
| Click header checkbox (indeterminate) | Select all visible rows |
| Click header checkbox (checked) | Deselect all rows |
| Click "Clear selection" | Deselect all rows |
| Navigate to new page | Clear selection (by default) |

### 2.3 Selection Persistence Options

```typescript
type SelectionPersistence =
  | 'page'        // Clear on page change (default)
  | 'session'     // Persist across pagination
  | 'explicit';   // Only clear on explicit action
```

### 2.4 Visual Feedback

```css
/* Selected row styling */
.table-row-selected {
  background-color: var(--color-primary-50);
  border-left: 3px solid var(--color-primary-500);
}

/* Checkbox column width */
.selection-column {
  width: 48px;
  min-width: 48px;
  max-width: 48px;
}
```

---

## 3. Bulk Action Toolbar

### 3.1 Toolbar Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☑ 3 items selected  [Clear]  │  [Approve] [Reject] [Export] [🗑 Delete] │
│ ← Selection info       │     │  ← Actions (right-aligned)              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Toolbar Visibility Rules

| Selection State | Toolbar Visibility |
|-----------------|-------------------|
| 0 items | Hidden |
| 1+ items | Visible |

**Animation**: Slide down with fade (200ms, ease-out)

### 3.3 Action Button States

| Condition | Button State |
|-----------|--------------|
| Selection meets minSelection | Enabled |
| Selection below minSelection | Disabled + Tooltip |
| Selection exceeds maxSelection | Disabled + Tooltip |
| User lacks permission | Hidden |
| Action in progress | Loading spinner |

### 3.4 Action Button Styling

```html
<!-- Primary Action -->
<button class="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg
               inline-flex items-center gap-2 font-medium">
  <CheckIcon class="w-4 h-4" />
  Approve
</button>

<!-- Destructive Action -->
<button class="bg-danger-500 hover:bg-danger-600 text-white px-4 py-2 rounded-lg
               inline-flex items-center gap-2 font-medium">
  <TrashIcon class="w-4 h-4" />
  Delete
</button>

<!-- Neutral Action -->
<button class="border border-secondary-300 hover:bg-secondary-50 text-secondary-700
               px-4 py-2 rounded-lg inline-flex items-center gap-2 font-medium">
  <DownloadIcon class="w-4 h-4" />
  Export
</button>
```

---

## 4. Confirmation Flow

### 4.1 Confirmation Required Actions

Actions that modify or delete data MUST require confirmation:

| Action Type | Confirmation Required |
|-------------|----------------------|
| View/Export | No |
| Approve/Reject | Yes |
| Update status | Yes |
| Delete | Yes (with danger styling) |

### 4.2 Confirmation Dialog

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠️ Approve 3 Invoices?                                           [X] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  You are about to approve the following invoices:                       │
│                                                                         │
│  • INV-2024-0123 - Acme Corp ($5,000.00)                               │
│  • INV-2024-0124 - Widget Inc ($3,200.00)                              │
│  • INV-2024-0125 - Tech Solutions ($1,800.00)                          │
│                                                                         │
│  Total: $10,000.00                                                      │
│                                                                         │
│  This action cannot be undone.                                          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                              [Cancel]    [Approve 3 Invoices]           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Confirmation Dialog Props

```typescript
interface BulkConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;

  action: BulkAction;
  selectedItems: unknown[];

  // Optional: custom content
  title?: string;
  description?: string;
  itemRenderer?: (item: unknown) => React.ReactNode;
  summaryRenderer?: (items: unknown[]) => React.ReactNode;
}
```

---

## 5. Execution & Feedback

### 5.1 Execution States

```typescript
type BulkActionState =
  | 'idle'          // Ready for action
  | 'confirming'    // Showing confirmation dialog
  | 'executing'     // Processing request
  | 'success'       // All items processed
  | 'partial'       // Some items failed
  | 'error';        // All items failed
```

### 5.2 Progress Indication

For actions affecting 10+ items, show progress:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Processing 25 invoices...                                              │
│                                                                         │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░  50% (12 of 25)              │
│                                                                         │
│  ✓ INV-2024-0123 approved                                               │
│  ✓ INV-2024-0124 approved                                               │
│  ⏳ INV-2024-0125 processing...                                         │
│                                                                         │
│                                                    [Cancel]             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Success Feedback

```html
<!-- Toast notification -->
<div class="bg-success-50 border border-success-200 rounded-lg p-4
            flex items-center gap-3">
  <CheckCircleIcon class="w-5 h-5 text-success-500" />
  <span class="text-success-800">3 invoices approved successfully</span>
  <button class="ml-auto text-success-600 hover:text-success-700">
    Dismiss
  </button>
</div>
```

### 5.4 Partial Failure Handling

```html
<!-- Toast notification for partial failure -->
<div class="bg-warning-50 border border-warning-200 rounded-lg p-4">
  <div class="flex items-center gap-3">
    <AlertTriangleIcon class="w-5 h-5 text-warning-500" />
    <span class="text-warning-800 font-medium">
      2 of 5 invoices could not be approved
    </span>
  </div>
  <ul class="mt-2 ml-8 text-sm text-warning-700">
    <li>INV-2024-0126: Already approved</li>
    <li>INV-2024-0127: Insufficient permissions</li>
  </ul>
  <button class="mt-2 text-warning-600 hover:text-warning-700 text-sm">
    View details
  </button>
</div>
```

---

## 6. Keyboard Navigation

### 6.1 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle focused row selection |
| `Ctrl/Cmd + A` | Select all visible rows |
| `Escape` | Clear selection |
| `Ctrl/Cmd + Shift + A` | Clear selection (alternative) |
| `Enter` | Execute primary bulk action (if selected) |

### 6.2 Focus Management

- Tab order: Header checkbox → Column headers → Row checkboxes → Row cells
- After bulk action completes: Return focus to table
- After dialog closes: Return focus to triggering button

---

## 7. Accessibility

### 7.1 ARIA Attributes

```html
<!-- Table with selection -->
<table role="grid" aria-multiselectable="true">
  <thead>
    <tr>
      <th role="columnheader">
        <input type="checkbox"
               aria-label="Select all rows"
               aria-checked="mixed" />
      </th>
    </tr>
  </thead>
  <tbody>
    <tr role="row" aria-selected="true">
      <td role="gridcell">
        <input type="checkbox"
               aria-label="Select row: Invoice INV-2024-0123"
               checked />
      </td>
    </tr>
  </tbody>
</table>

<!-- Bulk action toolbar -->
<div role="toolbar"
     aria-label="Bulk actions"
     aria-controls="data-table">
  <span aria-live="polite">3 items selected</span>
  <!-- actions -->
</div>
```

### 7.2 Screen Reader Announcements

| Event | Announcement |
|-------|--------------|
| Row selected | "Row [identifier] selected, [n] items selected" |
| Row deselected | "Row [identifier] deselected, [n] items selected" |
| All selected | "All [n] rows selected" |
| Selection cleared | "Selection cleared" |
| Action started | "Processing [action] on [n] items" |
| Action complete | "[n] items [action] successfully" |

---

## 8. App-Specific Implementations

### 8.1 Finance - Invoice Bulk Approval

```typescript
const invoiceBulkActions: BulkAction[] = [
  {
    id: 'approve',
    label: 'Approve',
    icon: CheckIcon,
    variant: 'primary',
    requiresConfirmation: true,
    confirmationMessage: (count) =>
      `Approve ${count} invoice${count > 1 ? 's' : ''}? This will mark them as approved and ready for payment.`,
    permissions: ['finance-write']
  },
  {
    id: 'reject',
    label: 'Reject',
    icon: XIcon,
    variant: 'destructive',
    requiresConfirmation: true,
    confirmationMessage: (count) =>
      `Reject ${count} invoice${count > 1 ? 's' : ''}? You will need to provide a reason.`,
    permissions: ['finance-write']
  },
  {
    id: 'export',
    label: 'Export',
    icon: DownloadIcon,
    variant: 'neutral',
    requiresConfirmation: false
  }
];
```

### 8.2 HR - Employee Status Changes

```typescript
const employeeBulkActions: BulkAction[] = [
  {
    id: 'activate',
    label: 'Activate',
    icon: UserCheckIcon,
    variant: 'primary',
    requiresConfirmation: true,
    permissions: ['hr-write']
  },
  {
    id: 'deactivate',
    label: 'Deactivate',
    icon: UserXIcon,
    variant: 'destructive',
    requiresConfirmation: true,
    maxSelection: 10, // Limit for safety
    permissions: ['hr-write']
  }
];
```

### 8.3 Support - Ticket Bulk Operations

```typescript
const ticketBulkActions: BulkAction[] = [
  {
    id: 'assign',
    label: 'Assign',
    icon: UserIcon,
    variant: 'neutral',
    requiresConfirmation: true,
    permissions: ['support-write']
  },
  {
    id: 'close',
    label: 'Close',
    icon: CheckCircleIcon,
    variant: 'primary',
    requiresConfirmation: true,
    permissions: ['support-write']
  },
  {
    id: 'escalate',
    label: 'Escalate',
    icon: ArrowUpIcon,
    variant: 'neutral',
    requiresConfirmation: true,
    permissions: ['support-write']
  }
];
```

---

## 9. Testing Requirements

### 9.1 Unit Tests

```typescript
describe('BulkActionToolbar', () => {
  it('hides when no rows selected', () => { /* ... */ });
  it('shows when 1+ rows selected', () => { /* ... */ });
  it('displays correct selection count', () => { /* ... */ });
  it('disables actions below minSelection', () => { /* ... */ });
  it('hides actions user lacks permission for', () => { /* ... */ });
  it('shows confirmation dialog for destructive actions', () => { /* ... */ });
});

describe('DataTable selection', () => {
  it('toggles single row on checkbox click', () => { /* ... */ });
  it('selects all on header checkbox click (empty)', () => { /* ... */ });
  it('deselects all on header checkbox click (checked)', () => { /* ... */ });
  it('shows indeterminate state for partial selection', () => { /* ... */ });
});
```

### 9.2 E2E Tests

```typescript
test.describe('Invoice Bulk Approval', () => {
  test('bulk action menu enables only when rows selected', async ({ page }) => {
    await page.goto('/app/finance/invoices');

    // Initially disabled
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeHidden();

    // Select first row
    await page.click('[data-testid="row-checkbox-0"]');
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="bulk-approve"]')).toBeEnabled();

    // Deselect
    await page.click('[data-testid="row-checkbox-0"]');
    await expect(page.locator('[data-testid="bulk-toolbar"]')).toBeHidden();
  });

  test('shows confirmation dialog before bulk approve', async ({ page }) => {
    // Select 3 invoices
    await page.click('[data-testid="row-checkbox-0"]');
    await page.click('[data-testid="row-checkbox-1"]');
    await page.click('[data-testid="row-checkbox-2"]');

    // Click approve
    await page.click('[data-testid="bulk-approve"]');

    // Confirmation dialog appears
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toContainText('Approve 3 invoices');
  });
});
```

---

## 10. Performance Considerations

### 10.1 Large Dataset Handling

| Row Count | Recommendation |
|-----------|----------------|
| < 100 | Client-side selection, no virtualization |
| 100-1000 | Client-side selection, consider virtualization |
| > 1000 | Server-side selection tracking, required virtualization |

### 10.2 Selection State Management

```typescript
// For large datasets, use Set for O(1) lookups
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleSelection = (id: string) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
};
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial bulk actions pattern specification |
