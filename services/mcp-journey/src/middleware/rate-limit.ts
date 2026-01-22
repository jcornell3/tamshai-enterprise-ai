/**
 * Rate Limit Middleware - Sprint 4 GREEN Phase
 *
 * Rate limits from PROJECT_JOURNEY_AGENT.md:
 * - Burst: 10 requests per 10 seconds
 * - Sustained: 60 requests per minute
 * - Daily: 1000 requests per day
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import rateLimit from 'express-rate-limit';
import type { RequestHandler, Request, Response } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Create a custom rate limit middleware.
 */
export function createRateLimitMiddleware(config: RateLimitConfig): RequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: true, // Enable the `X-RateLimit-*` headers
    message: (_req: Request, res: Response) => {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      res.status(429);
      return {
        error: config.message || 'Too many requests, please try again later.',
        retryAfter,
      };
    },
    keyGenerator: (req: Request) => {
      // Use X-Forwarded-For header if available, otherwise use IP
      return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        'unknown';
    },
  });
}

/**
 * Burst limiter: 10 requests per 10 seconds
 */
export const burstLimiter: RequestHandler = createRateLimitMiddleware({
  windowMs: 10 * 1000, // 10 seconds
  max: 10,
  message: 'Too many requests. Burst limit: 10 requests per 10 seconds.',
});

/**
 * Sustained limiter: 60 requests per minute
 */
export const sustainedLimiter: RequestHandler = createRateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: 'Too many requests. Sustained limit: 60 requests per minute.',
});

/**
 * Daily limiter: 1000 requests per day
 */
export const dailyLimiter: RequestHandler = createRateLimitMiddleware({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1000,
  message: 'Too many requests. Daily limit: 1000 requests per day.',
});
