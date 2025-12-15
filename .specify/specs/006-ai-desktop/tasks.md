# Tasks: AI Desktop Client (React Native)

**Updated**: December 2024
**Architecture**: React Native for Windows + macOS (replaces Electron)
**Location**: `clients/unified/`

---

## Group 1: React Native Foundation [COMPLETE]
- [x] Initialize React Native 0.80 project in `clients/unified`. [C]
- [x] Add `react-native-windows` for Windows desktop support. [C]
- [x] Configure TypeScript 5.x with strict mode. [C]
- [x] Configure Metro bundler for multi-platform builds. [C]
- [x] Generate Windows project (`TamshaiAiUnified.sln`). [C]
- [x] Document Windows build process in `WINDOWS_SETUP.md`. [C]

## Group 2: Windows Protocol Activation [COMPLETE]
- [x] Configure protocol handler (`com.tamshai.ai://`) in `Package.appxmanifest`. [C]
- [x] Create `DeepLinkModule` C++ native module in `TamshaiAiUnified.cpp`. [C]
- [x] Expose `getInitialURL()` method to JavaScript. [C]
- [x] Expose `clearInitialURL()` method to JavaScript. [C]
- [x] Capture protocol URL from command line args in `WinMain`. [C]
- [x] Register native module with `CompReactPackageProvider`. [C]

## Group 3: Authentication Services [COMPLETE]
- [x] Create platform router (`src/services/auth/index.ts`). [C]
- [x] Implement mobile auth with `react-native-app-auth` (`auth.mobile.ts`). [C]
- [x] Implement Windows auth with custom PKCE (`auth.windows.ts`). [C]
- [x] Implement pure JS SHA-256 for PKCE code challenge. [C]
- [x] Implement `generateRandomString()` with fallback to Math.random. [C]
- [x] Implement `generateCodeChallenge()` with base64url encoding. [C]
- [x] Configure `ai-mobile` Keycloak client settings. [C]
- [x] Export `login()`, `logout()`, `refreshTokens()` functions. [C]
- [x] Export `parseUserFromToken()` for JWT decoding. [C]

## Group 4: Token Storage [PARTIAL]
- [x] Implement iOS/Android storage via `react-native-keychain`. [C]
- [x] Implement in-memory fallback for Windows (temporary). [C]
- [ ] **Create Windows Credential Manager native module** (C++/WinRT). [P]
- [ ] **Wrap `Windows.Security.Credentials.PasswordVault` API**. [P]
- [ ] **Export `setCredential()` method to JavaScript**. [P]
- [ ] **Export `getCredential()` method to JavaScript**. [P]
- [ ] **Export `deleteCredential()` method to JavaScript**. [P]
- [ ] **Integrate with `auth.windows.ts` token storage**. [P]
- [ ] **Test token persistence across app restarts**. [P]

## Group 5: OAuth Callback Handling [COMPLETE]
- [x] Initialize URL listener in `App.tsx` on mount. [C]
- [x] Handle `Linking.getInitialURL()` for cold start. [C]
- [x] Handle `Linking.addEventListener('url')` for running app. [C]
- [x] Use `DeepLinkModule.getInitialURL()` as workaround for RNW bug #6996. [C]
- [x] Implement `handleOAuthCallback()` to process callback URL. [C]
- [x] Validate state parameter to prevent CSRF. [C]
- [x] Exchange authorization code for tokens. [C]

## Group 6: Auth Store (Zustand) [COMPLETE]
- [x] Create `src/stores/authStore.ts`. [C]
- [x] Implement `isAuthenticated`, `isLoading`, `tokens`, `user`, `error` state. [C]
- [x] Implement `login()` action. [C]
- [x] Implement `logout()` action with token revocation. [C]
- [x] Implement `refreshTokens()` action. [C]
- [x] Implement `checkAuth()` for startup token check. [C]
- [x] Implement `getAccessToken()` with auto-refresh. [C]

## Group 7: API Integration [COMPLETE]
- [x] Create `src/services/api.ts`. [C]
- [x] Implement `streamQuery()` for SSE streaming to MCP Gateway. [C]
- [x] Implement custom SSE parser for `text/event-stream`. [C]
- [x] Handle `[DONE]` sentinel for stream completion. [C]
- [x] Implement `confirmAction()` for human-in-the-loop flow. [C]
- [x] Implement `checkHealth()` endpoint. [C]
- [x] Configure 60-second timeout for Claude's long reasoning. [C]

