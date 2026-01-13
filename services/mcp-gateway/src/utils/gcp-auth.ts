/**
 * GCP Authentication Utility
 *
 * Handles Cloud Run service-to-service authentication by fetching
 * identity tokens from the GCP metadata server.
 *
 * Only active when running on GCP (detected by metadata server availability).
 * In dev/stage environments (Docker), this is a no-op.
 */

import { GoogleAuth } from 'google-auth-library';

// Cache for ID token clients (one per target audience)
const clientCache = new Map<string, ReturnType<GoogleAuth['getIdTokenClient']>>();

// GoogleAuth instance (reused)
let authInstance: GoogleAuth | null = null;

// Flag to track if we're running on GCP
let isGCPEnvironment: boolean | null = null;

/**
 * Check if we're running on GCP by attempting to reach the metadata server.
 * This is cached after the first check.
 */
async function checkGCPEnvironment(): Promise<boolean> {
  if (isGCPEnvironment !== null) {
    return isGCPEnvironment;
  }

  try {
    // Try to reach the metadata server with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/project/project-id',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    isGCPEnvironment = response.ok;
  } catch {
    // Metadata server not available - not on GCP
    isGCPEnvironment = false;
  }

  return isGCPEnvironment;
}

/**
 * Get an identity token for calling another Cloud Run service.
 *
 * @param targetUrl - The URL of the target Cloud Run service (used as audience)
 * @returns The identity token, or null if not on GCP
 */
export async function getIdentityToken(targetUrl: string): Promise<string | null> {
  // Only fetch tokens on GCP
  if (!(await checkGCPEnvironment())) {
    return null;
  }

  try {
    // Extract the base URL (scheme + host) as the audience
    const url = new URL(targetUrl);
    const audience = `${url.protocol}//${url.host}`;

    // Get or create a client for this audience
    let clientPromise = clientCache.get(audience);
    if (!clientPromise) {
      if (!authInstance) {
        authInstance = new GoogleAuth();
      }
      clientPromise = authInstance.getIdTokenClient(audience);
      clientCache.set(audience, clientPromise);
    }

    const client = await clientPromise;
    const headers = await client.getRequestHeaders();

    // Extract the token from the Authorization header
    const authHeader = headers['Authorization'] || headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  } catch (error) {
    // Log but don't throw - allow request to proceed (will fail at Cloud Run IAM)
    console.error('Failed to get GCP identity token:', error);
    return null;
  }
}

/**
 * Get headers for calling another Cloud Run service.
 * Includes the identity token if running on GCP.
 *
 * @param targetUrl - The URL of the target Cloud Run service
 * @param additionalHeaders - Any additional headers to include
 * @returns Headers object with Authorization if on GCP
 */
export async function getCloudRunHeaders(
  targetUrl: string,
  additionalHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getIdentityToken(targetUrl);

  const headers: Record<string, string> = {
    ...additionalHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Check if the gateway is running on GCP.
 * Useful for conditional logic or logging.
 */
export async function isRunningOnGCP(): Promise<boolean> {
  return checkGCPEnvironment();
}
