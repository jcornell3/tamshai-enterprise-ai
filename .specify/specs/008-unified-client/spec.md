# 008-unified-client: React Native Unified Client (Desktop + Mobile)

**Status**: PLANNING
**Feature Branch**: `008-unified-client`
**Constitutional Compliance**: Article V.1, V.2, V.3 - CRITICAL
**Created**: December 14, 2024
**Replaces**: 006-ai-desktop (Electron), 007-mobile (partial)

---

## Executive Summary

This specification defines a unified React Native client supporting Windows, macOS, iOS, and Android from a single codebase. This approach was adopted following ADR-004, which documented the decision to pivot from Electron due to a fundamental Windows single-instance lock race condition that broke OAuth deep linking.

## Background: Why React Native?

### The Electron Problem (ADR-004)

During OAuth implementation on Windows, we discovered Electron's `requestSingleInstanceLock()` has a race condition where both the original instance and the OAuth callback instance can acquire the lock simultaneously. This breaks the PKCE flow because:

1. Original instance (PID A) starts, acquires lock, initiates OAuth
2. User completes Keycloak login (~30 seconds)
3. Callback launches new instance (PID B)
4. **Both PID A and PID B acquire the lock** (race condition)
5. `second-instance` event never fires
6. PKCE code verifier (in PID A's memory) is never matched with callback URL (in PID B)
7. Login fails

**Workarounds Attempted**:
- 600ms delay before lock request
- `additionalData` API for URL passing
- Auto-close orphaned instances
- File-based IPC

None resolved the fundamental issue.

### React Native Solution

React Native for Windows uses native UWP protocol activation:
- OS recognizes app is already running
- OS activates existing instance directly
- No process spawn → no lock check → no race condition

This is the same mechanism used by native Windows apps and is fundamentally more reliable than Electron's process-level locking.

---

## Business Intent

Provide a unified AI assistant application for:
- **Windows Desktop** (primary enterprise target)
- **macOS Desktop** (developer and executive usage)
- **iOS Mobile** (field employees)
- **Android Mobile** (field employees)

All platforms share ~90% code, with platform-specific native modules for:
- Secure token storage (Keychain/Credential Manager)
- Protocol handling (deep links)
- Biometric authentication (future)

---

## Technical Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **Framework** | React Native 0.73+ | Latest stable |
| **Desktop Windows** | `react-native-windows` | Microsoft maintained |
| **Desktop macOS** | `react-native-macos` | Microsoft maintained |
| **Mobile** | React Native (core) | iOS + Android |
| **Language** | TypeScript 5.x | Strict mode |
| **Auth** | `react-native-app-auth` | OIDC PKCE |
| **Token Storage** | `react-native-keychain` | Platform-native |
| **State** | Zustand | Lightweight |
| **Streaming** | Custom SSE | Fetch-based |
| **UI** | React Native Paper or NativeWind | TBD |

---

## Article V Compliance

### V.1 - No Authorization Logic in Client

```typescript
// CORRECT: Backend returns masked data, client renders as-is
const EmployeeSalary = ({ employee }) => (
  <Text>{employee.salary}</Text>  // Shows "*** (Hidden)" from backend
);

// WRONG: Client-side role checking
if (user.roles.includes('hr-write')) {
  showSalary();
}
```

### V.2 - Secure Token Storage

```typescript
import * as Keychain from 'react-native-keychain';

// Store refresh token in OS-native secure storage
await Keychain.setGenericPassword('tokens', JSON.stringify(tokens), {
  service: 'com.tamshai.ai',
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

// Access token: Memory only during app lifecycle
// Never use AsyncStorage for tokens
```

### V.3 - PKCE Authentication

```typescript
import { authorize } from 'react-native-app-auth';

const config = {
  issuer: 'http://localhost:8180/realms/tamshai-corp',
  clientId: 'mcp-gateway-unified',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  usePKCE: true,  // REQUIRED
  scopes: ['openid', 'profile', 'email', 'roles'],
};

const result = await authorize(config);
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Shared Code (~90%)                   │    │
│  │  - UI Components (Chat, Login, Settings)            │    │
│  │  - State Management (Zustand stores)                │    │
│  │  - API Client (MCP Gateway calls)                   │    │
│  │  - Auth Logic (token refresh, logout)               │    │
│  │  - SSE Streaming (AI responses)                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Windows   │  │    macOS    │  │  iOS/Android │         │
│  │   Native    │  │   Native    │  │    Native    │         │
│  │  - Keychain │  │  - Keychain │  │  - Keychain  │         │
│  │  - UWP Proto│  │  - AppKit   │  │  - AppAuth   │         │
│  │  - Notifs   │  │  - Notifs   │  │  - Push      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                           │
                    HTTPS + JWT
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Gateway                               │
│  - JWT validation                                            │
│  - All authorization logic                                   │
│  - Claude API integration                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## User Scenarios

### P1 - Secure Login (All Platforms)

**Given**: User opens app for first time
**When**: App checks for stored refresh token
**Then**: If none found, opens system browser for OIDC login
**Then**: User completes Keycloak login + TOTP
**Then**: Callback redirects to app via `com.tamshai.ai://`
**Then**: Tokens stored securely (access in memory, refresh in keychain)
**Then**: User sees chat interface

### P2 - AI Query with Streaming

**Given**: User is authenticated
**When**: User types "Who reports to Sarah Chen?"
**Then**: App sends query to MCP Gateway with JWT
**Then**: Gateway streams response via SSE
**Then**: App renders markdown incrementally
**Then**: Citations show data sources ("Source: HR Database")

### P3 - Write Action Confirmation (Human-in-the-Loop)

**Given**: User asks "Update my PTO balance to 15 days"
**When**: Gateway returns `pending_confirmation` response
**Then**: App shows approval card with action details
**When**: User taps "Approve"
**Then**: App sends confirmation to gateway
**Then**: Gateway executes action and returns success

### P4 - Logout

**Given**: User taps logout
**When**: App clears access token from memory
**When**: App deletes refresh token from keychain
**Then**: User returned to login screen

---

## Success Criteria

### Phase 1: Windows Desktop
- [ ] React Native Windows project initialized
- [ ] OIDC login via system browser works
- [ ] Protocol handler (`com.tamshai.ai://`) activates existing instance
- [ ] Tokens stored in Windows Credential Manager
- [ ] Chat interface renders AI responses
- [ ] SSE streaming works

### Phase 2: macOS Desktop
- [ ] React Native macOS project added to monorepo
- [ ] OIDC login works
- [ ] Tokens stored in macOS Keychain
- [ ] UI adapts to macOS conventions

### Phase 3: Mobile (iOS + Android)
- [ ] Mobile targets added
- [ ] OIDC login works on both platforms
- [ ] Biometric unlock (Face ID, Touch ID, Android fingerprint)
- [ ] Push notifications for approvals

---

## Migration Plan from Electron

### What We Keep
- UI/UX patterns from Electron client
- Chat interface design
- Auth flow logic (PKCE, token refresh)
- API client patterns

### What Changes
- Runtime: Electron → React Native
- Token storage: `safeStorage` → `react-native-keychain`
- Protocol handling: Registry hack → Native UWP
- IPC: Electron IPC → Native bridge

### Directory Structure

```
clients/
├── desktop/              # DEPRECATED Electron client (reference only)
│   ├── src/
│   └── ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md
│
└── unified/              # NEW React Native unified client
    ├── src/
    │   ├── components/   # Shared UI components
    │   ├── screens/      # Screen components
    │   ├── services/     # Auth, API, Storage
    │   ├── stores/       # Zustand stores
    │   └── utils/        # Helpers
    ├── windows/          # Windows-specific native code
    ├── macos/            # macOS-specific native code
    ├── ios/              # iOS-specific native code
    ├── android/          # Android-specific native code
    └── package.json
```

---

## References

- **ADR-004**: `.specify/ARCHITECTURE_SPECS.md` - Platform pivot decision
- **Electron Investigation**: `clients/desktop/ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md`
- **React Native Windows**: https://microsoft.github.io/react-native-windows/
- **React Native macOS**: https://microsoft.github.io/react-native-windows/docs/rnm-getting-started
- **react-native-app-auth**: https://github.com/FormidableLabs/react-native-app-auth
- **react-native-keychain**: https://github.com/oblador/react-native-keychain

---

## Open Questions

1. **UI Framework**: React Native Paper vs NativeWind (Tailwind) - need to evaluate
2. **Monorepo Structure**: Turborepo or Nx for managing shared code?
3. **Testing Strategy**: Detox for E2E, Jest for unit - confirm approach
4. **CI/CD**: GitHub Actions for multi-platform builds

---

*This specification replaces 006-ai-desktop (Electron) and partially supersedes 007-mobile by providing a unified codebase.*
