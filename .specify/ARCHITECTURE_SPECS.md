# Tamshai Enterprise AI - Specification-Driven Development (SDD) Architecture

**Lead Architect**: John Cornell
**Architecture Version**: 1.4 (ADR-004 Platform Pivot)
**SDD Framework**: GitHub Spec Kit
**Last Updated**: December 26, 2025

---

## Executive Summary

This document formalizes the Tamshai Enterprise AI architecture using Specification-Driven Development (SDD). All six core specifications (001-006) are defined, with specs 001-004 representing **implemented foundation** and specs 005-006 representing **planned frontend development**.

## Constitutional Governance

All specifications must comply with the **Tamshai Enterprise AI Constitution** (v1.0.0):

📜 **Constitution Location**: [`docs/architecture/constitution.md`](../docs/architecture/constitution.md)

### Constitutional Articles Summary

| Article | Focus | Key Mandates |
|---------|-------|--------------|
| **I: Security & Zero Trust** | Data security | RLS required, Fail Secure, PII masking, No secrets in code |
| **II: MCP Standard** | AI integration | Tool atomicity, Stateless tools, Structured errors |
| **III: Testing** | Quality assurance | RBAC verification, Context limits (max 50 records) |
| **IV: Infrastructure** | Platform consistency | Container native, TypeScript strict mode |
| **V: Client-Side Security** | Frontend security | **No logic in client**, Secure token storage, PKCE only |

**Critical for Frontend (Specs 005-006)**: Article V mandates that authorization logic MUST happen at the API/MCP layer, not in React/Electron clients.

---

## Specification Inventory

### Foundation & Backend (Implemented ✓)

#### 001-foundation: Infrastructure & Identity
**Status**: COMPLETED ✓
**Feature Branch**: `001-foundation`
**Constitutional Compliance**: Articles I.4, IV.1

**Business Intent**:
Establish robust, containerized environment with centralized identity management (Keycloak) for secure AI application deployment.

**Key Components**:
- Docker Compose with 13 services
- Keycloak SSO (OIDC + TOTP MFA)
- PostgreSQL (HR, Finance data)
- MongoDB (CRM data)
- Elasticsearch (Support tickets)
- Redis (Token revocation)
- Kong API Gateway
- Network isolation (172.30.0.0/16)

**Success Criteria**:
- ✅ All services start via `docker-compose up`
- ✅ 8 test users with TOTP authentication
- ✅ Health checks pass for all services
- ✅ Sample data loaded across all databases

**Location**: `.specify/specs/001-foundation/`

---

#### 002-security-layer: mTLS & Row Level Security
**Status**: IN PROGRESS ⚡
**Feature Branch**: `002-security-layer`
**Constitutional Compliance**: Articles I.1, I.2, I.3

**Business Intent**:
Implement defense-in-depth security: mutual TLS for service-to-service communication and Row Level Security for data access control.

**Key Components**:
- Certificate Authority (CA) for development mTLS
- Kong mTLS verification
- PostgreSQL RLS policies on all tables
- MongoDB role-based query filters
- Session variable management (`app.current_user_id`, `app.current_user_roles`)

**RLS Policy Pattern** (PostgreSQL):
```sql
CREATE POLICY employee_access_policy ON hr.employees
FOR SELECT
USING (
  employee_id = current_setting('app.current_user_id')::uuid  -- Self
  OR manager_id = current_setting('app.current_user_id')::uuid  -- Manager
  OR current_setting('app.current_user_roles') LIKE '%hr-read%'  -- HR
  OR current_setting('app.current_user_roles') LIKE '%executive%'  -- Executive
);
```

**Success Criteria**:
- [ ] Kong rejects connections without valid certificates
- [ ] Engineers see only own HR records
- [ ] Managers see team records
- [ ] HR roles see all employee data
- [ ] RLS integration tests pass

**Location**: `.specify/specs/002-security-layer/`

---

#### 003-mcp-core: Gateway & Prompt Defense
**Status**: CURRENT ⚡
**Feature Branch**: `003-mcp-core`
**Constitutional Compliance**: Articles I.2, II (all), III.1

**Business Intent**:
Central AI orchestration gateway with security enforcement (prompt injection defense, JWT validation, role-based routing).

**Key Components**:
- Node.js/TypeScript Gateway (473 lines implemented)
- JWT validation with Keycloak JWKS
- Token revocation (Redis)
- 5-Layer Prompt Injection Defense
- Role-to-MCP routing
- Claude API integration (Anthropic SDK)
- Audit logging (Winston)

