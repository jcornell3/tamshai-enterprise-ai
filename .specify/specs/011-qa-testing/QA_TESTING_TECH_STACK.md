# QA/Testing Tech Stack - Tamshai Enterprise AI

**Document Version:** 1.0
**Last Updated:** December 2025
**Status:** Active

---

## Overview

This document provides a comprehensive inventory of all testing tools, frameworks, and libraries used in the Tamshai Enterprise AI project. All tools listed are specifically for QA/testing purposes - this is not a complete project tech stack.

**Scope:** Testing frameworks, mocking libraries, code quality tools, coverage reporting, and security scanning tools.

---

## 1. Test Runners

### 1.1 Jest (Node.js/TypeScript)

**Primary test runner for backend services**

| Service | Version | Config File | Threshold |
|---------|---------|-------------|-----------|
| MCP Gateway | 30.2.0 | package.json (inline) | 29-31% |
| MCP HR | 29.7.0 | jest.config.js | 70% |
| Integration Tests | 30.2.0 | jest.config.js | N/A |

**Configuration Examples:**

**MCP Gateway** (`services/mcp-gateway/package.json`):
```json
{
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/*.test.ts", "**/*.spec.ts"],
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/**/*.test.ts"
    ],
    "transformIgnorePatterns": ["node_modules/(?!(uuid)/)"],
    "coverageThreshold": {
      "global": {
        "branches": 29,
        "functions": 31,
        "lines": 31,
        "statements": 31
      }
    }
  }
}
```

**MCP HR** (`services/mcp-hr/jest.config.js`):
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
```

**Integration Tests** (`tests/integration/jest.config.js`):
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testTimeout: 120000,  // 120 seconds for SSE streaming
  maxWorkers: 1,        // Sequential execution to avoid race conditions
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  bail: false
};
```

**Features:**
- Built-in coverage via Istanbul
- Parallel test execution (configurable)
- Snapshot testing
- Mocking utilities
- TypeScript support via ts-jest

**Usage:**
```bash
npm test                    # Run tests
npm test -- --coverage     # With coverage
npm test -- --watch        # Watch mode
```

---

### 1.2 flutter_test (Dart/Flutter)

**SDK-built-in testing framework for Flutter client**

**Location:** `clients/unified_flutter/`
**Version:** SDK built-in (Flutter stable channel)
**Test Files:** 7 test files

**Test Inventory:**
- `test/core/auth/services/keycloak_auth_service_test.dart` - OAuth authentication
- `test/core/auth/providers/auth_provider_test.dart` - Auth state management
- `test/core/api/token_interceptor_test.dart` - HTTP interceptor
- `test/features/chat/widgets/chat_input_test.dart` - Chat input widget
- `test/features/chat/widgets/message_bubble_test.dart` - Message rendering
- `test/features/chat/widgets/approval_card_test.dart` - HITL confirmation UI
- `test/widget_test.dart` - General widget tests

**Usage:**
```bash
cd clients/unified_flutter
flutter test                 # Run all tests
flutter test --coverage      # With coverage
flutter analyze             # Static analysis
```

**Coverage:**
- Target: 70% (spec requirement)
- Current: Basic line count metrics
- Format: LCOV

---

### 1.3 Playwright (E2E Testing)

**End-to-end testing with browser automation**

**Version:** 1.40.0
**Location:** `tests/e2e/`
**Config:** `playwright.config.ts`

**Test Projects:**
1. **API Tests** (`*.api.spec.ts`)
   - Direct HTTP testing
   - No browser automation
   - Fast execution

2. **UI Tests** (`*.ui.spec.ts`)
   - Chromium/Desktop Chrome
   - Full browser automation
   - Visual regression testing

**Configuration:**
```typescript
export default defineConfig({
  fullyParallel: true,
  reporter: [['html'], ['list'], ['github']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'API', testMatch: /.*\.api\.spec\.ts/ },
    { name: 'UI', testMatch: /.*\.ui\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
```

**Usage:**
```bash
cd tests/e2e
npm test                    # Run all E2E tests
npm run test:ui            # UI mode (live browser)
npm run test:headed        # Show browser window
npm run test:report        # HTML report
```

**Features:**
- Multi-browser support (Chromium, Firefox, WebKit)
- Built-in trace recording
- Screenshot on failure
- GitHub CI integration
- Auto web server startup

---

### 1.4 k6 (Performance/Load Testing)

**Grafana k6 for load and performance testing**

