# Tasks 007: Mobile AI Assistant

## Document Information
- **Spec ID**: 007-mobile
- **Tasks Version**: 1.0.0
- **Status**: PLANNED
- **Created**: December 12, 2025
- **Total Tasks**: 67

---

## Phase 1: Network Infrastructure

### 1.1 Host Discovery Scripts

- [ ] **TASK-001**: Create `scripts/discover-mobile-host.sh` for Linux/WSL2/macOS
  - Detect primary network interface IP
  - Handle WSL2 vs native Linux detection
  - Generate `.env.mobile` with discovered IP
  - Output next steps for user

- [ ] **TASK-002**: Create `scripts/discover-mobile-host.ps1` for native Windows
  - Use `Get-NetIPAddress` to find LAN IP
  - Filter for private network ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  - Generate `.env.mobile` file
  - Output instructions

- [ ] **TASK-003**: Create `.env.mobile.example` template
  - Document all required variables
  - Include comments explaining each setting
  - Provide example values

### 1.2 Docker Compose Mobile Configuration

- [ ] **TASK-004**: Create `infrastructure/docker/docker-compose.mobile.yml`
  - Override Keycloak KC_HOSTNAME to use `${TAMSHAI_HOST_IP}`
  - Override MCP Gateway KEYCLOAK_URL and KEYCLOAK_ISSUER
  - Add CORS_ORIGINS with mobile app scheme
  - Document merge order with base compose file

- [ ] **TASK-005**: Update MCP Gateway to accept dynamic CORS origins
  - Parse CORS_ORIGINS environment variable
  - Support comma-separated list of origins
  - Support wildcard patterns for app schemes
  - Test with `com.tamshai.ai://*` pattern

- [ ] **TASK-006**: Create startup script `scripts/start-mobile-dev.sh`
  - Run host discovery
  - Source `.env.mobile`
  - Start docker compose with override file
  - Display connection URLs for mobile

### 1.3 Windows Firewall Configuration

- [ ] **TASK-007**: Create `scripts/windows/setup-mobile-firewall.ps1`
  - Check for Administrator privileges
  - Define required ports array (8180, 8100, 3100)
  - Remove existing Tamshai rules (idempotent)
  - Create inbound TCP rules for each port
  - Restrict to Private/Domain profiles
  - Output success message with port list

- [ ] **TASK-008**: Create `scripts/windows/remove-mobile-firewall.ps1`
  - Check for Administrator privileges
  - Find all Tamshai-Mobile-Dev rules
  - Remove each rule
  - Confirm removal

- [ ] **TASK-009**: Create `scripts/windows/check-mobile-firewall.ps1`
  - List all Tamshai firewall rules
  - Show port, profile, and status
  - Indicate if rules are missing

### 1.4 WSL2 Port Forwarding

- [ ] **TASK-010**: Create `scripts/windows/setup-wsl-portforward.ps1`
  - Get WSL2 IP via `wsl hostname -I`
  - Define required ports array
  - Clear existing port proxies for these ports
  - Add v4tov4 port proxy for each port
  - Output current forwarding status

- [ ] **TASK-011**: Create `scripts/windows/clear-wsl-portforward.ps1`
  - Remove all Tamshai-related port proxies
  - Show cleared ports

- [ ] **TASK-012**: Create `scripts/windows/show-wsl-portforward.ps1`
  - Display current port proxy configuration
  - Show WSL2 IP address
  - Indicate connection status

- [ ] **TASK-013**: Document WSL2 IP change handling
  - Explain that WSL2 IP changes on restart
  - Provide instructions for re-running script
  - Optional: Task Scheduler automation instructions

### 1.5 Keycloak Mobile Client

- [ ] **TASK-014**: Create `keycloak/mobile-client.json` client definition
  - Client ID: `mcp-gateway-mobile`
  - Public client (no secret)
  - PKCE required (S256)
  - Redirect URIs: `com.tamshai.ai://oauth/callback`
  - Web origins: `com.tamshai.ai`

