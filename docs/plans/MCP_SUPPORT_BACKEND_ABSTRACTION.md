# MCP Support Backend Abstraction Plan

**Created**: January 13, 2026
**Status**: Pending Review
**Issue**: MCP Support fails in GCP Prod (no Elasticsearch), works in Dev/Stage (has Elasticsearch)

---

## Overview

Make MCP Support backend-agnostic using environment variable `SUPPORT_DATA_BACKEND` to switch between:
- **Elasticsearch** (Dev/Stage) - existing behavior
- **MongoDB** (GCP Prod) - new capability

**Critical Requirement**: Zero breaking changes to Dev/Stage environments.

---

## Environment Configuration

### Environment Variable
```bash
SUPPORT_DATA_BACKEND=elasticsearch  # Default (Dev/Stage)
SUPPORT_DATA_BACKEND=mongodb        # GCP Prod only
```

### Deployment Configuration

| Environment | Backend | Connection | Data Format |
|-------------|---------|------------|-------------|
| **Dev** | Elasticsearch | `http://elasticsearch:9200` | support-data.ndjson |
| **Stage** | Elasticsearch | `http://elasticsearch:9200` | support-data.ndjson |
| **GCP Prod** | MongoDB | MongoDB Atlas URI | support-data.js |

---

## Implementation Plan

### Phase 1: Create Backend Abstraction Layer

#### 1.1 Create Interface Definition
**File**: `services/mcp-support/src/database/types.ts` (NEW)

```typescript
/**
 * Backend-agnostic data access interface for Support service
 */
export interface SupportTicket {
  ticket_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  tags?: string[];
  resolution?: string;
}

export interface KnowledgeArticle {
  kb_id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface SearchTicketsParams {
  query?: string;
  status?: string;
  priority?: string;
  limit: number;
  cursor?: string;
  userContext: {
    userId: string;
    username: string;
    roles: string[];
  };
}

export interface SearchResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  totalCount?: string;
}

/**
 * Backend interface - implemented by both Elasticsearch and MongoDB adapters
 */
export interface ISupportBackend {
  // Health check
  checkConnection(): Promise<boolean>;

  // Ticket operations
  searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>>;
  getTicketById(ticketId: string): Promise<SupportTicket | null>;
  updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean>;

  // Knowledge Base operations (may return NOT_IMPLEMENTED for MongoDB)
  searchKnowledgeBase(query: string, category?: string, limit?: number, cursor?: string): Promise<SearchResult<KnowledgeArticle>>;
  getArticleById(articleId: string): Promise<KnowledgeArticle | null>;

  // Cleanup
  close(): Promise<void>;
}
```

#### 1.2 Create Elasticsearch Backend Adapter
**File**: `services/mcp-support/src/database/elasticsearch.backend.ts` (NEW)

**Purpose**: Wrap existing Elasticsearch logic into adapter pattern.

**Key Points**:
- Implements `ISupportBackend` interface
- Contains ALL existing Elasticsearch query logic (no changes to queries)
- Role-based filtering: executives/support roles see all, others see only their tickets
- Cursor-based pagination using `search_after`
- Maps Elasticsearch results to `SupportTicket` interface

**Pseudocode**:
```typescript
export class ElasticsearchBackend implements ISupportBackend {
  private client: Client;

  constructor(url: string) {
    this.client = new Client({ node: url });
  }

  async searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>> {
    // Existing Elasticsearch query logic from index.ts lines 103-187
    // - Build bool query with must/filter clauses
    // - Add role-based filters
    // - Apply LIMIT+1 pattern
    // - Use search_after for cursor pagination
    // - Return mapped results
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    // Query by ticket_id.keyword field
    // Return first hit or null
  }

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean> {
    // Existing update logic from executeCloseTicket (lines 376-404)
    // - Search by ticket_id.keyword to get _id
    // - Use esClient.update() with doc ID
  }

  async searchKnowledgeBase(...): Promise<SearchResult<KnowledgeArticle>> {
    // Existing KB search logic (lines 194-262)
  }

  async getArticleById(articleId: string): Promise<KnowledgeArticle | null> {
    // Existing article fetch logic (lines 272-305)
  }
}
```

