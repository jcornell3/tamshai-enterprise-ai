# WebView2 Integration Issues - Technical Analysis for Third-Party Review

**Date**: December 16, 2025
**Project**: Tamshai Enterprise AI - Unified Client
**Platform**: React Native Windows 0.80 with Fabric/New Architecture (Composition)
**Environment**: Windows 11, Visual Studio 2022, Node.js 20+

---

## Executive Summary

We require an OS-native secure browser modal for OAuth/OIDC authentication with a localhost Keycloak instance. The standard Windows APIs and React Native libraries have proven incompatible with React Native Windows 0.80's Composition architecture. This document details the technical issues encountered for third-party review.

**Current State**: Browser-based OAuth (via system browser) works but violates the specification requirement for a native modal dialog.

---

## Specification Requirement

**MUST**: Use OS-native secure browser modal for OAuth authentication
**MUST NOT**: Open authentication in a browser tab (Chrome, Edge, etc.)

**Rationale**:
- Enterprise security requirements mandate in-app authentication
- User experience should not switch context to external browser
- Sensitive OAuth tokens should not transit through external browser processes

---

## Issue 1: WebAuthenticationBroker Incompatibility

### What We Tried

Windows' native `WebAuthenticationBroker` API is the standard approach for OAuth in UWP/Windows applications. We implemented a native module to invoke it:

```cpp
#include <winrt/Windows.Security.Authentication.Web.h>

REACT_METHOD(AuthenticateAsync)
void AuthenticateAsync(
    winrt::hstring requestUri,
    winrt::hstring callbackUri,
    winrt::Microsoft::ReactNative::ReactPromise<winrt::hstring> promise) noexcept {

    auto options = WebAuthenticationOptions::None;
    auto startUri = winrt::Windows::Foundation::Uri(requestUri);
    auto endUri = winrt::Windows::Foundation::Uri(callbackUri);

    auto operation = WebAuthenticationBroker::AuthenticateAsync(
        options, startUri, endUri);
    // ...
}
```

### Error Encountered

```
RPC_E_WRONG_THREAD (0x8001010E): The application called an interface
that was marshalled for a different thread.
```

### Root Cause Analysis

**WebAuthenticationBroker requires**:
- ASTA (Application Single-Threaded Apartment) COM threading model
- A `CoreWindow` instance for UI display
- Classic UWP application model

**React Native Windows 0.80 Composition provides**:
- MAINSTA (Main Single-Threaded Apartment) COM threading model
- WinUI 3 / Windows App SDK window model (no `CoreWindow`)
- Modern Composition-based rendering

The threading models are fundamentally incompatible:

| Aspect | WAB Requirement | RN Windows 0.80 |
|--------|-----------------|-----------------|
| COM Apartment | ASTA | MAINSTA |
| Window Model | CoreWindow (UWP) | WinUI 3 AppWindow |
| UI Thread | ASTA dispatcher | WinUI DispatcherQueue |

### Why This Cannot Be Fixed

This is not a coding error or threading issue that can be resolved with `DispatcherQueue` marshaling. The `WebAuthenticationBroker` API physically cannot render its authentication dialog without a `CoreWindow`, which does not exist in Composition-based applications.

**Microsoft Documentation Reference**: The Windows App SDK explicitly notes that certain UWP APIs are not available in WinUI 3 applications.

### Attempted Workarounds

1. **DispatcherQueue marshaling**: Failed - WAB checks for CoreWindow, not just thread context
2. **Creating CoreWindow manually**: Not possible in WinUI 3/Windows App SDK
3. **Using older RN Windows version**: Would sacrifice Fabric/New Architecture benefits
4. **FindCoreComponentById()**: Returns null in Composition apps - no CoreWindow exists

---

## Issue 2: react-native-webview Build Failures

### What We Tried

`react-native-webview` provides a WebView2-based component that could serve as an OAuth modal. We added it to the project:

```bash
npm install react-native-webview
npx react-native autolink-windows
```

### Errors Encountered

#### Error 2.1: Duplicate Project Entries (MSB5004)

```
Solution file error MSB5004: The solution file has two projects
named "ReactNativeWebView"
```

**Cause**: Auto-linking adds the project to the solution, but manual configuration for package references creates duplicates. Running `npx react-native run-windows` re-adds entries via auto-linking.

**Attempted Fixes**:
- Manual removal of duplicates from `.sln`
- `react-native.config.js` with `platforms: { windows: null }`
- Git reset before builds

**Result**: Configuration file did not prevent auto-linking from adding duplicates.

#### Error 2.2: PDB File Locking (C1041)

```
error C1041: cannot open program database
'...\node_modules\react-native-windows\target\ReactCommon\ReactCommon.pdb';
if multiple CL.EXE write to the same .PDB file, please use /FS
```

**Cause**: Multiple parallel MSBuild/CL.exe processes attempting to write to the same PDB file. Race condition in react-native-windows build system.

