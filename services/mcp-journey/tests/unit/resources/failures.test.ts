/**
 * Failures Resource Unit Tests - Sprint 3 RED Phase
 *
 * These tests define the expected behavior for the FailuresResource.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * URI: journey://failures/{topic}
 * Purpose: Access failure documentation by topic.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FailuresResource } from '@/resources/failures';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('FailuresResource', () => {
  let resource: FailuresResource;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn().mockReturnValue([]),
      searchCombined: vi.fn().mockResolvedValue([]),
      searchFullText: vi.fn().mockReturnValue([]),
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

    resource = new FailuresResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://failures/{topic} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://failures/{topic}');
    });

    it('should have name and description', () => {
      expect(resource.name).toBe('failures');
      expect(resource.description).toContain('failure');
    });
  });

  describe('read', () => {
    it('should return failure documents for topic', async () => {
      vi.mocked(mockIndex.searchByType).mockReturnValue([
        {
          id: 1,
          title: 'Keycloak Failure',
          content: 'We failed to configure...',
          plainText: 'We failed to configure',
          filePath: 'keycloak.md',
          embedding: [],
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
      vi.mocked(mockIndex.searchByType).mockReturnValue([]);

      const result = await resource.read({ topic: 'unknown' });

      expect(result.contents).toEqual([]);
    });

    it('should include document metadata in response', async () => {
      vi.mocked(mockIndex.searchByType).mockReturnValue([
        {
          id: 1,
          title: 'Test',
          content: 'Content',
          plainText: 'Content',
          filePath: 'test.md',
          embedding: [],
          metadata: { datePublished: '2026-01-15' }
        }
      ]);

      const result = await resource.read({ topic: 'test' });

      expect(result.contents[0].metadata.datePublished).toBe('2026-01-15');
    });

    it('should include URI in each content item', async () => {
      vi.mocked(mockIndex.searchByType).mockReturnValue([
        {
          id: 1,
          title: 'Keycloak Failure',
          content: 'Content',
          plainText: 'Content',
          filePath: 'keycloak.md',
          embedding: [],
          metadata: {}
        }
      ]);

      const result = await resource.read({ topic: 'keycloak' });

      expect(result.contents[0].uri).toBe('journey://failures/keycloak');
    });

    it('should handle topic with special characters', async () => {
      const result = await resource.read({ topic: 'oauth-2.0' });

      expect(mockIndex.searchByType).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw for empty topic', async () => {
      await expect(resource.read({ topic: '' }))
        .rejects.toThrow('Topic is required');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.searchByType).mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(resource.read({ topic: 'test' }))
        .rejects.toThrow();
    });
  });
});