#### 1.3 Create MongoDB Backend Adapter
**File**: `services/mcp-support/src/database/mongodb.backend.ts` (NEW)

**Purpose**: New MongoDB implementation following MCP Sales pattern.

**Key Points**:
- Implements `ISupportBackend` interface
- Uses `getCollection()` and `buildRoleFilter()` from connection module
- Cursor-based pagination using `_id` field
- Knowledge Base methods return NOT_IMPLEMENTED error

**Pseudocode**:
```typescript
import { ObjectId } from 'mongodb';
import { getCollection, buildRoleFilter } from './connection';

export class MongoDBBackend implements ISupportBackend {
  async searchTickets(params: SearchTicketsParams): Promise<SearchResult<SupportTicket>> {
    const collection = await getCollection('tickets');
    const roleFilter = buildRoleFilter(params.userContext);

    // Build MongoDB filter
    const filter: any = { ...roleFilter };
    if (params.status) filter.status = params.status;
    if (params.priority) filter.priority = params.priority;
    if (params.query) {
      filter.$or = [
        { title: { $regex: params.query, $options: 'i' } },
        { description: { $regex: params.query, $options: 'i' } }
      ];
    }

    // Cursor pagination
    if (params.cursor) {
      const decoded = decodeCursor(params.cursor);
      filter._id = { $lt: new ObjectId(decoded._id) };
    }

    // LIMIT+1 pattern
    const results = await collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .toArray();

    const hasMore = results.length > params.limit;
    const data = hasMore ? results.slice(0, params.limit) : results;

    return {
      data: data.map(doc => ({ ...doc, _id: doc._id.toString() })),
      hasMore,
      nextCursor: hasMore ? encodeCursor({ _id: data[data.length - 1]._id.toString() }) : undefined
    };
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    const collection = await getCollection('tickets');
    return await collection.findOne({ ticket_id: ticketId });
  }

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean> {
    const collection = await getCollection('tickets');
    const result = await collection.updateOne(
      { ticket_id: ticketId },
      { $set: updates }
    );
    return result.matchedCount > 0;
  }

  async searchKnowledgeBase(...): Promise<SearchResult<KnowledgeArticle>> {
    throw new Error('NOT_IMPLEMENTED: Knowledge Base requires Elasticsearch (not deployed in GCP Phase 1)');
  }

  async getArticleById(articleId: string): Promise<KnowledgeArticle | null> {
    throw new Error('NOT_IMPLEMENTED: Knowledge Base requires Elasticsearch (not deployed in GCP Phase 1)');
  }
}
```

#### 1.4 Create MongoDB Connection Module
**File**: `services/mcp-support/src/database/connection.ts` (NEW - already exists from earlier work)

**Purpose**: MongoDB connection with role-based filtering (mirrors MCP Sales pattern).

**Already Created**: This file exists from the earlier attempt. Contents:
- `getDatabase()` - MongoDB connection
- `getCollection(name)` - Get collection reference
- `buildRoleFilter(userContext)` - Role-based query filters
- `checkConnection()` - Health check
- `closeConnection()` - Cleanup

**Role Filter Logic**:
```typescript
export function buildRoleFilter(userContext: UserContext): Filter<any> {
  const { userId, roles, username } = userContext;

  // Executives and support roles can see all data
  if (
    roles.includes('executive') ||
    roles.includes('support-read') ||
    roles.includes('support-write')
  ) {
    return {};
  }

  // Managers can see their team's data
  if (roles.includes('manager')) {
    return {
      $or: [
        { assigned_to: username },
        { created_by: username },
      ],
    };
  }

  // Default: only own records
  return { created_by: username };
}
```

#### 1.5 Create Backend Factory
**File**: `services/mcp-support/src/database/backend.factory.ts` (NEW)

**Purpose**: Create appropriate backend based on environment variable.

