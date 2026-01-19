import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export interface CallbackPageProps {
  /** Route to navigate to after successful authentication. Default: '/' */
  redirectTo?: string;
}

/**
 * OAuth callback page component
 *
 * Handles the OIDC callback flow after Keycloak authentication:
 * - Shows loading spinner while processing the callback
 * - Navigates to redirectTo route on successful authentication
 * - Displays error message if authentication fails
 *
 * Usage:
 * ```tsx
 * <Route path="/callback" element={<CallbackPage redirectTo="/dashboard" />} />
 * ```
 */
export function CallbackPage({ redirectTo = '/' }: CallbackPageProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate(redirectTo);
      } else if (error) {
        console.error('Authentication error:', error);
      }
    }
  }, [isAuthenticated, isLoading, error, navigate, redirectTo]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">Authentication failed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div
        role="status"
        aria-busy="true"
        className="flex flex-col items-center"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <p className="mt-4 text-gray-600">Authenticating...</p>
      </div>
    </div>
  );
}
