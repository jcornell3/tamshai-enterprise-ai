/**
 * Evolution Resource - Sprint 3 GREEN Phase
 *
 * Access component evolution history and technology changes.
 *
 * URI: journey://evolution/{component}
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

export interface ResourceListItem {
  uri: string;
  name: string;
  description?: string;
}

export interface ReadResult {
  contents: ResourceContent[];
  metadata?: Record<string, unknown>;
}

export interface ListResult {
  resources: ResourceListItem[];
}

export interface EvolutionReadParams {
  component: string;
}

export interface TimelineEntry {
  version: string;
  date: string;
  technology: string;
}

export interface PivotEntry {
  from: string;
  to: string;
  reason: string;
}

export interface EvolutionHistory {
  component: string;
  timeline: TimelineEntry[];
  pivots: PivotEntry[];
}

/**
 * MCP Resource for accessing component evolution history.
 */
export class EvolutionResource {
  public readonly name = 'evolution';
  public readonly description = 'Access component evolution history and technology changes';
  public readonly uriTemplate = 'journey://evolution/{component}';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(params: EvolutionReadParams): Promise<ReadResult> {
    const { component } = params;

    // Validate component name
    if (!component || component.trim() === '') {
      throw new Error('Component name is required');
    }

    // Get evolution history from index
    const history = this.index.getEvolutionHistory(component) as EvolutionHistory | null;

    if (!history) {
      throw new Error('Component not found');
    }

    // Sort timeline chronologically (oldest first by date)
    const sortedTimeline = [...history.timeline].sort((a, b) => {
      return a.date.localeCompare(b.date);
    });

    // Build markdown content
    const content = this.buildMarkdownContent(history.component, sortedTimeline, history.pivots);

    return {
      contents: [
        {
          uri: `journey://evolution/${component}`,
          mimeType: 'text/markdown',
          text: content,
          metadata: {
            component: history.component,
            pivotCount: history.pivots.length,
            timelineEntries: sortedTimeline.length,
          },
        },
      ],
    };
  }

  async list(): Promise<ListResult> {
    // Get all tracked components
    const components = this.index.listComponents() as string[];

    const resources: ResourceListItem[] = components.map((component) => ({
      uri: `journey://evolution/${component}`,
      name: component,
      description: `Evolution history for ${component}`,
    }));

    return { resources };
  }

  /**
   * Build markdown content for evolution history
   */
  private buildMarkdownContent(
    component: string,
    timeline: TimelineEntry[],
    pivots: PivotEntry[]
  ): string {
    let content = `# Evolution History: ${component}\n\n`;

    // Timeline section
    content += '## Timeline\n\n';
    for (const entry of timeline) {
      content += `- **${entry.date}** (${entry.version}): ${entry.technology}\n`;
    }

    // Pivots section
    if (pivots.length > 0) {
      content += '\n## Technology Pivots\n\n';
      for (const pivot of pivots) {
        content += `- **${pivot.from}** → **${pivot.to}**: ${pivot.reason}\n`;
      }
    }

    return content;
  }
}
