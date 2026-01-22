/**
 * Evolution Resource - Sprint 3 RED Phase Stub
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

/**
 * MCP Resource for accessing component evolution history.
 */
export class EvolutionResource {
  public readonly name = 'evolution';
  public readonly description = 'Access component evolution history and technology changes';
  public readonly uriTemplate = 'journey://evolution/{component}';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(params: EvolutionReadParams): Promise<ReadResult> {
    throw new Error('Not implemented');
  }

  async list(): Promise<ListResult> {
    throw new Error('Not implemented');
  }
}
