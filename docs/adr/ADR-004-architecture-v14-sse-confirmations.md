# ADR-004: Architecture v1.4 - SSE Streaming & Human-in-the-Loop Confirmations

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-004: Architecture v1.4 SSE & Confirmations",
  "headline": "Adoption of Server-Sent Events and Human-in-the-Loop Confirmation Pattern",
  "description": "Documents the decision to implement SSE streaming to prevent timeouts and add human confirmation for destructive AI operations",
  "datePublished": "2025-12-08",
  "dateModified": "2026-01-21",
  "keywords": ["sse", "server-sent-events", "streaming", "human-in-the-loop", "confirmations", "ai-safety", "architecture"],
  "learningResourceType": "architecture-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "MCP Gateway" },
    { "@type": "SoftwareApplication", "name": "Claude API" }
  ],
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>

## Status

**Accepted** (December 2025)

## Context

The Tamshai Enterprise AI system integrates Claude AI with enterprise data through MCP (Model Context Protocol) servers. Two critical issues emerged in v1.3:

1. **Timeout Problem**: HTTP requests timed out during Claude's 30-60 second multi-step reasoning. Standard request/response patterns couldn't handle the "thinking" pauses.

2. **Safety Problem**: AI could execute destructive operations (delete employee, close ticket) without user confirmation, creating risk of accidental data loss.

## Decision

Architecture v1.4 introduces two mandatory patterns:

### 1. Server-Sent Events (SSE) for Streaming

Replace standard HTTP request/response with SSE streaming for all AI interactions.

```typescript
// MCP Gateway SSE Implementation
app.post('/api/query', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: req.body.query }]
  });

  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});
```

### 2. Human-in-the-Loop Confirmations

Write operations return `pending_confirmation` status instead of executing immediately:

```typescript
// MCP Server Write Tool Pattern
async function deleteEmployee(employeeId: string): Promise<MCPToolResponse> {
  const confirmationId = crypto.randomUUID();

  await redis.setex(`pending:${confirmationId}`, 300, JSON.stringify({
    action: 'delete_employee',
    employeeId,
    userId: userContext.userId
  }));

  return {
    status: 'pending_confirmation',
    confirmationId,
    message: '⚠️ Delete employee record? This cannot be undone.',
    confirmationData: { employeeId, employeeName: employee.name }
  };
}
```

### 3. Truncation Warnings

MCP servers use LIMIT+1 pattern to detect and warn about incomplete data:

```typescript
const result = await db.query('SELECT * FROM employees LIMIT 51', []);
const truncated = result.rows.length > 50;

return {
  data: result.rows.slice(0, 50),
  metadata: {
    truncated,
    warning: truncated
      ? 'TRUNCATION WARNING: Only 50 of 50+ records returned.'
      : null
  }
};
```

## Alternatives Considered

### WebSocket Instead of SSE

**Rejected because**:
- WebSocket requires special firewall rules
- Bidirectional communication not needed (server → client only)
- SSE has automatic reconnection built-in
- HTTP-based, works with existing load balancers

### No Confirmation for Write Operations

**Rejected because**:
- AI hallucinations could trigger unintended deletions
- No audit trail of user intent
- Violates enterprise security requirements
- User has no opportunity to review before execution

## Consequences

### Positive

- **No More Timeouts**: SSE keeps connection alive during Claude's reasoning
- **User Safety**: Destructive operations require explicit approval
- **Transparency**: Users see streaming responses in real-time
- **AI Accuracy**: Truncation warnings prevent AI from assuming complete data
- **Audit Trail**: Confirmation flow creates explicit user intent records

### Negative

- **Increased Complexity**: SSE handling required in all clients
- **State Management**: Pending confirmations need Redis storage with TTL
- **UX Change**: Users must explicitly confirm some operations
- **Client Updates**: All frontends (Flutter, web) needed SSE support

### Impact on Specifications

| Spec | Changes Required |
|------|------------------|
| 003-mcp-core | SSE endpoint implementation, confirmation API |
| 004-mcp-suite | All write tools return `pending_confirmation` |
| 005-sample-apps | EventSource client-side handling |
| 009-flutter-unified | SSE streaming in Dart |

## Timeline

```
Dec 2025 Week 1          Dec 2025 Week 2-3         Jan 2026
      │                        │                      │
  v1.4 Design              Implementation         Production
  SSE + Confirmations      MCP Gateway +          Deployed
      │                    All Clients                │
      └── Architecture     └── 4 specs updated       └── v1.4 live
          approved
```

## References

- `docs/architecture/V1.4_CHANGES.md` - Complete v1.4 change analysis
- `docs/architecture/diagrams/v1.4-confirmation-flow.md` - Confirmation flow diagram
- `docs/status/V1.4_IMPLEMENTATION_STATUS.md` - Implementation status
- `docs/development/V1.4_CODE_EXAMPLES.md` - Code examples

## Related Decisions

- ADR-001: Desktop Client Migration (Flutter needed SSE support)
- ADR-002: Phoenix Rebuild Evolution (v1.4 changes tested in rebuilds)

---

*This ADR is part of the Tamshai Project Journey - documenting how we balanced AI capability with user safety.*
