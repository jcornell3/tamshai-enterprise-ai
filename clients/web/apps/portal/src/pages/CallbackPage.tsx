import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@tamshai/auth';

/**
 * OIDC Callback Page
 *
 * Handles the redirect from Keycloak after successful authentication
 */
export default function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // Redirect to landing page after successful auth
        navigate('/');
      } else if (error) {
        console.error('Authentication error:', error);
      }
    }
  }, [isAuthenticated, isLoading, error, navigate]);

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-danger-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-secondary-900 mb-2">
              Authentication Failed
            </h2>
            <p className="text-secondary-600 mb-4">
              {error.message || 'An error occurred during sign in.'}
            </p>
            <button
              onClick={() => window.location.href = '/app'}
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
        <p className="text-secondary-600">Completing sign in...</p>
      </div>
    </div>
  );
}
