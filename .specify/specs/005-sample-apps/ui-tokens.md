# Tamshai Enterprise UI Tokens

**Version**: 1.0
**Date**: February 2, 2026
**Purpose**: Machine-parseable design tokens for tooling, component libraries, and automated validation

---

## Overview

This file extracts design tokens from DESIGN_SYSTEM.md into a structured format suitable for:
- Component library configuration
- Tailwind CSS generation
- Design token validation
- Automated accessibility testing
- Theme generation

---

## 1. Color Tokens

### 1.1 Primary Palette (Tamshai Blue)

| Token | Value | CSS Variable | Tailwind |
|-------|-------|--------------|----------|
| `primary-50` | `#f0f9ff` | `--color-primary-50` | `bg-primary-50` |
| `primary-100` | `#e0f2fe` | `--color-primary-100` | `bg-primary-100` |
| `primary-200` | `#bae6fd` | `--color-primary-200` | `bg-primary-200` |
| `primary-300` | `#7dd3fc` | `--color-primary-300` | `bg-primary-300` |
| `primary-400` | `#38bdf8` | `--color-primary-400` | `bg-primary-400` |
| `primary-500` | `#0ea5e9` | `--color-primary-500` | `bg-primary-500` |
| `primary-600` | `#0284c7` | `--color-primary-600` | `bg-primary-600` |
| `primary-700` | `#0369a1` | `--color-primary-700` | `bg-primary-700` |
| `primary-800` | `#075985` | `--color-primary-800` | `bg-primary-800` |
| `primary-900` | `#0c4a6e` | `--color-primary-900` | `bg-primary-900` |

### 1.2 Secondary Palette (Slate Gray)

| Token | Value | CSS Variable | Tailwind |
|-------|-------|--------------|----------|
| `secondary-50` | `#f8fafc` | `--color-secondary-50` | `bg-secondary-50` |
| `secondary-100` | `#f1f5f9` | `--color-secondary-100` | `bg-secondary-100` |
| `secondary-200` | `#e2e8f0` | `--color-secondary-200` | `bg-secondary-200` |
| `secondary-300` | `#cbd5e1` | `--color-secondary-300` | `bg-secondary-300` |
| `secondary-400` | `#94a3b8` | `--color-secondary-400` | `bg-secondary-400` |
| `secondary-500` | `#64748b` | `--color-secondary-500` | `bg-secondary-500` |
| `secondary-600` | `#475569` | `--color-secondary-600` | `bg-secondary-600` |
| `secondary-700` | `#334155` | `--color-secondary-700` | `bg-secondary-700` |
| `secondary-800` | `#1e293b` | `--color-secondary-800` | `bg-secondary-800` |
| `secondary-900` | `#0f172a` | `--color-secondary-900` | `bg-secondary-900` |

### 1.3 Semantic Colors

| Token | Value | CSS Variable | Usage |
|-------|-------|--------------|-------|
| `success-50` | `#f0fdf4` | `--color-success-50` | Alert backgrounds |
| `success-100` | `#dcfce7` | `--color-success-100` | Badge backgrounds |
| `success-500` | `#22c55e` | `--color-success-500` | Icons, indicators |
| `success-600` | `#16a34a` | `--color-success-600` | Buttons |
| `success-800` | `#166534` | `--color-success-800` | Badge text |
| `warning-50` | `#fefce8` | `--color-warning-50` | Alert backgrounds |
| `warning-100` | `#fef9c3` | `--color-warning-100` | Badge backgrounds |
| `warning-500` | `#eab308` | `--color-warning-500` | Icons, indicators |
| `warning-600` | `#ca8a04` | `--color-warning-600` | Borders |
| `warning-800` | `#854d0e` | `--color-warning-800` | Badge text |
| `danger-50` | `#fef2f2` | `--color-danger-50` | Alert backgrounds |
| `danger-100` | `#fee2e2` | `--color-danger-100` | Badge backgrounds |
| `danger-500` | `#ef4444` | `--color-danger-500` | Icons, indicators |
| `danger-600` | `#dc2626` | `--color-danger-600` | Destructive buttons |
| `danger-800` | `#991b1b` | `--color-danger-800` | Badge text |

