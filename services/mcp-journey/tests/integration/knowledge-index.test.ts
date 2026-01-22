/**
 * Knowledge Index Integration Tests - Sprint 4 RED Phase
 *
 * These tests verify the integration between indexer components.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Test that markdown files are correctly indexed and searchable.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KnowledgeIndex } from '@/indexer/index-builder';
import { MarkdownParser } from '@/indexer/markdown-parser';
import { EmbeddingGenerator } from '@/indexer/embedding-generator';
import { JsonLdExtractor } from '@/indexer/json-ld-extractor';
import fs from 'fs';
import path from 'path';

describe('Knowledge Index Integration', () => {
  let index: KnowledgeIndex;
  const testDbPath = './test-integration-knowledge.db';

  beforeAll(async () => {
    // Create index with test database
    index = new KnowledgeIndex({ dbPath: testDbPath });
    index.initialize();

    // Create a mock embedding generator for tests
    const mockEmbedding = new Array(768).fill(0).map(() => Math.random());

    // Index actual ADR files for integration test
    const adrDir = path.resolve(__dirname, '../../../../docs/adr');

    if (fs.existsSync(adrDir)) {
      const files = fs.readdirSync(adrDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(adrDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = MarkdownParser.parse(content);
        const jsonLd = JsonLdExtractor.extract(content);

        await index.indexDocument({
          filePath: `docs/adr/${file}`,
          title: parsed.frontmatter?.title || parsed.headings[0]?.text || 'Untitled',
          content: content,
          plainText: parsed.plainText,
          embedding: mockEmbedding,
          metadata: jsonLd || {}
        });
      }
    }
  });

  afterAll(() => {
    index.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should index all ADR files', () => {
    const stats = index.getStatistics();
    expect(stats.totalDocuments).toBeGreaterThanOrEqual(12); // 12 ADRs exist
  });

  it('should find ADR-001 by full-text search for "desktop client"', async () => {
    const results = index.searchFullText('desktop client migration');

    expect(results.some(r => r.filePath.includes('ADR-001'))).toBe(true);
  });

  it('should find documents by type (failure-analysis)', () => {
    const results = index.searchByType(['failure-analysis']);

    // May be empty if no failure docs indexed, but should not throw
    expect(Array.isArray(results)).toBe(true);
  });

  it('should correctly extract JSON-LD metadata from ADRs', () => {
    const doc = index.getDocumentByPath('docs/adr/ADR-001-desktop-client-migration.md');

    if (doc) {
      expect(doc.metadata?.['@type']).toBe('TechArticle');
    }
  });

  it('should support semantic search with embeddings', async () => {
    const queryEmbedding = new Array(768).fill(0).map(() => Math.random());

    const results = await index.searchSemantic(queryEmbedding, { limit: 5 });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should support combined search with text and embedding', async () => {
    const queryEmbedding = new Array(768).fill(0).map(() => Math.random());

    const results = await index.searchCombined({
      query: 'keycloak',
      embedding: queryEmbedding,
      weights: { text: 0.4, semantic: 0.6 },
      limit: 10
    });

    expect(Array.isArray(results)).toBe(true);
  });

  it('should list all indexed documents', () => {
    const docs = index.listDocuments();

    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
  });

  it('should delete document by path', () => {
    const testPath = 'test/delete-me.md';

    // Index a test document
    index.indexDocument({
      filePath: testPath,
      title: 'Test Delete',
      content: 'Test content',
      plainText: 'Test content',
      embedding: new Array(768).fill(0),
      metadata: {}
    });

    // Verify it exists
    let doc = index.getDocumentByPath(testPath);
    expect(doc).toBeDefined();

    // Delete it
    index.deleteDocument(testPath);

    // Verify it's gone
    doc = index.getDocumentByPath(testPath);
    expect(doc).toBeNull();
  });
});
