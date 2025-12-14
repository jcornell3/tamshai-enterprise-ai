# Tamshai AI - Unified Client

React Native unified client for Windows, macOS, iOS, and Android.

This client provides a secure AI assistant interface to enterprise data via the MCP Gateway, supporting SSO authentication and role-based data access.

## Why React Native?

This client replaces the original Electron desktop application due to a fundamental Windows race condition in Electron's single-instance lock (see [ADR-004](../../.specify/ARCHITECTURE_SPECS.md)). React Native for Windows uses native UWP protocol activation, which eliminates this issue entirely.

**Benefits:**
- ~90% code sharing between Windows, macOS, iOS, and Android
- Native protocol handling (no race conditions)
- Native secure token storage per platform
- Unified development experience

## Article V Compliance

This client strictly adheres to Article V of the project constitution:

- **V.1**: No authorization logic in client - backend enforces all access control
- **V.2**: Tokens stored in platform-native secure storage (Keychain/Credential Manager)
- **V.3**: PKCE authentication via system browser

## Project Structure

```
clients/unified/
├── App.tsx                 # Main application component
├── src/
│   ├── components/         # Shared UI components
│   ├── screens/            # Screen components
│   ├── services/           # Auth, API services
│   │   ├── auth.ts         # OIDC/PKCE authentication
│   │   └── api.ts          # MCP Gateway API client
│   ├── stores/             # Zustand state stores
│   │   ├── authStore.ts    # Authentication state
│   │   └── chatStore.ts    # Chat/message state
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Helper utilities
├── ios/                    # iOS native code
├── android/                # Android native code
├── windows/                # Windows native code (after init)
├── macos/                  # macOS native code (after init)
├── WINDOWS_SETUP.md        # Windows development guide
└── MACOS_SETUP.md          # macOS development guide
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Platform-specific requirements (see setup guides)

### Install Dependencies

```bash
npm install
```

### Platform Setup

| Platform | Guide | Status |
|----------|-------|--------|
| Windows | [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) | Ready for init |
| macOS | [MACOS_SETUP.md](./MACOS_SETUP.md) | Ready for init |
| iOS | Standard React Native | Ready |
| Android | Standard React Native | Ready |

### Development

```bash
# Start Metro bundler
npm start

# Run on specific platform
npm run ios
npm run android
npm run windows   # After Windows init
npm run macos     # After macOS init
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `react-native` 0.83.0 | Core framework |
| `react-native-app-auth` | OIDC/PKCE authentication |
| `react-native-keychain` | Platform-native secure storage |
| `zustand` | Lightweight state management |

## Configuration

Create `.env` file for environment-specific configuration:

```env
MCP_GATEWAY_URL=http://localhost:3100
OAUTH_ISSUER=http://localhost:8180/realms/tamshai-corp
OAUTH_CLIENT_ID=mcp-gateway-unified
OAUTH_REDIRECT_URL=com.tamshai.ai://oauth/callback
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              React Native App                        │
│  ┌───────────────────────────────────────────────┐  │
│  │             Shared Code (~90%)                 │  │
│  │  - UI Components (Chat, Login, Settings)      │  │
│  │  - State Management (Zustand stores)          │  │
│  │  - API Client (MCP Gateway calls)             │  │
│  │  - Auth Logic (token refresh, logout)         │  │
│  │  - SSE Streaming (AI responses)               │  │
│  └───────────────────────────────────────────────┘  │
│                         │                            │
│         ┌───────────────┼───────────────┐           │
│         ▼               ▼               ▼           │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐     │
│  │  Windows  │   │   macOS   │   │iOS/Android│     │
│  │  Native   │   │   Native  │   │  Native   │     │
│  │- Keychain │   │- Keychain │   │- Keychain │     │
│  │- UWP Proto│   │- AppKit   │   │- AppAuth  │     │
│  └───────────┘   └───────────┘   └───────────┘     │
└─────────────────────────────────────────────────────┘
                         │
                  HTTPS + JWT
                         ▼
┌─────────────────────────────────────────────────────┐
│                  MCP Gateway                         │
│  - JWT validation                                    │
│  - All authorization logic                           │
│  - Claude API integration                            │
└─────────────────────────────────────────────────────┘
```

## Related Documentation

- [008-unified-client Spec](../../.specify/specs/008-unified-client/spec.md)
- [ADR-004: Platform Pivot](../../.specify/ARCHITECTURE_SPECS.md)
- [Electron Investigation](../desktop/ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md)
- [Project Constitution](../../docs/constitution/CONSTITUTION.md)

## Status

| Feature | Status |
|---------|--------|
| Project scaffolding | ✅ Complete |
| Shared services | ✅ Complete |
| State management | ✅ Complete |
| Windows init | 🔲 Pending (run on Windows) |
| macOS init | 🔲 Pending (run on macOS) |
| OAuth flow | 🔲 Pending |
| Chat interface | 🔲 Pending |
| Approval cards | 🔲 Pending |