## Group 8: Chat Store (Zustand) [COMPLETE]
- [x] Create `src/stores/chatStore.ts`. [C]
- [x] Implement `messages`, `isStreaming`, `error` state. [C]
- [x] Implement `sendMessage()` action with streaming. [C]
- [x] Implement `confirmAction()` action for approvals. [C]
- [x] Implement `clearMessages()` action. [C]
- [x] Implement `cancelStream()` with AbortController. [C]

## Group 9: Type Definitions [COMPLETE]
- [x] Create `src/types/auth.ts` with `Tokens`, `User`, `AuthConfig`. [C]
- [x] Create `src/types/api.ts` with `MCPToolResponse`, `ChatMessage`, `SSEEvent`. [C]
- [x] Define v1.4 discriminated union for `MCPToolResponse`. [C]
- [x] Define `PendingConfirmation` type for approval flow. [C]

---

## Group 10: UI Components [NOT STARTED - CRITICAL]

### Design System
- [ ] Choose UI framework (React Native Paper vs NativeWind). [P]
- [ ] Configure theme provider with dark mode support. [P]
- [ ] Define color palette (warning yellow, success green, error red). [P]
- [ ] Create `src/components/` directory structure. [P]

### Core Components
- [ ] Create `ChatBubble.tsx` - user/assistant message bubble. [P]
- [ ] Implement markdown rendering in ChatBubble (react-native-markdown-display). [P]
- [ ] Add code block syntax highlighting. [P]
- [ ] Create `InputBox.tsx` - text input with send button. [P]
- [ ] Implement keyboard handling (Enter to send, Shift+Enter for newline). [P]
- [ ] Create `MessageList.tsx` - FlatList with message history. [P]
- [ ] Implement auto-scroll to bottom on new messages. [P]
- [ ] Create `LoadingSpinner.tsx` - "Thinking..." indicator. [P]
- [ ] Create `ErrorBanner.tsx` - dismissible error display. [P]

### v1.4 Approval Card (Section 5.6)
- [ ] **[v1.4] Create `ApprovalCard.tsx` component**. [P]
- [ ] **[v1.4] Implement yellow warning styling** (cross-platform colors). [P]
- [ ] **[v1.4] Display confirmation message and details**. [P]
- [ ] **[v1.4] Add Approve button** with green styling. [P]
- [ ] **[v1.4] Add Reject button** with red styling. [P]
- [ ] **[v1.4] Display expiry countdown** (5-minute TTL). [P]
- [ ] **[v1.4] Implement `handleApprove()`** calling chatStore.confirmAction. [P]
- [ ] **[v1.4] Implement `handleReject()`** calling chatStore.confirmAction. [P]
- [ ] **[v1.4] Show success feedback** after approval. [P]
- [ ] **[v1.4] Show cancellation feedback** after rejection. [P]
- [ ] **[v1.4] Handle 404 expired confirmation** gracefully. [P]

### v1.4 Truncation Warning (Section 5.3)
- [ ] **[v1.4] Create `TruncationWarning.tsx` component**. [P]
- [ ] **[v1.4] Implement yellow alert banner styling**. [P]
- [ ] **[v1.4] Display warning message** from AI response. [P]
- [ ] **[v1.4] Add query refinement suggestion** text. [P]
- [ ] **[v1.4] Detect `metadata.truncated` in responses**. [P]
- [ ] **[v1.4] Render warning above message content**. [P]

---

## Group 11: Screens & Navigation [NOT STARTED]
- [ ] Install `@react-navigation/native`. [P]
- [ ] Install `@react-navigation/native-stack`. [P]
- [ ] Create `LoginScreen.tsx` with "Sign In with SSO" button. [P]
- [ ] Add app branding/logo to LoginScreen. [P]
- [ ] Create `ChatScreen.tsx` with MessageList + InputBox. [P]
- [ ] Add logout button to ChatScreen header. [P]
- [ ] Create `SettingsScreen.tsx` for mobile (logout, app info). [P]
- [ ] Configure NavigationContainer in App.tsx. [P]
- [ ] Implement auth-based routing (LoginScreen vs ChatScreen). [P]

---

