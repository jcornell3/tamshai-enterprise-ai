# Test Coverage Strategy - Tamshai Enterprise AI

**Document Version:** 1.1
**Last Updated:** January 2026
**Status:** Active

---

## Overview

This document explains our test coverage strategy, current baselines, rationale for diff coverage enforcement, and the path to achieving industry-standard coverage targets.

**Key Strategy:** **Diff Coverage Enforcement** - Require 90% coverage on all new/changed code while tracking overall coverage trends.

---

## 1. Current Coverage Baselines

### 1.1 Overall Project Coverage

**As of January 2026:**

| Metric | Coverage | Target | Status |
|--------|----------|--------|--------|
| **Overall** | 54.30% | 70-80% | 🟡 Approaching Acceptable |
| Statements | 53.38% | 70% | 🟡 In Progress |
| Branches | 52.85% | 70% | 🟡 In Progress |
| Functions | 53.80% | 70% | 🟡 In Progress |
| Lines | 54.30% | 70% | 🟡 In Progress |

**Progress:** +22.78pp improvement from 31.52% (original baseline)

**Total Tests:** 283 unit tests + 96 integration tests (89 passed, 7 skipped)

---

### 1.2 MCP Gateway (Services/mcp-gateway)

**Overall:** 54.30% (up from 49.06%)

**Module Breakdown:**

