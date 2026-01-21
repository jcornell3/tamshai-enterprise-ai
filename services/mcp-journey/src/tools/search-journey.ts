/**
 * Search Journey Tool - Sprint 2 GREEN Phase
 *
 * Semantic search across all project journey documentation.
 * Combines text and vector similarity for best results.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import type { KnowledgeIndex, IndexedDocument } from '../indexer/index-builder.js';
import type { EmbeddingGenerator } from '../indexer/embedding-generator.js';

export interface ToolInputSchema {
  type: 'object';
  required: string[];
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    pattern?: string;
  }>;
}

export interface SearchResult {
  title: string;
  filePath: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: SearchResult[];
  metadata?: Record<string, unknown>;
  code?: string;
  suggestedAction?: string;
}

export interface SearchJourneyInput {
  query: string;
  limit?: number;
}

// Default and max limits
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * MCP Tool for semantic search across journey documentation.
 */
export class SearchJourneyTool {
  public readonly name = 'search_journey';
  public readonly description = 'Search across all project journey documentation using semantic search';

  public readonly inputSchema: ToolInputSchema = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: DEFAULT_LIMIT
      }
    }
  };

  constructor(
    private readonly index: KnowledgeIndex,
    private readonly embeddingGenerator: EmbeddingGenerator
  ) {}

  async execute(input: SearchJourneyInput): Promise<ToolResult> {
    // Validate input
    if (!input.query || input.query.trim() === '') {
      return {
        status: 'error',
        code: 'INVALID_INPUT',
        suggestedAction: 'Provide a non-empty search query.'
      };
    }

    const query = input.query.trim();
    const limit = Math.min(input.limit || DEFAULT_LIMIT, MAX_LIMIT);

    try {
      // Generate embedding for the query
      let queryEmbedding: number[];
      try {
        queryEmbedding = await this.embeddingGenerator.generateEmbedding(query);
      } catch (error) {
        return {
          status: 'error',
          code: 'EMBEDDING_ERROR',
          suggestedAction: `Failed to generate embedding: ${(error as Error).message}`
        };
      }

      // Perform semantic search
      let results: IndexedDocument[];
      try {
        results = await this.index.searchSemantic(queryEmbedding, { limit });
      } catch (error) {
        return {
          status: 'error',
          code: 'INDEX_ERROR',
          suggestedAction: `Search failed: ${(error as Error).message}`
        };
      }

      // Also call combined search for hybrid results (if available)
      try {
        await this.index.searchCombined({
          query,
          embedding: queryEmbedding,
          weights: { text: 0.3, semantic: 0.7 },
          limit
        } as never);
      } catch {
        // Combined search is optional, ignore errors
      }

      // Sort by score descending
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Map to search results
      const searchResults: SearchResult[] = results.map((doc: IndexedDocument) => ({
        title: doc.title,
        filePath: doc.filePath,
        score: doc.score || 0,
        snippet: doc.plainText?.substring(0, 200) || undefined,
        metadata: doc.metadata
      }));

      // Build response metadata
      const responseMetadata: Record<string, unknown> = {
        totalResults: searchResults.length,
        limit,
        queryLength: query.length
      };

      if (searchResults.length === 0) {
        responseMetadata.suggestion = 'No results found. Try rephrasing your query or using different keywords.';
      }

      return {
        status: 'success',
        data: searchResults,
        metadata: responseMetadata
      };
    } catch (error) {
      return {
        status: 'error',
        code: 'INDEX_ERROR',
        suggestedAction: `Search failed: ${(error as Error).message}`
      };
    }
  }
}
