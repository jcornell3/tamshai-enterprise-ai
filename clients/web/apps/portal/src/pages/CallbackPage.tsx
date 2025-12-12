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
        // Could show error page or redirect to login
      }
    }
  }, [isAuthenticated, isLoading, error, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <div className="spinner mb-4"></div>
        <p className="text-secondary-600">Completing sign in...</p>
      </div>
    </div>
  );
}