| Module | Coverage | Status | Notes |
|--------|----------|--------|-------|
| **ai/** | 100% | ✅ Perfect | Claude client integration |
| - claude-client.ts | 100% | ✅ Perfect | AI streaming, error handling |
| **auth/** | 94.44% | ✅ Excellent | JWT validation |
| - jwt-validator.ts | 94.44% | ✅ Excellent | Token validation, role extraction |
| **mcp/** | 95.91% | ✅ Excellent | MCP client and routing |
| - mcp-client.ts | 94.87% | ✅ Excellent | Tool execution, error handling |
| - role-mapper.ts | 100% | ✅ Perfect | Role-to-server mapping |
| **routes/** | 92.02% | ✅ Excellent | Extracted modules, well-tested |
| - health.routes.ts | 100% | ✅ Perfect | 13 tests, all scenarios covered |
| - user.routes.ts | 100% | ✅ Perfect | 12 tests, auth + MCP tools |
| - gdpr.ts | 90.15% | ✅ Excellent | 28 tests, GDPR compliance |
| **security/** | 88.37% | ✅ Good | Critical security logic |
| - prompt-defense.ts | 91.97% | ✅ Excellent | 5-layer injection defense |
| - token-revocation.ts | 82.05% | ✅ Good | Redis-backed revocation |
| **types/** | 100% | ✅ Perfect | Type guards and helpers |
| - mcp-response.ts | 100% | ✅ Perfect | 30 tests, discriminated unions |
| **utils/** | 90.07% | ✅ Excellent | Utility functions |
| - gateway-utils.ts | 100% | ✅ Perfect | Role routing logic |
| - pii-scrubber.ts | 100% | ✅ Perfect | PII masking |
| **index.ts** | 0% | ❌ Blocker | 1,532 uncovered lines (monolithic) |

**Jest Thresholds (Enforced):**
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 29,
      "functions": 31,
      "lines": 31,
      "statements": 31
    }
  }
}
```

**Why Low Thresholds?**
- Legacy monolithic architecture in index.ts
- 1,532 uncovered lines representing 21.5% of codebase
- Gradual improvement via diff coverage enforcement
- **Even 100% coverage on index.ts would only reach 70.56%**

---

### 1.3 MCP HR (Services/mcp-hr)

**Overall:** 70%+ (Meeting target)

**Jest Thresholds (Enforced):**
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 70,
      "lines": 70,
      "statements": 70
    }
  }
}
```

**Why Higher Threshold?**
- Greenfield service (built from scratch)
- Well-structured from the start
- No legacy burden
- Follows modern testing practices

---

### 1.4 Flutter Client (clients/unified_flutter)

**Current:** Basic line count metrics
**Target:** 70% (spec requirement)
**Test Files:** 7 files

**Test Inventory:**
- `keycloak_auth_service_test.dart` - OAuth PKCE flow
- `auth_provider_test.dart` - State management
- `token_interceptor_test.dart` - HTTP interceptor
- `chat_input_test.dart` - User input widget
- `message_bubble_test.dart` - Message rendering
- `approval_card_test.dart` - HITL confirmation UI
- `widget_test.dart` - General widgets

**Coverage Format:** LCOV (uploaded to Codecov)

---

### 1.5 Integration Tests

**Coverage:** N/A (functional coverage, not line coverage)
**Status:** ✅ All tests passing (CI run 20642174604)

**Test Files (96 tests total, 89 passed, 7 skipped):**
- `rbac.test.ts` - Role-based access control
- `mcp-tools.test.ts` - MCP tool integration (19 tools)
- `query-scenarios.test.ts` - Query handling, cursor-based pagination (59 employees)
- `sse-streaming.test.ts` - SSE streaming, cross-platform error handling

**Purpose:** Verify system behavior, not code execution paths

---

## 2. Diff Coverage Strategy

### 2.1 Codecov Configuration

**File:** `codecov.yml`

**Patch Coverage (BLOCKING):**
```yaml
coverage:
  status:
    patch:
      default:
        target: 90%           # Require 90% on new/changed code
        threshold: 0%         # No tolerance for drops
        only_pulls: true      # Only applies to PRs
        informational: false  # BLOCKS PR merge if < 90%
```

**Project Coverage (INFORMATIONAL):**
```yaml
coverage:
  status:
    project:
      default:
        target: auto          # Track trend, don't enforce
        threshold: 1%         # Allow small drops
        informational: true   # Don't block PR merges
```

**Comment Configuration:**
```yaml
comment:
  layout: "diff, files, footer"  # Prioritize diff coverage
  behavior: default
  require_changes: false         # Always comment on PRs
```

---

### 2.2 Why 90% Diff Coverage?

#### Rationale:

**1. Prevents Regression**
- All new code must be tested
- Stops accumulation of technical debt
- Ensures future code maintains high standards

**2. Realistic Target**
- 90% allows for legitimate edge cases
- Not 100% perfectionism (diminishing returns)
- Achievable without over-testing trivial code

**3. Gradual Improvement**
- Naturally increases overall coverage over time
- As developers modify old code, they add tests
- Organic improvement without blocking work

**4. Developer-Friendly**
- Doesn't block work on legacy code
- Focuses on forward progress
- Avoids massive refactoring efforts

**5. Industry Alignment**
- Google, Microsoft, and Netflix use similar strategies
- "Diff coverage" is an established best practice
- Test-Coverage.txt guidance: 75-80% is "Commendable"

---

#### Alternative Considered: 80% Project-Wide Threshold

**Why Rejected:**
- Would block ALL PRs until index.ts refactored
- Estimated 20-40 hour refactoring effort
- High risk of introducing regressions
- Halts development for legacy cleanup
- Doesn't solve root architectural issues

**Conclusion:** Diff coverage is more practical and sustainable

---

### 2.3 How Diff Coverage Works

**Example PR Workflow:**

1. **Developer adds new SSE endpoint** (50 lines)
2. **Developer writes comprehensive tests** (80 lines)
3. **Codecov analyzes PR:**
   ```
   Patch Coverage: 95% (48/50 lines covered)
   Project Coverage: 49.06% → 49.28% (+0.22%)
   ```
4. **Status Check:** ✅ PASSED (patch > 90%)
5. **PR can be merged**

**Example Failure:**

1. **Developer adds feature without tests**
2. **Codecov analysis:**
   ```
   Patch Coverage: 20% (10/50 lines covered)
   Project Coverage: 49.06% → 48.90% (-0.16%)
   ```
3. **Status Check:** ❌ FAILED (patch < 90%)
4. **PR blocked until tests added**

---

## 3. Coverage Evolution Path

### Phase 1: Baseline Establishment (COMPLETED)

**Timeline:** Nov-Dec 2025
**Goal:** Extract testable modules and establish baseline

**Achievements:**
- Extracted route modules (health, user, GDPR)
- Added AI client, auth, and MCP client modules with tests
- Created 283 unit tests + 96 integration tests
- Achieved 90%+ coverage on new modules
- Established 54.30% overall baseline

**Coverage Improvement:** 31.52% → 54.30% (+22.78pp)

**Key Wins:**
- `ai/`: 100% coverage (Claude client)
- `auth/`: 94.44% coverage (JWT validator)
- `mcp/`: 95.91% coverage (MCP client)
- `routes/`: 92.02% coverage
- `security/`: 88.37% coverage
- `types/`: 100% coverage
- `utils/`: 90.07% coverage

---

### Phase 2: Diff Coverage Enforcement (CURRENT)

**Timeline:** Dec 2025 - Ongoing
**Goal:** Prevent new technical debt, gradual improvement

**Strategy:**
- ✅ Codecov configured for 90% diff coverage
- ✅ Project coverage tracking (informational)
- ✅ PR comments showing coverage delta
- ✅ CI blocks PRs with < 90% patch coverage

**Expected Outcomes:**
- All new code has 90%+ coverage
- Overall coverage increases organically
- Development not blocked on legacy code
- Test quality improves over time

**Projected Timeline:**
- 3 months: ~55-60% overall coverage
- 6 months: ~65-70% overall coverage
- 12 months: ~75-80% overall coverage (target achieved)

---

### Phase 3: Overall Target Achievement (FUTURE)

**Timeline:** 2026
**Goal:** Reach 75-80% overall coverage ("Commendable" tier)

**Approach:**
- Natural progression from diff coverage
- Refactor index.ts when business value justifies
- Consider architectural improvements
- Maintain 90% diff coverage standard

**Refactoring Options:**
1. **Extract auth middleware** → testable module
2. **Extract SSE streaming logic** → testable module
3. **Extract MCP orchestration** → testable service
4. **Microservices architecture** → distributed testing

**Decision Criteria:**
- Business value > refactoring cost
- Risk of regression acceptable
- Team bandwidth available
- Clear architectural improvement

---

## 4. Industry Benchmarks

### 4.1 Industry Standards

**Source:** Test-Coverage.txt (industry research)

| Coverage | Tier | Meaning |
|----------|------|---------|
| **< 60%** | ❌ Unacceptable | Below minimum - shipping uncaught regressions regularly |
| **60%** | 🟡 Acceptable | Bare minimum - adequate for small projects |
| **75-80%** | 🟢 Commendable | **Sweet spot** - strong confidence without over-testing |
| **90%+** | 🌟 Exemplary | Mission-critical only (finance, healthcare, safety) |

**Our Position:** 54% → Approaching Acceptable, with 90% diff coverage preventing regression

---

### 4.2 The Trap of 100% Coverage

**Why NOT aim for 100%:**

**1. Diminishing Returns**
- Last 10-15% is disproportionately expensive
- Often trivial code (getters/setters, config)
- Time better spent on integration/E2E tests

**2. False Confidence**
- Developers write "assertion-free tests" just to execute lines
- No actual verification of behavior
- Green checkmarks without real safety

**3. Brittle Tests**
- High coverage couples tests to implementation
- Refactoring becomes painful
- Tests break on safe code changes

**4. Opportunity Cost**
- 100% coverage takes 3-5x effort of 80%
- Better ROI on integration and E2E tests
- Better ROI on performance and security testing

**Industry Consensus:** 75-80% is the optimal balance

---

### 4.3 Diff Coverage Best Practice

**Google's Approach:**
- **Project coverage:** Track trends, don't enforce
- **Diff coverage:** Enforce 80-90% on new code
- **Result:** Gradual improvement without blocking development

**Microsoft's Approach:**
- **Overall:** 70% recommended
- **New features:** 90% required
- **Critical paths:** 100% (security, payment)

**Netflix's Approach:**
- **Diff coverage:** 90% enforced
- **Legacy code:** Exempted
- **Refactoring:** Incremental improvement

**Our Alignment:** Following industry best practices (90% diff, track overall)

---

## 5. Why Different Thresholds Per Service?

### 5.1 MCP Gateway: 29-31%

**Rationale:**
- **Legacy architecture:** Monolithic index.ts
- **1,532 uncovered lines:** 21.5% of codebase
- **Architectural debt:** Deep coupling in index.ts
- **Gradual improvement:** Via diff coverage

**Challenge:**
- Even 100% index.ts coverage → only 70.56% overall
- Refactoring requires architectural redesign
- High risk of regressions

**Strategy:**
- Maintain current threshold (realistic)
- Enforce 90% diff coverage (future-proof)
- Refactor when business value justifies

---

### 5.2 MCP HR: 70%

**Rationale:**
- **Greenfield service:** Built from scratch
- **Well-structured:** Follows best practices
- **No legacy burden:** Clean architecture
- **Test-first mindset:** TDD from inception

**Alignment:** Industry "Commendable" tier

---

### 5.3 New Services: 70% Default

**Rationale:**
- **Consistent standard:** All new services start at 70%
- **Achievable:** Without over-testing trivial code
- **Industry-aligned:** "Commendable" tier
- **Quality signal:** Sets expectations for developers

**Exceptions:**
- **Critical services:** May require 90% (security, payment, auth)
- **Prototypes:** May start at 50% (rapid iteration)

---

## 6. Coverage Target Justification

### 6.1 Target Matrix

| Component | Target | Rationale |
|-----------|--------|-----------|
| **Unit Tests** | 70% | Industry "Commendable" baseline |
| **Integration Tests** | N/A | Functional coverage, not line coverage |
| **E2E Tests** | N/A | User scenario coverage, not metrics |
| **Diff Coverage** | 90% | Stop new technical debt |
| **Type Coverage** | 85% | Strong type safety, allow `any` for edges |
| **Security** | 100% | All vulnerabilities addressed |

---

### 6.2 Testing Pyramid

```
        E2E Tests (10%)
      ┌─────────────────┐
      │ User Scenarios  │  Slow, brittle, high-value
      └─────────────────┘

    Integration Tests (30%)
   ┌────────────────────────┐
   │  Service Interactions  │  Medium speed, medium value
   └────────────────────────┘

       Unit Tests (60%)
  ┌──────────────────────────────┐
  │    Business Logic Tests      │  Fast, precise, high coverage
  └──────────────────────────────┘
```

**Coverage Goals:**
- **Unit:** 70-90% (comprehensive business logic)
- **Integration:** 50-70% (happy path + critical errors)
- **E2E:** Low % (don't measure - focus on scenarios)

---

## 7. Coverage Metrics Explained

### 7.1 Statement Coverage

**Definition:** Percentage of statements executed

**Example:**
```typescript
function add(a: number, b: number): number {
  return a + b;  // 1 statement
}

// Test:
expect(add(2, 3)).toBe(5);
// Coverage: 100% (1/1 statement)
```

**Limitation:** Doesn't catch missing edge cases

---

### 7.2 Branch Coverage

**Definition:** Percentage of conditional branches taken

**Example:**
```typescript
function isPositive(n: number): boolean {
  if (n > 0) {    // Branch 1: true
    return true;
  } else {        // Branch 2: false
    return false;
  }
}

// Test 1:
expect(isPositive(5)).toBe(true);
// Branch coverage: 50% (true branch only)

// Test 2:
expect(isPositive(-3)).toBe(false);
// Branch coverage: 100% (both branches)
```

**Importance:** Catches missing error handling

---

### 7.3 Function Coverage

**Definition:** Percentage of functions called

**Example:**
```typescript
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

// Test:
expect(add(2, 3)).toBe(5);
// Function coverage: 50% (add called, multiply not)
```

---

### 7.4 Line Coverage

**Definition:** Percentage of lines executed

**Similar to statement coverage but counts physical lines**

---

## 8. Common Coverage Pitfalls

### 8.1 "Assertion-Free Tests"

**Bad Example:**
```typescript
test('function runs without error', () => {
  processData(input);  // No assertion!
});
```

**Coverage:** 100%
**Value:** 0% (doesn't verify behavior)

**Good Example:**
```typescript
test('processes data correctly', () => {
  const result = processData(input);
  expect(result).toEqual(expectedOutput);
  expect(result.status).toBe('success');
});
```

---

### 8.2 "Implementation Coupling"

**Bad Example:**
```typescript
test('calls internal method', () => {
  const spy = jest.spyOn(service, 'internalMethod');
  service.publicMethod();
  expect(spy).toHaveBeenCalled();
});
```

**Problem:** Test breaks on safe refactoring

**Good Example:**
```typescript
test('returns correct result', () => {
  const result = service.publicMethod();
  expect(result).toEqual(expectedOutput);
});
```

---

### 8.3 "Trivial Code Over-Testing"

**Overkill:**
```typescript
// Getter
get userId(): string {
  return this._userId;
}

// Test
test('getter returns userId', () => {
  expect(obj.userId).toBe('user-123');
});
```

**Better:** Don't test trivial getters - focus on business logic

---

## 9. Coverage Reporting

### 9.1 Codecov Integration

**Dashboard:** https://codecov.io/gh/jcornell3/tamshai-enterprise-ai

**Features:**
- Historical trends (line graph)
- Diff coverage per PR (patch coverage)
- File-level breakdown (drill-down)
- Sunburst visualization (tree map)

**Flags:**
- `gateway` - MCP Gateway coverage
- `flutter` - Flutter client coverage

**PR Comments:**
```
## Codecov Report
Patch coverage: 95.00% of modified lines
Project coverage: 49.06% (+0.22%)

| Flag | Coverage | Delta |
|------|----------|-------|
| gateway | 49.28% | +0.22% |

Files changed:
✅ src/routes/new-feature.ts 100%
⚠️ src/utils/helper.ts 85%
```

---

### 9.2 Local Coverage Reports

**Generate HTML report:**
```bash
cd services/mcp-gateway
npm test -- --coverage --coverageReporters=html

# Open coverage/index.html in browser
open coverage/index.html  # macOS
start coverage/index.html  # Windows
```

**Features:**
- Line-by-line highlighting (green = covered, red = uncovered)
- Branch coverage indicators
- Function coverage status

---

## 10. Constitutional Compliance

### 10.1 Article III.1: Testing & Verification

**Requirement:**
> All RBAC logic, token validation, and MCP tool access control must have integration tests.

**Compliance:**

✅ **RBAC Integration Tests**
- `tests/integration/rbac.test.ts`
- Tests all user roles (executive, hr-read, finance, intern)
- Verifies access control enforcement

✅ **Token Validation Tests**
- `src/security/token-revocation.test.ts`
- JWT validation and revocation
- 26 tests covering middleware and event handlers

✅ **MCP Tool Access Control**
- `tests/integration/mcp-tools.test.ts`
- Role-based tool access
- Server routing verification

⚠️ **Data Filtering Tests**
- **Status:** Planned (not yet implemented)
- **Location:** RLS (Row Level Security) tests
- **Action:** Add PostgreSQL RLS integration tests

---

## 11. Future Improvements

### 11.1 Short-Term (3 months)

**1. Increase Overall Coverage to 55-60%**
- Natural growth from diff coverage
- Focus on high-value modules

**2. Add RLS Tests**
- PostgreSQL row-level security
- Complete Article III.1 compliance

**3. Flutter Coverage to 70%**
- Add widget tests
- Test state management

---

### 11.2 Long-Term (12 months)

**1. Reach 75-80% Overall Coverage**
- Organic improvement via diff coverage
- Selective refactoring of index.ts

**2. Mutation Testing**
- PIT or Stryker for mutation testing
- Verify test quality, not just coverage

**3. Visual Regression Testing**
- Percy or Chromatic for Flutter UI
- Catch visual bugs automatically

**4. Property-Based Testing**
- fast-check or JSVerify
- Generate test cases automatically

---

## 12. Key Takeaways

1. **90% diff coverage prevents regression** - All new code must be tested
2. **49% overall is acceptable** - Given legacy architecture and diff coverage enforcement
3. **70-80% is the target** - Industry "Commendable" tier, achievable in 12 months
4. **100% is a trap** - Diminishing returns, false confidence, brittle tests
5. **Gradual improvement works** - Organic growth via diff coverage is sustainable
6. **Focus on value** - Test business logic, not trivial code

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2025 | Initial documentation - coverage strategy and rationale |
| 1.1 | Jan 2026 | Updated coverage from 49% to 54%, added new modules (ai/, auth/, mcp/), updated integration test counts (96 tests) |

---

**Next:** See `TESTING_STANDARDS.md` for testing best practices and common patterns.
