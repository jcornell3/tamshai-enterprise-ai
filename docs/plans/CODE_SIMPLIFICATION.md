# Code Simplification Plan

**Document Version**: 1.2
**Created**: January 14, 2026
**Updated**: January 14, 2026
**Author**: Code Simplification Analysis
**Status**: Revised - Pending Approval

## Executive Summary

This document outlines a comprehensive plan to simplify and improve code clarity, consistency, and maintainability across the Tamshai Enterprise AI codebase. The plan is organized into 5 phases covering TypeScript services, React clients, Flutter/Dart code, Terraform configurations, and shell scripts.

> **IMPORTANT**: This plan has been revised after reviewing the existing MCP Gateway Refactoring Plan (`.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md`) and Test Coverage Strategy (`.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md`). Some proposed "simplifications" would negatively impact test coverage and have been downgraded or removed.

### Key Findings

| Category | Primary Issues | Impact |
|----------|----------------|--------|
| TypeScript Services | ~~Duplicate response types~~ (intentional - see below) | ~~High~~ **Removed** |
| TypeScript Services | Monolithic index.ts files (4 MCP servers) | Medium - existing refactoring plan |
| React Clients | Duplicate CallbackPage component | Medium - code bloat |
| Flutter/Dart | Router logic in main.dart | Low - good structure overall |
| Terraform | Well-modularized but some variable duplication | Low - good patterns |
| Shell Scripts | Large sync-realm.sh (1141 lines) | High - hard to maintain |

---

## ⚠️ Test Coverage Impact Analysis

Before implementing any simplification, consider the impact on test coverage. The project follows a **Diff Coverage Strategy** (90% on new code) and has improved coverage from **31% → 54%** through intentional code extraction.

### Why Some "Duplications" Are Intentional

The MCP Gateway refactoring plan (`.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md`) documents that:

1. **Response types were intentionally duplicated** to enable local test mocking
2. **Each service having local types enables**:
   - Independent mocking in unit tests (no cross-service dependencies)
   - Local test isolation (Jest module mocking works cleanly)
   - Independent deployability (no shared package versioning issues)
   - 100% coverage on type modules (e.g., `mcp-response.ts` has 30 tests)

3. **`mcp-gateway/src/types/mcp-response.ts` has 100% test coverage** - consolidating could break this

### Coverage-Safe vs Coverage-Risk Changes

| Change | Coverage Impact | Recommendation |
|--------|-----------------|----------------|
| **Issue 1.1**: Shared types package | 🔴 **NEGATIVE** - breaks test isolation, requires package mocking | **REMOVED** |
| **Issue 1.2**: MCP server refactoring | 🟢 **POSITIVE** - enables more testable code | Keep (aligns with existing plan) |
| **Issue 2.1**: Shared CallbackPage | 🟢 **POSITIVE** - reduces duplication, testable | Keep |
| **Issue 5.1**: Split sync-realm.sh | ⚪ **NEUTRAL** - shell scripts not in coverage | Keep |
| **Issue 5.3**: Remove hardcoded IP | ⚪ **NEUTRAL** - config change | Keep |

### Alignment with Existing Plans

This simplification plan should **complement, not conflict with**:
- `.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md` - MCP Gateway refactoring (Phase 1-4 complete)
- `.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md` - 90% diff coverage enforcement
- `docs/plans/MCP_SUPPORT_BACKEND_ABSTRACTION.md` - Support service backend plan

---

## Phase 1: TypeScript and MCP Services

### Files to Review

- `services/mcp-gateway/src/index.ts` (main orchestration - refactoring plan Phase 1-4 complete)
- `services/mcp-hr/src/index.ts` (~900 lines)
- `services/mcp-finance/src/index.ts` (~800 lines)
- `services/mcp-sales/src/index.ts` (~850 lines)
- `services/mcp-support/src/index.ts` (~1000 lines)
- ~~`services/mcp-*/src/types/response.ts`~~ (intentionally separate per service - see Issue 1.1)

### ~~Issue 1.1: Duplicate Response Types~~ - **REMOVED**

> **Status**: ❌ **REMOVED FROM PLAN** - Would negatively impact test coverage

**Original Proposal**: Create shared `@tamshai/mcp-types` package to consolidate response types.

