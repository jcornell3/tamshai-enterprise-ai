# Android App Publishing Guide

**Last Updated:** December 27, 2025
**Platform:** Flutter
**App:** Tamshai Enterprise AI

This guide documents the process for publishing the Tamshai Enterprise AI Android app to the Google Play Store.

> **Cost Note:** The only unavoidable cost is the **one-time $25 USD registration fee** for a Google Play Developer account.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [App Configuration](#2-app-configuration)
3. [Generating a Release Keystore](#3-generating-a-release-keystore)
4. [Configuring Signing](#4-configuring-signing)
5. [Building the Release](#5-building-the-release)
6. [Google Play Console Setup](#6-google-play-console-setup)
7. [Testing Tracks](#7-testing-tracks)
8. [Troubleshooting](#8-troubleshooting)
9. [CI/CD Integration](#9-cicd-integration)

---

## 1. Prerequisites

### Accounts

| Account | Purpose | Cost |
|---------|---------|------|
| [Google Play Developer Account](https://play.google.com/console/signup) | Publish to Play Store | $25 one-time |
| Google Account | Required for developer account | Free |

### Development Tools

Ensure these are installed and configured:

```bash
# Verify Flutter installation
flutter --version    # Should be 3.24+
flutter doctor -v    # All green checkmarks

# Required for Android builds
# - JDK 17 (Temurin recommended)
# - Android SDK with build-tools and platforms
```

See [README.md](../../README.md#android-development-requirements) for detailed Android SDK setup.

### Project Location

The Flutter app is located at:
```
clients/unified_flutter/
├── android/           # Android-specific configuration
│   ├── app/
│   │   ├── build.gradle.kts
│   │   └── src/main/
│   ├── gradle.properties
│   └── key.properties  # Created for signing (DO NOT COMMIT)
├── lib/               # Dart source code
└── pubspec.yaml       # Flutter dependencies
```

---

## 2. App Configuration

### Version Management

Edit `clients/unified_flutter/pubspec.yaml`:

```yaml
name: unified_flutter
description: Tamshai Enterprise AI - Secure AI Chat Assistant
version: 1.0.0+1  # Format: semver+buildNumber
```

- **version** (1.0.0): User-visible version string
- **build number** (+1): Integer that must increment for each Play Store upload

### App Metadata

Edit `clients/unified_flutter/android/app/build.gradle.kts`:

```kotlin
android {
    namespace = "com.tamshai.unified_flutter"

    defaultConfig {
        applicationId = "com.tamshai.enterpriseai"
        minSdk = 21          // Android 5.0+
        targetSdk = 34       // Android 14
        // versionCode and versionName come from pubspec.yaml
    }
}
```

### App Icon

Replace the default Flutter icon with your branded icon:

1. Create a 1024x1024 PNG icon
2. Use [flutter_launcher_icons](https://pub.dev/packages/flutter_launcher_icons) package:

```yaml
# pubspec.yaml
dev_dependencies:
  flutter_launcher_icons: ^0.13.1

flutter_launcher_icons:
  android: true
  ios: true
  image_path: "assets/icon/app_icon.png"
  adaptive_icon_background: "#1a1a2e"
  adaptive_icon_foreground: "assets/icon/app_icon_foreground.png"
```

```bash
flutter pub get
flutter pub run flutter_launcher_icons
```

---

## 3. Generating a Release Keystore

You need a cryptographic keystore to sign your app. **Create this once and back it up securely.** If you lose this keystore, you cannot update your app.

### Generate the Keystore

```bash
cd clients/unified_flutter/android

# Generate keystore (you'll be prompted for passwords and info)
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias upload
```

**Prompts you'll see:**
- **Keystore password**: Create a strong password (save this!)
- **Key password**: Can be same as keystore password
- **Name, Organization, City, etc.**: Your company information

### Secure the Keystore

```bash
# Move keystore to a secure location outside the repo
mkdir -p ~/.android-keystores
mv upload-keystore.jks ~/.android-keystores/tamshai-upload.jks

# Set restrictive permissions
chmod 600 ~/.android-keystores/tamshai-upload.jks
```

> **CRITICAL:** Never commit the keystore or passwords to Git. Add to `.gitignore`:
> ```
> *.jks
> *.keystore
> key.properties
> ```

---

## 4. Configuring Signing

### Create key.properties

Create `clients/unified_flutter/android/key.properties` (DO NOT COMMIT):

```properties
storePassword=your-keystore-password
keyPassword=your-key-password
keyAlias=upload
storeFile=/Users/yourname/.android-keystores/tamshai-upload.jks
```

### Configure build.gradle.kts

Edit `clients/unified_flutter/android/app/build.gradle.kts`:

```kotlin
import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// Load key.properties
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.tamshai.unified_flutter"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.tamshai.enterpriseai"
        minSdk = 21
        targetSdk = 34
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = keystoreProperties["storeFile"]?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

flutter {
    source = "../.."
}
```

---

## 5. Building the Release

### Build App Bundle (AAB)

Google Play requires Android App Bundles for optimized delivery:

```bash
cd clients/unified_flutter

# Clean previous builds
flutter clean

# Get dependencies
flutter pub get

# Build release AAB
flutter build appbundle --release
```

**Output location:**
```
clients/unified_flutter/build/app/outputs/bundle/release/app-release.aab
```

### Build APK (for testing/sideloading)

```bash
# Build release APK
flutter build apk --release

# Or build split APKs for smaller size
flutter build apk --split-per-abi --release
```

**Output locations:**
```
build/app/outputs/flutter-apk/app-release.apk
build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk
build/app/outputs/flutter-apk/app-x86_64-release.apk
```

### Verify the Build

```bash
# Check AAB contents
bundletool build-apks --bundle=build/app/outputs/bundle/release/app-release.aab \
  --output=test.apks --mode=universal

# Install on connected device for testing
bundletool install-apks --apks=test.apks
```

---

## 6. Google Play Console Setup

### Create App Listing

1. Log in to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in details:
   - **App name:** Tamshai Enterprise AI
   - **Default language:** English (US)
   - **App or game:** App
   - **Free or paid:** Free (or Paid if applicable)

### Store Listing

Navigate to **Grow > Store presence > Main store listing**:

| Field | Value |
|-------|-------|
| **Short description** (80 chars) | Secure Enterprise AI Chat with Role-Based Access Control |
| **Full description** (4000 chars) | Describe features: SSO authentication, AI chat, data security, etc. |

**Required Graphics:**

| Asset | Size | Format |
|-------|------|--------|
| App icon | 512 x 512 px | 32-bit PNG |
| Feature graphic | 1024 x 500 px | PNG or JPEG |
| Phone screenshots | Min 2, 320-3840 px | PNG or JPEG |
| 7-inch tablet screenshots | Optional | PNG or JPEG |
| 10-inch tablet screenshots | Optional | PNG or JPEG |

### Privacy Policy

**Required** since the app handles authentication data.

1. Create a privacy policy covering:
   - Data collected (authentication tokens, user queries)
   - How data is used and protected
   - Third-party services (Keycloak, Claude API)
   - User rights and contact information

2. Host the policy:
   - GitHub Pages (free): `https://yourusername.github.io/privacy-policy`
   - Your company website

3. Enter the URL in Play Console

### App Content Declarations

Complete all required declarations in **Policy > App content**:

| Declaration | Response |
|-------------|----------|
| **Ads** | No (unless ads are included) |
| **App access** | Restricted - requires authentication |
| **Content ratings** | Complete questionnaire (likely "Everyone") |
| **Target audience** | 18+ (enterprise users) |
| **News app** | No |
| **COVID-19 apps** | No |
| **Data safety** | Declare authentication data collection |
| **Government apps** | No (unless applicable) |
| **Financial features** | No (unless applicable) |

### Data Safety Form

Declare data handling practices:

| Data Type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Email address | Yes | No | Authentication |
| Name | Yes | No | User identification |
| Auth tokens | Yes | No | Session management |
| User queries | Yes | Yes (AI provider) | Core functionality |

---

## 7. Testing Tracks

### Recommended Testing Flow

```
Internal Testing → Closed Testing → Open Testing → Production
```

### Internal Testing (Fastest)

1. Go to **Release > Testing > Internal testing**
2. Create a release and upload AAB
3. Add testers by email (up to 100)
4. Share the opt-in link with testers
5. **No review required** - available immediately

### Closed Testing (Beta)

1. Go to **Release > Testing > Closed testing**
2. Create a track and upload AAB
3. Add tester groups or email lists
4. Review typically takes 1-3 days

### Production Release

1. Go to **Release > Production**
2. Create new release
3. Upload signed AAB
4. Add release notes
5. **Play App Signing:** Enroll (recommended) - Google manages your signing key
6. Review and roll out

---

## 8. Troubleshooting

### Build Errors

**Gradle sync failed:**
```bash
cd clients/unified_flutter/android
./gradlew clean
./gradlew --refresh-dependencies
```

**Duplicate class errors:**
```bash
flutter clean
flutter pub get
flutter build appbundle --release
```

**Keystore not found:**
- Verify path in `key.properties` is absolute
- Check file permissions: `chmod 600 /path/to/keystore.jks`

### Play Console Errors

**Version code already used:**
- Increment the build number in `pubspec.yaml` (e.g., `1.0.0+2`)

**APK signature invalid:**
- Ensure you're using the same keystore for all updates
- If enrolled in Play App Signing, use the upload key

**Target API level too low:**
- Update `targetSdk` in `build.gradle.kts` to meet current requirements (34+)

### Common Warnings

**Deobfuscation mapping file:**
```bash
# Upload mapping file for crash reports
# Located at: build/app/outputs/mapping/release/mapping.txt
```

---

## 9. CI/CD Integration

### GitHub Actions Secrets

For automated builds, add these secrets to your repository:

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g., "upload") |
| `ANDROID_KEY_PASSWORD` | Key password |

### Encode Keystore for CI

```bash
base64 -i ~/.android-keystores/tamshai-upload.jks | pbcopy  # macOS
base64 ~/.android-keystores/tamshai-upload.jks | clip      # Windows
```

### Example Workflow

```yaml
# .github/workflows/android-release.yml
name: Android Release

on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.0'

      - name: Decode Keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/upload-keystore.jks

      - name: Create key.properties
        run: |
          echo "storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}" > android/key.properties
          echo "keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}" >> android/key.properties
          echo "keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}" >> android/key.properties
          echo "storeFile=upload-keystore.jks" >> android/key.properties
        working-directory: clients/unified_flutter

      - name: Build AAB
        run: flutter build appbundle --release
        working-directory: clients/unified_flutter

      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_SERVICE_ACCOUNT }}
          packageName: com.tamshai.enterpriseai
          releaseFiles: clients/unified_flutter/build/app/outputs/bundle/release/app-release.aab
          track: internal
```

---

## Quick Reference

### Build Commands

```bash
# Development
flutter run -d android

# Release APK
flutter build apk --release

# Release AAB (for Play Store)
flutter build appbundle --release

# Clean build
flutter clean && flutter pub get && flutter build appbundle --release
```

### Important Files

| File | Purpose |
|------|---------|
| `pubspec.yaml` | Version, dependencies |
| `android/key.properties` | Signing credentials (DO NOT COMMIT) |
| `android/app/build.gradle.kts` | Android build configuration |
| `android/app/proguard-rules.pro` | Code obfuscation rules |

### Version Checklist

Before each release:
- [ ] Increment version in `pubspec.yaml`
- [ ] Update release notes
- [ ] Test on physical device
- [ ] Verify signing works
- [ ] Build AAB successfully
- [ ] Upload to Play Console

---

*Last Updated: December 27, 2025*