**Version:** Latest (via GitHub Actions)
**Location:** `tests/performance/scenarios/gateway-load.js`
**Integration:** GitHub Actions only

**Test Scenarios:**
- **Smoke Test:** 3 VUs, 15 seconds duration
- **Normal Load:** 10 VUs, 30 seconds
- **Peak Load:** 50 VUs, 60 seconds (planned)
- **Stress:** 100 VUs, 120 seconds (planned)
- **Soak:** 20 VUs, 1 hour (planned)

**Usage:**
```bash
k6 run tests/performance/scenarios/gateway-load.js
```

**Metrics:**
- Response time: p95 < 500ms, p99 < 1s
- Error rate: < 1%
- Throughput: requests per second
- Virtual users: concurrent connections

---

## 2. Mocking & Test Utilities

### 2.1 ioredis-mock

**In-memory Redis mock for unit tests**

**Version:** 8.13.1
**Location:** `services/mcp-gateway/src/__mocks__/ioredis.ts` (custom implementation)
**Purpose:** Mock Redis operations in unit tests

**Features:**
- In-memory store simulation
- TTL support with expiration
- Pattern matching (KEYS with regex)
- Test utilities: `__clear()`, `__getStore()`

**Supported Operations:**
- `get`, `set`, `setex`
- `exists`, `del`
- `keys` (with pattern matching)
- `ttl`, `quit`

**Custom Mock Implementation:**
```typescript
// services/mcp-gateway/src/__mocks__/ioredis.ts
class MockRedis {
  private store = new Map<string, { value: string; expiry?: number }>();

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiry: Date.now() + seconds * 1000,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
}
```

**Usage:**
```typescript
jest.mock('ioredis', () => require('ioredis-mock'));
import redis from './redis';

// Tests can use redis as normal
await redis.set('key', 'value');
const result = await redis.get('key');
```

---

### 2.2 supertest

**HTTP assertion library for Express testing**

**Version:** 7.1.4
**Used In:** MCP Gateway
**Purpose:** Test Express endpoints without starting server

**Features:**
- Request/response simulation
- Chainable assertions
- Async/await support
- Cookie handling

**Usage:**
```typescript
import request from 'supertest';
import express from 'express';
import healthRoutes from './routes/health.routes';

const app = express();
app.use(healthRoutes);

test('returns 200 when system is healthy', async () => {
  const response = await request(app).get('/health');

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('status', 'healthy');
});
```

---

### 2.3 ts-jest

**TypeScript preprocessor for Jest**

**Version:** 29.1.1
**Used In:** All TypeScript services
**Purpose:** Compile TypeScript to JavaScript during test execution

**Configuration:**
```json
{
  "jest": {
    "preset": "ts-jest",
    "transform": {
      "^.+\\.ts$": "ts-jest"
    }
  }
}
```

**Features:**
- TypeScript compilation on-the-fly
- Source map support for debugging
- Type checking during tests
- tsconfig.json integration

---

### 2.4 Custom Mocks

**Keycloak Auth Service Mock** (Flutter)
```dart
class MockSecureStorageService extends Mock implements SecureStorageService {}

test('extracts JWT claims correctly', () {
  final mockStorage = MockSecureStorageService();
  when(() => mockStorage.read(key: 'access_token'))
      .thenAnswer((_) async => 'mock-jwt-token');

  final authService = KeycloakAuthService(storage: mockStorage);
  // Test auth service behavior
});
```

---

## 3. Code Quality Tools

### 3.1 TypeScript

**Type checking for JavaScript code**

| Service | Version | Config | Mode |
|---------|---------|--------|------|
| MCP Gateway | 5.3.2 | tsconfig.json | strict |
| MCP HR | 5.3.2 | tsconfig.json | strict |
| MCP Finance | 5.7.2 | tsconfig.json | strict |
| MCP Sales | 5.7.2 | tsconfig.json | strict |
| MCP Support | 5.7.2 | tsconfig.json | strict |
| Integration Tests | 5.3.2 | tsconfig.json | strict |

**Usage:**
```bash
npm run typecheck          # Type check without compiling
tsc --noEmit              # TypeScript compiler (no output)
```

**Benefits:**
- Catch type errors before runtime
- IDE autocomplete and refactoring
- Self-documenting code
- Safer refactoring

---

### 3.2 type-coverage

**Type coverage enforcement tool**

**Version:** 2.27.0
**Used In:** MCP Gateway
**Threshold:** 85% minimum

