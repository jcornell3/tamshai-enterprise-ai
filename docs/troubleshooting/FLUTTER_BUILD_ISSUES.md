# Flutter Build Issues - Troubleshooting Guide

**Document Version**: 1.0
**Created**: January 5, 2026
**Last Updated**: January 5, 2026

This document summarizes the Flutter build issues encountered, dependency mismatches resolved, and the current working configuration.

---

## Current Working Configuration

### Flutter & Dart Versions

| Workflow | Flutter Version | Dart Version | Notes |
|----------|-----------------|--------------|-------|
| build-flutter-native.yml | 3.29.0 | 3.7.x | Android, iOS, macOS, Windows |
| deploy-frontend-desktop.yml | 3.29.0 | 3.7.x | Web build |
| create-release.yml | 3.27.0 | 3.6.x | Release workflow (may need update) |

### Android SDK Configuration

**File**: `clients/unified_flutter/android/app/build.gradle.kts`

```kotlin
android {
    compileSdk = 36          // Required by flutter_secure_storage
    ndkVersion = "27.0.12077973"  // Required by multiple plugins

    defaultConfig {
        minSdk = 24          // Required by flutter_secure_storage (was 21)
        targetSdk = flutter.targetSdkVersion
    }
}
```

### Dependency Versions (pubspec.yaml)

| Package | Version | Constraint | Notes |
|---------|---------|------------|-------|
| flutter_appauth | 11.0.0 | ^11.0.0 | Requires Dart ^3.7.0 |
| flutter_secure_storage | 10.0.0 | ^10.0.0 | Requires Android SDK 36, minSdk 24 |
| flutter_riverpod | 2.5.1 | ^2.5.1 | Downgraded from 3.x (requires Dart 3.7+) |
| go_router | 14.0.0 | ^14.0.0 | Downgraded from 17.x (requires Dart 3.9+) |
| flutter_lints | 5.0.0 | ^5.0.0 | Downgraded from 6.x (requires Dart 3.8+) |
| speech_to_text | 7.0.0 | ^7.0.0 | Upgraded from 6.x (Kotlin embedding v2 fix) |
| freezed | 2.5.7 | ^2.5.7 | Pinned to 2.x for Dart 3.6 compatibility |
| freezed_annotation | 2.4.4 | ^2.4.4 | Pinned to 2.x for Dart 3.6 compatibility |
| build_runner | 2.5.4 | ^2.5.4 | Pinned to 2.5.x for freezed 2.x compatibility |
| json_serializable | 6.8.0 | ^6.8.0 | Pinned to 6.8.x for Dart 3.6 compatibility |

---

## Issues Resolved

### 1. flutter_appauth Requires Dart 3.7+

**Commit**: `38ec466` - ci(flutter): Upgrade to Flutter 3.29.0 for Dart 3.7+ compatibility

**Error**:
```
flutter_appauth ^11.0.0 requires Dart ^3.7.0
```

**Root Cause**:
CI workflows were using Flutter 3.24.0/3.27.0 which ships with Dart 3.5.x/3.6.x. The flutter_appauth package requires Dart 3.7+.

**Fix**:
Updated both workflow files to use Flutter 3.29.0:
- `deploy-frontend-desktop.yml`: 3.24.0 → 3.29.0
- `build-flutter-native.yml`: 3.27.0 → 3.29.0

---

### 2. flutter_riverpod 3.x Requires Dart 3.7+

**Commit**: `5c4a051` - fix(flutter): Downgrade flutter_riverpod to 2.5.1 for Dart 3.6 compatibility

**Error**:
```
flutter_riverpod 3.x requires Dart SDK ^3.7.0
```

**Root Cause**:
flutter_riverpod 3.x was released with a Dart 3.7+ requirement, but CI was running Dart 3.6.

**Fix**:
Downgraded to flutter_riverpod ^2.5.1 which supports Dart 3.4+.

---

### 3. Riverpod legacy.dart Import Errors

**Commit**: `36cced9` - fix(flutter): Remove Riverpod legacy.dart imports (2.x compatibility)

**Error**:
```
Could not find package 'flutter_riverpod/legacy.dart'
```

