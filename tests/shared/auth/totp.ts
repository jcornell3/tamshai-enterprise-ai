/**
 * Shared TOTP Utilities
 *
 * Provides TOTP code generation for both E2E and integration tests.
 * Prefers system `oathtool` (SHA1) with `otplib` fallback for CI/CD.
 *
 * @example
 * ```typescript
 * import { generateTotpCode } from '../../shared/auth/totp';
 * const code = generateTotpCode(secret);
 * ```
 */

import { execSync } from 'child_process';

let oathtoolChecked = false;
let oathtoolAvailable = false;

/**
 * Check if oathtool is available on the system.
 * Result is cached after first check.
 */
export function isOathtoolAvailable(): boolean {
  if (oathtoolChecked) return oathtoolAvailable;
  try {
    execSync('oathtool --version', { stdio: 'ignore' });
    oathtoolAvailable = true;
  } catch {
    oathtoolAvailable = false;
  }
  oathtoolChecked = true;
  return oathtoolAvailable;
}

/**
 * Generate a 6-digit TOTP code from a Base32-encoded secret.
 *
 * Uses SHA1 algorithm (RFC 6238 standard) matching:
 * - oathtool default
 * - Google Authenticator default
 * - Keycloak TOTP configuration
 *
 * Prefers system `oathtool` command, falls back to `otplib` for CI/CD.
 *
 * @param secret - Base32-encoded TOTP secret
 * @returns 6-digit TOTP code
 * @throws Error if secret is missing or code generation fails
 */
export function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required but not provided');
  }

  // Try oathtool first (local development)
  if (isOathtoolAvailable()) {
    try {
      const totpCode = execSync('oathtool "$TOTP_SECRET"', {
        encoding: 'utf-8',
        env: { ...process.env, TOTP_SECRET: secret },
        shell: '/bin/bash',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!/^\d{6}$/.test(totpCode)) {
        throw new Error(`Invalid TOTP code generated: ${totpCode}`);
      }

      return totpCode;
    } catch {
      // Fall through to otplib
    }
  }

  // Fallback to otplib (CI/CD environments)
  try {
    // Dynamic import to avoid hard dependency — otplib may not be installed in all test packages
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { authenticator } = require('otplib');
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: 'sha1',
    };
    return authenticator.generate(secret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate TOTP code: ${message}\n` +
      `Tried both oathtool and otplib. Secret provided: ${secret.substring(0, 4)}...`
    );
  }
}
