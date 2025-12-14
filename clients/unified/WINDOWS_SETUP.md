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
3. Select these workloads:
   - ✅ **Desktop development with C++**
   - ✅ **Universal Windows Platform development**
4. In **Individual components**, ensure these are selected:
   - ✅ Windows 10 SDK (10.0.19041.0) or later
   - ✅ Windows 11 SDK (if targeting Windows 11)
   - ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools
   - ✅ C++ CMake tools for Windows
5. Click **Modify** to install

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

```powershell
# Enable Developer Mode (required for symlinks)
# Settings > Update & Security > For Developers > Developer Mode: ON

# Or via PowerShell (Admin):
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1"
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

# Initialize React Native Windows
npx react-native-windows-init --overwrite

# This creates:
# - windows/           (Visual Studio solution)
# - windows/TamshaiAI/ (UWP project)
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

### Step 3: Configure react-native-keychain for Windows

The `react-native-keychain` library uses Windows Credential Manager on Windows. After running `react-native-windows-init`, link the native module:

```powershell
# Link native modules (auto-linking should work, but verify)
npx react-native autolink-windows
```

### Step 4: Configure react-native-app-auth for Windows

For OAuth, `react-native-app-auth` on Windows uses WebAuthenticationBroker. The redirect URI must be registered:

1. In `Package.appxmanifest`, add the redirect capability
2. The redirect URI format is: `com.tamshai.ai://oauth/callback`

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

### Error: "Windows SDK not found"

1. Open Visual Studio Installer
2. Modify VS 2022
3. Ensure Windows SDK is checked
4. Repair if needed

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
