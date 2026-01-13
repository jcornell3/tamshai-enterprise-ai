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
const MONGODB_URL = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27018';

// Extract database name from URL if present, otherwise use env var or default
function extractDatabaseFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const DATABASE_NAME = process.env.MONGODB_DB || extractDatabaseFromUrl(MONGODB_URL) || 'tamshai_support';
const MONGODB_URI = MONGODB_URL;

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB
 */
async function connect(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE_NAME);
    logger.info('Connected to MongoDB', { database: DATABASE_NAME });
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