**Why Removed**:

After reviewing the MCP Gateway Refactoring Plan and Test Coverage Strategy, this change would be **counterproductive**:

1. **Test Coverage Impact**: `mcp-gateway/src/types/mcp-response.ts` currently has **100% test coverage** (30 tests). Consolidating into a shared package would:
   - Break Jest's module mocking (tests mock local imports, not npm packages)
   - Require complex package mocking setup across all services
   - Risk losing the existing 100% coverage baseline

2. **Intentional Design**: The refactoring plan explicitly states that local types were extracted to enable testability:
   > "All extracted modules: 75-100% coverage" - REFACTORING_PLAN.md

3. **Independent Deployability**: Each MCP service can evolve its types independently without coordinating package versions.

4. **Minor Inconsistencies Are Acceptable**: The "inconsistencies" noted (e.g., `confirmationData` structure) are actually service-specific requirements, not bugs.

**Alternative Recommendation**: If type consistency is needed for API documentation, create a **shared TypeScript interface file** that services can reference (without runtime dependency), or use OpenAPI schema generation.

---

### Issue 1.2: MCP Server Index Files Are Monolithic

> **Status**: 🟡 **ALIGNS WITH EXISTING PLAN** - Follow mcp-gateway refactoring pattern

**Files Affected**:
- `services/mcp-hr/src/index.ts` (900+ lines)
- `services/mcp-finance/src/index.ts` (800+ lines)
- `services/mcp-sales/src/index.ts` (850+ lines)
- `services/mcp-support/src/index.ts` (1000+ lines)

**Current Problem**:
Each MCP server has a large index.ts containing:
- Express app setup
- Database connection logic
- All tool handlers inline
- Health check endpoints
- Error handling middleware

**Proposed Simplification**:
Extract into consistent module structure for each service:
```
services/mcp-{service}/src/
  index.ts              # Entry point (~50 lines)
  app.ts                # Express setup (~100 lines)
  database.ts           # DB connection
  handlers/             # Tool handlers
    list.ts
    get.ts
    create.ts
    update.ts
  middleware/           # Common middleware
    error.ts
    auth.ts
```

**Alignment with Existing Work**:
- This mirrors the **completed** structure in `services/mcp-gateway/` (see REFACTORING_PLAN.md Phase 1-4)
- MCP Gateway refactoring improved coverage from **31% → 54%** using this exact pattern
- Apply the same TDD approach: write tests FIRST, then extract

**Test Coverage Impact**: 🟢 **POSITIVE** - Extracted modules can achieve 85-100% coverage

**Priority**: MEDIUM
**Estimated Effort**: LARGE (per service: 6-8 hours; total: 24-32 hours)
**Dependencies**: None (Issue 1.1 removed)
**Risks**: Requires writing tests before extraction to maintain diff coverage (90%)

---

### Issue 1.3: Inconsistent Error Handling Patterns

> **Status**: 🟡 **REVISED** - Local error utilities per service (no shared package)

**Files Affected**:
- All MCP service index.ts files

**Current Problem**:
Error handling varies between services:
```typescript
// mcp-hr: uses try/catch with detailed error response
try { ... } catch (error) {
  return createErrorResponse('DB_ERROR', error.message, 'Check database connection');
}

// mcp-finance: similar but different error codes
try { ... } catch (error) {
  return createErrorResponse('QUERY_FAILED', ...);
}
```

**Revised Simplification** (per-service, not shared package):
Create error handling utilities **within each service**:
```typescript
// services/mcp-hr/src/utils/errors.ts
export const ErrorCodes = {
  DB_CONNECTION: 'DB_CONNECTION_ERROR',
  QUERY_FAILED: 'QUERY_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export function handleDatabaseError(error: unknown): MCPErrorResponse {
  // Consistent error transformation
}
```

**Why Per-Service (Not Shared)**:
- Maintains test isolation (Jest mocking works cleanly)
- Each service can have domain-specific error codes
- Aligns with refactoring plan's "extract to local modules" pattern
- Enables 90%+ coverage on error utilities

**Test Coverage Impact**: 🟢 **POSITIVE** - Local error utilities are easily testable

**Priority**: MEDIUM
**Estimated Effort**: SMALL (2-3 hours per service)
**Dependencies**: None (Issue 1.1 removed)
**Risks**: Low

