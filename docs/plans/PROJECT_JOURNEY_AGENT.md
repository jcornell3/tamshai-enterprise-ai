# Project Journey Agent - Implementation Plan

**Version**: 1.2.0
**Created**: January 21, 2026
**Updated**: January 21, 2026
**Author**: Tamshai-Dev
**Status**: ✅ APPROVED
**Deployment Scope**: Dev and Stage environments only (NOT GCP production)

## Executive Summary

The **Project Journey Agent** is a specialized MCP server that exposes the Tamshai Enterprise AI project's "experiential lineage" - the narrative of failures, pivots, technical debt, and architectural decisions captured in our extensive documentation. Unlike typical code documentation agents that explain "what" the code does, this agent focuses on "why" decisions were made and "what didn't work."

### Value Proposition

| Traditional Doc Agent | Journey Agent |
|----------------------|---------------|
| Explains current code | Explains decision history |
| Describes features | Describes failures and pivots |
| Static documentation | Living Architecture Decision Records |
| Code-centric | Experience-centric |

### Primary Use Cases

1. **External Users**: Query project history to learn from our mistakes
2. **AI Agents (A2A)**: Programmatically discover architectural decisions and anti-patterns
3. **New Team Members**: Understand why the codebase is structured the way it is
4. **Future Development**: Avoid repeating past failures

### Deployment Scope

| Environment | Deployed | Purpose |
|-------------|----------|---------|
| **Dev** | ✅ Yes | Initial testing and development |
| **Stage** | ✅ Yes | Pre-release validation, external access |
| **Prod (GCP)** | ❌ No | Not deployed - see rationale below |

**Why Not Production?**
- Journey Agent exposes internal development history (not customer-facing)
- Stage environment provides sufficient external access for learning purposes
- Reduces GCP costs and attack surface in production
- Production focuses on core business MCP servers (HR, Finance, Sales, Support)

### Key Deliverables Checklist

> **v1.2.0 Requirements** (from third-party review)

| # | Deliverable | Phase | Status |
|---|-------------|-------|--------|
| 1 | `/.well-known/mcp.json` manifest with `$schema` validation | Phase 3 | Required |
| 2 | Visual Checksum Handshake for initial agent connections | Phase 4 | Required |
| 3 | Minimum 3 MCP Resource Templates (in addition to tools) | Phase 2 | Required |
| 4 | JSON-LD headers in all new ADRs for machine readability | Phase 1 | Required |
| 5 | Agent Identity attribution in all responses | Phase 2 | Required |
| 6 | QR code / "Add to AI" button on setup portal | Phase 3 | Recommended |
| 7 | Prompt injection defense (even for public access) | Phase 4 | Required |

### Priority Journey Examples

The agent must excel at explaining these two journeys (see Design Decisions § 6):

| Journey | Path | Key Learning |
|---------|------|--------------|
| **Desktop/Mobile Client** | Electron → React Native → Flutter | Why each technology was abandoned |
| **Phoenix Rebuild** | 15+ manual actions → 0 manual actions | Automation evolution over 11 iterations |

---

## Architecture Overview

### Architectural Alignment

> **Design Philosophy**: The Journey Agent leverages the existing distributed MCP architecture while keeping the "experiential lineage" context isolated from transactional servers (mcp-hr, mcp-finance, mcp-sales, mcp-support). This separation ensures:
> - Journey queries don't impact business-critical MCP server performance
> - Security boundaries remain clear (public documentation vs. protected business data)
> - The agent can be independently scaled, updated, or disabled without affecting core services

### Position in MCP Architecture

> **Note**: mcp-journey is deployed to **dev and stage only** (not GCP production).

```
                    ┌─────────────────────────────────────────────────────┐
                    │              External Users / Agents                 │
                    └─────────────────────────────────────────────────────┘
                                           │
                                           │ HTTPS + Agent Protocol
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     API Gateway Layer (Dev/Stage Only)                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │  Kong Gateway   │    │ /.well-known/   │    │   Agent Discovery       │  │
│  │  (Port 8100)    │    │  mcp.json       │    │   Endpoint              │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           │ MCP Protocol (SSE)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MCP Gateway (Port 3100)                           │
│                                                                              │
│  ┌─────────────────────────────────────────────┐  ┌─────────────────────┐   │
│  │     Core MCP Servers (All Environments)     │  │  mcp-journey        │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │  │  (Dev/Stage Only)   │   │
│  │  │ mcp-hr  │ │mcp-fin  │ │mcp-sales│ ...   │  │  (Port 3105)        │   │
│  │  │ (3101)  │ │ (3102)  │ │ (3103)  │       │  └─────────────────────┘   │
│  │  └─────────┘ └─────────┘ └─────────┘       │            │               │
│  └─────────────────────────────────────────────┘            ▼               │
│                                          ┌─────────────────────────────────┐ │
│                                          │   Knowledge Index               │ │
│                                          │   - docs/archived/              │ │
│                                          │   - docs/development/           │ │
│                                          │   - .specify/memory/            │ │
│                                          │   - docs/operations/PHOENIX_*   │ │
│                                          └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose | Technology | Environment |
|-----------|---------|------------|-------------|
| mcp-journey | MCP server exposing project knowledge | TypeScript/Node.js | Dev, Stage only |
| Knowledge Index | Indexed markdown files with embeddings | SQLite + Embeddings | Dev, Stage only |
| Agent Manifest | Discovery endpoint for A2A | JSON at /.well-known/ | Stage (www.tamshai.com) |
| Setup Portal | Zero-config installation UX | Static HTML + QR Code | Stage (www.tamshai.com) |

---

## Implementation Phases

### Phase 1: Knowledge Foundation (Week 1-2)

**Goal**: Index and structure existing documentation for AI consumption.

#### 1.1 Document Inventory & Classification

Create semantic index of all project documentation:

| Document Type | Location | Priority | JSON-LD Type |
|---------------|----------|----------|--------------|
| Failure Logs | `docs/archived/keycloak-debugging-2025-12/` | HIGH | `TechArticle` |
| Lessons Learned | `docs/development/lessons-learned.md` | HIGH | `LearningResource` |
| Phoenix Logs | `docs/operations/PHOENIX_*.md` | HIGH | `TechArticle` |
| Architecture Specs | `.specify/ARCHITECTURE_SPECS.md` | MEDIUM | `TechArticle` |
| Constitution | `.specify/memory/constitution.md` | MEDIUM | `CreativeWork` |
| Troubleshooting | `docs/troubleshooting/` | MEDIUM | `HowTo` |
| Plans | `docs/plans/` | LOW | `Plan` |

#### 1.2 ADR Standardization

Convert key documentation to **Architecture Decision Records (ADR)** format:

```markdown
# ADR-001: Nginx to Caddy Migration