**Routing Logic**:
```typescript
const ROLE_TO_MCP: Record<string, string[]> = {
  'hr-read': ['mcp-hr'],
  'finance-read': ['mcp-finance'],
  'sales-read': ['mcp-sales'],
  'support-read': ['mcp-support'],
  'executive': ['mcp-hr', 'mcp-finance', 'mcp-sales', 'mcp-support']
};
```

**Success Criteria**:
- [x] Gateway validates JWT tokens
- [ ] Token revocation via Redis
- [ ] Prompt injection patterns blocked
- [ ] Streaming responses work
- [ ] All queries logged with user context

**Location**: `.specify/specs/003-mcp-core/`

---

#### 004-mcp-suite: Domain MCP Servers
**Status**: PLANNED 🔲
**Feature Branch**: `004-mcp-suite`
**Constitutional Compliance**: Articles I.1, I.3, II.1, II.2, II.3

**Business Intent**:
Expose enterprise data (HR, Finance, Sales, Support) to AI via Model Context Protocol tools with strict RBAC enforcement.

**MCP Servers**:

| Server | Port | Tools | Data Source | Required Roles |
|--------|------|-------|-------------|----------------|
| **mcp-hr** | 3101 | `get_employee`, `list_employees`, `get_org_chart`, `get_performance_reviews` | PostgreSQL (tamshai_hr) | hr-read, hr-write, executive |
| **mcp-finance** | 3102 | `get_budget`, `list_invoices`, `get_expense_report` | PostgreSQL (tamshai_finance) | finance-read, finance-write, executive |
| **mcp-sales** | 3103 | `get_customer`, `list_opportunities`, `get_pipeline` | MongoDB (tamshai_crm) | sales-read, sales-write, executive |
| **mcp-support** | 3104 | `search_tickets`, `get_knowledge_article` | Elasticsearch | support-read, support-write, executive |

**PII Masking Pattern** (Article I.3):
```typescript
function maskSalary(employee: Employee, userRoles: string[]): Employee {
  const canViewSalary = userRoles.some(r =>
    r === 'hr-write' || r === 'finance-read' || r === 'executive'
  );

  if (!canViewSalary) {
    employee.salary = '*** (Hidden)';
    employee.ssn = '*** (Hidden)';
  }

  return employee;
}
```

**Success Criteria**:
- [ ] All 4 MCP servers deployed
- [ ] RLS session variables set before queries
- [ ] PII masked for non-privileged users
- [ ] Tools return structured JSON (no exceptions)
- [ ] RBAC integration tests pass

**Location**: `.specify/specs/004-mcp-suite/`

---

### Frontend (Planned 🔲)

#### 005-sample-apps: Web Portal & Dashboards
**Status**: PLANNED 🔲
**Feature Branch**: `005-sample-apps`
**Constitutional Compliance**: **Article V (ALL) - CRITICAL**

**Business Intent**:
Demonstrate SSO and RBAC enforcement via React web applications (Portal, HR App, Finance App).

**Applications**:

| App | Port | Description | RBAC Demo | Article V Compliance |
|-----|------|-------------|-----------|---------------------|
| **Portal** | 4000 | Main launchpad | Shows links based on roles | V.1: No client-side role checks |
| **HR App** | 4001 | Employee Directory | Salary field visibility | V.1: Backend masks data, client renders |
| **Finance** | 4002 | Budget Dashboard | Access denied for non-finance | V.1: Backend rejects, client shows error |

**Technical Stack**:
- **Framework**: React (Vite) + TypeScript
- **Monorepo**: Turborepo
- **Auth**: `react-oidc-context` (OIDC PKCE) ← **Article V.3**
- **Styling**: Tailwind CSS
- **State**: React Context

**Article V Compliance Checklist**:

✅ **V.1 - No Logic in Client**:
```typescript
// ❌ WRONG (violates Constitution)
if (user.roles.includes('hr-write')) {
  return <div>Salary: {employee.salary}</div>;
}

// ✅ CORRECT (Constitution compliant)
// Backend returns: { salary: "*** (Hidden)" } for non-privileged users
return <div>Salary: {employee.salary}</div>;
```

✅ **V.2 - Secure Token Storage**:
- Access Token: Memory only (via `react-oidc-context`)
- Refresh Token: HTTP-only cookie OR memory with silent refresh
- **NOT** localStorage (violates Article V.2)

✅ **V.3 - OIDC PKCE**:
```typescript
// PKCE configuration required
<AuthProvider
  authority="http://localhost:8180/realms/tamshai"
  client_id="mcp-gateway"
  redirect_uri={window.location.origin}
  response_type="code"  // PKCE flow
  scope="openid profile"
/>
```

**User Scenarios**:

**P1 - SSO Experience** (Priority 1):
- **Given**: User logged into Portal
- **When**: User clicks "HR App" link
- **Then**: Automatically logged in without re-prompting