**Configuration:**
```bash
npx type-coverage --at-least 85 \
  --ignore-catch \
  --ignore-files "**/*.test.ts" \
  --ignore-files "**/__mocks__/**"
```

**CI Integration:**
- Runs on MCP Gateway (Node 20)
- Non-blocking (continues on error)
- Report uploaded as artifact (30-day retention)

**Purpose:**
- Ensure strong typing throughout codebase
- Prevent `any` type abuse
- Track type safety over time

---

### 3.3 ESLint

**JavaScript/TypeScript linting**

**Version:** 9.39.2
**Used In:** MCP Gateway
**Config:** Inline in package.json or eslint.config.js

**Rules:**
- `@typescript-eslint/eslint-plugin` 8.50.1
- `@typescript-eslint/parser` 8.50.1
- `typescript-eslint` 8.50.1

**Usage:**
```bash
npm run lint              # Check for issues
npm run lint -- --fix     # Auto-fix issues
```

**Checks:**
- Code style consistency
- Potential bugs (unused variables, missing returns)
- TypeScript-specific issues (no-explicit-any, no-require-imports)
- Import/export patterns

---

### 3.4 flutter_lints

**Dart code quality rules**

**Version:** 6.0.0
**Used In:** Flutter unified client
**Config:** `analysis_options.yaml`

**Purpose:**
- Official Flutter linting rules
- Dart analyzer integration
- Code style enforcement

**Usage:**
```bash
flutter analyze             # Run analyzer
flutter analyze --no-fatal-infos  # CI mode
```

---

## 4. Coverage & Reporting

### 4.1 Codecov

**Coverage reporting and diff coverage enforcement**

**Integration:** GitHub Actions
**Config:** `codecov.yml`
**Flags:** `gateway`, `flutter`

**Coverage Enforcement:**
- **Patch (Diff) Coverage:** 90% required (BLOCKS PRs)
- **Project Coverage:** auto (trend tracking, informational)

**Configuration:**
```yaml
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 1%
        informational: true
    patch:
      default:
        target: 90%
        threshold: 0%
        informational: false  # BLOCKS PR
```

**Upload:**
```bash
- uses: codecov/codecov-action@v4
  with:
    files: services/mcp-gateway/coverage/lcov.info
    flags: gateway
    token: ${{ secrets.CODECOV_TOKEN }}
```

**Features:**
- Historical trend tracking
- Diff coverage per PR
- Multi-flag support (gateway, flutter)
- PR comments with coverage delta

---

### 4.2 Jest Coverage (Istanbul)

**Code coverage instrumentation**

**Tool:** Istanbul (via Jest)
**Formats:** LCOV, text, HTML
**Thresholds:** Service-dependent (29-70%)

**Configuration:**
```json
{
  "jest": {
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/**/*.test.ts"
    ],
    "coverageReporters": ["text", "lcov", "html"]
  }
}
```

**Usage:**
```bash
npm test -- --coverage                    # Generate coverage
npm test -- --coverage --coverageReporters=text  # Console output
```

**Metrics:**
- **Statements:** Lines of code executed
- **Branches:** Conditional branches taken
- **Functions:** Functions called
- **Lines:** Physical lines executed

---

## 5. Security Scanning Tools

### 5.1 CodeQL

**Static Application Security Testing (SAST)**

**Version:** v4 (GitHub Action)
**Language:** JavaScript/TypeScript
**Query Level:** `security-extended`

**Schedule:**
- Weekly scan (Sunday)
- On push to main
- On pull requests

**Configuration:**
```yaml
- uses: github/codeql-action/init@v4
  with:
    languages: javascript
    queries: security-extended
```

**Checks:**
- SQL injection
- XSS/CSRF vulnerabilities
- Unsafe deserialization
- Hard-coded secrets
- Path traversal
- Command injection
- Type confusion

**Results:** Uploaded to GitHub Security tab as SARIF

---

### 5.2 Gitleaks

**Secret detection in commits**

**Version:** 8.22.1
**Config:** `.gitleaks.toml`
**Integration:** Pre-commit + GitHub Actions

**Custom Rules:**
1. **Anthropic API Key:**
   ```toml
   [[rules]]
   id = "anthropic-api-key"
   description = "Anthropic API Key"
   regex = '''sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}'''
   entropy = 3.5
   keywords = ["sk-ant-api"]
   ```

