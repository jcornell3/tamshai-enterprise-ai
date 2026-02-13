# Tamshai Enterprise AI Navigation Patterns

## 1. Overview

This document defines shared navigation patterns across all Tamshai Enterprise AI applications. Consistent navigation ensures users can move efficiently between apps and features while maintaining context of their current location.

**Applies to**: Portal, HR, Finance, Sales, Support, Payroll, Tax applications

---

## 2. Global Navigation Architecture

### 2.1 Navigation Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  Portal (App Launcher)                                          │
│  └── Role-based app access                                      │
└─────────────────────────────────────────────────────────────────┘
         │
         ├── HR App (hr-read/hr-write)
         │   ├── Dashboard
         │   ├── Employee Directory
         │   ├── Org Chart
         │   ├── Time Off
         │   └── AI Query
         │
         ├── Finance App (finance-read/finance-write)
         │   ├── Dashboard
         │   ├── Budgets
         │   ├── Invoices
         │   ├── Expense Reports
         │   ├── ARR Reports
         │   └── AI Query
         │
         ├── Sales App (sales-read/sales-write)
         │   ├── Dashboard
         │   ├── Pipeline
         │   ├── Opportunities
         │   ├── Customers
         │   ├── Leads
         │   └── AI Query
         │
         ├── Support App (support-read/support-write)
         │   ├── Dashboard
         │   ├── Tickets
         │   ├── Knowledge Base
         │   ├── SLA Tracking
         │   └── AI Query
         │
         ├── Payroll App (payroll-read/payroll-write)    [NEW]
         │   ├── Dashboard
         │   ├── Pay Runs
         │   ├── Pay Stubs
         │   ├── Deductions
         │   ├── 1099 Management
         │   └── AI Query
         │
         └── Tax App (tax-read/tax-write)               [NEW]
             ├── Dashboard
             ├── Sales Tax
             ├── Quarterly Estimates
             ├── Annual Filings
             ├── State Compliance
             └── AI Query
```

### 2.2 Cross-App Navigation

Users can switch between apps via:
1. **Portal Home**: Return to app launcher
2. **App Switcher**: Quick dropdown in header
3. **Deep Links**: Direct URLs to specific pages

---

## 3. Layout Structure

### 3.1 Standard App Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Header (64px)                                                   │
│  ┌──────────┬───────────────────────────────────┬─────────────┐ │
│  │ Logo +   │ [App Switcher ▼] [AI Query]       │ User Menu   │ │
│  │ App Name │                                   │ [Avatar ▼]  │ │
│  └──────────┴───────────────────────────────────┴─────────────┘ │
├─────────────┬────────────────────────────────────────────────────┤
│  Sidebar    │  Main Content Area                                 │
│  (240px)    │                                                    │
│             │  ┌─────────────────────────────────────────────┐   │
│  Dashboard  │  │  Page Header                                │   │
│  ───────    │  │  ┌─────────────────────────────────────────┴┐  │
│  Section 1  │  │  │ [Breadcrumb]                              │  │
│  • Item 1   │  │  │ Page Title                    [Actions ▼] │  │
│  • Item 2   │  │  └───────────────────────────────────────────┘  │
│  ───────    │  │                                                 │
│  Section 2  │  │  Page Content                                   │
│  • Item 3   │  │                                                 │
│  ───────    │  │                                                 │
│  AI Query   │  │                                                 │
│             │  │                                                 │
└─────────────┴──┴─────────────────────────────────────────────────┘
```

### 3.2 Mobile Layout (< 768px)

```
┌─────────────────────────────────┐
│  Header (56px)                  │
│  ┌────┬───────────────┬─────┐  │
│  │ ☰  │   App Name    │  👤 │  │
│  └────┴───────────────┴─────┘  │
├─────────────────────────────────┤
│  Main Content Area              │
│  (Full width)                   │
│                                 │
│  [Page content...]              │
│                                 │
├─────────────────────────────────┤
│  Bottom Navigation (56px)       │
│  ┌─────┬─────┬─────┬─────┐     │
│  │Home │ Nav │ Nav │Query│     │
│  └─────┴─────┴─────┴─────┘     │
└─────────────────────────────────┘
```

---

## 4. Component Specifications