**P2 - RBAC UI Rendering** (Priority 2):
- **Given**: Intern views CEO profile in HR App
- **When**: Backend returns masked salary ("*** (Hidden)")
- **Then**: Client renders masked value (no conditional logic)

**P3 - Access Denied** (Priority 3):
- **Given**: Intern navigates to `/finance` manually
- **When**: React app loads, checks token roles
- **Then**: Shows "Unauthorized" page (backend enforces, client displays)

**Success Criteria**:
- [ ] SSO works across all apps
- [ ] Token stored in memory (not localStorage)
- [ ] HR App shows/hides data based on backend response
- [ ] Finance App blocks non-finance users
- [ ] Silent refresh maintains authentication

**Location**: `.specify/specs/005-sample-apps/`

---

#### 006-ai-desktop: Electron Desktop AI Assistant
**Status**: DEPRECATED ❌ - Superseded by Spec 009 (Flutter Unified)
**Feature Branch**: `006-ai-desktop`
**Constitutional Compliance**: **Article V.2, V.3 - CRITICAL**

**Business Intent**:
Provide unified desktop AI assistant with secure token storage and natural language interface to enterprise data.

⚠️ **DEPRECATED (ADR-004 → ADR-005)**: Originally Electron, pivoted to React Native (ADR-004), then to Flutter (ADR-005). See Spec 009 for current implementation. Kept for historical reference only.

**Technical Stack**:
- **Framework**: React Native 0.73+ with `react-native-windows` and `react-native-macos`
- **Language**: TypeScript 5.x
- **Auth**: `react-native-app-auth` (OIDC PKCE via system browser) ← **Article V.3**
- **Token Storage**: Platform-native secure storage ← **Article V.2**
  - Windows: `react-native-keychain` → Windows Credential Manager
  - macOS: `react-native-keychain` → macOS Keychain
- **Streaming**: Custom fetch-based SSE (similar to mobile)

**Article V Compliance Checklist**:

✅ **V.2 - Secure Token Storage**:
```typescript
// React Native - Platform-agnostic secure storage
import * as Keychain from 'react-native-keychain';

// Store tokens in OS-native secure storage
await Keychain.setGenericPassword('tokens', JSON.stringify(tokens), {
  service: 'com.tamshai.ai',
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

// Access token: Kept in memory during app lifecycle
// Refresh token: Stored in OS keychain (Windows Credential Manager / macOS Keychain)
```

✅ **V.3 - PKCE Authentication**:
```typescript
// System browser OIDC flow via react-native-app-auth
import { authorize } from 'react-native-app-auth';

const result = await authorize({
  issuer: 'http://localhost:8180/realms/tamshai-corp',
  clientId: 'mcp-gateway-desktop',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  usePKCE: true,  // REQUIRED by Article V.3
  scopes: ['openid', 'profile', 'email', 'roles'],
});
// Native UWP protocol handling - no race condition!
```

**Features**:

1. **Chat Interface**:
   - Streaming responses from MCP Gateway
   - Markdown rendering (tables, code blocks)
   - Citations: "Source: HR Database"

2. **Context Awareness**:
   - "Thinking..." indicators during MCP tool execution
   - Visual feedback for multi-step queries

3. **Human-in-the-Loop UI** (Article II.2):
   - Approval cards for write actions
   - Example: "AI wants to update PTO balance. Approve? [Yes/No]"

**User Scenarios**:

**P1 - Secure Login** (Priority 1):
- **Given**: User opens desktop app
- **When**: App checks for stored refresh token in keychain
- **Then**: If none, opens system browser for OIDC login
- **Then**: Callback captured via `tamshai-ai://` protocol
- **Then**: Refresh token encrypted and stored in OS keychain

**P2 - AI Query** (Priority 2):
- **Given**: User types "Who is my manager?"
- **When**: App sends query to MCP Gateway with access token
- **Then**: Gateway streams response
- **Then**: App displays with markdown formatting

**P3 - Logout** (Priority 3):
- **Given**: User clicks "Logout"
- **When**: App clears access token from memory
- **When**: App deletes encrypted refresh token from keychain
- **Then**: Returns to login screen

**Security Architecture**:
```
┌─────────────────────────────────────────────┐
│     React Native App (Windows/macOS)        │
│  ┌──────────────────────────────────────┐  │
│  │  JavaScript Thread (React)           │  │
│  │  - Chat UI                           │  │
│  │  - Access Token (memory only)        │  │
│  │  - NO localStorage/AsyncStorage      │  │
│  └──────────────────────────────────────┘  │
│               ↓ Native Bridge               │
│  ┌──────────────────────────────────────┐  │
│  │  Native Module (react-native-keychain)│  │
│  │  - Windows: Credential Manager       │  │
│  │  - macOS: Keychain Services          │  │
│  │  - Refresh Token (encrypted)         │  │
│  └──────────────────────────────────────┘  │
│               ↓ Native Protocol Handler     │
│  ┌──────────────────────────────────────┐  │
│  │  UWP/AppKit Protocol Activation      │  │
│  │  - OS activates existing instance    │  │
│  │  - No process spawn race condition   │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
               ↓ HTTPS + JWT
┌─────────────────────────────────────────────┐
│       MCP Gateway (Backend)                 │
│       - JWT validation                      │
│       - All authorization logic             │
└─────────────────────────────────────────────┘
```

