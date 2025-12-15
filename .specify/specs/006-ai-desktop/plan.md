# Implementation Plan: AI Desktop Client (React Native)

**Updated**: December 2024
**Architecture**: React Native for Windows + macOS (replaces Electron)
**Status**: IN PROGRESS - Phases 1-3 Foundation Complete

---

## Background: Pivot from Electron to React Native

Per ADR-004, we abandoned Electron due to a fundamental `requestSingleInstanceLock()` race condition on Windows that broke OAuth deep linking. React Native Windows uses native UWP protocol activation which eliminates this issue entirely.

**Critical UX Directive**: The user MUST authenticate via **OS-native secure browser modal**, NOT an embedded WebView or custom login form:
- **Windows**: System browser via `Linking.openURL()` (WebAuthenticationBroker planned)
- **macOS**: `ASWebAuthenticationSession` via `react-native-app-auth`
- **iOS**: `SFSafariViewController` via `react-native-app-auth`
- **Android**: Chrome Custom Tabs via `react-native-app-auth`

---

## Phase 1: React Native Foundation [COMPLETE]

### 1.1 Project Initialization [COMPLETE]
* [x] Initialize `clients/unified` with React Native 0.80
* [x] Add `react-native-windows` for Windows desktop support
* [x] Configure TypeScript 5.x with strict mode
* [x] Configure Metro bundler for multi-platform builds

### 1.2 Windows Native Setup [COMPLETE]
* [x] Generate Windows project (TamshaiAiUnified.sln)
* [x] Configure protocol handler (`com.tamshai.ai://`) in Package.appxmanifest
* [x] Create `DeepLinkModule` C++ native module for protocol activation
* [x] Document Windows build process in WINDOWS_SETUP.md

---

## Phase 2: Authentication (OS-Native Browser Modal) [COMPLETE]

### 2.1 Auth Services [COMPLETE]
* [x] Create platform router (`src/services/auth/index.ts`)
* [x] Implement mobile auth with `react-native-app-auth` (`auth.mobile.ts`)
  - Uses `ASWebAuthenticationSession` (macOS/iOS) / `Chrome Custom Tabs` (Android)
  - PKCE flow via OS-native secure browser modal
* [x] Implement Windows auth with custom PKCE (`auth.windows.ts`)
  - Uses `Linking.openURL()` to open system browser
  - Pure JS SHA-256 for code challenge (Web Crypto API hangs in RN Windows)
  - DeepLinkModule captures callback from UWP protocol activation

### 2.2 Token Storage [PARTIAL]
* [x] Mobile: `react-native-keychain` for iOS Keychain / Android Keystore
* [ ] **Windows: Windows Credential Manager native module** (currently in-memory fallback)
  - Tokens lost on app restart
  - Need C++ module wrapping `Windows.Security.Credentials.PasswordVault`

### 2.3 Auth Store [COMPLETE]
* [x] Create Zustand store (`src/stores/authStore.ts`)
* [x] Implement login, logout, refreshTokens actions
* [x] JWT parsing for user info extraction
* [x] Auto-refresh with 1-minute expiry buffer

### 2.4 OAuth Callback Handling [COMPLETE]
* [x] URL listener initialization in App.tsx
* [x] Handle `Linking.getInitialURL()` for cold start
* [x] Handle `Linking.addEventListener('url')` for running app
* [x] DeepLinkModule workaround for RN Windows bug #6996

---

## Phase 3: API Integration [COMPLETE]

### 3.1 MCP Gateway Client [COMPLETE]
* [x] Create API service (`src/services/api.ts`)
* [x] Implement SSE streaming for AI queries (`streamQuery()`)
* [x] Implement confirmation endpoint (`confirmAction()`)
* [x] Handle `[DONE]` sentinel for stream completion
* [x] Error handling with retry logic

### 3.2 Chat Store [COMPLETE]
* [x] Create Zustand store (`src/stores/chatStore.ts`)
* [x] Message state management
* [x] Streaming state tracking
* [x] Integration with API service

---

## Phase 4: UI Components [NOT STARTED - CRITICAL]

### 4.1 Design System Setup
* [ ] Choose UI framework: React Native Paper vs NativeWind (Tailwind)
* [ ] Configure theming (dark mode support exists in App.tsx)
* [ ] Create shared component library in `src/components/`

### 4.2 Core Components
* [ ] Create `ChatBubble.tsx` - user/assistant message rendering with markdown
* [ ] Create `InputBox.tsx` - text input with send button
* [ ] Create `MessageList.tsx` - scrollable message history (FlatList)
* [ ] Create `LoadingSpinner.tsx` - streaming indicator ("Thinking...")
* [ ] Create `ErrorBanner.tsx` - error display

### 4.3 v1.4 Approval Flow Components (Section 5.6)
* [ ] Create `ApprovalCard.tsx` - human-in-the-loop confirmation
* [ ] Yellow warning styling (cross-platform equivalent of border-yellow-500)
* [ ] Approve/Reject buttons with proper accessibility
* [ ] Timeout indication (5-minute TTL countdown)
* [ ] Success/failure feedback (platform-native notifications)

