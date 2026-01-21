/**
 * List Pivots Tool - Sprint 2 GREEN Phase
 *
 * List all documented technology pivots in the project.
 * Shows technology changes, reasons, and documentation links.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import type { KnowledgeIndex } from '../indexer/index-builder.js';

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

export interface Pivot {
  from: string;
  to: string;
  date?: string;
  reason?: string;
  component?: string;
  documentPath?: string;
}

export interface PivotsData {
  pivots: Pivot[];
  byComponent: Record<string, Pivot[]>;
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: PivotsData;
  metadata?: Record<string, unknown>;
  code?: string;
  suggestedAction?: string;
}

export interface ListPivotsInput {
  component?: string;
}

// Valid component name pattern (alphanumeric, hyphens, underscores)
const COMPONENT_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Group pivots by component.
 */
function groupByComponent(pivots: Pivot[]): Record<string, Pivot[]> {
  const grouped: Record<string, Pivot[]> = {};

  for (const pivot of pivots) {
    const component = pivot.component || 'unknown';
    if (!grouped[component]) {
      grouped[component] = [];
    }
    grouped[component].push(pivot);
  }

  return grouped;
}

/**
 * Sort pivots by date chronologically.
 */
function sortByDate(pivots: Pivot[]): Pivot[] {
  return [...pivots].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    return dateA.localeCompare(dateB);
  });
}

/**
 * Extract unique components from pivots.
 */
function extractComponents(pivots: Pivot[]): string[] {
  const components = new Set<string>();
  for (const pivot of pivots) {
    if (pivot.component) {
      components.add(pivot.component);
    }
  }
  return Array.from(components).sort();
}

/**
 * MCP Tool for listing technology pivots.
 */
export class ListPivotsTool {
  public readonly name = 'list_pivots';
  public readonly description = 'List all documented technology pivots and migrations in the project';

  public readonly inputSchema: ToolInputSchema = {
    type: 'object',
    required: [],
    properties: {
      component: {
        type: 'string',
        description: 'Optional component to filter pivots by'
      }
    }
  };

  constructor(private readonly index: KnowledgeIndex) {}

  async execute(input: ListPivotsInput): Promise<ToolResult> {
    // Validate component parameter if provided
    if (input.component && !COMPONENT_PATTERN.test(input.component)) {
      return {
        status: 'error',
        code: 'INVALID_INPUT',
        suggestedAction: 'Component name must contain only alphanumeric characters, hyphens, and underscores.'
      };
    }

    try {
      // Build search options
      const searchOptions: Record<string, unknown> = {};
      if (input.component) {
        searchOptions.component = input.component;
      }

      // Get pivots from index
      // Use getPivots if available on the index
      let pivots: Pivot[];
      const indexWithPivots = this.index as unknown as { getPivots?: (options?: Record<string, unknown>) => Pivot[] };
      if (typeof indexWithPivots.getPivots === 'function') {
        pivots = indexWithPivots.getPivots(searchOptions);
      } else {
        // Fallback: return empty array if method not available
        pivots = [];
      }

      // Sort pivots by date
      const sortedPivots = sortByDate(pivots);

      // Group by component
      const byComponent = groupByComponent(sortedPivots);

      // Extract component list
      const components = extractComponents(sortedPivots);

      return {
        status: 'success',
        data: {
          pivots: sortedPivots,
          byComponent
        },
        metadata: {
          totalPivots: sortedPivots.length,
          components
        }
      };
    } catch (error) {
      return {
        status: 'error',
        code: 'INDEX_ERROR',
        suggestedAction: `Failed to list pivots: ${(error as Error).message}`
      };
    }
  }
}