## Group 12: Windows Desktop Enhancements [NOT STARTED]
- [ ] Create `CredentialManagerModule` C++ native module. [P]
- [ ] Wrap `Windows.Security.Credentials.PasswordVault`. [P]
- [ ] Implement secure token persistence. [P]
- [ ] Desktop-optimized layouts (wider message area). [P]
- [ ] Windows Toast notifications for approvals. [P]
- [ ] Keyboard shortcuts (Enter to send). [P]

---

## Group 13: macOS Support [NOT STARTED]
- [ ] Initialize `react-native-macos` in project. [P]
- [ ] Configure macOS-specific Podfile settings. [P]
- [ ] Set up macOS Keychain access. [P]
- [ ] Test `react-native-app-auth` with ASWebAuthenticationSession. [P]
- [ ] macOS menu bar integration. [P]
- [ ] Keyboard shortcuts (Cmd+Enter to send). [P]

---

## Group 14: Mobile Refinements [NOT STARTED]
- [ ] Dynamic host configuration (replace localhost). [P]
- [ ] Environment-based API URL switching. [P]
- [ ] Biometric unlock via `react-native-biometrics`. [P]
- [ ] Push notifications for approvals (FCM + APNS). [P]
- [ ] Deep link handling from push notifications. [P]

---

## Group 15: Testing [NOT STARTED]
- [ ] Unit tests for auth services (Jest). [P]
- [ ] Unit tests for API service. [P]
- [ ] Unit tests for Zustand stores. [P]
- [ ] Integration tests for OAuth flow. [P]
- [ ] E2E tests with Detox (Windows). [P]
- [ ] E2E tests with Detox (iOS). [P]
- [ ] Cross-platform build validation in CI. [P]

---

## Group 16: Packaging & Distribution [NOT STARTED]

### Windows
- [ ] Configure MSIX package generation. [P]
- [ ] Set up code signing (Authenticode). [P]
- [ ] Test MSIX installation. [P]
- [ ] Microsoft Store preparation (optional). [P]

### macOS
- [ ] Configure .app bundle generation. [P]
- [ ] Set up code signing (Developer ID). [P]
- [ ] Configure notarization for Gatekeeper. [P]
- [ ] Test .dmg installer. [P]

---

## Status
**IN PROGRESS** - Foundation complete (Groups 1-9), UI pending (Groups 10-16)

## Task Summary

| Group | Description | Status | Tasks |
|-------|-------------|--------|-------|
| 1 | React Native Foundation | COMPLETE | 6/6 |
| 2 | Windows Protocol Activation | COMPLETE | 6/6 |
| 3 | Authentication Services | COMPLETE | 9/9 |
| 4 | Token Storage | PARTIAL | 2/9 |
| 5 | OAuth Callback Handling | COMPLETE | 7/7 |
| 6 | Auth Store (Zustand) | COMPLETE | 7/7 |
| 7 | API Integration | COMPLETE | 7/7 |
| 8 | Chat Store (Zustand) | COMPLETE | 6/6 |
| 9 | Type Definitions | COMPLETE | 4/4 |
| 10 | UI Components | NOT STARTED | 0/24 |
| 11 | Screens & Navigation | NOT STARTED | 0/9 |
| 12 | Windows Desktop Enhancements | NOT STARTED | 0/6 |
| 13 | macOS Support | NOT STARTED | 0/6 |
| 14 | Mobile Refinements | NOT STARTED | 0/5 |
| 15 | Testing | NOT STARTED | 0/7 |
| 16 | Packaging & Distribution | NOT STARTED | 0/8 |

**Total**: 54/126 tasks complete (43%)
**v1.4 Tasks**: 17 tasks (approval card + truncation warning)
**Critical Path**: Groups 4, 10, 11 (token persistence, UI, screens)

## Architecture Version
**Updated for**: v1.4 (December 2024)
**Replaces**: Electron-based tasks

**Key Changes from Electron Tasks**:
- Runtime: Electron → React Native
- Groups 1-2: Electron boilerplate → RN + Windows native modules
- Group 4: `safeStorage` → Windows Credential Manager native module
- Groups 10-11: Electron React components → React Native components
- Group 12: New Windows-specific enhancements
- Group 13: New macOS support via `react-native-macos`

**Constitutional Compliance**:
- Article V.1: No authorization logic in client (verified in stores)
- Article V.2: Secure token storage (Keychain/Credential Manager)
- Article V.3: PKCE via OS-native browser modal (implemented)