### 4.1 Header Component

```tsx
interface HeaderProps {
  appName: string;
  appIcon: React.ReactNode;
  accentColor: string; // App-specific accent
}

// Header Structure
<header className="h-16 bg-white border-b border-secondary-200 px-4 lg:px-6">
  <div className="flex items-center justify-between h-full max-w-screen-2xl mx-auto">
    {/* Left: Logo + App Name */}
    <div className="flex items-center gap-3">
      <Link to="/portal" className="flex items-center gap-2">
        <TamshaiLogo className="w-8 h-8" />
      </Link>
      <div className="h-6 w-px bg-secondary-200" />
      <div className="flex items-center gap-2">
        {appIcon}
        <span className="font-semibold text-secondary-900">{appName}</span>
      </div>
    </div>

    {/* Center: App Switcher + AI Query Button */}
    <div className="hidden md:flex items-center gap-4">
      <AppSwitcher />
      <Button variant="primary" size="sm" leftIcon={<Sparkles />}>
        AI Query
      </Button>
    </div>

    {/* Right: User Menu */}
    <UserMenu />
  </div>
</header>
```

### 4.2 Sidebar Component

```tsx
interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number | string;
  requiredRole?: string;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

// Sidebar Structure
<aside className="w-60 bg-secondary-50 border-r border-secondary-200 h-screen overflow-y-auto">
  <nav className="p-4 space-y-6">
    {sections.map((section, idx) => (
      <div key={idx}>
        {section.title && (
          <h3 className="px-3 text-xs font-semibold text-secondary-500 uppercase tracking-wider mb-2">
            {section.title}
          </h3>
        )}
        <ul className="space-y-1">
          {section.items.map((item) => (
            <SidebarItem key={item.path} item={item} />
          ))}
        </ul>
      </div>
    ))}
  </nav>
</aside>
```

### 4.3 Sidebar Item States

```tsx
// Default state
<li className="px-3 py-2 rounded-lg text-secondary-600 hover:bg-secondary-100
               hover:text-secondary-900 transition-colors cursor-pointer">
  <div className="flex items-center gap-3">
    <Icon className="w-5 h-5" />
    <span className="text-sm font-medium">Item Label</span>
  </div>
</li>

// Active state
<li className="px-3 py-2 rounded-lg bg-primary-50 text-primary-700
               border-l-2 border-primary-500">
  <div className="flex items-center gap-3">
    <Icon className="w-5 h-5 text-primary-600" />
    <span className="text-sm font-semibold">Active Item</span>
  </div>
</li>

// With badge
<li className="px-3 py-2 rounded-lg text-secondary-600">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">Tickets</span>
    </div>
    <span className="px-2 py-0.5 text-xs font-medium bg-danger-100 text-danger-700 rounded-full">
      12
    </span>
  </div>
</li>
```

### 4.4 App Switcher Component

```tsx
const appList = [
  { name: 'Portal', path: '/portal', icon: <Home />, roles: [] },
  { name: 'HR', path: '/hr', icon: <Users />, roles: ['hr-read'] },
  { name: 'Finance', path: '/finance', icon: <DollarSign />, roles: ['finance-read'] },
  { name: 'Sales', path: '/sales', icon: <TrendingUp />, roles: ['sales-read'] },
  { name: 'Support', path: '/support', icon: <Headphones />, roles: ['support-read'] },
  { name: 'Payroll', path: '/payroll', icon: <Wallet />, roles: ['payroll-read'] },
  { name: 'Tax', path: '/tax', icon: <Receipt />, roles: ['tax-read'] },
];

<Dropdown>
  <DropdownTrigger className="flex items-center gap-2 px-3 py-2 rounded-lg
                              bg-secondary-100 hover:bg-secondary-200">
    <Grid className="w-4 h-4" />
    <span className="text-sm font-medium">Switch App</span>
    <ChevronDown className="w-4 h-4" />
  </DropdownTrigger>
  <DropdownContent className="w-48 bg-white shadow-lg rounded-lg border border-secondary-200 p-1">
    {appList
      .filter(app => hasAnyRole(userRoles, app.roles))
      .map(app => (
        <DropdownItem key={app.path} className="flex items-center gap-3 px-3 py-2 rounded-md
                                                hover:bg-secondary-50">
          {app.icon}
          <span>{app.name}</span>
        </DropdownItem>
      ))}
  </DropdownContent>
</Dropdown>
```

