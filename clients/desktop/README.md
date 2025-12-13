# Tamshai AI Desktop Client

Cross-platform desktop application for Tamshai Enterprise AI Access System, built with Electron and React.

## Architecture v1.4 Features

✅ **Phase 1 Complete** - Electron Foundation
- [x] Secure window creation with CSP and context isolation
- [x] OIDC PKCE authentication with deep linking (`tamshai-ai://`)
- [x] Secure token storage via OS keychain (safeStorage API)
- [x] IPC bridge for main/renderer communication
- [x] Basic login flow and placeholder chat UI

⏭️ **Next**: Phase 3 (Chat UI), Phase 4 (SSE Streaming), Phase 5 (Approval Cards)

## Project Structure

```
clients/desktop/
├── src/
│   ├── main/              # Main process (Node.js)
│   │   ├── index.ts       # App entry, window creation, deep linking
│   │   ├── auth.ts        # OIDC authentication service
│   │   └── storage.ts     # Secure token storage
│   ├── preload/
│   │   └── index.ts       # IPC bridge (contextBridge)
│   └── renderer/          # Renderer process (React)
│       ├── index.html
│       └── src/
│           ├── main.tsx   # React entry point
│           ├── App.tsx    # Main app component
│           └── components/
│               ├── LoginScreen.tsx
│               └── ChatWindow.tsx
├── package.json
├── electron.vite.config.ts
└── tsconfig.json
```

## Prerequisites

- Node.js 20+
- npm 10+
- Running Tamshai backend services (Keycloak, MCP Gateway)

## Installation

```bash
cd clients/desktop
npm install
```

## Development

**Start development mode with hot reload:**

```bash
npm run dev
```

This will:
1. Start Vite dev server for renderer (port 5173)
2. Launch Electron with DevTools enabled
3. Watch for file changes and reload automatically

**Build TypeScript:**

```bash
npm run build
```

**Type check only:**

```bash
npm run typecheck
```

**Lint code:**

```bash
npm run lint
```

## Production Build

**Package for current platform:**

```bash
npm run package
```

**Platform-specific builds:**

```bash
npm run package:win    # Windows (NSIS installer + portable)
npm run package:mac    # macOS (DMG + ZIP)
npm run package:linux  # Linux (AppImage + DEB)
```

Output: `dist-electron/`

## Authentication Flow

1. User clicks "Sign in with SSO" on login screen
2. App opens system browser with Keycloak login page
3. User authenticates (username/password + TOTP)
4. Keycloak redirects to `tamshai-ai://oauth/callback?code=...`
5. OS deep link handler passes URL to Electron app
6. App exchanges authorization code for tokens (PKCE)
7. Tokens encrypted and stored in OS keychain via safeStorage API
8. Chat window displays with authenticated user

## Security Features

### Main Process Security
- **CSP (Content Security Policy)**: Restricts script execution and external resources
- **Context Isolation**: Preload script runs in isolated context
- **Sandbox Mode**: Renderer process sandboxed from OS
- **Navigation Guards**: Prevents unauthorized navigation to external sites

### Token Storage Security
- **macOS**: Keychain Access with app-specific access
- **Windows**: Data Protection API (DPAPI)
- **Linux**: Secret Service API (libsecret)
- **Encryption**: All tokens encrypted at rest

### IPC Security
- **Whitelisted APIs**: Only explicit functions exposed via contextBridge
- **No nodeIntegration**: Renderer cannot access Node.js/Electron directly
- **Validation**: All IPC handlers validate inputs

## Environment Variables

Create `.env` file (optional):

```bash
KEYCLOAK_URL=http://localhost:8180
MCP_GATEWAY_URL=http://localhost:3100
NODE_ENV=development
```

Defaults are pre-configured for local development.

## Test Users

All users have password: `password123` and TOTP secret: `JBSWY3DPEHPK3PXP`

| Username | Role | Access |
|----------|------|--------|
| eve.thompson | executive | All departments (read) |
| alice.chen | hr-read, hr-write | All employees |
| bob.martinez | finance-read, finance-write | All finance data |

## Troubleshooting

### Deep Linking Not Working

**macOS**: Ensure app is set as default protocol handler
```bash
# Check:
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep tamshai-ai

# Reset if needed:
npm run dev  # Re-registers protocol
```

**Windows**: Protocol registered automatically on first run

**Linux**: Create `.desktop` file for protocol association

### Token Decryption Fails

If tokens fail to decrypt after OS update:
1. Quit app completely
2. Delete `~/Library/Application Support/tamshai-ai-desktop/tokens.enc` (macOS)
3. Restart app and re-login

### Keycloak Connection Issues

Ensure backend services are running:
```bash
cd infrastructure/docker
docker compose ps
curl http://localhost:8180/health/ready
```

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Electron Foundation | ✅ Complete | Security, auth, storage |
| 2. Authentication | ✅ Complete | OIDC PKCE with deep linking |
| 3. Chat UI | ⏭️ Planned | Message display, input |
| 4. SSE Streaming | ⏭️ Planned | Real-time AI responses |
| 5. Approval Cards | ⏭️ Planned | Human-in-the-loop confirmations |
| 6. Truncation Warnings | ⏭️ Planned | Pagination alerts |
| 7. Platform Packaging | ⏭️ Planned | Code signing, auto-updates |

## Security Updates

**Last Security Audit**: December 12, 2025
**Vulnerabilities**: 0 found

### Recent Updates (December 2025)

All npm security vulnerabilities have been resolved:

| Package | Updated From | Updated To | Severity Fixed |
|---------|--------------|------------|----------------|
| electron | 28.0.0 | 35.7.5 | Moderate (ASAR Integrity Bypass) |
| electron-vite | 2.0.0 | 5.0.0 | Moderate (transitive) |
| vite | 5.0.0 | 6.1.7 | Moderate (esbuild vulnerability) |

**Verification**:
```bash
npm audit  # 0 vulnerabilities
npm run typecheck  # 0 errors
npm run build  # Success (builds in ~910ms)
```

See [SECURITY_UPDATE.md](./SECURITY_UPDATE.md) for detailed update information.

## Testing

Comprehensive testing documentation available:

- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Manual test scenarios and procedures
- [TEST_RESULTS.md](./TEST_RESULTS.md) - Automated verification results

**Test Environment Status**: ✅ Ready for manual testing

**Automated Tests**: 10/10 passed
- Backend services: All healthy
- Keycloak mobile client: Created and verified
- Desktop build: TypeScript compilation and production build successful
- File integrity: All source files verified

**Manual Tests**: Pending (requires native Windows/Linux for OAuth deep linking)

## Related Documentation

- [Implementation Plan](../../.claude/plans/wild-snuggling-sunset.md)
- [Architecture Overview](../../docs/architecture/overview.md)
- [CLAUDE.md Development Guide](../../CLAUDE.md)
- [Spec 006: AI Desktop Client](../../.specify/specs/006-ai-desktop/)

## License

UNLICENSED - Internal Tamshai Corp use only
