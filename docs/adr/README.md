# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Tamshai Enterprise AI project.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences. ADRs are particularly valuable for understanding the "why" behind decisions, especially when those decisions involved failures, pivots, or trade-offs.

## ADR Format

Each ADR follows this structure:

```markdown
# ADR-NNN: Title

<!-- JSON-LD metadata for machine readability -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  ...
}
</script>

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?

## References
Links to related documentation, issues, or discussions.
```

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-desktop-client-migration.md) | Desktop Client Migration (Electron → React Native → Flutter) | Accepted | January 2026 |
| [ADR-002](ADR-002-phoenix-rebuild-evolution.md) | Phoenix Rebuild Evolution | Accepted | January 2026 |
| [ADR-003](ADR-003-nginx-to-caddy-migration.md) | Nginx to Caddy Migration | Accepted | December 2025 |
| [ADR-004](ADR-004-architecture-v14-sse-confirmations.md) | Architecture v1.4: SSE Streaming & Human-in-the-Loop | Accepted | December 2025 |
| [ADR-005](ADR-005-mcp-support-backend-abstraction.md) | MCP Support Backend Abstraction (Elasticsearch vs MongoDB) | Accepted | January 2026 |
| [ADR-006](ADR-006-gcs-spa-routing-limitation.md) | GCS SPA Routing Limitation - Cloud Run Migration | Accepted | January 2026 |
| [ADR-007](ADR-007-test-coverage-tdd-diff-strategy.md) | Test Coverage Strategy: TDD with Diff Coverage | Accepted | January 2026 |
| [ADR-008](ADR-008-vps-staging-vs-gcp.md) | VPS Staging vs GCP Staging | Accepted | December 2025 |
| [ADR-009](ADR-009-keycloak-23-configuration-challenges.md) | Keycloak 23 Configuration Challenges | Accepted | December 2025 |
| [ADR-010](ADR-010-test-user-totp-e2e-strategy.md) | Test User TOTP Strategy for E2E OAuth Testing | Accepted | January 2026 |
| [ADR-011](ADR-011-gcp-production-cost-optimization.md) | GCP Production Cost Optimization | Accepted | January 2026 |
| [ADR-012](ADR-012-user-application-access-issues.md) | User Application Access Issues (403 Remediation) | Accepted | January 2026 |

## Purpose

These ADRs are designed to be consumed by:

1. **Human Developers**: Understanding historical context for current architecture
2. **AI Agents**: Machine-readable JSON-LD metadata enables programmatic discovery
3. **Project Journey Agent**: Primary data source for the mcp-journey service

## JSON-LD Metadata

All ADRs include JSON-LD metadata headers for machine readability. This enables AI agents to:
- Parse structured metadata without NLP
- Understand document relationships
- Query specific decision types (failures, pivots, migrations)

## Related Documentation

- [Project Journey Agent Plan](../plans/PROJECT_JOURNEY_AGENT.md)
- [Lessons Learned](../development/lessons-learned.md)
- [Phoenix Runbook](../operations/PHOENIX_RUNBOOK.md)

---

*Created: January 21, 2026*
*Part of: Tamshai Project Journey*
