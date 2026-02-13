# UI Synchronization - React & Flutter

Ensure consistent UI across web (React/Tailwind) and mobile (Flutter) clients.

## Purpose

Maintain a single "UI Specification Source of Truth" that drives both platforms, ensuring branding, spacing, and component logic are mathematically identical.

## Design System Location

`.specify/specs/005-sample-apps/DESIGN_SYSTEM.md`

## Tailwind Configuration (Web)

Location: `clients/web/packages/ui/tailwind.config.js`

### Color Tokens
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          // ... full scale
          900: '#0c4a6e',
        },
        secondary: { /* ... */ },
        success: { /* ... */ },
        warning: { /* ... */ },
        error: { /* ... */ },
      },
      spacing: {
        // Use 4px base unit
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      },
    },
  },
};
```

## Flutter Theme (Mobile)

Location: `clients/unified_flutter/lib/core/theme/`

### Equivalent Flutter Theme
```dart
class AppColors {
  static const primary50 = Color(0xFFF0F9FF);
  static const primary100 = Color(0xFFE0F2FE);
  // ... match Tailwind values exactly
}

class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
}
```

## Component Mapping

| Web Component | Flutter Widget | Purpose |
|---------------|----------------|---------|
| `<Card>` | `AppCard` | Content container |
| `<Button>` | `AppButton` | Actions |
| `<Badge>` | `StatusBadge` | Status indicators |
| `<Modal>` | `AppDialog` | Dialogs |
| `<Table>` | `DataTable` | Data display |
| `<Tabs>` | `TabBar` | Navigation |

## Workflow for UI Changes

1. **Update Design System** in `.specify/specs/005-sample-apps/DESIGN_SYSTEM.md`
2. **Generate Tailwind config** from spec
3. **Generate Flutter theme** from spec
4. **Update shared UI package** (`clients/web/packages/ui/`)
5. **Update Flutter widgets** (`clients/unified_flutter/lib/core/widgets/`)
6. **Verify visual parity** with screenshots

## Verification

- Use Storybook for web components
- Use Flutter widget tests with golden files
- Compare screenshots across platforms
