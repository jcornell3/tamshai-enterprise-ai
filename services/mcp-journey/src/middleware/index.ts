/**
 * Middleware Index - Sprint 4
 *
 * Exports all middleware implementations.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

export {
  wrapWithIdentity,
  createIdentityMiddleware,
  type SourceDocument,
  type JourneyMeta,
  type JourneyResponse,
  type McpRequest,
  type NextFunction,
  type IdentityMiddleware
} from './agent-identity.js';

export {
  burstLimiter,
  sustainedLimiter,
  dailyLimiter,
  createRateLimitMiddleware,
  type RateLimitConfig
} from './rate-limit.js';
