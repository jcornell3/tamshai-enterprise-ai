/**
 * Index Builder Unit Tests - Sprint 1 RED Phase
 *
 * These tests define the expected behavior for the IndexBuilder component.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Uses SQLite for knowledge index storage with FTS5 for full-text search.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexBuilder, type KnowledgeIndex } from '@/indexer/index-builder';
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
      ).all() as Array<{ name: string }>;

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
      ).all() as Array<{ name: string }>;

      expect(vtables.length).toBeGreaterThan(0);

      db.close();
    });

    it('should handle re-initialization gracefully', () => {
      builder.initialize();
      builder.initialize(); // Should not throw

      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create indexes for common queries', () => {
      builder.initialize();

      const db = new Database(testDbPath);
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index'"
      ).all() as Array<{ name: string }>;

      expect(indexes.length).toBeGreaterThan(0);

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

    it('should handle document without metadata', async () => {
      const doc = {
        filePath: 'docs/simple.md',
        title: 'Simple',
        content: 'Simple content',
        plainText: 'Simple content',
        embedding: new Array(768).fill(0.1)
      };

      const id = await builder.indexDocument(doc);

      expect(id).toBeGreaterThan(0);
    });

    it('should store embedding as blob', async () => {
      const embedding = new Array(768).fill(0.5);
      const doc = {
        filePath: 'docs/embedding-test.md',
        title: 'Embedding Test',
        content: 'Content',
        plainText: 'Content',
        embedding
      };

      const id = await builder.indexDocument(doc);
      const retrieved = builder.getDocument(id);

      expect(retrieved?.embedding).toEqual(embedding);
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

    it('should respect limit parameter', () => {
      const results = builder.searchFullText('desktop', { limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for no matches', () => {
      const results = builder.searchFullText('nonexistent query xyz123');

      expect(results).toEqual([]);
    });

    it('should handle FTS5 special characters', () => {
      // Should not throw
      const results = builder.searchFullText('test "quoted" AND OR');

      expect(Array.isArray(results)).toBe(true);
    });

    it('should skip documents with empty embeddings in semantic search', async () => {
      // Add a document with empty embedding
      await builder.indexDocument({
        filePath: 'docs/empty-embedding.md',
        title: 'Empty Embedding Doc',
        content: 'This doc has no embedding',
        plainText: 'This doc has no embedding',
        embedding: [], // Empty embedding
      });

      // Query with a valid 768-dimension embedding
      const queryEmbedding = new Array(768).fill(0.1);
      const results = await builder.searchSemantic(queryEmbedding, { limit: 10 });

      // The empty embedding doc should not be in results (filtered out due to dimension mismatch)
      const emptyEmbedDoc = results.find(r => r.filePath === 'docs/empty-embedding.md');
      expect(emptyEmbedDoc).toBeUndefined();
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

    it('should retrieve document by file path', async () => {
      await builder.indexDocument({
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

    it('should return null for non-existent path', () => {
      const doc = builder.getDocumentByPath('does/not/exist.md');

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

    it('should return zero counts for empty index', () => {
      const stats = builder.getStatistics();

      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalEmbeddings).toBe(0);
    });

    it('should track metadata count', async () => {
      await builder.indexDocument({
        filePath: 'docs/with-metadata.md',
        title: 'Test',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1),
        metadata: { '@type': 'TechArticle' }
      });

      const stats = builder.getStatistics();

      expect(stats.documentsWithMetadata).toBe(1);
    });
  });

  describe('deletion', () => {
    beforeEach(() => builder.initialize());

    it('should delete document by ID', async () => {
      const id = await builder.indexDocument({
        filePath: 'docs/to-delete.md',
        title: 'Delete Me',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1)
      });

      const deleted = builder.deleteDocument(id);

      expect(deleted).toBe(true);
      expect(builder.getDocument(id)).toBeNull();
    });

    it('should return false for non-existent document', () => {
      const deleted = builder.deleteDocument(99999);

      expect(deleted).toBe(false);
    });

    it('should also delete associated embedding and metadata', async () => {
      const id = await builder.indexDocument({
        filePath: 'docs/full-delete.md',
        title: 'Full Delete',
        content: 'Content',
        plainText: 'Content',
        embedding: new Array(768).fill(0.1),
        metadata: { '@type': 'TechArticle' }
      });

      builder.deleteDocument(id);

      const stats = builder.getStatistics();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalEmbeddings).toBe(0);
      expect(stats.documentsWithMetadata).toBe(0);
    });
  });
});