**Why React Native over Electron**:
- UWP protocol activation is native - OS handles instance routing
- No process spawn → lock check → race condition sequence
- Unified codebase with mobile (007-mobile)
- ~90% code sharing between Windows, macOS, iOS, Android

**Success Criteria**:
- [ ] OIDC login via system browser
- [ ] Refresh token encrypted in OS keychain (macOS: Keychain, Windows: Credential Manager, Linux: libsecret)
- [ ] Access token never persisted to disk
- [ ] Chat supports streaming
- [ ] Approval cards for write actions
- [ ] Closing app clears access token from memory

**Location**: `.specify/specs/006-ai-desktop/`

---

#### 007-mobile: Mobile AI Assistant (React Native)
**Status**: DEPRECATED ❌ - Merged into Spec 009 (Flutter Unified)
**Feature Branch**: `007-mobile`
**Constitutional Compliance**: **Article V.1, V.2, V.3 - CRITICAL**

**Business Intent**:
Provide mobile AI assistant applications (iOS and Android) enabling employees to access enterprise AI capabilities from their mobile devices with the same security guarantees as web and desktop clients.

⚠️ **DEPRECATED (ADR-005)**: Mobile platforms merged into Spec 009 (Flutter Unified). Flutter provides single codebase for Windows, macOS, iOS, and Android.

**Technical Stack**:
- **Framework**: React Native 0.73+ (iOS + Android)
- **Language**: TypeScript 5.x
- **Auth**: `react-native-app-auth` (OIDC PKCE via system browser)
- **Token Storage**: `react-native-keychain` (iOS Keychain / Android Keystore)
- **Streaming**: Custom fetch-based SSE (React Native lacks native EventSource)
- **State**: Zustand

**Network Infrastructure Requirements**:

Mobile development requires special network configuration because `localhost` is inaccessible from physical devices:

1. **Host Discovery**: Scripts to detect LAN IP address and generate `.env.mobile`
2. **Docker Compose Override**: Mobile-specific configuration with external URLs
3. **Windows Firewall**: Allow inbound connections on ports 8180, 8100, 3100
4. **WSL2 Port Forwarding**: Forward Windows ports to WSL2 guest (if applicable)
5. **Keycloak Mobile Client**: New public client with `com.tamshai.ai://` redirect URI

**Article V Compliance**:

✅ **V.1 - No Authorization Logic in Client**:
```typescript
// Backend returns masked data, client renders as-is
const EmployeeSalary = ({ employee }) => (
  <Text>{employee.salary}</Text>  // "*** (Hidden)" from backend
);
```

✅ **V.2 - Secure Token Storage**:
```typescript
import * as Keychain from 'react-native-keychain';

await Keychain.setGenericPassword('tokens', JSON.stringify(tokens), {
  service: 'com.tamshai.ai',
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
```

✅ **V.3 - PKCE Authentication**:
```typescript
import { authorize } from 'react-native-app-auth';

const result = await authorize({
  issuer: `${HOST_IP}:8180/realms/tamshai-corp`,
  clientId: 'mcp-gateway-mobile',
  redirectUrl: 'com.tamshai.ai://oauth/callback',
  usePKCE: true,  // REQUIRED
});
```

**Success Criteria**:
- [ ] Host discovery scripts work on Windows/macOS/Linux
- [ ] Mobile device can reach Keycloak and MCP Gateway
- [ ] OIDC login works on iOS and Android
- [ ] Tokens stored in platform-specific secure storage
- [ ] SSE streaming works for AI queries
- [ ] Confirmation cards work for write operations

**Location**: `.specify/specs/007-mobile/`

---

#### 009-flutter-unified: Flutter Unified Client (Desktop + Mobile)
**Status**: IMPLEMENTED ✓
**Feature Branch**: `009-flutter-unified`
**Constitutional Compliance**: **Article V.1, V.2, V.3 - CRITICAL**
**Replaces**: Spec 006 (Electron), Spec 007 (React Native Mobile), Spec 008 (React Native Unified)

**Business Intent**:
Provide a unified AI assistant application for Windows, macOS, iOS, and Android from a single Flutter/Dart codebase with secure authentication and real-time AI streaming.

