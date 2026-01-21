# MCP Journey Server - TDD Plan

**Version**: 1.0.0
**Created**: January 21, 2026
**Author**: Tamshai-QA (Claude-QA)
**Status**: DRAFT - Awaiting Approval
**Related**: [PROJECT_JOURNEY_AGENT.md](./PROJECT_JOURNEY_AGENT.md)

---

## Executive Summary

This document defines the Test-Driven Development (TDD) plan for the **mcp-journey** service as specified in Phase 2 of the Project Journey Agent implementation plan. The TDD approach follows our established methodology (ADR-007) with 90% diff coverage enforcement.

### TDD Cycle

```
   ┌─────────────────────────────────────────────────────────────┐
   │                    TDD Cycle                                │
   │                                                             │
   │    ┌─────────┐    ┌─────────┐    ┌───────────┐             │
   │    │   RED   │───>│  GREEN  │───>│ REFACTOR  │─────┐       │
   │    │  QA     │    │   Dev   │    │  QA+Dev   │     │       │
   │    │ Writes  │    │ Writes  │    │  Improve  │     │       │
   │    │ Failing │    │ Minimal │    │   Code    │     │       │
   │    │  Tests  │    │  Code   │    │  Quality  │     │       │
   │    └─────────┘    └─────────┘    └───────────┘     │       │
   │         ^                                           │       │
   │         └───────────────────────────────────────────┘       │
   │                                                             │
   └─────────────────────────────────────────────────────────────┘
```

### Sprint Overview

| Sprint | Focus | Tests | Owner |
|--------|-------|-------|-------|
| Sprint 1 | Indexer Components | ~45 tests | QA (RED) → Dev (GREEN) |
| Sprint 2 | MCP Tools | ~60 tests | QA (RED) → Dev (GREEN) |
| Sprint 3 | MCP Resources | ~40 tests | QA (RED) → Dev (GREEN) |
| Sprint 4 | Middleware & Integration | ~35 tests | QA (RED) → Dev (GREEN) |
| **Total** | | **~180 tests** | |

### Coverage Requirements

- **90% diff coverage** on all new code (enforced by Codecov)
- **Type coverage**: 85%+ (via typescript-coverage-report)
- **Integration tests**: Minimum 10% of total test count

---

## Test Directory Structure

```
services/mcp-journey/
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── query-failures.ts
│   │   ├── lookup-adr.ts
│   │   ├── search-journey.ts
│   │   ├── get-context.ts
│   │   └── list-pivots.ts
│   ├── resources/
│   │   ├── failures.ts
│   │   ├── decisions.ts
│   │   ├── evolution.ts
│   │   ├── lessons.ts
│   │   └── phoenix.ts
│   ├── indexer/
│   │   ├── markdown-parser.ts
│   │   ├── json-ld-extractor.ts
│   │   ├── embedding-generator.ts
│   │   └── index-builder.ts
│   ├── middleware/
│   │   ├── agent-identity.ts
│   │   └── rate-limit.ts
│   └── config/
│       └── knowledge-sources.ts
├── tests/
│   ├── unit/
│   │   ├── indexer/
│   │   │   ├── markdown-parser.test.ts
│   │   │   ├── json-ld-extractor.test.ts
│   │   │   ├── embedding-generator.test.ts
│   │   │   └── index-builder.test.ts
│   │   ├── tools/
│   │   │   ├── query-failures.test.ts
│   │   │   ├── lookup-adr.test.ts
│   │   │   ├── search-journey.test.ts
│   │   │   ├── get-context.test.ts
│   │   │   └── list-pivots.test.ts
│   │   ├── resources/
│   │   │   ├── failures.test.ts
│   │   │   ├── decisions.test.ts
│   │   │   ├── evolution.test.ts
│   │   │   ├── lessons.test.ts
│   │   │   └── phoenix.test.ts
│   │   └── middleware/
│   │       ├── agent-identity.test.ts
│   │       └── rate-limit.test.ts
│   └── integration/
│       ├── knowledge-index.test.ts
│       └── mcp-server.test.ts
├── vitest.config.ts
└── package.json
```

---

## Sprint 1: Indexer Components (RED Phase)

**Duration**: 3-4 days
**Owner**: QA Lead (RED), Dev Lead (GREEN)
**Goal**: Define behavior for all indexer components that parse, extract, and index project documentation.

### 1.1 Markdown Parser (`markdown-parser.test.ts`)

**Purpose**: Parse markdown files and extract structured content.

**File**: `tests/unit/indexer/markdown-parser.test.ts`

```typescript
// Expected test structure - QA writes failing tests

import { describe, it, expect } from 'vitest';
import { MarkdownParser, ParsedDocument } from '@/indexer/markdown-parser';

describe('MarkdownParser', () => {
  describe('parseFile', () => {
    it('should extract frontmatter from markdown files', async () => {
      const content = `---
title: Test Document
date: 2026-01-15
tags: [test, example]
---
# Content here
`;
      const result = await MarkdownParser.parse(content);

      expect(result.frontmatter).toEqual({
        title: 'Test Document',
        date: '2026-01-15',
        tags: ['test', 'example']
      });
    });

    it('should extract headings hierarchy', async () => {
      const content = `# H1 Title
