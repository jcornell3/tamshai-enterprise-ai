# Desktop OAuth Deep Linking - Debug Status

**Last Updated**: December 13, 2024
**Status**: In Progress - Windows protocol handler not communicating between instances

## What Works ✅

1. **Protocol Registration**: `tamshai-ai://` protocol is registered in Windows registry
2. **Keycloak Configuration**: OAuth scopes (`openid profile email roles`) configured correctly
3. **Browser Opening**: `shell.openExternal()` successfully opens Keycloak login in browser
4. **Single Instance Lock**: Code properly checks for existing instance before app.ready
5. **CSP Configuration**: Separate dev/prod CSP policies allow Vite HMR

## Current Issue ❌

**Windows protocol handler not triggering second-instance event**

### Symptoms:
- Running `.\test-protocol.ps1` shows "callback error" in browser
- No logs appear in Electron console from second instance
- No logs appear in PowerShell console from second instance
- Second instance appears to start briefly but doesn't communicate with first instance

### Registry Configuration:
```
Key: HKCU:\Software\Classes\tamshai-ai\shell\open\command
Value: "C:\...\electron.exe" "C:\...\dist\main\index.js" -- "%1"
```

### Expected Behavior:
1. Windows launches: `electron.exe dist\main\index.js -- "tamshai-ai://oauth/callback?code=..."`
2. Second instance requests single-instance lock (fails because first instance has it)
3. Second instance quits, but Electron sends `second-instance` event to first instance
4. First instance receives `commandLine` array with the deep link URL
5. First instance extracts URL and handles OAuth callback

### Actual Behavior:
- Second instance appears to start
- Browser shows "Unable to find Electron app at callback..." error
- No `second-instance` event fires in first instance
- No console output from second instance

## Fixes Applied

### 1. Keycloak Scopes (Commit: `d0cdaff`)
**Problem**: `mcp-gateway-mobile` client had no default scopes
**Fix**: Added `openid`, `profile`, `email`, `roles` as default scopes via kcadm

### 2. Protocol Registration Timing (Commit: `f65c5f4`)
**Problem**: `protocol.registerSchemesAsPrivileged()` called inside `app.whenReady()`
**Fix**: Moved to module scope before app initialization

### 3. CSP for Development (Commit: `f15411b`)
**Problem**: Strict CSP blocked Vite HMR inline scripts
**Fix**: Separate dev CSP with `'unsafe-inline'` and `'unsafe-eval'`

### 4. Protocol Handler Command (Commit: `bd12738`)
**Problem**: Registry pointed to `electron.exe "%1"` without main entry point
**Fix**: Changed to `electron.exe "dist\main\index.js" "%1"`

### 5. Command-Line Argument Separator (Commit: `eedf451`)
**Problem**: URL parsed as file path instead of argument
**Fix**: Added `--` separator: `electron.exe "dist\main\index.js" -- "%1"`

### 6. Single Instance Lock Timing (Commit: `c4eb252`)
**Problem**: Lock checked after `app.whenReady()`, second instance tried to initialize
**Fix**: Moved lock check to module scope, second instance quits immediately

## Files Modified

### Core Files:
- `clients/desktop/src/main/index.ts` - Main process with protocol handling
- `clients/desktop/src/main/auth.ts` - OIDC PKCE authentication
- `clients/desktop/README.md` - Windows setup documentation

### Helper Scripts:
- `clients/desktop/register-protocol-dev.ps1` - Register protocol handler
- `clients/desktop/unregister-protocol-dev.ps1` - Remove protocol handler
- `clients/desktop/check-protocol-registration.ps1` - Verify registration
- `clients/desktop/show-registry.ps1` - Show current registry command
- `clients/desktop/test-protocol.ps1` - Test protocol handler with fake URL

## Next Steps for Debugging

### Theory 1: Built Code Out of Sync
**Hypothesis**: `dist/main/index.js` doesn't have latest code despite `npm run build`
**Test**:
```powershell
# Check file timestamp
(Get-Item dist\main\index.js).LastWriteTime

# Force rebuild
rm -r dist
npm run build

# Verify single-instance lock is in built code
Select-String "requestSingleInstanceLock" dist\main\index.js
```

### Theory 2: Console Logging Stripped
**Hypothesis**: Production build removes `console.log()` statements
**Test**: Add `debugger;` statement or use `process.stdout.write()` instead
**Fix**: Check electron-vite config for minification settings

### Theory 3: Windows Permissions
**Hypothesis**: Windows blocks second instance from communicating
**Test**: Run PowerShell as Administrator and retry
**Fix**: Check Windows Event Viewer for security errors

### Theory 4: Process Isolation
**Hypothesis**: Second instance runs in different context/user
**Test**: Check Task Manager when test runs - do you see two electron.exe processes?
**Fix**: May need different IPC mechanism (file-based, named pipe, etc.)

## Alternative Approaches

If Windows protocol handler continues to fail:

### Option A: Localhost Server
Replace deep linking with localhost callback:
1. Start HTTP server on `http://localhost:3333/callback` in main process
2. Register Keycloak redirect URI: `http://localhost:3333/callback`
3. Server receives OAuth code and triggers token exchange
4. **Pros**: Simpler, no Windows protocol handler needed
5. **Cons**: Port conflicts, not true "native" feel

### Option B: Manual Code Entry
Show OAuth code in browser, user copies to app:
1. Keycloak redirects to page showing authorization code
2. User copies code and pastes into Electron app input field
3. App exchanges code for tokens
4. **Pros**: Always works, simple
5. **Cons**: Poor UX, manual step

### Option C: Electron BrowserWindow OAuth
Use Electron's BrowserWindow for OAuth flow:
1. Open Keycloak in Electron BrowserWindow (not system browser)
2. Intercept redirect with `will-navigate` event
3. Extract code from URL and close window
4. **Pros**: No protocol handler needed, full control
5. **Cons**: Requires WebView permissions, security implications

## Testing Workflow

1. **Register protocol** (one-time): `.\register-protocol-dev.ps1`
2. **Build latest code**: `npm run build`
3. **Start dev server**: `npm run dev`
4. **Test protocol**: `.\test-protocol.ps1`
5. **Check consoles**: Look for `[App]` logs in both PowerShell and DevTools

## References

- Electron Single Instance: https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelock
- Windows Protocol Handler: https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85)
- Electron Deep Linking: https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app

## Commits

- `d0cdaff` - fix: Add Keycloak OAuth scopes
- `f65c5f4` - fix: Protocol registration timing
- `f15411b` - fix: CSP for Vite dev server
- `52f9f74` - docs: Windows setup prerequisites
- `bd12738` - fix: Protocol handler main entry point
- `eedf451` - fix: Add -- separator to protocol command
- `c4eb252` - fix: Move single instance lock before app.ready
- `e5a9009` - debug: Add extensive logging for second-instance event
- `62e48cf` - feat: Add protocol diagnostic scripts
- `a9c68d9` - feat: Add protocol handler test script
