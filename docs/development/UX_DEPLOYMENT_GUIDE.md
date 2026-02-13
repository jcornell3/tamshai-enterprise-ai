# UX Engineer Deployment Guide

**Audience**: UX/UI Engineers pushing content to dev and staging environments
**Last Updated**: January 3, 2026

---

## Quick Reference

| Environment | URL | Deployment Method |
|-------------|-----|-------------------|
| **Dev (Local)** | https://www.tamshai-playground.local | `npm run dev` or `docker compose up` |
| **Stage (VPS)** | https://www.tamshai.com | GitHub Actions (push to main) |

---

## Directory Structure

### Web Applications (React/TypeScript)

```
clients/web/
├── apps/                           # Individual applications
│   ├── portal/                     # Main launchpad (Port 4000)
│   │   ├── src/
│   │   │   ├── App.tsx            # Main app component
│   │   │   ├── main.tsx           # Entry point
│   │   │   ├── pages/
│   │   │   │   ├── LandingPage.tsx    # Home page
│   │   │   │   ├── DownloadsPage.tsx  # Desktop downloads
│   │   │   │   └── CallbackPage.tsx   # OAuth callback
│   │   │   ├── index.css          # Global styles
│   │   │   └── App.css            # App-specific styles
│   │   ├── public/                # Static assets
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── hr/                         # HR Application (Port 4001)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── EmployeeDirectoryPage.tsx
│   │   │   │   ├── AIQueryPage.tsx
│   │   │   │   └── CallbackPage.tsx
│   │   │   ├── components/
│   │   │   │   └── Layout.tsx
│   │   │   └── types.ts
│   │   └── ...
│   │
│   ├── finance/                    # Finance Application (Port 4002)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── BudgetsPage.tsx
│   │   │   │   ├── InvoicesPage.tsx
│   │   │   │   ├── ExpenseReportsPage.tsx
│   │   │   │   └── AIQueryPage.tsx
│   │   │   └── components/
│   │   │       └── Layout.tsx
│   │   └── ...
│   │
│   ├── sales/                      # Sales Application (Port 4003)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── OpportunitiesPage.tsx
│   │   │   │   ├── CustomersPage.tsx
│   │   │   │   └── AIQueryPage.tsx
│   │   │   └── components/
│   │   │       ├── Layout.tsx
│   │   │       ├── OpportunityDetail.tsx
│   │   │       ├── CustomerDetail.tsx
│   │   │       └── CloseOpportunityModal.tsx
│   │   └── ...
│   │
│   └── support/                    # Support Application (Port 4004)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── DashboardPage.tsx
│       │   │   ├── TicketsPage.tsx
│       │   │   ├── KnowledgeBasePage.tsx
│       │   │   └── AIQueryPage.tsx
│       │   └── components/
│       │       ├── Layout.tsx
│       │       ├── TicketDetail.tsx
│       │       └── CloseTicketModal.tsx
│       └── ...
│
├── packages/                       # Shared packages (monorepo)
│   ├── ui/                         # Shared UI components
│   │   └── src/
│   │       ├── ApprovalCard.tsx   # v1.4 confirmation component
│   │       ├── TruncationWarning.tsx
│   │       ├── SSEQueryClient.tsx # EventSource streaming
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       └── Input.tsx
│   │
│   ├── auth/                       # Authentication utilities
│   │   └── src/
│   │       ├── AuthProvider.tsx   # OIDC provider wrapper
│   │       ├── useAuth.ts         # Auth hook
│   │       ├── PrivateRoute.tsx   # Protected routes
│   │       ├── config.ts          # Keycloak configuration
│   │       └── types.ts
│   │
│   └── tailwind-config/           # Shared Tailwind CSS
│       └── tailwind.config.js
│
├── package.json                    # Root workspace config
├── turbo.json                      # Turborepo pipeline
└── tsconfig.json                   # Shared TypeScript config
```

### Static Website (Corporate)

```
apps/tamshai-website/
├── src/
│   ├── index.html                  # Homepage
│   ├── client-login.html           # Client login portal
│   ├── employee-login.html         # Employee login portal
│   ├── mission.html                # Mission page
│   ├── leadership.html             # Leadership page
│   ├── blog.html                   # Blog page
│   ├── style.css                   # Global styles
│   ├── tamshai-favicon.png
│   └── assets/
│       ├── emblem.png
│       ├── bg-pattern.png
│       └── icon-*.png
├── nginx.conf
└── Dockerfile
```

---

## Keycloak Integration (SSO)

### What UX Engineers Need to Know

Keycloak provides Single Sign-On (SSO) for all applications. Users authenticate once and can access multiple apps without re-logging.

### Authentication Flow (PKCE)