```typescript
import { ISupportBackend } from './types';
import { ElasticsearchBackend } from './elasticsearch.backend';
import { MongoDBBackend } from './mongodb.backend';

export function createSupportBackend(): ISupportBackend {
  const backendType = process.env.SUPPORT_DATA_BACKEND || 'elasticsearch';

  switch (backendType) {
    case 'elasticsearch':
      const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9201';
      return new ElasticsearchBackend(esUrl);

    case 'mongodb':
      // MongoDB connection configured via MONGODB_URL/MONGODB_URI env vars
      // (handled by connection.ts module)
      return new MongoDBBackend();

    default:
      throw new Error(`Unknown SUPPORT_DATA_BACKEND: ${backendType}. Use 'elasticsearch' or 'mongodb'.`);
  }
}
```

---

### Phase 2: Update MCP Support Server

#### 2.1 Modify index.ts
**File**: `services/mcp-support/src/index.ts` (MODIFY)

**Changes**:
1. Remove direct Elasticsearch client initialization (lines 29-32)
2. Remove `UserContext` interface (lines 34-39) - import from types instead
3. Import backend factory and types
4. Initialize backend using factory
5. Update all tool functions to use backend interface
6. Handle NOT_IMPLEMENTED errors for KB in MongoDB mode

**Before** (lines 29-39):
```typescript
// Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9201',
});

interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}
```

**After**:
```typescript
import { ISupportBackend, UserContext } from './database/types';
import { createSupportBackend } from './database/backend.factory';

// Initialize backend based on environment
const backend: ISupportBackend = createSupportBackend();
```

#### 2.2 Update Health Check
**Before** (lines 62-68):
```typescript
app.get('/health', async (req: Request, res: Response) => {
  try {
    await esClient.ping();
    res.json({ status: 'healthy', ... });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', ... });
  }
});
```

**After**:
```typescript
app.get('/health', async (req: Request, res: Response) => {
  const isHealthy = await backend.checkConnection();
  if (!isHealthy) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString() });
    return;
  }
  res.json({
    status: 'healthy',
    service: 'mcp-support',
    version: '1.4.0',
    backend: process.env.SUPPORT_DATA_BACKEND || 'elasticsearch',
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});
```

#### 2.3 Update searchTickets Function
**Before** (lines 103-187): Direct Elasticsearch queries

**After**:
```typescript
async function searchTickets(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, status, priority, limit, cursor } = SearchTicketsInputSchema.parse(input);

    const result = await backend.searchTickets({
      query,
      status,
      priority,
      limit,
      cursor,
      userContext
    });

    // Build pagination metadata
    let metadata: PaginationMetadata | undefined;
    if (result.hasMore || cursor) {
      metadata = {
        hasMore: result.hasMore,
        returnedCount: result.data.length,
        ...(result.hasMore && {
          nextCursor: result.nextCursor,
          totalEstimate: `${limit}+`,
          hint: `To see more tickets, say "show next page" or "get more tickets".`
        })
      };
    }

    return createSuccessResponse(result.data, metadata);
  } catch (error: any) {
    logger.error('search_tickets error:', error);
    return createErrorResponse('DATABASE_ERROR', 'Failed to search tickets', 'Please try again or contact support', { errorMessage: error.message });
  }
}
```

#### 2.4 Update searchKnowledgeBase Function
**After**:
```typescript
async function searchKnowledgeBase(input: any, userContext: UserContext): Promise<MCPToolResponse<any[]>> {
  try {
    const { query, category, limit, cursor } = SearchKnowledgeBaseInputSchema.parse(input);

    const result = await backend.searchKnowledgeBase(query, category, limit, cursor);

    // Build pagination metadata (same as before)
    let metadata: PaginationMetadata | undefined;
    // ... pagination logic

    return createSuccessResponse(result.data, metadata);
  } catch (error: any) {
    logger.error('search_knowledge_base error:', error);

    // Special handling for NOT_IMPLEMENTED
    if (error.message.includes('NOT_IMPLEMENTED')) {
      return createErrorResponse(
        'NOT_IMPLEMENTED',
        'Knowledge Base not available',
        'Knowledge Base requires Elasticsearch which is not deployed in this environment. Only ticket search is available.',
        { backend: process.env.SUPPORT_DATA_BACKEND || 'elasticsearch' }
      );
    }

    return createErrorResponse('DATABASE_ERROR', 'Failed to search knowledge base', 'Please try again or contact support', { errorMessage: error.message });
  }
}
```

