# Flutter Multi-Environment Builds - Dev vs Stage

**Date**: December 31, 2025
**Platform**: Windows Desktop (Linux/Mac patterns similar)
**Purpose**: Build separate Flutter apps for dev and stage environments

## Overview

This guide shows how to build distinct Windows Flutter applications for:
- **Development** environment (local Docker)
- **Stage** environment (VPS)

Each build will have:
- Unique app name ("Tamshai Dev" vs "Tamshai Stage")
- Environment-specific configuration (API URLs, secrets)
- Separate installation (side-by-side on Windows)
- Distinct app icons/branding (optional)

---

## Quick Reference

### Build Commands

```bash
# Development build
cd clients/unified_flutter
flutter build windows --release --dart-define=ENV=dev --dart-define=APP_SUFFIX=Dev

# Stage build
flutter build windows --release --dart-define=ENV=stage --dart-define=APP_SUFFIX=Stage
```

### App Names

- **Development**: "Tamshai Dev" (visible in Start Menu, taskbar)
- **Stage**: "Tamshai Stage" (visible in Start Menu, taskbar)
- **Production**: "Tamshai" (no suffix)

---

## Environment Configuration Files

### Directory Structure

```
clients/unified_flutter/
├── lib/
│   └── core/
│       └── config/
│           ├── app_config.dart           # Main config loader
│           ├── dev_config.dart           # Dev environment
│           ├── stage_config.dart         # Stage environment
│           └── prod_config.dart          # Production environment
├── assets/
│   ├── icons/
│   │   ├── app_icon_dev.ico     # Dev app icon (optional)
│   │   ├── app_icon_stage.ico   # Stage app icon (optional)
│   │   └── app_icon.ico         # Production app icon
│   └── config/
│       ├── dev.json              # Dev runtime config
│       ├── stage.json            # Stage runtime config
│       └── prod.json             # Production runtime config
└── windows/
    └── runner/
        └── main.cpp              # Windows entry point (app name)
```

---

## Step 1: Create Environment Config Files

### lib/core/config/app_config.dart

Create the main configuration class:

```dart
/// Main application configuration
/// Loads environment-specific config based on build parameters
class AppConfig {
  final String apiBaseUrl;
  final String keycloakUrl;
  final String keycloakRealm;
  final String keycloakClientId;
  final String appName;
  final String appSuffix;
  final String environment;
  final bool enableDebugLogs;

  AppConfig({
    required this.apiBaseUrl,
    required this.keycloakUrl,
    required this.keycloakRealm,
    required this.keycloakClientId,
    required this.appName,
    required this.appSuffix,
    required this.environment,
    required this.enableDebugLogs,
  });

  /// Load configuration based on ENV build parameter
  static AppConfig load() {
    const String env = String.fromEnvironment('ENV', defaultValue: 'dev');

    switch (env) {
      case 'dev':
        return DevConfig.config;
      case 'stage':
        return StageConfig.config;
      case 'prod':
        return ProdConfig.config;
      default:
        throw Exception('Unknown environment: $env');
    }
  }

  /// Full app display name with suffix
  String get fullAppName => appSuffix.isEmpty
      ? appName
      : '$appName $appSuffix';
}
```

### lib/core/config/dev_config.dart

Development environment configuration:

```dart
import 'app_config.dart';

class DevConfig {
  static final AppConfig config = AppConfig(
    // Local Docker environment
    apiBaseUrl: 'http://localhost:3100',
    keycloakUrl: 'http://localhost:8180/auth',
    keycloakRealm: 'tamshai-corp',
    keycloakClientId: 'mcp-gateway',

    // App identity
    appName: 'Tamshai',
    appSuffix: 'Dev',
    environment: 'development',

    // Debug settings
    enableDebugLogs: true,
  );
}
```

### lib/core/config/stage_config.dart

Stage environment configuration (VPS):

```dart
import 'app_config.dart';

class StageConfig {
  static final AppConfig config = AppConfig(
    // VPS environment
    apiBaseUrl: 'https://$VPS_HOST/api',
    keycloakUrl: 'https://$VPS_HOST/auth',
    keycloakRealm: 'tamshai-corp',
    keycloakClientId: 'mcp-gateway',

    // App identity
    appName: 'Tamshai',
    appSuffix: 'Stage',
    environment: 'staging',

    // Debug settings (enabled for stage)
    enableDebugLogs: true,
  );
}
```

