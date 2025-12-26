# 009-flutter-unified: Task Breakdown

**Status**: Phase 1 COMPLETE
**Last Updated**: December 26, 2025

---

## Phase 1: Windows Desktop (COMPLETE)

### 1.1 Project Setup

- [x] **T-001**: Initialize Flutter project with `flutter create --platforms=windows,macos,ios,android unified_flutter`
- [x] **T-002**: Configure pubspec.yaml with dependencies (riverpod, dio, freezed, etc.)
- [x] **T-003**: Set up build_runner for code generation
- [x] **T-004**: Create folder structure (core/, features/, etc.)
- [x] **T-005**: Configure analysis_options.yaml for linting

### 1.2 Authentication - Models

- [x] **T-010**: Create `AuthState` Freezed union type (unauthenticated, authenticating, authenticated, error)
- [x] **T-011**: Create `AuthUser` Freezed model with JSON serialization
- [x] **T-012**: Create `KeycloakConfig` model with dev/prod configurations
- [x] **T-013**: Run `flutter pub run build_runner build` to generate Freezed code

### 1.3 Authentication - Services

- [x] **T-020**: Create `AuthService` abstract interface
- [x] **T-021**: Implement `SecureStorageService` with flutter_secure_storage
- [x] **T-022**: Implement token storage methods (store, get, delete, isExpired)
- [x] **T-023**: Implement user profile caching in secure storage
- [x] **T-024**: Implement `DesktopOAuthService` with HTTP server callback
- [x] **T-025**: Implement PKCE code verifier generation (64 random bytes, base64url)
- [x] **T-026**: Implement PKCE code challenge generation (SHA-256, base64url)
- [x] **T-027**: Implement HTTP server startup on loopback:0
- [x] **T-028**: Implement callback waiting with timeout
- [x] **T-029**: Implement authorization code extraction from callback URL
- [x] **T-030**: Implement token exchange via POST to token endpoint
- [x] **T-031**: Implement user extraction from ID token JWT claims
- [x] **T-032**: Implement token refresh flow
- [x] **T-033**: Implement logout (clear storage, call end-session)

### 1.4 Authentication - State Management

- [x] **T-040**: Create `AuthNotifier` StateNotifier
- [x] **T-041**: Implement `initialize()` to restore session on app start
- [x] **T-042**: Implement `login()` with state transitions
- [x] **T-043**: Implement `refreshToken()` with error handling
- [x] **T-044**: Implement `logout()` with optional Keycloak session end
- [x] **T-045**: Create `authNotifierProvider`
- [x] **T-046**: Create `currentUserProvider` derived provider
- [x] **T-047**: Create `isAuthenticatedProvider` derived provider

### 1.5 API Infrastructure

- [x] **T-050**: Create `dioProvider` with base configuration
- [x] **T-051**: Implement `AuthTokenInterceptor`
- [x] **T-052**: Implement preemptive token refresh (check expiry before request)
- [x] **T-053**: Implement 401 response handling with retry
- [x] **T-054**: Implement request queuing during token refresh

### 1.6 Chat - Models

- [x] **T-060**: Create `ChatMessage` Freezed model
- [x] **T-061**: Add `isTruncated` and `truncationWarning` fields
- [x] **T-062**: Add `pendingConfirmation` field for HITL
- [x] **T-063**: Create `ChatState` Freezed model
- [x] **T-064**: Create `SSEChunk` model with event types
- [x] **T-065**: Create `PendingConfirmation` model

### 1.7 Chat - Services

- [x] **T-070**: Implement `ChatService` with Dio
- [x] **T-071**: Implement `sendQuery()` returning `Stream<SSEChunk>`
- [x] **T-072**: Implement SSE line buffering and parsing
- [x] **T-073**: Handle `type: "text"` MCP Gateway events
- [x] **T-074**: Handle Anthropic-style `content_block_delta` events
- [x] **T-075**: Handle `[DONE]` termination signal
- [x] **T-076**: Implement `confirmAction()` for HITL approve/reject

### 1.8 Chat - State Management

- [x] **T-080**: Create `ChatNotifier` StateNotifier
- [x] **T-081**: Implement `sendMessage()` with streaming
- [x] **T-082**: Implement `_handleSSEChunk()` for incremental updates
- [x] **T-083**: Implement `_updateMessage()` with immutable patterns
- [x] **T-084**: Implement `confirmAction()` for HITL
- [x] **T-085**: Implement `cancelStream()` to stop generation
- [x] **T-086**: Implement `clearChat()` to reset conversation
- [x] **T-087**: Create `chatNotifierProvider`
- [x] **T-088**: Create `chatServiceProvider`

### 1.9 UI - Screens

- [x] **T-090**: Implement `LoginScreen` with Keycloak sign-in button
- [x] **T-091**: Implement `HomeScreen` with user profile display
- [x] **T-092**: Implement role chips display
- [x] **T-093**: Implement `ChatScreen` with message list
- [x] **T-094**: Implement auto-scroll to bottom on new messages
- [x] **T-095**: Implement empty state with suggested prompts
- [x] **T-096**: Implement streaming indicator ("Thinking...")
- [x] **T-097**: Implement stop generation button
- [x] **T-098**: Implement clear chat with confirmation

