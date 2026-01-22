/**
 * Evolution Resource Unit Tests - Sprint 3 RED Phase
 *
 * These tests define the expected behavior for the EvolutionResource.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * URI: journey://evolution/{component}
 * Purpose: Access component evolution history and technology changes.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionResource } from '@/resources/evolution';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('EvolutionResource', () => {
  let resource: EvolutionResource;
  let mockIndex: KnowledgeIndex;

  beforeEach(() => {
    mockIndex = {
      searchByType: vi.fn(),
      searchCombined: vi.fn(),
      searchFullText: vi.fn(),
      searchSemantic: vi.fn(),
      getDocument: vi.fn(),
      getDocumentByPath: vi.fn(),
      getMetadataByType: vi.fn(),
      getStatistics: vi.fn(),
      getEvolutionHistory: vi.fn().mockReturnValue(null),
      listComponents: vi.fn().mockReturnValue([]),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    resource = new EvolutionResource(mockIndex);
  });

  describe('URI template', () => {
    it('should match journey://evolution/{component} pattern', () => {
      expect(resource.uriTemplate).toBe('journey://evolution/{component}');
    });

    it('should have name and description', () => {
      expect(resource.name).toBe('evolution');
      expect(resource.description).toContain('evolution');
    });
  });

  describe('read', () => {
    it('should return evolution history for component', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue({
        component: 'desktop-client',
        timeline: [
          { version: '1.0', date: '2025-10', technology: 'Electron' },
          { version: '1.1', date: '2025-11', technology: 'React Native' },
          { version: '1.4', date: '2026-01', technology: 'Flutter' }
        ],
        pivots: [
          { from: 'Electron', to: 'React Native', reason: 'OAuth' },
          { from: 'React Native', to: 'Flutter', reason: 'VS2022 bugs' }
        ]
      });

      const result = await resource.read({ component: 'desktop-client' });

      expect(result.contents[0].text).toContain('Electron');
      expect(result.contents[0].text).toContain('Flutter');
    });

    it('should include all pivots in evolution', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue({
        component: 'desktop-client',
        timeline: [],
        pivots: [
          { from: 'Electron', to: 'React Native', reason: 'OAuth' },
          { from: 'React Native', to: 'Flutter', reason: 'VS2022 bugs' }
        ]
      });

      const result = await resource.read({ component: 'desktop-client' });

      expect(result.contents[0].metadata.pivotCount).toBe(2);
    });

    it('should throw for unknown component', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue(null);

      await expect(resource.read({ component: 'unknown' }))
        .rejects.toThrow('Component not found');
    });

    it('should include URI in response', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue({
        component: 'desktop-client',
        timeline: [],
        pivots: []
      });

      const result = await resource.read({ component: 'desktop-client' });

      expect(result.contents[0].uri).toBe('journey://evolution/desktop-client');
    });

    it('should return markdown mimeType', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue({
        component: 'desktop-client',
        timeline: [],
        pivots: []
      });

      const result = await resource.read({ component: 'desktop-client' });

      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should include timeline entries in chronological order', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockReturnValue({
        component: 'desktop-client',
        timeline: [
          { version: '1.4', date: '2026-01', technology: 'Flutter' },
          { version: '1.0', date: '2025-10', technology: 'Electron' }
        ],
        pivots: []
      });

      const result = await resource.read({ component: 'desktop-client' });

      // Should be sorted chronologically (oldest first)
      expect(result.contents[0].text.indexOf('Electron'))
        .toBeLessThan(result.contents[0].text.indexOf('Flutter'));
    });
  });

  describe('list', () => {
    it('should list all tracked components', async () => {
      vi.mocked(mockIndex.listComponents).mockReturnValue([
        'desktop-client',
        'reverse-proxy',
        'authentication'
      ]);

      const result = await resource.list();

      expect(result.resources).toHaveLength(3);
    });

    it('should include component names in list', async () => {
      vi.mocked(mockIndex.listComponents).mockReturnValue(['desktop-client']);

      const result = await resource.list();

      expect(result.resources[0].uri).toBe('journey://evolution/desktop-client');
      expect(result.resources[0].name).toBe('desktop-client');
    });

    it('should return empty list when no components exist', async () => {
      vi.mocked(mockIndex.listComponents).mockReturnValue([]);

      const result = await resource.list();

      expect(result.resources).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw for empty component name', async () => {
      await expect(resource.read({ component: '' }))
        .rejects.toThrow('Component name is required');
    });

    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getEvolutionHistory).mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(resource.read({ component: 'test' }))
        .rejects.toThrow();
    });
  });
});
