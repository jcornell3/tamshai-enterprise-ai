/**
 * Agent Identity Middleware - Sprint 4 RED Phase Stub
 *
 * Wraps all MCP responses with source attribution metadata.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

export interface SourceDocument {
  date?: string;
  title?: string;
  filePath?: string;
  [key: string]: unknown;
}

export interface JourneyMeta {
  source: string;
  type: string;
  disclaimer: string;
  documentDates: string[];
  generatedAt: string;
}

export interface JourneyResponse<T = unknown> {
  data: T;
  _meta: JourneyMeta;
}

export interface McpRequest {
  method: string;
  params: Record<string, unknown>;
}

export type NextFunction = (request: McpRequest) => Promise<unknown>;

export type IdentityMiddleware = (
  request: McpRequest,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wrap data with journey identity metadata.
 */
export function wrapWithIdentity<T>(
  data: T,
  sourceDocs: SourceDocument[]
): JourneyResponse<T> {
  throw new Error('Not implemented');
}

/**
 * Create middleware that wraps responses with identity.
 */
export function createIdentityMiddleware(): IdentityMiddleware {
  throw new Error('Not implemented');
}
