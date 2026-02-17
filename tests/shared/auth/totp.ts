/**
 * Shared TOTP Utilities
 *
 * Provides TOTP code generation for both E2E and integration tests.
 * Uses SHA256 algorithm matching Keycloak's HmacSHA256 OTP policy.
 *
 * Prefers system `oathtool` command (cross-platform), falls back to `otplib`.
 *
 * @example
 * ```typescript
 * import { generateTotpCode } from '../../shared/auth/totp';
 * const code = generateTotpCode(secret);
 * ```
 */

import { execSync } from 'child_process';

let oathtoolSha256Checked = false;
let oathtoolSha256Available = false;

/**
 * Check if oathtool with SHA256 support is available.
 * Result is cached after first check.
 */
export function isOathtoolSha256Available(): boolean {
  if (oathtoolSha256Checked) return oathtoolSha256Available;

  try {
    // Test if oathtool supports --sha256
    const result = execSync('oathtool --totp --sha256 JBSWY3DPEHPK3PXP', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Valid if it returns a 6-digit code
    oathtoolSha256Available = /^\d{6}$/.test(result);
  } catch {
    oathtoolSha256Available = false;
  }
  oathtoolSha256Checked = true;
  return oathtoolSha256Available;
}

/**
 * Generate a 6-digit TOTP code from a Base32-encoded secret.
 *
 * Uses SHA256 algorithm matching Keycloak's HmacSHA256 OTP policy.
 *
 * @param secret - Base32-encoded TOTP secret
 * @returns 6-digit TOTP code
 * @throws Error if secret is missing or code generation fails
 */
export function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required but not provided');
  }

  // Try oathtool with SHA256 (works on Windows, Linux, macOS)
  if (isOathtoolSha256Available()) {
    try {
      const totpCode = execSync(`oathtool --totp --sha256 ${secret}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (/^\d{6}$/.test(totpCode)) {
        return totpCode;
      }
      // Invalid output, fall through to otplib
    } catch {
      // Fall through to otplib
    }
  }

  // Fallback to otplib (CI/CD environments without oathtool)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { authenticator } = require('otplib');
    authenticator.options = {
      digits: 6,
      step: 30,
      algorithm: 'sha256',
    };
    return authenticator.generate(secret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate TOTP code: ${message}\n` +
      `Secret provided: ${secret.substring(0, 4)}...`
    );
  }
}

// Legacy export for backward compatibility
export const isOathtoolAvailable = isOathtoolSha256Available;
