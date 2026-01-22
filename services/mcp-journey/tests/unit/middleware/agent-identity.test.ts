/**
 * Agent Identity Middleware Unit Tests - Sprint 4 RED Phase
 *
 * These tests define the expected behavior for the AgentIdentity middleware.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Purpose: Wrap all MCP responses with source attribution metadata.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  wrapWithIdentity,
  createIdentityMiddleware,
  type JourneyResponse,
  type SourceDocument
} from '@/middleware/agent-identity';

describe('AgentIdentity middleware', () => {
  describe('wrapWithIdentity', () => {
    it('should add _meta object to response', () => {
      const data = { query: 'test', answer: 'response' };
      const sourceDocs: SourceDocument[] = [{ date: '2026-01-15' }];

      const result = wrapWithIdentity(data, sourceDocs);

      expect(result._meta).toBeDefined();
      expect(result._meta.source).toBe('tamshai-project-journey');
    });

    it('should mark type as historical-documentation', () => {
      const result = wrapWithIdentity({}, []);

      expect(result._meta.type).toBe('historical-documentation');
    });

    it('should include disclaimer text', () => {
      const result = wrapWithIdentity({}, []);

      expect(result._meta.disclaimer).toContain('historical project documentation');
      expect(result._meta.disclaimer).toContain('may no longer reflect');
    });

    it('should extract and sort document dates', () => {
      const sourceDocs: SourceDocument[] = [
        { date: '2026-01-15' },
        { date: '2025-12-01' },
        { date: '2026-01-05' }
      ];

      const result = wrapWithIdentity({}, sourceDocs);

      expect(result._meta.documentDates).toEqual([
        '2025-12-01',
        '2026-01-05',
        '2026-01-15'
      ]);
    });

    it('should preserve original data', () => {
      const data = { query: 'test', nested: { value: 42 } };

      const result = wrapWithIdentity(data, []);

      expect(result.data).toEqual(data);
    });

    it('should handle empty source documents', () => {
      const result = wrapWithIdentity({ test: true }, []);

      expect(result._meta.documentDates).toEqual([]);
    });

    it('should filter out documents without dates', () => {
      const sourceDocs: SourceDocument[] = [
        { date: '2026-01-15' },
        { title: 'No date doc' },
        { date: '2025-12-01' }
      ];

      const result = wrapWithIdentity({}, sourceDocs);

      expect(result._meta.documentDates).toHaveLength(2);
    });

    it('should include timestamp of when response was generated', () => {
      const result = wrapWithIdentity({}, []);

      expect(result._meta.generatedAt).toBeDefined();
      expect(typeof result._meta.generatedAt).toBe('string');
    });
  });

  describe('createIdentityMiddleware', () => {
    it('should wrap all tool responses with identity', async () => {
      const mockNext = vi.fn().mockResolvedValue({ answer: 'test' });
      const mockRequest = { method: 'tools/call', params: { name: 'query_failures' } };
      const middleware = createIdentityMiddleware();

      const result = await middleware(mockRequest, mockNext);

      expect(result._meta).toBeDefined();
      expect(result._meta.source).toBe('tamshai-project-journey');
    });

    it('should not wrap error responses', async () => {
      const mockNext = vi.fn().mockResolvedValue({
        status: 'error',
        code: 'TEST_ERROR'
      });
      const mockRequest = { method: 'tools/call', params: { name: 'query_failures' } };
      const middleware = createIdentityMiddleware();

      const result = await middleware(mockRequest, mockNext);

      // Errors should not have identity wrapper
      expect(result._meta).toBeUndefined();
    });

    it('should call next function with request', async () => {
      const mockNext = vi.fn().mockResolvedValue({ data: 'test' });
      const mockRequest = { method: 'tools/call', params: { name: 'test_tool' } };
      const middleware = createIdentityMiddleware();

      await middleware(mockRequest, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockRequest);
    });

    it('should handle async errors from next', async () => {
      const mockNext = vi.fn().mockRejectedValue(new Error('Async error'));
      const mockRequest = { method: 'tools/call', params: {} };
      const middleware = createIdentityMiddleware();

      await expect(middleware(mockRequest, mockNext)).rejects.toThrow('Async error');
    });
  });
});