### 4.4 v1.4 Truncation Warning (Section 5.3)
* [ ] Create `TruncationWarning.tsx` - incomplete results alert
* [ ] Yellow alert banner styling
* [ ] Query refinement suggestions

---

## Phase 5: Screens & Navigation [NOT STARTED]

### 5.1 Screen Components
* [ ] Create `LoginScreen.tsx` - "Sign In with SSO" button + branding
* [ ] Create `ChatScreen.tsx` - main conversation interface
* [ ] Create `SettingsScreen.tsx` - logout, app info (mobile-specific)

### 5.2 Navigation Setup
* [ ] Install `@react-navigation/native` and `@react-navigation/native-stack`
* [ ] Configure navigation container
* [ ] Implement auth-based routing (login screen vs chat)

---

## Phase 6: Windows Desktop Enhancements [PARTIAL]

### 6.1 Token Persistence [NOT STARTED]
* [ ] Create Windows Credential Manager native module (C++/WinRT)
* [ ] Wrap `Windows.Security.Credentials.PasswordVault` API
* [ ] Export to JS via NativeModules
* [ ] Integrate with auth service

### 6.2 Desktop UX [NOT STARTED]
* [ ] Desktop-optimized layouts (wider message area)
* [ ] Keyboard shortcuts (Enter to send, Shift+Enter for newline)
* [ ] System notifications for approvals (Windows Toast)

---

## Phase 7: macOS Support [NOT STARTED]

### 7.1 Project Setup
* [ ] Initialize `react-native-macos` in unified project
* [ ] Configure macOS-specific settings in Podfile
* [ ] Set up macOS Keychain access

### 7.2 Platform Adaptations
* [ ] macOS menu bar integration
* [ ] Keyboard shortcuts (Cmd+Enter to send)
* [ ] Window management
* [ ] ASWebAuthenticationSession integration (via react-native-app-auth)

---

## Phase 8: Mobile Refinements [NOT STARTED]

### 8.1 Mobile-Specific Features
* [ ] Biometric unlock (Face ID, Touch ID, fingerprint) via `react-native-biometrics`
* [ ] Push notifications for approvals (FCM + APNS)
* [ ] Deep link handling from notifications

### 8.2 Mobile Configuration
* [ ] Dynamic host configuration (localhost inaccessible from devices)
* [ ] Environment-based API URL switching
* [ ] Network configuration for development (metro.config.js)

---

## Phase 9: Testing & Packaging [NOT STARTED]

### 9.1 Testing
* [ ] Unit tests for auth services (Jest)
* [ ] Integration tests for OAuth flow
* [ ] E2E tests with Detox
* [ ] Cross-platform build validation (CI/CD)

### 9.2 Windows Packaging
* [ ] MSIX package generation
* [ ] Code signing (Authenticode)
* [ ] Microsoft Store preparation (optional)

### 9.3 macOS Packaging
* [ ] .app bundle generation
* [ ] Code signing (Developer ID)
* [ ] Notarization for Gatekeeper

---

## Verification Checklist

### Authentication (Critical Path)
- [x] App launches and shows "Sign In" button
- [x] Auth services implemented for all platforms
- [ ] Clicking "Sign In" opens OS system browser (NOT WebView)
- [ ] User completes Keycloak login + TOTP in browser
- [ ] Browser closes, app receives callback via protocol handler
- [ ] Tokens stored securely (Keychain on mobile, Credential Manager on Windows)
- [ ] User sees chat interface

### v1.4 Features
- [x] **SSE Streaming**: API client connects to /api/query (service ready)
- [ ] **Streaming UI**: Response chunks render in real-time
- [ ] **Approval Cards**: `pending_confirmation` renders as approval UI
- [ ] **Approve/Reject**: Buttons send correct POST requests
- [ ] **Truncation Warnings**: Incomplete results show alert banner

### Cross-Platform
- [x] Windows: Protocol activation handler (DeepLinkModule)
- [ ] Windows: Tokens persist in Credential Manager
- [ ] macOS: Auth via ASWebAuthenticationSession
- [ ] iOS: Auth via SFSafariViewController
- [ ] Android: Auth via Chrome Custom Tabs

---

## Current Blockers

1. **Windows Token Persistence**: Tokens stored in-memory only (lost on restart)
   - **Solution**: Build Windows Credential Manager native module (Phase 6.1)

2. **UI Components**: No reusable components built yet
   - **Solution**: Phase 4 implementation

3. **E2E Testing**: OAuth flow not validated end-to-end
   - **Solution**: Rebuild Windows app, test with Keycloak

---

## Status
**IN PROGRESS** - Foundation complete, UI pending

## Architecture Version
**Updated for**: v1.4 (December 2024)
**Replaces**: Electron-based implementation

**Key Differences from Electron Plan**:
- Runtime: Electron → React Native
- Token storage: `safeStorage` → `react-native-keychain` / Windows Credential Manager
- Protocol handling: Registry hacks → Native UWP activation
- Browser auth: `shell.openExternal` → `react-native-app-auth` / `Linking.openURL`

**Constitutional Compliance**:
- Article V.1: No authorization logic in client (roles are display-only)
- Article V.2: Secure token storage (Keychain/Credential Manager)
- Article V.3: PKCE via OS-native browser modal (NOT WebView)
