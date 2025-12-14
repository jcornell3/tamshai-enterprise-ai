# React Native macOS Setup Guide

This guide explains how to set up the React Native macOS development environment and build the Tamshai AI desktop application.

---

## Prerequisites (macOS)

### 1. Xcode

Install Xcode from the Mac App Store or Apple Developer portal:

1. Install Xcode 14.0 or later
2. Open Xcode and accept the license agreement
3. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```

### 2. Node.js

```bash
# Using Homebrew (recommended)
brew install node@20

# Verify
node --version  # Should be 20.x
npm --version   # Should be 10.x
```

### 3. CocoaPods

```bash
# Install CocoaPods
sudo gem install cocoapods

# Verify
pod --version
```

### 4. Watchman (recommended)

```bash
brew install watchman
```

---

## Initial macOS Setup

### Step 1: Initialize React Native macOS

From the project directory:

```bash
cd ~/tamshai-enterprise-ai/clients/unified

# Install dependencies
npm install

# Initialize React Native macOS
npx react-native-macos-init
```

This creates:
- `macos/` directory with Xcode project
- `macos/TamshaiAI-macOS/` with macOS-specific code

### Step 2: Install CocoaPods Dependencies

```bash
cd macos
pod install
cd ..
```

### Step 3: Configure Protocol Handler

Edit `macos/TamshaiAI-macOS/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.tamshai.ai</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.tamshai.ai</string>
    </array>
  </dict>
</array>
```

### Step 4: Configure Keychain Access

Add Keychain sharing entitlement in `macos/TamshaiAI-macOS/TamshaiAI-macOS.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>keychain-access-groups</key>
  <array>
    <string>$(AppIdentifierPrefix)com.tamshai.ai</string>
  </array>
</dict>
</plist>
```

---

## Building and Running

### Development Build

```bash
# Terminal 1: Start Metro bundler
npm start

# Terminal 2: Build and run macOS app
npm run macos
# or
npx react-native run-macos
```

### Production Build

```bash
# Build release
npx react-native run-macos --configuration Release

# Or via Xcode:
# 1. Open macos/TamshaiAI.xcworkspace
# 2. Select TamshaiAI-macOS scheme
# 3. Product > Archive
```

---

## Troubleshooting

### Error: "CocoaPods not found"

```bash
sudo gem install cocoapods
cd macos && pod install && cd ..
```

### Error: "Xcode not configured"

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Error: "App can't be opened because it is from an unidentified developer"

For development builds:
1. System Preferences > Security & Privacy
2. Click "Open Anyway" for the app

### Error: Protocol handler not working

1. Build and install the app (not just run from Xcode)
2. Check Info.plist has correct URL scheme
3. Test: `open "com.tamshai.ai://test"`

---

## Code Signing (Distribution)

For App Store or notarized distribution:

1. Create Apple Developer account
2. Create App ID with URL scheme capability
3. Create provisioning profile
4. Configure signing in Xcode:
   - Signing & Capabilities tab
   - Select team
   - Enable "Automatically manage signing"

---

## References

- [React Native for macOS](https://microsoft.github.io/react-native-windows/docs/rnm-getting-started)
- [react-native-app-auth macOS](https://github.com/FormidableLabs/react-native-app-auth#macos)
- [react-native-keychain](https://github.com/oblador/react-native-keychain)
