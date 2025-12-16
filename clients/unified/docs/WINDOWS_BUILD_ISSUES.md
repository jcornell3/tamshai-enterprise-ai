# React Native Windows Build Issues - Technical Analysis

**Date**: December 15, 2025
**Project**: Tamshai Enterprise AI - Unified Client
**Platform**: React Native Windows 0.80 with Fabric/New Architecture
**Environment**: Windows 11, Visual Studio 2022, Node.js 20+

---

## Executive Summary

We are experiencing persistent build failures when attempting to compile a React Native Windows application that includes `react-native-webview` (WebView2) for OAuth modal authentication. The issues appear to be related to MSBuild parallel compilation race conditions and path handling in react-native-windows.

---

## Project Context

### Goal
Implement OAuth/OIDC authentication using a WebView2-based modal dialog (not a browser tab) to work with a localhost Keycloak instance during development. Windows' `WebAuthenticationBroker` cannot access localhost due to network isolation, necessitating the WebView2 approach.

### Dependencies Added
- `react-native-webview` (for WebView2 modal OAuth)
- `@react-native-async-storage/async-storage` (for token storage)

### Solution File Configuration
The solution file (`windows/TamshaiAiUnified.sln`) contains:
- TamshaiAiUnified.Package (APPX packaging)
- TamshaiAiUnified (main app)
- ReactNativeAsyncStorage (native module)
- ReactNativeWebView (native module)

---

## Issues Encountered

### Issue 1: Duplicate Project Entries (MSB5004)

**Error**:
```
Solution file error MSB5004: The solution file has two projects named "ReactNativeWebView"
```

**Analysis**:
- Auto-linking (`npx react-native autolink-windows`) adds ReactNativeWebView to the solution
- Manual addition for package references creates a duplicate
- Even after removing duplicates, running `npx react-native run-windows` re-adds them via auto-linking

**Attempted Solutions**:
1. Removed duplicate entries from `.sln` file manually
2. Created `react-native.config.js` to disable auto-linking for react-native-webview on Windows:
   ```javascript
   module.exports = {
     dependencies: {
       'react-native-webview': {
         platforms: {
           windows: null,
         },
       },
     },
   };
   ```
3. Used `git checkout origin/main -- windows/TamshaiAiUnified.sln` to reset before each build

**Result**: Config file did not prevent auto-linking from adding duplicates.

---

### Issue 2: PDB File Locking (C1041)

**Error**:
```
error C1041: cannot open program database 'C:\...\node_modules\react-native-windows\target\ReactCommon\ReactCommon.pdb';
if multiple CL.EXE write to the same .PDB file, please use /FS
```

**Analysis**:
- Multiple parallel MSBuild/CL.exe processes attempting to write to the same PDB file
- Race condition in react-native-windows build system
- Occurs in `ReactCommon.vcxproj` and other core RNW projects

**Attempted Solutions**:
1. Killed all MSBuild processes: `taskkill /F /IM MSBuild.exe`
2. Cleaned build directories:
   ```powershell
   Remove-Item -Recurse -Force node_modules\react-native-windows\target
   Remove-Item -Recurse -Force node_modules\react-native-windows\build
   ```
3. Attempted single-threaded build: `npx react-native run-windows -- /m:1`
4. System reboot to release all file locks
5. Full `node_modules` reinstall

**Result**: Issue persists after all cleanup attempts.

---

### Issue 3: PCH File Access Errors (C1083)

**Error**:
```
error C1083: Cannot open compiler intermediate file:
'C:\rn\node_modules\react-native-windows\build\\\ReactCommon\ReactCommon.pch': Invalid argument
```

**Analysis**:
- Note the triple backslashes `\\\` in the path - indicates path concatenation bug
- Precompiled header files inaccessible during parallel compilation
- "Invalid argument" suggests path handling issue, not permission issue

**Attempted Solutions**:
1. Enabled Windows long paths:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1
   ```
2. Created junction to shorter path:
   ```powershell
   cmd /c mklink /J C:\rn C:\Users\jcorn\tamshai-enterprise-ai\clients\unified
   ```
3. Built from `C:\rn` instead of long path

**Result**: Triple backslash path bug persists even with short path.

---

### Issue 4: Permission Denied on Build Files

**Error**:
```
error C1083: Cannot open precompiled header file: '...\ReactCommon.pch': Permission denied
```

**Analysis**:
- Build files locked by previous failed builds
- MSBuild processes not fully terminating
- Even after reboot, permission issues recur during build

