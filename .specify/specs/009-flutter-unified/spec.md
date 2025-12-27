# 009-flutter-unified: Flutter Unified Client (Desktop + Mobile)

**Status**: IMPLEMENTED
**Feature Branch**: `009-flutter-unified`
**Constitutional Compliance**: Article V.1, V.2, V.3 - CRITICAL
**Created**: December 24, 2025
**Replaces**: 006-ai-desktop (Electron), 007-mobile (React Native), 008-unified-client (React Native)

---

## Executive Summary

This specification defines a unified Flutter/Dart client supporting Windows, macOS, iOS, and Android from a single codebase. This approach was adopted following ADR-005, which documented the decision to pivot from React Native due to fundamental Windows platform instability issues (Hermes crashes, NuGet version mismatches, std::mutex bugs).

## Background: Why Flutter?

### The React Native Windows Problem (ADR-005)

After implementing ADR-004 (Electron → React Native), we discovered React Native Windows 0.73-0.80 has critical stability issues:

**React Native Windows 0.80**:
- Hermes engine crashes on TextInput (null pointer in JS-to-Native bridge)
- Crash occurs regardless of UI architecture (Fabric or Legacy)

**React Native Windows 0.73.x**:
- Version mismatch between npm packages and NuGet packages
- std::mutex crash bug in Visual Studio 2022 17.10+
- XAML initialization failures (access violation at 0x0000000000000000)
- Precompiled `Microsoft.ReactNative.dll` cannot be patched locally

All attempted workarounds failed. See `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md` for full investigation.

### Flutter Solution

Flutter provides:
- Production-stable Windows support since 2021
- Single `flutter build` command (no MSBuild/NuGet/npm conflicts)
- AOT compilation to native code (no JavaScript runtime crashes)
- Mature cross-platform packages for auth, storage, and HTTP

---

## Business Intent

Provide a unified AI assistant application for:
- **Windows Desktop** (primary enterprise target)
- **macOS Desktop** (developer and executive usage)
- **iOS Mobile** (field employees)
- **Android Mobile** (field employees)

All platforms share ~90% code, with platform-specific implementations for:
- OAuth callback handling (HTTP server on desktop, deep links on mobile)
- Secure token storage (Windows Credential Manager, Keychain, Keystore)

---

## Technical Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **Framework** | Flutter 3.38+ | Stable, production-ready |
| **Language** | Dart 3.10+ | AOT compiled to native |
| **Desktop OAuth** | Custom `DesktopOAuthService` | HTTP server callback on localhost |
| **Mobile OAuth** | `flutter_appauth` 7.0+ | Native browser with deep links |
| **Token Storage** | `flutter_secure_storage` 9.0+ | Platform-native secure storage |
| **State Management** | Riverpod 2.5+ | Compile-time safe providers |
| **HTTP Client** | Dio 5.4+ | Interceptors for auth headers |
| **Navigation** | go_router 14.0+ | Declarative routing with auth guards |
| **Code Generation** | Freezed 2.4+ | Immutable models with union types |
| **SSE Streaming** | Custom implementation | Handles MCP Gateway event format |
| **Logging** | logger 2.0+ | Structured logging |
| **Biometric Auth** | local_auth 2.3+ | Face ID, Touch ID, Windows Hello |

---

## Article V Compliance

### V.1 - No Authorization Logic in Client

```dart
// CORRECT: Backend returns masked data, client renders as-is
Widget build(BuildContext context) {
  return Text(employee.salary);  // Shows "*** (Hidden)" from backend
}

// WRONG: Client-side role checking - NEVER DO THIS
if (user.roles.contains('hr-write')) {
  return Text(employee.salary);
} else {
  return Text('Hidden');
}
```

The Flutter client:
- Never checks roles to show/hide UI elements
- Renders whatever data the backend returns
- All authorization happens at MCP Gateway and MCP Servers

### V.2 - Secure Token Storage

```dart
// Tokens stored in platform-native secure storage
// Windows: Credential Manager
// macOS/iOS: Keychain
// Android: Keystore

class SecureStorageService {
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<void> storeTokens({
    required String accessToken,
    required String? refreshToken,
    required String? idToken,
    required DateTime expiry,
  }) async {
    await _storage.write(key: 'access_token', value: accessToken);
    if (refreshToken != null) {
      await _storage.write(key: 'refresh_token', value: refreshToken);
    }
    // ... store other tokens
  }
}
```

Key security properties:
- Access token kept in memory for performance
- Refresh token ONLY in secure storage
- Never use SharedPreferences or plain files for tokens
- Tokens cleared on logout

### V.3 - PKCE Authentication

