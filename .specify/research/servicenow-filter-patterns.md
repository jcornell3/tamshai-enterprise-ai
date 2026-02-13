# ServiceNow Filter & Dashboard Patterns

**Research Date**: February 2, 2026
**Sources**: ServiceNow Community, Documentation, UI Builder Resources

---

## Overview

ServiceNow provides enterprise-grade filtering and dashboard patterns used by IT service management teams worldwide. This document captures key patterns for implementation in the Tamshai Support module.

---

## Filter Types

### Interactive Filters in Dashboards

ServiceNow dashboards support multiple filter interaction modes:

| Mode | Description | Best For |
|------|-------------|----------|
| Single Select | One value at a time | Date ranges, assigned user |
| Multiple Select | Multiple values combined | Priority, category, status |
| Range | Min/max numeric or date | Created date, resolution time |

### Filter Configuration Options

```typescript
interface InteractiveFilter {
  id: string;
  name: string;
  field: string;
  type: 'single' | 'multiple' | 'range';

  // UI configuration
  uiControl: 'dropdown' | 'checkbox' | 'radio' | 'datepicker' | 'input';

  // Data source
  source: 'static' | 'dynamic' | 'reference';
  staticValues?: FilterOption[];
  dynamicQuery?: string;

  // Behavior
  defaultValue?: unknown;
  required?: boolean;
  cascadeFrom?: string;  // Parent filter dependency
}

interface FilterOption {
  value: string;
  label: string;
  count?: number;  // Matching records
}
```

---

## Breadcrumb Filter Navigation

### Hierarchical Filter Display

ServiceNow displays active filters as breadcrumbs, ordered from most general (left) to most specific (right):

```
All Incidents → Priority: High → State: Open → Assigned to: John Smith
     ↑              ↑               ↑              ↑
  (Remove)      (Remove)        (Remove)       (Remove)
```

### Breadcrumb Behavior

- Clicking a breadcrumb removes it AND all filters to its right
- Left-most breadcrumb returns to unfiltered view
- Each breadcrumb shows the field name and selected value

### Implementation Pattern

```typescript
interface FilterBreadcrumb {
  filterId: string;
  fieldLabel: string;
  displayValue: string;
  position: number;  // For ordering
  operator: 'equals' | 'in' | 'between' | 'contains';
  actualValue: unknown;
}

function removeBreadcrumb(breadcrumbs: FilterBreadcrumb[], position: number): FilterBreadcrumb[] {
  // Remove this breadcrumb and all subsequent ones
  return breadcrumbs.filter(b => b.position < position);
}
```

---

## Quick Filter Patterns

### Right-Click Context Filtering

ServiceNow allows quick filtering by right-clicking any field value:

| Action | Result |
|--------|--------|
| Show Matching | Filter to rows where field = this value |
| Filter Out | Filter to rows where field ≠ this value |
| Show Before | For dates: rows where date < this value |
| Show After | For dates: rows where date > this value |

### UI Implementation

```
┌─────────────────────────────────────────────────────────────┐
│ Number     │ Priority │ Assigned To   │ State    │ Created │
├────────────┼──────────┼───────────────┼──────────┼─────────┤
│ INC0001    │ High     │ John Smith    │ Open     │ Jan 15  │
│ INC0002    │ High ◄───┼───────────────┼──────────┼─────────┤
│            │          │ ┌───────────────────────┐           │
│            │          │ │ Show Matching         │           │
│            │          │ │ Filter Out            │           │
│            │          │ │ ─────────────────     │           │
│            │          │ │ Group by this field   │           │
│            │          │ └───────────────────────┘           │
└────────────┴──────────┴───────────────┴──────────┴─────────┘
```

---

## Saved Filters & List Views

### List Control Pattern

ServiceNow provides a "List Controls" button with predefined filters:

```
┌─────────────────────────────────────────────────────────────┐
│ Incidents                    [⚙️ List Controls ▼] [🔍 Search] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  List Controls ▼                                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 📋 SAVED FILTERS                                       │ │
│  │ ─────────────────────────────────────────────────────  │ │
│  │ ★ My Open Incidents (default)                          │ │
│  │   All High Priority                                    │ │
│  │   Unassigned Tickets                                   │ │
│  │   Breached SLA                                         │ │
│  │                                                        │ │
│  │ ─────────────────────────────────────────────────────  │ │
│  │ + Create New Filter                                    │ │
│  │ ⚙️ Manage Filters                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Saved Filter Schema

```typescript
interface SavedListFilter {
  id: string;
  name: string;
  table: string;  // Target table (e.g., 'incident')

  // Filter criteria
  encodedQuery: string;  // ServiceNow encoded query format
  conditions: FilterCondition[];

  // Ownership
  isPersonal: boolean;   // User's private filter
  isShared: boolean;     // Visible to team/org
  isDefault: boolean;    // Auto-applied on load
  createdBy: string;
  createdAt: Date;

  // Display
  icon?: string;
  color?: string;
  sortOrder: number;
}

interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string | string[];
  orGroup?: number;  // For OR conditions
}

type FilterOperator =
  | '='      // Equals
  | '!='     // Not equals
  | 'LIKE'   // Contains
  | 'STARTSWITH'
  | 'ENDSWITH'
  | '>'      // Greater than
  | '>='     // Greater or equal
  | '<'      // Less than
  | '<='     // Less or equal
  | 'BETWEEN'
  | 'IN'     // In list
  | 'NOT IN'
  | 'ISEMPTY'
  | 'ISNOTEMPTY';
