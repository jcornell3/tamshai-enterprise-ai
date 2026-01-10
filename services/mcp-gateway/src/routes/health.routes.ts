/**
 * Health Check Routes
 *
 * Provides system health status including token revocation cache health.
 */

import { Router, Request, Response } from 'express';
import { getTokenRevocationStats } from '../utils/redis';

const router = Router();

/**
 * GET /health
 * Basic health check endpoint (no authentication required)
 */
router.get('/health', (req: Request, res: Response) => {
  const tokenRevocationStats = getTokenRevocationStats();
  // Phase 1: Always return 200 even if Redis is unavailable (TOKEN_REVOCATION_FAIL_OPEN=true)

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    components: {
      tokenRevocationCache: {
        status: tokenRevocationStats.isHealthy ? 'healthy' : 'degraded',
        cacheSize: tokenRevocationStats.cacheSize,
        lastSyncMs: Date.now() - tokenRevocationStats.lastSyncTime,
        consecutiveFailures: tokenRevocationStats.consecutiveFailures,
      },
    },
  });
});

/**
 * GET /api/health
 * Detailed health check endpoint with component status
 */
router.get('/api/health', (req: Request, res: Response) => {
  const tokenRevocationStats = getTokenRevocationStats();
  const isHealthy = tokenRevocationStats.isHealthy;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
    node: process.version,
    env: process.env.NODE_ENV || 'development',
    components: {
      tokenRevocationCache: {
        status: tokenRevocationStats.isHealthy ? 'healthy' : 'degraded',
        cacheSize: tokenRevocationStats.cacheSize,
        lastSyncMs: Date.now() - tokenRevocationStats.lastSyncTime,
        consecutiveFailures: tokenRevocationStats.consecutiveFailures,
      },
    },
  });
});

export default router;