**Desktop OAuth Flow** (Windows/macOS/Linux):
```dart
class DesktopOAuthService implements AuthService {
  Future<AuthUser> login() async {
    // 1. Generate PKCE code verifier and challenge
    final codeVerifier = _generateCodeVerifier();
    final codeChallenge = _generateCodeChallenge(codeVerifier);

    // 2. Start local HTTP server for callback
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final redirectUri = 'http://127.0.0.1:${server.port}/callback';

    // 3. Build authorization URL
    final authUrl = Uri.parse('${_config.issuer}/protocol/openid-connect/auth')
        .replace(queryParameters: {
      'client_id': _config.clientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': _config.scopes.join(' '),
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
    });

    // 4. Open system browser
    await launchUrl(authUrl, mode: LaunchMode.externalApplication);

    // 5. Wait for callback with authorization code
    final code = await _waitForCallback(server);

    // 6. Exchange code for tokens using PKCE verifier
    final tokens = await _exchangeCodeForTokens(code, codeVerifier, redirectUri);

    // 7. Store tokens securely
    await _storage.storeTokens(...);

    return _extractUserFromIdToken(tokens.idToken);
  }
}
```

**Mobile OAuth Flow** (iOS/Android):
```dart
class KeycloakAuthService implements AuthService {
  final FlutterAppAuth _appAuth = FlutterAppAuth();

  Future<AuthUser> login() async {
    final result = await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        _config.clientId,
        _config.redirectUrl,
        issuer: _config.issuer,
        scopes: _config.scopes,
        // PKCE is automatic with flutter_appauth
      ),
    );

    await _storage.storeTokens(
      accessToken: result.accessToken!,
      refreshToken: result.refreshToken,
      idToken: result.idToken,
      expiry: result.accessTokenExpirationDateTime!,
    );

    return _extractUserFromIdToken(result.idToken!);
  }
}
```

### V.4 - Biometric Authentication (Quick Unlock)

The Flutter client supports local biometric authentication for returning users, eliminating the need to open the browser for OAuth on every app launch.

**Supported Platforms**:
- **Windows**: Windows Hello (Face/Fingerprint)
- **macOS**: Touch ID (on supported devices)
- **iOS**: Face ID / Touch ID
- **Android**: Fingerprint / Face Recognition

**Security Model**:
- Biometric authentication is **local only** - never transmitted to server
- Refresh token stored in **biometric-protected storage**
- Biometric prompt required to access the stored refresh token
- On successful biometric auth, token refresh performed to obtain new access token
- Falls back to full OAuth login if biometric fails or refresh token expires

```dart
// BiometricService wraps local_auth for platform detection
class BiometricService {
  final LocalAuthentication _localAuth = LocalAuthentication();

  Future<bool> isBiometricAvailable() async {
    return await _localAuth.canCheckBiometrics &&
           await _localAuth.isDeviceSupported();
  }

  Future<BiometricDisplayType> getPrimaryBiometricType() async {
    final types = await _localAuth.getAvailableBiometrics();
    if (Platform.isWindows) {
      return BiometricDisplayType.windowsHello;
    } else if (Platform.isIOS || Platform.isMacOS) {
      if (types.contains(BiometricType.face)) {
        return BiometricDisplayType.faceId;
      }
      return BiometricDisplayType.touchId;
    }
    // Android
    if (types.contains(BiometricType.face)) {
      return BiometricDisplayType.face;
    }
    return BiometricDisplayType.fingerprint;
  }

  Future<bool> authenticate({required String reason}) async {
    return await _localAuth.authenticate(
      localizedReason: reason,
      options: const AuthenticationOptions(
        stickyAuth: true,
        biometricOnly: true,
      ),
    );
  }
}
```

**Biometric-Protected Token Storage**:
```dart
// SecureStorageService with biometric protection
class SecureStorageService {
  final FlutterSecureStorage _biometricStorage;

  static FlutterSecureStorage _createBiometricStorage() {
    if (Platform.isAndroid) {
      return const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
      );
    } else if (Platform.isIOS || Platform.isMacOS) {
      return const FlutterSecureStorage(
        iOptions: IOSOptions(
          accessibility: KeychainAccessibility.unlocked_this_device,
        ),
      );
    } else {
      // Windows uses Credential Manager
      return const FlutterSecureStorage(wOptions: WindowsOptions());
    }
  }

  Future<void> enableBiometricUnlock(String refreshToken) async {
    await _biometricStorage.write(key: 'refresh_token', value: refreshToken);
    await _storage.write(key: 'biometric_enabled', value: 'true');
  }

  Future<String?> getBiometricProtectedRefreshToken() async {
    return await _biometricStorage.read(key: 'refresh_token');
  }
}
```

