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
│  │  │  Confirmation flow  │  │ User profile cache  │     │      │
│  │  └─────────────────────┘  └─────────────────────┘     │      │
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
│  │  LoginScreen → HomeScreen → ChatScreen                │      │
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
- [ ] Biometric unlock (Face ID, Touch ID, fingerprint)
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
│   │   │       └── desktop_oauth_service.dart # Desktop (HTTP server)
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
│       │   └── login_screen.dart
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

*This specification replaces 006-ai-desktop (Electron), 007-mobile (React Native), and 008-unified-client (React Native).*
