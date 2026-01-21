/**
 * Query Failures Tool - Sprint 2 GREEN Phase
 *
 * Search for documentation about what didn't work in the project.
 * Returns failure analyses, debugging logs, and lessons learned.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import type { KnowledgeIndex, IndexedDocument } from '../indexer/index-builder.js';

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

export interface FailureResult {
  title: string;
  filePath: string;
  summary?: string;
  relevanceScore: number;
  outcome?: string;
  rootCause?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: FailureResult[];
  metadata?: Record<string, unknown>;
  code?: string;
  suggestedAction?: string;
}

export interface QueryFailuresInput {
  topic: string;
  component?: string;
}

// Failure-related document types
const FAILURE_DOCUMENT_TYPES = [
  'failure-analysis',
  'debugging-log',
  'lessons-learned'
];

// Maximum results to return
const MAX_RESULTS = 10;

/**
 * Sanitize input to prevent injection attacks.
 */
function sanitizeInput(input: string): string {
  // Remove HTML tags and script content
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * MCP Tool for searching failure documentation.
 */
export class QueryFailuresTool {
  public readonly name = 'query_failures';
  public readonly description = 'Search for documentation about what did NOT work in the project';

  public readonly inputSchema: ToolInputSchema = {
    type: 'object',
    required: ['topic'],
    properties: {
      topic: {
        type: 'string',
        description: 'The topic to search for failures about (e.g., "keycloak", "oauth", "deployment")'
      },
      component: {
        type: 'string',
        description: 'Optional component to filter results (e.g., "mcp-gateway", "keycloak", "desktop-client")'
      }
    }
  };

  constructor(private readonly index: KnowledgeIndex) {}

  async execute(input: QueryFailuresInput): Promise<ToolResult> {
    // Validate input
    if (!input.topic || input.topic.trim() === '') {
      return {
        status: 'error',
        code: 'INVALID_INPUT',
        suggestedAction: 'Provide a non-empty topic parameter to search for failures.'
      };
    }

    // Sanitize input
    const sanitizedTopic = sanitizeInput(input.topic);
    const sanitizedComponent = input.component ? sanitizeInput(input.component) : undefined;

    try {
      // Search for failure documentation
      const searchOptions: Record<string, unknown> = {
        query: sanitizedTopic,
        documentTypes: FAILURE_DOCUMENT_TYPES,
        filters: {} as Record<string, unknown>
      };

      if (sanitizedComponent) {
        (searchOptions.filters as Record<string, unknown>).component = sanitizedComponent;
      }

      const results = await this.index.searchCombined(searchOptions as never);

      // Map results to failure format
      const failures: FailureResult[] = results
        .slice(0, MAX_RESULTS)
        .map((doc: IndexedDocument) => {
          const metadata = doc.metadata || {};
          return {
            title: doc.title,
            filePath: doc.filePath,
            summary: doc.plainText?.substring(0, 200) || undefined,
            relevanceScore: doc.score || 0,
            outcome: metadata.outcome as string | undefined,
            rootCause: metadata.rootCause as string | undefined,
            metadata: metadata
          };
        });

      // Build response metadata
      const responseMetadata: Record<string, unknown> = {
        totalResults: failures.length,
        documentTypes: FAILURE_DOCUMENT_TYPES
      };

      if (failures.length === 0) {
        responseMetadata.suggestedAction = 'No failures found. Try using broader terms or different keywords.';
      }

      return {
        status: 'success',
        data: failures,
        metadata: responseMetadata
      };
    } catch (error) {
      return {
        status: 'error',
        code: 'INDEX_ERROR',
        suggestedAction: `Failed to search index: ${(error as Error).message}. Try again or contact support.`
      };
    }
  }
}