### lib/core/config/prod_config.dart

Production environment configuration:

```dart
import 'app_config.dart';

class ProdConfig {
  static final AppConfig config = AppConfig(
    // Production GCP environment (when deployed)
    apiBaseUrl: 'https://api.tamshai.com',
    keycloakUrl: 'https://auth.tamshai.com',
    keycloakRealm: 'tamshai-corp',
    keycloakClientId: 'mcp-gateway',

    // App identity (no suffix for production)
    appName: 'Tamshai',
    appSuffix: '',
    environment: 'production',

    // Debug settings (disabled for production)
    enableDebugLogs: false,
  );
}
```

---

## Step 2: Update Main App Entry Point

### lib/main.dart

Load configuration at startup:

```dart
import 'package:flutter/material.dart';
import 'core/config/app_config.dart';
import 'core/di/service_locator.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load environment-specific configuration
  final config = AppConfig.load();

  // Initialize dependency injection with config
  await setupServiceLocator(config);

  runApp(TamshaiApp(config: config));
}

class TamshaiApp extends StatelessWidget {
  final AppConfig config;

  const TamshaiApp({
    super.key,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // Use environment-specific app name
      title: config.fullAppName,

      // Show environment in debug banner
      debugShowCheckedModeBanner: config.environment != 'production',

      theme: ThemeData(
        primarySwatch: Colors.blue,
        // Add environment-specific theme variations (optional)
        appBarTheme: AppBarTheme(
          backgroundColor: _getEnvironmentColor(),
        ),
      ),

      home: const HomePage(),
    );
  }

  /// Get color based on environment (visual differentiation)
  Color _getEnvironmentColor() {
    switch (config.environment) {
      case 'development':
        return Colors.green;  // Green for dev
      case 'staging':
        return Colors.orange; // Orange for stage
      case 'production':
        return Colors.blue;   // Blue for production
      default:
        return Colors.grey;
    }
  }
}
```

---

## Step 3: Update Windows App Name

### windows/runner/main.cpp

**CRITICAL**: Windows app title must be set programmatically via Flutter

The app name shown in Windows (taskbar, Start Menu) comes from Flutter's `MaterialApp.title`, NOT from main.cpp. The main.cpp file sets only the initial window title.

**No changes needed to main.cpp** - the app name is controlled by `AppConfig.fullAppName` in the Flutter code.

### Alternative: windows/runner/Runner.rc (Optional)

If you want to set the executable's internal name metadata:

```cpp
// In Runner.rc, find the VERSION_INFO section and add/modify:

#define VERSION_AS_NUMBER 1,0,0,0
#define VERSION_AS_STRING "1.0.0"

// Add APP_SUFFIX from build args
#ifdef APP_SUFFIX_DEV
  #define APP_SUFFIX " Dev"
#elif defined(APP_SUFFIX_STAGE)
  #define APP_SUFFIX " Stage"
#else
  #define APP_SUFFIX ""
#endif

VS_VERSION_INFO VERSIONINFO
  FILEVERSION VERSION_AS_NUMBER
  PRODUCTVERSION VERSION_AS_NUMBER
  FILEFLAGSMASK VS_FFI_FILEFLAGSMASK
  FILEFLAGS 0x0L
  FILEOS VOS_NT_WINDOWS32
  FILETYPE VFT_APP
  FILESUBTYPE 0x0L
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904e4"
    BEGIN
      VALUE "CompanyName", "Tamshai Corporation" "\0"
      VALUE "FileDescription", "Tamshai Enterprise AI" APP_SUFFIX "\0"
      VALUE "FileVersion", VERSION_AS_STRING "\0"
      VALUE "InternalName", "tamshai" "\0"
      VALUE "LegalCopyright", "Copyright (C) 2025 Tamshai Corporation" "\0"
      VALUE "OriginalFilename", "tamshai.exe" "\0"
      VALUE "ProductName", "Tamshai" APP_SUFFIX "\0"
      VALUE "ProductVersion", VERSION_AS_STRING "\0"
    END
  END
END
```

**Note**: This is optional metadata and doesn't affect the displayed app name.

---

## Step 4: Build Process

### Development Build