## H2 Section
### H3 Subsection
## Another H2`;

      const result = await MarkdownParser.parse(content);

      expect(result.headings).toEqual([
        { level: 1, text: 'H1 Title', line: 1 },
        { level: 2, text: 'H2 Section', line: 2 },
        { level: 3, text: 'H3 Subsection', line: 3 },
        { level: 2, text: 'Another H2', line: 4 }
      ]);
    });

    it('should extract code blocks with language tags', async () => {
      const content = '```typescript\nconst x = 1;\n```';

      const result = await MarkdownParser.parse(content);

      expect(result.codeBlocks).toEqual([
        { language: 'typescript', content: 'const x = 1;', line: 1 }
      ]);
    });

    it('should extract links and references', async () => {
      const content = `See [related doc](./other.md) and [external](https://example.com)`;

      const result = await MarkdownParser.parse(content);

      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({
        text: 'related doc',
        url: './other.md',
        isInternal: true
      });
    });

    it('should handle files without frontmatter', async () => {
      const content = '# Just a heading\nSome content';

      const result = await MarkdownParser.parse(content);

      expect(result.frontmatter).toEqual({});
      expect(result.headings).toHaveLength(1);
    });

    it('should extract plain text content for embedding', async () => {
      const content = `# Title
Some **bold** and _italic_ text.
- List item 1
- List item 2
`;
      const result = await MarkdownParser.parse(content);

      // Should strip markdown formatting
      expect(result.plainText).toContain('Title');
      expect(result.plainText).toContain('bold');
      expect(result.plainText).not.toContain('**');
      expect(result.plainText).not.toContain('_');
    });

    it('should calculate word count and reading time', async () => {
      const content = '# Title\n' + 'word '.repeat(200);

      const result = await MarkdownParser.parse(content);

      expect(result.wordCount).toBeGreaterThanOrEqual(200);
      expect(result.readingTimeMinutes).toBe(1); // ~200 words/min
    });
  });

  describe('parseDirectory', () => {
    it('should recursively parse all markdown files in directory', async () => {
      // Mock filesystem or use test fixtures
      const results = await MarkdownParser.parseDirectory('./test-fixtures/docs');

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('filePath');
      expect(results[0]).toHaveProperty('content');
    });

    it('should respect .gitignore patterns', async () => {
      const results = await MarkdownParser.parseDirectory('./test-fixtures/docs');

      const nodeModulesFiles = results.filter(r =>
        r.filePath.includes('node_modules')
      );
      expect(nodeModulesFiles).toHaveLength(0);
    });

    it('should include file metadata (mtime, size)', async () => {
      const results = await MarkdownParser.parseDirectory('./test-fixtures/docs');

      expect(results[0]).toHaveProperty('metadata');
      expect(results[0].metadata).toHaveProperty('modifiedAt');
      expect(results[0].metadata).toHaveProperty('sizeBytes');
    });
  });

  describe('error handling', () => {
    it('should throw descriptive error for invalid markdown', async () => {
      // Extremely malformed content that can't be parsed
      await expect(MarkdownParser.parse(null as unknown as string))
        .rejects.toThrow('Invalid content: expected string');
    });

    it('should handle empty files gracefully', async () => {
      const result = await MarkdownParser.parse('');

      expect(result.plainText).toBe('');
      expect(result.headings).toEqual([]);
      expect(result.wordCount).toBe(0);
    });
  });
});
```

**Test Count**: ~12 tests

---

### 1.2 JSON-LD Extractor (`json-ld-extractor.test.ts`)

**Purpose**: Extract JSON-LD metadata from HTML script tags in markdown files.

**File**: `tests/unit/indexer/json-ld-extractor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { JsonLdExtractor, SchemaOrgMetadata } from '@/indexer/json-ld-extractor';

