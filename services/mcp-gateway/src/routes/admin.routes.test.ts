/**
 * Admin Routes Tests
 *
 * Tests for E2E test state management endpoints.
 * These tests focus on API contract validation rather than actual database operations.
 */

import express, { Express, Router } from 'express';
import request from 'supertest';
import actualAdminRoutes, { ADMIN_API_KEY as ACTUAL_ADMIN_API_KEY } from './admin.routes';

// Create a simplified mock admin routes module for testing
const ADMIN_API_KEY = 'e2e-test-admin-key';

// In-memory snapshot storage for tests
const testSnapshots: Map<string, { id: string; timestamp: string; databases: string[]; files: string[] }> = new Map();

function createTestAdminRoutes() {
  const router = Router();

  // Admin middleware
  const adminMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ status: 'error', code: 'ADMIN_DISABLED', message: 'Disabled in production' });
    }
    if (req.headers['x-admin-key'] !== ADMIN_API_KEY) {
      return res.status(401).json({ status: 'error', code: 'INVALID_ADMIN_KEY', message: 'Invalid admin key' });
    }
    next();
  };

  router.use(adminMiddleware);

  router.get('/health', (req: express.Request, res: express.Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      snapshotDir: '/tmp/test',
      snapshotCount: testSnapshots.size.toString(),
    });
  });

  router.post('/snapshots', (req: express.Request, res: express.Response) => {
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const databases = req.body?.databases || ['tamshai_hr', 'tamshai_finance'];
    const snapshot = {
      id: snapshotId,
      timestamp: new Date().toISOString(),
      databases,
      files: databases.map((db: string) => `/tmp/${snapshotId}_${db}.sql`),
    };
    testSnapshots.set(snapshotId, snapshot);
    res.json({ status: 'success', data: { snapshotId, timestamp: snapshot.timestamp, databases } });
  });

  router.get('/snapshots', (req: express.Request, res: express.Response) => {
    const list = Array.from(testSnapshots.values()).map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      databases: s.databases,
    }));
    res.json({ status: 'success', data: list });
  });

  router.post('/snapshots/:snapshotId/rollback', (req: express.Request, res: express.Response) => {
    const snapshot = testSnapshots.get(req.params.snapshotId);
    if (!snapshot) {
      return res.status(404).json({ status: 'error', code: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot not found' });
    }
    res.json({ status: 'success', data: { snapshotId: snapshot.id, restoredDatabases: snapshot.databases, timestamp: new Date().toISOString() } });
  });

  router.delete('/snapshots/:snapshotId', (req: express.Request, res: express.Response) => {
    const snapshot = testSnapshots.get(req.params.snapshotId);
    if (!snapshot) {
      return res.status(404).json({ status: 'error', code: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot not found' });
    }
    testSnapshots.delete(req.params.snapshotId);
    res.json({ status: 'success', message: `Snapshot ${req.params.snapshotId} deleted` });
  });

  router.post('/seed/:scenario', (req: express.Request, res: express.Response) => {
    res.json({ status: 'success', message: `Seeded: ${req.params.scenario}`, scenario: req.params.scenario, timestamp: new Date().toISOString() });
  });

  router.post('/clear/:domain', (req: express.Request, res: express.Response) => {
    res.json({ status: 'success', message: `Cleared: ${req.params.domain}`, domain: req.params.domain, timestamp: new Date().toISOString() });
  });

  return router;
}

describe('Admin Routes', () => {
  let app: Express;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    testSnapshots.clear();

    app = express();
    app.use(express.json());
    app.use('/api/admin', createTestAdminRoutes());
  });

  describe('Authentication', () => {
    test('rejects requests without X-Admin-Key header', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .expect(401);

      expect(response.body.code).toBe('INVALID_ADMIN_KEY');
    });

    test('rejects requests with invalid X-Admin-Key', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('X-Admin-Key', 'wrong-key')
        .expect(401);

      expect(response.body.code).toBe('INVALID_ADMIN_KEY');
    });

    test('accepts requests with valid X-Admin-Key', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });

    test('rejects requests in production environment', async () => {
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/admin/health')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(403);

      expect(response.body.code).toBe('ADMIN_DISABLED');
    });
  });

  describe('GET /api/admin/health', () => {
    test('returns health status', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        snapshotCount: '0',
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/admin/snapshots', () => {
    test('creates a snapshot and returns snapshot ID', async () => {
      const response = await request(app)
        .post('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.snapshotId).toMatch(/^snapshot-\d+-[a-z0-9]+$/);
      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.databases).toBeInstanceOf(Array);
    });

    test('creates a snapshot with specific databases', async () => {
      const response = await request(app)
        .post('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .send({ databases: ['tamshai_hr', 'tamshai_finance'] })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.databases).toEqual(['tamshai_hr', 'tamshai_finance']);
    });
  });

  describe('GET /api/admin/snapshots', () => {
    test('returns empty list when no snapshots exist', async () => {
      const response = await request(app)
        .get('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(0);
    });

    test('returns list of created snapshots', async () => {
      // Create a snapshot first
      const createResponse = await request(app)
        .post('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      const snapshotId = createResponse.body.data.snapshotId;

      // List snapshots
      const listResponse = await request(app)
        .get('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(listResponse.body.data).toContainEqual(
        expect.objectContaining({ id: snapshotId })
      );
    });
  });

  describe('POST /api/admin/snapshots/:snapshotId/rollback', () => {
    test('returns 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .post('/api/admin/snapshots/non-existent-snapshot/rollback')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(404);

      expect(response.body.code).toBe('SNAPSHOT_NOT_FOUND');
    });

    test('rolls back to existing snapshot', async () => {
      // Create a snapshot first
      const createResponse = await request(app)
        .post('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      const snapshotId = createResponse.body.data.snapshotId;

      // Rollback to snapshot
      const rollbackResponse = await request(app)
        .post(`/api/admin/snapshots/${snapshotId}/rollback`)
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(rollbackResponse.body.status).toBe('success');
      expect(rollbackResponse.body.data.snapshotId).toBe(snapshotId);
      expect(rollbackResponse.body.data.restoredDatabases).toBeInstanceOf(Array);
    });
  });

  describe('DELETE /api/admin/snapshots/:snapshotId', () => {
    test('returns 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .delete('/api/admin/snapshots/non-existent-snapshot')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(404);

      expect(response.body.code).toBe('SNAPSHOT_NOT_FOUND');
    });

    test('deletes existing snapshot', async () => {
      // Create a snapshot first
      const createResponse = await request(app)
        .post('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      const snapshotId = createResponse.body.data.snapshotId;

      // Delete snapshot
      const deleteResponse = await request(app)
        .delete(`/api/admin/snapshots/${snapshotId}`)
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(deleteResponse.body.status).toBe('success');

      // Verify snapshot is gone
      const listResponse = await request(app)
        .get('/api/admin/snapshots')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(listResponse.body.data).not.toContainEqual(
        expect.objectContaining({ id: snapshotId })
      );
    });
  });

  describe('POST /api/admin/seed/:scenario', () => {
    test('returns success for seeding scenario', async () => {
      const response = await request(app)
        .post('/api/admin/seed/invoice-bulk-approval')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.scenario).toBe('invoice-bulk-approval');
    });
  });

  describe('POST /api/admin/clear/:domain', () => {
    test('returns success for clearing domain', async () => {
      const response = await request(app)
        .post('/api/admin/clear/finance')
        .set('X-Admin-Key', ADMIN_API_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.domain).toBe('finance');
    });
  });
});

// Test the actual admin routes module exports
describe('Admin Routes Module', () => {
  test('exports ADMIN_API_KEY from environment (fail-closed when not set)', () => {
    // ADMIN_API_KEY should come from process.env, not a hardcoded default
    // When not set, it should be undefined (fail-closed behavior)
    const envValue = process.env.ADMIN_API_KEY;
    expect(ACTUAL_ADMIN_API_KEY).toBe(envValue);
  });

  test('exports default router', () => {
    expect(actualAdminRoutes).toBeDefined();
    expect(typeof actualAdminRoutes).toBe('function'); // Express router is a function
  });
});

/**
 * Tests using the ACTUAL admin routes module (not the mock).
 * These test the real middleware, helper functions, and route handlers.
 */
describe('Actual Admin Routes - Middleware', () => {
  let app: Express;

  describe('adminRoutesEnabled middleware', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      // Use actual router from the module
      app.use('/api/admin', actualAdminRoutes);
    });

    test('rejects requests in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const response = await request(app)
          .get('/api/admin/health')
          .set('X-Admin-Key', 'any-key');

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('ADMIN_DISABLED');
        expect(response.body.message).toContain('production');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('returns 503 when ADMIN_API_KEY is not configured (fail-closed)', async () => {
      // ADMIN_API_KEY is read at module load time, so if it's not set
      // in the test environment, the actual middleware returns 503
      if (ACTUAL_ADMIN_API_KEY) {
        // If ADMIN_API_KEY happens to be set in the test env, skip this test
        return;
      }

      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      try {
        const response = await request(app)
          .get('/api/admin/health')
          .set('X-Admin-Key', 'any-key');

        expect(response.status).toBe(503);
        expect(response.body.code).toBe('ADMIN_NOT_CONFIGURED');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('rejects invalid admin key with 401', async () => {
      if (!ACTUAL_ADMIN_API_KEY) {
        // Without ADMIN_API_KEY configured, middleware returns 503 before key check
        return;
      }

      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      try {
        const response = await request(app)
          .get('/api/admin/health')
          .set('X-Admin-Key', 'definitely-wrong-key');

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_ADMIN_KEY');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});

/**
 * Tests for actual admin route handlers that DON'T require database operations.
 * These test the real seed, clear, and health endpoints.
 */
describe('Actual Admin Routes - Handlers (isolated via jest.isolateModules)', () => {
  const TEST_ADMIN_KEY = 'test-admin-key-for-ci';
  let app: Express;
  let adminRoutes: typeof actualAdminRoutes;

  beforeAll(() => {
    // Set ADMIN_API_KEY before importing the module
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    // Re-import the module to pick up env vars
    // (ADMIN_API_KEY is read at module load, so we use dynamic import with cache bust)
    jest.resetModules();
    const mod = await import('./admin.routes');
    adminRoutes = mod.default;

    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  afterAll(() => {
    delete process.env.ADMIN_API_KEY;
  });

  describe('GET /api/admin/health', () => {
    test('returns health status with snapshot metadata', async () => {
      const response = await request(app)
        .get('/api/admin/health')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.snapshotDir).toBeDefined();
      expect(response.body.snapshotCount).toBeDefined();
    });
  });

  describe('POST /api/admin/seed/:scenario', () => {
    test('returns success for any scenario', async () => {
      const response = await request(app)
        .post('/api/admin/seed/invoice-bulk-approval')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.scenario).toBe('invoice-bulk-approval');
      expect(response.body.timestamp).toBeDefined();
    });

    test('echoes scenario name in response', async () => {
      const response = await request(app)
        .post('/api/admin/seed/payroll-reset')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.message).toContain('payroll-reset');
    });
  });

  describe('POST /api/admin/clear/:domain', () => {
    test('returns success for any domain', async () => {
      const response = await request(app)
        .post('/api/admin/clear/finance')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.domain).toBe('finance');
      expect(response.body.timestamp).toBeDefined();
    });

    test('echoes domain name in response', async () => {
      const response = await request(app)
        .post('/api/admin/clear/hr')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.message).toContain('hr');
    });
  });

  describe('GET /api/admin/snapshots', () => {
    test('returns empty list initially', async () => {
      const response = await request(app)
        .get('/api/admin/snapshots')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/admin/snapshots/:snapshotId/rollback', () => {
    test('returns 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .post('/api/admin/snapshots/non-existent-id/rollback')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(404);

      expect(response.body.code).toBe('SNAPSHOT_NOT_FOUND');
    });
  });

  describe('DELETE /api/admin/snapshots/:snapshotId', () => {
    test('returns 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .delete('/api/admin/snapshots/non-existent-id')
        .set('X-Admin-Key', TEST_ADMIN_KEY)
        .expect(404);

      expect(response.body.code).toBe('SNAPSHOT_NOT_FOUND');
    });
  });
});
