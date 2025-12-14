# Plan 007: Mobile AI Assistant Implementation

## Document Information
- **Spec ID**: 007-mobile
- **Plan Version**: 1.0.0
- **Status**: PLANNED
- **Created**: December 12, 2025

---

## 1. Implementation Phases

### Phase 1: Network Infrastructure (Pre-requisite)

Before any mobile development can begin, the network accessibility issues must be resolved.

#### 1.1 Host Discovery Automation

**Goal**: Automatically detect the host machine's LAN IP address for mobile device connectivity.

**Implementation**:
1. Create `scripts/discover-mobile-host.sh` for Linux/WSL2/macOS
2. Create `scripts/discover-mobile-host.ps1` for native Windows
3. Generate `.env.mobile` with discovered IP addresses
4. Update docker-compose to use environment variables for external URLs

**Files**:
- `scripts/discover-mobile-host.sh`
- `scripts/discover-mobile-host.ps1`
- `infrastructure/docker/.env.mobile.example`

#### 1.2 Docker Compose Mobile Override

**Goal**: Create docker-compose override file for mobile-accessible configuration.

**Changes Required**:
```yaml
# docker-compose.mobile.yml
services:
  keycloak:
    environment:
      KC_HOSTNAME: ${TAMSHAI_HOST_IP}
      KC_HOSTNAME_PORT: 8180
      KC_HOSTNAME_STRICT: "false"
      KC_HOSTNAME_STRICT_HTTPS: "false"

  mcp-gateway:
    environment:
      KEYCLOAK_URL: http://${TAMSHAI_HOST_IP}:8180
      KEYCLOAK_ISSUER: http://${TAMSHAI_HOST_IP}:8180/realms/tamshai-corp
      CORS_ORIGINS: "http://${TAMSHAI_HOST_IP}:4000,http://${TAMSHAI_HOST_IP}:4001,http://${TAMSHAI_HOST_IP}:4002,http://${TAMSHAI_HOST_IP}:4003,http://${TAMSHAI_HOST_IP}:4004,com.tamshai.ai://*"
```

**Files**:
- `infrastructure/docker/docker-compose.mobile.yml`

#### 1.3 Windows Firewall Configuration

**Goal**: Allow inbound connections from mobile devices on the local network.

**Required Ports**:
| Port | Service | Required For |
|------|---------|--------------|
| 8180 | Keycloak | OAuth login |
| 8100 | Kong | API Gateway (optional) |
| 3100 | MCP Gateway | AI queries |

**Implementation**:
1. Create PowerShell script to add firewall rules
2. Create PowerShell script to remove rules (cleanup)
3. Document manual steps for users without admin access

**Files**:
- `scripts/windows/setup-mobile-firewall.ps1`
- `scripts/windows/remove-mobile-firewall.ps1`
- `docs/development/mobile-network-setup.md`

#### 1.4 WSL2 Port Forwarding

**Goal**: Forward ports from Windows host to WSL2 guest for mobile access.

**Challenge**: WSL2 uses NAT networking with a virtual adapter. Ports exposed in WSL2 are not automatically accessible from other devices on the network.

**Solution**:
1. Use `netsh interface portproxy` to forward Windows ports to WSL2
2. Script must run after every WSL2 restart (IP changes)
3. Consider adding to Windows Task Scheduler for automation

**Implementation**:
```powershell
# Get WSL2 IP
$wslIp = (wsl hostname -I).Trim().Split()[0]

# Forward each port
netsh interface portproxy add v4tov4 `
    listenport=8180 listenaddress=0.0.0.0 `
    connectport=8180 connectaddress=$wslIp
```

**Files**:
- `scripts/windows/setup-wsl-portforward.ps1`
- `scripts/windows/show-wsl-portforward.ps1`
- `scripts/windows/clear-wsl-portforward.ps1`

#### 1.5 Keycloak Mobile Client

**Goal**: Configure Keycloak with mobile-specific OAuth client.

