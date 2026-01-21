# ADR-007: Test Coverage Strategy - TDD with Diff Coverage Enforcement

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-007: Test Coverage Strategy",
  "headline": "TDD-Driven Development with 90% Diff Coverage Enforcement",
  "description": "Documents the decision to use Test-Driven Development as the primary methodology with 90% diff coverage enforcement rather than overall coverage targets",
  "datePublished": "2026-01-15",
  "dateModified": "2026-01-21",
  "keywords": ["tdd", "test-driven-development", "coverage", "diff-coverage", "testing", "quality"],
  "learningResourceType": "process-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Jest" },
    { "@type": "SoftwareApplication", "name": "Codecov" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (January 2026)

## Context

The project started with ~31% test coverage on the MCP Gateway (the core service). Traditional approaches would either:

1. **Require 100% coverage** - Blocks all PRs until legacy code is fully tested
2. **Set overall target (e.g., 70%)** - Allows new untested code if overall stays above threshold

Neither approach worked well:
- 100% requirement would halt development for weeks
- Overall targets allow "coverage debt" on new code

## Decision

Adopt **Test-Driven Development (TDD)** as the primary development methodology, enforced through **90% diff coverage** on all new/changed code.

### TDD Cycle (RED-GREEN-REFACTOR)

```
┌─────────────────────────────────────────────────────────────────┐
│                        TDD Cycle                                 │
│                                                                  │
│   1. RED      →    2. GREEN    →    3. REFACTOR                 │
│   Write test       Write code       Improve code                 │
│   (fails)          (passes)         (tests stay green)          │
│                                                                  │
│   Test defines     Minimum code     Clean up while               │
│   behavior         to pass          maintaining coverage         │
└─────────────────────────────────────────────────────────────────┘
```

### Coverage Enforcement

| Metric | Requirement | Enforcement |
|--------|-------------|-------------|
| **Diff Coverage** | 90% minimum | Codecov blocks PR if new code < 90% |
| **Overall Coverage** | No minimum | Informational only |
| **Type Coverage** | 85% minimum | TypeScript strict mode |

### TDD Scope

| Code Type | Uses TDD | Rationale |
|-----------|----------|-----------|
| Service Applications | **YES** | Core business logic |
| Client Applications | **YES** | User-facing features |
| Infrastructure (Terraform) | NO | Declarative, validated by apply |
| CI/CD Configurations | NO | Tested by pipeline execution |

## Alternatives Considered

### Require 80% Overall Coverage

**Rejected because**:
- Would require ~200 hours to test legacy code first
- Blocks feature development for testing-only work
- Legacy code may be replaced anyway
- Overall % can decrease even with perfect new code

### No Coverage Requirements

**Rejected because**:
- Quality regression is inevitable
- "Add tests later" never happens
- Technical debt compounds quickly
- No enforcement = no compliance

### Coverage Gates Without TDD

**Rejected because**:
- Tests written after code are often superficial
- Doesn't drive good design
- Leads to "test to coverage" rather than "test to behavior"
- Lower quality tests that don't catch real bugs

## Consequences

### Positive

- **Natural High Coverage**: TDD produces 90%+ coverage by default
- **No Retrofitting**: Tests exist before code, no "add tests later" debt
- **Design Quality**: TDD forces testable, modular architecture
- **Fast Feedback**: Developers know immediately if they break something
- **Gradual Improvement**: Overall coverage rises as old code is modified
- **PR Velocity**: No blocking on legacy code coverage

### Negative

- **Learning Curve**: Team needed TDD training
- **Initial Slowdown**: TDD feels slower at first (but faster long-term)
- **Discipline Required**: Easy to skip RED phase under pressure
- **Legacy Code**: Old code remains undertested until modified

### Coverage Progress

| Date | Overall | Diff Requirement | Status |
|------|---------|------------------|--------|
| Nov 2025 | 31.52% | None | Starting point |
| Dec 2025 | 49.06% | 90% | Codecov enabled |
| Jan 2026 | 80.8% | 90% | ✅ Target achieved |

**Key Insight**: 90% diff coverage naturally raised overall coverage from 31% to 80% in 2 months.

## Implementation

### Codecov Configuration

```yaml
# codecov.yml
coverage:
  status:
    project: off           # Don't fail on overall coverage
    patch:                 # Diff coverage settings
      default:
        target: 90%        # 90% of new lines must be tested
        threshold: 1%      # Allow 1% tolerance
```

### CI/CD Integration

```yaml
# .github/workflows/ci.yml
- name: Upload coverage
  uses: codecov/codecov-action@v3

- name: Check diff coverage
  run: |
    # Codecov comment on PR shows:
    # "Coverage on new code: 94% (target: 90%)"
```

### TDD Enforcement

TDD is enforced through:
1. **Code Review**: PRs without tests for new behavior are rejected
2. **Codecov**: Automated diff coverage check
3. **Culture**: Team commitment documented in CLAUDE.md

## References

- `.specify/specs/011-qa-testing/TEST_COVERAGE_STRATEGY.md` - Full strategy document
- `.specify/specs/011-qa-testing/TESTING_CI_CD_CONFIG.md` - CI/CD configuration
- `CLAUDE.md` - TDD methodology documented in project guide

## Related Decisions

- ADR-002: Phoenix Rebuild Evolution (tests enabled confident refactoring)
- ADR-004: Architecture v1.4 (SSE streaming required extensive test coverage)

---

*This ADR is part of the Tamshai Project Journey - documenting how we achieved 80% coverage without blocking development.*
