import { useAuth as useOidcAuth } from 'react-oidc-context';
import { useMemo } from 'react';
import { extractUserContext } from './utils';
import { AuthState, UserContext } from './types';

/**
 * Custom hook for authentication
 *
 * Provides access to:
 * - User context (userId, roles, accessLevel)
 * - Authentication state
 * - Login/logout methods
 * - Access token for API calls
 */
export function useAuth() {
  const auth = useOidcAuth();

  // Extract user context from OIDC user
  const userContext = useMemo<UserContext | null>(() => {
    return extractUserContext(auth.user);
  }, [auth.user]);

  // Build authentication state
  const authState: AuthState = {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    user: userContext,
    error: auth.error ? new Error(auth.error.message) : null,
  };

  /**
   * Get access token for API calls
   *
   * IMPORTANT: Token stored in memory only (Article V.2)
   * Returns null if user not authenticated
   */
  const getAccessToken = (): string | null => {
    return auth.user?.access_token || null;
  };

  /**
   * Sign in with redirect to Keycloak
   */
  const signIn = async () => {
    await auth.signinRedirect();
  };

  /**
   * Sign out and clear session
   */
  const signOut = async () => {
    await auth.signoutRedirect();
  };

  /**
   * Refresh access token silently
   */
  const refreshToken = async () => {
    try {
      await auth.signinSilent();
    } catch (error) {
      console.error('Silent token refresh failed:', error);
      throw error;
    }
  };

  return {
    ...authState,
    userContext,
    getAccessToken,
    signIn,
    signOut,
    refreshToken,
  };
}
