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
 * Build Elasticsearch URL with properly URL-encoded credentials
 *
 * If ELASTICSEARCH_URL contains credentials with special characters that break
 * URL parsing (like @, {, }, ?, etc.), this function rebuilds the URL with
 * properly encoded credentials.
 *
 * Alternatively, supports separate env vars: ES_HOST, ES_USER, ES_PASSWORD
 */
function buildElasticsearchUrl(): string {
  // Check for separate credential env vars first (preferred approach)
  const esHost = process.env.ES_HOST;
  const esUser = process.env.ES_USER || 'elastic';
  const esPassword = process.env.ES_PASSWORD || process.env.ELASTIC_PASSWORD;

  if (esHost && esPassword) {
    const encodedPassword = encodeURIComponent(esPassword);
    return `http://${esUser}:${encodedPassword}@${esHost}`;
  }

  // Fall back to ELASTICSEARCH_URL but try to fix encoding issues
  const esUrl = process.env.ELASTICSEARCH_URL;
  if (!esUrl) {
    return 'http://localhost:9201';
  }

  // If URL doesn't contain auth, return as-is
  if (!esUrl.includes('@')) {
    return esUrl;
  }

  // Parse and rebuild URL with properly encoded credentials
  // Format: http://user:password@host:port
  const match = esUrl.match(/^(https?:\/\/)([^:]+):(.+)@(.+)$/);
  if (match) {
    const [, protocol, user, password, hostPort] = match;
    const encodedPassword = encodeURIComponent(password);
    return `${protocol}${user}:${encodedPassword}@${hostPort}`;
  }

  // If parsing fails, return original URL (might work or fail with better error)
  return esUrl;
}

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
      const esUrl = buildElasticsearchUrl();
      return new ElasticsearchBackend(esUrl);

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