**Biometric Unlock Flow**:
```
App Launch
    │
    ▼
┌─────────────────────────────┐
│ Check biometric refresh     │
│ token exists                │
└─────────────────────────────┘
    │
    ├── No → LoginScreen (full OAuth)
    │
    ▼ Yes
┌─────────────────────────────┐
│ BiometricUnlockScreen       │
│ "Use Windows Hello to       │
│  unlock"                    │
└─────────────────────────────┘
    │
    ├── User taps "Use other account" → LoginScreen
    │
    ▼ User taps unlock button
┌─────────────────────────────┐
│ BiometricService.authenticate│
│ (Windows Hello prompt)      │
└─────────────────────────────┘
    │
    ├── Failed → Show error, retry or logout
    │
    ▼ Success
┌─────────────────────────────┐
│ Retrieve biometric-protected│
│ refresh token               │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ AuthNotifier.unlockWithBio- │
│ metric() → token refresh    │
└─────────────────────────────┘
    │
    ├── Token expired → disableBiometric → LoginScreen
    │
    ▼ Success
┌─────────────────────────────┐
│ HomeScreen (authenticated)  │
└─────────────────────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flutter App                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Riverpod Providers                      │   │
│  │                                                           │   │
│  │  authNotifierProvider    → AuthState (union type)        │   │
│  │  chatNotifierProvider    → ChatState (messages, stream)  │   │
│  │  currentUserProvider     → AuthUser?                     │   │
│  │  isAuthenticatedProvider → bool                          │   │
│  │  dioProvider             → Dio (with interceptors)       │   │
│  │  chatServiceProvider     → ChatService                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────┐      │
│  │                      Services                          │      │
│  │                                                        │      │
│  │  ┌─────────────────────┐  ┌─────────────────────┐     │      │
│  │  │  DesktopOAuthService │  │ KeycloakAuthService │     │      │
│  │  │  (Windows/macOS)     │  │ (iOS/Android)       │     │      │
│  │  │  HTTP server flow    │  │ flutter_appauth     │     │      │
│  │  └─────────────────────┘  └─────────────────────┘     │      │
│  │                                                        │      │
│  │  ┌─────────────────────┐  ┌─────────────────────┐     │      │
│  │  │  ChatService        │  │ SecureStorageService│     │      │
│  │  │  SSE streaming      │  │ Token persistence   │     │      │
│  │  │  Confirmation flow  │  │ Biometric storage   │     │      │
│  │  └─────────────────────┘  └─────────────────────┘     │      │
│  │                                                        │      │
│  │  ┌─────────────────────┐                              │      │
│  │  │  BiometricService   │                              │      │
│  │  │  Windows Hello      │                              │      │
│  │  │  Face ID/Touch ID   │                              │      │
│  │  └─────────────────────┘                              │      │
│  │                                                        │      │
│  │  ┌─────────────────────┐                              │      │
│  │  │ AuthTokenInterceptor│                              │      │
│  │  │ Auto token refresh  │                              │      │
│  │  │ 401 handling        │                              │      │
│  │  └─────────────────────┘                              │      │
│  └────────────────────────────────────────────────────────┘     │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────┐      │
│  │                      Features                          │      │
│  │                                                        │      │
│  │  LoginScreen ──┬─→ HomeScreen → ChatScreen             │      │
│  │                │                                       │      │
│  │  BiometricUnlockScreen ─┘                              │      │
│  │                               │                        │      │
│  │                               ├── MessageBubble        │      │
│  │                               │   └── TruncationBadge  │      │
│  │                               ├── ApprovalCard         │      │
│  │                               ├── ChatInput            │      │
│  │                               └── StreamingIndicator   │      │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                       HTTPS + Bearer Token
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Gateway (:3100)                         │
│                                                                  │
│  - JWT validation with Keycloak JWKS                            │
│  - Role-based MCP server routing                                │
│  - SSE streaming with custom event types                        │
│  - Human-in-the-loop confirmations                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Servers                                 │
│  mcp-hr:3101  mcp-finance:3102  mcp-sales:3103  mcp-support:3104│
└─────────────────────────────────────────────────────────────────┘
```

---

## v1.4 Feature Support

| Feature | Section | Implementation |
|---------|---------|----------------|
| **SSE Streaming** | 6.1 | Custom parser in `ChatService` handles `type: "text"` events |
| **Truncation Warnings** | 5.3 | Yellow badge in `MessageBubble` when `metadata.truncated: true` |
| **Human-in-the-Loop** | 5.6 | `ApprovalCard` widget with approve/reject actions |
| **LLM-Friendly Errors** | 7.4 | Error messages displayed in chat with suggestions |

### SSE Event Handling

The MCP Gateway sends custom SSE events that differ from Anthropic's standard format:

```dart
// ChatService SSE parsing
Stream<SSEChunk> sendQuery(String query) async* {
  final response = await _dio.post<ResponseBody>(
    '/api/query',
    data: {'query': query},
    options: Options(responseType: ResponseType.stream),
  );

  await for (final chunk in _parseSSEStream(response.data!.stream)) {
    yield chunk;
  }
}

SSEChunk _parseEvent(Map<String, dynamic> json) {
  final type = json['type'] as String?;

  switch (type) {
    case 'text':
      // MCP Gateway custom event type
      return SSEChunk(type: SSEEventType.contentBlockDelta, text: json['text']);
    case 'content_block_delta':
      // Anthropic standard event
      return SSEChunk(type: SSEEventType.contentBlockDelta, text: json['delta']?['text']);
    // ... other event types
  }
}
```

### Truncation Warning Display

```dart
class MessageBubble extends StatelessWidget {
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (message.isTruncated)
          Container(
            color: Colors.yellow.shade100,
            padding: EdgeInsets.all(8),
            child: Text(
              message.truncationWarning ?? 'Results truncated',
              style: TextStyle(fontSize: 12, color: Colors.orange.shade900),
            ),
          ),
        // ... message content
      ],
    );
  }
}
```

### Human-in-the-Loop Confirmation

```dart
class ApprovalCard extends StatelessWidget {
  final PendingConfirmation confirmation;
  final Function(bool) onDecision;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.amber.shade50,
      child: Column(
        children: [
          Icon(Icons.warning, color: Colors.orange),
          Text(confirmation.message),
          // ... confirmation details
          Row(
            children: [
              ElevatedButton(
                onPressed: () => onDecision(true),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                child: Text('Approve'),
              ),
              OutlinedButton(
                onPressed: () => onDecision(false),
                child: Text('Cancel'),
              ),
            ],
          ),
          Text('Expires in 5 minutes', style: TextStyle(fontSize: 10)),
        ],
      ),
    );
  }
}
```

---

## User Scenarios

### P1 - Secure Login (Desktop)

**Given**: User opens app for first time on Windows
**When**: App checks for stored refresh token in Credential Manager
**Then**: If none found, app starts local HTTP server on random port
**Then**: App opens system browser with Keycloak authorization URL (PKCE)
**Then**: User completes Keycloak login + TOTP in browser
**Then**: Browser redirects to `http://127.0.0.1:{port}/callback`
**Then**: App captures authorization code from callback
**Then**: App exchanges code for tokens using PKCE verifier
**Then**: Tokens stored in Windows Credential Manager
**Then**: User extracted from ID token claims
**Then**: User sees HomeScreen with profile information

### P2 - AI Query with Streaming

**Given**: User is authenticated and on ChatScreen
**When**: User types "Who are my team members?"
**Then**: ChatNotifier creates placeholder assistant message with streaming flag
**Then**: ChatService sends POST to `/api/query` with Bearer token
**Then**: Gateway streams SSE response chunks
**Then**: ChatNotifier appends text to message content incrementally
**Then**: If truncated, warning badge displayed
**Then**: Final message rendered with markdown formatting

### P3 - Write Action Confirmation (Human-in-the-Loop)

**Given**: User asks "Delete invoice INV-2024-001"
**When**: Gateway returns `pending_confirmation` status
**Then**: ApprovalCard widget rendered in chat
**Then**: User sees action details and warning message
**When**: User taps "Approve"
**Then**: ChatService sends POST to `/api/confirm/{confirmationId}` with `approved: true`
**Then**: Gateway executes delete operation
**Then**: Success message rendered in chat

### P4 - Token Refresh

**Given**: User has been using app for > 5 minutes
**When**: Access token is about to expire (< 30 seconds remaining)
**Then**: AuthTokenInterceptor detects expiry before next request
**Then**: Interceptor calls `authNotifier.refreshToken()`
**Then**: New tokens obtained from Keycloak
**Then**: Tokens stored in secure storage
**Then**: Original request retried with new token
**Then**: User experiences no interruption

### P5 - Logout

**Given**: User taps logout in AppBar
**When**: Confirmation dialog shown
**Then**: If confirmed, access token cleared from memory
**Then**: All tokens deleted from secure storage
**Then**: Keycloak end-session endpoint called (optional browser redirect)
**Then**: AuthState transitions to `unauthenticated`
**Then**: go_router redirects to LoginScreen

### P6 - Biometric Quick Unlock

**Given**: User has previously logged in and enabled biometric unlock
**When**: App is opened (fresh launch or from background)
**Then**: App checks for biometric-protected refresh token
**Then**: BiometricUnlockScreen displayed with platform-appropriate prompt
**Then**: User authenticates with Windows Hello / Face ID / Touch ID
**Then**: Biometric-protected refresh token retrieved
**Then**: Token refresh performed to obtain new access token
**Then**: AuthState transitions to `authenticated`
**Then**: User sees HomeScreen without opening browser