**Attempted Fixes**:
- `taskkill /F /IM MSBuild.exe`
- Clean build directories
- Single-threaded build: `npx react-native run-windows -- /m:1`
- System reboot
- Full `node_modules` reinstall

**Result**: Issue persists after all cleanup attempts.

#### Error 2.3: PCH File Access Errors (C1083)

```
error C1083: Cannot open compiler intermediate file:
'C:\rn\node_modules\react-native-windows\build\\\ReactCommon\ReactCommon.pch':
Invalid argument
```

**Note the triple backslashes** (`\\\`) in the path - indicates path concatenation bug in react-native-windows build configuration.

**Attempted Fixes**:
- Enabled Windows long paths in registry
- Created junction to shorter path (`C:\rn`)
- Built from short path

**Result**: Triple backslash path bug persists even with short path.

#### Error 2.4: MIDL.exe TLog File Locking (MSB6003)

```
error MSB6003: The specified task executable "midl.exe" could not be run.
System.IO.IOException: The process cannot access the file
'...\midl.read.1.tlog' because it is being used by another process.
```

**Cause**: MIDL compiler's tracking log files locked during parallel compilation. Indicates fundamental issue with parallel build coordination in RNW.

### Root Cause Summary

The react-native-webview build failures stem from:

1. **Parallel Build Race Conditions**: Multiple RNW projects share intermediate files (PDB, PCH, TLog). MSBuild's parallel compilation causes race conditions.

2. **Path Construction Bug**: Triple backslash in paths suggests empty intermediate path segments or incorrect `$(IntDir)`/`$(OutDir)` property values.

3. **Auto-linking Interference**: The RNW auto-linking system doesn't properly detect existing project entries.

---

## Issue 3: Custom C++ WebView2 Complexity

### What It Would Require

Implementing a custom WebView2 OAuth modal in C++ native code would involve:

```cpp
// Required components:
#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>
#include <wil/com.h>

// Implementation steps:
// 1. Create WebView2 environment asynchronously
// 2. Create WebView2 controller bound to HWND
// 3. Navigate to OAuth URL
// 4. Monitor NavigationStarting events for callback URL
// 5. Extract authorization code from URL
// 6. Clean up WebView2 resources
// 7. Marshal callback to React Native JavaScript
```

### Why This Violates Project Goals

**User requirement** (direct quote):
> "Remember that the goal is deliver the majority of the code that can be used by the other platforms (MacOS, Android, iOS). If we create too much custom platform specific code, we move away from that goal."

A custom C++ WebView2 implementation would:
- Add ~300-500 lines of Windows-specific C++ code
- Require Windows-specific maintenance
- Not be reusable on iOS, Android, or macOS
- Increase build complexity and potential for errors
- Add another native module that could have threading issues

---

## Network Isolation: Separate Concern (Resolved)

For completeness, localhost access required a loopback exemption:

```powershell
CheckNetIsolation.exe LoopbackExempt -a -n="TamshaiAiUnified_mz456f93e3tka"
```

This is separate from the OAuth modal issue and has been resolved.

---

## Options for Resolution

### Option 1: Accept Browser-Based OAuth

**Pros**:
- Works now
- Cross-platform code (same as iOS, Android, macOS)
- No native module complexity
- Standard OAuth flow with deep linking

**Cons**:
- Violates specification requiring native modal
- User context switches to browser
- May not meet enterprise security requirements

### Option 2: Fix react-native-webview Build Issues

**Pros**:
- Uses maintained open-source library
- WebView2 is modern and secure
- Would provide in-app modal

**Cons**:
- Build issues appear to be in react-native-windows core, not our project
- May require changes to RNW build configuration
- Issues are race conditions - hard to fix reliably
- Would need to coordinate with RNW maintainers

**Potential Approaches**:
- File issue with react-native-windows GitHub
- Investigate `/FS` compiler flag for all C++ compilations
- Try release build (may not generate PDB files)
- Pre-build RNW core projects separately

### Option 3: Custom Native WebView2 Module

**Pros**:
- Full control over implementation
- Guaranteed to work with Composition architecture
- No dependency on react-native-webview build system

**Cons**:
- Significant platform-specific code
- Violates cross-platform code sharing goal
- Maintenance burden
- Potential for new threading/COM issues

### Option 4: Downgrade to Pre-Composition RN Windows

**Pros**:
- WebAuthenticationBroker would work
- Simpler native module integration

**Cons**:
- Loses Fabric/New Architecture benefits
- Not forward-compatible
- Potential performance issues
- Different codebase from other platforms using New Architecture

### Option 5: Hybrid Approach

Use browser-based OAuth by default with optional native modal where supported:

```typescript
async function login(): Promise<AuthResult> {
  if (Platform.OS === 'windows' && await isNativeModalSupported()) {
    return nativeOAuthModal(authUrl, callbackUrl);
  }
  // Fall back to browser OAuth with deep linking
  return browserOAuth(authUrl, callbackUrl);
}
```

**Pros**:
- Provides native experience where possible
- Falls back gracefully
- Allows incremental improvement

**Cons**:
- Still need to solve native modal for Windows
- More code paths to test

---

## Recommendation for Third-Party Review

We recommend the reviewer evaluate:

1. **Is the native modal requirement negotiable?** If browser OAuth is acceptable, the current implementation works correctly.

2. **Should we escalate react-native-webview issues?** The build failures appear to be in react-native-windows itself. Filing a detailed bug report with RNW maintainers may be appropriate.

3. **Is custom C++ acceptable despite cross-platform goals?** If native modal is mandatory and react-native-webview cannot be fixed, custom WebView2 code may be the only option.

4. **Timeline constraints**: Custom C++ implementation would add 1-2 weeks of development and testing. Waiting for RNW fixes is unbounded.

---

## Technical Environment Details

| Component | Version |
|-----------|---------|
| React Native | 0.80.x |
| React Native Windows | 0.80.x (Fabric/Composition) |
| react-native-webview | latest (build fails) |
| Node.js | 20+ |
| Visual Studio | 2022 Community |
| MSBuild | 17.14.23 |
| Windows | 11 (WSL2 host) |
| Keycloak | localhost:8180 |

---

## Files Referenced

| File | Purpose |
|------|---------|
| `windows/TamshaiAiUnified/TamshaiAiUnified.cpp` | Main app with DeepLinkModule |
| `windows/TamshaiAiUnified/pch.h` | Precompiled header |
| `src/services/auth/auth.windows.ts` | Windows auth implementation |
| `docs/WINDOWS_BUILD_ISSUES.md` | Detailed build error log |
| `react-native.config.js` | Auto-linking configuration |

---

## Contact

For questions about this analysis, contact the development team or refer to the project repository.

---

## Appendix A: Response to Third-Party Review (December 16, 2025)

### Review Summary

A third-party reviewer suggested:

> **Option C: Solve the WebAuthenticationBroker Localhost Issue (Best Path)**
> The only reason WebAuthenticationBroker was rejected is the localhost restriction.
> Use `react-native-app-auth` which wraps WebAuthenticationBroker correctly.
> Apply the Loopback Exemption via `CheckNetIsolation.exe`.

### Correction: The Actual Blocker

**The reviewer's assessment is factually incorrect.** The localhost/loopback issue was already resolved. The actual blocker is the **COM apartment threading model incompatibility**, not network isolation.

The loopback exemption was applied successfully:
```powershell
CheckNetIsolation.exe LoopbackExempt -a -n="TamshaiAiUnified_mz456f93e3tka"
```

The error we encounter is:
```
RPC_E_WRONG_THREAD (0x8001010E): The application called an interface
that was marshalled for a different thread.
```

This occurs because **WebAuthenticationBroker requires a CoreWindow** (classic UWP window model), but React Native Windows 0.80 Composition uses **WinUI 3 AppWindow** (no CoreWindow exists). This is an architectural incompatibility, not a threading marshaling issue that can be fixed with DispatcherQueue.

### react-native-app-auth Does Not Support Windows

The reviewer suggested using `react-native-app-auth`. Research confirms:

1. **No Windows support exists** - The library only supports iOS and Android
   - Source: [GitHub Issue #740](https://github.com/FormidableLabs/react-native-app-auth/issues/740) - closed with no Windows implementation
   - Source: [npm package](https://www.npmjs.com/package/react-native-app-auth) - only documents iOS/Android

2. **Community discussion confirms the gap** - [RNW Discussion #13538](https://github.com/microsoft/react-native-windows/discussions/13538) shows developers must build custom native modules

3. **Even if it existed**, it would wrap WebAuthenticationBroker and encounter the same CoreWindow incompatibility

### Why "Fix the Environment Configuration" Won't Work

The reviewer states:
> "We should fix the environment configuration rather than adding broken libraries."

This misunderstands the issue. The problem is not configuration - it's that **CoreWindow does not exist in WinUI 3/Windows App SDK applications**. You cannot configure something into existence that the framework explicitly does not provide.

From Microsoft's Windows App SDK documentation: Certain UWP APIs that depend on CoreWindow are not available in WinUI 3 desktop applications. WebAuthenticationBroker is one such API.

### Revised Options

Given the reviewer's suggestions have been evaluated and found inapplicable:

1. **Browser OAuth with deep linking** - Current working solution (violates spec)
2. **Custom WebView2 native module** - Windows-specific but would work
3. **Wait for RNW ecosystem maturity** - react-native-webview or similar may add Composition support
4. **Relax specification requirement** - Accept browser-based OAuth for Windows

### Conclusion

The third-party review provided a reasonable hypothesis based on common Windows OAuth patterns. However, React Native Windows 0.80's Composition architecture introduces unique constraints that make standard solutions (WebAuthenticationBroker, react-native-app-auth) inapplicable. The CoreWindow dependency is the fundamental blocker, not network isolation or library availability.

---

*Document prepared for third-party technical review*
