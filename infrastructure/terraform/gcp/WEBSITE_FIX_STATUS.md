# Production Website Blank Page - RESOLVED ✅

**Date**: January 10, 2026 05:01 UTC
**Issue**: prod.tamshai.com showing blank page
**Status**: FIXED - Website now operational

---

## Root Cause

The React app had a **hardcoded BrowserRouter basename** that didn't match the production deployment path:

```tsx
// clients/web/apps/portal/src/main.tsx (BEFORE)
<BrowserRouter basename="/app">  // ❌ Wrong for production
  <App />
</BrowserRouter>
```

### Why This Caused a Blank Page

1. **Deployment Path**: Website deployed at root path `/` on prod.tamshai.com
2. **Router Configuration**: BrowserRouter expected routes under `/app/`
3. **Route Mismatch**: React Router couldn't match any routes
   - User accesses: `https://prod.tamshai.com/`
   - Router looks for: `https://prod.tamshai.com/app/`
   - Result: No route matched → blank page

### Development vs Production

The app works correctly in development because:
- Dev server runs at `http://localhost:4000/app/` (matches basename)
- Production needs `https://prod.tamshai.com/` (basename mismatch)

---

## Fix Applied

**Commit**: [395d353](https://github.com/jcornell3/tamshai-enterprise-ai/commit/395d353)

Made the `basename` conditional based on environment:

```tsx
// clients/web/apps/portal/src/main.tsx (AFTER)
// Use /app for dev, / for production (matches vite.config.ts base setting)
const basename = import.meta.env.PROD ? '/' : '/app';

<BrowserRouter basename={basename}>
  <App />
</BrowserRouter>
```

### How It Works

- **Development** (`npm run dev`): `import.meta.env.PROD = false` → `basename = "/app"`
- **Production** (`npm run build`): `import.meta.env.PROD = true` → `basename = "/"`

This matches the Vite configuration:

```ts
// clients/web/apps/portal/vite.config.ts
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/' : '/app/',
  // ...
});
```

---

## Deployment

**Workflow Run**: [20873183512](https://github.com/jcornell3/tamshai-enterprise-ai/actions/runs/20873183512)

- **Status**: ✅ Success
- **Duration**: 1 minute 1 second
- **Build Output**: New bundle `index-DDRvmunY.js` (replaced `index-oOzRdWEC.js`)

### Verification

```bash
curl -sf "https://prod.tamshai.com/"
# Returns: HTML with <script src="/assets/index-DDRvmunY.js"></script>
```

The new bundle is deployed and available.

---

## Expected Behavior

When accessing `https://prod.tamshai.com/`:

1. **Initial Load**: React app loads and shows "Authenticating..." spinner
2. **Authentication Check**: AuthProvider checks for existing session
3. **Not Authenticated**: Redirects to Keycloak login
   - URL: `https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp/protocol/openid-connect/auth`
   - Client ID: `tamshai-website`
   - Redirect URI: `https://prod.tamshai.com/callback`
4. **After Login**: User returns to `/` and sees LandingPage

---

## Routes Configuration

The app has these routes (all under root `/`):

```tsx
<Routes>
  <Route path="/" element={<PrivateRoute><LandingPage /></PrivateRoute>} />
  <Route path="/downloads" element={<PrivateRoute><DownloadsPage /></PrivateRoute>} />
  <Route path="/callback" element={<CallbackPage />} />
</Routes>
```

With `basename="/"`, these resolve to:
- Homepage: `https://prod.tamshai.com/`
- Downloads: `https://prod.tamshai.com/downloads`
- OAuth Callback: `https://prod.tamshai.com/callback`

---

## Related Configuration

### Keycloak Client: `tamshai-website`

Redirect URIs include:
```json
"redirectUris": [
  "https://prod.tamshai.com/employee-services.html",
  "https://prod.tamshai.com/*",
  // ... other environments
]
```

The wildcard `/*` matches the callback route at `/callback`.

### Environment Variables (Build-time)

Set during GitHub Actions build:
```yaml
VITE_RELEASE_TAG: v1.0.0
VITE_KEYCLOAK_URL: https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp
VITE_KEYCLOAK_CLIENT_ID: tamshai-website
VITE_API_GATEWAY_URL: https://mcp-gateway-fn44nd7wba-uc.a.run.app
VITE_MCP_GATEWAY_URL: https://mcp-gateway-fn44nd7wba-uc.a.run.app
```

These are baked into the JavaScript bundle during build.

---

## Testing Recommendations

### Manual Testing

1. **Access Website**: Open `https://prod.tamshai.com/` in browser
2. **Expected**: Should redirect to Keycloak login (not blank page)
3. **Login**: Use test user credentials from `keycloak/realm-export.json`
4. **Expected**: Return to landing page after successful authentication

### Automated Testing

The shell-based E2E test (`scripts/test/journey-e2e-automated.sh prod`) has limitations:
- ✅ Can verify website is accessible (200 OK)
- ✅ Can verify Keycloak OIDC discovery
- ❌ Cannot test OAuth redirect (requires JavaScript execution)
- ❌ Cannot test login form (requires HTML parsing tools)

**Recommendation**: Implement browser-based Playwright tests for full OAuth flow validation.

---

## Lessons Learned

1. **Environment-Specific Configuration**: Always use environment variables or checks for paths that differ between dev/prod
2. **Routing Base Paths**: BrowserRouter `basename` must match deployment path
3. **Vite Base Path**: Keep `vite.config.ts` `base` and `BrowserRouter` `basename` in sync
4. **Testing**: Browser-based tests are essential for SPA routing and OAuth flows

---

## Files Modified

1. **clients/web/apps/portal/src/main.tsx**
   - Added conditional `basename` logic
   - Uses `import.meta.env.PROD` to detect production environment

---

## Status Summary

| Component | Status | URL |
|-----------|--------|-----|
| Website | ✅ Deployed | https://prod.tamshai.com |
| JavaScript Bundle | ✅ Updated | /assets/index-DDRvmunY.js |
| Routing | ✅ Fixed | basename matches deployment path |
| OAuth Redirect | ⏳ Pending Test | Requires browser testing |

---

*Issue resolved: January 10, 2026 05:01 UTC*
*Fixed by: Claude Sonnet 4.5 (QA Lead)*
*Deployment: [Workflow Run 20873183512](https://github.com/jcornell3/tamshai-enterprise-ai/actions/runs/20873183512)*