- [ ] **TASK-015**: Create `scripts/keycloak/create-mobile-client.sh`
  - Authenticate with Keycloak Admin API
  - Check if client already exists
  - Create client from JSON definition
  - Output success or already-exists message

- [ ] **TASK-016**: Update `keycloak/realm-export.json` with mobile client
  - Add mobile client to clients array
  - Ensure PKCE configuration
  - Test realm reimport

### 1.6 Documentation

- [ ] **TASK-017**: Create `docs/development/mobile-network-setup.md`
  - Overview of network requirements
  - Step-by-step Windows setup (firewall + WSL2)
  - Step-by-step macOS setup
  - Step-by-step Linux setup
  - Troubleshooting section
  - Verification commands

---

## Phase 2: React Native Project Setup

### 2.1 Project Initialization

- [ ] **TASK-018**: Initialize React Native project
  - Run `npx react-native init TamshaiAI --template react-native-template-typescript`
  - Move to `clients/mobile/`
  - Verify iOS and Android build

- [ ] **TASK-019**: Configure TypeScript
  - Update `tsconfig.json` with strict settings
  - Add path aliases for `@/` prefix
  - Configure module resolution

- [ ] **TASK-020**: Configure ESLint and Prettier
  - Add `.eslintrc.js` with React Native rules
  - Add `.prettierrc`
  - Add lint scripts to package.json

### 2.2 Dependencies Installation

- [ ] **TASK-021**: Install authentication dependencies
  ```bash
  npm install react-native-app-auth react-native-keychain
  ```
  - Link native modules
  - Verify pod install (iOS)

- [ ] **TASK-022**: Install navigation dependencies
  ```bash
  npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
  npm install react-native-screens react-native-safe-area-context
  ```
  - Configure react-native-screens

- [ ] **TASK-023**: Install configuration dependencies
  ```bash
  npm install react-native-config
  ```
  - Create `.env` file
  - Configure native builds to read env

- [ ] **TASK-024**: Install state management
  ```bash
  npm install zustand
  ```

- [ ] **TASK-025**: Install UI dependencies
  ```bash
  npm install react-native-paper react-native-vector-icons
  ```
  - Link vector icons
  - Configure fonts

### 2.3 iOS Configuration

- [ ] **TASK-026**: Configure iOS URL scheme
  - Add `com.tamshai.ai` to Info.plist URL types
  - Configure AppDelegate for deep links

- [ ] **TASK-027**: Configure iOS App Transport Security
  - Add development server exceptions
  - Document production ATS requirements

- [ ] **TASK-028**: Configure iOS Keychain
  - Enable Keychain Sharing capability
  - Set access group if needed

- [ ] **TASK-029**: Run pod install and verify iOS build
  - `cd ios && pod install`
  - Build in Xcode
  - Test on simulator

### 2.4 Android Configuration

- [ ] **TASK-030**: Configure Android deep links
  - Add intent filter to AndroidManifest.xml
  - Configure `com.tamshai.ai` scheme

- [ ] **TASK-031**: Configure Android build.gradle
  - Add manifestPlaceholders for app auth
  - Enable Hermes
  - Configure signing for debug

- [ ] **TASK-032**: Configure react-native-config for Android
  - Add to build.gradle
  - Create `.env` file
  - Verify env variables accessible

- [ ] **TASK-033**: Verify Android build
  - Build debug APK
  - Test on emulator

---

## Phase 3: Authentication Implementation

### 3.1 Configuration

- [ ] **TASK-034**: Create `src/config/env.ts`
  - Export environment variables
  - Provide defaults for development
  - Type definitions for config

- [ ] **TASK-035**: Create `src/config/auth.ts`
  - OIDC configuration for react-native-app-auth
  - Keycloak endpoints
  - Scopes and redirect URIs

### 3.2 Token Storage

- [ ] **TASK-036**: Create `src/services/token-storage.ts`
  - `storeTokens(tokens)` - Save to Keychain
  - `getTokens()` - Retrieve from Keychain
  - `clearTokens()` - Remove from Keychain
  - `hasTokens()` - Check if tokens exist

