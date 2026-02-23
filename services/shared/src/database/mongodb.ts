/**
 * MongoDB SSL/TLS Configuration (H3 Phase 2 - Zero-Trust Network)
 *
 * Provides utilities for configuring SSL/TLS connections to MongoDB.
 * Follows the same pattern as PostgreSQL SSL configuration.
 *
 * Environment Variables:
 *   MONGODB_SSL=true             - Enable SSL for MongoDB connections
 *   MONGODB_SSL_CA=/path/ca.crt  - CA certificate path (optional)
 *   MONGODB_SSL_REJECT_UNAUTHORIZED=true - Reject untrusted certificates (default: true in prod)
 *
 * Usage:
 *   import { getMongoSSLConfig, withMongoSSL } from '@tamshai/shared';
 *
 *   // Simple usage
 *   const client = new MongoClient(uri, withMongoSSL());
 *
 *   // Manual configuration
 *   const sslConfig = getMongoSSLConfig();
 *   if (sslConfig) {
 *     const client = new MongoClient(uri, { ...options, ...sslConfig });
 *   }
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * MongoDB SSL configuration options compatible with MongoClientOptions
 */
export interface MongoSSLConfig {
  /** Enable TLS/SSL connections */
  tls: boolean;
  /** CA certificate file path or content */
  tlsCAFile?: string;
  /** Allow invalid/self-signed certificates (insecure) */
  tlsInsecure?: boolean;
  /** Allow connections to servers with invalid hostnames */
  tlsAllowInvalidHostnames?: boolean;
}

/**
 * Check if MongoDB SSL is enabled
 */
export function isMongoSSLEnabled(): boolean {
  const sslMode = process.env.MONGODB_SSL?.toLowerCase();
  return sslMode === 'true' || sslMode === 'require' || sslMode === '1';
}

/**
 * Load certificate from file path or return content if already a PEM string
 */
function loadCertificate(pathOrContent: string | undefined): string | undefined {
  if (!pathOrContent) {
    return undefined;
  }

  // If it looks like a PEM certificate, return as-is
  if (pathOrContent.startsWith('-----BEGIN')) {
    return pathOrContent;
  }

  // Otherwise, treat as file path
  try {
    return fs.readFileSync(pathOrContent, 'utf8');
  } catch (error) {
    throw new Error(`Failed to load MongoDB SSL certificate from ${pathOrContent}: ${error}`);
  }
}

/**
 * Get MongoDB SSL configuration from environment variables
 *
 * @returns MongoSSLConfig if SSL is enabled, null otherwise
 *
 * @example
 * ```typescript
 * const sslConfig = getMongoSSLConfig();
 * if (sslConfig) {
 *   console.log('MongoDB SSL enabled');
 * }
 * ```
 */
export function getMongoSSLConfig(): MongoSSLConfig | null {
  if (!isMongoSSLEnabled()) {
    return null;
  }

  const caCertPath = process.env.MONGODB_SSL_CA;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, default to rejecting unauthorized certificates
  // Unless explicitly set to false
  const rejectUnauthorized =
    process.env.MONGODB_SSL_REJECT_UNAUTHORIZED !== 'false' && isProduction;

  // Validate CA certificate if provided
  let tlsCAFile: string | undefined;
  if (caCertPath) {
    // For file paths, MongoDB driver expects the path directly
    // For PEM content, we need to write to a temp file or use tlsCAFile
    if (caCertPath.startsWith('-----BEGIN')) {
      // If it's PEM content, log a warning - MongoDB driver prefers file paths
      console.warn(
        '[WARN] MONGODB_SSL_CA contains PEM content. For best compatibility, use a file path.'
      );
      // Write to secure temp file (random name in temp directory, restrictive permissions)
      // Uses crypto.randomBytes to prevent predictable filename attacks
      const randomSuffix = crypto.randomBytes(16).toString('hex');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mongodb-ssl-'));
      const tempPath = path.join(tempDir, `ca-${randomSuffix}.crt`);
      fs.writeFileSync(tempPath, caCertPath, { mode: 0o600 });
      tlsCAFile = tempPath;
    } else {
      // Verify file exists
      if (!fs.existsSync(caCertPath)) {
        throw new Error(`MongoDB SSL CA certificate not found: ${caCertPath}`);
      }
      tlsCAFile = caCertPath;
    }
  }

  const config: MongoSSLConfig = {
    tls: true,
    tlsInsecure: !rejectUnauthorized,
    tlsAllowInvalidHostnames: !rejectUnauthorized,
  };

  if (tlsCAFile) {
    config.tlsCAFile = tlsCAFile;
  }

  return config;
}

/**
 * Merge MongoDB SSL configuration with existing options
 *
 * @param options - Existing MongoClientOptions
 * @returns Options merged with SSL configuration if enabled
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongodb';
 * import { withMongoSSL } from '@tamshai/shared';
 *
 * const client = new MongoClient(uri, withMongoSSL({ maxPoolSize: 10 }));
 * ```
 */
export function withMongoSSL<T extends Record<string, unknown>>(options: T = {} as T): T & Partial<MongoSSLConfig> {
  const sslConfig = getMongoSSLConfig();

  if (!sslConfig) {
    return options;
  }

  return {
    ...options,
    ...sslConfig,
  };
}

/**
 * Log MongoDB SSL status (for debugging)
 */
export function logMongoSSLStatus(logger?: { info: (msg: string, meta?: Record<string, unknown>) => void }): void {
  const sslEnabled = isMongoSSLEnabled();
  const config = sslEnabled ? getMongoSSLConfig() : null;

  const status = {
    enabled: sslEnabled,
    tlsCAFile: config?.tlsCAFile ? '[configured]' : '[not set]',
    tlsInsecure: config?.tlsInsecure ?? 'N/A',
    environment: process.env.NODE_ENV || 'development',
  };

  if (logger) {
    logger.info('MongoDB SSL configuration', status);
  } else {
    console.log('[INFO] MongoDB SSL configuration:', JSON.stringify(status));
  }
}
