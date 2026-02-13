/**
 * JSON-LD Extractor - Sprint 1 GREEN Phase
 *
 * Extracts JSON-LD metadata from markdown content.
 * JSON-LD is embedded in <script type="application/ld+json"> tags
 * and follows schema.org vocabulary.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

export interface SchemaOrgMetadata {
  '@context'?: string;
  '@type'?: string;
  name?: string;
  datePublished?: string;
  dateModified?: string;
  keywords?: string[];
  learningResourceType?: string;
  headline?: string;
  description?: string;
  isPartOf?: {
    '@type'?: string;
    name?: string;
  };
  about?: Array<{
    '@type'?: string;
    name?: string;
  }>;
  author?: {
    '@type'?: string;
    name?: string;
  };
  [key: string]: unknown;
}

export interface ExtractOptions {
  validateContext?: boolean;
}

// Valid schema.org contexts
const VALID_CONTEXTS = [
  'https://schema.org',
  'http://schema.org',
  'https://schema.org/',
  'http://schema.org/',
];

/**
 * Extracts JSON-LD metadata from markdown content.
 */
export class JsonLdExtractor {
  /**
   * Extract the first JSON-LD block from content.
   */
  static extract(content: string, options?: ExtractOptions): SchemaOrgMetadata | null {
    const blocks = JsonLdExtractor.findJsonLdBlocks(content);

    if (blocks.length === 0) {
      return null;
    }

    const firstBlock = blocks[0];
    if (!firstBlock) {
      return null;
    }

    const parsed = JsonLdExtractor.parseJsonLd(firstBlock);

    if (parsed === null) {
      return null;
    }

    // Validate context if requested
    if (options?.validateContext) {
      const context = parsed['@context'];
      if (typeof context === 'string' && !VALID_CONTEXTS.includes(context)) {
        throw new Error('Invalid JSON-LD context');
      }
    }

    return parsed;
  }

  /**
   * Extract all JSON-LD blocks from content.
   */
  static extractAll(content: string): SchemaOrgMetadata[] {
    const blocks = JsonLdExtractor.findJsonLdBlocks(content);
    const results: SchemaOrgMetadata[] = [];

    for (const block of blocks) {
      const parsed = JsonLdExtractor.parseJsonLd(block);
      if (parsed !== null) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Find all JSON-LD script tag contents in the content.
   */
  private static findJsonLdBlocks(content: string): string[] {
    const blocks: string[] = [];

    // Match <script type="application/ld+json">...</script>
    // lgtm[js/polynomial-redos] - bounded pattern on trusted local files
    const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1] !== undefined) {
        const jsonContent = match[1].trim();
        if (jsonContent) {
          blocks.push(jsonContent);
        }
      }
    }

    return blocks;
  }

  /**
   * Parse a JSON-LD string into a SchemaOrgMetadata object.
   */
  private static parseJsonLd(jsonString: string): SchemaOrgMetadata | null {
    // Handle empty or whitespace-only content
    if (!jsonString || jsonString.trim() === '') {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonString);

      // Ensure it's an object
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.warn('Failed to parse JSON-LD: expected object');
        return null;
      }

      return parsed as SchemaOrgMetadata;
    } catch (err) {
      console.warn(`Failed to parse JSON-LD: ${(err as Error).message}`);
      return null;
    }
  }
}
