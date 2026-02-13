/**
 * Backend Factory for MCP Support
 *
 * Creates appropriate backend implementation based on SUPPORT_DATA_BACKEND env var:
 * - 'elasticsearch' (default): Dev/Stage with Elasticsearch
 * - 'mongodb': GCP Prod Phase 1 (Elasticsearch not deployed)
 */

import { ISupportBackend } from './types';
import { ElasticsearchBackend } from './elasticsearch.backend';
import { MongoDBBackend } from './mongodb.backend';

/**
 * Create Support backend based on environment configuration
 *
 * @returns ISupportBackend implementation (Elasticsearch or MongoDB)
 * @throws Error if SUPPORT_DATA_BACKEND is unknown
 */
export function createSupportBackend(): ISupportBackend {
  const backendType = process.env.SUPPORT_DATA_BACKEND || 'elasticsearch';

  switch (backendType.toLowerCase()) {
    case 'elasticsearch':
      const esUrl = process.env.ELASTICSEARCH_URL;
      return new ElasticsearchBackend(esUrl!);

    case 'mongodb':
      // MongoDB connection configured via MONGODB_URL/MONGODB_URI env vars
      // (handled by connection.ts module)
      return new MongoDBBackend();

    default:
      throw new Error(
        `Unknown SUPPORT_DATA_BACKEND: "${backendType}". Valid options: 'elasticsearch' or 'mongodb'.`
      );
  }
}
