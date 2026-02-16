/**
 * CallbackPage Component
 *
 * OIDC callback handler for Keycloak authentication redirects.
 * Shared across all Tamshai web applications.
 *
 * Two modes:
 * - Simple (default): Shows spinner, redirects on success, logs errors
 * - Error dialog (showErrorDialog=true): Shows error UI with retry button
 *
 * Architecture v1.5 - Shared Component Extraction
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@tamshai/auth';

export interface CallbackPageProps {
  /**
   * Path to redirect to after successful authentication.
   * @default '/'
   */
  redirectPath?: string;

  /**
   * Whether to use history replace instead of push for the redirect.
   * @default false
   */
  replaceNavigation?: boolean;

  /**
   * Show an error dialog UI when authentication fails.
   * When false, errors are only logged to console.
   * @default false
   */
  showErrorDialog?: boolean;

  /**
   * Path for the "Try Again" button in the error dialog.
   * Only used when showErrorDialog is true.
   * Triggers a full page navigation (window.location.href).
   * @default '/'
   */
  retryPath?: string;

  /**
   * Loading message shown while authentication completes.
   * @default 'Completing sign in...'
   */
  loadingMessage?: string;
}

export function CallbackPage({
  redirectPath = '/',
  replaceNavigation = false,
  showErrorDialog = false,
  retryPath = '/',
  loadingMessage = 'Completing sign in...',
}: CallbackPageProps = {}) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate(redirectPath, { replace: replaceNavigation });
      } else if (error) {
        console.error('Authentication error:', error);
      }
    }
  }, [isAuthenticated, isLoading, error, navigate, redirectPath, replaceNavigation]);

  // Show error state when showErrorDialog is enabled
  if (showErrorDialog && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-danger-500 text-5xl mb-4">{'\u26A0\uFE0F'}</div>
            <h2 className="text-xl font-bold text-secondary-900 mb-2">
              Authentication Failed
            </h2>
            <p className="text-secondary-600 mb-4">
              {error.message || 'An error occurred during sign in.'}
            </p>
            <button
              onClick={() => window.location.href = retryPath}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <div className="spinner mb-4"></div>
        <p className="text-secondary-600">{loadingMessage}</p>
      </div>
    </div>
  );
}

export default CallbackPage;