**Technical Stack**:

| Component | Technology | Notes |
|-----------|------------|-------|
| **Framework** | Flutter 3.38+ | Stable, production-ready |
| **Language** | Dart 3.10+ | AOT compiled to native |
| **Desktop OAuth** | Custom `DesktopOAuthService` | HTTP server callback on localhost |
| **Mobile OAuth** | `flutter_appauth` 7.0+ | Native browser with deep links |
| **Token Storage** | `flutter_secure_storage` 9.0+ | Windows Credential Manager / Keychain |
| **State Management** | Riverpod 2.5+ | Compile-time safe providers |
| **HTTP Client** | Dio 5.4+ | Interceptors for auth |
| **Navigation** | go_router 14.0+ | Declarative routing with guards |
| **Code Generation** | Freezed 2.4+ | Immutable models |
| **SSE Streaming** | Custom implementation | Handles MCP Gateway events |

**Article V Compliance**:

✅ **V.1 - No Authorization Logic in Client**:
```dart
// CORRECT: Backend returns masked data, client renders as-is
Text(employee.salary)  // Shows "*** (Hidden)" from backend

// WRONG: Client-side role checking
if (user.roles.contains('hr-write')) { showSalary(); }  // NEVER DO THIS
```

✅ **V.2 - Secure Token Storage**:
```dart
// Tokens stored in platform-native secure storage
// Windows: Credential Manager
// macOS/iOS: Keychain
// Android: Keystore
await _secureStorage.write(key: 'access_token', value: token);

// Access token also kept in memory for fast access
// Refresh token ONLY in secure storage
```

✅ **V.3 - PKCE Authentication**:
```dart
// Desktop: Custom HTTP server callback
final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
final redirectUri = 'http://127.0.0.1:${server.port}/callback';
// PKCE code verifier generated with SHA-256 challenge

// Mobile: flutter_appauth with native browser
final result = await appAuth.authorizeAndExchangeCode(
  AuthorizationTokenRequest(clientId, redirectUrl,
    issuer: issuer,
    scopes: ['openid', 'profile', 'email', 'roles'],
  ),
);
```

**Architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flutter App                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Riverpod Providers                      │   │
│  │  authNotifierProvider → AuthState (union type)           │   │
│  │  chatNotifierProvider → ChatState (messages, streaming)  │   │
│  │  currentUserProvider  → AuthUser?                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────┐      │
│  │                      Services                          │      │
│  │  ┌─────────────────┐  ┌─────────────────┐             │      │
│  │  │DesktopOAuthSvc  │  │KeycloakAuthSvc  │             │      │
│  │  │(Windows/macOS)  │  │(iOS/Android)    │             │      │
│  │  │HTTP server flow │  │flutter_appauth  │             │      │
│  │  └─────────────────┘  └─────────────────┘             │      │
│  │  ┌─────────────────┐  ┌─────────────────┐             │      │
│  │  │ChatService      │  │SecureStorageSvc │             │      │
│  │  │SSE streaming    │  │Token persistence│             │      │
│  │  └─────────────────┘  └─────────────────┘             │      │
│  └───────────────────────────────────────────────────────┘      │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────┐      │
│  │                      Features                          │      │
│  │  LoginScreen → HomeScreen → ChatScreen                │      │
│  │                              ├── MessageBubble        │      │
│  │                              ├── ApprovalCard (v1.4)  │      │
│  │                              └── TruncationWarning    │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                       HTTPS + Bearer Token
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Gateway (:3100)                         │
│  - JWT validation with Keycloak JWKS                            │
│  - Role-based MCP server routing                                │
│  - SSE streaming with custom event types                        │
│  - Human-in-the-loop confirmations                              │
└─────────────────────────────────────────────────────────────────┘
```

**v1.4 Feature Support**:

| Feature | Implementation |
|---------|---------------|
| **SSE Streaming** | Custom parser handles `type: "text"` events from MCP Gateway |
| **Truncation Warnings** | Yellow badge in MessageBubble when `isTruncated: true` |
| **Human-in-the-Loop** | ApprovalCard widget with approve/reject actions |
| **LLM-Friendly Errors** | Error messages displayed in chat with retry suggestions |

**User Scenarios**:

**P1 - Secure Login (Desktop)**:
- App starts HTTP server on random localhost port
- Opens system browser with PKCE authorization URL
- User completes Keycloak login + TOTP in browser
- Browser redirects to localhost callback
- App exchanges code for tokens via PKCE
- Tokens stored in Windows Credential Manager / macOS Keychain
- User sees Home screen with profile

**P2 - AI Query with Streaming**:
- User types query in ChatScreen
- ChatService sends POST to `/api/query` with Bearer token
- Gateway streams SSE response chunks
- ChatNotifier updates message content incrementally
- Truncation warnings displayed if data was limited

**P3 - Write Action Confirmation**:
- User asks to update/delete data
- Gateway returns `pending_confirmation` status
- ApprovalCard rendered with action details and warnings
- User taps Approve or Cancel
- Result displayed in chat

**P4 - Logout**:
- User taps logout in AppBar
- Access token cleared from memory
- Refresh token deleted from secure storage
- Keycloak end-session called (optional browser redirect)
- User returned to LoginScreen

**Success Criteria**:

- [x] Windows app builds and runs (`flutter build windows`)
- [x] OAuth login via system browser with PKCE
- [x] Tokens stored in Windows Credential Manager
- [x] User profile extracted from ID token claims
- [x] Chat interface with SSE streaming
- [x] Truncation warning display
- [x] Human-in-the-loop ApprovalCard
- [x] Token refresh via interceptor
- [x] Logout clears all tokens
- [ ] macOS build and test
- [ ] iOS build and test
- [ ] Android build and test

**Known Limitations**:

**PL-001: Desktop OAuth Uses System Browser**
- Windows/macOS/Linux open default browser for login
- Browser tab remains open after login (user must close manually)
- This is expected behavior due to loopback HTTP server approach
- Security maintained via PKCE

**Keycloak Configuration Required**:
- Client ID: `tamshai-flutter-client` (public client, PKCE required)
- Redirect URIs: `http://127.0.0.1:*/callback` (desktop), `com.tamshai.ai://callback` (mobile)
- Protocol Mappers: `preferred_username` and `email` in access token

