# 009-flutter-unified: Implementation Plan

**Status**: Phase 1 COMPLETE, Phases 2-3 PENDING
**Last Updated**: December 26, 2025

---

## Implementation Phases

### Phase 1: Windows Desktop (COMPLETE)

**Objective**: Deliver working Windows desktop AI client with OAuth, chat, and v1.4 features.

**Completed Work**:

1. **Project Setup**
   - [x] Initialize Flutter project with Windows target
   - [x] Configure pubspec.yaml with all dependencies
   - [x] Set up Riverpod for state management
   - [x] Configure Freezed for code generation

2. **Authentication Layer**
   - [x] Implement `SecureStorageService` with `flutter_secure_storage`
   - [x] Implement `DesktopOAuthService` with HTTP server callback
   - [x] Implement PKCE code verifier and challenge generation
   - [x] Implement token exchange flow
   - [x] Implement user extraction from ID token claims
   - [x] Implement `AuthNotifier` state management
   - [x] Implement automatic token refresh

3. **API Infrastructure**
   - [x] Configure Dio HTTP client
   - [x] Implement `AuthTokenInterceptor` for Bearer token injection
   - [x] Implement 401 response handling with token refresh
   - [x] Implement request queuing during refresh

4. **Chat Interface**
   - [x] Implement `ChatService` with SSE streaming
   - [x] Implement `ChatNotifier` state management
   - [x] Implement `ChatScreen` with message list
   - [x] Implement `MessageBubble` with role-based styling
   - [x] Implement `ChatInput` with send/stop controls
   - [x] Implement streaming indicator ("Thinking...")
   - [x] Implement copy-to-clipboard on messages

5. **v1.4 Features**
   - [x] Handle MCP Gateway `type: "text"` SSE events
   - [x] Implement truncation warning display
   - [x] Implement `ApprovalCard` for confirmations
   - [x] Implement confirmation approve/reject flow

6. **Navigation & UX**
   - [x] Implement go_router with auth guards
   - [x] Implement LoginScreen
   - [x] Implement HomeScreen with user profile
   - [x] Implement logout with confirmation dialog

7. **Keycloak Integration**
   - [x] Create `tamshai-flutter-client` in Keycloak
   - [x] Configure redirect URIs for desktop
   - [x] Add protocol mappers for access token claims
   - [x] Test end-to-end OAuth flow

---

### Phase 2: macOS Desktop (PENDING)

**Objective**: Extend Windows implementation to macOS.

**Estimated Work**:

1. **Build Configuration**
   - [ ] Configure macOS target in Xcode
   - [ ] Set up code signing and entitlements
   - [ ] Configure sandboxing permissions (network, keychain)

2. **OAuth Adaptation**
   - [ ] Verify HTTP server callback works on macOS
   - [ ] Verify macOS Keychain storage works
   - [ ] Test browser launch and focus return

3. **UI Adaptation**
   - [ ] Review UI for macOS conventions
   - [ ] Test window resizing and layouts
   - [ ] Add macOS-specific menu items (if needed)

4. **Testing**
   - [ ] Full OAuth flow test on macOS
   - [ ] Chat functionality test
   - [ ] Token refresh test
   - [ ] Logout test

---

### Phase 3: Mobile (PENDING)

**Objective**: Extend to iOS and Android with mobile-specific features.

**Estimated Work**:

1. **iOS Configuration**
   - [ ] Configure iOS target with provisioning profile
   - [ ] Set up deep link handling for `com.tamshai.ai://`
   - [ ] Configure iOS Keychain entitlements
   - [ ] Add `flutter_appauth` iOS dependencies

2. **Android Configuration**
   - [ ] Configure Android target with signing
   - [ ] Set up deep link handling in AndroidManifest
   - [ ] Configure Keystore access
   - [ ] Add `flutter_appauth` Android dependencies

3. **OAuth Adaptation**
   - [ ] Switch to `KeycloakAuthService` (flutter_appauth) on mobile
   - [ ] Implement deep link callback handling
   - [ ] Test OAuth flow on iOS simulator
   - [ ] Test OAuth flow on Android emulator

4. **Mobile-Specific Features**
   - [ ] Implement biometric unlock (Face ID, Touch ID, fingerprint)
   - [ ] Implement push notification handling for approvals
   - [ ] Optimize UI for mobile screen sizes
   - [ ] Implement pull-to-refresh on message list

5. **Testing**
   - [ ] Physical device testing (iOS)
   - [ ] Physical device testing (Android)
   - [ ] Network condition testing (slow, offline)

---

## Technical Approach

### State Management (Riverpod)

```dart
// Provider hierarchy
loggerProvider               // Basic logging
secureStorageProvider        // Token persistence
keycloakConfigProvider       // Keycloak settings
dioProvider                  // HTTP client with interceptors
authServiceProvider          // Platform-specific auth
authNotifierProvider         // Auth state (union type)
chatServiceProvider          // SSE streaming
chatNotifierProvider         // Chat state
currentUserProvider          // Derived: current user
isAuthenticatedProvider      // Derived: auth check
```

### Platform Selection Pattern

```dart
// In auth_provider.dart
final authServiceProvider = Provider<AuthService>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final config = ref.watch(keycloakConfigProvider);

  if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
    return DesktopOAuthService(storage: storage, config: config);
  } else {
    return KeycloakAuthService(storage: storage, config: config);
  }
});
```

### Error Handling Strategy

1. **Network Errors**: Display friendly message, offer retry
2. **Auth Errors**: Clear tokens, redirect to login
3. **SSE Errors**: Stop stream, show error in chat
4. **Confirmation Errors**: Show inline error, allow retry

### Testing Strategy

| Level | Tool | Coverage |
|-------|------|----------|
| Unit | flutter_test | Services, state notifiers |
| Widget | flutter_test | UI components |
| Integration | integration_test | Full flows |
| E2E | Manual | Real devices, real backend |

---

## Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| flutter_riverpod | ^2.5.1 | State management |
| flutter_appauth | ^7.0.0 | Mobile OAuth |
| flutter_secure_storage | ^9.0.0 | Token persistence |
| dio | ^5.4.0 | HTTP client |
| go_router | ^14.0.0 | Navigation |
| freezed_annotation | ^2.4.1 | Immutable models |
| url_launcher | ^6.2.5 | Browser launch |
| crypto | ^3.0.3 | PKCE hashing |
| logger | ^2.0.2 | Logging |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| build_runner | ^2.4.7 | Code generation |
| freezed | ^2.4.6 | Freezed codegen |
| json_serializable | ^6.7.1 | JSON codegen |
| flutter_lints | ^3.0.0 | Linting |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| macOS Keychain permission issues | Test early in Phase 2, document entitlements |
| iOS App Store code signing | Set up provisioning profile early |
| Mobile deep link conflicts | Use unique scheme `com.tamshai.ai` |
| Network reliability on mobile | Implement offline indicators, retry logic |

---

## References

- Spec: `.specify/specs/009-flutter-unified/spec.md`
- Tasks: `.specify/specs/009-flutter-unified/tasks.md`
- Migration Doc: `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md`
