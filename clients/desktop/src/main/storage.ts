/**
 * Tamshai AI Desktop - Secure Token Storage
 *
 * Uses Electron's safeStorage API to encrypt tokens using OS keychain:
 * - macOS: Keychain Access
 * - Windows: Data Protection API (DPAPI)
 * - Linux: Secret Service API (libsecret)
 */

import { safeStorage, app } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class StorageService {
  private readonly TOKEN_FILE_NAME = 'tokens.enc';

  /**
   * Get path to encrypted token file
   */
  private getTokenPath(): string {
    return join(app.getPath('userData'), this.TOKEN_FILE_NAME);
  }

  /**
   * Store tokens securely using OS keychain encryption
   *
   * @param tokens - Tokens to store
   */
  async storeTokens(tokens: Tokens): Promise<void> {
    try {
      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available on this system');
      }

      // Serialize tokens to JSON
      const jsonString = JSON.stringify(tokens);

      // Encrypt using OS keychain
      const encrypted = safeStorage.encryptString(jsonString);

      // Write encrypted buffer to file
      await fs.writeFile(this.getTokenPath(), encrypted);

      console.log('[Storage] Tokens stored securely');
    } catch (error) {
      console.error('[Storage] Failed to store tokens:', error);
      throw new Error(`Failed to store tokens: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve tokens from secure storage
   *
   * @returns Tokens object or null if not found
   */
  async getTokens(): Promise<Tokens | null> {
    try {
      const tokenPath = this.getTokenPath();

      // Check if token file exists
      try {
        await fs.access(tokenPath);
      } catch {
        // File doesn't exist
        return null;
      }

      // Read encrypted buffer
      const encrypted = await fs.readFile(tokenPath);

      // Decrypt using OS keychain
      const decrypted = safeStorage.decryptString(encrypted);

      // Parse JSON
      const tokens = JSON.parse(decrypted) as Tokens;

      console.log('[Storage] Tokens retrieved');
      return tokens;
    } catch (error) {
      console.error('[Storage] Failed to retrieve tokens:', error);

      // If decryption fails, clear corrupt token file
      await this.clearTokens();

      return null;
    }
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    try {
      const tokenPath = this.getTokenPath();

      // Delete token file if it exists
      await fs.unlink(tokenPath).catch(() => {
        // Ignore error if file doesn't exist
      });

      console.log('[Storage] Tokens cleared');
    } catch (error) {
      console.error('[Storage] Failed to clear tokens:', error);
      throw new Error(`Failed to clear tokens: ${(error as Error).message}`);
    }
  }

  /**
   * Check if tokens exist
   *
   * @returns True if tokens are stored
   */
  async hasTokens(): Promise<boolean> {
    try {
      const tokenPath = this.getTokenPath();
      await fs.access(tokenPath);
      return true;
    } catch {
      return false;
    }
  }
}