```
┌─────────────┐     1. Click "Sign In"      ┌─────────────┐
│   Web App   │ ─────────────────────────── │  Keycloak   │
│  (React)    │                              │   Server    │
└─────────────┘                              └─────────────┘
       │                                            │
       │  2. Redirect to Keycloak login page        │
       │ ──────────────────────────────────────────►│
       │                                            │
       │  3. User enters credentials + TOTP         │
       │                                            │
       │  4. Redirect back with authorization code  │
       │◄────────────────────────────────────────── │
       │                                            │
       │  5. Exchange code for tokens (PKCE)        │
       │ ──────────────────────────────────────────►│
       │                                            │
       │  6. Receive access token (5-min lifetime)  │
       │◄────────────────────────────────────────── │
```

### Keycloak URLs by Environment

| Environment | Keycloak URL | Realm |
|-------------|--------------|-------|
| Dev (localhost) | http://localhost:8180/auth | tamshai-corp |
| Dev (Caddy) | https://www.tamshai-playground.local/auth | tamshai-corp |
| Stage (VPS) | https://www.tamshai.com/auth | tamshai-corp |

### Test Users for Development

| Username | Role | Password | TOTP Secret |
|----------|------|----------|-------------|
| eve.thompson | Executive (all access) | `[REDACTED]` | `[REDACTED]` |
| alice.chen | HR Manager | `[REDACTED]` | `[REDACTED]` |
| bob.martinez | Finance Director | `[REDACTED]` | `[REDACTED]` |
| carol.johnson | Sales VP | `[REDACTED]` | `[REDACTED]` |
| dan.williams | Support Director | `[REDACTED]` | `[REDACTED]` |

**TOTP Generation**: Use any authenticator app (Google Authenticator, Authy) with the TOTP secret.

### Adding Redirect URIs for New Apps

If you create a new app or change the port, Keycloak needs to know about it:

1. Access Keycloak Admin: http://localhost:8180/auth/admin
2. Login: admin / admin
3. Select realm: tamshai-corp
4. Go to: Clients → tamshai-website
5. Add to "Valid redirect URIs": `http://localhost:YOUR_PORT/*`
6. Add to "Web origins": `http://localhost:YOUR_PORT`

### Client Configuration File

The auth configuration is in `clients/web/packages/auth/src/config.ts`:

```typescript
// Environment detection - automatically uses correct Keycloak URL
if (hostname === 'tamshai-playground.local' || hostname === 'www.tamshai-playground.local') {
  // Dev with Caddy
  authority: `${origin}/auth/realms/tamshai-corp`
} else if (hostname.includes('tamshai.com')) {
  // Stage/Prod
  authority: `${origin}/auth/realms/tamshai-corp`
} else {
  // Local development
  authority: 'http://127.0.0.1:8180/auth/realms/tamshai-corp'
}
```

---

## Development Environment (Local)

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for full stack)

### Option 1: Vite Dev Server (Hot Reload)

Best for rapid UI development:

```bash
cd clients/web

# Install dependencies
npm install

# Start all apps
npm run dev

# Or start individual apps
cd apps/portal && npm run dev   # http://localhost:4000
cd apps/hr && npm run dev       # http://localhost:4001
cd apps/finance && npm run dev  # http://localhost:4002
cd apps/sales && npm run dev    # http://localhost:4003
cd apps/support && npm run dev  # http://localhost:4004
```

**Note**: Backend services must be running for API calls to work.

### Option 2: Docker Compose (Full Stack)

Includes all services (Keycloak, Kong, MCP Gateway, databases):

```bash
cd infrastructure/docker

# Start everything
docker compose up -d

# Start only web apps
docker compose up -d web-portal web-hr web-finance

# Watch logs
docker compose logs -f web-portal
```

### Option 3: Terraform Dev Environment

Uses Caddy with HTTPS (recommended for SSO testing):

```bash
cd infrastructure/terraform/dev

# First time setup
terraform init
terraform apply -var-file=dev.tfvars

# Access at: https://www.tamshai-playground.local
```

**Prerequisite**: Add to hosts file:
```
127.0.0.1 tamshai-playground.local www.tamshai-playground.local
```

---

## Staging Environment (VPS)

### Deployment Method: GitHub Actions

All deployments to staging happen through GitHub Actions when you push to `main`.

### Pushing Changes to Stage

```bash
# 1. Make your changes in clients/web/

# 2. Test locally
cd clients/web
npm run build
npm run test

# 3. Commit and push
git add .
git commit -m "feat(web): Update portal landing page design"
git push origin main

# 4. Monitor deployment
gh run watch
```

### Manual Deployment (Emergency Only)

If GitHub Actions is unavailable:

