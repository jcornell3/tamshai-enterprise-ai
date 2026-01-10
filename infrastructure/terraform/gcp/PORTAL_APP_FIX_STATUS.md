# Production Portal App Blank Page - RESOLVED ✅

**Date**: January 10, 2026 05:52 UTC
**Issue**: Clicking "Sign in with SSO" on prod.tamshai.com shows blank page
**Status**: FIXED - Portal app now loads correctly

---

## Root Cause

The React portal app had incorrect `basename` and `base` path configuration:

```tsx
// clients/web/apps/portal/src/main.tsx (BEFORE - WRONG)
const basename = import.meta.env.PROD ? '/' : '/app';  // ❌ Wrong for production
```

```typescript
// clients/web/apps/portal/vite.config.ts (BEFORE - WRONG)
base: process.env.NODE_ENV === 'production' ? '/' : '/app/',  // ❌ Wrong for production
```

### Why This Caused a Blank Page

1. **Deployment Path**: Portal app deployed at `/app/` on prod.tamshai.com
2. **Router Configuration**: BrowserRouter expected routes under `/` (root)
3. **Asset Paths**: Vite generated asset URLs without `/app/` prefix
4. **Route Mismatch**: React Router couldn't match any routes
   - User accesses: `https://prod.tamshai.com/app/`
   - Router looks for: `https://prod.tamshai.com/`
   - Assets load from: `https://prod.tamshai.com/assets/...` (404 - wrong path)
   - Result: Assets fail to load, no routes matched → blank page

### Environment Consistency

The portal app is deployed at `/app/` path in ALL environments:
- **Dev**: `http://localhost:4000/app/`
- **Stage**: `https://vps.tamshai.com/app/`
- **Prod**: `https://prod.tamshai.com/app/`

The `basename` and `base` should be `/app` consistently across all environments.

---

## Fix Applied