---

## Phase 2: React Web Clients

### Files to Review

- `clients/web/apps/hr/src/App.tsx`
- `clients/web/apps/finance/src/App.tsx`
- `clients/web/apps/sales/src/App.tsx`
- `clients/web/apps/support/src/App.tsx`
- `clients/web/apps/*/src/pages/CallbackPage.tsx`
- `clients/web/apps/*/src/pages/AIQueryPage.tsx`

### Issue 2.1: Duplicate CallbackPage Component (MEDIUM PRIORITY)

**Files Affected**:
- `clients/web/apps/finance/src/App.tsx` (lines 24-48) - CallbackPage inline
- `clients/web/apps/sales/src/pages/CallbackPage.tsx`
- `clients/web/apps/support/src/pages/CallbackPage.tsx`
- `clients/web/apps/hr/src/pages/CallbackPage.tsx`

**Current Problem**:
The finance app defines CallbackPage inline within App.tsx, while other apps have separate files. All implementations are nearly identical:
```tsx
function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/');
      } else if (error) {
        console.error('Authentication error:', error);
      }
    }
  }, [isAuthenticated, isLoading, error, navigate]);

  return ( /* loading spinner */ );
}
```

**Proposed Simplification**:
Move CallbackPage to `@tamshai/auth` package:
```typescript
// clients/web/packages/auth/src/CallbackPage.tsx
export function CallbackPage({ redirectTo = '/' }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();
  // ... common logic
}
```

Usage in apps becomes:
```tsx
import { CallbackPage } from '@tamshai/auth';
<Route path="/callback" element={<CallbackPage />} />
```

**Rationale**: Eliminates 4 duplicate implementations (~100 lines total).

**Priority**: MEDIUM
**Estimated Effort**: SMALL (1-2 hours)
**Dependencies**: None
**Risks**: Low - simple extraction

---

### Issue 2.2: Similar App.tsx Route Structures

**Files Affected**:
- All 4 web app `App.tsx` files

**Current Problem**:
Each app follows the same pattern but with hardcoded differences:
```tsx
<Routes>
  <Route
    path="/"
    element={
      <PrivateRoute requiredRoles={['hr-read', 'hr-write', 'executive']}>
        <Layout />
      </PrivateRoute>
    }
  >
    <Route index element={<DashboardPage />} />
    {/* ... */}
  </Route>
  <Route path="/callback" element={<CallbackPage />} />
</Routes>
```

**Proposed Simplification**:
Create a shared `createAppRoutes` factory (optional - low impact):
```typescript
// clients/web/packages/ui/src/createAppRoutes.tsx
interface AppConfig {
  requiredRoles: string[];
  routes: RouteConfig[];
}

export function createAppRoutes(config: AppConfig): React.ReactNode {
  // Generate route tree
}
```

**Note**: This is a lower priority item as the current structure is clear and explicit.

**Priority**: LOW
**Estimated Effort**: MEDIUM (3-4 hours)
**Dependencies**: Issue 2.1
**Risks**: Over-abstraction could reduce clarity

---

### Issue 2.3: Repeated SVG Icons in AIQueryPage

**Files Affected**:
- `clients/web/apps/hr/src/pages/AIQueryPage.tsx` (lines 77-210)

**Current Problem**:
The same checkmark SVG icon is repeated 4 times inline:
```tsx
<svg className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
</svg>
```

**Proposed Simplification**:
Create icon components in `@tamshai/ui`:
```typescript
// clients/web/packages/ui/src/icons/CheckCircle.tsx
export function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
```

**Priority**: LOW
**Estimated Effort**: SMALL (1 hour)
**Dependencies**: None
**Risks**: None

---

## Phase 3: Flutter/Dart Code

### Files to Review

- `clients/unified_flutter/lib/main.dart`
- `clients/unified_flutter/lib/core/auth/services/keycloak_auth_service.dart`
- `clients/unified_flutter/lib/core/auth/providers/auth_provider.dart`

### Issue 3.1: Router Logic Complexity in main.dart

**File**: `clients/unified_flutter/lib/main.dart` (152 lines)