```bash
# Trigger deployment manually
gh workflow run deploy-vps.yml --ref main

# Or bootstrap fresh
gh workflow run bootstrap-vps.yml \
  -f environment=staging \
  -f fresh_start=true \
  -f rebuild=true
```

### Verifying Stage Deployment

```bash
# Check website
curl -sf https://www.tamshai.com/ | head -20

# Check Keycloak
curl -sf https://www.tamshai.com/auth/realms/tamshai-corp/.well-known/openid-configuration

# Check API health
curl -sf https://www.tamshai.com/api/health
```

---

## Scripts Reference

### Development Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `npm run dev` | `clients/web/` | Start all apps in dev mode |
| `npm run build` | `clients/web/` | Build all apps for production |
| `npm run test` | `clients/web/` | Run all tests |
| `npm run lint` | `clients/web/` | Lint all TypeScript |
| `npm run typecheck` | `clients/web/` | Type check all apps |

### Infrastructure Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `./scripts/infra/status.sh dev` | Root | Check all service health |
| `./scripts/infra/deploy.sh dev` | Root | Deploy dev environment |
| `./scripts/infra/logs.sh gateway` | Root | View MCP Gateway logs |
| `./scripts/test/login-journey.sh dev` | Root | Test SSO login flow |

### Docker Scripts

```bash
# Build specific app
docker build -f clients/web/apps/portal/Dockerfile \
  -t tamshai-web-portal:latest clients/web

# Start with rebuild
docker compose up -d --build web-portal

# View logs
docker compose logs -f web-portal
```

---

## Making UI Changes

### Modifying Existing Pages

1. Locate the page in `clients/web/apps/{app}/src/pages/`
2. Edit the component
3. Changes appear instantly (Vite hot reload)
4. Test in browser
5. Commit and push

### Adding New Pages

1. Create page component in `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx`:
   ```typescript
   <Route path="/new-page" element={<NewPage />} />
   ```
3. Add navigation link in `src/components/Layout.tsx`
4. Test locally, then push

### Modifying Shared Components

Shared components are in `clients/web/packages/ui/src/`:

1. Edit the component
2. All apps using it will update automatically
3. Test in multiple apps to verify consistency

### Styling Guidelines

- Use **Tailwind CSS** for all styling
- Shared config in `packages/tailwind-config/`
- Brand colors defined in Tailwind config
- Avoid inline styles; use Tailwind classes

---

## Architecture v1.4 Components

### ApprovalCard (Human-in-the-Loop)

Used for destructive operations (delete, approve):

```tsx
import { ApprovalCard } from '@tamshai/ui';

<ApprovalCard
  confirmationId="uuid-from-api"
  message="Delete employee Alice Chen?"
  confirmationData={{ employeeName: "Alice Chen" }}
  onComplete={(success) => {
    if (success) refetchData();
  }}
/>
```

### TruncationWarning

Shows when results exceed 50 records:

```tsx
import { TruncationWarning } from '@tamshai/ui';

{data.metadata?.truncated && (
  <TruncationWarning
    message="Showing 50 of 50+ records"
    returnedCount={50}
    totalEstimate="50+"
  />
)}
```

### SSEQueryClient

For AI streaming queries:

```tsx
import { SSEQueryClient } from '@tamshai/ui';

<SSEQueryClient
  query="List all employees in Engineering"
  onChunk={(chunk) => appendMessage(chunk)}
  onComplete={() => setLoading(false)}
  onError={(err) => showError(err)}
/>
```

---

## Troubleshooting

### CORS Errors

**Symptom**: Browser console shows CORS errors

**Solution**: Check Kong Gateway CORS config in `infrastructure/docker/kong/kong.yml`

### Authentication Redirect Loop

**Symptom**: Keeps redirecting to Keycloak

**Solution**:
1. Clear browser cookies/session
2. Check redirect URI in Keycloak matches your app URL
3. Verify Keycloak is running: `curl http://localhost:8180/auth`

### Styles Not Applied

**Symptom**: Tailwind classes not working

**Solution**:
1. Verify `tailwind.config.js` imports shared config
2. Check `content` array includes your component paths
3. Restart dev server

### Build Fails

**Symptom**: TypeScript or build errors

**Solution**:
```bash
# Clean and rebuild
npm run clean
npm install
npm run typecheck
npm run build
```

---

## Support Contacts

- **Infrastructure Issues**: Check `CLAUDE.md` or open GitHub issue
- **Keycloak Issues**: See `docs/troubleshooting/KEYCLOAK_23_DEEP_DIVE.md`
- **Deployment Issues**: See `docs/deployment/TEARDOWN_REDEPLOY.md`

---

*Document Version: 1.0*
*Architecture Version: 1.4*