## Status
Accepted (December 2025)

## Context
mTLS configuration overhead with Nginx was blocking VPS staging deployment.

## Decision
Pivot from Nginx to Caddy for staging reverse proxy.

## Consequences
- Positive: Automatic HTTPS, simpler config
- Negative: Less community resources for edge cases

## References
- `docs/archived/keycloak-debugging-2025-12/2025-12-28-caddy-migration.md`
- `docs/troubleshooting/VPS_DATA_AVAILABILITY_ISSUES.md`
```

#### 1.3 JSON-LD Metadata Headers

> **Requirement**: All new ADRs MUST include JSON-LD headers for machine readability. This enables AI agents to parse structured metadata without relying solely on natural language processing.

Add machine-readable metadata to key documents:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "Keycloak 23 Deep Dive",
  "description": "Technical analysis of Keycloak 23 configuration issues and resolutions",
  "datePublished": "2025-12-28",
  "keywords": ["keycloak", "authentication", "debugging"],
  "learningResourceType": "failure-analysis",
  "supersedes": null,
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": {
    "@type": "SoftwareApplication",
    "name": "Keycloak"
  }
}
</script>
```

---

### Phase 2: MCP Journey Server (Week 3-4)

**Goal**: Build the MCP server that exposes project knowledge.

#### 2.1 Service Structure

```
services/mcp-journey/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── query-failures.ts     # Query failure documentation
│   │   ├── lookup-adr.ts         # Lookup Architecture Decision Records
│   │   ├── search-journey.ts     # Semantic search across all docs
│   │   └── get-context.ts        # Get context for a topic
│   ├── resources/
│   │   ├── failures.ts           # journey://failures/{topic}
│   │   ├── decisions.ts          # journey://decisions/{id}
│   │   └── evolution.ts          # journey://evolution/{component}
│   ├── indexer/
│   │   ├── markdown-parser.ts    # Parse markdown files
│   │   ├── json-ld-extractor.ts  # Extract JSON-LD metadata
│   │   ├── embedding-generator.ts # Generate embeddings for semantic search
│   │   └── index-builder.ts      # Build SQLite index
│   └── config/
│       └── knowledge-sources.ts  # Define indexed directories
├── data/
│   └── knowledge.db              # SQLite knowledge index
├── Dockerfile
├── package.json
└── tsconfig.json
```

#### 2.2 MCP Tools

> **Design Note**: Tools are for high-level semantic search and summarization. For documentation-heavy agents, balance tools with Resources (section 2.3) that allow querying agents to read primary documents directly.

| Tool | Description | Parameters | Use Case |
|------|-------------|------------|----------|
| `query_failures` | Find documentation about what didn't work | `topic: string`, `component?: string` | Semantic search |
| `lookup_adr` | Get specific Architecture Decision Record | `adr_id: string` | Direct lookup |
| `search_journey` | Semantic search across all journey docs | `query: string`, `limit?: number` | Discovery |
| `get_context` | Get historical context for a decision | `topic: string`, `date_range?: string` | Analysis |
| `list_pivots` | List all documented technology pivots | `component?: string` | Enumeration |

#### 2.3 MCP Resources (Resource Templates)

> **Requirement**: Minimum 3 Resource Templates required (in addition to tools). Resources allow direct document access without tool invocation overhead.

| Resource URI | Description |
|--------------|-------------|
| `journey://failures/{topic}` | Failure logs for a specific topic |
| `journey://decisions/{adr-id}` | Specific ADR document |
| `journey://evolution/{component}` | Evolution history of a component |
| `journey://lessons` | All lessons learned |
| `journey://phoenix/{version}` | Specific Phoenix rebuild log |

#### 2.4 Agent Identity Attribution

> **Requirement**: All responses must explicitly identify themselves as derived from "Journey" documentation to distinguish historical failures from current system capabilities.

**Implementation**:
```typescript
// src/middleware/agent-identity.ts
export interface JourneyResponse {
  // Required identity attribution
  _meta: {
    source: 'tamshai-project-journey';
    type: 'historical-documentation';
    disclaimer: string;
    documentDates: string[];  // Dates of source documents
  };
  // Actual response data
  data: unknown;
}

export function wrapWithIdentity(data: unknown, sourceDocs: Document[]): JourneyResponse {
  return {
    _meta: {
      source: 'tamshai-project-journey',
      type: 'historical-documentation',
      disclaimer: 'This response is derived from historical project documentation. ' +
        'It describes past decisions, failures, and approaches that may no longer ' +
        'reflect current system capabilities or best practices.',
      documentDates: sourceDocs.map(d => d.date).sort()
    },
    data
  };
}
```

**Example Response with Identity**:
```json
{
  "_meta": {
    "source": "tamshai-project-journey",
    "type": "historical-documentation",
    "disclaimer": "This response is derived from historical project documentation...",
    "documentDates": ["2025-12-15", "2025-12-28", "2026-01-05"]
  },
  "data": {
    "query": "Why did you switch from Nginx to Caddy?",
    "answer": "The migration occurred in December 2025 due to mTLS configuration complexity...",
    "sources": [...]
  }
}
```

**Why This Matters**:
- Prevents confusion between "what the system did" and "what the system does now"
- Allows querying agents to appropriately caveat historical information
- Supports audit trails for AI-generated content

