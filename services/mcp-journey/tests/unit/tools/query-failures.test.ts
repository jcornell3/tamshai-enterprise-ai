/**
 * Query Failures Tool Unit Tests - Sprint 2 RED Phase
 *
 * These tests define the expected behavior for the QueryFailuresTool.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Search for documentation about what didn't work.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryFailuresTool } from '@/tools/query-failures';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('QueryFailuresTool', () => {
  let tool: QueryFailuresTool;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn().mockResolvedValue([]),
      searchFullText: vi.fn(),
      searchSemantic: vi.fn(),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn(),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
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

    it('should have topic parameter with string type', () => {
      expect(tool.inputSchema.properties.topic.type).toBe('string');
    });

    it('should have description for topic parameter', () => {
      expect(tool.inputSchema.properties.topic.description).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should search for failure documentation by topic', async () => {
      vi.mocked(mockIndex.searchCombined).mockResolvedValue([
        {
          id: 1,
          title: 'Keycloak mTLS Failure',
          filePath: 'docs/archived/keycloak-failure.md',
          content: 'Failed to configure mTLS',
          plainText: 'Failed to configure mTLS',
          embedding: [],
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
      vi.mocked(mockIndex.searchCombined).mockResolvedValue([]);

      const result = await tool.execute({ topic: 'nonexistent-topic' });

      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
      expect(result.metadata.suggestedAction).toContain('broader terms');
    });

    it('should include relevance scores in results', async () => {
      vi.mocked(mockIndex.searchCombined).mockResolvedValue([
        {
          id: 1,
          title: 'Test',
          score: 0.85,
          filePath: 'test.md',
          content: '',
          plainText: '',
          embedding: []
        }
      ]);

      const result = await tool.execute({ topic: 'test' });

      expect(result.data[0].relevanceScore).toBe(0.85);
    });

    it('should extract root cause from metadata', async () => {
      vi.mocked(mockIndex.searchCombined).mockResolvedValue([
        {
          id: 1,
          title: 'Auth Failure',
          filePath: 'test.md',
          content: '',
          plainText: '',
          embedding: [],
          score: 0.9,
          metadata: { rootCause: 'Token expiration' }
        }
      ]);

      const result = await tool.execute({ topic: 'auth' });

      expect(result.data[0].rootCause).toBe('Token expiration');
    });

    it('should limit results to reasonable number', async () => {
      const manyResults = Array(20).fill(null).map((_, i) => ({
        id: i,
        title: `Result ${i}`,
        filePath: `test${i}.md`,
        content: '',
        plainText: '',
        embedding: [],
        score: 0.5
      }));
      vi.mocked(mockIndex.searchCombined).mockResolvedValue(manyResults);

      const result = await tool.execute({ topic: 'test' });

      expect(result.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe('error handling', () => {
    it('should return error status on index failure', async () => {
      vi.mocked(mockIndex.searchCombined).mockRejectedValue(new Error('DB error'));

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

    it('should handle empty topic gracefully', async () => {
      const result = await tool.execute({ topic: '' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
    });
  });
});