**Client Configuration**:
- Client ID: `mcp-gateway-mobile`
- Client Type: Public (no secret)
- PKCE Required: S256
- Redirect URIs: `com.tamshai.ai://oauth/callback`
- Web Origins: `com.tamshai.ai`

**Implementation Options**:
1. Add to `keycloak/realm-export.json` (requires realm reimport)
2. Create via Keycloak Admin API script
3. Manual configuration via Keycloak Admin Console

**Recommended**: Admin API script for repeatability

**Files**:
- `scripts/keycloak/create-mobile-client.sh`
- `keycloak/mobile-client.json`

---

### Phase 2: React Native Project Setup

#### 2.1 Initialize Project

**Goal**: Create React Native project with TypeScript and required dependencies.

**Commands**:
```bash
npx react-native init TamshaiAI --template react-native-template-typescript
cd TamshaiAI
```

**Directory**: `clients/mobile/`

#### 2.2 Core Dependencies

**Authentication**:
```bash
npm install react-native-app-auth
npm install react-native-keychain
```

**Navigation**:
```bash
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
```

**Configuration**:
```bash
npm install react-native-config
```

**State Management**:
```bash
npm install zustand
```

**UI Components**:
```bash
npm install react-native-paper react-native-vector-icons
```

#### 2.3 iOS Configuration

**Info.plist Updates**:
- Add URL scheme: `com.tamshai.ai`
- Add App Transport Security exceptions for development
- Configure Keychain sharing

**Podfile**:
```ruby
# ios/Podfile
pod 'RNAppAuth', :path => '../node_modules/react-native-app-auth'
pod 'RNKeychain', :path => '../node_modules/react-native-keychain'
```

#### 2.4 Android Configuration

**AndroidManifest.xml**:
```xml
<!-- Deep link handling -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.tamshai.ai" />
</intent-filter>
```

**build.gradle**:
- Configure manifestPlaceholders for app auth
- Enable Hermes for better performance

---

### Phase 3: Authentication Implementation

#### 3.1 OIDC Service

**Goal**: Implement OIDC PKCE authentication using system browser.

**Key Functions**:
- `login()`: Initiate OAuth flow
- `logout()`: Clear tokens and revoke
- `refreshToken()`: Silent token refresh
- `getAccessToken()`: Retrieve current valid token

**Files**:
- `src/services/auth.service.ts`
- `src/config/auth.ts`

#### 3.2 Secure Token Storage

**Goal**: Store tokens in platform-specific secure storage.

**Implementation**:
```typescript
import * as Keychain from 'react-native-keychain';

const SERVICE_NAME = 'com.tamshai.ai';

export async function storeTokens(tokens: AuthTokens): Promise<void> {
  await Keychain.setGenericPassword(
    'auth_tokens',
    JSON.stringify(tokens),
    {
      service: SERVICE_NAME,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }
  );
}

export async function getTokens(): Promise<AuthTokens | null> {
  const credentials = await Keychain.getGenericPassword({ service: SERVICE_NAME });
  if (!credentials) return null;
  return JSON.parse(credentials.password);
}

export async function clearTokens(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE_NAME });
}
```

**Files**:
- `src/services/token-storage.ts`

#### 3.3 Auth Context & Hook

**Goal**: Provide authentication state to entire app.

**Features**:
- Current user info
- Authentication status
- Login/logout actions
- Automatic token refresh

**Files**:
- `src/contexts/AuthContext.tsx`
- `src/hooks/useAuth.ts`

---

### Phase 4: API & SSE Integration

#### 4.1 API Client

**Goal**: Authenticated HTTP client for MCP Gateway.

**Features**:
- Automatic token injection
- Response type handling
- Error normalization

**Files**:
- `src/services/api.service.ts`
- `src/types/api.ts`

#### 4.2 SSE Streaming Client

**Goal**: Real-time streaming for AI queries.

**Implementation**: Custom fetch-based reader (React Native lacks EventSource)

**Features**:
- Chunked response parsing
- `[DONE]` signal handling
- Abort capability
- Error recovery

**Files**:
- `src/services/sse.service.ts`
- `src/hooks/useSSE.ts`

