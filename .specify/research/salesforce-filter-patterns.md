# Salesforce Lightning Filter & Data Table Patterns

**Research Date**: February 2, 2026
**Sources**: Salesforce Lightning Design System, LWC Documentation, Community Resources

---

## Overview

Salesforce Lightning provides enterprise-grade data table and filtering patterns used by thousands of organizations. This document captures key patterns for implementation in the Tamshai App Ecosystem.

---

## Data Table Patterns

### Row Selection with Checkboxes

The Lightning datatable displays a checkbox column by default for row selection.

**Key Properties**:
| Property | Type | Description |
|----------|------|-------------|
| `hide-checkbox-column` | boolean | Hides selection checkboxes |
| `max-row-selection` | number | Limits selectable rows (1 = radio button) |
| `single-row-selection-mode` | string | "checkbox" or "radio" |
| `selected-rows` | string[] | Programmatically preselected rows by key |

**Selection Events**:
```typescript
// Event action values
type SelectionAction =
  | 'selectAllRows'    // Header checkbox checked
  | 'deselectAllRows'  // Header checkbox unchecked
  | 'rowSelect'        // Individual row checked
  | 'rowDeselect';     // Individual row unchecked
```

**Programmatic Selection**:
```typescript
// Preselect rows by key-field value
<lightning-datatable
  selected-rows={['row-1', 'row-2']}
  key-field="id"
>
</lightning-datatable>

// Retrieve selected rows
const selectedRows = this.refs.dt.getSelectedRows();
```

### Bulk Action Toolbar Pattern

When rows are selected, a toolbar appears above the table:

```
┌─────────────────────────────────────────────────────────────┐
│ ☑ 3 items selected    [Approve] [Reject] [Export] [Delete] │
├─────────────────────────────────────────────────────────────┤
│ ☑ │ Invoice # │ Vendor      │ Amount   │ Status   │ ...    │
│ ☐ │ INV-001   │ Acme Corp   │ $1,234   │ Pending  │        │
│ ☑ │ INV-002   │ Widgets Inc │ $5,678   │ Pending  │        │
└─────────────────────────────────────────────────────────────┘
```

**Toolbar Behavior**:
1. Hidden when no rows selected
2. Shows count of selected items
3. Bulk actions enabled/disabled based on selection
4. Actions operate on all selected rows atomically

### Column Sorting

**Client-Side Sorting**:
```typescript
interface ColumnDef {
  fieldName: string;
  label: string;
  sortable?: boolean;
  type?: 'text' | 'number' | 'date' | 'currency' | 'percent';
}

// Sort event
handleSort(event) {
  const { fieldName, sortDirection } = event.detail;
  this.sortedBy = fieldName;
  this.sortedDirection = sortDirection;
  this.data = [...this.data].sort(sortBy(fieldName, sortDirection));
}
```

**Sort Direction Cycling**: `none → asc → desc → asc → ...`

### Inline Editing

**Editable Columns**:
```typescript
{
  fieldName: 'amount',
  label: 'Amount',
  type: 'currency',
  editable: true,
  typeAttributes: {
    currencyCode: 'USD',
    minimumFractionDigits: 2
  }
}
```

**Edit Events**:
- `oncelledit`: Individual cell edit started
- `onsave`: User saves changes (batch commit)
- `oncancel`: User cancels edits

### Loading & Empty States

**Loading Skeleton**:
```html
<lightning-datatable
  is-loading={isLoading}
  loading-state-alternative-text="Loading invoices..."
>
</lightning-datatable>
```

**Empty State Pattern**:
```html
<template if:false={hasData}>
  <div class="slds-illustration slds-illustration_small">
    <img src="/assets/images/empty-state.svg" />
    <h3 class="slds-text-heading_medium">No Invoices Found</h3>
    <p class="slds-text-body_regular">
      Try adjusting your filters or create a new invoice.
    </p>
    <lightning-button label="Create Invoice" onclick={handleCreate}>
    </lightning-button>
  </div>
</template>
```

---

## Filter Patterns

### Dynamic Filter Architecture

Salesforce recommends a reusable filter component approach vs. hard-coded filters.

**Client-Side Processing Benefits**:
- Lightning-fast filtering in browser
- No server round-trips for filter operations
- Real-time feedback as user adjusts filters

### Column-Level Filters

```
┌─────────────────────────────────────────────────────────┐
│ Invoice # ▼ │ Vendor ▼    │ Amount ▼ │ Status ▼       │
│ [Search...] │ [Search...] │ [Range ] │ [▼ All      ]  │
├─────────────────────────────────────────────────────────┤
│ INV-001     │ Acme Corp   │ $1,234   │ Pending        │
└─────────────────────────────────────────────────────────┘
```

