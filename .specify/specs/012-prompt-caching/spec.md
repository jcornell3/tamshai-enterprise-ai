# 012 - Anthropic Prompt Caching

## Business Intent

Reduce Claude API input token costs by 50-90% for repeat queries by implementing Anthropic's prompt caching feature. Enterprise users typically ask 3-5 follow-up questions per session, each re-sending the same MCP data context. By caching this context and using Anthropic's `cache_control: { type: "ephemeral" }` directive, subsequent queries within 5 minutes read from Anthropic's cache at 10% of normal input token cost.

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cache hit rate | >60% of follow-up queries | Log `cache_read_input_tokens > 0` |
| Cost reduction | 50-90% on cached queries | Compare `cache_read_input_tokens` vs `input_tokens` |
| Latency impact | <5ms overhead | Redis GET/SETEX timing |
| Test coverage | 90%+ on new code | Jest coverage report |
| Zero regressions | All existing tests pass | CI pipeline |

## Technical Design

### Strategy: Redis MCP Context Cache + Anthropic cache_control

1. **Redis Cache Layer**: Cache serialized MCP data context per user in Redis (TTL: 300s)
2. **TextBlockParam Format**: Convert system prompts to `TextBlockParam[]` with `cache_control` on the data block
3. **Byte-Identical Guarantee**: Cache the serialized string (not objects) to ensure Anthropic cache hits
4. **Fire-and-Forget Writes**: Redis store operations don't block the response path

### Key Design Decisions

- **Cache key**: `mcp_context:{userId}` - simple, user-specific due to RLS
- **TTL**: 300 seconds - matches Anthropic's 5-minute cache lifetime
- **Cache miss fallback**: Query MCP servers normally (existing behavior)
- **Redis failure**: Graceful degradation - falls through to fresh MCP query
- **forceRefresh**: API option to bypass cache for explicit data refresh

### Architecture

```
Request Flow:
1. Check Redis for cached MCP context (mcp_context:{userId})
2. Cache HIT  -> Use cached string as data context
   Cache MISS -> Query MCP servers, cache result in Redis
3. Build TextBlockParam[] system prompt with cache_control on data block
4. Send to Claude API (Anthropic caches the prompt server-side)
5. Log cache metrics (cache_creation_input_tokens, cache_read_input_tokens)
```

### Files Modified

| File | Change |
|------|--------|
| `services/mcp-gateway/src/utils/redis.ts` | Add MCP context cache functions |
| `services/mcp-gateway/src/ai/claude-client.ts` | TextBlockParam[] format + cache metrics |
| `services/mcp-gateway/src/routes/streaming.routes.ts` | TextBlockParam[] format + cache metrics |
| `services/mcp-gateway/src/routes/ai-query.routes.ts` | Redis MCP context caching |

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Stale data (5 min cache) | `forceRefresh: true` API option |
| Below min token threshold | Anthropic silently skips (no error) |
| Redis failure | Fire-and-forget writes; cache miss fallback |
| Byte-identical requirement | Cache serialized string, never re-serialize |

## Version

- **Spec Version**: 1.0
- **Created**: 2026-02-05
- **Architecture Version**: 1.5