**Current Problem**:
The router redirect logic in `_createRouter` is complex with nested conditionals:
```dart
redirect: (context, state) async {
  final authState = ref.read(authNotifierProvider);
  final isAuthenticated = authState is Authenticated;
  final isAuthenticating = authState is Authenticating;
  final isLoginRoute = state.matchedLocation == '/login';
  final isBiometricRoute = state.matchedLocation == '/biometric-unlock';

  if (isAuthenticating) { return null; }
  if (isAuthenticated) {
    if (isLoginRoute || isBiometricRoute) { return '/'; }
    return null;
  }
  if (!isAuthenticated && !isLoginRoute && !isBiometricRoute) {
    final hasBiometricToken = await ref.read(hasBiometricRefreshTokenProvider.future);
    if (hasBiometricToken) { return '/biometric-unlock'; }
    return '/login';
  }
  return null;
}
```

**Proposed Simplification**:
Extract router configuration to a dedicated file:
```dart
// lib/core/routing/app_router.dart
class AppRouter {
  final WidgetRef ref;

  AppRouter(this.ref);

  GoRouter create() => GoRouter(
    redirect: _handleRedirect,
    routes: _routes,
    // ...
  );

  Future<String?> _handleRedirect(BuildContext context, GoRouterState state) async {
    return AuthRedirectHandler(ref).getRedirectPath(state);
  }
}

// lib/core/routing/auth_redirect_handler.dart
class AuthRedirectHandler {
  final WidgetRef ref;

  AuthRedirectHandler(this.ref);

  Future<String?> getRedirectPath(GoRouterState state) async {
    // Cleaner, more testable logic
  }
}
```

**Note**: The Flutter code is generally well-structured. This is an optional improvement.

**Priority**: LOW
**Estimated Effort**: MEDIUM (3-4 hours)
**Dependencies**: None
**Risks**: Minimal

---

### Issue 3.2: JWT Parsing Duplication

**File**: `clients/unified_flutter/lib/core/auth/services/keycloak_auth_service.dart` (280 lines)

**Current Problem**:
JWT parsing logic (`_parseJwtClaims`) is implemented in the auth service. This is a common utility that could be shared:
```dart
Map<String, dynamic> _parseJwtClaims(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) {
      throw const FormatException('Invalid JWT format');
    }
    final payload = parts[1];
    final normalized = base64Url.normalize(payload);
    final decoded = utf8.decode(base64Url.decode(normalized));
    return jsonDecode(decoded) as Map<String, dynamic>;
  } catch (e, stackTrace) { ... }
}
```

**Proposed Simplification**:
Extract to a utility class:
```dart
// lib/core/utils/jwt_utils.dart
class JwtUtils {
  static Map<String, dynamic> parsePayload(String token) { ... }
  static bool isExpired(String token) { ... }
  static DateTime? getExpiration(String token) { ... }
}
```

**Priority**: LOW
**Estimated Effort**: SMALL (1-2 hours)
**Dependencies**: None
**Risks**: None

---

## Phase 4: Terraform Configurations

### Files to Review

- `infrastructure/terraform/gcp/main.tf`
- `infrastructure/terraform/vps/main.tf`
- `infrastructure/terraform/dev/main.tf`
- `infrastructure/terraform/modules/cloudrun/main.tf`
- `infrastructure/terraform/modules/` (all subdirectories)

### Assessment

The Terraform code is **well-structured** with good use of modules. The codebase follows best practices:
- GCP infrastructure uses reusable modules (`networking`, `security`, `database`, `storage`, `cloudrun`)
- Variables are consistently defined with descriptions
- Local values reduce repetition
- Cloud Run services use `for_each` pattern effectively (see `cloudrun/main.tf:214`)

### Issue 4.1: Repeated Cloud Run Service Configuration (LOW PRIORITY)

**File**: `infrastructure/terraform/modules/cloudrun/main.tf` (630 lines)

**Current Problem**:
While the MCP suite services use `for_each`, there's still duplication between:
- `google_cloud_run_service.mcp_gateway` (resource block ~100 lines)
- `google_cloud_run_service.keycloak` (resource block ~100 lines)
- `google_cloud_run_service.web_portal` (resource block ~60 lines)