---

#### 2.5 Example Tool Implementation

```typescript
// src/tools/query-failures.ts
import { Tool, ToolResponse } from '@modelcontextprotocol/sdk';
import { KnowledgeIndex } from '../indexer/index-builder';

export const queryFailuresTool: Tool = {
  name: 'query_failures',
  description: 'Query documentation about what did NOT work in the project. ' +
    'Returns failure logs, debugging narratives, and lessons learned.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The topic to search for failures (e.g., "keycloak", "terraform", "nginx")'
      },
      component: {
        type: 'string',
        description: 'Optional: Specific component (e.g., "mcp-gateway", "web-portal")'
      }
    },
    required: ['topic']
  },
  async execute(params: { topic: string; component?: string }): Promise<ToolResponse> {
    const index = await KnowledgeIndex.getInstance();

    const results = await index.searchFailures({
      topic: params.topic,
      component: params.component,
      documentTypes: ['failure-analysis', 'debugging-log', 'lessons-learned']
    });

    return {
      status: 'success',
      data: results.map(r => ({
        title: r.title,
        summary: r.summary,
        date: r.date,
        outcome: r.metadata.outcome, // 'resolved', 'workaround', 'abandoned'
        rootCause: r.metadata.rootCause,
        filePath: r.filePath,
        relevanceScore: r.score
      })),
      metadata: {
        totalResults: results.length,
        query: params.topic,
        suggestedAction: results.length === 0
          ? 'Try broader terms or check journey://lessons for general insights'
          : null
      }
    };
  }
};
```

---

### Phase 3: Discovery & Installation (Week 5-6)

**Goal**: Enable zero-config discovery and installation for users and agents.

#### 3.1 Well-Known Manifest

Create `/.well-known/mcp.json` on stage environment (`www.tamshai.com`):

> **Note**: This manifest is served from the **stage** environment only. The Journey Agent is not deployed to GCP production.

```json
{
  "$schema": "https://modelcontextprotocol.io/schema/v1/server-config.json",
  "name": "Tamshai Project Journey Agent",
  "version": "1.0.0",
  "description": "Expert agent for the tamshai-enterprise-ai codebase, development history, and architectural decisions. Specializes in 'what didn't work' knowledge.",
  "publisher": {
    "name": "Tamshai Corp",
    "url": "https://www.tamshai.com",
    "contact": "support@tamshai.com"
  },
  "environment": "stage",
  "mcp_config": {
    "type": "sse",
    "url": "https://www.tamshai.com/api/mcp/journey/sse",
    "capabilities": [
      "failure_logs",
      "architecture_evolution",
      "adr_lookup",
      "semantic_search"
    ]
  },
  "auth": {
    "type": "none",
    "note": "Public access - no authentication required (Phase 1)"
  },
  "resources": [
    {
      "uri_template": "journey://failures/{topic}",
      "description": "Retrieves failure documentation for a given topic"
    },
    {
      "uri_template": "journey://decisions/{adr_id}",
      "description": "Retrieves a specific Architecture Decision Record"
    },
    {
      "uri_template": "journey://evolution/{component}",
      "description": "Retrieves evolution history of a component"
    }
  ],
  "context_roots": [
    ".specify/memory",
    "docs/archived",
    "docs/operations",
    "docs/development"
  ],
  "verification": {
    "visual_code": "🛡️-💎-🚀-🔑",
    "gpg_key_url": "https://www.tamshai.com/.well-known/gpg-key.asc",
    "signature_url": "https://www.tamshai.com/.well-known/mcp.json.sig"
  }
}
```

#### 3.2 README Integration

Add to project `README.md`:

```markdown
## 🤖 AI Agent Integration

This project includes a **Project Journey Agent** that can answer questions about
the development history, architectural decisions, and lessons learned.

> **Note**: The Journey Agent is available on **dev and stage** environments only (not production).

### Quick Setup

<!-- MCP-CONFIG-START
{
  "$schema": "https://modelcontextprotocol.io/schema/v1/server-config.json",
  "name": "tamshai-journey",
  "type": "sse",
  "url": "https://www.tamshai.com/api/mcp/journey/sse",
  "environment": "stage"
}
MCP-CONFIG-END -->

**For Claude Desktop / Cursor:**
1. Visit [www.tamshai.com/agent-setup](https://www.tamshai.com/agent-setup)
2. Click "Add to Claude" or scan the QR code
3. Verify the security code: 🛡️-💎-🚀-🔑

**For AI Agents:**
Fetch configuration from `https://www.tamshai.com/.well-known/mcp.json`

### What You Can Ask

- "Why did you choose Caddy over Nginx?"
- "What failures did you encounter with Keycloak?"
- "Show me the Phoenix rebuild history"
- "What were the lessons learned from the VPS deployment?"
```

#### 3.3 Agent Setup Portal

Create `apps/agent-setup/` static site:

```
apps/agent-setup/
├── index.html          # Main setup page
├── qr-code.html        # QR code display
├── verify.html         # Verification confirmation
├── css/
│   └── style.css
├── js/
│   ├── qr-generator.js
│   ├── deep-link.js
│   └── config-copy.js
└── assets/
    └── logo.svg
```

**index.html Features:**
- Visual display of MCP configuration JSON
- QR code encoding `mcp://config?url=https://tamshai.com/.well-known/mcp.json`
- "Copy to Clipboard" button for JSON
- Deep link buttons for supported AI clients
- Security verification code display
- GPG signature verification instructions

#### 3.4 Deep Linking

Register custom protocol handler:

```javascript
// Handle mcp:// protocol
if (window.location.protocol === 'mcp:') {
  const params = new URLSearchParams(window.location.search);
  const configUrl = params.get('url');

  // Allow both www.tamshai.com (stage) and tamshai.local (dev)
  const validDomains = ['https://www.tamshai.com/', 'https://www.tamshai.local/'];
  const isValid = validDomains.some(domain => configUrl?.startsWith(domain));

  if (configUrl && isValid) {
    // Fetch and display config for user approval
    fetchAndDisplayConfig(configUrl);
  } else {
    showError('Invalid configuration URL - must be from www.tamshai.com or www.tamshai.local');
  }
}
```

