/**
 * Authentication Store (Zustand)
 *
 * Centralized state management for authentication.
 * Uses Zustand for lightweight, React-hooks-friendly state.
 *
 * Article V Compliance:
 * - V.1: No authorization logic - roles are for display only
 * - V.2: Tokens managed via platform-native secure storage
 */

import { create } from 'zustand';
import { AuthState, Tokens, User, AuthActions } from '../types';
import * as authService from '../services/auth/index';

interface AuthStore extends AuthState, AuthActions {}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true,
  tokens: null,
  user: null,
  error: null,

  // Actions
  login: async () => {
    set({ isLoading: true, error: null });

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