**Attempted Solutions**:
1. Ran PowerShell as Administrator
2. Used robocopy mirror trick to force-delete locked directories:
   ```powershell
   mkdir C:\Windows\Temp\empty -Force
   robocopy /MIR "C:\Windows\Temp\empty" "node_modules\react-native-windows\target"
   ```

**Result**: Files still get locked during new build attempts.

---

### Issue 5: MIDL.exe TLog File Locking (MSB6003)

**Error**:
```
error MSB6003: The specified task executable "midl.exe" could not be run.
System.IO.IOException: The process cannot access the file '...\midl.read.1.tlog'
because it is being used by another process.
```

**Analysis**:
- MIDL compiler's tracking log files locked during parallel compilation
- Affects `Microsoft.ReactNative.vcxproj`
- Indicates fundamental issue with parallel build coordination in RNW

---

## Environment Details

**Machine**:
- Windows 11 (via WSL2 on Linux host)
- 24 CPU threads available
- Visual Studio 2022 Community

**Versions**:
- react-native: 0.80.x
- react-native-windows: 0.80.x (Fabric/New Architecture)
- react-native-webview: latest
- Node.js: 20+
- MSBuild: 17.14.23

**Build Configuration**:
- Configuration: Debug
- Platform: x64

---

## Root Cause Hypothesis

The issues appear to stem from:

1. **Parallel Build Race Conditions**: react-native-windows has multiple projects that share intermediate files (PDB, PCH, TLog). MSBuild's parallel compilation causes race conditions when multiple CL.exe/MIDL.exe instances access these files simultaneously.

2. **Path Construction Bug**: The triple backslash `\\\` in paths like `build\\\ReactCommon\ReactCommon.pch` suggests a path concatenation issue in the build configuration, possibly:
   - Empty intermediate path segment
   - Incorrect `$(IntDir)` or `$(OutDir)` property values
   - Build path canonicalization failure

3. **Auto-linking Interference**: The react-native-windows auto-linking system doesn't properly detect existing project entries, causing duplicates. The `react-native.config.js` platform exclusion isn't being honored.

---

## Potential Solutions to Investigate

1. **Disable Parallel Builds in RNW Property Sheets**:
   - Modify `node_modules\react-native-windows\PropertySheets\*.props` to set `BuildInParallel=false`
   - Or set `/FS` flag globally for all C++ compilations

2. **Fix Path Construction**:
   - Investigate `Microsoft.ReactNative.Common.props` for incorrect path concatenation
   - Check `$(IntDir)` and `$(OutDir)` definitions

3. **Use Release Build**:
   - Release builds may not generate PDB files, avoiding the race condition
   - Try: `npx react-native run-windows --release`

4. **Downgrade react-native-windows**:
   - Test with a previous stable version that may not have these issues

5. **Build Dependencies Separately**:
   - Pre-build react-native-windows core projects before main build
   - Use MSBuild directly with explicit project order

6. **Report to react-native-windows**:
   - This appears to be a bug in react-native-windows 0.80.x
   - File issue at https://github.com/microsoft/react-native-windows

---

## Commands Tried (Full List)

```powershell
# Basic build
npx react-native run-windows

# Clean and build
Remove-Item -Recurse -Force node_modules\react-native-windows\target
Remove-Item -Recurse -Force node_modules\react-native-windows\build
npx react-native run-windows

# Single-threaded build
npx react-native run-windows -- /m:1 /p:UseMultiToolTask=false

# Skip auto-linking
npx react-native run-windows --no-autolink

# Full reinstall
Remove-Item -Recurse -Force node_modules
npm install
npx react-native run-windows

# Short path via junction
cmd /c mklink /J C:\rn C:\Users\jcorn\tamshai-enterprise-ai\clients\unified
cd C:\rn
npx react-native run-windows
```

---

## Files Modified/Created

1. `react-native.config.js` - Created to disable WebView auto-linking (ineffective)
2. `windows/TamshaiAiUnified.sln` - Modified to add/remove native module references
3. `windows/TamshaiAiUnified.Package/TamshaiAiUnified.Package.wapproj` - Added project references for native module DLLs

---

## Request for Review

We need assistance with:

1. Understanding why parallel build race conditions occur in react-native-windows 0.80
2. Proper way to add react-native-webview to a RNW project without auto-linking conflicts
3. Fix for the triple backslash path construction bug
4. Recommended build flags/configuration for stable builds

---

## Contact

For questions about this analysis, refer to the project repository or the development team.
