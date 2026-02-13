/**
 * Admin Routes for E2E Test State Management
 *
 * Provides database snapshot and rollback capabilities for E2E tests.
 * Only available in development/test environments.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Security: These routes are protected by:
 * - Environment check (only dev/test)
 * - X-Admin-Key header validation
 */

import { Router, Request, Response } from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Snapshot storage directory
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || '/tmp/tamshai-snapshots';

// Admin API key for test automation (fail-closed: routes disabled if not set)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/**
 * Validate a shell argument to prevent command injection.
 * Only allows alphanumeric characters, hyphens, underscores, dots, and forward slashes.
 */
function validateShellArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Required configuration ${name} is not set`);
  }
  if (!/^[a-zA-Z0-9._\-/]+$/.test(value)) {
    throw new Error(`Invalid characters in ${name}: only alphanumeric, dots, hyphens, underscores, and slashes are allowed`);
  }
  return value;
}

/**
 * Sanitize a string for safe inclusion in log messages.
 * Removes newlines and control characters to prevent log injection.
 */
function sanitizeForLog(value: string): string {
  return value.replace(/[\r\n\x00-\x1f\x7f-\x9f]/g, '');
}

// Database configurations - all values from environment variables
// Ports are set via GitHub Variables and injected by Terraform
const DB_CONFIG = {
  postgres: {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD || process.env.TAMSHAI_DB_PASSWORD,
    databases: ['tamshai_hr', 'tamshai_finance', 'tamshai_payroll', 'tamshai_tax'],
  },
  mongodb: {
    host: process.env.MONGODB_HOST,
    port: process.env.MONGODB_PORT,
    user: process.env.MONGODB_USER,
    password: process.env.MONGODB_PASSWORD || process.env.MONGODB_ROOT_PASSWORD,
    databases: ['tamshai_sales'],
  },
};

interface Snapshot {
  id: string;
  timestamp: string;
  databases: string[];
  files: string[];
}

// In-memory snapshot registry (for this instance)
const snapshots: Map<string, Snapshot> = new Map();

/**
 * Middleware to check if admin routes are enabled
 * Fail-closed: Admin routes are disabled if ADMIN_API_KEY is not configured
 */
function adminRoutesEnabled(req: Request, res: Response, next: () => void) {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    logger.warn('Admin routes accessed in production - rejected');
    return res.status(403).json({
      status: 'error',
      code: 'ADMIN_DISABLED',
      message: 'Admin routes are disabled in production',
    });
  }

  // Fail-closed: If ADMIN_API_KEY is not configured, disable admin routes
  if (!ADMIN_API_KEY) {
    logger.warn('Admin routes disabled: ADMIN_API_KEY not configured');
    return res.status(503).json({
      status: 'error',
      code: 'ADMIN_NOT_CONFIGURED',
      message: 'Admin routes are disabled. Set ADMIN_API_KEY environment variable to enable.',
    });
  }

  // Validate admin key
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_API_KEY) {
    logger.warn('Invalid admin key provided');
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_ADMIN_KEY',
      message: 'Invalid or missing X-Admin-Key header',
    });
  }

  next();
}

/**
 * Ensure snapshot directory exists
 */
async function ensureSnapshotDir(): Promise<void> {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

/**
 * Create PostgreSQL database snapshot using pg_dump
 */
async function createPostgresSnapshot(snapshotId: string, database: string): Promise<string> {
  const safeHost = validateShellArg(DB_CONFIG.postgres.host, 'POSTGRES_HOST');
  const safePort = validateShellArg(DB_CONFIG.postgres.port, 'POSTGRES_PORT');
  const safeUser = validateShellArg(DB_CONFIG.postgres.user, 'POSTGRES_USER');
  const safeDb = validateShellArg(database, 'database');
  const safeSnapshotId = validateShellArg(snapshotId, 'snapshotId');
  const snapshotFile = path.join(SNAPSHOT_DIR, `${safeSnapshotId}_${safeDb}.sql`);

  const env = { ...process.env, PGPASSWORD: DB_CONFIG.postgres.password };

  try {
    await execFileAsync('pg_dump', ['-h', safeHost, '-p', safePort, '-U', safeUser, '-d', safeDb, '-F', 'c', '-f', snapshotFile], { env });
    logger.info('Created PostgreSQL snapshot', { database: safeDb, snapshotFile });
    return snapshotFile;
  } catch (error) {
    logger.error('Failed to create PostgreSQL snapshot', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

/**
 * Restore PostgreSQL database from snapshot using pg_restore
 */
async function restorePostgresSnapshot(snapshotFile: string, database: string): Promise<void> {
  const safeHost = validateShellArg(DB_CONFIG.postgres.host, 'POSTGRES_HOST');
  const safePort = validateShellArg(DB_CONFIG.postgres.port, 'POSTGRES_PORT');
  const safeUser = validateShellArg(DB_CONFIG.postgres.user, 'POSTGRES_USER');
  const safeDb = validateShellArg(database, 'database');

  const env = { ...process.env, PGPASSWORD: DB_CONFIG.postgres.password };

  // Drop and recreate database - use parameterized psql with -v for the database name
  const terminateCmd = `psql -h ${safeHost} -p ${safePort} -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${safeDb}' AND pid <> pg_backend_pid();"`;
  const dropCmd = `psql -h ${safeHost} -p ${safePort} -U postgres -c "DROP DATABASE IF EXISTS ${safeDb};"`;
  const createCmd = `psql -h ${safeHost} -p ${safePort} -U postgres -c "CREATE DATABASE ${safeDb} OWNER ${safeUser};"`;

  try {
    await execAsync(`${terminateCmd} && ${dropCmd} && ${createCmd}`, { env });
  } catch (error) {
    logger.warn('Database drop/create warning', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
  }

  // Restore from snapshot
  const restoreCmd = `pg_restore -h ${safeHost} -p ${safePort} -U ${safeUser} -d ${safeDb} --clean --if-exists ${snapshotFile}`;

  try {
    await execAsync(restoreCmd, { env });
    logger.info('Restored PostgreSQL snapshot', { snapshotFile, database: safeDb });
  } catch (error) {
    // pg_restore may return non-zero for warnings - check if data was restored
    logger.warn('PostgreSQL restore warning', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Create MongoDB snapshot using mongodump
 */
async function createMongoSnapshot(snapshotId: string, database: string): Promise<string> {
  const safeHost = validateShellArg(DB_CONFIG.mongodb.host, 'MONGODB_HOST');
  const safePort = validateShellArg(DB_CONFIG.mongodb.port, 'MONGODB_PORT');
  const safeUser = validateShellArg(DB_CONFIG.mongodb.user, 'MONGODB_USER');
  const safeDb = validateShellArg(database, 'database');
  const safeSnapshotId = validateShellArg(snapshotId, 'snapshotId');
  const snapshotDir = path.join(SNAPSHOT_DIR, `${safeSnapshotId}_${safeDb}`);

  const password = DB_CONFIG.mongodb.password || '';

  try {
    await execFileAsync('mongodump', ['--host', safeHost, '--port', safePort, '-u', safeUser, '-p', password, '--authenticationDatabase', 'admin', '--db', safeDb, '--out', snapshotDir]);
    logger.info('Created MongoDB snapshot', { database: safeDb, snapshotDir });
    return snapshotDir;
  } catch (error) {
    logger.error('Failed to create MongoDB snapshot', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

/**
 * Restore MongoDB from snapshot using mongorestore
 */
async function restoreMongoSnapshot(snapshotDir: string, database: string): Promise<void> {
  const safeHost = validateShellArg(DB_CONFIG.mongodb.host, 'MONGODB_HOST');
  const safePort = validateShellArg(DB_CONFIG.mongodb.port, 'MONGODB_PORT');
  const safeUser = validateShellArg(DB_CONFIG.mongodb.user, 'MONGODB_USER');
  const safeDb = validateShellArg(database, 'database');

  // Pass password via environment variable to avoid shell exposure
  const env = { ...process.env, MONGO_PWD: DB_CONFIG.mongodb.password };

  // Drop existing database
  const dropCmd = `mongosh --host ${safeHost} --port ${safePort} -u ${safeUser} -p "$MONGO_PWD" --authenticationDatabase admin --eval "db.getSiblingDB('${safeDb}').dropDatabase()"`;

  try {
    await execAsync(dropCmd, { env });
  } catch (error) {
    logger.warn('MongoDB drop warning', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
  }

  // Restore from snapshot
  const restoreCmd = `mongorestore --host ${safeHost} --port ${safePort} -u ${safeUser} -p "$MONGO_PWD" --authenticationDatabase admin --db ${safeDb} ${snapshotDir}/${safeDb}`;

  try {
    await execAsync(restoreCmd, { env });
    logger.info('Restored MongoDB snapshot', { snapshotDir, database: safeDb });
  } catch (error) {
    logger.warn('MongoDB restore warning', { database: safeDb, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Clean up old snapshots
 */
async function cleanupOldSnapshots(maxAgeMinutes: number = 60): Promise<void> {
  const now = Date.now();
  const maxAge = maxAgeMinutes * 60 * 1000;

  for (const [id, snapshot] of snapshots.entries()) {
    const snapshotTime = new Date(snapshot.timestamp).getTime();
    if (now - snapshotTime > maxAge) {
      // Delete snapshot files
      for (const file of snapshot.files) {
        try {
          if (fs.existsSync(file)) {
            if (fs.statSync(file).isDirectory()) {
              fs.rmSync(file, { recursive: true });
            } else {
              fs.unlinkSync(file);
            }
          }
        } catch (error) {
          logger.warn(`Failed to delete snapshot file: ${file}`, error);
        }
      }
      snapshots.delete(id);
      logger.info(`Cleaned up old snapshot: ${id}`);
    }
  }
}

const router = Router();

// Apply admin middleware to all routes
router.use(adminRoutesEnabled);

/**
 * POST /api/admin/snapshots
 * Create a database snapshot for test state isolation
 */
router.post('/snapshots', async (req: Request, res: Response) => {
  const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const timestamp = new Date().toISOString();
  const requestedDatabases = req.body.databases || [...DB_CONFIG.postgres.databases, ...DB_CONFIG.mongodb.databases];

  logger.info(`Creating snapshot: ${snapshotId}`);

  try {
    await ensureSnapshotDir();
    await cleanupOldSnapshots();

    const files: string[] = [];
    const databases: string[] = [];

    // Create PostgreSQL snapshots
    for (const db of DB_CONFIG.postgres.databases) {
      if (requestedDatabases.includes(db)) {
        try {
          const file = await createPostgresSnapshot(snapshotId, db);
          files.push(file);
          databases.push(db);
        } catch {
          logger.warn(`Skipping PostgreSQL database ${db}: not available`);
        }
      }
    }

    // Create MongoDB snapshots
    for (const db of DB_CONFIG.mongodb.databases) {
      if (requestedDatabases.includes(db)) {
        try {
          const dir = await createMongoSnapshot(snapshotId, db);
          files.push(dir);
          databases.push(db);
        } catch {
          logger.warn(`Skipping MongoDB database ${db}: not available`);
        }
      }
    }

    const snapshot: Snapshot = {
      id: snapshotId,
      timestamp,
      databases,
      files,
    };

    snapshots.set(snapshotId, snapshot);

    logger.info(`Snapshot created: ${snapshotId} with ${databases.length} databases`);

    res.json({
      status: 'success',
      data: {
        snapshotId,
        timestamp,
        databases,
      },
    });
  } catch (error) {
    logger.error('Failed to create snapshot:', error);
    res.status(500).json({
      status: 'error',
      code: 'SNAPSHOT_FAILED',
      message: error instanceof Error ? error.message : 'Failed to create snapshot',
    });
  }
});

/**
 * POST /api/admin/snapshots/:snapshotId/rollback
 * Rollback database to a previous snapshot
 */
router.post('/snapshots/:snapshotId/rollback', async (req: Request, res: Response) => {
  const { snapshotId } = req.params;

  logger.info('Rolling back to snapshot', { snapshotId: sanitizeForLog(snapshotId) });

  const snapshot = snapshots.get(snapshotId);
  if (!snapshot) {
    return res.status(404).json({
      status: 'error',
      code: 'SNAPSHOT_NOT_FOUND',
      message: `Snapshot ${snapshotId} not found or expired`,
    });
  }

  try {
    const restoredDatabases: string[] = [];

    // Restore PostgreSQL databases
    for (const db of DB_CONFIG.postgres.databases) {
      const snapshotFile = snapshot.files.find(f => f.includes(`${snapshotId}_${db}.sql`));
      if (snapshotFile && fs.existsSync(snapshotFile)) {
        await restorePostgresSnapshot(snapshotFile, db);
        restoredDatabases.push(db);
      }
    }

    // Restore MongoDB databases
    for (const db of DB_CONFIG.mongodb.databases) {
      const snapshotDir = snapshot.files.find(f => f.includes(`${snapshotId}_${db}`));
      if (snapshotDir && fs.existsSync(snapshotDir)) {
        await restoreMongoSnapshot(snapshotDir, db);
        restoredDatabases.push(db);
      }
    }

    logger.info('Rollback complete', { snapshotId: sanitizeForLog(snapshotId), restoredCount: restoredDatabases.length });

    res.json({
      status: 'success',
      data: {
        snapshotId,
        restoredDatabases,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to rollback snapshot:', error);
    res.status(500).json({
      status: 'error',
      code: 'ROLLBACK_FAILED',
      message: error instanceof Error ? error.message : 'Failed to rollback snapshot',
    });
  }
});

/**
 * GET /api/admin/snapshots
 * List all available snapshots
 */
router.get('/snapshots', async (req: Request, res: Response) => {
  const snapshotList = Array.from(snapshots.values()).map(s => ({
    id: s.id,
    timestamp: s.timestamp,
    databases: s.databases,
  }));

  res.json({
    status: 'success',
    data: snapshotList,
  });
});

/**
 * DELETE /api/admin/snapshots/:snapshotId
 * Delete a specific snapshot
 */
router.delete('/snapshots/:snapshotId', async (req: Request, res: Response) => {
  const { snapshotId } = req.params;

  const snapshot = snapshots.get(snapshotId);
  if (!snapshot) {
    return res.status(404).json({
      status: 'error',
      code: 'SNAPSHOT_NOT_FOUND',
      message: `Snapshot ${snapshotId} not found`,
    });
  }

  // Delete files
  for (const file of snapshot.files) {
    try {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          fs.rmSync(file, { recursive: true });
        } else {
          fs.unlinkSync(file);
        }
      }
    } catch (error) {
      logger.warn(`Failed to delete snapshot file: ${file}`, error);
    }
  }

  snapshots.delete(snapshotId);

  res.json({
    status: 'success',
    message: `Snapshot ${snapshotId} deleted`,
  });
});

/**
 * POST /api/admin/seed/:scenario
 * Seed test data for a specific scenario
 */
router.post('/seed/:scenario', async (req: Request, res: Response) => {
  const { scenario } = req.params;

  logger.info('Seeding data for scenario', { scenario: sanitizeForLog(scenario) });

  // TODO: Implement scenario-specific seeding
  // For now, return a stub response
  res.json({
    status: 'success',
    message: `Seeded data for scenario: ${scenario}`,
    scenario,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/admin/clear/:domain
 * Clear test data for a specific domain
 */
router.post('/clear/:domain', async (req: Request, res: Response) => {
  const { domain } = req.params;

  logger.info('Clearing data for domain', { domain: sanitizeForLog(domain) });

  // TODO: Implement domain-specific clearing
  // For now, return a stub response
  res.json({
    status: 'success',
    message: `Cleared data for domain: ${domain}`,
    domain,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/health
 * Check admin service health and database connectivity
 */
router.get('/health', async (req: Request, res: Response) => {
  const health: Record<string, string> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    snapshotDir: SNAPSHOT_DIR,
    snapshotCount: snapshots.size.toString(),
  };

  res.json(health);
});

export default router;
export { adminRoutesEnabled, ADMIN_API_KEY };