Common patterns repeated:
```hcl
autogenerate_revision_name = true

lifecycle {
  ignore_changes = [
    template[0].metadata[0].annotations["run.googleapis.com/client-name"],
    template[0].metadata[0].annotations["run.googleapis.com/client-version"],
  ]
}

traffic {
  percent         = 100
  latest_revision = true
}
```

**Proposed Simplification**:
Create a generic Cloud Run service submodule:
```hcl
# modules/cloudrun-service/main.tf
resource "google_cloud_run_service" "this" {
  name     = var.service_name
  location = var.region
  project  = var.project_id

  template {
    spec {
      containers {
        image = var.image
        # ... dynamic env vars from var.environment_variables
      }
      service_account_name = var.service_account
      timeout_seconds      = var.timeout
    }
    # ... common annotations
  }

  traffic { ... }
  autogenerate_revision_name = true
  lifecycle { ... }
}
```

**Note**: This may add complexity without significant benefit. Current structure is readable.

**Priority**: LOW
**Estimated Effort**: LARGE (6-8 hours)
**Dependencies**: None
**Risks**: Over-abstraction; harder to understand individual service configs

---

### Issue 4.2: VPS main.tf Has Many Local Secrets

**File**: `infrastructure/terraform/vps/main.tf` (409 lines)

**Current Problem**:
Multiple `random_password` resources with similar configuration:
```hcl
resource "random_password" "postgres_password" { length = 24; special = false }
resource "random_password" "keycloak_admin_password" { length = 24; special = false }
resource "random_password" "keycloak_db_password" { length = 24; special = false }
resource "random_password" "mongodb_password" { length = 24; special = false }
resource "random_password" "minio_password" { length = 24; special = false }
resource "random_password" "jwt_secret" { length = 64; special = false }
resource "random_password" "mcp_hr_service_secret" { length = 32; special = false }
resource "random_password" "root_password" { length = 20; special = true; ... }
```

**Proposed Simplification**:
Use a `for_each` pattern:
```hcl
locals {
  passwords = {
    postgres    = { length = 24, special = false }
    keycloak    = { length = 24, special = false }
    keycloak_db = { length = 24, special = false }
    mongodb     = { length = 24, special = false }
    minio       = { length = 24, special = false }
    jwt         = { length = 64, special = false }
    hr_service  = { length = 32, special = false }
    root        = { length = 20, special = true }
  }
}

resource "random_password" "generated" {
  for_each = local.passwords
  length   = each.value.length
  special  = each.value.special
}
```

**Priority**: LOW
**Estimated Effort**: SMALL (1-2 hours)
**Dependencies**: None
**Risks**: References throughout file need updating

---

## Phase 5: Shell Scripts and Other Scripts

### Files to Review

- `keycloak/scripts/sync-realm.sh` (1141 lines)
- `scripts/infra/deploy.sh` (297 lines)
- `scripts/infra/status.sh`
- `scripts/mcp/health-check.sh`
- Various other scripts in `scripts/`

### Issue 5.1: Monolithic sync-realm.sh (HIGH PRIORITY)

**File**: `keycloak/scripts/sync-realm.sh` (1141 lines)

**Current Problem**:
This is the largest shell script in the codebase and handles:
- Environment configuration (lines 52-78)
- Keycloak CLI helpers (lines 93-170)
- Scope caching (lines 154-170)
- Standard scope creation (lines 173-220)
- Client scope assignment (lines 222-253)
- 6 client sync functions (lines 259-597)
- All-Employees group sync (lines 603-643)
- User group assignment (lines 652-710)
- Critical prod user assignment (lines 719-761)
- Test user provisioning (lines 767-848)
- Audience mapper sync (lines 863-923)
- Subject claim mapper sync (lines 928-1003)
- Client role mapper sync (lines 1013-1087)
- Main execution (lines 1089-1141)

**Proposed Simplification**:
Split into multiple focused scripts:
```
keycloak/scripts/
  sync-realm.sh           # Main orchestrator (~100 lines)
  lib/
    common.sh             # Colors, logging, KCADM path
    auth.sh               # kcadm_login, environment config
    clients.sh            # Client sync functions
    scopes.sh             # Scope creation and assignment
    groups.sh             # Group and user assignment
    mappers.sh            # Protocol mapper functions
    users.sh              # Test user provisioning
```

