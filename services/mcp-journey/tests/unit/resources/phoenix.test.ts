/**
 * Phoenix Resource Unit Tests - Sprint 3 RED Phase
 *
 * These tests define the expected behavior for the PhoenixResource.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * URI: journey://phoenix/{version}
 * Purpose: Access Phoenix rebuild logs by version.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhoenixResource } from '@/resources/phoenix';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('PhoenixResource', () => {
  let resource: PhoenixResource;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn(),
      searchFullText: vi.fn(),
      searchSemantic: vi.fn(),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn().mockReturnValue(null),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      listDocuments: vi.fn().mockReturnValue([]),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    resource = new PhoenixResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://phoenix/{version} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://phoenix/{version}');
    });

    it('should have name and description', () => {
      expect(resource.name).toBe('phoenix');
      expect(resource.description).toContain('Phoenix');
    });
  });

  describe('read', () => {
    it('should return Phoenix rebuild log for version', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11 Manual Actions',
        content: '# Phoenix v11...',
        plainText: 'Phoenix v11',
        embedding: [],
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
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11',
        content: 'Content',
        plainText: 'Content',
        embedding: [],
        metadata: {}
      });

      await resource.read({ version: '11' });

      expect(mockIndex.getDocumentByPath).toHaveBeenCalledWith(
        expect.stringContaining('v11')
      );
    });

    it('should return comparison between two versions', async () => {
      vi.mocked(mockIndex.getDocumentByPath)
        .mockReturnValueOnce({
          id: 1,
          filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv9.md',
          title: 'Phoenix v9',
          content: 'v9 content',
          plainText: 'v9 content',
          embedding: [],
          metadata: { manualActions: 5 }
        })
        .mockReturnValueOnce({
          id: 2,
          filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
          title: 'Phoenix v11',
          content: 'v11 content',
          plainText: 'v11 content',
          embedding: [],
          metadata: { manualActions: 0 }
        });

      const result = await resource.read({ version: 'v9..v11' });

      expect(result.contents[0].metadata.comparison).toBeDefined();
    });

    it('should throw for non-existent version', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue(null);

      await expect(resource.read({ version: 'v99' }))
        .rejects.toThrow('Phoenix version not found');
    });

    it('should include URI in response', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11',
        content: 'Content',
        plainText: 'Content',
        embedding: [],
        metadata: {}
      });

      const result = await resource.read({ version: 'v11' });

      expect(result.contents[0].uri).toBe('journey://phoenix/v11');
    });

    it('should return markdown mimeType', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11',
        content: 'Content',
        plainText: 'Content',
        embedding: [],
        metadata: {}
      });

      const result = await resource.read({ version: 'v11' });

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should include metadata about manual actions', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md',
        title: 'Phoenix v11',
        content: 'Content',
        plainText: 'Content',
        embedding: [],
        metadata: {
          manualActions: 0,
          automatedSteps: 15
        }
      });

      const result = await resource.read({ version: 'v11' });

      expect(result.contents[0].metadata.manualActions).toBe(0);
      expect(result.contents[0].metadata.automatedSteps).toBe(15);
    });
  });

  describe('list', () => {
    it('should list all Phoenix versions', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([
        { id: 1, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv1.md', title: 'v1', content: '', plainText: '', embedding: [] },
        { id: 2, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv9.md', title: 'v9', content: '', plainText: '', embedding: [] },
        { id: 3, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md', title: 'v11', content: '', plainText: '', embedding: [] }
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(3);
      expect(result.resources.map(r => r.uri)).toContain('journey://phoenix/v11');
    });

    it('should sort versions numerically', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([
        { id: 1, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv11.md', title: 'v11', content: '', plainText: '', embedding: [] },
        { id: 2, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv1.md', title: 'v1', content: '', plainText: '', embedding: [] },
        { id: 3, filePath: 'docs/operations/PHOENIX_MANUAL_ACTIONSv9.md', title: 'v9', content: '', plainText: '', embedding: [] }
      ]);

      const result = await resource.list();

      // Should be sorted: v1, v9, v11
      expect(result.resources[0].uri).toBe('journey://phoenix/v1');
      expect(result.resources[1].uri).toBe('journey://phoenix/v9');
      expect(result.resources[2].uri).toBe('journey://phoenix/v11');
    });

    it('should return empty list when no versions exist', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([]);

      const result = await resource.list();

      expect(result.resources).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw for empty version', async () => {
      await expect(resource.read({ version: '' }))
        .rejects.toThrow('Version is required');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(resource.read({ version: 'v11' }))
        .rejects.toThrow();
    });

    it('should handle invalid version range format', async () => {
      await expect(resource.read({ version: 'v1...v2' }))
        .rejects.toThrow('Invalid version range');
    });
  });
});
