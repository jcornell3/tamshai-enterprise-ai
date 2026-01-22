/**
 * Lessons Resource - Sprint 3 GREEN Phase
 *
 * Access all lessons learned from the project journey.
 *
 * URI: journey://lessons
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import type { KnowledgeIndex } from '../indexer/index-builder.js';

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  metadata: Record<string, unknown>;
}

export interface ReadResult {
  contents: ResourceContent[];
  metadata?: Record<string, unknown>;
}

/**
 * MCP Resource for accessing lessons learned.
 */
export class LessonsResource {
  public readonly name = 'lessons';
  public readonly description = 'Access all lessons learned from the project journey';
  public readonly uriTemplate = 'journey://lessons';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(): Promise<ReadResult> {
    // Get documents by type (lessons-learned and best-practice)
    const documents = this.index.getDocumentsByType([
      'lessons-learned',
      'best-practice',
    ]);

    // Build response contents with categorization
    const contents: ResourceContent[] = documents.map((doc) => {
      // Extract categories from keywords metadata
      const keywords = (doc.metadata?.keywords as string[]) || [];
      const categories = this.categorizeByKeywords(keywords);

      return {
        uri: 'journey://lessons',
        mimeType: 'text/markdown',
        text: doc.content,
        metadata: {
          title: doc.title,
          filePath: doc.filePath,
          categories,
          ...doc.metadata,
        },
      };
    });

    return {
      contents,
      metadata: {
        totalLessons: contents.length,
      },
    };
  }

  /**
   * Categorize keywords into broader topic categories
   */
  private categorizeByKeywords(keywords: string[]): string[] {
    const categoryMap: Record<string, string[]> = {
      authentication: ['auth', 'oauth', 'sso', 'keycloak', 'login', 'token', 'jwt'],
      security: ['security', 'encryption', 'vulnerability', 'attack', 'defense'],
      infrastructure: ['docker', 'terraform', 'kubernetes', 'cloud', 'deployment', 'ci', 'cd'],
      database: ['postgres', 'mongodb', 'sql', 'database', 'query', 'migration'],
      frontend: ['react', 'flutter', 'ui', 'ux', 'component', 'css', 'styling'],
      backend: ['api', 'rest', 'graphql', 'server', 'node', 'express'],
      testing: ['test', 'jest', 'playwright', 'e2e', 'unit', 'integration'],
      architecture: ['architecture', 'design', 'pattern', 'microservice', 'monolith'],
    };

    const categories = new Set<string>();

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      for (const [category, terms] of Object.entries(categoryMap)) {
        if (terms.some((term) => keywordLower.includes(term))) {
          categories.add(category);
        }
      }
    }

    // If no categories matched, add 'general'
    if (categories.size === 0 && keywords.length > 0) {
      categories.add('general');
    }

    return Array.from(categories);
  }
}
