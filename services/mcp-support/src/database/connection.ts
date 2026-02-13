/**
 * MongoDB Database Connection for MCP Support
 *
 * This module provides MongoDB connection with role-based filtering
 * for Support ticket data access. Mirrors the pattern from MCP Sales.
 */

import { MongoClient, Db, Collection, Filter } from 'mongodb';
import winston from 'winston';
import { UserContext } from './types';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Support both MONGODB_URI and MONGODB_URL (CI uses MONGODB_URL)
// NOTE: MongoDB is optional for MCP Support when using Elasticsearch backend.
// The connection will fail gracefully when MongoDB tools are called without config.
const MONGODB_URL = process.env.MONGODB_URL || process.env.MONGODB_URI;

// Extract database name from URL if present, otherwise use env var or default
function extractDatabaseFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB
 *
 * NOTE: This function is called lazily. MongoDB is optional for MCP Support
 * when using Elasticsearch backend. It will throw if called without MONGODB_URL.
 */
async function connect(): Promise<Db> {
  if (db) {
    return db;
  }

  // Validate MongoDB URL at connection time (lazy validation)
  if (!MONGODB_URL) {
    throw new Error(
      'MongoDB connection requested but MONGODB_URL/MONGODB_URI is not configured. ' +
      'This typically means MongoDB-dependent tools (SLA, agent metrics) are not available ' +
      'when using Elasticsearch-only mode.'
    );
  }

  const databaseName = process.env.MONGODB_DB || extractDatabaseFromUrl(MONGODB_URL) || 'tamshai_support';

  try {
    client = new MongoClient(MONGODB_URL);
    await client.connect();
    db = client.db(databaseName);
    logger.info('Connected to MongoDB', { database: databaseName });
    return db;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    throw error;
  }
}

/**
 * Get MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
  if (!db) {
    return await connect();
  }
  return db;
}

/**
 * Get a MongoDB collection
 */
export async function getCollection(collectionName: string): Promise<Collection> {
  const database = await getDatabase();
  return database.collection(collectionName);
}

/**
 * Build role-based filter for MongoDB queries
 *
 * Unlike PostgreSQL RLS, we manually add filters based on user roles:
 * - Support-read/support-write: All tickets
 * - Executive: All tickets
 * - Manager: Their team's tickets (assigned_to or created_by)
 * - User: Only their own tickets (created_by = username)
 */
export function buildRoleFilter(userContext: UserContext): Filter<any> {
  const { roles, username } = userContext;

  // Executives and support roles can see all data
  if (roles.includes('executive') || roles.includes('support-read') || roles.includes('support-write')) {
    return {};
  }

  // Managers can see their team's data (assigned to them or created by them)
  if (roles.includes('manager')) {
    return {
      $or: [{ assigned_to: username }, { created_by: username }],
    };
  }

  // Default: only own records
  return { created_by: username };
}

/**
 * Check MongoDB connection health
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return true;
  } catch (error) {
    logger.error('MongoDB health check failed', error);
    return false;
  }
}

/**
 * Close MongoDB connection (for graceful shutdown)
 */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}
