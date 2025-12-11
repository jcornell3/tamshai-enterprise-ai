# Cursor-Based Pagination Guide (Architecture v1.4)

## Overview

Architecture v1.4 introduces cursor-based pagination across all MCP servers, enabling users to retrieve complete datasets across multiple API calls while maintaining token efficiency per request.

**Key Benefits**:
- ✅ Complete data retrieval (no artificial 50-record limit)
- ✅ Token-efficient requests (50 records per call by default)
- ✅ Efficient database queries (uses indexed WHERE clauses)
- ✅ Consistent results (no data drift during pagination)
- ✅ AI-friendly hints guide Claude to request next pages

## Quick Start

### Basic Pagination Flow

```typescript
// Page 1: Initial request
const page1 = await mcpServer.query({
  query: "List all employees",
  userContext: { userId, roles }
});

console.log(page1.data.length); // 50 employees
console.log(page1.metadata.hasMore); // true
console.log(page1.metadata.nextCursor); // "eyJsYXN0TmFtZ..."

// Page 2: Request next page using cursor
const page2 = await mcpServer.query({
  query: "Show next page",
  cursor: page1.metadata.nextCursor,
  userContext: { userId, roles }
});

console.log(page2.data.length); // 9 employees
console.log(page2.metadata.hasMore); // false
// Total: 59 employees retrieved
```

## Implementation by Server

### 1. MCP HR Server (PostgreSQL)

**Tool**: `list_employees`
**Pagination Strategy**: Multi-column keyset pagination

**Cursor Structure**:
```typescript
{
  lastName: string,
  firstName: string,
  id: string  // UUID tie-breaker
}
```

**SQL Pattern**:
```sql
-- Page 1 (no cursor)
SELECT * FROM hr.employees
WHERE status = 'ACTIVE'
ORDER BY last_name, first_name, id
LIMIT 51;  -- LIMIT+1 to detect more records

-- Page 2 (with cursor)
SELECT * FROM hr.employees
WHERE status = 'ACTIVE'
  AND (
    (last_name > 'Williams') OR
    (last_name = 'Williams' AND first_name > 'Dan') OR
    (last_name = 'Williams' AND first_name = 'Dan' AND id > 'uuid-here')
  )
ORDER BY last_name, first_name, id
LIMIT 51;
```

**Example Response**:
```json
{
  "status": "success",
  "data": [/* 50 employees */],
  "metadata": {
    "hasMore": true,
    "nextCursor": "eyJsYXN0TmFtZSI6IldpbGxpYW1zIiwiZmlyc3ROYW1lIjoiRGFuIiwiaWQiOiJlMTAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwNDAifQ==",
    "returnedCount": 50,
    "totalEstimate": "50+",
    "hint": "To see more employees, say 'show next page' or 'get more employees'."
  }
}
```

---

### 2. MCP Finance Server (PostgreSQL)

**Tool**: `list_invoices`
**Pagination Strategy**: Multi-column keyset pagination

**Cursor Structure**:
```typescript
{
  invoiceDate: string,  // ISO date
  createdAt: string,    // ISO timestamp
  id: string            // UUID
}
```

**SQL Pattern**:
```sql
-- With cursor
SELECT * FROM finance.invoices
WHERE 1=1
  AND (
    (invoice_date < '2024-11-01') OR
    (invoice_date = '2024-11-01' AND created_at < '2024-11-01T10:30:00Z') OR
    (invoice_date = '2024-11-01' AND created_at = '2024-11-01T10:30:00Z' AND id < 'uuid-here')
  )
ORDER BY invoice_date DESC, created_at DESC
LIMIT 51;
```

**Features**:
- Supports filters: vendor, status, department, amount range
- Efficient descending date sort
- Preserves chronological order

---

### 3. MCP Sales Server (MongoDB)

**Tool**: `list_opportunities`
**Pagination Strategy**: MongoDB `_id`-based cursor pagination

**Cursor Structure**:
```typescript
{
  _id: string  // MongoDB ObjectId as string
}
```

**MongoDB Query Pattern**:
```javascript
// Page 1 (no cursor)
db.deals.find({
  status: "open"
}).sort({ _id: -1 }).limit(51);

// Page 2 (with cursor)
db.deals.find({
  status: "open",
  _id: { $lt: ObjectId("674d8f234a1b2c3d4e5f6789") }
}).sort({ _id: -1 }).limit(51);
```