### 1.4 App Accent Colors

| App | Token | Value | CSS Variable |
|-----|-------|-------|--------------|
| HR | `accent-hr` | `#6366f1` | `--color-accent-hr` |
| Finance | `accent-finance` | `#10b981` | `--color-accent-finance` |
| Sales | `accent-sales` | `#f97316` | `--color-accent-sales` |
| Support | `accent-support` | `#8b5cf6` | `--color-accent-support` |
| Payroll | `accent-payroll` | `#14b8a6` | `--color-accent-payroll` |
| Tax | `accent-tax` | `#f43f5e` | `--color-accent-tax` |

---

## 2. Typography Tokens

### 2.1 Font Families

| Token | Value | CSS Variable |
|-------|-------|--------------|
| `font-sans` | `'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | `--font-sans` |
| `font-mono` | `'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace` | `--font-mono` |

### 2.2 Font Sizes

| Token | Size (px) | Size (rem) | Line Height | Tailwind |
|-------|-----------|------------|-------------|----------|
| `text-xs` | 12 | 0.75 | 1.4 | `text-xs` |
| `text-sm` | 14 | 0.875 | 1.4 | `text-sm` |
| `text-base` | 16 | 1.0 | 1.5 | `text-base` |
| `text-lg` | 18 | 1.125 | 1.3 | `text-lg` |
| `text-xl` | 20 | 1.25 | 1.25 | `text-xl` |
| `text-2xl` | 24 | 1.5 | 1.2 | `text-2xl` |
| `text-3xl` | 30 | 1.875 | 1.2 | `text-3xl` |

### 2.3 Font Weights

| Token | Value | Tailwind |
|-------|-------|----------|
| `font-regular` | 400 | `font-normal` |
| `font-medium` | 500 | `font-medium` |
| `font-semibold` | 600 | `font-semibold` |
| `font-bold` | 700 | `font-bold` |

---

## 3. Spacing Tokens

| Token | Value (px) | Value (rem) | Tailwind |
|-------|------------|-------------|----------|
| `space-0` | 0 | 0 | `p-0`, `m-0` |
| `space-1` | 4 | 0.25 | `p-1`, `m-1` |
| `space-2` | 8 | 0.5 | `p-2`, `m-2` |
| `space-3` | 12 | 0.75 | `p-3`, `m-3` |
| `space-4` | 16 | 1.0 | `p-4`, `m-4` |
| `space-5` | 20 | 1.25 | `p-5`, `m-5` |
| `space-6` | 24 | 1.5 | `p-6`, `m-6` |
| `space-8` | 32 | 2.0 | `p-8`, `m-8` |
| `space-10` | 40 | 2.5 | `p-10`, `m-10` |
| `space-12` | 48 | 3.0 | `p-12`, `m-12` |
| `space-16` | 64 | 4.0 | `p-16`, `m-16` |

---

## 4. Border & Shadow Tokens

### 4.1 Border Radius

| Token | Value | CSS Variable | Tailwind |
|-------|-------|--------------|----------|
| `radius-none` | 0 | `--radius-none` | `rounded-none` |
| `radius-sm` | 2px | `--radius-sm` | `rounded-sm` |
| `radius-base` | 4px | `--radius-base` | `rounded` |
| `radius-md` | 6px | `--radius-md` | `rounded-md` |
| `radius-lg` | 8px | `--radius-lg` | `rounded-lg` |
| `radius-xl` | 12px | `--radius-xl` | `rounded-xl` |
| `radius-2xl` | 16px | `--radius-2xl` | `rounded-2xl` |
| `radius-full` | 9999px | `--radius-full` | `rounded-full` |
| `radius-card` | 12px | `--radius-card` | `rounded-card` |

### 4.2 Shadows

