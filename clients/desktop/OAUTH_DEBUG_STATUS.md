# Desktop OAuth Deep Linking - Debug Status

**Last Updated**: December 14, 2024
**Status**: RESOLVED - Full solution implemented with race condition mitigation

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
7. **Code**: Add 600ms delay before lock request when deep link URL is present (Windows)
8. **Code**: Use `additionalData` API to pass URL via IPC instead of command line

## What Works Now ✅

1. **Protocol Registration**: Correct format with main entry and `--` separator
2. **Keycloak OAuth**: Full PKCE flow with TOTP MFA
3. **Browser Handoff**: System browser opens for login
4. **Deep Link Callback**: Windows triggers Electron with callback URL
5. **Single Instance Communication**: Second instance passes URL to primary
6. **Token Exchange**: Authorization code exchanged for access/refresh tokens
7. **Token Storage**: Tokens stored securely via Electron safeStorage

### Problem 7: Windows Race Condition - Both Instances Get Lock (Electron #35680)

**Symptom**: Two Electron windows appeared; both processes got `gotTheLock: true`
**Root Cause**: Known Windows race condition in Electron's single-instance lock implementation. When the protocol handler launches a second instance quickly, both instances can incorrectly acquire the lock before the OS lock table is synchronized.

**Fix**: Implemented two mitigations:
1. **600ms Delay**: When a deep link URL is detected, delay the lock request to allow the OS lock table to update:
```typescript
if (deepLinkUrlArg && process.platform === 'win32') {
  await new Promise(resolve => setTimeout(resolve, 600));
}
const gotTheLock = app.requestSingleInstanceLock(additionalData);
```

2. **`additionalData` API**: Use Electron's `requestSingleInstanceLock(additionalData)` to pass the deep link URL via IPC instead of relying on command line parsing:
```typescript
const additionalData = { deepLinkUrl: deepLinkUrlArg || null };
const gotTheLock = app.requestSingleInstanceLock(additionalData);

// In second-instance handler:
app.on('second-instance', (_event, commandLine, workingDirectory, additionalData) => {
  const data = additionalData as { deepLinkUrl?: string };
  if (data?.deepLinkUrl) {
    handleDeepLink(data.deepLinkUrl);
  }
});
```

This ensures the deep link URL is passed cleanly via in-memory IPC, keeping the PKCE code verifier in the primary instance where it was created.

### Problem 8: Orphaned Second Window (Race Condition UX Impact)

**Symptom**: Due to the Windows race condition (Problem 7), the second instance sometimes acquires the lock and shows a window, resulting in two windows visible to the user.

**Root Cause**: When the race condition occurs, the callback instance (PID B) becomes a "primary" instance with its own window, while the original instance (PID A) also remains primary. Both instances believe they hold the lock.

**Fix**: Auto-close orphaned callback instances instead of showing errors
```typescript
if (deepLinkUrlArg.includes('oauth/callback')) {
  // Scenario A (Race Condition - COMMON):
  //   Primary instance (PID A) received URL via 'second-instance' event
  //   This instance (PID B) is orphaned - auto-close it
  //
  // Scenario B (True Cold Start - RARE):
  //   No primary instance, no PKCE verifier - close silently

  setTimeout(() => {
    app.quit(); // Self-terminate after 2 seconds
  }, 2000);
  return; // Stop initialization
}
```

**User Experience**:
- Before: Two windows appear, user must click "Sign in with SSO" again in second window
- After: Second window auto-closes after 2 seconds, primary window handles login seamlessly

## Remaining Issue

**None** - All known issues have been addressed with workarounds.

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
7. **Windows has a race condition in single-instance lock**: Use delays to mitigate (Electron #35680)
8. **`additionalData` API is cleaner than command line parsing**: Use it for inter-instance communication

## Related Commits

- `d0cdaff` - fix: Add Keycloak OAuth scopes
- `bd12738` - fix: Protocol handler main entry point
- `eedf451` - fix: Add -- separator to protocol command
- `c4eb252` - fix: Move single instance lock before app.ready
- `3af3e34` - fix: Add file-based debugging and CWD fix
- `52dac83` - fix: Use hardcoded APPDATA path for debug logging
- `bda0a15` - fix: Skip auto protocol registration in dev mode