Main script becomes:
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/auth.sh"
source "$SCRIPT_DIR/lib/clients.sh"
source "$SCRIPT_DIR/lib/scopes.sh"
source "$SCRIPT_DIR/lib/groups.sh"
source "$SCRIPT_DIR/lib/mappers.sh"
source "$SCRIPT_DIR/lib/users.sh"

main() {
    configure_environment
    kcadm_login
    create_standard_scopes
    cache_scope_ids
    sync_all_clients
    sync_all_mappers
    sync_groups_and_users
}

main "$@"
```

**Rationale**: Improves maintainability, testability, and reduces cognitive load.

**Priority**: HIGH
**Estimated Effort**: LARGE (6-8 hours)
**Dependencies**: None
**Risks**: Must ensure `source` paths work in Docker containers

---

### Issue 5.2: Duplicate Environment Checks Across Scripts

**Files Affected**:
- `scripts/infra/deploy.sh`
- `scripts/infra/status.sh`
- `keycloak/scripts/sync-realm.sh`
- `keycloak/scripts/docker-sync-realm.sh`

**Current Problem**:
Common patterns repeated:
```bash
# Color definitions (in every script)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Environment parsing
ENV="${1:-dev}"
case "$ENV" in
    dev) ... ;;
    stage) ... ;;
    prod) ... ;;
esac
```

**Proposed Simplification**:
Create a shared library:
```bash
# scripts/lib/common.sh
#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

# Environment validation
validate_environment() {
    local env="${1:-dev}"
    case "$env" in
        dev|stage|prod) echo "$env" ;;
        *) log_error "Unknown environment: $env"; exit 1 ;;
    esac
}
```

**Priority**: MEDIUM
**Estimated Effort**: SMALL (2-3 hours)
**Dependencies**: None
**Risks**: Must ensure sourcing works from different directories

---

### Issue 5.3: Hardcoded VPS IP Addresses (20 Files)

**Scope**: This issue affects **20 files** across the codebase, not just one.

**Files Affected**:
```
scripts/infra/deploy.sh
scripts/infra/status.sh
scripts/infra/keycloak.sh
scripts/infra/rebuild.sh
scripts/infra/rollback.sh
scripts/db/backup.sh
scripts/db/restore.sh
scripts/mcp/health-check.sh
scripts/mcp/restart.sh
scripts/vps/reload-finance-data.sh
scripts/vps/reload-sales-data.sh
scripts/vps/reload-support-data.sh
scripts/vault/vault.sh
scripts/test/e2e-login-with-totp-backup.sh
scripts/test/user-validation.sh
clients/web/.env.example
clients/web/apps/portal/.env.example
infrastructure/terraform/keycloak/environments/stage.tfvars
docs/troubleshooting/VPS_DATA_AVAILABILITY_ISSUES.md
```

**Current Problem**:
```bash
local vps_host="${VPS_HOST:-<HARDCODED_IP>}"  # Actual IP redacted
```

IP addresses should never be hardcoded in source code - this exposes infrastructure details publicly.

**Proposed Simplification**:

1. **Create a `.env.local` file** (git-ignored) for sensitive configuration:
```bash
# scripts/.env.local (NOT committed to git)
VPS_HOST=<your-vps-ip>  # Get from: terraform output vps_ip
VPS_SSH_USER=root
```

2. **Add to `.gitignore`**:
```gitignore
# Local environment files with sensitive data
scripts/.env.local
.env.local
*.env.local
```

3. **Update deploy.sh to source from .env.local**:
```bash
# Load local environment variables if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.local" ]; then
    source "$SCRIPT_DIR/.env.local"
fi

# Require VPS_HOST (no hardcoded default)
local vps_host="${VPS_HOST:-}"
if [ -z "$vps_host" ]; then
    log_error "VPS_HOST not set. Either:"
    log_info "  1. Create scripts/.env.local with VPS_HOST=<ip>"
    log_info "  2. Export VPS_HOST environment variable"
    log_info "  3. Get IP from: cd infrastructure/terraform/vps && terraform output vps_ip"
    exit 1
fi
```

4. **Create `.env.local.example`** (committed) as a template:
```bash
# scripts/.env.local.example
# Copy this file to .env.local and fill in values
# DO NOT commit .env.local to git

