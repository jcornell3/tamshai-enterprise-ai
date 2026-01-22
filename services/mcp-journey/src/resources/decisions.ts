/**
 * Decisions Resource - Sprint 3 GREEN Phase
 *
 * Access Architecture Decision Records by ID.
 *
 * URI: journey://decisions/{adr-id}
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

export interface DecisionsReadParams {
  'adr-id': string;
}

/**
 * MCP Resource for accessing ADR documents.
 */
export class DecisionsResource {
  public readonly name = 'decisions';
  public readonly description = 'Access ADR (Architecture Decision Record) documents';
  public readonly uriTemplate = 'journey://decisions/{adr-id}';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(params: DecisionsReadParams): Promise<ReadResult> {
    const adrId = params['adr-id'];

    // Validate ADR ID
    if (!adrId || adrId.trim() === '') {
      throw new Error('ADR ID is required');
    }

    // Normalize ADR ID (001 -> ADR-001)
    const normalizedId = this.normalizeAdrId(adrId);

    // Build expected path pattern
    const expectedPath = `docs/adr/${normalizedId}.md`;

    // Get document by path
    const doc = this.index.getDocumentByPath(expectedPath);

    if (!doc) {
      throw new Error('ADR not found');
    }

    return {
      contents: [
        {
          uri: `journey://decisions/${normalizedId}`,
          mimeType: 'text/markdown',
          text: doc.content,
          metadata: {
            title: doc.title,
            filePath: doc.filePath,
            ...doc.metadata,
          },
        },
      ],
    };
  }

  async list(): Promise<ListResult> {
    // Get all documents and filter for ADRs
    const allDocs = this.index.listDocuments();

    const adrDocs = allDocs.filter((doc) =>
      doc.filePath.includes('docs/adr/ADR-')
    );

    const resources: ResourceListItem[] = adrDocs.map((doc) => {
      // Extract ADR ID from path (e.g., docs/adr/ADR-001.md -> ADR-001)
      const match = doc.filePath.match(/ADR-(\d+)/);
      const adrId = match ? `ADR-${match[1]}` : doc.title;

      return {
        uri: `journey://decisions/${adrId}`,
        name: doc.title,
        description: `Architecture Decision Record: ${doc.title}`,
      };
    });

    return { resources };
  }

  /**
   * Normalize ADR ID to standard format (ADR-XXX)
   */
  private normalizeAdrId(adrId: string): string {
    // If already in ADR-XXX format, return as is
    if (adrId.toUpperCase().startsWith('ADR-')) {
      return adrId.toUpperCase();
    }

    // If just a number, pad and prefix
    const numMatch = adrId.match(/^(\d+)$/);
    if (numMatch) {
      const num = numMatch[1].padStart(3, '0');
      return `ADR-${num}`;
    }

    // Return as-is if unknown format
    return adrId;
  }
}
