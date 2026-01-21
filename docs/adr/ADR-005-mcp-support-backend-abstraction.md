# ADR-005: MCP Support Backend Abstraction (Elasticsearch vs MongoDB)

<!--
JSON-LD metadata for machine readability
-->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "ADR-005: MCP Support Backend Abstraction",
  "headline": "Environment-Specific Backend Strategy for MCP Support Service",
  "description": "Documents the decision to use Elasticsearch in dev/stage and MongoDB in production for the MCP Support service",
  "datePublished": "2026-01-13",
  "dateModified": "2026-01-21",
  "keywords": ["elasticsearch", "mongodb", "backend-abstraction", "mcp-support", "cost-optimization"],
  "learningResourceType": "architecture-decision",
  "articleSection": "Architecture Decision Record",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Elasticsearch" },
    { "@type": "SoftwareApplication", "name": "MongoDB" }
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

MCP Support service provides AI access to support tickets and knowledge base articles. The service was originally built with Elasticsearch as the data store, which works well in dev/stage environments where Elasticsearch runs in Docker.

**Problem**: GCP Production has no Elasticsearch instance due to cost constraints. Elastic Cloud starts at ~$95/month, while MongoDB Atlas offers a free M0 tier.

The service failed silently in production with connection errors to non-existent Elasticsearch.

## Decision

Implement a backend abstraction layer that allows MCP Support to use different data stores based on environment:

```bash
SUPPORT_DATA_BACKEND=elasticsearch  # Dev/Stage (default)
SUPPORT_DATA_BACKEND=mongodb        # GCP Prod
```

### Architecture

```typescript
// Backend-agnostic interface
interface SupportDataProvider {
  searchTickets(params: SearchParams): Promise<Ticket[]>;
  getTicket(ticketId: string): Promise<Ticket>;
  searchKnowledgeBase(query: string): Promise<Article[]>;
}

// Environment-based factory
function createDataProvider(): SupportDataProvider {
  const backend = process.env.SUPPORT_DATA_BACKEND || 'elasticsearch';

  switch (backend) {
    case 'mongodb':
      return new MongoDBSupportProvider(process.env.MONGODB_URI);
    case 'elasticsearch':
    default:
      return new ElasticsearchSupportProvider(process.env.ELASTICSEARCH_URL);
  }
}
```

### Environment Configuration

| Environment | Backend | Connection | Cost |
|-------------|---------|------------|------|
| **Dev** | Elasticsearch | `http://elasticsearch:9200` | $0 (Docker) |
| **Stage** | Elasticsearch | `http://elasticsearch:9200` | $0 (Docker) |
| **Prod** | MongoDB | MongoDB Atlas M0 | $0 (Free tier) |

## Alternatives Considered

### Run Elasticsearch in GCP

**Rejected because**:
- Elastic Cloud: $95+/month minimum
- Self-managed on GCE: $30+/month + maintenance overhead
- Overkill for current ticket/KB volume

### Use MongoDB Everywhere

**Rejected because**:
- Dev/Stage already have Elasticsearch with sample data
- Would require migrating existing sample data
- Elasticsearch provides superior full-text search for dev testing
- "Zero breaking changes to Dev/Stage" was a requirement

### Remove MCP Support from Production

**Rejected because**:
- Support functionality is core to the AI assistant
- Would create feature disparity between environments

## Consequences

### Positive

- **Production Works**: MCP Support functional in GCP with free MongoDB
- **Cost Effective**: $0/month for production support data
- **Environment Parity**: Same MCP tools available in all environments
- **Future Flexibility**: Can add more backends (PostgreSQL, etc.)

### Negative

- **Two Codepaths**: Must maintain Elasticsearch and MongoDB implementations
- **Query Differences**: Full-text search behavior differs between backends
- **Testing Complexity**: Need to test both backends
- **Data Format**: Different loaders for each backend (NDJSON vs JS)

### Data Loading

| Environment | Data File | Loader |
|-------------|-----------|--------|
| Dev/Stage | `sample-data/support-data.ndjson` | Elasticsearch bulk API |
| Prod | `sample-data/support-data.js` | MongoDB insertMany |

## Implementation

```typescript
// services/mcp-support/src/database/mongodb-provider.ts
export class MongoDBSupportProvider implements SupportDataProvider {
  private client: MongoClient;
  private db: Db;

  async searchTickets(params: SearchParams): Promise<Ticket[]> {
    const filter: Filter<Ticket> = {};

    if (params.query) {
      filter.$text = { $search: params.query };
    }
    if (params.status) {
      filter.status = params.status;
    }

    return this.db.collection<Ticket>('tickets')
      .find(filter)
      .limit(params.limit)
      .toArray();
  }
}
```

## References

- `docs/plans/MCP_SUPPORT_BACKEND_ABSTRACTION.md` - Full implementation plan
- `docs/setup/MONGODB_ATLAS_SETUP.md` - MongoDB Atlas configuration
- `docs/plans/GCP_PROD_PHASE_1_COST_SENSITIVE.md` - Cost optimization context

## Related Decisions

- ADR-011: GCP Production Cost Optimization (drove this decision)
- ADR-009: Keycloak 23 Challenges (similar environment-specific patterns)

---

*This ADR is part of the Tamshai Project Journey - sometimes the best architecture is one that adapts to constraints.*