### 4.5 Breadcrumb Component

```tsx
interface BreadcrumbItem {
  label: string;
  path?: string;
}

<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
  {items.map((item, idx) => (
    <Fragment key={idx}>
      {idx > 0 && <ChevronRight className="w-4 h-4 text-secondary-400" />}
      {item.path ? (
        <Link to={item.path} className="text-secondary-500 hover:text-primary-600">
          {item.label}
        </Link>
      ) : (
        <span className="text-secondary-900 font-medium">{item.label}</span>
      )}
    </Fragment>
  ))}
</nav>
```

---

## 5. Sidebar Configurations by App

### 5.1 HR App Sidebar

```typescript
const hrSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/hr', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'People',
    items: [
      { label: 'Employee Directory', path: '/hr/employees', icon: <Users /> },
      { label: 'Org Chart', path: '/hr/org-chart', icon: <Network /> },
      { label: 'New Hires', path: '/hr/onboarding', icon: <UserPlus />, badge: 3 },
    ]
  },
  {
    title: 'Self-Service',
    items: [
      { label: 'Time Off', path: '/hr/time-off', icon: <Calendar /> },
      { label: 'Documents', path: '/hr/documents', icon: <FileText /> },
      { label: 'Performance', path: '/hr/performance', icon: <Target /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/hr/query', icon: <Sparkles /> },
    ]
  },
];
```

### 5.2 Finance App Sidebar

```typescript
const financeSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/finance', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'Financial Reports',
    items: [
      { label: 'Budgets', path: '/finance/budgets', icon: <PieChart /> },
      { label: 'ARR Dashboard', path: '/finance/arr', icon: <TrendingUp /> },
      { label: 'Quarterly Reports', path: '/finance/quarterly', icon: <BarChart /> },
    ]
  },
  {
    title: 'Transactions',
    items: [
      { label: 'Invoices', path: '/finance/invoices', icon: <FileText /> },
      { label: 'Expense Reports', path: '/finance/expenses', icon: <Receipt /> },
      { label: 'Bank Reconciliation', path: '/finance/reconciliation', icon: <Building /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/finance/query', icon: <Sparkles /> },
    ]
  },
];
```

### 5.3 Sales App Sidebar

```typescript
const salesSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/sales', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'Pipeline',
    items: [
      { label: 'Pipeline View', path: '/sales/pipeline', icon: <Kanban /> },
      { label: 'Opportunities', path: '/sales/opportunities', icon: <Target /> },
      { label: 'Forecasting', path: '/sales/forecast', icon: <TrendingUp /> },
    ]
  },
  {
    title: 'Relationships',
    items: [
      { label: 'Customers', path: '/sales/customers', icon: <Building /> },
      { label: 'Leads', path: '/sales/leads', icon: <UserPlus />, badge: 8 },
      { label: 'Contacts', path: '/sales/contacts', icon: <Users /> },
    ]
  },
  {
    title: 'Documents',
    items: [
      { label: 'Quotes', path: '/sales/quotes', icon: <FileText /> },
      { label: 'Proposals', path: '/sales/proposals', icon: <File /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/sales/query', icon: <Sparkles /> },
    ]
  },
];
```

### 5.4 Support App Sidebar

```typescript
const supportSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/support', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'Tickets',
    items: [
      { label: 'All Tickets', path: '/support/tickets', icon: <Inbox /> },
      { label: 'My Assigned', path: '/support/tickets/assigned', icon: <User />, badge: 5 },
      { label: 'Critical', path: '/support/tickets/critical', icon: <AlertTriangle />, badge: 2 },
    ]
  },
  {
    title: 'Knowledge',
    items: [
      { label: 'Knowledge Base', path: '/support/kb', icon: <Book /> },
      { label: 'Article Editor', path: '/support/kb/editor', icon: <Edit /> },
    ]
  },
  {
    title: 'Metrics',
    items: [
      { label: 'SLA Tracking', path: '/support/sla', icon: <Clock /> },
      { label: 'Agent Performance', path: '/support/performance', icon: <BarChart /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/support/query', icon: <Sparkles /> },
    ]
  },
];
```

