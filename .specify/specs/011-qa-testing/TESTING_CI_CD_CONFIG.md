# Testing CI/CD Configuration - Tamshai Enterprise AI

**Document Version:** 1.1
**Last Updated:** January 2026
**Status:** Active

---

## Overview

This document describes all GitHub Actions workflows, branch protection rules, secrets, and CI/CD configurations related to testing in the Tamshai Enterprise AI project.

**Scope:** Testing automation, security scanning, coverage reporting, and quality gates in GitHub CI/CD.

---

## 1. GitHub Actions Workflows

### 1.1 Primary Workflow: ci.yml

**File:** `.github/workflows/ci.yml`
**Triggers:** Push to main, Pull requests, Manual dispatch
**Total Jobs:** 13 testing/quality jobs

**Concurrency Control:**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
- Cancels older runs on same branch when new commit pushed
- Prevents duplicate test runs on force pushes

**Permissions (Default):**
```yaml
permissions:
  contents: read  # Minimal permissions by default
```

---

### 1.2 Testing Jobs Matrix

| Job Name | Trigger | Duration | Blocking | Purpose |
|----------|---------|----------|----------|---------|
| **gateway-lint-test** | Push/PR | ~3-5 min | ✅ YES | Type check, lint, unit tests, coverage |
| **flutter-analyze-test** | Push/PR | ~2-3 min | ✅ YES | Flutter analyze + unit tests |
| **flutter-build** | Push/PR | ~5-7 min | ❌ NO | Linux build verification |
| **integration-tests** | Main only | ~10-15 min | ✅ YES | RBAC, MCP tools, SSE, queries |
| **e2e-tests** | Main only | ~8-12 min | ✅ YES | Playwright API/UI tests |
| **performance-tests** | Main only | ~5 min | ❌ NO | k6 load testing (soft fail) |
| **security-scan** | Push/PR | ~2 min | ✅ YES | npm audit (HIGH+) |
| **terraform-security** | Push/PR | ~2 min | ✅ YES | tfsec IaC scanning |
| **qlty-check** | Push/PR | ~3 min | ❌ NO | Static analysis |
| **pre-commit** | Push/PR | ~2 min | ✅ YES | Gitleaks, secrets |
| **docker-build** | Push/PR | ~5 min | ✅ YES | Container build verification |
| **container-scan** | Main only | ~3 min | ❌ NO | Trivy vulnerability scan |
| **sbom** | Main only | ~2 min | ❌ NO | Software bill of materials |

**Total Pipeline Duration:**
- **Fast path (PR):** ~5-8 minutes (lint + unit tests)
- **Full path (main):** ~15-20 minutes (all jobs)

---

## 2. Job Details

### 2.1 gateway-lint-test

**Purpose:** Type checking, linting, unit tests, coverage for MCP Gateway

**Matrix Strategy:**
```yaml
strategy:
  matrix:
    node-version: ['20', '22']
  fail-fast: false
```
- Tests on **Node.js 20** and **Node.js 22**
- Both versions must pass
- Fail-fast disabled (runs both even if one fails)

**Steps:**
1. **Type Checking** (`npm run typecheck`)
   - TypeScript compiler without emitting code
   - Catches type errors early
   - Blocks if type errors found

2. **Linting** (`npm run lint`)
   - ESLint with TypeScript rules
   - Enforces code style
   - Blocks on violations

3. **Unit Tests** (`npm test -- --coverage`)
   - Jest test runner
   - 10 test suites, 283 tests
   - Coverage formats: text + LCOV
   - **Coverage thresholds enforced:**
     - Branches: 29%
     - Functions: 31%
     - Lines: 31%
     - Statements: 31%
   - **Build fails if thresholds not met**

4. **Type Coverage** (Node 20 only)
   ```bash
   npx type-coverage --at-least 85 \
     --ignore-catch \
     --ignore-files "**/*.test.ts" \
     --ignore-files "**/__mocks__/**"
   ```
   - Minimum: **85% type coverage**
   - Non-blocking (continues on error)
   - Report uploaded as artifact (30-day retention)

