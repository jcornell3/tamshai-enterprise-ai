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

### Required Software

#### Node.js 20+ and npm 10+

**Windows**:
1. Download Node.js from [nodejs.org](https://nodejs.org/)
2. Run the installer (choose LTS version - currently 20.x)
3. Verify installation:
   ```powershell
   node --version   # Should show v20.x.x or higher
   npm --version    # Should show 10.x.x or higher
   ```

**macOS**:
```bash
# Using Homebrew
brew install node@20

# Or download from nodejs.org
```

**Linux**:
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

#### Git

**Windows**:
1. Download Git from [git-scm.com](https://git-scm.com/download/win)
2. Run the installer (accept defaults)
3. Verify installation:
   ```powershell
   git --version   # Should show git version 2.x.x
   ```

**macOS**:
```bash
# Git comes with Xcode Command Line Tools
xcode-select --install

# Or using Homebrew
brew install git
```

**Linux**:
```bash
# Ubuntu/Debian
sudo apt-get install git

# Fedora/RHEL
sudo dnf install git
```

### Backend Services

Running Tamshai backend services (Keycloak, MCP Gateway) are required:

```bash
# From project root
cd infrastructure/docker
docker compose up -d

# Verify services are running
curl http://localhost:8180/health/ready  # Keycloak
curl http://localhost:3100/health        # MCP Gateway
```

## Getting Started

### 1. Clone Repository (Windows)

If you haven't cloned the repository yet:

```powershell
# Open PowerShell or Command Prompt
cd C:\Users\YourUsername\Documents  # Or your preferred location

# Clone the repository
git clone https://github.com/jcornell3/tamshai-enterprise-ai.git

# Navigate to repository
cd tamshai-enterprise-ai
```

### 2. Pull Latest Changes

If you already have the repository, pull the latest changes:

```powershell
cd C:\Users\YourUsername\Documents\tamshai-enterprise-ai
git pull origin main
```

### 3. Install Dependencies

```bash
# Navigate to desktop client
cd clients/desktop

# Install npm packages
npm install
```

**Expected output**:
```
added 500+ packages in 30s
```

**Common issues**:
- `npm: command not found` → Install Node.js (see Prerequisites above)
- `Permission denied` → Run PowerShell as Administrator
- `git: command not found` → Install Git (see Prerequisites above)

## Development

### Starting the Desktop App

**Windows (PowerShell)**:
```powershell
# From clients/desktop directory
npm run dev
```

**macOS/Linux**:
```bash
npm run dev
```

**What happens**:
1. Vite dev server starts for renderer (port 5173)
2. Electron app window opens
3. DevTools enabled for debugging
4. Hot reload on file changes

**Expected console output**:
```
vite v6.4.1 building for development...
✓ built in 823ms

dev server running for the electron renderer process at:
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose

starting electron app...
```

**If the app doesn't open**:
- Check console for errors
- Verify Node.js version: `node --version` (should be 20+)
- Try rebuilding: `npm run build` then `npm run dev`

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

All users have password: `[REDACTED-DEV-PASSWORD]` and TOTP secret: `[REDACTED-DEV-TOTP]`

| Username | Role | Access |
|----------|------|--------|
| eve.thompson | executive | All departments (read) |
| alice.chen | hr-read, hr-write | All employees |
| bob.martinez | finance-read, finance-write | All finance data |

## Troubleshooting

### Prerequisites Not Installed

**Node.js or npm not found**:
```powershell
# Windows: Download and install from nodejs.org
# Download: https://nodejs.org/en/download/

# After installation, verify:
node --version
npm --version
```

**Git not found**:
```powershell
# Windows: Download and install from git-scm.com
# Download: https://git-scm.com/download/win

# After installation, verify:
git --version
```

### Backend Services Not Running

**Error**: "Cannot connect to Keycloak" or "MCP Gateway unreachable"

**Fix**:
```bash
# Navigate to docker directory
cd C:\Users\YourUsername\Documents\tamshai-enterprise-ai\infrastructure\docker

# Start services
docker compose up -d

# Verify Keycloak is ready (may take 30-60 seconds)
curl http://localhost:8180/health/ready

# Verify MCP Gateway
curl http://localhost:3100/health
```

### Deep Linking Not Working

**Windows**:
- Protocol registered automatically on first run of `npm run dev`
- If login redirects don't work, try closing and reopening the app
- Check Windows Registry:
  ```powershell
  reg query HKEY_CURRENT_USER\Software\Classes\tamshai-ai
  ```

**macOS**:
Ensure app is set as default protocol handler
```bash
# Check:
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep tamshai-ai

# Reset if needed:
npm run dev  # Re-registers protocol
```

**Linux**:
Create `.desktop` file for protocol association
```bash
# Create desktop file
cat > ~/.local/share/applications/tamshai-ai.desktop <<EOF
[Desktop Entry]
Name=Tamshai AI
Exec=/path/to/electron/app %u
Type=Application
MimeType=x-scheme-handler/tamshai-ai;
EOF

# Register handler
xdg-mime default tamshai-ai.desktop x-scheme-handler/tamshai-ai
```

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