### P7 - Enable Biometric Unlock

**Given**: User is authenticated and on HomeScreen
**When**: User navigates to Security section
**Then**: Biometric toggle displayed (if hardware available)
**When**: User enables biometric toggle
**Then**: Biometric authentication prompt shown
**Then**: If successful, current refresh token copied to biometric-protected storage
**Then**: Setting persisted, biometric unlock enabled for future sessions

### P8 - Biometric Unlock Failure

**Given**: User has biometric unlock enabled
**When**: Biometric authentication fails (wrong finger, cancelled, hardware error)
**Then**: Error message displayed with retry option
**Then**: "Use different account" option available
**When**: User taps "Use different account"
**Then**: Biometric storage cleared
**Then**: LoginScreen displayed for fresh OAuth login

---

## Success Criteria

### Windows Desktop (Phase 1) - COMPLETE

- [x] Flutter project builds for Windows
- [x] OAuth login via system browser with PKCE
- [x] Tokens stored in Windows Credential Manager
- [x] User profile extracted from ID token (name, email, roles)
- [x] Chat interface with SSE streaming
- [x] Truncation warning display
- [x] Human-in-the-loop ApprovalCard
- [x] Token refresh via Dio interceptor
- [x] Logout clears all tokens
- [x] Biometric unlock via Windows Hello
- [x] Biometric settings toggle on HomeScreen

### macOS Desktop (Phase 2) - PENDING

- [ ] Flutter macOS build configured
- [ ] OAuth login works with macOS Keychain
- [ ] UI adapts to macOS conventions
- [ ] All Windows features working

### Mobile (Phase 3) - PENDING

- [ ] iOS build configured with provisioning
- [ ] Android build configured
- [ ] `flutter_appauth` OAuth flow works
- [ ] Deep link callbacks work (`com.tamshai.ai://callback`)
- [x] Biometric unlock (Face ID, Touch ID, fingerprint) - shared implementation from Phase 1
- [ ] Push notifications for approvals

---

## Known Limitations

### PL-001: Desktop OAuth Uses System Browser

| Attribute | Value |
|-----------|-------|
| **Platform** | Windows, macOS, Linux |
| **Feature** | OAuth/OIDC Authentication |
| **Expected** | In-app browser or native modal |
| **Actual** | Opens system default browser |
| **Status** | Accepted Platform Limitation |

**Description**:
On desktop platforms, the OAuth login flow opens the user's default system browser. After authentication completes, the app brings itself to the foreground, but the browser tab remains open.

**Root Cause**:
Flutter desktop does not have a mature WebView solution. Using a local HTTP server with system browser is the most reliable cross-platform approach.

**Mitigations**:
1. App automatically focuses after callback
2. PKCE security is maintained
3. User education: "Close browser tab after login"

**QA Notes**:
- Do NOT flag as bug
- Verify login completes successfully
- Browser tab remaining open is expected

---

## Keycloak Configuration

### Required Client Configuration

1. **Client ID**: `tamshai-flutter-client`
2. **Client Type**: Public (no client secret)
3. **Authentication Flow**: Standard + PKCE
4. **Valid Redirect URIs**:
   - `http://127.0.0.1:*/callback` (desktop - any port)
   - `com.tamshai.ai://callback` (mobile)
5. **Web Origins**: `+` (all)

### Required Protocol Mappers

The following mappers must be added to include claims in the access token:

| Mapper Name | Mapper Type | Token Claim Name | Add to Access Token |
|-------------|-------------|------------------|---------------------|
| preferred_username | User Property | preferred_username | Yes |
| email | User Property | email | Yes |
| realm roles | User Realm Role | realm_access.roles | Yes |

Without these mappers, the MCP Gateway cannot identify the user for queries like "who are my team members".

---

## Directory Structure

