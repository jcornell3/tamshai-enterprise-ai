/**
 * Agent Identity Middleware - Sprint 4 GREEN Phase
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
 * Standard disclaimer for all journey responses.
 */
const DISCLAIMER =
  'This response contains historical project documentation that may no longer reflect ' +
  'the current state of the codebase. Always verify with current source code.';

/**
 * Wrap data with journey identity metadata.
 */
export function wrapWithIdentity<T>(
  data: T,
  sourceDocs: SourceDocument[]
): JourneyResponse<T> {
  // Extract dates from source documents, filter out those without dates
  const dates = sourceDocs
    .filter((doc) => doc.date !== undefined && doc.date !== null)
    .map((doc) => doc.date as string)
    .sort((a, b) => a.localeCompare(b));

  return {
    data,
    _meta: {
      source: 'tamshai-project-journey',
      type: 'historical-documentation',
      disclaimer: DISCLAIMER,
      documentDates: dates,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Check if a response is an error response.
 */
function isErrorResponse(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) {
    return false;
  }
  const obj = response as Record<string, unknown>;
  return obj.status === 'error';
}

/**
 * Create middleware that wraps responses with identity.
 */
export function createIdentityMiddleware(): IdentityMiddleware {
  return async (request: McpRequest, next: NextFunction): Promise<unknown> => {
    // Call the next function with the request
    const response = await next(request);

    // Don't wrap error responses
    if (isErrorResponse(response)) {
      return response;
    }

    // Wrap successful responses with identity metadata
    // Extract source documents from the response if available
    const sourceDocs: SourceDocument[] = [];
    if (
      typeof response === 'object' &&
      response !== null &&
      'sourceDocs' in response
    ) {
      const docs = (response as Record<string, unknown>).sourceDocs;
      if (Array.isArray(docs)) {
        sourceDocs.push(...docs);
      }
    }

    return wrapWithIdentity(response, sourceDocs);
  };
}