describe('JsonLdExtractor', () => {
  describe('extract', () => {
    it('should extract JSON-LD from script tag', () => {
      const content = `# ADR-001
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "Test ADR",
  "datePublished": "2026-01-15"
}
</script>
Content here`;

      const result = JsonLdExtractor.extract(content);

      expect(result).not.toBeNull();
      expect(result?.['@type']).toBe('TechArticle');
      expect(result?.name).toBe('Test ADR');
      expect(result?.datePublished).toBe('2026-01-15');
    });

    it('should handle HTML comments around JSON-LD', () => {
      const content = `<!--
JSON-LD metadata
-->
<script type="application/ld+json">
{ "@type": "HowTo", "name": "Guide" }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.['@type']).toBe('HowTo');
    });

    it('should return null when no JSON-LD present', () => {
      const content = '# Regular markdown\nNo JSON-LD here';

      const result = JsonLdExtractor.extract(content);

      expect(result).toBeNull();
    });

    it('should extract nested objects (isPartOf, about)', () => {
      const content = `<script type="application/ld+json">
{
  "@type": "TechArticle",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Keycloak" }
  ]
}
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.isPartOf?.name).toBe('Tamshai Project Journey');
      expect(result?.about).toHaveLength(1);
      expect(result?.about?.[0]?.name).toBe('Keycloak');
    });

    it('should validate schema.org context', () => {
      const content = `<script type="application/ld+json">
{ "@context": "https://invalid.org", "@type": "Article" }
</script>`;

      expect(() => JsonLdExtractor.extract(content, { validateContext: true }))
        .toThrow('Invalid JSON-LD context');
    });

    it('should extract keywords as array', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", "keywords": ["keycloak", "oauth", "debugging"] }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.keywords).toEqual(['keycloak', 'oauth', 'debugging']);
    });

    it('should handle learningResourceType for failure classification', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", "learningResourceType": "failure-analysis" }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.learningResourceType).toBe('failure-analysis');
    });
  });

  describe('extractAll', () => {
    it('should extract multiple JSON-LD blocks from one document', () => {
      const content = `
<script type="application/ld+json">
{ "@type": "TechArticle", "name": "Main" }
</script>
<script type="application/ld+json">
{ "@type": "Person", "name": "Author" }
</script>`;

      const results = JsonLdExtractor.extractAll(content);

      expect(results).toHaveLength(2);
      expect(results[0]?.['@type']).toBe('TechArticle');
      expect(results[1]?.['@type']).toBe('Person');
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", name: invalid }
</script>`;

      const result = JsonLdExtractor.extract(content);

      // Should return null, not throw
      expect(result).toBeNull();
    });

    it('should log warning for malformed JSON-LD', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const content = `<script type="application/ld+json">{ broken }</script>`;

      JsonLdExtractor.extract(content);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON-LD')
      );
    });
  });
});
```

**Test Count**: ~12 tests

---

### 1.3 Embedding Generator (`embedding-generator.test.ts`)

**Purpose**: Generate vector embeddings for semantic search using Gemini API.

**File**: `tests/unit/indexer/embedding-generator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingGenerator } from '@/indexer/embedding-generator';

// Mock Gemini API
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      embedContent: vi.fn().mockResolvedValue({
        embedding: { values: new Array(768).fill(0.1) }
      })
    })
  }))
}));

describe('EmbeddingGenerator', () => {
  let generator: EmbeddingGenerator;

  beforeEach(() => {
    generator = new EmbeddingGenerator({
      apiKey: 'test-api-key',
      model: 'text-embedding-004'
    });
  });

  describe('generateEmbedding', () => {
    it('should generate 768-dimensional embedding for text', async () => {
      const embedding = await generator.generateEmbedding('Test content');

      expect(embedding).toHaveLength(768);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
    });

    it('should normalize embeddings to unit vectors', async () => {
      const embedding = await generator.generateEmbedding('Test content');

      const magnitude = Math.sqrt(
        embedding.reduce((sum, v) => sum + v * v, 0)
      );
      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should truncate text exceeding max tokens', async () => {
      const longText = 'word '.repeat(10000); // Way over token limit

      // Should not throw
      const embedding = await generator.generateEmbedding(longText);

      expect(embedding).toHaveLength(768);
    });

    it('should cache embeddings for identical text', async () => {
      const text = 'Identical content';

      const embedding1 = await generator.generateEmbedding(text);
      const embedding2 = await generator.generateEmbedding(text);

      expect(embedding1).toEqual(embedding2);
      // API should only be called once due to cache
    });

    it('should handle empty text gracefully', async () => {
      const embedding = await generator.generateEmbedding('');

      // Return zero vector for empty text
      expect(embedding).toHaveLength(768);
      expect(embedding.every(v => v === 0)).toBe(true);
    });
  });

  describe('generateBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['First document', 'Second document', 'Third document'];

      const embeddings = await generator.generateBatch(texts);

      expect(embeddings).toHaveLength(3);
      embeddings.forEach(emb => expect(emb).toHaveLength(768));
    });

    it('should respect batch size limits', async () => {
      const texts = Array(150).fill('Document'); // Over default batch size

      const embeddings = await generator.generateBatch(texts, { batchSize: 100 });

      expect(embeddings).toHaveLength(150);
    });

    it('should handle partial batch failures gracefully', async () => {
      // Mock one batch to fail
      const texts = ['Good', 'Bad', 'Good'];

      // Even if one fails, should return results for successful ones
      const embeddings = await generator.generateBatch(texts, { continueOnError: true });

      expect(embeddings.filter(e => e !== null)).toHaveLength(2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between two embeddings', () => {
      const a = [1, 0, 0];
      const b = [1, 0, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];

      const similarity = EmbeddingGenerator.cosineSimilarity(a, b);

      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should throw for vectors of different dimensions', () => {
      const a = [1, 0, 0];
      const b = [1, 0];

      expect(() => EmbeddingGenerator.cosineSimilarity(a, b))
        .toThrow('Vectors must have same dimensions');
    });
  });

  describe('error handling', () => {
    it('should throw on API key not configured', async () => {
      const noKeyGenerator = new EmbeddingGenerator({ apiKey: '' });

      await expect(noKeyGenerator.generateEmbedding('test'))
        .rejects.toThrow('GEMINI_API_KEY not configured');
    });

    it('should retry on transient API errors', async () => {
      // Mock transient failure then success
      let callCount = 0;
      vi.mocked(generator['model'].embedContent).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) throw new Error('Rate limited');
        return { embedding: { values: new Array(768).fill(0.1) } };
      });

      const embedding = await generator.generateEmbedding('test');

      expect(embedding).toHaveLength(768);
      expect(callCount).toBe(3);
    });
  });
});
```

**Test Count**: ~14 tests

---

### 1.4 Index Builder (`index-builder.test.ts`)

**Purpose**: Build and query SQLite index from parsed documents.

**File**: `tests/unit/indexer/index-builder.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexBuilder, KnowledgeIndex } from '@/indexer/index-builder';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('IndexBuilder', () => {
  const testDbPath = './test-knowledge.db';
  let builder: IndexBuilder;

  beforeEach(() => {
    builder = new IndexBuilder({ dbPath: testDbPath });
  });

  afterEach(() => {
    builder.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initialization', () => {
    it('should create database file on init', () => {
      builder.initialize();

      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create required tables', () => {
      builder.initialize();

      const db = new Database(testDbPath);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all();

      expect(tables.map(t => t.name)).toContain('documents');
      expect(tables.map(t => t.name)).toContain('embeddings');
      expect(tables.map(t => t.name)).toContain('json_ld_metadata');

      db.close();
    });

    it('should create FTS5 virtual table for full-text search', () => {
      builder.initialize();

      const db = new Database(testDbPath);
      const vtables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'"
      ).all();

      expect(vtables.length).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('indexDocument', () => {
    beforeEach(() => builder.initialize());

    it('should index a document with all fields', async () => {
      const doc = {
        filePath: 'docs/adr/ADR-001.md',
        title: 'Desktop Client Migration',
        content: 'Migration from Electron to Flutter',
        plainText: 'Migration from Electron to Flutter',
        embedding: new Array(768).fill(0.1),
        metadata: {
          '@type': 'TechArticle',
          datePublished: '2026-01-15',
          keywords: ['electron', 'flutter']
        }
      };

      const id = await builder.indexDocument(doc);

      expect(id).toBeGreaterThan(0);
    });

    it('should update existing document on re-index', async () => {
      const doc = {
        filePath: 'docs/test.md',
        title: 'Original',
        content: 'Original content',
        plainText: 'Original content',
        embedding: new Array(768).fill(0.1)
      };

      const id1 = await builder.indexDocument(doc);

      doc.title = 'Updated';
      const id2 = await builder.indexDocument(doc);

      expect(id1).toBe(id2); // Same document, same ID

      const retrieved = builder.getDocument(id1);
      expect(retrieved?.title).toBe('Updated');
    });

    it('should store JSON-LD metadata separately', async () => {
      const doc = {
        filePath: 'docs/adr/ADR-002.md',
        title: 'Test',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1),
        metadata: {
          '@type': 'TechArticle',
          learningResourceType: 'failure-analysis',
          about: [{ '@type': 'SoftwareApplication', name: 'Keycloak' }]
        }
      };

      await builder.indexDocument(doc);

      const metadata = builder.getMetadataByType('failure-analysis');
      expect(metadata).toHaveLength(1);
      expect(metadata[0]?.about?.[0]?.name).toBe('Keycloak');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      builder.initialize();

      // Index test documents
      await builder.indexDocument({
        filePath: 'docs/keycloak-failure.md',
        title: 'Keycloak Configuration Failure',
        content: 'We failed to configure Keycloak 23 mTLS properly.',
        plainText: 'We failed to configure Keycloak 23 mTLS properly.',
        embedding: [0.5, 0.3, ...new Array(766).fill(0.1)],
        metadata: { learningResourceType: 'failure-analysis' }
      });

      await builder.indexDocument({
        filePath: 'docs/flutter-success.md',
        title: 'Flutter Migration Success',
        content: 'Flutter worked well for our desktop client.',
        plainText: 'Flutter worked well for our desktop client.',
        embedding: [0.1, 0.8, ...new Array(766).fill(0.1)],
        metadata: { learningResourceType: 'success-story' }
      });
    });

    it('should search by full-text query', () => {
      const results = builder.searchFullText('Keycloak configuration');

      expect(results).toHaveLength(1);
      expect(results[0]?.title).toContain('Keycloak');
    });

    it('should search by semantic similarity', async () => {
      const queryEmbedding = [0.5, 0.3, ...new Array(766).fill(0.1)];

      const results = await builder.searchSemantic(queryEmbedding, { limit: 5 });

      expect(results[0]?.title).toContain('Keycloak'); // Most similar
    });

    it('should filter by document type', () => {
      const results = builder.searchByType('failure-analysis');

      expect(results).toHaveLength(1);
      expect(results[0]?.title).toContain('Failure');
    });

    it('should support combined search (text + semantic)', async () => {
      const queryEmbedding = [0.5, 0.3, ...new Array(766).fill(0.1)];

      const results = await builder.searchCombined({
        query: 'configuration',
        embedding: queryEmbedding,
        weights: { text: 0.3, semantic: 0.7 }
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results with relevance scores', () => {
      const results = builder.searchFullText('Keycloak');

      expect(results[0]).toHaveProperty('score');
      expect(results[0]?.score).toBeGreaterThan(0);
    });
  });

  describe('getDocument', () => {
    beforeEach(() => builder.initialize());

    it('should retrieve document by ID', async () => {
      const id = await builder.indexDocument({
        filePath: 'docs/test.md',
        title: 'Test Doc',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1)
      });

      const doc = builder.getDocument(id);

      expect(doc?.title).toBe('Test Doc');
      expect(doc?.filePath).toBe('docs/test.md');
    });

    it('should retrieve document by file path', () => {
      builder.indexDocument({
        filePath: 'docs/unique-path.md',
        title: 'Unique',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1)
      });

      const doc = builder.getDocumentByPath('docs/unique-path.md');

      expect(doc?.title).toBe('Unique');
    });

    it('should return null for non-existent document', () => {
      const doc = builder.getDocument(99999);

      expect(doc).toBeNull();
    });
  });

  describe('statistics', () => {
    beforeEach(() => builder.initialize());

    it('should return index statistics', async () => {
      await builder.indexDocument({
        filePath: 'docs/test.md',
        title: 'Test',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1)
      });

      const stats = builder.getStatistics();

      expect(stats.totalDocuments).toBe(1);
      expect(stats.totalEmbeddings).toBe(1);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
    });
  });
});
```

**Test Count**: ~17 tests

---

## Sprint 1 Summary

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `markdown-parser.test.ts` | ~12 | Parse markdown content and extract structure |
| `json-ld-extractor.test.ts` | ~12 | Extract JSON-LD metadata from documents |
| `embedding-generator.test.ts` | ~14 | Generate Gemini embeddings with mocking |
| `index-builder.test.ts` | ~17 | Build and query SQLite knowledge index |
| **Sprint 1 Total** | **~55** | |

---

## Sprint 2: MCP Tools (RED Phase)

**Duration**: 3-4 days
**Owner**: QA Lead (RED), Dev Lead (GREEN)
**Goal**: Define behavior for all 5 MCP tools.

### 2.1 Query Failures Tool (`query-failures.test.ts`)

**Purpose**: Search for documentation about what didn't work.

**File**: `tests/unit/tools/query-failures.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryFailuresTool } from '@/tools/query-failures';
import { KnowledgeIndex } from '@/indexer/index-builder';

// Mock KnowledgeIndex
vi.mock('@/indexer/index-builder');

describe('QueryFailuresTool', () => {
  let tool: QueryFailuresTool;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn(),
      searchFullText: vi.fn()
    } as unknown as KnowledgeIndex;

    tool = new QueryFailuresTool(mockIndex);
  });

  describe('schema', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('query_failures');
      expect(tool.description).toContain('what did NOT work');
    });

    it('should require topic parameter', () => {
      expect(tool.inputSchema.required).toContain('topic');
    });

    it('should have optional component parameter', () => {
      expect(tool.inputSchema.properties.component).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('component');
    });
  });

  describe('execute', () => {
    it('should search for failure documentation by topic', async () => {
      mockIndex.searchCombined.mockResolvedValue([
        {
          id: 1,
          title: 'Keycloak mTLS Failure',
          filePath: 'docs/archived/keycloak-failure.md',
          summary: 'Failed to configure mTLS',
          score: 0.95,
          metadata: {
            learningResourceType: 'failure-analysis',
            outcome: 'resolved',
            rootCause: 'Certificate chain misconfiguration'
          }
        }
      ]);

      const result = await tool.execute({ topic: 'keycloak' });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toContain('Keycloak');
      expect(result.data[0].outcome).toBe('resolved');
    });

    it('should filter by component when provided', async () => {
      await tool.execute({ topic: 'oauth', component: 'mcp-gateway' });

      expect(mockIndex.searchCombined).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ component: 'mcp-gateway' })
        })
      );
    });

    it('should only return failure-related document types', async () => {
      await tool.execute({ topic: 'keycloak' });

      expect(mockIndex.searchCombined).toHaveBeenCalledWith(
        expect.objectContaining({
          documentTypes: expect.arrayContaining([
            'failure-analysis',
            'debugging-log',
            'lessons-learned'
          ])
        })
      );
    });

    it('should return empty array with helpful suggestion when no results', async () => {
      mockIndex.searchCombined.mockResolvedValue([]);

      const result = await tool.execute({ topic: 'nonexistent-topic' });

      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
      expect(result.metadata.suggestedAction).toContain('broader terms');
    });

    it('should include relevance scores in results', async () => {
      mockIndex.searchCombined.mockResolvedValue([
        { title: 'Test', score: 0.85, filePath: 'test.md' }
      ]);

      const result = await tool.execute({ topic: 'test' });

      expect(result.data[0].relevanceScore).toBe(0.85);
    });

    it('should extract root cause from metadata', async () => {
      mockIndex.searchCombined.mockResolvedValue([
        {
          title: 'Auth Failure',
          filePath: 'test.md',
          score: 0.9,
          metadata: { rootCause: 'Token expiration' }
        }
      ]);

      const result = await tool.execute({ topic: 'auth' });

      expect(result.data[0].rootCause).toBe('Token expiration');
    });
  });

  describe('error handling', () => {
    it('should return error status on index failure', async () => {
      mockIndex.searchCombined.mockRejectedValue(new Error('DB error'));

      const result = await tool.execute({ topic: 'test' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INDEX_ERROR');
      expect(result.suggestedAction).toBeDefined();
    });

    it('should sanitize topic parameter', async () => {
      await tool.execute({ topic: '<script>alert(1)</script>' });

      // Should have sanitized the input
      expect(mockIndex.searchCombined).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.not.stringContaining('<script>')
        })
      );
    });
  });
});
```

**Test Count**: ~12 tests

---

### 2.2 Lookup ADR Tool (`lookup-adr.test.ts`)

**File**: `tests/unit/tools/lookup-adr.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LookupAdrTool } from '@/tools/lookup-adr';

describe('LookupAdrTool', () => {
  let tool: LookupAdrTool;

  beforeEach(() => {
    tool = new LookupAdrTool(mockIndex);
  });

  describe('schema', () => {
    it('should require adr_id parameter', () => {
      expect(tool.inputSchema.required).toContain('adr_id');
    });

    it('should validate adr_id format (ADR-XXX)', () => {
      expect(tool.inputSchema.properties.adr_id.pattern).toBe('^ADR-\\d{3}$');
    });
  });

  describe('execute', () => {
    it('should return full ADR document for valid ID', async () => {
      mockIndex.getDocumentByPath.mockReturnValue({
        filePath: 'docs/adr/ADR-001-desktop-client-migration.md',
        title: 'ADR-001: Desktop Client Migration',
        content: '# Full ADR content...',
        metadata: {
          '@type': 'TechArticle',
          datePublished: '2026-01-21'
        }
      });

      const result = await tool.execute({ adr_id: 'ADR-001' });

      expect(result.status).toBe('success');
      expect(result.data.title).toContain('ADR-001');
      expect(result.data.content).toBeDefined();
    });

    it('should return error for non-existent ADR', async () => {
      mockIndex.getDocumentByPath.mockReturnValue(null);

      const result = await tool.execute({ adr_id: 'ADR-999' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('ADR_NOT_FOUND');
      expect(result.suggestedAction).toContain('list of valid ADRs');
    });

    it('should include JSON-LD metadata in response', async () => {
      mockIndex.getDocumentByPath.mockReturnValue({
        filePath: 'docs/adr/ADR-007.md',
        title: 'ADR-007: Test Coverage Strategy',
        content: 'Content',
        metadata: {
          '@type': 'TechArticle',
          keywords: ['tdd', 'coverage'],
          learningResourceType: 'best-practice'
        }
      });

      const result = await tool.execute({ adr_id: 'ADR-007' });

      expect(result.data.metadata.keywords).toContain('tdd');
    });

    it('should list available ADRs on not found error', async () => {
      mockIndex.getDocumentByPath.mockReturnValue(null);
      mockIndex.listDocuments.mockReturnValue([
        { filePath: 'docs/adr/ADR-001.md' },
        { filePath: 'docs/adr/ADR-002.md' }
      ]);

      const result = await tool.execute({ adr_id: 'ADR-999' });

      expect(result.availableAdrs).toEqual(['ADR-001', 'ADR-002']);
    });
  });
});
```

**Test Count**: ~10 tests

---

### 2.3 Search Journey Tool (`search-journey.test.ts`)

**File**: `tests/unit/tools/search-journey.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJourneyTool } from '@/tools/search-journey';

describe('SearchJourneyTool', () => {
  let tool: SearchJourneyTool;

  beforeEach(() => {
    tool = new SearchJourneyTool(mockIndex, mockEmbeddingGenerator);
  });

  describe('schema', () => {
    it('should require query parameter', () => {
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should have optional limit parameter with default', () => {
      expect(tool.inputSchema.properties.limit.default).toBe(10);
    });
  });

  describe('execute', () => {
    it('should perform semantic search across all journey docs', async () => {
      mockEmbeddingGenerator.generateEmbedding.mockResolvedValue(
        new Array(768).fill(0.1)
      );
      mockIndex.searchSemantic.mockResolvedValue([
        { title: 'Result 1', score: 0.95 },
        { title: 'Result 2', score: 0.85 }
      ]);

      const result = await tool.execute({ query: 'Why did you use Flutter?' });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      await tool.execute({ query: 'test', limit: 5 });

      expect(mockIndex.searchSemantic).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should combine semantic and full-text search', async () => {
      await tool.execute({ query: 'Keycloak authentication failure' });

      expect(mockIndex.searchCombined).toHaveBeenCalled();
    });

    it('should include source file paths in results', async () => {
      mockIndex.searchSemantic.mockResolvedValue([
        {
          title: 'Test',
          filePath: 'docs/archived/test.md',
          score: 0.9
        }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.data[0].filePath).toBe('docs/archived/test.md');
    });
  });
});
```

**Test Count**: ~10 tests

---

### 2.4 Get Context Tool (`get-context.test.ts`)

**File**: `tests/unit/tools/get-context.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetContextTool } from '@/tools/get-context';

describe('GetContextTool', () => {
  let tool: GetContextTool;

  beforeEach(() => {
    tool = new GetContextTool(mockIndex);
  });

  describe('schema', () => {
    it('should require topic parameter', () => {
      expect(tool.inputSchema.required).toContain('topic');
    });

    it('should have optional date_range parameter', () => {
      expect(tool.inputSchema.properties.date_range).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return chronological context for a topic', async () => {
      mockIndex.searchByTopic.mockReturnValue([
        { title: 'Early doc', date: '2025-10-01' },
        { title: 'Middle doc', date: '2025-11-15' },
        { title: 'Latest doc', date: '2026-01-10' }
      ]);

      const result = await tool.execute({ topic: 'authentication' });

      expect(result.data.timeline).toHaveLength(3);
      // Should be sorted chronologically
      expect(result.data.timeline[0].date).toBe('2025-10-01');
    });

    it('should filter by date range when provided', async () => {
      await tool.execute({
        topic: 'keycloak',
        date_range: '2025-12-01:2026-01-15'
      });

      expect(mockIndex.searchByTopic).toHaveBeenCalledWith(
        'keycloak',
        expect.objectContaining({
          dateFrom: '2025-12-01',
          dateTo: '2026-01-15'
        })
      );
    });

    it('should include related topics in response', async () => {
      mockIndex.searchByTopic.mockReturnValue([
        {
          title: 'Keycloak OAuth',
          metadata: { keywords: ['keycloak', 'oauth', 'oidc'] }
        }
      ]);

      const result = await tool.execute({ topic: 'keycloak' });

      expect(result.data.relatedTopics).toContain('oauth');
      expect(result.data.relatedTopics).toContain('oidc');
    });

    it('should summarize the evolution of the topic', async () => {
      const result = await tool.execute({ topic: 'desktop-client' });

      expect(result.data.summary).toBeDefined();
      expect(typeof result.data.summary).toBe('string');
    });
  });
});
```

**Test Count**: ~10 tests

---

### 2.5 List Pivots Tool (`list-pivots.test.ts`)

**File**: `tests/unit/tools/list-pivots.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPivotsTool } from '@/tools/list-pivots';

describe('ListPivotsTool', () => {
  let tool: ListPivotsTool;

  beforeEach(() => {
    tool = new ListPivotsTool(mockIndex);
  });

  describe('schema', () => {
    it('should have optional component parameter', () => {
      expect(tool.inputSchema.properties.component).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('component');
    });
  });

  describe('execute', () => {
    it('should list all documented technology pivots', async () => {
      mockIndex.getPivots.mockReturnValue([
        {
          from: 'Electron',
          to: 'React Native',
          date: '2025-10',
          reason: 'OAuth issues',
          component: 'desktop-client'
        },
        {
          from: 'React Native',
          to: 'Flutter',
          date: '2025-11',
          reason: 'VS2022 null pointer refs',
          component: 'desktop-client'
        },
        {
          from: 'Nginx',
          to: 'Caddy',
          date: '2025-12',
          reason: 'mTLS complexity',
          component: 'reverse-proxy'
        }
      ]);

      const result = await tool.execute({});

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(3);
    });

    it('should filter by component when provided', async () => {
      await tool.execute({ component: 'desktop-client' });

      expect(mockIndex.getPivots).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'desktop-client' })
      );
    });

    it('should include pivot reason and documentation link', async () => {
      mockIndex.getPivots.mockReturnValue([
        {
          from: 'Nginx',
          to: 'Caddy',
          reason: 'mTLS complexity',
          documentPath: 'docs/adr/ADR-003-nginx-to-caddy-migration.md'
        }
      ]);

      const result = await tool.execute({});

      expect(result.data[0].reason).toBe('mTLS complexity');
      expect(result.data[0].documentPath).toContain('ADR-003');
    });

    it('should group pivots by component', async () => {
      const result = await tool.execute({});

      expect(result.data.byComponent).toBeDefined();
      expect(result.data.byComponent['desktop-client']).toHaveLength(2);
    });

    it('should return empty array when no pivots found', async () => {
      mockIndex.getPivots.mockReturnValue([]);

      const result = await tool.execute({ component: 'nonexistent' });

      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
    });
  });
});
```

**Test Count**: ~10 tests

---

## Sprint 2 Summary

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `query-failures.test.ts` | ~12 | Search failure documentation |
| `lookup-adr.test.ts` | ~10 | Retrieve specific ADRs |
| `search-journey.test.ts` | ~10 | Semantic search across all docs |
| `get-context.test.ts` | ~10 | Historical context for topics |
| `list-pivots.test.ts` | ~10 | List technology pivots |
| **Sprint 2 Total** | **~52** | |

---

## Sprint 3: MCP Resources (RED Phase)

**Duration**: 2-3 days
**Owner**: QA Lead (RED), Dev Lead (GREEN)
**Goal**: Define behavior for all 5 MCP resource templates.

### 3.1 Failures Resource (`failures.test.ts`)

**URI**: `journey://failures/{topic}`

**File**: `tests/unit/resources/failures.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailuresResource } from '@/resources/failures';

describe('FailuresResource', () => {
  let resource: FailuresResource;

  beforeEach(() => {
    resource = new FailuresResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://failures/{topic} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://failures/{topic}');
    });
  });

  describe('read', () => {
    it('should return failure documents for topic', async () => {
      mockIndex.searchByType.mockReturnValue([
        {
          title: 'Keycloak Failure',
          content: 'We failed to configure...',
          metadata: { learningResourceType: 'failure-analysis' }
        }
      ]);

      const result = await resource.read({ topic: 'keycloak' });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should filter to only failure-type documents', async () => {
      await resource.read({ topic: 'oauth' });

      expect(mockIndex.searchByType).toHaveBeenCalledWith(
        expect.arrayContaining(['failure-analysis', 'debugging-log'])
      );
    });

    it('should return empty for unknown topic', async () => {
      mockIndex.searchByType.mockReturnValue([]);

      const result = await resource.read({ topic: 'unknown' });

      expect(result.contents).toEqual([]);
    });

    it('should include document metadata in response', async () => {
      mockIndex.searchByType.mockReturnValue([
        {
          title: 'Test',
          content: 'Content',
          metadata: { datePublished: '2026-01-15' }
        }
      ]);

      const result = await resource.read({ topic: 'test' });

      expect(result.contents[0].metadata.datePublished).toBe('2026-01-15');
    });
  });
});
```

**Test Count**: ~8 tests

---

### 3.2 Decisions Resource (`decisions.test.ts`)

**URI**: `journey://decisions/{adr-id}`

**File**: `tests/unit/resources/decisions.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionsResource } from '@/resources/decisions';

describe('DecisionsResource', () => {
  let resource: DecisionsResource;

  beforeEach(() => {
    resource = new DecisionsResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://decisions/{adr-id} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://decisions/{adr-id}');
    });
  });

  describe('read', () => {
    it('should return ADR document by ID', async () => {
      mockIndex.getDocumentByPath.mockReturnValue({
        title: 'ADR-001: Desktop Client Migration',
        content: '# Full content...',
        metadata: { '@type': 'TechArticle' }
      });

      const result = await resource.read({ 'adr-id': 'ADR-001' });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('journey://decisions/ADR-001');
    });

    it('should resolve partial ADR ID (001 -> ADR-001)', async () => {
      await resource.read({ 'adr-id': '001' });

      expect(mockIndex.getDocumentByPath).toHaveBeenCalledWith(
        expect.stringContaining('ADR-001')
      );
    });

    it('should throw for non-existent ADR', async () => {
      mockIndex.getDocumentByPath.mockReturnValue(null);

      await expect(resource.read({ 'adr-id': 'ADR-999' }))
        .rejects.toThrow('ADR not found');
    });
  });

  describe('list', () => {
    it('should list all available ADRs', async () => {
      mockIndex.listDocuments.mockReturnValue([
        { filePath: 'docs/adr/ADR-001.md', title: 'Desktop Client' },
        { filePath: 'docs/adr/ADR-002.md', title: 'Phoenix Rebuild' }
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].uri).toBe('journey://decisions/ADR-001');
    });
  });
});
```

**Test Count**: ~8 tests

---

### 3.3 Evolution Resource (`evolution.test.ts`)

**URI**: `journey://evolution/{component}`

**File**: `tests/unit/resources/evolution.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionResource } from '@/resources/evolution';

describe('EvolutionResource', () => {
  let resource: EvolutionResource;

  beforeEach(() => {
    resource = new EvolutionResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://evolution/{component} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://evolution/{component}');
    });
  });

  describe('read', () => {
    it('should return evolution history for component', async () => {
      mockIndex.getEvolutionHistory.mockReturnValue({
        component: 'desktop-client',
        timeline: [
          { version: '1.0', date: '2025-10', technology: 'Electron' },
          { version: '1.1', date: '2025-11', technology: 'React Native' },
          { version: '1.4', date: '2026-01', technology: 'Flutter' }
        ],
        pivots: [
          { from: 'Electron', to: 'React Native', reason: 'OAuth' },
          { from: 'React Native', to: 'Flutter', reason: 'VS2022 bugs' }
        ]
      });

      const result = await resource.read({ component: 'desktop-client' });

      expect(result.contents[0].text).toContain('Electron');
      expect(result.contents[0].text).toContain('Flutter');
    });

    it('should include all pivots in evolution', async () => {
      const result = await resource.read({ component: 'desktop-client' });

      // Verify pivots are included
      expect(result.contents[0].metadata.pivotCount).toBe(2);
    });

    it('should return 404 for unknown component', async () => {
      mockIndex.getEvolutionHistory.mockReturnValue(null);

      await expect(resource.read({ component: 'unknown' }))
        .rejects.toThrow('Component not found');
    });
  });

  describe('list', () => {
    it('should list all tracked components', async () => {
      mockIndex.listComponents.mockReturnValue([
        'desktop-client',
        'reverse-proxy',
        'authentication'
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(3);
    });
  });
});
```

**Test Count**: ~8 tests

---

### 3.4 Lessons Resource (`lessons.test.ts`)

**URI**: `journey://lessons`

**File**: `tests/unit/resources/lessons.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonsResource } from '@/resources/lessons';

describe('LessonsResource', () => {
  let resource: LessonsResource;

  beforeEach(() => {
    resource = new LessonsResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://lessons pattern', () => {
      expect(resource.uriTemplate).toBe('journey://lessons');
    });
  });

  describe('read', () => {
    it('should return all lessons learned documents', async () => {
      mockIndex.getDocumentsByType.mockReturnValue([
        {
          title: 'Lessons from Keycloak Migration',
          content: 'Key takeaways...',
          metadata: { learningResourceType: 'lessons-learned' }
        }
      ]);

      const result = await resource.read();

      expect(result.contents.length).toBeGreaterThan(0);
    });

    it('should aggregate lessons from multiple sources', async () => {
      // Should pull from lessons-learned.md, ADR consequences, etc.
      const result = await resource.read();

      expect(mockIndex.getDocumentsByType).toHaveBeenCalledWith(
        expect.arrayContaining(['lessons-learned', 'best-practice'])
      );
    });

    it('should categorize lessons by topic', async () => {
      const result = await resource.read();

      expect(result.contents[0].metadata.categories).toBeDefined();
    });
  });
});
```

**Test Count**: ~6 tests

---

### 3.5 Phoenix Resource (`phoenix.test.ts`)

**URI**: `journey://phoenix/{version}`

**File**: `tests/unit/resources/phoenix.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhoenixResource } from '@/resources/phoenix';

describe('PhoenixResource', () => {
  let resource: PhoenixResource;

  beforeEach(() => {
    resource = new PhoenixResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://phoenix/{version} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://phoenix/{version}');
    });
  });

  describe('read', () => {
    it('should return Phoenix rebuild log for version', async () => {
      mockIndex.getDocumentByPath.mockReturnValue({
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11 Manual Actions',
        content: '# Phoenix v11...',
        metadata: {
          manualActions: 0,
          automatedSteps: 15,
          issues: ['#37', '#38']
        }
      });

      const result = await resource.read({ version: 'v11' });

      expect(result.contents[0].text).toContain('Phoenix v11');
    });

    it('should accept version with or without v prefix', async () => {
      await resource.read({ version: '11' });

      expect(mockIndex.getDocumentByPath).toHaveBeenCalledWith(
        expect.stringContaining('v11')
      );
    });

    it('should return comparison between two versions', async () => {
      // Support range syntax: v9..v11
      const result = await resource.read({ version: 'v9..v11' });

      expect(result.contents[0].metadata.comparison).toBeDefined();
    });

    it('should throw for non-existent version', async () => {
      mockIndex.getDocumentByPath.mockReturnValue(null);

      await expect(resource.read({ version: 'v99' }))
        .rejects.toThrow('Phoenix version not found');
    });
  });

  describe('list', () => {
    it('should list all Phoenix versions', async () => {
      mockIndex.listDocuments.mockReturnValue([
        { filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv1.md' },
        { filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv9.md' },
        { filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md' }
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(3);
      expect(result.resources.map(r => r.uri)).toContain('journey://phoenix/v11');
    });
  });
});
```

**Test Count**: ~10 tests

---

## Sprint 3 Summary

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `failures.test.ts` | ~8 | Failure documentation resource |
| `decisions.test.ts` | ~8 | ADR documents resource |
| `evolution.test.ts` | ~8 | Component evolution resource |
| `lessons.test.ts` | ~6 | Lessons learned resource |
| `phoenix.test.ts` | ~10 | Phoenix rebuild logs resource |
| **Sprint 3 Total** | **~40** | |

---

## Sprint 4: Middleware & Integration (RED Phase)

**Duration**: 3-4 days
**Owner**: QA Lead (RED), Dev Lead (GREEN)
**Goal**: Define behavior for middleware and integration tests.

### 4.1 Agent Identity Middleware (`agent-identity.test.ts`)

**File**: `tests/unit/middleware/agent-identity.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapWithIdentity, JourneyResponse } from '@/middleware/agent-identity';

describe('AgentIdentity middleware', () => {
  describe('wrapWithIdentity', () => {
    it('should add _meta object to response', () => {
      const data = { query: 'test', answer: 'response' };
      const sourceDocs = [{ date: '2026-01-15' }];

      const result = wrapWithIdentity(data, sourceDocs);

      expect(result._meta).toBeDefined();
      expect(result._meta.source).toBe('tamshai-project-journey');
    });

    it('should mark type as historical-documentation', () => {
      const result = wrapWithIdentity({}, []);

      expect(result._meta.type).toBe('historical-documentation');
    });

    it('should include disclaimer text', () => {
      const result = wrapWithIdentity({}, []);

      expect(result._meta.disclaimer).toContain('historical project documentation');
      expect(result._meta.disclaimer).toContain('may no longer reflect');
    });

    it('should extract and sort document dates', () => {
      const sourceDocs = [
        { date: '2026-01-15' },
        { date: '2025-12-01' },
        { date: '2026-01-05' }
      ];

      const result = wrapWithIdentity({}, sourceDocs);

      expect(result._meta.documentDates).toEqual([
        '2025-12-01',
        '2026-01-05',
        '2026-01-15'
      ]);
    });

    it('should preserve original data', () => {
      const data = { query: 'test', nested: { value: 42 } };

      const result = wrapWithIdentity(data, []);

      expect(result.data).toEqual(data);
    });
  });

  describe('middleware function', () => {
    it('should wrap all tool responses with identity', async () => {
      const mockNext = vi.fn().mockResolvedValue({ answer: 'test' });
      const middleware = createIdentityMiddleware();

      const result = await middleware(mockRequest, mockNext);

      expect(result._meta).toBeDefined();
    });

    it('should not wrap error responses', async () => {
      const mockNext = vi.fn().mockResolvedValue({
        status: 'error',
        code: 'TEST_ERROR'
      });
      const middleware = createIdentityMiddleware();

      const result = await middleware(mockRequest, mockNext);

      // Errors should not have identity wrapper
      expect(result._meta).toBeUndefined();
    });
  });
});
```

**Test Count**: ~10 tests

---

### 4.2 Rate Limit Middleware (`rate-limit.test.ts`)

**File**: `tests/unit/middleware/rate-limit.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { burstLimiter, sustainedLimiter, dailyLimiter } from '@/middleware/rate-limit';
import express from 'express';
import request from 'supertest';

describe('RateLimit middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(burstLimiter);
    app.get('/test', (req, res) => res.json({ ok: true }));
  });

  describe('burstLimiter', () => {
    it('should allow 10 requests within 10 seconds', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
      }
    });

    it('should block 11th request within 10 seconds', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should include rate limit headers', async () => {
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should return helpful error message', async () => {
      for (let i = 0; i < 11; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.body.error).toContain('Too many requests');
      expect(res.body.retryAfter).toBeDefined();
    });
  });

  describe('sustainedLimiter', () => {
    it('should allow 60 requests per minute', async () => {
      // Test that 60 requests succeed
    });
  });

  describe('dailyLimiter', () => {
    it('should track limits by IP address', async () => {
      // Test IP-based tracking
    });
  });
});
```

**Test Count**: ~12 tests

---

### 4.3 Knowledge Index Integration (`knowledge-index.test.ts`)

**File**: `tests/integration/knowledge-index.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IndexBuilder } from '@/indexer/index-builder';
import { MarkdownParser } from '@/indexer/markdown-parser';
import { EmbeddingGenerator } from '@/indexer/embedding-generator';
import fs from 'fs';

describe('Knowledge Index Integration', () => {
  let builder: IndexBuilder;
  const testDbPath = './test-integration-knowledge.db';

  beforeAll(async () => {
    builder = new IndexBuilder({ dbPath: testDbPath });
    builder.initialize();

    // Index actual ADR files for integration test
    const adrFiles = await MarkdownParser.parseDirectory('docs/adr');
    for (const file of adrFiles) {
      await builder.indexDocument({
        filePath: file.filePath,
        title: file.frontmatter?.title || file.headings[0]?.text || 'Untitled',
        content: file.content,
        plainText: file.plainText,
        embedding: await EmbeddingGenerator.mock(file.plainText),
        metadata: file.jsonLd || {}
      });
    }
  });

  afterAll(() => {
    builder.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should index all ADR files', () => {
    const stats = builder.getStatistics();
    expect(stats.totalDocuments).toBeGreaterThanOrEqual(12); // 12 ADRs exist
  });

  it('should find ADR-001 by semantic search for "desktop client"', async () => {
    const results = await builder.searchFullText('desktop client migration');

    expect(results.some(r => r.filePath.includes('ADR-001'))).toBe(true);
  });

  it('should find failure-analysis documents', () => {
    const results = builder.searchByType('failure-analysis');

    expect(results.length).toBeGreaterThan(0);
  });

  it('should correctly extract JSON-LD metadata from ADRs', () => {
    const doc = builder.getDocumentByPath('docs/adr/ADR-001-desktop-client-migration.md');

    expect(doc?.metadata?.['@type']).toBe('TechArticle');
    expect(doc?.metadata?.keywords).toContain('flutter');
  });

  it('should support combined search with text and embedding', async () => {
    const queryEmbedding = await EmbeddingGenerator.mock('keycloak authentication problems');

    const results = await builder.searchCombined({
      query: 'keycloak',
      embedding: queryEmbedding,
      weights: { text: 0.4, semantic: 0.6 }
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title.toLowerCase()).toContain('keycloak');
  });
});
```

**Test Count**: ~8 tests

---

### 4.4 MCP Server Integration (`mcp-server.test.ts`)

**File**: `tests/integration/mcp-server.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@/index';
import request from 'supertest';

describe('MCP Server Integration', () => {
  let server: McpServer;
  let app: Express.Application;

  beforeAll(async () => {
    server = new McpServer({
      port: 0, // Random port
      dbPath: ':memory:'
    });
    app = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('health endpoint', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('tool endpoints', () => {
    it('should execute query_failures tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/query_failures')
        .send({ topic: 'keycloak' });

      expect(res.status).toBe(200);
      expect(res.body._meta.source).toBe('tamshai-project-journey');
    });

    it('should execute lookup_adr tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/lookup_adr')
        .send({ adr_id: 'ADR-001' });

      expect(res.status).toBe(200);
    });
  });

  describe('resource endpoints', () => {
    it('should read journey://failures/{topic}', async () => {
      const res = await request(app)
        .get('/mcp/resources/journey://failures/keycloak');

      expect(res.status).toBe(200);
      expect(res.body.contents).toBeDefined();
    });

    it('should list available resources', async () => {
      const res = await request(app).get('/mcp/resources');

      expect(res.status).toBe(200);
      expect(res.body.resourceTemplates).toContain('journey://failures/{topic}');
    });
  });

  describe('rate limiting', () => {
    it('should enforce burst limit', async () => {
      // Send 11 requests rapidly
      const promises = Array(11).fill(null).map(() =>
        request(app).post('/mcp/tools/search_journey').send({ query: 'test' })
      );

      const results = await Promise.all(promises);
      const rateLimited = results.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('agent identity', () => {
    it('should include identity metadata in all responses', async () => {
      const res = await request(app)
        .post('/mcp/tools/search_journey')
        .send({ query: 'test' });

      expect(res.body._meta).toBeDefined();
      expect(res.body._meta.disclaimer).toBeDefined();
    });
  });
});
```

**Test Count**: ~12 tests

---

## Sprint 4 Summary

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `agent-identity.test.ts` | ~10 | Identity attribution middleware |
| `rate-limit.test.ts` | ~12 | Rate limiting middleware |
| `knowledge-index.test.ts` | ~8 | Index integration tests |
| `mcp-server.test.ts` | ~12 | Full server integration tests |
| **Sprint 4 Total** | **~42** | |

---

## Grand Summary

| Sprint | Focus | Unit Tests | Integration Tests | Total |
|--------|-------|------------|-------------------|-------|
| Sprint 1 | Indexer Components | 55 | 0 | 55 |
| Sprint 2 | MCP Tools | 52 | 0 | 52 |
| Sprint 3 | MCP Resources | 40 | 0 | 40 |
| Sprint 4 | Middleware & Integration | 22 | 20 | 42 |
| **Total** | | **169** | **20** | **~189** |

---

## Execution Timeline

| Week | Phase | Owner | Deliverable |
|------|-------|-------|-------------|
| Week 1 | Sprint 1 RED | QA | Failing indexer tests |
| Week 1 | Sprint 1 GREEN | Dev | Passing indexer implementation |
| Week 2 | Sprint 2 RED | QA | Failing tool tests |
| Week 2 | Sprint 2 GREEN | Dev | Passing tool implementation |
| Week 3 | Sprint 3 RED | QA | Failing resource tests |
| Week 3 | Sprint 3 GREEN | Dev | Passing resource implementation |
| Week 4 | Sprint 4 RED | QA | Failing middleware/integration tests |
| Week 4 | Sprint 4 GREEN | Dev | Passing full implementation |
| Week 5 | REFACTOR | QA + Dev | Code quality, 90% coverage verification |

---

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

---

## Mocking Strategy

### Gemini API Mocking

All tests mock the Gemini API to avoid real API calls and costs:

```typescript
// tests/mocks/gemini.ts
export const mockGeminiEmbedding = vi.fn().mockResolvedValue({
  embedding: { values: new Array(768).fill(0.1) }
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      embedContent: mockGeminiEmbedding
    })
  }))
}));
```

### SQLite Test Database

Integration tests use in-memory SQLite:

```typescript
const builder = new IndexBuilder({ dbPath: ':memory:' });
```

### Test Fixtures

Use actual ADR files as fixtures for realistic testing:

```typescript
// tests/fixtures/
// - Contains copies of real docs/adr/*.md files
// - Used for integration tests
// - Ensures tests match real document structure
```

---

## Approval Workflow

1. **QA Lead** creates this TDD plan ✅
2. **Dev Lead** reviews test specifications
3. **Project Sponsor** approves overall approach
4. **QA Lead** begins Sprint 1 RED phase

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-21 | Tamshai-QA | Initial TDD plan creation |

---

*This TDD plan follows ADR-007: Test Coverage Strategy - TDD with Diff Coverage. All new code must achieve 90% diff coverage.*
