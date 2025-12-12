# Tamshai Enterprise AI - Web Applications

## Quick Start

### Development Mode

```bash
# Install dependencies
npm install

# Start all apps in development mode
npm run dev

# Or start individual apps
cd apps/portal && npm run dev  # Port 4000
cd apps/hr && npm run dev      # Port 4001
cd apps/finance && npm run dev # Port 4002
```

### Production Mode (Docker)

```bash
# Build images
docker build -f apps/portal/Dockerfile -t tamshai-web-portal:latest .
docker build -f apps/hr/Dockerfile -t tamshai-web-hr:latest .
docker build -f apps/finance/Dockerfile -t tamshai-web-finance:latest .

# Or use docker-compose
cd ../../infrastructure/docker
docker compose up -d web-portal web-hr web-finance
```

## Applications

### 1. Portal (Port 4000)
Main launchpad application with role-based navigation.

**Features**:
- User profile and logout
- Role-based app cards (HR, Finance)
- Tamshai branding and navigation

**Access**: http://localhost:4000

### 2. HR Application (Port 4001)
Employee directory and management.

**Features**:
- Employee table with search/filter
- Role-based field masking (salary visibility)
- Delete employee with confirmation (v1.4)
- SSE-based AI queries

**Access**: http://localhost:4001

### 3. Finance Application (Port 4002)
Budget dashboard and invoice management.

**Features**:
- Budget chart with Recharts
- Invoice list with filtering
- Delete invoice with confirmation (v1.4)
- Truncation warnings for large datasets

**Access**: http://localhost:4002

## Architecture

### Monorepo Structure

```
clients/web/
├── apps/
│   ├── portal/          # Main launchpad (4000)
│   ├── hr/              # HR app (4001)
│   └── finance/         # Finance app (4002)
├── packages/
│   ├── ui/              # Shared UI components (v1.4)
│   ├── auth/            # Authentication utilities
│   └── tailwind-config/ # Shared Tailwind preset
├── package.json         # Root workspace config
├── turbo.json           # Turborepo pipeline
└── tsconfig.json        # Shared TypeScript config
```

### Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.0 | UI framework |
| TypeScript | 5.3.3 | Type safety |
| Vite | 5.4.21 | Build tool & dev server |
| Tailwind CSS | 3.4.0 | Utility-first styling |
| Turborepo | 2.6.3 | Monorepo build system |
| react-oidc-context | 3.0.0 | OIDC authentication |
| @tanstack/react-query | 5.0.0 | Data fetching |
| react-router-dom | 6.20.0 | Client-side routing |
| recharts | 2.10.0 | Charts (Finance app) |

### Shared Packages

#### @tamshai/ui
Shared UI components with Architecture v1.4 features:
- `ApprovalCard` - Human-in-the-loop confirmations
- `TruncationWarning` - 50-record limit warnings
- `SSEQueryClient` - EventSource streaming client
- `Button`, `Card`, `Input` - Base components

#### @tamshai/auth
Authentication utilities:
- `AuthProvider` - OIDC provider wrapper
- `useAuth` - Authentication hook
- `PrivateRoute` - Protected route component
- Token management (in-memory only)

#### @tamshai/tailwind-config
Shared Tailwind CSS configuration:
- Tamshai brand colors
- Custom utilities
- Responsive breakpoints
- Plugins: forms, typography

## Development Commands

### Root Commands

```bash
# Install all dependencies
npm install

# Build all applications
npm run build

# Run all tests
npm run test

# Type check all apps
npm run typecheck

# Lint all apps
npm run lint

# Clean all build artifacts
npm run clean
```

### Per-App Commands

```bash
cd apps/portal  # or apps/hr, apps/finance

# Development with hot reload
npm run dev

# Production build
npm run build

# Type check only
npm run typecheck

# Lint TypeScript
npm run lint

# Preview production build
npm run preview

# Clean build artifacts
npm run clean
```

## Build Output

### Development Build Stats

| Application | JS Size | CSS Size | Build Time |
|-------------|---------|----------|------------|
| Portal | 244 KB (gzip: 74 KB) | 43 KB (gzip: 7 KB) | ~2s |
| HR | 303 KB (gzip: 91 KB) | 47 KB (gzip: 7 KB) | ~2s |
| Finance | 266 KB (gzip: 81 KB) | 42 KB (gzip: 7 KB) | ~2s |

### Docker Image Sizes

All images: **81.6 MB** each (Alpine-based)

## Environment Variables

Create `.env.local` in each app directory:

```bash
# Keycloak Configuration
VITE_KEYCLOAK_URL=http://localhost:8180
VITE_KEYCLOAK_REALM=tamshai-corp
VITE_KEYCLOAK_CLIENT_ID=mcp-gateway

# API Endpoints
VITE_API_GATEWAY_URL=http://localhost:8100
VITE_MCP_GATEWAY_URL=http://localhost:3100

# Application Info
VITE_APP_NAME=Tamshai Enterprise AI
VITE_APP_VERSION=1.4.0
```

**Note**: See `.env.example` for full template.

## Authentication

All applications use **OIDC PKCE flow** with Keycloak:

### Test Users