```
clients/unified_flutter/
├── lib/
│   ├── main.dart                              # App entry, providers setup
│   ├── core/
│   │   ├── api/
│   │   │   └── token_interceptor.dart         # Dio auth interceptor
│   │   ├── auth/
│   │   │   ├── models/
│   │   │   │   ├── auth_state.dart            # Freezed: AuthState, AuthUser
│   │   │   │   ├── auth_state.freezed.dart    # Generated
│   │   │   │   ├── auth_state.g.dart          # Generated JSON
│   │   │   │   └── keycloak_config.dart       # Keycloak settings
│   │   │   ├── providers/
│   │   │   │   └── auth_provider.dart         # authNotifierProvider
│   │   │   └── services/
│   │   │       ├── auth_service.dart          # Abstract interface
│   │   │       ├── keycloak_auth_service.dart # Mobile (flutter_appauth)
│   │   │       ├── desktop_oauth_service.dart # Desktop (HTTP server)
│   │   │       └── biometric_service.dart     # Biometric auth wrapper
│   │   ├── chat/
│   │   │   ├── models/
│   │   │   │   ├── chat_state.dart            # Freezed: ChatState, ChatMessage
│   │   │   │   └── sse_chunk.dart             # SSE event types
│   │   │   ├── providers/
│   │   │   │   └── chat_provider.dart         # chatNotifierProvider
│   │   │   └── services/
│   │   │       └── chat_service.dart          # SSE streaming, confirmations
│   │   └── storage/
│   │       └── secure_storage_service.dart    # Token persistence
│   └── features/
│       ├── authentication/
│       │   ├── login_screen.dart
│       │   └── biometric_unlock_screen.dart  # Biometric quick unlock UI
│       ├── home/
│       │   └── home_screen.dart
│       └── chat/
│           ├── chat_screen.dart
│           └── widgets/
│               ├── message_bubble.dart
│               ├── approval_card.dart
│               └── chat_input.dart
├── windows/                                    # Windows runner
├── macos/                                      # macOS runner
├── ios/                                        # iOS runner
├── android/                                    # Android runner
├── pubspec.yaml                               # Dependencies
└── README.md
```

---

## References

- **ADR-005**: `.specify/ARCHITECTURE_SPECS.md` - Flutter pivot decision
- **Migration Document**: `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md`
- **React Native Investigation**: `clients/unified/docs/WINDOWS_CRASH_INVESTIGATION.md`
- **Implementation**: `clients/unified_flutter/`
- **Keycloak Setup**: `KEYCLOAK_SETUP.md`
- **Quickstart Guide**: `QUICKSTART.md`

---

## Mobile Network Configuration (Phase 3 Prerequisite)

Before mobile development can begin, network accessibility must be configured to allow physical devices to reach the development environment.

### The Problem: localhost Inaccessibility

Development services use `localhost`:
- Keycloak: `http://localhost:8180`
- MCP Gateway: `http://localhost:3100`
- Kong Gateway: `http://localhost:8100`

**Issue**: Physical mobile devices cannot reach `localhost` - they need the host machine's LAN IP address.

### Host Discovery Script

```bash
#!/bin/bash
# scripts/discover-mobile-host.sh
# Discovers host IP and generates mobile environment file

set -e

# Get the primary network interface IP
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qi microsoft /proc/version 2>/dev/null; then
        # WSL2: Get Windows host IP
        HOST_IP=$(ip route show | grep -i default | awk '{ print $3}')
    else
        # Native Linux
        HOST_IP=$(hostname -I | awk '{print $1}')
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
    # Windows Git Bash / Cygwin
    HOST_IP=$(ipconfig | grep -A 4 "Wireless LAN" | grep "IPv4" | awk '{print $NF}')
    if [[ -z "$HOST_IP" ]]; then
        HOST_IP=$(ipconfig | grep -A 4 "Ethernet" | grep "IPv4" | awk '{print $NF}')
    fi
fi

if [[ -z "$HOST_IP" ]]; then
    echo "ERROR: Could not determine host IP address"
    exit 1
fi

echo "Discovered host IP: $HOST_IP"

cat > .env.mobile << EOF
# Auto-generated by discover-mobile-host.sh
# $(date)

TAMSHAI_HOST_IP=$HOST_IP

# External URLs for mobile clients
KEYCLOAK_EXTERNAL_URL=http://$HOST_IP:8180
MCP_GATEWAY_EXTERNAL_URL=http://$HOST_IP:3100
KONG_EXTERNAL_URL=http://$HOST_IP:8100

# Keycloak configuration
KC_HOSTNAME=$HOST_IP
KC_HOSTNAME_PORT=8180

# CORS origins (add mobile app scheme)
CORS_ORIGINS=http://$HOST_IP:4000,http://$HOST_IP:4001,com.tamshai.ai://*
EOF

echo "Generated .env.mobile with host IP: $HOST_IP"
```

### Windows Firewall Script

```powershell
# scripts/setup-mobile-firewall.ps1
# Run as Administrator

$ports = @(8180, 8100, 3100, 4000, 4001, 4002, 4003, 4004)
$ruleName = "Tamshai-Mobile-Dev"

# Remove existing rules
Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Create inbound rules for each port
foreach ($port in $ports) {
    New-NetFirewallRule `
        -DisplayName "$ruleName-$port" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -Profile Private,Domain `
        -Description "Allow mobile development access to Tamshai services"

    Write-Host "Created firewall rule for port $port"
}

Write-Host "`nFirewall rules created. Mobile devices on the same network can now access services."
```

### WSL2 Port Forwarding Script

```powershell
# scripts/setup-wsl-portforward.ps1
# Run as Administrator (only needed if using WSL2)

