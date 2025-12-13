/**
 * Tamshai AI Desktop - Authentication Service
 *
 * OIDC PKCE authentication flow with Keycloak
 * Implements Architecture v1.4 OAuth pattern with deep linking
 */

import { Issuer, Client, generators, TokenSet } from 'openid-client';
import { shell } from 'electron';
import { StorageService } from './storage';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private client: Client | null = null;
  private codeVerifier: string | null = null;
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  /**
   * Initialize OIDC client with Keycloak discovery
   */
  async initialize(): Promise<void> {
    try {
      // Discover Keycloak endpoints
      const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8180';
      const issuer = await Issuer.discover(`${keycloakUrl}/realms/tamshai-corp`);

      console.log('[Auth] Discovered issuer:', issuer.metadata);

      // Create OIDC client
      this.client = new issuer.Client({
        client_id: 'mcp-gateway-mobile', // Public client (no secret)
        redirect_uris: ['tamshai-ai://oauth/callback'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // PKCE only (no client secret)
      });

      console.log('[Auth] OIDC client initialized');
    } catch (error) {
      console.error('[Auth] Initialization failed:', error);
      throw new Error(`Failed to initialize authentication: ${(error as Error).message}`);
    }
  }

  /**
   * Initiate OAuth login flow
   * Opens system browser with Keycloak login page
   */
  async login(): Promise<void> {
    if (!this.client) {
      throw new Error('Auth service not initialized');
    }

    // Generate PKCE code verifier and challenge
    this.codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(this.codeVerifier);

    // Build authorization URL
    const authUrl = this.client.authorizationUrl({
      scope: 'openid profile email roles',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    console.log('[Auth] Opening browser for login:', authUrl);

    // Open system browser
    await shell.openExternal(authUrl);
  }

  /**
   * Handle OAuth callback from deep link
   *
   * @param callbackUrl - Deep link URL (tamshai-ai://oauth/callback?code=...)
   * @returns Tokens object
   */
  async handleCallback(callbackUrl: string): Promise<Tokens> {
    if (!this.client) {
      throw new Error('Auth service not initialized');
    }

    if (!this.codeVerifier) {
      throw new Error('No PKCE code verifier found. Login may have expired.');
    }

    try {
      console.log('[Auth] Handling callback:', callbackUrl);

      // Parse callback parameters
      const params = this.client.callbackParams(callbackUrl);

      // Exchange authorization code for tokens
      const tokenSet = await this.client.callback(
        'tamshai-ai://oauth/callback',
        params,
        { code_verifier: this.codeVerifier }
      );

      console.log('[Auth] Token exchange successful');

      // Clear code verifier
      this.codeVerifier = null;

      // Return tokens
      return this.tokenSetToTokens(tokenSet);
    } catch (error) {
      console.error('[Auth] Callback error:', error);
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get current access token
   * Automatically refreshes if expired
   *
   * @returns Access token string or null
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.storageService.getTokens();

    if (!tokens) {
      return null;
    }

    // Check if token is expired (with 60-second buffer)
    const now = Date.now();
    const isExpired = now >= tokens.expiresAt - 60000;

    if (isExpired) {
      console.log('[Auth] Access token expired, refreshing...');

      try {
        const newTokens = await this.refreshToken(tokens.refreshToken);
        await this.storageService.storeTokens(newTokens);
        return newTokens.accessToken;
      } catch (error) {
        console.error('[Auth] Token refresh failed:', error);
        // Clear invalid tokens
        await this.storageService.clearTokens();
        return null;
      }
    }

    return tokens.accessToken;
  }

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Current refresh token
   * @returns New tokens
   */
  private async refreshToken(refreshToken: string): Promise<Tokens> {
    if (!this.client) {
      throw new Error('Auth service not initialized');
    }

    try {
      const tokenSet = await this.client.refresh(refreshToken);
      console.log('[Auth] Token refresh successful');
      return this.tokenSetToTokens(tokenSet);
    } catch (error) {
      console.error('[Auth] Refresh failed:', error);
      throw new Error(`Token refresh failed: ${(error as Error).message}`);
    }
  }

  /**
   * Logout user
   * Revokes tokens and clears storage
   */
  async logout(): Promise<void> {
    if (!this.client) {
      throw new Error('Auth service not initialized');
    }

    const tokens = await this.storageService.getTokens();

    if (tokens) {
      try {
        // Revoke refresh token at Keycloak
        await this.client.revoke(tokens.refreshToken, 'refresh_token');
        console.log('[Auth] Tokens revoked');
      } catch (error) {
        console.error('[Auth] Token revocation failed:', error);
        // Continue with logout even if revocation fails
      }
    }

    // Clear local storage
    await this.storageService.clearTokens();

    console.log('[Auth] Logout complete');
  }

  /**
   * Convert TokenSet to Tokens
   */
  private tokenSetToTokens(tokenSet: TokenSet): Tokens {
    if (!tokenSet.access_token || !tokenSet.refresh_token || !tokenSet.expires_in) {
      throw new Error('Invalid token set: missing required tokens');
    }

    return {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      expiresAt: Date.now() + (tokenSet.expires_in * 1000),
    };
  }
}