5. **Coverage Upload** (Node 20 only)
   ```yaml
   - uses: codecov/codecov-action@v4
     with:
       files: services/mcp-gateway/coverage/lcov.info
       flags: gateway
       token: ${{ secrets.CODECOV_TOKEN }}
       fail_ci_if_error: false
   ```

**Services:**
- **Redis** (7-alpine)
  - Port: 6379
  - Health check: `redis-cli ping`
  - Used for token revocation tests

---

### 2.2 flutter-analyze-test

**Purpose:** Flutter code analysis and unit tests

**Steps:**
1. **Setup Flutter** (stable channel)
   ```yaml
   - uses: subosito/flutter-action@v2
     with:
       flutter-version: 'stable'
       channel: 'stable'
       cache: true
   ```

2. **Get Dependencies**
   ```bash
   flutter pub get
   ```

3. **Code Analysis**
   ```bash
   flutter analyze --no-fatal-infos
   ```
   - Runs Dart analyzer
   - Warns on issues but doesn't fail build
   - 7 test files analyzed

4. **Unit Tests**
   ```bash
   flutter test --coverage
   ```
   - Generates LCOV coverage report
   - Tests: 7 files (auth, API, widgets)

5. **Coverage Upload**
   ```yaml
   - uses: codecov/codecov-action@v4
     with:
       files: clients/unified_flutter/coverage/lcov.info
       flags: flutter
       fail_ci_if_error: false
   ```

---

### 2.3 flutter-build

**Purpose:** Verify Flutter builds successfully on Linux

**Dependency:** `needs: flutter-analyze-test`

**Steps:**
1. Setup Flutter (stable)
2. Get dependencies
3. **Build for Linux (release mode)**
   ```bash
   flutter build linux --release
   ```
4. **Non-blocking** (continues even on failure)

---

### 2.4 integration-tests

**Purpose:** Integration tests for RBAC, MCP tools, SSE streaming

**Trigger:** Main branch pushes only
**Dependency:** `needs: gateway-lint-test`

**Services:**
- Redis 7-alpine (port 6379)

**Environment:**
```yaml
env:
  REDIS_HOST: localhost
  REDIS_PORT: 6379
```

**Test Files (96 tests total, 89 passed, 7 skipped):**
- `rbac.test.ts` - Role-based access control flows
- `mcp-tools.test.ts` - MCP tool integration (19 tools)
- `query-scenarios.test.ts` - Query handling and cursor-based pagination
- `sse-streaming.test.ts` - SSE response streaming and error handling

**Configuration:**
- `jest.config.js` in `tests/integration/`
- **Timeout:** 120 seconds (for SSE tests)
- **Max Workers:** 1 (sequential execution to avoid race conditions)
- **Setup:** `jest.setup.js` (service health checks, Keycloak tokens)

**Key Setup Features:**
```javascript
// jest.setup.js
beforeAll(async () => {
  // 1. Health check all services
  await checkServiceHealth('http://127.0.0.1:3100/health');  // MCP Gateway
  await checkServiceHealth('http://127.0.0.1:8180/health');  // Keycloak

  // 2. Acquire test user tokens
  const token = await getKeycloakToken('alice.chen', PASSWORD);

  // 3. Temporarily disable TOTP for testing
  await removeConfigureTotpAction('alice.chen');
}, 60000);  // 60 second timeout

afterAll(async () => {
  // Restore TOTP requirement
  await restoreConfigureTotpAction('alice.chen');
}, 30000);
```

---

### 2.5 e2e-tests

**Purpose:** End-to-end tests with Playwright

**Trigger:** Main branch pushes only
**Dependency:** `needs: gateway-lint-test`

**Services:**
- Redis 7-alpine

**Steps:**
1. Build MCP Gateway
   ```bash
   npm run build
   ```

2. Start Gateway in background
   ```bash
   npm start &
   sleep 5  # Allow startup
   ```

