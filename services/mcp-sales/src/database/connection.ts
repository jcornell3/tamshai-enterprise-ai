/**
 * MongoDB Database Connection
 *
 * This module provides MongoDB connection with role-based filtering
 * for CRM data access.
 */

import { MongoClient, Db, Collection, Filter } from 'mongodb';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Support both MONGODB_URI and MONGODB_URL (CI uses MONGODB_URL) - required
const MONGODB_URL = process.env.MONGODB_URL || process.env.MONGODB_URI;

if (!MONGODB_URL) {
  throw new Error('MONGODB_URL or MONGODB_URI environment variable is required');
}

// Extract database name from URL if present, otherwise use env var or default
function extractDatabaseFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const DATABASE_NAME = process.env.MONGODB_DB || extractDatabaseFromUrl(MONGODB_URL) || 'tamshai_sales';
const MONGODB_URI = MONGODB_URL;

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * User context for role-based filtering
 */
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
}

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
 * - Sales-read/sales-write: All opportunities
 * - Executive: All opportunities
 * - Manager: Their team's opportunities (owner_id in team)
 * - User: Only their own opportunities (owner_id = userId)
 */
export function buildRoleFilter(userContext: UserContext): Filter<any> {
  const { userId, roles } = userContext;

  // Executives and sales roles can see all data
  if (
    roles.includes('executive') ||
    roles.includes('sales-read') ||
    roles.includes('sales-write')
  ) {
    return {};
  }

  // Managers can see their team's data (simplified - in production, would query team members)
  if (roles.includes('manager')) {
    return {
      $or: [
        { owner_id: userId },
        { created_by: userId },
      ],
    };
  }

  // Default: only own records
  return { owner_id: userId };
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
