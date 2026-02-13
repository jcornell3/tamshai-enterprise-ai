/**
 * Directive Parser Tests - RED Phase
 *
 * These tests define the expected behavior for the display directive parser.
 * The parser should handle directives in the format:
 * display:<domain>:<component>:<params>
 *
 * TDD Phase: RED - Tests written first, implementation pending
 */

import { parseDirective, ParsedDirective } from '../directive-parser';

describe('DirectiveParser', () => {
  describe('Valid Directives', () => {
    it('parses hr:org_chart directive with multiple params', () => {
      const result = parseDirective('display:hr:org_chart:userId=me,depth=1');
      expect(result).toEqual({
        domain: 'hr',
        component: 'org_chart',
        params: { userId: 'me', depth: '1' },
      });
    });

    it('parses sales:customer directive with single param', () => {
      const result = parseDirective('display:sales:customer:customerId=abc123');
      expect(result).toEqual({
        domain: 'sales',
        component: 'customer',
        params: { customerId: 'abc123' },
      });
    });

    it('parses approvals:pending directive', () => {
      const result = parseDirective('display:approvals:pending:userId=me');
      expect(result).toEqual({
        domain: 'approvals',
        component: 'pending',
        params: { userId: 'me' },
      });
    });

    it('parses finance:budget directive with year param', () => {
      const result = parseDirective('display:finance:budget:department=engineering,year=2026');
      expect(result).toEqual({
        domain: 'finance',
        component: 'budget',
        params: { department: 'engineering', year: '2026' },
      });
    });

    it('parses sales:leads directive with status filter', () => {
      const result = parseDirective('display:sales:leads:status=hot,limit=50');
      expect(result).toEqual({
        domain: 'sales',
        component: 'leads',
        params: { status: 'hot', limit: '50' },
      });
    });

    it('handles empty params string', () => {
      const result = parseDirective('display:finance:summary:');
      expect(result).toEqual({
        domain: 'finance',
        component: 'summary',
        params: {},
      });
    });

    it('trims whitespace from param keys and values', () => {
      const result = parseDirective('display:hr:org_chart:userId = me , depth = 2');
      expect(result?.params).toEqual({ userId: 'me', depth: '2' });
    });

    it('handles single param without comma', () => {
      const result = parseDirective('display:hr:employee:id=12345');
      expect(result).toEqual({
        domain: 'hr',
        component: 'employee',
        params: { id: '12345' },
      });
    });
  });

  describe('Invalid Directives', () => {
    it('returns null for missing display prefix', () => {
      expect(parseDirective('hr:org_chart:userId=me')).toBeNull();
    });

    it('returns null for wrong prefix', () => {
      expect(parseDirective('render:hr:org_chart:userId=me')).toBeNull();
    });

    it('returns null for malformed format (missing component)', () => {
      expect(parseDirective('display:hr')).toBeNull();
    });

    it('returns null for malformed format (missing params section)', () => {
      expect(parseDirective('display:hr:org_chart')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDirective('')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(parseDirective(null as unknown as string)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseDirective(undefined as unknown as string)).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('handles email addresses in param values', () => {
      const result = parseDirective('display:sales:customer:email=test@example.com');
      expect(result?.params.email).toBe('test@example.com');
    });

    it('handles URLs in param values', () => {
      const result = parseDirective('display:hr:document:url=https://example.com/doc');
      expect(result?.params.url).toBe('https://example.com/doc');
    });

    it('handles multiple equals signs in value (takes first as delimiter)', () => {
      const result = parseDirective('display:hr:search:query=name=John');
      expect(result?.params.query).toBe('name=John');
    });

    it('handles numeric values as strings', () => {
      const result = parseDirective('display:finance:report:amount=1000.50');
      expect(result?.params.amount).toBe('1000.50');
      expect(typeof result?.params.amount).toBe('string');
    });

    it('handles UUIDs in param values', () => {
      const result = parseDirective('display:hr:employee:id=550e8400-e29b-41d4-a716-446655440000');
      expect(result?.params.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('ignores params without equals sign', () => {
      const result = parseDirective('display:hr:list:invalidparam,valid=true');
      expect(result?.params).toEqual({ valid: 'true' });
    });

    it('handles empty value after equals', () => {
      const result = parseDirective('display:hr:search:query=');
      expect(result?.params.query).toBe('');
    });
  });

  describe('ParsedDirective Type', () => {
    it('returns object with domain, component, and params properties', () => {
      const result = parseDirective('display:hr:org_chart:userId=me');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('component');
      expect(result).toHaveProperty('params');
    });

    it('params is always an object even when empty', () => {
      const result = parseDirective('display:hr:list:');
      expect(result?.params).toEqual({});
      expect(typeof result?.params).toBe('object');
    });
  });
});