**Features**:
- Uses MongoDB's natural `_id` ordering
- Efficient `$lt` operator for keyset pagination
- Descending sort for recent-first results

---

### 4. MCP Support Server (Elasticsearch)

**Tools**: `search_tickets`, `search_knowledge_base`
**Pagination Strategy**: Elasticsearch `search_after` pagination

**Cursor Structure**:
```typescript
{
  sort: any[]  // Elasticsearch sort values array
}
```

**Elasticsearch Query Pattern**:
```json
// Page 1 (no cursor)
{
  "query": { "match_all": {} },
  "size": 51,
  "sort": [
    { "created_at": "desc" },
    { "_id": "desc" }
  ]
}

// Page 2 (with cursor)
{
  "query": { "match_all": {} },
  "size": 51,
  "sort": [
    { "created_at": "desc" },
    { "_id": "desc" }
  ],
  "search_after": [1699564800000, "ticket-id-here"]
}
```

**Features**:
- **Tickets**: Sorted by `created_at` (chronological)
- **Knowledge Base**: Sorted by `_score` (relevance)
- Multi-field sort for stable pagination
- Preserves Elasticsearch relevance scoring

---

## Pagination Metadata

All MCP servers return consistent pagination metadata:

```typescript
interface PaginationMetadata {
  /** Whether more records exist beyond this page */
  hasMore: boolean;

  /** Cursor to fetch next page (base64-encoded) */
  nextCursor?: string;

  /** Number of records in this response */
  returnedCount: number;

  /** Estimated total records (e.g., "100+" if unknown exact count) */
  totalEstimate?: string;

  /** AI-friendly hint for requesting more data */
  hint?: string;
}
```

**Example**:
```json
{
  "hasMore": true,
  "nextCursor": "eyJsYXN0TmFtZSI6IldpbGxpYW1zIiwiZmlyc3ROYW1lIjoiRGFuIiwiaWQiOiJlMTAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwNDAifQ==",
  "returnedCount": 50,
  "totalEstimate": "50+",
  "hint": "To see more employees, say \"show next page\" or \"get more employees\". You can also use filters like department, job title, or location to narrow results."
}
```

---

## Cursor Encoding/Decoding

All cursors are base64-encoded JSON for opaque transport:

```typescript
// Encode cursor (server-side)
function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

// Decode cursor (server-side)
function decodeCursor(encoded: string): PaginationCursor | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;  // Invalid cursor
  }
}
```

**Why Base64?**
- Opaque to clients (hides internal structure)
- URL-safe (can be passed as query parameter)
- Compact (smaller than raw JSON)
- Future-proof (can change structure without breaking clients)

---

## AI Integration

Claude automatically understands pagination through:

1. **AI-Friendly Hints**: Metadata includes natural language guidance
2. **System Prompt Injection**: Gateway injects pagination instructions
3. **SSE Pagination Events**: Real-time cursor availability

**Example Claude Response**:
```
I found 50 employees in the Engineering department.
⚠️ Important: These are the first 50 of 50+ total results.
Would you like me to show the next page?
```

---

## Best Practices

### 1. **Use Default Limits**
Default limit is 50 records (max 100):
```typescript
// Good
const result = await listEmployees({ limit: 50 });

// Avoid (unnecessary overhead)
const result = await listEmployees({ limit: 100 });
```

### 2. **Check `hasMore` Before Requesting Next Page**
```typescript
if (response.metadata?.hasMore) {
  const nextPage = await query({
    cursor: response.metadata.nextCursor
  });
}
```

### 3. **Combine Pagination with Filters**
Reduce total pages by filtering upfront:
```typescript
// Better: Filter first
const engineers = await listEmployees({
  department: "Engineering",
  limit: 50
});

// Worse: Paginate through all employees
const allEmployees = await listEmployees({ limit: 50 });
```

### 4. **Handle Expired Cursors**
Cursors may become invalid if data changes significantly:
```typescript
const page2 = await query({ cursor: oldCursor });
if (page2.status === 'error' && page2.code === 'INVALID_CURSOR') {
  // Restart from page 1
  const page1 = await query({ limit: 50 });
}
```

### 5. **Use AI Hints**
Let Claude guide users naturally:
```typescript
// Metadata hint appears in Claude's system prompt
"hint": "To see more invoices, say 'show next page' or 'get more invoices'."
```