---

### Phase 4: Security & Trust (Week 7)

**Goal**: Implement anti-injection patterns and cryptographic verification.

> **Critical Note**: Even though the Journey Agent has public access (no authentication), prompt injection defense is REQUIRED. Public access increases the attack surface, making input validation and schema enforcement essential.

#### 4.1 Configuration Signing

```bash
# Generate GPG key for signing
gpg --full-generate-key

# Sign the manifest
gpg --armor --detach-sign .well-known/mcp.json

# Verify signature
gpg --verify .well-known/mcp.json.sig .well-known/mcp.json
```

#### 4.2 Schema Validation

All configuration must validate against official MCP schema:

```typescript
// src/validation/schema-validator.ts
import Ajv from 'ajv';

const MCP_CONFIG_SCHEMA = 'https://modelcontextprotocol.io/schema/v1/server-config.json';

export async function validateConfig(config: unknown): Promise<boolean> {
  const ajv = new Ajv();
  const schema = await fetch(MCP_CONFIG_SCHEMA).then(r => r.json());
  const validate = ajv.compile(schema);

  if (!validate(config)) {
    throw new Error(`Invalid configuration: ${ajv.errorsText(validate.errors)}`);
  }

  // Additional check: reject if config contains instruction-like text
  const jsonStr = JSON.stringify(config);
  const injectionPatterns = [
    /ignore.*previous/i,
    /disregard.*instructions/i,
    /you are now/i,
    /pretend to be/i
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(jsonStr)) {
      throw new Error('Configuration rejected: contains instruction-like text');
    }
  }

  return true;
}
```

#### 4.3 Visual Checksum Handshake

> **Requirement**: All initial agent connections MUST include a visual checksum handshake. This allows users to verify they are connecting to the legitimate Journey Agent and not a spoofed endpoint.

```typescript
// src/security/checksum-handshake.ts
import crypto from 'crypto';

const EMOJI_ALPHABET = ['🛡️', '💎', '🚀', '🔑', '⚡', '🌟', '🎯', '💡'];

export function generateVisualChecksum(configUrl: string, timestamp: number): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${configUrl}:${timestamp}`)
    .digest('hex');

  // Convert first 4 bytes to emoji indices
  const emojis = [];
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
    emojis.push(EMOJI_ALPHABET[byte % EMOJI_ALPHABET.length]);
  }

  return emojis.join('-');
}

// On first connection, agent sends:
// "Connection established. Security Code: 🛡️-💎-🚀-🔑.
//  Please verify this matches https://www.tamshai.com/agent-setup"
```

#### 4.4 Domain Isolation

```typescript
// src/security/domain-validator.ts
// Note: Journey Agent is deployed to dev/stage only (not GCP production)
const TRUSTED_DOMAINS = [
  // Stage environment
  'www.tamshai.com',
  // Dev environment
  'www.tamshai.local',
  'tamshai.local'
];

export function validateConfigOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      throw new Error('Configuration must be served over HTTPS');
    }

    // Must be from trusted domain
    if (!TRUSTED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
      throw new Error(`Untrusted domain: ${parsed.hostname}`);
    }

    return true;
  } catch (e) {
    throw new Error(`Invalid configuration URL: ${e.message}`);
  }
}
```

---

### Phase 5: Agent Protocol Integration (Week 8)

**Goal**: Implement Agent Protocol for standardized task orchestration.

#### 5.1 Agent Protocol Endpoints

```typescript
// src/agent-protocol/routes.ts
import { Router } from 'express';

const router = Router();

// POST /agent/tasks - Create a new task
router.post('/tasks', async (req, res) => {
  const { input } = req.body;
  const taskId = generateTaskId();

  // Queue the task
  await taskQueue.add({
    id: taskId,
    input,
    status: 'pending',
    steps: []
  });

  res.json({
    task_id: taskId,
    status: 'pending',
    created_at: new Date().toISOString()
  });
});

// GET /agent/tasks/:taskId - Get task status
router.get('/tasks/:taskId', async (req, res) => {
  const task = await taskQueue.get(req.params.taskId);

  res.json({
    task_id: task.id,
    status: task.status,
    steps: task.steps,
    output: task.output,
    artifacts: task.artifacts
  });
});