#### 2.5 Update closeTicket and executeCloseTicket
**After**:
```typescript
async function closeTicket(input: any, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    if (!hasClosePermission(userContext.roles)) {
      return createErrorResponse('INSUFFICIENT_PERMISSIONS', ...);
    }

    const { ticketId, resolution } = CloseTicketInputSchema.parse(input);

    const ticket = await backend.getTicketById(ticketId);
    if (!ticket) {
      return createErrorResponse('TICKET_NOT_FOUND', `Ticket with ID "${ticketId}" was not found`, ...);
    }

    // Store confirmation (same as before)
    const confirmationId = uuidv4();
    const confirmationData = {
      action: 'close_ticket',
      ticketId,
      ticketTitle: ticket.title,
      currentStatus: ticket.status,
      resolution,
      // ... other fields
    };

    await storePendingConfirmation(confirmationId, confirmationData, 300);
    return createPendingConfirmationResponse(confirmationId, message, confirmationData);
  } catch (error: any) {
    logger.error('close_ticket error:', error);
    return createErrorResponse('DATABASE_ERROR', ...);
  }
}

async function executeCloseTicket(confirmationData: Record<string, unknown>, userContext: UserContext): Promise<MCPToolResponse<any>> {
  try {
    const ticketId = confirmationData.ticketId as string;
    const resolution = confirmationData.resolution as string;

    const updated = await backend.updateTicket(ticketId, {
      status: 'closed',
      resolution,
      closed_at: new Date().toISOString(),
      closed_by: userContext.userId,
    });

    if (!updated) {
      return createErrorResponse('TICKET_NOT_FOUND', `Ticket with ID "${ticketId}" was not found`, ...);
    }

    return createSuccessResponse({
      success: true,
      message: `Ticket has been successfully closed`,
      ticketId,
    });
  } catch (error: any) {
    logger.error('execute_close_ticket error:', error);
    return createErrorResponse('DATABASE_ERROR', ...);
  }
}
```

#### 2.6 Update Server Shutdown
**Before** (lines 590-617):
```typescript
process.on('SIGTERM', async () => {
  server.close(async () => {
    await esClient.close();
    process.exit(0);
  });
});
```

**After**:
```typescript
process.on('SIGTERM', async () => {
  server.close(async () => {
    await backend.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  server.close(async () => {
    await backend.close();
    process.exit(0);
  });
});
```

---

### Phase 3: Update Dependencies

#### 3.1 Update package.json
**File**: `services/mcp-support/package.json` (MODIFY)

**Changes**:
- Keep `@elastic/elasticsearch` (still used in Dev/Stage)
- Add `mongodb` if not already present

**Add**:
```json
{
  "dependencies": {
    "@elastic/elasticsearch": "^8.11.0",
    "mongodb": "^6.3.0",
    ...
  }
}
```

---

### Phase 4: Update Environment Configuration

#### 4.1 Dev Environment (docker-compose.yml)
**File**: `infrastructure/docker/docker-compose.yml` (MODIFY)

**Before** (lines 339-347):
```yaml
mcp-support:
  environment:
    NODE_ENV: development
    PORT: 3104
    ELASTICSEARCH_URL: http://elasticsearch:9200
    REDIS_HOST: redis
    REDIS_PORT: 6379
    LOG_LEVEL: info
```

