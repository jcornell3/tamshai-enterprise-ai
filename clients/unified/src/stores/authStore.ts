/**
 * Authentication Store (Zustand)
 *
 * Centralized state management for authentication.
 * Uses Zustand for lightweight, React-hooks-friendly state.
 *
 * Article V Compliance:
 * - V.1: No authorization logic - roles are for display only
 * - V.2: Tokens managed via platform-native secure storage
 *
 * Windows Modal OAuth:
 * For Windows localhost development, we use a WebView2-based modal instead of
 * the system browser because WebAuthenticationBroker cannot access localhost
 * due to Windows network isolation in the broker process.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import { AuthState, Tokens, User, AuthActions, OAuthModalState, OAuthModalActions } from '../types';
import * as authService from '../services/auth/index';

interface AuthStore extends AuthState, AuthActions, OAuthModalState, OAuthModalActions {}

// Check if we need modal-based OAuth (Windows localhost only)
function needsOAuthModal(): boolean {
  if (Platform.OS !== 'windows') return false;
  const config = authService.DEFAULT_CONFIG;
  return config.issuer.includes('localhost') || config.issuer.includes('127.0.0.1');
}

// Build OAuth URL for modal
function buildOAuthUrl(config: typeof authService.DEFAULT_CONFIG, state: string, codeChallenge: string): string {
  const authEndpoint = `${config.issuer}/protocol/openid-connect/auth`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${authEndpoint}?${params.toString()}`;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true,
  tokens: null,
  user: null,
  error: null,

  // OAuth Modal state (for Windows localhost)
  visible: false,
  authUrl: '',

  // OAuth Modal Actions
  showOAuthModal: (authUrl: string) => {
    set({ visible: true, authUrl, isLoading: false });
  },

  hideOAuthModal: () => {
    set({ visible: false, authUrl: '', isLoading: false });
  },

  completeOAuthLogin: async (tokens: Tokens) => {
    const user = tokens.idToken ? authService.parseUserFromToken(tokens.idToken) : null;

    // Store tokens to persistent storage
    try {
      await authService.storeTokens(tokens);
      console.log('[AuthStore] Tokens stored successfully');
    } catch (error) {
      console.error('[AuthStore] Failed to store tokens:', error);
    }

    set({
      isAuthenticated: true,
      isLoading: false,
      tokens,
      user,
      error: null,
      visible: false,
      authUrl: '',
    });
  },

  // Actions
  login: async () => {
    set({ isLoading: true, error: null });

    // For Windows localhost, we need to show the OAuth modal
    // because WebAuthenticationBroker cannot access localhost
    if (needsOAuthModal()) {
      console.log('[AuthStore] Windows localhost detected - using OAuth modal');
      // Modal login is handled by the App component via useOAuthModal hook
      // Just set loading false and signal need for modal
      // The actual flow is: login() -> show loading -> returns quickly
      // App detects Windows localhost and shows OAuthModal
      // OAuthModal completes -> calls completeOAuthLogin()
      set({ isLoading: false });
      // Indicate that modal login is needed via a special error
      // The App component checks for this and shows the modal
      set({ error: '__NEEDS_OAUTH_MODAL__' });
      return;
    }

    try {
      const tokens = await authService.login();
      const user = tokens.idToken ? authService.parseUserFromToken(tokens.idToken) : null;

      set({
        isAuthenticated: true,
        isLoading: false,
        tokens,
        user,
        error: null,
      });
    } catch (error) {
      set({
        isAuthenticated: false,
        isLoading: false,
        tokens: null,
        user: null,
        error: error instanceof Error ? error.message : 'Login failed',
      });
    }
  },

  logout: async () => {
    set({ isLoading: true });

    try {
      await authService.logout();
    } catch (error) {
      console.warn('[AuthStore] Logout error:', error);
    }

    set({
      isAuthenticated: false,
      isLoading: false,
      tokens: null,
      user: null,
      error: null,
    });
  },

  refreshTokens: async () => {
    const { tokens } = get();

    try {
      const newTokens = await authService.refreshTokens();
      const user = newTokens.idToken ? authService.parseUserFromToken(newTokens.idToken) : get().user;

      set({
        tokens: newTokens,
        user,
        error: null,
      });
    } catch (error) {
      console.error('[AuthStore] Token refresh failed:', error);

      // If refresh fails, user needs to re-authenticate
      set({
        isAuthenticated: false,
        tokens: null,
        user: null,
        error: 'Session expired. Please log in again.',
      });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });

    try {
      const hasValidTokens = await authService.hasValidStoredTokens();

      if (hasValidTokens) {
        // Try to refresh to get a fresh access token
        const tokens = await authService.refreshTokens();
        const user = tokens.idToken ? authService.parseUserFromToken(tokens.idToken) : null;

        set({
          isAuthenticated: true,
          isLoading: false,
          tokens,
          user,
          error: null,
        });
      } else {
        set({
          isAuthenticated: false,
          isLoading: false,
          tokens: null,
          user: null,
          error: null,
        });
      }
    } catch (error) {
      console.warn('[AuthStore] Auth check failed:', error);
      set({
        isAuthenticated: false,
        isLoading: false,
        tokens: null,
        user: null,
        error: null,
      });
    }
  },
}));

/**
 * Get access token for API calls
 *
 * Automatically refreshes if needed (checks expiration).
 */
export async function getAccessToken(): Promise<string | null> {
  const state = useAuthStore.getState();

  if (!state.tokens) {
    return null;
  }

  // Check if token is expired or about to expire (1 minute buffer)
  const expirationDate = new Date(state.tokens.accessTokenExpirationDate);
  const now = new Date();
  const bufferMs = 60 * 1000; // 1 minute

  if (expirationDate.getTime() - bufferMs <= now.getTime()) {
    // Token expired or expiring soon - refresh
    try {
      await state.refreshTokens();
      return useAuthStore.getState().tokens?.accessToken || null;
    } catch {
      return null;
    }
  }

  return state.tokens.accessToken;
}

/**
 * Check if OAuth modal is needed for current platform/config
 */
export function needsModalOAuth(): boolean {
  return needsOAuthModal();
}
