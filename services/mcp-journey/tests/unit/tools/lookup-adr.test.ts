/**
 * Lookup ADR Tool Unit Tests - Sprint 2 RED Phase
 *
 * These tests define the expected behavior for the LookupAdrTool.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Retrieve specific Architecture Decision Records by ID.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LookupAdrTool } from '@/tools/lookup-adr';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('LookupAdrTool', () => {
  let tool: LookupAdrTool;
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
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
      listDocuments: vi.fn().mockReturnValue([]),
    } as unknown as KnowledgeIndex;

    tool = new LookupAdrTool(mockIndex);
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('lookup_adr');
    });

    it('should have description mentioning ADR', () => {
      expect(tool.description.toLowerCase()).toContain('adr');
    });

    it('should require adr_id parameter', () => {
      expect(tool.inputSchema.required).toContain('adr_id');
    });

    it('should validate adr_id format (ADR-XXX)', () => {
      expect(tool.inputSchema.properties.adr_id.pattern).toBe('^ADR-\\d{3}$');
    });

    it('should have adr_id parameter with string type', () => {
      expect(tool.inputSchema.properties.adr_id.type).toBe('string');
    });
  });

  describe('execute', () => {
    it('should return full ADR document for valid ID', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/adr/ADR-001-desktop-client-migration.md',
        title: 'ADR-001: Desktop Client Migration',
        content: '# Full ADR content...',
        plainText: 'Full ADR content',
        embedding: [],
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
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue(null);

      const result = await tool.execute({ adr_id: 'ADR-999' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('ADR_NOT_FOUND');
      expect(result.suggestedAction).toContain('list of valid ADRs');
    });

    it('should include JSON-LD metadata in response', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 7,
        filePath: 'docs/adr/ADR-007.md',
        title: 'ADR-007: Test Coverage Strategy',
        content: 'Content',
        plainText: 'Content',
        embedding: [],
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
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue(null);
      vi.mocked(mockIndex.listDocuments).mockReturnValue([
        { id: 1, filePath: 'docs/adr/ADR-001.md', title: 'ADR-001', content: '', plainText: '', embedding: [] },
        { id: 2, filePath: 'docs/adr/ADR-002.md', title: 'ADR-002', content: '', plainText: '', embedding: [] }
      ]);

      const result = await tool.execute({ adr_id: 'ADR-999' });

      expect(result.availableAdrs).toEqual(['ADR-001', 'ADR-002']);
    });

    it('should search in multiple ADR path patterns', async () => {
      await tool.execute({ adr_id: 'ADR-001' });

      // Should try both full path and partial matches
      expect(mockIndex.getDocumentByPath).toHaveBeenCalled();
    });

    it('should handle ADR with related decisions', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockReturnValue({
        id: 1,
        filePath: 'docs/adr/ADR-001.md',
        title: 'ADR-001: Desktop Client Migration',
        content: '## Related Decisions\n- ADR-003',
        plainText: 'Related Decisions ADR-003',
        embedding: [],
        metadata: {
          relatedDecisions: ['ADR-003']
        }
      });

      const result = await tool.execute({ adr_id: 'ADR-001' });

      expect(result.data.relatedDecisions).toContain('ADR-003');
    });
  });

  describe('error handling', () => {
    it('should return error for invalid ADR ID format', async () => {
      const result = await tool.execute({ adr_id: 'invalid' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_ADR_ID');
    });

    it('should return error for empty ADR ID', async () => {
      const result = await tool.execute({ adr_id: '' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_ADR_ID');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getDocumentByPath).mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await tool.execute({ adr_id: 'ADR-001' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INDEX_ERROR');
    });
  });
});
