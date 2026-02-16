import { Router, Request, Response } from 'express';

export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

export function createHealthRoutes(serviceName: string, checks: HealthCheck[]): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const results = await Promise.allSettled(
      checks.map(async (c) => ({ name: c.name, healthy: await c.check() }))
    );

    const checkResults: Record<string, boolean> = {};
    let allHealthy = true;
    results.forEach((r, i) => {
      const healthy = r.status === 'fulfilled' && r.value.healthy;
      checkResults[checks[i].name] = healthy;
      if (!healthy) allHealthy = false;
    });

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      service: serviceName,
      checks: checkResults,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