| Token | Value | Tailwind |
|-------|-------|----------|
| `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | `shadow-sm` |
| `shadow-base` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | `shadow` |
| `shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | `shadow-md` |
| `shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | `shadow-lg` |
| `shadow-card` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | `shadow-card` |
| `shadow-approval` | `0 4px 6px -1px rgb(234 179 8 / 0.2), 0 2px 4px -2px rgb(234 179 8 / 0.1)` | `shadow-approval` |

---

## 5. Animation Tokens

### 5.1 Timing Functions

| Token | Value | CSS Variable |
|-------|-------|--------------|
| `ease-micro` | `cubic-bezier(0.4, 0, 0.2, 1)` | `--ease-micro` |
| `ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | `--ease-standard` |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | `--ease-out` |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | `--ease-in` |

### 5.2 Durations

| Token | Value | Usage |
|-------|-------|-------|
| `duration-micro` | 150ms | Micro-interactions (hover, focus) |
| `duration-standard` | 200ms | Standard transitions |
| `duration-move` | 300ms | Movement, expansion |
| `duration-page` | 400ms | Page transitions |
| `duration-spin` | 1000ms | Loading spinners |

---

## 6. Breakpoint Tokens

| Token | Width | Media Query | Usage |
|-------|-------|-------------|-------|
| `breakpoint-sm` | 640px | `@media (min-width: 640px)` | Large phones |
| `breakpoint-md` | 768px | `@media (min-width: 768px)` | Tablets |
| `breakpoint-lg` | 1024px | `@media (min-width: 1024px)` | Laptops |
| `breakpoint-xl` | 1280px | `@media (min-width: 1280px)` | Desktops |
| `breakpoint-2xl` | 1536px | `@media (min-width: 1536px)` | Large monitors |

---

## 7. Icon Size Tokens

| Token | Size (px) | Tailwind | Context |
|-------|-----------|----------|---------|
| `icon-xs` | 12 | `w-3 h-3` | Inline indicators |
| `icon-sm` | 16 | `w-4 h-4` | Inline with text |
| `icon-base` | 20 | `w-5 h-5` | Button icons |
| `icon-lg` | 24 | `w-6 h-6` | Card headers |
| `icon-xl` | 32 | `w-8 h-8` | Feature icons |
| `icon-2xl` | 48 | `w-12 h-12` | Empty states |

---

## 8. Z-Index Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `z-base` | 0 | Default content |
| `z-dropdown` | 10 | Dropdowns, tooltips |
| `z-sticky` | 20 | Sticky headers |
| `z-fixed` | 30 | Fixed navigation |
| `z-modal-backdrop` | 40 | Modal backdrop |
| `z-modal` | 50 | Modal content |
| `z-toast` | 60 | Toast notifications |
| `z-tooltip` | 70 | Tooltips (above modals) |

---

## 9. Table Behavior Standards

### 9.1 Required Table Features

| Feature | Requirement | Implementation |
|---------|-------------|----------------|
| **Sorting** | All tables MUST support client-side sorting | Click column header to cycle `asc → desc → none` |
| **Pagination** | Tables with >50 rows MUST implement server-side pagination | Cursor-based with 50 items per page |
| **Selection** | Tables with bulk actions MUST show selection checkbox | First column, appears when `bulkActions` prop present |
| **Empty State** | All tables MUST render empty state | Illustration + action button |
| **Loading State** | All tables MUST use skeleton placeholders | NOT spinners - skeleton rows |
| **Frozen Header** | All scrollable tables MUST freeze header | `position: sticky; top: 0` |

### 9.2 Table Column Types

| Type | Alignment | Formatting | Sortable |
|------|-----------|------------|----------|
| Text | Left | As-is | Yes (alphabetical) |
| Number | Right | Locale-formatted | Yes (numeric) |
| Currency | Right | `$X,XXX.XX` | Yes (numeric) |
| Percent | Right | `X.XX%` | Yes (numeric) |
| Date | Left | `MMM D, YYYY` | Yes (chronological) |
| DateTime | Left | `MMM D, YYYY h:mm A` | Yes (chronological) |
| Status | Center | Badge/Pill | Yes (alphabetical) |
| Actions | Right | Icon buttons | No |

