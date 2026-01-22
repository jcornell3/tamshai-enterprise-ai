/**
 * Decisions Resource Unit Tests - Sprint 3 RED Phase
 *
 * These tests define the expected behavior for the DecisionsResource.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * URI: journey://decisions/{adr-id}
 * Purpose: Access Architecture Decision Records by ID.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionsResource } from '@/resources/decisions';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('DecisionsResource', () => {
  let resource: DecisionsResource;
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

    resource = new DecisionsResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://decisions/{adr-id} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://decisions/{adr-id}');
    });

    it('should have name and description', () => {
      expect(resource.name).toBe('decisions');
      expect(resource.description).toContain('ADR');
    });
  });

  describe('read', () => {
    it('should return ADR document by ID', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        title: 'ADR-001: Desktop Client Migration',
        content: '# Full content...',
        plainText: 'Full content',
        filePath: 'docs/adr/ADR-001.md',
        embedding: [],
        metadata: { '@type': 'TechArticle' }
      });

      const result = await resource.read({ 'adr-id': 'ADR-001' });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('journey://decisions/ADR-001');
    });

    it('should resolve partial ADR ID (001 -> ADR-001)', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        title: 'ADR-001',
        content: 'Content',
        plainText: 'Content',
        filePath: 'docs/adr/ADR-001.md',
        embedding: [],
        metadata: {}
      });

      await resource.read({ 'adr-id': '001' });

      expect(mockIndex.getDocumentByPath).toHaveBeenCalledWith(
        expect.stringContaining('ADR-001')
      );
    });

    it('should throw for non-existent ADR', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue(null);

      await expect(resource.read({ 'adr-id': 'ADR-999' }))
        .rejects.toThrow('ADR not found');
    });

    it('should include JSON-LD metadata in response', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        title: 'ADR-001',
        content: 'Content',
        plainText: 'Content',
        filePath: 'docs/adr/ADR-001.md',
        embedding: [],
        metadata: {
          '@type': 'TechArticle',
          datePublished: '2026-01-21'
        }
      });

      const result = await resource.read({ 'adr-id': 'ADR-001' });

      expect(result.contents[0].metadata['@type']).toBe('TechArticle');
    });

    it('should return markdown mimeType', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        title: 'ADR-001',
        content: 'Content',
        plainText: 'Content',
        filePath: 'docs/adr/ADR-001.md',
        embedding: [],
        metadata: {}
      });

      const result = await resource.read({ 'adr-id': 'ADR-001' });

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });
  });

  describe('list', () => {
    it('should list all available ADRs', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([
        { id: 1, filePath: 'docs/adr/ADR-001.md', title: 'Desktop Client', content: '', plainText: '', embedding: [] },
        { id: 2, filePath: 'docs/adr/ADR-002.md', title: 'Phoenix Rebuild', content: '', plainText: '', embedding: [] }
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].uri).toBe('journey://decisions/ADR-001');
    });

    it('should return empty list when no ADRs exist', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([]);

      const result = await resource.list();

      expect(result.resources).toEqual([]);
    });

    it('should include title and description in list items', async () => {
      vi.mocked(mockIndex.listDocuments).mockReturnValue([
        { id: 1, filePath: 'docs/adr/ADR-001.md', title: 'Desktop Client Migration', content: '', plainText: '', embedding: [] }
      ]);

      const result = await resource.list();

      expect(result.resources[0].name).toBe('Desktop Client Migration');
    });
  });

  describe('error handling', () => {
    it('should throw for empty ADR ID', async () => {
      await expect(resource.read({ 'adr-id': '' }))
        .rejects.toThrow('ADR ID is required');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(resource.read({ 'adr-id': 'ADR-001' }))
        .rejects.toThrow();
    });
  });
});
