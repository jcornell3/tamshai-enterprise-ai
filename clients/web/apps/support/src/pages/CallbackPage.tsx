import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@tamshai/auth';

/**
 * OIDC Callback Page
 *
 * Handles the redirect from Keycloak after authentication
 */
export default function CallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50">
      <div className="text-center">
        <div className="spinner mb-4"></div>
        <p className="text-secondary-600">Completing authentication...</p>
      </div>
    </div>
  );
}
