# Tamshai Enterprise AI Design System

## 1. Overview

This document defines the shared visual design language for all Tamshai Enterprise AI web applications. All six domain apps (HR, Finance, Sales, Support, Payroll, Tax) must adhere to these standards to ensure a consistent, professional user experience.

**Applies to**: Portal, HR, Finance, Sales, Support, Payroll, Tax applications

---

## 2. Brand Colors

### 2.1 Primary Palette (Tamshai Blue)

The primary brand color represents trust, professionalism, and enterprise reliability.

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-50` | `#f0f9ff` | Background tints, hover states |
| `primary-100` | `#e0f2fe` | Selected item backgrounds |
| `primary-200` | `#bae6fd` | Borders, dividers |
| `primary-300` | `#7dd3fc` | Secondary buttons (hover) |
| `primary-400` | `#38bdf8` | Links (hover) |
| `primary-500` | `#0ea5e9` | **Primary buttons, links, active states** |
| `primary-600` | `#0284c7` | Primary buttons (hover) |
| `primary-700` | `#0369a1` | Primary buttons (pressed) |
| `primary-800` | `#075985` | Dark mode primary |
| `primary-900` | `#0c4a6e` | Dark mode text |

### 2.2 Secondary Palette (Slate Gray)

Used for text, backgrounds, and neutral UI elements.

| Token | Hex | Usage |
|-------|-----|-------|
| `secondary-50` | `#f8fafc` | Page backgrounds |
| `secondary-100` | `#f1f5f9` | Card backgrounds, alternating rows |
| `secondary-200` | `#e2e8f0` | Borders, dividers |
| `secondary-300` | `#cbd5e1` | Disabled states |
| `secondary-400` | `#94a3b8` | Placeholder text |
| `secondary-500` | `#64748b` | Secondary text |
| `secondary-600` | `#475569` | Body text |
| `secondary-700` | `#334155` | Headings |
| `secondary-800` | `#1e293b` | Navigation, sidebars |
| `secondary-900` | `#0f172a` | Primary text |

### 2.3 Semantic Colors

#### Success (Green)
| Token | Hex | Usage |
|-------|-----|-------|
| `success-50` | `#f0fdf4` | Success alert background |
| `success-500` | `#22c55e` | Success icons, badges |
| `success-600` | `#16a34a` | Success buttons |

**Use cases**: Approved budgets, closed-won deals, resolved tickets, successful payroll runs

#### Warning (Amber)
| Token | Hex | Usage |
|-------|-----|-------|
| `warning-50` | `#fefce8` | Warning alert background |
| `warning-500` | `#eab308` | Warning icons, truncation badges |
| `warning-600` | `#ca8a04` | Warning borders |

**Use cases**: Truncation warnings, pending approvals, SLA warnings, tax deadline alerts

#### Danger (Red)
| Token | Hex | Usage |
|-------|-----|-------|
| `danger-50` | `#fef2f2` | Error alert background |
| `danger-500` | `#ef4444` | Error icons, badges |
| `danger-600` | `#dc2626` | Destructive buttons, reject actions |

**Use cases**: Overdue invoices, critical tickets, failed transactions, tax violations

### 2.4 App-Specific Accent Colors

Each app has a subtle accent for quick visual identification in the sidebar/header:

| App | Accent Color | Hex | Usage |
|-----|--------------|-----|-------|
| HR | Indigo | `#6366f1` | People-focused, professional |
| Finance | Emerald | `#10b981` | Money, growth, stability |
| Sales | Orange | `#f97316` | Energy, momentum, deals |
| Support | Violet | `#8b5cf6` | Service, help, knowledge |
| Payroll | Teal | `#14b8a6` | Compensation, benefits |
| Tax | Rose | `#f43f5e` | Compliance, deadlines |

---

## 3. Typography

### 3.1 Font Stack

```css
/* Primary (UI text) */
font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monospace (code, IDs, amounts) */
font-family: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;
```

### 3.2 Type Scale

| Element | Size | Weight | Line Height | Token |
|---------|------|--------|-------------|-------|
| Page Title | 24px / 1.5rem | 700 (Bold) | 1.2 | `text-2xl font-bold` |
| Section Header | 20px / 1.25rem | 600 (Semibold) | 1.25 | `text-xl font-semibold` |
| Card Title | 18px / 1.125rem | 600 (Semibold) | 1.3 | `text-lg font-semibold` |
| Body Text | 16px / 1rem | 400 (Regular) | 1.5 | `text-base` |
| Small Text | 14px / 0.875rem | 400 (Regular) | 1.4 | `text-sm` |
| Caption | 12px / 0.75rem | 500 (Medium) | 1.4 | `text-xs font-medium` |
| Monospace | 14px / 0.875rem | 400 (Regular) | 1.5 | `font-mono text-sm` |

