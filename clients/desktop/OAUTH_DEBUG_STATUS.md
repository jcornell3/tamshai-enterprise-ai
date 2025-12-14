# Desktop OAuth Deep Linking - Debug Status

**Last Updated**: December 14, 2024
**Status**: RESOLVED - Windows protocol handler working correctly

## Root Cause Analysis

The Windows desktop OAuth deep linking issue involved **multiple interrelated problems** that were discovered and fixed incrementally over a debugging session. Here is the complete breakdown:

### Problem 1: Keycloak Client Missing OAuth Scopes

**Symptom**: `invalid_scope` error when Keycloak redirected to callback
**Root Cause**: The `mcp-gateway-mobile` Keycloak client had no default scopes configured
**Fix**: Added `openid`, `profile`, `email`, `roles` as default client scopes via kcadm CLI

### Problem 2: Windows Registry Command Missing Main Entry Point

**Symptom**: Windows error "Unable to find Electron app at ..\callback?..."
**Root Cause**: The Windows protocol handler registry entry was:
```
"electron.exe" "%1"
```
This caused Electron to interpret the callback URL as a JavaScript file path to execute.

**Fix**: Changed registry command to include the main entry point:
```
"electron.exe" "dist\main\index.js" "%1"
```

### Problem 3: URL Parsed as File Path (Missing Argument Separator)

**Symptom**: Same "Unable to find Electron app" error even after adding main entry
**Root Cause**: Without the `--` separator, Node.js/Electron parsed the URL as a file argument:
```
electron.exe dist\main\index.js tamshai-ai://oauth/callback?code=...
                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                 Interpreted as a file to load!
```

**Fix**: Added `--` separator to mark end of Electron options:
```
"electron.exe" "dist\main\index.js" -- "%1"
```
The `--` tells the argument parser that everything after is a positional argument, not a file.

### Problem 4: Single Instance Lock Called Too Late

**Symptom**: Second instance started initializing before checking lock
**Root Cause**: `app.requestSingleInstanceLock()` was inside `app.whenReady()`, so the second instance would partially initialize, potentially crashing before communicating with the first instance.

**Fix**: Moved single-instance lock check to module scope (before `app.whenReady()`):
```typescript
// Called immediately at module load, before app.ready
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();  // Exit immediately
}
```

### Problem 5: The "System32 Trap" - Wrong Working Directory

**Symptom**: Second instance crashed silently with no debug output
**Root Cause**: When Windows launches an application via protocol handler, the **current working directory (CWD) is set to `C:\Windows\System32`**, not the application directory. This caused:
- Relative path resolution failures
- Module loading errors
- `app.getPath()` failures before Electron initialized

**Fix**:
1. Added file-based debugging that logs to `%APPDATA%` (doesn't depend on CWD)
2. Fixed CWD immediately at startup:
```typescript
if (!app.isPackaged) {
  const projectRoot = resolve(__dirname, '../../');
  process.chdir(projectRoot);
}
```

### Problem 6: Auto-Registration Overwrote Correct Registry Entry

**Symptom**: Registry kept reverting to broken format after restart
**Root Cause**: `app.setAsDefaultProtocolClient('tamshai-ai')` in the code automatically registered the protocol handler with Electron's default format (without `dist\main\index.js` and `--`), overwriting our correctly configured registry entry every time the app started.

**Fix**: Skip auto-registration in development mode:
```typescript
function registerCustomProtocol(): void {
  if (app.isPackaged) {
    // Production: Use default registration
    app.setAsDefaultProtocolClient('tamshai-ai');
  } else {
    // Development: Skip - use manual register-protocol-dev.ps1
    console.log('[Protocol] Development mode - skipping auto-registration');
  }
}
```

## The Complete Fix Chain

1. **Keycloak**: Configure OAuth scopes on client
2. **Registry**: Register with full command including main entry + `--` separator
3. **Code**: Move single-instance lock before `app.whenReady()`
4. **Code**: Fix CWD when launched from System32
5. **Code**: Use file-based debug logging (not console)
6. **Code**: Skip auto-registration in dev mode to preserve correct registry

## What Works Now ✅

1. **Protocol Registration**: Correct format with main entry and `--` separator
2. **Keycloak OAuth**: Full PKCE flow with TOTP MFA
3. **Browser Handoff**: System browser opens for login
4. **Deep Link Callback**: Windows triggers Electron with callback URL
5. **Single Instance Communication**: Second instance passes URL to primary
6. **Token Exchange**: Authorization code exchanged for access/refresh tokens
7. **Token Storage**: Tokens stored securely via Electron safeStorage

## Remaining Issue

**UI Update After Callback**: After successful OAuth callback, the renderer stays on the login screen instead of transitioning to the main app. The tokens are correctly stored, but the `auth:success` IPC event isn't triggering a UI re-render. User must click "Sign in with SSO" again (which immediately succeeds using stored tokens).

## Key Debug Scripts

| Script | Purpose |
|--------|---------|
| `register-protocol-dev.ps1` | Register correct protocol handler for dev |
| `unregister-protocol-dev.ps1` | Remove protocol registration |
| `show-registry.ps1` | Display current registry command |
| `test-protocol.ps1` | Test protocol handler with fake URL |
| `view-debug-log.ps1` | View file-based startup debug log |
| `clear-debug-log.ps1` | Clear debug log for fresh testing |

## Debug Log Location

```
%APPDATA%\tamshai-ai-desktop\debug\startup.log
```

This log captures:
- Process ID (PID)
- Command line arguments
- Working directory (CWD)
- Single-instance lock status
- Second-instance events
- Deep link URLs received

## Lessons Learned

1. **Windows protocol handlers have CWD issues**: Always use absolute paths or fix CWD at startup
2. **Electron dev mode needs special handling**: Packaged apps work differently than dev mode
3. **File-based logging is essential**: Console output isn't visible when processes crash early
4. **`--` separator matters**: Prevents URLs from being parsed as file paths
5. **Auto-registration can break things**: Electron's defaults don't work for all dev setups
6. **Single-instance lock timing is critical**: Must happen before any async initialization

## Related Commits

- `d0cdaff` - fix: Add Keycloak OAuth scopes
- `bd12738` - fix: Protocol handler main entry point
- `eedf451` - fix: Add -- separator to protocol command
- `c4eb252` - fix: Move single instance lock before app.ready
- `3af3e34` - fix: Add file-based debugging and CWD fix
- `52dac83` - fix: Use hardcoded APPDATA path for debug logging
- `bda0a15` - fix: Skip auto protocol registration in dev mode