- [ ] **TASK-037**: Create `src/types/auth.ts`
  - `AuthTokens` interface
  - `UserInfo` interface
  - `AuthState` interface

### 3.3 Auth Service

- [ ] **TASK-038**: Create `src/services/auth.service.ts`
  - `login()` - Initiate OIDC PKCE flow
  - `logout()` - Clear tokens, end session
  - `refreshTokens()` - Silent refresh
  - `getAccessToken()` - Get valid token (refresh if needed)
  - `getUserInfo()` - Decode token claims

- [ ] **TASK-039**: Implement token refresh logic
  - Check token expiration
  - Refresh before expiry (buffer time)
  - Handle refresh failure (force re-login)

### 3.4 Auth Context

- [ ] **TASK-040**: Create `src/contexts/AuthContext.tsx`
  - AuthProvider component
  - Auth state (user, isAuthenticated, isLoading)
  - Auth actions (login, logout)
  - Auto-restore session on app start

- [ ] **TASK-041**: Create `src/hooks/useAuth.ts`
  - Convenience hook for auth context
  - Type-safe access to auth state and actions

- [ ] **TASK-042**: Test authentication flow
  - Test login on iOS simulator
  - Test login on Android emulator
  - Verify token storage
  - Test token refresh
  - Test logout

---

## Phase 4: API & SSE Integration

### 4.1 API Client

- [ ] **TASK-043**: Create `src/types/api.ts`
  - `MCPToolResponse` type
  - `SuccessResponse` type
  - `ErrorResponse` type
  - `PendingConfirmationResponse` type

- [ ] **TASK-044**: Create `src/services/api.service.ts`
  - `apiClient` with token injection
  - `get()`, `post()` methods
  - Error handling and normalization
  - Base URL from config

- [ ] **TASK-045**: Create MCP tool API functions
  - `listEmployees(cursor?)`
  - `getEmployee(id)`
  - `listInvoices(cursor?)`
  - `listOpportunities(cursor?)`
  - `searchTickets(query, cursor?)`

### 4.2 SSE Streaming

- [ ] **TASK-046**: Create `src/services/sse.service.ts`
  - `streamQuery(query, onMessage, onDone, onError)`
  - Fetch-based SSE implementation
  - Chunked response parsing
  - `[DONE]` signal handling
  - Abort controller for cancellation

- [ ] **TASK-047**: Create `src/types/sse.ts`
  - `SSEMessage` type
  - `SSETextMessage` type
  - `SSEPaginationMessage` type
  - `SSEErrorMessage` type

- [ ] **TASK-048**: Test SSE streaming
  - Test query with streaming response
  - Verify real-time text rendering
  - Test abort/cancel
  - Test error handling

### 4.3 Query Hook

- [ ] **TASK-049**: Create `src/hooks/useQuery.ts`
  - Query state (loading, streaming, complete, error)
  - Message accumulation
  - Pagination cursor handling
  - Abort function
  - Reset function

- [ ] **TASK-050**: Create `src/stores/queryStore.ts` (Zustand)
  - Query history
  - Current conversation
  - Persist recent queries

---

## Phase 5: UI Implementation

### 5.1 Navigation

- [ ] **TASK-051**: Create `src/navigation/AppNavigator.tsx`
  - Root navigator
  - Switch between Auth and Main navigators
  - Handle deep links

- [ ] **TASK-052**: Create `src/navigation/AuthNavigator.tsx`
  - Login screen stack
  - Handle OAuth callback

- [ ] **TASK-053**: Create `src/navigation/MainNavigator.tsx`
  - Bottom tab navigator
  - Query, HR, Finance, Sales, Support tabs
  - Settings stack

### 5.2 Screens

- [ ] **TASK-054**: Create `src/screens/LoginScreen.tsx`
  - Company logo/branding
  - "Sign in with SSO" button
  - Loading state
  - Error display

- [ ] **TASK-055**: Create `src/screens/HomeScreen.tsx`
  - Welcome message with user name
  - Quick query input
  - Recent queries list
  - Navigation to domain screens