**Location**: `.specify/specs/009-flutter-unified/`

**References**:
- ADR-005: `.specify/ARCHITECTURE_SPECS.md` - Platform pivot decision
- Migration Document: `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md`
- Implementation: `clients/unified_flutter/`

---

## Specification File Structure

Each specification follows this structure:

```
.specify/specs/XXX-feature-name/
├── spec.md          # Requirements, user stories, success criteria
├── plan.md          # Implementation phases, technical approach
└── tasks.md         # Actionable tasks grouped by service
```

### Template Locations

- **Official Spec Kit Templates**: `.specify/templates/`
- **Original Custom Templates**: `.github/templates/` (deprecated in favor of official)

---

## Development Workflow

### For Existing Specs (001-004)
1. Reference spec.md for requirements
2. Follow plan.md implementation phases
3. Execute tasks.md items sequentially
4. Verify against Constitution compliance

### For New Features (007+)
1. Run `/speckit.specify` to create new spec
2. Run `/speckit.clarify` to de-risk ambiguities
3. Run `/speckit.plan` to generate implementation plan
4. Run `/speckit.tasks` to break down tasks
5. Run `/speckit.analyze` to check consistency
6. Run `/speckit.implement` to start coding

### Critical Reminders

🔴 **For ALL Frontend Development (005-006)**:
- Review **Article V** before writing any client code
- Authorization logic MUST be in backend (MCP Gateway/Servers)
- Clients MUST use PKCE for authentication
- Tokens MUST be stored securely (memory or OS keychain, NOT localStorage)

🔴 **For ALL Backend Development (001-004)**:
- RLS policies MUST be defined before exposing data
- MCP tools MUST return structured errors (never throw)
- All queries MUST be logged with user context

---

## Compliance Verification Matrix

| Spec | Article I | Article II | Article III | Article IV | Article V | Status |
|------|-----------|------------|-------------|------------|-----------|--------|
| 001-foundation | ✅ I.4 | N/A | N/A | ✅ IV.1 | N/A | ✅ Complete |
| 002-security-layer | ✅ I.1, I.2, I.3 | N/A | ✅ III.1 | ✅ IV.1 | N/A | ⚡ In Progress |
| 003-mcp-core | ✅ I.2 | ✅ II.1, II.2, II.3 | ✅ III.1 | ✅ IV.1, IV.2 | N/A | ⚡ Current |
| 004-mcp-suite | ✅ I.1, I.3 | ✅ II.1, II.2, II.3 | ✅ III.1, III.2 | ✅ IV.1, IV.2 | N/A | ⚡ In Progress |
| 005-sample-apps | ✅ I.4 | N/A | N/A | ✅ IV.1 | ✅ **V.1, V.2, V.3** | 🔲 Planned |
| 006-ai-desktop | ~~I.4~~ | N/A | N/A | N/A | ~~V.1, V.2, V.3~~ | ❌ Deprecated |
| 007-mobile | ~~I.4~~ | N/A | N/A | N/A | ~~V.1, V.2, V.3~~ | ❌ Deprecated |
| **009-flutter-unified** | ✅ I.4 | N/A | N/A | N/A | ✅ **V.1, V.2, V.3** | ✅ Implemented |

