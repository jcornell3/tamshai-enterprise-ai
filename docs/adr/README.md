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