**After**:
```yaml
mcp-support:
  environment:
    NODE_ENV: development
    PORT: 3104
    # Backend selection (elasticsearch = default for Dev/Stage)
    SUPPORT_DATA_BACKEND: elasticsearch
    ELASTICSEARCH_URL: http://elasticsearch:9200
    # MongoDB fallback (not used in Dev, but available)
    MONGODB_URL: mongodb://tamshai:${MONGODB_PASSWORD:-changeme}@mongodb:27017/tamshai_support?authSource=admin
    REDIS_HOST: redis
    REDIS_PORT: 6379
    LOG_LEVEL: info
```

#### 4.2 Stage Environment (cloud-init.yaml)
**File**: `infrastructure/terraform/vps/cloud-init.yaml` (MODIFY)

**Add to .env section** (around line 110):
```yaml
# MCP Support backend (elasticsearch for Stage)
SUPPORT_DATA_BACKEND=elasticsearch
ELASTICSEARCH_URL=http://elasticsearch:9200
```

#### 4.3 GCP Prod Environment
**File**: `infrastructure/terraform/modules/cloudrun/main.tf` (MODIFY)

**Locate mcp-support service** (search for `service_name = "mcp-support"`):

**Add environment variables**:
```hcl
resource "google_cloud_run_v2_service" "mcp_support" {
  # ... existing config

  template {
    containers {
      env {
        name  = "SUPPORT_DATA_BACKEND"
        value = "mongodb"  # MongoDB for GCP Prod
      }

      env {
        name  = "MONGODB_URL"
        value_source {
          secret_key_ref {
            secret  = "tamshai-prod-mongodb-uri"
            version = "latest"
          }
        }
      }

      env {
        name  = "MONGODB_DB"
        value = "tamshai_support"
      }

      # ... other env vars (REDIS_HOST, etc.)
    }
  }
}
```

---

## Testing Plan

**CRITICAL**: Testing must follow this exact sequence to prevent committing breaking changes.

### Workflow: Test → Commit → Test

1. **Phase 1: Test Dev (NO COMMIT)**
   - Implement all code changes
   - Deploy directly to Dev environment (docker compose)
   - Verify no regressions
   - **DO NOT COMMIT** until Dev passes

2. **Phase 2: Commit After Dev Success**
   - Once Dev tests pass, commit and push changes
   - Trigger Stage deployment via CI/CD

3. **Phase 3: Test Stage**
   - Verify Stage deployment works
   - Test with real users if needed

4. **Phase 4: Deploy GCP Prod**
   - After Stage verified, deploy to GCP
   - Test MongoDB backend in production

---

### Test 1: Dev Environment (Elasticsearch) - **NO COMMIT YET**

**Prerequisites**:
- All code changes complete (Phases 1-4)
- Changes NOT committed to git
- Local dev environment running

**Test Steps**:
```bash
# 1. Stop existing MCP Support container
cd infrastructure/docker
docker compose down mcp-support

# 2. Rebuild with new code (local changes)
docker compose up -d --build mcp-support

# 3. Wait for service to start
sleep 10

# 4. Verify Elasticsearch backend
docker compose logs mcp-support | grep -i "backend"
# Expected: Log message showing "backend: elasticsearch"

# 5. Test health check
curl http://localhost:3104/health
# Expected: {"status":"healthy","backend":"elasticsearch","database":"connected",...}

# 6. Test search tickets (direct endpoint)
curl -X POST http://localhost:3104/tools/search_tickets \
  -H "Content-Type: application/json" \
  -d '{
    "userContext": {"userId":"test","username":"dan.williams","roles":["support-write"]},
    "limit": 5
  }'
# Expected: Returns tickets from Elasticsearch (TICK-001 to TICK-010)

# 7. Test knowledge base (direct endpoint)
curl -X POST http://localhost:3104/tools/search_knowledge_base \
  -H "Content-Type: application/json" \
  -d '{
    "userContext": {"userId":"test","username":"dan.williams","roles":["support-read"]},
    "query": "help"
  }'
# Expected: Returns KB articles from Elasticsearch

# 8. Test via MCP Gateway (if running locally)
# Login to get JWT token, then:
curl -X POST http://localhost:3100/api/mcp/support/list_tickets \
  -H "Authorization: Bearer $JWT_TOKEN"
# Expected: Returns tickets via gateway

# 9. Test close ticket (write operation)
curl -X POST http://localhost:3104/tools/close_ticket \
  -H "Content-Type: application/json" \
  -d '{
    "userContext": {"userId":"test","username":"dan.williams","roles":["support-write"]},
    "ticketId": "TICK-001",
    "resolution": "Test resolution"
  }'
# Expected: Returns pending_confirmation response
```