3. Install Playwright browsers
   ```bash
   cd tests/e2e
   npx playwright install chromium
   ```

4. Run E2E tests
   ```bash
   npm test
   ```
   - API tests: `*.api.spec.ts`
   - UI tests: `*.ui.spec.ts` (Chromium)

5. Upload Playwright report (7-day retention)

**Environment:**
```yaml
env:
  GATEWAY_URL: http://localhost:3100
  CI: true
```

---

### 2.6 performance-tests

**Purpose:** k6 load testing

**Trigger:** Main branch pushes only
**Failure Handling:** `continue-on-error: true` (non-blocking)

**Steps:**
1. Install k6
   ```bash
   curl https://github.com/grafana/k6/releases/download/v0.46.0/k6-v0.46.0-linux-amd64.tar.gz -L | tar xvz
   ```

2. Run smoke test
   ```bash
   k6 run tests/performance/scenarios/gateway-load.js
   ```
   - Virtual users: 3
   - Duration: 15 seconds
   - Checks: Response time, error rate

3. Upload summary results (7-day retention)

---

### 2.7 security-scan

**Purpose:** npm dependency vulnerability scanning

**Trigger:** Push/PR
**Blocking:** YES (fails CI on HIGH+ vulnerabilities)

**Steps:**
```bash
npm ci
npm audit --audit-level=high
```

**Severity Threshold:** HIGH and above
- Critical: ✅ Blocks
- High: ✅ Blocks
- Moderate: ❌ Allowed
- Low: ❌ Allowed

---

### 2.8 terraform-security

**Purpose:** Terraform IaC security scanning with tfsec

**Trigger:** Push/PR
**Blocking:** YES

**Steps:**
```yaml
- uses: aquasecurity/tfsec-action@v1.0.3
  with:
    soft-fail: false
```

**Scans:**
- `infrastructure/terraform/vps`
- `infrastructure/terraform/` (main)

**Checks:**
- IAM misconfigurations
- Unencrypted storage
- Public access exposure
- Security group rules

---

### 2.9 qlty-check

**Purpose:** Static analysis aggregator

**Trigger:** Push/PR
**Blocking:** NO (informational)
**Permissions:** `security-events: write`

**Steps:**
```yaml
- uses: qlty/check-action@main
  with:
    upload-results: true
```

---

### 2.10 pre-commit

**Purpose:** Pre-commit hook validation (Gitleaks, detect-secrets)

**Trigger:** Push/PR
**Blocking:** YES (on secret detection)

**Hooks Run:**
1. **Gitleaks** - Secret detection
2. **detect-secrets** - AWS credentials
3. **Trailing whitespace**
4. **End-of-file fixing**
5. **YAML validation**
6. **JSON validation**
7. **Large file detection** (1MB limit)
8. **Merge conflict detection**

**Linters:**
- Hadolint (Dockerfile)
- ShellCheck (shell scripts)
- yamllint (YAML formatting)
- markdownlint (Markdown style)

---

### 2.11 docker-build

**Purpose:** Verify Docker images build successfully

**Trigger:** Push/PR
**Blocking:** YES

**Steps:**
```yaml
- uses: docker/build-push-action@v5
  with:
    context: services/mcp-gateway
    push: false  # Don't push, just verify build
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Features:**
- Buildx for layer caching
- GitHub Actions cache
- Multi-stage builds verified

---

### 2.12 container-scan

**Purpose:** Trivy container vulnerability scanning

**Trigger:** Main branch only
**Blocking:** NO (informational)

**Steps:**
```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: mcp-gateway:latest
    format: 'sarif'
    output: 'trivy-results.sarif'
```

**Upload:** SARIF to GitHub Security tab

---

### 2.13 sbom

**Purpose:** Software Bill of Materials generation

**Trigger:** Main branch only
**Blocking:** NO

**Formats:**
- SPDX (standard)
- CycloneDX (industry standard)

**Retention:** 90 days

---

## 3. CodeQL Workflow

### 3.1 codeql.yml

**File:** `.github/workflows/codeql.yml`
**Purpose:** Static application security testing (SAST)

**Schedule:**
```yaml
schedule:
  - cron: '0 0 * * 0'  # Weekly on Sunday
