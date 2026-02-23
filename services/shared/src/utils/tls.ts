/**
 * TLS/mTLS Configuration Utility (H3 - Zero-Trust Network)
 *
 * Provides utilities for configuring TLS connections between services.
 * Supports both server and client TLS configurations.
 *
 * Environment Variables:
 *   MCP_TLS_ENABLED=true       - Enable TLS for MCP communication
 *   MCP_CA_CERT=/path/ca.crt   - CA certificate path (required for mTLS)
 *   MCP_CLIENT_CERT=/path.crt  - Client certificate path (for mTLS)
 *   MCP_CLIENT_KEY=/path.key   - Client key path (for mTLS)
 *   MCP_SERVER_CERT=/path.crt  - Server certificate path
 *   MCP_SERVER_KEY=/path.key   - Server key path
 *   MCP_TLS_REJECT_UNAUTHORIZED=true - Reject unauthorized certificates (default: true in prod)
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';

export interface TLSClientConfig {
  /** CA certificate for verifying server certificates */
  ca?: string | Buffer;
  /** Client certificate for mutual TLS */
  cert?: string | Buffer;
  /** Client private key for mutual TLS */
  key?: string | Buffer;
  /** Reject unauthorized certificates (default: true) */
  rejectUnauthorized?: boolean;
}

export interface TLSServerConfig {
  /** Server certificate */
  cert: string | Buffer;
  /** Server private key */
  key: string | Buffer;
  /** CA certificate for verifying client certificates (mTLS) */
  ca?: string | Buffer;
  /** Request client certificate (mTLS) */
  requestCert?: boolean;
  /** Reject connections without valid client certificate */
  rejectUnauthorized?: boolean;
}

/**
 * Check if TLS is enabled for MCP communication
 */
export function isTLSEnabled(): boolean {
  const tlsEnabled = process.env.MCP_TLS_ENABLED?.toLowerCase();
  return tlsEnabled === 'true' || tlsEnabled === '1';
}

/**
 * Load a certificate or key from a file path or return the content if already loaded
 */
function loadCertificate(pathOrContent: string | undefined): string | Buffer | undefined {
  if (!pathOrContent) {
    return undefined;
  }

  // If it looks like a PEM certificate/key (starts with -----BEGIN), return as-is
  if (pathOrContent.startsWith('-----BEGIN')) {
    return pathOrContent;
  }

  // Otherwise, treat as file path
  try {
    return fs.readFileSync(pathOrContent);
  } catch (error) {
    throw new Error(`Failed to load certificate from ${pathOrContent}: ${error}`);
  }
}

/**
 * Get TLS client configuration from environment variables
 *
 * @returns TLS client config or null if TLS is disabled
 */
export function getTLSClientConfig(): TLSClientConfig | null {
  if (!isTLSEnabled()) {
    return null;
  }

  const caCertPath = process.env.MCP_CA_CERT;
  const clientCertPath = process.env.MCP_CLIENT_CERT;
  const clientKeyPath = process.env.MCP_CLIENT_KEY;

  // CA is required for TLS
  if (!caCertPath) {
    throw new Error('MCP_TLS_ENABLED is true but MCP_CA_CERT is not set');
  }

  // Default to reject unauthorized in production
  const isProduction = process.env.NODE_ENV === 'production';
  const rejectUnauthorized = process.env.MCP_TLS_REJECT_UNAUTHORIZED !== 'false' || isProduction;

  return {
    ca: loadCertificate(caCertPath),
    cert: loadCertificate(clientCertPath),
    key: loadCertificate(clientKeyPath),
    rejectUnauthorized,
  };
}

/**
 * Get TLS server configuration from environment variables
 *
 * @returns TLS server config or null if TLS is disabled
 */
export function getTLSServerConfig(): TLSServerConfig | null {
  if (!isTLSEnabled()) {
    return null;
  }

  const serverCertPath = process.env.MCP_SERVER_CERT;
  const serverKeyPath = process.env.MCP_SERVER_KEY;
  const caCertPath = process.env.MCP_CA_CERT;

  if (!serverCertPath || !serverKeyPath) {
    throw new Error('MCP_TLS_ENABLED is true but MCP_SERVER_CERT or MCP_SERVER_KEY is not set');
  }

  // Default to reject unauthorized in production
  const isProduction = process.env.NODE_ENV === 'production';
  const rejectUnauthorized = process.env.MCP_TLS_REJECT_UNAUTHORIZED !== 'false' || isProduction;

  return {
    cert: loadCertificate(serverCertPath)!,
    key: loadCertificate(serverKeyPath)!,
    ca: loadCertificate(caCertPath),
    requestCert: !!caCertPath, // Enable mTLS if CA is provided
    rejectUnauthorized,
  };
}

/**
 * Create an HTTPS agent for axios with TLS/mTLS configuration
 *
 * @returns HTTPS agent or undefined if TLS is disabled
 */
export function createTLSHttpsAgent(): https.Agent | undefined {
  const config = getTLSClientConfig();
  if (!config) {
    return undefined;
  }

  return new https.Agent({
    ca: config.ca,
    cert: config.cert,
    key: config.key,
    rejectUnauthorized: config.rejectUnauthorized,
  });
}

/**
 * Create TLS options for an HTTPS server
 *
 * @returns HTTPS server options or undefined if TLS is disabled
 */
export function createTLSServerOptions(): https.ServerOptions | undefined {
  const config = getTLSServerConfig();
  if (!config) {
    return undefined;
  }

  return {
    cert: config.cert,
    key: config.key,
    ca: config.ca,
    requestCert: config.requestCert,
    rejectUnauthorized: config.rejectUnauthorized,
  };
}

/**
 * Get the protocol prefix (http:// or https://) based on TLS status
 */
export function getProtocol(): 'http' | 'https' {
  return isTLSEnabled() ? 'https' : 'http';
}

/**
 * Create an HTTP or HTTPS server for an Express app
 *
 * @param app - Express application
 * @param port - Port number to listen on
 * @param serviceName - Service name for logging
 * @param logger - Optional logger
 * @returns HTTP or HTTPS server instance
 */
export function createServer(
  app: Express.Application,
  port: number,
  serviceName: string,
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void }
): https.Server | http.Server {
  const tlsOptions = createTLSServerOptions();

  if (tlsOptions) {
    const server = https.createServer(tlsOptions, app as http.RequestListener);
    logger?.info(`${serviceName} starting with mTLS enabled`, { port, protocol: 'https' });
    return server;
  } else {
    const server = http.createServer(app as http.RequestListener);
    logger?.info(`${serviceName} starting with HTTP`, { port, protocol: 'http' });
    return server;
  }
}

// Type for Express Application (avoid importing express in shared package)
type Express = {
  Application: unknown;
};
