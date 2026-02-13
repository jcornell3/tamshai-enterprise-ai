# React Native Windows Setup Guide

This guide explains how to set up the React Native Windows development environment and build the Tamshai AI desktop application.

## Overview

The unified client is developed primarily in WSL (Linux), but Windows builds must be executed on the Windows host. This guide covers both the initial setup and the day-to-day workflow.

---

## Prerequisites (Windows Side)

### 1. Visual Studio 2022

Install Visual Studio 2022 with the following workloads:

1. Open **Visual Studio Installer**
2. Click **Modify** on Visual Studio 2022
3. Select these **Workloads**:
   - ✅ **Desktop development with C++**
   - ✅ **WinUI application development** (formerly "Universal Windows Platform development")
     - Note: This workload was renamed in VS 2022. It uses the same component ID `Microsoft.VisualStudio.Workload.Universal`
   - ✅ **.NET Desktop development** (optional, for C# projects)
4. In **Individual components** tab, ensure these are selected:
   - ✅ Windows 10 SDK (10.0.22621.0) or later
   - ✅ Windows 11 SDK (if targeting Windows 11)
   - ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools
   - ✅ C++ Universal Windows Platform support for v143 build tools
   - ✅ C++ CMake tools for Windows
5. Click **Modify** to install

**Troubleshooting: If WinUI workload is missing**

If you don't see "WinUI application development" in the Workloads tab, install the UWP components manually via PowerShell:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe" modify `
  --installPath "C:\Program Files\Microsoft Visual Studio\2022\Community" `
  --add Microsoft.VisualStudio.ComponentGroup.UWP.Support `
  --add Microsoft.VisualStudio.ComponentGroup.UWP.VC `
  --add Microsoft.VisualStudio.Component.Windows10SDK.22621
```

**Verify UWP is installed:**

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -requires Microsoft.VisualStudio.Workload.Universal -property productDisplayVersion
```

If this returns a version number, UWP/WinUI is installed. If blank, the workload is missing.

### 2. Node.js (Windows)

Install Node.js on Windows (even though you develop in WSL):

```powershell
# Option 1: Download from nodejs.org
# https://nodejs.org/en/download/ (LTS version)

# Option 2: Using winget
winget install OpenJS.NodeJS.LTS

# Option 3: Using Chocolatey
choco install nodejs-lts
```

Verify installation:
```powershell
node --version  # Should be 20.x or later
npm --version   # Should be 10.x or later
```

### 3. Windows Development Requirements

**Enable Developer Mode** (required for symlinks and sideloading UWP apps):

- **Windows 11**: Settings > System > For developers > Developer Mode: ON
- **Windows 10**: Settings > Update & Security > For Developers > Developer Mode: ON

Or via PowerShell (Admin):
```powershell
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1"  # pragma: allowlist secret
```

---

## Initial Windows Setup

### Step 1: Initialize React Native Windows

Run these commands from **Windows PowerShell** (not WSL), in the project directory:

```powershell
# Navigate to the project (via Windows path)
cd C:\Users\<username>\path\to\tamshai-enterprise-ai\clients\unified

# Install dependencies (Windows needs its own node_modules)
npm install

# Initialize React Native Windows (for RN 0.76+)
# Note: react-native-windows-init is deprecated for RN >= 0.76
# Use the new init-windows command instead:
npx react-native init-windows --overwrite

# This creates:
# - windows/           (Visual Studio solution)
# - windows/TamshaiAI/ (UWP project)
```

**Note for React Native 0.75 and earlier:**
```powershell
# For older RN versions, use the legacy command:
npx react-native-windows-init --overwrite
```

### Step 2: Configure Protocol Handler

The protocol handler (`com.tamshai.ai://`) is configured in the Windows manifest.

Edit `windows/TamshaiAI/Package.appxmanifest`:

```xml
<Package>
  <!-- ... existing content ... -->

  <Applications>
    <Application>
      <Extensions>
        <!-- Protocol Handler for OAuth callbacks -->
        <uap:Extension Category="windows.protocol">
          <uap:Protocol Name="com.tamshai.ai">
            <uap:DisplayName>Tamshai AI</uap:DisplayName>
          </uap:Protocol>
        </uap:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
```

### Step 3: Enable Loopback Exemption (Required for Localhost)

MSIX packaged apps (like this React Native Windows app) cannot access localhost by default due to network isolation. For development with Keycloak running on localhost, you must add a loopback exemption.

**Run this command once as Administrator:**

```powershell
# Open PowerShell as Administrator, then run:
CheckNetIsolation.exe LoopbackExempt -a -n="TamshaiAiUnified_mz456f93e3tka"
```

**How to find your Package Family Name (if different):**

```powershell
# After building the app at least once, run:
Get-AppxPackage | Where-Object {$_.Name -like "*Tamshai*"} | Select-Object PackageFamilyName
```

**Verify the exemption was added:**

```powershell
CheckNetIsolation.exe LoopbackExempt -s
# Should show TamshaiAiUnified_mz456f93e3tka in the list
```

**Note:** This exemption persists across builds and reboots. You only need to run it once per machine.

**Why is this needed?**
- MSIX apps run in an AppContainer with network isolation
- Network isolation blocks connections to localhost (127.0.0.1/::1)
- The loopback exemption allows the app to connect to localhost Keycloak for OAuth

### Step 4: Configure react-native-keychain for Windows

The `react-native-keychain` library uses Windows Credential Manager on Windows. After running `react-native-windows-init`, link the native module:

```powershell
# Link native modules (auto-linking should work, but verify)
npx react-native autolink-windows
```

### Step 5: OAuth Authentication

OAuth authentication uses the system browser with a custom protocol callback (`com.tamshai.ai://callback`).

**How it works:**
1. App opens system browser to Keycloak login page
2. User authenticates in browser
3. Keycloak redirects to `com.tamshai.ai://callback?code=...`
4. Windows launches the app via protocol activation
5. App receives the callback URL and exchanges code for tokens

**Note on WebAuthenticationBroker:**
The Windows `WebAuthenticationBroker` API is **not compatible** with React Native Windows 0.80 Composition/New Architecture apps. WAB requires a classic UWP ASTA thread with CoreWindow, but RN Windows 0.80 uses WinUI 3/Windows App SDK which doesn't provide this. The browser-based OAuth flow with deep linking is used instead.

---

## Building and Running

### Development Build

```powershell
# From Windows PowerShell in project directory
cd C:\Users\<username>\path\to\tamshai-enterprise-ai\clients\unified

# Start Metro bundler (in one terminal)
npm start

# Build and run (in another terminal)
npx react-native run-windows
```

### Production Build

```powershell
# Release build
npx react-native run-windows --release

# Create MSIX package for distribution
# (from Visual Studio or MSBuild)
msbuild windows\TamshaiAI.sln /p:Configuration=Release /p:Platform=x64
```

---

## Day-to-Day Workflow

### Developing in WSL

1. **Write code in WSL**: Edit TypeScript/React files in WSL using your preferred editor
2. **Metro bundler on Windows**: Run `npm start` on Windows to serve JS bundle
3. **Build on Windows**: Run `npx react-native run-windows` on Windows
4. **Hot reload works**: Changes in WSL are picked up by Windows Metro

### File Access Between WSL and Windows

```powershell
# Windows path to WSL project
\\wsl$\Ubuntu\home\jcornell\tamshai-enterprise-ai\clients\unified

# WSL path to Windows project (if needed)
/mnt/c/Users/jcorn/projects/tamshai-enterprise-ai/clients/unified
```

### Recommended Setup

1. **Clone repo in BOTH locations** for best performance:
   - WSL: `/home/jcornell/tamshai-enterprise-ai` (for development)
   - Windows: `C:\Users\jcorn\tamshai-enterprise-ai` (for Windows builds)

2. **Sync code via Git**:
   ```bash
   # In WSL: Push changes
   git add . && git commit -m "changes" && git push

   # In Windows PowerShell: Pull changes
   git pull
   npm install  # If package.json changed
   npx react-native run-windows
   ```

3. **Alternative: Develop directly on Windows path**:
   - Use VS Code with Remote-WSL extension
   - Project stays on Windows filesystem
   - Better performance for Windows builds

---

## Troubleshooting

### Error: "Unable to find Visual Studio"

```powershell
# Verify VS installation
& "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe" /?

# Check environment
npm config ls -l
```

### Error: "Microsoft.DesktopBridge.props was not found"

This error occurs when the UWP/WinUI workload is not installed:

```
error MSB4019: The imported project "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\DesktopBridge\Microsoft.DesktopBridge.props" was not found.
```

**Solution:** Install the **WinUI application development** workload:

1. Open Visual Studio Installer
2. Click **Modify** on VS 2022
3. Select **WinUI application development** workload
4. Click **Modify** to install

Or via command line:
```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe" modify --installPath "C:\Program Files\Microsoft Visual Studio\2022\Community" --add Microsoft.VisualStudio.Workload.Universal --includeRecommended
```

### Error: "Windows SDK not found"

1. Open Visual Studio Installer
2. Modify VS 2022
3. In Individual components, check **Windows 10 SDK (10.0.22621.0)** or later
4. Click Modify to install

### Error: Metro bundler connection issues (WSL)

When developing from WSL, ensure Windows Firewall allows Metro:

```powershell
# Allow Node.js through firewall (Admin PowerShell)
netsh advfirewall firewall add rule name="Node.js" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes
```

### Error: "Protocol handler not working"

1. Verify app is installed (appears in Start menu)
2. Check `Package.appxmanifest` has protocol extension
3. Test registration:
   ```powershell
   # Open URL manually
   start com.tamshai.ai://test
   ```

### Error: "Keychain access denied"

Windows Credential Manager requires the app to be properly signed for production. In development:
- Ensure Developer Mode is enabled
- Trust the self-signed certificate when prompted

---

## Environment Variables

Create `.env` file for Windows-specific configuration:

```env
# API Configuration
MCP_GATEWAY_URL=http://localhost:3100

# OAuth Configuration
OAUTH_ISSUER=http://localhost:8180/realms/tamshai-corp
OAUTH_CLIENT_ID=mcp-gateway-unified
OAUTH_REDIRECT_URL=com.tamshai.ai://oauth/callback

# Debug
DEBUG=true
```

---

## Scripts Reference

### PowerShell Development Scripts

Create these helper scripts in `scripts/windows/`:

**start-metro.ps1**
```powershell
# Start Metro bundler for Windows development
Set-Location $PSScriptRoot\..\..\
npm start -- --reset-cache
```

**build-windows.ps1**
```powershell
# Build and run Windows app
Set-Location $PSScriptRoot\..\..\
npx react-native run-windows
```

**build-release.ps1**
```powershell
# Create release build
Set-Location $PSScriptRoot\..\..\
npx react-native run-windows --release --arch x64
```

---

## Next Steps

After completing Windows setup:

1. ✅ Run the app successfully on Windows
2. ✅ Test OAuth login flow (protocol handler)
3. ✅ Verify secure token storage in Credential Manager
4. 🔲 Set up CI/CD for Windows builds (GitHub Actions)
5. 🔲 Configure code signing for distribution

---

## References

- [React Native for Windows](https://microsoft.github.io/react-native-windows/)
- [Getting Started Guide](https://microsoft.github.io/react-native-windows/docs/getting-started)
- [react-native-app-auth](https://github.com/FormidableLabs/react-native-app-auth)
- [react-native-keychain](https://github.com/oblador/react-native-keychain)
- [ADR-004: Platform Pivot](.specify/ARCHITECTURE_SPECS.md)