**Commit**: [d7f9bae](https://github.com/jcornell3/tamshai-enterprise-ai/commit/d7f9bae)

### Fix 1: BrowserRouter basename

```tsx
// clients/web/apps/portal/src/main.tsx (AFTER - CORRECT)
// Portal app is always served at /app/ path in all environments
const basename = '/app';

<BrowserRouter basename={basename}>
  <App />
</BrowserRouter>
```

### Fix 2: Vite base path

```typescript
// clients/web/apps/portal/vite.config.ts (AFTER - CORRECT)
export default defineConfig({
  plugins: [react()],
  // Portal app is always served at /app/ path in all environments
  base: '/app/',
  // ...
});
```

### How It Works

- **BrowserRouter basename**: `/app` - Routes match correctly at `/app/` path
- **Vite base**: `/app/` - Assets generate with `/app/assets/...` prefix
- **Asset URLs**: `<script src="/app/assets/index-C-5yRytR.js">` (correct)
- **CSS URLs**: `<link href="/app/assets/index-CuHCodkk.css">` (correct)

---

## Deployment

**Workflow Run**: [20873801377](https://github.com/jcornell3/tamshai-enterprise-ai/actions/runs/20873801377)

- **Status**: ✅ Success
- **Duration**: 4 minutes
- **Build Output**: New bundle `index-C-5yRytR.js` (replaced `index-Dt1EwdeZ.js`)

### Verification

```bash
# Check HTML has correct asset paths
curl -sf "https://prod.tamshai.com/app/" | grep -E "(script|link)"
# Returns: src="/app/assets/index-C-5yRytR.js"
#          href="/app/assets/index-CuHCodkk.css"

# Verify assets are accessible
curl -sf -o /dev/null -w "%{http_code}" "https://prod.tamshai.com/app/assets/index-C-5yRytR.js"
# Returns: 200 ✅

curl -sf -o /dev/null -w "%{http_code}" "https://prod.tamshai.com/app/assets/index-CuHCodkk.css"
# Returns: 200 ✅
```

---

## Expected Behavior

When accessing `https://prod.tamshai.com/app/`:

1. **Initial Load**: React app loads and shows "Authenticating..." spinner
2. **Assets Load**: JavaScript and CSS load from `/app/assets/...`
3. **Authentication Check**: AuthProvider checks for existing session
4. **Not Authenticated**: Redirects to Keycloak login
   - URL: `https://keycloak-fn44nd7wba-uc.a.run.app/auth/realms/tamshai-corp/protocol/openid-connect/auth`
   - Client ID: `tamshai-website`
   - Redirect URI: `https://prod.tamshai.com/app/callback`
5. **After Login**: User returns to `/app/` and sees LandingPage

---

## Routes Configuration

The app has these routes (all under `/app/` base):

```tsx
<Routes>
  <Route path="/" element={<PrivateRoute><LandingPage /></PrivateRoute>} />
  <Route path="/downloads" element={<PrivateRoute><DownloadsPage /></PrivateRoute>} />
  <Route path="/callback" element={<CallbackPage />} />
</Routes>
```

With `basename="/app"`, these resolve to:
- Homepage: `https://prod.tamshai.com/app/`
- Downloads: `https://prod.tamshai.com/app/downloads`
- OAuth Callback: `https://prod.tamshai.com/app/callback`

---

## Public Marketing Website

The public marketing website at `https://prod.tamshai.com/` has an employee login button:

```html
<!-- apps/tamshai-website/src/employee-login.html -->
<a href="/app/" id="sso-login-btn" class="sso-btn">
    Sign in with SSO
</a>
```

This button now correctly links to the portal app at `/app/`, which loads and handles SSO authentication.

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

The wildcard `/*` matches the callback route at `/app/callback`.

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

1. **Access Public Site**: Open `https://prod.tamshai.com/` in browser
2. **Click Employee Login**: Click "Sign in with SSO" button
3. **Expected**: Portal app loads (not blank page) and shows "Authenticating..." spinner
4. **Expected**: Redirects to Keycloak login (not blank page)
5. **Login**: Use test user credentials from `keycloak/realm-export.json`
6. **Expected**: Return to landing page after successful authentication

### E2E Testing

The shell-based E2E test (`scripts/test/journey-e2e-automated.sh prod`) has limitations:
- ✅ Can verify website is accessible (200 OK)
- ✅ Can verify Keycloak OIDC discovery
- ✅ Can verify portal app HTML loads with correct asset paths
- ✅ Can verify assets are accessible (200 OK)
- ❌ Cannot test OAuth redirect (requires JavaScript execution)
- ❌ Cannot test login form (requires HTML parsing tools)

**Recommendation**: Implement browser-based Playwright tests for full OAuth flow validation.

---

## Lessons Learned

1. **Consistent Base Paths**: When deploying SPAs to subdirectories, ensure `basename` and `base` match the deployment path
2. **Environment-Specific Configuration**: Don't assume production always deploys to root - verify deployment structure
3. **Asset Path Verification**: Always verify asset URLs are accessible after deployment
4. **BrowserRouter + Vite Sync**: Keep `BrowserRouter` `basename` and `vite.config.ts` `base` in sync
5. **Testing**: Browser-based tests are essential for SPA routing and OAuth flows

---

## Files Modified

1. **clients/web/apps/portal/src/main.tsx**
   - Fixed `basename` to always be `/app` (not conditional)

2. **clients/web/apps/portal/vite.config.ts**
   - Fixed `base` to always be `/app/` (not conditional)

---

## Status Summary

| Component | Status | URL |
|-----------|--------|-----|
| Public Marketing Site | ✅ Deployed | https://prod.tamshai.com |
| Portal App | ✅ Deployed | https://prod.tamshai.com/app |
| JavaScript Assets | ✅ Accessible | /app/assets/index-C-5yRytR.js |
| CSS Assets | ✅ Accessible | /app/assets/index-CuHCodkk.css |
| Routing | ✅ Fixed | basename matches deployment path |
| OAuth Redirect | ⏳ Pending Browser Test | Requires manual/Playwright testing |

---

*Issue resolved: January 10, 2026 05:52 UTC*
*Fixed by: Claude Sonnet 4.5 (QA Lead)*
*Deployment: [Workflow Run 20873801377](https://github.com/jcornell3/tamshai-enterprise-ai/actions/runs/20873801377)*
