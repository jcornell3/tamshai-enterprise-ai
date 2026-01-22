/**
 * Lessons Resource Unit Tests - Sprint 3 RED Phase
 *
 * These tests define the expected behavior for the LessonsResource.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * URI: journey://lessons
 * Purpose: Access all lessons learned from the project journey.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LessonsResource } from '@/resources/lessons';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('LessonsResource', () => {
  let resource: LessonsResource;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn(),
      searchFullText: vi.fn(),
      searchSemantic: vi.fn(),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn(),
      getDocumentsByType: vi.fn().mockReturnValue([]),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    resource = new LessonsResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://lessons pattern', () => {
      expect(resource.uriTemplate).toBe('journey://lessons');
    });

    it('should have name and description', () => {
      expect(resource.name).toBe('lessons');
      expect(resource.description).toContain('lesson');
    });
  });

  describe('read', () => {
    it('should return all lessons learned documents', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([
        {
          id: 1,
          title: 'Lessons from Keycloak Migration',
          content: 'Key takeaways...',
          plainText: 'Key takeaways',
          filePath: 'lessons/keycloak.md',
          embedding: [],
          metadata: { learningResourceType: 'lessons-learned' }
        }
      ]);

      const result = await resource.read();

      expect(result.contents.length).toBeGreaterThan(0);
    });

    it('should aggregate lessons from multiple sources', async () => {
      await resource.read();

      expect(mockIndex.getDocumentsByType).toHaveBeenCalledWith(
        expect.arrayContaining(['lessons-learned', 'best-practice'])
      );
    });

    it('should categorize lessons by topic', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([
        {
          id: 1,
          title: 'Lessons',
          content: 'Content',
          plainText: 'Content',
          filePath: 'lessons.md',
          embedding: [],
          metadata: {
            learningResourceType: 'lessons-learned',
            keywords: ['authentication', 'oauth']
          }
        }
      ]);

      const result = await resource.read();

      expect(result.contents[0].metadata.categories).toBeDefined();
    });

    it('should return markdown mimeType', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([
        {
          id: 1,
          title: 'Lessons',
          content: 'Content',
          plainText: 'Content',
          filePath: 'lessons.md',
          embedding: [],
          metadata: {}
        }
      ]);

      const result = await resource.read();

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should include URI for resource', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([
        {
          id: 1,
          title: 'Lessons',
          content: 'Content',
          plainText: 'Content',
          filePath: 'lessons.md',
          embedding: [],
          metadata: {}
        }
      ]);

      const result = await resource.read();

      expect(result.contents[0].uri).toBe('journey://lessons');
    });

    it('should return empty when no lessons exist', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([]);

      const result = await resource.read();

      expect(result.contents).toHaveLength(0);
    });

    it('should include total count in metadata', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockReturnValue([
        { id: 1, title: 'L1', content: '', plainText: '', filePath: 'l1.md', embedding: [], metadata: {} },
        { id: 2, title: 'L2', content: '', plainText: '', filePath: 'l2.md', embedding: [], metadata: {} }
      ]);

      const result = await resource.read();

      expect(result.metadata?.totalLessons).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getDocumentsByType).mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(resource.read())
        .rejects.toThrow();
    });
  });
});
