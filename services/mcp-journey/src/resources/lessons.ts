/**
 * Lessons Resource - Sprint 3 RED Phase Stub
 *
 * Access all lessons learned from the project journey.
 *
 * URI: journey://lessons
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

/**
 * MCP Resource for accessing lessons learned.
 */
export class LessonsResource {
  public readonly name = 'lessons';
  public readonly description = 'Access all lessons learned from the project journey';
  public readonly uriTemplate = 'journey://lessons';

  constructor(private readonly index: KnowledgeIndex) {}

  async read(): Promise<ReadResult> {
    throw new Error('Not implemented');
  }
}