### 5.5 Payroll App Sidebar (NEW)

```typescript
const payrollSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/payroll', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'Pay Processing',
    items: [
      { label: 'Pay Runs', path: '/payroll/pay-runs', icon: <Play /> },
      { label: 'Pay Stubs', path: '/payroll/pay-stubs', icon: <FileText /> },
      { label: 'Pay Schedules', path: '/payroll/schedules', icon: <Calendar /> },
    ]
  },
  {
    title: 'Deductions',
    items: [
      { label: 'Tax Withholdings', path: '/payroll/tax', icon: <Percent /> },
      { label: 'Benefits', path: '/payroll/benefits', icon: <Heart /> },
      { label: '401(k)', path: '/payroll/401k', icon: <PiggyBank /> },
    ]
  },
  {
    title: 'Contractors',
    items: [
      { label: '1099 Management', path: '/payroll/1099', icon: <Briefcase /> },
      { label: 'Direct Deposits', path: '/payroll/direct-deposit', icon: <Building /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/payroll/query', icon: <Sparkles /> },
    ]
  },
];
```

### 5.6 Tax App Sidebar (NEW)

```typescript
const taxSidebarConfig: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/tax', icon: <LayoutDashboard /> },
    ]
  },
  {
    title: 'Sales Tax',
    items: [
      { label: 'Tax Rates', path: '/tax/rates', icon: <Percent /> },
      { label: 'Nexus Map', path: '/tax/nexus', icon: <Map /> },
      { label: 'Exemptions', path: '/tax/exemptions', icon: <Shield /> },
    ]
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Quarterly Estimates', path: '/tax/quarterly', icon: <Calendar /> },
      { label: 'Annual Filings', path: '/tax/annual', icon: <FileText /> },
      { label: 'State Registrations', path: '/tax/registrations', icon: <Building /> },
    ]
  },
  {
    title: 'Reports',
    items: [
      { label: 'Tax Liability', path: '/tax/liability', icon: <Scale /> },
      { label: 'Audit Trail', path: '/tax/audit', icon: <Search /> },
      { label: '1099s & W-2s', path: '/tax/forms', icon: <Files /> },
    ]
  },
  {
    items: [
      { label: 'AI Query', path: '/tax/query', icon: <Sparkles /> },
    ]
  },
];
```

---

## 6. URL Structure

### 6.1 Route Conventions

All apps follow a consistent URL pattern:

```
/{app}/{resource}/{id?}/{action?}

Examples:
/hr/employees                    # List employees
/hr/employees/123               # View employee 123
/hr/employees/123/edit          # Edit employee 123
/hr/employees/new               # Create new employee

/finance/invoices?status=pending # Filter invoices
/finance/invoices/456/approve   # Approve invoice action

/sales/opportunities?stage=proposal
/sales/customers/789/opportunities  # Nested resource

/payroll/pay-runs/2024-01       # Pay run by period
/payroll/pay-stubs/emp-123/2024-01  # Specific pay stub

/tax/quarterly/2024-Q1          # Quarterly estimate
/tax/rates?state=CA             # Filter by state
```

### 6.2 Query Parameters

| Purpose | Parameter | Example |
|---------|-----------|---------|
| Filtering | `?status=`, `?stage=`, `?state=` | `?status=pending` |
| Date Range | `?from=`, `?to=` | `?from=2024-01-01&to=2024-03-31` |
| Pagination | `?cursor=`, `?limit=` | `?cursor=abc123&limit=50` |
| Search | `?q=` | `?q=john+doe` |
| Sorting | `?sort=`, `?order=` | `?sort=created&order=desc` |

### 6.3 Deep Linking Examples

```typescript
// From Sales opportunity to Finance invoice
<Link to={`/finance/invoices?opportunity_id=${opportunityId}`}>
  View Related Invoices
</Link>

// From Payroll pay stub to HR employee profile
<Link to={`/hr/employees/${employeeId}`}>
  View Employee Profile
</Link>

// From Tax dashboard to Finance quarterly report
<Link to={`/finance/quarterly/${quarter}`}>
  View Financial Details
</Link>
```

---