$wslIp = (wsl hostname -I).Trim().Split()[0]
$ports = @(8180, 8100, 3100, 4000, 4001, 4002, 4003, 4004)

Write-Host "WSL2 IP: $wslIp"

# Remove existing port proxies
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
}

# Add port forwards
foreach ($port in $ports) {
    netsh interface portproxy add v4tov4 `
        listenport=$port `
        listenaddress=0.0.0.0 `
        connectport=$port `
        connectaddress=$wslIp

    Write-Host "Forwarding port $port -> $wslIp:$port"
}

Write-Host "`nPort forwarding configured. Services accessible via Windows host IP."
```

### Docker Compose Mobile Override

```yaml
# docker-compose.mobile.yml
version: '3.8'

services:
  keycloak:
    environment:
      KC_HOSTNAME: ${TAMSHAI_HOST_IP:-localhost}
      KC_HOSTNAME_PORT: 8180

  mcp-gateway:
    environment:
      KEYCLOAK_URL: http://${TAMSHAI_HOST_IP:-localhost}:8180
      KEYCLOAK_ISSUER: http://${TAMSHAI_HOST_IP:-localhost}:8180/realms/tamshai
      CORS_ORIGINS: http://${TAMSHAI_HOST_IP:-localhost}:4000,com.tamshai.ai://*
```

---

## Phase Implementation Details

### Phase 1: Windows Desktop (COMPLETE ✅)

**Scope**: Full-featured Windows desktop client

| Task | Status | Notes |
|------|--------|-------|
| Project initialization | ✅ | Flutter 3.38, Riverpod 2.5 |
| OAuth PKCE (HTTP server) | ✅ | `DesktopOAuthService` |
| Token storage | ✅ | Windows Credential Manager via `flutter_secure_storage` |
| Chat UI with SSE | ✅ | Custom SSE parser |
| Truncation warnings | ✅ | Yellow badge on truncated messages |
| ApprovalCard widget | ✅ | Human-in-the-loop confirmations |
| Token refresh interceptor | ✅ | Dio interceptor |
| Biometric unlock | ✅ | Windows Hello via `local_auth` |
| Biometric settings | ✅ | Toggle in HomeScreen |

**Files**:
- `clients/unified_flutter/lib/core/auth/services/desktop_oauth_service.dart`
- `clients/unified_flutter/lib/core/auth/services/biometric_service.dart`
- `clients/unified_flutter/lib/features/authentication/biometric_unlock_screen.dart`
- `clients/unified_flutter/lib/core/chat/services/chat_service.dart`

### Phase 2: macOS Desktop (PENDING)

**Scope**: Port Windows features to macOS

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| macOS runner configuration | Pending | 2h | Enable Flutter macOS in `pubspec.yaml` |
| Keychain token storage | Pending | 4h | Test `flutter_secure_storage` on macOS |
| OAuth HTTP server | Pending | 2h | Verify port binding on macOS |
| UI polish | Pending | 4h | macOS HIG compliance (menu bar, window chrome) |
| Code signing | Pending | 4h | Developer ID for distribution |

**Prerequisites**:
- macOS development machine
- Apple Developer account (for signing)

**Expected Code Changes**:
- `macos/Runner.xcodeproj` - project configuration
- `macos/Runner/DebugProfile.entitlements` - network entitlements
- No Dart code changes expected (platform abstraction complete)

### Phase 3: Mobile (iOS + Android) (PENDING)

**Scope**: iOS and Android mobile clients

#### 3a. iOS Implementation

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| iOS runner configuration | Pending | 2h | `flutter create --platforms=ios` already done |
| `flutter_appauth` integration | Pending | 4h | Replace desktop OAuth for iOS |
| Deep link callback setup | Pending | 4h | `com.tamshai.ai://callback` scheme |
| Keychain storage | Pending | 2h | `flutter_secure_storage` iOS adapter |
| Face ID unlock | Pending | 4h | Optional biometric for app access |
| Push notifications | Pending | 8h | For pending confirmations |
| TestFlight distribution | Pending | 4h | Internal testing |
| App Store submission | Pending | 8h | Production release |

**Prerequisites**:
- Apple Developer account
- Physical iOS device for testing
- Network setup scripts executed

**Keycloak Configuration for iOS**:
```json
{
  "redirectUris": ["com.tamshai.ai://callback"],
  "webOrigins": ["com.tamshai.ai"]
}
```