**Success Criteria**:
- ✅ Health check returns 200 with `"backend":"elasticsearch"`
- ✅ Search tickets returns 10 tickets from Elasticsearch
- ✅ Knowledge base search returns articles
- ✅ Close ticket returns confirmation request
- ✅ No errors in docker logs
- ✅ All existing functionality works exactly as before

**If Dev Tests Pass**: Proceed to commit changes

**If Dev Tests Fail**:
- Debug and fix issues
- DO NOT COMMIT
- Re-test Dev until passing

---

### Test 2: Stage Environment (Elasticsearch) - **AFTER COMMIT**

**Prerequisites**:
- Dev tests passed (Test 1)
- Code committed and pushed to main branch
- Stage VPS deployment triggered (CI/CD or manual)

**Test Steps**:
```bash
# 1. Verify deployment (SSH to VPS or check logs)
ssh root@$VPS_HOST "cd /opt/tamshai && docker compose ps mcp-support"
# Expected: mcp-support container running

# 2. Check logs for backend type
ssh root@$VPS_HOST "docker logs tamshai-mcp-support | grep -i backend"
# Expected: "backend: elasticsearch"

# 3. Test health check via public URL
curl https://$VPS_DOMAIN/api/mcp/support/health
# Expected: {"status":"healthy","backend":"elasticsearch",...}

# 4. Test authenticated request (use real credentials)
# Login to Stage, get JWT, then:
curl -X POST https://$VPS_DOMAIN/api/mcp/support/list_tickets \
  -H "Authorization: Bearer $JWT_TOKEN"
# Expected: Returns tickets from Elasticsearch

# 5. Test via Support web app
# Open https://$VPS_DOMAIN/support in browser
# Login as user with support-read role
# Verify tickets load correctly
```

**Success Criteria**:
- ✅ Stage deployment successful
- ✅ Health check returns elasticsearch backend
- ✅ Tickets load via API and web app
- ✅ No errors in Stage logs
- ✅ Users can access Support data

---

### Test 3: GCP Prod Environment (MongoDB) - **AFTER STAGE SUCCESS**

**Prerequisites**:
- Dev tests passed
- Stage tests passed
- Code committed to main
- Ready to deploy to GCP

**Test Steps**:
```bash
# 1. Deploy to GCP
cd infrastructure/terraform/gcp
terraform apply -auto-approve

# 2. Wait for Cloud Run deployment
sleep 60

# 3. Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-support" \
  --limit 50 \
  --format json \
  | jq -r '.[] | select(.jsonPayload.message != null) | .jsonPayload.message'

# Expected in logs: "backend: mongodb"

# 4. Test health check
curl https://mcp-support-fn44nd7wba-uc.a.run.app/health
# Expected: {"status":"healthy","backend":"mongodb","database":"connected",...}

# 5. Test via MCP Gateway (authenticated with eve.thompson)
# Get JWT token for executive user, then:
curl -X POST https://mcp-gateway-fn44nd7wba-uc.a.run.app/api/mcp/support/list_tickets \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"
# Expected: Returns tickets from MongoDB (TICK-001 to TICK-010)

# 6. Test KB (should fail gracefully)
curl -X POST https://mcp-gateway-fn44nd7wba-uc.a.run.app/api/mcp/support/search_knowledge_base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"help"}'
# Expected: {"status":"error","code":"NOT_IMPLEMENTED","message":"Knowledge Base not available"}

# 7. Test close ticket (write operation)
curl -X POST https://mcp-gateway-fn44nd7wba-uc.a.run.app/api/mcp/support/close_ticket \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticketId":"TICK-001","resolution":"Test resolution"}'
# Expected: Returns pending_confirmation response
```

