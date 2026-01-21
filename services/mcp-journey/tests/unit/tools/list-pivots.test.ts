/**
 * List Pivots Tool Unit Tests - Sprint 2 RED Phase
 *
 * These tests define the expected behavior for the ListPivotsTool.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: List all documented technology pivots in the project.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListPivotsTool } from '@/tools/list-pivots';
import type { KnowledgeIndex } from '@/indexer/index-builder';

describe('ListPivotsTool', () => {
  let tool: ListPivotsTool;
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
      getPivots: vi.fn().mockReturnValue([]),
      initialize: vi.fn(),
      close: vi.fn(),
      indexDocument: vi.fn(),
      deleteDocument: vi.fn(),
    } as unknown as KnowledgeIndex;

    tool = new ListPivotsTool(mockIndex);
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('list_pivots');
    });

    it('should have description mentioning pivots or technology changes', () => {
      const desc = tool.description.toLowerCase();
      expect(desc).toMatch(/pivot|technology|change|migration/);
    });

    it('should have optional component parameter', () => {
      expect(tool.inputSchema.properties.component).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('component');
    });

    it('should have no required parameters', () => {
      expect(tool.inputSchema.required).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should list all documented technology pivots', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        {
          from: 'Electron',
          to: 'React Native',
          date: '2025-10',
          reason: 'OAuth issues',
          component: 'desktop-client'
        },
        {
          from: 'React Native',
          to: 'Flutter',
          date: '2025-11',
          reason: 'VS2022 null pointer refs',
          component: 'desktop-client'
        },
        {
          from: 'Nginx',
          to: 'Caddy',
          date: '2025-12',
          reason: 'mTLS complexity',
          component: 'reverse-proxy'
        }
      ]);

      const result = await tool.execute({});

      expect(result.status).toBe('success');
      expect(result.data.pivots).toHaveLength(3);
    });

    it('should filter by component when provided', async () => {
      await tool.execute({ component: 'desktop-client' });

      expect(mockIndex.getPivots).toHaveBeenCalledWith(
        expect.objectContaining({ component: 'desktop-client' })
      );
    });

    it('should include pivot reason and documentation link', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        {
          from: 'Nginx',
          to: 'Caddy',
          reason: 'mTLS complexity',
          documentPath: 'docs/adr/ADR-003-nginx-to-caddy-migration.md'
        }
      ]);

      const result = await tool.execute({});

      expect(result.data.pivots[0].reason).toBe('mTLS complexity');
      expect(result.data.pivots[0].documentPath).toContain('ADR-003');
    });

    it('should group pivots by component', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        { from: 'Electron', to: 'React Native', component: 'desktop-client' },
        { from: 'React Native', to: 'Flutter', component: 'desktop-client' },
        { from: 'Nginx', to: 'Caddy', component: 'reverse-proxy' }
      ]);

      const result = await tool.execute({});

      expect(result.data.byComponent).toBeDefined();
      expect(result.data.byComponent['desktop-client']).toHaveLength(2);
      expect(result.data.byComponent['reverse-proxy']).toHaveLength(1);
    });

    it('should return empty array when no pivots found', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([]);

      const result = await tool.execute({ component: 'nonexistent' });

      expect(result.status).toBe('success');
      expect(result.data.pivots).toEqual([]);
    });

    it('should include total count in metadata', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        { from: 'A', to: 'B', component: 'c1' },
        { from: 'B', to: 'C', component: 'c1' }
      ]);

      const result = await tool.execute({});

      expect(result.metadata.totalPivots).toBe(2);
    });

    it('should sort pivots by date chronologically', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        { from: 'B', to: 'C', date: '2025-12', component: 'c1' },
        { from: 'A', to: 'B', date: '2025-10', component: 'c1' },
        { from: 'C', to: 'D', date: '2026-01', component: 'c1' }
      ]);

      const result = await tool.execute({});

      expect(result.data.pivots[0].date).toBe('2025-10');
      expect(result.data.pivots[1].date).toBe('2025-12');
      expect(result.data.pivots[2].date).toBe('2026-01');
    });

    it('should include component list in metadata', async () => {
      vi.mocked(mockIndex.getPivots).mockReturnValue([
        { from: 'A', to: 'B', component: 'desktop-client' },
        { from: 'C', to: 'D', component: 'reverse-proxy' }
      ]);

      const result = await tool.execute({});

      expect(result.metadata.components).toContain('desktop-client');
      expect(result.metadata.components).toContain('reverse-proxy');
    });
  });

  describe('error handling', () => {
    it('should handle index errors gracefully', async () => {
      vi.mocked(mockIndex.getPivots).mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await tool.execute({});

      expect(result.status).toBe('error');
      expect(result.code).toBe('INDEX_ERROR');
    });

    it('should validate component parameter format', async () => {
      const result = await tool.execute({ component: '<invalid>' });

      expect(result.status).toBe('error');
      expect(result.code).toBe('INVALID_INPUT');
    });
  });
});
