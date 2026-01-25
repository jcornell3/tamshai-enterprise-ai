/**
 * Get Context Tool - Sprint 2 GREEN Phase
 *
 * Get historical context and timeline for a topic.
 * Shows how a topic evolved over the project's history.
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

export interface TimelineEntry {
  title: string;
  filePath: string;
  date?: string;
  summary?: string;
}

export interface ContextData {
  timeline: TimelineEntry[];
  relatedTopics: string[];
  summary: string;
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: ContextData;
  metadata?: Record<string, unknown>;
  code?: string;
  suggestedAction?: string;
}

export interface GetContextInput {
  topic: string;
  date_range?: string;
}

// Date range pattern: YYYY-MM-DD:YYYY-MM-DD
const DATE_RANGE_PATTERN = /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/;

/**
 * Extract keywords from documents for related topics.
 */
function extractRelatedTopics(docs: IndexedDocument[], searchTopic: string): string[] {
  const topicCounts = new Map<string, number>();
  const normalizedSearchTopic = searchTopic.toLowerCase();

  for (const doc of docs) {
    const keywords = doc.metadata?.keywords as string[] | undefined;
    if (keywords && Array.isArray(keywords)) {
      for (const keyword of keywords) {
        const normalizedKeyword = keyword.toLowerCase();
        // Skip the search topic itself
        if (normalizedKeyword !== normalizedSearchTopic) {
          topicCounts.set(normalizedKeyword, (topicCounts.get(normalizedKeyword) || 0) + 1);
        }
      }
    }
  }

  // Sort by frequency and return top topics
  return Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic]) => topic);
}

/**
 * Generate a summary of topic evolution.
 */
function generateSummary(docs: IndexedDocument[], topic: string): string {
  if (docs.length === 0) {
    return `No documentation found for topic "${topic}".`;
  }

  const sortedDocs = [...docs].sort((a, b) => {
    const dateA = a.metadata?.date || a.metadata?.datePublished || '';
    const dateB = b.metadata?.date || b.metadata?.datePublished || '';
    return String(dateA).localeCompare(String(dateB));
  });

  const firstDoc = sortedDocs[0];
  const lastDoc = sortedDocs[sortedDocs.length - 1];
  const firstDate = firstDoc?.metadata?.date || firstDoc?.metadata?.datePublished || 'unknown date';
  const lastDate = lastDoc?.metadata?.date || lastDoc?.metadata?.datePublished || 'unknown date';

  return `Found ${docs.length} document(s) about "${topic}" spanning from ${firstDate} to ${lastDate}.`;
}

/**
 * MCP Tool for getting historical context about a topic.
 */
export class GetContextTool {
  public readonly name = 'get_context';
  public readonly description = 'Get historical context and timeline for a topic in the project journey';

  public readonly inputSchema: ToolInputSchema = {
    type: 'object',
    required: ['topic'],
    properties: {
      topic: {
        type: 'string',
        description: 'The topic to get context for'
      },
      date_range: {
        type: 'string',
        description: 'Optional date range filter in format YYYY-MM-DD:YYYY-MM-DD'
      }
    }
  };

  constructor(private readonly index: KnowledgeIndex) {}

  async execute(input: GetContextInput): Promise<ToolResult> {
    // Validate input
    if (!input.topic || input.topic.trim() === '') {
      return {
        status: 'error',
        code: 'INVALID_INPUT',
        suggestedAction: 'Provide a non-empty topic parameter.'
      };
    }

    // Validate date range format if provided
    if (input.date_range && !DATE_RANGE_PATTERN.test(input.date_range)) {
      return {
        status: 'error',
        code: 'INVALID_DATE_RANGE',
        suggestedAction: 'Date range must be in format YYYY-MM-DD:YYYY-MM-DD (e.g., "2025-12-01:2026-01-15").'
      };
    }

    const topic = input.topic.trim();

    try {
      // Parse date range if provided
      let searchOptions: Record<string, unknown> = {};
      if (input.date_range) {
        const [dateFrom, dateTo] = input.date_range.split(':');
        searchOptions = { dateFrom, dateTo };
      }

      // Search for documents about the topic
      // Use searchByTopic if available, otherwise fall back to searchFullText
      let docs: IndexedDocument[];
      const indexWithTopic = this.index as unknown as { searchByTopic?: (topic: string, options?: Record<string, unknown>) => IndexedDocument[] };
      if (typeof indexWithTopic.searchByTopic === 'function') {
        docs = indexWithTopic.searchByTopic(topic, searchOptions);
      } else {
        docs = this.index.searchFullText(topic);
      }

      // Sort documents by date chronologically
      const sortedDocs = [...docs].sort((a, b) => {
        const dateA = a.metadata?.date || a.metadata?.datePublished || (a as unknown as Record<string, unknown>).date || '';
        const dateB = b.metadata?.date || b.metadata?.datePublished || (b as unknown as Record<string, unknown>).date || '';
        return String(dateA).localeCompare(String(dateB));
      });

      // Build timeline
      const timeline: TimelineEntry[] = sortedDocs.map((doc) => ({
        title: doc.title,
        filePath: doc.filePath,
        date: (doc.metadata?.date || doc.metadata?.datePublished || (doc as unknown as Record<string, unknown>).date || undefined) as string | undefined,
        summary: doc.plainText?.substring(0, 150) || undefined
      }));

      // Extract related topics
      const relatedTopics = extractRelatedTopics(sortedDocs, topic);

      // Generate summary
      const summary = generateSummary(sortedDocs, topic);

      // Build response metadata
      const responseMetadata: Record<string, unknown> = {
        documentCount: docs.length,
        topic
      };

      if (docs.length === 0) {
        responseMetadata.message = `No documentation found for topic "${topic}". Try a different term.`;
      }

      return {
        status: 'success',
        data: {
          timeline,
          relatedTopics,
          summary
        },
        metadata: responseMetadata
      };
    } catch (error) {
      return {
        status: 'error',
        code: 'INDEX_ERROR',
        suggestedAction: `Failed to get context: ${(error as Error).message}`
      };
    }
  }
}
