/**
 * Get Context Tool Unit Tests - Sprint 2 RED Phase
 *
 * These tests define the expected behavior for the GetContextTool.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Get historical context and timeline for a topic.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetContextTool } from '@/tools/get-context';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('GetContextTool', () => {
  let tool: GetContextTool;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn(),
      searchFullText: vi.fn().mockReturnValue([]),
      searchSemantic: vi.fn(),
      searchByTopic: vi.fn().mockReturnValue([]),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn(),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    tool = new GetContextTool(mockIndex);
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get_context');
    });

    it('should have description mentioning context or history', () => {
      const desc = tool.description.toLowerCase();
      expect(desc).toMatch(/context|history|timeline/);
    });

    it('should require topic parameter', () => {
      expect(tool.inputSchema.required).toContain('topic');
    });

    it('should have optional date_range parameter', () => {
      expect(tool.inputSchema.properties.date_range).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('date_range');
    });

    it('should have topic parameter with string type', () => {
      expect(tool.inputSchema.properties.topic.type).toBe('string');
    });
  });

  describe('execute', () => {
    it('should return chronological context for a topic', async () => {
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([
        { id: 1, title: 'Early doc', date: '2025-10-01', filePath: 'early.md', content: '', plainText: '', embedding: [] },
        { id: 2, title: 'Middle doc', date: '2025-11-15', filePath: 'middle.md', content: '', plainText: '', embedding: [] },
        { id: 3, title: 'Latest doc', date: '2026-01-10', filePath: 'latest.md', content: '', plainText: '', embedding: [] }
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
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([
        {
          id: 1,
          title: 'Keycloak OAuth',
          filePath: 'oauth.md',
          content: '',
          plainText: '',
          embedding: [],
          metadata: { keywords: ['keycloak', 'oauth', 'oidc'] }
        }
      ]);

      const result = await tool.execute({ topic: 'keycloak' });

      expect(result.data.relatedTopics).toContain('oauth');
      expect(result.data.relatedTopics).toContain('oidc');
    });

    it('should summarize the evolution of the topic', async () => {
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([
        { id: 1, title: 'Early', date: '2025-10-01', filePath: 'e.md', content: '', plainText: '', embedding: [] },
        { id: 2, title: 'Later', date: '2025-12-01', filePath: 'l.md', content: '', plainText: '', embedding: [] }
      ]);

      const result = await tool.execute({ topic: 'desktop-client' });

      expect(result.data.summary).toBeDefined();
      expect(typeof result.data.summary).toBe('string');
    });

    it('should return empty timeline with message for unknown topic', async () => {
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([]);

      const result = await tool.execute({ topic: 'unknown-topic' });

      expect(result.status).toBe('success');
      expect(result.data.timeline).toEqual([]);
      expect(result.metadata.message).toBeDefined();
    });

    it('should exclude the search topic from related topics', async () => {
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([
        {
          id: 1,
          title: 'Keycloak Config',
          filePath: 'config.md',
          content: '',
          plainText: '',
          embedding: [],
          metadata: { keywords: ['keycloak', 'oauth', 'config'] }
        }
      ]);

      const result = await tool.execute({ topic: 'keycloak' });

      expect(result.data.relatedTopics).not.toContain('keycloak');
    });

    it('should include document counts in response', async () => {
      vi.mocked(mockIndex.searchByTopic).mockReturnValue([
        { id: 1, title: 'Doc 1', filePath: 'd1.md', content: '', plainText: '', embedding: [] },
        { id: 2, title: 'Doc 2', filePath: 'd2.md', content: '', plainText: '', embedding: [] }
      ]);

      const result = await tool.execute({ topic: 'test' });

      expect(result.metadata.documentCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should return error for empty topic', async () => {
      const result = await tool.execute({ topic: '' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
    });

    it('should return error for invalid date range format', async () => {
      const result = await tool.execute({
        topic: 'test',
        date_range: 'invalid-format'
      });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_DATE_RANGE');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.searchByTopic).mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await tool.execute({ topic: 'test' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INDEX_ERROR');
    });
  });
});