**Root Cause**:
The `legacy.dart` barrel file only exists in flutter_riverpod 3.x to provide backward compatibility for `StateNotifier`. In 2.x, `StateNotifier` is available directly from the main package.

**Files Fixed**:
- `lib/core/auth/auth_provider.dart`
- `lib/features/chat/providers/chat_provider.dart`
- `lib/features/chat/providers/speech_provider.dart`
- `test/features/chat/widgets/chat_input_test.dart`

**Fix**:
```dart
// BEFORE (3.x style)
import 'package:flutter_riverpod/legacy.dart';

// AFTER (2.x style)
import 'package:flutter_riverpod/flutter_riverpod.dart';
```

---

### 4. go_router 17.x Requires Dart 3.9+

**Commit**: `e5485e5` - fix(flutter): Downgrade go_router for Dart 3.6 compatibility

**Error**:
```
go_router 17.x requires Dart SDK ^3.9.0
```

**Root Cause**:
go_router 17.x was released with a Dart 3.9+ requirement, which doesn't exist yet.

**Fix**:
Downgraded to go_router ^14.0.0 which supports Dart 3.5+.

---

### 5. flutter_lints 6.x Requires Dart 3.8+

**Commit**: `73abcf5` - fix(flutter): Downgrade flutter_lints to ^5.0.0 for Dart 3.5+ compatibility

**Error**:
```
flutter_lints 6.0.0 requires Dart SDK ^3.8.0
```

**Root Cause**:
flutter_lints 6.x was released with a Dart 3.8+ requirement.

**Fix**:
Downgraded to flutter_lints ^5.0.0 which supports Dart 3.5+.

---

### 6. Android SDK Version Mismatches

**Commit**: `30c22b3` - fix(flutter): Update Android SDK and speech_to_text for compatibility

**Errors**:
```
flutter_secure_storage requires Android SDK version 36
uses-sdk:minSdkVersion 21 cannot be smaller than version 24
NDK version mismatch: requires 27.0.12077973
```

**Root Cause**:
Multiple plugins updated their Android SDK requirements:
- `flutter_secure_storage`: compileSdk 36, minSdk 24
- Multiple plugins: NDK 27.0.12077973

**Fix** (build.gradle.kts):
```kotlin
android {
    compileSdk = 36                    // Was: flutter.compileSdkVersion
    ndkVersion = "27.0.12077973"       // Was: flutter.ndkVersion

    defaultConfig {
        minSdk = 24                    // Was: flutter.minSdkVersion (21)
    }
}
```

---

### 7. speech_to_text Kotlin Embedding v1 Errors

**Commit**: `30c22b3` - fix(flutter): Update Android SDK and speech_to_text for compatibility

**Errors**:
```
Unresolved reference 'Registrar'
Unresolved reference 'activity'
Unresolved reference 'context'
Unresolved reference 'messenger'
```

**Root Cause**:
speech_to_text 6.x still contained legacy Flutter embedding v1 code using deprecated `Registrar` API. This was removed in newer Flutter/Gradle versions.

**Fix**:
Upgraded from speech_to_text ^6.6.0 to ^7.0.0 which uses embedding v2 exclusively.

---

### 8. Deprecated --web-renderer Flag

**Commit**: `f413a28` - fix(ci): Remove deprecated --web-renderer flag for Flutter 3.29.0

**Error**:
```
Could not find an option named "--web-renderer"
```

**Root Cause**:
The `--web-renderer canvaskit` flag was removed in Flutter 3.29.0. CanvasKit is now the default renderer.

**Fix**:
Removed the flag from the build command:
```yaml
# BEFORE
run: flutter build web --release --web-renderer canvaskit

# AFTER
run: flutter build web --release
```

---

### 9. Missing Web Platform Support

**Commit**: `0693b0b` - feat(flutter): Add web platform support

**Error**:
```
Missing index.html
```

**Root Cause**:
The Flutter project was created without web support. The `web/` folder with `index.html` was missing.

**Fix**:
Created `clients/unified_flutter/web/` folder with:
- `index.html` - Flutter bootstrap code
- `manifest.json` - PWA manifest
- `icons/` - Placeholder icons

---

### 10. Cloudflare Pages Deployment Removed

