/**
 * Phoenix Resource - Sprint 3 RED Phase Stub
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
    throw new Error('Not implemented');
  }

  async list(): Promise<ListResult> {
    throw new Error('Not implemented');
  }
}