### 9.3 Bulk Action Toolbar

| State | Toolbar Visibility | Content |
|-------|-------------------|---------|
| No selection | Hidden | - |
| 1+ selected | Visible | `"☑ {n} items selected" [Action1] [Action2] ...` |
| All selected | Visible | `"☑ All {n} items selected" [Action1] [Action2] ...` |

---

## 10. Form Input Standards

### 10.1 Input States

| State | Border Color | Background | Shadow |
|-------|--------------|------------|--------|
| Default | `secondary-300` | `white` | None |
| Hover | `secondary-400` | `white` | None |
| Focus | `primary-500` | `white` | `ring-2 ring-primary-500` |
| Disabled | `secondary-200` | `secondary-50` | None |
| Error | `danger-500` | `danger-50` | `ring-2 ring-danger-500` |
| Success | `success-500` | `success-50` | None |

### 10.2 Input Sizes

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| Small | 32px | `px-3 py-1.5` | `text-sm` |
| Medium | 40px | `px-3 py-2` | `text-base` |
| Large | 48px | `px-4 py-3` | `text-base` |

---

## 11. Button Tokens

### 11.1 Button Variants

| Variant | Background | Text | Border | Hover BG |
|---------|------------|------|--------|----------|
| Primary | `primary-500` | `white` | None | `primary-600` |
| Secondary | `white` | `secondary-700` | `secondary-300` | `secondary-50` |
| Destructive | `danger-500` | `white` | None | `danger-600` |
| Ghost | `transparent` | `secondary-700` | None | `secondary-100` |
| Link | `transparent` | `primary-500` | None | Underline |

### 11.2 Button Sizes

| Size | Height | Padding | Font | Icon Size |
|------|--------|---------|------|-----------|
| XS | 24px | `px-2 py-0.5` | `text-xs` | 12px |
| SM | 32px | `px-3 py-1.5` | `text-sm` | 16px |
| MD | 40px | `px-4 py-2` | `text-base` | 20px |
| LG | 48px | `px-6 py-3` | `text-base` | 20px |

---

## 12. Accessibility Requirements

### 12.1 Color Contrast Minimums

| Content Type | WCAG Level | Minimum Ratio |
|--------------|------------|---------------|
| Normal text | AA | 4.5:1 |
| Large text (18px+ bold, 24px+) | AA | 3:1 |
| UI components | AA | 3:1 |
| Decorative | - | No requirement |

### 12.2 Focus Indicators

All interactive elements MUST have visible focus indicators:

```css
/* Standard focus ring */
focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2

/* High contrast mode */
@media (prefers-contrast: high) {
  focus:ring-4 focus:ring-offset-4
}
```

---

## 13. Export Formats

### 13.1 Tailwind Config (JavaScript)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          // ... full palette
        },
        secondary: { /* ... */ },
        success: { /* ... */ },
        warning: { /* ... */ },
        danger: { /* ... */ },
        accent: {
          hr: '#6366f1',
          finance: '#10b981',
          sales: '#f97316',
          support: '#8b5cf6',
          payroll: '#14b8a6',
          tax: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', /* ... */],
        mono: ['JetBrains Mono', /* ... */],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        approval: '0 4px 6px -1px rgb(234 179 8 / 0.2), 0 2px 4px -2px rgb(234 179 8 / 0.1)',
      }
    }
  }
}
```

### 13.2 CSS Custom Properties

```css
:root {
  /* Primary palette */
  --color-primary-50: #f0f9ff;
  --color-primary-500: #0ea5e9;
  /* ... */

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;

  /* Spacing */
  --space-4: 1rem;
  --space-6: 1.5rem;
  /* ... */
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial token extraction from DESIGN_SYSTEM.md |
