/**
 * JSON-LD Extractor Unit Tests - Sprint 1 RED Phase
 *
 * These tests define the expected behavior for the JsonLdExtractor component.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JsonLdExtractor, type SchemaOrgMetadata } from '@/indexer/json-ld-extractor';

describe('JsonLdExtractor', () => {
  describe('extract', () => {
    it('should extract JSON-LD from script tag', () => {
      const content = `# ADR-001
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "name": "Test ADR",
  "datePublished": "2026-01-15"
}
</script>
Content here`;

      const result = JsonLdExtractor.extract(content);

      expect(result).not.toBeNull();
      expect(result?.['@type']).toBe('TechArticle');
      expect(result?.name).toBe('Test ADR');
      expect(result?.datePublished).toBe('2026-01-15');
    });

    it('should handle HTML comments around JSON-LD', () => {
      const content = `<!--
JSON-LD metadata
-->
<script type="application/ld+json">
{ "@type": "HowTo", "name": "Guide" }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.['@type']).toBe('HowTo');
    });

    it('should return null when no JSON-LD present', () => {
      const content = '# Regular markdown\nNo JSON-LD here';

      const result = JsonLdExtractor.extract(content);

      expect(result).toBeNull();
    });

    it('should extract nested objects (isPartOf, about)', () => {
      const content = `<script type="application/ld+json">
{
  "@type": "TechArticle",
  "isPartOf": {
    "@type": "CreativeWork",
    "name": "Tamshai Project Journey"
  },
  "about": [
    { "@type": "SoftwareApplication", "name": "Keycloak" }
  ]
}
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.isPartOf?.name).toBe('Tamshai Project Journey');
      expect(result?.about).toHaveLength(1);
      expect(result?.about?.[0]?.name).toBe('Keycloak');
    });

    it('should validate schema.org context', () => {
      const content = `<script type="application/ld+json">
{ "@context": "https://invalid.org", "@type": "Article" }
</script>`;

      expect(() => JsonLdExtractor.extract(content, { validateContext: true }))
        .toThrow('Invalid JSON-LD context');
    });

    it('should extract keywords as array', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", "keywords": ["keycloak", "oauth", "debugging"] }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.keywords).toEqual(['keycloak', 'oauth', 'debugging']);
    });

    it('should handle learningResourceType for failure classification', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", "learningResourceType": "failure-analysis" }
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.learningResourceType).toBe('failure-analysis');
    });

    it('should extract author information', () => {
      const content = `<script type="application/ld+json">
{
  "@type": "TechArticle",
  "author": {
    "@type": "Organization",
    "name": "Tamshai Corp"
  }
}
</script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result?.author?.['@type']).toBe('Organization');
      expect(result?.author?.name).toBe('Tamshai Corp');
    });
  });

  describe('extractAll', () => {
    it('should extract multiple JSON-LD blocks from one document', () => {
      const content = `
<script type="application/ld+json">
{ "@type": "TechArticle", "name": "Main" }
</script>
<script type="application/ld+json">
{ "@type": "Person", "name": "Author" }
</script>`;

      const results = JsonLdExtractor.extractAll(content);

      expect(results).toHaveLength(2);
      expect(results[0]?.['@type']).toBe('TechArticle');
      expect(results[1]?.['@type']).toBe('Person');
    });

    it('should return empty array when no JSON-LD present', () => {
      const content = '# Just markdown content';

      const results = JsonLdExtractor.extractAll(content);

      expect(results).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON gracefully', () => {
      const content = `<script type="application/ld+json">
{ "@type": "TechArticle", name: invalid }
</script>`;

      const result = JsonLdExtractor.extract(content);

      // Should return null, not throw
      expect(result).toBeNull();
    });

    it('should log warning for malformed JSON-LD', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const content = `<script type="application/ld+json">{ broken }</script>`;

      JsonLdExtractor.extract(content);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON-LD')
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty script tags', () => {
      const content = `<script type="application/ld+json"></script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result).toBeNull();
    });

    it('should handle whitespace-only script tags', () => {
      const content = `<script type="application/ld+json">   \n\t  </script>`;

      const result = JsonLdExtractor.extract(content);

      expect(result).toBeNull();
    });
  });
});