2. **Keycloak Client Secret:**
   ```toml
   [[rules]]
   id = "keycloak-client-secret"
   description = "Keycloak Client Secret"
   regex = '''client[_-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9_-]{20,})["']'''
   entropy = 3.0
   ```

**Allowlist:**
- `[REDACTED*]` placeholders
- Test fixtures (`test-*-secret`, `mock-*-key`)
- Development examples

**Usage:**
```bash
gitleaks detect --verbose          # Scan repository
gitleaks protect --staged         # Pre-commit hook
```

---

### 5.3 detect-secrets

**AWS credentials and private key detection**

**Version:** 1.5.0
**Config:** `.secrets.baseline`
**Integration:** Pre-commit

**Detects:**
- AWS access keys
- Private keys (RSA, SSH)
- High entropy strings
- Base64-encoded secrets

**Usage:**
```bash
detect-secrets scan --baseline .secrets.baseline
detect-secrets audit .secrets.baseline
```

---

### 5.4 npm audit

**Node.js dependency vulnerability scanning**

**Severity:** HIGH and above
**Frequency:** Every push/PR
**Blocking:** YES (fails CI)

**Usage:**
```bash
npm audit                       # Show vulnerabilities
npm audit --audit-level=high   # CI enforcement
npm audit fix                  # Auto-fix where possible
```

**Integration:**
```yaml
- name: Security audit
  run: npm audit --audit-level=high
  working-directory: services/mcp-gateway
```

---

### 5.5 tfsec

**Terraform security scanning**

**Version:** 1.0.3
**Target:** `infrastructure/terraform/`
**Blocking:** YES

**Checks:**
- IAM misconfigurations
- Unencrypted storage
- Public access exposure
- Security group rules
- Secret management

**Usage:**
```bash
tfsec infrastructure/terraform/ --soft-fail=false
```

---

### 5.6 Trivy

**Container vulnerability scanning**

**Version:** Latest (via GitHub Action)
**Format:** SARIF (uploaded to GitHub Security)
**Blocking:** NO (informational)

**Scans:**
- OS package vulnerabilities
- Application dependencies
- Misconfigurations
- Secrets in images

**Usage:**
```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: mcp-gateway:latest
    format: 'sarif'
    output: 'trivy-results.sarif'
```

---

## 6. Additional Testing Tools

### 6.1 Code Generation (Flutter)

**build_runner** (v2.5.4)
- Orchestrates code generation
- Runs freezed and json_serializable

**freezed** (v2.5.7)
- Generates immutable data classes
- Sealed unions

**json_serializable** (v6.8.0)
- JSON serialization code generation

**Usage:**
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

---

### 6.2 Runtime Execution

**tsx** (v4.6.0, v4.19.2)
- TypeScript execution without compilation
- Development server: `tsx watch src/index.ts`
- CI execution

---

### 6.3 Pre-commit Framework

**Version:** Various (see `.pre-commit-config.yaml`)

**Hooks:**
- Trailing whitespace removal
- End-of-file fixing
- YAML validation
- JSON validation
- Large file detection (1MB limit)
- Merge conflict detection

**Linters:**
- **Hadolint** (v2.12.0) - Dockerfile linting
- **ShellCheck** (v0.10.0) - Shell script validation
- **yamllint** (v1.35.1) - YAML formatting
- **markdownlint-cli** (v0.43.0) - Markdown style

**Installation:**
```bash
pre-commit install             # Install hooks
pre-commit run --all-files    # Run on all files
```

---

## 7. Tool Version Matrix

