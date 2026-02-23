/**
 * Database utilities for Tamshai MCP services.
 */
export {
  createPostgresClient,
  type PostgresClient,
  type PostgresLogger,
} from './postgres';

export {
  getMongoSSLConfig,
  withMongoSSL,
  isMongoSSLEnabled,
  logMongoSSLStatus,
  type MongoSSLConfig,
} from './mongodb';