---

## Performance Considerations

### Keyset Pagination vs Offset Pagination

| Aspect | Keyset (Our Approach) | Offset (Deprecated) |
|--------|----------------------|---------------------|
| Query Performance | ⚡ O(1) - constant time | 🐌 O(n) - linear time |
| Deep Pagination | ✅ Fast at page 1000 | ❌ Slow at page 1000 |
| Data Consistency | ✅ No drift during pagination | ❌ Results shift if data changes |
| Database Load | ✅ Uses indexes efficiently | ❌ Full table scan for large offsets |
| Complexity | Medium (WHERE clause) | Low (OFFSET keyword) |

### Database Indexes

**Critical indexes for pagination performance**:

```sql
-- PostgreSQL (HR)
CREATE INDEX idx_employees_pagination
  ON hr.employees (last_name, first_name, id);

-- PostgreSQL (Finance)
CREATE INDEX idx_invoices_pagination
  ON finance.invoices (invoice_date DESC, created_at DESC, id);

-- MongoDB (Sales)
-- _id is automatically indexed

-- Elasticsearch (Support)
-- created_at and _score are automatically indexed
```

---

## Troubleshooting

### Issue: Cursor Returns No Results

**Cause**: Cursor references a deleted record
**Solution**: Restart from page 1

```typescript
if (response.metadata?.returnedCount === 0 && cursor) {
  // Cursor invalid, restart pagination
  const fresh = await query({ limit: 50 });
}
```

---

### Issue: Duplicate Records Across Pages

**Cause**: Missing tie-breaker column in cursor
**Solution**: Always include unique ID in sort

```typescript
// ❌ Bad: No tie-breaker
ORDER BY last_name, first_name

// ✅ Good: Unique ID as tie-breaker
ORDER BY last_name, first_name, id
```

---

### Issue: Pagination Slow on Deep Pages

**Cause**: Missing database index
**Solution**: Add index on sort columns

```sql
-- Check if index exists
EXPLAIN SELECT * FROM hr.employees
WHERE last_name > 'Smith'
ORDER BY last_name, first_name, id
LIMIT 50;

-- Should show "Index Scan" not "Seq Scan"
```

---

## Migration from v1.3

### Legacy Truncation Metadata

v1.3 used `TruncationMetadata` (deprecated):

```typescript
// v1.3 (Deprecated)
interface TruncationMetadata {
  truncated: boolean;
  returnedCount: number;
  warning?: string;
}
```

v1.4 uses `PaginationMetadata`:

```typescript
// v1.4 (Current)
interface PaginationMetadata {
  hasMore: boolean;
  nextCursor?: string;
  returnedCount: number;
  totalEstimate?: string;
  hint?: string;
}
```

**Backwards Compatibility**: v1.3 `TruncationMetadata` is retained as deprecated type.

---

## Testing

Run pagination tests:

```bash
cd /home/jcornell/tamshai-enterprise-ai
./scripts/test_pagination.sh
```

**Expected Output**:
```
✅ MCP HR: 59 employees retrieved (2 pages)
✅ MCP Finance: Pagination ready
✅ MCP Sales: Pagination ready
✅ MCP Support: Pagination ready
```

---

## Related Documentation

- [Architecture Overview](overview.md) - Section 5.3 (Truncation Detection → Pagination)
- [MCP Gateway SSE Streaming](ssse-streaming.md) - Section 6.1
- [Constitutional Compliance](constitution.md) - Article III.2 (50-record limit)
- [V1.4 Implementation Summary](../../.specify/V1.4_IMPLEMENTATION_SUMMARY.md)

---

## Changelog

### v1.4.0 (December 2024)
- ✅ Implemented cursor-based pagination across all MCP servers
- ✅ Replaced truncation warnings with complete data retrieval
- ✅ Added AI-friendly hints for natural language pagination
- ✅ Increased max limit from 50 to 100 records per page
- ✅ Added SSE pagination events for real-time cursor delivery

### v1.3.0 (November 2024)
- ⚠️ LIMIT+1 truncation detection (deprecated)
- ⚠️ Truncation warnings (replaced by pagination)

---

**Last Updated**: December 10, 2024
**Architecture Version**: 1.4
**Status**: Production Ready