**Legend**:
- ✅ = Compliance required and documented
- N/A = Article not applicable to this spec

---

## Directory Listing Verification

```
tamshai-enterprise-ai/
├── .specify/
│   ├── memory/
│   │   └── constitution.md → ../../docs/architecture/constitution.md
│   ├── scripts/
│   │   ├── common.sh
│   │   ├── check-prerequisites.sh
│   │   ├── create-new-feature.sh
│   │   ├── setup-plan.sh
│   │   └── update-claude-md.sh
│   ├── specs/
│   │   ├── 001-foundation/       [✓ COMPLETED]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 002-security-layer/   [⚡ IN PROGRESS]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 003-mcp-core/         [⚡ CURRENT]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 004-mcp-suite/        [🔲 PLANNED]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 005-sample-apps/      [🔲 PLANNED]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 006-ai-desktop/       [❌ DEPRECATED - See 009]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   ├── 007-mobile/           [❌ DEPRECATED - See 009]
│   │   │   ├── spec.md
│   │   │   ├── plan.md
│   │   │   └── tasks.md
│   │   └── 009-flutter-unified/  [✓ IMPLEMENTED]
│   │       ├── spec.md
│   │       ├── plan.md
│   │       └── tasks.md
│   ├── templates/
│   │   ├── spec-template.md      [Official Spec Kit]
│   │   ├── plan-template.md      [Official Spec Kit]
│   │   ├── tasks-template.md     [Official Spec Kit]
│   │   └── checklist-template.md [Official Spec Kit]
│   ├── README.md
│   ├── INTEGRATION.md
│   └── ARCHITECTURE_SPECS.md     [This file]
├── .claude/
│   └── commands/                  [Spec Kit slash commands]
├── docs/architecture/
│   └── constitution.md            [SOURCE OF TRUTH]
└── [other project directories...]
```

---

## Architectural Decisions Log

### ADR-001: Hybrid Spec Format
**Decision**: Use GitHub Spec Kit templates while preserving domain-specific security focus.
**Rationale**: Official templates provide SDD workflow compatibility; our custom content ensures enterprise AI security requirements are explicit.
**Date**: 2024-12-08

### ADR-002: Constitution as Symbolic Link
**Decision**: Keep constitution source at `docs/architecture/constitution.md` with symlink in `.specify/memory/`.
**Rationale**: Constitution is architectural documentation, not just SDD metadata. Belongs in docs/ for visibility.
**Date**: 2024-12-08

### ADR-003: Article V for Frontend Security
**Decision**: All frontend applications (web, desktop, mobile) MUST comply with Article V.
**Rationale**: Authorization in clients is a critical security vulnerability. Backend enforcement is the only acceptable pattern.
**Date**: 2024-11-30 (Constitution ratification)

### ADR-004: Desktop Platform Pivot from Electron to React Native
**Decision**: Migrate desktop application from Electron to React Native for Windows/macOS.
**Status**: SUPERSEDED by ADR-005
**Date**: 2024-12-14

**Context**:
During OAuth deep linking implementation on Windows, we discovered a fundamental race condition in Electron's `requestSingleInstanceLock()` (Electron GitHub #35680). When the protocol handler launches a second instance ~30 seconds after the first, both instances can incorrectly acquire the lock. This breaks OAuth callback routing because:
- `second-instance` event doesn't fire when both hold the lock
- PKCE code verifier is lost (stored in original instance memory)
- User experiences broken login flow

**Workarounds Attempted**:
1. 600ms delay before lock request - partially effective
2. `additionalData` API for URL passing - works when lock works
3. Auto-close orphaned instances - loses OAuth callback URL
4. File-based IPC - adds complexity, inelegant

**Decision Rationale**:
1. **Fundamental Platform Limitation**: Cannot be fixed at application level
2. **React Native for Windows**: Uses native UWP protocol activation - OS routes callbacks to existing instance directly, eliminating the race condition entirely
3. **Strategic Alignment**: Phase 6 (Mobile) already planned for React Native - merging into unified codebase
4. **Code Reuse**: ~90% shared code between Windows, macOS, iOS, Android

**Impact**:
- Electron desktop client (`clients/desktop/`) deprecated (kept for reference)
- New React Native desktop client development
- Mobile timeline accelerated via shared codebase
- 006-ai-desktop and 007-mobile effectively merge

**Documentation**:
- Full investigation: `clients/desktop/ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md`
- OAuth debug history: `clients/desktop/OAUTH_DEBUG_STATUS.md`

---