```

**Triggers:**
- Weekly scan (Sunday midnight)
- Push to main branch
- Pull requests to main

**Configuration:**
```yaml
- uses: github/codeql-action/init@v4
  with:
    languages: javascript
    config-file: .github/codeql/codeql-config.yml
```

**Config File:** `.github/codeql/codeql-config.yml`
```yaml
name: "CodeQL Config"
queries:
  - uses: security-extended

paths:
  - services/**
  - clients/unified_flutter/lib/**
  - clients/unified_flutter/test/**
  - tests/**
  - apps/**

paths-ignore:
  - '**/node_modules/**'
  - clients/unified/**  # Deprecated
  - clients/desktop/**  # Deprecated
  - clients/unified_flutter/android/**
  - clients/unified_flutter/ios/**
  - clients/unified_flutter/build/**
  - '**/build/**'
  - '**/dist/**'
  - '**/coverage/**'
  - '**/__mocks__/**'
  - '**/__fixtures__/**'
  - '**/*.g.dart'  # Generated
  - '**/*.freezed.dart'  # Generated
```

**Query Level:** `security-extended`
- SQL injection
- XSS/CSRF
- Unsafe deserialization
- Hard-coded secrets
- Path traversal
- Command injection
- Type confusion

**Results:** Uploaded as SARIF to GitHub Security tab

---

## 4. Pre-commit Hooks

### 4.1 Configuration File

**File:** `.pre-commit-config.yaml`

**Installation:**
```bash
pre-commit install              # Install hooks locally
pre-commit run --all-files     # Run on all files
```

**CI Integration:** Runs in GitHub Actions on every push/PR

---

### 4.2 Secret Detection Hooks

#### Gitleaks (v8.22.1)

**Config:** `.gitleaks.toml`

**Custom Rules:**

**Rule 1: Anthropic API Key**
```toml
[[rules]]
id = "anthropic-api-key"
description = "Anthropic Claude API Key"
regex = '''sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}'''
entropy = 3.5
keywords = ["sk-ant-api"]
```

**Rule 2: Keycloak Client Secret**
```toml
[[rules]]
id = "keycloak-client-secret"
description = "Keycloak OAuth2 Client Secret"
regex = '''client[_-]?secret["']?\s*[:=]\s*["']([A-Za-z0-9_-]{20,})["']'''
entropy = 3.0
allowlist:
  regexes = [
    '''mcp-gateway-secret''',
    '''[REDACTED-DEV-PASSWORD]'''
  ]