### 3.3 Text Colors

| Purpose | Color Token | Tailwind Class |
|---------|-------------|----------------|
| Primary text | `secondary-900` | `text-secondary-900` |
| Secondary text | `secondary-600` | `text-secondary-600` |
| Muted text | `secondary-500` | `text-secondary-500` |
| Disabled text | `secondary-400` | `text-secondary-400` |
| Link | `primary-500` | `text-primary-500` |
| Link (hover) | `primary-600` | `hover:text-primary-600` |

---

## 4. Spacing System

Based on 4px base unit (Tailwind default).

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Inline element gaps |
| `space-2` | 8px | Icon-text gaps |
| `space-3` | 12px | Small component padding |
| `space-4` | 16px | Standard card padding, form gaps |
| `space-6` | 24px | Section padding, card gaps |
| `space-8` | 32px | Page section margins |
| `space-12` | 48px | Large section separators |

### 4.1 Grid System

```
| Breakpoint | Width | Columns | Gutter |
|------------|-------|---------|--------|
| sm | 640px | 4 | 16px |
| md | 768px | 8 | 24px |
| lg | 1024px | 12 | 24px |
| xl | 1280px | 12 | 32px |
| 2xl | 1536px | 12 | 32px |
```

---

## 5. Component Library

### 5.1 Buttons

#### Primary Button
```html
<button class="bg-primary-500 hover:bg-primary-600 active:bg-primary-700
               text-white font-medium px-4 py-2 rounded-lg
               transition-colors duration-150">
  Action
</button>
```

#### Secondary Button
```html
<button class="bg-white border border-secondary-300 hover:bg-secondary-50
               text-secondary-700 font-medium px-4 py-2 rounded-lg
               transition-colors duration-150">
  Cancel
</button>
```

#### Destructive Button
```html
<button class="bg-danger-500 hover:bg-danger-600 active:bg-danger-700
               text-white font-medium px-4 py-2 rounded-lg
               transition-colors duration-150">
  Delete
</button>
```

#### Button Sizes
| Size | Padding | Font | Height |
|------|---------|------|--------|
| Small | `px-3 py-1.5` | `text-sm` | 32px |
| Medium | `px-4 py-2` | `text-base` | 40px |
| Large | `px-6 py-3` | `text-base` | 48px |

### 5.2 Cards

#### Standard Card
```html
<div class="bg-white rounded-card shadow-card p-6">
  <h3 class="text-lg font-semibold text-secondary-900 mb-4">Card Title</h3>
  <p class="text-secondary-600">Card content...</p>
</div>
```

#### Metric Card (Dashboard)
```html
<div class="bg-white rounded-card shadow-card p-4">
  <p class="text-sm font-medium text-secondary-500 uppercase tracking-wide">Metric Label</p>
  <p class="text-3xl font-bold text-secondary-900 mt-1">$125,000</p>
  <p class="text-sm text-success-600 mt-2">+12.5% from last month</p>
</div>
```

#### Approval Card (v1.4)
```html
<div class="border-2 border-warning-500 bg-warning-50 rounded-card p-4 shadow-approval">
  <div class="flex items-center gap-2 mb-3">
    <WarningIcon class="w-5 h-5 text-warning-600" />
    <h3 class="font-semibold text-secondary-900">Confirm Action Required</h3>
  </div>
  <p class="text-secondary-700 whitespace-pre-wrap mb-4">{message}</p>
  <div class="flex gap-3">
    <button class="bg-success-600 text-white px-4 py-2 rounded-lg">Approve</button>
    <button class="bg-danger-600 text-white px-4 py-2 rounded-lg">Reject</button>
  </div>
</div>
```

### 5.3 Forms

#### Text Input
```html
<div class="space-y-1">
  <label class="block text-sm font-medium text-secondary-700">Label</label>
  <input type="text"
         class="w-full px-3 py-2 border border-secondary-300 rounded-lg
                focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                placeholder:text-secondary-400"
         placeholder="Placeholder text" />
  <p class="text-xs text-secondary-500">Helper text</p>
</div>
```

#### Select
```html
<select class="w-full px-3 py-2 border border-secondary-300 rounded-lg
               focus:ring-2 focus:ring-primary-500 focus:border-primary-500
               bg-white">
  <option value="">Select an option</option>
  <option value="1">Option 1</option>
</select>
```

### 5.4 Tables

```html
<table class="w-full">
  <thead class="bg-secondary-50 border-b border-secondary-200">
    <tr>
      <th class="px-4 py-3 text-left text-xs font-semibold text-secondary-600 uppercase tracking-wider">
        Column
      </th>
    </tr>
  </thead>
  <tbody class="divide-y divide-secondary-100">
    <tr class="hover:bg-secondary-50 transition-colors">
      <td class="px-4 py-3 text-sm text-secondary-900">Cell</td>
    </tr>
  </tbody>
</table>
```