```bash
cd clients/unified_flutter

# Clean previous builds
flutter clean

# Get dependencies
flutter pub get

# Generate code (Freezed, JSON serialization)
flutter pub run build_runner build --delete-conflicting-outputs

# Build for Windows (Development)
flutter build windows --release \
  --dart-define=ENV=dev \
  --dart-define=APP_SUFFIX=Dev
```

**Output Location**:
```
build/windows/x64/runner/Release/
├── tamshai.exe          # Executable
├── flutter_windows.dll
├── data/                # Assets and config
└── ... (other DLLs)
```

**App Name in Windows**: "Tamshai Dev"

### Stage Build

```bash
cd clients/unified_flutter

# Clean previous builds
flutter clean

# Get dependencies
flutter pub get

# Generate code
flutter pub run build_runner build --delete-conflicting-outputs

# Build for Windows (Stage)
flutter build windows --release \
  --dart-define=ENV=stage \
  --dart-define=APP_SUFFIX=Stage
```

**Output Location**: Same as dev (overwrites if not moved)

**App Name in Windows**: "Tamshai Stage"

**IMPORTANT**: Move or rename the Release folder after each build to avoid overwriting:

```bash
# After dev build
move build\windows\x64\runner\Release build\windows\x64\runner\Release-Dev

# After stage build
move build\windows\x64\runner\Release build\windows\x64\runner\Release-Stage
```

---

## Step 5: Installation & Distribution

### Option 1: Manual Installation (Development)

1. Build the app (dev or stage)
2. Copy the entire `Release` folder to desired location:
   ```
   C:\Program Files\Tamshai Dev\
   C:\Program Files\Tamshai Stage\
   ```
3. Create shortcuts on Desktop/Start Menu
4. Both apps can run simultaneously (different names, different configs)

### Option 2: MSIX Installer (Recommended)

#### Install MSIX Tooling

```bash
flutter pub add msix
```

#### Configure MSIX: pubspec.yaml

```yaml
msix_config:
  # Development variant
  display_name: Tamshai Dev
  publisher_display_name: Tamshai Corporation
  identity_name: com.tamshai.app.dev
  msix_version: 1.0.0.0
  logo_path: assets/icons/app_icon_dev.png
  capabilities: internetClient

  # Optional: Different install location
  install_location: Tamshai Dev
```

#### Build MSIX (Development)

```bash
# Build app first
flutter build windows --release --dart-define=ENV=dev --dart-define=APP_SUFFIX=Dev

# Create MSIX installer
flutter pub run msix:create
```

**Output**: `build/windows/x64/runner/Release/tamshai.msix`

#### Build MSIX (Stage)

Update `pubspec.yaml`:

```yaml
msix_config:
  display_name: Tamshai Stage
  publisher_display_name: Tamshai Corporation
  identity_name: com.tamshai.app.stage  # MUST be different from dev
  msix_version: 1.0.0.0
  logo_path: assets/icons/app_icon_stage.png
  install_location: Tamshai Stage
```

```bash
# Build app
flutter build windows --release --dart-define=ENV=stage --dart-define=APP_SUFFIX=Stage

# Create MSIX
flutter pub run msix:create
```

**IMPORTANT**: `identity_name` MUST be different for each environment to allow side-by-side installation.

---

## Step 6: Verify Environment Configuration

### In-App Verification

Add a debug screen to show current configuration:

```dart
// lib/features/settings/debug_info_screen.dart
import 'package:flutter/material.dart';
import '../../core/config/app_config.dart';
import '../../core/di/service_locator.dart';

class DebugInfoScreen extends StatelessWidget {
  const DebugInfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final config = getIt<AppConfig>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Debug Information'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildInfoTile('App Name', config.fullAppName),
          _buildInfoTile('Environment', config.environment),
          _buildInfoTile('API Base URL', config.apiBaseUrl),
          _buildInfoTile('Keycloak URL', config.keycloakUrl),
          _buildInfoTile('Keycloak Realm', config.keycloakRealm),
          _buildInfoTile('Client ID', config.keycloakClientId),
          _buildInfoTile('Debug Logs', config.enableDebugLogs.toString()),
        ],
      ),
    );
  }

  Widget _buildInfoTile(String label, String value) {
    return ListTile(
      title: Text(label),
      subtitle: Text(
        value,
        style: const TextStyle(fontFamily: 'monospace'),
      ),
    );
  }
}
```

### Manual Testing