#### 4.3 Query Hook

**Goal**: High-level hook for AI queries.

**Features**:
- Streaming state management
- Message accumulation
- Loading/error states
- Pagination cursor handling

**Files**:
- `src/hooks/useQuery.ts`

---

### Phase 5: UI Implementation

#### 5.1 Navigation Structure

```
App
├── AuthNavigator (unauthenticated)
│   └── LoginScreen
└── MainNavigator (authenticated)
    ├── HomeScreen (tabs)
    │   ├── QueryTab
    │   ├── HRTab
    │   ├── FinanceTab
    │   ├── SalesTab
    │   └── SupportTab
    └── SettingsScreen
```

**Files**:
- `src/navigation/AppNavigator.tsx`
- `src/navigation/AuthNavigator.tsx`
- `src/navigation/MainNavigator.tsx`

#### 5.2 Core Screens

**LoginScreen**:
- Company branding
- "Sign in with SSO" button
- Loading state during OAuth

**HomeScreen**:
- Tab navigation to domain screens
- Quick query input
- User profile summary

**QueryScreen**:
- Full-screen query interface
- Streaming response display
- Pagination controls
- Confirmation cards

**Files**:
- `src/screens/LoginScreen.tsx`
- `src/screens/HomeScreen.tsx`
- `src/screens/QueryScreen.tsx`
- `src/screens/HRScreen.tsx`
- `src/screens/FinanceScreen.tsx`
- `src/screens/SalesScreen.tsx`
- `src/screens/SupportScreen.tsx`

#### 5.3 Reusable Components

**QueryInput**: Text input with send button
**StreamingResponse**: Animated text display for SSE
**ApprovalCard**: Confirmation UI for write operations
**TruncationWarning**: Alert for paginated results
**DataTable**: Scrollable data display
**ErrorBoundary**: Graceful error handling

**Files**:
- `src/components/QueryInput.tsx`
- `src/components/StreamingResponse.tsx`
- `src/components/ApprovalCard.tsx`
- `src/components/TruncationWarning.tsx`
- `src/components/DataTable.tsx`
- `src/components/ErrorBoundary.tsx`

---

### Phase 6: Testing & Documentation

#### 6.1 Testing Strategy

**Unit Tests**:
- Token storage functions
- SSE message parsing
- API client error handling

**Integration Tests**:
- OAuth flow (mocked)
- API calls with mock server
- Navigation flows

**E2E Tests** (Detox):
- Login flow
- Query submission
- Response rendering

**Files**:
- `__tests__/services/auth.test.ts`
- `__tests__/services/sse.test.ts`
- `e2e/login.test.ts`
- `e2e/query.test.ts`

#### 6.2 Documentation

**Files**:
- `clients/mobile/README.md` - Setup instructions
- `docs/development/mobile-network-setup.md` - Network configuration
- `docs/development/mobile-testing.md` - Testing guide

---

## 2. File Inventory

### Infrastructure Scripts
| File | Purpose | Phase |
|------|---------|-------|
| `scripts/discover-mobile-host.sh` | Linux/WSL host discovery | 1.1 |
| `scripts/discover-mobile-host.ps1` | Windows host discovery | 1.1 |
| `scripts/windows/setup-mobile-firewall.ps1` | Add firewall rules | 1.3 |
| `scripts/windows/remove-mobile-firewall.ps1` | Remove firewall rules | 1.3 |
| `scripts/windows/setup-wsl-portforward.ps1` | WSL2 port forwarding | 1.4 |
| `scripts/windows/clear-wsl-portforward.ps1` | Clear port forwards | 1.4 |
| `scripts/keycloak/create-mobile-client.sh` | Create Keycloak client | 1.5 |
| `infrastructure/docker/docker-compose.mobile.yml` | Mobile override | 1.2 |