// GET /agent/tasks/:taskId/steps - Get task steps
router.get('/tasks/:taskId/steps', async (req, res) => {
  const task = await taskQueue.get(req.params.taskId);
  res.json({ steps: task.steps });
});
```

#### 5.2 Task Execution with Transparent Steps

```typescript
// src/agent-protocol/task-executor.ts
export async function executeJourneyQuery(
  taskId: string,
  query: string
): Promise<TaskResult> {
  const steps: TaskStep[] = [];

  // Step 1: Parse query intent
  steps.push({
    step_id: 'parse_intent',
    status: 'completed',
    output: `Identified query type: failure_search, topic: "${extractTopic(query)}"`
  });
  await updateTaskSteps(taskId, steps);

  // Step 2: Search knowledge index
  steps.push({
    step_id: 'search_index',
    status: 'running',
    output: 'Searching 14 Phoenix rebuild logs, 16 Keycloak debugging files...'
  });
  await updateTaskSteps(taskId, steps);

  const results = await knowledgeIndex.search(query);

  steps[1].status = 'completed';
  steps[1].output = `Found ${results.length} relevant documents`;
  await updateTaskSteps(taskId, steps);

  // Step 3: Synthesize response
  steps.push({
    step_id: 'synthesize',
    status: 'completed',
    output: 'Generated response from top 5 most relevant documents'
  });
  await updateTaskSteps(taskId, steps);

  return {
    status: 'completed',
    output: synthesizeResponse(results),
    artifacts: results.map(r => ({
      type: 'file',
      path: r.filePath,
      title: r.title
    }))
  };
}
```

---

### Phase 6: A2A Communication (Week 9)

**Goal**: Enable agent-to-agent discovery and communication.

#### 6.1 Discovery Endpoint

```typescript
// GET /ai - Agent discovery endpoint
// Note: This endpoint is available on stage only (www.tamshai.com)
router.get('/ai', async (req, res) => {
  res.json({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Tamshai Project Journey Agent",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Any",
    "environment": "stage",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://www.tamshai.com/api/agent/tasks",
        "httpMethod": "POST",
        "contentType": "application/json"
      },
      "query-input": "required name=query"
    },
    "documentation": "https://www.tamshai.com/.well-known/mcp.json"
  });
});
```

#### 6.2 High-Density JSON-LD Responses for A2A

```typescript
// For A2A communication, return structured JSON-LD instead of prose
export function formatA2AResponse(results: SearchResult[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "numberOfItems": results.length,
    "itemListElement": results.map((r, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "TechArticle",
        "name": r.title,
        "url": `https://github.com/jcornell3/tamshai-enterprise-ai/blob/main/${r.filePath}`,
        "datePublished": r.date,
        "about": r.topics,
        "learningResourceType": r.documentType,
        "text": r.summary,
        "isPartOf": {
          "@type": "CreativeWork",
          "name": "Tamshai Project Journey"
        }
      }
    }))
  };
}
```

---

## File Structure Summary

### New Files to Create

```
services/mcp-journey/                    # New MCP server
├── src/
│   ├── index.ts
│   ├── tools/*.ts
│   ├── resources/*.ts
│   ├── indexer/*.ts
│   ├── agent-protocol/*.ts
│   └── security/*.ts
├── data/knowledge.db
├── Dockerfile
├── package.json
└── README.md

apps/agent-setup/                        # Setup portal
├── index.html
├── qr-code.html
├── verify.html
├── css/style.css
└── js/*.js

.well-known/                             # Discovery manifests
├── mcp.json
├── mcp.json.sig
├── gpg-key.asc
└── ai-agent.json

docs/adr/                                # Architecture Decision Records
├── ADR-001-nginx-to-caddy.md
├── ADR-002-react-native-to-flutter.md
├── ADR-003-elasticsearch-to-mongodb.md
└── README.md
```

### Files to Modify

| File | Change |
|------|--------|
| `README.md` | Add AI Agent Integration section |
| `CLAUDE.md` | Add mcp-journey to service list (note: dev/stage only) |
| `infrastructure/docker/docker-compose.yml` | Add mcp-journey service (dev) |
| `infrastructure/terraform/vps/main.tf` | Add mcp-journey to VPS deployment (stage) |
| `infrastructure/cloud-init/cloud-init.yaml` | Add mcp-journey container (stage) |

### Files to NOT Modify (GCP Exclusion)

> **IMPORTANT**: mcp-journey is NOT deployed to GCP production.

| File | Action |
|------|--------|
| `infrastructure/terraform/gcp/main.tf` | ❌ Do NOT add mcp-journey Cloud Run service |
| `.github/workflows/deploy-to-gcp.yml` | ❌ Do NOT add mcp-journey deployment |
| `scripts/gcp/phoenix-rebuild.sh` | ❌ Do NOT include mcp-journey in rebuild |

**Rationale**: The Journey Agent is for development learning and external education, not production customer workloads.

---

## Dependencies

### NPM Packages for mcp-journey

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.0.0",
    "express": "^4.18.0",
    "marked": "^11.0.0",
    "gray-matter": "^4.0.3",
    "openai": "^4.0.0",
    "ajv": "^8.12.0",
    "qrcode": "^1.5.0"
  }
}
```

### External Dependencies

| Dependency | Purpose | Required By |
|------------|---------|-------------|
| OpenAI API | Embedding generation for semantic search | Phase 2 |
| GPG | Configuration signing | Phase 4 |
| SQLite | Knowledge index storage | Phase 2 |

---

## Timeline

| Phase | Duration | Dependencies | Deliverable |
|-------|----------|--------------|-------------|
| 1. Knowledge Foundation | Week 1-2 | None | ADRs, JSON-LD metadata |
| 2. MCP Journey Server | Week 3-4 | Phase 1 | Working mcp-journey service |
| 3. Discovery & Installation | Week 5-6 | Phase 2 | Setup portal, manifests |
| 4. Security & Trust | Week 7 | Phase 3 | Signed configs, validation |
| 5. Agent Protocol | Week 8 | Phase 2 | Task orchestration API |
| 6. A2A Communication | Week 9 | Phase 5 | JSON-LD responses, discovery |

**Total Estimated Duration**: 9 weeks

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Knowledge Index Coverage | 100% of docs/ | Files indexed / Total files |
| Query Response Time | < 2 seconds | P95 latency |
| Setup Success Rate | > 90% | Users completing setup / Attempts |
| A2A Discovery | 100% | Agents finding manifest / Requests |
| False Positive Rate | < 1% | Injection attempts blocked / Total |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Embedding API costs | Medium | Use local embeddings (sentence-transformers) |
| Prompt injection | High | Schema validation, domain isolation, signing |
| Index staleness | Medium | Git hooks to re-index on doc changes |
| MCP protocol changes | Low | Pin SDK version, monitor changelog |

---

## Design Decisions

### 1. Authentication: Public Access (Phase 1)

**Decision**: No authentication required for external users in Phase 1.

**Rationale**:
- The Journey Agent exposes documentation that is already public (GitHub repo)
- Lower friction encourages adoption and learning
- Value is in sharing lessons learned, not protecting proprietary data
- Internal MCP servers (HR, Finance, etc.) remain protected behind Keycloak

**Security Model** (Dev/Stage environments only):
```
┌─────────────────────────────────────────────────────────────────┐
│          Public Access (No Auth) - DEV/STAGE ONLY               │
│  ┌─────────────┐                                                │
│  │ mcp-journey │ ← External users/agents can query directly     │
│  └─────────────┘   (NOT deployed to GCP production)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│       Protected Access (Keycloak Auth) - ALL ENVIRONMENTS       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   mcp-hr    │  │ mcp-finance │  │  mcp-sales  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**Future Consideration**: If abuse occurs, add optional API key authentication in Phase 2.

---

### 2. Embedding Model: Google Gemini Pro

**Decision**: Use Gemini Pro via Personal Access Token (PAT) for embedding generation.

**Configuration**:
```typescript
// src/config/embedding.ts
export const EMBEDDING_CONFIG = {
  provider: 'gemini',
  model: 'text-embedding-004',  // Gemini's embedding model
  dimensions: 768,
  batchSize: 100,
  maxTokensPerRequest: 2048
};
```

**Cost Analysis** (Gemini Pro pricing as of Jan 2026):

| Operation | Cost | Typical Usage | Monthly Estimate |
|-----------|------|---------------|------------------|
| Initial indexing | ~$0.10 | 218 docs × ~1KB avg | One-time |
| Re-indexing (on changes) | ~$0.01 | ~10 docs/week | $0.04/month |
| Query embeddings | ~$0.001 | ~1000 queries/month | $1.00/month |
| **Total** | | | **~$1-2/month** |

**Implementation**:
```typescript
// src/indexer/gemini-embeddings.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}
```

---

### 3. Rate Limiting Strategy

**Decision**: Implement tiered rate limiting to prevent DoS while allowing legitimate AI agent usage.

#### Typical AI Agent Query Patterns

Based on observed behavior of AI agents querying knowledge bases:

| Agent Type | Typical Pattern | Queries/Session | Session Duration |
|------------|-----------------|-----------------|------------------|
| **Claude/ChatGPT** (conversational) | Burst then idle | 3-5 queries | 2-5 minutes |
| **Cursor/Copilot** (code assistant) | Steady stream | 10-20 queries | 30-60 minutes |
| **Automated crawler** | Rapid enumeration | 50-100 queries | 1-5 minutes |
| **Research agent** | Deep dive | 20-50 queries | 10-30 minutes |

**Recommended Rate Limits**:

| Tier | Limit | Window | Use Case |
|------|-------|--------|----------|
| **Per-IP Burst** | 10 requests | 10 seconds | Prevents rapid-fire abuse |
| **Per-IP Sustained** | 60 requests | 1 minute | Normal conversational use |
| **Per-IP Daily** | 1,000 requests | 24 hours | Prevents resource exhaustion |
| **Global** | 10,000 requests | 1 hour | Protects infrastructure |

**Implementation**:
```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Burst limiter: 10 req/10sec
export const burstLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  message: {
    error: 'Too many requests. AI agents typically need 3-5 queries per conversation.',
    retryAfter: 10
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Sustained limiter: 60 req/min
export const sustainedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: 'Rate limit exceeded. Consider caching responses locally.',
    retryAfter: 60
  }
});

// Daily limiter: 1000 req/day
export const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1000,
  store: new RedisStore({ /* redis config */ }),
  keyGenerator: (req) => req.ip,
  message: {
    error: 'Daily limit reached. Contact support@tamshai.com for higher limits.',
    retryAfter: 86400
  }
});
```

**Response Headers** (help agents self-regulate):
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1706400000
X-RateLimit-Policy: "10;w=10, 60;w=60, 1000;w=86400"
```