**Commit**: `722765a` - refactor(ci): Remove Cloudflare Pages, convert to build-only workflow

**Error**:
```
Input required and not supplied: apiToken
```

**Root Cause**:
Workflow was configured to deploy to Cloudflare Pages, but no `CLOUDFLARE_API_TOKEN` secret was set. The project uses VPS deployment, not Cloudflare Pages.

**Fix**:
- Removed Cloudflare Pages deployment step
- Converted to build-only validation workflow
- Upload build artifacts for inspection

---

## Related Commits

| Commit | Description |
|--------|-------------|
| `30c22b3` | Update Android SDK to 36, NDK to 27.x, minSdk to 24, speech_to_text to 7.x |
| `722765a` | Remove Cloudflare Pages, convert to build-only workflow |
| `0693b0b` | Add web platform support (index.html, manifest.json) |
| `f413a28` | Remove deprecated --web-renderer flag for Flutter 3.29.0 |
| `36cced9` | Remove Riverpod legacy.dart imports (2.x compatibility) |
| `38ec466` | Upgrade to Flutter 3.29.0 for Dart 3.7+ compatibility |
| `fa19edb` | Regenerate freezed models for riverpod 2.x |
| `5c4a051` | Downgrade flutter_riverpod to 2.5.1 for Dart 3.6 compatibility |
| `e5485e5` | Downgrade go_router to ^14.0.0 for Dart 3.6 compatibility |
| `73abcf5` | Downgrade flutter_lints to ^5.0.0 for Dart 3.5+ compatibility |

---

## Dependency Compatibility Matrix

This matrix shows the Dart SDK requirements for common packages:

| Package | Version | Min Dart | Max Dart | Notes |
|---------|---------|----------|----------|-------|
| flutter_riverpod | 2.5.x | 3.4.0 | - | Use for Dart < 3.7 |
| flutter_riverpod | 3.x | 3.7.0 | - | Use for Dart >= 3.7 |
| go_router | 14.x | 3.5.0 | - | Use for Dart < 3.9 |
| go_router | 17.x | 3.9.0 | - | Not released yet |
| flutter_lints | 5.x | 3.5.0 | - | Use for Dart < 3.8 |
| flutter_lints | 6.x | 3.8.0 | - | Use for Dart >= 3.8 |
| flutter_appauth | 11.x | 3.7.0 | - | OAuth/OIDC |
| freezed | 2.x | 3.0.0 | 3.6.x | Code generation |
| freezed | 3.x | 3.7.0 | - | Not tested |

---

## Flutter Version to Dart Version Mapping

| Flutter | Dart | Release Date |
|---------|------|--------------|
| 3.24.0 | 3.5.0 | Aug 2024 |
| 3.27.0 | 3.6.0 | Dec 2024 |
| 3.29.0 | 3.7.0 | Jan 2025 |

---

## Diagnostic Commands

### Check Flutter/Dart Versions

```bash
flutter --version
dart --version
```

### Analyze Dependencies

```bash
cd clients/unified_flutter

# Check for dependency issues
flutter pub deps

# Outdated packages
flutter pub outdated

# Resolve dependencies
flutter pub get
```

### Build Commands

```bash
cd clients/unified_flutter

# Web build
flutter build web --release

# Android build
flutter build apk --release

# Windows build
flutter build windows --release

# iOS build (macOS only)
flutter build ios --release --no-codesign

# With environment
flutter build apk --release --dart-define=ENV=stage
```

### Check Android SDK

```bash
# List installed SDKs
sdkmanager --list

# Install specific SDK
sdkmanager "platforms;android-36"
sdkmanager "ndk;27.0.12077973"
```

### Regenerate Code