**Info.plist Deep Link Configuration**:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.tamshai.ai</string>
    </array>
    <key>CFBundleURLName</key>
    <string>OAuth Callback</string>
  </dict>
</array>
```

#### 3b. Android Implementation

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Android runner configuration | Pending | 2h | `flutter create --platforms=android` already done |
| `flutter_appauth` integration | Pending | 4h | Replace desktop OAuth for Android |
| Deep link callback setup | Pending | 4h | Intent filter for callback |
| Keystore storage | Pending | 2h | `flutter_secure_storage` Android adapter |
| Fingerprint unlock | Pending | 4h | Optional biometric for app access |
| Push notifications (FCM) | Pending | 8h | Firebase Cloud Messaging |
| Play Store submission | Pending | 8h | Production release |

**Prerequisites**:
- Google Play Console account
- Physical Android device for testing
- Network setup scripts executed

**AndroidManifest.xml Deep Link Configuration**:
```xml
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.tamshai.ai" android:host="callback" />
  </intent-filter>
</activity>
```

### Mobile OAuth Service (Phase 3)

```dart
// lib/core/auth/services/keycloak_auth_service.dart
// This file exists but is not yet integrated for mobile

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class KeycloakAuthService implements AuthService {
  final FlutterAppAuth _appAuth = FlutterAppAuth();
  final FlutterSecureStorage _storage = FlutterSecureStorage();

  @override
  Future<AuthUser> login() async {
    final result = await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        'tamshai-flutter-client',           // clientId
        'com.tamshai.ai://callback',         // redirectUrl
        issuer: 'http://${hostIp}:8180/realms/tamshai',
        scopes: ['openid', 'profile', 'email'],
        // PKCE is automatic
      ),
    );

    await _storage.write(key: 'access_token', value: result.accessToken);
    await _storage.write(key: 'refresh_token', value: result.refreshToken);

    return _extractUser(result.idToken!);
  }

  @override
  Future<void> logout() async {
    await _storage.deleteAll();
    // Optional: call Keycloak end-session endpoint
  }
}
```

---

## Configuration Management

### Environment Configuration Files

| File | Purpose | Contains |
|------|---------|----------|
| `lib/core/auth/models/keycloak_config.dart` | Compile-time config | Keycloak URLs, client IDs |
| `.env.mobile` | Runtime config (mobile dev) | Host IP for network access |
| `pubspec.yaml` | Build config | Platform targets, dependencies |

### Keycloak Config Pattern

```dart
// lib/core/auth/models/keycloak_config.dart

class KeycloakConfig {
  // Development environment
  static const dev = KeycloakConfig._(
    issuer: 'http://localhost:8180/realms/tamshai',
    clientId: 'tamshai-flutter-client',
    scopes: ['openid', 'profile', 'email'],
  );

  // Mobile development (uses discovered host IP)
  static KeycloakConfig mobile(String hostIp) => KeycloakConfig._(
    issuer: 'http://$hostIp:8180/realms/tamshai',
    clientId: 'tamshai-flutter-client',
    scopes: ['openid', 'profile', 'email'],
  );

  // Production environment
  static const prod = KeycloakConfig._(
    issuer: 'https://auth.tamshai.com/realms/tamshai',
    clientId: 'tamshai-flutter-client',
    scopes: ['openid', 'profile', 'email'],
  );

  final String issuer;
  final String clientId;
  final List<String> scopes;

  const KeycloakConfig._({
    required this.issuer,
    required this.clientId,
    required this.scopes,
  });
}
```

### Platform-Specific Service Selection

```dart
// lib/main.dart

void main() {
  // Select auth service based on platform
  final authService = Platform.isWindows || Platform.isMacOS || Platform.isLinux
      ? DesktopOAuthService(config: KeycloakConfig.dev)
      : KeycloakAuthService(config: KeycloakConfig.dev);

  runApp(
    ProviderScope(
      overrides: [
        authServiceProvider.overrideWithValue(authService),
      ],
      child: const TamshaiApp(),
    ),
  );
}
```

---

## References

- **ADR-005**: `.specify/ARCHITECTURE_SPECS.md` - Flutter pivot decision
- **Migration Document**: `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md`
- **React Native Investigation**: `clients/unified/docs/WINDOWS_CRASH_INVESTIGATION.md`
- **Implementation**: `clients/unified_flutter/`
- **Keycloak Setup**: `KEYCLOAK_SETUP.md`
- **Quickstart Guide**: `QUICKSTART.md`
- **Superseded Spec (Network Scripts)**: `.specify/specs/007-mobile/spec.md`

---

*This specification replaces 006-ai-desktop (Electron), 007-mobile (React Native), and 008-unified-client (React Native).*