**Guidance for AI Agents** (included in `/.well-known/mcp.json`):
```json
{
  "rate_limits": {
    "burst": { "requests": 10, "window_seconds": 10 },
    "sustained": { "requests": 60, "window_seconds": 60 },
    "daily": { "requests": 1000, "window_seconds": 86400 },
    "recommendation": "Cache responses locally. Most queries can be answered with 3-5 requests per session."
  }
}
```

---

### 4. Caching Strategy & Implications

**Decision**: Multi-layer caching with architecture version awareness.

#### Cache Layers

| Layer | TTL | What's Cached | Invalidation |
|-------|-----|---------------|--------------|
| **Embedding Cache** | Permanent | Document embeddings | On file change (git hook) |
| **Search Results** | 1 hour | Query → results mapping | On index rebuild |
| **Document Content** | 15 minutes | Rendered markdown | On file change |
| **API Response** | 5 minutes | Full API responses | Time-based |

#### Caching Implications

**Short Cache (5-15 min)**:
- ✅ Users see recent documentation changes quickly
- ✅ Bug fixes in docs propagate fast
- ❌ Higher compute/API costs
- ❌ More embedding API calls

**Medium Cache (1 hour)**:
- ✅ Good balance of freshness vs cost
- ✅ Repeated queries are fast
- ❌ Doc updates take up to 1 hour to appear
- Recommended for search results

**Long Cache (24+ hours)**:
- ✅ Minimal API costs
- ✅ Very fast responses
- ❌ Stale data risk
- ❌ Architecture version confusion
- Only appropriate for stable, versioned content

**Recommendation**: Use **version-aware caching**:

```typescript
// Cache key includes architecture version
const cacheKey = `search:${architectureVersion}:${queryHash}`;

// Example: v1.4 queries are cached separately from v1.3 queries
// This allows comparing "how did v1.3 handle X vs v1.4"
```

---

### 5. Architecture Version Journey

**Decision**: Treat architecture versions as first-class entities that tell a story.

#### Version Timeline Model