1. **Install Dev App**:
   - Verify app name in Start Menu shows "Tamshai Dev"
   - Open app, check Settings → Debug Info
   - Verify API URL: `http://localhost:3100`
   - Verify Keycloak URL: `http://localhost:8180/auth`

2. **Install Stage App**:
   - Verify app name in Start Menu shows "Tamshai Stage"
   - Open app, check Settings → Debug Info
   - Verify API URL: `https://$VPS_HOST/api`
   - Verify Keycloak URL: `https://$VPS_HOST/auth`

3. **Side-by-Side Test**:
   - Run both apps simultaneously
   - Verify they connect to different backends
   - Verify taskbar shows both "Tamshai Dev" and "Tamshai Stage"

---

## Environment Comparison

| Aspect | Development | Stage | Production |
|--------|------------|-------|------------|
| **App Name** | Tamshai Dev | Tamshai Stage | Tamshai |
| **API URL** | http://localhost:3100 | https://$VPS_HOST/api | https://api.tamshai.com |
| **Keycloak URL** | http://localhost:8180/auth | https://$VPS_HOST/auth | https://auth.tamshai.com |
| **Realm** | tamshai-corp | tamshai-corp | tamshai-corp |
| **Backend** | Local Docker | Hetzner VPS | GCP GKE |
| **Debug Logs** | Enabled | Enabled | Disabled |
| **Theme Color** | Green AppBar | Orange AppBar | Blue AppBar |
| **MSIX Identity** | com.tamshai.app.dev | com.tamshai.app.stage | com.tamshai.app |
| **Install Location** | `C:\Program Files\Tamshai Dev` | `C:\Program Files\Tamshai Stage` | `C:\Program Files\Tamshai` |

---

## Build Scripts

### PowerShell Build Script

Create `scripts/build-flutter-windows.ps1`:

```powershell
<#
.SYNOPSIS
    Build Flutter Windows app for specified environment
.PARAMETER Environment
    Target environment: dev, stage, or prod
.EXAMPLE
    .\build-flutter-windows.ps1 -Environment dev
    .\build-flutter-windows.ps1 -Environment stage
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "stage", "prod")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

# Determine app suffix
$AppSuffix = switch ($Environment) {
    "dev" { "Dev" }
    "stage" { "Stage" }
    "prod" { "" }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Building Flutter Windows App" -ForegroundColor Cyan
Write-Host " Environment: $Environment" -ForegroundColor Cyan
Write-Host " App Suffix: $AppSuffix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to Flutter project
Set-Location "clients/unified_flutter"

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
flutter clean

# Get dependencies
Write-Host "Getting dependencies..." -ForegroundColor Yellow
flutter pub get

# Generate code (Freezed, JSON serialization)
Write-Host "Generating code..." -ForegroundColor Yellow
flutter pub run build_runner build --delete-conflicting-outputs

# Build Windows app
Write-Host "Building Windows app for $Environment..." -ForegroundColor Yellow
flutter build windows --release `
    --dart-define=ENV=$Environment `
    --dart-define=APP_SUFFIX=$AppSuffix

# Move build output
$SourceDir = "build\windows\x64\runner\Release"
$TargetDir = "build\windows\x64\runner\Release-$AppSuffix"

if (Test-Path $TargetDir) {
    Write-Host "Removing existing $TargetDir..." -ForegroundColor Yellow
    Remove-Item -Path $TargetDir -Recurse -Force
}

Write-Host "Moving build to $TargetDir..." -ForegroundColor Yellow
Move-Item -Path $SourceDir -Destination $TargetDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Build Complete!" -ForegroundColor Green
Write-Host " Output: $TargetDir" -ForegroundColor Green
Write-Host " Executable: $TargetDir\tamshai.exe" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
```

### Bash Build Script (Git Bash/WSL)

Create `scripts/build-flutter-windows.sh`:

