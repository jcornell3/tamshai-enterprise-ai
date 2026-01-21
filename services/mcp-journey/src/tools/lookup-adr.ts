/**
 * Lookup ADR Tool - Sprint 2 GREEN Phase
 *
 * Retrieve specific Architecture Decision Records by ID.
 * Returns full ADR content with JSON-LD metadata.
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

export interface AdrResult {
  title: string;
  filePath: string;
  content: string;
  metadata?: Record<string, unknown>;
  relatedDecisions?: string[];
}

export interface ToolResult {
  status: 'success' | 'error';
  data?: AdrResult;
  metadata?: Record<string, unknown>;
  code?: string;
  suggestedAction?: string;
  availableAdrs?: string[];
}

export interface LookupAdrInput {
  adr_id: string;
}

// ADR ID pattern: ADR-XXX (3 digits)
const ADR_ID_PATTERN = /^ADR-\d{3}$/;

/**
 * Extract ADR ID from various path formats.
 */
function extractAdrIdFromPath(filePath: string): string | null {
  const match = filePath.match(/ADR-(\d{3})/);
  return match ? `ADR-${match[1]}` : null;
}

/**
 * Extract related ADRs from content.
 */
function extractRelatedDecisions(content: string, metadata?: Record<string, unknown>): string[] {
  const related: Set<string> = new Set();

  // Check metadata first
  if (metadata?.relatedDecisions && Array.isArray(metadata.relatedDecisions)) {
    for (const adr of metadata.relatedDecisions) {
      if (typeof adr === 'string') {
        related.add(adr);
      }
    }
  }

  // Find ADR references in content
  const adrMatches = content.match(/ADR-\d{3}/g);
  if (adrMatches) {
    for (const adr of adrMatches) {
      related.add(adr);
    }
  }

  return Array.from(related);
}

/**
 * MCP Tool for retrieving ADR documents.
 */
export class LookupAdrTool {
  public readonly name = 'lookup_adr';
  public readonly description = 'Retrieve a specific ADR (Architecture Decision Record) by ID';

  public readonly inputSchema: ToolInputSchema = {
    type: 'object',
    required: ['adr_id'],
    properties: {
      adr_id: {
        type: 'string',
        description: 'The ADR ID in format ADR-XXX (e.g., ADR-001)',
        pattern: '^ADR-\\d{3}$'
      }
    }
  };

  constructor(private readonly index: KnowledgeIndex) {}

  async execute(input: LookupAdrInput): Promise<ToolResult> {
    // Validate input
    if (!input.adr_id || input.adr_id.trim() === '') {
      return {
        status: 'error',
        code: 'INVALID_ADR_ID',
        suggestedAction: 'Provide an ADR ID in the format ADR-XXX (e.g., ADR-001).'
      };
    }

    // Validate ADR ID format
    const adrId = input.adr_id.toUpperCase().trim();
    if (!ADR_ID_PATTERN.test(adrId)) {
      return {
        status: 'error',
        code: 'INVALID_ADR_ID',
        suggestedAction: `Invalid ADR ID format "${input.adr_id}". Use format ADR-XXX (e.g., ADR-001).`
      };
    }

    try {
      // Try multiple path patterns to find the ADR
      const pathPatterns = [
        `docs/adr/${adrId}.md`,
        `docs/adr/${adrId}`,
        `services/mcp-journey/docs/adr/${adrId}.md`
      ];

      let doc: IndexedDocument | null = null;

      // Try exact matches first
      for (const pattern of pathPatterns) {
        doc = this.index.getDocumentByPath(pattern);
        if (doc) break;
      }

      // If not found, try to find by partial match (ADR-XXX-title.md)
      if (!doc) {
        // Look for any document with the ADR ID in the path
        const allDocs = (this.index as unknown as { listDocuments?: () => IndexedDocument[] }).listDocuments?.() || [];
        for (const d of allDocs) {
          if (d.filePath?.includes(adrId)) {
            doc = this.index.getDocumentByPath(d.filePath);
            if (doc) break;
          }
        }
      }

      if (!doc) {
        // Get list of available ADRs
        const availableAdrs = this.getAvailableAdrs();
        return {
          status: 'error',
          code: 'ADR_NOT_FOUND',
          suggestedAction: `ADR ${adrId} not found. Use the list of valid ADRs to find the correct ID.`,
          availableAdrs
        };
      }

      // Extract related decisions
      const relatedDecisions = extractRelatedDecisions(doc.content, doc.metadata);
      // Remove self-reference
      const filteredRelated = relatedDecisions.filter(id => id !== adrId);

      return {
        status: 'success',
        data: {
          title: doc.title,
          filePath: doc.filePath,
          content: doc.content,
          metadata: doc.metadata,
          relatedDecisions: filteredRelated.length > 0 ? filteredRelated : undefined
        },
        metadata: {
          adrId,
          hasMetadata: !!doc.metadata
        }
      };
    } catch (error) {
      return {
        status: 'error',
        code: 'INDEX_ERROR',
        suggestedAction: `Failed to retrieve ADR: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get list of available ADR IDs.
   */
  private getAvailableAdrs(): string[] {
    try {
      const allDocs = (this.index as unknown as { listDocuments?: () => IndexedDocument[] }).listDocuments?.() || [];
      const adrIds: string[] = [];

      for (const doc of allDocs) {
        const adrId = extractAdrIdFromPath(doc.filePath);
        if (adrId && !adrIds.includes(adrId)) {
          adrIds.push(adrId);
        }
      }

      return adrIds.sort();
    } catch {
      return [];
    }
  }
}
