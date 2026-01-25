/**
 * Failures Resource - Sprint 3 GREEN Phase
 *
 * Access failure documentation by topic.
 *
 * URI: journey://failures/{topic}
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

export interface FailuresReadParams {
  topic: string;
}

/**
 * MCP Resource for accessing failure documentation.
 */
export class FailuresResource {
  public readonly name = 'failures';
  public readonly description = 'Access failure documentation by topic';
  public readonly uriTemplate = 'journey://failures/{topic}';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(params: FailuresReadParams): Promise<ReadResult> {
    const { topic } = params;

    // Validate topic
    if (!topic || topic.trim() === '') {
      throw new Error('Topic is required');
    }

    // Search for failure-related documents
    const documents = this.index.getDocumentsByType([
      'failure-analysis',
      'debugging-log',
    ]);

    // Filter by topic (case-insensitive match in content or metadata)
    const filtered = documents.filter((doc) => {
      const topicLower = topic.toLowerCase();
      const contentMatch = doc.content?.toLowerCase().includes(topicLower);
      const titleMatch = doc.title?.toLowerCase().includes(topicLower);
      const keywordsMatch = (doc.metadata?.keywords as string[])?.some(
        (k) => k.toLowerCase().includes(topicLower)
      );
      return contentMatch || titleMatch || keywordsMatch;
    });

    // Build response contents
    const contents: ResourceContent[] = filtered.map((doc) => ({
      uri: `journey://failures/${topic}`,
      mimeType: 'text/markdown',
      text: doc.content,
      metadata: {
        title: doc.title,
        filePath: doc.filePath,
        ...doc.metadata,
      },
    }));

    return {
      contents,
      metadata: {
        failureCount: contents.length,
      },
    };
  }
}