## 7. Navigation State Management

### 7.1 Active Route Detection

```tsx
import { useLocation, matchPath } from 'react-router-dom';

function useIsActiveRoute(path: string): boolean {
  const location = useLocation();

  // Exact match for dashboard
  if (path === '/hr' || path === '/finance' || etc) {
    return location.pathname === path;
  }

  // Prefix match for nested routes
  return matchPath({ path, end: false }, location.pathname) !== null;
}
```

### 7.2 Preserving Navigation Context

```tsx
// When navigating with context that should persist
const navigate = useNavigate();

// Store return path
navigate('/finance/invoices/123/approve', {
  state: { returnPath: location.pathname }
});

// On completion, return to original location
const { state } = useLocation();
navigate(state?.returnPath || '/finance/invoices');
```

### 7.3 Cross-App Context Passing

When linking between apps, pass context via URL params (not state):

```tsx
// From Sales to Finance (creating invoice from opportunity)
<Link to={`/finance/invoices/new?customer_id=${customerId}&opportunity_id=${oppId}&amount=${dealValue}`}>
  Create Invoice
</Link>

// Finance app reads params and pre-fills form
const [searchParams] = useSearchParams();
const customerId = searchParams.get('customer_id');
const opportunityId = searchParams.get('opportunity_id');
const amount = searchParams.get('amount');
```

---

## 8. Keyboard Navigation

### 8.1 Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette / search |
| `Ctrl/Cmd + /` | Toggle AI Query panel |
| `Ctrl/Cmd + [` | Navigate back |
| `Ctrl/Cmd + ]` | Navigate forward |
| `Ctrl/Cmd + 1-6` | Switch to app 1-6 |

### 8.2 Focus Management

```tsx
// Skip to main content
<a href="#main-content" className="sr-only focus:not-sr-only
                                   focus:absolute focus:top-4 focus:left-4
                                   bg-primary-500 text-white px-4 py-2 rounded">
  Skip to main content
</a>

// Main content landmark
<main id="main-content" tabIndex={-1}>
  {/* Page content */}
</main>
```

---

## 9. Mobile Navigation

### 9.1 Bottom Navigation Bar

For mobile views, show the 4 most important items + AI Query:

```tsx
<nav className="fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-secondary-200 md:hidden">
  <ul className="flex justify-around items-center h-full">
    <BottomNavItem icon={<Home />} label="Home" path={`/${app}`} />
    <BottomNavItem icon={<primaryIcon />} label="Primary" path={`/${app}/primary`} />
    <BottomNavItem icon={<secondaryIcon />} label="Secondary" path={`/${app}/secondary`} />
    <BottomNavItem icon={<Sparkles />} label="AI" path={`/${app}/query`} />
  </ul>
</nav>
```

### 9.2 Mobile Menu (Hamburger)

```tsx
<Sheet>
  <SheetTrigger className="md:hidden p-2">
    <Menu className="w-6 h-6" />
  </SheetTrigger>
  <SheetContent side="left" className="w-72">
    <SheetHeader>
      <SheetTitle className="flex items-center gap-2">
        {appIcon}
        <span>{appName}</span>
      </SheetTitle>
    </SheetHeader>
    <nav className="mt-6">
      {sidebarConfig.map(section => (
        <SidebarSection key={section.title} section={section} />
      ))}
    </nav>
  </SheetContent>
</Sheet>
```

---

## 10. Navigation Accessibility

### 10.1 Semantic HTML

```html
<header role="banner">...</header>
<nav role="navigation" aria-label="Main navigation">...</nav>
<main role="main">...</main>
<aside role="complementary" aria-label="Sidebar">...</aside>
```

### 10.2 ARIA Attributes

```tsx
// Current page indicator
<Link to="/hr/employees"
      aria-current={isActive ? 'page' : undefined}>
  Employees
</Link>

// Expandable sections
<button aria-expanded={isOpen}
        aria-controls="section-content">
  Section Title
</button>
<div id="section-content" hidden={!isOpen}>
  {children}
</div>

// Badge announcements
<span className="badge" aria-label="12 unread tickets">
  12
</span>
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial navigation patterns |
| 1.1 | Feb 2026 | Added Payroll and Tax sidebar configs |