```bash
#!/bin/bash
set -e

ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <dev|stage|prod>"
    exit 1
fi

case $ENVIRONMENT in
    dev)
        APP_SUFFIX="Dev"
        ;;
    stage)
        APP_SUFFIX="Stage"
        ;;
    prod)
        APP_SUFFIX=""
        ;;
    *)
        echo "Invalid environment: $ENVIRONMENT"
        echo "Valid options: dev, stage, prod"
        exit 1
        ;;
esac

echo "========================================"
echo " Building Flutter Windows App"
echo " Environment: $ENVIRONMENT"
echo " App Suffix: $APP_SUFFIX"
echo "========================================"
echo ""

cd clients/unified_flutter

echo "Cleaning previous builds..."
flutter clean

echo "Getting dependencies..."
flutter pub get

echo "Generating code..."
flutter pub run build_runner build --delete-conflicting-outputs

echo "Building Windows app for $ENVIRONMENT..."
flutter build windows --release \
    --dart-define=ENV=$ENVIRONMENT \
    --dart-define=APP_SUFFIX=$APP_SUFFIX

SOURCE_DIR="build/windows/x64/runner/Release"
TARGET_DIR="build/windows/x64/runner/Release-$APP_SUFFIX"

if [ -d "$TARGET_DIR" ]; then
    echo "Removing existing $TARGET_DIR..."
    rm -rf "$TARGET_DIR"
fi

echo "Moving build to $TARGET_DIR..."
mv "$SOURCE_DIR" "$TARGET_DIR"

echo ""
echo "========================================"
echo " Build Complete!"
echo " Output: $TARGET_DIR"
echo " Executable: $TARGET_DIR/tamshai.exe"
echo "========================================"
```

---

## Troubleshooting

### Issue: Both Apps Show Same Name

**Cause**: App name is cached or not using environment config

**Solution**:
1. Verify `AppConfig.load()` is called in `main.dart`
2. Check `MaterialApp.title` uses `config.fullAppName`
3. Do full clean rebuild: `flutter clean && flutter build windows`

### Issue: Can't Install Both Apps (MSIX Conflict)

**Cause**: Both MSIX packages have same `identity_name`

**Solution**:
- Ensure `pubspec.yaml` has different `identity_name` for each environment:
  - Dev: `com.tamshai.app.dev`
  - Stage: `com.tamshai.app.stage`
  - Prod: `com.tamshai.app`

### Issue: Wrong API URL in App

**Cause**: Environment not detected correctly

**Solution**:
1. Verify build command includes `--dart-define=ENV=<env>`
2. Check debug info screen shows correct environment
3. Add logging to `AppConfig.load()` to see which config is loaded

### Issue: Connection Refused to Localhost

**Cause**: Dev infrastructure not running

**Solution**:
```bash
cd infrastructure/terraform/dev
terraform apply -var-file=dev.tfvars
```

Verify services:
```bash
docker ps --filter "name=tamshai"
```

---

## Best Practices

1. **Always Specify Environment**: Don't rely on default, always use `--dart-define=ENV=<env>`

2. **Test Both Builds**: After changes, test both dev and stage builds to ensure config works

3. **Version Separately**: Consider separate version numbers for each environment in CI/CD

4. **Use Different Icons**: Visual differentiation helps avoid confusion (optional but recommended)

5. **Document URLs**: Keep a reference doc with all environment URLs for easy lookup

6. **Automate Builds**: Use the provided build scripts for consistency

7. **Clean Between Builds**: Always `flutter clean` when switching environments

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Build Flutter Windows

on:
  push:
    branches: [main, develop]
    paths:
      - 'clients/unified_flutter/**'

jobs:
  build-dev:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.0'

      - name: Build Dev
        run: |
          cd clients/unified_flutter
          flutter pub get
          flutter pub run build_runner build --delete-conflicting-outputs
          flutter build windows --release `
            --dart-define=ENV=dev `
            --dart-define=APP_SUFFIX=Dev

      - uses: actions/upload-artifact@v4
        with:
          name: tamshai-dev-windows
          path: clients/unified_flutter/build/windows/x64/runner/Release/

  build-stage:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.0'

      - name: Build Stage
        run: |
          cd clients/unified_flutter
          flutter pub get
          flutter pub run build_runner build --delete-conflicting-outputs
          flutter build windows --release `
            --dart-define=ENV=stage `
            --dart-define=APP_SUFFIX=Stage

      - uses: actions/upload-artifact@v4
        with:
          name: tamshai-stage-windows
          path: clients/unified_flutter/build/windows/x64/runner/Release/
```

---

## Conclusion

This multi-environment build strategy allows you to:

✅ **Build separate apps** for dev and stage with distinct names
✅ **Install side-by-side** on Windows without conflicts
✅ **Target different backends** automatically based on build
✅ **Visual differentiation** via app names and theme colors
✅ **Streamlined development** with automated build scripts

The key is using Flutter's `--dart-define` to set environment at build time, which loads the appropriate configuration at runtime.