```

---

## UI Builder Filter Patterns

### Encoded Query Filters

ServiceNow UI Builder uses encoded queries to filter data visualization components:

```
// Example encoded queries
active=true^priority=1                    // Active AND High Priority
state=1^ORstate=2                         // State 1 OR State 2
assigned_to=javascript:gs.getUserID()     // Assigned to current user
sys_created_on>=javascript:gs.daysAgoStart(7)  // Created in last 7 days
```

### Filter Component Types

| Component | Use Case | Selection Mode |
|-----------|----------|----------------|
| Dropdown | Reference fields, short lists | Single |
| Multi-select | Status, categories | Multiple |
| Checkbox Group | Boolean options | Multiple |
| Date Picker | Date/time fields | Single or Range |
| Text Input | Free-form search | Single |
| Slider | Numeric ranges | Range |

---

## SLA-Driven UI Patterns

### SLA Status Indicators

For support tickets, ServiceNow prominently displays SLA status:

```
┌─────────────────────────────────────────────────────────────┐
│ INC0001234 - Email server not responding                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ SLA STATUS                                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🟢 Response SLA                              On Track   │ │
│ │    Due: Feb 2, 2026 2:30 PM (2h 15m remaining)         │ │
│ │    ████████████████████░░░░░░░░░░  67%                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🟡 Resolution SLA                           At Risk     │ │
│ │    Due: Feb 3, 2026 5:00 PM (1d 4h remaining)          │ │
│ │    ████████████████████████░░░░░░  85%                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### SLA Color Coding

| Status | Color | Threshold |
|--------|-------|-----------|
| On Track | Green (#22C55E) | > 25% time remaining |
| At Risk | Amber (#F59E0B) | 10-25% time remaining |
| Critical | Red (#EF4444) | < 10% time remaining |
| Breached | Dark Red (#DC2626) | Past due |

### Breached SLA Filter

Quick filter to show tickets that have breached SLA:

```typescript
const breachedSLAFilter: SavedListFilter = {
  name: 'Breached SLA',
  encodedQuery: 'sla_due<javascript:gs.now()^sla_stage!=resolved',
  icon: '🚨',
  color: '#DC2626'
};
```

---

## Escalation UI Patterns

### Escalation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ TICKET ESCALATION                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Current State                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Priority: P3 - Moderate                                 │ │
│ │ Assigned: John Smith (L1 Support)                       │ │
│ │ Time in Queue: 4 hours                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Escalation Options                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Priority Escalation                                   │ │
│ │   Increase priority to P2 - High                        │ │
│ │   SLA will be recalculated                              │ │
│ │                                                         │ │
│ │ ○ Functional Escalation                                 │ │
│ │   Reassign to L2 Support Team                           │ │
│ │   Manager notification will be sent                     │ │
│ │                                                         │ │
│ │ ○ Hierarchical Escalation                               │ │
│ │   Notify Support Manager (Sarah Wilson)                 │ │
│ │   Ticket remains with current assignee                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Escalation Reason (required)                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Customer is executive sponsor, needs immediate...       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Cancel]                              [Escalate Ticket →]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Escalation Audit Trail

```typescript
interface EscalationRecord {
  id: string;
  ticketId: string;
  escalationType: 'priority' | 'functional' | 'hierarchical';

  fromState: {
    priority: string;
    assignee: string;
    team: string;
  };

  toState: {
    priority: string;
    assignee: string;
    team: string;
  };

  reason: string;
  escalatedBy: string;
  escalatedAt: Date;

  notifications: {
    recipient: string;
    channel: 'email' | 'slack' | 'sms';
    sentAt: Date;
  }[];
}
```

---

## Implementation Recommendations for Tamshai

### Filter Bar Component

```typescript
interface SupportFilterBarProps {
  // Quick filters
  quickFilters: QuickFilter[];
  activeQuickFilter?: string;

  // Saved filters
  savedFilters: SavedListFilter[];
  activeSavedFilter?: string;

  // Active breadcrumbs
  breadcrumbs: FilterBreadcrumb[];

  // Callbacks
  onQuickFilterChange: (filter: string | null) => void;
  onSavedFilterChange: (filterId: string) => void;
  onBreadcrumbRemove: (position: number) => void;
  onSaveCurrentFilter: (name: string) => void;
}
```

### SLA Status Component

```typescript
interface SLAStatusProps {
  ticketId: string;
  slaType: 'response' | 'resolution' | 'update';
  dueDate: Date;
  currentTime: Date;  // For live updates
  stage: 'pending' | 'in_progress' | 'paused' | 'completed' | 'breached';

  // Optional
  pausedReason?: string;
  businessHoursOnly?: boolean;
}
```

### Escalation Dialog Component

```typescript
interface EscalationDialogProps {
  ticket: SupportTicket;
  escalationTypes: EscalationType[];
  requireReason: boolean;
  onEscalate: (type: string, reason: string) => Promise<void>;
  onCancel: () => void;
}

interface EscalationType {
  id: string;
  name: string;
  description: string;
  icon: string;
  effect: string;  // What happens when selected
}
```

---

## References

- [ServiceNow Interactive Filters Guide (2026)](https://www.servicenow.com/community/servicenow-ai-platform-articles/how-to-add-interactive-filters-in-servicenow-app-dashboards-2026/ta-p/3461519)
- [ServiceNow Filters Documentation](https://www.servicenow.com/docs/bundle/yokohama-platform-user-interface/page/use/using-lists/concept/c_Filters.html)
- [ServiceNow Creating and Sharing Filters](https://berkeley.service-now.com/kb_view.do?sys_kb_id=e6ae116a6f4a5600262b384aea3ee4b6)
- [ServiceNow UI Builder Filters](https://www.servicenow.com/community/next-experience-articles/ui-builder-filters-with-encoded-query-to-filters-data/ta-p/2413986)