- [ ] **TASK-056**: Create `src/screens/QueryScreen.tsx`
  - Full query interface
  - StreamingResponse component
  - Query input at bottom
  - Scroll to bottom on new content

- [ ] **TASK-057**: Create `src/screens/HRScreen.tsx`
  - Employee list with pagination
  - Search/filter
  - Employee detail view
  - AI query integration

- [ ] **TASK-058**: Create `src/screens/FinanceScreen.tsx`
  - Invoice list with pagination
  - Budget overview
  - AI query integration

- [ ] **TASK-059**: Create `src/screens/SalesScreen.tsx`
  - Opportunities pipeline
  - Customer list
  - AI query integration

- [ ] **TASK-060**: Create `src/screens/SupportScreen.tsx`
  - Ticket search
  - Knowledge base search
  - AI query integration

### 5.3 Components

- [ ] **TASK-061**: Create `src/components/QueryInput.tsx`
  - Text input with send button
  - Multi-line support
  - Disabled state during streaming
  - Keyboard avoiding view

- [ ] **TASK-062**: Create `src/components/StreamingResponse.tsx`
  - Animated text appearance
  - Markdown rendering
  - Code block styling
  - Copy to clipboard

- [ ] **TASK-063**: Create `src/components/ApprovalCard.tsx`
  - Confirmation message display
  - Approve/Reject buttons
  - Loading state during confirmation
  - Success/error feedback

- [ ] **TASK-064**: Create `src/components/TruncationWarning.tsx`
  - Alert banner for paginated results
  - "Load more" button
  - Count display (showing X of Y+)

- [ ] **TASK-065**: Create `src/components/DataTable.tsx`
  - Scrollable data rows
  - Column headers
  - Row selection
  - Pull to refresh

---

## Phase 6: Testing & Documentation

### 6.1 Testing

- [ ] **TASK-066**: Create unit tests
  - `__tests__/services/token-storage.test.ts`
  - `__tests__/services/auth.test.ts`
  - `__tests__/services/sse.test.ts`
  - `__tests__/hooks/useQuery.test.ts`

- [ ] **TASK-067**: Create E2E tests (Detox)
  - `e2e/login.test.ts` - OAuth flow
  - `e2e/query.test.ts` - AI query submission
  - `e2e/navigation.test.ts` - Tab navigation

### 6.2 Documentation

- [ ] **TASK-068**: Create `clients/mobile/README.md`
  - Project overview
  - Setup instructions
  - Running on device
  - Environment configuration
  - Troubleshooting

- [ ] **TASK-069**: Create `docs/development/mobile-testing.md`
  - Testing strategy
  - Running unit tests
  - Running E2E tests
  - Physical device testing

---

## Task Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Network Infrastructure | 17 | Pending |
| 2. React Native Setup | 16 | Pending |
| 3. Authentication | 9 | Pending |
| 4. API & SSE | 8 | Pending |
| 5. UI Implementation | 15 | Pending |
| 6. Testing & Docs | 4 | Pending |
| **Total** | **69** | **0% Complete** |

---

## Verification Milestones

### Milestone 1: Network Ready
After Phase 1, verify:
- [ ] Mobile device can load Keycloak login page via host IP
- [ ] Firewall rules in place (Windows)
- [ ] WSL2 port forwarding works (if applicable)

### Milestone 2: Auth Working
After Phase 3, verify:
- [ ] OAuth login completes on iOS
- [ ] OAuth login completes on Android
- [ ] Tokens stored securely
- [ ] Token refresh works

### Milestone 3: Queries Working
After Phase 4, verify:
- [ ] SSE streaming renders in real-time
- [ ] Pagination cursors work
- [ ] Error handling displays correctly

### Milestone 4: App Complete
After Phase 5, verify:
- [ ] All screens navigate correctly
- [ ] Data displays from all MCP servers
- [ ] Confirmation flow works
- [ ] App works on physical devices

---

*Last Updated*: December 12, 2025
*Tasks Version*: 1.0.0