```typescript
// src/models/architecture-version.ts
interface ArchitectureVersion {
  version: string;          // "v1.3", "v1.4", "v1.5"
  codename?: string;        // "Foundation", "SSE & Confirmations"
  dateRange: {
    start: string;          // "2025-10-01"
    end: string | null;     // null = current
  };
  majorChanges: string[];
  failures: string[];       // What didn't work in this version
  pivots: string[];         // Technology pivots made
  documentRoots: string[];  // Where docs for this version live
}

const ARCHITECTURE_VERSIONS: ArchitectureVersion[] = [
  {
    version: "v1.0",
    codename: "Initial Scaffold",
    dateRange: { start: "2025-09-01", end: "2025-10-15" },
    majorChanges: ["Basic MCP Gateway", "Keycloak integration"],
    failures: ["Nginx mTLS complexity"],
    pivots: [],
    documentRoots: ["docs/archived/v1.0/"]
  },
  {
    version: "v1.3",
    codename: "MCP Suite Complete",
    dateRange: { start: "2025-11-01", end: "2025-12-15" },
    majorChanges: ["4 MCP servers", "15 tools", "RBAC"],
    failures: ["React Native Windows crashes", "Elasticsearch in prod"],
    pivots: ["React Native → Flutter", "Elasticsearch → MongoDB (prod)"],
    documentRoots: ["docs/architecture/Tamshai_Enterprise_AI_Architecture_v1.3_FINAL.md"]
  },
  {
    version: "v1.4",
    codename: "SSE & Confirmations",
    dateRange: { start: "2025-12-15", end: null },
    majorChanges: ["SSE streaming", "Human-in-the-loop", "Truncation warnings"],
    failures: ["Keycloak 23 migration issues", "Phoenix rebuild gaps"],
    pivots: [],
    documentRoots: [
      "docs/architecture/V1.4_CHANGES.md",
      "docs/status/V1.4_IMPLEMENTATION_STATUS.md"
    ]
  }
];
```

#### Journey-Centric Queries

The agent should support queries that explore the evolution:

| Query | Response |
|-------|----------|
| "What changed from v1.3 to v1.4?" | Diff of major changes, failures addressed |
| "Show me the journey of authentication" | Timeline: Nginx → Caddy → Keycloak fixes |
| "What failures led to v1.4?" | List of v1.3 issues that drove v1.4 changes |
| "Compare MCP architecture v1.0 vs v1.4" | Side-by-side evolution |

#### MCP Tools for Version Journey

```typescript
// New tools for version exploration
const versionTools = [
  {
    name: 'get_version_journey',
    description: 'Get the evolution story of the architecture across versions',
    parameters: {
      from_version: { type: 'string', optional: true },  // "v1.0"
      to_version: { type: 'string', optional: true },    // "v1.4"
      component: { type: 'string', optional: true }       // "authentication"
    }
  },
  {
    name: 'compare_versions',
    description: 'Compare two architecture versions side-by-side',
    parameters: {
      version_a: { type: 'string', required: true },
      version_b: { type: 'string', required: true },
      aspect: { type: 'string', enum: ['changes', 'failures', 'pivots', 'all'] }
    }
  },
  {
    name: 'get_version_failures',
    description: 'Get all documented failures for a specific architecture version',
    parameters: {
      version: { type: 'string', required: true }
    }
  }
];
```

#### Resource Templates for Versions

```
journey://versions                          # List all versions
journey://versions/v1.4                     # Details of v1.4
journey://versions/v1.4/failures            # Failures in v1.4
journey://versions/v1.3..v1.4               # Journey from v1.3 to v1.4
journey://versions/v1.4/component/auth      # Auth evolution in v1.4
```

### 6. Example Journeys (Priority Focus Areas)

These two journeys exemplify the "experiential lineage" the agent should excel at explaining:

#### Journey A: Desktop/Mobile Client Migration

**Path**: Electron → React Native → Flutter/Dart

```
Timeline:
┌─────────────────────────────────────────────────────────────────────────────┐
│  Oct 2025          Nov 2025              Dec 2025           Jan 2026        │
│     │                 │                     │                  │            │
│  Electron         React Native          Flutter/Dart       Production      │
│  (abandoned)      (abandoned)           (adopted)          (Windows)       │
│     │                 │                     │                  │            │
│     └── OAuth         └── Null pointer     └── Success!       └── v1.4    │
│         issues            refs in OAuth        Cross-platform              │
│                           lib (VS2022)         single codebase             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Failures to Document**:
| Attempt | Technology | Failure Reason | Documentation |
|---------|------------|----------------|---------------|
| 1 | Electron | OAuth authentication issues | `docs/archived/electron-evaluation/` |
| 2 | React Native | Null pointer references in OAuth library with VS2022 builds | `docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md` |
| 3 | Flutter | ✅ Success | `.specify/specs/009-flutter-unified/` |

**Sample Agent Query**:
```
Q: "Why did you abandon React Native for the desktop client?"

A: React Native was abandoned in November 2025 due to critical issues with OAuth
   authentication on Windows:
   1. Null pointer references in the OAuth library when building with VS2022
   2. The underlying library had unresolved bugs that made OAuth flows unreliable
   3. Electron was previously abandoned for similar OAuth issues

   The decision is documented in docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md.
   Flutter was selected because it provides native compilation and stable OAuth
   support with a single Dart codebase.

   _meta: { source: "tamshai-project-journey", type: "historical-documentation" }
```

---

#### Journey B: Phoenix Rebuild Experience

**Path**: Manual Disaster Recovery → Semi-Automated → Fully Automated (0 Manual Actions)

```
Timeline:
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phoenix v1        v3-v5            v6-v8           v9-v11                  │
│     │                │                │                │                    │
│  15+ manual      8-10 manual      3-5 manual       0 manual                │
│  actions         actions          actions          actions                  │
│     │                │                │                │                    │
│     └── Pain!        └── Scripts      └── Automation   └── Full CI/CD      │
│         ~4 hours         ~2 hours         ~90 min          ~75 min         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Issues Resolved Over 11 Rebuilds**:
| Issue # | Problem | Resolution | Version Fixed |
|---------|---------|------------|---------------|
| #32 | `_REGION` substitution in provision-users | Inline CLOUD_SQL_INSTANCE construction | v10 |
| #36 | Terraform state lock deadlock | GCS lock file check before plan | v10 |
| #37 | mcp-gateway SSL startup failure | Staged deployment with 60s SSL wait | v11 |
| #49 | Keycloak realm sync timeout | Warmup curl before sync | v4 |

**Documentation Trail**:
- `docs/operations/PHOENIX_RUNBOOK.md` - Current operational runbook
- `docs/operations/PHOENIX_RECOVERY.md` - Disaster recovery scenarios
- `docs/operations/PHOENIX_MANUAL_ACTIONSv1.md` through `v11.md` - Evolution of manual steps
- `scripts/gcp/phoenix-rebuild.sh` - Automated rebuild script