### 1.10 UI - Widgets

- [x] **T-100**: Implement `MessageBubble` with role-based styling
- [x] **T-101**: Implement truncation warning badge
- [x] **T-102**: Implement copy-to-clipboard button
- [x] **T-103**: Implement timestamp display
- [x] **T-104**: Implement `ChatInput` with multi-line support
- [x] **T-105**: Implement enter-to-send, shift-enter-for-newline
- [x] **T-106**: Implement context-aware send/stop button
- [x] **T-107**: Implement `ApprovalCard` widget
- [x] **T-108**: Implement warning styling and action display
- [x] **T-109**: Implement approve/cancel buttons
- [x] **T-110**: Implement expiry warning

### 1.11 Navigation

- [x] **T-120**: Configure go_router with routes
- [x] **T-121**: Implement auth redirect guard
- [x] **T-122**: Implement auth state listener for router refresh
- [x] **T-123**: Implement logout confirmation dialog

### 1.12 Keycloak Configuration

- [x] **T-130**: Create `tamshai-flutter-client` in Keycloak Admin Console
- [x] **T-131**: Configure as public client with PKCE
- [x] **T-132**: Add redirect URI `http://127.0.0.1:*/callback`
- [x] **T-133**: Add protocol mapper for `preferred_username` in access token
- [x] **T-134**: Add protocol mapper for `email` in access token
- [x] **T-135**: Test end-to-end OAuth flow

---

## Phase 2: macOS Desktop (PENDING)

### 2.1 Build Configuration

- [ ] **T-200**: Configure macOS target in Xcode
- [ ] **T-201**: Set up code signing identity
- [ ] **T-202**: Configure entitlements (network, keychain)
- [ ] **T-203**: Verify sandboxing permissions

### 2.2 OAuth Verification

- [ ] **T-210**: Test HTTP server callback on macOS
- [ ] **T-211**: Verify Keychain storage works
- [ ] **T-212**: Test browser launch and app focus return
- [ ] **T-213**: Test token refresh flow

### 2.3 UI Adaptation

- [ ] **T-220**: Review window sizing and layouts
- [ ] **T-221**: Test resizable windows
- [ ] **T-222**: Add macOS menu items if needed

### 2.4 Testing

- [ ] **T-230**: Full OAuth flow test
- [ ] **T-231**: Chat streaming test
- [ ] **T-232**: Token refresh test
- [ ] **T-233**: Logout test

---

## Phase 3: Mobile (PENDING)

### 3.1 iOS Configuration

- [ ] **T-300**: Configure iOS target
- [ ] **T-301**: Set up provisioning profile
- [ ] **T-302**: Configure deep link handling in Info.plist
- [ ] **T-303**: Add Keychain entitlements
- [ ] **T-304**: Configure flutter_appauth for iOS

### 3.2 Android Configuration

- [ ] **T-310**: Configure Android target
- [ ] **T-311**: Set up signing configuration
- [ ] **T-312**: Configure deep link handling in AndroidManifest.xml
- [ ] **T-313**: Configure Keystore access
- [ ] **T-314**: Configure flutter_appauth for Android

### 3.3 OAuth Adaptation

- [ ] **T-320**: Implement `KeycloakAuthService` with flutter_appauth
- [ ] **T-321**: Implement deep link callback handling
- [ ] **T-322**: Test OAuth on iOS simulator
- [ ] **T-323**: Test OAuth on Android emulator
- [ ] **T-324**: Test on physical iOS device
- [ ] **T-325**: Test on physical Android device

### 3.4 Mobile Features

- [ ] **T-330**: Implement biometric unlock (Face ID, Touch ID)
- [ ] **T-331**: Implement Android fingerprint unlock
- [ ] **T-332**: Implement push notification handling
- [ ] **T-333**: Optimize UI for mobile screen sizes
- [ ] **T-334**: Implement pull-to-refresh

### 3.5 Mobile Testing

- [ ] **T-340**: Test on slow network
- [ ] **T-341**: Test offline behavior
- [ ] **T-342**: Test background/foreground transitions
- [ ] **T-343**: Test notification tap handling

---

## Integration Tests

### Existing Tests (in tests/integration/)

- [x] **T-400**: `rbac.test.ts` - Authentication and authorization tests
- [x] **T-401**: `query-scenarios.test.ts` - Team queries, employee listing, budget queries

### Future Tests

- [ ] **T-410**: Flutter widget tests for MessageBubble
- [ ] **T-411**: Flutter widget tests for ApprovalCard
- [ ] **T-412**: Flutter integration tests for OAuth flow
- [ ] **T-413**: Flutter integration tests for chat streaming

---

## Summary

| Phase | Total Tasks | Completed | Pending |
|-------|-------------|-----------|---------|
| Phase 1 (Windows) | 55 | 55 | 0 |
| Phase 2 (macOS) | 14 | 0 | 14 |
| Phase 3 (Mobile) | 24 | 0 | 24 |
| Integration Tests | 6 | 2 | 4 |
| **Total** | **99** | **57** | **42** |

---

## References

- Spec: `.specify/specs/009-flutter-unified/spec.md`
- Plan: `.specify/specs/009-flutter-unified/plan.md`
- Implementation: `clients/unified_flutter/`
