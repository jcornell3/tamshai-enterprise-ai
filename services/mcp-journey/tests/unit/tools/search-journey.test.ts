/**
 * Search Journey Tool Unit Tests - Sprint 2 RED Phase
 *
 * These tests define the expected behavior for the SearchJourneyTool.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Semantic search across all project journey documentation.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchJourneyTool } from '@/tools/search-journey';
import type { KnowledgeIndex } from '@/indexer/index-builder';
import type { EmbeddingGenerator } from '@/indexer/embedding-generator';

describe('SearchJourneyTool', () => {
  let tool: SearchJourneyTool;
  let mockIndex: KnowledgeIndex;
  let mockEmbeddingGenerator: EmbeddingGenerator;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn().mockResolvedValue([]),
      searchFullText: vi.fn().mockReturnValue([]),
      searchSemantic: vi.fn().mockResolvedValue([]),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn(),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    mockEmbeddingGenerator = {
      generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
      generateBatch: vi.fn(),
      model: 'text-embedding-004',
      clearCache: vi.fn(),
      getCacheStats: vi.fn(),
    } as unknown as EmbeddingGenerator;

    tool = new SearchJourneyTool(mockIndex, mockEmbeddingGenerator);
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('search_journey');
    });

    it('should have description mentioning search', () => {
      expect(tool.description.toLowerCase()).toContain('search');
    });

    it('should require query parameter', () => {
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should have optional limit parameter with default', () => {
      expect(tool.inputSchema.properties.limit.default).toBe(10);
    });

    it('should have query parameter with string type', () => {
      expect(tool.inputSchema.properties.query.type).toBe('string');
    });
  });

  describe('execute', () => {
    it('should perform semantic search across all journey docs', async () => {
      vi.mocked(mockEmbeddingGenerator.generateEmbedding).mockResolvedValue(
        new Array(768).fill(0.1)
      );
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([
        { id: 1, title: 'Result 1', score: 0.95, filePath: 'doc1.md', content: '', plainText: '', embedding: [] },
        { id: 2, title: 'Result 2', score: 0.85, filePath: 'doc2.md', content: '', plainText: '', embedding: [] }
      ]);

      const result = await tool.execute({ query: 'Why did you use Flutter?' });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(2);
    });

    it('should generate embedding for query', async () => {
      await tool.execute({ query: 'desktop client migration' });

      expect(mockEmbeddingGenerator.generateEmbedding).toHaveBeenCalledWith(
        'desktop client migration'
      );
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
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([
        {
          id: 1,
          title: 'Test',
          filePath: 'docs/archived/test.md',
          content: '',
          plainText: '',
          embedding: [],
          score: 0.9
        }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.data[0].filePath).toBe('docs/archived/test.md');
    });

    it('should include relevance scores in results', async () => {
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([
        {
          id: 1,
          title: 'High Score',
          filePath: 'test.md',
          content: '',
          plainText: '',
          embedding: [],
          score: 0.95
        }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.data[0].score).toBe(0.95);
    });

    it('should return empty results with suggestion for no matches', async () => {
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([]);
      vi.mocked(mockIndex.searchCombined).mockResolvedValue([]);

      const result = await tool.execute({ query: 'xyz123nonexistent' });

      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
      expect(result.metadata.suggestion).toBeDefined();
    });

    it('should sort results by relevance score', async () => {
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([
        { id: 1, title: 'Low', score: 0.5, filePath: 'low.md', content: '', plainText: '', embedding: [] },
        { id: 2, title: 'High', score: 0.9, filePath: 'high.md', content: '', plainText: '', embedding: [] },
        { id: 3, title: 'Medium', score: 0.7, filePath: 'med.md', content: '', plainText: '', embedding: [] }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.data[0].title).toBe('High');
      expect(result.data[1].title).toBe('Medium');
      expect(result.data[2].title).toBe('Low');
    });
  });

  describe('error handling', () => {
    it('should return error for empty query', async () => {
      const result = await tool.execute({ query: '' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('should handle embedding generation failure', async () => {
      vi.mocked(mockEmbeddingGenerator.generateEmbedding).mockRejectedValue(
        new Error('Embedding API error')
      );

      const result = await tool.execute({ query: 'test' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('EMBEDDING_ERROR');
    });

    it('should fall back to FTS when semantic search fails', async () => {
      vi.mocked(mockIndex.searchSemantic).mockRejectedValue(
        new Error('DB error')
      );
      vi.mocked(mockIndex.searchFullText).mockReturnValue([
        {
          id: 1,
          title: 'FTS Result',
          filePath: 'fts.md',
          content: '',
          plainText: 'FTS content',
          embedding: [],
          score: 0.8
        }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('FTS Result');
    });

    it('should fall back to FTS when semantic search returns empty results (no embeddings)', async () => {
      // Simulates the case when documents have empty embeddings and are filtered out
      vi.mocked(mockIndex.searchSemantic).mockResolvedValue([]);
      vi.mocked(mockIndex.searchFullText).mockReturnValue([
        {
          id: 1,
          title: 'FTS Fallback',
          filePath: 'test.md',
          content: '',
          plainText: 'Test content',
          embedding: [],
          score: 0.75
        }
      ]);

      const result = await tool.execute({ query: 'test' });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('FTS Fallback');
      expect(mockIndex.searchFullText).toHaveBeenCalled();
    });
  });
});