**Success Criteria**:
- ✅ GCP deployment successful
- ✅ Health check returns mongodb backend
- ✅ Tickets load from MongoDB
- ✅ Knowledge Base returns NOT_IMPLEMENTED error
- ✅ Close ticket works with MongoDB updates
- ✅ No errors in Cloud Run logs

---

### Test 4: Backend Switching (Optional - Local Verification)

**Purpose**: Verify backend factory correctly switches between Elasticsearch and MongoDB.

**Test Steps**:
```bash
# Test MongoDB mode locally
cd services/mcp-support
export SUPPORT_DATA_BACKEND=mongodb
export MONGODB_URL=mongodb://tamshai:changeme@localhost:27018/tamshai_support?authSource=admin
npm run dev

# In another terminal:
curl http://localhost:3104/health
# Expected: {"status":"healthy","backend":"mongodb",...}

# Stop service, switch to Elasticsearch
export SUPPORT_DATA_BACKEND=elasticsearch
export ELASTICSEARCH_URL=http://localhost:9201
npm run dev

# Test again:
curl http://localhost:3104/health
# Expected: {"status":"healthy","backend":"elasticsearch",...}
```

---

## Rollback Plan

If issues arise:

1. **Revert code changes**:
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Redeploy previous version**:
   ```bash
   # Dev/Stage
   cd infrastructure/docker
   docker compose up -d --build mcp-support

   # GCP Prod
   cd infrastructure/terraform/gcp
   terraform apply -auto-approve
   ```

3. **Emergency hotfix**: Set `SUPPORT_DATA_BACKEND=elasticsearch` in all environments to restore original behavior.

---

## Success Criteria

- [ ] Dev environment: MCP Support works with Elasticsearch (no changes in behavior)
- [ ] Stage environment: MCP Support works with Elasticsearch (no changes in behavior)
- [ ] GCP Prod: MCP Support works with MongoDB, returns tickets for users with support roles
- [ ] Health check reports correct backend type
- [ ] Knowledge Base returns NOT_IMPLEMENTED error in MongoDB mode
- [ ] All existing tests pass
- [ ] No breaking changes to Dev/Stage

---

## Files Changed Summary

**New Files** (7):
- `services/mcp-support/src/database/types.ts`
- `services/mcp-support/src/database/backend.factory.ts`
- `services/mcp-support/src/database/elasticsearch.backend.ts`
- `services/mcp-support/src/database/mongodb.backend.ts`
- `services/mcp-support/src/database/connection.ts` (already exists)
- `docs/plans/MCP_SUPPORT_BACKEND_ABSTRACTION.md` (this file)

**Modified Files** (4):
- `services/mcp-support/src/index.ts` - Use backend interface instead of direct esClient
- `services/mcp-support/package.json` - Add mongodb dependency
- `infrastructure/docker/docker-compose.yml` - Add SUPPORT_DATA_BACKEND env var
- `infrastructure/terraform/vps/cloud-init.yaml` - Add SUPPORT_DATA_BACKEND env var
- `infrastructure/terraform/modules/cloudrun/main.tf` - Add MongoDB env vars for mcp-support

**Total LOC Estimate**: ~800 lines (500 new backend code, 300 refactored index.ts)

---

## Timeline Estimate

- Phase 1 (Backend abstraction): 3-4 hours
- Phase 2 (Update index.ts): 2-3 hours
- Phase 3 (Dependencies): 15 minutes
- Phase 4 (Environment config): 30 minutes
- Testing: 2-3 hours
- **Total**: ~8-11 hours

---

## Questions for Review

1. Should Knowledge Base functions throw `NOT_IMPLEMENTED` or return empty results in MongoDB mode?
2. Should health check include backend type in response? (Currently planned: yes)
3. Should we add integration tests for both backends? (Recommended but not in this plan)
4. Should cursor encoding/decoding be shared between backends or duplicated? (Currently: duplicated)

---

**Status**: Ready for review and approval