| Username | Role | Position | Access |
|----------|------|----------|--------|
| eve.thompson | executive | CEO | All apps |
| alice.chen | hr-read, hr-write | VP of HR | HR app |
| bob.martinez | finance-read, finance-write | Finance Director | Finance app |
| carol.johnson | sales-read, sales-write | VP of Sales | None (no web app yet) |

**Password**: `password123`
**TOTP Secret**: `JBSWY3DPEHPK3PXP`

### Login Flow

1. User clicks "Sign In" button
2. Redirect to Keycloak: `http://localhost:8180/realms/tamshai-corp/protocol/openid-connect/auth`
3. User enters credentials + TOTP code
4. Keycloak redirects back with authorization code
5. App exchanges code for tokens (PKCE)
6. Tokens stored in memory (React state)
7. Access token (5-minute lifetime) used for API calls

## Architecture v1.4 Features

### 1. SSE Streaming (Section 6.1)

**EventSource API** for real-time AI responses:

```typescript
// SSEQueryClient usage
const eventSource = new EventSource('/api/query?q=...');
eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }
  appendChunk(JSON.parse(event.data));
};
```

**Benefits**:
- No timeouts during 30-60s Claude reasoning
- Chunk-by-chunk response rendering
- Better user experience

### 2. Human-in-the-Loop Confirmations (Section 5.6)

**ApprovalCard component** for destructive operations:

```typescript
<ApprovalCard
  confirmationId="uuid-here"
  message="⚠️ Delete employee Alice Chen?"
  confirmationData={{ employeeName: "Alice Chen" }}
  onComplete={(success) => refetchData()}
/>
```

**Features**:
- 5-minute confirmation timeout
- User approval required before execution
- POST `/api/confirm/:id` with `{ approved: true/false }`

### 3. Truncation Warnings (Section 5.3)

**TruncationWarning component** when results exceed 50 records:

```typescript
<TruncationWarning
  message="⚠️ Showing 50 of 50+ records. Refine your query."
  returnedCount={50}
  totalEstimate="50+"
/>
```

**Constitutional Compliance**: Article III.2 (50-record limit)

### 4. LLM-Friendly Errors (Section 7.4)

**Structured error responses** with suggested actions:

```json
{
  "status": "error",
  "code": "EMPLOYEE_NOT_FOUND",
  "message": "Employee with ID xyz not found",
  "suggestedAction": "Use list_employees to find valid IDs"
}
```

**Constitutional Compliance**: Article II.3

## Testing

### Unit Tests (Jest + React Testing Library)

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Integration Tests

```bash
# Start backend services first
cd infrastructure/docker
docker compose up -d

# Run integration tests
cd clients/web
npm run test:integration
```

### E2E Tests (Playwright)

```bash
# Install Playwright
npm install -D @playwright/test

# Run E2E tests
npm run test:e2e
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy

```bash
# Build and start all services
cd infrastructure/docker
docker compose up -d --build

# Check health
curl http://localhost:4000/health
curl http://localhost:4001/health
curl http://localhost:4002/health
```

## Troubleshooting

### Issue: `Cannot find module '@tamshai/ui'`

**Solution**: Install dependencies from root:
```bash
npm install
```

### Issue: TypeScript errors in imports

**Solution**: Rebuild TypeScript project references:
```bash
npm run typecheck
```

### Issue: Tailwind styles not applied

**Solution**: Check Tailwind config is properly imported:
```javascript
// apps/portal/tailwind.config.js
export default {
  presets: [require('@tamshai/tailwind-config')],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
};
```

### Issue: CORS errors in browser

**Solution**: Update Kong Gateway CORS configuration:
```yaml
# infrastructure/docker/kong/kong.yml
origins:
  - http://localhost:4000
  - http://localhost:4001
  - http://localhost:4002
```

### Issue: Keycloak redirect fails

**Solution**: Check redirect URIs in Keycloak:
```bash
# Add redirect URI: http://localhost:4000/*
# Repeat for 4001 and 4002
```

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow Airbnb React/JSX style guide
- Use Prettier for formatting
- Use ESLint for linting

### Component Structure

```typescript
// Good component structure
import React from 'react';

interface Props {
  title: string;
  onSubmit: () => void;
}

export const MyComponent: React.FC<Props> = ({ title, onSubmit }) => {
  return (
    <div className="p-4">
      <h1>{title}</h1>
      <button onClick={onSubmit}>Submit</button>
    </div>
  );
};
```

### Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting
- `refactor:` - Code restructuring
- `test:` - Add tests
- `chore:` - Maintenance

## Related Documentation

- [Architecture Overview](../../docs/architecture/overview.md)
- [CLAUDE.md](../../CLAUDE.md) - Development patterns
- [V1.4 Code Examples](../../docs/development/V1.4_CODE_EXAMPLES.md)
- [Deployment Guide](./DEPLOYMENT.md)

## Support

For issues or questions:
1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting section
2. Review logs: `docker compose logs -f [service]`
3. Open GitHub issue: https://github.com/jcornell3/tamshai-enterprise-ai/issues

---

**Last Updated**: December 11, 2025
**Architecture Version**: 1.4
**Document Version**: 1.0