### ADR-005: Desktop Platform Pivot from React Native to Flutter
**Decision**: Migrate from React Native Windows to Flutter/Dart for all client platforms.
**Status**: APPROVED & IMPLEMENTED
**Date**: 2025-12-24

**Context**:
After implementing ADR-004 (Electron → React Native), React Native Windows 0.73-0.80 demonstrated fundamental instability issues that blocked development:

**React Native Windows 0.80 Issues**:
- Hermes engine crashes on TextInput (null pointer in JS-to-Native bridge)
- Crash occurs regardless of UI architecture (Fabric or Legacy)
- No configuration resolved the issue

**React Native Windows 0.73.x Issues**:
- Version mismatch between npm (0.73.22) and NuGet packages (resolved to 0.74.0)
- std::mutex crash bug in Visual Studio 2022 17.10+ (affects precompiled DLLs)
- XAML initialization failures (0x0000000000000000 access violation)
- Precompiled `Microsoft.ReactNative.dll` cannot be patched locally

**Workarounds Attempted**:
1. Downgrade to 0.73.21 - version aligned but crashes persisted
2. Add `_DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR` preprocessor - no effect on precompiled DLLs
3. Fix XamlControlsResources configuration - no effect
4. Clear NuGet caches and force exact versions - no effect

**Decision Rationale**:
1. **Platform Stability**: Flutter Windows has been production-stable since 2021
2. **Build System**: Single `flutter build` command vs MSBuild + NuGet + npm complexity
3. **No JavaScript Runtime**: AOT compilation to native code eliminates JS bridge crashes
4. **Mature Packages**: `flutter_appauth`, `flutter_secure_storage`, `riverpod` are well-maintained
5. **Cross-Platform**: Same ~90% code sharing goal achieved with better stability
6. **Developer Experience**: Hot reload, clear Dart errors, faster builds

**Technical Stack Change**:

| Component | React Native (ADR-004) | Flutter (ADR-005) |
|-----------|------------------------|-------------------|
| Framework | React Native 0.73+ | Flutter 3.38+ |
| Language | TypeScript 5.x | Dart 3.10+ |
| OAuth | react-native-app-auth | flutter_appauth + custom DesktopOAuthService |
| Token Storage | react-native-keychain | flutter_secure_storage |
| State Management | Zustand | Riverpod |
| HTTP Client | fetch | Dio with interceptors |
| Navigation | React Navigation | go_router |
| Code Generation | None | Freezed for immutable models |

**Desktop OAuth Architecture**:
Flutter on desktop uses a different OAuth approach than mobile:
- **Mobile**: `flutter_appauth` with native browser and deep link callback
- **Desktop**: Custom HTTP server on `127.0.0.1:0` (random port) with browser redirect

This approach avoids platform-specific protocol handler issues while maintaining PKCE security.

**Impact**:
- React Native client (`clients/unified/`) deprecated (kept for reference)
- New Flutter client (`clients/unified_flutter/`) is production implementation
- Spec 008 (React Native Unified) superseded by Spec 009 (Flutter Unified)
- Authentication architecture preserved (PKCE, secure storage, token refresh)

**Documentation**:
- Full migration rationale: `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md`
- React Native investigation: `clients/unified/docs/WINDOWS_CRASH_INVESTIGATION.md`

---

## Next Actions

### Completed
1. ✅ Formalize all specifications (001-009)
2. ✅ Flutter Windows desktop client implemented (009-flutter-unified)
3. ✅ OAuth login with PKCE and Keycloak integration
4. ✅ SSE streaming chat interface with v1.4 features
5. ✅ Integration tests for query scenarios

### Current Sprint
6. ⚡ Complete MCP Gateway token revocation (003-mcp-core)
7. ⚡ Implement remaining RLS policies (002-security-layer)
8. ⚡ MCP Suite servers refinement (004-mcp-suite)

### Next Sprint
9. 🔲 Flutter macOS build and test (009-flutter-unified)
10. 🔲 Flutter iOS/Android builds (009-flutter-unified)
11. 🔲 Begin Sample Web Apps with Article V compliance (005-sample-apps)

### Deprecated (Reference Only)
- ~~006-ai-desktop (Electron)~~ - See ADR-004
- ~~007-mobile (React Native)~~ - See ADR-005
- ~~008-unified-client (React Native)~~ - See ADR-005
- ~~Electron desktop client~~ - See ADR-004
- ~~React Native Windows client~~ - See ADR-005

---

## Contact

**Lead Architect**: John Cornell
**Repository**: https://github.com/jcornell3/tamshai-enterprise-ai
**Constitution Version**: 1.0.0
**Last Spec Review**: December 26, 2025

---

*This document represents the authoritative architectural specification inventory for the Tamshai Enterprise AI project. All development must reference these specifications and comply with the Constitution.*
