/**
 * Phoenix Resource - Sprint 3 GREEN Phase
 *
 * Access Phoenix rebuild logs by version.
 *
 * URI: journey://phoenix/{version}
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

export interface PhoenixReadParams {
  version: string;
}

/**
 * MCP Resource for accessing Phoenix rebuild logs.
 */
export class PhoenixResource {
  public readonly name = 'phoenix';
  public readonly description = 'Access Phoenix rebuild logs by version';
  public readonly uriTemplate = 'journey://phoenix/{version}';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(params: PhoenixReadParams): Promise<ReadResult> {
    const { version } = params;

    // Validate version
    if (!version || version.trim() === '') {
      throw new Error('Version is required');
    }

    // Check for version range (e.g., v9..v11)
    if (version.includes('..')) {
      return this.readVersionRange(version);
    }

    // Normalize version (add 'v' prefix if missing)
    const normalizedVersion = this.normalizeVersion(version);

    // Build expected path
    const expectedPath = `docs/operations/PHOENIX_MANUAL_ACTIONS${normalizedVersion}.md`;

    // Get document by path
    const doc = this.index.getDocumentByPath(expectedPath);

    if (!doc) {
      throw new Error('Phoenix version not found');
    }

    return {
      contents: [
        {
          uri: `journey://phoenix/${normalizedVersion}`,
          mimeType: 'text/markdown',
          text: doc.content,
          metadata: {
            title: doc.title,
            filePath: doc.filePath,
            manualActions: doc.metadata?.manualActions ?? 0,
            automatedSteps: doc.metadata?.automatedSteps ?? 0,
            ...doc.metadata,
          },
        },
      ],
    };
  }

  async list(): Promise<ListResult> {
    // Get all documents and filter for Phoenix logs
    const allDocs = this.index.listDocuments();

    const phoenixDocs = allDocs.filter((doc) =>
      doc.filePath.includes('PHOENIX_MANUAL_ACTIONS')
    );

    // Extract versions and sort numerically
    const resources: ResourceListItem[] = phoenixDocs
      .map((doc) => {
        const match = doc.filePath.match(/PHOENIX_MANUAL_ACTIONSv(\d+)/);
        const versionNum = match && match[1] ? parseInt(match[1], 10) : 0;
        const version = match && match[1] ? `v${match[1]}` : doc.title;

        return {
          uri: `journey://phoenix/${version}`,
          name: doc.title,
          description: `Phoenix rebuild log ${version}`,
          _versionNum: versionNum, // For sorting
        };
      })
      .sort((a, b) => a._versionNum - b._versionNum)
      .map(({ _versionNum, ...rest }) => rest); // Remove sorting helper

    return { resources };
  }

  /**
   * Handle version range queries (e.g., v9..v11)
   */
  private async readVersionRange(versionRange: string): Promise<ReadResult> {
    // Validate range format (exactly two dots)
    const parts = versionRange.split('..');

    if (parts.length !== 2 || parts.some((p) => p.includes('.'))) {
      throw new Error('Invalid version range');
    }

    const startVersion = parts[0]!;
    const endVersion = parts[1]!;

    const normalizedStart = this.normalizeVersion(startVersion);
    const normalizedEnd = this.normalizeVersion(endVersion);

    // Get both documents
    const startPath = `docs/operations/PHOENIX_MANUAL_ACTIONS${normalizedStart}.md`;
    const endPath = `docs/operations/PHOENIX_MANUAL_ACTIONS${normalizedEnd}.md`;

    const startDoc = this.index.getDocumentByPath(startPath);
    const endDoc = this.index.getDocumentByPath(endPath);

    if (!startDoc || !endDoc) {
      throw new Error('Phoenix version not found');
    }

    // Build comparison content
    const comparisonContent = this.buildComparisonContent(
      normalizedStart,
      startDoc,
      normalizedEnd,
      endDoc
    );

    return {
      contents: [
        {
          uri: `journey://phoenix/${versionRange}`,
          mimeType: 'text/markdown',
          text: comparisonContent,
          metadata: {
            comparison: {
              from: normalizedStart,
              to: normalizedEnd,
              startManualActions: startDoc.metadata?.manualActions ?? 0,
              endManualActions: endDoc.metadata?.manualActions ?? 0,
            },
          },
        },
      ],
    };
  }

  /**
   * Normalize version string (ensure 'v' prefix)
   */
  private normalizeVersion(version: string): string {
    const trimmed = version.trim();
    if (trimmed.toLowerCase().startsWith('v')) {
      return `v${trimmed.slice(1)}`;
    }
    return `v${trimmed}`;
  }

  /**
   * Build markdown content for version comparison
   */
  private buildComparisonContent(
    startVersion: string,
    startDoc: { content: string; metadata?: Record<string, unknown> },
    endVersion: string,
    endDoc: { content: string; metadata?: Record<string, unknown> }
  ): string {
    const startManual = (startDoc.metadata?.manualActions as number) ?? 0;
    const endManual = (endDoc.metadata?.manualActions as number) ?? 0;
    const reduction = startManual - endManual;

    let content = `# Phoenix Version Comparison: ${startVersion} → ${endVersion}\n\n`;
    content += '## Summary\n\n';
    content += `- **${startVersion}**: ${startManual} manual actions\n`;
    content += `- **${endVersion}**: ${endManual} manual actions\n`;
    content += `- **Reduction**: ${reduction} manual actions eliminated\n`;

    return content;
  }
}