### React Native Application
| File | Purpose | Phase |
|------|---------|-------|
| `clients/mobile/package.json` | Dependencies | 2.1 |
| `clients/mobile/src/config/env.ts` | Environment config | 2.2 |
| `clients/mobile/src/config/auth.ts` | OIDC config | 3.1 |
| `clients/mobile/src/services/auth.service.ts` | Auth functions | 3.1 |
| `clients/mobile/src/services/token-storage.ts` | Secure storage | 3.2 |
| `clients/mobile/src/services/api.service.ts` | API client | 4.1 |
| `clients/mobile/src/services/sse.service.ts` | SSE streaming | 4.2 |
| `clients/mobile/src/hooks/useAuth.ts` | Auth hook | 3.3 |
| `clients/mobile/src/hooks/useQuery.ts` | Query hook | 4.3 |
| `clients/mobile/src/navigation/*.tsx` | Navigation | 5.1 |
| `clients/mobile/src/screens/*.tsx` | Screens | 5.2 |
| `clients/mobile/src/components/*.tsx` | Components | 5.3 |

### Documentation
| File | Purpose | Phase |
|------|---------|-------|
| `docs/development/mobile-network-setup.md` | Network guide | 1 |
| `docs/development/mobile-testing.md` | Testing guide | 6 |
| `clients/mobile/README.md` | Project readme | 6 |

---

## 3. Estimated Effort

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Network Infrastructure | 2-3 days |
| 2 | React Native Setup | 1 day |
| 3 | Authentication | 2-3 days |
| 4 | API & SSE | 2 days |
| 5 | UI Implementation | 3-4 days |
| 6 | Testing & Docs | 2 days |

**Total**: 12-15 days (~2.5-3 weeks)

---

## 4. Dependencies & Sequencing

```
Phase 1: Network Infrastructure
    ├── 1.1 Host Discovery
    ├── 1.2 Docker Compose Override (depends on 1.1)
    ├── 1.3 Firewall Configuration
    ├── 1.4 WSL2 Port Forwarding (depends on 1.3)
    └── 1.5 Keycloak Mobile Client

Phase 2: React Native Setup (parallel with Phase 1)
    ├── 2.1 Initialize Project
    ├── 2.2 Dependencies
    ├── 2.3 iOS Config (depends on 2.2)
    └── 2.4 Android Config (depends on 2.2)

Phase 3: Authentication (depends on Phase 1 & 2)
    ├── 3.1 OIDC Service
    ├── 3.2 Token Storage
    └── 3.3 Auth Context (depends on 3.1, 3.2)

Phase 4: API & SSE (depends on Phase 3)
    ├── 4.1 API Client
    ├── 4.2 SSE Client
    └── 4.3 Query Hook (depends on 4.1, 4.2)

Phase 5: UI (depends on Phase 3, 4)
    ├── 5.1 Navigation
    ├── 5.2 Screens (depends on 5.1)
    └── 5.3 Components

Phase 6: Testing & Docs (parallel with Phase 5)
```

---

## 5. Risk Mitigation

### Network Issues
- **Risk**: WSL2 port forwarding unreliable after restart
- **Mitigation**: Add startup script to Task Scheduler, document manual recovery

### Authentication Complexity
- **Risk**: react-native-app-auth platform-specific bugs
- **Mitigation**: Test early on both platforms, have fallback WebView approach

### SSE Compatibility
- **Risk**: Custom SSE implementation may have edge cases
- **Mitigation**: Port working Web implementation, extensive testing

---

## 6. Verification Checkpoints

### After Phase 1
- [ ] Mobile device can ping host IP
- [ ] Mobile browser can load http://{HOST_IP}:8180
- [ ] Keycloak mobile client exists and is configured

### After Phase 3
- [ ] OAuth login works on iOS simulator
- [ ] OAuth login works on Android emulator
- [ ] Tokens persist across app restart
- [ ] Token refresh works

### After Phase 5
- [ ] Full query flow works end-to-end
- [ ] Streaming response renders correctly
- [ ] Confirmation cards appear for write operations

### After Phase 6
- [ ] All tests pass
- [ ] Documentation complete
- [ ] Works on physical iOS device
- [ ] Works on physical Android device

---

*Last Updated*: December 12, 2025
*Plan Version*: 1.0.0
