/**
 * Rate Limit Middleware Unit Tests - Sprint 4 RED Phase
 *
 * These tests define the expected behavior for the RateLimit middleware.
 * All tests should FAIL initially (RED phase of TDD).
 *
 * Rate limits from PROJECT_JOURNEY_AGENT.md:
 * - Burst: 10 requests per 10 seconds
 * - Sustained: 60 requests per minute
 * - Daily: 1000 requests per day
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  burstLimiter,
  sustainedLimiter,
  dailyLimiter,
  createRateLimitMiddleware,
  RateLimitConfig
} from '@/middleware/rate-limit';
import express, { Express, Request, Response } from 'express';
import request from 'supertest';

describe('RateLimit middleware', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('burstLimiter', () => {
    beforeEach(() => {
      app.use(burstLimiter);
      app.get('/test', (req: Request, res: Response) => res.json({ ok: true }));
    });

    it('should allow 10 requests within 10 seconds', async () => {
      vi.useRealTimers(); // Need real timers for supertest
      for (let i = 0; i < 10; i++) {
        const res = await request(app).get('/test');
        expect(res.status).toBe(200);
      }
    });

    it('should block 11th request within 10 seconds', async () => {
      vi.useRealTimers();
      for (let i = 0; i < 10; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should include rate limit headers', async () => {
      vi.useRealTimers();
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should return helpful error message', async () => {
      vi.useRealTimers();
      for (let i = 0; i < 11; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.body.error).toContain('Too many requests');
      expect(res.body.retryAfter).toBeDefined();
    });

    it('should reset after window expires', async () => {
      vi.useRealTimers();
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await request(app).get('/test');
      }

      // Wait for window to reset (10 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 11000));

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }, 15000);
  });

  describe('sustainedLimiter', () => {
    beforeEach(() => {
      app.use(sustainedLimiter);
      app.get('/test', (req: Request, res: Response) => res.json({ ok: true }));
    });

    it('should allow 60 requests per minute', async () => {
      vi.useRealTimers();
      const responses = [];
      for (let i = 0; i < 60; i++) {
        responses.push(await request(app).get('/test'));
      }

      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBe(60);
    });

    it('should block 61st request within a minute', async () => {
      vi.useRealTimers();
      for (let i = 0; i < 60; i++) {
        await request(app).get('/test');
      }

      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });
  });

  describe('dailyLimiter', () => {
    beforeEach(() => {
      app.use(dailyLimiter);
      app.get('/test', (req: Request, res: Response) => res.json({ ok: true }));
    });

    it('should track limits by IP address', async () => {
      vi.useRealTimers();
      const res = await request(app)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('1000');
    });

    it('should have 1000 requests per day limit', async () => {
      vi.useRealTimers();
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-limit']).toBe('1000');
    });
  });

  describe('createRateLimitMiddleware', () => {
    it('should create middleware with custom config', () => {
      const config: RateLimitConfig = {
        windowMs: 5000,
        max: 5,
        message: 'Custom rate limit message'
      };

      const middleware = createRateLimitMiddleware(config);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should apply custom limits', async () => {
      vi.useRealTimers();
      const customLimiter = createRateLimitMiddleware({
        windowMs: 1000,
        max: 2,
        message: 'Custom limit exceeded'
      });

      app.use(customLimiter);
      app.get('/test', (req: Request, res: Response) => res.json({ ok: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Custom limit exceeded');
    });
  });
});
