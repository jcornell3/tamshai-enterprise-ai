/**
 * Shared TOTP Utilities
 *
 * Provides TOTP code generation for both E2E and integration tests.
 * Uses otplib with SHA256 algorithm (matching Keycloak HmacSHA256 config).
 *
 * Note: Windows oathtool doesn't support --sha256, so we use otplib
 * which works consistently across all platforms.
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
 * Windows oathtool doesn't support --sha256, only Linux/macOS versions do.
 * Result is cached after first check.
 */
export function isOathtoolSha256Available(): boolean {
  if (oathtoolSha256Checked) return oathtoolSha256Available;

  // Skip on Windows - oathtool.exe doesn't support --sha256
  if (process.platform === 'win32') {
    oathtoolSha256Available = false;
    oathtoolSha256Checked = true;
    return false;
  }

  try {
    // Test if oathtool supports --sha256 (Linux/macOS oath-toolkit)
    execSync('oathtool --totp --sha256 --base32 JBSWY3DPEHPK3PXP', { stdio: 'ignore' });
    oathtoolSha256Available = true;
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
 * On Linux/macOS with oath-toolkit: uses oathtool --sha256
 * On Windows or CI/CD: uses otplib with sha256 algorithm
 *
 * @param secret - Base32-encoded TOTP secret
 * @returns 6-digit TOTP code
 * @throws Error if secret is missing or code generation fails
 */
export function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required but not provided');
  }

  // Try oathtool with SHA256 on Linux/macOS (oath-toolkit)
  if (isOathtoolSha256Available()) {
    try {
      // Use shell-safe approach: pass secret via stdin to avoid shell escaping issues
      const totpCode = execSync(`echo -n "${secret}" | oathtool --totp --sha256 --base32 -`, {
        encoding: 'utf-8',
        shell: process.platform === 'win32' ? undefined : '/bin/bash',
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

  // Use otplib (works on all platforms including Windows and CI/CD)
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