```

**Allowlist Patterns:**
- `[REDACTED*]` - Redacted credentials
- `test-*-secret` - Test fixtures
- `mock-*-key` - Mock data
- `example.com` - Examples
- `your-*-here` - Placeholder text

**Allowlisted Paths:**
- `node_modules/`
- `.git/`
- `pubspec.lock`
- `package-lock.json`
- `**/*.g.dart` (generated)
- `keycloak/realm-export*.json` (marked [REDACTED])

---

#### detect-secrets (v1.5.0)

**Config:** `.secrets.baseline`

**Detects:**
- AWS access keys (AKIA...)
- Private keys (RSA, SSH, PEM)
- High entropy strings (Base64)
- Generic secrets

**Excluded Files:**
- `package-lock.json`
- `pubspec.lock`

**Usage:**
```bash
detect-secrets scan --baseline .secrets.baseline
detect-secrets audit .secrets.baseline  # Review findings
```

---

### 4.3 Code Quality Hooks

#### Standard Hooks (v5.0.0)

1. **trailing-whitespace** - Remove trailing spaces
2. **end-of-file-fixer** - Ensure newline at EOF
3. **check-yaml** - Validate YAML syntax
4. **check-json** - Validate JSON syntax
5. **check-added-large-files** - Block files > 1MB
6. **check-merge-conflict** - Detect merge markers

---

#### Linters

**1. Hadolint** (v2.12.0)
```yaml
- repo: https://github.com/hadolint/hadolint
  hooks:
    - id: hadolint-docker
```
- Checks Dockerfile best practices
- DL3008, DL3009, DL3015, etc.

**2. ShellCheck** (v0.10.0)
```yaml
- repo: https://github.com/shellcheck-py/shellcheck-py
  hooks:
    - id: shellcheck
```
- Bash/sh script validation
- Detects common shell scripting errors

**3. yamllint** (v1.35.1)
```yaml
- repo: https://github.com/adrienverge/yamllint
  hooks:
    - id: yamllint
      args: [--format, parsable, --strict, -d, '{rules: {line-length: {max: 150}}}']
```
- YAML formatting and style
- Max line length: 150 characters

**4. markdownlint-cli** (v0.43.0)
```yaml
- repo: https://github.com/igorshubovych/markdownlint-cli
  hooks:
    - id: markdownlint
      args: [--fix, --disable, MD013, MD032, MD033, MD036, MD041]
```
- Markdown linting
- Auto-fixes common issues
- Disabled rules: line length, HTML, emphasis

---

## 5. Branch Protection Rules

### 5.1 Main Branch Protection

**Branch:** `main`

**Required Status Checks:**
- ✅ `gateway-lint-test` (Node 20)
- ✅ `gateway-lint-test` (Node 22)
- ✅ `flutter-analyze-test`
- ✅ `CodeQL`
- ✅ `security-scan`
- ✅ `pre-commit`

**Additional Rules:**
- ✅ Require linear history (no merge commits)
- ✅ Block force pushes
- ⚠️ Require signed commits (recommended, not enforced)
- ✅ Require PR before merging
- ✅ Dismiss stale PR approvals when new commits pushed

**Pull Request Requirements:**
- At least 1 approval (recommended)
- All conversations resolved
- All status checks passing

---

## 6. GitHub Secrets & Variables

### 6.1 Repository Secrets

**Required:**
- `CODECOV_TOKEN` - Codecov upload authentication
  - Type: Codecov upload token
  - Used by: `codecov/codecov-action@v4`
  - Scope: Coverage reporting

**Optional:**
- `ANTHROPIC_API_KEY` - Claude API key
  - Type: Anthropic API key
  - Used by: Integration tests (if testing real AI)
  - Scope: CI testing only

### 6.2 Actions Permissions

**Default Permissions:**
```yaml
permissions:
  contents: read  # Minimal access
```

**Security Jobs (Explicit Grants):**
```yaml
permissions:
  contents: read
  security-events: write  # For SARIF uploads
```

**Pull Request Comments:**
```yaml
permissions:
  contents: read
  pull-requests: write  # For Codecov/security comments
```

---

## 7. GitHub Actions Features

### 7.1 Caching

**Node.js Dependencies:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node-version }}
    cache: 'npm'
    cache-dependency-path: services/mcp-gateway/package-lock.json
```

**Flutter Dependencies:**
```yaml
- uses: subosito/flutter-action@v2
  with:
    flutter-version: 'stable'
    cache: true
```

**Docker Layers:**
```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

### 7.2 Artifacts

**Type Coverage Report:**
- Name: `type-coverage`
- Retention: 30 days
- Format: Text

**Playwright Report:**
- Name: `playwright-report`
- Retention: 7 days
- Format: HTML

**k6 Summary:**
- Name: `k6-results`
- Retention: 7 days
- Format: JSON

**SBOM:**
- Name: `sbom`
- Retention: 90 days
- Format: SPDX + CycloneDX

---

### 7.3 GitHub Outputs

**SARIF Uploads (Security Tab):**
- CodeQL analysis results
- Trivy container scan results
- SBOM vulnerability analysis

**Check Annotations:**
- CodeQL findings (inline PR comments)
- Test failures (line-level errors)
- Coverage drops (Codecov comments)

---

## 8. Workflow Triggers Summary

### 8.1 Trigger Matrix

| Trigger | Jobs |
|---------|------|
| **Push to main** | All 13 jobs |
| **Pull request** | gateway-lint-test, flutter-analyze-test, security-scan, terraform-security, qlty, pre-commit, docker-build |
| **Weekly (Sunday)** | CodeQL |
| **Manual dispatch** | All jobs (via GitHub UI) |

### 8.2 Job Dependencies

```
gateway-lint-test (Node 20, 22)
    ├─> integration-tests
    ├─> e2e-tests
    └─> performance-tests

flutter-analyze-test
    └─> flutter-build

(All jobs run independently in parallel, except those with explicit dependencies)
```

---

## 9. Continuous Monitoring

### 9.1 GitHub Security Tab

**SARIF Reports:**
- CodeQL (weekly + on PR)
- Trivy container scans
- SBOM vulnerabilities

**Alerts:**
- Dependabot (automated dependency updates)
- Secret scanning (GitHub-native)

### 9.2 Codecov Dashboard

**Coverage Tracking:**
- Overall coverage trends
- Diff coverage per PR
- File-level coverage breakdown

**Flags:**
- `gateway` - MCP Gateway coverage
- `flutter` - Flutter client coverage

**Badges:**
```markdown
[![codecov](https://codecov.io/gh/jcornell3/tamshai-enterprise-ai/branch/main/graph/badge.svg)](https://codecov.io/gh/jcornell3/tamshai-enterprise-ai)
```

---

## 10. Action Version Pinning

**Security Best Practice:** All GitHub Actions use **commit SHAs** instead of tags

**Examples:**
```yaml
- uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8  # v4
- uses: actions/setup-node@395ad3262231945c25e8478fd5baf05154b1d79f  # v4
- uses: codecov/codecov-action@671740ac38dd9b0130fbe1cec585b89eea48d3de  # v4
- uses: github/codeql-action/init@5d4e8d1aca955e8d8589aabd499c5cae939e33c7  # v4
```

**Benefits:**
- Reproducible builds
- Protection against tag hijacking
- Audit trail of exact action versions

---

## 11. Failure Handling

### 11.1 Hard Failures (Block CI)

**Type Checking:**
- TypeScript compilation errors
- Type coverage < 85%

**Linting:**
- ESLint violations
- Flutter analyzer errors

**Testing:**
- Test failures
- Coverage below threshold (29-31% gateway, 70% HR)

**Security:**
- npm audit HIGH+ vulnerabilities
- Gitleaks secret detection
- tfsec critical issues

**Build:**
- Docker build failures

---

### 11.2 Soft Failures (Informational)

**Performance:**
- k6 load test failures (`continue-on-error: true`)

**Type Coverage:**
- Type coverage < 85% (logs warning, doesn't block)

**Terraform:**
- Format check (`continue-on-error: true`)
- Main validation (`continue-on-error: true`)

**Container Scan:**
- Trivy findings (`fail-build: false`)

**SBOM:**
- Vulnerability analysis (`fail-build: false`)

---

## 12. Configuration Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `.github/workflows/ci.yml` | Primary testing pipeline | ~700 |
| `.github/workflows/codeql.yml` | Security scanning | ~80 |
| `.github/codeql/codeql-config.yml` | CodeQL configuration | ~40 |
| `.pre-commit-config.yaml` | Pre-commit hooks | ~80 |
| `.gitleaks.toml` | Secret detection rules | ~100 |
| `.secrets.baseline` | detect-secrets baseline | ~50 |
| `codecov.yml` | Coverage enforcement | 38 |
| `tests/integration/jest.setup.js` | Integration test setup | 308 |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2025 | Initial documentation - complete CI/CD testing configuration |

---

**Next:** See `TEST_COVERAGE_STRATEGY.md` for coverage metrics and rationale, and `TESTING_STANDARDS.md` for best practices.