**Sample Agent Query**:
```
Q: "What issues did you encounter during Phoenix rebuilds and how were they fixed?"

A: Over 11 Phoenix rebuild iterations, 37+ issues were identified and resolved:

   Critical Issues:
   - Issue #37 (v11): mcp-gateway failed SSL certificate retrieval on cold start.
     Fixed with staged deployment: deploy without SSL, wait 60s, redeploy with SSL.

   - Issue #36 (v10): Terraform state lock caused deadlock when GCS lock file
     persisted after failed run. Fixed by checking/clearing lock before terraform plan.

   - Issue #32 (v10): provision-users workflow failed due to _REGION not being
     substituted. Fixed by constructing CLOUD_SQL_INSTANCE inline in the script.

   The journey from 15+ manual actions (v1) to 0 manual actions (v11) is documented
   in docs/operations/PHOENIX_MANUAL_ACTIONSv*.md files.

   _meta: { source: "tamshai-project-journey", documentDates: ["2026-01-15", "2026-01-21"] }
```

---

#### Sample Response: Version Journey

```json
{
  "query": "What was the journey from v1.3 to v1.4?",
  "journey": {
    "from": "v1.3",
    "to": "v1.4",
    "duration": "6 weeks (Dec 2025 - Jan 2026)",
    "summary": "v1.4 addressed timeout issues with SSE streaming and added safety features for AI operations.",
    "key_failures_addressed": [
      {
        "issue": "HTTP requests timing out during Claude's 30-60 second reasoning",
        "solution": "Implemented SSE streaming with EventSource API",
        "documented_in": "docs/architecture/V1.4_CHANGES.md"
      },
      {
        "issue": "Users unaware when AI responses based on incomplete data",
        "solution": "Added truncation warnings with LIMIT+1 pattern",
        "documented_in": "docs/architecture/V1.4_CHANGES.md"
      }
    ],
    "pivots": [
      {
        "from": "React Native",
        "to": "Flutter",
        "reason": "Windows WebView2 crashes, bundle size",
        "documented_in": "docs/development/REACT_NATIVE_TO_FLUTTER_MIGRATION.md"
      }
    ],
    "phoenix_rebuilds": {
      "count": 11,
      "manual_actions_trend": "8 → 1 → 0 (fully automated by v11)",
      "documented_in": "docs/operations/PHOENIX_MANUAL_ACTIONSv11.md"
    }
  }
}
```

---

## Updated Dependencies

### NPM Packages for mcp-journey

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@google/generative-ai": "^0.21.0",
    "better-sqlite3": "^9.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "rate-limit-redis": "^4.0.0",
    "marked": "^11.0.0",
    "gray-matter": "^4.0.3",
    "ajv": "^8.12.0",
    "qrcode": "^1.5.0",
    "ioredis": "^5.3.0"
  }
}
```

### Environment Variables

```bash
# Gemini API (for embeddings)
GEMINI_API_KEY=your-gemini-pat-here

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# Rate limits (can override defaults)
RATE_LIMIT_BURST=10
RATE_LIMIT_SUSTAINED=60
RATE_LIMIT_DAILY=1000
```

---

## Open Questions (Resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| ~~Authentication~~ | **Public (no auth)** | Value is in sharing; docs are already public |
| ~~Embedding Model~~ | **Gemini Pro** | Cost-effective with existing plan |
| ~~Rate Limiting~~ | **Tiered: 10/10s, 60/min, 1000/day** | Matches AI agent usage patterns |
| ~~Caching~~ | **Version-aware, 5min-1hr** | Balances freshness with cost |
| ~~Versioning~~ | **First-class version entities** | Shows the journey across v1.0→v1.4+ |
| ~~Deployment Scope~~ | **Dev and Stage only** | Not customer-facing; reduces GCP costs and attack surface |

### Third-Party Review Items (v1.2.0)

| Review Item | Status | Section |
|-------------|--------|---------|
| Add `/.well-known/mcp.json` to deliverables | ✅ Added | Key Deliverables Checklist |
| Visual Checksum for initial handshakes | ✅ Enhanced | Phase 4.3 |
| Minimum 3 MCP Resource Templates | ✅ Documented (5 templates) | Phase 2.3 |
| JSON-LD headers in ADRs | ✅ Requirement added | Phase 1.3 |
| Agent Identity attribution | ✅ New section added | Phase 2.4 |
| Tool vs Resource balance | ✅ Design note added | Phase 2.2 |
| Prompt injection defense (public access) | ✅ Critical note added | Phase 4 |

---

## Next Steps

> **Plan Status**: ✅ APPROVED (January 21, 2026)

### Implementation Order

1. ~~**Approve Plan**~~: ✅ Complete
2. **Create ADRs** (Phase 1): Document key architectural decisions with JSON-LD headers
   - Priority: Desktop client migration (Electron → React Native → Flutter)
   - Priority: Phoenix rebuild evolution
3. **Scaffold Service** (Phase 2): Create `services/mcp-journey/` directory structure
4. **Build Indexer** (Phase 2): Implement markdown parser and Gemini embedding generator
5. **Implement Tools + Resources** (Phase 2): Build 5 MCP tools and 5 resource templates
6. **Deploy to Dev** (Phase 2): Test in local development environment
7. **Setup Portal + Discovery** (Phase 3): Create agent-setup portal and well-known manifest
8. **Security Implementation** (Phase 4): Visual checksum, schema validation, injection defense
9. **Deploy to Stage** (Phase 3-4): Deploy to www.tamshai.com for external access

---

## Related Documentation

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Agent Protocol Specification](https://agentprotocol.ai/)
- [ADR Template](https://adr.github.io/)
- [JSON-LD Schema.org](https://schema.org/)
- [MCP Gateway Architecture](../architecture/overview.md)

---

*This plan was created based on the Project Journey Agent concept document and aligned with the existing Tamshai Enterprise AI architecture.*