```bash
cd clients/unified_flutter

# Clean and regenerate
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

---

### 11. Missing appAuthRedirectScheme for Android OAuth

**Commit**: `ac75fd4` - fix(flutter): Fix Android, macOS, and Windows native builds

**Error**:
```
Attribute data@scheme at AndroidManifest.xml requires a placeholder substitution
but no value for <appAuthRedirectScheme> is provided.
```

**Root Cause**:
The `flutter_appauth` package requires an `appAuthRedirectScheme` manifest placeholder for OAuth redirect handling. This was missing from `build.gradle.kts`.

**Fix** (build.gradle.kts):
```kotlin
defaultConfig {
    // ... other config ...

    // Required by flutter_appauth for OAuth redirect
    manifestPlaceholders["appAuthRedirectScheme"] = "com.tamshai.unified_flutter"
}
```

**Status**: ✅ Fixed - Android build now passing

---

### 12. Missing macOS Platform Support

**Commit**: `ac75fd4` - fix(flutter): Fix Android, macOS, and Windows native builds

**Error**:
```
No macOS desktop project configured.
See https://flutter.dev/to/add-desktop-support to learn about adding macOS support to a project.
```

**Root Cause**:
The Flutter project was created without macOS platform support. The `macos/` folder was missing.

**Fix**:
```bash
cd clients/unified_flutter
flutter create --platforms=macos .
```

**Status**: ✅ Fixed - macOS platform folder created

---

### 13. macOS Deployment Target Too Low for speech_to_text

**Commits**:
- `27ce66a` - fix(flutter): Fix macOS deployment target and Windows CI cache
- `40ec1ee` - fix(flutter): Add macOS Podfile with platform 11.0

**Error**:
```
speech_to_text requires a higher minimum macOS deployment version (11.00)
```

**Root Cause**:
The `speech_to_text` package requires macOS 11.0 (Big Sur) or later, but the default Flutter macOS configuration uses 10.15 (Catalina). Both the Xcode project and CocoaPods Podfile needed to be updated.

**Fix** (project.pbxproj):
Changed all instances of `MACOSX_DEPLOYMENT_TARGET = 10.15;` to `MACOSX_DEPLOYMENT_TARGET = 11.0;`

**Fix** (Podfile):
Created/updated `clients/unified_flutter/macos/Podfile` with:
```ruby
platform :osx, '11.0'
```

**Status**: ✅ Fixed - macOS build now passing

---

### 14. Windows speech_to_text_windows Plugin Registration Missing

**Commits**:
- `27ce66a` - fix(flutter): Fix macOS deployment target and Windows CI cache
- `fe89a92` - fix(flutter): Force clean Windows ephemeral folder in CI

**Error**:
```
'SpeechToTextWindowsRegisterWithRegistrar': identifier not found
[build\windows\x64\runner\unified_flutter.vcxproj]
```

**Root Cause**:
The `speech_to_text` 7.0.0 package includes `speech_to_text_windows` as a federated plugin for Windows support. However, this plugin doesn't properly expose a `SpeechToTextWindowsRegisterWithRegistrar` function for the Flutter Windows plugin registration system.

The `generated_plugin_registrant.cc` file expects this function to exist, but the speech_to_text_windows package either:
1. Doesn't implement Windows plugin registration correctly
2. Has a version mismatch with the main speech_to_text package
3. Uses a different registration mechanism not compatible with standard Flutter Windows builds

**Attempted Fixes (Not Working)**:
- `flutter clean` + `flutter pub get` in CI
- Deleting `windows/flutter/ephemeral` folder before build
- Regenerating plugin registrant locally

**Potential Solutions**:
1. **Disable speech_to_text on Windows**: Use conditional imports to exclude the package on Windows
2. **Pin to older speech_to_text version**: Downgrade to a version without Windows support
3. **Create mock Windows plugin**: Create a no-op Windows implementation

**Status**: ❌ In Progress - Investigating solution

---

## Prevention Measures

1. **Pin major versions** - Use `^2.5.1` not `^2.0.0` to avoid unexpected major version jumps
2. **Check Dart requirements** - Before upgrading, check `pub.dev` for SDK constraints
3. **Test locally first** - Run `flutter pub get` locally before pushing
4. **Keep Flutter version consistent** - All workflows should use the same Flutter version
5. **Watch for deprecations** - Flutter removes deprecated flags in minor versions
6. **Check Android plugin requirements** - Native plugins may require specific SDK versions

---

## References

- [Flutter SDK Releases](https://docs.flutter.dev/release/archive)
- [Dart SDK Compatibility](https://dart.dev/guides/language/evolution)
- [pub.dev Package Search](https://pub.dev/)
- [Android SDK Platform Tools](https://developer.android.com/studio/releases/platforms)