# VPS Configuration (get from terraform output)
VPS_HOST=
VPS_SSH_USER=root
```

**Security Benefit**: IP addresses and other infrastructure details are kept out of the public repository.

**Implementation Steps**:

1. **Create central `.env.local` file** at repository root (30 min)
2. **Add `.env.local` to `.gitignore`** (5 min)
3. **Create `.env.local.example` template** (10 min)
4. **Update all 17 shell scripts** to source from `.env.local` (2-3 hours)
5. **Update `.env.example` files** to use empty placeholder: `VPS_HOST=` (15 min)
6. **Update Terraform stage.tfvars** to use variable instead of hardcoded value (15 min)
7. **Update documentation** with placeholders like `<VPS_IP>` or `${VPS_HOST}` (30 min)
8. **Update CLAUDE.md** with new configuration pattern (15 min)
9. **Scrub git history** using `git-filter-repo` to remove IPs from all commits (1-2 hours)
10. **Force push** to all branches/tags after team notification

**File Type Approach**:

| File Type | Pattern |
|-----------|---------|
| Shell scripts | Source `.env.local`, no hardcoded defaults |
| `.env.example` files | Empty placeholder: `VPS_HOST=` |
| Documentation | Placeholder: `<VPS_IP>` or `${VPS_HOST}` |
| Terraform tfvars | Reference variable, not literal IP |
| Git history | Scrub with `git-filter-repo` |

**Git History Scrubbing** (similar to TOTP secret remediation):
```bash
# Create expressions file for git-filter-repo
echo 'regex:([0-9]{1,3}\.){3}[0-9]{1,3}==><REDACTED_IP>' > /tmp/ip-replacements.txt

# Run git-filter-repo (destructive - backup first!)
git filter-repo --replace-text /tmp/ip-replacements.txt

