# Flutter Unified Client - Platform Setup Guide

**Version**: 1.0.0
**Last Updated**: January 22, 2026
**Status**: Production Ready

---

## Overview

The unified Flutter client provides a cross-platform desktop/mobile interface with:
- OAuth authentication with Keycloak (PKCE flow)
- Real-time SSE streaming for AI responses
- Voice input using system microphone
- Secure token storage
- v1.4 features: truncation warnings, HITL confirmations

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Download |
|----------|---------|---------|----------|
| **Flutter SDK** | 3.24+ | Cross-platform framework | [flutter.dev](https://docs.flutter.dev/get-started/install) |
| **Dart SDK** | 3.4+ | Included with Flutter | Included |

### Verify Installation

```bash
flutter --version          # Should be 3.24+
flutter doctor             # Should show all green checkmarks
dart --version             # Should be 3.4+
```

---

## Platform-Specific Setup

### Windows Requirements

For Flutter Windows desktop development:

1. **Visual Studio 2022** (Community edition is free)
   - Download: [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/)
   - Required workloads during installation:
     - **"Desktop development with C++"**
     - Windows 10/11 SDK (10.0.19041.0 or later)
   - Or install via command line:
     ```powershell
     winget install Microsoft.VisualStudio.2022.Community
     # Then run Visual Studio Installer and add C++ workload
     ```

2. **Enable Windows Desktop Support**
   ```powershell
   flutter doctor          # Verify installation
   flutter config --enable-windows-desktop
   ```

3. **Build and Run**
   ```powershell
   cd clients/unified_flutter
   flutter pub get
   flutter pub run build_runner build --delete-conflicting-outputs
   flutter run -d windows
   ```

---

### macOS Requirements

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CocoaPods (for iOS/macOS)
sudo gem install cocoapods

# Enable macOS desktop
flutter config --enable-macos-desktop

# Build and run
cd clients/unified_flutter
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
flutter run -d macos
```

---

### Linux Requirements

```bash
# Ubuntu/Debian
sudo apt-get install clang cmake ninja-build pkg-config \
  libgtk-3-dev liblzma-dev libstdc++-12-dev

# Enable Linux desktop
flutter config --enable-linux-desktop

# Build and run
cd clients/unified_flutter
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
flutter run -d linux
```

---

### Android Development Requirements

For Flutter Android development (mobile app):

1. **Java Development Kit (JDK) 17**
   - Download from [Adoptium](https://adoptium.net/temurin/releases/?version=17)
   - Or via command line:
     ```bash
     # Windows (PowerShell) - Download and extract to C:\Users\<username>\Java
     curl -L -o jdk17.zip "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"

     # macOS
     brew install openjdk@17

     # Ubuntu/Debian
     sudo apt install openjdk-17-jdk
     ```

2. **Android SDK Command-Line Tools**
   - Download from [Android Developer](https://developer.android.com/studio#command-line-tools-only)
   - Extract to `Android/Sdk/cmdline-tools/latest/`
   - Or via command line:
     ```bash
     # Windows - Create SDK directory and download
     mkdir -p ~/Android/Sdk/cmdline-tools
     curl -o ~/Android/commandlinetools.zip https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip
     unzip ~/Android/commandlinetools.zip -d ~/Android/Sdk/cmdline-tools
     mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
     ```

3. **Install SDK Packages** (requires JAVA_HOME set)
   ```bash
   # Set JAVA_HOME (adjust path to your JDK location)
   export JAVA_HOME="/c/Users/<username>/Java/jdk-17.0.17+10"  # Windows Git Bash
   # or
   export JAVA_HOME="$HOME/Java/jdk-17.0.17+10"  # macOS/Linux

   # Install required packages
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME \
     "platform-tools" "build-tools;34.0.0" "platforms;android-34" "platforms;android-36"

   # Accept all licenses
   $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME --licenses
   ```

4. **Configure Flutter**
   ```bash
   # Point Flutter to your SDK and JDK
   flutter config --android-sdk ~/Android/Sdk
   flutter config --jdk-dir ~/Java/jdk-17.0.17+10

   # Verify setup
   flutter doctor -v
   ```

5. **Environment Variables** (add to shell profile)
   ```bash
   export ANDROID_HOME="$HOME/Android/Sdk"
   export JAVA_HOME="$HOME/Java/jdk-17.0.17+10"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
   ```

6. **Build APK**
   ```bash
   cd clients/unified_flutter
   flutter build apk --release
   # Output: build/app/outputs/flutter-apk/app-release.apk

   # Or build App Bundle for Play Store
   flutter build appbundle --release
   ```

---

### iOS Development Requirements

For Flutter iOS development (requires macOS):

1. **Xcode** (latest version from App Store)
   ```bash
   # Install from App Store or:
   xcode-select --install
   ```

2. **CocoaPods**
   ```bash
   sudo gem install cocoapods
   ```

3. **iOS Simulator or Physical Device**
   ```bash
   # Open iOS Simulator
   open -a Simulator

   # Or connect physical iOS device via USB
   ```

4. **Build and Run**
   ```bash
   cd clients/unified_flutter
   flutter pub get
   flutter pub run build_runner build --delete-conflicting-outputs
   flutter run -d ios
   ```

5. **Build for App Store**
   ```bash
   flutter build ios --release
   # Then use Xcode to archive and upload
   ```

---

## Quick Start

```bash
cd clients/unified_flutter

# Get dependencies
flutter pub get

# Generate code (Freezed models)
flutter pub run build_runner build --delete-conflicting-outputs

# Run on your platform
flutter run -d windows   # Windows
flutter run -d macos     # macOS
flutter run -d linux     # Linux
flutter run -d android   # Android (requires device/emulator)
flutter run -d ios       # iOS (requires macOS + device/simulator)
```

---

## Project Structure

```
clients/unified_flutter/
├── lib/
│   ├── core/
│   │   ├── auth/         # OAuth service, secure storage, auth state
│   │   └── api/          # Dio HTTP client with auth interceptor
│   ├── features/
│   │   ├── chat/         # Chat UI, SSE streaming, message handling
│   │   └── home/         # Home screen, user profile display
│   └── main.dart         # App entry point
├── test/                 # Widget and unit tests
├── pubspec.yaml          # Dependencies
└── README.md            # This file
```

---

## Troubleshooting

### Flutter Doctor Fails

```bash
# Run doctor with verbose output
flutter doctor -v

# Common fixes:
# - Android: Accept licenses with `flutter doctor --android-licenses`
# - Windows: Install Visual Studio C++ workload
# - macOS: Run `sudo xcode-select --switch /Applications/Xcode.app`
```

### Build Errors

```bash
# Clean and rebuild
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### Code Generation Fails

```bash
# Delete generated files and rebuild
rm -rf lib/**/*.g.dart lib/**/*.freezed.dart
flutter pub run build_runner build --delete-conflicting-outputs
```

---

## Related Documentation

- [Main Project README](../../README.md)
- [Quick Start Deployment Guide](../../docs/deployment/QUICK_START.md)
- [Architecture Overview](../../docs/architecture/overview.md)

---

*Last Updated: January 22, 2026*