### 5.5 Badges / Status Pills

```html
<!-- Success -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-success-100 text-success-800">
  Active
</span>

<!-- Warning -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-warning-100 text-warning-800">
  Pending
</span>

<!-- Danger -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-danger-100 text-danger-800">
  Overdue
</span>
```

### 5.6 Truncation Warning Badge (v1.4)

```html
<div class="flex items-center gap-2 px-3 py-2 bg-warning-50 border border-warning-200 rounded-lg">
  <AlertTriangleIcon class="w-4 h-4 text-warning-600" />
  <span class="text-sm text-warning-800">
    Showing 50 of 100+ results. Please refine your search.
  </span>
</div>
```

---

## 6. Icons

### 6.1 Icon Library

Use **Lucide React** for consistency across all apps.

```bash
npm install lucide-react
```

### 6.2 Icon Sizes

| Context | Size | Tailwind Class |
|---------|------|----------------|
| Inline with text | 16px | `w-4 h-4` |
| Button icon | 20px | `w-5 h-5` |
| Card header | 24px | `w-6 h-6` |
| Feature icon | 32px | `w-8 h-8` |
| Empty state | 48px | `w-12 h-12` |

### 6.3 Common Icons by App

| HR | Finance | Sales | Support | Payroll | Tax |
|----|---------|-------|---------|---------|-----|
| Users | DollarSign | TrendingUp | Headphones | Wallet | FileText |
| UserPlus | CreditCard | Target | MessageSquare | Calculator | Receipt |
| Building | PieChart | Handshake | Book | Clock | Scale |
| Calendar | FileText | Phone | HelpCircle | Banknote | AlertTriangle |

---

## 7. Motion & Animation

### 7.1 Timing Functions

| Purpose | Duration | Easing |
|---------|----------|--------|
| Micro-interactions | 150ms | `ease-out` |
| Standard transitions | 200ms | `ease-in-out` |
| Larger movements | 300ms | `ease-out` |
| Page transitions | 400ms | `ease-in-out` |

### 7.2 Animation Classes

```css
/* Fade in */
.animate-fade-in {
  animation: fadeIn 0.2s ease-in-out;
}

/* Slide up (for toasts, modals) */
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}

/* Spinner (for loading states) */
.animate-spin {
  animation: spin 1s linear infinite;
}
```

### 7.3 Loading States

```html
<!-- Skeleton loader -->
<div class="animate-pulse">
  <div class="h-4 bg-secondary-200 rounded w-3/4 mb-2"></div>
  <div class="h-4 bg-secondary-200 rounded w-1/2"></div>
</div>

<!-- Spinner -->
<svg class="animate-spin w-5 h-5 text-primary-500" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25" />
  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
</svg>
```

---

## 8. Responsive Design

### 8.1 Breakpoint Usage

| Breakpoint | Target Devices | Layout Pattern |
|------------|----------------|----------------|
| Default (mobile) | Phones (<640px) | Single column, stacked cards |
| `sm:` | Large phones (640px+) | 2-column grids |
| `md:` | Tablets (768px+) | Sidebar + content |
| `lg:` | Laptops (1024px+) | Full navigation, multi-column |
| `xl:` | Desktops (1280px+) | Wider content areas |
| `2xl:` | Large monitors (1536px+) | Maximum width containers |

### 8.2 Container Widths

```html
<!-- Standard page container -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <!-- Content -->
</div>

<!-- Narrow content (forms, detail pages) -->
<div class="max-w-3xl mx-auto px-4 sm:px-6">
  <!-- Content -->
</div>
```

---

## 9. Accessibility

### 9.1 Color Contrast

All text must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 contrast ratio minimum
- Large text (18px+ bold or 24px+): 3:1 minimum
- UI components: 3:1 minimum

### 9.2 Focus States

All interactive elements must have visible focus indicators:

```css
focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:outline-none
```

### 9.3 Screen Reader Support

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- Include `aria-label` for icon-only buttons
- Use `role="alert"` for dynamic error messages
- Provide skip links for keyboard navigation

---

## 10. Dark Mode (Future)

Reserved color tokens for future dark mode implementation:

```javascript
// tailwind.config.js (future)
darkMode: 'class',
theme: {
  extend: {
    colors: {
      dark: {
        bg: '#0f172a',      // secondary-900
        surface: '#1e293b', // secondary-800
        border: '#334155',  // secondary-700
        text: '#f1f5f9',    // secondary-100
      }
    }
  }
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial design system based on existing apps |
| 1.1 | Feb 2026 | Added Payroll and Tax app accent colors |