| Tool | Version | Category | Services | Purpose |
|------|---------|----------|----------|---------|
| **jest** | 30.2.0 / 29.7.0 | Test Runner | Gateway, HR, Integration | Unit/Integration tests |
| **flutter_test** | SDK built-in | Test Framework | Flutter client | Widget/unit tests |
| **@playwright/test** | 1.40.0 | E2E Testing | E2E tests | Browser automation |
| **k6** | Latest | Performance | CI only | Load testing |
| **ioredis-mock** | 8.13.1 | Mocking | Gateway | Redis mock |
| **supertest** | 7.1.4 | HTTP Testing | Gateway | Express endpoint testing |
| **ts-jest** | 29.1.1 | TypeScript | All TS services | TS compilation for Jest |
| **TypeScript** | 5.3.2 - 5.7.2 | Type Checking | All services | Type safety |
| **type-coverage** | 2.27.0 | Type Quality | Gateway | 85% type coverage |
| **eslint** | 9.39.2 | Linting | Gateway | Code style |
| **@typescript-eslint/*** | 8.50.1 | TS Linting | Gateway | TypeScript rules |
| **flutter_lints** | 6.0.0 | Dart Linting | Flutter | Dart code quality |
| **Codecov** | v4 | Coverage | All | Diff coverage enforcement |
| **CodeQL** | v4 | SAST | All | Security scanning |
| **Gitleaks** | 8.22.1 | Secret Detection | All | Credential leaks |
| **detect-secrets** | 1.5.0 | Secret Detection | All | AWS/key detection |
| **npm audit** | Built-in | Dependency Scan | Node services | Vulnerability scanning |
| **tfsec** | 1.0.3 | IaC Security | Terraform | Infrastructure scanning |
| **Trivy** | Latest | Container Scan | Docker images | Image vulnerabilities |
| **tsx** | 4.6.0 - 4.19.2 | Transpiler | Dev/CI | TypeScript execution |
| **build_runner** | 2.5.4 | Code Generator | Flutter | Orchestration |
| **freezed** | 2.5.7 | Code Generator | Flutter | Data classes |
| **json_serializable** | 6.8.0 | Code Generator | Flutter | JSON serialization |

---

## 8. Test File Inventory

### Node.js/TypeScript Tests (283 total tests)

**MCP Gateway** (10 test files):
- `src/security/prompt-defense.test.ts`
- `src/security/token-revocation.test.ts`
- `src/utils/pii-scrubber.test.ts`
- `src/utils/gateway-utils.test.ts`
- `src/utils/redis.test.ts`
- `src/routes/health.routes.test.ts`
- `src/routes/user.routes.test.ts`
- `src/routes/gdpr.test.ts`
- `src/types/mcp-response.test.ts`
- `src/index.routes.test.ts`

**Integration Tests** (4 test files):
- `tests/integration/rbac.test.ts` - Role-based access control
- `tests/integration/mcp-tools.test.ts` - MCP tool integration
- `tests/integration/query-scenarios.test.ts` - Query handling
- `tests/integration/sse-streaming.test.ts` - SSE streaming

**MCP HR** (Multiple test files):
- `src/tools/list-employees.test.ts`
- Additional tool tests

### Flutter/Dart Tests (7 test files):
- `test/core/auth/services/keycloak_auth_service_test.dart`
- `test/core/auth/providers/auth_provider_test.dart`
- `test/core/api/token_interceptor_test.dart`
- `test/features/chat/widgets/chat_input_test.dart`
- `test/features/chat/widgets/message_bubble_test.dart`
- `test/features/chat/widgets/approval_card_test.dart`
- `test/widget_test.dart`

---

## 9. Configuration Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `services/mcp-gateway/package.json` | Jest config + dependencies | 86 |
| `services/mcp-hr/jest.config.js` | HR service test config | 29 |
| `tests/integration/jest.config.js` | Integration test runner | 19 |
| `tests/integration/jest.setup.js` | Global test setup | 308 |
| `tests/e2e/playwright.config.ts` | E2E configuration | 42 |
| `clients/unified_flutter/pubspec.yaml` | Flutter dependencies | 58 |
| `services/mcp-gateway/src/__mocks__/ioredis.ts` | Redis mock | 75 |
| `.gitleaks.toml` | Secret detection rules | ~100 |
| `.secrets.baseline` | Detect-secrets baseline | ~50 |
| `.pre-commit-config.yaml` | Pre-commit hooks | ~80 |
| `codecov.yml` | Coverage enforcement | 38 |

---

## 10. Key References

**Testing Specifications:**
- `.specify/specs/011-qa-testing/spec.md` - Complete testing requirements
- `.specify/specs/011-qa-testing/plan.md` - Implementation phases
- `.specify/specs/011-qa-testing/tasks.md` - Actionable tasks

**CI/CD Configuration:**
- `.github/workflows/ci.yml` - Primary testing pipeline
- `.github/workflows/codeql.yml` - Security scanning
- `.github/codeql/codeql-config.yml` - CodeQL configuration

**Architecture:**
- `docs/architecture/constitution.md` - Article III.1 (Testing requirements)
- `.specify/ARCHITECTURE_SPECS.md` - Spec compliance matrix

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2025 | Initial documentation - complete QA tool inventory |

---

**Next:** See `TESTING_CI_CD_CONFIG.md` for GitHub workflow documentation and `TEST_COVERAGE_STRATEGY.md` for coverage metrics and strategy.