**Filter Types by Column**:
| Column Type | Filter UI | Matching |
|-------------|-----------|----------|
| Text | Text input | Substring match |
| Number | Range inputs (min/max) | Inclusive range |
| Date | Date picker range | Start/end inclusive |
| Choice | Multi-select dropdown | Exact match |
| Reference | Lookup with search | ID match |

### Quick Filters (Chips/Pills)

```
┌─────────────────────────────────────────────────────────┐
│ Quick filters: [Today] [This Week] [Overdue ⚠️] [Mine] │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
```typescript
const QUICK_FILTERS = [
  { label: 'Today', predicate: (row) => isToday(row.dueDate) },
  { label: 'This Week', predicate: (row) => isThisWeek(row.dueDate) },
  { label: 'Overdue', predicate: (row) => isPast(row.dueDate), badge: true },
  { label: 'Mine', predicate: (row) => row.ownerId === currentUserId }
];
```

### Faceted Filter Sidebar

```
┌─────────────────┬───────────────────────────────────────┐
│ FILTERS         │                                       │
│                 │  [Table content...]                   │
│ Status          │                                       │
│ ☑ Pending (12)  │                                       │
│ ☑ Approved (8)  │                                       │
│ ☐ Rejected (3)  │                                       │
│                 │                                       │
│ Vendor          │                                       │
│ ☑ Acme Corp (5) │                                       │
│ ☐ Widgets (4)   │                                       │
│ [+ Show more]   │                                       │
│                 │                                       │
│ Amount          │                                       │
│ Min: [____]     │                                       │
│ Max: [____]     │                                       │
│                 │                                       │
│ [Clear All]     │                                       │
└─────────────────┴───────────────────────────────────────┘
```

**Facet Features**:
- Count badges showing matching items
- Checkbox multi-select within facet
- "Show more" expansion for long lists
- Clear all button at bottom
- Collapsible facet sections

### Saved Filter Presets

```typescript
interface SavedFilter {
  id: string;
  name: string;
  isDefault: boolean;
  isShared: boolean;
  conditions: FilterCondition[];
  createdBy: string;
  createdAt: Date;
}

interface FilterCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value: unknown;
}
```

**UI Pattern**:
```
┌─────────────────────────────────────────────────────────┐
│ Saved Views: [All Invoices ▼] [⭐ Save Current View]    │
│              ├─ All Invoices (default)                  │
│              ├─ My Pending Approvals                    │
│              ├─ Overdue > 30 Days                       │
│              └─ + Create New View                       │
└─────────────────────────────────────────────────────────┘
```

### Filter Breadcrumbs

Shows active filters as removable pills:

```
┌─────────────────────────────────────────────────────────┐
│ Active filters: [Status: Pending ✕] [Vendor: Acme ✕]   │
│                 [Amount: > $1000 ✕] [Clear all]        │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Recommendations for Tamshai

### DataTable Component Props

```typescript
interface DataTableProps<T> {
  // Data
  data: T[];
  columns: ColumnDef<T>[];
  keyField: keyof T;

  // Selection
  selectable?: boolean;
  maxRowSelection?: number;
  selectedRows?: string[];
  onRowSelection?: (selected: T[], action: SelectionAction) => void;

  // Bulk Actions
  bulkActions?: BulkAction[];
  onBulkAction?: (action: string, selected: T[]) => void;

  // Sorting
  sortable?: boolean;
  sortedBy?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (field: string, direction: 'asc' | 'desc') => void;

  // Inline Editing
  editableColumns?: string[];
  onCellEdit?: (rowId: string, field: string, value: unknown) => void;
  onSave?: (changes: CellChange[]) => void;

  // States
  loading?: boolean;
  emptyState?: ReactNode;

  // Pagination
  pagination?: PaginationConfig;
}

interface BulkAction {
  name: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'destructive' | 'neutral';
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}
```

### Filter Component Props

```typescript
interface FilterBarProps {
  // Quick filters
  quickFilters?: QuickFilter[];
  activeQuickFilter?: string;
  onQuickFilterChange?: (filter: string | null) => void;

  // Faceted filters
  facets?: FacetConfig[];
  facetValues?: Record<string, unknown[]>;
  onFacetChange?: (facet: string, values: unknown[]) => void;

  // Saved views
  savedViews?: SavedFilter[];
  activeView?: string;
  onViewChange?: (viewId: string) => void;
  onSaveView?: (name: string) => void;

  // Search
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;

  // Clear
  onClearAll?: () => void;
}
```

---

## References

- [Salesforce Lightning Datatable Documentation](https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation)
- [Dynamic Filters for LWC Datatable](https://salesforcegeek.in/lightning-data-table-in-lwc/)
- [SFDC Hub Reusable Filter Component](https://www.sfdchub.com/dynamic-datatable-filter-in-lwc/)
- [Lightning Design System Data Tables](https://www.lightningdesignsystem.com/components/data-tables/)