# Force push (requires team notification)
git push --force --all
git push --force --tags
```

**Priority**: HIGH
**Estimated Effort**: MEDIUM-LARGE (6-8 hours total including git history scrubbing)
**Dependencies**: None
**Risks**:
- Existing users/CI pipelines need to create `.env.local` file or set environment variables
- GitHub Actions workflows use secrets (already correct pattern - no change needed)
- Force push requires team coordination
- All team members must re-clone after history rewrite

---

## Implementation Priority Matrix (Revised)

> **Note**: Issue 1.1 (Duplicate Response Types) has been **removed** - would negatively impact test coverage.

| Issue | Priority | Effort | Impact | Coverage Impact | Dependencies |
|-------|----------|--------|--------|-----------------|--------------|
| ~~1.1 Duplicate Response Types~~ | ~~HIGH~~ | ~~MEDIUM~~ | ~~High~~ | 🔴 NEGATIVE | **REMOVED** |
| 5.1 Monolithic sync-realm.sh | HIGH | LARGE | High | ⚪ Neutral | None |
| 5.3 Hardcoded VPS IP (20 files) | HIGH | MEDIUM | High | ⚪ Neutral | None |
| 2.1 Duplicate CallbackPage | MEDIUM | SMALL | Medium | 🟢 Positive | None |
| 1.3 Error Handling Patterns | MEDIUM | SMALL | Medium | 🟢 Positive | None |
| 5.2 Duplicate Script Utils | MEDIUM | SMALL | Medium | ⚪ Neutral | None |
| 1.2 MCP Server Refactoring | MEDIUM | LARGE | High | 🟢 Positive | None |
| 2.2 App Route Structures | LOW | MEDIUM | Low | ⚪ Neutral | 2.1 |
| 2.3 SVG Icons | LOW | SMALL | Low | ⚪ Neutral | None |
| 3.1 Router Logic | LOW | MEDIUM | Low | ⚪ Neutral | None |
| 3.2 JWT Parsing | LOW | SMALL | Low | 🟢 Positive | None |
| 4.1 Cloud Run Abstraction | LOW | LARGE | Low | ⚪ Neutral | None |
| 4.2 VPS Passwords | LOW | SMALL | Low | ⚪ Neutral | None |

---

## Recommended Implementation Order (Revised)

### Sprint 1: Quick Wins + Security Hardening
1. **Issue 5.3**: Remove hardcoded VPS IPs from 20 files, use `.env.local` (4-5 hours)
   - Create `.env.local` pattern with `.gitignore` and `.env.local.example`
   - Update all shell scripts to source from `.env.local`
   - Update documentation to redact IP addresses
2. **Issue 2.1**: Extract CallbackPage to @tamshai/auth (2 hours)
3. **Issue 5.2**: Create scripts/lib/common.sh (2-3 hours)

**Sprint 1 Total**: ~9-10 hours

### Sprint 2: Major Shell Script Refactoring
1. **Issue 5.1**: Split sync-realm.sh into modules (6-8 hours)
2. **Issue 1.3**: Add per-service error handling utilities (2-3 hours per service)

**Sprint 2 Total**: ~8-14 hours

### Sprint 3: MCP Server Improvements (Aligns with Refactoring Plan)
1. **Issue 1.2**: Refactor one MCP server as template (6-8 hours)
   - Start with mcp-support (already has backend abstraction plan)
   - Follow TDD: write tests FIRST, then extract modules
   - Target 90%+ coverage on extracted modules
2. Apply template to remaining MCP servers

**Sprint 3 Total**: ~6-8 hours per service

**Important**: Sprint 3 should follow the exact patterns from `.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md` which successfully improved coverage from 31% → 54%.

### Backlog (Lower Priority)
- Issue 2.2: App route factory (optional - low value)
- Issue 2.3: Icon components (optional)
- Issue 3.1: Flutter router extraction (optional - Flutter code already well-structured)
- Issue 3.2: JWT utilities (optional)
- Issue 4.1: Cloud Run module abstraction (**not recommended** - current structure is clear)
- Issue 4.2: VPS password for_each (optional)

---

## Success Metrics (Revised)

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| ~~Duplicate response.ts files~~ | ~~4~~ | ~~0~~ | **Removed** - intentional for testability |
| sync-realm.sh lines | 1141 | <200 (main script) | Split into lib/ modules |
| CallbackPage implementations | 4+ | 1 | Move to @tamshai/auth |
| Scripts with duplicated logging | 6+ | 1 (common.sh) | Shared shell utilities |
| MCP server test coverage | ~30% | 70%+ | Via refactoring (Issue 1.2) |

### Coverage-Focused Success Metrics

| Metric | Current | Target | Source |
|--------|---------|--------|--------|
| Overall test coverage | 54% | 70%+ | TEST_COVERAGE_STRATEGY.md |
| Diff coverage on new code | 90% | 90% | Enforced by Codecov |
| MCP Gateway coverage | 54% | 70%+ | Refactoring plan Phase 4 |
| Type coverage | 97% | 85%+ | Already exceeds target |

---

## Appendix: File Line Counts

```
services/mcp-gateway/src/index.ts     ~1533 lines (refactoring plan exists)
services/mcp-hr/src/index.ts          ~900 lines
services/mcp-finance/src/index.ts     ~800 lines
services/mcp-sales/src/index.ts       ~850 lines
services/mcp-support/src/index.ts     ~1000 lines
keycloak/scripts/sync-realm.sh        1141 lines
infrastructure/terraform/modules/cloudrun/main.tf  630 lines
infrastructure/terraform/vps/main.tf  409 lines
```

---

## References

- `.specify/specs/003-mcp-gateway/REFACTORING_PLAN.md` - MCP Gateway refactoring (31% → 54% coverage improvement)
- `.specify/specs/003-mcp-gateway/REFACTORING_REVIEW.md` - QA review of refactoring plan
- `.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md` - Test coverage strategy (90% diff coverage)
- `docs/plans/MCP_SUPPORT_BACKEND_ABSTRACTION.md` - Support backend plan
- `CLAUDE.md` - Project coding standards and conventions

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-14 | Initial analysis by code-simplifier agent |
| 1.1 | 2026-01-14 | Revised after reviewing refactoring plan and test coverage strategy. Removed Issue 1.1 (would harm test coverage). Added Test Coverage Impact Analysis section. |
| 1.2 | 2026-01-14 | Expanded Issue 5.3 to cover all 20 files with hardcoded IPs. Updated solution to use `.env.local` pattern (git-ignored) for sensitive configuration. Updated effort estimates. Redacted actual IP addresses from examples. |

---

*Document End*
